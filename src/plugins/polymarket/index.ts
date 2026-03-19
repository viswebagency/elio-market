/**
 * Polymarket plugin — prediction markets via Polymarket.
 * Implements the MarketPlugin interface.
 */

import { MarketArea, Currency, TimeInterval } from '@/core/types/common';
import {
  MarketPlugin,
  PluginCapabilities,
  PluginConnectionConfig,
  PluginStatus,
  MarketFilter,
  PluginBalance,
} from '@/core/types/plugin';
import { NormalizedPrice, NormalizedCandle, NormalizedMarket } from '@/core/types/market-data';
import { Trade, TradeExecution } from '@/core/types/trade';
import { PolymarketAdapter } from './adapter';
import { PolymarketWebSocket } from './websocket';
import { normalizePolymarketMarket, normalizePolymarketPrice } from './normalizer';

export class PolymarketPlugin implements MarketPlugin {
  readonly id = 'polymarket';
  readonly name = 'Polymarket';
  readonly area = MarketArea.PREDICTION;
  readonly currencies: Currency[] = ['USDC'];
  status: PluginStatus = 'registered';

  readonly capabilities: PluginCapabilities = {
    realtime: true,
    execution: true,
    orderHistory: true,
    portfolio: true,
    backtest: true,
    orderManagement: true,
  };

  private adapter: PolymarketAdapter | null = null;
  private ws: PolymarketWebSocket | null = null;

  async initialize(config: PluginConnectionConfig): Promise<void> {
    this.status = 'initializing';
    try {
      this.adapter = new PolymarketAdapter(config.apiKey);
      this.ws = new PolymarketWebSocket();
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
      await this.adapter.getEvents({ limit: 1 });
      return true;
    } catch {
      return false;
    }
  }

  async getPrice(symbol: string): Promise<NormalizedPrice> {
    this.ensureReady();
    const marketId = symbol.replace('PM:', '');
    const market = await this.adapter!.getMarket(marketId);
    return normalizePolymarketPrice(market);
  }

  async getCandles(_symbol: string, _interval: TimeInterval, _limit?: number): Promise<NormalizedCandle[]> {
    // Polymarket doesn't have native candles — build from trade history
    // TODO: implement candle building from trades
    return [];
  }

  async getMarkets(filter?: MarketFilter): Promise<NormalizedMarket[]> {
    this.ensureReady();
    const events = await this.adapter!.getEvents({
      limit: 100,
      active: filter?.status === 'open' ? true : undefined,
    });

    return events.flatMap((event) =>
      event.markets.map((market) => normalizePolymarketMarket(event, market))
    );
  }

  async subscribe(
    symbols: string[],
    callback: (price: NormalizedPrice) => void
  ): Promise<() => void> {
    this.ensureReady();
    if (!this.ws) throw new Error('WebSocket not initialized');

    await this.ws.connect();
    const unsubscribes = symbols.map((s) => {
      const marketId = s.replace('PM:', '');
      return this.ws!.subscribe(marketId, callback);
    });

    return () => unsubscribes.forEach((unsub) => unsub());
  }

  async placeTrade(_trade: Trade): Promise<TradeExecution> {
    this.ensureReady();
    // TODO: implement via CLOB API
    throw new Error('Polymarket trade execution not yet implemented');
  }

  async getBalance(): Promise<PluginBalance> {
    this.ensureReady();
    // TODO: implement balance read
    throw new Error('Polymarket balance read not yet implemented');
  }

  private ensureReady(): void {
    if (this.status !== 'ready' || !this.adapter) {
      throw new Error('Polymarket plugin is not initialized. Call initialize() first.');
    }
  }
}
