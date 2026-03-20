/**
 * POST /api/kb/invalidate
 *
 * Force invalidation of cached analyses (admin endpoint).
 *
 * Body:
 *   { marketId: string }      → invalidate all analyses for a market
 *   { area: string }          → invalidate all analyses for an area
 *   { marketId, area }        → both
 */

import { NextRequest, NextResponse } from 'next/server';
import { getKnowledgeBase } from '@/core/knowledge-base';
import { MarketArea } from '@/core/types/common';

export const dynamic = 'force-dynamic';

const VALID_AREAS = new Set<string>([
  'prediction',
  'exchange_betting',
  'stocks',
  'forex',
  'crypto',
]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { marketId?: string; area?: string };
    const { marketId, area } = body;

    if (!marketId && !area) {
      return NextResponse.json(
        { ok: false, error: 'At least one of marketId or area is required' },
        { status: 400 },
      );
    }

    if (area && !VALID_AREAS.has(area)) {
      return NextResponse.json(
        { ok: false, error: `Invalid area. Must be one of: ${[...VALID_AREAS].join(', ')}` },
        { status: 400 },
      );
    }

    const kb = getKnowledgeBase();
    let invalidatedCount = 0;

    if (marketId) {
      invalidatedCount += await kb.invalidateAnalysis(marketId);
    }

    if (area) {
      invalidatedCount += await kb.invalidateArea(area as MarketArea);
    }

    return NextResponse.json({
      ok: true,
      invalidated: invalidatedCount,
      message: `${invalidatedCount} analisi invalidate`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /kb/invalidate]', message);

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
