/**
 * Forex-specific types — foreign exchange data structures.
 */

export interface ForexPair {
  symbol: string;       // e.g., "EURUSD"
  base: string;         // e.g., "EUR"
  quote: string;        // e.g., "USD"
  bid: number;
  ask: number;
  spread: number;       // In pips
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: string;
  open?: number;          // Opening price (from data adapter)
  previousClose?: number; // Previous close (for price change calculation)
}

export interface ForexCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tickVolume?: number;
}

export interface ForexOrder {
  orderId: string;
  pair: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP';
  lots: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  status: 'PENDING' | 'OPEN' | 'CLOSED' | 'CANCELLED';
  openPrice?: number;
  closePrice?: number;
  profit?: number;
  swap?: number;
  commission?: number;
  openTime?: string;
  closeTime?: string;
}

export interface ForexPosition {
  pair: string;
  side: 'LONG' | 'SHORT';
  lots: number;
  openPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  swap: number;
  margin: number;
}

/** Pip value info */
export interface PipInfo {
  pair: string;
  pipSize: number;     // e.g., 0.0001 for EURUSD, 0.01 for USDJPY
  pipValue: number;     // Value of 1 pip per standard lot
}
