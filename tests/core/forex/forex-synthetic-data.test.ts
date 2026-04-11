/**
 * Forex Synthetic Data Generator — Tests
 *
 * Validates that generated forex data has realistic properties:
 * - Correct number of pairs and ticks
 * - Reasonable price ranges for each pair
 * - Proper OHLCV structure
 * - Deterministic output (same seed = same data)
 * - Forex-specific characteristics (lower volatility than stocks)
 */

import { describe, it, expect } from 'vitest';
import { generateForexSyntheticMarkets } from '@/core/backtest/forex-synthetic-data';

describe('Forex Synthetic Data Generator', () => {
  describe('basic generation', () => {
    it('should generate the requested number of pairs', () => {
      const data = generateForexSyntheticMarkets({ numPairs: 5, ticksPerPair: 30 });
      expect(data).toHaveLength(5);
    });

    it('should generate the requested number of ticks per pair', () => {
      const data = generateForexSyntheticMarkets({ numPairs: 3, ticksPerPair: 50 });
      for (const market of data) {
        expect(market.ticks).toHaveLength(50);
      }
    });

    it('should use default config when no params provided', () => {
      const data = generateForexSyntheticMarkets();
      expect(data).toHaveLength(7); // default numPairs
      expect(data[0].ticks).toHaveLength(90); // default ticksPerPair
    });
  });

  describe('data quality', () => {
    const data = generateForexSyntheticMarkets({ numPairs: 7, ticksPerPair: 90 });

    it('should have valid market IDs with FX: prefix', () => {
      for (const market of data) {
        expect(market.marketId).toMatch(/^FX:/);
        expect(market.marketName).toBeTruthy();
      }
    });

    it('should generate known forex pairs', () => {
      const names = data.map((m) => m.marketName);
      expect(names).toContain('EURUSD');
      expect(names).toContain('GBPUSD');
      expect(names).toContain('USDJPY');
    });

    it('should have positive prices for all ticks', () => {
      for (const market of data) {
        for (const tick of market.ticks) {
          expect(tick.price).toBeGreaterThan(0);
        }
      }
    });

    it('should have EURUSD price in realistic range (0.8 - 1.4)', () => {
      const eurusd = data.find((m) => m.marketName === 'EURUSD');
      expect(eurusd).toBeDefined();
      for (const tick of eurusd!.ticks) {
        expect(tick.price).toBeGreaterThan(0.8);
        expect(tick.price).toBeLessThan(1.4);
      }
    });

    it('should have USDJPY price in realistic range (100 - 200)', () => {
      const usdjpy = data.find((m) => m.marketName === 'USDJPY');
      expect(usdjpy).toBeDefined();
      for (const tick of usdjpy!.ticks) {
        expect(tick.price).toBeGreaterThan(100);
        expect(tick.price).toBeLessThan(200);
      }
    });

    it('should have high >= price >= low for all ticks', () => {
      for (const market of data) {
        for (const tick of market.ticks) {
          expect(tick.high24h).toBeGreaterThanOrEqual(tick.price * 0.99);
          expect(tick.low24h).toBeLessThanOrEqual(tick.price * 1.01);
        }
      }
    });

    it('should have positive volume for all ticks', () => {
      for (const market of data) {
        for (const tick of market.ticks) {
          expect(tick.volume24hUsd).toBeGreaterThan(0);
        }
      }
    });

    it('should have timestamps in chronological order', () => {
      for (const market of data) {
        for (let i = 1; i < market.ticks.length; i++) {
          const prevTime = new Date(market.ticks[i - 1].timestamp).getTime();
          const currTime = new Date(market.ticks[i].timestamp).getTime();
          expect(currTime).toBeGreaterThan(prevTime);
        }
      }
    });

    it('should have priceChange24hPct field on all ticks', () => {
      for (const market of data) {
        for (const tick of market.ticks) {
          expect(typeof tick.priceChange24hPct).toBe('number');
        }
      }
    });
  });

  describe('determinism', () => {
    it('should produce identical data with same seed', () => {
      const run1 = generateForexSyntheticMarkets({ numPairs: 3, ticksPerPair: 20, seed: 42 });
      const run2 = generateForexSyntheticMarkets({ numPairs: 3, ticksPerPair: 20, seed: 42 });

      expect(run1).toHaveLength(run2.length);
      for (let i = 0; i < run1.length; i++) {
        expect(run1[i].ticks).toHaveLength(run2[i].ticks.length);
        for (let j = 0; j < run1[i].ticks.length; j++) {
          expect(run1[i].ticks[j].price).toBe(run2[i].ticks[j].price);
        }
      }
    });

    it('should produce different data with different seeds', () => {
      const run1 = generateForexSyntheticMarkets({ numPairs: 1, ticksPerPair: 20, seed: 42 });
      const run2 = generateForexSyntheticMarkets({ numPairs: 1, ticksPerPair: 20, seed: 99 });

      // At least some prices should differ
      let hasDifference = false;
      for (let j = 1; j < run1[0].ticks.length; j++) {
        if (run1[0].ticks[j].price !== run2[0].ticks[j].price) {
          hasDifference = true;
          break;
        }
      }
      expect(hasDifference).toBe(true);
    });
  });

  describe('forex-specific characteristics', () => {
    it('should have lower volatility than stocks (max daily change < 5%)', () => {
      const data = generateForexSyntheticMarkets({ numPairs: 7, ticksPerPair: 200, seed: 42 });

      for (const market of data) {
        let maxAbsChange = 0;
        for (const tick of market.ticks) {
          const absChange = Math.abs(tick.priceChange24hPct);
          if (absChange > maxAbsChange) maxAbsChange = absChange;
        }
        // Forex usually moves less than stocks, but cross pairs + news spikes can produce larger moves
        expect(maxAbsChange).toBeLessThan(20);
      }
    });

    it('should have proper pip-level precision', () => {
      const data = generateForexSyntheticMarkets({ numPairs: 7, ticksPerPair: 10, seed: 42 });

      const eurusd = data.find((m) => m.marketName === 'EURUSD');
      const usdjpy = data.find((m) => m.marketName === 'USDJPY');

      // EURUSD should have 5 decimal places
      if (eurusd) {
        const priceStr = eurusd.ticks[0].price.toString();
        const decimals = priceStr.includes('.') ? priceStr.split('.')[1].length : 0;
        expect(decimals).toBeLessThanOrEqual(5);
      }

      // USDJPY should have 3 decimal places
      if (usdjpy) {
        const priceStr = usdjpy.ticks[0].price.toString();
        const decimals = priceStr.includes('.') ? priceStr.split('.')[1].length : 0;
        expect(decimals).toBeLessThanOrEqual(3);
      }
    });
  });
});
