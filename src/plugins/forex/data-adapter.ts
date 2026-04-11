/**
 * Forex Data Adapter — Twelve Data (free tier, same as stocks)
 *
 * Uses Twelve Data for free forex market data:
 * - 8 calls/min, 800/day on free tier
 * - Supports all major/cross pairs: EUR/USD, GBP/USD, etc.
 * - Batch quotes: 1 API call for multiple pairs
 *
 * OANDA adapter (adapter.ts) is kept for future live trading via MT5.
 * This adapter is for paper trading data only.
 */

import { ForexPair } from './types';

const TWELVE_DATA_BASE = 'https://api.twelvedata.com';

export interface ForexDataAdapterConfig {
  apiKey: string;
}

/** Token-bucket rate limiter (same pattern as StocksAdapter) */
class TwelveDataForexRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillInterval: number;

  constructor(maxTokens = 8, refillIntervalMs = 60_000) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
    this.refillInterval = refillIntervalMs;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= this.refillInterval) {
      this.tokens = this.maxTokens;
      this.lastRefill = now;
    }
    if (this.tokens > 0) {
      this.tokens--;
      return;
    }
    const waitMs = this.refillInterval - elapsed + 50;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.tokens = this.maxTokens - 1;
    this.lastRefill = Date.now();
  }
}

export class ForexDataAdapter {
  private apiKey: string;
  private rateLimiter = new TwelveDataForexRateLimiter();

  constructor(config: ForexDataAdapterConfig) {
    this.apiKey = config.apiKey;
  }

  /**
   * Get batch quotes for multiple forex pairs in a single API call.
   * Twelve Data accepts comma-separated symbols: EUR/USD,GBP/USD,...
   */
  async getBatchQuotes(pairs: string[]): Promise<ForexPair[]> {
    if (pairs.length === 0) return [];

    // Convert EURUSD → EUR/USD for Twelve Data
    const tdSymbols = pairs.map(p => `${p.slice(0, 3)}/${p.slice(3)}`);
    const symbolParam = tdSymbols.join(',');

    const data = await this.twelveDataCall(`/quote?symbol=${symbolParam}`);

    if (!data) return [];

    // Single symbol returns object directly, multiple returns keyed object
    if (pairs.length === 1) {
      if (data.status === 'error' || !data.close) return [];
      return [this.parseForexQuote(data, pairs[0])];
    }

    const results: ForexPair[] = [];
    for (let i = 0; i < tdSymbols.length; i++) {
      const key = tdSymbols[i];
      const entry = data[key];
      if (!entry || entry.status === 'error' || !entry.close) continue;
      results.push(this.parseForexQuote(entry, pairs[i]));
    }

    return results;
  }

  /** Get single pair quote */
  async getQuote(pair: string): Promise<ForexPair> {
    const quotes = await this.getBatchQuotes([pair]);
    if (quotes.length === 0) throw new Error(`No quote for ${pair}`);
    return quotes[0];
  }

  /** Health check */
  async ping(): Promise<boolean> {
    try {
      await this.getQuote('EURUSD');
      return true;
    } catch {
      return false;
    }
  }

  private parseForexQuote(data: Record<string, unknown>, pairSymbol: string): ForexPair {
    const price = parseFloat(String(data.close ?? 0));
    const open = parseFloat(String(data.open ?? 0));
    const high = parseFloat(String(data.high ?? 0));
    const low = parseFloat(String(data.low ?? 0));
    const previousClose = parseFloat(String(data.previous_close ?? price));

    // Estimate bid/ask from price (spread ~1 pip for majors)
    const isJpy = pairSymbol.includes('JPY');
    const spread = isJpy ? 0.02 : 0.0002;

    return {
      symbol: pairSymbol,
      base: pairSymbol.slice(0, 3),
      quote: pairSymbol.slice(3),
      bid: price - spread / 2,
      ask: price + spread / 2,
      spread,
      high24h: high,
      low24h: low,
      volume24h: 0, // Forex volume not reliably available via Twelve Data
      timestamp: String(data.datetime ?? new Date().toISOString()),
      open,
      previousClose,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async twelveDataCall(path: string): Promise<any> {
    await this.rateLimiter.acquire();

    const separator = path.includes('?') ? '&' : '?';
    const url = `${TWELVE_DATA_BASE}${path}${separator}apikey=${this.apiKey}`;

    const response = await fetch(url);

    if (response.status === 429) {
      throw new Error('Rate limit exceeded — Twelve Data (forex)');
    }
    if (!response.ok) {
      throw new Error(`Twelve Data API error (forex): ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}

// ---------------------------------------------------------------------------
// Forex market hours — 24/5
// ---------------------------------------------------------------------------

/**
 * Forex market is open 24/5:
 * Opens: Sunday 22:00 UTC (Sydney session)
 * Closes: Friday 22:00 UTC (NY session close)
 */
export function isForexMarketOpen(now = new Date()): boolean {
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  const hour = now.getUTCHours();

  // Saturday: always closed
  if (day === 6) return false;

  // Sunday: closed before 22:00 UTC
  if (day === 0 && hour < 22) return false;

  // Friday: closed after 22:00 UTC
  if (day === 5 && hour >= 22) return false;

  return true;
}
