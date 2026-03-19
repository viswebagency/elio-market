/**
 * Common enums and types shared across the entire Elio.Market platform.
 */

/** The 5 market areas supported by the platform */
export enum MarketArea {
  PREDICTION = 'prediction',
  EXCHANGE_BETTING = 'exchange_betting',
  STOCKS = 'stocks',
  FOREX = 'forex',
  CRYPTO = 'crypto',
}

/** How a strategy is executed */
export enum ExecutionMode {
  /** User manually places every trade */
  MANUAL = 'manual',
  /** System suggests, user confirms */
  SEMI_AUTO = 'semi_auto',
  /** System executes automatically */
  FULL_AUTO = 'full_auto',
}

/** Automation level for the platform */
export enum AutomationLevel {
  /** No automation — analysis only */
  ANALYSIS = 'analysis',
  /** Alerts and signals */
  SIGNALS = 'signals',
  /** Semi-automated execution */
  SEMI_AUTOMATED = 'semi_automated',
  /** Fully automated execution */
  FULLY_AUTOMATED = 'fully_automated',
}

/** How a strategy was created */
export enum CreationMode {
  /** Created manually by the user */
  MANUAL = 'manual',
  /** Created with AI assistance */
  AI_ASSISTED = 'ai_assisted',
  /** Created from a template */
  TEMPLATE = 'template',
  /** Imported from external source */
  IMPORTED = 'imported',
}

/** Supported currencies */
export type Currency = 'EUR' | 'USD' | 'GBP' | 'USDC' | 'USDT';

/** Time interval for candles/charts */
export type TimeInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w' | '1M';

/** Trade direction */
export enum Direction {
  LONG = 'long',
  SHORT = 'short',
}

/** Order type */
export enum OrderType {
  MARKET = 'market',
  LIMIT = 'limit',
  STOP = 'stop',
  STOP_LIMIT = 'stop_limit',
}

/** Generic status for async operations */
export enum OperationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/** Pagination params */
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** Paginated response */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/** Generic API response */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}
