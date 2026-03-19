/**
 * Betfair data normalizer — converts Betfair data to normalized format.
 */

import { MarketArea } from '@/core/types/common';
import { NormalizedPrice, NormalizedMarket, MarketStatus } from '@/core/types/market-data';
import { BetfairMarket, BetfairRunner } from './types';

export function normalizeBetfairMarket(market: BetfairMarket): NormalizedMarket[] {
  return market.runners
    .filter((r) => r.status === 'ACTIVE')
    .map((runner) => ({
      symbol: `BF:${market.marketId}:${runner.selectionId}`,
      externalSymbol: `${market.marketId}/${runner.selectionId}`,
      name: `${market.marketName} — ${runner.runnerName}`,
      area: MarketArea.EXCHANGE_BETTING,
      category: 'Sports',
      status: mapBetfairStatus(market.status),
      currency: 'GBP' as const,
      minSize: 2, // GBP 2 minimum bet on Betfair
      sizeStep: 0.01,
      tickSize: 0.01,
      volume24h: market.totalMatched,
      liquidityScore: calculateBetfairLiquidity(runner),
      metadata: {
        marketId: market.marketId,
        selectionId: runner.selectionId,
        inPlay: market.inPlay,
        marketStartTime: market.marketStartTime,
      },
    }));
}

export function normalizeBetfairPrice(
  market: BetfairMarket,
  runner: BetfairRunner
): NormalizedPrice {
  const bestBack = runner.ex?.availableToBack[0];
  const bestLay = runner.ex?.availableToLay[0];

  return {
    symbol: `BF:${market.marketId}:${runner.selectionId}`,
    area: MarketArea.EXCHANGE_BETTING,
    price: runner.lastPriceTraded ?? 0,
    bid: bestBack?.price,
    ask: bestLay?.price,
    spread: bestBack && bestLay ? bestLay.price - bestBack.price : undefined,
    volume24h: runner.totalMatched,
    timestamp: new Date().toISOString(),
    currency: 'GBP',
  };
}

function mapBetfairStatus(status: string): MarketStatus {
  switch (status) {
    case 'OPEN': return 'open';
    case 'SUSPENDED': return 'suspended';
    case 'CLOSED': return 'closed';
    case 'SETTLED': return 'settled';
    default: return 'closed';
  }
}

function calculateBetfairLiquidity(runner: BetfairRunner): number {
  const matched = runner.totalMatched ?? 0;
  if (matched >= 100000) return 100;
  if (matched >= 50000) return 80;
  if (matched >= 10000) return 60;
  if (matched >= 5000) return 40;
  if (matched >= 1000) return 20;
  return 10;
}
