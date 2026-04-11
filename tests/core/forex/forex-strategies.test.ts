/**
 * Forex Strategies — Validation Tests
 *
 * Validates that all 6 forex strategy seeds have correct structure
 * and reasonable parameters.
 */

import { describe, it, expect } from 'vitest';
import { FOREX_STRATEGIES, FOREX_STRATEGY_MAP, ForexStrategySeed } from '@/core/strategies/forex-strategies';

describe('Forex Strategies — Seed Validation', () => {
  it('should have exactly 6 strategies', () => {
    expect(FOREX_STRATEGIES).toHaveLength(6);
  });

  it('should have 3 conservative and 3 moderate strategies', () => {
    const conservative = FOREX_STRATEGIES.filter((s) => s.risk_level === 'conservative');
    const moderate = FOREX_STRATEGIES.filter((s) => s.risk_level === 'moderate');
    expect(conservative).toHaveLength(3);
    expect(moderate).toHaveLength(3);
  });

  it('should have unique codes', () => {
    const codes = FOREX_STRATEGIES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('should have all strategies in FOREX_STRATEGY_MAP', () => {
    for (const strategy of FOREX_STRATEGIES) {
      expect(FOREX_STRATEGY_MAP[strategy.code]).toBeDefined();
      expect(FOREX_STRATEGY_MAP[strategy.code].code).toBe(strategy.code);
    }
  });

  for (const seed of FOREX_STRATEGIES) {
    describe(`${seed.code}: ${seed.name}`, () => {
      it('should have area = forex', () => {
        expect(seed.area).toBe('forex');
      });

      it('should have FX- prefix in code', () => {
        expect(seed.code).toMatch(/^FX-/);
      });

      it('should have at least 1 entry rule', () => {
        expect(seed.rules.entry_rules.length).toBeGreaterThanOrEqual(1);
      });

      it('should have at least 1 exit rule', () => {
        expect(seed.rules.exit_rules.length).toBeGreaterThanOrEqual(1);
      });

      it('should have take profit and stop loss', () => {
        const hasTP = seed.rules.exit_rules.some((r) => r.condition === 'take_profit');
        const hasSL = seed.rules.exit_rules.some((r) => r.condition === 'stop_loss');
        expect(hasTP).toBe(true);
        expect(hasSL).toBe(true);
      });

      it('should have reasonable TP/SL ratio (>= 1.0)', () => {
        const tp = seed.rules.exit_rules.find((r) => r.condition === 'take_profit');
        const sl = seed.rules.exit_rules.find((r) => r.condition === 'stop_loss');
        if (tp && sl) {
          const ratio = tp.params.profit_pct / Math.abs(sl.params.loss_pct);
          expect(ratio).toBeGreaterThanOrEqual(1.0);
        }
      });

      it('should have bankroll tiers summing to ~100%', () => {
        const tiers = seed.rules.bankroll_tiers;
        const total = tiers.tier1.allocation_pct + tiers.tier2.allocation_pct + tiers.tier3.allocation_pct;
        expect(total).toBe(100);
      });

      it('should have liquidity reserve >= 20%', () => {
        expect(seed.rules.liquidity_reserve_pct).toBeGreaterThanOrEqual(20);
      });

      it('should have circuit breaker', () => {
        expect(seed.rules.circuit_breaker_total).toBeDefined();
        expect(seed.rules.circuit_breaker_total.loss_pct).toBeLessThan(0);
      });

      it('should have max_drawdown > 0', () => {
        expect(seed.max_drawdown).toBeGreaterThan(0);
      });

      it('should have max_allocation_pct between 2% and 6%', () => {
        expect(seed.max_allocation_pct).toBeGreaterThanOrEqual(2);
        expect(seed.max_allocation_pct).toBeLessThanOrEqual(6);
      });

      it('should have sizing_value between 1% and 5%', () => {
        expect(seed.sizing_value).toBeGreaterThanOrEqual(1);
        expect(seed.sizing_value).toBeLessThanOrEqual(5);
      });

      it('should have at least 4 pairs', () => {
        expect(seed.pairs.length).toBeGreaterThanOrEqual(4);
      });

      it('should have tick_interval_minutes = 5', () => {
        expect(seed.tick_interval_minutes).toBe(5);
      });

      it('should have valid forex pair names', () => {
        for (const pair of seed.pairs) {
          expect(pair).toMatch(/^[A-Z]{6}$/);
        }
      });

      it('should have rules_readable', () => {
        expect(seed.rules_readable).toBeTruthy();
        expect(seed.rules_readable.length).toBeGreaterThan(10);
      });
    });
  }
});
