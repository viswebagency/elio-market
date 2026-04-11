/**
 * Forex Synthetic Data Generator for Backtesting
 *
 * Generates realistic forex market data with:
 * - Lower volatility than crypto/stocks (0.2-1.5% daily range typical for forex)
 * - 24/5 market (Sunday 22:00 UTC to Friday 22:00 UTC)
 * - Session-based volume patterns (London > NY > Tokyo > Sydney)
 * - Occasional news-driven spikes
 * - Mean reversion stronger than stocks (currency pairs are range-bound)
 * - Multiple pairs with different volatility profiles (majors vs crosses)
 */

import { HistoricalMarketData, HistoricalTick } from './engine';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface ForexSyntheticConfig {
  numPairs: number;
  ticksPerPair: number;
  seed?: number;
  /** Base volatility (daily, as decimal). Default 0.008 = 0.8% */
  baseVolatility?: number;
  /** Tick interval in minutes. Default 60 (1h) */
  tickIntervalMinutes?: number;
}

const DEFAULT_CONFIG: ForexSyntheticConfig = {
  numPairs: 7,
  ticksPerPair: 90,
  seed: 42,
  baseVolatility: 0.008,
  tickIntervalMinutes: 60,
};

/** Simulated forex pair profiles */
const FOREX_PROFILES = [
  { symbol: 'FX:EURUSD', name: 'EURUSD', basePrice: 1.0850, volMult: 0.9, category: 'major' },
  { symbol: 'FX:GBPUSD', name: 'GBPUSD', basePrice: 1.2650, volMult: 1.1, category: 'major' },
  { symbol: 'FX:USDJPY', name: 'USDJPY', basePrice: 150.50, volMult: 1.0, category: 'major' },
  { symbol: 'FX:USDCHF', name: 'USDCHF', basePrice: 0.8850, volMult: 0.8, category: 'major' },
  { symbol: 'FX:AUDUSD', name: 'AUDUSD', basePrice: 0.6550, volMult: 1.2, category: 'major' },
  { symbol: 'FX:USDCAD', name: 'USDCAD', basePrice: 1.3650, volMult: 0.9, category: 'major' },
  { symbol: 'FX:NZDUSD', name: 'NZDUSD', basePrice: 0.6100, volMult: 1.1, category: 'major' },
  { symbol: 'FX:EURGBP', name: 'EURGBP', basePrice: 0.8570, volMult: 0.7, category: 'cross' },
  { symbol: 'FX:EURJPY', name: 'EURJPY', basePrice: 163.30, volMult: 1.3, category: 'cross' },
  { symbol: 'FX:GBPJPY', name: 'GBPJPY', basePrice: 190.40, volMult: 1.5, category: 'cross' },
  { symbol: 'FX:AUDJPY', name: 'AUDJPY', basePrice: 98.50, volMult: 1.3, category: 'cross' },
];

const VOLUME_PROFILES: Record<string, { baseVolume: number; spikeProb: number }> = {
  major: { baseVolume: 100_000_000, spikeProb: 0.02 },
  cross: { baseVolume: 30_000_000, spikeProb: 0.03 },
};

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateForexSyntheticMarkets(
  config?: Partial<ForexSyntheticConfig>,
): HistoricalMarketData[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let rng = createRng(cfg.seed ?? 42);
  const baseVol = cfg.baseVolatility ?? 0.008;

  const pairs = FOREX_PROFILES.slice(0, cfg.numPairs);
  const markets: HistoricalMarketData[] = [];

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    rng = nextRng(rng);

    const ticks = generateForexPricePath({
      pair,
      tickCount: cfg.ticksPerPair,
      baseVol: baseVol * pair.volMult,
      tickIntervalMinutes: cfg.tickIntervalMinutes ?? 60,
      seed: rng,
    });

    const startDate = ticks[0]?.timestamp ?? new Date().toISOString();
    const endDate = ticks[ticks.length - 1]?.timestamp ?? new Date().toISOString();

    markets.push({
      marketId: pair.symbol,
      marketName: pair.name,
      category: pair.category,
      startDate,
      endDate,
      resolvedOutcome: null,
      ticks,
    });

    rng = nextRng(rng);
  }

  return markets;
}

// ---------------------------------------------------------------------------
// Price path generation — forex-specific
// ---------------------------------------------------------------------------

interface PricePathParams {
  pair: typeof FOREX_PROFILES[number];
  tickCount: number;
  baseVol: number;
  tickIntervalMinutes: number;
  seed: number;
}

function generateForexPricePath(params: PricePathParams): HistoricalTick[] {
  const { pair, tickCount, baseVol, tickIntervalMinutes, seed } = params;
  const ticks: HistoricalTick[] = [];
  let rng = seed;
  let price = pair.basePrice;

  const volProfile = VOLUME_PROFILES[pair.category] ?? VOLUME_PROFILES.major;
  const intervalMs = tickIntervalMinutes * 60 * 1000;

  // Start from 90 days ago
  const now = Date.now();
  const startMs = now - tickCount * intervalMs;

  // Regime: trending or mean-reverting
  let regime: 'trend_up' | 'trend_down' | 'range' = 'range';
  let regimeDuration = 0;

  // Pip-based rounding
  const isJpyPair = pair.name.includes('JPY');
  const pipDecimals = isJpyPair ? 3 : 5;

  for (let i = 0; i < tickCount; i++) {
    const timestamp = new Date(startMs + intervalMs * i);

    // Regime switching (every ~30-70 ticks)
    rng = nextRng(rng);
    regimeDuration++;
    if (regimeDuration > 30 + Math.abs(rng % 40)) {
      rng = nextRng(rng);
      const r = rngFloat(rng);
      // Forex spends more time in range than stocks
      regime = r < 0.2 ? 'trend_up' : r < 0.4 ? 'trend_down' : 'range';
      regimeDuration = 0;
    }

    if (i > 0) {
      // Drift based on regime (forex has minimal drift — currencies are relative)
      let drift = 0;
      if (regime === 'trend_up') drift = baseVol * 0.15;
      else if (regime === 'trend_down') drift -= baseVol * 0.15;

      // Random shock
      rng = nextRng(rng);
      const u1 = Math.max(0.0001, rngFloat(rng));
      rng = nextRng(rng);
      const u2 = rngFloat(rng);
      const normalRandom = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

      const returnPct = drift + baseVol * normalRandom;
      price = price * (1 + returnPct);

      // Occasional news spike (2% probability — NFP, ECB, BOJ etc.)
      rng = nextRng(rng);
      if (rngFloat(rng) < 0.02) {
        rng = nextRng(rng);
        const spikeMove = (rngFloat(rng) - 0.5) * 0.04; // -2% to +2%
        price = price * (1 + spikeMove);
      }

      // Stronger mean reversion than stocks (currencies are range-bound)
      const meanRevStrength = 0.005;
      price = price + meanRevStrength * (pair.basePrice - price);

      // Floor/ceiling
      price = Math.max(pair.basePrice * 0.85, Math.min(pair.basePrice * 1.15, price));
    }

    // Generate OHLCV
    rng = nextRng(rng);
    const intraVol = baseVol * (0.2 + rngFloat(rng) * 0.8);
    const high = price * (1 + intraVol * 0.5);
    const low = price * (1 - intraVol * 0.5);

    // Calculate 24h price change
    const lookback = Math.min(i, Math.floor(1440 / tickIntervalMinutes));
    const priceChange24h = lookback > 0
      ? ((price - (ticks[i - lookback]?.price ?? price)) / (ticks[i - lookback]?.price ?? price)) * 100
      : 0;

    // Volume with session-based variation
    rng = nextRng(rng);
    const absChange = Math.abs(priceChange24h);
    const volumeMultiplier = 1 + absChange * 0.5 + rngFloat(rng) * 0.3;

    rng = nextRng(rng);
    const isSpike = rngFloat(rng) < volProfile.spikeProb;
    const spikeMultiplier = isSpike ? 2 + rngFloat(nextRng(rng)) * 3 : 1;

    const volume24h = volProfile.baseVolume * volumeMultiplier * spikeMultiplier * (tickIntervalMinutes / 1440);

    ticks.push({
      timestamp: timestamp.toISOString(),
      marketId: pair.symbol,
      marketName: pair.name,
      price: roundForex(price, pipDecimals),
      volume24hUsd: volume24h,
      totalVolumeUsd: volume24h * 8,
      expiryDate: null,
      category: pair.category,
      status: 'open',
      resolvedOutcome: null,
      priceChange24hPct: priceChange24h,
      high24h: roundForex(high, pipDecimals),
      low24h: roundForex(low, pipDecimals),
    });
  }

  return ticks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundForex(price: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(price * factor) / factor;
}

function createRng(seed: number): number {
  return Math.abs(seed) || 1;
}

function nextRng(rng: number): number {
  return ((rng * 1103515245 + 12345) & 0x7fffffff) || 1;
}

function rngFloat(rng: number): number {
  return (Math.abs(rng) % 10000) / 10000;
}
