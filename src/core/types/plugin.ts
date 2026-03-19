/**
 * Plugin interface — the contract every market plugin must implement.
 * Each plugin (Polymarket, Betfair, Stocks, Forex, Crypto) must conform to this interface.
 */

import { MarketArea, Currency, TimeInterval } from './common';
import { NormalizedPrice, NormalizedCandle, NormalizedMarket } from './market-data';
import { Trade, TradeExecution, TradeResult } from './trade';

/** Plugin lifecycle status */
export type PluginStatus = 'registered' | 'initializing' | 'ready' | 'error' | 'disabled';

/** Capability flags a plugin can declare */
export interface PluginCapabilities {
  /** Supports real-time WebSocket streaming */
  realtime: boolean;
  /** Supports placing orders */
  execution: boolean;
  /** Supports reading order history */
  orderHistory: boolean;
  /** Supports portfolio/balance read */
  portfolio: boolean;
  /** Supports backtesting with historical data */
  backtest: boolean;
  /** Supports cancel/modify orders */
  orderManagement: boolean;
}

/** Configuration required to connect to a plugin's data source */
export interface PluginConnectionConfig {
  /** API key (encrypted at rest) */
  apiKey?: string;
  /** API secret (encrypted at rest) */
  apiSecret?: string;
  /** Base URL override */
  baseUrl?: string;
  /** Additional plugin-specific config */
  extra?: Record<string, unknown>;
}

/** The core plugin interface */
export interface MarketPlugin {
  /** Unique plugin identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Which market area this plugin serves */
  readonly area: MarketArea;
  /** Supported currencies */
  readonly currencies: Currency[];
  /** Current status */
  status: PluginStatus;
  /** What this plugin can do */
  readonly capabilities: PluginCapabilities;

  // --- Lifecycle ---
  /** Initialize the plugin with connection config */
  initialize(config: PluginConnectionConfig): Promise<void>;
  /** Gracefully shut down the plugin */
  shutdown(): Promise<void>;
  /** Health check — returns true if the plugin is operational */
  healthCheck(): Promise<boolean>;

  // --- Market Data ---
  /** Get current price for a symbol/market */
  getPrice(symbol: string): Promise<NormalizedPrice>;
  /** Get historical candles */
  getCandles(symbol: string, interval: TimeInterval, limit?: number): Promise<NormalizedCandle[]>;
  /** List available markets/symbols */
  getMarkets(filter?: MarketFilter): Promise<NormalizedMarket[]>;
  /** Subscribe to real-time price updates (if capable) */
  subscribe?(symbols: string[], callback: (price: NormalizedPrice) => void): Promise<() => void>;

  // --- Execution ---
  /** Place a trade (if capable) */
  placeTrade?(trade: Trade): Promise<TradeExecution>;
  /** Cancel a pending order (if capable) */
  cancelOrder?(orderId: string): Promise<boolean>;
  /** Get trade result/status */
  getTradeResult?(executionId: string): Promise<TradeResult>;

  // --- Portfolio ---
  /** Get current balance */
  getBalance?(): Promise<PluginBalance>;
  /** Get open positions */
  getOpenPositions?(): Promise<PluginPosition[]>;
}

/** Filter for market search */
export interface MarketFilter {
  query?: string;
  category?: string;
  minVolume?: number;
  status?: 'open' | 'closed' | 'suspended';
}

/** Balance returned by a plugin */
export interface PluginBalance {
  total: number;
  available: number;
  locked: number;
  currency: Currency;
}

/** Open position from a plugin */
export interface PluginPosition {
  symbol: string;
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  currency: Currency;
}
