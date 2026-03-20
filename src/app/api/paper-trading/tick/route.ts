/**
 * POST /api/paper-trading/tick
 *
 * Trigger manuale di un tick per tutte le strategie attive.
 * In futuro sara' automatizzato via cron.
 */

import { NextResponse } from 'next/server';
import { getPaperTradingManager } from '@/core/paper-trading/manager';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const manager = getPaperTradingManager();
    const results = await manager.tick();

    const summary = {
      sessionsProcessed: results.length,
      totalSignals: results.reduce((s, r) => s + r.signalsGenerated, 0),
      totalPositionsOpened: results.reduce((s, r) => s + r.positionsOpened, 0),
      totalPositionsClosed: results.reduce((s, r) => s + r.positionsClosed, 0),
      circuitBreakers: results.filter((r) => r.circuitBroken).length,
      errors: results.flatMap((r) => r.errors),
    };

    return NextResponse.json({
      ok: true,
      summary,
      details: results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /paper-trading/tick]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
