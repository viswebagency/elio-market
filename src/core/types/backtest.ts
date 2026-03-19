/**
 * Backtest types — configuration and results for strategy backtesting.
 * 3 levels: Quick (L1), Standard (L2), Deep (L3).
 */

import { MarketArea, Currency } from './common';
import { StrategyDefinition } from './strategy';
import { TradeResult } from './trade';
import { PerformanceMetrics } from './metrics';

/** Backtest depth level */
export enum BacktestLevel {
  /** Quick check — last 30 days, basic metrics */
  L1_QUICK = 'L1',
  /** Standard — last 6 months, full metrics, Monte Carlo */
  L2_STANDARD = 'L2',
  /** Deep — full history, walk-forward, stress test */
  L3_DEEP = 'L3',
}

/** Configuration for a backtest run */
export interface BacktestConfig {
  id: string;
  strategyId: string;
  userId: string;
  level: BacktestLevel;
  /** Start date for historical data */
  startDate: string;
  /** End date for historical data */
  endDate: string;
  /** Initial capital */
  initialCapital: number;
  currency: Currency;
  /** Commission model to apply */
  commissionModel: CommissionModel;
  /** Slippage model */
  slippageModel: SlippageModel;
  /** Areas to backtest across */
  areas: MarketArea[];
  /** Symbols to include */
  symbols: string[];
  /** Walk-forward config (L3 only) */
  walkForward?: WalkForwardConfig;
  /** Monte Carlo simulations count (L2+) */
  monteCarloRuns?: number;
}

/** Commission model for backtest */
export interface CommissionModel {
  type: 'fixed' | 'percentage' | 'tiered';
  /** Fixed amount per trade */
  fixedAmount?: number;
  /** Percentage per trade */
  percentage?: number;
  /** Tiered rates */
  tiers?: { minVolume: number; rate: number }[];
}

/** Slippage model for backtest */
export interface SlippageModel {
  type: 'none' | 'fixed' | 'percentage' | 'volume_based';
  /** Fixed slippage in price units */
  fixedAmount?: number;
  /** Percentage slippage */
  percentage?: number;
}

/** Walk-forward optimization config (L3) */
export interface WalkForwardConfig {
  /** In-sample window size in days */
  inSampleDays: number;
  /** Out-of-sample window size in days */
  outOfSampleDays: number;
  /** Step size in days */
  stepDays: number;
}

/** Complete backtest result */
export interface BacktestResult {
  id: string;
  configId: string;
  strategyId: string;
  userId: string;
  level: BacktestLevel;
  /** Overall metrics */
  metrics: PerformanceMetrics;
  /** Equity curve points */
  equityCurve: EquityPoint[];
  /** All simulated trades */
  trades: TradeResult[];
  /** Drawdown periods */
  drawdowns: DrawdownPeriod[];
  /** Monthly returns */
  monthlyReturns: MonthlyReturn[];
  /** Monte Carlo results (L2+) */
  monteCarlo?: MonteCarloResult;
  /** Walk-forward results (L3) */
  walkForward?: WalkForwardResult[];
  /** Execution time in ms */
  executionTimeMs: number;
  /** Status */
  status: 'running' | 'completed' | 'failed';
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

/** Point on the equity curve */
export interface EquityPoint {
  timestamp: string;
  equity: number;
  drawdown: number;
  drawdownPercent: number;
}

/** A drawdown period */
export interface DrawdownPeriod {
  startDate: string;
  endDate: string;
  /** Recovery date (if recovered) */
  recoveryDate?: string;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  durationDays: number;
}

/** Monthly return */
export interface MonthlyReturn {
  year: number;
  month: number;
  returnPercent: number;
  trades: number;
}

/** Monte Carlo simulation result */
export interface MonteCarloResult {
  runs: number;
  /** Percentile results */
  percentiles: {
    p5: MonteCarloPercentile;
    p25: MonteCarloPercentile;
    p50: MonteCarloPercentile;
    p75: MonteCarloPercentile;
    p95: MonteCarloPercentile;
  };
  /** Probability of ruin (going to 0) */
  ruinProbability: number;
}

export interface MonteCarloPercentile {
  finalEquity: number;
  maxDrawdown: number;
  returnPercent: number;
}

/** Single walk-forward segment result */
export interface WalkForwardResult {
  inSampleStart: string;
  inSampleEnd: string;
  outOfSampleStart: string;
  outOfSampleEnd: string;
  inSampleMetrics: PerformanceMetrics;
  outOfSampleMetrics: PerformanceMetrics;
  /** Efficiency ratio (OOS / IS performance) */
  efficiency: number;
}
