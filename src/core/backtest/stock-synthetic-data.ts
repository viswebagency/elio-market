/**
 * Stock Synthetic Data Generator for Backtesting
 *
 * Generates realistic stock market data with:
 * - Lower volatility than crypto (0.5-3% daily range)
 * - Market hours only (no overnight ticks)
 * - Earnings gaps / post-earnings drift
 * - Volume patterns aligned to market hours
 * - Multiple tickers with different volatility profiles (mega-cap vs growth)
 */

import { HistoricalMarketData, HistoricalTick } from './engine';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface StockSyntheticConfig {
  numTickers: number;
  ticksPerTicker: number;
  seed?: number;
  /** Base volatility (daily, as decimal). Default 0.015 = 1.5% */
  baseVolatility?: number;
  /** Tick interval in minutes. Default 60 (1h) */
  tickIntervalMinutes?: number;
}

const DEFAULT_CONFIG: StockSyntheticConfig = {
  numTickers: 7,
  ticksPerTicker: 90,
  seed: 42,
  baseVolatility: 0.015,
  tickIntervalMinutes: 60,
};

/** Simulated stock profiles */
const STOCK_PROFILES = [
  { symbol: 'STK:AAPL', name: 'AAPL', basePrice: 195, volMult: 0.8, category: 'mega_cap' },
  { symbol: 'STK:MSFT', name: 'MSFT', basePrice: 420, volMult: 0.7, category: 'mega_cap' },
  { symbol: 'STK:GOOGL', name: 'GOOGL', basePrice: 175, volMult: 0.9, category: 'mega_cap' },
  { symbol: 'STK:AMZN', name: 'AMZN', basePrice: 185, volMult: 1.0, category: 'mega_cap' },
  { symbol: 'STK:TSLA', name: 'TSLA', basePrice: 245, volMult: 1.8, category: 'growth' },
  { symbol: 'STK:META', name: 'META', basePrice: 505, volMult: 1.1, category: 'mega_cap' },
  { symbol: 'STK:NVDA', name: 'NVDA', basePrice: 880, volMult: 1.5, category: 'growth' },
  { symbol: 'STK:SAP.DE', name: 'SAP.DE', basePrice: 190, volMult: 0.7, category: 'eu_large' },
  { symbol: 'STK:ASML.AS', name: 'ASML.AS', basePrice: 900, volMult: 1.2, category: 'eu_large' },
  { symbol: 'STK:SIE.DE', name: 'SIE.DE', basePrice: 175, volMult: 0.8, category: 'eu_large' },
];

const VOLUME_PROFILES: Record<string, { baseVolume: number; spikeProb: number }> = {
  mega_cap: { baseVolume: 300_000_000, spikeProb: 0.03 },
  growth: { baseVolume: 150_000_000, spikeProb: 0.06 },
  eu_large: { baseVolume: 50_000_000, spikeProb: 0.02 },
};

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateStockSyntheticMarkets(
  config?: Partial<StockSyntheticConfig>,
): HistoricalMarketData[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let rng = createRng(cfg.seed ?? 42);
  const baseVol = cfg.baseVolatility ?? 0.015;

  const tickers = STOCK_PROFILES.slice(0, cfg.numTickers);
  const markets: HistoricalMarketData[] = [];

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    rng = nextRng(rng);

    const ticks = generateStockPricePath({
      ticker,
      tickCount: cfg.ticksPerTicker,
      baseVol: baseVol * ticker.volMult,
      tickIntervalMinutes: cfg.tickIntervalMinutes ?? 60,
      seed: rng,
    });

    const startDate = ticks[0]?.timestamp ?? new Date().toISOString();
    const endDate = ticks[ticks.length - 1]?.timestamp ?? new Date().toISOString();

    markets.push({
      marketId: ticker.symbol,
      marketName: ticker.name,
      category: ticker.category,
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
// Price path generation — stock-specific
// ---------------------------------------------------------------------------

interface PricePathParams {
  ticker: typeof STOCK_PROFILES[number];
  tickCount: number;
  baseVol: number;
  tickIntervalMinutes: number;
  seed: number;
}

function generateStockPricePath(params: PricePathParams): HistoricalTick[] {
  const { ticker, tickCount, baseVol, tickIntervalMinutes, seed } = params;
  const ticks: HistoricalTick[] = [];
  let rng = seed;
  let price = ticker.basePrice;

  const volProfile = VOLUME_PROFILES[ticker.category] ?? VOLUME_PROFILES.mega_cap;
  const intervalMs = tickIntervalMinutes * 60 * 1000;

  // Start from 90 days ago
  const now = Date.now();
  const startMs = now - tickCount * intervalMs;

  // Regime: trending or mean-reverting
  let regime: 'trend_up' | 'trend_down' | 'range' = 'range';
  let regimeDuration = 0;

  for (let i = 0; i < tickCount; i++) {
    const timestamp = new Date(startMs + intervalMs * i);

    // Regime switching (every ~25-60 ticks)
    rng = nextRng(rng);
    regimeDuration++;
    if (regimeDuration > 25 + Math.abs(rng % 35)) {
      rng = nextRng(rng);
      const r = rngFloat(rng);
      regime = r < 0.3 ? 'trend_up' : r < 0.55 ? 'trend_down' : 'range';
      regimeDuration = 0;
    }

    if (i > 0) {
      // Drift based on regime (stocks have slight upward bias)
      let drift = baseVol * 0.05; // slight positive drift (market risk premium)
      if (regime === 'trend_up') drift += baseVol * 0.2;
      else if (regime === 'trend_down') drift -= baseVol * 0.3;

      // Random shock
      rng = nextRng(rng);
      const u1 = Math.max(0.0001, rngFloat(rng));
      rng = nextRng(rng);
      const u2 = rngFloat(rng);
      const normalRandom = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

      const returnPct = drift + baseVol * normalRandom;
      price = price * (1 + returnPct);

      // Occasional gap (earnings surprise, 3% probability)
      rng = nextRng(rng);
      if (rngFloat(rng) < 0.03) {
        rng = nextRng(rng);
        const gapMove = (rngFloat(rng) - 0.45) * 0.08; // -3.6% to +4.4% slight upward bias
        price = price * (1 + gapMove);
      }

      // Mean reversion to base price
      const meanRevStrength = 0.002;
      price = price + meanRevStrength * (ticker.basePrice - price);

      // Floor
      price = Math.max(ticker.basePrice * 0.5, price);
    }

    // Generate OHLCV
    rng = nextRng(rng);
    const intraVol = baseVol * (0.3 + rngFloat(rng) * 1.2);
    const high = price * (1 + intraVol * 0.5);
    const low = price * (1 - intraVol * 0.5);

    // Calculate 24h price change
    const lookback = Math.min(i, Math.floor(1440 / tickIntervalMinutes));
    const priceChange24h = lookback > 0
      ? ((price - (ticks[i - lookback]?.price ?? price)) / (ticks[i - lookback]?.price ?? price)) * 100
      : 0;

    // Volume
    rng = nextRng(rng);
    const absChange = Math.abs(priceChange24h);
    const volumeMultiplier = 1 + absChange * 0.3 + rngFloat(rng) * 0.4;

    rng = nextRng(rng);
    const isSpike = rngFloat(rng) < volProfile.spikeProb;
    const spikeMultiplier = isSpike ? 2 + rngFloat(nextRng(rng)) * 2 : 1;

    const volume24h = volProfile.baseVolume * volumeMultiplier * spikeMultiplier * (tickIntervalMinutes / 1440);

    ticks.push({
      timestamp: timestamp.toISOString(),
      marketId: ticker.symbol,
      marketName: ticker.name,
      price: roundPrice(price),
      volume24hUsd: volume24h,
      totalVolumeUsd: volume24h * 5,
      expiryDate: null,
      category: ticker.category,
      status: 'open',
      resolvedOutcome: null,
      priceChange24hPct: priceChange24h,
      high24h: roundPrice(high),
      low24h: roundPrice(low),
    });
  }

  return ticks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundPrice(price: number): number {
  return Math.round(price * 100) / 100;
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
