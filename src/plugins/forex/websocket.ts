/**
 * Forex streaming client — real-time price updates via OANDA streaming API.
 */

import { OANDA_STREAM_API } from './constants';
import { NormalizedPrice } from '@/core/types/market-data';
import { normalizeForexPair } from './normalizer';

type PriceCallback = (price: NormalizedPrice) => void;

export class ForexStreamClient {
  private apiKey: string;
  private accountId: string;
  private abortController: AbortController | null = null;
  private subscriptions: Map<string, PriceCallback[]> = new Map();

  constructor(apiKey: string, accountId: string) {
    this.apiKey = apiKey;
    this.accountId = accountId;
  }

  /** Start streaming prices for subscribed instruments */
  async start(): Promise<void> {
    const instruments = Array.from(this.subscriptions.keys())
      .map((s) => s.replace('/', '_'))
      .join(',');
    if (!instruments) return;

    this.abortController = new AbortController();

    const response = await fetch(
      `${OANDA_STREAM_API}/accounts/${this.accountId}/pricing/stream?instruments=${instruments}`,
      {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: this.abortController.signal,
      }
    );

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.type === 'PRICE') {
            this.handlePrice(data);
          }
        } catch { /* skip heartbeats */ }
      }
    }
  }

  subscribe(pair: string, callback: PriceCallback): () => void {
    const existing = this.subscriptions.get(pair) ?? [];
    existing.push(callback);
    this.subscriptions.set(pair, existing);

    return () => {
      const cbs = this.subscriptions.get(pair) ?? [];
      const idx = cbs.indexOf(callback);
      if (idx > -1) cbs.splice(idx, 1);
      if (cbs.length === 0) this.subscriptions.delete(pair);
    };
  }

  stop(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.subscriptions.clear();
  }

  private handlePrice(data: Record<string, unknown>): void {
    const instrument = (data.instrument as string).replace('_', '');
    const normalized = normalizeForexPair({
      symbol: instrument,
      base: instrument.slice(0, 3),
      quote: instrument.slice(3),
      bid: parseFloat(String((data.bids as Record<string, unknown>[])?.[0]?.price ?? 0)),
      ask: parseFloat(String((data.asks as Record<string, unknown>[])?.[0]?.price ?? 0)),
      spread: 0,
      high24h: 0,
      low24h: 0,
      volume24h: 0,
      timestamp: data.time as string,
    });

    const callbacks = this.subscriptions.get(instrument) ?? [];
    callbacks.forEach((cb) => cb(normalized));
  }
}
