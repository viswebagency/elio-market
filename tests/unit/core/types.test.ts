/**
 * Core types tests — verify type exports and enum values.
 */

import { describe, it, expect } from 'vitest';
import {
  MarketArea,
  ExecutionMode,
  Direction,
  OrderType,
  BacktestLevel,
  DrawdownLevel,
  UserTier,
  KBLevel,
} from '@/core/types';

describe('MarketArea enum', () => {
  it('should have exactly 5 areas', () => {
    const areas = Object.values(MarketArea);
    expect(areas).toHaveLength(5);
  });

  it('should contain all expected areas', () => {
    expect(MarketArea.PREDICTION).toBe('prediction');
    expect(MarketArea.EXCHANGE_BETTING).toBe('exchange_betting');
    expect(MarketArea.STOCKS).toBe('stocks');
    expect(MarketArea.FOREX).toBe('forex');
    expect(MarketArea.CRYPTO).toBe('crypto');
  });
});

describe('ExecutionMode enum', () => {
  it('should have 3 modes', () => {
    expect(Object.values(ExecutionMode)).toHaveLength(3);
  });
});

describe('Direction enum', () => {
  it('should have long and short', () => {
    expect(Direction.LONG).toBe('long');
    expect(Direction.SHORT).toBe('short');
  });
});

describe('BacktestLevel enum', () => {
  it('should have 3 levels', () => {
    expect(BacktestLevel.L1_QUICK).toBe('L1');
    expect(BacktestLevel.L2_STANDARD).toBe('L2');
    expect(BacktestLevel.L3_DEEP).toBe('L3');
  });
});

describe('DrawdownLevel enum', () => {
  it('should have 4 levels', () => {
    expect(Object.values(DrawdownLevel)).toHaveLength(4);
    expect(DrawdownLevel.NORMAL).toBe('normal');
    expect(DrawdownLevel.EMERGENCY).toBe('emergency');
  });
});

describe('UserTier enum', () => {
  it('should have 3 tiers', () => {
    expect(UserTier.FREE).toBe('free');
    expect(UserTier.PRO).toBe('pro');
    expect(UserTier.ELITE).toBe('elite');
  });
});

describe('KBLevel enum', () => {
  it('should have 3 levels', () => {
    expect(KBLevel.L1_CACHE).toBe('L1');
    expect(KBLevel.L2_RAG).toBe('L2');
    expect(KBLevel.L3_FULL).toBe('L3');
  });
});
