/**
 * Betfair Backtest Pipeline — L1 through L4
 *
 * Adapted for exchange betting markets:
 * - Uses betfair synthetic data (odds 1.01-100, GBP volume)
 * - Supports BetfairStrategySeed format
 * - Tick-level backtest with price_range (odds) and min_volume conditions
 */

import { ParsedStrategy, parseStrategy, RawStrategyRow } from '../engine/dsl-parser';
import { runBacktestWithData } from './runner';
import { generateBetfairSyntheticMarkets } from './betfair-synthetic-data';
import { BacktestTrade, BacktestMetrics } from './metrics';
import { BetfairStrategySeed } from '../strategies/betfair-strategies';
import {
  L1Result, L2Result,
  BacktestMetricsSummary, PipelineResults, BacktestLevel,
} from './pipeline';

const BETFAIR_PIPELINE_CONFIG = {
  l1: { seed: 42, numMarkets: 8, ticksPerMarket: 90, slippagePct: 0.1, initialCapital: 1000, baseOddsVolatility: 0.02 },
  l2: { seeds: [42, 137, 256, 512, 1024], numMarkets: 8, ticksPerMarket: 90, minPassFolds: 3 },
};

export function runBetfairL1(strategy: ParsedStrategy, seed?: BetfairStrategySeed): L1Result {
  const cfg = BETFAIR_PIPELINE_CONFIG.l1;
  const data = generateBetfairSyntheticMarkets({
    numMarkets: cfg.numMarkets,
    ticksPerMarket: cfg.ticksPerMarket,
    seed: cfg.seed,
    baseOddsVolatility: cfg.baseOddsVolatility,
  });

  const report = runBacktestWithData(strategy, data, {
    initialCapital: cfg.initialCapital,
    slippagePct: cfg.slippagePct,
    periodDays: cfg.ticksPerMarket,
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
    config: { seed: cfg.seed, markets: cfg.numMarkets, periodDays: cfg.ticksPerMarket, slippagePct: cfg.slippagePct },
    totalTrades: m.totalTrades,
  };
}

export function runBetfairL2(strategy: ParsedStrategy): L2Result {
  const cfg = BETFAIR_PIPELINE_CONFIG.l2;
  const folds: L2Result['folds'] = [];

  for (const seed of cfg.seeds) {
    const data = generateBetfairSyntheticMarkets({
      numMarkets: cfg.numMarkets,
      ticksPerMarket: cfg.ticksPerMarket,
      seed,
      baseOddsVolatility: BETFAIR_PIPELINE_CONFIG.l1.baseOddsVolatility,
    });

    const report = runBacktestWithData(strategy, data, {
      initialCapital: BETFAIR_PIPELINE_CONFIG.l1.initialCapital,
      slippagePct: BETFAIR_PIPELINE_CONFIG.l1.slippagePct,
      periodDays: cfg.ticksPerMarket,
    });

    const m = report.metrics;
    folds.push({
      seed,
      roi: m.roiTotal,
      sharpe: m.sharpeRatio,
      winRate: m.winRate,
      maxDrawdownPct: m.maxDrawdownPct,
      totalTrades: m.totalTrades,
      passed: m.totalTrades > 0 && m.roiTotal > 0,
    });
  }

  const passedFolds = folds.filter(f => f.passed).length;
  const avgRoi = folds.reduce((s, f) => s + f.roi, 0) / folds.length;
  const avgSharpe = folds.reduce((s, f) => s + f.sharpe, 0) / folds.length;

  return {
    level: 'L2',
    passed: passedFolds >= cfg.minPassFolds,
    timestamp: new Date().toISOString(),
    reason: passedFolds >= cfg.minPassFolds ? null : `Solo ${passedFolds}/${cfg.seeds.length} fold profittevoli`,
    folds,
    passedFolds,
    totalFolds: cfg.seeds.length,
    avgRoi,
    avgSharpe,
  };
}

export function parseBetfairSeedToStrategy(seed: BetfairStrategySeed): ParsedStrategy {
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
