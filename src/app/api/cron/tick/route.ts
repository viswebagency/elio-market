/**
 * GET /api/cron/tick
 *
 * Vercel Cron — every 5 minutes.
 * Executes a tick on all active paper trading sessions:
 * - Fetches latest Polymarket data
 * - Evaluates strategies against current markets
 * - Opens/closes positions based on signals
 * - Updates session metrics in Supabase
 * - Sends Telegram alerts for new signals and circuit breakers
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { getPaperTradingManager } from '@/core/paper-trading/manager';
import { getTelegramClient } from '@/lib/telegram';
import { SignalType } from '@/core/engine/signals';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Pro: max 60s

const ELIO_CHAT_ID = 8659384895;

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

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
      durationMs: Date.now() - startTime,
    };

    // Send Telegram notifications for significant events
    await sendTickNotifications(results);

    console.log('[Cron/tick]', JSON.stringify(summary));

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[Cron/tick] ERRORE:', message);

    // Notify on Telegram if tick fails completely
    try {
      const client = getTelegramClient();
      await client.sendMessage(
        ELIO_CHAT_ID,
        `\u26A0\uFE0F <b>Cron Tick Fallito</b>\n\n<code>${escapeHtml(message)}</code>\n\n<i>${new Date().toLocaleString('it-IT')}</i>`,
      );
    } catch {
      // Don't fail the response if Telegram notification fails
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TickResult {
  sessionId: string;
  strategyId: string;
  strategyCode: string;
  marketsEvaluated: number;
  signalsGenerated: number;
  positionsOpened: number;
  positionsClosed: number;
  circuitBroken: boolean;
  errors: string[];
}

async function sendTickNotifications(results: TickResult[]): Promise<void> {
  const client = getTelegramClient();

  for (const result of results) {
    // Circuit breaker alert
    if (result.circuitBroken) {
      await client.sendCircuitBreakerAlert(ELIO_CHAT_ID, {
        strategyId: result.strategyId,
        strategyName: result.strategyCode,
        currentDrawdown: 0, // Already logged in DB by the manager
        maxDrawdown: 0,
        action: 'Sessione messa in pausa automaticamente',
        timestamp: new Date().toISOString(),
      });
    }

    // New positions opened — quick notification
    if (result.positionsOpened > 0 || result.positionsClosed > 0) {
      const lines: string[] = [
        `\uD83D\uDD04 <b>Tick ${result.strategyCode}</b>`,
        '',
      ];

      if (result.positionsOpened > 0) {
        lines.push(`\uD83D\uDFE2 Posizioni aperte: ${result.positionsOpened}`);
      }
      if (result.positionsClosed > 0) {
        lines.push(`\uD83D\uDD34 Posizioni chiuse: ${result.positionsClosed}`);
      }
      lines.push(`\uD83D\uDCCA Mercati analizzati: ${result.marketsEvaluated}`);
      lines.push(`\uD83D\uDCE1 Segnali generati: ${result.signalsGenerated}`);

      if (result.errors.length > 0) {
        lines.push('');
        lines.push(`\u26A0\uFE0F Errori: ${result.errors.length}`);
      }

      await client.sendMessage(ELIO_CHAT_ID, lines.join('\n'));
    }
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
