/**
 * GET /api/settings/status
 *
 * Returns platform connection status and operational limits.
 * Checks which env vars are configured (never exposes values).
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const connections = [
      {
        name: 'Polymarket',
        envKey: 'POLYMARKET_API_KEY',
        connected: !!process.env.POLYMARKET_API_KEY,
        area: 'polymarket',
        color: '#8B5CF6',
      },
      {
        name: 'Binance',
        envKey: 'BINANCE_API_KEY',
        connected: !!process.env.BINANCE_API_KEY,
        area: 'crypto',
        color: '#F97316',
      },
      {
        name: 'Alpaca',
        envKey: 'ALPACA_API_KEY',
        connected: !!process.env.ALPACA_API_KEY,
        area: 'stocks',
        color: '#10B981',
      },
      {
        name: 'Betfair',
        envKey: 'BETFAIR_APP_KEY',
        connected: !!process.env.BETFAIR_APP_KEY,
        area: 'betfair',
        color: '#F59E0B',
      },
      {
        name: 'MetaTrader 5',
        envKey: 'MT5_SERVER',
        connected: !!process.env.MT5_SERVER,
        area: 'forex',
        color: '#3B82F6',
      },
    ];

    const data = {
      connections,
      limits: {
        maxDrawdownPct: Number(process.env.MAX_DRAWDOWN_PCT ?? 15),
        maxAllocationPct: Number(process.env.MAX_ALLOCATION_PCT ?? 10),
        dailyBudgetEur: Number(process.env.AI_DAILY_BUDGET_EUR ?? 1),
        circuitBreakerLosses: Number(process.env.CIRCUIT_BREAKER_LOSSES ?? 3),
      },
      cronActive: !!process.env.CRON_SECRET,
      aiModel: process.env.AI_MODEL ?? 'Claude Sonnet 4.6',
    };

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
