/**
 * Crypto Backtest Pipeline — L1 through L4
 *
 * Adapted from the Polymarket pipeline for crypto:
 * - Uses crypto synthetic data (higher volatility)
 * - Supports CryptoStrategySeed format
 * - Tick-level backtest with price_change_pct and volatility_range conditions
 */

import { ParsedStrategy, parseStrategy, RawStrategyRow } from '../engine/dsl-parser';
import { runBacktestWithData, BacktestReport } from './runner';
import { generateCryptoSyntheticMarkets, CryptoSyntheticConfig } from './crypto-synthetic-data';
import { BacktestTrade, BacktestMetrics } from './metrics';
import { HistoricalMarketData } from './engine';
import { CryptoStrategySeed } from '../strategies/crypto-strategies';
import {
  L1Result, L2Result, L3Result, L4Result,
  BacktestMetricsSummary, PipelineResults, BacktestLevel,
} from './pipeline';

// ---------------------------------------------------------------------------
// Pipeline config — crypto-specific (higher vol, more markets)
// ---------------------------------------------------------------------------

const CRYPTO_PIPELINE_CONFIG = {
  l1: { seed: 42, numPairs: 8, ticksPerPair: 90, slippagePct: 0.1, initialCapital: 1000, baseVolatility: 0.03 },
  l2: { seeds: [42, 137, 256, 512, 1024], numPairs: 8, ticksPerPair: 90, minPassFolds: 3 },
  l3: { iterations: 10_000, ruinThresholdPct: 5, p95MaxDrawdownLimit: 40 },
  l4: { variationPct: 10, maxRoiDegradationPct: 50 },
};

// ---------------------------------------------------------------------------
// L1 — Quick Scan (crypto)
// ---------------------------------------------------------------------------

export function runCryptoL1(strategy: ParsedStrategy, seed?: CryptoStrategySeed): L1Result {
  const cfg = CRYPTO_PIPELINE_CONFIG.l1;
  const data = generateCryptoSyntheticMarkets({
    numPairs: cfg.numPairs,
    ticksPerPair: cfg.ticksPerPair,
    seed: cfg.seed,
    baseVolatility: cfg.baseVolatility,
  });

  const report = runBacktestWithData(strategy, data, {
    initialCapital: cfg.initialCapital,
    slippagePct: cfg.slippagePct,
    periodDays: cfg.ticksPerPair,
  });

  const m = report.metrics;
  let passed = true;
  let reason: string | null = null;

  if (m.totalTrades === 0) {
    passed = false;
    reason = 'No trades executed';
  } else if (m.roiTotal <= 0) {
    passed = false;
    reason = `ROI negativo: ${m.roiTotal.toFixed(2)}%`;
  } else if (seed && m.maxDrawdownPct > seed.max_drawdown) {
    passed = false;
    reason = `Drawdown ${m.maxDrawdownPct.toFixed(2)}% > limite ${seed.max_drawdown}%`;
  }

  return {
    level: 'L1',
    passed,
    timestamp: new Date().toISOString(),
    reason,
    metrics: summarizeMetrics(m),
    config: { seed: cfg.seed, markets: cfg.numPairs, periodDays: cfg.ticksPerPair, slippagePct: cfg.slippagePct },
    totalTrades: m.totalTrades,
  };
}

// ---------------------------------------------------------------------------
// L2 — Robustness (k-fold, 5 seeds)
// ---------------------------------------------------------------------------

export function runCryptoL2(strategy: ParsedStrategy): L2Result {
  const cfg = CRYPTO_PIPELINE_CONFIG.l2;
  const folds: L2Result['folds'] = [];

  for (const seed of cfg.seeds) {
    const data = generateCryptoSyntheticMarkets({
      numPairs: cfg.numPairs,
      ticksPerPair: cfg.ticksPerPair,
      seed,
      baseVolatility: CRYPTO_PIPELINE_CONFIG.l1.baseVolatility,
    });

    const report = runBacktestWithData(strategy, data, {
      initialCapital: CRYPTO_PIPELINE_CONFIG.l1.initialCapital,
      slippagePct: CRYPTO_PIPELINE_CONFIG.l1.slippagePct,
      periodDays: cfg.ticksPerPair,
    });

    const m = report.metrics;
    const foldPassed = m.totalTrades > 0 && m.roiTotal > 0;

    folds.push({
      seed,
      roi: m.roiTotal,
      sharpe: m.sharpeRatio,
      winRate: m.winRate,
      maxDrawdownPct: m.maxDrawdownPct,
      totalTrades: m.totalTrades,
      passed: foldPassed,
    });
  }

  const passedFolds = folds.filter(f => f.passed).length;
  const avgRoi = folds.reduce((s, f) => s + f.roi, 0) / folds.length;
  const avgSharpe = folds.reduce((s, f) => s + f.sharpe, 0) / folds.length;

  const passed = passedFolds >= cfg.minPassFolds;
  const reason = passed
    ? null
    : `Solo ${passedFolds}/${cfg.seeds.length} fold profittevoli (minimo ${cfg.minPassFolds})`;

  return {
    level: 'L2',
    passed,
    timestamp: new Date().toISOString(),
    reason,
    folds,
    passedFolds,
    totalFolds: cfg.seeds.length,
    avgRoi,
    avgSharpe,
  };
}

// ---------------------------------------------------------------------------
// L3 — Stress Test (Monte Carlo)
// ---------------------------------------------------------------------------

export function runCryptoL3(
  strategy: ParsedStrategy,
  l1Trades: BacktestTrade[],
  seed?: CryptoStrategySeed,
): L3Result {
  const cfg = CRYPTO_PIPELINE_CONFIG.l3;

  if (l1Trades.length < 3) {
    return {
      level: 'L3',
      passed: false,
      timestamp: new Date().toISOString(),
      reason: `Troppo pochi trade per Monte Carlo (${l1Trades.length}, minimo 3)`,
      iterations: 0,
      p5Roi: 0, p25Roi: 0, p50Roi: 0, p75Roi: 0, p95Roi: 0,
      p95MaxDrawdown: 0,
      ruinProbability: 0,
      originalRoi: 0,
      originalMaxDrawdown: 0,
    };
  }

  const initialCapital = CRYPTO_PIPELINE_CONFIG.l1.initialCapital;
  const tradeReturns = l1Trades.map(t => t.netPnl);

  const originalRoi = tradeReturns.reduce((s, r) => s + r, 0) / initialCapital * 100;
  const originalMaxDD = calculateMaxDrawdownFromReturns(tradeReturns, initialCapital);

  const roiDistribution: number[] = [];
  const maxDDDistribution: number[] = [];
  let ruinCount = 0;
  const ruinThreshold = -initialCapital * 0.5;

  let rng = 12345;

  for (let i = 0; i < cfg.iterations; i++) {
    const shuffled = [...tradeReturns];
    for (let j = shuffled.length - 1; j > 0; j--) {
      rng = lcgNext(rng);
      const k = Math.abs(rng) % (j + 1);
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }

    const roi = shuffled.reduce((s, r) => s + r, 0) / initialCapital * 100;
    const maxDD = calculateMaxDrawdownFromReturns(shuffled, initialCapital);

    roiDistribution.push(roi);
    maxDDDistribution.push(maxDD);

    let equity = initialCapital;
    let hitRuin = false;
    for (const ret of shuffled) {
      equity += ret;
      if (equity <= initialCapital + ruinThreshold) {
        hitRuin = true;
        break;
      }
    }
    if (hitRuin) ruinCount++;
  }

  roiDistribution.sort((a, b) => a - b);
  maxDDDistribution.sort((a, b) => a - b);

  const p5Roi = percentile(roiDistribution, 5);
  const p25Roi = percentile(roiDistribution, 25);
  const p50Roi = percentile(roiDistribution, 50);
  const p75Roi = percentile(roiDistribution, 75);
  const p95Roi = percentile(roiDistribution, 95);
  const p95MaxDD = percentile(maxDDDistribution, 95);

  const ruinProbability = (ruinCount / cfg.iterations) * 100;

  const maxDDLimit = seed?.max_drawdown ?? cfg.p95MaxDrawdownLimit;
  const passed = ruinProbability < cfg.ruinThresholdPct && p95MaxDD <= maxDDLimit;
  let reason: string | null = null;
  if (!passed) {
    const reasons: string[] = [];
    if (ruinProbability >= cfg.ruinThresholdPct) {
      reasons.push(`Ruin probability ${ruinProbability.toFixed(1)}% >= ${cfg.ruinThresholdPct}%`);
    }
    if (p95MaxDD > maxDDLimit) {
      reasons.push(`P95 drawdown ${p95MaxDD.toFixed(1)}% > limite ${maxDDLimit}%`);
    }
    reason = reasons.join('; ');
  }

  return {
    level: 'L3',
    passed,
    timestamp: new Date().toISOString(),
    reason,
    iterations: cfg.iterations,
    p5Roi, p25Roi, p50Roi, p75Roi, p95Roi,
    p95MaxDrawdown: p95MaxDD,
    ruinProbability,
    originalRoi,
    originalMaxDrawdown: originalMaxDD,
  };
}

// ---------------------------------------------------------------------------
// L4 — Overfitting Check
// ---------------------------------------------------------------------------

export function runCryptoL4(seed: CryptoStrategySeed): L4Result {
  const cfg = CRYPTO_PIPELINE_CONFIG.l4;

  const baseStrategy = parseCryptoSeedToStrategy(seed);
  const baseData = generateCryptoSyntheticMarkets({
    numPairs: CRYPTO_PIPELINE_CONFIG.l1.numPairs,
    ticksPerPair: CRYPTO_PIPELINE_CONFIG.l1.ticksPerPair,
    seed: CRYPTO_PIPELINE_CONFIG.l1.seed,
    baseVolatility: CRYPTO_PIPELINE_CONFIG.l1.baseVolatility,
  });
  const baseReport = runBacktestWithData(baseStrategy, baseData, {
    initialCapital: CRYPTO_PIPELINE_CONFIG.l1.initialCapital,
    slippagePct: CRYPTO_PIPELINE_CONFIG.l1.slippagePct,
    periodDays: CRYPTO_PIPELINE_CONFIG.l1.ticksPerPair,
  });
  const baselineRoi = baseReport.metrics.roiTotal;

  const paramTests: L4Result['parameterTests'] = [];
  const testableParams = extractCryptoTestableParams(seed);

  for (const param of testableParams) {
    for (const direction of ['+10%', '-10%'] as const) {
      const factor = direction === '+10%' ? 1.1 : 0.9;
      const testedValue = param.value * factor;

      const modifiedSeed = applyCryptoParamVariation(seed, param.path, testedValue);
      const modStrategy = parseCryptoSeedToStrategy(modifiedSeed);

      const modReport = runBacktestWithData(modStrategy, baseData, {
        initialCapital: CRYPTO_PIPELINE_CONFIG.l1.initialCapital,
        slippagePct: CRYPTO_PIPELINE_CONFIG.l1.slippagePct,
        periodDays: CRYPTO_PIPELINE_CONFIG.l1.ticksPerPair,
      });

      const modRoi = modReport.metrics.roiTotal;
      const modTrades = modReport.metrics.totalTrades;
      const roiChange = modRoi - baselineRoi;

      let degradationPct = 0;
      if (baselineRoi > 0 && modTrades > 0) {
        degradationPct = Math.max(0, (baselineRoi - modRoi) / baselineRoi * 100);
      }

      paramTests.push({
        parameter: param.name,
        originalValue: param.value,
        testedValue,
        direction,
        roi: modRoi,
        roiChange,
        degradationPct,
      });
    }
  }

  const worstDegradation = paramTests.length > 0
    ? Math.max(...paramTests.map(t => t.degradationPct))
    : 0;

  const stabilityScore = Math.max(0, Math.min(100, 100 - worstDegradation));

  const passed = worstDegradation < cfg.maxRoiDegradationPct;
  const reason = passed
    ? null
    : `Worst degradation ${worstDegradation.toFixed(1)}% >= ${cfg.maxRoiDegradationPct}% limit`;

  return {
    level: 'L4',
    passed,
    timestamp: new Date().toISOString(),
    reason,
    baselineRoi,
    parameterTests: paramTests,
    stabilityScore,
    worstDegradation,
  };
}

// ---------------------------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------------------------

export function runCryptoFullPipeline(seed: CryptoStrategySeed): PipelineResults {
  const strategy = parseCryptoSeedToStrategy(seed);

  // L1
  const l1 = runCryptoL1(strategy, seed);
  if (!l1.passed) {
    return buildCryptoResults(seed, l1, null, null, null);
  }

  // L2
  const l2 = runCryptoL2(strategy);
  if (!l2.passed) {
    return buildCryptoResults(seed, l1, l2, null, null);
  }

  // L3
  const l1Data = generateCryptoSyntheticMarkets({
    numPairs: CRYPTO_PIPELINE_CONFIG.l1.numPairs,
    ticksPerPair: CRYPTO_PIPELINE_CONFIG.l1.ticksPerPair,
    seed: CRYPTO_PIPELINE_CONFIG.l1.seed,
    baseVolatility: CRYPTO_PIPELINE_CONFIG.l1.baseVolatility,
  });
  const l1Report = runBacktestWithData(strategy, l1Data, {
    initialCapital: CRYPTO_PIPELINE_CONFIG.l1.initialCapital,
    slippagePct: CRYPTO_PIPELINE_CONFIG.l1.slippagePct,
    periodDays: CRYPTO_PIPELINE_CONFIG.l1.ticksPerPair,
  });
  const l3 = runCryptoL3(strategy, l1Report.trades, seed);
  if (!l3.passed) {
    return buildCryptoResults(seed, l1, l2, l3, null);
  }

  // L4
  const l4 = runCryptoL4(seed);
  if (!l4.passed) {
    return buildCryptoResults(seed, l1, l2, l3, l4);
  }

  return buildCryptoResults(seed, l1, l2, l3, l4);
}

// ---------------------------------------------------------------------------
// L1 with Real Data
// ---------------------------------------------------------------------------

/**
 * Run L1 using real historical OHLCV data instead of synthetic.
 * The caller provides pre-fetched HistoricalMarketData[].
 */
export function runCryptoL1WithRealData(
  strategy: ParsedStrategy,
  realData: HistoricalMarketData[],
  seed?: CryptoStrategySeed,
): L1Result {
  const cfg = CRYPTO_PIPELINE_CONFIG.l1;

  // Determine period from the data itself
  const firstTick = realData[0]?.ticks[0];
  const lastTick = realData[0]?.ticks[realData[0].ticks.length - 1];
  const periodDays = firstTick && lastTick
    ? Math.max(1, Math.ceil(
        (new Date(lastTick.timestamp).getTime() - new Date(firstTick.timestamp).getTime())
        / (1000 * 60 * 60 * 24),
      ))
    : cfg.ticksPerPair;

  const report = runBacktestWithData(strategy, realData, {
    initialCapital: cfg.initialCapital,
    slippagePct: cfg.slippagePct,
    periodDays,
  });

  const m = report.metrics;
  let passed = true;
  let reason: string | null = null;

  if (m.totalTrades === 0) {
    passed = false;
    reason = 'No trades executed';
  } else if (m.roiTotal <= 0) {
    passed = false;
    reason = `ROI negativo: ${m.roiTotal.toFixed(2)}%`;
  } else if (seed && m.maxDrawdownPct > seed.max_drawdown) {
    passed = false;
    reason = `Drawdown ${m.maxDrawdownPct.toFixed(2)}% > limite ${seed.max_drawdown}%`;
  }

  return {
    level: 'L1',
    passed,
    timestamp: new Date().toISOString(),
    reason,
    metrics: summarizeMetrics(m),
    config: { seed: 0, markets: realData.length, periodDays, slippagePct: cfg.slippagePct },
    totalTrades: m.totalTrades,
  };
}

// ---------------------------------------------------------------------------
// L2 with Real Data — Rolling Windows
// ---------------------------------------------------------------------------

/**
 * Run L2 using real historical data with 5 rolling time windows instead of 5 seeds.
 *
 * Splits the data into 5 overlapping windows:
 * Window 1: ticks 0%–60%, Window 2: 10%–70%, ..., Window 5: 40%–100%
 */
export function runCryptoL2WithRealData(
  strategy: ParsedStrategy,
  realData: HistoricalMarketData[],
): L2Result {
  const cfg = CRYPTO_PIPELINE_CONFIG.l2;
  const folds: L2Result['folds'] = [];
  const numWindows = 5;
  const windowSize = 0.6; // Each window covers 60% of data
  const step = (1 - windowSize) / (numWindows - 1); // 0.1 = 10% step

  for (let w = 0; w < numWindows; w++) {
    const startPct = w * step;
    const endPct = startPct + windowSize;

    // Slice each market's ticks to the window
    const windowData: HistoricalMarketData[] = realData.map(market => {
      const totalTicks = market.ticks.length;
      const startIdx = Math.floor(totalTicks * startPct);
      const endIdx = Math.floor(totalTicks * endPct);
      const windowTicks = market.ticks.slice(startIdx, endIdx);

      return {
        ...market,
        startDate: windowTicks[0]?.timestamp ?? market.startDate,
        endDate: windowTicks[windowTicks.length - 1]?.timestamp ?? market.endDate,
        ticks: windowTicks,
      };
    }).filter(m => m.ticks.length > 0);

    // Determine period from window
    const firstTick = windowData[0]?.ticks[0];
    const lastTick = windowData[0]?.ticks[windowData[0].ticks.length - 1];
    const periodDays = firstTick && lastTick
      ? Math.max(1, Math.ceil(
          (new Date(lastTick.timestamp).getTime() - new Date(firstTick.timestamp).getTime())
          / (1000 * 60 * 60 * 24),
        ))
      : CRYPTO_PIPELINE_CONFIG.l1.ticksPerPair;

    const report = runBacktestWithData(strategy, windowData, {
      initialCapital: CRYPTO_PIPELINE_CONFIG.l1.initialCapital,
      slippagePct: CRYPTO_PIPELINE_CONFIG.l1.slippagePct,
      periodDays,
    });

    const m = report.metrics;
    const foldPassed = m.totalTrades > 0 && m.roiTotal > 0;

    folds.push({
      seed: w + 1, // Window number (1-5) instead of seed
      roi: m.roiTotal,
      sharpe: m.sharpeRatio,
      winRate: m.winRate,
      maxDrawdownPct: m.maxDrawdownPct,
      totalTrades: m.totalTrades,
      passed: foldPassed,
    });
  }

  const passedFolds = folds.filter(f => f.passed).length;
  const avgRoi = folds.reduce((s, f) => s + f.roi, 0) / folds.length;
  const avgSharpe = folds.reduce((s, f) => s + f.sharpe, 0) / folds.length;

  const passed = passedFolds >= cfg.minPassFolds;
  const reason = passed
    ? null
    : `Solo ${passedFolds}/${numWindows} finestre profittevoli (minimo ${cfg.minPassFolds})`;

  return {
    level: 'L2',
    passed,
    timestamp: new Date().toISOString(),
    reason,
    folds,
    passedFolds,
    totalFolds: numWindows,
    avgRoi,
    avgSharpe,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseCryptoSeedToStrategy(seed: CryptoStrategySeed): ParsedStrategy {
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
  return parseStrategy(row);
}

function buildCryptoResults(
  seed: CryptoStrategySeed,
  l1: L1Result | null,
  l2: L2Result | null,
  l3: L3Result | null,
  l4: L4Result | null,
): PipelineResults {
  let highestLevel: BacktestLevel | null = null;
  if (l4?.passed) highestLevel = 'L4';
  else if (l3?.passed) highestLevel = 'L3';
  else if (l2?.passed) highestLevel = 'L2';
  else if (l1?.passed) highestLevel = 'L1';

  return {
    strategyCode: seed.code,
    strategyName: seed.name,
    highestLevel,
    l1, l2, l3, l4,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
}

function summarizeMetrics(m: BacktestMetrics): BacktestMetricsSummary {
  return {
    totalTrades: m.totalTrades,
    winRate: m.winRate,
    roiTotal: m.roiTotal,
    roiAnnualized: m.roiAnnualized,
    profitFactor: m.profitFactor === Infinity ? 9999 : m.profitFactor,
    maxDrawdownPct: m.maxDrawdownPct,
    sharpeRatio: m.sharpeRatio,
    totalNetProfit: m.totalNetProfit,
    maxConsecutiveLosses: m.maxConsecutiveLosses,
  };
}

function calculateMaxDrawdownFromReturns(returns: number[], initialCapital: number): number {
  let equity = initialCapital;
  let peak = initialCapital;
  let maxDD = 0;

  for (const ret of returns) {
    equity += ret;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }

  return maxDD;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function lcgNext(rng: number): number {
  return ((rng * 1103515245 + 12345) & 0x7fffffff) || 1;
}

interface TestableParam {
  name: string;
  path: string;
  value: number;
}

function extractCryptoTestableParams(seed: CryptoStrategySeed): TestableParam[] {
  const params: TestableParam[] = [];

  for (const rule of seed.rules.entry_rules) {
    for (const [key, val] of Object.entries(rule.params)) {
      if (typeof val === 'number') {
        params.push({
          name: `entry.${rule.id}.${key}`,
          path: `entry_rules.${rule.id}.${key}`,
          value: val,
        });
      }
    }
  }

  for (const rule of seed.rules.exit_rules) {
    for (const [key, val] of Object.entries(rule.params)) {
      if (typeof val === 'number') {
        params.push({
          name: `exit.${rule.id}.${key}`,
          path: `exit_rules.${rule.id}.${key}`,
          value: val,
        });
      }
    }
  }

  params.push({ name: 'max_drawdown', path: 'max_drawdown', value: seed.max_drawdown });
  params.push({ name: 'max_allocation_pct', path: 'max_allocation_pct', value: seed.max_allocation_pct });
  params.push({ name: 'liquidity_reserve_pct', path: 'liquidity_reserve_pct', value: seed.rules.liquidity_reserve_pct });

  return params;
}

function applyCryptoParamVariation(seed: CryptoStrategySeed, path: string, newValue: number): CryptoStrategySeed {
  const clone: CryptoStrategySeed = JSON.parse(JSON.stringify(seed));

  if (path === 'max_drawdown') { clone.max_drawdown = newValue; return clone; }
  if (path === 'max_allocation_pct') { clone.max_allocation_pct = newValue; return clone; }
  if (path === 'liquidity_reserve_pct') { clone.rules.liquidity_reserve_pct = newValue; return clone; }

  const parts = path.split('.');
  if (parts[0] === 'entry_rules') {
    const rule = clone.rules.entry_rules.find(r => r.id === parts[1]);
    if (rule && parts[2] in rule.params) {
      (rule.params as Record<string, number | boolean>)[parts[2]] = newValue;
    }
    return clone;
  }

  if (parts[0] === 'exit_rules') {
    const rule = clone.rules.exit_rules.find(r => r.id === parts[1]);
    if (rule && parts[2] in rule.params) {
      (rule.params as Record<string, number>)[parts[2]] = newValue;
    }
    return clone;
  }

  return clone;
}
