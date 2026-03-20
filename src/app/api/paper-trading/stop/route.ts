/**
 * POST /api/paper-trading/stop
 *
 * Ferma una sessione di paper trading.
 * Body: { sessionId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPaperTradingManager } from '@/core/paper-trading/manager';

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

    const manager = getPaperTradingManager();
    await manager.stop(body.sessionId);

    return NextResponse.json({ ok: true, message: 'Sessione fermata' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /paper-trading/stop]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
