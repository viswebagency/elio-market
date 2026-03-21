/**
 * GET /api/cron/daily-summary
 *
 * Vercel Cron — daily at 22:00 UTC (23:00 CET).
 * Calculates daily P&L across all paper trading sessions
 * and sends a summary report via Telegram.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { getTelegramClient, DailySummary, AreaSummary } from '@/lib/telegram';
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

  // =======================================================================
  // Polymarket — from paper_trades / paper_sessions / paper_positions
  // =======================================================================

  const { data: trades } = await db
    .from('paper_trades')
    .select('*')
    .gte('executed_at', startOfDay)
    .lte('executed_at', endOfDay)
    .order('executed_at', { ascending: true });

  const { data: pmSessions } = await db
    .from('paper_sessions')
    .select('current_capital, initial_capital, total_pnl, total_pnl_pct')
    .in('status', ['running', 'paused']);

  const { count: pmOpenCount } = await db
    .from('paper_positions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');

  const pmClosedTrades = (trades ?? []).filter(
    (t) => t.action === 'full_close' || t.action === 'partial_close' || t.action === 'circuit_breaker',
  );
  const pmWinning = pmClosedTrades.filter((t) => t.net_pnl > 0);
  const pmPnl = pmClosedTrades.reduce((sum, t) => sum + (t.net_pnl ?? 0), 0);
  const pmInitial = (pmSessions ?? []).reduce((sum, s) => sum + (s.initial_capital ?? 0), 0);
  const pmPnlPct = pmInitial > 0 ? (pmPnl / pmInitial) * 100 : 0;

  const { data: pmOpenPositions } = await db
    .from('paper_positions')
    .select('stake')
    .eq('status', 'open');
  const pmExposure = (pmOpenPositions ?? []).reduce((sum, p) => sum + (p.stake ?? 0), 0);

  let pmBest: DailySummary['bestTrade'] = undefined;
  let pmWorst: DailySummary['worstTrade'] = undefined;
  if (pmClosedTrades.length > 0) {
    const sorted = [...pmClosedTrades].sort((a, b) => b.net_pnl - a.net_pnl);
    if (sorted[0].net_pnl > 0) pmBest = { market: sorted[0].market_name, pnl: sorted[0].net_pnl };
    if (sorted[sorted.length - 1].net_pnl < 0)
      pmWorst = { market: sorted[sorted.length - 1].market_name, pnl: sorted[sorted.length - 1].net_pnl };
  }

  const polymarket: AreaSummary = {
    pnl: pmPnl,
    pnlPercent: pmPnlPct,
    tradesCount: pmClosedTrades.length,
    winRate: pmClosedTrades.length > 0 ? pmWinning.length / pmClosedTrades.length : 0,
    openPositions: pmOpenCount ?? 0,
    totalExposure: pmExposure,
    bestTrade: pmBest,
    worstTrade: pmWorst,
  };

  // =======================================================================
  // Crypto — from crypto_paper_trades + crypto_paper_sessions + crypto_paper_positions
  // =======================================================================

  const { data: cryptoTrades } = await db
    .from('crypto_paper_trades')
    .select('*')
    .gte('executed_at', startOfDay)
    .lte('executed_at', endOfDay)
    .order('executed_at', { ascending: true });

  const { data: cryptoSessions } = await db
    .from('crypto_paper_sessions')
    .select('strategy_code, strategy_name, current_capital, initial_capital, total_pnl, total_pnl_pct, is_circuit_broken')
    .in('status', ['running', 'paused']);

  const { count: crOpenCount } = await db
    .from('crypto_paper_positions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');

  const crSessions = cryptoSessions ?? [];
  const crInitial = crSessions.reduce((sum, s) => sum + (Number(s.initial_capital) || 0), 0);

  // Use granular trades for accurate metrics
  const crClosedTrades = (cryptoTrades ?? []).filter(
    (t) => t.action === 'full_close' || t.action === 'partial_close' || t.action === 'circuit_breaker',
  );
  const crWinning = crClosedTrades.filter((t) => t.pnl > 0);
  const crPnl = crClosedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const crPnlPct = crInitial > 0 ? (crPnl / crInitial) * 100 : 0;

  const { data: crOpenPositions } = await db
    .from('crypto_paper_positions')
    .select('stake')
    .eq('status', 'open');
  const crExposure = (crOpenPositions ?? []).reduce((sum, p) => sum + (p.stake ?? 0), 0);

  let crBest: DailySummary['bestTrade'] = undefined;
  let crWorst: DailySummary['worstTrade'] = undefined;
  if (crClosedTrades.length > 0) {
    const sorted = [...crClosedTrades].sort((a, b) => b.pnl - a.pnl);
    if (sorted[0].pnl > 0) crBest = { market: sorted[0].symbol, pnl: sorted[0].pnl };
    if (sorted[sorted.length - 1].pnl < 0)
      crWorst = { market: sorted[sorted.length - 1].symbol, pnl: sorted[sorted.length - 1].pnl };
  }

  const crypto: AreaSummary = {
    pnl: crPnl,
    pnlPercent: crPnlPct,
    tradesCount: crClosedTrades.length,
    winRate: crClosedTrades.length > 0 ? crWinning.length / crClosedTrades.length : 0,
    openPositions: crOpenCount ?? 0,
    totalExposure: crExposure,
    bestTrade: crBest,
    worstTrade: crWorst,
  };

  // =======================================================================
  // Aggregated totals
  // =======================================================================

  const totalPnl = polymarket.pnl + crypto.pnl;
  const totalInitial = pmInitial + crInitial;
  const totalTradesCount = polymarket.tradesCount + crypto.tradesCount;
  const totalWinning = pmWinning.length + crWinning.length;
  const totalOpenPositions = polymarket.openPositions + crypto.openPositions;
  const totalExposure = polymarket.totalExposure + crypto.totalExposure;

  // Global best/worst across areas
  const allBests = [polymarket.bestTrade, crypto.bestTrade].filter(Boolean) as { market: string; pnl: number }[];
  const allWorsts = [polymarket.worstTrade, crypto.worstTrade].filter(Boolean) as { market: string; pnl: number }[];
  const bestTrade = allBests.length > 0 ? allBests.sort((a, b) => b.pnl - a.pnl)[0] : undefined;
  const worstTrade = allWorsts.length > 0 ? allWorsts.sort((a, b) => a.pnl - b.pnl)[0] : undefined;

  return {
    date: todayStr,
    pnl: totalPnl,
    pnlPercent: totalInitial > 0 ? (totalPnl / totalInitial) * 100 : 0,
    tradesCount: totalTradesCount,
    winRate: totalTradesCount > 0 ? totalWinning / totalTradesCount : 0,
    openPositions: totalOpenPositions,
    totalExposure,
    bestTrade,
    worstTrade,
    polymarket,
    crypto,
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
