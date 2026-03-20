/**
 * Test: V2 strategies (fixed L1 failures) pass pipeline + regression check on C01/C02/C03.
 */

import { describe, it, expect } from 'vitest';
import { POLYMARKET_STRATEGIES } from '@/core/strategies/polymarket-strategies';
import { runFullPipeline, PipelineResults } from '@/core/backtest/pipeline';

function logResults(r: PipelineResults) {
  console.log(
    `[${r.strategyCode}] ${r.strategyName} — highest: ${r.highestLevel ?? 'NONE'} | ` +
    `L1:${r.l1?.passed ? 'PASS' : 'FAIL'} L2:${r.l2?.passed ?? '-'} L3:${r.l3?.passed ?? '-'} L4:${r.l4?.passed ?? '-'}` +
    (r.l1?.metrics ? ` | ROI=${r.l1.metrics.roiTotal.toFixed(2)}% DD=${r.l1.metrics.maxDrawdownPct.toFixed(2)}% trades=${r.l1.metrics.totalTrades}` : ''),
  );
}

// ---------------------------------------------------------------------------
// V2 strategies — must pass L1
// ---------------------------------------------------------------------------

const V2_CODES = ['PM-C04b', 'PM-C05b', 'PM-M01b', 'PM-M02b', 'PM-M04b', 'PM-M05b'];

describe('V2 strategies pass L1', () => {
  for (const code of V2_CODES) {
    it(`${code} passes L1 (ROI > 0)`, () => {
      const seed = POLYMARKET_STRATEGIES.find(s => s.code === code);
      expect(seed, `Strategy ${code} not found in POLYMARKET_STRATEGIES`).toBeDefined();

      const results = runFullPipeline(seed!);
      logResults(results);

      expect(results.l1?.passed).toBe(true);
      expect(results.l1!.metrics.roiTotal).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Regression — original C01/C02/C03 still work
// ---------------------------------------------------------------------------

describe('Regression: C01/C02/C03 unchanged', () => {
  it('PM-C01 still passes L4', () => {
    const seed = POLYMARKET_STRATEGIES.find(s => s.code === 'PM-C01')!;
    const results = runFullPipeline(seed);
    logResults(results);
    expect(results.highestLevel).toBe('L4');
  });

  it('PM-C02 still reaches L3', () => {
    const seed = POLYMARKET_STRATEGIES.find(s => s.code === 'PM-C02')!;
    const results = runFullPipeline(seed);
    logResults(results);
    expect(results.l1?.passed).toBe(true);
    expect(results.l2?.passed).toBe(true);
    expect(results.l3?.passed).toBe(true);
    expect(results.highestLevel).toBe('L3');
  });

  it('PM-C03 still passes L4', () => {
    const seed = POLYMARKET_STRATEGIES.find(s => s.code === 'PM-C03')!;
    const results = runFullPipeline(seed);
    logResults(results);
    expect(results.highestLevel).toBe('L4');
  });
});
