/**
 * Circuit Breaker Live — automatic safety net for live trading.
 *
 * Monitors trade results and daily stats. When thresholds are breached,
 * activates the kill switch (which cancels orders + closes positions)
 * and sends a critical Telegram alert.
 *
 * Difference from paper trading circuit breaker (VirtualPortfolio):
 * - This is for LIVE trading with real money
 * - When tripped, it activates the kill switch (real order cancellation)
 * - Has its own thresholds (more conservative)
 * - Tracks execution errors as an additional trip condition
 */

import { KillSwitch } from './kill-switch';
import { auditLogger } from './audit-logger';
import { getTelegramClient } from '@/lib/telegram';
import { cancelAllPending } from '@/services/telegram/trade-approval';
import type { CryptoAdapter } from '@/plugins/crypto/adapter';

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

export const LIVE_CB_THRESHOLDS = {
  /** Max loss on a single trade as % of bankroll */
  SINGLE_TRADE_LOSS_PCT: 5,
  /** Max cumulative daily loss as % of bankroll */
  DAILY_LOSS_PCT: 4,
  /** Consecutive losing trades before tripping */
  CONSECUTIVE_LOSSES: 3,
  /** Execution errors within the time window */
  MAX_ERRORS: 3,
  /** Time window for error tracking (ms) — 10 minutes */
  ERROR_WINDOW_MS: 10 * 60 * 1000,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiveTradeResult {
  pnl: number;
  pnlPct: number;
  bankroll: number;
}

export interface LiveDailyStats {
  dailyPnl: number;
  dailyPnlPct: number;
  bankroll: number;
}

export interface CircuitBreakerLiveStatus {
  tripped: boolean;
  trippedAt: string | null;
  reason: string | null;
  consecutiveLosses: number;
  dailyLossPct: number;
  recentErrors: number;
}

const ELIO_CHAT_ID = 8659384895;

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class CircuitBreakerLive {
  private tripped = false;
  private trippedAt: string | null = null;
  private reason: string | null = null;

  private consecutiveLosses = 0;
  private dailyLossPct = 0;
  private errorTimestamps: number[] = [];

  private killSwitch: KillSwitch;

  constructor(killSwitch: KillSwitch) {
    this.killSwitch = killSwitch;
  }

  /** Check if circuit breaker is tripped */
  get isTripped(): boolean {
    return this.tripped;
  }

  /**
   * Check thresholds after a trade result. If any threshold is breached,
   * trip the circuit breaker → activate kill switch → send Telegram alert.
   *
   * Returns true if the circuit breaker was tripped.
   */
  async checkAndTrip(
    tradeResult: LiveTradeResult,
    dailyStats: LiveDailyStats,
    opts?: { userId?: string; adapter?: CryptoAdapter },
  ): Promise<boolean> {
    if (this.tripped) return true;

    // Track consecutive losses
    if (tradeResult.pnl < 0) {
      this.consecutiveLosses++;
    } else if (tradeResult.pnl > 0) {
      this.consecutiveLosses = 0;
    }

    // Update daily loss tracking
    this.dailyLossPct = Math.abs(Math.min(0, dailyStats.dailyPnlPct));

    // Check single trade loss
    const singleTradeLossPct = tradeResult.bankroll > 0
      ? (Math.abs(Math.min(0, tradeResult.pnl)) / tradeResult.bankroll) * 100
      : 0;

    let tripReason: string | null = null;

    if (singleTradeLossPct > LIVE_CB_THRESHOLDS.SINGLE_TRADE_LOSS_PCT) {
      tripReason = `Perdita singolo trade ${singleTradeLossPct.toFixed(2)}% > limite ${LIVE_CB_THRESHOLDS.SINGLE_TRADE_LOSS_PCT}%`;
    } else if (this.dailyLossPct > LIVE_CB_THRESHOLDS.DAILY_LOSS_PCT) {
      tripReason = `Perdita giornaliera ${this.dailyLossPct.toFixed(2)}% > limite ${LIVE_CB_THRESHOLDS.DAILY_LOSS_PCT}%`;
    } else if (this.consecutiveLosses >= LIVE_CB_THRESHOLDS.CONSECUTIVE_LOSSES) {
      tripReason = `${this.consecutiveLosses} trade consecutivi in perdita >= limite ${LIVE_CB_THRESHOLDS.CONSECUTIVE_LOSSES}`;
    }

    if (tripReason) {
      await this.trip(tripReason, opts?.userId, opts?.adapter);
      return true;
    }

    return false;
  }

  /**
   * Record an execution error. If too many errors happen within the window,
   * trip the circuit breaker.
   */
  async recordError(
    error: string,
    opts?: { userId?: string; adapter?: CryptoAdapter },
  ): Promise<boolean> {
    if (this.tripped) return true;

    const now = Date.now();
    this.errorTimestamps.push(now);

    // Prune old timestamps outside the window
    this.errorTimestamps = this.errorTimestamps.filter(
      (t) => now - t < LIVE_CB_THRESHOLDS.ERROR_WINDOW_MS,
    );

    if (this.errorTimestamps.length >= LIVE_CB_THRESHOLDS.MAX_ERRORS) {
      const tripReason = `${this.errorTimestamps.length} errori di esecuzione in ${LIVE_CB_THRESHOLDS.ERROR_WINDOW_MS / 60000} minuti (ultimo: ${error})`;
      await this.trip(tripReason, opts?.userId, opts?.adapter);
      return true;
    }

    return false;
  }

  /**
   * Reset the circuit breaker. Logs the action to audit.
   */
  async reset(userId: string): Promise<void> {
    this.tripped = false;
    this.trippedAt = null;
    this.reason = null;
    this.consecutiveLosses = 0;
    this.dailyLossPct = 0;
    this.errorTimestamps = [];

    await auditLogger.logKillSwitch(userId, 'Circuit breaker live reset');
    console.log(`[CIRCUIT BREAKER LIVE] Reset by ${userId}`);
  }

  /** Get current status */
  getStatus(): CircuitBreakerLiveStatus {
    const now = Date.now();
    const recentErrors = this.errorTimestamps.filter(
      (t) => now - t < LIVE_CB_THRESHOLDS.ERROR_WINDOW_MS,
    ).length;

    return {
      tripped: this.tripped,
      trippedAt: this.trippedAt,
      reason: this.reason,
      consecutiveLosses: this.consecutiveLosses,
      dailyLossPct: this.dailyLossPct,
      recentErrors,
    };
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async trip(
    reason: string,
    userId?: string,
    adapter?: CryptoAdapter,
  ): Promise<void> {
    this.tripped = true;
    this.trippedAt = new Date().toISOString();
    this.reason = reason;

    const resolvedUserId = userId ?? 'system';

    console.error(`[CIRCUIT BREAKER LIVE] TRIPPED: ${reason}`);

    // 0. Cancel all pending trade approvals
    cancelAllPending();

    // 1. Log to audit
    await auditLogger.logCircuitBreakerLive(resolvedUserId, reason);

    // 2. Activate kill switch (cancels orders + closes positions)
    const report = await this.killSwitch.activate(
      resolvedUserId,
      `Circuit breaker live: ${reason}`,
      adapter,
    );

    // 3. Send critical Telegram alert
    try {
      const client = getTelegramClient();
      const lines = [
        '\u{1F6A8}\u{1F6A8}\u{1F6A8} <b>CIRCUIT BREAKER LIVE ATTIVATO</b> \u{1F6A8}\u{1F6A8}\u{1F6A8}',
        '',
        `<b>Motivo:</b> ${escapeHtml(reason)}`,
        '',
        `<b>Kill Switch:</b> attivato`,
        `<b>Ordini cancellati:</b> ${report.cancelledOrders}`,
        `<b>Posizioni chiuse:</b> ${report.closedPositions}`,
        report.errors.length > 0
          ? `<b>Errori:</b> ${report.errors.length}`
          : '',
        '',
        '\u26A0\uFE0F <b>Tutti i trade live sono bloccati.</b>',
        `Usa /killswitch_off per riattivare dopo aver verificato.`,
        '',
        `<i>${new Date().toLocaleString('it-IT')}</i>`,
      ].filter(Boolean);

      await client.sendMessage(ELIO_CHAT_ID, lines.join('\n'));
    } catch {
      // Don't fail if Telegram is down
      console.error('[CIRCUIT BREAKER LIVE] Failed to send Telegram alert');
    }
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

import { killSwitch } from './kill-switch';

export const circuitBreakerLive = new CircuitBreakerLive(killSwitch);
