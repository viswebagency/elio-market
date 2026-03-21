/**
 * Crypto Synthetic Data Generator for Backtesting
 *
 * Generates realistic crypto market data with:
 * - Higher volatility than prediction markets (3-15% daily range)
 * - Trend + mean-reversion regimes
 * - Volume spikes on big moves
 * - Realistic OHLCV with intraday noise
 * - Multiple pairs with different volatility profiles
 */

import { HistoricalMarketData, HistoricalTick } from './engine';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface CryptoSyntheticConfig {
  numPairs: number;
  ticksPerPair: number;
  seed?: number;
  /** Base volatility (daily, as decimal). Default 0.03 = 3% */
  baseVolatility?: number;
  /** Tick interval in minutes. Default 120 (2h) for backtest granularity */
  tickIntervalMinutes?: number;
}

const DEFAULT_CONFIG: CryptoSyntheticConfig = {
  numPairs: 8,
  ticksPerPair: 90,
  seed: 42,
  baseVolatility: 0.03,
  tickIntervalMinutes: 120,
};

/** Simulated crypto pairs with volatility profiles */
const CRYPTO_PAIR_PROFILES = [
  { symbol: 'CRY:BTCUSDT', name: 'BTC/USDT', basePrice: 65000, volMult: 0.8, category: 'large_cap' },
  { symbol: 'CRY:ETHUSDT', name: 'ETH/USDT', basePrice: 3500, volMult: 1.0, category: 'large_cap' },
  { symbol: 'CRY:BNBUSDT', name: 'BNB/USDT', basePrice: 580, volMult: 0.9, category: 'large_cap' },
  { symbol: 'CRY:SOLUSDT', name: 'SOL/USDT', basePrice: 150, volMult: 1.4, category: 'mid_cap' },
  { symbol: 'CRY:XRPUSDT', name: 'XRP/USDT', basePrice: 0.62, volMult: 1.2, category: 'large_cap' },
  { symbol: 'CRY:ADAUSDT', name: 'ADA/USDT', basePrice: 0.45, volMult: 1.3, category: 'mid_cap' },
  { symbol: 'CRY:DOGEUSDT', name: 'DOGE/USDT', basePrice: 0.15, volMult: 1.6, category: 'meme' },
  { symbol: 'CRY:AVAXUSDT', name: 'AVAX/USDT', basePrice: 35, volMult: 1.3, category: 'mid_cap' },
  { symbol: 'CRY:DOTUSDT', name: 'DOT/USDT', basePrice: 7.5, volMult: 1.2, category: 'mid_cap' },
  { symbol: 'CRY:MATICUSDT', name: 'MATIC/USDT', basePrice: 0.85, volMult: 1.3, category: 'mid_cap' },
];

/** Volume distribution per pair (quote volume in USDT) */
const VOLUME_PROFILES: Record<string, { baseVolume: number; spikeProb: number }> = {
  large_cap: { baseVolume: 500_000_000, spikeProb: 0.05 },
  mid_cap: { baseVolume: 100_000_000, spikeProb: 0.08 },
  meme: { baseVolume: 200_000_000, spikeProb: 0.12 },
};

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateCryptoSyntheticMarkets(
  config?: Partial<CryptoSyntheticConfig>,
): HistoricalMarketData[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let rng = createRng(cfg.seed ?? 42);
  const baseVol = cfg.baseVolatility ?? 0.03;

  const pairs = CRYPTO_PAIR_PROFILES.slice(0, cfg.numPairs);
  const markets: HistoricalMarketData[] = [];

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    rng = nextRng(rng);

    const ticks = generateCryptoPricePath({
      pair,
      tickCount: cfg.ticksPerPair,
      baseVol: baseVol * pair.volMult,
      tickIntervalMinutes: cfg.tickIntervalMinutes ?? 120,
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
      resolvedOutcome: null, // Crypto doesn't resolve like prediction markets
      ticks,
    });

    rng = nextRng(rng);
  }

  return markets;
}

// ---------------------------------------------------------------------------
// Price path generation — crypto-specific
// ---------------------------------------------------------------------------

interface PricePathParams {
  pair: typeof CRYPTO_PAIR_PROFILES[number];
  tickCount: number;
  baseVol: number;
  tickIntervalMinutes: number;
  seed: number;
}

function generateCryptoPricePath(params: PricePathParams): HistoricalTick[] {
  const { pair, tickCount, baseVol, tickIntervalMinutes, seed } = params;
  const ticks: HistoricalTick[] = [];
  let rng = seed;
  let price = pair.basePrice;

  const volProfile = VOLUME_PROFILES[pair.category] ?? VOLUME_PROFILES.mid_cap;
  const intervalMs = tickIntervalMinutes * 60 * 1000;

  // Start from 90 days ago
  const now = Date.now();
  const startMs = now - tickCount * intervalMs;

  // Regime: trending or mean-reverting, changes randomly
  let regime: 'trend_up' | 'trend_down' | 'range' = 'range';
  let regimeDuration = 0;

  for (let i = 0; i < tickCount; i++) {
    const timestamp = new Date(startMs + intervalMs * i);

    // Regime switching (every ~20-50 ticks)
    rng = nextRng(rng);
    regimeDuration++;
    if (regimeDuration > 20 + Math.abs(rng % 30)) {
      rng = nextRng(rng);
      const r = rngFloat(rng);
      regime = r < 0.3 ? 'trend_up' : r < 0.6 ? 'trend_down' : 'range';
      regimeDuration = 0;
    }

    if (i > 0) {
      // Drift based on regime
      let drift = 0;
      if (regime === 'trend_up') drift = baseVol * 0.3;
      else if (regime === 'trend_down') drift = -baseVol * 0.3;
      else drift = 0;

      // Random shock (normally distributed approximation via Box-Muller)
      rng = nextRng(rng);
      const u1 = Math.max(0.0001, rngFloat(rng));
      rng = nextRng(rng);
      const u2 = rngFloat(rng);
      const normalRandom = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

      // Price update: GBM
      const returnPct = drift + baseVol * normalRandom;
      price = price * (1 + returnPct);

      // Occasional flash crash / pump (2% probability)
      rng = nextRng(rng);
      if (rngFloat(rng) < 0.02) {
        rng = nextRng(rng);
        const flashMove = (rngFloat(rng) - 0.4) * 0.12; // -4.8% to +7.2% bias slightly up
        price = price * (1 + flashMove);
      }

      // Mean reversion to base price (calibrated to align synthetic with real Binance data)
      const meanRevStrength = 0.003;
      price = price + meanRevStrength * (pair.basePrice - price);

      // Floor: price can't go below 1% of base
      price = Math.max(pair.basePrice * 0.01, price);
    }

    // Generate OHLCV for this tick
    rng = nextRng(rng);
    const intraVol = baseVol * (0.5 + rngFloat(rng) * 1.5);
    const high = price * (1 + intraVol * 0.5);
    const low = price * (1 - intraVol * 0.5);

    // Volume: base + random + spike on big moves
    rng = nextRng(rng);
    const priceChange24h = i > 0 ? ((price - (ticks[Math.max(0, i - 12)]?.price ?? price)) / (ticks[Math.max(0, i - 12)]?.price ?? price)) * 100 : 0;
    const absChange = Math.abs(priceChange24h);
    const volumeMultiplier = 1 + absChange * 0.2 + rngFloat(rng) * 0.5;

    // Volume spike
    rng = nextRng(rng);
    const isSpike = rngFloat(rng) < volProfile.spikeProb;
    const spikeMultiplier = isSpike ? 2 + rngFloat(nextRng(rng)) * 3 : 1;

    const volume24h = volProfile.baseVolume * volumeMultiplier * spikeMultiplier * (tickIntervalMinutes / 1440);

    ticks.push({
      timestamp: timestamp.toISOString(),
      marketId: pair.symbol,
      marketName: pair.name,
      price: roundPrice(price, pair.basePrice),
      volume24hUsd: volume24h,
      totalVolumeUsd: volume24h * 10, // Approximation
      expiryDate: null, // Crypto doesn't expire
      category: pair.category,
      status: 'open',
      resolvedOutcome: null,
      // Crypto-specific fields for evaluator
      priceChange24hPct: priceChange24h,
      high24h: roundPrice(high, pair.basePrice),
      low24h: roundPrice(low, pair.basePrice),
    });
  }

  return ticks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundPrice(price: number, basePrice: number): number {
  if (basePrice >= 1000) return Math.round(price * 100) / 100;
  if (basePrice >= 1) return Math.round(price * 1000) / 1000;
  return Math.round(price * 100000) / 100000;
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
