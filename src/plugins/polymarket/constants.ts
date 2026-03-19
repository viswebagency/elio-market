/**
 * Polymarket constants — API endpoints, categories, and configuration.
 */

export const POLYMARKET_API_BASE = 'https://clob.polymarket.com';
export const POLYMARKET_GAMMA_API = 'https://gamma-api.polymarket.com';
export const POLYMARKET_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

export const POLYMARKET_CHAIN_ID = 137; // Polygon

export const POLYMARKET_CATEGORIES = [
  'Politics',
  'Sports',
  'Crypto',
  'Pop Culture',
  'Business',
  'Science',
  'Technology',
  'World',
] as const;

export type PolymarketCategory = (typeof POLYMARKET_CATEGORIES)[number];

/** Rate limits */
export const POLYMARKET_RATE_LIMITS = {
  requestsPerSecond: 10,
  requestsPerMinute: 300,
};
