/**
 * GET /api/cron/equity-snapshot
 *
 * Vercel Cron — daily at 21:55 UTC (22:55 CET), just before daily-summary.
 * Saves a snapshot of each paper trading session's capital for equity curve tracking.
 * Also calculates daily P&L by comparing with yesterday's snapshot.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = createUntypedAdminClient();
    const today = new Date().toISOString().split('T')[0];

    // Get all running/paused sessions
    const { data: sessions } = await db
      .from('paper_sessions')
      .select('id, strategy_id, current_capital, initial_capital, realized_pnl, unrealized_pnl, total_pnl, total_pnl_pct, max_drawdown_pct')
      .in('status', ['running', 'paused']);

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ ok: true, snapshots: 0 });
    }

    let snapshotsCreated = 0;
    let snapshotsSkipped = 0;

    for (const session of sessions) {
      // Count open positions
      const { count: openPositions } = await db
        .from('paper_positions')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', session.id)
        .eq('status', 'open');

      // Count trades executed today
      const startOfDay = `${today}T00:00:00.000Z`;
      const endOfDay = `${today}T23:59:59.999Z`;

      const { data: todayTrades } = await db
        .from('paper_trades')
        .select('net_pnl, action')
        .eq('session_id', session.id)
        .gte('executed_at', startOfDay)
        .lte('executed_at', endOfDay);

      const closedToday = (todayTrades ?? []).filter(
        (t) => t.action === 'full_close' || t.action === 'partial_close',
      );
      const pnlToday = closedToday.reduce((sum, t) => sum + (t.net_pnl ?? 0), 0);

      // Upsert snapshot (idempotent — safe to run multiple times)
      const { error } = await db
        .from('equity_snapshots')
        .upsert(
          {
            session_id: session.id,
            strategy_id: session.strategy_id,
            snapshot_date: today,
            capital: session.current_capital,
            realized_pnl: session.realized_pnl ?? 0,
            unrealized_pnl: session.unrealized_pnl ?? 0,
            total_pnl: session.total_pnl ?? 0,
            total_pnl_pct: session.total_pnl_pct ?? 0,
            max_drawdown_pct: session.max_drawdown_pct ?? 0,
            open_positions: openPositions ?? 0,
            trades_today: closedToday.length,
            pnl_today: pnlToday,
          },
          { onConflict: 'session_id,snapshot_date' },
        );

      if (error) {
        console.error(`[Cron/equity-snapshot] ${session.id}: ${error.message}`);
        snapshotsSkipped++;
      } else {
        snapshotsCreated++;
      }
    }

    console.log(`[Cron/equity-snapshot] ${snapshotsCreated} created, ${snapshotsSkipped} skipped`);

    return NextResponse.json({
      ok: true,
      snapshots: snapshotsCreated,
      skipped: snapshotsSkipped,
      date: today,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[Cron/equity-snapshot] ERRORE:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
