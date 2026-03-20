/**
 * GET /api/paper-trading/status
 *
 * Stato attuale di tutte le strategie in paper trading.
 * Query params: userId (opzionale)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPaperTradingManager } from '@/core/paper-trading/manager';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId') ?? undefined;

    const manager = getPaperTradingManager();
    const overview = await manager.getStatus(userId);

    return NextResponse.json({ ok: true, ...overview });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /paper-trading/status]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
