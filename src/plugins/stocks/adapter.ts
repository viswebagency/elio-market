/**
 * Stocks API adapter — Twelve Data REST API for market data.
 *
 * Twelve Data free tier: 8 calls/min, 800 calls/day.
 * Key advantage: batch endpoint — 1 call fetches up to 120 symbols.
 * With 10 tickers batched = ~162 calls/day (well within 800).
 *
 * Copertura: US + EU (XETRA, Euronext, LSE, Borsa Italiana).
 * IBKR adapter will be added when switching to live trading.
 */

import { StockQuote, StockCandle } from './types';

const TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';

// ---------------------------------------------------------------------------
// Rate limiter — token bucket for Twelve Data 8 calls/min
// ---------------------------------------------------------------------------

class TwelveDataRateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  private lastRefill: number;

  constructor(maxTokens = 8, refillPerMinute = 8) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillPerMinute / 60_000; // per ms
    this.lastRefill = Date.now();
  }

  /** Wait until a token is available, then consume it */
  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }
    // Wait for next token
    const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens--;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

// ---------------------------------------------------------------------------
// Market hours (NYSE)
// ---------------------------------------------------------------------------

/** NYSE trading hours in UTC: 14:30 - 21:00 */
export const NYSE_OPEN_UTC = { hour: 14, minute: 30 };
export const NYSE_CLOSE_UTC = { hour: 21, minute: 0 };

/** Check if NYSE is currently open (weekday + within trading hours) */
export function isMarketOpen(now = new Date()): boolean {
  const day = now.getUTCDay();
  // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return false;

  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const openMinutes = NYSE_OPEN_UTC.hour * 60 + NYSE_OPEN_UTC.minute;
  const closeMinutes = NYSE_CLOSE_UTC.hour * 60 + NYSE_CLOSE_UTC.minute;

  return utcMinutes >= openMinutes && utcMinutes < closeMinutes;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export interface StockAdapterConfig {
  apiKey: string;
  /** Max API calls per minute (default 8 for free tier) */
  maxCallsPerMinute?: number;
}

export class StocksAdapter {
  private apiKey: string;
  private rateLimiter: TwelveDataRateLimiter;

  constructor(config: StockAdapterConfig) {
    this.apiKey = config.apiKey;
    this.rateLimiter = new TwelveDataRateLimiter(
      config.maxCallsPerMinute ?? 8,
      config.maxCallsPerMinute ?? 8,
    );
  }

  /** Get real-time quote for a single symbol */
  async getQuote(symbol: string): Promise<StockQuote> {
    const data = await this.twelveDataCall('/quote', { symbol });

    return {
      symbol: data.symbol ?? symbol,
      name: data.name ?? symbol,
      exchange: data.exchange ?? '',
      price: parseFloat(data.close) || 0,
      open: parseFloat(data.open) || 0,
      high: parseFloat(data.high) || 0,
      low: parseFloat(data.low) || 0,
      close: parseFloat(data.previous_close) || 0,
      previousClose: parseFloat(data.previous_close) || 0,
      volume: parseInt(data.volume) || 0,
      timestamp: data.datetime ?? new Date().toISOString(),
    };
  }

  /** Get quote — same as getQuote (Twelve Data always returns full data) */
  async getQuoteFast(symbol: string): Promise<StockQuote> {
    return this.getQuote(symbol);
  }

  /**
   * Batch fetch quotes for multiple symbols in a SINGLE API call.
   * Twelve Data supports up to 120 symbols per batch request.
   * This is the key advantage: 10 tickers = 1 call instead of 10.
   */
  async getBatchQuotes(symbols: string[]): Promise<StockQuote[]> {
    if (symbols.length === 0) return [];

    // Twelve Data batch: comma-separated symbols
    const symbolList = symbols.join(',');
    const data = await this.twelveDataCall('/quote', { symbol: symbolList });

    const quotes: StockQuote[] = [];

    // Single symbol returns object, multiple returns object keyed by symbol
    if (symbols.length === 1) {
      if (data.status === 'error') return [];
      quotes.push(this.parseQuoteResponse(symbols[0], data));
    } else {
      for (const sym of symbols) {
        const entry = data[sym];
        if (!entry || entry.status === 'error') {
          console.warn(`[StocksAdapter] No data for ${sym}`);
          continue;
        }
        quotes.push(this.parseQuoteResponse(sym, entry));
      }
    }

    return quotes;
  }

  /** Get historical candles for a symbol */
  async getCandles(
    symbol: string,
    interval: '1min' | '5min' | '15min' | '30min' | '1h' | '4h' | '1day' | '1week' | '1month' = '1day',
    outputsize = 30,
  ): Promise<StockCandle[]> {
    const data = await this.twelveDataCall('/time_series', {
      symbol,
      interval,
      outputsize: String(outputsize),
    });

    if (data.status === 'error' || !data.values) return [];

    return data.values.map((v: Record<string, string>) => ({
      timestamp: v.datetime,
      open: parseFloat(v.open) || 0,
      high: parseFloat(v.high) || 0,
      low: parseFloat(v.low) || 0,
      close: parseFloat(v.close) || 0,
      volume: parseInt(v.volume) || 0,
    }));
  }

  /** Get company profile (name, exchange, market cap, etc.) */
  async getCompanyProfile(symbol: string): Promise<{
    name: string;
    exchange: string;
    marketCap: number;
    industry: string;
    currency: string;
  } | null> {
    try {
      const data = await this.twelveDataCall('/profile', { symbol });
      if (!data.name) return null;
      return {
        name: data.name,
        exchange: data.exchange ?? '',
        marketCap: parseFloat(data.market_capitalization) || 0,
        industry: data.sector ?? '',
        currency: data.currency ?? 'USD',
      };
    } catch {
      return null;
    }
  }

  /** Check if the market is currently open */
  getMarketStatus(): { isOpen: boolean; exchange: string; nextOpen: string | null } {
    const now = new Date();
    const open = isMarketOpen(now);

    let nextOpen: string | null = null;
    if (!open) {
      const next = new Date(now);
      next.setUTCHours(NYSE_OPEN_UTC.hour, NYSE_OPEN_UTC.minute, 0, 0);

      if (now.getUTCHours() >= NYSE_CLOSE_UTC.hour || now.getUTCDay() === 0 || now.getUTCDay() === 6) {
        const daysUntilMonday = now.getUTCDay() === 0 ? 1 :
          now.getUTCDay() === 6 ? 2 :
          1;
        next.setUTCDate(next.getUTCDate() + daysUntilMonday);
      }

      nextOpen = next.toISOString();
    }

    return { isOpen: open, exchange: 'NYSE', nextOpen };
  }

  /** Health check */
  async ping(): Promise<boolean> {
    try {
      await this.twelveDataCall('/quote', { symbol: 'AAPL' });
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private parseQuoteResponse(symbol: string, data: Record<string, string>): StockQuote {
    return {
      symbol: data.symbol ?? symbol,
      name: data.name ?? symbol,
      exchange: data.exchange ?? '',
      price: parseFloat(data.close) || 0,
      open: parseFloat(data.open) || 0,
      high: parseFloat(data.high) || 0,
      low: parseFloat(data.low) || 0,
      close: parseFloat(data.previous_close) || 0,
      previousClose: parseFloat(data.previous_close) || 0,
      volume: parseInt(data.volume) || 0,
      timestamp: data.datetime ?? new Date().toISOString(),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async twelveDataCall(endpoint: string, params: Record<string, string>): Promise<any> {
    await this.rateLimiter.acquire();

    const searchParams = new URLSearchParams({ ...params, apikey: this.apiKey });
    const url = `${TWELVE_DATA_BASE_URL}${endpoint}?${searchParams}`;

    const response = await fetch(url);

    if (response.status === 429) {
      throw new Error('[TwelveData] Rate limit exceeded — 8 calls/min');
    }

    if (!response.ok) {
      throw new Error(`[TwelveData] API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}
