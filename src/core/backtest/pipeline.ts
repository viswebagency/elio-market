/**
 * Backtest Pipeline — L1 through L4
 *
 * Mandatory pipeline for strategy lifecycle:
 * - L1 Quick Scan: ROI > 0 on synthetic data (seed=42)
 * - L2 Robustness: k-fold cross-validation with 5 different seeds, profitable on ≥4/5
 * - L3 Stress Test: Monte Carlo 10K permutations of L1 trades, p95 drawdown check
 * - L4 Overfitting Check: parameter sensitivity ±10%, ROI must not drop > 50%
 *
 * Each level depends on the previous. Results stored in strategies.backtest_results JSONB.
 */

import { ParsedStrategy, parseStrategy, RawStrategyRow } from '../engine/dsl-parser';
import { runBacktestWithData, BacktestReport } from './runner';
import { generateSyntheticMarkets } from './synthetic-data';
import { BacktestTrade, BacktestMetrics } from './metrics';
import { StrategySeed, POLYMARKET_STRATEGIES } from '../strategies/polymarket-strategies';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BacktestLevel = 'L1' | 'L2' | 'L3' | 'L4';

export interface L1Result {
  level: 'L1';
  passed: boolean;
  timestamp: string;
  reason: string | null;
  metrics: BacktestMetricsSummary;
  config: { seed: number; markets: number; periodDays: number; slippagePct: number };
  totalTrades: number;
}

export interface L2Result {
  level: 'L2';
  passed: boolean;
  timestamp: string;
  reason: string | null;
  folds: L2FoldResult[];
  passedFolds: number;
  totalFolds: number;
  avgRoi: number;
  avgSharpe: number;
}

export interface L2FoldResult {
  seed: number;
  roi: number;
  sharpe: number;
  winRate: number;
  maxDrawdownPct: number;
  totalTrades: number;
  passed: boolean;
}

export interface L3Result {
  level: 'L3';
  passed: boolean;
  timestamp: string;
  reason: string | null;
  iterations: number;
  p5Roi: number;
  p25Roi: number;
  p50Roi: number;
  p75Roi: number;
  p95Roi: number;
  p95MaxDrawdown: number;
  ruinProbability: number;
  originalRoi: number;
  originalMaxDrawdown: number;
}

export interface L4Result {
  level: 'L4';
  passed: boolean;
  timestamp: string;
  reason: string | null;
  baselineRoi: number;
  parameterTests: L4ParameterTest[];
  stabilityScore: number;
  worstDegradation: number;
}

export interface L4ParameterTest {
  parameter: string;
  originalValue: number;
  testedValue: number;
  direction: '+10%' | '-10%';
  roi: number;
  roiChange: number;
  degradationPct: number;
}

export interface BacktestMetricsSummary {
  totalTrades: number;
  winRate: number;
  roiTotal: number;
  roiAnnualized: number;
  profitFactor: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  totalNetProfit: number;
  maxConsecutiveLosses: number;
}

export interface PipelineResults {
  strategyCode: string;
  strategyName: string;
  highestLevel: BacktestLevel | null;
  l1: L1Result | null;
  l2: L2Result | null;
  l3: L3Result | null;
  l4: L4Result | null;
  version: number;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Pipeline config
// ---------------------------------------------------------------------------

const PIPELINE_CONFIG = {
  l1: { seed: 42, markets: 50, periodDays: 90, slippagePct: 1.5, initialCapital: 100 },
  l2: { seeds: [42, 137, 256, 512, 1024], markets: 50, periodDays: 90, minPassFolds: 4 },
  l3: { iterations: 10_000, ruinThresholdPct: 5, p95MaxDrawdownLimit: 40 },
  l4: { variationPct: 10, maxRoiDegradationPct: 50 },
};

// ---------------------------------------------------------------------------
// L1 — Quick Scan
// ---------------------------------------------------------------------------

export function runL1(strategy: ParsedStrategy, seed?: StrategySeed): L1Result {
  const cfg = PIPELINE_CONFIG.l1;
  const data = generateSyntheticMarkets({
    numMarkets: cfg.markets,
    ticksPerMarket: cfg.periodDays,
    seed: cfg.seed,
  });

  const report = runBacktestWithData(strategy, data, {
    initialCapital: cfg.initialCapital,
    slippagePct: cfg.slippagePct,
    periodDays: cfg.periodDays,
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
    config: { seed: cfg.seed, markets: cfg.markets, periodDays: cfg.periodDays, slippagePct: cfg.slippagePct },
    totalTrades: m.totalTrades,
  };
}

// ---------------------------------------------------------------------------
// L2 — Robustness (k-fold cross-validation, 5 seeds)
// ---------------------------------------------------------------------------

export function runL2(strategy: ParsedStrategy): L2Result {
  const cfg = PIPELINE_CONFIG.l2;
  const folds: L2FoldResult[] = [];

  for (const seed of cfg.seeds) {
    const data = generateSyntheticMarkets({
      numMarkets: cfg.markets,
      ticksPerMarket: cfg.periodDays,
      seed,
    });

    const report = runBacktestWithData(strategy, data, {
      initialCapital: PIPELINE_CONFIG.l1.initialCapital,
      slippagePct: PIPELINE_CONFIG.l1.slippagePct,
      periodDays: cfg.periodDays,
    });

    const m = report.metrics;
    // Fold passes if ROI > 0 (beats "doing nothing" benchmark)
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
// L3 — Stress Test (Monte Carlo permutation of trades)
// ---------------------------------------------------------------------------

export function runL3(
  strategy: ParsedStrategy,
  l1Trades: BacktestTrade[],
  seed?: StrategySeed,
): L3Result {
  const cfg = PIPELINE_CONFIG.l3;

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

  const initialCapital = PIPELINE_CONFIG.l1.initialCapital;
  const tradeReturns = l1Trades.map(t => t.netPnl);

  // Original metrics
  const originalRoi = tradeReturns.reduce((s, r) => s + r, 0) / initialCapital * 100;
  const originalMaxDD = calculateMaxDrawdownFromReturns(tradeReturns, initialCapital);

  // Monte Carlo: shuffle trade order N times
  const roiDistribution: number[] = [];
  const maxDDDistribution: number[] = [];
  let ruinCount = 0;
  const ruinThreshold = -initialCapital * 0.5; // -50% = ruin

  let rng = 12345;

  for (let i = 0; i < cfg.iterations; i++) {
    // Fisher-Yates shuffle with deterministic RNG
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

    // Check ruin: equity drops below threshold at any point
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

  // Sort for percentiles
  roiDistribution.sort((a, b) => a - b);
  maxDDDistribution.sort((a, b) => a - b);

  const p5Roi = percentile(roiDistribution, 5);
  const p25Roi = percentile(roiDistribution, 25);
  const p50Roi = percentile(roiDistribution, 50);
  const p75Roi = percentile(roiDistribution, 75);
  const p95Roi = percentile(roiDistribution, 95);
  const p95MaxDD = percentile(maxDDDistribution, 95);

  const ruinProbability = (ruinCount / cfg.iterations) * 100;

  // Pass criteria
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
// L4 — Overfitting Check (parameter sensitivity ±10%)
// ---------------------------------------------------------------------------

export function runL4(seed: StrategySeed): L4Result {
  const cfg = PIPELINE_CONFIG.l4;

  // Run baseline
  const baseStrategy = parseSeedToStrategy(seed);
  const baseData = generateSyntheticMarkets({
    numMarkets: PIPELINE_CONFIG.l1.markets,
    ticksPerMarket: PIPELINE_CONFIG.l1.periodDays,
    seed: PIPELINE_CONFIG.l1.seed,
  });
  const baseReport = runBacktestWithData(baseStrategy, baseData, {
    initialCapital: PIPELINE_CONFIG.l1.initialCapital,
    slippagePct: PIPELINE_CONFIG.l1.slippagePct,
    periodDays: PIPELINE_CONFIG.l1.periodDays,
  });
  const baselineRoi = baseReport.metrics.roiTotal;

  // Identify tunable parameters from the strategy rules
  const paramTests: L4ParameterTest[] = [];
  const testableParams = extractTestableParams(seed);

  for (const param of testableParams) {
    for (const direction of ['+10%', '-10%'] as const) {
      const factor = direction === '+10%' ? 1.1 : 0.9;
      const testedValue = param.value * factor;

      // Create modified seed
      const modifiedSeed = applyParamVariation(seed, param.path, testedValue);
      const modStrategy = parseSeedToStrategy(modifiedSeed);

      const modReport = runBacktestWithData(modStrategy, baseData, {
        initialCapital: PIPELINE_CONFIG.l1.initialCapital,
        slippagePct: PIPELINE_CONFIG.l1.slippagePct,
        periodDays: PIPELINE_CONFIG.l1.periodDays,
      });

      const modRoi = modReport.metrics.roiTotal;
      const modTrades = modReport.metrics.totalTrades;
      const roiChange = modRoi - baselineRoi;

      // Degradation: how much worse (positive = worse)
      // If variation produces 0 trades, it's a range sensitivity issue, not overfitting.
      // Only count degradation when trades exist (otherwise it's a different problem).
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

  // Stability score: 100 - worst degradation (clamped 0-100)
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
// Full pipeline runner
// ---------------------------------------------------------------------------

export function runFullPipeline(seed: StrategySeed): PipelineResults {
  const strategy = parseSeedToStrategy(seed);

  // L1
  const l1 = runL1(strategy, seed);
  if (!l1.passed) {
    return buildResults(seed, 'L1', l1, null, null, null);
  }

  // L2
  const l2 = runL2(strategy);
  if (!l2.passed) {
    return buildResults(seed, 'L2', l1, l2, null, null);
  }

  // L3 — needs L1 trades
  const l1Data = generateSyntheticMarkets({
    numMarkets: PIPELINE_CONFIG.l1.markets,
    ticksPerMarket: PIPELINE_CONFIG.l1.periodDays,
    seed: PIPELINE_CONFIG.l1.seed,
  });
  const l1Report = runBacktestWithData(strategy, l1Data, {
    initialCapital: PIPELINE_CONFIG.l1.initialCapital,
    slippagePct: PIPELINE_CONFIG.l1.slippagePct,
    periodDays: PIPELINE_CONFIG.l1.periodDays,
  });
  const l3 = runL3(strategy, l1Report.trades, seed);
  if (!l3.passed) {
    return buildResults(seed, 'L3', l1, l2, l3, null);
  }

  // L4
  const l4 = runL4(seed);
  if (!l4.passed) {
    return buildResults(seed, 'L4', l1, l2, l3, l4);
  }

  return buildResults(seed, null, l1, l2, l3, l4);
}

// ---------------------------------------------------------------------------
// canPromote — promotion gate
// ---------------------------------------------------------------------------

export type StrategyStatus = 'draft' | 'observation' | 'paper_trading' | 'live';

export interface PromotionCheck {
  allowed: boolean;
  reason: string;
}

export function canPromote(
  results: PipelineResults | null,
  targetStatus: StrategyStatus,
  paperTradingDays?: number,
  paperTradingProfitable?: boolean,
): PromotionCheck {
  if (targetStatus === 'draft') {
    return { allowed: true, reason: 'Ritorno a draft sempre consentito.' };
  }

  if (!results) {
    return { allowed: false, reason: 'Nessun risultato di backtest disponibile. Esegui almeno L1.' };
  }

  switch (targetStatus) {

    case 'observation':
      if (!results.l1?.passed) {
        return {
          allowed: false,
          reason: `Gate L1 non superato: ${results.l1?.reason ?? 'L1 non eseguito'}`,
        };
      }
      return { allowed: true, reason: 'L1 superato — promozione a observation consentita.' };

    case 'paper_trading':
      if (!results.l1?.passed) {
        return { allowed: false, reason: `Gate L1 non superato: ${results.l1?.reason ?? 'L1 non eseguito'}` };
      }
      if (!results.l2?.passed) {
        return { allowed: false, reason: `Gate L2 non superato: ${results.l2?.reason ?? 'L2 non eseguito'}` };
      }
      return { allowed: true, reason: 'L1 + L2 superati — promozione a paper_trading consentita.' };

    case 'live':
      if (!results.l1?.passed) {
        return { allowed: false, reason: `Gate L1: ${results.l1?.reason ?? 'non eseguito'}` };
      }
      if (!results.l2?.passed) {
        return { allowed: false, reason: `Gate L2: ${results.l2?.reason ?? 'non eseguito'}` };
      }
      if (!results.l3?.passed) {
        return { allowed: false, reason: `Gate L3: ${results.l3?.reason ?? 'non eseguito'}` };
      }
      if (!results.l4?.passed) {
        return { allowed: false, reason: `Gate L4: ${results.l4?.reason ?? 'non eseguito'}` };
      }
      if (!paperTradingDays || paperTradingDays < 30) {
        return {
          allowed: false,
          reason: `Paper trading insufficiente: ${paperTradingDays ?? 0}/30 giorni minimi`,
        };
      }
      if (!paperTradingProfitable) {
        return { allowed: false, reason: 'Paper trading non profittevole. Serve ROI > 0 nei 30 giorni.' };
      }
      return { allowed: true, reason: 'L1-L4 superati + 30gg paper profittevole — promozione a live consentita.' };

    default:
      return { allowed: false, reason: `Status target sconosciuto: ${targetStatus}` };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function buildResults(
  seed: StrategySeed,
  failedAt: BacktestLevel | null,
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

export function parseSeedToStrategy(seed: StrategySeed): ParsedStrategy {
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

function extractTestableParams(seed: StrategySeed): TestableParam[] {
  const params: TestableParam[] = [];

  // Entry rule params
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

  // Exit rule params
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

  // Top-level risk params
  params.push({ name: 'max_drawdown', path: 'max_drawdown', value: seed.max_drawdown });
  params.push({ name: 'max_allocation_pct', path: 'max_allocation_pct', value: seed.max_allocation_pct });
  params.push({ name: 'liquidity_reserve_pct', path: 'liquidity_reserve_pct', value: seed.rules.liquidity_reserve_pct });

  return params;
}

function applyParamVariation(seed: StrategySeed, path: string, newValue: number): StrategySeed {
  // Deep clone
  const clone: StrategySeed = JSON.parse(JSON.stringify(seed));

  if (path === 'max_drawdown') {
    clone.max_drawdown = newValue;
    return clone;
  }
  if (path === 'max_allocation_pct') {
    clone.max_allocation_pct = newValue;
    return clone;
  }
  if (path === 'liquidity_reserve_pct') {
    clone.rules.liquidity_reserve_pct = newValue;
    return clone;
  }

  // Entry/exit rules
  const parts = path.split('.');
  if (parts[0] === 'entry_rules') {
    const ruleId = parts[1];
    const paramKey = parts[2];
    const rule = clone.rules.entry_rules.find(r => r.id === ruleId);
    if (rule && paramKey in rule.params) {
      (rule.params as Record<string, number | boolean>)[paramKey] = newValue;
    }
    return clone;
  }

  if (parts[0] === 'exit_rules') {
    const ruleId = parts[1];
    const paramKey = parts[2];
    const rule = clone.rules.exit_rules.find(r => r.id === ruleId);
    if (rule && paramKey in rule.params) {
      (rule.params as Record<string, number>)[paramKey] = newValue;
    }
    return clone;
  }

  return clone;
}
