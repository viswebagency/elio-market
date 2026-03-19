/**
 * TimescaleDB types — row types for time-series tables.
 */

/** Price tick row (hypertable) */
export interface PriceTickRow {
  time: Date;
  symbol: string;
  area: string;
  price: number;
  bid: number | null;
  ask: number | null;
  volume: number | null;
}

/** Candle row (continuous aggregate) */
export interface CandleRow {
  bucket: Date;
  symbol: string;
  area: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
}

/** Audit log row (hypertable) */
export interface AuditLogRow {
  time: Date;
  user_id: string;
  action: string;
  trade_id: string | null;
  data: Record<string, unknown>;
}

/** Metric row (hypertable) */
export interface MetricRow {
  time: Date;
  user_id: string;
  strategy_id: string | null;
  metric_name: string;
  metric_value: number;
}
