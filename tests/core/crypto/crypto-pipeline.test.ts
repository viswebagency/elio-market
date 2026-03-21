import { describe, it, expect } from 'vitest';
import { CRYPTO_STRATEGIES } from '@/core/strategies/crypto-strategies';
import {
  runCryptoL1,
  runCryptoL2,
  runCryptoFullPipeline,
  parseCryptoSeedToStrategy,
} from '@/core/backtest/crypto-pipeline';

describe('Crypto Pipeline — L1 Quick Scan', () => {
  for (const seed of CRYPTO_STRATEGIES) {
    it(`should run L1 for ${seed.code} (${seed.name})`, () => {
      const strategy = parseCryptoSeedToStrategy(seed);
      const result = runCryptoL1(strategy, seed);

      expect(result.level).toBe('L1');
      expect(result.timestamp).toBeTruthy();
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.totalTrades).toBe('number');

      // Log results for visibility
      console.log(
        `  ${seed.code} L1: ${result.passed ? 'PASS' : 'FAIL'} | ` +
        `trades=${result.totalTrades} | ` +
        `ROI=${result.metrics.roiTotal.toFixed(2)}% | ` +
        `WR=${result.metrics.winRate.toFixed(1)}% | ` +
        `DD=${result.metrics.maxDrawdownPct.toFixed(2)}%` +
        (result.reason ? ` | reason: ${result.reason}` : ''),
      );
    });
  }
});

describe('Crypto Pipeline — L2 Robustness', () => {
  // Run L2 only for strategies that pass L1
  const l1PassingStrategies = CRYPTO_STRATEGIES.filter((seed) => {
    const strategy = parseCryptoSeedToStrategy(seed);
    const l1 = runCryptoL1(strategy, seed);
    return l1.passed;
  });

  if (l1PassingStrategies.length === 0) {
    it('no strategies pass L1 — L2 skipped', () => {
      expect(true).toBe(true);
    });
  }

  for (const seed of l1PassingStrategies) {
    it(`should run L2 for ${seed.code} (${seed.name})`, () => {
      const strategy = parseCryptoSeedToStrategy(seed);
      const result = runCryptoL2(strategy);

      expect(result.level).toBe('L2');
      expect(result.folds).toHaveLength(5);
      expect(result.totalFolds).toBe(5);

      console.log(
        `  ${seed.code} L2: ${result.passed ? 'PASS' : 'FAIL'} | ` +
        `folds=${result.passedFolds}/${result.totalFolds} | ` +
        `avgROI=${result.avgRoi.toFixed(2)}% | ` +
        `avgSharpe=${result.avgSharpe.toFixed(2)}` +
        (result.reason ? ` | reason: ${result.reason}` : ''),
      );
    });
  }
});

describe('Crypto Pipeline — Full Pipeline', () => {
  // Run full pipeline for first 2 strategies (speed)
  const testStrategies = CRYPTO_STRATEGIES.slice(0, 2);

  for (const seed of testStrategies) {
    it(`should run full pipeline for ${seed.code}`, () => {
      const result = runCryptoFullPipeline(seed);

      expect(result.strategyCode).toBe(seed.code);
      expect(result.strategyName).toBe(seed.name);
      expect(result.version).toBe(1);
      expect(result.l1).not.toBeNull();

      console.log(
        `  ${seed.code} Pipeline: highest=${result.highestLevel ?? 'NONE'} | ` +
        `L1=${result.l1?.passed ? 'PASS' : 'FAIL'} | ` +
        `L2=${result.l2?.passed ? 'PASS' : result.l2 ? 'FAIL' : 'N/A'} | ` +
        `L3=${result.l3?.passed ? 'PASS' : result.l3 ? 'FAIL' : 'N/A'} | ` +
        `L4=${result.l4?.passed ? 'PASS' : result.l4 ? 'FAIL' : 'N/A'}`,
      );
    });
  }
});
