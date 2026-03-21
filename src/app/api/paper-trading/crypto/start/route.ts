/**
 * POST /api/paper-trading/crypto/start
 *
 * Avvia manualmente una sessione crypto paper trading.
 * Body: { strategyCode: string, initialCapital?: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCryptoPaperTradingManager } from '@/core/paper-trading/crypto-manager';
import { CRYPTO_STRATEGY_MAP } from '@/core/strategies/crypto-strategies';

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

    const seed = CRYPTO_STRATEGY_MAP[body.strategyCode];
    if (!seed) {
      return NextResponse.json(
        { ok: false, error: `Strategia crypto '${body.strategyCode}' non trovata` },
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

    const manager = getCryptoPaperTradingManager();
    const session = await manager.startSession(seed, initialCapital);

    return NextResponse.json({
      ok: true,
      session: {
        sessionId: session.sessionId,
        strategyCode: session.strategySeed.code,
        strategyName: session.strategySeed.name,
        status: session.status,
        initialCapital: session.initialCapital,
        pairs: session.pairs,
        startedAt: session.startedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /paper-trading/crypto/start]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
