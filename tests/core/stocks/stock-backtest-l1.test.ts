/**
 * Stock Backtest L1 — Quick Scan su dati sintetici
 *
 * Valida tutte le 6 strategie stock su dati sintetici (90 tick, 7 ticker).
 * Criteri di passaggio L1:
 * - Almeno 1 trade eseguito
 * - ROI positivo
 * - Drawdown entro il limite della strategia
 */

import { describe, it, expect } from 'vitest';
import { STOCK_STRATEGIES } from '@/core/strategies/stock-strategies';
import { runStockL1, runStockFullPipeline, parseStockSeedToStrategy } from '@/core/backtest/stock-pipeline';

describe('Stock Backtest L1 — Quick Scan', () => {
  for (const seed of STOCK_STRATEGIES) {
    describe(`${seed.code}: ${seed.name}`, () => {
      const strategy = parseStockSeedToStrategy(seed);
      const result = runStockL1(strategy, seed);

      it('should execute trades', () => {
        expect(result.totalTrades).toBeGreaterThan(0);
      });

      it('should have valid metrics', () => {
        expect(result.metrics).toBeDefined();
        expect(result.metrics!.totalTrades).toBeGreaterThan(0);
        expect(typeof result.metrics!.winRate).toBe('number');
        expect(typeof result.metrics!.roiTotal).toBe('number');
        expect(typeof result.metrics!.maxDrawdownPct).toBe('number');
        expect(typeof result.metrics!.sharpeRatio).toBe('number');
      });

      it(`should report L1 pass/fail status`, () => {
        // Log results for analysis regardless of pass/fail
        console.log(
          `[L1] ${seed.code} ${seed.name}: ` +
          `${result.passed ? 'PASS' : 'FAIL'} | ` +
          `trades=${result.totalTrades} ` +
          `ROI=${result.metrics?.roiTotal?.toFixed(2)}% ` +
          `WR=${result.metrics?.winRate?.toFixed(1)}% ` +
          `DD=${result.metrics?.maxDrawdownPct?.toFixed(2)}% ` +
          `Sharpe=${result.metrics?.sharpeRatio?.toFixed(2)} ` +
          `PF=${result.metrics?.profitFactor?.toFixed(2)}` +
          (result.reason ? ` | reason: ${result.reason}` : ''),
        );
        // This test always passes — it's for reporting
        expect(result.level).toBe('L1');
      });
    });
  }

  it('should have at least 3 strategies passing L1', () => {
    const results = STOCK_STRATEGIES.map((seed) => {
      const strategy = parseStockSeedToStrategy(seed);
      return { code: seed.code, result: runStockL1(strategy, seed) };
    });

    const passed = results.filter((r) => r.result.passed);
    const failed = results.filter((r) => !r.result.passed);

    console.log('\n========================================');
    console.log(`STOCK L1 SUMMARY: ${passed.length}/${results.length} PASSED`);
    console.log('========================================');
    console.log('PASSED:', passed.map((r) => r.code).join(', ') || 'none');
    console.log('FAILED:', failed.map((r) => `${r.code} (${r.result.reason})`).join(', ') || 'none');
    console.log('========================================\n');

    // At least 3 strategies should pass L1 to proceed with paper trading
    expect(passed.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Stock Full Pipeline — Strategies that pass L1', () => {
  // Run full pipeline only on strategies that pass L1
  const l1Results = STOCK_STRATEGIES.map((seed) => {
    const strategy = parseStockSeedToStrategy(seed);
    return { seed, result: runStockL1(strategy, seed) };
  });

  const l1Passed = l1Results.filter((r) => r.result.passed);

  for (const { seed } of l1Passed) {
    it(`${seed.code} should run full pipeline without errors`, () => {
      const pipelineResult = runStockFullPipeline(seed);

      expect(pipelineResult.strategyCode).toBe(seed.code);
      expect(pipelineResult.l1).not.toBeNull();

      console.log(
        `[Pipeline] ${seed.code}: highest=${pipelineResult.highestLevel ?? 'NONE'} | ` +
        `L1=${pipelineResult.l1?.passed ? 'PASS' : 'FAIL'} ` +
        `L2=${pipelineResult.l2?.passed ? 'PASS' : pipelineResult.l2 ? 'FAIL' : '-'} ` +
        `L3=${pipelineResult.l3?.passed ? 'PASS' : pipelineResult.l3 ? 'FAIL' : '-'} ` +
        `L4=${pipelineResult.l4?.passed ? 'PASS' : pipelineResult.l4 ? 'FAIL' : '-'}`,
      );
    });
  }
});
