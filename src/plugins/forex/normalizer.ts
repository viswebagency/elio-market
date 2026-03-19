/**
 * Forex data normalizer — converts forex data to normalized format.
 */

import { MarketArea } from '@/core/types/common';
import { NormalizedPrice, NormalizedCandle, NormalizedMarket } from '@/core/types/market-data';
import { ForexPair, ForexCandle } from './types';
import { PIP_SIZES } from './constants';

export function normalizeForexPair(pair: ForexPair): NormalizedPrice {
  const mid = (pair.bid + pair.ask) / 2;
  return {
    symbol: `FX:${pair.symbol}`,
    area: MarketArea.FOREX,
    price: mid,
    bid: pair.bid,
    ask: pair.ask,
    spread: pair.spread,
    volume24h: pair.volume24h,
    timestamp: pair.timestamp,
    currency: pair.quote === 'USD' ? 'USD' : 'EUR',
  };
}

export function normalizeForexCandle(
  symbol: string,
  candle: ForexCandle,
  interval: string
): NormalizedCandle {
  return {
    symbol: `FX:${symbol}`,
    area: MarketArea.FOREX,
    interval: interval as NormalizedCandle['interval'],
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    openTime: candle.timestamp,
    closeTime: candle.timestamp,
  };
}

export function normalizeForexToMarket(pair: ForexPair): NormalizedMarket {
  const pipSize = PIP_SIZES[pair.symbol] ?? 0.0001;
  return {
    symbol: `FX:${pair.symbol}`,
    externalSymbol: pair.symbol,
    name: `${pair.base}/${pair.quote}`,
    area: MarketArea.FOREX,
    category: 'Forex',
    subCategory: pair.symbol.length <= 6 ? 'Major' : 'Cross',
    status: 'open',
    currency: pair.quote === 'USD' ? 'USD' : 'EUR',
    minSize: 1000, // Micro lot
    sizeStep: 1000,
    tickSize: pipSize,
    volume24h: pair.volume24h,
  };
}
