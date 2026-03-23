/**
 * Crypto plugin — cryptocurrency markets via ccxt (Binance + Bybit).
 * Implements the MarketPlugin interface.
 */

import { MarketArea, Currency, TimeInterval, Direction, OrderType } from '@/core/types/common';
import {
  MarketPlugin, PluginCapabilities, PluginConnectionConfig,
  PluginStatus, MarketFilter,
} from '@/core/types/plugin';
import { NormalizedPrice, NormalizedCandle, NormalizedMarket } from '@/core/types/market-data';
import { Trade, TradeExecution, TradeExecutionStatus } from '@/core/types/trade';
import { CryptoAdapter, SupportedExchange } from './adapter';
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

  private adapters: Map<SupportedExchange, CryptoAdapter> = new Map();
  private primaryExchange: SupportedExchange = 'binance';
  private ws: CryptoWebSocket | null = null;

  async initialize(config: PluginConnectionConfig): Promise<void> {
    this.status = 'initializing';
    try {
      // Initialize Binance
      if (config.apiKey) {
        const binanceAdapter = new CryptoAdapter({
          exchange: 'binance',
          apiKey: config.apiKey,
          apiSecret: config.apiSecret,
          sandbox: config.extra?.sandbox as boolean | undefined,
        });
        await binanceAdapter.loadMarkets();
        this.adapters.set('binance', binanceAdapter);
      }

      // Initialize Bybit if credentials provided
      const bybitKey = config.extra?.bybitApiKey as string | undefined;
      const bybitSecret = config.extra?.bybitApiSecret as string | undefined;
      if (bybitKey) {
        const bybitAdapter = new CryptoAdapter({
          exchange: 'bybit',
          apiKey: bybitKey,
          apiSecret: bybitSecret,
          sandbox: config.extra?.sandbox as boolean | undefined,
        });
        await bybitAdapter.loadMarkets();
        this.adapters.set('bybit', bybitAdapter);
      }

      if (this.adapters.size === 0) {
        // Public-only mode (no auth)
        const publicAdapter = new CryptoAdapter({ exchange: 'binance' });
        await publicAdapter.loadMarkets();
        this.adapters.set('binance', publicAdapter);
      }

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
    this.adapters.clear();
    this.status = 'registered';
  }

  async healthCheck(): Promise<boolean> {
    const adapter = this.getAdapter();
    if (!adapter) return false;
    return adapter.ping();
  }

  async getPrice(symbol: string): Promise<NormalizedPrice> {
    this.ensureReady();
    const ccxtSymbol = this.toCcxtSymbol(symbol);
    const ticker = await this.getAdapter()!.getTicker(ccxtSymbol);
    return normalizeCryptoTicker(ticker);
  }

  async getCandles(symbol: string, interval: TimeInterval, limit?: number): Promise<NormalizedCandle[]> {
    this.ensureReady();
    const ccxtSymbol = this.toCcxtSymbol(symbol);
    const candles = await this.getAdapter()!.getCandles(ccxtSymbol, interval, limit ?? 100);
    const rawSymbol = ccxtSymbol.replace('/', '');
    return candles.map((c) => normalizeCryptoCandle(rawSymbol, c, interval));
  }

  async getMarkets(_filter?: MarketFilter): Promise<NormalizedMarket[]> {
    this.ensureReady();
    const adapter = this.getAdapter()!;
    const tickers = await Promise.all(
      CRYPTO_TOP_PAIRS.map((p) => adapter.getTicker(p).catch(() => null))
    );
    return tickers
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .map(normalizeCryptoToMarket);
  }

  async subscribe(symbols: string[], callback: (price: NormalizedPrice) => void): Promise<() => void> {
    this.ensureReady();
    if (!this.ws) throw new Error('WebSocket not initialized');

    const rawSymbols = symbols.map((s) => s.replace('CRY:', ''));
    rawSymbols.forEach((s) => this.ws!.subscribe(s, callback));
    await this.ws.connect(rawSymbols);

    return () => this.ws?.disconnect();
  }

  async placeTrade(trade: Trade): Promise<TradeExecution> {
    this.ensureReady();
    const adapter = this.getAdapter();
    if (!adapter) throw new Error('No crypto adapter available for execution');

    const ccxtSymbol = this.toCcxtSymbol(trade.symbol);
    const side: 'buy' | 'sell' = trade.direction === Direction.LONG ? 'buy' : 'sell';
    const type: 'market' | 'limit' = trade.orderType === OrderType.LIMIT ? 'limit' : 'market';

    const result = await adapter.placeTrade({
      symbol: ccxtSymbol,
      side,
      type,
      amount: trade.size,
      price: trade.limitPrice,
    });

    const statusMap: Record<string, TradeExecutionStatus> = {
      closed: 'filled',
      open: 'pending',
      canceled: 'cancelled',
      expired: 'expired',
    };

    return {
      id: crypto.randomUUID(),
      tradeId: trade.id,
      externalOrderId: result.orderId,
      status: statusMap[result.status] ?? 'submitted',
      fillPrice: result.avgFillPrice,
      filledSize: result.filledAmount,
      commission: result.fees,
      slippage: undefined,
      executedAt: result.timestamp,
      rawResponse: result,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /** Get adapter for a specific exchange, or primary */
  getAdapter(exchange?: SupportedExchange): CryptoAdapter | null {
    if (exchange) return this.adapters.get(exchange) ?? null;
    return this.adapters.get(this.primaryExchange) ?? this.adapters.values().next().value ?? null;
  }

  getAvailableExchanges(): SupportedExchange[] {
    return [...this.adapters.keys()];
  }

  private ensureReady(): void {
    if (this.status !== 'ready' || this.adapters.size === 0) {
      throw new Error('Crypto plugin not initialized.');
    }
  }

  /** Convert symbol format: CRY:BTCUSDT -> BTC/USDT, or pass-through if already slashed */
  private toCcxtSymbol(symbol: string): string {
    const raw = symbol.replace('CRY:', '');
    if (raw.includes('/')) return raw;
    // Detect quote asset
    for (const quote of ['USDT', 'USDC', 'BTC', 'ETH', 'EUR']) {
      if (raw.endsWith(quote)) {
        return `${raw.slice(0, -quote.length)}/${quote}`;
      }
    }
    return raw;
  }
}
