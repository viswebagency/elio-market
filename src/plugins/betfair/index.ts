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
import type { BetfairRunner } from '@/types/betfair';

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

  async initialize(_config: PluginConnectionConfig): Promise<void> {
    this.status = 'initializing';
    try {
      // Il nuovo adapter gestisce autenticazione internamente via BetfairClient
      this.adapter = new BetfairAdapter();
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
      await this.adapter.listEvents({ sportId: '1' }); // Soccer
      return true;
    } catch {
      return false;
    }
  }

  async getPrice(symbol: string): Promise<NormalizedPrice> {
    this.ensureReady();
    const [, marketId, selectionId] = symbol.split(':');
    const books = await this.adapter!.listMarketBook([marketId]);
    const book = books[0];
    if (!book) throw new Error(`Market ${marketId} not found`);
    const runner = book.runners.find((r: BetfairRunner) => String(r.selectionId) === selectionId);
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
