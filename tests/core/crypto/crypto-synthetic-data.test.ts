import { describe, it, expect } from 'vitest';
import { generateCryptoSyntheticMarkets } from '@/core/backtest/crypto-synthetic-data';

describe('Crypto Synthetic Data Generator', () => {
  it('should generate the requested number of pairs', () => {
    const data = generateCryptoSyntheticMarkets({ numPairs: 5, ticksPerPair: 30 });
    expect(data).toHaveLength(5);
  });

  it('should generate correct number of ticks per pair', () => {
    const data = generateCryptoSyntheticMarkets({ numPairs: 3, ticksPerPair: 50 });
    for (const market of data) {
      expect(market.ticks).toHaveLength(50);
    }
  });

  it('should have CRY: prefixed market IDs', () => {
    const data = generateCryptoSyntheticMarkets({ numPairs: 3, ticksPerPair: 10 });
    for (const market of data) {
      expect(market.marketId).toMatch(/^CRY:/);
    }
  });

  it('should have null resolved outcome (crypto doesnt resolve)', () => {
    const data = generateCryptoSyntheticMarkets({ numPairs: 3, ticksPerPair: 10 });
    for (const market of data) {
      expect(market.resolvedOutcome).toBeNull();
    }
  });

  it('should generate prices within reasonable bounds', () => {
    const data = generateCryptoSyntheticMarkets({ numPairs: 8, ticksPerPair: 90, seed: 42 });
    for (const market of data) {
      for (const tick of market.ticks) {
        expect(tick.price).toBeGreaterThan(0);
        expect(tick.price).toBeLessThan(1_000_000); // No price should exceed $1M
      }
    }
  });

  it('should have all ticks with status open', () => {
    const data = generateCryptoSyntheticMarkets({ numPairs: 2, ticksPerPair: 20 });
    for (const market of data) {
      for (const tick of market.ticks) {
        expect(tick.status).toBe('open');
      }
    }
  });

  it('should have null expiry dates (crypto doesnt expire)', () => {
    const data = generateCryptoSyntheticMarkets({ numPairs: 2, ticksPerPair: 10 });
    for (const market of data) {
      for (const tick of market.ticks) {
        expect(tick.expiryDate).toBeNull();
      }
    }
  });

  it('should be deterministic with same seed', () => {
    const data1 = generateCryptoSyntheticMarkets({ numPairs: 3, ticksPerPair: 20, seed: 123 });
    const data2 = generateCryptoSyntheticMarkets({ numPairs: 3, ticksPerPair: 20, seed: 123 });

    expect(data1.length).toBe(data2.length);
    for (let i = 0; i < data1.length; i++) {
      expect(data1[i].marketId).toBe(data2[i].marketId);
      for (let j = 0; j < data1[i].ticks.length; j++) {
        expect(data1[i].ticks[j].price).toBe(data2[i].ticks[j].price);
      }
    }
  });

  it('should produce different data with different seeds', () => {
    const data1 = generateCryptoSyntheticMarkets({ numPairs: 3, ticksPerPair: 20, seed: 42 });
    const data2 = generateCryptoSyntheticMarkets({ numPairs: 3, ticksPerPair: 20, seed: 99 });

    // Same structure, different prices
    let hasDifference = false;
    for (let i = 0; i < data1.length; i++) {
      for (let j = 0; j < data1[i].ticks.length; j++) {
        if (data1[i].ticks[j].price !== data2[i].ticks[j].price) {
          hasDifference = true;
          break;
        }
      }
      if (hasDifference) break;
    }
    expect(hasDifference).toBe(true);
  });

  it('should have higher volatility than prediction market data', () => {
    const data = generateCryptoSyntheticMarkets({
      numPairs: 1,
      ticksPerPair: 90,
      seed: 42,
      baseVolatility: 0.03,
    });

    const prices = data[0].ticks.map((t) => t.price);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const range = (maxPrice - minPrice) / prices[0];

    // Crypto should have meaningful price range over 90 ticks
    expect(range).toBeGreaterThan(0.05); // At least 5% range
  });

  it('should have positive volume for all ticks', () => {
    const data = generateCryptoSyntheticMarkets({ numPairs: 3, ticksPerPair: 30 });
    for (const market of data) {
      for (const tick of market.ticks) {
        expect(tick.volume24hUsd).toBeGreaterThan(0);
        expect(tick.totalVolumeUsd).toBeGreaterThan(0);
      }
    }
  });
});
