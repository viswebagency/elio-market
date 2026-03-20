/**
 * POST /api/telegram/webhook
 *
 * Riceve updates da Telegram via webhook.
 * Telegram invia un JSON con l'update ad ogni messaggio/callback.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTelegramCommandHandler } from '@/lib/telegram-commands';
import { TelegramUpdate } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const update = (await request.json()) as TelegramUpdate;

    if (!update.update_id) {
      return NextResponse.json({ ok: false, error: 'Update non valido' }, { status: 400 });
    }

    const handler = getTelegramCommandHandler();
    await handler.processUpdate(update);

    // Telegram richiede 200 OK come risposta al webhook
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /telegram/webhook]', message);
    // Rispondi 200 anche in caso di errore per evitare che Telegram ri-invii l'update
    return NextResponse.json({ ok: true });
  }
}
