/**
 * POST /api/paper-trading/crypto/stop
 *
 * Ferma una sessione crypto paper trading.
 * Body: { sessionId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCryptoPaperTradingManager } from '@/core/paper-trading/crypto-manager';

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

    const manager = getCryptoPaperTradingManager();
    await manager.stopSession(body.sessionId);

    return NextResponse.json({ ok: true, message: 'Sessione crypto fermata' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /paper-trading/crypto/stop]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
