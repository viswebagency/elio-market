/**
 * GET /api/telegram/setup
 *
 * Configura il webhook Telegram. Da chiamare una volta sola.
 * URL webhook: https://elio-market.vercel.app/api/telegram/webhook
 */

import { NextResponse } from 'next/server';
import { getTelegramClient } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

const WEBHOOK_URL = 'https://elio-market.vercel.app/api/telegram/webhook';

export async function GET() {
  try {
    const client = getTelegramClient();
    const result = await client.setWebhook(WEBHOOK_URL);

    return NextResponse.json({
      ok: true,
      webhookSet: result,
      url: WEBHOOK_URL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /telegram/setup]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
