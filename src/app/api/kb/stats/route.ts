/**
 * GET /api/kb/stats
 *
 * Returns Knowledge Base cache statistics:
 * - Total analyses, requests, hit rate
 * - Estimated cost savings
 * - Breakdown by type and cache level
 */

import { NextResponse } from 'next/server';
import { getKnowledgeBase } from '@/core/knowledge-base';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const kb = getKnowledgeBase();
    const stats = await kb.getStats();

    return NextResponse.json({
      ok: true,
      stats: {
        totalAnalyses: stats.totalAnalyses,
        totalRequests: stats.totalRequests,
        cacheHits: stats.cacheHits,
        cacheMisses: stats.cacheMisses,
        hitRate: stats.hitRate,
        hitRateFormatted: `${(stats.hitRate * 100).toFixed(1)}%`,
        totalCostUsd: stats.totalCostUsd,
        totalCostFormatted: `$${stats.totalCostUsd.toFixed(4)}`,
        todayCostUsd: stats.todayCostUsd,
        todayCostFormatted: `$${stats.todayCostUsd.toFixed(4)}`,
        dailyBudgetEur: stats.dailyBudgetEur,
        estimatedSavingsUsd: stats.estimatedSavingsUsd,
        estimatedSavingsFormatted: `$${stats.estimatedSavingsUsd.toFixed(4)}`,
        totalTokensUsed: stats.totalTokensUsed,
        analysesByType: stats.analysesByType,
        analysesByCacheLevel: stats.analysesByCacheLevel,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /kb/stats]', message);

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
