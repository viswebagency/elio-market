/**
 * Stocks data normalizer — converts broker data to normalized format.
 */

import { MarketArea } from '@/core/types/common';
import { NormalizedPrice, NormalizedCandle, NormalizedMarket } from '@/core/types/market-data';
import { StockQuote, StockCandle } from './types';

export function normalizeStockQuote(quote: StockQuote): NormalizedPrice {
  return {
    symbol: `STK:${quote.symbol}`,
    area: MarketArea.STOCKS,
    price: quote.price,
    bid: quote.price - 0.01,
    ask: quote.price + 0.01,
    volume24h: quote.volume,
    change24h: ((quote.price - quote.previousClose) / quote.previousClose) * 100,
    timestamp: quote.timestamp,
    currency: 'EUR',
  };
}

export function normalizeStockCandle(
  symbol: string,
  candle: StockCandle,
  interval: string
): NormalizedCandle {
  return {
    symbol: `STK:${symbol}`,
    area: MarketArea.STOCKS,
    interval: interval as NormalizedCandle['interval'],
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    openTime: candle.timestamp,
    closeTime: candle.timestamp, // TODO: calculate proper close time
  };
}

export function normalizeStockToMarket(quote: StockQuote): NormalizedMarket {
  return {
    symbol: `STK:${quote.symbol}`,
    externalSymbol: quote.symbol,
    name: quote.name,
    area: MarketArea.STOCKS,
    category: 'Equities',
    status: 'open',
    currency: 'EUR',
    minSize: 1,
    sizeStep: 1,
    tickSize: 0.01,
    volume24h: quote.volume,
    metadata: {
      exchange: quote.exchange,
      marketCap: quote.marketCap,
      pe: quote.pe,
    },
  };
}
