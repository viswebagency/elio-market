/**
 * Polymarket API adapter — handles HTTP requests to Polymarket APIs.
 */

import { POLYMARKET_API_BASE, POLYMARKET_GAMMA_API } from './constants';
import { PolymarketEvent, PolymarketMarket, PolymarketTrade } from './types';

export class PolymarketAdapter {
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  /** Fetch active events */
  async getEvents(params?: {
    limit?: number;
    offset?: number;
    category?: string;
    active?: boolean;
  }): Promise<PolymarketEvent[]> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    if (params?.active !== undefined) searchParams.set('active', String(params.active));

    const url = `${POLYMARKET_GAMMA_API}/events?${searchParams}`;
    const response = await this.fetch(url);
    return response as PolymarketEvent[];
  }

  /** Fetch a specific market */
  async getMarket(marketId: string): Promise<PolymarketMarket> {
    const url = `${POLYMARKET_GAMMA_API}/markets/${marketId}`;
    const response = await this.fetch(url);
    return response as PolymarketMarket;
  }

  /** Fetch market trades */
  async getTrades(marketId: string, limit = 50): Promise<PolymarketTrade[]> {
    const url = `${POLYMARKET_API_BASE}/trades?market=${marketId}&limit=${limit}`;
    const response = await this.fetch(url);
    return response as PolymarketTrade[];
  }

  /** Generic fetch with auth and error handling */
  private async fetch(url: string, options?: RequestInit): Promise<unknown> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await globalThis.fetch(url, {
      ...options,
      headers: { ...headers, ...options?.headers },
    });

    if (!response.ok) {
      throw new Error(
        `Polymarket API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }
}
