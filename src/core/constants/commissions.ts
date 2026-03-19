/**
 * Commission rates per platform.
 * Source: FILE_SACRO section 19.
 */

import { MarketArea } from '../types/common';

export interface CommissionRate {
  platform: string;
  area: MarketArea;
  /** Commission type */
  type: 'percentage' | 'fixed' | 'spread' | 'tiered';
  /** Rate as decimal (e.g., 0.001 = 0.1%) */
  rate?: number;
  /** Fixed amount per trade */
  fixedAmount?: number;
  /** Tiered rates */
  tiers?: { minVolume: number; rate: number }[];
  /** Maker fee (for exchanges) */
  makerFee?: number;
  /** Taker fee (for exchanges) */
  takerFee?: number;
  /** Notes */
  notes: string;
}

export const COMMISSION_RATES: CommissionRate[] = [
  // Prediction Markets
  {
    platform: 'Polymarket',
    area: MarketArea.PREDICTION,
    type: 'percentage',
    makerFee: 0,
    takerFee: 0.02, // 2%
    notes: 'Maker free, taker 2%. Built on Polygon.',
  },
  // Exchange Betting
  {
    platform: 'Betfair',
    area: MarketArea.EXCHANGE_BETTING,
    type: 'percentage',
    rate: 0.05, // 5% on net winnings
    notes: '5% commission on net winnings. Market Rate Discount possible.',
  },
  // Stocks
  {
    platform: 'Interactive Brokers',
    area: MarketArea.STOCKS,
    type: 'tiered',
    tiers: [
      { minVolume: 0, rate: 0.0005 },         // 0.05% up to 300k/month
      { minVolume: 300000, rate: 0.0003 },     // 0.03%
      { minVolume: 3000000, rate: 0.0002 },    // 0.02%
    ],
    notes: 'Tiered pricing. Min $1 per order. EU stocks via IBKR.',
  },
  {
    platform: 'Degiro',
    area: MarketArea.STOCKS,
    type: 'fixed',
    fixedAmount: 1.00, // 1 EUR per trade for core selection
    notes: 'EUR 1 per trade (core selection). Others: EUR 2 + 0.03%.',
  },
  // Forex
  {
    platform: 'Interactive Brokers',
    area: MarketArea.FOREX,
    type: 'spread',
    rate: 0.00002, // ~0.2 pip spread
    notes: 'Commission-based: 0.2 pip typical spread + $2/100k.',
  },
  // Crypto
  {
    platform: 'Binance',
    area: MarketArea.CRYPTO,
    type: 'percentage',
    makerFee: 0.001,  // 0.1%
    takerFee: 0.001,   // 0.1%
    notes: '0.1% maker/taker base. BNB discount available.',
  },
  {
    platform: 'Kraken',
    area: MarketArea.CRYPTO,
    type: 'percentage',
    makerFee: 0.0016,  // 0.16%
    takerFee: 0.0026,   // 0.26%
    notes: '0.16%/0.26% base. Volume discounts available.',
  },
];

/** Get commission rates for a specific area */
export function getCommissionsByArea(area: MarketArea): CommissionRate[] {
  return COMMISSION_RATES.filter((c) => c.area === area);
}
