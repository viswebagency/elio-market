import { describe, it, expect } from 'vitest';
import { evaluateEntry, MarketSnapshot } from '@/core/engine/evaluator';
import { parseStrategy, RawStrategyRow } from '@/core/engine/dsl-parser';
import { CRYPTO_STRATEGIES } from '@/core/strategies/crypto-strategies';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createCryptoSnapshot(overrides?: Partial<MarketSnapshot>): MarketSnapshot {
  return {
    marketId: 'CRY:BTCUSDT',
    name: 'BTC/USDT',
    price: 65000,
    volume24hUsd: 500_000_000,
    totalVolumeUsd: 5_000_000_000,
    expiryDate: null,
    hasCatalyst: false,
    catalystDescription: null,
    category: 'large_cap',
    status: 'open',
    priceChange24hPct: -3,
    high24h: 66500,
    low24h: 63500,
    ...overrides,
  };
}

function parseTestStrategy(code: string) {
  const seed = CRYPTO_STRATEGIES.find((s) => s.code === code)!;
  const row: RawStrategyRow = {
    id: seed.code,
    code: seed.code,
    name: seed.name,
    area: seed.area,
    max_drawdown: seed.max_drawdown,
    max_allocation_pct: seed.max_allocation_pct,
    max_consecutive_losses: seed.max_consecutive_losses,
    rules: seed.rules,
  };
  return parseStrategy(row);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Crypto Evaluator — price_change_pct condition', () => {
  it('should pass CR-C01 when price dipped -3% with low vol', () => {
    const strategy = parseTestStrategy('CR-C01');
    const snapshot = createCryptoSnapshot({
      priceChange24hPct: -3,
      high24h: 66500,
      low24h: 64000,
      // vol = (66500-64000)/65000 * 100 = 3.85% — within 1-5%
      volume24hUsd: 15_000_000,
      totalVolumeUsd: 150_000_000,
    });

    const result = evaluateEntry(strategy, snapshot);
    expect(result.passed).toBe(true);
    expect(result.totalScore).toBeGreaterThan(0);
  });

  it('should fail CR-C01 when price change is positive', () => {
    const strategy = parseTestStrategy('CR-C01');
    const snapshot = createCryptoSnapshot({
      priceChange24hPct: 2, // Outside -6% to -2% range
    });

    const result = evaluateEntry(strategy, snapshot);
    expect(result.passed).toBe(false);
  });

  it('should fail CR-C01 when volatility is too high', () => {
    const strategy = parseTestStrategy('CR-C01');
    const snapshot = createCryptoSnapshot({
      priceChange24hPct: -4,
      high24h: 70000,
      low24h: 60000,
      // vol = (70000-60000)/65000 * 100 = 15.38% — outside 1-5%
    });

    const result = evaluateEntry(strategy, snapshot);
    expect(result.passed).toBe(false);
  });

  it('should pass CR-M01 on strong upward momentum', () => {
    const strategy = parseTestStrategy('CR-M01');
    const snapshot = createCryptoSnapshot({
      priceChange24hPct: 5, // Within +3% to +10%
      high24h: 68000,
      low24h: 63000,
      // vol = (68000-63000)/65000 * 100 = 7.69% — within 4-12%
      volume24hUsd: 20_000_000,
      totalVolumeUsd: 200_000_000,
    });

    const result = evaluateEntry(strategy, snapshot);
    expect(result.passed).toBe(true);
  });

  it('should fail CR-M01 on weak momentum', () => {
    const strategy = parseTestStrategy('CR-M01');
    const snapshot = createCryptoSnapshot({
      priceChange24hPct: 0.5, // Below +1% threshold
    });

    const result = evaluateEntry(strategy, snapshot);
    expect(result.passed).toBe(false);
  });
});

describe('Crypto Evaluator — volatility_range condition', () => {
  it('should pass CR-C03 on range-bound market', () => {
    const strategy = parseTestStrategy('CR-C03');
    const snapshot = createCryptoSnapshot({
      priceChange24hPct: -1.5, // Within -3% to -0.5%
      high24h: 67000,
      low24h: 64000,
      // vol = (67000-64000)/65000 * 100 = 4.62% — within 2-6%
      volume24hUsd: 10_000_000,
      totalVolumeUsd: 100_000_000,
    });

    const result = evaluateEntry(strategy, snapshot);
    expect(result.passed).toBe(true);
  });

  it('should fail when volatility is zero (no high/low data)', () => {
    const strategy = parseTestStrategy('CR-C03');
    const snapshot = createCryptoSnapshot({
      priceChange24hPct: -1,
      high24h: undefined,
      low24h: undefined,
    });

    const result = evaluateEntry(strategy, snapshot);
    expect(result.passed).toBe(false);
  });
});

describe('Crypto Evaluator — market status', () => {
  it('should reject closed markets', () => {
    const strategy = parseTestStrategy('CR-C01');
    const snapshot = createCryptoSnapshot({ status: 'closed' });

    const result = evaluateEntry(strategy, snapshot);
    expect(result.passed).toBe(false);
  });

  it('should reject suspended markets', () => {
    const strategy = parseTestStrategy('CR-C01');
    const snapshot = createCryptoSnapshot({ status: 'suspended' });

    const result = evaluateEntry(strategy, snapshot);
    expect(result.passed).toBe(false);
  });
});
