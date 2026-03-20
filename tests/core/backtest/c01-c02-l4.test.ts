/**
 * Test: C01 passes L4 with widened range. C02 stays at L3 (genuinely fragile). C03 passes L4.
 */

import { describe, it, expect } from 'vitest';
import { POLYMARKET_STRATEGIES } from '@/core/strategies/polymarket-strategies';
import { runFullPipeline } from '@/core/backtest/pipeline';

describe('C01/C02/C03 pipeline levels', () => {
  it('PM-C01 passes all 4 levels after range widening (0.72-0.98)', () => {
    const seed = POLYMARKET_STRATEGIES.find(s => s.code === 'PM-C01')!;
    const results = runFullPipeline(seed);

    expect(results.l1?.passed).toBe(true);
    expect(results.l2?.passed).toBe(true);
    expect(results.l3?.passed).toBe(true);
    expect(results.l4?.passed).toBe(true);
    expect(results.highestLevel).toBe('L4');
  });

  it('PM-C02 reaches L3 (parameter sensitivity too high for L4)', () => {
    const seed = POLYMARKET_STRATEGIES.find(s => s.code === 'PM-C02')!;
    const results = runFullPipeline(seed);

    expect(results.l1?.passed).toBe(true);
    expect(results.l2?.passed).toBe(true);
    expect(results.l3?.passed).toBe(true);
    // L4 fails due to genuine fragility across SL/TP/sell_fraction/range params
    expect(results.l4?.passed).toBe(false);
    expect(results.highestLevel).toBe('L3');
  });

  it('PM-C03 still passes all 4 levels (no regression)', () => {
    const seed = POLYMARKET_STRATEGIES.find(s => s.code === 'PM-C03')!;
    const results = runFullPipeline(seed);
    expect(results.highestLevel).toBe('L4');
  });
});
