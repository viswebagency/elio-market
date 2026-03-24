/**
 * Tests for CircuitBreakerLive — automatic safety net for live trading.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CircuitBreakerLive,
  LIVE_CB_THRESHOLDS,
  LiveTradeResult,
  LiveDailyStats,
} from '@/services/execution/circuit-breaker-live';
import { KillSwitch } from '@/services/execution/kill-switch';

// Mock audit logger
vi.mock('@/services/execution/audit-logger', () => ({
  auditLogger: {
    logKillSwitch: vi.fn().mockResolvedValue(undefined),
    logCircuitBreakerLive: vi.fn().mockResolvedValue(undefined),
    logTradeIntent: vi.fn().mockResolvedValue(undefined),
    logExecution: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock Telegram
vi.mock('@/lib/telegram', () => ({
  getTelegramClient: vi.fn(() => ({
    sendMessage: vi.fn().mockResolvedValue({}),
  })),
}));

// Mock DB for hydrate/persist
vi.mock('@/lib/db/supabase/admin', () => ({
  createUntypedAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  }),
}));

function createMockKillSwitch(): KillSwitch {
  const ks = new KillSwitch();
  // Spy on activate to verify it's called
  vi.spyOn(ks, 'activate').mockResolvedValue({
    cancelledOrders: 2,
    closedPositions: 1,
    errors: [],
  });
  return ks;
}

function makeTrade(pnl: number, bankroll = 1000): LiveTradeResult {
  return { pnl, pnlPct: (pnl / bankroll) * 100, bankroll };
}

function makeDaily(dailyPnl: number, bankroll = 1000): LiveDailyStats {
  return { dailyPnl, dailyPnlPct: (dailyPnl / bankroll) * 100, bankroll };
}

describe('CircuitBreakerLive', () => {
  let cb: CircuitBreakerLive;
  let ks: KillSwitch;

  beforeEach(() => {
    ks = createMockKillSwitch();
    cb = new CircuitBreakerLive(ks);
  });

  it('should start not tripped', () => {
    expect(cb.isTripped).toBe(false);
    expect(cb.getStatus().tripped).toBe(false);
  });

  // ---- Single trade loss > 5% ----

  it('should trip on single trade loss > 5% of bankroll', async () => {
    const bankroll = 1000;
    const loss = -60; // 6% loss

    const tripped = await cb.checkAndTrip(
      makeTrade(loss, bankroll),
      makeDaily(loss, bankroll),
    );

    expect(tripped).toBe(true);
    expect(cb.isTripped).toBe(true);
    expect(cb.getStatus().reason).toContain('Perdita singolo trade');
  });

  it('should NOT trip on single trade loss <= 5%', async () => {
    const bankroll = 1000;
    const loss = -40; // 4% loss

    const tripped = await cb.checkAndTrip(
      makeTrade(loss, bankroll),
      makeDaily(loss, bankroll),
    );

    expect(tripped).toBe(false);
    expect(cb.isTripped).toBe(false);
  });

  // ---- Daily loss > 4% ----

  it('should trip on daily cumulative loss > 4%', async () => {
    const bankroll = 1000;
    // Small single trade but large daily total
    const tripped = await cb.checkAndTrip(
      makeTrade(-10, bankroll), // 1% single
      makeDaily(-50, bankroll), // 5% daily
    );

    expect(tripped).toBe(true);
    expect(cb.isTripped).toBe(true);
    expect(cb.getStatus().reason).toContain('Perdita giornaliera');
  });

  // ---- 3 consecutive losses ----

  it('should trip on 3 consecutive losing trades', async () => {
    const bankroll = 1000;
    const daily = makeDaily(-15, bankroll); // safe daily total

    // Trade 1: loss
    await cb.checkAndTrip(makeTrade(-10, bankroll), daily);
    expect(cb.isTripped).toBe(false);

    // Trade 2: loss
    await cb.checkAndTrip(makeTrade(-10, bankroll), daily);
    expect(cb.isTripped).toBe(false);

    // Trade 3: loss — should trip
    const tripped = await cb.checkAndTrip(makeTrade(-10, bankroll), daily);
    expect(tripped).toBe(true);
    expect(cb.isTripped).toBe(true);
    expect(cb.getStatus().reason).toContain('consecutivi in perdita');
    expect(cb.getStatus().consecutiveLosses).toBe(3);
  });

  it('should reset consecutive losses on a win', async () => {
    const bankroll = 1000;
    const daily = makeDaily(-10, bankroll);

    // 2 losses
    await cb.checkAndTrip(makeTrade(-10, bankroll), daily);
    await cb.checkAndTrip(makeTrade(-10, bankroll), daily);
    expect(cb.getStatus().consecutiveLosses).toBe(2);

    // 1 win — resets counter
    await cb.checkAndTrip(makeTrade(20, bankroll), daily);
    expect(cb.getStatus().consecutiveLosses).toBe(0);

    // 2 more losses — should NOT trip (only 2)
    await cb.checkAndTrip(makeTrade(-10, bankroll), daily);
    await cb.checkAndTrip(makeTrade(-10, bankroll), daily);
    expect(cb.isTripped).toBe(false);
  });

  // ---- Execution errors ----

  it('should trip on 3 execution errors within 10 minutes', async () => {
    await cb.recordError('Error 1');
    expect(cb.isTripped).toBe(false);

    await cb.recordError('Error 2');
    expect(cb.isTripped).toBe(false);

    const tripped = await cb.recordError('Error 3');
    expect(tripped).toBe(true);
    expect(cb.isTripped).toBe(true);
    expect(cb.getStatus().reason).toContain('errori di esecuzione');
  });

  // ---- Kill switch activation ----

  it('should activate kill switch when tripped', async () => {
    const bankroll = 1000;
    const loss = -60; // 6%

    await cb.checkAndTrip(
      makeTrade(loss, bankroll),
      makeDaily(loss, bankroll),
      { userId: 'test-user' },
    );

    expect(ks.activate).toHaveBeenCalledWith(
      'test-user',
      expect.stringContaining('Circuit breaker live'),
      undefined,
    );
  });

  it('should pass adapter to kill switch when provided', async () => {
    const mockAdapter = { fake: true } as any;

    await cb.checkAndTrip(
      makeTrade(-60, 1000),
      makeDaily(-60, 1000),
      { userId: 'u1', adapter: mockAdapter },
    );

    expect(ks.activate).toHaveBeenCalledWith(
      'u1',
      expect.stringContaining('Circuit breaker live'),
      mockAdapter,
    );
  });

  // ---- Reset ----

  it('should reset all state', async () => {
    // Trip first
    await cb.checkAndTrip(
      makeTrade(-60, 1000),
      makeDaily(-60, 1000),
    );
    expect(cb.isTripped).toBe(true);

    // Reset
    await cb.reset('test-user');

    expect(cb.isTripped).toBe(false);
    expect(cb.getStatus().tripped).toBe(false);
    expect(cb.getStatus().reason).toBeNull();
    expect(cb.getStatus().consecutiveLosses).toBe(0);
    expect(cb.getStatus().dailyLossPct).toBe(0);
    expect(cb.getStatus().recentErrors).toBe(0);
  });

  // ---- Status ----

  it('should return accurate status', async () => {
    const bankroll = 1000;
    const daily = makeDaily(-10, bankroll);

    await cb.checkAndTrip(makeTrade(-10, bankroll), daily);
    await cb.recordError('test error');

    const status = cb.getStatus();
    expect(status.tripped).toBe(false);
    expect(status.consecutiveLosses).toBe(1);
    expect(status.recentErrors).toBe(1);
  });

  // ---- Already tripped ----

  it('should short-circuit if already tripped', async () => {
    // Trip it
    await cb.checkAndTrip(
      makeTrade(-60, 1000),
      makeDaily(-60, 1000),
    );

    // Try again — should return true but not call kill switch again
    vi.mocked(ks.activate).mockClear();
    const tripped = await cb.checkAndTrip(
      makeTrade(-10, 1000),
      makeDaily(-10, 1000),
    );
    expect(tripped).toBe(true);
    expect(ks.activate).not.toHaveBeenCalled();
  });
});
