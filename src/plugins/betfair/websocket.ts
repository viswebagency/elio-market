/**
 * Betfair streaming client — real-time price updates via Betfair Stream API.
 */

import { BETFAIR_STREAM_URL, BETFAIR_STREAM_PORT } from './constants';
import { NormalizedPrice } from '@/core/types/market-data';

type PriceCallback = (price: NormalizedPrice) => void;

/**
 * Betfair uses a TCP stream (not WebSocket). This is a stub that will
 * need a Node.js TCP/TLS client in production (not browser-compatible).
 * For the browser, we'll poll the REST API instead.
 */
export class BetfairStreamClient {
  private appKey: string;
  private sessionToken: string;
  private callbacks: Map<string, PriceCallback[]> = new Map();
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(appKey: string, sessionToken: string) {
    this.appKey = appKey;
    this.sessionToken = sessionToken;
  }

  /** Start polling for price updates (browser-compatible alternative to TCP stream) */
  startPolling(intervalMs = 1000): void {
    this.pollInterval = setInterval(() => {
      // TODO: poll market books for subscribed markets
    }, intervalMs);
  }

  /** Subscribe to a market's price updates */
  subscribe(marketId: string, callback: PriceCallback): () => void {
    const existing = this.callbacks.get(marketId) ?? [];
    existing.push(callback);
    this.callbacks.set(marketId, existing);

    return () => {
      const cbs = this.callbacks.get(marketId) ?? [];
      const idx = cbs.indexOf(callback);
      if (idx > -1) cbs.splice(idx, 1);
      if (cbs.length === 0) this.callbacks.delete(marketId);
    };
  }

  /** Stop all subscriptions */
  disconnect(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.callbacks.clear();
  }

  /** Stream API endpoint info (for server-side Node.js implementation) */
  static getStreamConfig() {
    return {
      host: BETFAIR_STREAM_URL,
      port: BETFAIR_STREAM_PORT,
      protocol: 'tls',
    };
  }
}
