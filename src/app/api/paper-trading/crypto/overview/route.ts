/**
 * GET /api/paper-trading/crypto/overview
 *
 * Overview di tutte le sessioni crypto paper trading.
 * Restituisce: sessionId, strategia, status, PnL, posizioni, tick totali.
 */

import { NextResponse } from 'next/server';
import { getCryptoPaperTradingManager } from '@/core/paper-trading/crypto-manager';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const manager = getCryptoPaperTradingManager();
    const overview = await manager.getOverviewFromDb();

    return NextResponse.json({ ok: true, ...overview });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /paper-trading/crypto/overview]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
