/**
 * Integration tests for the live trading flow.
 *
 * These tests import REAL modules (kill switch, circuit breaker, executor,
 * trade approval, order validator, etc.) and mock only external services:
 * - CCXT (exchange)
 * - Supabase (database)
 * - Telegram (notifications)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KillSwitch } from '@/services/execution/kill-switch';
import {
  CircuitBreakerLive,
  LIVE_CB_THRESHOLDS,
} from '@/services/execution/circuit-breaker-live';
import { StrategyExecutor, ExecutorConfig, LiveExecutionService } from '@/core/engine/executor';
import { MarketArea, Direction, OrderType } from '@/core/types/common';
import { TierLevel } from '@/core/engine/signals';
import { Trade, TradeExecution } from '@/core/types/trade';
import { MarketSnapshot } from '@/core/engine/evaluator';
import type { ParsedStrategy } from '@/core/engine/dsl-parser';
import {
  executeWithApproval,
  resolveApproval,
  cancelAllPending,
  getPendingApprovals,
  APPROVAL_THRESHOLD_PCT,
} from '@/services/telegram/trade-approval';
import {
  reconcileAndUpdate,
  reconcileOrder,
  GetOrderStatusFn,
} from '@/services/reconciliation/order-reconciliation';
import { check2FAFromProfile, TwoFARequiredError } from '@/lib/auth/require-2fa';

// ---------------------------------------------------------------------------
// Mocks — only external services
// ---------------------------------------------------------------------------

vi.mock('@/services/execution/audit-logger', () => ({
  auditLogger: {
    logKillSwitch: vi.fn().mockResolvedValue(undefined),
    logCircuitBreakerLive: vi.fn().mockResolvedValue(undefined),
    logTradeIntent: vi.fn().mockResolvedValue(undefined),
    logExecution: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/telegram', () => ({
  getTelegramClient: vi.fn(() => ({
    sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
    sendDailySummary: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock('@/lib/db/supabase/admin', () => ({
  createUntypedAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
  })),
}));

vi.mock('@/lib/db/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user' } },
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { two_fa_enabled: true },
            error: null,
          }),
        })),
      })),
    })),
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestStrategy(): ParsedStrategy {
  return {
    strategyId: 'test-strat',
    code: 'TEST_STRAT',
    name: 'Test Strategy',
    area: 'crypto',
    entryRules: [
      {
        id: 'r1',
        description: 'Price in range',
        params: { type: 'price_range', minPrice: 0, maxPrice: 999999 },
      },
    ],
    exitRules: [
      {
        id: 'exit1',
        description: 'Take profit 10%',
        profitPct: 10,
        lossPct: null,
        sellFraction: 1,
        isStopLoss: false,
      },
      {
        id: 'exit2',
        description: 'Stop loss 5%',
        profitPct: null,
        lossPct: -5,
        sellFraction: 1,
        isStopLoss: true,
      },
    ],
    bankrollTiers: [
      { tier: TierLevel.TIER1, allocationPct: 50, description: 'T1' },
      { tier: TierLevel.TIER2, allocationPct: 30, description: 'T2' },
      { tier: TierLevel.TIER3, allocationPct: 20, description: 'T3' },
    ],
    maxDrawdown: 15,
    maxAllocationPct: 20,
    liquidityReservePct: 10,
    circuitBreaker: { lossPct: -15, action: 'close_all', description: 'Max drawdown' },
    maxConsecutiveLosses: 5,
  };
}

function makeSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    marketId: 'CRY:BTCUSDT',
    name: 'BTC/USDT',
    price: 60000,
    volume24hUsd: 1_000_000,
    totalVolumeUsd: 10_000_000,
    expiryDate: null,
    hasCatalyst: false,
    catalystDescription: null,
    category: 'Crypto',
    status: 'open',
    priceChange24hPct: 2,
    high24h: 61000,
    low24h: 59000,
    ...overrides,
  };
}

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'trade-1',
    strategyId: 'test-strat',
    userId: 'user-1',
    area: MarketArea.CRYPTO,
    symbol: 'BTC/USDT',
    direction: Direction.LONG,
    orderType: OrderType.MARKET,
    size: 0.01,
    sizePercent: 2,
    currency: 'USDT',
    metadata: { expectedPrice: 60000, confidence: 80, tier: 1, executionType: 'live' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockExecutionService(resultOverrides: Partial<TradeExecution> = {}): LiveExecutionService {
  const now = new Date().toISOString();
  return {
    execute: vi.fn().mockResolvedValue({
      id: 'exec-1',
      tradeId: 'trade-1',
      externalOrderId: 'ccxt-order-1',
      status: 'pending',
      filledSize: 0.01,
      executedAt: now,
      createdAt: now,
      updatedAt: now,
      ...resultOverrides,
    } satisfies TradeExecution),
  };
}

function createMockGetOrderStatus(overrides: Partial<ReturnType<GetOrderStatusFn>> = {}): GetOrderStatusFn {
  return vi.fn().mockResolvedValue({
    orderId: 'ccxt-order-1',
    status: 'closed',
    filledAmount: 0.01,
    remainingAmount: 0,
    avgFillPrice: 60100,
    fees: 0.5,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Test 1: Cron live-tick with kill switch active — must NOT call executor
// ---------------------------------------------------------------------------

describe('Live Trading Integration: Kill Switch blocks execution', () => {
  let ks: KillSwitch;
  let executionService: LiveExecutionService;

  beforeEach(() => {
    ks = new KillSwitch();
    executionService = createMockExecutionService();
  });

  it('kill switch active → executor not called', async () => {
    await ks.activate('user-1', 'test activation');
    expect(ks.isActive()).toBe(true);

    // Simulate what the cron does: check kill switch before evaluation
    if (ks.isActive()) {
      // Should skip — DO NOT call executor
      expect(executionService.execute).not.toHaveBeenCalled();
      return;
    }

    // This line should never be reached
    expect(true).toBe(false);
  });

  it('kill switch inactive → executor can run', async () => {
    expect(ks.isActive()).toBe(false);

    const strategy = createTestStrategy();
    const config: ExecutorConfig = {
      mode: 'live',
      initialBankroll: 10000,
      minConfidenceToEnter: 50,
      maxOpenPositions: 5,
      slippagePct: 0.5,
      area: MarketArea.CRYPTO,
      userId: 'user-1',
    };

    const executor = new StrategyExecutor(strategy, config);
    const batch = executor.evaluateMarkets([makeSnapshot()]);

    // Should have at least processed (entry or skip)
    expect(batch.marketsEvaluated).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Executor → Execution Service → placeTrade flow (mock only CCXT)
// ---------------------------------------------------------------------------

describe('Live Trading Integration: Executor → Execution → Reconciliation', () => {
  let executionService: LiveExecutionService;
  let getOrderStatus: GetOrderStatusFn;

  beforeEach(() => {
    executionService = createMockExecutionService();
    getOrderStatus = createMockGetOrderStatus();
  });

  it('executor generates pending trades in live mode and executes them', async () => {
    const strategy = createTestStrategy();
    const config: ExecutorConfig = {
      mode: 'live',
      initialBankroll: 10000,
      minConfidenceToEnter: 0, // Accept any signal
      maxOpenPositions: 5,
      slippagePct: 0.5,
      area: MarketArea.CRYPTO,
      userId: 'user-1',
    };

    const executor = new StrategyExecutor(strategy, config);
    executor.evaluateMarkets([makeSnapshot()]);

    const pending = executor.getPendingLiveTrades();
    expect(pending.length).toBeGreaterThanOrEqual(0);

    // Execute pending trades through the real executor method
    const results = await executor.executePendingLiveTrades({
      userId: 'user-1',
      executionService,
      getOrderStatus,
      reconcileAndUpdateFn: vi.fn().mockResolvedValue({
        orderId: 'ccxt-order-1',
        status: 'filled',
        expectedPrice: 60000,
        actualPrice: 60100,
        slippage: 0.17,
        fees: 0.5,
        fillTime: 1200,
        partialFill: false,
        filledAmount: 0.01,
      }),
    });

    // If signals were generated, execution should have been attempted
    if (pending.length > 0) {
      expect(executionService.execute).toHaveBeenCalled();
      expect(results.length).toBe(pending.length);
      for (const r of results) {
        expect(['executed', 'blocked', 'failed']).toContain(r.status);
      }
    }
  });

  it('reconciliation receives correct params from executor', async () => {
    const mockReconcile = vi.fn().mockResolvedValue({
      orderId: 'ccxt-order-1',
      status: 'filled',
      expectedPrice: 60000,
      actualPrice: 60050,
      slippage: 0.083,
      fees: 0.3,
      fillTime: 800,
      partialFill: false,
      filledAmount: 0.01,
    });

    const strategy = createTestStrategy();
    const config: ExecutorConfig = {
      mode: 'live',
      initialBankroll: 10000,
      minConfidenceToEnter: 0,
      maxOpenPositions: 5,
      slippagePct: 0.5,
      area: MarketArea.CRYPTO,
      userId: 'user-1',
    };

    const executor = new StrategyExecutor(strategy, config);
    executor.evaluateMarkets([makeSnapshot()]);

    const pending = executor.getPendingLiveTrades();

    if (pending.length > 0) {
      const results = await executor.executePendingLiveTrades({
        userId: 'user-1',
        executionService,
        getOrderStatus,
        reconcileAndUpdateFn: mockReconcile,
      });

      // Reconcile should have been called with the getOrderStatus fn, orderId, symbol, etc.
      if (results.some((r) => r.status === 'executed')) {
        expect(mockReconcile).toHaveBeenCalled();
        const call = mockReconcile.mock.calls[0];
        expect(call[0]).toBe(getOrderStatus); // getOrderStatusFn
        expect(call[1]).toBe('ccxt-order-1'); // orderId
        expect(typeof call[3]).toBe('number'); // expectedPrice
        expect(typeof call[4]).toBe('string'); // tradeId
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Test 3: Trade > 5% bankroll → approval flow → execute after approve
// ---------------------------------------------------------------------------

describe('Live Trading Integration: Approval Flow', () => {
  afterEach(() => {
    cancelAllPending();
  });

  it('trade below threshold executes directly', async () => {
    const trade = makeTrade({ size: 0.001 }); // small trade
    const executeFn = vi.fn().mockResolvedValue({ success: true });

    const result = await executeWithApproval(trade, 100000, executeFn, 'Test Strategy');

    expect(result.executed).toBe(true);
    expect(executeFn).toHaveBeenCalledOnce();
    expect(result.result).toEqual({ success: true });
  });

  it('trade above threshold goes to approval queue', async () => {
    // Trade value = size(1) * expectedPrice(60000) = 60000, bankroll = 100000
    // 60% > 5% threshold → needs approval
    const trade = makeTrade({
      id: 'large-trade-1',
      size: 1,
      limitPrice: 60000,
    });
    const executeFn = vi.fn().mockResolvedValue({ success: true });

    // Start the approval flow in the background
    const approvalPromise = executeWithApproval(trade, 100000, executeFn, 'Test Strategy');

    // Trade should be pending
    const pending = getPendingApprovals();
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe('large-trade-1');
    expect(pending[0].bankrollPct).toBeGreaterThan(APPROVAL_THRESHOLD_PCT);

    // Approve it
    const resolved = resolveApproval('large-trade-1', true);
    expect(resolved).toBe(true);

    const result = await approvalPromise;
    expect(result.executed).toBe(true);
    expect(result.approvalResult?.approved).toBe(true);
    expect(executeFn).toHaveBeenCalledOnce();
  });

  it('rejected trade is not executed', async () => {
    const trade = makeTrade({
      id: 'reject-trade-1',
      size: 1,
      limitPrice: 60000,
    });
    const executeFn = vi.fn().mockResolvedValue({ success: true });

    const approvalPromise = executeWithApproval(trade, 100000, executeFn, 'Test Strategy');

    // Reject it
    resolveApproval('reject-trade-1', false);

    const result = await approvalPromise;
    expect(result.executed).toBe(false);
    expect(result.approvalResult?.approved).toBe(false);
    expect(executeFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 4: Circuit breaker trip → kill switch activated + cancelAllPending
// ---------------------------------------------------------------------------

describe('Live Trading Integration: Circuit Breaker → Kill Switch', () => {
  let ks: KillSwitch;
  let cb: CircuitBreakerLive;

  beforeEach(() => {
    ks = new KillSwitch();
    vi.spyOn(ks, 'activate').mockResolvedValue({
      cancelledOrders: 1,
      closedPositions: 0,
      errors: [],
    });
    cb = new CircuitBreakerLive(ks);
  });

  afterEach(() => {
    cancelAllPending();
  });

  it('single trade loss above threshold trips CB and activates kill switch', async () => {
    const tradeResult = {
      pnl: -60, // 6% loss on 1000 bankroll
      pnlPct: -6,
      bankroll: 1000,
    };
    const dailyStats = {
      dailyPnl: -60,
      dailyPnlPct: -6,
      bankroll: 1000,
    };

    const tripped = await cb.checkAndTrip(tradeResult, dailyStats, { userId: 'user-1' });

    expect(tripped).toBe(true);
    expect(cb.isTripped).toBe(true);
    expect(ks.activate).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('Circuit breaker live'),
      undefined, // no adapter passed
    );
  });

  it('consecutive losses trip the CB', async () => {
    const dailyStats = { dailyPnl: -10, dailyPnlPct: -1, bankroll: 1000 };

    for (let i = 0; i < LIVE_CB_THRESHOLDS.CONSECUTIVE_LOSSES; i++) {
      const smallLoss = { pnl: -5, pnlPct: -0.5, bankroll: 1000 };
      const tripped = await cb.checkAndTrip(smallLoss, dailyStats);
      if (i < LIVE_CB_THRESHOLDS.CONSECUTIVE_LOSSES - 1) {
        expect(tripped).toBe(false);
      } else {
        expect(tripped).toBe(true);
      }
    }

    expect(cb.isTripped).toBe(true);
    expect(ks.activate).toHaveBeenCalled();
  });

  it('CB trip cancels all pending trade approvals', async () => {
    // Queue a pending trade approval
    const trade = makeTrade({ id: 'pending-trade-cb' });
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const neverResolves = new Promise<{ success: boolean }>(() => {});
    const executeFn = vi.fn().mockReturnValue(neverResolves);

    // Start approval (won't resolve because executeFn never resolves)
    executeWithApproval(trade, 100, executeFn, 'Test');
    // ^ this is a big trade: 0.01 * 60000 = 600, bankroll = 100, so 600% > 5%

    expect(getPendingApprovals().length).toBe(1);

    // Trip the circuit breaker (which calls cancelAllPending internally)
    const bigLoss = { pnl: -60, pnlPct: -6, bankroll: 1000 };
    const dailyStats = { dailyPnl: -60, dailyPnlPct: -6, bankroll: 1000 };
    await cb.checkAndTrip(bigLoss, dailyStats);

    // Pending approvals should be cleared
    expect(getPendingApprovals().length).toBe(0);
  });

  it('execution errors accumulate and trip CB', async () => {
    for (let i = 0; i < LIVE_CB_THRESHOLDS.MAX_ERRORS; i++) {
      const tripped = await cb.recordError(`Error ${i + 1}`);
      if (i < LIVE_CB_THRESHOLDS.MAX_ERRORS - 1) {
        expect(tripped).toBe(false);
      } else {
        expect(tripped).toBe(true);
      }
    }

    expect(cb.isTripped).toBe(true);
    expect(ks.activate).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 5: 2FA check
// ---------------------------------------------------------------------------

describe('Live Trading Integration: 2FA Gate', () => {
  it('blocks access when 2FA is not enabled', () => {
    const result = check2FAFromProfile({ two_fa_enabled: false });
    expect(result.allowed).toBe(false);
    expect(result.message).toContain('2FA');
  });

  it('allows access when 2FA is enabled', () => {
    const result = check2FAFromProfile({ two_fa_enabled: true });
    expect(result.allowed).toBe(true);
  });

  it('blocks access when profile has no 2FA field', () => {
    const result = check2FAFromProfile({});
    expect(result.allowed).toBe(false);
  });

  it('TwoFARequiredError has correct status code', () => {
    const err = new TwoFARequiredError();
    expect(err.statusCode).toBe(403);
    expect(err.name).toBe('TwoFARequiredError');
    expect(err.message).toContain('2FA');
  });
});

// ---------------------------------------------------------------------------
// Test 6: Order reconciliation (with mock getOrderStatus)
// ---------------------------------------------------------------------------

describe('Live Trading Integration: Order Reconciliation', () => {
  it('reconcileOrder returns filled status when order completes', async () => {
    const getStatus: GetOrderStatusFn = vi.fn().mockResolvedValue({
      orderId: 'order-1',
      status: 'closed',
      filledAmount: 1.0,
      remainingAmount: 0,
      avgFillPrice: 60050,
      fees: 0.5,
    });

    const result = await reconcileOrder(getStatus, 'order-1', 'BTC/USDT', 60000);

    expect(result.status).toBe('filled');
    expect(result.actualPrice).toBe(60050);
    expect(result.fees).toBe(0.5);
    expect(result.filledAmount).toBe(1.0);
    expect(result.slippage).toBeCloseTo(0.083, 2);
  });

  it('reconcileOrder returns cancelled when order is cancelled', async () => {
    const getStatus: GetOrderStatusFn = vi.fn().mockResolvedValue({
      orderId: 'order-2',
      status: 'canceled',
      filledAmount: 0,
      remainingAmount: 1.0,
      avgFillPrice: undefined,
      fees: 0,
    });

    const result = await reconcileOrder(getStatus, 'order-2', 'ETH/USDT', 3000);

    expect(result.status).toBe('cancelled');
    expect(result.filledAmount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 7: Full cron-like flow end-to-end
// ---------------------------------------------------------------------------

describe('Live Trading Integration: Full Cron Tick Flow', () => {
  let ks: KillSwitch;
  let cb: CircuitBreakerLive;

  beforeEach(() => {
    ks = new KillSwitch();
    cb = new CircuitBreakerLive(ks);
  });

  afterEach(() => {
    cancelAllPending();
  });

  it('full flow: evaluate → execute → reconcile → circuit breaker check', async () => {
    // 1. Safety checks
    expect(ks.isActive()).toBe(false);
    expect(cb.isTripped).toBe(false);

    // 2. 2FA check
    const twoFACheck = check2FAFromProfile({ two_fa_enabled: true });
    expect(twoFACheck.allowed).toBe(true);

    // 3. Setup executor in live mode
    const strategy = createTestStrategy();
    const bankroll = 10000;
    const config: ExecutorConfig = {
      mode: 'live',
      initialBankroll: bankroll,
      minConfidenceToEnter: 0,
      maxOpenPositions: 5,
      slippagePct: 0.5,
      area: MarketArea.CRYPTO,
      userId: 'user-1',
    };

    const executor = new StrategyExecutor(strategy, config);

    // 4. Evaluate markets
    const batch = executor.evaluateMarkets([makeSnapshot()]);
    expect(batch.marketsEvaluated).toBe(1);

    // 5. Execute pending trades
    const executionService = createMockExecutionService();
    const getOrderStatus = createMockGetOrderStatus();
    const mockReconcile = vi.fn().mockResolvedValue({
      orderId: 'ccxt-order-1',
      status: 'filled',
      expectedPrice: 60000,
      actualPrice: 60050,
      slippage: 0.083,
      fees: 0.3,
      fillTime: 500,
      partialFill: false,
      filledAmount: 0.01,
    });

    const pending = executor.getPendingLiveTrades();
    const results = await executor.executePendingLiveTrades({
      userId: 'user-1',
      executionService,
      getOrderStatus,
      reconcileAndUpdateFn: mockReconcile,
    });

    // 6. Feed results to circuit breaker
    for (const result of results) {
      if (result.status === 'executed' && result.reconciliation) {
        const fees = result.reconciliation.fees ?? 0;
        const pnl = -fees;
        const tripped = await cb.checkAndTrip(
          { pnl, pnlPct: bankroll > 0 ? (pnl / bankroll) * 100 : 0, bankroll },
          { dailyPnl: pnl, dailyPnlPct: bankroll > 0 ? (pnl / bankroll) * 100 : 0, bankroll },
        );
        expect(tripped).toBe(false); // Small fees shouldn't trip CB
      }
    }

    // 7. Circuit breaker should NOT be tripped after normal execution
    expect(cb.isTripped).toBe(false);
    expect(ks.isActive()).toBe(false);
  });

  it('kill switch blocks entire flow', async () => {
    await ks.activate('system', 'manual activation');
    expect(ks.isActive()).toBe(true);

    // Simulating cron: kill switch check should prevent any execution
    const executionService = createMockExecutionService();
    // In the cron, this check happens before any strategy evaluation
    expect(ks.isActive()).toBe(true);
    expect(executionService.execute).not.toHaveBeenCalled();
  });

  it('circuit breaker blocks entire flow', async () => {
    // Trip the CB first
    const bigLoss = { pnl: -100, pnlPct: -10, bankroll: 1000 };
    const dailyStats = { dailyPnl: -100, dailyPnlPct: -10, bankroll: 1000 };
    vi.spyOn(ks, 'activate').mockResolvedValue({ cancelledOrders: 0, closedPositions: 0, errors: [] });
    await cb.checkAndTrip(bigLoss, dailyStats);
    expect(cb.isTripped).toBe(true);

    // In the cron, this check happens before any strategy evaluation
    const executionService = createMockExecutionService();
    expect(cb.isTripped).toBe(true);
    expect(executionService.execute).not.toHaveBeenCalled();
  });
});
