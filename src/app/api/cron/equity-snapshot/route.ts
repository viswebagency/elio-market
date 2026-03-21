/**
 * GET /api/cron/equity-snapshot
 *
 * Vercel Cron — daily at 21:55 UTC (22:55 CET), just before daily-summary.
 * Saves a snapshot of each paper trading session's capital for equity curve tracking.
 * Also calculates daily P&L by comparing with yesterday's snapshot.
 *
 * Covers both Polymarket (paper_sessions → equity_snapshots) and
 * Crypto (crypto_paper_sessions → paper_trading_snapshots with area='crypto').
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

    let snapshotsCreated = 0;
    let snapshotsSkipped = 0;

    // -----------------------------------------------------------------
    // 1. Polymarket sessions → equity_snapshots
    // -----------------------------------------------------------------
    const { data: polymarketSessions } = await db
      .from('paper_sessions')
      .select('id, strategy_id, current_capital, initial_capital, realized_pnl, unrealized_pnl, total_pnl, total_pnl_pct, max_drawdown_pct')
      .in('status', ['running', 'paused']);

    for (const session of polymarketSessions ?? []) {
      const { count: openPositions } = await db
        .from('paper_positions')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', session.id)
        .eq('status', 'open');

      const startOfDay = `${today}T00:00:00.000Z`;
      const endOfDay = `${today}T23:59:59.999Z`;

      const { data: todayTrades } = await db
        .from('paper_trades')
        .select('net_pnl, action')
        .eq('session_id', session.id)
        .gte('executed_at', startOfDay)
        .lte('executed_at', endOfDay);

      // Include circuit_breaker in P&L calculation (aligned with daily-summary)
      const closedToday = (todayTrades ?? []).filter(
        (t) => t.action === 'full_close' || t.action === 'partial_close' || t.action === 'circuit_breaker',
      );
      const pnlToday = closedToday.reduce((sum, t) => sum + (t.net_pnl ?? 0), 0);

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
        console.error(`[Cron/equity-snapshot] polymarket ${session.id}: ${error.message}`);
        snapshotsSkipped++;
      } else {
        snapshotsCreated++;
      }
    }

    // -----------------------------------------------------------------
    // 2. Crypto sessions → paper_trading_snapshots (area='crypto')
    // -----------------------------------------------------------------
    const { data: cryptoSessions } = await db
      .from('crypto_paper_sessions')
      .select('id, current_capital, total_pnl_pct, total_pnl, realized_pnl, unrealized_pnl, max_drawdown_pct')
      .in('status', ['running', 'paused']);

    for (const cs of cryptoSessions ?? []) {
      const { error } = await db.from('paper_trading_snapshots').insert({
        session_id: cs.id,
        area: 'crypto',
        equity: cs.current_capital,
        pnl_pct: cs.total_pnl_pct ?? 0,
        open_positions: 0,
      });

      if (error) {
        console.error(`[Cron/equity-snapshot] crypto ${cs.id}: ${error.message}`);
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
