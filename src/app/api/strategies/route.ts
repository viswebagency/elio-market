/**
 * GET /api/strategies
 *
 * Returns all strategies with their paper trading metrics.
 * Joins strategies table with paper_sessions for live performance data.
 */

import { NextResponse } from 'next/server';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = createUntypedAdminClient();

    // Load all strategies
    const { data: strategies, error: stratError } = await db
      .from('strategies')
      .select('id, code, name, description, area, status, risk_level, is_active, max_drawdown, max_allocation_pct, created_at')
      .order('code', { ascending: true });

    if (stratError) {
      return NextResponse.json({ ok: false, error: stratError.message }, { status: 500 });
    }

    if (!strategies || strategies.length === 0) {
      return NextResponse.json({ ok: true, strategies: [] });
    }

    // Load paper sessions for metrics
    const strategyIds = strategies.map((s) => s.id);
    const { data: sessions } = await db
      .from('paper_sessions')
      .select('strategy_id, status, initial_capital, current_capital, total_pnl, total_pnl_pct, max_drawdown_pct, total_ticks, realized_pnl, unrealized_pnl')
      .in('strategy_id', strategyIds)
      .in('status', ['running', 'paused']);

    // Load trade counts per strategy
    const { data: tradeCounts } = await db
      .from('paper_trades')
      .select('strategy_id')
      .in('strategy_id', strategyIds);

    // Load winning trades for win rate calculation
    const { data: winningTrades } = await db
      .from('paper_trades')
      .select('strategy_id, net_pnl')
      .in('strategy_id', strategyIds)
      .in('action', ['full_close', 'partial_close']);

    // Build maps
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionMap = new Map<string, any>();
    for (const s of sessions ?? []) {
      sessionMap.set(s.strategy_id, s);
    }

    const tradeCountMap = new Map<string, number>();
    for (const t of tradeCounts ?? []) {
      tradeCountMap.set(t.strategy_id, (tradeCountMap.get(t.strategy_id) ?? 0) + 1);
    }

    const winRateMap = new Map<string, { wins: number; total: number }>();
    for (const t of winningTrades ?? []) {
      const entry = winRateMap.get(t.strategy_id) ?? { wins: 0, total: 0 };
      entry.total++;
      if (t.net_pnl > 0) entry.wins++;
      winRateMap.set(t.strategy_id, entry);
    }

    // Build response
    const result = strategies.map((strat) => {
      const session = sessionMap.get(strat.id);
      const totalTrades = tradeCountMap.get(strat.id) ?? 0;
      const wr = winRateMap.get(strat.id);
      const winRate = wr && wr.total > 0 ? (wr.wins / wr.total) * 100 : 0;
      const roiTotal = session ? session.total_pnl_pct ?? 0 : 0;

      return {
        id: strat.id,
        code: strat.code,
        name: strat.name,
        description: strat.description,
        area: strat.area,
        mode: strat.status === 'paper_trading' ? 'paper' : strat.status,
        riskLevel: strat.risk_level,
        isActive: strat.is_active,
        metrics: {
          winRate,
          roiTotal,
          sharpeRatio: 0, // Needs more data points to calculate
          maxDrawdownPct: session?.max_drawdown_pct ?? 0,
          totalTrades,
          profitFactor: 0, // Needs closed trades
          avgTradeReturn: totalTrades > 0 && session ? (session.total_pnl ?? 0) / totalTrades : 0,
        },
        session: session
          ? {
              status: session.status,
              initialCapital: session.initial_capital,
              currentCapital: session.current_capital,
              totalPnl: session.total_pnl,
              totalPnlPct: session.total_pnl_pct,
              totalTicks: session.total_ticks,
            }
          : null,
      };
    });

    return NextResponse.json({ ok: true, strategies: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /strategies]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
