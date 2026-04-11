/**
 * POST /api/paper-trading/stocks/start
 *
 * Avvia manualmente una sessione stock paper trading.
 * Body: { strategyCode: string, initialCapital?: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStockPaperTradingManager } from '@/core/paper-trading/stock-manager';
import { STOCK_STRATEGY_MAP } from '@/core/strategies/stock-strategies';

export const dynamic = 'force-dynamic';

interface StartBody {
  strategyCode: string;
  initialCapital?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as StartBody;

    if (!body.strategyCode) {
      return NextResponse.json(
        { ok: false, error: 'strategyCode richiesto' },
        { status: 400 },
      );
    }

    const seed = STOCK_STRATEGY_MAP[body.strategyCode];
    if (!seed) {
      return NextResponse.json(
        { ok: false, error: `Strategia stock '${body.strategyCode}' non trovata` },
        { status: 404 },
      );
    }

    const initialCapital = body.initialCapital ?? 100;
    if (initialCapital <= 0 || initialCapital > 100000) {
      return NextResponse.json(
        { ok: false, error: 'initialCapital deve essere tra 1 e 100000' },
        { status: 400 },
      );
    }

    const manager = getStockPaperTradingManager();
    const session = await manager.startSession(seed, initialCapital);

    return NextResponse.json({
      ok: true,
      session: {
        sessionId: session.sessionId,
        strategyCode: session.strategySeed.code,
        strategyName: session.strategySeed.name,
        status: session.status,
        initialCapital: session.initialCapital,
        tickers: session.tickers,
        startedAt: session.startedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /paper-trading/stocks/start]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
