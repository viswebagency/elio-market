/**
 * Forex constants — pairs, sessions, and configuration.
 */

export const FOREX_MAJOR_PAIRS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
] as const;

/**
 * Pairs fetched per cron tick on Twelve Data free tier (800 credits/day).
 * Paired with a 15-min cron to stay under budget.
 */
export const FOREX_FREE_TIER_PAIRS = [
  'EURUSD', 'GBPUSD', 'USDJPY',
] as const;

export const FOREX_CROSS_PAIRS = [
  'EURGBP', 'EURJPY', 'EURCHF', 'EURAUD', 'GBPJPY', 'GBPCHF', 'AUDJPY',
] as const;

export const FOREX_SESSIONS = {
  SYDNEY: { open: '22:00', close: '07:00', tz: 'UTC' },
  TOKYO: { open: '00:00', close: '09:00', tz: 'UTC' },
  LONDON: { open: '08:00', close: '17:00', tz: 'UTC' },
  NEW_YORK: { open: '13:00', close: '22:00', tz: 'UTC' },
} as const;

/** Pip sizes for common pairs */
export const PIP_SIZES: Record<string, number> = {
  EURUSD: 0.0001,
  GBPUSD: 0.0001,
  USDJPY: 0.01,
  USDCHF: 0.0001,
  AUDUSD: 0.0001,
  USDCAD: 0.0001,
  NZDUSD: 0.0001,
  EURGBP: 0.0001,
  EURJPY: 0.01,
  GBPJPY: 0.01,
};

/** OANDA API (popular retail forex API) */
export const OANDA_API_BASE = 'https://api-fxpractice.oanda.com/v3';
export const OANDA_STREAM_API = 'https://stream-fxpractice.oanda.com/v3';

export const FOREX_RATE_LIMITS = {
  oanda: { requestsPerSecond: 25 },
};
