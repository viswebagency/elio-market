/**
 * POST /api/backtest/pipeline/[code]
 *
 * Runs the full L1→L4 backtest pipeline on a single strategy by code (e.g. PM-C01).
 * Results saved to strategies.backtest_summary JSONB.
 *
 * Protected by CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';
import { POLYMARKET_STRATEGIES } from '@/core/strategies/polymarket-strategies';
import { runFullPipeline } from '@/core/backtest/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function levelToDbEnum(level: string | null): string | null {
  if (!level) return null;
  const map: Record<string, string> = {
    'L1': 'quick_scan',
    'L2': 'robustness',
    'L3': 'stress_test',
    'L4': 'overfitting_check',
  };
  return map[level] ?? null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { code } = await params;
  const seed = POLYMARKET_STRATEGIES.find(s => s.code === code);

  if (!seed) {
    return NextResponse.json(
      { ok: false, error: `Strategy ${code} not found` },
      { status: 404 },
    );
  }

  try {
    const db = createUntypedAdminClient();
    const startTime = Date.now();

    // Run pipeline
    const results = runFullPipeline(seed);

    // Find DB record
    const { data: dbStrategy } = await db
      .from('strategies')
      .select('id')
      .eq('code', code)
      .maybeSingle();

    let savedToDb = false;

    if (dbStrategy) {
      const passedLevels: string[] = [];
      if (results.l1?.passed) passedLevels.push('quick_scan');
      if (results.l2?.passed) passedLevels.push('robustness');
      if (results.l3?.passed) passedLevels.push('stress_test');
      if (results.l4?.passed) passedLevels.push('overfitting_check');

      const { error } = await db
        .from('strategies')
        .update({
          backtest_summary: results,
          highest_backtest_level: levelToDbEnum(results.highestLevel),
          backtest_passed_levels: passedLevels,
        })
        .eq('id', dbStrategy.id);

      if (error) {
        console.error(`[Pipeline] ${code} DB save error: ${error.message}`);
      } else {
        savedToDb = true;
      }
    }

    return NextResponse.json({
      ok: true,
      code,
      name: seed.name,
      highestLevel: results.highestLevel,
      l1Passed: results.l1?.passed ?? false,
      l2Passed: results.l2?.passed ?? null,
      l3Passed: results.l3?.passed ?? null,
      l4Passed: results.l4?.passed ?? null,
      savedToDb,
      results,
      executionTimeMs: Date.now() - startTime,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error(`[Pipeline] ${code} ERRORE:`, message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
