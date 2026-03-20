/**
 * POST /api/paper-trading/start
 *
 * Avvia paper trading per una strategia.
 * Body: { strategyId: string, initialCapital: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPaperTradingManager } from '@/core/paper-trading/manager';

export const dynamic = 'force-dynamic';

interface StartBody {
  strategyId: string;
  initialCapital: number;
  userId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as StartBody;

    if (!body.strategyId) {
      return NextResponse.json(
        { ok: false, error: 'strategyId richiesto' },
        { status: 400 },
      );
    }

    const initialCapital = body.initialCapital ?? 1000;
    if (initialCapital <= 0 || initialCapital > 100000) {
      return NextResponse.json(
        { ok: false, error: 'initialCapital deve essere tra 1 e 100000' },
        { status: 400 },
      );
    }

    // In produzione userId verrebbe dal token auth
    const userId = body.userId ?? 'demo-user';

    const manager = getPaperTradingManager();
    const session = await manager.start(userId, body.strategyId, initialCapital);

    return NextResponse.json({ ok: true, session });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /paper-trading/start]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
