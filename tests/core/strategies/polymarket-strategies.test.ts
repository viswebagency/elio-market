/**
 * Test per le strategie Polymarket seed.
 * Verifica che tutte le strategie siano parsabili dal DSL parser
 * e superino la validazione.
 */

import { describe, it, expect } from 'vitest';
import { POLYMARKET_STRATEGIES } from '@/core/strategies/polymarket-strategies';
import { parseStrategy, validateParsedStrategy, RawStrategyRow } from '@/core/engine/dsl-parser';

describe('Polymarket Strategies Seed', () => {
  it('should have 19 strategies total (13 original + 6 v2)', () => {
    expect(POLYMARKET_STRATEGIES).toHaveLength(19);
  });

  it('should have 7 conservative, 9 moderate, 3 aggressive (including v2)', () => {
    const conservative = POLYMARKET_STRATEGIES.filter((s) => s.risk_level === 'conservative');
    const moderate = POLYMARKET_STRATEGIES.filter((s) => s.risk_level === 'moderate');
    const aggressive = POLYMARKET_STRATEGIES.filter((s) => s.risk_level === 'aggressive');

    expect(conservative).toHaveLength(7);
    expect(moderate).toHaveLength(9);
    expect(aggressive).toHaveLength(3);
  });

  it('should have unique codes', () => {
    const codes = POLYMARKET_STRATEGIES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('all strategies should be area polymarket', () => {
    for (const s of POLYMARKET_STRATEGIES) {
      expect(s.area).toBe('polymarket');
    }
  });

  describe('DSL parsing and validation', () => {
    for (const strategy of POLYMARKET_STRATEGIES) {
      it(`${strategy.code} (${strategy.name}) should parse and validate`, () => {
        const row: RawStrategyRow = {
          id: `test-${strategy.code}`,
          code: strategy.code,
          name: strategy.name,
          area: strategy.area,
          rules: strategy.rules,
          max_drawdown: strategy.max_drawdown,
          max_allocation_pct: strategy.max_allocation_pct,
          max_consecutive_losses: strategy.max_consecutive_losses,
        };

        const parsed = parseStrategy(row);

        expect(parsed.strategyId).toBe(`test-${strategy.code}`);
        expect(parsed.code).toBe(strategy.code);
        expect(parsed.entryRules.length).toBeGreaterThan(0);
        expect(parsed.exitRules.length).toBeGreaterThan(0);

        const errors = validateParsedStrategy(parsed);
        expect(errors).toEqual([]);
      });
    }
  });

  describe('Risk parameters consistency', () => {
    for (const strategy of POLYMARKET_STRATEGIES) {
      it(`${strategy.code} should have valid risk params`, () => {
        expect(strategy.max_drawdown).toBeGreaterThan(0);
        expect(strategy.max_drawdown).toBeLessThanOrEqual(30); // FILE_SACRO: max 30% globale
        expect(strategy.max_allocation_pct).toBeGreaterThan(0);
        expect(strategy.max_allocation_pct).toBeLessThanOrEqual(10); // FILE_SACRO: max 10%
        expect(strategy.max_consecutive_losses).toBeGreaterThan(0);
        expect(strategy.sizing_value).toBeGreaterThan(0);
        expect(strategy.sizing_value).toBeLessThanOrEqual(10);
      });
    }

    it('conservative strategies should have tighter stops than aggressive', () => {
      const conservativeMaxDD = Math.max(
        ...POLYMARKET_STRATEGIES.filter((s) => s.risk_level === 'conservative').map((s) => s.max_drawdown),
      );
      const aggressiveMinDD = Math.min(
        ...POLYMARKET_STRATEGIES.filter((s) => s.risk_level === 'aggressive').map((s) => s.max_drawdown),
      );

      expect(conservativeMaxDD).toBeLessThanOrEqual(aggressiveMinDD);
    });
  });
});
