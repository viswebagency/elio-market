/**
 * POST /api/paper-trading/betfair/stop
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBetfairPaperTradingManager } from '@/core/paper-trading/betfair-manager';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.sessionId) {
      return NextResponse.json({ ok: false, error: 'sessionId richiesto' }, { status: 400 });
    }

    const manager = getBetfairPaperTradingManager();
    await manager.stopSession(body.sessionId);

    return NextResponse.json({ ok: true, message: 'Sessione betfair fermata' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /paper-trading/betfair/stop]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
