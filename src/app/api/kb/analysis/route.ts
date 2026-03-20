/**
 * GET /api/kb/analysis?marketId=X&type=Y
 *
 * Retrieves an AI analysis from the Knowledge Base.
 * Returns cached result if available, otherwise generates a fresh one.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getKnowledgeBase, AnalysisType } from '@/core/knowledge-base';
import { getPolymarketClient } from '@/lib/polymarket-client';
import { MarketArea } from '@/core/types/common';
import type { MarketContext } from '@/core/knowledge-base/analyzer';

export const dynamic = 'force-dynamic';

const VALID_TYPES = new Set<string>([
  'market_overview',
  'entry_analysis',
  'exit_analysis',
  'risk_assessment',
]);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get('marketId');
    const type = searchParams.get('type') ?? 'market_overview';
    const userId = searchParams.get('userId') ?? undefined;

    if (!marketId) {
      return NextResponse.json(
        { ok: false, error: 'marketId is required' },
        { status: 400 },
      );
    }

    if (!VALID_TYPES.has(type)) {
      return NextResponse.json(
        { ok: false, error: `Invalid type. Must be one of: ${[...VALID_TYPES].join(', ')}` },
        { status: 400 },
      );
    }

    // Fetch market data from Polymarket
    const client = getPolymarketClient();
    const market = await client.getMarket(marketId);

    const context: MarketContext = {
      marketId: market.id,
      marketName: market.question,
      area: MarketArea.PREDICTION,
      currentPrice: market.outcomePrices[0] ?? 0.5,
      volume24h: market.volume24hr,
      totalVolume: market.volume,
      liquidity: market.liquidity,
      endDate: market.endDate,
      category: market.category,
      description: market.description,
      outcomes: market.outcomes,
      outcomePrices: market.outcomePrices,
    };

    const kb = getKnowledgeBase();
    const analysis = await kb.generateAnalysis(
      context,
      type as AnalysisType,
      userId,
    );

    return NextResponse.json({
      ok: true,
      analysis: {
        id: analysis.id,
        content: analysis.content,
        confidence: analysis.confidence,
        dataPointsUsed: analysis.dataPointsUsed,
        structuredData: analysis.structuredData,
        cacheLevel: analysis.cacheLevel,
        version: analysis.version,
        createdAt: analysis.createdAt,
        expiresAt: analysis.expiresAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /kb/analysis]', message);

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
