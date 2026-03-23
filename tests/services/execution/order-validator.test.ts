/**
 * Tests for OrderValidator — risk limits enforcement.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderValidator, RiskContext } from '@/services/execution/order-validator';
import { Trade } from '@/core/types/trade';
import { BankrollState, DrawdownLevel } from '@/core/types/money-management';
import { MarketArea, Direction, OrderType } from '@/core/types/common';

// Mock audit logger
vi.mock('@/services/execution/audit-logger', () => ({
  auditLogger: {
    logKillSwitch: vi.fn().mockResolvedValue(undefined),
    logTradeIntent: vi.fn().mockResolvedValue(undefined),
    logExecution: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn().mockResolvedValue(undefined),
  },
}));

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'trade-1',
    strategyId: 'strat-1',
    userId: 'user-1',
    area: MarketArea.CRYPTO,
    symbol: 'BTC/USDT',
    direction: Direction.LONG,
    orderType: OrderType.MARKET,
    size: 0.01,
    currency: 'USDT',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeBankroll(overrides: Partial<BankrollState> = {}): BankrollState {
  return {
    userId: 'user-1',
    totalCapital: 10000,
    availableCapital: 8000,
    lockedCapital: 2000,
    todayPnl: 0,
    currentDrawdown: 0,
    currentDrawdownPercent: 0,
    peakCapital: 10000,
    currency: 'USDT',
    allocations: [],
    drawdownLevel: DrawdownLevel.NORMAL,
    isPaused: false,
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

function makeRiskContext(overrides: Partial<RiskContext> = {}): RiskContext {
  return {
    bankroll: makeBankroll(),
    todayRealizedLoss: 0,
    todayDrawdownPercent: 0,
    currentExposure: 2000,
    tradeValue: 500,
    ...overrides,
  };
}

describe('OrderValidator', () => {
  let validator: OrderValidator;

  beforeEach(() => {
    validator = new OrderValidator();
  });

  // --- Basic validation ---

  it('should pass basic validation for valid trade', async () => {
    const result = await validator.validate(makeTrade({ stopLoss: 55000 }));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject trade without symbol', async () => {
    const result = await validator.validate(makeTrade({ symbol: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Symbol is required');
  });

  it('should reject trade with zero size', async () => {
    const result = await validator.validate(makeTrade({ size: 0 }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Size must be positive');
  });

  it('should reject sizePercent exceeding MAX_SINGLE_TRADE_PERCENT', async () => {
    const result = await validator.validate(makeTrade({ sizePercent: 15 }));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('exceeds max 10%');
  });

  // --- MAX_SINGLE_TRADE ---

  it('should reject trade exceeding MAX_SINGLE_TRADE (10% of bankroll)', async () => {
    const ctx = makeRiskContext({ tradeValue: 1500 }); // 15% of 10000
    const result = await validator.validate(makeTrade(), ctx);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('15.0%') && e.includes('exceeds max 10%'))).toBe(true);
  });

  it('should allow trade within MAX_SINGLE_TRADE', async () => {
    const ctx = makeRiskContext({ tradeValue: 800 }); // 8% of 10000
    const result = await validator.validate(makeTrade({ stopLoss: 55000 }), ctx);
    expect(result.valid).toBe(true);
  });

  // --- DAILY_LOSS_LIMIT ---

  it('should block new trades when daily loss exceeds 5%', async () => {
    const ctx = makeRiskContext({
      todayRealizedLoss: 600, // 6% of 10000
      tradeValue: 500,
    });
    const result = await validator.validate(makeTrade(), ctx);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Daily loss') && e.includes('exceeds limit 5%'))).toBe(true);
  });

  it('should allow trades when daily loss is under 5%', async () => {
    const ctx = makeRiskContext({
      todayRealizedLoss: 300, // 3% of 10000
      tradeValue: 500,
    });
    const result = await validator.validate(makeTrade({ stopLoss: 55000 }), ctx);
    expect(result.valid).toBe(true);
  });

  // --- MAX_EXPOSURE ---

  it('should block trade when total exposure would exceed 80%', async () => {
    const ctx = makeRiskContext({
      currentExposure: 7500, // 75% already
      tradeValue: 1000,       // would be 85%
    });
    const result = await validator.validate(makeTrade(), ctx);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('exposure') && e.includes('exceed max 80%'))).toBe(true);
  });

  it('should allow trade when exposure stays within 80%', async () => {
    const ctx = makeRiskContext({
      currentExposure: 5000,
      tradeValue: 800, // 58% total
    });
    const result = await validator.validate(makeTrade({ stopLoss: 55000 }), ctx);
    expect(result.valid).toBe(true);
  });

  // --- Drawdown-based size reduction ---

  it('should reduce size by 50% when daily drawdown > 2%', async () => {
    const ctx = makeRiskContext({
      todayDrawdownPercent: 3,
      tradeValue: 500,
    });
    const trade = makeTrade({ size: 1.0, stopLoss: 55000 });
    const result = await validator.validate(trade, ctx);

    expect(result.valid).toBe(true);
    expect(result.adjustedSize).toBe(0.5);
    expect(result.warnings.some(w => w.includes('reduced by 50%'))).toBe(true);
  });

  it('should reduce size by 75% when daily drawdown > 4%', async () => {
    const ctx = makeRiskContext({
      todayDrawdownPercent: 4.5,
      tradeValue: 500,
    });
    const trade = makeTrade({ size: 1.0, stopLoss: 55000 });
    const result = await validator.validate(trade, ctx);

    expect(result.valid).toBe(true);
    expect(result.adjustedSize).toBe(0.25);
    expect(result.warnings.some(w => w.includes('reduced by 75%'))).toBe(true);
  });

  it('should not reduce size when drawdown <= 2%', async () => {
    const ctx = makeRiskContext({
      todayDrawdownPercent: 1.5,
      tradeValue: 500,
    });
    const result = await validator.validate(makeTrade({ stopLoss: 55000 }), ctx);

    expect(result.valid).toBe(true);
    expect(result.adjustedSize).toBeUndefined();
  });

  it('should not apply size reduction when daily loss already exceeds limit', async () => {
    const ctx = makeRiskContext({
      todayRealizedLoss: 600, // 6% - over limit
      todayDrawdownPercent: 4.5,
      tradeValue: 500,
    });
    const result = await validator.validate(makeTrade(), ctx);

    // Should be rejected (daily loss), NOT size-reduced
    expect(result.valid).toBe(false);
    expect(result.adjustedSize).toBeUndefined();
  });
});
