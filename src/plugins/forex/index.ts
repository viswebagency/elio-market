/**
 * Forex plugin — foreign exchange markets.
 * Implements the MarketPlugin interface.
 */

import { MarketArea, Currency, TimeInterval } from '@/core/types/common';
import {
  MarketPlugin, PluginCapabilities, PluginConnectionConfig,
  PluginStatus, MarketFilter,
} from '@/core/types/plugin';
import { NormalizedPrice, NormalizedCandle, NormalizedMarket } from '@/core/types/market-data';
import { Trade, TradeExecution } from '@/core/types/trade';
import { ForexAdapter } from './adapter';
import { normalizeForexPair, normalizeForexCandle, normalizeForexToMarket } from './normalizer';
import { FOREX_MAJOR_PAIRS } from './constants';

export class ForexPlugin implements MarketPlugin {
  readonly id = 'forex';
  readonly name = 'Forex';
  readonly area = MarketArea.FOREX;
  readonly currencies: Currency[] = ['EUR', 'USD', 'GBP'];
  status: PluginStatus = 'registered';

  readonly capabilities: PluginCapabilities = {
    realtime: true,
    execution: false,
    orderHistory: false,
    portfolio: false,
    backtest: true,
    orderManagement: false,
  };

  private adapter: ForexAdapter | null = null;

  async initialize(config: PluginConnectionConfig): Promise<void> {
    this.status = 'initializing';
    try {
      if (!config.apiKey) throw new Error('Forex API key required');
      const accountId = (config.extra?.accountId as string) ?? '';
      this.adapter = new ForexAdapter(config.apiKey, accountId);
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
      await this.adapter.getPricing(['EUR_USD']);
      return true;
    } catch { return false; }
  }

  async getPrice(symbol: string): Promise<NormalizedPrice> {
    this.ensureReady();
    const raw = symbol.replace('FX:', '');
    const oandaSymbol = `${raw.slice(0, 3)}_${raw.slice(3)}`;
    const pairs = await this.adapter!.getPricing([oandaSymbol]);
    if (pairs.length === 0) throw new Error(`No pricing for ${symbol}`);
    return normalizeForexPair(pairs[0]);
  }

  async getCandles(symbol: string, interval: TimeInterval, limit?: number): Promise<NormalizedCandle[]> {
    this.ensureReady();
    const raw = symbol.replace('FX:', '');
    const oandaSymbol = `${raw.slice(0, 3)}_${raw.slice(3)}`;
    const granularityMap: Record<string, string> = {
      '1m': 'M1', '5m': 'M5', '15m': 'M15', '1h': 'H1', '4h': 'H4', '1d': 'D', '1w': 'W',
    };
    const candles = await this.adapter!.getCandles(
      oandaSymbol,
      granularityMap[interval] ?? 'D',
      limit ?? 100
    );
    return candles.map((c) => normalizeForexCandle(raw, c, interval));
  }

  async getMarkets(_filter?: MarketFilter): Promise<NormalizedMarket[]> {
    this.ensureReady();
    const instruments = FOREX_MAJOR_PAIRS.map((p) => `${p.slice(0, 3)}_${p.slice(3)}`);
    const pairs = await this.adapter!.getPricing(instruments);
    return pairs.map(normalizeForexToMarket);
  }

  async placeTrade(_trade: Trade): Promise<TradeExecution> {
    throw new Error('Forex execution not yet implemented');
  }

  private ensureReady(): void {
    if (this.status !== 'ready' || !this.adapter) {
      throw new Error('Forex plugin not initialized.');
    }
  }
}
