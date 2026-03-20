/**
 * GET /api/cron/daily-summary
 *
 * Vercel Cron — daily at 22:00 UTC (23:00 CET).
 * Calculates daily P&L across all paper trading sessions
 * and sends a summary report via Telegram.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { getTelegramClient, DailySummary } from '@/lib/telegram';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ELIO_CHAT_ID = 8659384895;

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await buildDailySummary();

    // Send via Telegram
    const client = getTelegramClient();
    await client.sendDailySummary(ELIO_CHAT_ID, summary);

    console.log('[Cron/daily-summary]', JSON.stringify(summary));

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[Cron/daily-summary] ERRORE:', message);

    // Try to notify about failure
    try {
      const client = getTelegramClient();
      await client.sendMessage(
        ELIO_CHAT_ID,
        `\u26A0\uFE0F <b>Report giornaliero fallito</b>\n\n<code>${escapeHtml(message)}</code>`,
      );
    } catch {
      // Ignore Telegram errors
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Summary Builder
// ---------------------------------------------------------------------------

async function buildDailySummary(): Promise<DailySummary> {
  const db = createUntypedAdminClient();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  const startOfDay = `${todayStr}T00:00:00.000Z`;
  const endOfDay = `${todayStr}T23:59:59.999Z`;

  // Get all trades executed today
  const { data: trades } = await db
    .from('paper_trades')
    .select('*')
    .gte('executed_at', startOfDay)
    .lte('executed_at', endOfDay)
    .order('executed_at', { ascending: true });

  // Get all running/paused sessions for open positions count
  const { data: sessions } = await db
    .from('paper_sessions')
    .select('current_capital, initial_capital, total_pnl, total_pnl_pct')
    .in('status', ['running', 'paused']);

  // Get open positions count
  const { count: openPositionsCount } = await db
    .from('paper_positions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');

  // Calculate daily metrics from trades
  const closedTrades = (trades ?? []).filter(
    (t) => t.action === 'full_close' || t.action === 'partial_close' || t.action === 'circuit_breaker',
  );

  const winningTrades = closedTrades.filter((t) => t.net_pnl > 0);
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.net_pnl ?? 0), 0);

  // Total capital from sessions
  const totalCapital = (sessions ?? []).reduce((sum, s) => sum + (s.current_capital ?? 0), 0);
  const totalInitial = (sessions ?? []).reduce((sum, s) => sum + (s.initial_capital ?? 0), 0);
  const pnlPercent = totalInitial > 0 ? (totalPnl / totalInitial) * 100 : 0;

  // Total exposure = sum of open positions stakes
  const { data: openPositions } = await db
    .from('paper_positions')
    .select('stake')
    .eq('status', 'open');

  const totalExposure = (openPositions ?? []).reduce((sum, p) => sum + (p.stake ?? 0), 0);

  // Best and worst trade
  let bestTrade: DailySummary['bestTrade'] = undefined;
  let worstTrade: DailySummary['worstTrade'] = undefined;

  if (closedTrades.length > 0) {
    const sorted = [...closedTrades].sort((a, b) => b.net_pnl - a.net_pnl);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    if (best.net_pnl > 0) {
      bestTrade = { market: best.market_name, pnl: best.net_pnl };
    }
    if (worst.net_pnl < 0) {
      worstTrade = { market: worst.market_name, pnl: worst.net_pnl };
    }
  }

  return {
    date: todayStr,
    pnl: totalPnl,
    pnlPercent,
    tradesCount: closedTrades.length,
    winRate: closedTrades.length > 0 ? winningTrades.length / closedTrades.length : 0,
    openPositions: openPositionsCount ?? 0,
    totalExposure,
    bestTrade,
    worstTrade,
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
