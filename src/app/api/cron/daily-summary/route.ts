/**
 * GET /api/cron/daily-summary
 *
 * Vercel Cron — daily at 22:00 UTC (23:00 CET).
 * Calculates daily P&L across all paper trading sessions
 * and live trading, then sends a summary report via Telegram.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { getTelegramClient, DailySummary, AreaSummary, LiveTradingSummary } from '@/lib/telegram';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';
import { killSwitch } from '@/services/execution/kill-switch';
import { circuitBreakerLive } from '@/services/execution/circuit-breaker-live';
import { syncPortfolio, alertDivergence, createPortfolioDbClient } from '@/services/portfolio/portfolio-sync';
import { BrokerKeyService } from '@/services/broker/broker-key-service';

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
  // Live Trading — from trades table (execution_type='live')
  // =======================================================================

  const live = await buildLiveSummary(db, startOfDay, endOfDay);

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
    live,
  };
}

// ---------------------------------------------------------------------------
// Live Trading Summary Builder
// ---------------------------------------------------------------------------

async function buildLiveSummary(
  db: ReturnType<typeof createUntypedAdminClient>,
  startOfDay: string,
  endOfDay: string,
): Promise<LiveTradingSummary> {
  // Query closed live trades for today
  const { data: liveTrades } = await db
    .from('trades')
    .select('asset_symbol, net_pnl, gross_pnl, commission, slippage, status, exited_at')
    .eq('execution_type', 'live')
    .neq('status', 'open')
    .gte('exited_at', startOfDay)
    .lte('exited_at', endOfDay)
    .order('exited_at', { ascending: true });

  // All-time live trade stats
  const { data: allLiveTrades } = await db
    .from('trades')
    .select('net_pnl')
    .eq('execution_type', 'live')
    .neq('status', 'open');

  // Get bankroll info from live_bankroll table
  const { data: liveBankrollRows } = await db
    .from('live_bankroll')
    .select('initial_capital, total_capital')
    .limit(1);

  const initialBankroll = liveBankrollRows?.[0]?.initial_capital ?? 0;
  const currentBankroll = liveBankrollRows?.[0]?.total_capital ?? 0;

  const closedToday = liveTrades ?? [];
  const allClosed = allLiveTrades ?? [];

  // Daily metrics
  const dailyPnl = closedToday.reduce((sum, t) => sum + (Number(t.net_pnl) || 0), 0);
  const dailyPnlPct = initialBankroll > 0 ? (dailyPnl / initialBankroll) * 100 : 0;

  const totalPnl = allClosed.reduce((sum, t) => sum + (Number(t.net_pnl) || 0), 0);
  const totalPnlPct = initialBankroll > 0 ? (totalPnl / initialBankroll) * 100 : 0;

  const winning = closedToday.filter((t) => Number(t.net_pnl) > 0);
  const winRate = closedToday.length > 0 ? winning.length / closedToday.length : 0;

  const totalFees = closedToday.reduce((sum, t) => sum + (Number(t.commission) || 0), 0);

  const slippages = closedToday
    .filter((t) => t.slippage != null && Number(t.slippage) !== 0)
    .map((t) => Math.abs(Number(t.slippage)));
  const avgSlippage = slippages.length > 0
    ? slippages.reduce((a, b) => a + b, 0) / slippages.length
    : 0;

  // Best/worst trade
  let bestTrade: LiveTradingSummary['bestTrade'] = undefined;
  let worstTrade: LiveTradingSummary['worstTrade'] = undefined;
  if (closedToday.length > 0) {
    const sorted = [...closedToday].sort((a, b) => Number(b.net_pnl) - Number(a.net_pnl));
    if (Number(sorted[0].net_pnl) > 0) {
      bestTrade = { market: sorted[0].asset_symbol, pnl: Number(sorted[0].net_pnl) };
    }
    const last = sorted[sorted.length - 1];
    if (Number(last.net_pnl) < 0) {
      worstTrade = { market: last.asset_symbol, pnl: Number(last.net_pnl) };
    }
  }

  // Portfolio sync
  let portfolioInSync = true;
  let portfolioDivergences: string[] = [];

  try {
    const brokerKeyService = new BrokerKeyService();
    const adapter = await brokerKeyService.getBrokerAdapter('crypto', 'binance');
    const dbClient = createPortfolioDbClient(db);

    // Use first user with live strategies
    const { data: liveStratUser } = await db
      .from('strategies')
      .select('user_id')
      .eq('mode', 'live')
      .eq('area', 'crypto')
      .limit(1);

    const userId = liveStratUser?.[0]?.user_id;

    if (userId && adapter) {
      const syncResult = await syncPortfolio(adapter, userId, dbClient);
      portfolioInSync = syncResult.inSync;

      if (!syncResult.inSync) {
        await alertDivergence(syncResult, userId);

        for (const p of syncResult.phantomPositions) {
          portfolioDivergences.push(`Phantom: ${p.asset_symbol}`);
        }
        for (const p of syncResult.untrackedPositions) {
          portfolioDivergences.push(`Untracked: ${p.symbol}`);
        }
        for (const m of syncResult.mismatches) {
          portfolioDivergences.push(`Mismatch: ${m.symbol} (${m.diffPct.toFixed(1)}%)`);
        }
      }
    }
  } catch (err) {
    console.error('[daily-summary] Portfolio sync failed:', err instanceof Error ? err.message : err);
    portfolioDivergences = ['Sync fallito'];
    portfolioInSync = false;
  }

  return {
    initialBankroll: Number(initialBankroll),
    currentBankroll: Number(currentBankroll),
    dailyPnl,
    dailyPnlPct,
    totalPnl,
    totalPnlPct,
    tradesCount: closedToday.length,
    winRate,
    bestTrade,
    worstTrade,
    totalFees,
    avgSlippage,
    killSwitchActive: killSwitch.isActive(),
    circuitBreakerTripped: circuitBreakerLive.isTripped,
    portfolioInSync,
    portfolioDivergences: portfolioDivergences.length > 0 ? portfolioDivergences : undefined,
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
