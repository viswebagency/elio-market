import { describe, it, expect } from 'vitest';
import { CRYPTO_STRATEGIES, CRYPTO_STRATEGY_MAP } from '@/core/strategies/crypto-strategies';
import { parseStrategy, RawStrategyRow, validateParsedStrategy } from '@/core/engine/dsl-parser';

describe('Crypto Strategies', () => {
  it('should have 13 strategies (6 original + 5 v2 + 2 v3)', () => {
    expect(CRYPTO_STRATEGIES).toHaveLength(13);
  });

  it('should have 6 conservative and 7 moderate (including v2 + v3)', () => {
    const conservative = CRYPTO_STRATEGIES.filter((s) => s.risk_level === 'conservative');
    const moderate = CRYPTO_STRATEGIES.filter((s) => s.risk_level === 'moderate');
    expect(conservative).toHaveLength(6); // C01, C02, C03, C02b, C03b, C01c
    expect(moderate).toHaveLength(7); // M01, M02, M03, M01b, M02b, M03b, M02c
  });

  it('should have unique codes', () => {
    const codes = CRYPTO_STRATEGIES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('should all have area = crypto', () => {
    for (const s of CRYPTO_STRATEGIES) {
      expect(s.area).toBe('crypto');
    }
  });

  it('should all have stop loss in exit rules', () => {
    for (const s of CRYPTO_STRATEGIES) {
      const hasStopLoss = s.rules.exit_rules.some(
        (r) => r.params.loss_pct !== undefined && r.params.loss_pct < 0,
      );
      expect(hasStopLoss, `${s.code} manca stop loss`).toBe(true);
    }
  });

  it('should all have max_allocation_pct <= 5%', () => {
    for (const s of CRYPTO_STRATEGIES) {
      expect(s.max_allocation_pct).toBeLessThanOrEqual(5);
    }
  });

  it('should all have circuit breaker with negative loss_pct', () => {
    for (const s of CRYPTO_STRATEGIES) {
      expect(s.rules.circuit_breaker_total.loss_pct).toBeLessThan(0);
    }
  });

  it('should have pairs defined for each strategy', () => {
    for (const s of CRYPTO_STRATEGIES) {
      expect(s.pairs.length).toBeGreaterThan(0);
      for (const pair of s.pairs) {
        expect(pair).toMatch(/^[A-Z]+\/USDT$/);
      }
    }
  });

  it('should have tick_interval_minutes between 1 and 5', () => {
    for (const s of CRYPTO_STRATEGIES) {
      expect(s.tick_interval_minutes).toBeGreaterThanOrEqual(1);
      expect(s.tick_interval_minutes).toBeLessThanOrEqual(5);
    }
  });

  describe('DSL parsing', () => {
    for (const seed of CRYPTO_STRATEGIES) {
      it(`should parse ${seed.code} correctly`, () => {
        const row: RawStrategyRow = {
          id: seed.code,
          code: seed.code,
          name: seed.name,
          area: seed.area,
          max_drawdown: seed.max_drawdown,
          max_allocation_pct: seed.max_allocation_pct,
          max_consecutive_losses: seed.max_consecutive_losses,
          rules: seed.rules,
        };

        const parsed = parseStrategy(row);
        expect(parsed.code).toBe(seed.code);
        expect(parsed.entryRules.length).toBeGreaterThan(0);
        expect(parsed.exitRules.length).toBeGreaterThan(0);
      });

      it(`should validate ${seed.code} with no errors`, () => {
        const row: RawStrategyRow = {
          id: seed.code,
          code: seed.code,
          name: seed.name,
          area: seed.area,
          max_drawdown: seed.max_drawdown,
          max_allocation_pct: seed.max_allocation_pct,
          max_consecutive_losses: seed.max_consecutive_losses,
          rules: seed.rules,
        };

        const parsed = parseStrategy(row);
        const errors = validateParsedStrategy(parsed);
        expect(errors, `${seed.code} validation errors: ${errors.join(', ')}`).toHaveLength(0);
      });
    }
  });

  describe('Strategy map', () => {
    it('should look up strategies by code', () => {
      expect(CRYPTO_STRATEGY_MAP['CR-C01']).toBeDefined();
      expect(CRYPTO_STRATEGY_MAP['CR-C01'].name).toBe('Mean Reversion Range');
      expect(CRYPTO_STRATEGY_MAP['CR-M03']).toBeDefined();
      expect(CRYPTO_STRATEGY_MAP['CR-M03'].name).toBe('Volatility Breakout');
    });
  });
});
