/**
 * GET /api/cron/equity-snapshot
 *
 * Vercel Cron — daily at 21:55 UTC (22:55 CET), just before daily-summary.
 * Saves a snapshot of each paper trading session's capital for equity curve tracking.
 * Also calculates daily P&L by comparing with yesterday's snapshot.
 *
 * Covers Polymarket (paper_sessions → equity_snapshots),
 * Crypto paper (crypto_paper_sessions → paper_trading_snapshots),
 * and Live trading (live_bankroll → live_equity_snapshots).
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

    // -----------------------------------------------------------------
    // 3. Stock sessions → paper_trading_snapshots (area='stocks')
    // -----------------------------------------------------------------
    const { data: stockSessions } = await db
      .from('stock_paper_sessions')
      .select('id, current_capital, total_pnl_pct')
      .in('status', ['running', 'paused']);

    for (const ss of stockSessions ?? []) {
      const { error } = await db.from('paper_trading_snapshots').insert({
        session_id: ss.id,
        area: 'stocks',
        equity: ss.current_capital,
        pnl_pct: ss.total_pnl_pct ?? 0,
        open_positions: 0,
      });

      if (error) {
        console.error(`[Cron/equity-snapshot] stocks ${ss.id}: ${error.message}`);
        snapshotsSkipped++;
      } else {
        snapshotsCreated++;
      }
    }

    // -----------------------------------------------------------------
    // 4. Betfair sessions → paper_trading_snapshots (area='betfair')
    // -----------------------------------------------------------------
    const { data: betfairSessions } = await db
      .from('betfair_paper_sessions')
      .select('id, current_capital, total_pnl_pct')
      .in('status', ['running', 'paused']);

    for (const bs of betfairSessions ?? []) {
      const { error } = await db.from('paper_trading_snapshots').insert({
        session_id: bs.id,
        area: 'betfair',
        equity: bs.current_capital,
        pnl_pct: bs.total_pnl_pct ?? 0,
        open_positions: 0,
      });

      if (error) {
        console.error(`[Cron/equity-snapshot] betfair ${bs.id}: ${error.message}`);
        snapshotsSkipped++;
      } else {
        snapshotsCreated++;
      }
    }

    // -----------------------------------------------------------------
    // 5. Forex sessions → paper_trading_snapshots (area='forex')
    // -----------------------------------------------------------------
    const { data: forexSessions } = await db
      .from('forex_paper_sessions')
      .select('id, current_capital, total_pnl_pct')
      .in('status', ['running', 'paused']);

    for (const fs of forexSessions ?? []) {
      const { error } = await db.from('paper_trading_snapshots').insert({
        session_id: fs.id,
        area: 'forex',
        equity: fs.current_capital,
        pnl_pct: fs.total_pnl_pct ?? 0,
        open_positions: 0,
      });

      if (error) {
        console.error(`[Cron/equity-snapshot] forex ${fs.id}: ${error.message}`);
        snapshotsSkipped++;
      } else {
        snapshotsCreated++;
      }
    }

    // -----------------------------------------------------------------
    // 6. Live trading → live_equity_snapshots
    // -----------------------------------------------------------------
    const { data: liveBankrolls } = await db
      .from('live_bankroll')
      .select('user_id, total_capital, initial_capital');

    for (const lb of liveBankrolls ?? []) {
      const pnlPct = lb.initial_capital > 0
        ? ((lb.total_capital - lb.initial_capital) / lb.initial_capital) * 100
        : 0;

      const { error } = await db.from('live_equity_snapshots').insert({
        user_id: lb.user_id,
        equity: lb.total_capital,
        pnl_pct: pnlPct,
      });

      if (error) {
        console.error(`[Cron/equity-snapshot] live ${lb.user_id}: ${error.message}`);
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
