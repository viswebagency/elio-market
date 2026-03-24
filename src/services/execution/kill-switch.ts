/**
 * Kill switch — emergency stop for all trading operations.
 * When activated, cancels all open orders and closes all positions.
 *
 * State is persisted in `live_safety_state` table so it survives
 * Vercel cold starts.
 */

import { CryptoAdapter, PlaceTradeResult, CancelOrderResult } from '@/plugins/crypto/adapter';
import { auditLogger } from './audit-logger';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';

export interface KillSwitchReport {
  cancelledOrders: number;
  closedPositions: number;
  errors: string[];
}

export interface KillSwitchStatus {
  active: boolean;
  activatedAt: string | null;
  activatedBy: string | null;
  reason: string | null;
}

const DB_ROW_ID = 'kill_switch';

export class KillSwitch {
  private active = false;
  private activatedAt: string | null = null;
  private activatedBy: string | null = null;
  private reason: string | null = null;
  private hydrated = false;

  /** Check if kill switch is active — loads from DB on first call */
  async isActive(): Promise<boolean> {
    await this.hydrate();
    return this.active;
  }

  /** Synchronous check — only use after hydrate() has been called */
  isActiveSync(): boolean {
    return this.active;
  }

  /**
   * Activate the kill switch:
   * 1. Set flag + persist to DB
   * 2. Cancel all open orders
   * 3. Close all open positions (market sell)
   * 4. Log every action to audit
   */
  async activate(
    userId: string,
    reason: string,
    adapter?: CryptoAdapter,
    /** Optional list of active trading symbols — avoids expensive global getOpenOrders() */
    activeSymbols?: string[],
  ): Promise<KillSwitchReport> {
    this.active = true;
    this.activatedAt = new Date().toISOString();
    this.activatedBy = userId;
    this.reason = reason;

    console.error(`[KILL SWITCH] ACTIVATED by ${userId}: ${reason}`);
    await auditLogger.logKillSwitch(userId, reason);
    await this.persist();

    const report: KillSwitchReport = {
      cancelledOrders: 0,
      closedPositions: 0,
      errors: [],
    };

    if (!adapter) {
      return report;
    }

    // Cancel all open orders
    try {
      const symbols = activeSymbols ?? [undefined]; // undefined = global query
      for (const sym of symbols) {
        try {
          const openOrders = await adapter.getOpenOrders(sym);
          for (const order of openOrders) {
            try {
              const result: CancelOrderResult = await adapter.cancelOrder(
                order.id,
                order.symbol
              );
              if (result.success) {
                report.cancelledOrders++;
                await auditLogger.logKillSwitch(userId, `Cancelled order ${order.id} on ${order.symbol}`);
              } else {
                report.errors.push(`Failed to cancel order ${order.id}: ${result.message}`);
              }
            } catch (err) {
              report.errors.push(
                `Error cancelling order ${order.id}: ${err instanceof Error ? err.message : String(err)}`
              );
            }
          }
        } catch (err) {
          report.errors.push(
            `Error fetching open orders${sym ? ` for ${sym}` : ''}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    } catch (err) {
      report.errors.push(
        `Error in order cancellation: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Close all open positions (market sell)
    try {
      const positions = await adapter.getPositions();
      for (const pos of positions) {
        try {
          const result: PlaceTradeResult = await adapter.placeTrade({
            symbol: pos.symbol,
            side: 'sell',
            type: 'market',
            amount: pos.amount,
          });
          if (result.status !== 'rejected') {
            report.closedPositions++;
            await auditLogger.logKillSwitch(
              userId,
              `Closed position ${pos.symbol}: sold ${pos.amount} @ market (order ${result.orderId})`
            );
          } else {
            report.errors.push(`Position close rejected for ${pos.symbol}`);
          }
        } catch (err) {
          report.errors.push(
            `Error closing position ${pos.symbol}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    } catch (err) {
      report.errors.push(
        `Error fetching positions: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    return report;
  }

  /** Deactivate the kill switch */
  async deactivate(userId: string): Promise<void> {
    console.log(`[KILL SWITCH] Deactivated by ${userId}`);
    this.active = false;
    this.activatedAt = null;
    this.activatedBy = null;
    this.reason = null;

    await auditLogger.logKillSwitch(userId, 'Kill switch deactivated');
    await this.persist();
  }

  /** Get current status */
  getStatus(): KillSwitchStatus {
    return {
      active: this.active,
      activatedAt: this.activatedAt,
      activatedBy: this.activatedBy,
      reason: this.reason,
    };
  }

  /** Load state from DB (idempotent — only runs once per instance) */
  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;

    try {
      const db = createUntypedAdminClient();
      const { data } = await db
        .from('live_safety_state')
        .select('active, activated_at, activated_by, reason')
        .eq('id', DB_ROW_ID)
        .single();

      if (data) {
        this.active = data.active;
        this.activatedAt = data.activated_at;
        this.activatedBy = data.activated_by;
        this.reason = data.reason;
      }
    } catch (err) {
      console.error('[KillSwitch] hydrate failed:', err instanceof Error ? err.message : err);
    }
  }

  /** Persist current state to DB */
  private async persist(): Promise<void> {
    try {
      const db = createUntypedAdminClient();
      await db
        .from('live_safety_state')
        .update({
          active: this.active,
          activated_at: this.activatedAt,
          activated_by: this.activatedBy,
          reason: this.reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', DB_ROW_ID);
    } catch (err) {
      console.error('[KillSwitch] persist failed:', err instanceof Error ? err.message : err);
    }
  }
}

export const killSwitch = new KillSwitch();
