/**
 * Crypto API adapter — unified interface via ccxt for Binance + Bybit.
 *
 * Supports: spot + futures markets, real-time price, 24h volume,
 * order book, historical candles.
 */

import ccxt, { Exchange, Ticker, OHLCV, OrderBook, Order } from 'ccxt';
import { CryptoTicker, CryptoCandle, CryptoBalance, CryptoOrderBookEntry } from './types';

export type SupportedExchange = 'binance' | 'bybit';

export interface CryptoAdapterConfig {
  exchange: SupportedExchange;
  apiKey?: string;
  apiSecret?: string;
  sandbox?: boolean;
}

/** Parameters for placing a trade */
export interface PlaceTradeParams {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  amount: number;
  price?: number; // required for limit orders
}

/** Result of a placed trade */
export interface PlaceTradeResult {
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  amount: number;
  price: number | undefined;
  filledAmount: number;
  avgFillPrice: number | undefined;
  status: string;
  fees: number;
  timestamp: string;
}

/** Result of cancelling an order */
export interface CancelOrderResult {
  success: boolean;
  orderId: string;
  message: string;
}

/** Status of an existing order */
export interface OrderStatusResult {
  orderId: string;
  status: string;
  filledAmount: number;
  remainingAmount: number;
  avgFillPrice: number | undefined;
  fees: number;
}

/** Spot position derived from balances */
export interface SpotPosition {
  symbol: string;
  amount: number;
  avgEntryPrice: number | undefined;
  currentPrice: number;
  pnl: number | undefined;
}

export class CryptoAdapter {
  private exchange: Exchange;
  private exchangeId: SupportedExchange;

  constructor(config: CryptoAdapterConfig) {
    this.exchangeId = config.exchange;

    const opts: Record<string, unknown> = {
      apiKey: config.apiKey,
      secret: config.apiSecret,
      enableRateLimit: true,
    };

    if (config.sandbox) {
      opts.sandbox = true;
    }

    if (config.exchange === 'binance') {
      this.exchange = new ccxt.binance(opts);
    } else if (config.exchange === 'bybit') {
      this.exchange = new ccxt.bybit(opts);
    } else {
      throw new Error(`Unsupported exchange: ${config.exchange}`);
    }

    if (config.sandbox) {
      this.exchange.setSandboxMode(true);
    }
  }

  get id(): SupportedExchange {
    return this.exchangeId;
  }

  /** Load exchange markets (call once before other methods) */
  async loadMarkets(): Promise<void> {
    await this.exchange.loadMarkets();
  }

  /** Get 24h ticker for a symbol (e.g. "BTC/USDT") */
  async getTicker(symbol: string): Promise<CryptoTicker> {
    const ticker: Ticker = await this.exchange.fetchTicker(symbol);
    return this.normalizeTicker(ticker);
  }

  /** Get all tickers for USDT pairs */
  async getAllTickers(quoteAsset = 'USDT'): Promise<CryptoTicker[]> {
    const tickers = await this.exchange.fetchTickers();
    return Object.values(tickers)
      .filter((t): t is Ticker => t !== undefined && (t.symbol?.endsWith(`/${quoteAsset}`) ?? false))
      .map((t) => this.normalizeTicker(t));
  }

  /** Get OHLCV candles */
  async getCandles(
    symbol: string,
    timeframe = '1h',
    limit = 100,
    since?: number,
  ): Promise<CryptoCandle[]> {
    const ohlcv: OHLCV[] = await this.exchange.fetchOHLCV(symbol, timeframe, since, limit);
    return ohlcv.map((candle) => ({
      openTime: candle[0] as number,
      open: candle[1] as number,
      high: candle[2] as number,
      low: candle[3] as number,
      close: candle[4] as number,
      volume: candle[5] as number,
      closeTime: (candle[0] as number) + this.timeframeToMs(timeframe),
      quoteVolume: 0,
      trades: 0,
    }));
  }

  /** Get order book */
  async getOrderBook(symbol: string, limit = 20): Promise<{
    bids: CryptoOrderBookEntry[];
    asks: CryptoOrderBookEntry[];
    timestamp: string;
  }> {
    const book: OrderBook = await this.exchange.fetchOrderBook(symbol, limit);
    return {
      bids: (book.bids ?? []).map(([price, amount]) => ({ price: Number(price), amount: Number(amount) })),
      asks: (book.asks ?? []).map(([price, amount]) => ({ price: Number(price), amount: Number(amount) })),
      timestamp: book.timestamp ? new Date(book.timestamp).toISOString() : new Date().toISOString(),
    };
  }

  /** Get account balances (requires auth) */
  async getBalances(): Promise<CryptoBalance[]> {
    const balance = await this.exchange.fetchBalance();
    const result: CryptoBalance[] = [];

    for (const [asset, data] of Object.entries(balance.total ?? {})) {
      const total = data as number;
      if (total > 0) {
        const free = ((balance.free ?? {}) as unknown as Record<string, number>)[asset] ?? 0;
        const locked = ((balance.used ?? {}) as unknown as Record<string, number>)[asset] ?? 0;
        result.push({
          asset,
          free,
          locked,
          total,
          btcValue: 0,
        });
      }
    }

    return result;
  }

  /** List available spot markets */
  async getSpotMarkets(): Promise<string[]> {
    if (!this.exchange.markets) await this.loadMarkets();
    return Object.keys(this.exchange.markets)
      .filter((s) => {
        const market = this.exchange.markets[s];
        return market.spot && market.active;
      });
  }

  /** List available futures markets */
  async getFuturesMarkets(): Promise<string[]> {
    if (!this.exchange.markets) await this.loadMarkets();
    return Object.keys(this.exchange.markets)
      .filter((s) => {
        const market = this.exchange.markets[s];
        return (market.swap || market.future) && market.active;
      });
  }

  /** Health check — ping exchange */
  async ping(): Promise<boolean> {
    try {
      await this.exchange.fetchTicker('BTC/USDT');
      return true;
    } catch {
      return false;
    }
  }

  /** Get raw ccxt exchange instance (for advanced usage) */
  getRawExchange(): Exchange {
    return this.exchange;
  }

  // ---------------------------------------------------------------------------
  // Order Execution
  // ---------------------------------------------------------------------------

  /** Place a trade (market or limit order) */
  async placeTrade(params: PlaceTradeParams): Promise<PlaceTradeResult> {
    this.requireAuth();

    if (params.type === 'limit' && params.price == null) {
      throw new Error('[CCXT] Limit orders require a price');
    }

    console.log(`[CCXT] placeTrade ${params.side} ${params.type} ${params.symbol} amount=${params.amount}${params.price ? ` price=${params.price}` : ''}`);

    try {
      const order: Order = await this.exchange.createOrder(
        params.symbol,
        params.type,
        params.side,
        params.amount,
        params.price,
      );

      const fees = this.extractFees(order);

      return {
        orderId: order.id,
        symbol: order.symbol,
        side: params.side,
        type: params.type,
        amount: order.amount ?? params.amount,
        price: order.price ?? params.price,
        filledAmount: order.filled ?? 0,
        avgFillPrice: order.average ?? order.price ?? undefined,
        status: order.status ?? 'unknown',
        fees,
        timestamp: order.datetime ?? new Date().toISOString(),
      };
    } catch (err) {
      throw this.wrapError('placeTrade', err);
    }
  }

  /** Cancel a pending order */
  async cancelOrder(orderId: string, symbol: string): Promise<CancelOrderResult> {
    this.requireAuth();

    console.log(`[CCXT] cancelOrder ${orderId} ${symbol}`);

    try {
      await this.exchange.cancelOrder(orderId, symbol);
      return { success: true, orderId, message: 'Order cancelled successfully' };
    } catch (err) {
      const wrapped = this.wrapError('cancelOrder', err);
      return { success: false, orderId, message: wrapped.message };
    }
  }

  /** Get status of an existing order */
  async getOrderStatus(orderId: string, symbol: string): Promise<OrderStatusResult> {
    this.requireAuth();

    console.log(`[CCXT] getOrderStatus ${orderId} ${symbol}`);

    try {
      const order: Order = await this.exchange.fetchOrder(orderId, symbol);
      const fees = this.extractFees(order);

      return {
        orderId: order.id,
        status: order.status ?? 'unknown',
        filledAmount: order.filled ?? 0,
        remainingAmount: order.remaining ?? 0,
        avgFillPrice: order.average ?? order.price ?? undefined,
        fees,
      };
    } catch (err) {
      throw this.wrapError('getOrderStatus', err);
    }
  }

  /** Get open orders, optionally filtered by symbol */
  async getOpenOrders(symbol?: string): Promise<Order[]> {
    this.requireAuth();

    console.log(`[CCXT] getOpenOrders${symbol ? ` ${symbol}` : ''}`);

    try {
      return await this.exchange.fetchOpenOrders(symbol);
    } catch (err) {
      throw this.wrapError('getOpenOrders', err);
    }
  }

  /** Get spot positions (balances > 0 excluding USDT) */
  async getPositions(): Promise<SpotPosition[]> {
    this.requireAuth();

    console.log('[CCXT] getPositions');

    try {
      const balances = await this.getBalances();
      const positions: SpotPosition[] = [];

      for (const bal of balances) {
        if (bal.asset === 'USDT' || bal.total <= 0) continue;

        const symbol = `${bal.asset}/USDT`;
        let currentPrice = 0;
        try {
          const ticker = await this.getTicker(symbol);
          currentPrice = ticker.price;
        } catch {
          // asset might not have a USDT pair — skip
          continue;
        }

        positions.push({
          symbol,
          amount: bal.total,
          avgEntryPrice: undefined, // spot exchange doesn't track entry price
          currentPrice,
          pnl: undefined, // can't compute without entry price
        });
      }

      return positions;
    } catch (err) {
      throw this.wrapError('getPositions', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private normalizeTicker(ticker: Ticker): CryptoTicker {
    const parts = (ticker.symbol ?? '').split('/');
    const baseAsset = parts[0] ?? '';
    const quoteAsset = parts[1] ?? 'USDT';

    return {
      symbol: (ticker.symbol ?? '').replace('/', ''),
      baseAsset,
      quoteAsset,
      price: ticker.last ?? 0,
      bid: ticker.bid ?? 0,
      ask: ticker.ask ?? 0,
      high24h: ticker.high ?? 0,
      low24h: ticker.low ?? 0,
      volume24h: ticker.baseVolume ?? 0,
      quoteVolume24h: ticker.quoteVolume ?? 0,
      priceChange24h: ticker.change ?? 0,
      priceChangePercent24h: ticker.percentage ?? 0,
      timestamp: ticker.datetime ?? new Date().toISOString(),
    };
  }

  private timeframeToMs(timeframe: string): number {
    const map: Record<string, number> = {
      '1m': 60_000,
      '5m': 300_000,
      '15m': 900_000,
      '1h': 3_600_000,
      '4h': 14_400_000,
      '1d': 86_400_000,
      '1w': 604_800_000,
    };
    return map[timeframe] ?? 3_600_000;
  }

  /** Throw if the exchange has no API key configured */
  private requireAuth(): void {
    if (!this.exchange.apiKey) {
      throw new Error(`[CCXT] Exchange ${this.exchangeId} is not authenticated — provide apiKey and apiSecret`);
    }
  }

  /** Extract total fees from a CCXT order */
  private extractFees(order: Order): number {
    if (order.fee?.cost != null) return order.fee.cost;
    // Some exchanges return fees as an array (not in ccxt types but present at runtime)
    const fees = (order as unknown as { fees?: Array<{ cost?: number }> }).fees;
    if (fees && fees.length > 0) {
      return fees.reduce((sum: number, f: { cost?: number }) => sum + (f.cost ?? 0), 0);
    }
    return 0;
  }

  /** Wrap a CCXT error into a readable Error */
  private wrapError(method: string, err: unknown): Error {
    if (err instanceof Error) {
      return new Error(`[CCXT] ${method} failed: ${err.message}`);
    }
    return new Error(`[CCXT] ${method} failed: ${String(err)}`);
  }
}
