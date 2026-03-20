/**
 * Trade types — represents individual trades, their execution, and results.
 */

import { MarketArea, Direction, OrderType, Currency, OperationStatus as _OperationStatus } from './common';

/** A trade intent (before execution) */
export interface Trade {
  id: string;
  strategyId: string;
  userId: string;
  area: MarketArea;
  symbol: string;
  direction: Direction;
  orderType: OrderType;
  /** Size in units (shares, contracts, etc.) */
  size: number;
  /** Size as percentage of bankroll (for reference) */
  sizePercent?: number;
  /** Limit price (for limit orders) */
  limitPrice?: number;
  /** Stop price (for stop orders) */
  stopPrice?: number;
  /** Stop loss price */
  stopLoss?: number;
  /** Take profit price */
  takeProfit?: number;
  /** Trailing stop distance */
  trailingStop?: number;
  currency: Currency;
  /** Rule that generated this trade */
  ruleId?: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/** Result of submitting a trade to a broker/exchange */
export interface TradeExecution {
  id: string;
  tradeId: string;
  /** External order ID from the platform */
  externalOrderId: string;
  status: TradeExecutionStatus;
  /** Actual fill price */
  fillPrice?: number;
  /** Actual filled size */
  filledSize?: number;
  /** Commission paid */
  commission?: number;
  /** Slippage from intended price */
  slippage?: number;
  /** Time of execution */
  executedAt?: string;
  /** Error message if failed */
  errorMessage?: string;
  /** Raw response from the platform */
  rawResponse?: unknown;
  createdAt: string;
  updatedAt: string;
}

export type TradeExecutionStatus =
  | 'submitted'
  | 'pending'
  | 'partial_fill'
  | 'filled'
  | 'cancelled'
  | 'rejected'
  | 'expired'
  ;

/** Final result of a completed trade (entry + exit) */
export interface TradeResult {
  id: string;
  tradeId: string;
  strategyId: string;
  userId: string;
  area: MarketArea;
  symbol: string;
  direction: Direction;
  /** Entry details */
  entryPrice: number;
  entrySize: number;
  entryTime: string;
  /** Exit details */
  exitPrice: number;
  exitSize: number;
  exitTime: string;
  exitReason: ExitReason;
  /** P&L */
  grossPnl: number;
  commission: number;
  netPnl: number;
  /** Return percentage */
  returnPercent: number;
  /** Duration in milliseconds */
  durationMs: number;
  currency: Currency;
  /** Risk/reward ratio achieved */
  rrRatio?: number;
  /** Maximum adverse excursion (worst point during trade) */
  mae?: number;
  /** Maximum favorable excursion (best point during trade) */
  mfe?: number;
  createdAt: string;
}

export type ExitReason =
  | 'take_profit'
  | 'stop_loss'
  | 'trailing_stop'
  | 'signal'
  | 'manual'
  | 'time_expiry'
  | 'kill_switch'
  | 'market_close'
  ;
