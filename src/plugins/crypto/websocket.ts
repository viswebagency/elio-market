/**
 * Crypto WebSocket client — real-time price updates via Binance WebSocket.
 */

import { BINANCE_WS_BASE } from './constants';
import { NormalizedPrice } from '@/core/types/market-data';
import { MarketArea } from '@/core/types/common';

type PriceCallback = (price: NormalizedPrice) => void;

export class CryptoWebSocket {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, PriceCallback[]> = new Map();
  private reconnectAttempts = 0;

  /** Connect to Binance combined stream */
  async connect(symbols: string[]): Promise<void> {
    const streams = symbols.map((s) => `${s.toLowerCase()}@ticker`).join('/');
    const url = `${BINANCE_WS_BASE}/${streams}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const payload = data.data ?? data;
          if (payload.e === '24hrTicker') {
            this.handleTicker(payload);
          }
        } catch { /* ignore */ }
      };

      this.ws.onclose = () => this.handleDisconnect(symbols);
      this.ws.onerror = () => reject(new Error('WebSocket connection failed'));
    });
  }

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

  disconnect(): void {
    this.subscriptions.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private handleTicker(data: Record<string, string>): void {
    const symbol = data.s; // Symbol
    const normalized: NormalizedPrice = {
      symbol: `CRY:${symbol}`,
      area: MarketArea.CRYPTO,
      price: parseFloat(data.c), // Last price
      bid: parseFloat(data.b),   // Best bid
      ask: parseFloat(data.a),   // Best ask
      volume24h: parseFloat(data.q), // Quote volume
      change24h: parseFloat(data.P), // Price change percent
      timestamp: new Date(parseInt(data.E)).toISOString(),
      currency: symbol.endsWith('USDC') ? 'USDC' : 'USDT',
    };

    const callbacks = this.subscriptions.get(symbol) ?? [];
    callbacks.forEach((cb) => cb(normalized));
  }

  private handleDisconnect(symbols: string[]): void {
    if (this.reconnectAttempts < 5 && this.subscriptions.size > 0) {
      this.reconnectAttempts++;
      setTimeout(() => this.connect(symbols), 1000 * Math.pow(2, this.reconnectAttempts));
    }
  }
}
