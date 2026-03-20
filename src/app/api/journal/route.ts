/**
 * GET /api/journal
 *
 * Returns trade history from paper_trades, enriched with strategy info.
 * Query params:
 *   limit — max trades (default: 50)
 *   offset — pagination offset (default: 0)
 *   strategyId — filter by strategy (optional)
 *   action — filter by action type (optional: open, full_close, partial_close)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const db = createUntypedAdminClient();
    const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10);
    const offset = parseInt(request.nextUrl.searchParams.get('offset') ?? '0', 10);
    const strategyId = request.nextUrl.searchParams.get('strategyId');
    const action = request.nextUrl.searchParams.get('action');

    let query = db
      .from('paper_trades')
      .select('id, session_id, strategy_id, market_id, market_name, action, tier, price, quantity, stake, gross_pnl, net_pnl, return_pct, reason, signal_confidence, executed_at')
      .order('executed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (strategyId) {
      query = query.eq('strategy_id', strategyId);
    }
    if (action) {
      query = query.eq('action', action);
    }

    const { data: trades, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Enrich with strategy codes
    const strategyIds = [...new Set((trades ?? []).map((t) => t.strategy_id))];
    const { data: strategies } = await db
      .from('strategies')
      .select('id, code, name, risk_level')
      .in('id', strategyIds);

    const stratMap = new Map(
      (strategies ?? []).map((s) => [s.id, { code: s.code, name: s.name, riskLevel: s.risk_level }]),
    );

    const enriched = (trades ?? []).map((t) => {
      const strat = stratMap.get(t.strategy_id);
      return {
        id: t.id,
        strategyCode: strat?.code ?? '???',
        strategyName: strat?.name ?? 'Sconosciuta',
        riskLevel: strat?.riskLevel ?? 'moderate',
        marketName: t.market_name,
        action: t.action,
        tier: t.tier,
        price: t.price,
        quantity: t.quantity,
        stake: t.stake,
        grossPnl: t.gross_pnl,
        netPnl: t.net_pnl,
        returnPct: t.return_pct,
        reason: t.reason,
        confidence: t.signal_confidence,
        executedAt: t.executed_at,
      };
    });

    // Summary stats
    const closedTrades = enriched.filter(
      (t) => t.action === 'full_close' || t.action === 'partial_close',
    );
    const wins = closedTrades.filter((t) => t.netPnl > 0).length;
    const totalPnl = closedTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0);

    return NextResponse.json({
      ok: true,
      trades: enriched,
      total: enriched.length,
      summary: {
        closedTrades: closedTrades.length,
        winRate: closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0,
        totalPnl,
        wins,
        losses: closedTrades.length - wins,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /journal]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
