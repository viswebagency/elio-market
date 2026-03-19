/**
 * Forex API adapter — handles HTTP requests to forex data providers (OANDA).
 */

import { OANDA_API_BASE } from './constants';
import { ForexPair, ForexCandle } from './types';

export class ForexAdapter {
  private apiKey: string;
  private accountId: string;

  constructor(apiKey: string, accountId: string) {
    this.apiKey = apiKey;
    this.accountId = accountId;
  }

  /** Get current prices for instruments */
  async getPricing(instruments: string[]): Promise<ForexPair[]> {
    const params = new URLSearchParams({ instruments: instruments.join(',') });
    const data = await this.apiCall(`/accounts/${this.accountId}/pricing?${params}`);
    return ((data as Record<string, unknown[]>).prices ?? []).map((p: Record<string, unknown>) => ({
      symbol: (p.instrument as string).replace('_', ''),
      base: (p.instrument as string).split('_')[0],
      quote: (p.instrument as string).split('_')[1],
      bid: parseFloat(String((p.bids as Record<string, unknown>[])?.[0]?.price ?? 0)),
      ask: parseFloat(String((p.asks as Record<string, unknown>[])?.[0]?.price ?? 0)),
      spread: 0,
      high24h: 0,
      low24h: 0,
      volume24h: 0,
      timestamp: p.time as string,
    }));
  }

  /** Get candles */
  async getCandles(
    instrument: string,
    granularity: string = 'D',
    count: number = 100
  ): Promise<ForexCandle[]> {
    const params = new URLSearchParams({ granularity, count: String(count) });
    const data = await this.apiCall(
      `/instruments/${instrument}/candles?${params}`
    );
    return ((data as Record<string, unknown[]>).candles ?? []).map((c: Record<string, unknown>) => {
      const mid = c.mid as Record<string, string>;
      return {
        timestamp: c.time as string,
        open: parseFloat(mid.o),
        high: parseFloat(mid.h),
        low: parseFloat(mid.l),
        close: parseFloat(mid.c),
        volume: c.volume as number,
      };
    });
  }

  private async apiCall(path: string): Promise<unknown> {
    const response = await fetch(`${OANDA_API_BASE}${path}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) throw new Error(`OANDA API error: ${response.status}`);
    return response.json();
  }
}
