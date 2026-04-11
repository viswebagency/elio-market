/**
 * POST /api/paper-trading/forex/stop
 *
 * Ferma una sessione forex paper trading.
 * Body: { sessionId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getForexPaperTradingManager } from '@/core/paper-trading/forex-manager';

export const dynamic = 'force-dynamic';

interface StopBody {
  sessionId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as StopBody;

    if (!body.sessionId) {
      return NextResponse.json(
        { ok: false, error: 'sessionId richiesto' },
        { status: 400 },
      );
    }

    const manager = getForexPaperTradingManager();
    await manager.stopSession(body.sessionId);

    return NextResponse.json({ ok: true, message: 'Sessione forex fermata' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /paper-trading/forex/stop]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
