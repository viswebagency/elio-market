/**
 * Polymarket WebSocket client — real-time price updates.
 */

import { POLYMARKET_WS_URL } from './constants';
import { NormalizedPrice } from '@/core/types/market-data';
import { normalizePolymarketPrice } from './normalizer';

type PriceCallback = (price: NormalizedPrice) => void;

export class PolymarketWebSocket {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, PriceCallback[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  /** Connect to WebSocket */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(POLYMARKET_WS_URL);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          // Re-subscribe to existing subscriptions
          for (const marketId of this.subscriptions.keys()) {
            this.sendSubscribe(marketId);
          }
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onclose = () => {
          this.handleDisconnect();
        };

        this.ws.onerror = (error) => {
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /** Subscribe to price updates for a market */
  subscribe(marketId: string, callback: PriceCallback): () => void {
    const existing = this.subscriptions.get(marketId) ?? [];
    existing.push(callback);
    this.subscriptions.set(marketId, existing);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(marketId);
    }

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscriptions.get(marketId) ?? [];
      const index = callbacks.indexOf(callback);
      if (index > -1) callbacks.splice(index, 1);
      if (callbacks.length === 0) {
        this.subscriptions.delete(marketId);
        this.sendUnsubscribe(marketId);
      }
    };
  }

  /** Disconnect */
  disconnect(): void {
    this.subscriptions.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private sendSubscribe(marketId: string): void {
    this.ws?.send(JSON.stringify({ type: 'subscribe', market: marketId }));
  }

  private sendUnsubscribe(marketId: string): void {
    this.ws?.send(JSON.stringify({ type: 'unsubscribe', market: marketId }));
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      if (message.type === 'price_update' && message.market) {
        const normalized = normalizePolymarketPrice(message.market);
        const callbacks = this.subscriptions.get(message.market.id) ?? [];
        callbacks.forEach((cb) => cb(normalized));
      }
    } catch {
      // Silently ignore malformed messages
    }
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      setTimeout(() => this.connect(), delay);
    }
  }
}
