/**
 * Betfair Synthetic Data Generator for Backtesting
 *
 * Generates realistic betting exchange data with:
 * - Odds ranging from 1.01 to 100+ (back prices)
 * - Volume (matched) in GBP with realistic distribution
 * - Odds drift patterns (shortening for favorites, lengthening for outsiders)
 * - Multiple markets per event (match odds, over/under, etc.)
 */

import { HistoricalMarketData, HistoricalTick } from './engine';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface BetfairSyntheticConfig {
  numMarkets: number;
  ticksPerMarket: number;
  seed?: number;
  /** Base odds volatility. Default 0.02 = 2% per tick */
  baseOddsVolatility?: number;
  /** Tick interval in minutes. Default 60 */
  tickIntervalMinutes?: number;
}

const DEFAULT_CONFIG: BetfairSyntheticConfig = {
  numMarkets: 8,
  ticksPerMarket: 90,
  seed: 42,
  baseOddsVolatility: 0.02,
  tickIntervalMinutes: 60,
};

/** Simulated betting market profiles */
const BETFAIR_MARKET_PROFILES = [
  { symbol: 'BF:SOCCER_FAV1', name: 'Man City ML', baseOdds: 1.45, volMult: 0.8, category: 'soccer' },
  { symbol: 'BF:SOCCER_FAV2', name: 'Liverpool ML', baseOdds: 1.80, volMult: 1.0, category: 'soccer' },
  { symbol: 'BF:SOCCER_DRAW', name: 'Arsenal Draw', baseOdds: 3.50, volMult: 1.2, category: 'soccer' },
  { symbol: 'BF:SOCCER_OUT', name: 'Bournemouth ML', baseOdds: 8.00, volMult: 1.5, category: 'soccer' },
  { symbol: 'BF:TENNIS_FAV', name: 'Sinner ML', baseOdds: 1.35, volMult: 0.7, category: 'tennis' },
  { symbol: 'BF:TENNIS_MID', name: 'Alcaraz ML', baseOdds: 2.20, volMult: 1.0, category: 'tennis' },
  { symbol: 'BF:NBA_FAV', name: 'Lakers ML', baseOdds: 1.60, volMult: 0.9, category: 'basketball' },
  { symbol: 'BF:NBA_OUT', name: 'Hornets ML', baseOdds: 5.50, volMult: 1.3, category: 'basketball' },
  { symbol: 'BF:HORSE_FAV', name: 'Racing Fav', baseOdds: 2.80, volMult: 1.4, category: 'horse_racing' },
  { symbol: 'BF:HORSE_OUT', name: 'Racing Outsider', baseOdds: 12.00, volMult: 1.8, category: 'horse_racing' },
];

const VOLUME_PROFILES: Record<string, { baseVolume: number; spikeProb: number }> = {
  soccer: { baseVolume: 50_000, spikeProb: 0.05 },
  tennis: { baseVolume: 20_000, spikeProb: 0.04 },
  basketball: { baseVolume: 15_000, spikeProb: 0.03 },
  horse_racing: { baseVolume: 30_000, spikeProb: 0.08 },
};

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateBetfairSyntheticMarkets(
  config?: Partial<BetfairSyntheticConfig>,
): HistoricalMarketData[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let rng = createRng(cfg.seed ?? 42);
  const baseVol = cfg.baseOddsVolatility ?? 0.02;

  const profiles = BETFAIR_MARKET_PROFILES.slice(0, cfg.numMarkets);
  const markets: HistoricalMarketData[] = [];

  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];
    rng = nextRng(rng);

    const ticks = generateBetfairOddsPath({
      profile,
      tickCount: cfg.ticksPerMarket,
      baseVol: baseVol * profile.volMult,
      tickIntervalMinutes: cfg.tickIntervalMinutes ?? 60,
      seed: rng,
    });

    const startDate = ticks[0]?.timestamp ?? new Date().toISOString();
    const endDate = ticks[ticks.length - 1]?.timestamp ?? new Date().toISOString();

    markets.push({
      marketId: profile.symbol,
      marketName: profile.name,
      category: profile.category,
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
// Odds path generation
// ---------------------------------------------------------------------------

interface OddsPathParams {
  profile: typeof BETFAIR_MARKET_PROFILES[number];
  tickCount: number;
  baseVol: number;
  tickIntervalMinutes: number;
  seed: number;
}

function generateBetfairOddsPath(params: OddsPathParams): HistoricalTick[] {
  const { profile, tickCount, baseVol, tickIntervalMinutes, seed } = params;
  const ticks: HistoricalTick[] = [];
  let rng = seed;
  let odds = profile.baseOdds;

  const volProfile = VOLUME_PROFILES[profile.category] ?? VOLUME_PROFILES.soccer;
  const intervalMs = tickIntervalMinutes * 60 * 1000;
  const now = Date.now();
  const startMs = now - tickCount * intervalMs;

  for (let i = 0; i < tickCount; i++) {
    const timestamp = new Date(startMs + intervalMs * i);

    if (i > 0) {
      // Random odds movement
      rng = nextRng(rng);
      const u1 = Math.max(0.0001, rngFloat(rng));
      rng = nextRng(rng);
      const u2 = rngFloat(rng);
      const normalRandom = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

      const returnPct = baseVol * normalRandom;
      odds = odds * (1 + returnPct);

      // Mean reversion to base odds
      const meanRevStrength = 0.005;
      odds = odds + meanRevStrength * (profile.baseOdds - odds);

      // Odds floor/ceiling
      odds = Math.max(1.01, Math.min(100, odds));
    }

    // Calculate "24h" odds change
    const lookback = Math.min(i, Math.floor(1440 / tickIntervalMinutes));
    const oddsChange = lookback > 0
      ? ((odds - (ticks[i - lookback]?.price ?? odds)) / (ticks[i - lookback]?.price ?? odds)) * 100
      : 0;

    // Volume (matched amount in GBP)
    rng = nextRng(rng);
    const volumeMultiplier = 1 + Math.abs(oddsChange) * 0.2 + rngFloat(rng) * 0.5;
    rng = nextRng(rng);
    const isSpike = rngFloat(rng) < volProfile.spikeProb;
    const spikeMultiplier = isSpike ? 2 + rngFloat(nextRng(rng)) * 3 : 1;
    const volume = volProfile.baseVolume * volumeMultiplier * spikeMultiplier * (tickIntervalMinutes / 1440);

    // High/low odds for the period
    rng = nextRng(rng);
    const intraVol = baseVol * (0.3 + rngFloat(rng) * 1.0);
    const highOdds = odds * (1 + intraVol * 0.5);
    const lowOdds = odds * (1 - intraVol * 0.5);

    ticks.push({
      timestamp: timestamp.toISOString(),
      marketId: profile.symbol,
      marketName: profile.name,
      price: roundOdds(odds),
      volume24hUsd: volume,
      totalVolumeUsd: volume * 5,
      expiryDate: null,
      category: profile.category,
      status: 'open',
      resolvedOutcome: null,
      priceChange24hPct: oddsChange,
      high24h: roundOdds(highOdds),
      low24h: roundOdds(Math.max(1.01, lowOdds)),
    });
  }

  return ticks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundOdds(odds: number): number {
  return Math.round(odds * 100) / 100;
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
