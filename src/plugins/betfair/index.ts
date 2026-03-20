/**
 * Betfair plugin — exchange betting via Betfair.
 * Implements the MarketPlugin interface.
 */

import { MarketArea, Currency, TimeInterval as _TimeInterval } from '@/core/types/common';
import {
  MarketPlugin, PluginCapabilities, PluginConnectionConfig,
  PluginStatus, MarketFilter, PluginBalance,
} from '@/core/types/plugin';
import { NormalizedPrice, NormalizedCandle, NormalizedMarket } from '@/core/types/market-data';
import { Trade, TradeExecution } from '@/core/types/trade';
import { BetfairAdapter } from './adapter';
import { normalizeBetfairMarket as _normalizeBetfairMarket, normalizeBetfairPrice } from './normalizer';

export class BetfairPlugin implements MarketPlugin {
  readonly id = 'betfair';
  readonly name = 'Betfair Exchange';
  readonly area = MarketArea.EXCHANGE_BETTING;
  readonly currencies: Currency[] = ['EUR', 'GBP'];
  status: PluginStatus = 'registered';

  readonly capabilities: PluginCapabilities = {
    realtime: true,
    execution: true,
    orderHistory: true,
    portfolio: true,
    backtest: true,
    orderManagement: true,
  };

  private adapter: BetfairAdapter | null = null;

  async initialize(config: PluginConnectionConfig): Promise<void> {
    this.status = 'initializing';
    try {
      if (!config.apiKey) throw new Error('Betfair app key required');
      this.adapter = new BetfairAdapter(config.apiKey);
      if (config.extra?.username && config.extra?.password) {
        await this.adapter.login(
          config.extra.username as string,
          config.extra.password as string
        );
      }
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
      await this.adapter.listEvents('1'); // Soccer
      return true;
    } catch {
      return false;
    }
  }

  async getPrice(symbol: string): Promise<NormalizedPrice> {
    this.ensureReady();
    const [, marketId, selectionId] = symbol.split(':');
    const book = await this.adapter!.getMarketBook(marketId);
    const runner = book.runners.find((r) => String(r.selectionId) === selectionId);
    if (!runner) throw new Error(`Runner ${selectionId} not found in market ${marketId}`);
    return normalizeBetfairPrice(book, runner);
  }

  async getCandles(): Promise<NormalizedCandle[]> {
    return []; // Betfair doesn't have candle data
  }

  async getMarkets(_filter?: MarketFilter): Promise<NormalizedMarket[]> {
    this.ensureReady();
    // TODO: implement full market listing with filters
    return [];
  }

  async placeTrade(_trade: Trade): Promise<TradeExecution> {
    this.ensureReady();
    throw new Error('Betfair trade execution not yet implemented');
  }

  async getBalance(): Promise<PluginBalance> {
    this.ensureReady();
    throw new Error('Betfair balance read not yet implemented');
  }

  private ensureReady(): void {
    if (this.status !== 'ready' || !this.adapter) {
      throw new Error('Betfair plugin is not initialized.');
    }
  }
}
