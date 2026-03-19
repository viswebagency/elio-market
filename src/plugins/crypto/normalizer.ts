/**
 * Crypto data normalizer — converts exchange data to normalized format.
 */

import { MarketArea } from '@/core/types/common';
import { NormalizedPrice, NormalizedCandle, NormalizedMarket } from '@/core/types/market-data';
import { CryptoTicker, CryptoCandle } from './types';

export function normalizeCryptoTicker(ticker: CryptoTicker): NormalizedPrice {
  return {
    symbol: `CRY:${ticker.symbol}`,
    area: MarketArea.CRYPTO,
    price: ticker.price,
    bid: ticker.bid,
    ask: ticker.ask,
    spread: ticker.ask - ticker.bid,
    volume24h: ticker.quoteVolume24h,
    change24h: ticker.priceChangePercent24h,
    timestamp: ticker.timestamp,
    currency: ticker.quoteAsset === 'USDC' ? 'USDC' : 'USDT',
  };
}

export function normalizeCryptoCandle(
  symbol: string,
  candle: CryptoCandle,
  interval: string
): NormalizedCandle {
  return {
    symbol: `CRY:${symbol}`,
    area: MarketArea.CRYPTO,
    interval: interval as NormalizedCandle['interval'],
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    trades: candle.trades,
    openTime: new Date(candle.openTime).toISOString(),
    closeTime: new Date(candle.closeTime).toISOString(),
  };
}

export function normalizeCryptoToMarket(ticker: CryptoTicker): NormalizedMarket {
  return {
    symbol: `CRY:${ticker.symbol}`,
    externalSymbol: ticker.symbol,
    name: `${ticker.baseAsset}/${ticker.quoteAsset}`,
    area: MarketArea.CRYPTO,
    category: 'Crypto',
    status: 'open',
    currency: ticker.quoteAsset === 'USDC' ? 'USDC' : 'USDT',
    minSize: 0.00001,
    sizeStep: 0.00001,
    tickSize: 0.01,
    volume24h: ticker.quoteVolume24h,
  };
}
