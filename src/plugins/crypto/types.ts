/**
 * Crypto-specific types — cryptocurrency exchange data structures.
 */

export interface CryptoTicker {
  symbol: string;       // e.g., "BTCUSDT"
  baseAsset: string;    // e.g., "BTC"
  quoteAsset: string;   // e.g., "USDT"
  price: number;
  bid: number;
  ask: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  quoteVolume24h: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  timestamp: string;
}

export interface CryptoCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
}

export interface CryptoOrder {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS_LIMIT' | 'TAKE_PROFIT_LIMIT';
  price?: number;
  stopPrice?: number;
  quantity: number;
  executedQty: number;
  status: 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'REJECTED' | 'EXPIRED';
  timestamp: string;
}

export interface CryptoBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
  btcValue: number;
}

export interface CryptoPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  markPrice: number;
  quantity: number;
  unrealizedPnl: number;
  leverage: number;
  marginType: 'isolated' | 'cross';
}
