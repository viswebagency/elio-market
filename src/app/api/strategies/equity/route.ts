/**
 * GET /api/strategies/equity
 *
 * Returns equity curve data for one or more strategies.
 * Query params:
 *   strategyId — single strategy ID (optional, returns all if omitted)
 *   days — number of days of history (default: 90)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const db = createUntypedAdminClient();
    const strategyId = request.nextUrl.searchParams.get('strategyId');
    const days = parseInt(request.nextUrl.searchParams.get('days') ?? '90', 10);

    const minDate = new Date();
    minDate.setDate(minDate.getDate() - days);
    const minDateStr = minDate.toISOString().split('T')[0];

    let query = db
      .from('equity_snapshots')
      .select('strategy_id, snapshot_date, capital, total_pnl, total_pnl_pct, pnl_today, trades_today, open_positions, max_drawdown_pct')
      .gte('snapshot_date', minDateStr)
      .order('snapshot_date', { ascending: true });

    if (strategyId) {
      query = query.eq('strategy_id', strategyId);
    }

    const { data: snapshots, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Group by strategy
    const curves: Record<string, { timestamp: string; equity: number; pnlToday: number }[]> = {};

    for (const snap of snapshots ?? []) {
      const sid = snap.strategy_id;
      if (!curves[sid]) curves[sid] = [];
      curves[sid].push({
        timestamp: snap.snapshot_date,
        equity: snap.capital,
        pnlToday: snap.pnl_today ?? 0,
      });
    }

    return NextResponse.json({ ok: true, curves });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /strategies/equity]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
