/**
 * Formatting utilities — numbers, currencies, percentages, dates.
 */

import { Currency } from '@/core/types/common';

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  EUR: '\u20AC',
  USD: '$',
  GBP: '\u00A3',
  USDC: 'USDC',
  USDT: 'USDT',
};

/** Format a number as currency */
export function formatCurrency(
  amount: number,
  currency: Currency = 'EUR',
  locale = 'it-IT'
): string {
  if (currency === 'USDC' || currency === 'USDT') {
    return `${amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Format a percentage */
export function formatPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/** Format a large number with abbreviation (1.2K, 3.5M, etc.) */
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

/** Format a price with appropriate decimal places */
export function formatPrice(price: number, area?: string): string {
  if (area === 'prediction' || area === 'exchange_betting') {
    return price.toFixed(2); // Probabilities / odds
  }
  if (area === 'forex') {
    return price.toFixed(5); // Forex has 5 decimal places
  }
  if (area === 'crypto' && price < 1) {
    return price.toFixed(8); // Small crypto prices
  }
  return price.toFixed(2);
}

/** Format a date relative to now (e.g., "2 ore fa") */
export function formatRelativeTime(date: Date | string, locale = 'it-IT'): string {
  const now = new Date();
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'ora';
  if (diffMins < 60) return `${diffMins} min fa`;
  if (diffHours < 24) return `${diffHours} ore fa`;
  if (diffDays < 7) return `${diffDays} giorni fa`;

  return d.toLocaleDateString(locale);
}

/** Get the currency symbol */
export function getCurrencySymbol(currency: Currency): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}
