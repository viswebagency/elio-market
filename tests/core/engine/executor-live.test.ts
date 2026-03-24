/**
 * Tests for StrategyExecutor in live mode — queuing, execution, and reconciliation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrategyExecutor, LiveExecutionService, GetOrderStatusFn } from '@/core/engine/executor';
import { parseStrategy, RawStrategyRow } from '@/core/engine/dsl-parser';
import { MarketSnapshot } from '@/core/engine/evaluator';
import { MarketArea, Direction, OrderType } from '@/core/types/common';
import { SignalType } from '@/core/engine/signals';
import type { Trade, TradeExecution } from '@/core/types/trade';
import type { ReconciliationResult } from '@/services/reconciliation/order-reconciliation';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CR_C02b_ROW: RawStrategyRow = {
  id: 'CR-C02b',
  code: 'CR-C02b',
  name: 'DCA on Dip v2',
  area: 'crypto',
  max_drawdown: 12,
  max_allocation_pct: 5,
  max_consecutive_losses: 5,
  rules: {
    entry_rules: [
      {
        id: 'dip',
        condition: 'price_change_pct',
        description: 'Dip moderato',
        params: { min_change_pct: -8, max_change_pct: -1.5 },
      },
      {
        id: 'volume',
        condition: 'min_volume',
        description: 'Volume minimo $5M',
        params: { min_volume_usd: 5_000_000 },
      },
    ],
    exit_rules: [
      {
        id: 'tp',
        condition: 'take_profit',
        description: 'TP +3.5%',
        params: { profit_pct: 3.5, sell_fraction: 1.0 },
      },
      {
        id: 'sl',
        condition: 'stop_loss',
        description: 'SL -2.5%',
        params: { loss_pct: -2.5, sell_fraction: 1.0 },
      },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 60, description: 'Blue chip' },
      tier2: { allocation_pct: 30, description: 'Large cap' },
      tier3: { allocation_pct: 10, description: 'Mid cap' },
    },
    liquidity_reserve_pct: 30,
    circuit_breaker_total: { loss_pct: -12, action: 'Pausa', description: 'Stop drawdown 12%' },
  },
};

function makeMatchingSnapshot(price = 65000): MarketSnapshot {
  return {
    marketId: 'BTC/USDT',
    name: 'Bitcoin / USDT',
    price,
    volume24hUsd: 50_000_000,
    totalVolumeUsd: 50_000_000,
    expiryDate: null,
    hasCatalyst: false,
    catalystDescription: null,
    category: 'crypto',
    status: 'open',
    priceChange24hPct: -3.0, // within [-8, -1.5]
    high24h: price * 1.02,
    low24h: price * 0.97,
  };
}

function makeNonMatchingSnapshot(price = 65000): MarketSnapshot {
  return {
    ...makeMatchingSnapshot(price),
    priceChange24hPct: 5.0, // outside entry range
  };
}

function createMockExecutionService(overrides?: Partial<{ orderId: string; status: string }>): LiveExecutionService {
  const orderId = overrides?.orderId ?? 'mock-order-123';
  return {
    execute: vi.fn().mockImplementation(async (trade: Trade): Promise<TradeExecution> => ({
      id: crypto.randomUUID(),
      tradeId: trade.id,
      externalOrderId: orderId,
      status: 'filled',
      fillPrice: 65000,
      filledSize: trade.size,
      commission: 0.65,
      executedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
  };
}

function createMockGetOrderStatus(): GetOrderStatusFn {
  return vi.fn().mockResolvedValue({
    orderId: 'mock-order-123',
    status: 'closed',
    filledAmount: 0.001,
    remainingAmount: 0,
    avgFillPrice: 65000,
    fees: 0.065,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StrategyExecutor — live mode', () => {
  let parsed: ReturnType<typeof parseStrategy>;

  beforeEach(() => {
    parsed = parseStrategy(CR_C02b_ROW);
  });

  it('should queue trades in pendingLiveTrades when mode=live and entry matches', () => {
    const executor = new StrategyExecutor(parsed, {
      mode: 'live',
      initialBankroll: 10000,
      area: MarketArea.CRYPTO,
    });

    const batch = executor.evaluateMarkets([makeMatchingSnapshot()]);

    expect(batch.marketsMatched).toBe(1);
    expect(batch.signals.some(s => s.type === SignalType.ENTER_LONG)).toBe(true);

    const pending = executor.getPendingLiveTrades();
    expect(pending).toHaveLength(1);
    expect(pending[0].signal.type).toBe(SignalType.ENTER_LONG);
    expect(pending[0].market.marketId).toBe('BTC/USDT');
  });

  it('should NOT queue trades when entry conditions are not met', () => {
    const executor = new StrategyExecutor(parsed, {
      mode: 'live',
      initialBankroll: 10000,
      area: MarketArea.CRYPTO,
    });

    const batch = executor.evaluateMarkets([makeNonMatchingSnapshot()]);

    expect(batch.marketsMatched).toBe(0);
    expect(executor.getPendingLiveTrades()).toHaveLength(0);
  });

  it('should execute pending trades via LiveExecutionService', async () => {
    const executor = new StrategyExecutor(parsed, {
      mode: 'live',
      initialBankroll: 10000,
      area: MarketArea.CRYPTO,
    });

    executor.evaluateMarkets([makeMatchingSnapshot()]);
    expect(executor.getPendingLiveTrades()).toHaveLength(1);

    const execService = createMockExecutionService();

    const results = await executor.executePendingLiveTrades({
      userId: 'test-user',
      executionService: execService,
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('executed');
    expect(results[0].orderId).toBe('mock-order-123');
    expect(execService.execute).toHaveBeenCalledOnce();

    // Pending should be cleared after execution
    expect(executor.getPendingLiveTrades()).toHaveLength(0);
  });

  it('should execute and reconcile trades end-to-end', async () => {
    const executor = new StrategyExecutor(parsed, {
      mode: 'live',
      initialBankroll: 10000,
      area: MarketArea.CRYPTO,
    });

    executor.evaluateMarkets([makeMatchingSnapshot(65000)]);

    const execService = createMockExecutionService();
    const getOrderStatus = createMockGetOrderStatus();
    const reconcileAndUpdateFn = vi.fn().mockResolvedValue({
      orderId: 'mock-order-123',
      status: 'filled',
      expectedPrice: 65000,
      actualPrice: 65050,
      slippage: 0.0769,
      fees: 0.065,
      fillTime: 150,
      partialFill: false,
      filledAmount: 0.001,
    } satisfies ReconciliationResult);

    const results = await executor.executePendingLiveTrades({
      userId: 'test-user',
      executionService: execService,
      getOrderStatus,
      reconcileAndUpdateFn,
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('executed');
    expect(results[0].reconciliation).toBeDefined();
    expect(results[0].reconciliation!.status).toBe('filled');
    expect(results[0].reconciliation!.slippage).toBeCloseTo(0.0769, 3);
    expect(results[0].reconciliation!.fees).toBe(0.065);

    expect(reconcileAndUpdateFn).toHaveBeenCalledWith(
      getOrderStatus,
      'mock-order-123',
      'BTC/USDT',
      expect.any(Number), // expectedPrice
      expect.any(String), // tradeId
    );
  });

  it('should mark trade as failed when execution throws', async () => {
    const executor = new StrategyExecutor(parsed, {
      mode: 'live',
      initialBankroll: 10000,
      area: MarketArea.CRYPTO,
    });

    executor.evaluateMarkets([makeMatchingSnapshot()]);

    const execService: LiveExecutionService = {
      execute: vi.fn().mockRejectedValue(new Error('Insufficient funds')),
    };

    const results = await executor.executePendingLiveTrades({
      userId: 'test-user',
      executionService: execService,
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('failed');
    expect(results[0].reason).toContain('Insufficient funds');
  });

  it('should mark trade as blocked when kill switch error', async () => {
    const executor = new StrategyExecutor(parsed, {
      mode: 'live',
      initialBankroll: 10000,
      area: MarketArea.CRYPTO,
    });

    executor.evaluateMarkets([makeMatchingSnapshot()]);

    const execService: LiveExecutionService = {
      execute: vi.fn().mockRejectedValue(new Error('Kill switch is active')),
    };

    const results = await executor.executePendingLiveTrades({
      userId: 'test-user',
      executionService: execService,
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('blocked');
    expect(results[0].reason).toContain('Kill switch');
  });

  it('should return empty array when no pending trades', async () => {
    const executor = new StrategyExecutor(parsed, {
      mode: 'live',
      initialBankroll: 10000,
      area: MarketArea.CRYPTO,
    });

    const results = await executor.executePendingLiveTrades({
      userId: 'test-user',
      executionService: createMockExecutionService(),
    });

    expect(results).toHaveLength(0);
  });

  it('should handle reconciliation failure gracefully', async () => {
    const executor = new StrategyExecutor(parsed, {
      mode: 'live',
      initialBankroll: 10000,
      area: MarketArea.CRYPTO,
    });

    executor.evaluateMarkets([makeMatchingSnapshot()]);

    const execService = createMockExecutionService();
    const getOrderStatus = createMockGetOrderStatus();
    const reconcileAndUpdateFn = vi.fn().mockRejectedValue(new Error('Reconciliation timeout'));

    const results = await executor.executePendingLiveTrades({
      userId: 'test-user',
      executionService: execService,
      getOrderStatus,
      reconcileAndUpdateFn,
    });

    // Trade should still be marked as executed even if reconciliation fails
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('executed');
    expect(results[0].reconciliation).toBeUndefined();
  });

  it('should build trade with correct fields from signal', async () => {
    const executor = new StrategyExecutor(parsed, {
      mode: 'live',
      initialBankroll: 10000,
      area: MarketArea.CRYPTO,
      userId: 'test-user',
    });

    executor.evaluateMarkets([makeMatchingSnapshot(65000)]);

    let capturedTrade: Trade | undefined;
    const execService: LiveExecutionService = {
      execute: vi.fn().mockImplementation(async (trade: Trade) => {
        capturedTrade = trade;
        return {
          id: crypto.randomUUID(),
          tradeId: trade.id,
          externalOrderId: 'order-1',
          status: 'filled',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }),
    };

    await executor.executePendingLiveTrades({
      userId: 'test-user',
      executionService: execService,
    });

    expect(capturedTrade).toBeDefined();
    expect(capturedTrade!.symbol).toBe('BTC/USDT');
    expect(capturedTrade!.direction).toBe(Direction.LONG);
    expect(capturedTrade!.orderType).toBe(OrderType.MARKET);
    expect(capturedTrade!.area).toBe(MarketArea.CRYPTO);
    expect(capturedTrade!.userId).toBe('test-user');
    expect(capturedTrade!.size).toBeGreaterThan(0);
    expect(capturedTrade!.currency).toBe('USDT');
    expect(capturedTrade!.metadata?.executionType).toBe('live');
  });

  it('should handle multiple pending trades', async () => {
    const executor = new StrategyExecutor(parsed, {
      mode: 'live',
      initialBankroll: 10000,
      maxOpenPositions: 10,
      area: MarketArea.CRYPTO,
    });

    const btcSnapshot = makeMatchingSnapshot(65000);
    const ethSnapshot: MarketSnapshot = {
      ...makeMatchingSnapshot(3500),
      marketId: 'ETH/USDT',
      name: 'Ethereum / USDT',
    };

    executor.evaluateMarkets([btcSnapshot, ethSnapshot]);

    const pending = executor.getPendingLiveTrades();
    expect(pending).toHaveLength(2);

    let executionCount = 0;
    const execService: LiveExecutionService = {
      execute: vi.fn().mockImplementation(async (trade: Trade) => {
        executionCount++;
        return {
          id: crypto.randomUUID(),
          tradeId: trade.id,
          externalOrderId: `order-${executionCount}`,
          status: 'filled',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }),
    };

    const results = await executor.executePendingLiveTrades({
      userId: 'test-user',
      executionService: execService,
    });

    expect(results).toHaveLength(2);
    expect(results.every(r => r.status === 'executed')).toBe(true);
    expect(execService.execute).toHaveBeenCalledTimes(2);
  });

  it('should log all execution steps', async () => {
    const executor = new StrategyExecutor(parsed, {
      mode: 'live',
      initialBankroll: 10000,
      area: MarketArea.CRYPTO,
    });

    executor.evaluateMarkets([makeMatchingSnapshot()]);
    await executor.executePendingLiveTrades({
      userId: 'test-user',
      executionService: createMockExecutionService(),
    });

    const logs = executor.getLogs();
    const liveExecLogs = logs.filter(l => l.message.includes('[LIVE-EXEC]'));

    // Should have: queued + executing N + order placed
    expect(liveExecLogs.length).toBeGreaterThanOrEqual(2);
    expect(logs.some(l => l.message.includes('accodato'))).toBe(true);
    expect(logs.some(l => l.message.includes('Ordine piazzato'))).toBe(true);
  });
});
