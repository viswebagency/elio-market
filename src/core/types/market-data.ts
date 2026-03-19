/**
 * Normalized market data types — all plugins normalize their data to these types.
 * This is the abstraction layer that makes the platform plugin-agnostic.
 */

import { MarketArea, Currency, TimeInterval } from './common';

/** Normalized price tick */
export interface NormalizedPrice {
  symbol: string;
  area: MarketArea;
  /** Current price / probability */
  price: number;
  /** Bid price */
  bid?: number;
  /** Ask price */
  ask?: number;
  /** Spread */
  spread?: number;
  /** 24h volume */
  volume24h?: number;
  /** 24h change percentage */
  change24h?: number;
  /** Last update timestamp (ISO) */
  timestamp: string;
  currency: Currency;
}

/** Normalized OHLCV candle */
export interface NormalizedCandle {
  symbol: string;
  area: MarketArea;
  interval: TimeInterval;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Number of trades in this candle */
  trades?: number;
  /** Candle open time */
  openTime: string;
  /** Candle close time */
  closeTime: string;
}

/** Normalized market/instrument description */
export interface NormalizedMarket {
  /** Internal symbol (used across the platform) */
  symbol: string;
  /** External symbol on the platform */
  externalSymbol: string;
  /** Human-readable name */
  name: string;
  area: MarketArea;
  /** Category (e.g., "Politics", "Tech", "Forex Majors") */
  category: string;
  /** Sub-category */
  subCategory?: string;
  /** Market status */
  status: MarketStatus;
  /** Trading currency */
  currency: Currency;
  /** Minimum trade size */
  minSize?: number;
  /** Size step/increment */
  sizeStep?: number;
  /** Price step/tick size */
  tickSize?: number;
  /** 24h volume */
  volume24h?: number;
  /** Liquidity score (0-100) */
  liquidityScore?: number;
  /** Expiry date (for prediction markets, futures) */
  expiryDate?: string;
  /** Additional plugin-specific data */
  metadata?: Record<string, unknown>;
}

export type MarketStatus = 'open' | 'closed' | 'suspended' | 'settled' | 'expired';

/** Order book level */
export interface OrderBookLevel {
  price: number;
  size: number;
  /** Number of orders at this level */
  orders?: number;
}

/** Normalized order book */
export interface NormalizedOrderBook {
  symbol: string;
  area: MarketArea;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: string;
}

/** Market data snapshot (used in dashboards) */
export interface MarketDataSnapshot {
  prices: NormalizedPrice[];
  topMovers: NormalizedPrice[];
  totalMarkets: number;
  lastUpdated: string;
}
