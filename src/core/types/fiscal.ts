/**
 * Fiscal types — tax tracking, rates, and reporting per jurisdiction.
 */

import { MarketArea, Currency } from './common';

/** Fiscal area (country/jurisdiction) */
export interface FiscalArea {
  /** ISO country code */
  countryCode: string;
  /** Country name */
  countryName: string;
  /** Tax regime name */
  taxRegime: string;
  /** Supported areas */
  supportedAreas: MarketArea[];
  /** Tax rates for this jurisdiction */
  rates: TaxRate[];
  /** Notes/disclaimers */
  notes: string;
}

/** Tax rate for a specific instrument type */
export interface TaxRate {
  /** What this rate applies to */
  category: TaxCategory;
  /** Market area */
  area: MarketArea;
  /** Rate as decimal (0.26 = 26%) */
  rate: number;
  /** Description */
  description: string;
  /** Whether gains can offset losses */
  offsettable: boolean;
  /** Years losses can be carried forward */
  lossCarryForwardYears: number;
  /** Effective from */
  effectiveFrom: string;
}

export type TaxCategory =
  | 'capital_gains'       // Standard capital gains
  | 'financial_income'    // Redditi finanziari (Italy)
  | 'gambling_winnings'   // Gambling/prediction markets
  | 'crypto_gains'        // Crypto-specific (Italy 2026: 26%)
  | 'forex_gains'         // Forex gains
  | 'dividends'           // Dividends
  ;

/** A generated fiscal report */
export interface FiscalReport {
  id: string;
  userId: string;
  /** Tax year */
  year: number;
  /** Country this report is for */
  countryCode: string;
  currency: Currency;
  /** Summary by category */
  summary: FiscalSummary[];
  /** Total taxable income */
  totalTaxableIncome: number;
  /** Total estimated tax */
  totalEstimatedTax: number;
  /** Total realized gains */
  totalRealizedGains: number;
  /** Total realized losses */
  totalRealizedLosses: number;
  /** Net result */
  netResult: number;
  /** Losses carried forward from previous years */
  carriedForwardLosses: number;
  /** Generated date */
  generatedAt: string;
  /** Disclaimer */
  disclaimer: string;
}

export interface FiscalSummary {
  category: TaxCategory;
  area: MarketArea;
  realizedGains: number;
  realizedLosses: number;
  netResult: number;
  taxRate: number;
  estimatedTax: number;
  trades: number;
}
