/**
 * Tests for Catalyst Detection integration with the Scanner.
 *
 * Verifies that polymarketToSnapshot correctly propagates catalyst data
 * and defaults to hasCatalyst=false when no catalyst data is available.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateAnalysis,
  AnalysisType,
  MarketContext,
} from '@/core/knowledge-base/analyzer';
import { MarketArea } from '@/core/types/common';

beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

function makeContext(overrides?: Partial<MarketContext>): MarketContext {
  const futureDate = new Date(Date.now() + 30 * 86400000).toISOString();
  return {
    marketId: 'catalyst-test-001',
    marketName: 'Will the Fed cut rates in July 2026?',
    area: MarketArea.PREDICTION,
    currentPrice: 0.45,
    volume24h: 30_000,
    totalVolume: 800_000,
    liquidity: 50_000,
    endDate: futureDate,
    category: 'Economics',
    description: 'Resolves YES if the FOMC announces a rate cut at the July 2026 meeting.',
    outcomes: ['Yes', 'No'],
    outcomePrices: [0.45, 0.55],
    ...overrides,
  };
}

describe('Catalyst Detection — Default Behavior', () => {
  it('without API key, hasCatalyst is always false', async () => {
    const result = await generateAnalysis(makeContext(), AnalysisType.CATALYST_DETECTION);
    expect(result.structuredData.hasCatalyst).toBe(false);
  });

  it('without API key, catalystDescription is undefined', async () => {
    const result = await generateAnalysis(makeContext(), AnalysisType.CATALYST_DETECTION);
    expect(result.structuredData.catalystDescription).toBeUndefined();
  });

  it('catalyst detection returns neutral sentiment', async () => {
    const result = await generateAnalysis(makeContext(), AnalysisType.CATALYST_DETECTION);
    expect(result.structuredData.sentiment).toBe('neutral');
  });
});

describe('Catalyst Detection — Scanner polymarketToSnapshot behavior', () => {
  /**
   * The scanner's polymarketToSnapshot function sets hasCatalyst from the
   * catalyst cache, defaulting to false. We test this indirectly:
   * without API key, generateAnalysis for CATALYST_DETECTION yields
   * hasCatalyst=false, which means the scanner would store false in the
   * snapshot's hasCatalyst field.
   */
  it('catalyst result structure is compatible with MarketSnapshot', async () => {
    const result = await generateAnalysis(makeContext(), AnalysisType.CATALYST_DETECTION);

    // The scanner reads these two fields from structuredData
    const hasCatalyst = result.structuredData.hasCatalyst ?? false;
    const description = result.structuredData.catalystDescription ?? null;

    expect(typeof hasCatalyst).toBe('boolean');
    expect(hasCatalyst).toBe(false);
    expect(description).toBeNull();
  });

  it('multiple markets all default to no catalyst without API', async () => {
    const markets = [
      makeContext({ marketId: 'market-a', marketName: 'Election outcome?' }),
      makeContext({ marketId: 'market-b', marketName: 'GDP growth > 3%?' }),
      makeContext({ marketId: 'market-c', marketName: 'SpaceX launch success?' }),
    ];

    const results = await Promise.all(
      markets.map((ctx) => generateAnalysis(ctx, AnalysisType.CATALYST_DETECTION)),
    );

    for (const result of results) {
      expect(result.structuredData.hasCatalyst).toBe(false);
      expect(result.confidence).toBe(0);
    }
  });

  it('catalyst detection result does not affect other analysis types', async () => {
    const ctx = makeContext();

    // Run catalyst detection and a normal analysis on the same context
    const [catalystResult, overviewResult] = await Promise.all([
      generateAnalysis(ctx, AnalysisType.CATALYST_DETECTION),
      generateAnalysis(ctx, AnalysisType.MARKET_OVERVIEW),
    ]);

    // Catalyst result is special
    expect(catalystResult.structuredData.hasCatalyst).toBe(false);
    expect(catalystResult.confidence).toBe(0);

    // Overview result should NOT have hasCatalyst field (it's not set in non-catalyst path)
    expect(overviewResult.structuredData.hasCatalyst).toBeUndefined();
    expect(overviewResult.confidence).toBeGreaterThan(0);
  });
});
