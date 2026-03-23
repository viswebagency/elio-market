/**
 * Audit logger — immutable log of all trade operations for compliance and debugging.
 */

import { Trade, TradeExecution } from '@/core/types/trade';

export interface AuditEntry {
  id: string;
  timestamp: string;
  type: 'trade_intent' | 'execution' | 'cancellation' | 'error' | 'kill_switch' | 'circuit_breaker_live';
  userId: string;
  tradeId?: string;
  executionId?: string;
  data: Record<string, unknown>;
}

export class AuditLogger {
  private entries: AuditEntry[] = []; // In-memory buffer, flush to DB periodically

  /** Log a trade intent */
  async logTradeIntent(trade: Trade): Promise<void> {
    this.log({
      type: 'trade_intent',
      userId: trade.userId,
      tradeId: trade.id,
      data: { trade },
    });
  }

  /** Log a trade execution */
  async logExecution(execution: TradeExecution): Promise<void> {
    this.log({
      type: 'execution',
      userId: '', // TODO: resolve from trade
      tradeId: execution.tradeId,
      executionId: execution.id,
      data: { execution },
    });
  }

  /** Log an error */
  async logError(tradeId: string, error: string): Promise<void> {
    this.log({
      type: 'error',
      userId: '',
      tradeId,
      data: { error },
    });
  }

  /** Log kill switch activation */
  async logKillSwitch(userId: string, reason: string): Promise<void> {
    this.log({
      type: 'kill_switch',
      userId,
      data: { reason },
    });
  }

  /** Log circuit breaker live trip */
  async logCircuitBreakerLive(userId: string, reason: string): Promise<void> {
    this.log({
      type: 'circuit_breaker_live',
      userId,
      data: { reason },
    });
  }

  private log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
    const fullEntry: AuditEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    this.entries.push(fullEntry);

    // TODO: flush to TimescaleDB/Supabase
    console.log(`[AUDIT] ${fullEntry.type}: ${JSON.stringify(fullEntry.data)}`);
  }

  /** Get recent entries (for debugging) */
  getRecent(limit = 50): AuditEntry[] {
    return this.entries.slice(-limit);
  }
}

export const auditLogger = new AuditLogger();
