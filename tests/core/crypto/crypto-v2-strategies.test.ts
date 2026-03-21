/**
 * Test: Crypto V2 strategies (fixed L1 failures) pass pipeline + regression check on CR-C01.
 */

import { describe, it, expect } from 'vitest';
import { CRYPTO_STRATEGIES, CRYPTO_STRATEGY_MAP } from '@/core/strategies/crypto-strategies';
import {
  runCryptoL1,
  runCryptoL2,
  runCryptoFullPipeline,
  parseCryptoSeedToStrategy,
} from '@/core/backtest/crypto-pipeline';
import { PipelineResults } from '@/core/backtest/pipeline';

function logResults(code: string, r: PipelineResults) {
  console.log(
    `[${code}] ${r.strategyName} — highest: ${r.highestLevel ?? 'NONE'} | ` +
    `L1:${r.l1?.passed ? 'PASS' : 'FAIL'} L2:${r.l2?.passed ?? '-'} L3:${r.l3?.passed ?? '-'} L4:${r.l4?.passed ?? '-'}` +
    (r.l1?.metrics ? ` | ROI=${r.l1.metrics.roiTotal.toFixed(2)}% DD=${r.l1.metrics.maxDrawdownPct.toFixed(2)}% trades=${r.l1.metrics.totalTrades}` : ''),
  );
}

// ---------------------------------------------------------------------------
// V2 strategies — must pass L1
// ---------------------------------------------------------------------------

const V2_CODES = ['CR-C02b', 'CR-M01b', 'CR-M02b', 'CR-M03b'];

describe('Crypto V2 strategies pass L1', () => {
  for (const code of V2_CODES) {
    it(`${code} passes L1 (ROI > 0)`, () => {
      const seed = CRYPTO_STRATEGY_MAP[code];
      expect(seed, `Strategy ${code} not found in CRYPTO_STRATEGIES`).toBeDefined();

      const strategy = parseCryptoSeedToStrategy(seed);
      const l1 = runCryptoL1(strategy, seed);

      console.log(
        `  ${code} L1: ${l1.passed ? 'PASS' : 'FAIL'} | ` +
        `trades=${l1.totalTrades} | ROI=${l1.metrics.roiTotal.toFixed(2)}% | ` +
        `WR=${l1.metrics.winRate.toFixed(1)}% | DD=${l1.metrics.maxDrawdownPct.toFixed(2)}%` +
        (l1.reason ? ` | reason: ${l1.reason}` : ''),
      );

      expect(l1.passed).toBe(true);
      expect(l1.metrics.roiTotal).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// V2 strategy with L2 pass — CR-M02b
// ---------------------------------------------------------------------------

describe('Crypto V2 L2 — CR-M02b passes', () => {
  it('CR-M02b passes L2 (3/5 folds profitable)', () => {
    const seed = CRYPTO_STRATEGY_MAP['CR-M02b'];
    const strategy = parseCryptoSeedToStrategy(seed);
    const l2 = runCryptoL2(strategy);

    console.log(
      `  CR-M02b L2: ${l2.passed ? 'PASS' : 'FAIL'} | ` +
      `folds=${l2.passedFolds}/${l2.totalFolds} | ` +
      `avgROI=${l2.avgRoi.toFixed(2)}% | avgSharpe=${l2.avgSharpe.toFixed(2)}`,
    );

    expect(l2.passed).toBe(true);
    expect(l2.passedFolds).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// V2 strategies — structural validation
// ---------------------------------------------------------------------------

describe('Crypto V2 strategies — structure', () => {
  const v2Strategies = CRYPTO_STRATEGIES.filter((s) => s.code.endsWith('b'));

  it('should have 5 v2 strategies (C02b, C03b, M01b, M02b, M03b)', () => {
    const v2Codes = v2Strategies.map((s) => s.code).sort();
    expect(v2Codes).toEqual(['CR-C02b', 'CR-C03b', 'CR-M01b', 'CR-M02b', 'CR-M03b']);
  });

  it('all v2 strategies should have area = crypto', () => {
    for (const s of v2Strategies) {
      expect(s.area).toBe('crypto');
    }
  });

  it('all v2 strategies should have stop loss', () => {
    for (const s of v2Strategies) {
      const hasSL = s.rules.exit_rules.some((r) => r.params.loss_pct !== undefined && r.params.loss_pct < 0);
      expect(hasSL, `${s.code} manca stop loss`).toBe(true);
    }
  });

  it('all v2 strategies should have circuit breaker', () => {
    for (const s of v2Strategies) {
      expect(s.rules.circuit_breaker_total.loss_pct).toBeLessThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Regression — original CR-C01 unchanged
// ---------------------------------------------------------------------------

describe('Regression: CR-C01 still passes L1', () => {
  it('CR-C01 still passes L1', () => {
    const seed = CRYPTO_STRATEGY_MAP['CR-C01'];
    const results = runCryptoFullPipeline(seed);
    logResults('CR-C01', results);
    expect(results.l1?.passed).toBe(true);
  });
});
