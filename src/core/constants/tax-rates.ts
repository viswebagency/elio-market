/**
 * Tax rates per area and country — Italy 2026 as primary reference.
 */

import { MarketArea } from '../types/common';
import { FiscalArea, TaxCategory } from '../types/fiscal';

/** Italy 2026 fiscal configuration */
export const ITALY_2026: FiscalArea = {
  countryCode: 'IT',
  countryName: 'Italia',
  taxRegime: 'Regime ordinario 2026',
  supportedAreas: [
    MarketArea.PREDICTION,
    MarketArea.EXCHANGE_BETTING,
    MarketArea.STOCKS,
    MarketArea.FOREX,
    MarketArea.CRYPTO,
  ],
  rates: [
    {
      category: 'capital_gains' as TaxCategory,
      area: MarketArea.STOCKS,
      rate: 0.26,
      description: 'Imposta sostitutiva su plusvalenze azionarie',
      offsettable: true,
      lossCarryForwardYears: 4,
      effectiveFrom: '2026-01-01',
    },
    {
      category: 'crypto_gains' as TaxCategory,
      area: MarketArea.CRYPTO,
      rate: 0.26,
      description: 'Imposta sostitutiva su plusvalenze crypto (dal 2026)',
      offsettable: true,
      lossCarryForwardYears: 4,
      effectiveFrom: '2026-01-01',
    },
    {
      category: 'forex_gains' as TaxCategory,
      area: MarketArea.FOREX,
      rate: 0.26,
      description: 'Imposta sostitutiva su plusvalenze forex',
      offsettable: true,
      lossCarryForwardYears: 4,
      effectiveFrom: '2026-01-01',
    },
    {
      category: 'gambling_winnings' as TaxCategory,
      area: MarketArea.PREDICTION,
      rate: 0.0, // Prediction markets: complex — may be treated as gambling (no tax on winnings) or financial income
      description: 'Mercati predittivi: trattamento fiscale in evoluzione. Consultare commercialista.',
      offsettable: false,
      lossCarryForwardYears: 0,
      effectiveFrom: '2026-01-01',
    },
    {
      category: 'gambling_winnings' as TaxCategory,
      area: MarketArea.EXCHANGE_BETTING,
      rate: 0.0, // Betting winnings not taxed in Italy (if from authorized operators)
      description: 'Vincite da scommesse: non tassate se da operatore autorizzato AAMS/ADM',
      offsettable: false,
      lossCarryForwardYears: 0,
      effectiveFrom: '2026-01-01',
    },
  ],
  notes: 'DISCLAIMER: Queste informazioni sono indicative e NON costituiscono consulenza fiscale. Consultare sempre un commercialista qualificato.',
};

/** All supported fiscal areas */
export const FISCAL_AREAS: FiscalArea[] = [ITALY_2026];

/** Get tax rate for a specific category and area */
export function getTaxRate(
  countryCode: string,
  category: TaxCategory,
  area: MarketArea
): number | undefined {
  const fiscalArea = FISCAL_AREAS.find((fa) => fa.countryCode === countryCode);
  if (!fiscalArea) return undefined;

  const rate = fiscalArea.rates.find(
    (r) => r.category === category && r.area === area
  );
  return rate?.rate;
}
