/**
 * Tests for Knowledge Base AI Analyzer — deterministic fallback path.
 *
 * These tests run WITHOUT ANTHROPIC_API_KEY so every call goes through
 * the deterministic analysis branch.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateAnalysis,
  AnalysisType,
  AnalysisResult,
  MarketContext,
} from '@/core/knowledge-base/analyzer';
import { MarketArea } from '@/core/types/common';

// ============================================================================
// Helpers
// ============================================================================

/** Ensure no API key leaks into these tests */
beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

function makeContext(overrides?: Partial<MarketContext>): MarketContext {
  const futureDate = new Date(Date.now() + 30 * 86400000).toISOString();
  return {
    marketId: 'test-market-001',
    marketName: 'Will BTC reach $100k by June 2026?',
    area: MarketArea.PREDICTION,
    currentPrice: 0.55,
    volume24h: 75_000,
    totalVolume: 2_500_000,
    liquidity: 120_000,
    endDate: futureDate,
    category: 'Crypto',
    description: 'Resolves YES if BTC >= $100,000 on any major exchange before June 30 2026.',
    outcomes: ['Yes', 'No'],
    outcomePrices: [0.55, 0.45],
    ...overrides,
  };
}

function assertValidResult(result: AnalysisResult): void {
  expect(result).toBeDefined();
  expect(typeof result.content).toBe('string');
  expect(result.content.length).toBeGreaterThan(0);
  expect(typeof result.confidence).toBe('number');
  expect(result.confidence).toBeGreaterThanOrEqual(0);
  expect(result.confidence).toBeLessThanOrEqual(100);
  expect(Array.isArray(result.dataPointsUsed)).toBe(true);
  expect(result.dataPointsUsed.length).toBeGreaterThan(0);
  expect(result.structuredData).toBeDefined();
  expect(['bullish', 'bearish', 'neutral']).toContain(result.structuredData.sentiment);
  expect(Array.isArray(result.structuredData.keyFactors)).toBe(true);
  expect(Array.isArray(result.structuredData.risks)).toBe(true);
  expect(Array.isArray(result.structuredData.opportunities)).toBe(true);
  expect(result.tokensUsed).toBe(0);
  expect(result.estimatedCostUsd).toBe(0);
  expect(typeof result.generatedAt).toBe('string');
}

// ============================================================================
// Test Groups
// ============================================================================

describe('KB Analyzer — Deterministic Fallback (no API key)', () => {
  const allTypes = [
    AnalysisType.MARKET_OVERVIEW,
    AnalysisType.ENTRY_ANALYSIS,
    AnalysisType.EXIT_ANALYSIS,
    AnalysisType.RISK_ASSESSMENT,
    AnalysisType.CATALYST_DETECTION,
  ];

  it.each(allTypes)('returns valid AnalysisResult for type=%s', async (type) => {
    const result = await generateAnalysis(makeContext(), type);
    assertValidResult(result);
  });

  it('returns hasCatalyst=false for CATALYST_DETECTION without API key', async () => {
    const result = await generateAnalysis(makeContext(), AnalysisType.CATALYST_DETECTION);
    expect(result.structuredData.hasCatalyst).toBe(false);
    expect(result.structuredData.catalystDescription).toBeUndefined();
    expect(result.confidence).toBe(0);
    expect(result.content).toContain('non disponibile');
  });

  it('dataPointsUsed includes all 5 expected data points', async () => {
    const result = await generateAnalysis(makeContext(), AnalysisType.MARKET_OVERVIEW);
    const labels = result.dataPointsUsed.map((dp) => dp.label);
    expect(labels).toContain('Prezzo YES');
    expect(labels).toContain('Volume totale');
    expect(labels).toContain('Volume 24h');
    expect(labels).toContain('Liquidita');
    expect(labels).toContain('Giorni a scadenza');

    for (const dp of result.dataPointsUsed) {
      expect(typeof dp.label).toBe('string');
      expect(typeof dp.value).toBe('string');
      expect(typeof dp.source).toBe('string');
    }
  });

  it('generatedAt is a valid ISO date', async () => {
    const result = await generateAnalysis(makeContext(), AnalysisType.MARKET_OVERVIEW);
    expect(new Date(result.generatedAt).toISOString()).toBe(result.generatedAt);
  });
});

describe('KB Analyzer — Sentiment Logic', () => {
  it('bullish when yesPrice > 0.65', async () => {
    const result = await generateAnalysis(
      makeContext({ outcomePrices: [0.80, 0.20] }),
      AnalysisType.MARKET_OVERVIEW,
    );
    expect(result.structuredData.sentiment).toBe('bullish');
  });

  it('bearish when yesPrice < 0.35', async () => {
    const result = await generateAnalysis(
      makeContext({ outcomePrices: [0.20, 0.80] }),
      AnalysisType.MARKET_OVERVIEW,
    );
    expect(result.structuredData.sentiment).toBe('bearish');
  });

  it('neutral when yesPrice between 0.35 and 0.65', async () => {
    const result = await generateAnalysis(
      makeContext({ outcomePrices: [0.50, 0.50] }),
      AnalysisType.MARKET_OVERVIEW,
    );
    expect(result.structuredData.sentiment).toBe('neutral');
  });
});

describe('KB Analyzer — Confidence Calculation', () => {
  it('high volume + high liquidity + high vol24h + extreme price => max confidence', async () => {
    const result = await generateAnalysis(
      makeContext({
        totalVolume: 5_000_000,
        liquidity: 200_000,
        volume24h: 100_000,
        outcomePrices: [0.90, 0.10],
      }),
      AnalysisType.MARKET_OVERVIEW,
    );
    // 50 + 15(totalVol>1M) + 10(liq>100k) + 10(vol24h>50k) + 10(dist>0.3) = 95
    expect(result.confidence).toBe(95);
  });

  it('low everything => minimum confidence', async () => {
    const result = await generateAnalysis(
      makeContext({
        totalVolume: 500,
        liquidity: 100,
        volume24h: 50,
        outcomePrices: [0.50, 0.50],
      }),
      AnalysisType.ENTRY_ANALYSIS,
    );
    // 50 + 0 + 0 + 0 + 0 = 50, clamped to [20, 95]
    expect(result.confidence).toBe(50);
  });

  it('moderate volume tiers give intermediate confidence', async () => {
    const result = await generateAnalysis(
      makeContext({
        totalVolume: 150_000,  // +10
        liquidity: 30_000,     // +5
        volume24h: 15_000,     // +5
        outcomePrices: [0.70, 0.30], // dist=0.2 => +5
      }),
      AnalysisType.MARKET_OVERVIEW,
    );
    // 50 + 10 + 5 + 5 + 5 = 75
    expect(result.confidence).toBe(75);
  });

  it('confidence is clamped between 20 and 95', async () => {
    // Even with absolute zeros, confidence should be >= 20
    const resultLow = await generateAnalysis(
      makeContext({ totalVolume: 0, liquidity: 0, volume24h: 0, outcomePrices: [0.50, 0.50] }),
      AnalysisType.RISK_ASSESSMENT,
    );
    expect(resultLow.confidence).toBeGreaterThanOrEqual(20);
    expect(resultLow.confidence).toBeLessThanOrEqual(95);
  });
});

describe('KB Analyzer — Content Generation by Type', () => {
  it('MARKET_OVERVIEW content includes market name and sentiment label', async () => {
    const ctx = makeContext({ outcomePrices: [0.70, 0.30] });
    const result = await generateAnalysis(ctx, AnalysisType.MARKET_OVERVIEW);
    expect(result.content).toContain('Panoramica mercato');
    expect(result.content).toContain(ctx.marketName);
    expect(result.content).toContain('rialzista');
  });

  it('ENTRY_ANALYSIS content includes direction and edge', async () => {
    const result = await generateAnalysis(makeContext(), AnalysisType.ENTRY_ANALYSIS);
    expect(result.content).toContain('Analisi ingresso');
    expect(result.content).toContain('Direzione');
    expect(result.content).toContain('Edge stimato');
  });

  it('EXIT_ANALYSIS content includes recommendation', async () => {
    const result = await generateAnalysis(makeContext(), AnalysisType.EXIT_ANALYSIS);
    expect(result.content).toContain('Analisi uscita');
    expect(result.content).toContain('Raccomandazione');
  });

  it('RISK_ASSESSMENT content includes risk levels', async () => {
    const result = await generateAnalysis(makeContext(), AnalysisType.RISK_ASSESSMENT);
    expect(result.content).toContain('Rischio');
    expect(result.content).toContain('Liquidita');
    expect(result.content).toContain('Tempo');
  });
});

describe('KB Analyzer — Risks and Opportunities', () => {
  it('low liquidity market flags liquidity risk', async () => {
    const result = await generateAnalysis(
      makeContext({ liquidity: 5_000 }),
      AnalysisType.MARKET_OVERVIEW,
    );
    expect(result.structuredData.risks).toContain('Liquidita molto bassa');
  });

  it('imminent expiry flags time risk', async () => {
    const soon = new Date(Date.now() + 1 * 86400000).toISOString(); // 1 day
    const result = await generateAnalysis(
      makeContext({ endDate: soon }),
      AnalysisType.MARKET_OVERVIEW,
    );
    expect(result.structuredData.risks).toContain('Scadenza imminente');
  });

  it('low vol24h flags volume risk', async () => {
    const result = await generateAnalysis(
      makeContext({ volume24h: 1_000 }),
      AnalysisType.MARKET_OVERVIEW,
    );
    expect(result.structuredData.risks).toContain('Volume 24h basso');
  });

  it('healthy market has no critical risks', async () => {
    const result = await generateAnalysis(makeContext(), AnalysisType.MARKET_OVERVIEW);
    expect(result.structuredData.risks).toContain('Nessun rischio critico');
  });

  it('undecided price detected as opportunity', async () => {
    const result = await generateAnalysis(
      makeContext({ outcomePrices: [0.50, 0.50] }),
      AnalysisType.MARKET_OVERVIEW,
    );
    expect(result.structuredData.opportunities).toContain('Prezzo indeciso: potenziale edge');
  });

  it('high vol24h detected as opportunity', async () => {
    const result = await generateAnalysis(
      makeContext({ volume24h: 60_000 }),
      AnalysisType.MARKET_OVERVIEW,
    );
    expect(result.structuredData.opportunities).toContain('Alta liquidita');
  });
});

describe('KB Analyzer — MarketContext Edge Cases', () => {
  it('handles extreme low price (0.01)', async () => {
    const result = await generateAnalysis(
      makeContext({ outcomePrices: [0.01, 0.99] }),
      AnalysisType.MARKET_OVERVIEW,
    );
    assertValidResult(result);
    expect(result.structuredData.sentiment).toBe('bearish');
    expect(result.content).toContain('1.0%');
  });

  it('handles extreme high price (0.99)', async () => {
    const result = await generateAnalysis(
      makeContext({ outcomePrices: [0.99, 0.01] }),
      AnalysisType.MARKET_OVERVIEW,
    );
    assertValidResult(result);
    expect(result.structuredData.sentiment).toBe('bullish');
    expect(result.content).toContain('99.0%');
  });

  it('handles zero volume', async () => {
    const result = await generateAnalysis(
      makeContext({ volume24h: 0, totalVolume: 0 }),
      AnalysisType.MARKET_OVERVIEW,
    );
    assertValidResult(result);
  });

  it('handles zero liquidity', async () => {
    const result = await generateAnalysis(
      makeContext({ liquidity: 0 }),
      AnalysisType.RISK_ASSESSMENT,
    );
    assertValidResult(result);
    expect(result.content).toContain('ALTO');
  });

  it('handles expired market (endDate in past)', async () => {
    const past = new Date(Date.now() - 7 * 86400000).toISOString();
    const result = await generateAnalysis(
      makeContext({ endDate: past }),
      AnalysisType.MARKET_OVERVIEW,
    );
    assertValidResult(result);
    // daysToExpiry should be 0 (clamped by Math.max(0, ...))
    const daysDP = result.dataPointsUsed.find((dp) => dp.label === 'Giorni a scadenza');
    expect(daysDP?.value).toBe('0');
  });

  it('handles missing outcomePrices (defaults to 0.5)', async () => {
    const result = await generateAnalysis(
      makeContext({ outcomePrices: [] }),
      AnalysisType.ENTRY_ANALYSIS,
    );
    assertValidResult(result);
    expect(result.structuredData.sentiment).toBe('neutral');
  });
});

describe('KB Analyzer — CATALYST_DETECTION always returns fixed structure without API', () => {
  it('structuredData has risks mentioning API not configured', async () => {
    const result = await generateAnalysis(makeContext(), AnalysisType.CATALYST_DETECTION);
    expect(result.structuredData.risks).toContain('API AI non configurata');
  });

  it('keyFactors and opportunities are empty arrays', async () => {
    const result = await generateAnalysis(makeContext(), AnalysisType.CATALYST_DETECTION);
    expect(result.structuredData.keyFactors).toEqual([]);
    expect(result.structuredData.opportunities).toEqual([]);
  });

  it('tokensUsed and cost are 0 without API', async () => {
    const result = await generateAnalysis(makeContext(), AnalysisType.CATALYST_DETECTION);
    expect(result.tokensUsed).toBe(0);
    expect(result.estimatedCostUsd).toBe(0);
  });
});
