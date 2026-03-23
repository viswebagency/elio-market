/**
 * GET /api/live-trading/equity — Equity curve data for live trading.
 * Protected by 2FA gate.
 *
 * Query params:
 *   limit: number (default: 200)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/db/supabase/server';
import { require2FA, TwoFARequiredError } from '@/lib/auth/require-2fa';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
      await require2FA(user.id);
    } catch (e) {
      if (e instanceof TwoFARequiredError) {
        return NextResponse.json({ error: e.message }, { status: 403 });
      }
      throw e;
    }

    const url = new URL(request.url);
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') ?? '200', 10)));

    const { data: snapshots, error } = await supabase
      .from('live_equity_snapshots')
      .select('timestamp, equity, pnl_pct')
      .eq('user_id', user.id)
      .order('timestamp', { ascending: true })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      snapshots: (snapshots ?? []).map((s) => ({
        timestamp: s.timestamp,
        equity: Number(s.equity),
        pnlPct: Number(s.pnl_pct),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
