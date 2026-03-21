/**
 * Tests for auto-rotation logic.
 * Covers: cooldown set at circuit breaker, rotation after expiry,
 * stop after max rotations, no rotation during active cooldown.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock ccxt (required by crypto-manager transitive import)
// ---------------------------------------------------------------------------
vi.mock('ccxt', () => {
  class MockExchange {
    id: string;
    markets: Record<string, unknown> = {};
    constructor(public opts: Record<string, unknown> = {}) { this.id = 'mock'; }
    setSandboxMode() {}
    async loadMarkets() { return {}; }
    async fetchTicker() { return { symbol: 'BTC/USDT', last: 65000, bid: 64990, ask: 65010, high: 66000, low: 64000, baseVolume: 1000, quoteVolume: 65000000, change: 100, percentage: 0.15, datetime: new Date().toISOString() }; }
    async fetchTickers() { return {}; }
  }
  return {
    default: {
      binance: class extends MockExchange { constructor(opts: Record<string, unknown>) { super(opts); this.id = 'binance'; } },
      bybit: class extends MockExchange { constructor(opts: Record<string, unknown>) { super(opts); this.id = 'bybit'; } },
    },
    binance: class extends MockExchange { constructor(opts: Record<string, unknown>) { super(opts); this.id = 'binance'; } },
    bybit: class extends MockExchange { constructor(opts: Record<string, unknown>) { super(opts); this.id = 'bybit'; } },
  };
});

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------
const mockFrom = vi.fn();
vi.mock('@/lib/db/supabase/admin', () => ({
  createUntypedAdminClient: () => ({ from: mockFrom }),
}));

// ---------------------------------------------------------------------------
// Mock Telegram
// ---------------------------------------------------------------------------
const mockSendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
vi.mock('@/lib/telegram', () => ({
  getTelegramClient: () => ({
    sendMessage: mockSendMessage,
    sendCircuitBreakerAlert: vi.fn().mockResolvedValue({ message_id: 2 }),
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import { processExpiredCooldowns, ExpiredSession } from '@/core/paper-trading/auto-rotation';
import { CRYPTO_COOLDOWN_HOURS, MAX_AUTO_ROTATIONS, CRYPTO_L1_DEFAULT_CAPITAL } from '@/core/paper-trading/crypto-manager';
import { POLYMARKET_COOLDOWN_HOURS } from '@/core/paper-trading/manager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createExpiredSession(overrides: Partial<ExpiredSession> = {}): ExpiredSession {
  return {
    id: 'session-old-uuid',
    strategy_code: 'CR-C01',
    strategy_name: 'Mean Reversion Range',
    strategy_id: null,
    user_id: null,
    auto_rotation_count: 0,
    max_auto_rotations: MAX_AUTO_ROTATIONS,
    initial_capital: CRYPTO_L1_DEFAULT_CAPITAL,
    ...overrides,
  };
}

function setupMockDbForExpired(expiredSessions: ExpiredSession[]) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'crypto_paper_sessions' || table === 'paper_sessions') {
      return {
        select: () => ({
          eq: () => ({
            not: () => ({
              lte: () => Promise.resolve({ data: expiredSessions, error: null }),
            }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({
              data: { id: 'new-session-uuid', started_at: new Date().toISOString() },
              error: null,
            }),
          }),
        }),
      };
    }
    return { select: () => ({ eq: () => Promise.resolve({ data: null }) }) };
  });
}

// ---------------------------------------------------------------------------
// Tests — Constants
// ---------------------------------------------------------------------------

describe('Auto-Rotation Constants', () => {
  it('should have crypto cooldown of 6 hours', () => {
    expect(CRYPTO_COOLDOWN_HOURS).toBe(6);
  });

  it('should have Polymarket cooldown of 12 hours', () => {
    expect(POLYMARKET_COOLDOWN_HOURS).toBe(12);
  });

  it('should have max auto-rotations of 3', () => {
    expect(MAX_AUTO_ROTATIONS).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Tests — Cooldown set at circuit breaker
// ---------------------------------------------------------------------------

describe('Cooldown at Circuit Breaker', () => {
  it('should calculate crypto cooldown_until correctly (6 hours from now)', () => {
    const now = Date.now();
    const cooldownUntil = new Date(now + CRYPTO_COOLDOWN_HOURS * 60 * 60 * 1000);
    const expectedHours = (cooldownUntil.getTime() - now) / (60 * 60 * 1000);
    expect(expectedHours).toBeCloseTo(6, 1);
  });

  it('should calculate Polymarket cooldown_until correctly (12 hours from now)', () => {
    const now = Date.now();
    const cooldownUntil = new Date(now + POLYMARKET_COOLDOWN_HOURS * 60 * 60 * 1000);
    const expectedHours = (cooldownUntil.getTime() - now) / (60 * 60 * 1000);
    expect(expectedHours).toBeCloseTo(12, 1);
  });
});

// ---------------------------------------------------------------------------
// Tests — Rotation after cooldown expiry
// ---------------------------------------------------------------------------

describe('Auto-Rotation — Expired Cooldown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should rotate session when cooldown has expired and rotations < max', async () => {
    const expired = createExpiredSession({ auto_rotation_count: 1 });
    setupMockDbForExpired([expired]);

    const mockRotate = vi.fn().mockResolvedValue('new-session-uuid');

    const result = await processExpiredCooldowns('crypto_paper_sessions', mockRotate);

    expect(result.rotated).toBe(1);
    expect(result.stopped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockRotate).toHaveBeenCalledWith(expired);
  });

  it('should send Telegram notification on successful rotation', async () => {
    const expired = createExpiredSession({ auto_rotation_count: 0 });
    setupMockDbForExpired([expired]);

    await processExpiredCooldowns('crypto_paper_sessions', async () => 'new-id');

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const msg = mockSendMessage.mock.calls[0][1] as string;
    expect(msg).toContain('Auto-Rotation');
    expect(msg).toContain('Mean Reversion Range');
    expect(msg).toContain('1/3'); // rotation 1 of 3
  });

  it('should rotate multiple expired sessions', async () => {
    const expired1 = createExpiredSession({ id: 'sess-1', strategy_code: 'CR-C01', auto_rotation_count: 0 });
    const expired2 = createExpiredSession({ id: 'sess-2', strategy_code: 'CR-M01b', strategy_name: 'Trend Follow', auto_rotation_count: 1 });
    setupMockDbForExpired([expired1, expired2]);

    const mockRotate = vi.fn().mockResolvedValue('new-id');

    const result = await processExpiredCooldowns('crypto_paper_sessions', mockRotate);

    expect(result.rotated).toBe(2);
    expect(mockRotate).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Tests — Stop after max rotations
// ---------------------------------------------------------------------------

describe('Auto-Rotation — Max Rotations Reached', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should stop session permanently when auto_rotation_count >= max_auto_rotations', async () => {
    const expired = createExpiredSession({ auto_rotation_count: 3, max_auto_rotations: 3 });
    setupMockDbForExpired([expired]);

    const mockRotate = vi.fn();
    const result = await processExpiredCooldowns('crypto_paper_sessions', mockRotate);

    expect(result.stopped).toBe(1);
    expect(result.rotated).toBe(0);
    expect(mockRotate).not.toHaveBeenCalled();
  });

  it('should send Telegram alert when max rotations reached', async () => {
    const expired = createExpiredSession({ auto_rotation_count: 3, max_auto_rotations: 3 });
    setupMockDbForExpired([expired]);

    await processExpiredCooldowns('crypto_paper_sessions', vi.fn());

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const msg = mockSendMessage.mock.calls[0][1] as string;
    expect(msg).toContain('Auto-Rotation Limit');
    expect(msg).toContain('fermata definitivamente');
    expect(msg).toContain('3 rotazioni');
  });

  it('should update DB with status stopped and clear cooldown_until', async () => {
    const expired = createExpiredSession({ auto_rotation_count: 3 });
    setupMockDbForExpired([expired]);

    // Track the update call
    let updateData: Record<string, unknown> | null = null;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'crypto_paper_sessions') {
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                lte: () => Promise.resolve({ data: [expired], error: null }),
              }),
            }),
          }),
          update: (data: Record<string, unknown>) => {
            updateData = data;
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      return {};
    });

    await processExpiredCooldowns('crypto_paper_sessions', vi.fn());

    expect(updateData).not.toBeNull();
    expect(updateData!.status).toBe('stopped');
    expect(updateData!.cooldown_until).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — No rotation during active cooldown
// ---------------------------------------------------------------------------

describe('Auto-Rotation — Active Cooldown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should NOT rotate when no expired sessions found (empty result)', async () => {
    setupMockDbForExpired([]);

    const mockRotate = vi.fn();
    const result = await processExpiredCooldowns('crypto_paper_sessions', mockRotate);

    expect(result.rotated).toBe(0);
    expect(result.stopped).toBe(0);
    expect(mockRotate).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('should NOT rotate when DB query returns null/error', async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          not: () => ({
            lte: () => Promise.resolve({ data: null, error: { message: 'timeout' } }),
          }),
        }),
      }),
    }));

    const result = await processExpiredCooldowns('crypto_paper_sessions', vi.fn());

    expect(result.rotated).toBe(0);
    expect(result.stopped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — Error handling
// ---------------------------------------------------------------------------

describe('Auto-Rotation — Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should capture rotation errors without crashing', async () => {
    const expired = createExpiredSession();
    setupMockDbForExpired([expired]);

    const mockRotate = vi.fn().mockRejectedValue(new Error('DB connection failed'));

    const result = await processExpiredCooldowns('crypto_paper_sessions', mockRotate);

    expect(result.rotated).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('DB connection failed');
  });

  it('should continue processing other sessions if one fails', async () => {
    const expired1 = createExpiredSession({ id: 'sess-fail', auto_rotation_count: 0 });
    const expired2 = createExpiredSession({ id: 'sess-ok', auto_rotation_count: 1 });
    setupMockDbForExpired([expired1, expired2]);

    let callCount = 0;
    const mockRotate = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('fail');
      return 'new-id';
    });

    const result = await processExpiredCooldowns('crypto_paper_sessions', mockRotate);

    expect(result.rotated).toBe(1);
    expect(result.errors).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Tests — Polymarket (same logic, different table)
// ---------------------------------------------------------------------------

describe('Auto-Rotation — Polymarket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should work with paper_sessions table', async () => {
    const expired = createExpiredSession({
      strategy_id: 'strat-uuid',
      user_id: 'user-uuid',
      auto_rotation_count: 0,
    });
    setupMockDbForExpired([expired]);

    const result = await processExpiredCooldowns('paper_sessions', async () => 'new-pm-id');

    expect(result.rotated).toBe(1);
    const msg = mockSendMessage.mock.calls[0][1] as string;
    expect(msg).toContain('POLYMARKET');
  });
});
