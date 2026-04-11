/**
 * POST /api/backtest/run-single
 *
 * Runs the L1→L4 backtest pipeline on a single strategy.
 * Called from the UI — no CRON_SECRET needed (server-side execution).
 *
 * Body: { code: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';
import { POLYMARKET_STRATEGIES } from '@/core/strategies/polymarket-strategies';
import { STOCK_STRATEGIES } from '@/core/strategies/stock-strategies';
import { FOREX_STRATEGIES } from '@/core/strategies/forex-strategies';
import { runFullPipeline, PipelineResults } from '@/core/backtest/pipeline';
import { runStockFullPipeline } from '@/core/backtest/stock-pipeline';
import { runForexFullPipeline } from '@/core/backtest/forex-pipeline';

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = body?.code;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ ok: false, error: 'Missing code' }, { status: 400 });
    }

    // Detect area by code prefix and run the appropriate pipeline
    let results: PipelineResults;

    const stockSeed = STOCK_STRATEGIES.find(s => s.code === code);
    const forexSeed = FOREX_STRATEGIES.find(s => s.code === code);
    const pmSeed = POLYMARKET_STRATEGIES.find(s => s.code === code);

    if (stockSeed) {
      results = runStockFullPipeline(stockSeed);
    } else if (forexSeed) {
      results = runForexFullPipeline(forexSeed);
    } else if (pmSeed) {
      results = runFullPipeline(pmSeed);
    } else {
      return NextResponse.json({ ok: false, error: `Strategy ${code} not found` }, { status: 404 });
    }

    const db = createUntypedAdminClient();
    const startTime = Date.now();

    // Save to DB
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

      if (!error) savedToDb = true;
    }

    return NextResponse.json({
      ok: true,
      code,
      highestLevel: results.highestLevel,
      l1Passed: results.l1?.passed ?? false,
      l2Passed: results.l2?.passed ?? null,
      l3Passed: results.l3?.passed ?? null,
      l4Passed: results.l4?.passed ?? null,
      savedToDb,
      executionTimeMs: Date.now() - startTime,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
