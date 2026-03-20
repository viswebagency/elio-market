/**
 * Fiscal tracker — tracks realized gains/losses for tax reporting.
 */

import { TradeResult } from '@/core/types/trade';
import { FiscalReport, FiscalSummary, TaxCategory } from '@/core/types/fiscal';
import { MarketArea, Currency } from '@/core/types/common';
import { getTaxRate as _getTaxRate } from '@/core/constants/tax-rates';

export class FiscalTracker {
  /** Record a trade result for fiscal tracking */
  async recordTrade(result: TradeResult): Promise<void> {
    // TODO: store in fiscal_trades table
    console.log(`[Fiscal] Recorded trade ${result.id}: ${result.netPnl} ${result.currency}`);
  }

  /** Generate a fiscal report for a year */
  async generateReport(
    userId: string,
    year: number,
    countryCode: string,
    currency: Currency
  ): Promise<FiscalReport> {
    // TODO: aggregate from DB
    const summaries: FiscalSummary[] = [];

    return {
      id: crypto.randomUUID(),
      userId,
      year,
      countryCode,
      currency,
      summary: summaries,
      totalTaxableIncome: 0,
      totalEstimatedTax: 0,
      totalRealizedGains: 0,
      totalRealizedLosses: 0,
      netResult: 0,
      carriedForwardLosses: 0,
      generatedAt: new Date().toISOString(),
      disclaimer:
        'Questo report e\' generato automaticamente e NON costituisce consulenza fiscale. ' +
        'Consultare sempre un commercialista qualificato per la dichiarazione dei redditi.',
    };
  }

  /** Get the tax category for a market area */
  getTaxCategory(area: MarketArea): TaxCategory {
    switch (area) {
      case MarketArea.STOCKS: return 'capital_gains';
      case MarketArea.CRYPTO: return 'crypto_gains';
      case MarketArea.FOREX: return 'forex_gains';
      case MarketArea.PREDICTION: return 'gambling_winnings';
      case MarketArea.EXCHANGE_BETTING: return 'gambling_winnings';
    }
  }
}

export const fiscalTracker = new FiscalTracker();
