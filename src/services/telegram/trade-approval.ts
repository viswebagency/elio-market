/**
 * Telegram Trade Approval Flow
 *
 * Trades exceeding 5% of bankroll require manual approval via Telegram.
 * Below 5%: automatic execution (no change to existing flow).
 * Above 5%: queued for approval with inline buttons (Approve / Reject).
 * Timeout: 5 minutes — default is REJECT (safe default).
 */

import { getTelegramClient } from '@/lib/telegram';
import { auditLogger } from '@/services/execution/audit-logger';
import { Trade } from '@/core/types/trade';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Trades above this % of bankroll require approval */
export const APPROVAL_THRESHOLD_PCT = 5;

/** Timeout for approval — 5 minutes */
export const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

const ELIO_CHAT_ID = 8659384895;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApprovalResult {
  approved: boolean;
  respondedAt: string;
  timedOut: boolean;
}

export interface PendingApproval {
  id: string;
  trade: Trade;
  tradeValueUsd: number;
  bankrollPct: number;
  reason?: string;
  requestedAt: string;
  messageId?: number;
  resolve: (result: ApprovalResult) => void;
}

// ---------------------------------------------------------------------------
// Approval queue (in-memory, singleton)
// ---------------------------------------------------------------------------

const pendingApprovals = new Map<string, PendingApproval>();
const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

/** Get all pending approvals */
export function getPendingApprovals(): PendingApproval[] {
  return Array.from(pendingApprovals.values());
}

/** Cancel all pending approvals (used by kill switch) */
export function cancelAllPending(): void {
  for (const [id, pending] of pendingApprovals.entries()) {
    // Clear timeout
    const timeout = timeouts.get(id);
    if (timeout) clearTimeout(timeout);
    timeouts.delete(id);

    // Resolve as rejected
    pending.resolve({
      approved: false,
      respondedAt: new Date().toISOString(),
      timedOut: false,
    });

    // Audit
    auditLogger.logKillSwitch(
      'system',
      `Trade approval cancelled (kill switch): ${pending.trade.symbol} ${pending.trade.direction}`,
    );
  }
  pendingApprovals.clear();
}

// ---------------------------------------------------------------------------
// Resolve a pending approval by trade ID (from Telegram callback or web)
// ---------------------------------------------------------------------------

export function resolveApproval(tradeId: string, approved: boolean): boolean {
  const pending = pendingApprovals.get(tradeId);
  if (!pending) return false;

  // Clear timeout
  const timeout = timeouts.get(tradeId);
  if (timeout) clearTimeout(timeout);
  timeouts.delete(tradeId);

  // Remove from queue
  pendingApprovals.delete(tradeId);

  // Resolve promise
  pending.resolve({
    approved,
    respondedAt: new Date().toISOString(),
    timedOut: false,
  });

  // Audit log
  auditLogger.logKillSwitch(
    'user',
    `Trade ${approved ? 'APPROVED' : 'REJECTED'}: ${pending.trade.symbol} ${pending.trade.direction} $${pending.tradeValueUsd.toFixed(2)} (${pending.bankrollPct.toFixed(1)}% bankroll)`,
  );

  return true;
}

// ---------------------------------------------------------------------------
// Request approval via Telegram
// ---------------------------------------------------------------------------

export async function requestApproval(
  trade: Trade,
  bankroll: number,
  reason?: string,
): Promise<ApprovalResult> {
  const tradeValue = trade.size * (trade.limitPrice ?? trade.metadata?.expectedPrice as number ?? 0);
  const bankrollPct = bankroll > 0 ? (tradeValue / bankroll) * 100 : 100;

  return new Promise<ApprovalResult>(async (resolve) => {
    const pending: PendingApproval = {
      id: trade.id,
      trade,
      tradeValueUsd: tradeValue,
      bankrollPct,
      reason,
      requestedAt: new Date().toISOString(),
      resolve,
    };

    pendingApprovals.set(trade.id, pending);

    // Send Telegram message with inline buttons
    try {
      const client = getTelegramClient();
      const lines = [
        '<b>APPROVAZIONE TRADE RICHIESTA</b>',
        '',
        `<b>Simbolo:</b> ${escapeHtml(trade.symbol)}`,
        `<b>Direzione:</b> ${trade.direction.toUpperCase()}`,
        `<b>Size:</b> ${trade.size}`,
        `<b>Valore:</b> $${tradeValue.toFixed(2)}`,
        `<b>% Bankroll:</b> ${bankrollPct.toFixed(1)}%`,
      ];

      if (reason) {
        lines.push(`<b>Strategia:</b> ${escapeHtml(reason)}`);
      }

      lines.push(
        '',
        `Timeout: 5 minuti (rifiuto automatico)`,
        '',
        `<i>${new Date().toLocaleString('it-IT')}</i>`,
      );

      const msg = await client.sendMessage(ELIO_CHAT_ID, lines.join('\n'), {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Approva', callback_data: `approve_trade:${trade.id}` },
              { text: 'Rifiuta', callback_data: `reject_trade:${trade.id}` },
            ],
          ],
        },
      });

      pending.messageId = msg.message_id;
    } catch {
      // If Telegram fails, reject the trade (safe default)
      pendingApprovals.delete(trade.id);
      timeouts.delete(trade.id);
      resolve({
        approved: false,
        respondedAt: new Date().toISOString(),
        timedOut: false,
      });
      return;
    }

    // Set timeout — auto-reject after 5 minutes
    const timer = setTimeout(async () => {
      if (!pendingApprovals.has(trade.id)) return;

      pendingApprovals.delete(trade.id);
      timeouts.delete(trade.id);

      resolve({
        approved: false,
        respondedAt: new Date().toISOString(),
        timedOut: true,
      });

      // Audit
      auditLogger.logKillSwitch(
        'system',
        `Trade RIFIUTATO per timeout: ${trade.symbol} ${trade.direction} $${tradeValue.toFixed(2)}`,
      );

      // Notify on Telegram
      try {
        const client = getTelegramClient();
        await client.sendMessage(
          ELIO_CHAT_ID,
          `Trade <b>${escapeHtml(trade.symbol)}</b> rifiutato automaticamente per timeout (5 min).`,
        );
      } catch {
        // Ignore Telegram errors
      }
    }, APPROVAL_TIMEOUT_MS);

    timeouts.set(trade.id, timer);
  });
}

// ---------------------------------------------------------------------------
// Wrapper: executeWithApproval
// ---------------------------------------------------------------------------

/**
 * Wraps trade execution with approval flow.
 * - If trade value < 5% bankroll → execute directly.
 * - If trade value >= 5% bankroll → request approval first.
 */
export async function executeWithApproval<T>(
  trade: Trade,
  bankroll: number,
  executeFn: () => Promise<T>,
  reason?: string,
): Promise<{ executed: boolean; result?: T; approvalResult?: ApprovalResult }> {
  const tradeValue = trade.size * (trade.limitPrice ?? trade.metadata?.expectedPrice as number ?? 0);
  const bankrollPct = bankroll > 0 ? (tradeValue / bankroll) * 100 : 0;

  // Below threshold — execute directly
  if (bankrollPct < APPROVAL_THRESHOLD_PCT) {
    const result = await executeFn();
    return { executed: true, result };
  }

  // Above threshold — request approval
  const approvalResult = await requestApproval(trade, bankroll, reason);

  if (approvalResult.approved) {
    const result = await executeFn();
    return { executed: true, result, approvalResult };
  }

  return { executed: false, approvalResult };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
