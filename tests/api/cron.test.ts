/**
 * Test per gli endpoint cron — tick, scan, daily-summary.
 *
 * Testa la logica di autenticazione, il wiring con manager/scanner,
 * e il calcolo del daily summary da dati DB mockati.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

// Mock cron-auth
vi.mock('@/lib/cron-auth', () => ({
  verifyCronAuth: vi.fn(),
}));

// Mock paper trading manager
const mockTick = vi.fn();
const mockGetStatus = vi.fn();
vi.mock('@/core/paper-trading/manager', () => ({
  getPaperTradingManager: () => ({
    tick: mockTick,
    getStatus: mockGetStatus,
  }),
  POLYMARKET_COOLDOWN_HOURS: 12,
  MAX_AUTO_ROTATIONS: 3,
}));

vi.mock('@/core/paper-trading/auto-rotation', () => ({
  processExpiredCooldowns: vi.fn().mockResolvedValue({ rotated: 0, stopped: 0, errors: [] }),
}));

// Mock scanner
const mockScan = vi.fn();
vi.mock('@/core/paper-trading/scanner', () => ({
  getMarketScanner: () => ({
    scan: mockScan,
  }),
}));

// Mock telegram
const mockSendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
const mockSendDailySummary = vi.fn().mockResolvedValue({ message_id: 2 });
const mockSendCircuitBreakerAlert = vi.fn().mockResolvedValue({ message_id: 3 });
vi.mock('@/lib/telegram', () => ({
  getTelegramClient: () => ({
    sendMessage: mockSendMessage,
    sendDailySummary: mockSendDailySummary,
    sendCircuitBreakerAlert: mockSendCircuitBreakerAlert,
  }),
}));

// Mock Supabase for daily-summary
const mockFrom = vi.fn();
vi.mock('@/lib/db/supabase/admin', () => ({
  createUntypedAdminClient: () => ({ from: mockFrom }),
}));

vi.mock('@/services/execution/kill-switch', () => ({
  killSwitch: {
    isActive: () => false,
    activate: vi.fn(),
    deactivate: vi.fn(),
    getStatus: vi.fn(),
  },
}));

vi.mock('@/services/execution/circuit-breaker-live', () => ({
  circuitBreakerLive: {
    get isTripped() { return false; },
    checkAndTrip: vi.fn(),
    recordError: vi.fn(),
    reset: vi.fn(),
    getStatus: vi.fn(),
  },
}));

vi.mock('@/services/broker/broker-key-service', () => ({
  BrokerKeyService: class {
    async getBrokerAdapter() { return null; }
  },
}));

vi.mock('@/services/portfolio/portfolio-sync', () => ({
  syncPortfolio: vi.fn().mockResolvedValue({ inSync: true, phantomPositions: [], untrackedPositions: [], mismatches: [] }),
  alertDivergence: vi.fn().mockResolvedValue(undefined),
  createPortfolioDbClient: vi.fn().mockReturnValue({
    getOpenLivePositions: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('@/services/execution/audit-logger', () => ({
  auditLogger: {
    logKillSwitch: vi.fn().mockResolvedValue(undefined),
    logTradeIntent: vi.fn().mockResolvedValue(undefined),
    logExecution: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn().mockResolvedValue(undefined),
    logCircuitBreakerLive: vi.fn().mockResolvedValue(undefined),
  },
}));

import { verifyCronAuth } from '@/lib/cron-auth';

// ---------------------------------------------------------------------------
// Helper: mock NextRequest
// ---------------------------------------------------------------------------

function createMockRequest(path: string): any {
  return {
    headers: {
      get: (key: string) => (key === 'authorization' ? 'Bearer test' : null),
    },
    nextUrl: {
      searchParams: new URLSearchParams(),
    },
    url: `http://localhost:3000${path}`,
  };
}

// ---------------------------------------------------------------------------
// /api/cron/tick
// ---------------------------------------------------------------------------

describe('GET /api/cron/tick', () => {
  let handler: (req: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/app/api/cron/tick/route');
    handler = mod.GET;
  });

  it('returns 401 if auth fails', async () => {
    (verifyCronAuth as any).mockReturnValue(false);
    const res = await handler(createMockRequest('/api/cron/tick'));
    expect(res.status).toBe(401);
  });

  it('executes tick and returns summary', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockTick.mockResolvedValue([
      {
        sessionId: 's1',
        strategyId: 'strat1',
        strategyCode: 'PM-001',
        marketsEvaluated: 50,
        signalsGenerated: 3,
        positionsOpened: 1,
        positionsClosed: 0,
        circuitBroken: false,
        errors: [],
      },
    ]);

    const res = await handler(createMockRequest('/api/cron/tick'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary.sessionsProcessed).toBe(1);
    expect(body.summary.totalSignals).toBe(3);
    expect(body.summary.totalPositionsOpened).toBe(1);
  });

  it('sends Telegram notification when positions change', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockTick.mockResolvedValue([
      {
        sessionId: 's1',
        strategyId: 'strat1',
        strategyCode: 'PM-001',
        marketsEvaluated: 50,
        signalsGenerated: 2,
        positionsOpened: 1,
        positionsClosed: 1,
        circuitBroken: false,
        errors: [],
      },
    ]);

    await handler(createMockRequest('/api/cron/tick'));
    expect(mockSendMessage).toHaveBeenCalled();
  });

  it('sends circuit breaker alert with real drawdown values from DB', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockTick.mockResolvedValue([
      {
        sessionId: 's1',
        strategyId: 'strat1',
        strategyCode: 'PM-001',
        marketsEvaluated: 50,
        signalsGenerated: 0,
        positionsOpened: 0,
        positionsClosed: 0,
        circuitBroken: true,
        errors: [],
      },
    ]);

    // Mock DB chain for fetchCircuitBreakerDetails
    const mockSingle = vi.fn()
      .mockResolvedValueOnce({
        data: {
          max_drawdown_pct: 12.5,
          circuit_broken_reason: 'Drawdown 12.5% > limit 10%',
          strategy_id: 'strat1',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { max_drawdown: 10 },
        error: null,
      });
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
    mockFrom.mockReturnValue({
      select: () => ({ eq: mockEq }),
    });

    await handler(createMockRequest('/api/cron/tick'));
    expect(mockSendCircuitBreakerAlert).toHaveBeenCalled();

    const alertArg = mockSendCircuitBreakerAlert.mock.calls[0][1];
    expect(alertArg.currentDrawdown).toBe(12.5);
    expect(alertArg.maxDrawdown).toBe(10);
    expect(alertArg.action).toContain('Drawdown 12.5%');
  });

  it('handles tick errors gracefully', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockTick.mockRejectedValue(new Error('DB connection failed'));

    const res = await handler(createMockRequest('/api/cron/tick'));
    const body = await res.json();

    // Returns 200 to prevent Vercel from disabling the cron after consecutive failures
    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('DB connection failed');
  });
});

// ---------------------------------------------------------------------------
// /api/cron/scan
// ---------------------------------------------------------------------------

describe('GET /api/cron/scan', () => {
  let handler: (req: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/app/api/cron/scan/route');
    handler = mod.GET;
  });

  it('returns 401 if auth fails', async () => {
    (verifyCronAuth as any).mockReturnValue(false);
    const res = await handler(createMockRequest('/api/cron/scan'));
    expect(res.status).toBe(401);
  });

  it('scans and returns opportunities', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockScan.mockResolvedValue({
      opportunities: [
        {
          marketName: 'Test Market',
          strategyCode: 'PM-001',
          score: 80,
          currentPrice: 0.45,
          suggestedStake: 30,
        },
      ],
      marketsScanned: 100,
      strategiesEvaluated: 5,
      scanDurationMs: 1200,
      scannedAt: new Date().toISOString(),
    });

    const res = await handler(createMockRequest('/api/cron/scan'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary.opportunities).toBe(1);
  });

  it('sends Telegram for high-score opportunities', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockScan.mockResolvedValue({
      opportunities: [
        {
          marketName: 'Hot Market',
          strategyCode: 'PM-001',
          score: 85,
          currentPrice: 0.3,
          suggestedStake: 50,
        },
      ],
      marketsScanned: 100,
      strategiesEvaluated: 5,
      scanDurationMs: 800,
      scannedAt: new Date().toISOString(),
    });

    await handler(createMockRequest('/api/cron/scan'));
    expect(mockSendMessage).toHaveBeenCalled();
  });

  it('handles rate limit gracefully', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockScan.mockRejectedValue(new Error('Rate limit: prossimo scan disponibile tra 120 secondi'));

    const res = await handler(createMockRequest('/api/cron/scan'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe('rate_limited');
  });
});

// ---------------------------------------------------------------------------
// /api/cron/daily-summary
// ---------------------------------------------------------------------------

describe('GET /api/cron/daily-summary', () => {
  let handler: (req: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock Supabase chain for daily-summary queries
    const mockSelect = vi.fn();
    const mockEq = vi.fn();
    const mockNeq = vi.fn();
    const mockGte = vi.fn();
    const mockLte = vi.fn();
    const mockOrder = vi.fn();
    const mockIn = vi.fn();
    const mockLimit = vi.fn();

    // Default: return empty results
    const emptyResult = { data: [], count: 0 };
    const chainEnd = {
      select: mockSelect,
      eq: mockEq,
      neq: mockNeq,
      gte: mockGte,
      lte: mockLte,
      order: mockOrder,
      in: mockIn,
      limit: mockLimit,
      ...emptyResult,
    };

    // Make every chain method return the chain
    mockSelect.mockReturnValue(chainEnd);
    mockEq.mockReturnValue(chainEnd);
    mockNeq.mockReturnValue(chainEnd);
    mockGte.mockReturnValue(chainEnd);
    mockLte.mockReturnValue(chainEnd);
    mockOrder.mockReturnValue(chainEnd);
    mockIn.mockReturnValue(chainEnd);
    mockLimit.mockReturnValue(chainEnd);
    mockFrom.mockReturnValue(chainEnd);

    const mod = await import('@/app/api/cron/daily-summary/route');
    handler = mod.GET;
  });

  it('returns 401 if auth fails', async () => {
    (verifyCronAuth as any).mockReturnValue(false);
    const res = await handler(createMockRequest('/api/cron/daily-summary'));
    expect(res.status).toBe(401);
  });

  it('builds and sends daily summary', async () => {
    (verifyCronAuth as any).mockReturnValue(true);

    const res = await handler(createMockRequest('/api/cron/daily-summary'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary).toBeDefined();
    expect(body.summary.date).toBeDefined();
    expect(mockSendDailySummary).toHaveBeenCalled();
  });
});
