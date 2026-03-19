/**
 * Polymarket data normalizer — converts Polymarket-specific data to normalized format.
 */

import { MarketArea } from '@/core/types/common';
import { NormalizedPrice, NormalizedMarket, MarketStatus } from '@/core/types/market-data';
import { PolymarketEvent, PolymarketMarket } from './types';

/** Normalize a Polymarket market to our standard format */
export function normalizePolymarketMarket(
  event: PolymarketEvent,
  market: PolymarketMarket
): NormalizedMarket {
  const status: MarketStatus = market.resolved
    ? 'settled'
    : event.closed
    ? 'closed'
    : 'open';

  return {
    symbol: `PM:${market.id}`,
    externalSymbol: market.id,
    name: market.question,
    area: MarketArea.PREDICTION,
    category: event.category,
    status,
    currency: 'USDC',
    minSize: 1,
    sizeStep: 0.01,
    tickSize: 0.01,
    volume24h: market.volume24hr,
    liquidityScore: calculateLiquidityScore(market.liquidity),
    expiryDate: event.endDate,
    metadata: {
      eventId: event.id,
      eventTitle: event.title,
      slug: market.slug,
      conditionId: market.conditionId,
      outcomes: market.outcomes,
    },
  };
}

/** Normalize Polymarket price data */
export function normalizePolymarketPrice(market: PolymarketMarket): NormalizedPrice {
  const prices = market.outcomePrices.map(Number);
  const yesPrice = prices[0] ?? 0;

  return {
    symbol: `PM:${market.id}`,
    area: MarketArea.PREDICTION,
    price: yesPrice,
    bid: yesPrice - 0.01, // Simplified — use order book for real bid/ask
    ask: yesPrice + 0.01,
    spread: 0.02,
    volume24h: market.volume24hr,
    timestamp: new Date().toISOString(),
    currency: 'USDC',
  };
}

/** Calculate a 0-100 liquidity score based on total liquidity */
function calculateLiquidityScore(liquidity: number): number {
  if (liquidity >= 1_000_000) return 100;
  if (liquidity >= 500_000) return 80;
  if (liquidity >= 100_000) return 60;
  if (liquidity >= 50_000) return 40;
  if (liquidity >= 10_000) return 20;
  return 10;
}
