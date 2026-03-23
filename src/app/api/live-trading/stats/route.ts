/**
 * GET /api/live-trading/stats — Overview stats (bankroll, P&L, etc.)
 * Protected by 2FA gate.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/db/supabase/server';
import { require2FA, TwoFARequiredError } from '@/lib/auth/require-2fa';
import { killSwitch } from '@/services/execution/kill-switch';
import { circuitBreakerLive } from '@/services/execution/circuit-breaker-live';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
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

    const today = new Date().toISOString().split('T')[0];

    // Fetch bankroll from live_bankroll table
    const { data: bankrollData } = await supabase
      .from('live_bankroll')
      .select('total_capital, initial_capital, peak_capital, currency')
      .eq('user_id', user.id)
      .single();

    // Fetch today's trades for daily P&L
    const { data: todayTrades } = await supabase
      .from('live_trades')
      .select('pnl, commission, slippage')
      .eq('user_id', user.id)
      .gte('executed_at', `${today}T00:00:00Z`);

    // Fetch all trades for total P&L
    const { data: allTrades, count: totalTradesCount } = await supabase
      .from('live_trades')
      .select('pnl', { count: 'exact' })
      .eq('user_id', user.id);

    const dailyPnl = (todayTrades ?? []).reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const totalPnl = (allTrades ?? []).reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const todayCount = todayTrades?.length ?? 0;

    const currentBankroll = bankrollData?.total_capital ?? 0;
    const initialBankroll = bankrollData?.initial_capital ?? 0;

    const totalPnlPct = initialBankroll > 0 ? (totalPnl / initialBankroll) * 100 : 0;
    const dailyPnlPct = currentBankroll > 0 ? (dailyPnl / currentBankroll) * 100 : 0;

    return NextResponse.json({
      ok: true,
      stats: {
        bankroll: currentBankroll,
        initialBankroll,
        peakBankroll: bankrollData?.peak_capital ?? currentBankroll,
        currency: bankrollData?.currency ?? 'USDT',
        dailyPnl,
        dailyPnlPct,
        totalPnl,
        totalPnlPct,
        totalTrades: totalTradesCount ?? 0,
        todayTrades: todayCount,
        killSwitch: killSwitch.getStatus(),
        circuitBreaker: circuitBreakerLive.getStatus(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
