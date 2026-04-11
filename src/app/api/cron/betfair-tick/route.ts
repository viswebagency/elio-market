/**
 * GET /api/cron/betfair-tick
 *
 * Vercel Cron — every 5 minutes.
 * Betfair markets are available 24/7 (no market hours check needed).
 * Uses mock data in development (no Betfair credentials required for paper trading).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { getBetfairPaperTradingManager, BETFAIR_L1_STRATEGY_CODES, BETFAIR_L1_DEFAULT_CAPITAL } from '@/core/paper-trading/betfair-manager';
import { BETFAIR_STRATEGY_MAP } from '@/core/strategies/betfair-strategies';
import { getTelegramClient } from '@/lib/telegram';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';
import { processExpiredCooldowns, ExpiredSession } from '@/core/paper-trading/auto-rotation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ELIO_CHAT_ID = 8659384895;

let consecutiveFailures = 0;
let lastFailureNotifiedAt = 0;
const FAILURE_NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const manager = getBetfairPaperTradingManager();
    await manager.loadActiveSessions();

    const activeBefore = manager.getActiveSessions().length;
    let autoStarted: string[] = [];

    if (activeBefore === 0) {
      const db = createUntypedAdminClient();
      const { data: existingSessions } = await db
        .from('betfair_paper_sessions')
        .select('strategy_code, status')
        .in('strategy_code', [...BETFAIR_L1_STRATEGY_CODES]);

      const existingByCode = new Map<string, string>();
      for (const row of existingSessions ?? []) {
        const prev = existingByCode.get(row.strategy_code);
        if (!prev || row.status === 'paused') {
          existingByCode.set(row.strategy_code, row.status);
        }
      }

      const pausedStrategies = [...existingByCode.entries()]
        .filter(([, status]) => status === 'paused');

      const canAutoStart = pausedStrategies.length === 0
        && BETFAIR_L1_STRATEGY_CODES.some((code) => !existingByCode.has(code) || existingByCode.get(code) === 'stopped');

      if (canAutoStart) {
        autoStarted = await manager.autoStartL1Sessions();

        if (autoStarted.length > 0) {
          try {
            const client = getTelegramClient();
            await client.sendMessage(
              ELIO_CHAT_ID,
              `\uD83C\uDFC6 <b>Betfair Paper Trading Auto-Start</b>\n\n` +
              `Avviate ${autoStarted.length} sessioni L1:\n` +
              autoStarted.map((id) => `\u2022 ${id}`).join('\n') +
              `\n\n<i>${new Date().toLocaleString('it-IT')}</i>`,
            );
          } catch { /* ignore */ }
        }
      }
    }

    // Note: Betfair tick uses mock data since we don't have live Betfair credentials yet.
    // The cron still runs to test the infrastructure. Real data will come from BetfairClient.
    // For now, sessions just accumulate ticks without market data evaluation.

    const rotation = await processExpiredCooldowns(
      'betfair_paper_sessions',
      async (session: ExpiredSession) => {
        return manager.startRotatedSession(
          session.id,
          session.strategy_code,
          session.auto_rotation_count,
          BETFAIR_L1_DEFAULT_CAPITAL,
        );
      },
    );

    const summary = {
      sessionsActive: manager.getActiveSessions().length,
      autoStarted: autoStarted.length,
      autoRotated: rotation.rotated,
      autoRotationStopped: rotation.stopped,
      errors: rotation.errors,
      durationMs: Date.now() - startTime,
    };

    consecutiveFailures = 0;
    console.log('[Cron/betfair-tick]', JSON.stringify(summary));

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    consecutiveFailures++;
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error(`[Cron/betfair-tick] ERRORE (failure #${consecutiveFailures}):`, message);

    const now = Date.now();
    if (consecutiveFailures === 1 || consecutiveFailures === 3 || (now - lastFailureNotifiedAt > FAILURE_NOTIFY_COOLDOWN_MS)) {
      lastFailureNotifiedAt = now;
      try {
        const client = getTelegramClient();
        await client.sendMessage(
          ELIO_CHAT_ID,
          `\u26A0\uFE0F <b>Cron Betfair Tick Fallito</b>\n\n` +
          `<b>Errore:</b> <code>${message.replace(/</g, '&lt;')}</code>\n` +
          `<b>Fallimenti:</b> ${consecutiveFailures}\n` +
          `<i>${new Date().toLocaleString('it-IT')}</i>`,
        );
      } catch { /* ignore */ }
    }

    return NextResponse.json({ ok: false, error: message, consecutiveFailures });
  }
}
