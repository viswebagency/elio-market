/**
 * Stocks WebSocket client — real-time price updates.
 * Uses polling as a fallback since most free stock APIs don't offer WebSocket.
 */

import { NormalizedPrice } from '@/core/types/market-data';
import { StocksAdapter } from './adapter';
import { normalizeStockQuote } from './normalizer';

type PriceCallback = (price: NormalizedPrice) => void;

export class StocksWebSocket {
  private adapter: StocksAdapter;
  private subscriptions: Map<string, PriceCallback[]> = new Map();
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(adapter: StocksAdapter) {
    this.adapter = adapter;
  }

  /** Start polling for price updates */
  start(intervalMs = 5000): void {
    this.pollInterval = setInterval(() => this.poll(), intervalMs);
  }

  /** Subscribe to updates for a symbol */
  subscribe(symbol: string, callback: PriceCallback): () => void {
    const existing = this.subscriptions.get(symbol) ?? [];
    existing.push(callback);
    this.subscriptions.set(symbol, existing);

    return () => {
      const cbs = this.subscriptions.get(symbol) ?? [];
      const idx = cbs.indexOf(callback);
      if (idx > -1) cbs.splice(idx, 1);
      if (cbs.length === 0) this.subscriptions.delete(symbol);
    };
  }

  /** Stop polling */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.subscriptions.clear();
  }

  private async poll(): Promise<void> {
    for (const symbol of Array.from(this.subscriptions.keys())) {
      try {
        const quote = await this.adapter.getQuote(symbol);
        const normalized = normalizeStockQuote(quote);
        const callbacks = this.subscriptions.get(symbol) ?? [];
        callbacks.forEach((cb) => cb(normalized));
      } catch {
        // Skip failed quotes silently
      }
    }
  }
}
