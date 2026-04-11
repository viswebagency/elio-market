import { describe, it, expect } from 'vitest';
import { STOCK_STRATEGIES, STOCK_STRATEGY_MAP } from '@/core/strategies/stock-strategies';
import { parseStrategy, RawStrategyRow, validateParsedStrategy } from '@/core/engine/dsl-parser';

describe('Stock Strategies', () => {
  it('should have 6 strategies (3 conservative + 3 moderate)', () => {
    expect(STOCK_STRATEGIES).toHaveLength(6);
  });

  it('should have 3 conservative and 3 moderate', () => {
    const conservative = STOCK_STRATEGIES.filter((s) => s.risk_level === 'conservative');
    const moderate = STOCK_STRATEGIES.filter((s) => s.risk_level === 'moderate');
    expect(conservative).toHaveLength(3);
    expect(moderate).toHaveLength(3);
  });

  it('should have unique codes', () => {
    const codes = STOCK_STRATEGIES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('should all have area = stocks', () => {
    for (const s of STOCK_STRATEGIES) {
      expect(s.area).toBe('stocks');
    }
  });

  it('should all have stop loss in exit rules', () => {
    for (const s of STOCK_STRATEGIES) {
      const hasStopLoss = s.rules.exit_rules.some(
        (r) => r.params.loss_pct !== undefined && r.params.loss_pct < 0,
      );
      expect(hasStopLoss, `${s.code} manca stop loss`).toBe(true);
    }
  });

  it('should all have max_allocation_pct <= 5%', () => {
    for (const s of STOCK_STRATEGIES) {
      expect(s.max_allocation_pct).toBeLessThanOrEqual(5);
    }
  });

  it('should all have circuit breaker with negative loss_pct', () => {
    for (const s of STOCK_STRATEGIES) {
      expect(s.rules.circuit_breaker_total.loss_pct).toBeLessThan(0);
    }
  });

  it('should have tickers defined for each strategy', () => {
    for (const s of STOCK_STRATEGIES) {
      expect(s.tickers.length).toBeGreaterThan(0);
    }
  });

  it('should have tick_interval_minutes = 5', () => {
    for (const s of STOCK_STRATEGIES) {
      expect(s.tick_interval_minutes).toBe(5);
    }
  });

  it('should have bankroll tiers summing to 100%', () => {
    for (const s of STOCK_STRATEGIES) {
      const tiers = s.rules.bankroll_tiers;
      const sum = tiers.tier1.allocation_pct + tiers.tier2.allocation_pct + tiers.tier3.allocation_pct;
      expect(sum, `${s.code} tiers sum to ${sum}`).toBe(100);
    }
  });

  it('should have rules_readable for each strategy', () => {
    for (const s of STOCK_STRATEGIES) {
      expect(s.rules_readable.length).toBeGreaterThan(10);
      expect(s.rules_readable).toContain('QUANDO');
      expect(s.rules_readable).toContain('ESCI_SE');
    }
  });

  it('should build STOCK_STRATEGY_MAP correctly', () => {
    expect(Object.keys(STOCK_STRATEGY_MAP)).toHaveLength(STOCK_STRATEGIES.length);
    for (const s of STOCK_STRATEGIES) {
      expect(STOCK_STRATEGY_MAP[s.code]).toBe(s);
    }
  });

  describe('DSL parsing', () => {
    for (const seed of STOCK_STRATEGIES) {
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

      it(`should validate ${seed.code} successfully`, () => {
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
        expect(errors, `${seed.code} validation failed: ${errors.join(', ')}`).toHaveLength(0);
      });
    }
  });
});
