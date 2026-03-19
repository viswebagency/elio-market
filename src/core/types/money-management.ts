/**
 * Money management types — bankroll tracking, position sizing, drawdown management.
 */

import { Currency, MarketArea } from './common';

/** Current state of a user's bankroll */
export interface BankrollState {
  userId: string;
  /** Total capital across all areas */
  totalCapital: number;
  /** Available (not in positions) */
  availableCapital: number;
  /** Locked in open positions */
  lockedCapital: number;
  /** Current P&L today */
  todayPnl: number;
  /** Current drawdown from peak */
  currentDrawdown: number;
  currentDrawdownPercent: number;
  /** All-time high watermark */
  peakCapital: number;
  currency: Currency;
  /** Per-area allocation */
  allocations: AreaAllocation[];
  /** Active drawdown level */
  drawdownLevel: DrawdownLevel;
  /** Whether trading is paused due to drawdown */
  isPaused: boolean;
  lastUpdated: string;
}

/** Capital allocated to a specific area */
export interface AreaAllocation {
  area: MarketArea;
  /** Allocated capital */
  allocated: number;
  /** Percentage of total */
  allocatedPercent: number;
  /** Currently used */
  used: number;
  /** Available in this area */
  available: number;
}

/** Position sizing configuration */
export interface SizingConfig {
  /** Base method for calculating position size */
  method: SizingMethod;
  /** Fixed amount per trade (if method is 'fixed') */
  fixedAmount?: number;
  /** Percentage of bankroll per trade (if method is 'percent') */
  percentPerTrade?: number;
  /** Kelly criterion fraction (if method is 'kelly') */
  kellyFraction?: number;
  /** Maximum single trade size as % of bankroll */
  maxSingleTradePercent: number;
  /** Maximum total exposure as % of bankroll */
  maxTotalExposurePercent: number;
  /** Maximum number of concurrent trades */
  maxConcurrentTrades: number;
  /** Per-area limits */
  areaLimits?: Record<MarketArea, number>;
}

export type SizingMethod =
  | 'fixed'           // Fixed amount per trade
  | 'percent'         // Percentage of bankroll
  | 'kelly'           // Kelly criterion
  | 'half_kelly'      // Half Kelly (more conservative)
  | 'risk_based'      // Based on risk per trade
  ;

/** Drawdown protection levels */
export enum DrawdownLevel {
  /** Normal operations — no restrictions */
  NORMAL = 'normal',
  /** Warning — reduce position sizes by 50% */
  WARNING = 'warning',       // -20%
  /** Critical — reduce to 25%, alert user */
  CRITICAL = 'critical',     // -25%
  /** Emergency — stop all trading */
  EMERGENCY = 'emergency',   // -30%
}

/** Drawdown level thresholds */
export interface DrawdownThresholds {
  /** Percentage at which WARNING triggers */
  warningPercent: number;    // default: 20
  /** Percentage at which CRITICAL triggers */
  criticalPercent: number;   // default: 25
  /** Percentage at which EMERGENCY triggers */
  emergencyPercent: number;  // default: 30
}

/** Daily P&L record */
export interface DailyPnl {
  date: string;
  startingCapital: number;
  endingCapital: number;
  pnl: number;
  pnlPercent: number;
  trades: number;
  wins: number;
  losses: number;
}
