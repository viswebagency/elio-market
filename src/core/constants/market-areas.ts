/**
 * Market area configurations — the 5 pillars of Elio.Market.
 */

import { MarketArea } from '../types/common';

export interface MarketAreaConfig {
  id: MarketArea;
  name: string;
  nameIt: string;
  icon: string;
  color: string;
  bgColor: string;
  description: string;
  descriptionIt: string;
}

export const MARKET_AREAS: Record<MarketArea, MarketAreaConfig> = {
  [MarketArea.PREDICTION]: {
    id: MarketArea.PREDICTION,
    name: 'Prediction Markets',
    nameIt: 'Mercati Predittivi',
    icon: '🎯',
    color: '#8B5CF6',     // violet-500
    bgColor: '#8B5CF620',
    description: 'Trade on event outcomes (Polymarket, Kalshi)',
    descriptionIt: 'Trading su esiti di eventi (Polymarket, Kalshi)',
  },
  [MarketArea.EXCHANGE_BETTING]: {
    id: MarketArea.EXCHANGE_BETTING,
    name: 'Exchange Betting',
    nameIt: 'Scommesse Exchange',
    icon: '🏇',
    color: '#F59E0B',     // amber-500
    bgColor: '#F59E0B20',
    description: 'Sports and event exchange trading (Betfair)',
    descriptionIt: 'Trading sportivo su exchange (Betfair)',
  },
  [MarketArea.STOCKS]: {
    id: MarketArea.STOCKS,
    name: 'Stocks',
    nameIt: 'Azioni',
    icon: '📈',
    color: '#10B981',     // emerald-500
    bgColor: '#10B98120',
    description: 'Equity markets and ETFs',
    descriptionIt: 'Mercati azionari e ETF',
  },
  [MarketArea.FOREX]: {
    id: MarketArea.FOREX,
    name: 'Forex',
    nameIt: 'Forex',
    icon: '💱',
    color: '#3B82F6',     // blue-500
    bgColor: '#3B82F620',
    description: 'Foreign exchange markets',
    descriptionIt: 'Mercati valutari',
  },
  [MarketArea.CRYPTO]: {
    id: MarketArea.CRYPTO,
    name: 'Crypto',
    nameIt: 'Crypto',
    icon: '₿',
    color: '#F97316',     // orange-500
    bgColor: '#F9731620',
    description: 'Cryptocurrency markets',
    descriptionIt: 'Mercati delle criptovalute',
  },
};

/** Ordered list for UI rendering */
export const MARKET_AREAS_LIST: MarketAreaConfig[] = [
  MARKET_AREAS[MarketArea.PREDICTION],
  MARKET_AREAS[MarketArea.EXCHANGE_BETTING],
  MARKET_AREAS[MarketArea.STOCKS],
  MARKET_AREAS[MarketArea.FOREX],
  MARKET_AREAS[MarketArea.CRYPTO],
];
