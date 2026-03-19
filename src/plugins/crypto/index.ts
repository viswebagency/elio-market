/**
 * Crypto plugin — cryptocurrency markets via Binance.
 * Implements the MarketPlugin interface.
 */

import { MarketArea, Currency, TimeInterval } from '@/core/types/common';
import {
  MarketPlugin, PluginCapabilities, PluginConnectionConfig,
  PluginStatus, MarketFilter,
} from '@/core/types/plugin';
import { NormalizedPrice, NormalizedCandle, NormalizedMarket } from '@/core/types/market-data';
import { Trade, TradeExecution } from '@/core/types/trade';
import { CryptoAdapter } from './adapter';
import { normalizeCryptoTicker, normalizeCryptoCandle, normalizeCryptoToMarket } from './normalizer';
import { CryptoWebSocket } from './websocket';
import { CRYPTO_TOP_PAIRS } from './constants';

export class CryptoPlugin implements MarketPlugin {
  readonly id = 'crypto';
  readonly name = 'Crypto';
  readonly area = MarketArea.CRYPTO;
  readonly currencies: Currency[] = ['USDT', 'USDC', 'EUR'];
  status: PluginStatus = 'registered';

  readonly capabilities: PluginCapabilities = {
    realtime: true,
    execution: true,
    orderHistory: true,
    portfolio: true,
    backtest: true,
    orderManagement: true,
  };

  private adapter: CryptoAdapter | null = null;
  private ws: CryptoWebSocket | null = null;

  async initialize(config: PluginConnectionConfig): Promise<void> {
    this.status = 'initializing';
    try {
      this.adapter = new CryptoAdapter(config.apiKey, config.apiSecret);
      this.ws = new CryptoWebSocket();
      this.status = 'ready';
    } catch (error) {
      this.status = 'error';
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.ws?.disconnect();
    this.ws = null;
    this.adapter = null;
    this.status = 'registered';
  }

  async healthCheck(): Promise<boolean> {
    if (!this.adapter) return false;
    try {
      await this.adapter.getTicker('BTCUSDT');
      return true;
    } catch { return false; }
  }

  async getPrice(symbol: string): Promise<NormalizedPrice> {
    this.ensureReady();
    const raw = symbol.replace('CRY:', '');
    const ticker = await this.adapter!.getTicker(raw);
    return normalizeCryptoTicker(ticker);
  }

  async getCandles(symbol: string, interval: TimeInterval, limit?: number): Promise<NormalizedCandle[]> {
    this.ensureReady();
    const raw = symbol.replace('CRY:', '');
    const intervalMap: Record<string, string> = {
      '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w',
    };
    const candles = await this.adapter!.getCandles(
      raw,
      intervalMap[interval] ?? '1d',
      limit ?? 100
    );
    return candles.map((c) => normalizeCryptoCandle(raw, c, interval));
  }

  async getMarkets(_filter?: MarketFilter): Promise<NormalizedMarket[]> {
    this.ensureReady();
    const tickers = await Promise.all(
      CRYPTO_TOP_PAIRS.map((p) => this.adapter!.getTicker(p))
    );
    return tickers.map(normalizeCryptoToMarket);
  }

  async subscribe(symbols: string[], callback: (price: NormalizedPrice) => void): Promise<() => void> {
    this.ensureReady();
    if (!this.ws) throw new Error('WebSocket not initialized');

    const rawSymbols = symbols.map((s) => s.replace('CRY:', ''));
    rawSymbols.forEach((s) => this.ws!.subscribe(s, callback));
    await this.ws.connect(rawSymbols);

    return () => this.ws?.disconnect();
  }

  async placeTrade(_trade: Trade): Promise<TradeExecution> {
    this.ensureReady();
    throw new Error('Crypto trade execution not yet implemented');
  }

  private ensureReady(): void {
    if (this.status !== 'ready' || !this.adapter) {
      throw new Error('Crypto plugin not initialized.');
    }
  }
}
