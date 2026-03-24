/**
 * GET /api/cron/crypto-tick
 *
 * Vercel Cron — every 2 minutes.
 * Executes a tick on all active crypto paper trading sessions:
 * - Auto-starts L1-passing strategies if no sessions are active
 * - Fetches latest crypto data from Binance/Bybit
 * - Evaluates crypto strategies against current markets
 * - Opens/closes positions based on signals
 * - Sends Telegram alerts for new signals and circuit breakers
 * - Tracks consecutive failures and notifies on persistent issues
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { getCryptoPaperTradingManager, CryptoTickResult, CRYPTO_L1_STRATEGY_CODES, CRYPTO_L1_DEFAULT_CAPITAL } from '@/core/paper-trading/crypto-manager';
import { CRYPTO_STRATEGY_MAP } from '@/core/strategies/crypto-strategies';
import { getTelegramClient } from '@/lib/telegram';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';
import { processExpiredCooldowns, ExpiredSession } from '@/core/paper-trading/auto-rotation';
import { evaluatePerformanceWarning, PerformanceWarningInput } from '@/core/paper-trading/performance-alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Pro: max 60s

const ELIO_CHAT_ID = 8659384895;
const ADAPTER_INIT_TIMEOUT_MS = 20_000; // 20s max for Binance loadMarkets
const ADAPTER_MAX_RETRIES = 2;

/** Track consecutive failures to alert on persistent issues */
let consecutiveFailures = 0;
let lastFailureNotifiedAt = 0;
const FAILURE_NOTIFY_COOLDOWN_MS = 30 * 60 * 1000; // 30 min between failure alerts

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // DEBUG: direct DB query to diagnose session loading issue
    const debugDb = createUntypedAdminClient();
    const { data: debugSessions, error: debugError } = await debugDb
      .from('crypto_paper_sessions')
      .select('id, strategy_code, status')
      .eq('status', 'running');
    const debugInfo = {
      dbUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30) + '...',
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      sessionsFound: debugSessions?.length ?? 0,
      dbError: debugError?.message ?? null,
      sessions: (debugSessions ?? []).map((s: { strategy_code: string; id: string }) => s.strategy_code),
    };
    console.log('[Cron/crypto-tick] DEBUG DB:', JSON.stringify(debugInfo));

    const manager = getCryptoPaperTradingManager();

    // Initialize adapter with timeout and retry
    await initializeAdapterWithRetry(manager);

    // DEBUG: force load sessions from cron level
    let loadedCount = 0;
    let loadError: string | null = null;
    try {
      loadedCount = await manager.loadActiveSessions();
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
    (debugInfo as Record<string, unknown>).managerLoadedCount = loadedCount;
    (debugInfo as Record<string, unknown>).managerSessionsAfterLoad = manager.getActiveSessions().length;
    (debugInfo as Record<string, unknown>).loadError = loadError;

    // Auto-start L1 strategies only on first-ever run (no sessions exist at all)
    const activeBefore = manager.getActiveSessions().length;
    let autoStarted: string[] = [];
    let autoStartSkipped: { code: string; status: string }[] = [];

    if (activeBefore === 0) {
      // Check DB for ANY existing sessions (running, paused, stopped) for L1 strategies
      const db = createUntypedAdminClient();
      const { data: existingSessions } = await db
        .from('crypto_paper_sessions')
        .select('strategy_code, status')
        .in('strategy_code', [...CRYPTO_L1_STRATEGY_CODES]);

      const existingByCode = new Map<string, string>();
      for (const row of existingSessions ?? []) {
        // Keep the "most relevant" status per strategy (paused > stopped)
        const prev = existingByCode.get(row.strategy_code);
        if (!prev || row.status === 'paused') {
          existingByCode.set(row.strategy_code, row.status);
        }
      }

      // Strategies with paused sessions — do NOT restart (in cooldown for auto-rotation)
      const pausedStrategies = [...existingByCode.entries()]
        .filter(([, status]) => status === 'paused')
        .map(([code, status]) => ({ code, status }));

      autoStartSkipped = pausedStrategies;

      // Strategies with ZERO sessions or ONLY stopped sessions (safe to restart)
      const strategiesWithNoSession = CRYPTO_L1_STRATEGY_CODES.filter(
        (code) => !existingByCode.has(code),
      );
      const strategiesOnlyStopped = CRYPTO_L1_STRATEGY_CODES.filter(
        (code) => existingByCode.get(code) === 'stopped',
      );

      // Auto-start if: no paused sessions blocking AND there are strategies to start
      const canAutoStart = pausedStrategies.length === 0
        && (strategiesWithNoSession.length > 0 || strategiesOnlyStopped.length > 0);

      if (canAutoStart) {
        autoStarted = await manager.autoStartL1Sessions();

        if (autoStarted.length > 0) {
          try {
            const client = getTelegramClient();
            await client.sendMessage(
              ELIO_CHAT_ID,
              `\uD83D\uDE80 <b>Crypto Paper Trading Auto-Start</b>\n\n` +
              `Avviate ${autoStarted.length} sessioni L1:\n` +
              autoStarted.map((id) => `• ${id}`).join('\n') +
              `\n\n<i>${new Date().toLocaleString('it-IT')}</i>`,
            );
          } catch {
            // Don't fail if Telegram notification fails
          }
        }
      } else if (autoStartSkipped.length > 0) {
        console.log(
          '[Cron/crypto-tick] Auto-start skipped — existing paused/stopped sessions:',
          autoStartSkipped,
        );
      }
    }

    const results = await manager.tick();

    // Auto-rotation: process expired cooldowns
    const rotation = await processExpiredCooldowns(
      'crypto_paper_sessions',
      async (session: ExpiredSession) => {
        return manager.startRotatedSession(
          session.id,
          session.strategy_code,
          session.auto_rotation_count,
          CRYPTO_L1_DEFAULT_CAPITAL,
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
    await sendCryptoTickNotifications(results);

    // Performance warnings — early alert before circuit breaker
    await checkCryptoPerformanceWarnings();

    // Reset failure counter on success
    consecutiveFailures = 0;

    console.log('[Cron/crypto-tick]', JSON.stringify(summary));

    return NextResponse.json({ ok: true, summary, _debug: debugInfo });
  } catch (error) {
    consecutiveFailures++;
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error(`[Cron/crypto-tick] ERRORE (failure #${consecutiveFailures}):`, message);

    // Notify on Telegram — always on first failure, then respect cooldown
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
          `${urgency} <b>Cron Crypto Tick Fallito</b>\n\n` +
          `<b>Errore:</b> <code>${escapeHtml(message)}</code>\n` +
          `<b>Fallimenti consecutivi:</b> ${consecutiveFailures}\n` +
          `<b>Durata:</b> ${Date.now() - startTime}ms\n\n` +
          (consecutiveFailures >= 3
            ? `<b>ATTENZIONE:</b> Il cron potrebbe essere disabilitato da Vercel dopo troppi fallimenti consecutivi.\n\n`
            : '') +
          `<i>${new Date().toLocaleString('it-IT')}</i>`,
        );
      } catch {
        // Don't fail the response if Telegram notification fails
      }
    }

    // Return 200 instead of 500 to prevent Vercel from disabling the cron
    // The error is tracked and notified via Telegram
    return NextResponse.json({
      ok: false,
      error: message,
      consecutiveFailures,
      note: 'Returning 200 to keep cron active. Error notified via Telegram.',
    });
  }
}

// ---------------------------------------------------------------------------
// Adapter initialization with timeout + retry
// ---------------------------------------------------------------------------

async function initializeAdapterWithRetry(
  manager: ReturnType<typeof getCryptoPaperTradingManager>,
): Promise<void> {
  for (let attempt = 1; attempt <= ADAPTER_MAX_RETRIES; attempt++) {
    try {
      await Promise.race([
        manager.initializeAdapter('binance'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(
            `Binance adapter init timeout after ${ADAPTER_INIT_TIMEOUT_MS}ms (attempt ${attempt}/${ADAPTER_MAX_RETRIES})`
          )), ADAPTER_INIT_TIMEOUT_MS)
        ),
      ]);
      return; // success
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Cron/crypto-tick] Adapter init attempt ${attempt}/${ADAPTER_MAX_RETRIES} failed: ${msg}`);

      if (attempt === ADAPTER_MAX_RETRIES) {
        throw new Error(`Adapter init failed after ${ADAPTER_MAX_RETRIES} attempts: ${msg}`);
      }

      // Wait 2s before retry
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sendCryptoTickNotifications(results: CryptoTickResult[]): Promise<void> {
  const client = getTelegramClient();

  for (const result of results) {
    // Circuit breaker alert — fetch real drawdown values from DB
    if (result.circuitBroken) {
      const { currentDrawdown, maxDrawdown, reason } = await fetchCryptoCircuitBreakerDetails(result.sessionId, result.strategyCode);

      await client.sendCircuitBreakerAlert(ELIO_CHAT_ID, {
        strategyId: result.sessionId,
        strategyName: `[CRYPTO] ${result.strategyCode}`,
        currentDrawdown,
        maxDrawdown,
        action: `Sessione crypto messa in pausa — ${reason}`,
        timestamp: new Date().toISOString(),
      });
    }

    // New positions opened/closed
    if (result.positionsOpened > 0 || result.positionsClosed > 0) {
      const lines: string[] = [
        `\uD83D\uDD04 <b>Crypto Tick ${result.strategyCode}</b>`,
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

async function fetchCryptoCircuitBreakerDetails(
  sessionId: string,
  strategyCode: string,
): Promise<{ currentDrawdown: number; maxDrawdown: number; reason: string }> {
  try {
    const db = createUntypedAdminClient();
    const { data: session } = await db
      .from('crypto_paper_sessions')
      .select('max_drawdown_pct, circuit_broken_reason, strategy_code')
      .eq('id', sessionId)
      .single();

    if (session) {
      const currentDrawdown = Number(session.max_drawdown_pct) || 0;
      const reason = session.circuit_broken_reason || 'Limite raggiunto';

      // Get max allowed drawdown from strategy seed
      const seed = CRYPTO_STRATEGY_MAP[session.strategy_code || strategyCode];
      const maxDrawdown = seed?.max_drawdown ?? 0;

      return { currentDrawdown, maxDrawdown, reason };
    }
  } catch {
    // Fallback
  }
  return { currentDrawdown: 0, maxDrawdown: 0, reason: 'Limite raggiunto' };
}

async function checkCryptoPerformanceWarnings(): Promise<void> {
  try {
    const db = createUntypedAdminClient();
    const { data: sessions } = await db
      .from('crypto_paper_sessions')
      .select('id, strategy_code, strategy_name, max_drawdown_pct, last_warning_level, last_warning_at, started_at')
      .eq('status', 'running');

    if (!sessions || sessions.length === 0) return;

    const client = getTelegramClient();

    for (const session of sessions) {
      const seed = CRYPTO_STRATEGY_MAP[session.strategy_code];
      if (!seed) continue;

      const input: PerformanceWarningInput = {
        sessionId: session.id,
        strategyCode: session.strategy_code,
        strategyName: session.strategy_name || seed.name,
        area: 'crypto',
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
          area: 'crypto',
          warningLevel: result.warningLevel,
          currentDrawdownPct: result.currentDrawdownPct,
          circuitBreakerLimitPct: result.circuitBreakerLimitPct,
          sessionStartedAt: input.startedAt,
        });

        await db
          .from('crypto_paper_sessions')
          .update({
            last_warning_level: result.warningLevel,
            last_warning_at: new Date().toISOString(),
          })
          .eq('id', session.id);
      }
    }
  } catch (err) {
    console.error('[Cron/crypto-tick] Performance warning check failed:', err);
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
