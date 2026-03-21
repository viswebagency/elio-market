/**
 * Test per l'endpoint cron crypto-tick.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

vi.mock('@/lib/cron-auth', () => ({
  verifyCronAuth: vi.fn(),
}));

const mockTick = vi.fn();
const mockInitializeAdapter = vi.fn();
const mockGetActiveSessions = vi.fn().mockReturnValue([]);
const mockAutoStartL1Sessions = vi.fn().mockResolvedValue([]);
vi.mock('@/core/paper-trading/crypto-manager', () => ({
  getCryptoPaperTradingManager: () => ({
    tick: mockTick,
    initializeAdapter: mockInitializeAdapter,
    getActiveSessions: mockGetActiveSessions,
    autoStartL1Sessions: mockAutoStartL1Sessions,
    startRotatedSession: vi.fn().mockResolvedValue('new-rotated-id'),
  }),
  CRYPTO_L1_STRATEGY_CODES: ['CR-C01', 'CR-C02b', 'CR-M01b', 'CR-M02b', 'CR-M03b', 'CR-C01c', 'CR-M02c'],
  CRYPTO_L1_DEFAULT_CAPITAL: 100,
  CRYPTO_COOLDOWN_HOURS: 6,
  MAX_AUTO_ROTATIONS: 3,
}));

vi.mock('@/core/paper-trading/auto-rotation', () => ({
  processExpiredCooldowns: vi.fn().mockResolvedValue({ rotated: 0, stopped: 0, errors: [] }),
}));

vi.mock('@/core/strategies/crypto-strategies', () => ({
  CRYPTO_STRATEGY_MAP: {
    'CR-C01': { code: 'CR-C01', max_drawdown: 8 },
    'CR-C02b': { code: 'CR-C02b', max_drawdown: 15 },
    'CR-M01b': { code: 'CR-M01b', max_drawdown: 6 },
    'CR-M02b': { code: 'CR-M02b', max_drawdown: 12 },
    'CR-M03b': { code: 'CR-M03b', max_drawdown: 12 },
    'CR-C01c': { code: 'CR-C01c', max_drawdown: 8 },
    'CR-M02c': { code: 'CR-M02c', max_drawdown: 12 },
  },
}));

const mockSendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
const mockSendCircuitBreakerAlert = vi.fn().mockResolvedValue({ message_id: 2 });
vi.mock('@/lib/telegram', () => ({
  getTelegramClient: () => ({
    sendMessage: mockSendMessage,
    sendCircuitBreakerAlert: mockSendCircuitBreakerAlert,
  }),
}));

// Mock Supabase
const mockFrom = vi.fn();
vi.mock('@/lib/db/supabase/admin', () => ({
  createUntypedAdminClient: () => ({ from: mockFrom }),
}));

import { verifyCronAuth } from '@/lib/cron-auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRequest(): any {
  return {
    headers: {
      get: (key: string) => (key === 'authorization' ? 'Bearer test' : null),
    },
    nextUrl: { searchParams: new URLSearchParams() },
    url: 'http://localhost:3000/api/cron/crypto-tick',
  };
}

function setupSupabaseMock(opts: {
  existingSessions: { strategy_code: string; status: string }[];
  circuitBrokenSession: {
    max_drawdown_pct: number;
    circuit_broken_reason: string;
    strategy_code: string;
  } | null;
}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'crypto_paper_sessions') {
      return {
        select: () => ({
          in: () => Promise.resolve({ data: opts.existingSessions, error: null }),
          eq: () => ({
            single: () => Promise.resolve({
              data: opts.circuitBrokenSession,
              error: opts.circuitBrokenSession ? null : { message: 'not found' },
            }),
          }),
        }),
      };
    }
    return {
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cron/crypto-tick', () => {
  let handler: (req: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockInitializeAdapter.mockResolvedValue(undefined);

    // Default Supabase mock: no existing sessions
    setupSupabaseMock({ existingSessions: [], circuitBrokenSession: null });

    const mod = await import('@/app/api/cron/crypto-tick/route');
    handler = mod.GET;
  });

  it('returns 401 if auth fails', async () => {
    (verifyCronAuth as any).mockReturnValue(false);
    const res = await handler(createMockRequest());
    expect(res.status).toBe(401);
  });

  it('initializes adapter and executes tick', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockTick.mockResolvedValue([
      {
        sessionId: 'crypto_paper_CR-C01_123',
        strategyCode: 'CR-C01',
        pairsEvaluated: 8,
        signalsGenerated: 2,
        positionsOpened: 1,
        positionsClosed: 0,
        circuitBroken: false,
        portfolioValue: 1010,
        totalPnlPct: 1.0,
        errors: [],
      },
    ]);

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary.sessionsProcessed).toBe(1);
    expect(body.summary.totalSignals).toBe(2);
    expect(body.summary.totalPositionsOpened).toBe(1);
    expect(mockInitializeAdapter).toHaveBeenCalledWith('binance');
  });

  it('sends Telegram notification when positions change', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockTick.mockResolvedValue([
      {
        sessionId: 'crypto_paper_CR-C02b_456',
        strategyCode: 'CR-C02b',
        pairsEvaluated: 4,
        signalsGenerated: 3,
        positionsOpened: 2,
        positionsClosed: 1,
        circuitBroken: false,
        portfolioValue: 1005,
        totalPnlPct: 0.5,
        errors: [],
      },
    ]);

    await handler(createMockRequest());
    expect(mockSendMessage).toHaveBeenCalled();

    const msgCall = mockSendMessage.mock.calls[0][1] as string;
    expect(msgCall).toContain('Crypto Tick CR-C02b');
    expect(msgCall).toContain('Posizioni aperte: 2');
    expect(msgCall).toContain('Posizioni chiuse: 1');
  });

  it('sends circuit breaker alert', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockTick.mockResolvedValue([
      {
        sessionId: 'crypto_paper_CR-M01b_789',
        strategyCode: 'CR-M01b',
        pairsEvaluated: 8,
        signalsGenerated: 0,
        positionsOpened: 0,
        positionsClosed: 0,
        circuitBroken: true,
        portfolioValue: 950,
        totalPnlPct: -5.0,
        errors: [],
      },
    ]);

    await handler(createMockRequest());
    expect(mockSendCircuitBreakerAlert).toHaveBeenCalled();
  });

  it('handles errors gracefully and notifies Telegram', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockTick.mockRejectedValue(new Error('Exchange API down'));

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('Exchange API down');
    expect(mockSendMessage).toHaveBeenCalled();
  });

  it('returns empty summary when no active sessions', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockTick.mockResolvedValue([]);

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary.sessionsProcessed).toBe(0);
    expect(body.summary.totalSignals).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Auto-start protection tests
  // -------------------------------------------------------------------------

  it('does NOT auto-start if paused sessions exist for L1 strategies', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockGetActiveSessions.mockReturnValue([]);
    mockTick.mockResolvedValue([]);

    setupSupabaseMock({
      existingSessions: [
        { strategy_code: 'CR-C01', status: 'paused' },
        { strategy_code: 'CR-C02b', status: 'running' },
      ],
      circuitBrokenSession: null,
    });

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockAutoStartL1Sessions).not.toHaveBeenCalled();
    expect(body.summary.autoStarted).toBe(0);
    expect(body.summary.autoStartSkipped).toBeGreaterThan(0);
  });

  it('does NOT auto-start if stopped sessions exist for L1 strategies', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockGetActiveSessions.mockReturnValue([]);
    mockTick.mockResolvedValue([]);

    setupSupabaseMock({
      existingSessions: [
        { strategy_code: 'CR-M01b', status: 'stopped' },
      ],
      circuitBrokenSession: null,
    });

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockAutoStartL1Sessions).not.toHaveBeenCalled();
    expect(body.summary.autoStartSkipped).toBeGreaterThan(0);
  });

  it('auto-starts only when NO sessions exist at all (first run)', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockGetActiveSessions.mockReturnValue([]);
    mockAutoStartL1Sessions.mockResolvedValue(['session-1', 'session-2']);
    mockTick.mockResolvedValue([]);

    setupSupabaseMock({
      existingSessions: [], // No sessions at all — first run
      circuitBrokenSession: null,
    });

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockAutoStartL1Sessions).toHaveBeenCalled();
    expect(body.summary.autoStarted).toBe(2);
    expect(body.summary.autoStartSkipped).toBe(0);
  });

  it('skips auto-start when sessions already active (activeBefore > 0)', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockGetActiveSessions.mockReturnValue([{ sessionId: 'existing' }]);
    mockTick.mockResolvedValue([]);

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockAutoStartL1Sessions).not.toHaveBeenCalled();
    expect(body.summary.autoStarted).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Circuit breaker with real drawdown values
  // -------------------------------------------------------------------------

  it('sends circuit breaker alert with real drawdown values from DB', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockGetActiveSessions.mockReturnValue([{ sessionId: 'active' }]);
    mockTick.mockResolvedValue([
      {
        sessionId: 'crypto_paper_CR-C01_789',
        strategyCode: 'CR-C01',
        pairsEvaluated: 8,
        signalsGenerated: 0,
        positionsOpened: 0,
        positionsClosed: 0,
        circuitBroken: true,
        portfolioValue: 920,
        totalPnlPct: -8.0,
        errors: [],
      },
    ]);

    setupSupabaseMock({
      existingSessions: [{ strategy_code: 'CR-C01', status: 'running' }],
      circuitBrokenSession: {
        max_drawdown_pct: 8.5,
        circuit_broken_reason: 'Drawdown 8.5% > limit 8%',
        strategy_code: 'CR-C01',
      },
    });

    await handler(createMockRequest());

    expect(mockSendCircuitBreakerAlert).toHaveBeenCalled();
    const alertArg = mockSendCircuitBreakerAlert.mock.calls[0][1];
    expect(alertArg.currentDrawdown).toBe(8.5);
    expect(alertArg.maxDrawdown).toBe(8);
    expect(alertArg.action).toContain('Drawdown 8.5%');
  });

  it('includes autoStartSkippedDetails in summary JSON', async () => {
    (verifyCronAuth as any).mockReturnValue(true);
    mockGetActiveSessions.mockReturnValue([]);
    mockTick.mockResolvedValue([]);

    setupSupabaseMock({
      existingSessions: [
        { strategy_code: 'CR-C01', status: 'paused' },
        { strategy_code: 'CR-M02b', status: 'stopped' },
      ],
      circuitBrokenSession: null,
    });

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(body.summary.autoStartSkippedDetails).toBeDefined();
    expect(body.summary.autoStartSkippedDetails.length).toBe(2);
    expect(body.summary.autoStartSkippedDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CR-C01', status: 'paused' }),
        expect.objectContaining({ code: 'CR-M02b', status: 'stopped' }),
      ]),
    );
  });
});
