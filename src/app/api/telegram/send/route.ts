/**
 * POST /api/telegram/send
 *
 * Endpoint interno per inviare messaggi Telegram.
 * Usato da altri servizi per notifiche programmatiche.
 *
 * Body:
 *   chatId   — ID della chat Telegram
 *   text     — Testo del messaggio (HTML)
 *   type?    — 'signal' | 'circuit_breaker' | 'daily_summary' | 'text'
 *   payload? — Dati strutturati per formattazione automatica
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTelegramClient, DailySummary, CircuitBreakerDetails } from '@/lib/telegram';
import { Signal } from '@/core/engine/signals';

export const dynamic = 'force-dynamic';

interface SendRequestBody {
  chatId: number | string;
  text?: string;
  type?: 'signal' | 'circuit_breaker' | 'daily_summary' | 'text';
  payload?: Signal | DailySummary | CircuitBreakerDetails;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SendRequestBody;

    if (!body.chatId) {
      return NextResponse.json(
        { ok: false, error: 'chatId obbligatorio' },
        { status: 400 }
      );
    }

    const client = getTelegramClient();
    const type = body.type ?? 'text';

    switch (type) {
      case 'signal': {
        if (!body.payload) {
          return NextResponse.json(
            { ok: false, error: 'payload obbligatorio per tipo signal' },
            { status: 400 }
          );
        }
        const msg = await client.sendSignalAlert(body.chatId, body.payload as Signal);
        return NextResponse.json({ ok: true, messageId: msg.message_id });
      }

      case 'circuit_breaker': {
        if (!body.payload) {
          return NextResponse.json(
            { ok: false, error: 'payload obbligatorio per tipo circuit_breaker' },
            { status: 400 }
          );
        }
        const msg = await client.sendCircuitBreakerAlert(
          body.chatId,
          body.payload as CircuitBreakerDetails
        );
        return NextResponse.json({ ok: true, messageId: msg.message_id });
      }

      case 'daily_summary': {
        if (!body.payload) {
          return NextResponse.json(
            { ok: false, error: 'payload obbligatorio per tipo daily_summary' },
            { status: 400 }
          );
        }
        const msg = await client.sendDailySummary(
          body.chatId,
          body.payload as DailySummary
        );
        return NextResponse.json({ ok: true, messageId: msg.message_id });
      }

      case 'text':
      default: {
        if (!body.text) {
          return NextResponse.json(
            { ok: false, error: 'text obbligatorio per tipo text' },
            { status: 400 }
          );
        }
        const msg = await client.sendMessage(body.chatId, body.text);
        return NextResponse.json({ ok: true, messageId: msg.message_id });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[API /telegram/send]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
