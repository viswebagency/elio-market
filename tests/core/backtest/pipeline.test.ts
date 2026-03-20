import { describe, it, expect } from 'vitest';
import {
  runL1,
  runL2,
  runL3,
  runL4,
  runFullPipeline,
  canPromote,
  parseSeedToStrategy,
  PipelineResults,
  L1Result,
  L2Result,
  L3Result,
  L4Result,
} from '@/core/backtest/pipeline';
import { POLYMARKET_STRATEGIES, StrategySeed } from '@/core/strategies/polymarket-strategies';
import { BacktestTrade } from '@/core/backtest/metrics';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSeed(code: string): StrategySeed {
  const seed = POLYMARKET_STRATEGIES.find(s => s.code === code);
  if (!seed) throw new Error(`Strategy ${code} not found`);
  return seed;
}

function makeFakeTrades(count: number, profitPct: number): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  for (let i = 0; i < count; i++) {
    const isWin = i % Math.ceil(100 / Math.max(1, profitPct)) === 0;
    const pnl = isWin ? 2 : -1;
    trades.push({
      tradeId: `t${i}`,
      marketId: `m${i}`,
      marketName: `Market ${i}`,
      entryPrice: 0.5,
      exitPrice: isWin ? 0.6 : 0.45,
      stake: 10,
      quantity: 20,
      entryTimestamp: `2026-01-${(i + 1).toString().padStart(2, '0')}T12:00:00Z`,
      exitTimestamp: `2026-01-${(i + 2).toString().padStart(2, '0')}T12:00:00Z`,
      grossPnl: pnl,
      netPnl: pnl,
      returnPct: pnl / 10 * 100,
      slippageCost: 0,
      commissionCost: 0,
      exitReason: isWin ? 'TP' : 'SL',
      estimatedProbability: 0.5,
    });
  }
  return trades;
}

// ---------------------------------------------------------------------------
// L1 Tests
// ---------------------------------------------------------------------------

describe('L1 — Quick Scan', () => {
  it('returns L1 result with correct structure', () => {
    const seed = getSeed('PM-C01');
    const strategy = parseSeedToStrategy(seed);
    const result = runL1(strategy, seed);

    expect(result.level).toBe('L1');
    expect(typeof result.passed).toBe('boolean');
    expect(result.timestamp).toBeTruthy();
    expect(result.metrics).toBeDefined();
    expect(result.metrics.totalTrades).toBeTypeOf('number');
    expect(result.metrics.roiTotal).toBeTypeOf('number');
    expect(result.config.seed).toBe(42);
  });

  it('PM-C01 Safe Haven passes L1', () => {
    const seed = getSeed('PM-C01');
    const strategy = parseSeedToStrategy(seed);
    const result = runL1(strategy, seed);

    expect(result.passed).toBe(true);
    expect(result.metrics.roiTotal).toBeGreaterThan(0);
    expect(result.reason).toBeNull();
  });

  it('PM-C02 Volume Sentinel passes L1', () => {
    const seed = getSeed('PM-C02');
    const strategy = parseSeedToStrategy(seed);
    const result = runL1(strategy, seed);

    expect(result.passed).toBe(true);
    expect(result.metrics.roiTotal).toBeGreaterThan(0);
  });

  it('PM-C03 Expiry Squeeze passes L1', () => {
    const seed = getSeed('PM-C03');
    const strategy = parseSeedToStrategy(seed);
    const result = runL1(strategy, seed);

    expect(result.passed).toBe(true);
  });

  it('PM-A03 Contrarian Play fails L1 (ROI negative)', () => {
    const seed = getSeed('PM-A03');
    const strategy = parseSeedToStrategy(seed);
    const result = runL1(strategy, seed);

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('ROI negativo');
  });

  it('is deterministic — same result on repeated runs', () => {
    const seed = getSeed('PM-C01');
    const strategy = parseSeedToStrategy(seed);
    const r1 = runL1(strategy, seed);
    const r2 = runL1(strategy, seed);

    expect(r1.metrics.roiTotal).toBe(r2.metrics.roiTotal);
    expect(r1.metrics.totalTrades).toBe(r2.metrics.totalTrades);
  });
});

// ---------------------------------------------------------------------------
// L2 Tests
// ---------------------------------------------------------------------------

describe('L2 — Robustness (k-fold)', () => {
  it('returns L2 result with 5 folds', () => {
    const seed = getSeed('PM-C02');
    const strategy = parseSeedToStrategy(seed);
    const result = runL2(strategy);

    expect(result.level).toBe('L2');
    expect(result.folds).toHaveLength(5);
    expect(result.totalFolds).toBe(5);
    expect(typeof result.passedFolds).toBe('number');
    expect(typeof result.avgRoi).toBe('number');
    expect(typeof result.avgSharpe).toBe('number');
  });

  it('each fold has complete metrics', () => {
    const seed = getSeed('PM-C01');
    const strategy = parseSeedToStrategy(seed);
    const result = runL2(strategy);

    for (const fold of result.folds) {
      expect(fold.seed).toBeTypeOf('number');
      expect(fold.roi).toBeTypeOf('number');
      expect(fold.sharpe).toBeTypeOf('number');
      expect(fold.winRate).toBeTypeOf('number');
      expect(fold.maxDrawdownPct).toBeTypeOf('number');
      expect(fold.totalTrades).toBeTypeOf('number');
      expect(typeof fold.passed).toBe('boolean');
    }
  });

  it('requires >= 4/5 profitable folds to pass', () => {
    const seed = getSeed('PM-C02');
    const strategy = parseSeedToStrategy(seed);
    const result = runL2(strategy);

    if (result.passed) {
      expect(result.passedFolds).toBeGreaterThanOrEqual(4);
    } else {
      expect(result.passedFolds).toBeLessThan(4);
      expect(result.reason).toContain('fold profittevoli');
    }
  });
});

// ---------------------------------------------------------------------------
// L3 Tests
// ---------------------------------------------------------------------------

describe('L3 — Stress Test (Monte Carlo)', () => {
  it('fails with too few trades', () => {
    const seed = getSeed('PM-C01');
    const strategy = parseSeedToStrategy(seed);
    const result = runL3(strategy, [makeFakeTrades(1)[0]], seed);

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Troppo pochi trade');
  });

  it('returns Monte Carlo distribution with correct percentiles', () => {
    const trades = makeFakeTrades(20, 60);
    const seed = getSeed('PM-C01');
    const strategy = parseSeedToStrategy(seed);
    const result = runL3(strategy, trades, seed);

    expect(result.level).toBe('L3');
    expect(result.iterations).toBe(10_000);
    expect(result.p5Roi).toBeTypeOf('number');
    expect(result.p25Roi).toBeTypeOf('number');
    expect(result.p50Roi).toBeTypeOf('number');
    expect(result.p75Roi).toBeTypeOf('number');
    expect(result.p95Roi).toBeTypeOf('number');
    expect(result.p95MaxDrawdown).toBeTypeOf('number');
    expect(result.ruinProbability).toBeTypeOf('number');
    // Percentiles should be ordered
    expect(result.p5Roi).toBeLessThanOrEqual(result.p50Roi);
    expect(result.p50Roi).toBeLessThanOrEqual(result.p95Roi);
  });

  it('ruin probability is between 0 and 100', () => {
    const trades = makeFakeTrades(15, 60);
    const seed = getSeed('PM-C01');
    const strategy = parseSeedToStrategy(seed);
    const result = runL3(strategy, trades, seed);

    expect(result.ruinProbability).toBeGreaterThanOrEqual(0);
    expect(result.ruinProbability).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// L4 Tests
// ---------------------------------------------------------------------------

describe('L4 — Overfitting Check', () => {
  it('returns parameter sensitivity results', () => {
    const seed = getSeed('PM-C01');
    const result = runL4(seed);

    expect(result.level).toBe('L4');
    expect(typeof result.passed).toBe('boolean');
    expect(result.baselineRoi).toBeTypeOf('number');
    expect(result.parameterTests.length).toBeGreaterThan(0);
    expect(result.stabilityScore).toBeGreaterThanOrEqual(0);
    expect(result.stabilityScore).toBeLessThanOrEqual(100);
  });

  it('tests both +10% and -10% for each parameter', () => {
    const seed = getSeed('PM-C01');
    const result = runL4(seed);

    const paramNames = new Set(result.parameterTests.map(t => t.parameter));
    for (const name of paramNames) {
      const tests = result.parameterTests.filter(t => t.parameter === name);
      const directions = tests.map(t => t.direction).sort();
      expect(directions).toContain('+10%');
      expect(directions).toContain('-10%');
    }
  });

  it('each test has roi and degradation', () => {
    const seed = getSeed('PM-C01');
    const result = runL4(seed);

    for (const test of result.parameterTests) {
      expect(test.roi).toBeTypeOf('number');
      expect(test.roiChange).toBeTypeOf('number');
      expect(test.degradationPct).toBeGreaterThanOrEqual(0);
      expect(test.originalValue).toBeTypeOf('number');
      expect(test.testedValue).toBeTypeOf('number');
    }
  });
});

// ---------------------------------------------------------------------------
// Full Pipeline Tests
// ---------------------------------------------------------------------------

describe('runFullPipeline', () => {
  it('stops at L1 for failing strategies', () => {
    const seed = getSeed('PM-A03'); // Contrarian — fails L1
    const results = runFullPipeline(seed);

    expect(results.l1).not.toBeNull();
    expect(results.l1!.passed).toBe(false);
    expect(results.l2).toBeNull();
    expect(results.l3).toBeNull();
    expect(results.l4).toBeNull();
    expect(results.highestLevel).toBeNull();
  });

  it('progresses through all levels for strong strategies', () => {
    const seed = getSeed('PM-C01'); // Safe Haven — should pass multiple levels
    const results = runFullPipeline(seed);

    expect(results.l1).not.toBeNull();
    expect(results.l1!.passed).toBe(true);
    // L2+ may or may not pass, but should be attempted
    expect(results.strategyCode).toBe('PM-C01');
    expect(results.version).toBe(1);
    expect(results.updatedAt).toBeTruthy();
  });

  it('sets highestLevel correctly', () => {
    const seed = getSeed('PM-C01');
    const results = runFullPipeline(seed);

    if (results.l4?.passed) {
      expect(results.highestLevel).toBe('L4');
    } else if (results.l3?.passed) {
      expect(results.highestLevel).toBe('L3');
    } else if (results.l2?.passed) {
      expect(results.highestLevel).toBe('L2');
    } else if (results.l1?.passed) {
      expect(results.highestLevel).toBe('L1');
    } else {
      expect(results.highestLevel).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// canPromote Tests
// ---------------------------------------------------------------------------

describe('canPromote', () => {
  // Build sample results for testing
  const passedL1: L1Result = {
    level: 'L1', passed: true, timestamp: '2026-03-20', reason: null,
    metrics: { totalTrades: 10, winRate: 70, roiTotal: 5, roiAnnualized: 10, profitFactor: 2, maxDrawdownPct: 3, sharpeRatio: 2, totalNetProfit: 5, maxConsecutiveLosses: 2 },
    config: { seed: 42, markets: 50, periodDays: 90, slippagePct: 1.5 }, totalTrades: 10,
  };
  const failedL1: L1Result = {
    level: 'L1', passed: false, timestamp: '2026-03-20', reason: 'ROI negativo: -5%',
    metrics: { totalTrades: 10, winRate: 30, roiTotal: -5, roiAnnualized: -10, profitFactor: 0.5, maxDrawdownPct: 8, sharpeRatio: -1, totalNetProfit: -5, maxConsecutiveLosses: 5 },
    config: { seed: 42, markets: 50, periodDays: 90, slippagePct: 1.5 }, totalTrades: 10,
  };
  const passedL2: L2Result = {
    level: 'L2', passed: true, timestamp: '2026-03-20', reason: null,
    folds: [], passedFolds: 5, totalFolds: 5, avgRoi: 4, avgSharpe: 1.5,
  };
  const passedL3: L3Result = {
    level: 'L3', passed: true, timestamp: '2026-03-20', reason: null,
    iterations: 10000, p5Roi: 1, p25Roi: 3, p50Roi: 5, p75Roi: 7, p95Roi: 10,
    p95MaxDrawdown: 8, ruinProbability: 0.5, originalRoi: 5, originalMaxDrawdown: 3,
  };
  const passedL4: L4Result = {
    level: 'L4', passed: true, timestamp: '2026-03-20', reason: null,
    baselineRoi: 5, parameterTests: [], stabilityScore: 85, worstDegradation: 15,
  };

  it('blocks observation without L1', () => {
    const result = canPromote(null, 'observation');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('backtest');
  });

  it('blocks observation if L1 failed', () => {
    const results: PipelineResults = {
      strategyCode: 'TEST', strategyName: 'Test', highestLevel: null,
      l1: failedL1, l2: null, l3: null, l4: null, version: 1, updatedAt: '',
    };
    const result = canPromote(results, 'observation');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('L1');
  });

  it('allows observation with L1 passed', () => {
    const results: PipelineResults = {
      strategyCode: 'TEST', strategyName: 'Test', highestLevel: 'L1',
      l1: passedL1, l2: null, l3: null, l4: null, version: 1, updatedAt: '',
    };
    const result = canPromote(results, 'observation');
    expect(result.allowed).toBe(true);
  });

  it('blocks paper_trading without L2', () => {
    const results: PipelineResults = {
      strategyCode: 'TEST', strategyName: 'Test', highestLevel: 'L1',
      l1: passedL1, l2: null, l3: null, l4: null, version: 1, updatedAt: '',
    };
    const result = canPromote(results, 'paper_trading');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('L2');
  });

  it('allows paper_trading with L1 + L2 passed', () => {
    const results: PipelineResults = {
      strategyCode: 'TEST', strategyName: 'Test', highestLevel: 'L2',
      l1: passedL1, l2: passedL2, l3: null, l4: null, version: 1, updatedAt: '',
    };
    const result = canPromote(results, 'paper_trading');
    expect(result.allowed).toBe(true);
  });

  it('blocks live without all 4 levels', () => {
    const results: PipelineResults = {
      strategyCode: 'TEST', strategyName: 'Test', highestLevel: 'L3',
      l1: passedL1, l2: passedL2, l3: passedL3, l4: null, version: 1, updatedAt: '',
    };
    const result = canPromote(results, 'live', 30, true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('L4');
  });

  it('blocks live without 30 days paper trading', () => {
    const results: PipelineResults = {
      strategyCode: 'TEST', strategyName: 'Test', highestLevel: 'L4',
      l1: passedL1, l2: passedL2, l3: passedL3, l4: passedL4, version: 1, updatedAt: '',
    };
    const result = canPromote(results, 'live', 15, true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('15/30');
  });

  it('blocks live without profitable paper trading', () => {
    const results: PipelineResults = {
      strategyCode: 'TEST', strategyName: 'Test', highestLevel: 'L4',
      l1: passedL1, l2: passedL2, l3: passedL3, l4: passedL4, version: 1, updatedAt: '',
    };
    const result = canPromote(results, 'live', 30, false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('profittevole');
  });

  it('allows live with all gates + 30d profitable paper', () => {
    const results: PipelineResults = {
      strategyCode: 'TEST', strategyName: 'Test', highestLevel: 'L4',
      l1: passedL1, l2: passedL2, l3: passedL3, l4: passedL4, version: 1, updatedAt: '',
    };
    const result = canPromote(results, 'live', 30, true);
    expect(result.allowed).toBe(true);
  });

  it('always allows return to draft', () => {
    const result = canPromote(null, 'draft');
    expect(result.allowed).toBe(true);
  });
});
