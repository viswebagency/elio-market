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
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';
import { processExpiredCooldowns, ExpiredSession } from '@/core/paper-trading/auto-rotation';
import { evaluatePerformanceWarning, PerformanceWarningInput } from '@/core/paper-trading/performance-alerts';

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

    // Auto-rotation: process expired cooldowns for Polymarket sessions
    const rotation = await processExpiredCooldowns(
      'paper_sessions',
      async (session: ExpiredSession) => {
        if (!session.user_id || !session.strategy_id) {
          throw new Error(`Missing user_id or strategy_id for session ${session.id}`);
        }
        const db = createUntypedAdminClient();

        // Close old session
        await db
          .from('paper_sessions')
          .update({
            status: 'stopped',
            stopped_at: new Date().toISOString(),
            cooldown_until: null,
          })
          .eq('id', session.id);

        // Close open positions
        await db
          .from('paper_positions')
          .update({
            status: 'closed',
            closed_at: new Date().toISOString(),
          })
          .eq('session_id', session.id)
          .eq('status', 'open');

        // Create new session
        const initialCapital = Number(session.initial_capital) || 1000;
        const { data: newRow, error } = await db
          .from('paper_sessions')
          .insert({
            user_id: session.user_id,
            strategy_id: session.strategy_id,
            initial_capital: initialCapital,
            current_capital: initialCapital,
            peak_capital: initialCapital,
            status: 'running',
            portfolio_state: {},
            auto_rotation_count: session.auto_rotation_count + 1,
            parent_session_id: session.id,
          })
          .select('id')
          .single();

        if (error || !newRow) {
          throw new Error(`Errore creazione sessione ruotata: ${error?.message ?? 'sconosciuto'}`);
        }

        return newRow.id;
      },
    );

    const summary = {
      sessionsProcessed: results.length,
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
    await sendTickNotifications(results);

    // Performance warnings — early alert before circuit breaker
    await checkPolymarketPerformanceWarnings();

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
    // Circuit breaker alert — fetch real drawdown values from DB
    if (result.circuitBroken) {
      const { currentDrawdown, maxDrawdown, reason } = await fetchCircuitBreakerDetails(result.sessionId);

      await client.sendCircuitBreakerAlert(ELIO_CHAT_ID, {
        strategyId: result.strategyId,
        strategyName: result.strategyCode,
        currentDrawdown,
        maxDrawdown,
        action: `Sessione messa in pausa — ${reason}`,
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

async function fetchCircuitBreakerDetails(
  sessionId: string,
): Promise<{ currentDrawdown: number; maxDrawdown: number; reason: string }> {
  try {
    const db = createUntypedAdminClient();

    // Get session drawdown data
    const { data: session } = await db
      .from('paper_sessions')
      .select('max_drawdown_pct, circuit_broken_reason, strategy_id')
      .eq('id', sessionId)
      .single();

    if (session) {
      const currentDrawdown = Number(session.max_drawdown_pct) || 0;
      const reason = session.circuit_broken_reason || 'Limite raggiunto';

      // Get max allowed drawdown from strategy definition
      let maxDrawdown = 0;
      const { data: strategy } = await db
        .from('strategies')
        .select('max_drawdown')
        .eq('id', session.strategy_id)
        .single();

      if (strategy) {
        maxDrawdown = Number(strategy.max_drawdown) || 0;
      }

      return { currentDrawdown, maxDrawdown, reason };
    }
  } catch {
    // Fallback
  }
  return { currentDrawdown: 0, maxDrawdown: 0, reason: 'Limite raggiunto' };
}

async function checkPolymarketPerformanceWarnings(): Promise<void> {
  try {
    const db = createUntypedAdminClient();
    const { data: sessions } = await db
      .from('paper_sessions')
      .select('id, strategy_id, max_drawdown_pct, last_warning_level, last_warning_at, started_at')
      .eq('status', 'running');

    if (!sessions || sessions.length === 0) return;

    const client = getTelegramClient();

    for (const session of sessions) {
      // Fetch strategy details for CB limit and name
      const { data: strategy } = await db
        .from('strategies')
        .select('code, name, max_drawdown')
        .eq('id', session.strategy_id)
        .single();

      if (!strategy || !strategy.max_drawdown) continue;

      const input: PerformanceWarningInput = {
        sessionId: session.id,
        strategyCode: strategy.code || '???',
        strategyName: strategy.name || 'Sconosciuta',
        area: 'polymarket',
        currentDrawdownPct: Number(session.max_drawdown_pct) || 0,
        circuitBreakerLimitPct: Number(strategy.max_drawdown),
        lastWarningLevel: session.last_warning_level ?? null,
        lastWarningAt: session.last_warning_at ?? null,
        startedAt: session.started_at,
      };

      const result = evaluatePerformanceWarning(input);

      if (result.shouldAlert && result.warningLevel) {
        await client.sendPerformanceWarning(ELIO_CHAT_ID, {
          strategyCode: input.strategyCode,
          strategyName: input.strategyName,
          area: 'polymarket',
          warningLevel: result.warningLevel,
          currentDrawdownPct: result.currentDrawdownPct,
          circuitBreakerLimitPct: result.circuitBreakerLimitPct,
          sessionStartedAt: input.startedAt,
        });

        await db
          .from('paper_sessions')
          .update({
            last_warning_level: result.warningLevel,
            last_warning_at: new Date().toISOString(),
          })
          .eq('id', session.id);
      }
    }
  } catch (err) {
    console.error('[Cron/tick] Performance warning check failed:', err);
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
