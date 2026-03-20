/**
 * POST /api/backtest/pipeline
 *
 * Runs the full L1→L4 backtest pipeline on all 13 Polymarket strategies.
 * Strategies that fail at any level stop there (sequential gates).
 * Results saved to strategies.backtest_results (JSONB) and strategies.highest_backtest_level.
 *
 * Protected by CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';
import { POLYMARKET_STRATEGIES } from '@/core/strategies/polymarket-strategies';
import { runFullPipeline, PipelineResults } from '@/core/backtest/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Map pipeline level to DB enum value
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

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const db = createUntypedAdminClient();

    // Get system user
    const { data: user } = await db
      .from('profiles')
      .select('id')
      .eq('telegram_chat_id', 8659384895)
      .maybeSingle();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No system user found' }, { status: 500 });
    }

    // Load strategy DB IDs
    const codes = POLYMARKET_STRATEGIES.map(s => s.code);
    const { data: dbStrategies } = await db
      .from('strategies')
      .select('id, code')
      .eq('user_id', user.id)
      .in('code', codes);

    const codeToId = new Map<string, string>();
    if (dbStrategies) {
      for (const s of dbStrategies) {
        codeToId.set(s.code, s.id);
      }
    }

    // Run pipeline on each strategy
    const allResults: Array<{
      code: string;
      name: string;
      highestLevel: string | null;
      l1Passed: boolean;
      l2Passed: boolean | null;
      l3Passed: boolean | null;
      l4Passed: boolean | null;
      savedToDb: boolean;
    }> = [];

    for (const seed of POLYMARKET_STRATEGIES) {
      console.log(`[Pipeline] ${seed.code} ${seed.name}...`);
      const pipelineStart = Date.now();

      const results = runFullPipeline(seed);
      const elapsed = Date.now() - pipelineStart;

      console.log(
        `[Pipeline] ${seed.code}: highest=${results.highestLevel ?? 'none'} (${elapsed}ms)` +
        ` L1=${results.l1?.passed ? 'PASS' : 'FAIL'}` +
        (results.l2 ? ` L2=${results.l2.passed ? 'PASS' : 'FAIL'}` : '') +
        (results.l3 ? ` L3=${results.l3.passed ? 'PASS' : 'FAIL'}` : '') +
        (results.l4 ? ` L4=${results.l4.passed ? 'PASS' : 'FAIL'}` : ''),
      );

      // Save to DB
      const dbId = codeToId.get(seed.code);
      let savedToDb = false;

      if (dbId) {
        // Build passed levels array
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
          .eq('id', dbId);

        if (error) {
          console.error(`[Pipeline] ${seed.code} DB save error: ${error.message}`);
        } else {
          savedToDb = true;
        }
      }

      allResults.push({
        code: seed.code,
        name: seed.name,
        highestLevel: results.highestLevel,
        l1Passed: results.l1?.passed ?? false,
        l2Passed: results.l2?.passed ?? null,
        l3Passed: results.l3?.passed ?? null,
        l4Passed: results.l4?.passed ?? null,
        savedToDb,
      });
    }

    const summary = {
      total: allResults.length,
      passedL1: allResults.filter(r => r.l1Passed).length,
      passedL2: allResults.filter(r => r.l2Passed === true).length,
      passedL3: allResults.filter(r => r.l3Passed === true).length,
      passedL4: allResults.filter(r => r.l4Passed === true).length,
      savedToDb: allResults.filter(r => r.savedToDb).length,
    };

    return NextResponse.json({
      ok: true,
      summary,
      results: allResults,
      executionTimeMs: Date.now() - startTime,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[Pipeline] ERRORE:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
