/**
 * Crypto constants — exchange endpoints and configuration.
 */

export const BINANCE_API_BASE = 'https://api.binance.com/api/v3';
export const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/ws';
export const BINANCE_FUTURES_API = 'https://fapi.binance.com/fapi/v1';

export const KRAKEN_API_BASE = 'https://api.kraken.com/0';
export const KRAKEN_WS_BASE = 'wss://ws.kraken.com';

export const CRYPTO_TOP_PAIRS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT',
] as const;

export const CRYPTO_STABLECOINS = ['USDT', 'USDC', 'BUSD', 'DAI'] as const;

export const CRYPTO_RATE_LIMITS = {
  binance: {
    requestWeight: 1200, // per minute
    ordersPerSecond: 10,
    ordersPerDay: 200000,
  },
  kraken: {
    requestsPerMinute: 15,
  },
};
