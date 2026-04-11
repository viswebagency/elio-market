import { describe, it, expect } from 'vitest';
import { BETFAIR_STRATEGIES, BETFAIR_STRATEGY_MAP } from '@/core/strategies/betfair-strategies';
import { parseStrategy, RawStrategyRow, validateParsedStrategy } from '@/core/engine/dsl-parser';

describe('Betfair Strategies', () => {
  it('should have 6 strategies (3 conservative + 3 moderate)', () => {
    expect(BETFAIR_STRATEGIES).toHaveLength(6);
  });

  it('should have 3 conservative and 3 moderate', () => {
    const conservative = BETFAIR_STRATEGIES.filter((s) => s.risk_level === 'conservative');
    const moderate = BETFAIR_STRATEGIES.filter((s) => s.risk_level === 'moderate');
    expect(conservative).toHaveLength(3);
    expect(moderate).toHaveLength(3);
  });

  it('should have unique codes', () => {
    const codes = BETFAIR_STRATEGIES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('should all have area = exchange_betting', () => {
    for (const s of BETFAIR_STRATEGIES) {
      expect(s.area).toBe('exchange_betting');
    }
  });

  it('should all have stop loss', () => {
    for (const s of BETFAIR_STRATEGIES) {
      const hasStopLoss = s.rules.exit_rules.some(
        (r) => r.params.loss_pct !== undefined && r.params.loss_pct < 0,
      );
      expect(hasStopLoss, `${s.code} manca stop loss`).toBe(true);
    }
  });

  it('should all have circuit breaker', () => {
    for (const s of BETFAIR_STRATEGIES) {
      expect(s.rules.circuit_breaker_total.loss_pct).toBeLessThan(0);
    }
  });

  it('should have event_types defined', () => {
    for (const s of BETFAIR_STRATEGIES) {
      expect(s.event_types.length).toBeGreaterThan(0);
    }
  });

  it('should have bankroll tiers summing to 100%', () => {
    for (const s of BETFAIR_STRATEGIES) {
      const tiers = s.rules.bankroll_tiers;
      const sum = tiers.tier1.allocation_pct + tiers.tier2.allocation_pct + tiers.tier3.allocation_pct;
      expect(sum, `${s.code} tiers sum to ${sum}`).toBe(100);
    }
  });

  it('should build BETFAIR_STRATEGY_MAP correctly', () => {
    expect(Object.keys(BETFAIR_STRATEGY_MAP)).toHaveLength(BETFAIR_STRATEGIES.length);
    for (const s of BETFAIR_STRATEGIES) {
      expect(BETFAIR_STRATEGY_MAP[s.code]).toBe(s);
    }
  });

  describe('DSL parsing', () => {
    for (const seed of BETFAIR_STRATEGIES) {
      it(`should parse ${seed.code} correctly`, () => {
        const row: RawStrategyRow = {
          id: seed.code, code: seed.code, name: seed.name, area: seed.area,
          max_drawdown: seed.max_drawdown, max_allocation_pct: seed.max_allocation_pct,
          max_consecutive_losses: seed.max_consecutive_losses, rules: seed.rules,
        };
        const parsed = parseStrategy(row);
        expect(parsed.code).toBe(seed.code);
        expect(parsed.entryRules.length).toBeGreaterThan(0);
        expect(parsed.exitRules.length).toBeGreaterThan(0);
      });

      it(`should validate ${seed.code} successfully`, () => {
        const row: RawStrategyRow = {
          id: seed.code, code: seed.code, name: seed.name, area: seed.area,
          max_drawdown: seed.max_drawdown, max_allocation_pct: seed.max_allocation_pct,
          max_consecutive_losses: seed.max_consecutive_losses, rules: seed.rules,
        };
        const parsed = parseStrategy(row);
        const errors = validateParsedStrategy(parsed);
        expect(errors, `${seed.code} validation failed: ${errors.join(', ')}`).toHaveLength(0);
      });
    }
  });
});
