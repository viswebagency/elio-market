/**
 * Test: Crypto V3 strategies (real-data optimized) pass L1 on synthetic,
 * structural validation, and regression check on existing L1 passers.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock ccxt to avoid Starknet hash error in test environment
vi.mock('ccxt', () => {
  class MockExchange {
    id = 'mock';
    markets: Record<string, unknown> = {};
    constructor(public opts: Record<string, unknown> = {}) {}
    setSandboxMode() {}
    async loadMarkets() { return {}; }
    async fetchTicker() { return { symbol: 'BTC/USDT', last: 65000, bid: 64990, ask: 65010, high: 66000, low: 64000, baseVolume: 1000, quoteVolume: 65000000, change: 100, percentage: 0.15, datetime: new Date().toISOString() }; }
  }
  return {
    default: {
      binance: class extends MockExchange { constructor(opts: Record<string, unknown>) { super(opts); this.id = 'binance'; } },
      bybit: class extends MockExchange { constructor(opts: Record<string, unknown>) { super(opts); this.id = 'bybit'; } },
    },
    binance: class extends MockExchange { constructor(opts: Record<string, unknown>) { super(opts); this.id = 'binance'; } },
    bybit: class extends MockExchange { constructor(opts: Record<string, unknown>) { super(opts); this.id = 'bybit'; } },
  };
});

vi.mock('@/lib/db/supabase/admin', () => ({
  createUntypedAdminClient: () => ({ from: vi.fn() }),
}));

import { CRYPTO_STRATEGIES, CRYPTO_STRATEGY_MAP } from '@/core/strategies/crypto-strategies';
import {
  runCryptoL1,
  runCryptoL2,
  parseCryptoSeedToStrategy,
} from '@/core/backtest/crypto-pipeline';
import { CRYPTO_L1_STRATEGY_CODES } from '@/core/paper-trading/crypto-manager';

// ---------------------------------------------------------------------------
// V3 strategies — must pass L1 on synthetic
// ---------------------------------------------------------------------------

const V3_CODES = ['CR-C01c', 'CR-M02c'];

describe('Crypto V3 strategies pass L1 (synthetic)', () => {
  for (const code of V3_CODES) {
    it(`${code} passes L1 (ROI > 0)`, () => {
      const seed = CRYPTO_STRATEGY_MAP[code];
      expect(seed, `Strategy ${code} not found`).toBeDefined();

      const strategy = parseCryptoSeedToStrategy(seed);
      const l1 = runCryptoL1(strategy, seed);

      console.log(
        `  ${code} L1: ${l1.passed ? 'PASS' : 'FAIL'} | ` +
        `trades=${l1.totalTrades} | ROI=${l1.metrics.roiTotal.toFixed(2)}% | ` +
        `WR=${l1.metrics.winRate.toFixed(1)}% | DD=${l1.metrics.maxDrawdownPct.toFixed(2)}%` +
        (l1.reason ? ` | reason: ${l1.reason}` : ''),
      );

      expect(l1.passed).toBe(true);
      expect(l1.metrics.roiTotal).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// V3 strategy with L2 pass — CR-M02c
// ---------------------------------------------------------------------------

describe('Crypto V3 L2 — CR-M02c passes (synthetic)', () => {
  it('CR-M02c passes L2 (3/5 folds profitable)', () => {
    const seed = CRYPTO_STRATEGY_MAP['CR-M02c'];
    const strategy = parseCryptoSeedToStrategy(seed);
    const l2 = runCryptoL2(strategy);

    console.log(
      `  CR-M02c L2: ${l2.passed ? 'PASS' : 'FAIL'} | ` +
      `folds=${l2.passedFolds}/${l2.totalFolds} | ` +
      `avgROI=${l2.avgRoi.toFixed(2)}% | avgSharpe=${l2.avgSharpe.toFixed(2)}`,
    );

    expect(l2.passed).toBe(true);
    expect(l2.passedFolds).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// V3 strategies — structural validation
// ---------------------------------------------------------------------------

describe('Crypto V3 strategies — structure', () => {
  const v3Strategies = CRYPTO_STRATEGIES.filter((s) => s.code.endsWith('c'));

  it('should have 2 v3 strategies (C01c, M02c)', () => {
    const v3Codes = v3Strategies.map((s) => s.code).sort();
    expect(v3Codes).toEqual(['CR-C01c', 'CR-M02c']);
  });

  it('all v3 strategies should have area = crypto', () => {
    for (const s of v3Strategies) {
      expect(s.area).toBe('crypto');
    }
  });

  it('all v3 strategies should have stop loss', () => {
    for (const s of v3Strategies) {
      const hasSL = s.rules.exit_rules.some((r) => r.params.loss_pct !== undefined && r.params.loss_pct < 0);
      expect(hasSL, `${s.code} manca stop loss`).toBe(true);
    }
  });

  it('all v3 strategies should have circuit breaker', () => {
    for (const s of v3Strategies) {
      expect(s.rules.circuit_breaker_total.loss_pct).toBeLessThan(0);
    }
  });

  it('v3 strategies should not duplicate v1 codes', () => {
    const v1Codes = ['CR-C01', 'CR-C02', 'CR-C03', 'CR-M01', 'CR-M02', 'CR-M03'];
    for (const s of v3Strategies) {
      expect(v1Codes).not.toContain(s.code);
    }
  });
});

// ---------------------------------------------------------------------------
// CRYPTO_L1_STRATEGY_CODES includes v3
// ---------------------------------------------------------------------------

describe('CRYPTO_L1_STRATEGY_CODES includes v3', () => {
  it('should contain CR-C01c', () => {
    expect(CRYPTO_L1_STRATEGY_CODES).toContain('CR-C01c');
  });

  it('should contain CR-M02c', () => {
    expect(CRYPTO_L1_STRATEGY_CODES).toContain('CR-M02c');
  });

  it('should have 7 strategies total', () => {
    expect(CRYPTO_L1_STRATEGY_CODES).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Regression — all existing L1 passers still pass after synthetic calibration
// ---------------------------------------------------------------------------

describe('Regression: existing L1 passers still pass with calibrated synthetic', () => {
  const EXISTING_L1_CODES = ['CR-C01', 'CR-C02b', 'CR-M01b', 'CR-M02b', 'CR-M03b'];

  for (const code of EXISTING_L1_CODES) {
    it(`${code} still passes L1`, () => {
      const seed = CRYPTO_STRATEGY_MAP[code];
      const strategy = parseCryptoSeedToStrategy(seed);
      const l1 = runCryptoL1(strategy, seed);

      console.log(
        `  ${code} L1: ${l1.passed ? 'PASS' : 'FAIL'} | ` +
        `ROI=${l1.metrics.roiTotal.toFixed(2)}% | WR=${l1.metrics.winRate.toFixed(1)}%`,
      );

      expect(l1.passed).toBe(true);
    });
  }

  it('CR-M02b still passes L2 (synthetic)', () => {
    const seed = CRYPTO_STRATEGY_MAP['CR-M02b'];
    const strategy = parseCryptoSeedToStrategy(seed);
    const l2 = runCryptoL2(strategy);
    expect(l2.passed).toBe(true);
  });
});
