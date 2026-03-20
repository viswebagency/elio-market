/**
 * Knowledge Base — Cache Invalidation Rules
 *
 * Determines when cached analyses should be invalidated based on:
 * - Time elapsed since generation
 * - Price movement since last analysis
 * - Market area-specific rules from FILE_SACRO
 */

import { MarketArea } from '../types/common';
import { AnalysisType } from './analyzer';

// ============================================================================
// Types
// ============================================================================

export interface InvalidationContext {
  area: MarketArea;
  analysisType: AnalysisType;
  generatedAt: string;
  expiresAt: string;
  priceAtGeneration: number | null;
  currentPrice: number | null;
  endDate?: string; // For markets with expiry (Betfair pre-match, Polymarket)
}

export interface InvalidationResult {
  shouldInvalidate: boolean;
  reason: string;
  urgency: 'low' | 'medium' | 'high';
}

// ============================================================================
// Constants — from FILE_SACRO section 8.3
// ============================================================================

/** Market profile: every 24h or when price changes >5% */
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;
const PROFILE_PRICE_CHANGE_THRESHOLD = 0.05;

/** Polymarket analysis: when price moves >5% from last analysis */
const POLYMARKET_PRICE_CHANGE_THRESHOLD = 0.05;
const POLYMARKET_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** Betfair pre-match: every 6h, then every 30min in the last 2h */
const BETFAIR_PREMATCH_TTL_MS = 6 * 60 * 60 * 1000;
const BETFAIR_PREMATCH_FINAL_TTL_MS = 30 * 60 * 1000;
const BETFAIR_PREMATCH_FINAL_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Stocks: every 24h or on significant event (proxied by >3% price move) */
const STOCKS_TTL_MS = 24 * 60 * 60 * 1000;
const STOCKS_PRICE_CHANGE_THRESHOLD = 0.03;

/** Forex: every 12h or on >2% price move */
const FOREX_TTL_MS = 12 * 60 * 60 * 1000;
const FOREX_PRICE_CHANGE_THRESHOLD = 0.02;

/** Crypto: every 12h or on >5% price move */
const CRYPTO_TTL_MS = 12 * 60 * 60 * 1000;
const CRYPTO_PRICE_CHANGE_THRESHOLD = 0.05;

// ============================================================================
// Main Invalidation Check
// ============================================================================

/**
 * Check if a cached analysis should be invalidated.
 */
export function shouldInvalidate(ctx: InvalidationContext): InvalidationResult {
  const now = Date.now();
  const generatedAt = new Date(ctx.generatedAt).getTime();
  const expiresAt = new Date(ctx.expiresAt).getTime();
  const age = now - generatedAt;

  // Hard expiry: always invalidate if past expires_at
  if (now > expiresAt) {
    return {
      shouldInvalidate: true,
      reason: 'Analisi scaduta (hard expiry)',
      urgency: 'high',
    };
  }

  // Price-based invalidation
  if (ctx.priceAtGeneration !== null && ctx.currentPrice !== null) {
    const priceResult = checkPriceInvalidation(ctx);
    if (priceResult.shouldInvalidate) return priceResult;
  }

  // Area-specific TTL rules
  switch (ctx.area) {
    case MarketArea.PREDICTION:
      return checkPredictionInvalidation(ctx, age);

    case MarketArea.EXCHANGE_BETTING:
      return checkBetfairInvalidation(ctx, age);

    case MarketArea.STOCKS:
      return checkStocksInvalidation(age);

    case MarketArea.FOREX:
      return checkForexInvalidation(age);

    case MarketArea.CRYPTO:
      return checkCryptoInvalidation(age);

    default:
      return { shouldInvalidate: false, reason: 'Analisi ancora valida', urgency: 'low' };
  }
}

/**
 * Calculate the appropriate TTL for a new analysis.
 */
export function calculateTTL(area: MarketArea, analysisType: AnalysisType, endDate?: string): number {
  switch (area) {
    case MarketArea.PREDICTION:
      return POLYMARKET_DEFAULT_TTL_MS;

    case MarketArea.EXCHANGE_BETTING: {
      if (!endDate) return BETFAIR_PREMATCH_TTL_MS;
      const timeToEvent = new Date(endDate).getTime() - Date.now();
      if (timeToEvent <= BETFAIR_PREMATCH_FINAL_WINDOW_MS) {
        return BETFAIR_PREMATCH_FINAL_TTL_MS;
      }
      return BETFAIR_PREMATCH_TTL_MS;
    }

    case MarketArea.STOCKS:
      return STOCKS_TTL_MS;

    case MarketArea.FOREX:
      return FOREX_TTL_MS;

    case MarketArea.CRYPTO:
      return CRYPTO_TTL_MS;

    default:
      return POLYMARKET_DEFAULT_TTL_MS;
  }
}

/**
 * Calculate the appropriate expires_at timestamp for a new analysis.
 */
export function calculateExpiresAt(area: MarketArea, analysisType: AnalysisType, endDate?: string): string {
  const ttl = calculateTTL(area, analysisType, endDate);
  return new Date(Date.now() + ttl).toISOString();
}

// ============================================================================
// Area-Specific Checks
// ============================================================================

function checkPriceInvalidation(ctx: InvalidationContext): InvalidationResult {
  const priceAtGen = ctx.priceAtGeneration!;
  const currentPrice = ctx.currentPrice!;

  if (priceAtGen === 0) {
    return { shouldInvalidate: false, reason: 'Prezzo di riferimento non disponibile', urgency: 'low' };
  }

  const priceChange = Math.abs(currentPrice - priceAtGen) / priceAtGen;
  const threshold = getPriceThreshold(ctx.area);

  if (priceChange >= threshold) {
    return {
      shouldInvalidate: true,
      reason: `Variazione prezzo significativa: ${(priceChange * 100).toFixed(1)}% (soglia: ${(threshold * 100).toFixed(0)}%)`,
      urgency: priceChange >= threshold * 2 ? 'high' : 'medium',
    };
  }

  return { shouldInvalidate: false, reason: 'Prezzo stabile', urgency: 'low' };
}

function getPriceThreshold(area: MarketArea): number {
  switch (area) {
    case MarketArea.PREDICTION:
      return POLYMARKET_PRICE_CHANGE_THRESHOLD;
    case MarketArea.EXCHANGE_BETTING:
      return PROFILE_PRICE_CHANGE_THRESHOLD;
    case MarketArea.STOCKS:
      return STOCKS_PRICE_CHANGE_THRESHOLD;
    case MarketArea.FOREX:
      return FOREX_PRICE_CHANGE_THRESHOLD;
    case MarketArea.CRYPTO:
      return CRYPTO_PRICE_CHANGE_THRESHOLD;
    default:
      return PROFILE_PRICE_CHANGE_THRESHOLD;
  }
}

function checkPredictionInvalidation(ctx: InvalidationContext, ageMs: number): InvalidationResult {
  if (ageMs > POLYMARKET_DEFAULT_TTL_MS) {
    return {
      shouldInvalidate: true,
      reason: 'Analisi Polymarket scaduta (>24h)',
      urgency: 'medium',
    };
  }
  return { shouldInvalidate: false, reason: 'Analisi Polymarket ancora valida', urgency: 'low' };
}

function checkBetfairInvalidation(ctx: InvalidationContext, ageMs: number): InvalidationResult {
  if (ctx.endDate) {
    const timeToEvent = new Date(ctx.endDate).getTime() - Date.now();

    // Last 2 hours before event: invalidate every 30min
    if (timeToEvent <= BETFAIR_PREMATCH_FINAL_WINDOW_MS) {
      if (ageMs > BETFAIR_PREMATCH_FINAL_TTL_MS) {
        return {
          shouldInvalidate: true,
          reason: 'Pre-match ultime 2h: aggiornamento ogni 30min',
          urgency: 'high',
        };
      }
      return { shouldInvalidate: false, reason: 'Pre-match recente', urgency: 'low' };
    }
  }

  // Normal: every 6 hours
  if (ageMs > BETFAIR_PREMATCH_TTL_MS) {
    return {
      shouldInvalidate: true,
      reason: 'Analisi Betfair scaduta (>6h)',
      urgency: 'medium',
    };
  }
  return { shouldInvalidate: false, reason: 'Analisi Betfair ancora valida', urgency: 'low' };
}

function checkStocksInvalidation(ageMs: number): InvalidationResult {
  if (ageMs > STOCKS_TTL_MS) {
    return {
      shouldInvalidate: true,
      reason: 'Analisi azione scaduta (>24h)',
      urgency: 'medium',
    };
  }
  return { shouldInvalidate: false, reason: 'Analisi azione ancora valida', urgency: 'low' };
}

function checkForexInvalidation(ageMs: number): InvalidationResult {
  if (ageMs > FOREX_TTL_MS) {
    return {
      shouldInvalidate: true,
      reason: 'Analisi forex scaduta (>12h)',
      urgency: 'medium',
    };
  }
  return { shouldInvalidate: false, reason: 'Analisi forex ancora valida', urgency: 'low' };
}

function checkCryptoInvalidation(ageMs: number): InvalidationResult {
  if (ageMs > CRYPTO_TTL_MS) {
    return {
      shouldInvalidate: true,
      reason: 'Analisi crypto scaduta (>12h)',
      urgency: 'medium',
    };
  }
  return { shouldInvalidate: false, reason: 'Analisi crypto ancora valida', urgency: 'low' };
}
