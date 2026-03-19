/**
 * Constants tests — verify configuration values.
 */

import { describe, it, expect } from 'vitest';
import { MARKET_AREAS, MARKET_AREAS_LIST } from '@/core/constants/market-areas';
import { DEFAULT_DRAWDOWN_THRESHOLDS, SIZE_REDUCTION } from '@/core/constants/risk-limits';
import { TIERS } from '@/core/constants/tiers';
import { MarketArea } from '@/core/types';
import { DrawdownLevel } from '@/core/types/money-management';

describe('Market areas config', () => {
  it('should have 5 areas', () => {
    expect(MARKET_AREAS_LIST).toHaveLength(5);
    expect(Object.keys(MARKET_AREAS)).toHaveLength(5);
  });

  it('every area should have required fields', () => {
    MARKET_AREAS_LIST.forEach((area) => {
      expect(area.id).toBeTruthy();
      expect(area.name).toBeTruthy();
      expect(area.nameIt).toBeTruthy();
      expect(area.color).toMatch(/^#/);
    });
  });
});

describe('Drawdown thresholds', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_DRAWDOWN_THRESHOLDS.warningPercent).toBe(20);
    expect(DEFAULT_DRAWDOWN_THRESHOLDS.criticalPercent).toBe(25);
    expect(DEFAULT_DRAWDOWN_THRESHOLDS.emergencyPercent).toBe(30);
  });

  it('emergency should halt trading (0% sizing)', () => {
    expect(SIZE_REDUCTION[DrawdownLevel.EMERGENCY]).toBe(0);
  });

  it('normal should be 100% sizing', () => {
    expect(SIZE_REDUCTION[DrawdownLevel.NORMAL]).toBe(1);
  });
});

describe('Tier config', () => {
  it('should have 3 tiers', () => {
    expect(Object.keys(TIERS)).toHaveLength(3);
  });

  it('free tier should cost 0', () => {
    expect(TIERS.free.priceMonthlyEur).toBe(0);
  });

  it('elite should have all 5 areas', () => {
    expect(TIERS.elite.limits.maxAreas).toBe(5);
  });

  it('elite should have L3 backtest', () => {
    expect(TIERS.elite.limits.maxBacktestLevel).toBe('L3');
  });
});
