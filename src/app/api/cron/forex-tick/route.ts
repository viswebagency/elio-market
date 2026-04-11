/**
 * GET /api/cron/forex-tick
 *
 * Vercel Cron — every 5 minutes.
 * Executes a tick on all active forex paper trading sessions:
 * - SKIPS outside forex hours (24/5: Sun 22:00 UTC to Fri 22:00 UTC)
 * - Auto-starts L1-passing strategies if no sessions are active
 * - Fetches latest forex data from Twelve Data
 * - Evaluates forex strategies against current markets
 * - Opens/closes positions based on signals
 * - Sends Telegram alerts for significant events
 * - Tracks consecutive failures and notifies on persistent issues
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { getForexPaperTradingManager, ForexTickResult, FOREX_L1_STRATEGY_CODES, FOREX_L1_DEFAULT_CAPITAL } from '@/core/paper-trading/forex-manager';
import { FOREX_STRATEGY_MAP } from '@/core/strategies/forex-strategies';
import { isForexMarketOpen } from '@/plugins/forex/data-adapter';
import { getTelegramClient } from '@/lib/telegram';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';
import { processExpiredCooldowns, ExpiredSession } from '@/core/paper-trading/auto-rotation';
import { evaluatePerformanceWarning, PerformanceWarningInput } from '@/core/paper-trading/performance-alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ELIO_CHAT_ID = 8659384895;

/** Track consecutive failures to alert on persistent issues */
let consecutiveFailures = 0;
let lastFailureNotifiedAt = 0;
const FAILURE_NOTIFY_COOLDOWN_MS = 30 * 60 * 1000; // 30 min

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  // --- Market hours check (24/5) ---
  if (!isForexMarketOpen()) {
    console.log('[Cron/forex-tick] Market closed — skipping tick');
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'Forex market closed (24/5: Sun 22:00 UTC to Fri 22:00 UTC)',
    });
  }

  try {
    const apiKey = process.env.TWELVE_DATA_API_KEY;
    if (!apiKey) {
      throw new Error('TWELVE_DATA_API_KEY not configured');
    }

    const manager = getForexPaperTradingManager();

    // Initialize adapter
    manager.initializeAdapter({ apiKey });

    // Load sessions from DB (Vercel cold start)
    await manager.loadActiveSessions();

    // Auto-start L1 strategies only on first-ever run (no sessions exist at all)
    const activeBefore = manager.getActiveSessions().length;
    let autoStarted: string[] = [];
    let autoStartSkipped: { code: string; status: string }[] = [];

    if (activeBefore === 0) {
      const db = createUntypedAdminClient();
      const { data: existingSessions } = await db
        .from('forex_paper_sessions')
        .select('strategy_code, status')
        .in('strategy_code', [...FOREX_L1_STRATEGY_CODES]);

      const existingByCode = new Map<string, string>();
      for (const row of existingSessions ?? []) {
        const prev = existingByCode.get(row.strategy_code);
        if (!prev || row.status === 'paused') {
          existingByCode.set(row.strategy_code, row.status);
        }
      }

      // Paused = in cooldown, don't restart
      const pausedStrategies = [...existingByCode.entries()]
        .filter(([, status]) => status === 'paused')
        .map(([code, status]) => ({ code, status }));

      autoStartSkipped = pausedStrategies;

      const strategiesWithNoSession = FOREX_L1_STRATEGY_CODES.filter(
        (code) => !existingByCode.has(code),
      );
      const strategiesOnlyStopped = FOREX_L1_STRATEGY_CODES.filter(
        (code) => existingByCode.get(code) === 'stopped',
      );

      const canAutoStart = pausedStrategies.length === 0
        && (strategiesWithNoSession.length > 0 || strategiesOnlyStopped.length > 0);

      if (canAutoStart) {
        autoStarted = await manager.autoStartL1Sessions();

        if (autoStarted.length > 0) {
          try {
            const client = getTelegramClient();
            await client.sendMessage(
              ELIO_CHAT_ID,
              `\uD83D\uDCB1 <b>Forex Paper Trading Auto-Start</b>\n\n` +
              `Avviate ${autoStarted.length} sessioni L1:\n` +
              autoStarted.map((id) => `\u2022 ${id}`).join('\n') +
              `\n\n<i>${new Date().toLocaleString('it-IT')}</i>`,
            );
          } catch {
            // Don't fail if Telegram notification fails
          }
        }
      } else if (autoStartSkipped.length > 0) {
        console.log('[Cron/forex-tick] Auto-start skipped — existing paused/stopped sessions:', autoStartSkipped);
      }
    }

    const results = await manager.tick();

    // Auto-rotation: process expired cooldowns
    const rotation = await processExpiredCooldowns(
      'forex_paper_sessions',
      async (session: ExpiredSession) => {
        return manager.startRotatedSession(
          session.id,
          session.strategy_code,
          session.auto_rotation_count,
          FOREX_L1_DEFAULT_CAPITAL,
        );
      },
    );

    const summary = {
      sessionsProcessed: results.length,
      autoStarted: autoStarted.length,
      autoStartSkipped: autoStartSkipped.length,
      autoStartSkippedDetails: autoStartSkipped,
      totalSignals: results.reduce((s, r) => s + r.signalsGenerated, 0),
      totalPositionsOpened: results.reduce((s, r) => s + r.positionsOpened, 0),
      totalPositionsClosed: results.reduce((s, r) => s + r.positionsClosed, 0),
      circuitBreakers: results.filter((r) => r.circuitBroken).length,
      autoRotated: rotation.rotated,
      autoRotationStopped: rotation.stopped,
      errors: [...results.flatMap((r) => r.errors), ...rotation.errors],
      durationMs: Date.now() - startTime,
    };

    // Send Telegram notifications for significant events
    await sendForexTickNotifications(results);

    // Performance warnings
    await checkForexPerformanceWarnings();

    // Reset failure counter on success
    consecutiveFailures = 0;

    console.log('[Cron/forex-tick]', JSON.stringify(summary));

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    consecutiveFailures++;
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error(`[Cron/forex-tick] ERRORE (failure #${consecutiveFailures}):`, message);

    const now = Date.now();
    const shouldNotify = consecutiveFailures === 1
      || consecutiveFailures === 3
      || consecutiveFailures === 10
      || (now - lastFailureNotifiedAt > FAILURE_NOTIFY_COOLDOWN_MS);

    if (shouldNotify) {
      lastFailureNotifiedAt = now;
      try {
        const client = getTelegramClient();
        const urgency = consecutiveFailures >= 5 ? '\uD83D\uDED1' : '\u26A0\uFE0F';
        await client.sendMessage(
          ELIO_CHAT_ID,
          `${urgency} <b>Cron Forex Tick Fallito</b>\n\n` +
          `<b>Errore:</b> <code>${escapeHtml(message)}</code>\n` +
          `<b>Fallimenti consecutivi:</b> ${consecutiveFailures}\n` +
          `<b>Durata:</b> ${Date.now() - startTime}ms\n\n` +
          (consecutiveFailures >= 3
            ? `<b>ATTENZIONE:</b> Il cron potrebbe essere disabilitato da Vercel.\n\n`
            : '') +
          `<i>${new Date().toLocaleString('it-IT')}</i>`,
        );
      } catch {
        // Don't fail the response if Telegram fails
      }
    }

    // Return 200 to keep cron active
    return NextResponse.json({
      ok: false,
      error: message,
      consecutiveFailures,
      note: 'Returning 200 to keep cron active.',
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sendForexTickNotifications(results: ForexTickResult[]): Promise<void> {
  const client = getTelegramClient();

  for (const result of results) {
    // Circuit breaker alert
    if (result.circuitBroken) {
      const { currentDrawdown, maxDrawdown, reason } = await fetchForexCircuitBreakerDetails(result.sessionId, result.strategyCode);

      await client.sendCircuitBreakerAlert(ELIO_CHAT_ID, {
        strategyId: result.sessionId,
        strategyName: `[FOREX] ${result.strategyCode}`,
        currentDrawdown,
        maxDrawdown,
        action: `Sessione forex messa in pausa \u2014 ${reason}`,
        timestamp: new Date().toISOString(),
      });
    }

    // New positions opened/closed
    if (result.positionsOpened > 0 || result.positionsClosed > 0) {
      const lines: string[] = [
        `\uD83D\uDD04 <b>Forex Tick ${result.strategyCode}</b>`,
        '',
      ];

      if (result.positionsOpened > 0) {
        lines.push(`\uD83D\uDFE2 Posizioni aperte: ${result.positionsOpened}`);
      }
      if (result.positionsClosed > 0) {
        lines.push(`\uD83D\uDD34 Posizioni chiuse: ${result.positionsClosed}`);
      }
      lines.push(`\uD83D\uDCCA Pair analizzati: ${result.pairsEvaluated}`);
      lines.push(`\uD83D\uDCE1 Segnali: ${result.signalsGenerated}`);
      lines.push(`\uD83D\uDCB0 PnL: ${result.totalPnlPct.toFixed(2)}%`);

      if (result.errors.length > 0) {
        lines.push('');
        lines.push(`\u26A0\uFE0F Errori: ${result.errors.length}`);
      }

      await client.sendMessage(ELIO_CHAT_ID, lines.join('\n'));
    }
  }
}

async function fetchForexCircuitBreakerDetails(
  sessionId: string,
  strategyCode: string,
): Promise<{ currentDrawdown: number; maxDrawdown: number; reason: string }> {
  try {
    const db = createUntypedAdminClient();
    const { data: session } = await db
      .from('forex_paper_sessions')
      .select('max_drawdown_pct, circuit_broken_reason, strategy_code')
      .eq('id', sessionId)
      .single();

    if (session) {
      const currentDrawdown = Number(session.max_drawdown_pct) || 0;
      const reason = session.circuit_broken_reason || 'Limite raggiunto';
      const seed = FOREX_STRATEGY_MAP[session.strategy_code || strategyCode];
      const maxDrawdown = seed?.max_drawdown ?? 0;
      return { currentDrawdown, maxDrawdown, reason };
    }
  } catch {
    // Fallback
  }
  return { currentDrawdown: 0, maxDrawdown: 0, reason: 'Limite raggiunto' };
}

async function checkForexPerformanceWarnings(): Promise<void> {
  try {
    const db = createUntypedAdminClient();
    const { data: sessions } = await db
      .from('forex_paper_sessions')
      .select('id, strategy_code, strategy_name, max_drawdown_pct, last_warning_level, last_warning_at, started_at')
      .eq('status', 'running');

    if (!sessions || sessions.length === 0) return;

    const client = getTelegramClient();

    for (const session of sessions) {
      const seed = FOREX_STRATEGY_MAP[session.strategy_code];
      if (!seed) continue;

      const input: PerformanceWarningInput = {
        sessionId: session.id,
        strategyCode: session.strategy_code,
        strategyName: session.strategy_name || seed.name,
        area: 'forex',
        currentDrawdownPct: Number(session.max_drawdown_pct) || 0,
        circuitBreakerLimitPct: seed.max_drawdown,
        lastWarningLevel: session.last_warning_level ?? null,
        lastWarningAt: session.last_warning_at ?? null,
        startedAt: session.started_at,
      };

      const result = evaluatePerformanceWarning(input);

      if (result.shouldAlert && result.warningLevel) {
        await client.sendPerformanceWarning(ELIO_CHAT_ID, {
          strategyCode: input.strategyCode,
          strategyName: input.strategyName,
          area: 'forex',
          warningLevel: result.warningLevel,
          currentDrawdownPct: result.currentDrawdownPct,
          circuitBreakerLimitPct: result.circuitBreakerLimitPct,
          sessionStartedAt: input.startedAt,
        });

        await db
          .from('forex_paper_sessions')
          .update({
            last_warning_level: result.warningLevel,
            last_warning_at: new Date().toISOString(),
          })
          .eq('id', session.id);
      }
    }
  } catch (err) {
    console.error('[Cron/forex-tick] Performance warning check failed:', err);
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
