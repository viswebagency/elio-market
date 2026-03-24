/**
 * Tests for daily-summary with live trading section.
 *
 * Verifica:
 * - Sezione live con trade live presenti
 * - Sezione live senza trade live (messaggio "Nessun trade live oggi")
 * - Portfolio sync integrato nel daily summary
 * - Kill switch e circuit breaker status
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

vi.mock('@/lib/cron-auth', () => ({
  verifyCronAuth: vi.fn(),
}));

const mockSendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
const mockSendDailySummary = vi.fn().mockResolvedValue({ message_id: 2 });
vi.mock('@/lib/telegram', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    getTelegramClient: () => ({
      sendMessage: mockSendMessage,
      sendDailySummary: mockSendDailySummary,
    }),
  };
});

const mockFrom = vi.fn();
vi.mock('@/lib/db/supabase/admin', () => ({
  createUntypedAdminClient: () => ({ from: mockFrom }),
}));

// Mock kill switch and circuit breaker
const mockIsActive = vi.fn().mockReturnValue(false);
vi.mock('@/services/execution/kill-switch', () => ({
  killSwitch: {
    isActive: () => Promise.resolve(mockIsActive()),
    isActiveSync: () => mockIsActive(),
    activate: vi.fn().mockResolvedValue({ cancelledOrders: 0, closedPositions: 0, errors: [] }),
    deactivate: vi.fn(),
    getStatus: vi.fn(),
  },
}));

const mockIsTripped = vi.fn().mockReturnValue(false);
vi.mock('@/services/execution/circuit-breaker-live', () => ({
  circuitBreakerLive: {
    get isTripped() { return mockIsTripped(); },
    checkAndTrip: vi.fn(),
    recordError: vi.fn(),
    reset: vi.fn(),
    getStatus: vi.fn(),
  },
}));

// Mock broker key service
let mockBrokerAdapter: any = null;
vi.mock('@/services/broker/broker-key-service', () => ({
  BrokerKeyService: class {
    async getBrokerAdapter() { return mockBrokerAdapter; }
  },
}));

// Mock portfolio sync — use shared ref so tests can override
const mockSyncResult = {
  inSync: true,
  phantomPositions: [] as any[],
  untrackedPositions: [] as any[],
  mismatches: [] as any[],
};
const mockSyncPortfolio = vi.fn().mockImplementation(() => Promise.resolve({ ...mockSyncResult, phantomPositions: [...mockSyncResult.phantomPositions], untrackedPositions: [...mockSyncResult.untrackedPositions], mismatches: [...mockSyncResult.mismatches] }));
const mockAlertDivergence = vi.fn().mockResolvedValue(undefined);

vi.mock('@/services/portfolio/portfolio-sync', () => ({
  syncPortfolio: (...args: any[]) => mockSyncPortfolio(...args),
  alertDivergence: (...args: any[]) => mockAlertDivergence(...args),
  createPortfolioDbClient: vi.fn().mockReturnValue({
    getOpenLivePositions: vi.fn().mockResolvedValue([]),
  }),
}));

// Mock audit logger
vi.mock('@/services/execution/audit-logger', () => ({
  auditLogger: {
    logKillSwitch: vi.fn().mockResolvedValue(undefined),
  },
}));

import { verifyCronAuth } from '@/lib/cron-auth';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const polymarketTrades = [
  { market_name: 'Election', net_pnl: 10, action: 'full_close', executed_at: '2026-03-22T10:00:00Z' },
];

const polymarketSessions = [
  { current_capital: 1010, initial_capital: 1000, total_pnl: 10, total_pnl_pct: 1 },
];

const liveTrades = [
  { symbol: 'BTC/USDT', pnl: 50, commission: 3, slippage: 2, status: 'closed', exited_at: '2026-03-22T14:00:00Z' },
  { symbol: 'ETH/USDT', pnl: -20, commission: 3, slippage: 2, status: 'closed', exited_at: '2026-03-22T15:00:00Z' },
  { symbol: 'SOL/USDT', pnl: 30, commission: 3, slippage: 2, status: 'closed', exited_at: '2026-03-22T16:00:00Z' },
];

const allLiveTrades = [
  ...liveTrades,
  { pnl: 100 },
  { pnl: -40 },
];

const bankrolls = [
  { initial_capital: 10000, current_capital: 10060 },
];

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function createMockRequest(): any {
  return {
    headers: {
      get: (key: string) => (key === 'authorization' ? 'Bearer test' : null),
    },
    nextUrl: { searchParams: new URLSearchParams() },
    url: 'http://localhost:3000/api/cron/daily-summary',
  };
}

function setupMockChainWithLive(liveTradesData: any[] = liveTrades, allLiveData: any[] = allLiveTrades, bankrollData: any[] = bankrolls) {
  mockFrom.mockImplementation((table: string) => {
    const chain: Record<string, any> = {};
    const methods = ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'order', 'limit'];

    for (const m of methods) {
      chain[m] = vi.fn(() => chain);
    }
    chain.data = [];
    chain.count = 0;

    if (table === 'paper_trades') {
      chain.order = vi.fn(() => ({ ...chain, data: polymarketTrades }));
      chain.lte = vi.fn(() => chain);
      chain.gte = vi.fn(() => chain);
    }

    if (table === 'paper_sessions') {
      chain.in = vi.fn(() => ({ ...chain, data: polymarketSessions }));
    }

    if (table === 'paper_positions') {
      chain.select = vi.fn((_sel: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) {
          chain.eq = vi.fn(() => ({ ...chain, count: 0 }));
        } else {
          chain.eq = vi.fn(() => ({ ...chain, data: [] }));
        }
        return chain;
      });
    }

    if (table === 'crypto_paper_sessions') {
      chain.in = vi.fn(() => ({ ...chain, data: [] }));
    }

    if (table === 'crypto_paper_trades') {
      chain.order = vi.fn(() => ({ ...chain, data: [] }));
      chain.lte = vi.fn(() => chain);
      chain.gte = vi.fn(() => chain);
    }

    if (table === 'crypto_paper_positions') {
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => ({ ...chain, count: 0, data: [] }));
    }

    if (table === 'live_trades') {
      // Handle two different calls:
      // 1. Today's closed live trades (with neq and date filters)
      // 2. All-time live trades (without date filters, just neq)
      let callIndex = 0;
      chain.select = vi.fn(() => {
        callIndex++;
        const innerChain: Record<string, any> = {};
        for (const m of methods) {
          innerChain[m] = vi.fn(() => innerChain);
        }
        if (callIndex === 1) {
          // First call: today's live trades
          innerChain.data = liveTradesData;
        } else {
          // Second call: all-time live trades
          innerChain.data = allLiveData;
        }
        return innerChain;
      });
    }

    if (table === 'bankrolls') {
      chain.limit = vi.fn(() => ({ ...chain, data: bankrollData }));
    }

    if (table === 'strategies') {
      chain.limit = vi.fn(() => ({ ...chain, data: [{ user_id: 'user-1' }] }));
    }

    return chain;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cron/daily-summary (live trading section)', () => {
  let handler: (req: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsActive.mockReturnValue(false);
    mockIsTripped.mockReturnValue(false);
    vi.resetModules();

    // Re-setup mocks after resetModules
    setupMockChainWithLive();
    const mod = await import('@/app/api/cron/daily-summary/route');
    handler = mod.GET;
  });

  it('includes live trading section with trade data', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    setupMockChainWithLive();

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.summary.live).toBeDefined();
    expect(body.summary.live.tradesCount).toBe(3);
    // 50 - 20 + 30 = 60
    expect(body.summary.live.dailyPnl).toBe(60);
    // Win rate: 2/3
    expect(body.summary.live.winRate).toBeCloseTo(2 / 3, 2);
  });

  it('shows no live trades message when none exist', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    setupMockChainWithLive([], [], bankrolls);

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.summary.live).toBeDefined();
    expect(body.summary.live.tradesCount).toBe(0);
    expect(body.summary.live.dailyPnl).toBe(0);
  });

  it('includes kill switch status when active', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockIsActive.mockReturnValue(true);
    setupMockChainWithLive();

    // Re-import to get fresh module with mocked values
    vi.resetModules();
    const mod = await import('@/app/api/cron/daily-summary/route');

    const res = await mod.GET(createMockRequest());
    const body = await res.json();

    expect(body.summary.live.killSwitchActive).toBe(true);
  });

  it('includes circuit breaker tripped status', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockIsTripped.mockReturnValue(true);
    setupMockChainWithLive();

    vi.resetModules();
    const mod = await import('@/app/api/cron/daily-summary/route');

    const res = await mod.GET(createMockRequest());
    const body = await res.json();

    expect(body.summary.live.circuitBreakerTripped).toBe(true);
  });

  it('includes portfolio sync divergences', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    setupMockChainWithLive();

    // Provide a mock adapter so syncPortfolio is actually called
    mockBrokerAdapter = { getPositions: vi.fn(), getBalances: vi.fn() };

    // Override shared mock to return divergences
    mockSyncResult.inSync = false;
    mockSyncResult.phantomPositions = [{ id: 'p1', asset_symbol: 'SOL', quantity: 10, status: 'open', direction: 'long' }];
    mockSyncResult.untrackedPositions = [];
    mockSyncResult.mismatches = [{ symbol: 'BTC', dbQuantity: 0.05, exchangeQuantity: 0.08, diffPct: 60 }];

    vi.resetModules();
    const mod = await import('@/app/api/cron/daily-summary/route');

    const res = await mod.GET(createMockRequest());
    const body = await res.json();

    expect(body.summary.live.portfolioInSync).toBe(false);
    expect(body.summary.live.portfolioDivergences).toBeDefined();
    expect(body.summary.live.portfolioDivergences.length).toBeGreaterThan(0);

    // Reset for other tests
    mockSyncResult.inSync = true;
    mockSyncResult.phantomPositions = [];
    mockSyncResult.mismatches = [];
    mockBrokerAdapter = null;
  });

  it('calculates best and worst live trades correctly', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    setupMockChainWithLive();

    const res = await handler(createMockRequest());
    const body = await res.json();

    // Best: BTC +50, Worst: ETH -20
    expect(body.summary.live.bestTrade).toBeDefined();
    expect(body.summary.live.bestTrade.market).toBe('BTC/USDT');
    expect(body.summary.live.bestTrade.pnl).toBe(50);
    expect(body.summary.live.worstTrade.market).toBe('ETH/USDT');
    expect(body.summary.live.worstTrade.pnl).toBe(-20);
  });

  it('calculates total fees correctly', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    setupMockChainWithLive();

    const res = await handler(createMockRequest());
    const body = await res.json();

    // 3 + 3 + 3 = 9
    expect(body.summary.live.totalFees).toBe(9);
  });

  it('sends summary via Telegram', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    setupMockChainWithLive();

    await handler(createMockRequest());
    expect(mockSendDailySummary).toHaveBeenCalledTimes(1);
  });
});
