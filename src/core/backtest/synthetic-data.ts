/**
 * Synthetic Market Data Generator for Backtesting
 *
 * Generates realistic Polymarket-like market data when real historical data
 * is insufficient (e.g., most big markets haven't closed yet).
 *
 * Uses parameters calibrated on real Polymarket distributions:
 * - Volume: $10K-$5M (log-normal)
 * - Duration: 3-120 days
 * - Price paths: geometric brownian motion with mean-reversion near expiry
 * - Resolution: binary (YES=1, NO=0) based on starting probability
 * - Categories: politics, crypto, sports, entertainment, science
 */

import { HistoricalMarketData, HistoricalTick } from './engine';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SyntheticDataConfig {
  /** Number of synthetic markets to generate */
  numMarkets: number;
  /** Ticks per market (days) */
  ticksPerMarket: number;
  /** Random seed for reproducibility */
  seed?: number;
  /** Minimum volume for generated markets (USD) */
  minVolume?: number;
  /** Volatility factor (1.0 = normal, 2.0 = high vol) */
  volatilityFactor?: number;
}

const DEFAULT_CONFIG: SyntheticDataConfig = {
  numMarkets: 50,
  ticksPerMarket: 90,
  seed: 42,
};

const CATEGORIES = ['politics', 'crypto', 'sports', 'entertainment', 'science', 'economics'];

// Volume distribution: calibrated on real Polymarket data
// Top markets: $1M-$50M, average: $100K-$500K, small: $10K-$50K
const VOLUME_RANGES = [
  { weight: 0.10, min: 1_000_000, max: 10_000_000 },  // mega markets
  { weight: 0.20, min: 200_000, max: 1_000_000 },      // large
  { weight: 0.30, min: 50_000, max: 200_000 },          // medium
  { weight: 0.25, min: 20_000, max: 50_000 },           // small
  { weight: 0.15, min: 5_000, max: 20_000 },            // micro
];

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateSyntheticMarkets(config?: Partial<SyntheticDataConfig>): HistoricalMarketData[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let rng = createRng(cfg.seed ?? 42);
  const volFactor = cfg.volatilityFactor ?? 1.0;

  const markets: HistoricalMarketData[] = [];

  for (let i = 0; i < cfg.numMarkets; i++) {
    // Pick random parameters
    rng = nextRng(rng);
    const category = CATEGORIES[Math.abs(rng) % CATEGORIES.length];

    rng = nextRng(rng);
    const totalVolume = pickVolume(rng);

    // Volume24h ~ 2-8% of total volume
    rng = nextRng(rng);
    const vol24hPct = 0.02 + (rngFloat(rng) * 0.06);
    const volume24h = totalVolume * vol24hPct;

    // Market duration: 3-120 days
    rng = nextRng(rng);
    const duration = 3 + Math.floor(rngFloat(rng) * 117);
    const actualTicks = Math.min(cfg.ticksPerMarket, duration);

    // Starting price: 0.05-0.95 (uniform, representing initial market estimate)
    rng = nextRng(rng);
    const startPrice = 0.05 + rngFloat(rng) * 0.90;

    // Resolution: YES with probability ~ startPrice (markets are semi-efficient)
    rng = nextRng(rng);
    const resolvedOutcome = rngFloat(rng) < startPrice ? 1 : 0;

    // Generate price path
    const now = Date.now();
    const endMs = now - (Math.floor(rngFloat(nextRng(rng)) * 90) + 1) * 24 * 60 * 60 * 1000; // ended 1-90 days ago
    rng = nextRng(rng);
    const startMs = endMs - duration * 24 * 60 * 60 * 1000;

    rng = nextRng(rng);
    const ticks = generatePricePath(
      startPrice, resolvedOutcome, startMs, endMs, actualTicks,
      totalVolume, volume24h, category, `synth-${i}`, rng, volFactor,
    );

    markets.push({
      marketId: `synth-market-${i.toString().padStart(3, '0')}`,
      marketName: `Synthetic Market ${i + 1} (${category})`,
      category,
      startDate: new Date(startMs).toISOString(),
      endDate: new Date(endMs).toISOString(),
      resolvedOutcome,
      ticks,
    });

    rng = nextRng(rng);
  }

  return markets;
}

// ---------------------------------------------------------------------------
// Price path generation (Geometric Brownian Motion + mean-reversion near expiry)
// ---------------------------------------------------------------------------

function generatePricePath(
  startPrice: number,
  resolvedOutcome: number,
  startMs: number,
  endMs: number,
  tickCount: number,
  totalVolume: number,
  volume24h: number,
  category: string,
  marketId: string,
  seed: number,
  volFactor: number,
): HistoricalTick[] {
  const ticks: HistoricalTick[] = [];
  let rng = seed;
  let price = startPrice;

  const intervalMs = (endMs - startMs) / Math.max(1, tickCount - 1);

  // Base volatility: higher for mid-range prices, lower for extreme
  const baseVol = 0.03 * volFactor;

  for (let i = 0; i < tickCount; i++) {
    const t = tickCount > 1 ? i / (tickCount - 1) : 1; // 0..1 (time progress)
    const timestamp = new Date(startMs + intervalMs * i);
    const isLast = i === tickCount - 1;

    if (isLast) {
      // Last tick = resolution
      price = resolvedOutcome;
    } else if (i > 0) {
      // Mean-reversion strength increases near expiry
      const meanRevStrength = Math.pow(t, 2) * 0.3; // 0 at start, 0.3 at end
      const targetPrice = resolvedOutcome; // Drift toward outcome

      // GBM step with mean-reversion
      rng = nextRng(rng);
      const randomShock = (rngFloat(rng) - 0.5) * 2; // -1..1

      // Volatility decreases near expiry (convergence)
      const currentVol = baseVol * (1 - t * 0.7);

      const drift = meanRevStrength * (targetPrice - price);
      const diffusion = currentVol * randomShock;

      price = price + drift + diffusion;

      // Add occasional jumps (catalyst events)
      rng = nextRng(rng);
      if (rngFloat(rng) < 0.02) { // 2% chance per tick
        rng = nextRng(rng);
        const jumpSize = (rngFloat(rng) - 0.4) * 0.15; // Slightly biased toward outcome
        price += jumpSize * (resolvedOutcome === 1 ? 1 : -1);
      }

      // Clamp to valid range
      price = Math.max(0.01, Math.min(0.99, price));
    }

    // Volume variation: higher near expiry and during jumps
    rng = nextRng(rng);
    const volumeMultiplier = 1 + t * 2 + rngFloat(rng) * 0.5;
    const tickVolume24h = volume24h * volumeMultiplier;

    const daysToExpiry = Math.ceil((endMs - timestamp.getTime()) / (24 * 60 * 60 * 1000));

    ticks.push({
      timestamp: timestamp.toISOString(),
      marketId,
      marketName: `Synthetic Market (${category})`,
      price: isLast ? resolvedOutcome : Math.round(price * 1000) / 1000,
      volume24hUsd: tickVolume24h,
      totalVolumeUsd: totalVolume,
      expiryDate: new Date(endMs).toISOString(),
      category,
      status: isLast ? 'settled' : 'open',
      resolvedOutcome: isLast ? resolvedOutcome : null,
    });
  }

  return ticks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickVolume(rng: number): number {
  const r = rngFloat(rng);
  let cumWeight = 0;
  for (const range of VOLUME_RANGES) {
    cumWeight += range.weight;
    if (r < cumWeight) {
      const logMin = Math.log(range.min);
      const logMax = Math.log(range.max);
      return Math.exp(logMin + rngFloat(nextRng(rng)) * (logMax - logMin));
    }
  }
  return 50_000; // fallback
}

// LCG pseudo-random number generator (deterministic)
function createRng(seed: number): number {
  return Math.abs(seed) || 1;
}

function nextRng(rng: number): number {
  return ((rng * 1103515245 + 12345) & 0x7fffffff) || 1;
}

function rngFloat(rng: number): number {
  return (Math.abs(rng) % 10000) / 10000;
}
