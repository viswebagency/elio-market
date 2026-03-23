import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrategyExecutor } from '@/core/engine/executor';
import { parseStrategy, StrategyRulesJson } from '@/core/engine/dsl-parser';
import { MarketSnapshot } from '@/core/engine/evaluator';
import { SignalType } from '@/core/engine/signals';
import { MarketArea } from '@/core/types/common';
import type { TradeExecution } from '@/core/types/trade';
import type { LiveExecutionService, GetOrderStatusFn } from '@/core/engine/executor';
import type { ReconciliationResult } from '@/services/reconciliation/order-reconciliation';

const CRYPTO_RULES: StrategyRulesJson = {
  entry_rules: [
    { id: 'price_range', condition: '', description: '', params: { min_price: 0.05, max_price: 0.45 } },
    { id: 'volume_min', condition: '', description: '', params: { min_volume_usd: 100000 } },
    { id: 'expiry_window', condition: '', description: '', params: { max_days_to_expiry: 30 } },
    { id: 'catalyst', condition: '', description: '', params: { requires_catalyst: true } },
  ],
  exit_rules: [
    { id: 'stop_loss', condition: '', description: '', params: { loss_pct: -30, sell_fraction: 1.0 } },
  ],
  bankroll_tiers: {
    tier1: { allocation_pct: 50, description: '' },
    tier2: { allocation_pct: 30, description: '' },
    tier3: { allocation_pct: 20, description: '' },
  },
  liquidity_reserve_pct: 20,
  circuit_breaker_total: { loss_pct: -50, action: '', description: '' },
};

const STRATEGY_ROW = {
  id: 'strat-crypto-001',
  code: 'CR-001',
  name: 'Crypto Test Strategy',
  area: 'crypto',
  rules: CRYPTO_RULES,
  max_drawdown: 50,
  max_allocation_pct: 10,
  max_consecutive_losses: 5,
};

function makeMarket(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  const in15Days = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
  return {
    marketId: 'BTC/USDT',
    name: 'Bitcoin',
    price: 0.25,
    volume24hUsd: 500000,
    totalVolumeUsd: 5000000,
    expiryDate: in15Days.toISOString(),
    hasCatalyst: true,
    catalystDescription: 'Halving imminente',
    category: 'crypto',
    status: 'open',
    ...overrides,
  };
}

function makeMockExecution(tradeId: string): TradeExecution {
  return {
    id: 'exec-001',
    tradeId,
    externalOrderId: 'binance-order-123',
    status: 'filled',
    fillPrice: 65000,
    filledSize: 0.1,
    commission: 0.65,
    executedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeMockReconciliation(orderId: string): ReconciliationResult {
  return {
    orderId,
    status: 'filled',
    expectedPrice: 0.25,
    actualPrice: 65000,
    slippage: 0.1,
    fees: 0.65,
    fillTime: 1500,
    partialFill: false,
    filledAmount: 0.1,
  };
}

describe('StrategyExecutor — Live Mode', () => {
  let executor: StrategyExecutor;
  let mockExecutionService: LiveExecutionService;

  beforeEach(() => {
    const strategy = parseStrategy(STRATEGY_ROW);
    executor = new StrategyExecutor(strategy, {
      mode: 'live',
      initialBankroll: 10000,
      slippagePct: 0,
      area: MarketArea.CRYPTO,
      userId: 'user-001',
    });

    mockExecutionService = {
      execute: vi.fn().mockImplementation(async (trade) => makeMockExecution(trade.id)),
    };
  });

  it('should queue signals for live execution during evaluateMarkets', () => {
    const market = makeMarket();
    executor.evaluateMarkets([market]);

    const pending = executor.getPendingLiveTrades();
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending[0].signal.type).toBe(SignalType.ENTER_LONG);
    expect(pending[0].market.marketId).toBe('BTC/USDT');

    // Portfolio should NOT have positions (not paper mode)
    const snap = executor.getPortfolioSnapshot();
    expect(snap.openPositions).toHaveLength(0);
  });

  it('should log [LIVE-EXEC] when signal is queued', () => {
    executor.evaluateMarkets([makeMarket()]);
    const logs = executor.getLogs();
    const liveLog = logs.find((l) => l.message.includes('[LIVE-EXEC]'));
    expect(liveLog).toBeDefined();
    expect(liveLog!.message).toContain('Segnale accodato');
  });

  it('should execute pending live trades through ExecutionService', async () => {
    executor.evaluateMarkets([makeMarket()]);

    const results = await executor.executePendingLiveTrades({
      userId: 'user-001',
      executionService: mockExecutionService,
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('executed');
    expect(results[0].orderId).toBe('binance-order-123');
    expect(results[0].execution).toBeDefined();
    expect(results[0].execution!.status).toBe('filled');

    // Pending queue should be empty after execution
    expect(executor.getPendingLiveTrades()).toHaveLength(0);
  });

  it('should build Trade with correct fields from signal', async () => {
    executor.evaluateMarkets([makeMarket()]);

    await executor.executePendingLiveTrades({
      userId: 'user-001',
      executionService: mockExecutionService,
    });

    const executeFn = mockExecutionService.execute as ReturnType<typeof vi.fn>;
    const trade = executeFn.mock.calls[0][0];

    expect(trade.userId).toBe('user-001');
    expect(trade.strategyId).toBe('strat-crypto-001');
    expect(trade.area).toBe(MarketArea.CRYPTO);
    expect(trade.symbol).toBe('BTC/USDT');
    expect(trade.direction).toBe('long');
    expect(trade.orderType).toBe('market');
    expect(trade.size).toBeGreaterThan(0);
    expect(trade.currency).toBe('USDT');
    expect(trade.metadata?.executionType).toBe('live');
  });

  it('should handle kill switch blocking execution', async () => {
    const blockedService: LiveExecutionService = {
      execute: vi.fn().mockRejectedValue(new Error('Kill switch is active. All trading is halted.')),
    };

    executor.evaluateMarkets([makeMarket()]);

    const results = await executor.executePendingLiveTrades({
      userId: 'user-001',
      executionService: blockedService,
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('blocked');
    expect(results[0].reason).toContain('Kill switch');
    expect(results[0].orderId).toBe('');
  });

  it('should handle execution failure gracefully', async () => {
    const failingService: LiveExecutionService = {
      execute: vi.fn().mockRejectedValue(new Error('Insufficient balance')),
    };

    executor.evaluateMarkets([makeMarket()]);

    const results = await executor.executePendingLiveTrades({
      userId: 'user-001',
      executionService: failingService,
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('failed');
    expect(results[0].reason).toContain('Insufficient balance');
  });

  it('should return empty results when no pending trades', async () => {
    const results = await executor.executePendingLiveTrades({
      userId: 'user-001',
      executionService: mockExecutionService,
    });

    expect(results).toHaveLength(0);
  });

  it('should execute with reconciliation when getOrderStatus is provided', async () => {
    const mockGetOrderStatus: GetOrderStatusFn = vi.fn().mockResolvedValue({
      orderId: 'binance-order-123',
      status: 'closed',
      filledAmount: 0.1,
      remainingAmount: 0,
      avgFillPrice: 65000,
      fees: 0.65,
    });

    const mockReconcile = vi.fn().mockResolvedValue(makeMockReconciliation('binance-order-123'));

    executor.evaluateMarkets([makeMarket()]);

    const results = await executor.executePendingLiveTrades({
      userId: 'user-001',
      executionService: mockExecutionService,
      getOrderStatus: mockGetOrderStatus,
      reconcileAndUpdateFn: mockReconcile,
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('executed');
    expect(results[0].reconciliation).toBeDefined();
    expect(results[0].reconciliation!.status).toBe('filled');
    expect(mockReconcile).toHaveBeenCalledWith(
      mockGetOrderStatus,
      'binance-order-123',
      'BTC/USDT',
      expect.any(Number),
      expect.any(String),
    );
  });

  it('should handle reconciliation failure without breaking execution result', async () => {
    const mockReconcile = vi.fn().mockRejectedValue(new Error('Reconciliation timeout'));

    executor.evaluateMarkets([makeMarket()]);

    const results = await executor.executePendingLiveTrades({
      userId: 'user-001',
      executionService: mockExecutionService,
      getOrderStatus: vi.fn(),
      reconcileAndUpdateFn: mockReconcile,
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('executed');
    expect(results[0].reconciliation).toBeUndefined();

    const logs = executor.getLogs();
    const reconciliationLog = logs.find((l) => l.message.includes('[RECONCILIATION] Fallita'));
    expect(reconciliationLog).toBeDefined();
  });

  it('should handle multiple pending live trades', async () => {
    const markets = [
      makeMarket({ marketId: 'BTC/USDT', name: 'Bitcoin' }),
      makeMarket({ marketId: 'ETH/USDT', name: 'Ethereum' }),
    ];

    executor.evaluateMarkets(markets);

    const pending = executor.getPendingLiveTrades();
    expect(pending.length).toBeGreaterThanOrEqual(2);

    const results = await executor.executePendingLiveTrades({
      userId: 'user-001',
      executionService: mockExecutionService,
    });

    expect(results.length).toBeGreaterThanOrEqual(2);
    results.forEach((r) => {
      expect(r.status).toBe('executed');
    });
  });

  it('should not execute in observation mode', () => {
    const strategy = parseStrategy(STRATEGY_ROW);
    const obsExecutor = new StrategyExecutor(strategy, {
      mode: 'observation',
      initialBankroll: 10000,
      area: MarketArea.CRYPTO,
    });

    obsExecutor.evaluateMarkets([makeMarket()]);

    expect(obsExecutor.getPendingLiveTrades()).toHaveLength(0);
    expect(obsExecutor.getPortfolioSnapshot().openPositions).toHaveLength(0);
  });
});
