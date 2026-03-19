/**
 * Strategy types — defines the structure of trading strategies.
 * Strategies are the core unit of the platform: a set of rules that generate signals.
 */

import { MarketArea, ExecutionMode, CreationMode, TimeInterval, Direction } from './common';

/** A complete strategy definition */
export interface StrategyDefinition {
  id: string;
  userId: string;
  name: string;
  description: string;
  area: MarketArea;
  executionMode: ExecutionMode;
  creationMode: CreationMode;
  /** The rules that compose this strategy */
  rules: StrategyRule[];
  /** Active version */
  currentVersion: string;
  /** All versions */
  versions: StrategyVersion[];
  /** Whether this strategy is currently active */
  isActive: boolean;
  /** Maximum concurrent trades */
  maxConcurrentTrades: number;
  /** Allowed time intervals */
  timeIntervals: TimeInterval[];
  /** Markets/symbols this strategy trades */
  symbols: string[];
  /** Tags for organization */
  tags: string[];
  /** Performance stats (cached) */
  stats?: StrategyStats;
  createdAt: string;
  updatedAt: string;
}

/** A version snapshot of a strategy */
export interface StrategyVersion {
  id: string;
  strategyId: string;
  version: string;
  /** Semantic label (e.g., "v2 - added stop loss") */
  label?: string;
  rules: StrategyRule[];
  /** Backtest results for this version */
  backtestId?: string;
  createdAt: string;
}

/** A single rule within a strategy */
export interface StrategyRule {
  id: string;
  name: string;
  type: RuleType;
  /** Condition that triggers this rule (in DSL or structured format) */
  condition: RuleCondition;
  /** Action to take when condition is met */
  action: RuleAction;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Whether this rule is enabled */
  enabled: boolean;
}

/** Types of rules */
export type RuleType =
  | 'entry'        // When to enter a trade
  | 'exit'         // When to exit a trade
  | 'stop_loss'    // Stop loss rule
  | 'take_profit'  // Take profit rule
  | 'trailing_stop'// Trailing stop
  | 'filter'       // Pre-filter (must pass before entry)
  | 'sizing'       // Position sizing rule
  | 'time'         // Time-based rule (e.g., no trading after 17:00)
  ;

/** Structured condition */
export interface RuleCondition {
  /** Indicator or data point */
  indicator: string;
  /** Comparison operator */
  operator: ConditionOperator;
  /** Value to compare against */
  value: number | string | boolean;
  /** Timeframe for the indicator */
  timeframe?: TimeInterval;
  /** Combine with other conditions */
  and?: RuleCondition[];
  or?: RuleCondition[];
}

export type ConditionOperator =
  | 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'
  | 'crosses_above' | 'crosses_below'
  | 'between' | 'not_between'
  ;

/** Action to take when a rule fires */
export interface RuleAction {
  type: 'open_trade' | 'close_trade' | 'modify_trade' | 'alert' | 'log';
  direction?: Direction;
  /** Size as percentage of bankroll */
  sizePercent?: number;
  /** Fixed size */
  sizeFixed?: number;
  /** Limit price */
  limitPrice?: number;
  /** Additional params */
  params?: Record<string, unknown>;
}

/** Cached performance stats for a strategy */
export interface StrategyStats {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  avgReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  lastUpdated: string;
}
