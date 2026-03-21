/**
 * Crypto constants — exchange endpoints, pairs and configuration.
 */

export const BINANCE_API_BASE = 'https://api.binance.com/api/v3';
export const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/ws';
export const BINANCE_FUTURES_API = 'https://fapi.binance.com/fapi/v1';

export const BYBIT_API_BASE = 'https://api.bybit.com/v5';
export const BYBIT_WS_BASE = 'wss://stream.bybit.com/v5/public/spot';

/** Top crypto pairs — used for scanning and paper trading */
export const CRYPTO_TOP_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
  'ADA/USDT', 'DOGE/USDT', 'AVAX/USDT', 'DOT/USDT', 'MATIC/USDT',
] as const;

/** Legacy format (without slash) for backward compatibility */
export const CRYPTO_TOP_PAIRS_RAW = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT',
] as const;

export const CRYPTO_STABLECOINS = ['USDT', 'USDC', 'BUSD', 'DAI'] as const;

/** Typical crypto volatility profiles (annualized) */
export const CRYPTO_VOLATILITY = {
  BTC: 0.60,
  ETH: 0.75,
  SOL: 1.10,
  BNB: 0.70,
  XRP: 0.90,
  ADA: 0.95,
  DOGE: 1.20,
  AVAX: 1.00,
  DOT: 0.90,
  MATIC: 1.00,
} as const;

export const CRYPTO_RATE_LIMITS = {
  binance: {
    requestWeight: 1200,
    ordersPerSecond: 10,
    ordersPerDay: 200000,
  },
  bybit: {
    requestsPerSecond: 10,
    ordersPerSecond: 10,
  },
};

/** Paper trading tick interval for crypto (ms) */
export const CRYPTO_TICK_INTERVAL_MS = 60_000; // 1 min
export const CRYPTO_PAPER_TICK_INTERVAL_MS = 120_000; // 2 min for paper trading

/** Max sizing per trade as % of portfolio */
export const CRYPTO_MAX_SIZING_PCT = 5;
