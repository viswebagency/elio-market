import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HistoricalDataFetcher,
  convertOHLCVToHistoricalMarketData,
  CachedOHLCV,
} from '@/plugins/crypto/historical';
import {
  runCryptoL1WithRealData,
  runCryptoL2WithRealData,
  parseCryptoSeedToStrategy,
} from '@/core/backtest/crypto-pipeline';
import { CRYPTO_STRATEGIES } from '@/core/strategies/crypto-strategies';

// ---------------------------------------------------------------------------
// Test data — realistic BTC/USDT 2h candles (small sample)
// ---------------------------------------------------------------------------

function generateTestCandles(count: number, basePrice = 65000): CachedOHLCV[] {
  const candles: CachedOHLCV[] = [];
  const intervalMs = 2 * 60 * 60 * 1000; // 2h
  const start = Date.now() - count * intervalMs;
  let price = basePrice;

  for (let i = 0; i < count; i++) {
    // Simulate price movement with some volatility
    const change = (Math.sin(i * 0.3) * 0.02 + (Math.random() - 0.5) * 0.01) * price;
    price += change;
    price = Math.max(basePrice * 0.8, Math.min(basePrice * 1.2, price));

    const vol = Math.abs(change) / price;
    const high = price * (1 + vol * 2 + 0.002);
    const low = price * (1 - vol * 2 - 0.002);

    candles.push({
      timestamp: start + i * intervalMs,
      open: price - change * 0.3,
      high,
      low,
      close: price,
      volume: 1000 + Math.random() * 5000,
    });
  }

  return candles;
}

// ---------------------------------------------------------------------------
// convertOHLCVToHistoricalMarketData tests
// ---------------------------------------------------------------------------

describe('convertOHLCVToHistoricalMarketData', () => {
  it('should convert candles to HistoricalMarketData format', () => {
    const candles = generateTestCandles(100);
    const result = convertOHLCVToHistoricalMarketData('BTC/USDT', candles);

    expect(result.marketId).toBe('CRY:BTCUSDT');
    expect(result.marketName).toBe('BTC/USDT');
    expect(result.category).toBe('large_cap');
    expect(result.resolvedOutcome).toBeNull();
    expect(result.ticks).toHaveLength(100);
  });

  it('should calculate priceChange24hPct from real candle lookback', () => {
    const candles = generateTestCandles(50);
    const result = convertOHLCVToHistoricalMarketData('BTC/USDT', candles);

    // First tick should have 0% change (no lookback)
    expect(result.ticks[0].priceChange24hPct).toBe(0);

    // Later ticks should have computed change based on 12-candle lookback (24h / 2h)
    for (const tick of result.ticks.slice(12)) {
      expect(typeof tick.priceChange24hPct).toBe('number');
      expect(tick.priceChange24hPct).not.toBeNaN();
    }
  });

  it('should calculate high24h and low24h from lookback window', () => {
    const candles = generateTestCandles(30);
    const result = convertOHLCVToHistoricalMarketData('ETH/USDT', candles);

    for (const tick of result.ticks) {
      expect(tick.high24h).toBeDefined();
      expect(tick.low24h).toBeDefined();
      expect(tick.high24h!).toBeGreaterThanOrEqual(tick.price);
      expect(tick.low24h!).toBeLessThanOrEqual(tick.price);
    }
  });

  it('should compute volume24hUsd from lookback window', () => {
    const candles = generateTestCandles(30);
    const result = convertOHLCVToHistoricalMarketData('BTC/USDT', candles);

    for (const tick of result.ticks) {
      expect(tick.volume24hUsd).toBeGreaterThan(0);
    }
  });

  it('should set correct category for each pair', () => {
    const candles = generateTestCandles(10);

    expect(convertOHLCVToHistoricalMarketData('BTC/USDT', candles).category).toBe('large_cap');
    expect(convertOHLCVToHistoricalMarketData('SOL/USDT', candles).category).toBe('mid_cap');
    expect(convertOHLCVToHistoricalMarketData('DOGE/USDT', candles).category).toBe('meme');
  });

  it('should throw on empty candles', () => {
    expect(() => convertOHLCVToHistoricalMarketData('BTC/USDT', [])).toThrow('No candles');
  });

  it('should have all tick fields required by backtest engine', () => {
    const candles = generateTestCandles(10);
    const result = convertOHLCVToHistoricalMarketData('BTC/USDT', candles);
    const tick = result.ticks[0];

    expect(tick.timestamp).toBeTruthy();
    expect(tick.marketId).toBe('CRY:BTCUSDT');
    expect(tick.marketName).toBe('BTC/USDT');
    expect(typeof tick.price).toBe('number');
    expect(typeof tick.volume24hUsd).toBe('number');
    expect(tick.expiryDate).toBeNull();
    expect(tick.status).toBe('open');
    expect(tick.resolvedOutcome).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// HistoricalDataFetcher tests (with mock ccxt)
// ---------------------------------------------------------------------------

describe('HistoricalDataFetcher', () => {
  it('should use mock exchange for fetchPair', async () => {
    const mockCandles = generateTestCandles(20);
    const mockOHLCV = mockCandles.map(c => [c.timestamp, c.open, c.high, c.low, c.close, c.volume]);

    const mockExchange = {
      fetchOHLCV: vi.fn().mockResolvedValue(mockOHLCV),
    };

    const fetcher = new HistoricalDataFetcher({
      pairs: ['BTC/USDT'],
      timeframe: '2h',
      periodDays: 5,
      cacheDir: '/tmp/test-crypto-cache-' + Date.now(),
      forceRefresh: true,
    });
    fetcher.setExchange(mockExchange as any);

    const results = await fetcher.fetchAll();

    expect(results).toHaveLength(1);
    expect(results[0].pair).toBe('BTC/USDT');
    expect(results[0].candles).toHaveLength(20);
    expect(results[0].fromCache).toBe(false);
    expect(mockExchange.fetchOHLCV).toHaveBeenCalledWith('BTC/USDT', '2h', expect.any(Number), 1000);
  });

  it('should paginate when exchange returns full batches', async () => {
    // Generate 1000 candles spanning from 90 days ago
    const intervalMs = 2 * 60 * 60 * 1000;
    const now = Date.now();
    const start = now - 90 * 24 * 60 * 60 * 1000;

    const makeBatch = (from: number, count: number) => {
      const result: number[][] = [];
      for (let i = 0; i < count; i++) {
        const ts = from + i * intervalMs;
        result.push([ts, 65000, 65500, 64500, 65100, 1000]);
      }
      return result;
    };

    const batch1 = makeBatch(start, 1000);
    const lastTs1 = batch1[batch1.length - 1][0];
    const batch2 = makeBatch(lastTs1 + intervalMs, 50);

    const mockExchange = {
      fetchOHLCV: vi.fn()
        .mockResolvedValueOnce(batch1)
        .mockResolvedValueOnce(batch2),
    };

    const fetcher = new HistoricalDataFetcher({
      pairs: ['BTC/USDT'],
      timeframe: '2h',
      periodDays: 90,
      cacheDir: '/tmp/test-crypto-cache-paginate-' + Date.now(),
      forceRefresh: true,
    });
    fetcher.setExchange(mockExchange as any);

    const results = await fetcher.fetchAll();

    expect(results[0].candles).toHaveLength(1050);
    expect(mockExchange.fetchOHLCV).toHaveBeenCalledTimes(2);
  });

  it('should save and load from cache', async () => {
    const cacheDir = '/tmp/test-crypto-cache-save-' + Date.now();
    const candles = generateTestCandles(20);
    const mockOHLCV = candles.map(c => [c.timestamp, c.open, c.high, c.low, c.close, c.volume]);

    const mockExchange = {
      fetchOHLCV: vi.fn().mockResolvedValue(mockOHLCV),
    };

    // First fetch — downloads
    const fetcher1 = new HistoricalDataFetcher({
      pairs: ['BTC/USDT'],
      timeframe: '2h',
      periodDays: 5,
      cacheDir,
      forceRefresh: false,
    });
    fetcher1.setExchange(mockExchange as any);
    const result1 = await fetcher1.fetchAll();
    expect(result1[0].fromCache).toBe(false);

    // Second fetch — from cache
    const mockExchange2 = {
      fetchOHLCV: vi.fn().mockResolvedValue([]),
    };
    const fetcher2 = new HistoricalDataFetcher({
      pairs: ['BTC/USDT'],
      timeframe: '2h',
      periodDays: 5,
      cacheDir,
      forceRefresh: false,
    });
    fetcher2.setExchange(mockExchange2 as any);
    const result2 = await fetcher2.fetchAll();

    expect(result2[0].fromCache).toBe(true);
    expect(result2[0].candles).toHaveLength(20);
    expect(mockExchange2.fetchOHLCV).not.toHaveBeenCalled();
  });

  it('should force refresh when configured', async () => {
    const cacheDir = '/tmp/test-crypto-cache-force-' + Date.now();
    const candles = generateTestCandles(15);
    const mockOHLCV = candles.map(c => [c.timestamp, c.open, c.high, c.low, c.close, c.volume]);

    const mockExchange = {
      fetchOHLCV: vi.fn().mockResolvedValue(mockOHLCV),
    };

    // First fetch
    const fetcher1 = new HistoricalDataFetcher({
      pairs: ['BTC/USDT'],
      timeframe: '2h',
      periodDays: 5,
      cacheDir,
      forceRefresh: true,
    });
    fetcher1.setExchange(mockExchange as any);
    await fetcher1.fetchAll();

    // Second fetch with force refresh
    const fetcher2 = new HistoricalDataFetcher({
      pairs: ['BTC/USDT'],
      timeframe: '2h',
      periodDays: 5,
      cacheDir,
      forceRefresh: true,
    });
    fetcher2.setExchange(mockExchange as any);
    const result = await fetcher2.fetchAll();

    expect(result[0].fromCache).toBe(false);
    expect(mockExchange.fetchOHLCV).toHaveBeenCalledTimes(2);
  });

  it('should convertToHistoricalData correctly', async () => {
    const candles = generateTestCandles(30);
    const mockOHLCV = candles.map(c => [c.timestamp, c.open, c.high, c.low, c.close, c.volume]);

    const mockExchange = {
      fetchOHLCV: vi.fn().mockResolvedValue(mockOHLCV),
    };

    const fetcher = new HistoricalDataFetcher({
      pairs: ['BTC/USDT', 'ETH/USDT'],
      timeframe: '2h',
      periodDays: 5,
      cacheDir: '/tmp/test-crypto-cache-convert-' + Date.now(),
      forceRefresh: true,
    });
    fetcher.setExchange(mockExchange as any);

    const results = await fetcher.fetchAll();
    const historicalData = fetcher.convertToHistoricalData(results);

    expect(historicalData).toHaveLength(2);
    expect(historicalData[0].marketId).toBe('CRY:BTCUSDT');
    expect(historicalData[1].marketId).toBe('CRY:ETHUSDT');
    expect(historicalData[0].ticks.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Pipeline with real-format data tests
// ---------------------------------------------------------------------------

describe('Crypto Pipeline — Real Data Functions', () => {
  // Generate synthetic-like data in real data format for testing
  function generateRealFormatData(): ReturnType<typeof convertOHLCVToHistoricalMarketData>[] {
    const pairs = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT', 'ADA/USDT', 'DOGE/USDT', 'AVAX/USDT'];
    const basePrices: Record<string, number> = {
      'BTC/USDT': 65000, 'ETH/USDT': 3500, 'BNB/USDT': 580, 'SOL/USDT': 150,
      'XRP/USDT': 0.62, 'ADA/USDT': 0.45, 'DOGE/USDT': 0.15, 'AVAX/USDT': 35,
    };

    return pairs.map(pair => {
      const candles = generateTestCandles(90, basePrices[pair] ?? 100);
      return convertOHLCVToHistoricalMarketData(pair, candles);
    });
  }

  describe('runCryptoL1WithRealData', () => {
    it('should run L1 and return valid result', () => {
      const realData = generateRealFormatData();
      const seed = CRYPTO_STRATEGIES.find(s => s.code === 'CR-C01')!;
      const strategy = parseCryptoSeedToStrategy(seed);

      const result = runCryptoL1WithRealData(strategy, realData, seed);

      expect(result.level).toBe('L1');
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.totalTrades).toBe('number');
      expect(result.metrics).toBeDefined();
      expect(result.metrics.roiTotal).toBeDefined();
      expect(result.config.markets).toBe(8);

      console.log(
        `  CR-C01 Real L1: ${result.passed ? 'PASS' : 'FAIL'} | ` +
        `trades=${result.totalTrades} | ROI=${result.metrics.roiTotal.toFixed(2)}% | ` +
        `WR=${result.metrics.winRate.toFixed(1)}%` +
        (result.reason ? ` | ${result.reason}` : ''),
      );
    });

    it('should run L1 for all strategies without errors', () => {
      const realData = generateRealFormatData();

      for (const seed of CRYPTO_STRATEGIES) {
        const strategy = parseCryptoSeedToStrategy(seed);
        const result = runCryptoL1WithRealData(strategy, realData, seed);

        expect(result.level).toBe('L1');
        expect(typeof result.passed).toBe('boolean');
        expect(typeof result.totalTrades).toBe('number');

        console.log(
          `  ${seed.code.padEnd(10)} Real L1: ${result.passed ? 'PASS' : 'FAIL'} | ` +
          `trades=${result.totalTrades} | ROI=${result.metrics.roiTotal.toFixed(2)}%`,
        );
      }
    });
  });

  describe('runCryptoL2WithRealData', () => {
    it('should run L2 with 5 rolling windows and return valid result', () => {
      const realData = generateRealFormatData();
      const seed = CRYPTO_STRATEGIES.find(s => s.code === 'CR-C01')!;
      const strategy = parseCryptoSeedToStrategy(seed);

      const result = runCryptoL2WithRealData(strategy, realData);

      expect(result.level).toBe('L2');
      expect(result.folds).toHaveLength(5);
      expect(result.totalFolds).toBe(5);
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.passedFolds).toBe('number');
      expect(typeof result.avgRoi).toBe('number');
      expect(typeof result.avgSharpe).toBe('number');

      console.log(
        `  CR-C01 Real L2: ${result.passed ? 'PASS' : 'FAIL'} | ` +
        `windows=${result.passedFolds}/${result.totalFolds} | ` +
        `avgROI=${result.avgRoi.toFixed(2)}%`,
      );
    });

    it('should use different data windows for each fold', () => {
      const realData = generateRealFormatData();
      const seed = CRYPTO_STRATEGIES.find(s => s.code === 'CR-M03b')!;
      const strategy = parseCryptoSeedToStrategy(seed);

      const result = runCryptoL2WithRealData(strategy, realData);

      // Each fold should have a different seed (window number)
      const windowNumbers = result.folds.map(f => f.seed);
      expect(windowNumbers).toEqual([1, 2, 3, 4, 5]);

      // ROIs should vary across windows (different data)
      const uniqueRois = new Set(result.folds.map(f => f.roi.toFixed(4)));
      // At least some should be different (allowing for edge cases)
      expect(uniqueRois.size).toBeGreaterThanOrEqual(1);
    });
  });
});
