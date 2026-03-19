/**
 * Performance metrics types — KPIs, benchmarks, and analytics.
 */

import { MarketArea } from './common';

/** Comprehensive performance metrics for a strategy or portfolio */
export interface PerformanceMetrics {
  /** Total number of trades */
  totalTrades: number;
  /** Number of winning trades */
  wins: number;
  /** Number of losing trades */
  losses: number;
  /** Win rate (0-1) */
  winRate: number;
  /** Average win amount */
  avgWin: number;
  /** Average loss amount */
  avgLoss: number;
  /** Profit factor (gross wins / gross losses) */
  profitFactor: number;
  /** Expected value per trade */
  expectancy: number;
  /** Total net P&L */
  totalPnl: number;
  /** Total return percentage */
  totalReturnPercent: number;
  /** Annualized return */
  annualizedReturn: number;
  /** Maximum drawdown percentage */
  maxDrawdown: number;
  /** Maximum drawdown duration in days */
  maxDrawdownDuration: number;
  /** Sharpe ratio (annualized) */
  sharpeRatio: number;
  /** Sortino ratio (downside risk only) */
  sortinoRatio: number;
  /** Calmar ratio (return / max drawdown) */
  calmarRatio: number;
  /** Average trade duration in hours */
  avgTradeDuration: number;
  /** Maximum consecutive wins */
  maxConsecutiveWins: number;
  /** Maximum consecutive losses */
  maxConsecutiveLosses: number;
  /** Average R:R achieved */
  avgRiskReward: number;
  /** Recovery factor (net profit / max drawdown) */
  recoveryFactor: number;
  /** Payoff ratio (avg win / avg loss) */
  payoffRatio: number;
  /** Calculated over this period */
  periodStart: string;
  periodEnd: string;
}

/** Benchmark comparison (compare strategy to a reference) */
export interface BenchmarkComparison {
  benchmarkName: string;
  /** Benchmark return over the same period */
  benchmarkReturn: number;
  /** Strategy return over the same period */
  strategyReturn: number;
  /** Alpha (excess return) */
  alpha: number;
  /** Beta (correlation with benchmark) */
  beta: number;
  /** Information ratio */
  informationRatio: number;
  /** Tracking error */
  trackingError: number;
  /** Correlation coefficient */
  correlation: number;
}

/** Area-specific performance breakdown */
export interface AreaPerformance {
  area: MarketArea;
  metrics: PerformanceMetrics;
  /** % of total portfolio allocated here */
  allocationPercent: number;
  /** Contribution to total P&L */
  pnlContribution: number;
}

/** Time-based performance breakdown */
export interface TimePerformance {
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  data: {
    label: string;
    returnPercent: number;
    trades: number;
    pnl: number;
  }[];
}
