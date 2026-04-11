/**
 * Test per l'endpoint unificato GET /api/paper-trading/overview.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Polymarket manager
// ---------------------------------------------------------------------------

const mockPolymarketGetStatus = vi.fn();
vi.mock('@/core/paper-trading/manager', () => ({
  getPaperTradingManager: () => ({
    getStatus: mockPolymarketGetStatus,
  }),
}));

// ---------------------------------------------------------------------------
// Mock Crypto manager
// ---------------------------------------------------------------------------

const mockCryptoGetOverviewFromDb = vi.fn();
vi.mock('@/core/paper-trading/crypto-manager', () => ({
  getCryptoPaperTradingManager: () => ({
    getOverviewFromDb: mockCryptoGetOverviewFromDb,
  }),
}));

// ---------------------------------------------------------------------------
// Mock Stock manager
// ---------------------------------------------------------------------------

const mockStockGetOverviewFromDb = vi.fn();
vi.mock('@/core/paper-trading/stock-manager', () => ({
  getStockPaperTradingManager: () => ({
    getOverviewFromDb: mockStockGetOverviewFromDb,
  }),
}));

// ---------------------------------------------------------------------------
// Mock Betfair manager
// ---------------------------------------------------------------------------

const mockBetfairGetOverviewFromDb = vi.fn();
vi.mock('@/core/paper-trading/betfair-manager', () => ({
  getBetfairPaperTradingManager: () => ({
    getOverviewFromDb: mockBetfairGetOverviewFromDb,
  }),
}));

// ---------------------------------------------------------------------------
// Mock Forex manager
// ---------------------------------------------------------------------------

const mockForexGetOverviewFromDb = vi.fn();
vi.mock('@/core/paper-trading/forex-manager', () => ({
  getForexPaperTradingManager: () => ({
    getOverviewFromDb: mockForexGetOverviewFromDb,
  }),
}));

// ---------------------------------------------------------------------------
// Mock Supabase (for snapshots)
// ---------------------------------------------------------------------------

const mockSupabaseFrom = vi.fn();
vi.mock('@/lib/db/supabase/admin', () => ({
  createUntypedAdminClient: () => ({
    from: mockSupabaseFrom,
  }),
}));

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function createMockRequest(params: Record<string, string> = {}): any {
  const url = new URL('http://localhost:3000/api/paper-trading/overview');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return {
    nextUrl: url,
  };
}

function createPolymarketOverview() {
  return {
    totalCapital: 500,
    totalPnl: 25,
    totalPnlToday: 5,
    activeSessions: 2,
    pausedSessions: 0,
    totalOpenPositions: 3,
    sessions: [
      {
        id: 'pm-session-1',
        strategyId: 'strat-1',
        strategyName: 'Momentum Alpha',
        strategyCode: 'PM-A01',
        status: 'running',
        pauseReason: null,
        metrics: {
          initialCapital: 250,
          currentCapital: 275,
          peakCapital: 280,
          realizedPnl: 20,
          unrealizedPnl: 5,
          totalPnl: 25,
          totalPnlPct: 10,
          maxDrawdownPct: 2.5,
          totalTicks: 50,
          lastTickAt: '2026-03-21T12:00:00Z',
        },
        isCircuitBroken: false,
        circuitBrokenReason: null,
        circuitBrokenAt: null,
        openPositions: [{ id: 'pos-1' }, { id: 'pos-2' }],
        recentTrades: [],
        startedAt: '2026-03-20T10:00:00Z',
        stoppedAt: null,
      },
      {
        id: 'pm-session-2',
        strategyId: 'strat-2',
        strategyName: 'Value Pick',
        strategyCode: 'PM-V01',
        status: 'running',
        pauseReason: null,
        metrics: {
          initialCapital: 250,
          currentCapital: 225,
          peakCapital: 260,
          realizedPnl: -20,
          unrealizedPnl: -5,
          totalPnl: -25,
          totalPnlPct: -10,
          maxDrawdownPct: 15,
          totalTicks: 48,
          lastTickAt: '2026-03-21T12:00:00Z',
        },
        isCircuitBroken: false,
        circuitBrokenReason: null,
        circuitBrokenAt: null,
        openPositions: [{ id: 'pos-3' }],
        recentTrades: [],
        startedAt: '2026-03-20T10:00:00Z',
        stoppedAt: null,
      },
    ],
  };
}

function createCryptoOverview() {
  return {
    totalSessions: 3,
    activeSessions: 2,
    stoppedSessions: 1,
    totalCapital: 200,
    totalPnl: 5,
    totalPnlPct: 2.5,
    sessions: [
      {
        sessionId: 'cr-session-1',
        strategyCode: 'CR-C01',
        strategyName: 'Crypto Momentum',
        status: 'running',
        initialCapital: 100,
        currentCapital: 105,
        totalPnl: 5,
        totalPnlPct: 5,
        maxDrawdownPct: 1.2,
        totalTicks: 120,
        openPositions: 1,
        pairs: ['BTC/USDT', 'ETH/USDT'],
        startedAt: '2026-03-20T08:00:00Z',
        lastTickAt: '2026-03-21T12:00:00Z',
        isCircuitBroken: false,
      },
      {
        sessionId: 'cr-session-2',
        strategyCode: 'CR-M01b',
        strategyName: 'Crypto Mean Reversion',
        status: 'running',
        initialCapital: 100,
        currentCapital: 95,
        totalPnl: -5,
        totalPnlPct: -5,
        maxDrawdownPct: 8,
        totalTicks: 110,
        openPositions: 2,
        pairs: ['BTC/USDT', 'SOL/USDT'],
        startedAt: '2026-03-20T08:00:00Z',
        lastTickAt: '2026-03-21T12:00:00Z',
        isCircuitBroken: false,
      },
      {
        sessionId: 'cr-session-3',
        strategyCode: 'CR-C02b',
        strategyName: 'Crypto Breakout',
        status: 'stopped',
        initialCapital: 100,
        currentCapital: 90,
        totalPnl: -10,
        totalPnlPct: -10,
        maxDrawdownPct: 12,
        totalTicks: 80,
        openPositions: 0,
        pairs: ['ETH/USDT'],
        startedAt: '2026-03-19T08:00:00Z',
        lastTickAt: '2026-03-20T18:00:00Z',
        isCircuitBroken: false,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/paper-trading/overview', () => {
  let GET: (req: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPolymarketGetStatus.mockResolvedValue(createPolymarketOverview());
    mockCryptoGetOverviewFromDb.mockResolvedValue(createCryptoOverview());
    mockStockGetOverviewFromDb.mockResolvedValue({
      totalSessions: 0, activeSessions: 0, stoppedSessions: 0,
      totalCapital: 0, totalPnl: 0, totalPnlPct: 0, sessions: [],
    });
    mockBetfairGetOverviewFromDb.mockResolvedValue({
      totalSessions: 0, activeSessions: 0, stoppedSessions: 0,
      totalCapital: 0, totalPnl: 0, totalPnlPct: 0, sessions: [],
    });
    mockForexGetOverviewFromDb.mockResolvedValue({
      totalSessions: 0, activeSessions: 0, stoppedSessions: 0,
      totalCapital: 0, totalPnl: 0, totalPnlPct: 0, sessions: [],
    });

    const mod = await import('@/app/api/paper-trading/overview/route');
    GET = mod.GET;
  });

  it('returns unified overview with both areas', async () => {
    const req = createMockRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.totalCapital).toBe(700); // 500 pm + 200 crypto
    // PM: 25 + (-25) = 0, Crypto running: 5 + (-5) = 0
    expect(json.totalPnl).toBe(0);
    expect(json.activeSessions).toBe(4); // 2 pm + 2 crypto
    expect(json.sessions).toHaveLength(5); // 2 pm + 3 crypto (including stopped)
    expect(json.byArea.polymarket.capital).toBe(500);
    expect(json.byArea.crypto.capital).toBe(200);
  });

  it('filters by area=crypto', async () => {
    const req = createMockRequest({ area: 'crypto' });
    const res = await GET(req);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.sessions).toHaveLength(3);
    expect(json.sessions.every((s: any) => s.area === 'crypto')).toBe(true);
    expect(json.byArea.polymarket.sessions).toBe(0);
    expect(json.byArea.crypto.sessions).toBe(2);
  });

  it('filters by area=polymarket', async () => {
    const req = createMockRequest({ area: 'polymarket' });
    const res = await GET(req);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.sessions).toHaveLength(2);
    expect(json.sessions.every((s: any) => s.area === 'polymarket')).toBe(true);
  });

  it('includes snapshots when requested', async () => {
    const mockSnapshotData = [
      { session_id: 'pm-session-1', timestamp: '2026-03-21T11:00:00Z', equity: 270, pnl_pct: 8 },
      { session_id: 'pm-session-1', timestamp: '2026-03-21T12:00:00Z', equity: 275, pnl_pct: 10 },
      { session_id: 'cr-session-1', timestamp: '2026-03-21T11:00:00Z', equity: 102, pnl_pct: 2 },
    ];

    mockSupabaseFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: mockSnapshotData }),
          }),
        }),
      }),
    });

    const req = createMockRequest({ snapshots: 'true' });
    const res = await GET(req);
    const json = await res.json();

    expect(json.ok).toBe(true);
    // Check PM session has snapshots
    const pmSession = json.sessions.find((s: any) => s.id === 'pm-session-1');
    expect(pmSession.snapshots).toHaveLength(2);
    expect(pmSession.snapshots[0].equity).toBe(270);

    // Check crypto session has snapshots
    const crSession = json.sessions.find((s: any) => s.id === 'cr-session-1');
    expect(crSession.snapshots).toHaveLength(1);
  });

  it('handles Polymarket manager error gracefully', async () => {
    mockPolymarketGetStatus.mockRejectedValue(new Error('Polymarket timeout'));

    const req = createMockRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(json.error).toContain('Polymarket timeout');
    expect(res.status).toBe(500);
  });

  it('normalizes crypto sessions to unified format', async () => {
    const req = createMockRequest({ area: 'crypto' });
    const res = await GET(req);
    const json = await res.json();

    const session = json.sessions[0];
    expect(session.id).toBe('cr-session-1');
    expect(session.area).toBe('crypto');
    expect(session.strategyCode).toBe('CR-C01');
    expect(session.pairs).toEqual(['BTC/USDT', 'ETH/USDT']);
    expect(session.currentCapital).toBe(105);
    expect(session.totalPnlPct).toBe(5);
  });

  it('calculates correct totalPnlPct', async () => {
    const req = createMockRequest();
    const res = await GET(req);
    const json = await res.json();

    // Total initial capital for running/paused sessions:
    // PM: 250 + 250 = 500, Crypto running: 100 + 100 = 200 => total 700
    // Total PnL: PM (25 + -25) = 0 net but byArea uses running = 500 capital
    // byArea.pm.pnl = 25 + (-25) = 0... wait let me recalculate
    // The overview totals are based on byArea sums which filter running/paused
    // PM: both running → capital 500, pnl 0 (25 + -25)
    // Crypto: 2 running → capital 200, pnl 0 (5 + -5)
    // So totalPnl = 0, totalPnlPct = 0
    expect(json.totalPnlPct).toBeCloseTo(0, 1);
  });

  it('excludes stopped sessions from capital totals', async () => {
    const req = createMockRequest();
    const res = await GET(req);
    const json = await res.json();

    // Stopped crypto session (cr-session-3) should not count in capital
    // Running: PM 500 + Crypto 200 = 700
    expect(json.totalCapital).toBe(700);
    // But total sessions list includes stopped
    expect(json.sessions).toHaveLength(5);
  });
});
