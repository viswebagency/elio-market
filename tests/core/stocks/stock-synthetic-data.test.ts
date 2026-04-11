import { describe, it, expect } from 'vitest';
import { generateStockSyntheticMarkets } from '@/core/backtest/stock-synthetic-data';

describe('Stock Synthetic Data Generator', () => {
  it('should generate the requested number of tickers', () => {
    const markets = generateStockSyntheticMarkets({ numTickers: 5, ticksPerTicker: 30 });
    expect(markets).toHaveLength(5);
  });

  it('should generate correct number of ticks per ticker', () => {
    const markets = generateStockSyntheticMarkets({ numTickers: 3, ticksPerTicker: 50 });
    for (const market of markets) {
      expect(market.ticks).toHaveLength(50);
    }
  });

  it('should have STK: prefix on marketId', () => {
    const markets = generateStockSyntheticMarkets({ numTickers: 2, ticksPerTicker: 10 });
    for (const market of markets) {
      expect(market.marketId).toMatch(/^STK:/);
      for (const tick of market.ticks) {
        expect(tick.marketId).toMatch(/^STK:/);
      }
    }
  });

  it('should have positive prices', () => {
    const markets = generateStockSyntheticMarkets({ numTickers: 7, ticksPerTicker: 90 });
    for (const market of markets) {
      for (const tick of market.ticks) {
        expect(tick.price).toBeGreaterThan(0);
        expect(tick.high24h).toBeGreaterThan(0);
        expect(tick.low24h).toBeGreaterThan(0);
      }
    }
  });

  it('should have high >= price >= low', () => {
    const markets = generateStockSyntheticMarkets({ numTickers: 7, ticksPerTicker: 90 });
    for (const market of markets) {
      for (const tick of market.ticks) {
        expect(tick.high24h!).toBeGreaterThanOrEqual(tick.price);
        expect(tick.low24h!).toBeLessThanOrEqual(tick.price);
      }
    }
  });

  it('should have positive volumes', () => {
    const markets = generateStockSyntheticMarkets({ numTickers: 3, ticksPerTicker: 30 });
    for (const market of markets) {
      for (const tick of market.ticks) {
        expect(tick.volume24hUsd).toBeGreaterThan(0);
      }
    }
  });

  it('should be deterministic with same seed', () => {
    const markets1 = generateStockSyntheticMarkets({ numTickers: 3, ticksPerTicker: 20, seed: 42 });
    const markets2 = generateStockSyntheticMarkets({ numTickers: 3, ticksPerTicker: 20, seed: 42 });

    for (let i = 0; i < markets1.length; i++) {
      for (let j = 0; j < markets1[i].ticks.length; j++) {
        expect(markets1[i].ticks[j].price).toBe(markets2[i].ticks[j].price);
      }
    }
  });

  it('should produce different data with different seed', () => {
    const markets1 = generateStockSyntheticMarkets({ numTickers: 1, ticksPerTicker: 20, seed: 42 });
    const markets2 = generateStockSyntheticMarkets({ numTickers: 1, ticksPerTicker: 20, seed: 99 });

    const prices1 = markets1[0].ticks.map((t) => t.price);
    const prices2 = markets2[0].ticks.map((t) => t.price);

    // At least some prices should differ
    const diffs = prices1.filter((p, i) => p !== prices2[i]);
    expect(diffs.length).toBeGreaterThan(0);
  });

  it('should have priceChange24hPct defined', () => {
    const markets = generateStockSyntheticMarkets({ numTickers: 2, ticksPerTicker: 30 });
    for (const market of markets) {
      for (const tick of market.ticks) {
        expect(tick.priceChange24hPct).toBeDefined();
        expect(typeof tick.priceChange24hPct).toBe('number');
      }
    }
  });

  it('should have stock-level volatility (lower than crypto)', () => {
    const markets = generateStockSyntheticMarkets({
      numTickers: 3,
      ticksPerTicker: 90,
      baseVolatility: 0.015,
    });

    for (const market of markets) {
      // Check that price doesn't deviate wildly from base
      const firstPrice = market.ticks[0].price;
      for (const tick of market.ticks) {
        const deviation = Math.abs(tick.price - firstPrice) / firstPrice;
        // Stock prices shouldn't deviate more than 50% from start over 90 ticks
        expect(deviation).toBeLessThan(0.5);
      }
    }
  });

  it('should have timestamps in chronological order', () => {
    const markets = generateStockSyntheticMarkets({ numTickers: 2, ticksPerTicker: 30 });
    for (const market of markets) {
      for (let i = 1; i < market.ticks.length; i++) {
        const prev = new Date(market.ticks[i - 1].timestamp).getTime();
        const curr = new Date(market.ticks[i].timestamp).getTime();
        expect(curr).toBeGreaterThan(prev);
      }
    }
  });

  it('should have all ticks with status open', () => {
    const markets = generateStockSyntheticMarkets({ numTickers: 2, ticksPerTicker: 10 });
    for (const market of markets) {
      for (const tick of market.ticks) {
        expect(tick.status).toBe('open');
      }
    }
  });

  it('should have null resolvedOutcome (stocks dont resolve)', () => {
    const markets = generateStockSyntheticMarkets({ numTickers: 1, ticksPerTicker: 5 });
    expect(markets[0].resolvedOutcome).toBeNull();
    for (const tick of markets[0].ticks) {
      expect(tick.resolvedOutcome).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// L1 Backtest validation
// ---------------------------------------------------------------------------

describe('Stock L1 Backtest — Synthetic Data Validation', () => {
  it('should generate enough data for L1 (90+ ticks)', () => {
    const markets = generateStockSyntheticMarkets({ numTickers: 7, ticksPerTicker: 90 });
    expect(markets).toHaveLength(7);
    for (const market of markets) {
      expect(market.ticks.length).toBeGreaterThanOrEqual(90);
    }
  });

  it('should have priceChange24hPct as finite numbers', () => {
    const markets = generateStockSyntheticMarkets({ numTickers: 7, ticksPerTicker: 90 });
    for (const market of markets) {
      for (const tick of market.ticks) {
        expect(tick.priceChange24hPct).toBeDefined();
        expect(Number.isFinite(tick.priceChange24hPct)).toBe(true);
      }
    }
  });

  it('should cover all 7 default tickers (AAPL, MSFT, GOOGL, AMZN, TSLA, META, NVDA)', () => {
    const markets = generateStockSyntheticMarkets({ numTickers: 7, ticksPerTicker: 30 });
    const names = markets.map((m) => m.marketName);
    expect(names).toContain('AAPL');
    expect(names).toContain('MSFT');
    expect(names).toContain('GOOGL');
    expect(names).toContain('AMZN');
    expect(names).toContain('TSLA');
    expect(names).toContain('META');
    expect(names).toContain('NVDA');
  });
});
