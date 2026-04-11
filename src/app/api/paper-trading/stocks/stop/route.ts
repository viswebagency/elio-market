/**
 * POST /api/paper-trading/stocks/stop
 *
 * Ferma una sessione stock paper trading.
 * Body: { sessionId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStockPaperTradingManager } from '@/core/paper-trading/stock-manager';

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

    const manager = getStockPaperTradingManager();
    await manager.stopSession(body.sessionId);

    return NextResponse.json({ ok: true, message: 'Sessione stock fermata' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /paper-trading/stocks/stop]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
