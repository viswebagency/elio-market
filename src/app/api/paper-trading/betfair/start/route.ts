/**
 * POST /api/paper-trading/betfair/start
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBetfairPaperTradingManager } from '@/core/paper-trading/betfair-manager';
import { BETFAIR_STRATEGY_MAP } from '@/core/strategies/betfair-strategies';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.strategyCode) {
      return NextResponse.json({ ok: false, error: 'strategyCode richiesto' }, { status: 400 });
    }

    const seed = BETFAIR_STRATEGY_MAP[body.strategyCode];
    if (!seed) {
      return NextResponse.json({ ok: false, error: `Strategia betfair '${body.strategyCode}' non trovata` }, { status: 404 });
    }

    const initialCapital = body.initialCapital ?? 100;
    if (initialCapital <= 0 || initialCapital > 100000) {
      return NextResponse.json({ ok: false, error: 'initialCapital deve essere tra 1 e 100000' }, { status: 400 });
    }

    const manager = getBetfairPaperTradingManager();
    const session = await manager.startSession(seed, initialCapital);

    return NextResponse.json({
      ok: true,
      session: {
        sessionId: session.sessionId,
        strategyCode: session.strategySeed.code,
        strategyName: session.strategySeed.name,
        status: session.status,
        initialCapital: session.initialCapital,
        eventTypes: session.eventTypes,
        startedAt: session.startedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /paper-trading/betfair/start]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
