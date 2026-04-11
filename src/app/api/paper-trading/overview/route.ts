/**
 * GET /api/paper-trading/overview
 *
 * Endpoint unificato che aggrega i dati da Polymarket e Crypto paper trading.
 * Ritorna totali globali + breakdown per area + snapshot per equity curve.
 *
 * Query params:
 * - area: 'polymarket' | 'crypto' | 'all' (default 'all')
 * - snapshots: 'true' to include equity curve snapshots (default false)
 * - snapshotLimit: max snapshots per session (default 200)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPaperTradingManager } from '@/core/paper-trading/manager';
import { getCryptoPaperTradingManager } from '@/core/paper-trading/crypto-manager';
import { getStockPaperTradingManager } from '@/core/paper-trading/stock-manager';
import { getBetfairPaperTradingManager } from '@/core/paper-trading/betfair-manager';
import { getForexPaperTradingManager } from '@/core/paper-trading/forex-manager';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';

export const dynamic = 'force-dynamic';

interface UnifiedSession {
  id: string;
  area: 'polymarket' | 'crypto' | 'stocks' | 'betfair' | 'forex';
  strategyCode: string;
  strategyName: string;
  status: string;
  initialCapital: number;
  currentCapital: number;
  totalPnl: number;
  totalPnlPct: number;
  maxDrawdownPct: number;
  totalTicks: number;
  openPositions: number;
  lastTickAt: string | null;
  startedAt: string;
  isCircuitBroken: boolean;
  pairs?: string[];     // crypto, forex
  tickers?: string[];   // stocks
  eventTypes?: string[]; // betfair
  snapshots?: { timestamp: string; equity: number; pnlPct: number }[];
}

interface UnifiedOverview {
  totalCapital: number;
  totalPnl: number;
  totalPnlPct: number;
  activeSessions: number;
  pausedSessions: number;
  totalOpenPositions: number;
  byArea: {
    polymarket: { capital: number; pnl: number; sessions: number };
    crypto: { capital: number; pnl: number; sessions: number };
    stocks: { capital: number; pnl: number; sessions: number };
    betfair: { capital: number; pnl: number; sessions: number };
    forex: { capital: number; pnl: number; sessions: number };
  };
  sessions: UnifiedSession[];
}

export async function GET(request: NextRequest) {
  try {
    const areaFilter = request.nextUrl.searchParams.get('area') ?? 'all';
    const includeSnapshots = request.nextUrl.searchParams.get('snapshots') === 'true';
    const snapshotLimit = Number(request.nextUrl.searchParams.get('snapshotLimit')) || 200;

    const sessions: UnifiedSession[] = [];
    const byArea = {
      polymarket: { capital: 0, pnl: 0, sessions: 0 },
      crypto: { capital: 0, pnl: 0, sessions: 0 },
      stocks: { capital: 0, pnl: 0, sessions: 0 },
      betfair: { capital: 0, pnl: 0, sessions: 0 },
      forex: { capital: 0, pnl: 0, sessions: 0 },
    };

    // Fetch Polymarket data
    if (areaFilter === 'all' || areaFilter === 'polymarket') {
      const pmManager = getPaperTradingManager();
      const pmOverview = await pmManager.getStatus();

      for (const s of pmOverview.sessions) {
        sessions.push({
          id: s.id,
          area: 'polymarket',
          strategyCode: s.strategyCode,
          strategyName: s.strategyName,
          status: s.status,
          initialCapital: s.metrics.initialCapital,
          currentCapital: s.metrics.currentCapital,
          totalPnl: s.metrics.totalPnl,
          totalPnlPct: s.metrics.totalPnlPct,
          maxDrawdownPct: s.metrics.maxDrawdownPct,
          totalTicks: s.metrics.totalTicks,
          openPositions: s.openPositions.length,
          lastTickAt: s.metrics.lastTickAt,
          startedAt: s.startedAt,
          isCircuitBroken: s.isCircuitBroken,
        });

        if (s.status === 'running' || s.status === 'paused') {
          byArea.polymarket.capital += s.metrics.currentCapital;
          byArea.polymarket.pnl += s.metrics.totalPnl;
          byArea.polymarket.sessions++;
        }
      }
    }

    // Fetch Crypto data
    if (areaFilter === 'all' || areaFilter === 'crypto') {
      const cryptoManager = getCryptoPaperTradingManager();
      const cryptoOverview = await cryptoManager.getOverviewFromDb();

      for (const s of cryptoOverview.sessions) {
        sessions.push({
          id: s.sessionId,
          area: 'crypto',
          strategyCode: s.strategyCode,
          strategyName: s.strategyName,
          status: s.status,
          initialCapital: s.initialCapital,
          currentCapital: s.currentCapital,
          totalPnl: s.totalPnl,
          totalPnlPct: s.totalPnlPct,
          maxDrawdownPct: s.maxDrawdownPct,
          totalTicks: s.totalTicks,
          openPositions: s.openPositions,
          lastTickAt: s.lastTickAt,
          startedAt: s.startedAt,
          isCircuitBroken: s.isCircuitBroken,
          pairs: s.pairs,
        });

        if (s.status === 'running' || s.status === 'paused') {
          byArea.crypto.capital += s.currentCapital;
          byArea.crypto.pnl += s.totalPnl;
          byArea.crypto.sessions++;
        }
      }
    }

    // Fetch Stocks data
    if (areaFilter === 'all' || areaFilter === 'stocks') {
      const stockManager = getStockPaperTradingManager();
      const stockOverview = await stockManager.getOverviewFromDb();

      for (const s of stockOverview.sessions) {
        sessions.push({
          id: s.sessionId,
          area: 'stocks',
          strategyCode: s.strategyCode,
          strategyName: s.strategyName,
          status: s.status,
          initialCapital: s.initialCapital,
          currentCapital: s.currentCapital,
          totalPnl: s.totalPnl,
          totalPnlPct: s.totalPnlPct,
          maxDrawdownPct: s.maxDrawdownPct,
          totalTicks: s.totalTicks,
          openPositions: s.openPositions,
          lastTickAt: s.lastTickAt,
          startedAt: s.startedAt,
          isCircuitBroken: s.isCircuitBroken,
          tickers: s.tickers,
        });

        if (s.status === 'running' || s.status === 'paused') {
          byArea.stocks.capital += s.currentCapital;
          byArea.stocks.pnl += s.totalPnl;
          byArea.stocks.sessions++;
        }
      }
    }

    // Fetch Betfair data
    if (areaFilter === 'all' || areaFilter === 'betfair') {
      const betfairManager = getBetfairPaperTradingManager();
      const betfairOverview = await betfairManager.getOverviewFromDb();

      for (const s of betfairOverview.sessions) {
        sessions.push({
          id: s.sessionId,
          area: 'betfair',
          strategyCode: s.strategyCode,
          strategyName: s.strategyName,
          status: s.status,
          initialCapital: s.initialCapital,
          currentCapital: s.currentCapital,
          totalPnl: s.totalPnl,
          totalPnlPct: s.totalPnlPct,
          maxDrawdownPct: s.maxDrawdownPct,
          totalTicks: s.totalTicks,
          openPositions: s.openPositions,
          lastTickAt: s.lastTickAt,
          startedAt: s.startedAt,
          isCircuitBroken: s.isCircuitBroken,
          eventTypes: s.eventTypes,
        });

        if (s.status === 'running' || s.status === 'paused') {
          byArea.betfair.capital += s.currentCapital;
          byArea.betfair.pnl += s.totalPnl;
          byArea.betfair.sessions++;
        }
      }
    }

    // Fetch Forex data
    if (areaFilter === 'all' || areaFilter === 'forex') {
      const forexManager = getForexPaperTradingManager();
      const forexOverview = await forexManager.getOverviewFromDb();

      for (const s of forexOverview.sessions) {
        sessions.push({
          id: s.sessionId,
          area: 'forex',
          strategyCode: s.strategyCode,
          strategyName: s.strategyName,
          status: s.status,
          initialCapital: s.initialCapital,
          currentCapital: s.currentCapital,
          totalPnl: s.totalPnl,
          totalPnlPct: s.totalPnlPct,
          maxDrawdownPct: s.maxDrawdownPct,
          totalTicks: s.totalTicks,
          openPositions: s.openPositions,
          lastTickAt: s.lastTickAt,
          startedAt: s.startedAt,
          isCircuitBroken: s.isCircuitBroken,
          pairs: s.pairs,
        });

        if (s.status === 'running' || s.status === 'paused') {
          byArea.forex.capital += s.currentCapital;
          byArea.forex.pnl += s.totalPnl;
          byArea.forex.sessions++;
        }
      }
    }

    // Load equity curve snapshots if requested
    if (includeSnapshots) {
      const db = createUntypedAdminClient();
      const activeSessionIds = sessions
        .filter((s) => s.status === 'running' || s.status === 'paused')
        .map((s) => s.id);

      if (activeSessionIds.length > 0) {
        const { data: snapshotRows } = await db
          .from('paper_trading_snapshots')
          .select('session_id, timestamp, equity, pnl_pct')
          .in('session_id', activeSessionIds)
          .order('timestamp', { ascending: true })
          .limit(snapshotLimit * activeSessionIds.length);

        if (snapshotRows) {
          const snapshotMap = new Map<string, { timestamp: string; equity: number; pnlPct: number }[]>();
          for (const row of snapshotRows) {
            const sid = row.session_id as string;
            if (!snapshotMap.has(sid)) snapshotMap.set(sid, []);
            const arr = snapshotMap.get(sid)!;
            if (arr.length < snapshotLimit) {
              arr.push({
                timestamp: row.timestamp as string,
                equity: Number(row.equity),
                pnlPct: Number(row.pnl_pct),
              });
            }
          }
          for (const session of sessions) {
            session.snapshots = snapshotMap.get(session.id) ?? [];
          }
        }
      }
    }

    // Compute totals
    const totalCapital = byArea.polymarket.capital + byArea.crypto.capital + byArea.stocks.capital + byArea.betfair.capital + byArea.forex.capital;
    const totalPnl = byArea.polymarket.pnl + byArea.crypto.pnl + byArea.stocks.pnl + byArea.betfair.pnl + byArea.forex.pnl;
    const totalInitial = sessions
      .filter((s) => s.status === 'running' || s.status === 'paused')
      .reduce((sum, s) => sum + s.initialCapital, 0);

    const result: UnifiedOverview = {
      totalCapital,
      totalPnl,
      totalPnlPct: totalInitial > 0 ? (totalPnl / totalInitial) * 100 : 0,
      activeSessions: sessions.filter((s) => s.status === 'running').length,
      pausedSessions: sessions.filter((s) => s.status === 'paused').length,
      totalOpenPositions: sessions
        .filter((s) => s.status === 'running' || s.status === 'paused')
        .reduce((sum, s) => sum + s.openPositions, 0),
      byArea,
      sessions,
    };

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /paper-trading/overview]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
