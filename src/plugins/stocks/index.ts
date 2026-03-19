/**
 * Stocks plugin — equity markets.
 * Implements the MarketPlugin interface.
 */

import { MarketArea, Currency, TimeInterval } from '@/core/types/common';
import {
  MarketPlugin, PluginCapabilities, PluginConnectionConfig,
  PluginStatus, MarketFilter,
} from '@/core/types/plugin';
import { NormalizedPrice, NormalizedCandle, NormalizedMarket } from '@/core/types/market-data';
import { Trade, TradeExecution } from '@/core/types/trade';
import { StocksAdapter } from './adapter';
import { normalizeStockQuote, normalizeStockCandle } from './normalizer';

export class StocksPlugin implements MarketPlugin {
  readonly id = 'stocks';
  readonly name = 'Stocks';
  readonly area = MarketArea.STOCKS;
  readonly currencies: Currency[] = ['EUR', 'USD', 'GBP'];
  status: PluginStatus = 'registered';

  readonly capabilities: PluginCapabilities = {
    realtime: false, // Free tier = polling
    execution: false, // Phase 2
    orderHistory: false,
    portfolio: false,
    backtest: true,
    orderManagement: false,
  };

  private adapter: StocksAdapter | null = null;

  async initialize(config: PluginConnectionConfig): Promise<void> {
    this.status = 'initializing';
    try {
      if (!config.apiKey) throw new Error('Stock data API key required');
      this.adapter = new StocksAdapter(config.apiKey);
      this.status = 'ready';
    } catch (error) {
      this.status = 'error';
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.adapter = null;
    this.status = 'registered';
  }

  async healthCheck(): Promise<boolean> {
    if (!this.adapter) return false;
    try {
      await this.adapter.getQuote('AAPL');
      return true;
    } catch { return false; }
  }

  async getPrice(symbol: string): Promise<NormalizedPrice> {
    this.ensureReady();
    const raw = symbol.replace('STK:', '');
    const quote = await this.adapter!.getQuote(raw);
    return normalizeStockQuote(quote);
  }

  async getCandles(symbol: string, interval: TimeInterval, limit?: number): Promise<NormalizedCandle[]> {
    this.ensureReady();
    const raw = symbol.replace('STK:', '');
    const intervalMap: Record<string, string> = { '1d': 'daily', '1w': 'weekly', '1M': 'monthly' };
    const candles = await this.adapter!.getCandles(raw, intervalMap[interval] ?? 'daily');
    return candles
      .slice(0, limit ?? 100)
      .map((c) => normalizeStockCandle(raw, c, interval));
  }

  async getMarkets(_filter?: MarketFilter): Promise<NormalizedMarket[]> {
    this.ensureReady();
    return []; // TODO: implement search
  }

  async placeTrade(_trade: Trade): Promise<TradeExecution> {
    throw new Error('Stock execution not yet implemented');
  }

  private ensureReady(): void {
    if (this.status !== 'ready' || !this.adapter) {
      throw new Error('Stocks plugin not initialized.');
    }
  }
}
