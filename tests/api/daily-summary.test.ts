/**
 * Test per daily-summary con supporto multi-area (Polymarket + Crypto).
 *
 * Verifica:
 * - Inclusione metriche crypto da crypto_paper_sessions
 * - Separazione per area nel summary
 * - Aggregazione totali corretta
 * - Circuit breaker incluso nel P&L polymarket
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
vi.mock('@/lib/telegram', () => ({
  getTelegramClient: () => ({
    sendMessage: mockSendMessage,
    sendDailySummary: mockSendDailySummary,
  }),
  // Re-export types (needed for import)
  DailySummary: {},
  AreaSummary: {},
}));

const mockFrom = vi.fn();
vi.mock('@/lib/db/supabase/admin', () => ({
  createUntypedAdminClient: () => ({ from: mockFrom }),
}));

import { verifyCronAuth } from '@/lib/cron-auth';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const polymarketTrades = [
  { market_name: 'Election 2026', net_pnl: 25, action: 'full_close', executed_at: '2026-03-21T10:00:00Z' },
  { market_name: 'AI Regulation', net_pnl: -10, action: 'partial_close', executed_at: '2026-03-21T11:00:00Z' },
  { market_name: 'Circuit Market', net_pnl: -8, action: 'circuit_breaker', executed_at: '2026-03-21T12:00:00Z' },
  { market_name: 'Open Trade', net_pnl: 0, action: 'open', executed_at: '2026-03-21T09:00:00Z' },
];

const polymarketSessions = [
  { current_capital: 1050, initial_capital: 1000, total_pnl: 50, total_pnl_pct: 5 },
];

const openPositions = [
  { stake: 100 },
  { stake: 50 },
];

const cryptoSessions = [
  {
    strategy_code: 'CR-C01',
    strategy_name: 'Crypto Momentum',
    current_capital: 110,
    initial_capital: 100,
    total_pnl: 10,
    total_pnl_pct: 10,
    is_circuit_broken: false,
  },
  {
    strategy_code: 'CR-M01b',
    strategy_name: 'Crypto Mean Reversion',
    current_capital: 95,
    initial_capital: 100,
    total_pnl: -5,
    total_pnl_pct: -5,
    is_circuit_broken: true,
  },
];

const cryptoTrades = [
  { symbol: 'BTC/USDT', pnl: 10, action: 'full_close', executed_at: '2026-03-21T10:00:00Z', reason: 'Profit target' },
  { symbol: 'ETH/USDT', pnl: -5, action: 'full_close', executed_at: '2026-03-21T11:00:00Z', reason: 'Stop loss' },
];

const cryptoOpenPositions = [
  { stake: 80 },
  { stake: 40 },
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

function setupMockChain() {
  mockFrom.mockImplementation((table: string) => {
    const chain: Record<string, any> = {};
    const methods = ['select', 'eq', 'in', 'gte', 'lte', 'order'];

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
      // Two calls: count query (head:true) and stake query
      let callCount = 0;
      chain.select = vi.fn((_sel: string, opts?: { count?: string; head?: boolean }) => {
        callCount++;
        if (opts?.head) {
          // count query
          chain.eq = vi.fn(() => ({ ...chain, count: 2 }));
        } else {
          // stake query
          chain.eq = vi.fn(() => ({ ...chain, data: openPositions }));
        }
        return chain;
      });
    }

    if (table === 'crypto_paper_sessions') {
      chain.in = vi.fn(() => ({ ...chain, data: cryptoSessions }));
    }

    if (table === 'crypto_paper_trades') {
      chain.order = vi.fn(() => ({ ...chain, data: cryptoTrades }));
      chain.lte = vi.fn(() => chain);
      chain.gte = vi.fn(() => chain);
    }

    if (table === 'crypto_paper_positions') {
      let callCount = 0;
      chain.select = vi.fn((_sel: string, opts?: { count?: string; head?: boolean }) => {
        callCount++;
        if (opts?.head) {
          chain.eq = vi.fn(() => ({ ...chain, count: 2 }));
        } else {
          chain.eq = vi.fn(() => ({ ...chain, data: cryptoOpenPositions }));
        }
        return chain;
      });
    }

    return chain;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cron/daily-summary (multi-area)', () => {
  let handler: (req: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupMockChain();
    const mod = await import('@/app/api/cron/daily-summary/route');
    handler = mod.GET;
  });

  it('returns 401 if auth fails', async () => {
    (verifyCronAuth as any).mockReturnValue(false);
    const res = await handler(createMockRequest());
    expect(res.status).toBe(401);
  });

  it('builds summary with both polymarket and crypto sections', async () => {
    (verifyCronAuth as any).mockReturnValue(true);

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary.polymarket).toBeDefined();
    expect(body.summary.crypto).toBeDefined();
  });

  it('includes circuit_breaker in polymarket P&L', async () => {
    (verifyCronAuth as any).mockReturnValue(true);

    const res = await handler(createMockRequest());
    const body = await res.json();

    const pm = body.summary.polymarket;
    // 25 - 10 - 8 = 7
    expect(pm.pnl).toBe(7);
    expect(pm.tradesCount).toBe(3); // full_close + partial_close + circuit_breaker
  });

  it('calculates correct polymarket win rate', async () => {
    (verifyCronAuth as any).mockReturnValue(true);

    const res = await handler(createMockRequest());
    const body = await res.json();

    const pm = body.summary.polymarket;
    // 1 winning out of 3
    expect(pm.winRate).toBeCloseTo(1 / 3, 2);
  });

  it('reads crypto metrics from crypto_paper_trades', async () => {
    (verifyCronAuth as any).mockReturnValue(true);

    const res = await handler(createMockRequest());
    const body = await res.json();

    const cr = body.summary.crypto;
    // BTC/USDT: +10, ETH/USDT: -5 → total = 5
    expect(cr.pnl).toBe(5);
    // 1 winning out of 2 closed trades
    expect(cr.winRate).toBe(0.5);
    // 2 open positions from crypto_paper_positions count
    expect(cr.openPositions).toBe(2);
    // exposure from open position stakes = 80 + 40 = 120
    expect(cr.totalExposure).toBe(120);
  });

  it('identifies best and worst crypto trades', async () => {
    (verifyCronAuth as any).mockReturnValue(true);

    const res = await handler(createMockRequest());
    const body = await res.json();

    const cr = body.summary.crypto;
    expect(cr.bestTrade.market).toBe('BTC/USDT');
    expect(cr.bestTrade.pnl).toBe(10);
    expect(cr.worstTrade.market).toBe('ETH/USDT');
    expect(cr.worstTrade.pnl).toBe(-5);
  });

  it('calculates correct aggregated totals', async () => {
    (verifyCronAuth as any).mockReturnValue(true);

    const res = await handler(createMockRequest());
    const body = await res.json();

    const s = body.summary;
    // P&L: polymarket(7) + crypto(5) = 12
    expect(s.pnl).toBe(12);
    // Trades: 3 (pm) + 2 (crypto trades) = 5
    expect(s.tradesCount).toBe(5);
    // Open: 2 (pm) + 2 (crypto) = 4
    expect(s.openPositions).toBe(4);
    // Exposure: 150 (pm) + 120 (crypto) = 270
    expect(s.totalExposure).toBe(270);
  });

  it('sends summary via Telegram', async () => {
    (verifyCronAuth as any).mockReturnValue(true);

    await handler(createMockRequest());
    expect(mockSendDailySummary).toHaveBeenCalledTimes(1);
  });

  it('handles empty crypto sessions gracefully', async () => {
    (verifyCronAuth as any).mockReturnValue(true);

    // Override crypto to return empty
    mockFrom.mockImplementation((table: string) => {
      const chain: Record<string, any> = {};
      const methods = ['select', 'eq', 'in', 'gte', 'lte', 'order'];
      for (const m of methods) {
        chain[m] = vi.fn(() => chain);
      }
      chain.data = [];
      chain.count = 0;

      if (table === 'paper_trades') {
        chain.order = vi.fn(() => ({ ...chain, data: [] }));
      }
      if (table === 'paper_sessions') {
        chain.in = vi.fn(() => ({ ...chain, data: [] }));
      }
      if (table === 'paper_positions') {
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => ({ ...chain, count: 0, data: [] }));
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
      return chain;
    });

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.summary.crypto.pnl).toBe(0);
    expect(body.summary.crypto.openPositions).toBe(0);
    expect(body.summary.pnl).toBe(0);
  });
});
