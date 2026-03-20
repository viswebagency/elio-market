/**
 * Polymarket API adapter — handles HTTP requests to Polymarket APIs.
 *
 * Delega al PolymarketClient centralizzato per rate limiting,
 * retry con exponential backoff e cache in memoria.
 */

import { getPolymarketClient } from '@/lib/polymarket-client';
import { POLYMARKET_API_BASE } from './constants';
import { PolymarketEvent, PolymarketMarket, PolymarketOrderBookEntry, PolymarketTrade } from './types';

export class PolymarketAdapter {
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  /** Fetch active events from Gamma API */
  async getEvents(params?: {
    limit?: number;
    offset?: number;
    category?: string;
    active?: boolean;
  }): Promise<PolymarketEvent[]> {
    const client = getPolymarketClient();
    const rawEvents = await client.getEvents({
      limit: params?.limit,
      offset: params?.offset,
      active: params?.active,
    });

    // Mappa dal formato raw al formato plugin
    return rawEvents.map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      description: e.description,
      category: e.category ?? 'Uncategorized',
      endDate: e.endDate,
      active: true,
      closed: false,
      markets: (e.markets ?? []).map(mapRawToPluginMarket),
    }));
  }

  /** Fetch a specific market by ID */
  async getMarket(marketId: string): Promise<PolymarketMarket> {
    const client = getPolymarketClient();
    const parsed = await client.getMarket(marketId);
    return {
      id: parsed.id,
      question: parsed.question,
      conditionId: '',
      slug: parsed.slug,
      outcomes: parsed.outcomes,
      outcomePrices: parsed.outcomePrices.map(String),
      volume24hr: parsed.volume24hr,
      liquidity: parsed.liquidity,
      resolved: parsed.closed && !parsed.active,
    };
  }

  /** Fetch market orderbook from CLOB */
  async getOrderBook(tokenId: string): Promise<{
    bids: PolymarketOrderBookEntry[];
    asks: PolymarketOrderBookEntry[];
  }> {
    const client = getPolymarketClient();
    const book = await client.getOrderBook(tokenId);
    return { bids: book.bids, asks: book.asks };
  }

  /** Fetch midpoint price from CLOB */
  async getMidpoint(tokenId: string): Promise<number | null> {
    const client = getPolymarketClient();
    return client.getMidpoint(tokenId);
  }

  /** Fetch market trades from CLOB */
  async getTrades(marketId: string, limit = 50): Promise<PolymarketTrade[]> {
    // Il CLOB trades endpoint ha una struttura diversa,
    // usiamo fetch diretto con auth se disponibile
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const url = `${POLYMARKET_API_BASE}/trades?market=${marketId}&limit=${limit}`;
    const response = await globalThis.fetch(url, { headers });

    if (!response.ok) {
      throw new Error(
        `Polymarket CLOB error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return (Array.isArray(data) ? data : []) as PolymarketTrade[];
  }

  /** Fetch price history (from CLOB trades) */
  async getPriceHistory(marketId: string, limit = 100) {
    const client = getPolymarketClient();
    return client.getPriceHistory(marketId, limit);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRawToPluginMarket(raw: {
  id: string;
  question: string;
  conditionId?: string;
  slug: string;
  outcomes?: string;
  outcomePrices?: string;
  volume24hr?: number;
  liquidityNum?: number;
  liquidity?: string;
  closed?: boolean;
  active?: boolean;
}): PolymarketMarket {
  let outcomes: string[] = [];
  let outcomePrices: string[] = [];

  try {
    outcomes = typeof raw.outcomes === 'string' ? JSON.parse(raw.outcomes) : (raw.outcomes ?? []);
  } catch { /* ignore */ }

  try {
    outcomePrices = typeof raw.outcomePrices === 'string'
      ? JSON.parse(raw.outcomePrices)
      : (raw.outcomePrices ?? []);
  } catch { /* ignore */ }

  return {
    id: raw.id,
    question: raw.question,
    conditionId: raw.conditionId ?? '',
    slug: raw.slug,
    outcomes,
    outcomePrices,
    volume24hr: raw.volume24hr ?? 0,
    liquidity: raw.liquidityNum ?? parseFloat(raw.liquidity ?? '0') ?? 0,
    resolved: (raw.closed ?? false) && !(raw.active ?? true),
  };
}
