/**
 * Historical Data Fetcher — Downloads OHLCV data from Binance via ccxt.
 *
 * Features:
 * - Fetches candles for multiple pairs and timeframes
 * - Local JSON cache in data/crypto-historical/ to avoid re-downloading
 * - Converts OHLCV to HistoricalMarketData[] for the backtest pipeline
 */

import * as fs from 'fs';
import * as path from 'path';
import { HistoricalMarketData, HistoricalTick } from '@/core/backtest/engine';

/**
 * Minimal exchange interface for fetchOHLCV.
 * Compatible with ccxt.Exchange but doesn't require importing ccxt at module level.
 */
export interface OHLCVExchange {
  fetchOHLCV(
    symbol: string,
    timeframe?: string,
    since?: number,
    limit?: number,
  ): Promise<Array<[number, number, number, number, number, number]>>;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface HistoricalDataFetcherConfig {
  /** Crypto pairs to fetch (e.g. ['BTC/USDT', 'ETH/USDT']) */
  pairs: string[];
  /** OHLCV timeframe. Default '2h' */
  timeframe: string;
  /** How many days of data to fetch. Default 90 */
  periodDays: number;
  /** Cache directory for JSON files. Default 'data/crypto-historical' */
  cacheDir: string;
  /** Force re-download even if cache exists. Default false */
  forceRefresh: boolean;
}

const DEFAULT_CONFIG: HistoricalDataFetcherConfig = {
  pairs: [
    'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT',
    'XRP/USDT', 'ADA/USDT', 'DOGE/USDT', 'AVAX/USDT',
  ],
  timeframe: '2h',
  periodDays: 90,
  cacheDir: path.resolve(process.cwd(), 'data/crypto-historical'),
  forceRefresh: false,
};

/** Category mapping for backtest compatibility */
const PAIR_CATEGORIES: Record<string, string> = {
  'BTC/USDT': 'large_cap',
  'ETH/USDT': 'large_cap',
  'BNB/USDT': 'large_cap',
  'XRP/USDT': 'large_cap',
  'SOL/USDT': 'mid_cap',
  'ADA/USDT': 'mid_cap',
  'AVAX/USDT': 'mid_cap',
  'DOGE/USDT': 'meme',
};

/** Raw OHLCV candle as stored in cache */
export interface CachedOHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FetchResult {
  pair: string;
  candles: CachedOHLCV[];
  fromCache: boolean;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

export class HistoricalDataFetcher {
  private config: HistoricalDataFetcherConfig;
  private exchange: OHLCVExchange | null = null;

  constructor(config?: Partial<HistoricalDataFetcherConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set a custom exchange instance (useful for testing with mocks).
   */
  setExchange(exchange: OHLCVExchange): void {
    this.exchange = exchange;
  }

  /**
   * Fetch OHLCV data for all configured pairs.
   * Uses cache when available, downloads from Binance otherwise.
   */
  async fetchAll(): Promise<FetchResult[]> {
    if (!this.exchange) {
      // Dynamic import to avoid loading ccxt at module level (breaks in test environments)
      const ccxt = await import('ccxt');
      this.exchange = new ccxt.default.binance({ enableRateLimit: true }) as unknown as OHLCVExchange;
    }

    // Ensure cache directory exists
    if (!fs.existsSync(this.config.cacheDir)) {
      fs.mkdirSync(this.config.cacheDir, { recursive: true });
    }

    const results: FetchResult[] = [];

    for (const pair of this.config.pairs) {
      const result = await this.fetchPair(pair);
      results.push(result);
    }

    return results;
  }

  /**
   * Fetch OHLCV data for a single pair. Returns from cache if available.
   */
  async fetchPair(pair: string): Promise<FetchResult> {
    const cacheFile = this.getCacheFilePath(pair);

    // Check cache
    if (!this.config.forceRefresh && fs.existsSync(cacheFile)) {
      const cached = this.loadFromCache(cacheFile);
      if (cached && this.isCacheValid(cached)) {
        return { pair, candles: cached, fromCache: true };
      }
    }

    // Download from exchange
    const candles = await this.downloadOHLCV(pair);

    // Save to cache
    this.saveToCache(cacheFile, candles);

    return { pair, candles, fromCache: false };
  }

  /**
   * Convert all fetched results to HistoricalMarketData[] for the backtest engine.
   */
  convertToHistoricalData(results: FetchResult[]): HistoricalMarketData[] {
    return results.map(r => convertOHLCVToHistoricalMarketData(r.pair, r.candles));
  }

  /**
   * Convenience: fetch all + convert in one call.
   */
  async fetchAndConvert(): Promise<HistoricalMarketData[]> {
    const results = await this.fetchAll();
    return this.convertToHistoricalData(results);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async downloadOHLCV(pair: string): Promise<CachedOHLCV[]> {
    if (!this.exchange) throw new Error('Exchange not initialized');

    const timeframeMs = this.timeframeToMs(this.config.timeframe);
    const now = Date.now();
    const since = now - this.config.periodDays * 24 * 60 * 60 * 1000;

    const allCandles: CachedOHLCV[] = [];
    let fetchSince = since;

    // Binance limits to 1000 candles per request — paginate
    while (fetchSince < now) {
      const ohlcv = await this.exchange.fetchOHLCV(
        pair,
        this.config.timeframe,
        fetchSince,
        1000,
      );

      if (ohlcv.length === 0) break;

      for (const candle of ohlcv) {
        allCandles.push({
          timestamp: candle[0],
          open: candle[1],
          high: candle[2],
          low: candle[3],
          close: candle[4],
          volume: candle[5],
        });
      }

      // Move to after last candle
      const lastTs = ohlcv[ohlcv.length - 1][0];
      fetchSince = lastTs + timeframeMs;

      // Rate limit safety
      if (ohlcv.length < 1000) break;
    }

    return allCandles;
  }

  private getCacheFilePath(pair: string): string {
    const safePair = pair.replace('/', '-').toLowerCase();
    const filename = `${safePair}_${this.config.timeframe}_${this.config.periodDays}d.json`;
    return path.join(this.config.cacheDir, filename);
  }

  private loadFromCache(filePath: string): CachedOHLCV[] | null {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as { candles: CachedOHLCV[]; fetchedAt: string };
      return data.candles;
    } catch {
      return null;
    }
  }

  private isCacheValid(candles: CachedOHLCV[]): boolean {
    if (candles.length === 0) return false;

    // Cache is valid if the last candle is within 24h of now
    const lastTs = candles[candles.length - 1].timestamp;
    const ageMs = Date.now() - lastTs;
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
    return ageMs < maxAgeMs;
  }

  private saveToCache(filePath: string, candles: CachedOHLCV[]): void {
    const data = {
      fetchedAt: new Date().toISOString(),
      timeframe: this.config.timeframe,
      periodDays: this.config.periodDays,
      totalCandles: candles.length,
      candles,
    };
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  }

  private timeframeToMs(timeframe: string): number {
    const map: Record<string, number> = {
      '1m': 60_000,
      '5m': 300_000,
      '15m': 900_000,
      '30m': 1_800_000,
      '1h': 3_600_000,
      '2h': 7_200_000,
      '4h': 14_400_000,
      '1d': 86_400_000,
    };
    return map[timeframe] ?? 7_200_000;
  }
}

// ---------------------------------------------------------------------------
// OHLCV → HistoricalMarketData converter
// ---------------------------------------------------------------------------

/**
 * Convert raw OHLCV candles to HistoricalMarketData format used by the backtest pipeline.
 *
 * Calculates priceChange24hPct, high24h, low24h from real candle data
 * using a 24h lookback window.
 */
export function convertOHLCVToHistoricalMarketData(
  pair: string,
  candles: CachedOHLCV[],
): HistoricalMarketData {
  if (candles.length === 0) {
    throw new Error(`No candles for ${pair}`);
  }

  const marketId = `CRY:${pair.replace('/', '')}`;
  const category = PAIR_CATEGORIES[pair] ?? 'mid_cap';

  // Determine how many candles fit in 24h based on their interval
  const candleIntervalMs = candles.length > 1
    ? candles[1].timestamp - candles[0].timestamp
    : 7_200_000;
  const candlesIn24h = Math.round((24 * 60 * 60 * 1000) / candleIntervalMs);

  const ticks: HistoricalTick[] = candles.map((candle, i) => {
    // Calculate 24h price change from candle data
    const lookbackIdx = Math.max(0, i - candlesIn24h);
    const priceNow = candle.close;
    const price24hAgo = candles[lookbackIdx].close;
    const priceChange24hPct = price24hAgo > 0
      ? ((priceNow - price24hAgo) / price24hAgo) * 100
      : 0;

    // Calculate 24h high/low from the lookback window
    let high24h = candle.high;
    let low24h = candle.low;
    for (let j = lookbackIdx; j <= i; j++) {
      if (candles[j].high > high24h) high24h = candles[j].high;
      if (candles[j].low < low24h) low24h = candles[j].low;
    }

    // Estimate 24h USD volume from the lookback window
    let volume24hUsd = 0;
    for (let j = lookbackIdx; j <= i; j++) {
      volume24hUsd += candles[j].volume * candles[j].close;
    }

    return {
      timestamp: new Date(candle.timestamp).toISOString(),
      marketId,
      marketName: pair,
      price: candle.close,
      volume24hUsd,
      totalVolumeUsd: volume24hUsd * 10, // Approximation (same as synthetic)
      expiryDate: null,
      category,
      status: 'open' as const,
      resolvedOutcome: null,
      priceChange24hPct,
      high24h,
      low24h,
    };
  });

  return {
    marketId,
    marketName: pair,
    category,
    startDate: ticks[0].timestamp,
    endDate: ticks[ticks.length - 1].timestamp,
    resolvedOutcome: null,
    ticks,
  };
}
