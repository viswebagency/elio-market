/**
 * GET /api/cron/live-tick
 *
 * Vercel Cron — every 1 minute.
 * Evaluates all active live crypto strategies, executes trades through the
 * authenticated broker adapter, and feeds results to the circuit breaker.
 *
 * Safety gates (in order):
 * 1. Cron auth
 * 2. Concurrency lock (skip if previous tick still running)
 * 3. Kill switch check (skip all trading if active)
 * 4. Circuit breaker check (skip all trading if tripped)
 * 5. 2FA check per user
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { killSwitch } from '@/services/execution/kill-switch';
import { circuitBreakerLive } from '@/services/execution/circuit-breaker-live';
import { BrokerKeyService } from '@/services/broker/broker-key-service';
import { StrategyExecutor, ExecutorConfig, LiveExecutionService } from '@/core/engine/executor';
import { MarketArea, Direction, OrderType } from '@/core/types/common';
import { parseStrategy, RawStrategyRow } from '@/core/engine/dsl-parser';
import { CryptoAdapter } from '@/plugins/crypto/adapter';
import { CRYPTO_TOP_PAIRS } from '@/plugins/crypto/constants';
import { MarketSnapshot } from '@/core/engine/evaluator';
import { CRYPTO_STRATEGY_MAP, CryptoStrategySeed } from '@/core/strategies/crypto-strategies';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';
import { check2FAFromProfile } from '@/lib/auth/require-2fa';
import { getTelegramClient } from '@/lib/telegram';
import { auditLogger } from '@/services/execution/audit-logger';
import { reconcileAndUpdate } from '@/services/reconciliation/order-reconciliation';
import { executeWithApproval } from '@/services/telegram/trade-approval';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ELIO_CHAT_ID = 8659384895;

// Concurrency lock
let tickInProgress = false;

// Timeout budget: leave 5s margin for Vercel's 60s limit
const TICK_TIMEOUT_MS = 55_000;

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // --- Concurrency lock ---
  if (tickInProgress) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'Previous tick still in progress',
    });
  }

  tickInProgress = true;
  const startTime = Date.now();

  try {
    // --- Kill switch check (loads from DB on cold start) ---
    if (await killSwitch.isActive()) {
      console.log('[Cron/live-tick] Kill switch active — skipping');
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'Kill switch active',
      });
    }

    // --- Circuit breaker check (loads from DB on cold start) ---
    if (await circuitBreakerLive.isTrippedAsync()) {
      console.log('[Cron/live-tick] Circuit breaker tripped — skipping');
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'Circuit breaker tripped',
      });
    }

    // --- Load live strategies from DB ---
    const db = createUntypedAdminClient();
    const { data: liveStrategies, error: fetchError } = await db
      .from('strategies')
      .select('id, code, user_id, broker_name')
      .eq('status', 'live')
      .eq('area', 'crypto')
      .eq('is_active', true);

    if (fetchError) {
      throw new Error(`Failed to load live strategies: ${fetchError.message}`);
    }

    if (!liveStrategies || liveStrategies.length === 0) {
      return NextResponse.json({
        ok: true,
        strategiesEvaluated: 0,
        reason: 'No active live strategies',
        durationMs: Date.now() - startTime,
      });
    }

    // --- 2FA check per user ---
    const userIds = [...new Set(liveStrategies.map((s: Record<string, unknown>) => s.user_id as string))];
    const { data: profiles } = await db
      .from('profiles')
      .select('id, two_fa_enabled')
      .in('id', userIds);

    const profileMap = new Map<string, { two_fa_enabled?: boolean }>();
    for (const p of profiles ?? []) {
      profileMap.set(p.id, p);
    }

    const brokerKeyService = new BrokerKeyService();
    const results: LiveTickStrategyResult[] = [];
    let totalOrdersExecuted = 0;

    // --- Process each strategy ---
    for (const strat of liveStrategies) {
      // Timeout check
      if (Date.now() - startTime > TICK_TIMEOUT_MS) {
        console.warn('[Cron/live-tick] Timeout budget exhausted — stopping');
        break;
      }

      const userId = strat.user_id as string;
      const strategyCode = strat.code as string;
      const brokerName = (strat.broker_name as string) || 'binance';

      try {
        // 2FA gate
        const profile = profileMap.get(userId);
        if (!profile) {
          results.push({ strategyCode, status: 'skipped', reason: 'Profile not found' });
          continue;
        }

        const twoFACheck = check2FAFromProfile(profile);
        if (!twoFACheck.allowed) {
          results.push({ strategyCode, status: 'skipped', reason: '2FA not enabled' });
          continue;
        }

        // Get authenticated adapter
        const adapter = await brokerKeyService.getBrokerAdapter('crypto', brokerName);

        // Get strategy seed
        const seed = CRYPTO_STRATEGY_MAP[strategyCode];
        if (!seed) {
          results.push({ strategyCode, status: 'skipped', reason: 'Strategy seed not found' });
          continue;
        }

        // Create executor in live mode
        const parsed = parseCryptoSeed(seed);
        const config: ExecutorConfig = {
          mode: 'live',
          initialBankroll: await getLiveBankroll(userId, adapter),
          minConfidenceToEnter: 50,
          maxOpenPositions: 5,
          slippagePct: 0.5,
          area: MarketArea.CRYPTO,
          userId,
        };

        const executor = new StrategyExecutor(parsed, config);

        // Fetch market snapshots
        const snapshots = await fetchLiveSnapshots(adapter, seed.pairs);

        // Evaluate markets (generates pending live trades)
        const batch = executor.evaluateMarkets(snapshots);

        // Execute pending live trades (with approval for large trades)
        const baseExecutionService = createExecutionService(adapter);
        const approvalExecutionService: LiveExecutionService = {
          async execute(trade) {
            const { executed, result } = await executeWithApproval(
              trade,
              config.initialBankroll,
              () => baseExecutionService.execute(trade),
              seed.name,
            );
            if (!executed || !result) {
              throw new Error('Trade rifiutato (approvazione negata o timeout)');
            }

            // Persist trade to live_trades before reconciliation runs
            await persistLiveTrade(trade, result, userId, strat.id as string);

            return result;
          },
        };

        const execResults = await executor.executePendingLiveTrades({
          userId,
          executionService: approvalExecutionService,
          getOrderStatus: (orderId, symbol) => adapter.getOrderStatus(orderId, symbol),
          reconcileAndUpdateFn: reconcileAndUpdate,
        });

        const executed = execResults.filter((r) => r.status === 'executed').length;
        const failed = execResults.filter((r) => r.status === 'failed').length;
        totalOrdersExecuted += executed;

        // Feed results to circuit breaker
        const dailyStats = await getDailyStats(userId, config.initialBankroll);

        for (const execResult of execResults) {
          if (execResult.status === 'executed' && execResult.reconciliation) {
            // Estimate PnL from slippage + fees on this execution
            const fees = execResult.reconciliation.fees ?? 0;
            const pnl = -fees; // Entry trade: PnL is negative by fees amount
            const tripped = await circuitBreakerLive.checkAndTrip(
              { pnl, pnlPct: config.initialBankroll > 0 ? (pnl / config.initialBankroll) * 100 : 0, bankroll: config.initialBankroll },
              dailyStats,
              { userId, adapter },
            );
            if (tripped) break;
          }

          if (execResult.status === 'failed') {
            const tripped = await circuitBreakerLive.recordError(
              execResult.reason ?? 'Unknown execution error',
              { userId, adapter },
            );
            if (tripped) break;
          }
        }

        results.push({
          strategyCode,
          status: 'ok',
          signalsGenerated: batch.signals.length,
          ordersExecuted: executed,
          ordersFailed: failed,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[Cron/live-tick] Error on strategy ${strategyCode}:`, message);

        // Record error in circuit breaker
        await circuitBreakerLive.recordError(message, { userId });

        results.push({ strategyCode, status: 'error', reason: message });
      }
    }

    const summary = {
      strategiesEvaluated: results.length,
      ordersExecuted: totalOrdersExecuted,
      errors: results.filter((r) => r.status === 'error').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      circuitBreakerTripped: circuitBreakerLive.isTripped,
      durationMs: Date.now() - startTime,
    };

    console.log('[Cron/live-tick]', JSON.stringify(summary));

    return NextResponse.json({ ok: true, summary, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron/live-tick] FATAL:', message);

    try {
      const client = getTelegramClient();
      await client.sendMessage(
        ELIO_CHAT_ID,
        `\u26A0\uFE0F <b>Cron Live Tick Fallito</b>\n\n<code>${escapeHtml(message)}</code>\n\n<i>${new Date().toLocaleString('it-IT')}</i>`,
      );
    } catch {
      // Don't fail if Telegram is down
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    tickInProgress = false;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LiveTickStrategyResult {
  strategyCode: string;
  status: 'ok' | 'skipped' | 'error';
  reason?: string;
  signalsGenerated?: number;
  ordersExecuted?: number;
  ordersFailed?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCryptoSeed(seed: CryptoStrategySeed) {
  const row: RawStrategyRow = {
    id: seed.code,
    code: seed.code,
    name: seed.name,
    area: seed.area,
    max_drawdown: seed.max_drawdown,
    max_allocation_pct: seed.max_allocation_pct,
    max_consecutive_losses: seed.max_consecutive_losses,
    rules: seed.rules,
  };
  return parseStrategy(row);
}

async function fetchLiveSnapshots(
  adapter: CryptoAdapter,
  pairs: readonly string[],
): Promise<MarketSnapshot[]> {
  const snapshots: MarketSnapshot[] = [];

  for (const pair of pairs) {
    try {
      const ticker = await adapter.getTicker(pair);
      snapshots.push({
        marketId: `CRY:${ticker.symbol}`,
        name: pair,
        price: ticker.price,
        volume24hUsd: ticker.quoteVolume24h,
        totalVolumeUsd: ticker.quoteVolume24h * 10,
        expiryDate: null,
        hasCatalyst: false,
        catalystDescription: null,
        category: 'Crypto',
        status: 'open',
        priceChange24hPct: ticker.priceChangePercent24h,
        high24h: ticker.high24h,
        low24h: ticker.low24h,
      });
    } catch {
      // Skip pairs with errors
    }
  }

  return snapshots;
}

async function getLiveBankroll(userId: string, adapter: CryptoAdapter): Promise<number> {
  try {
    const balances = await adapter.getBalances();
    const usdt = balances.find((b) => b.asset === 'USDT');
    return usdt ? usdt.total : 0;
  } catch {
    return 0;
  }
}

async function getDailyStats(
  userId: string,
  bankroll: number,
): Promise<{ dailyPnl: number; dailyPnlPct: number; bankroll: number }> {
  try {
    const db = createUntypedAdminClient();
    const today = new Date().toISOString().split('T')[0];

    const { data } = await db
      .from('live_trades')
      .select('pnl')
      .eq('user_id', userId)
      .gte('executed_at', `${today}T00:00:00Z`);

    const dailyPnl = (data ?? []).reduce((sum: number, t: { pnl: number }) => sum + (t.pnl ?? 0), 0);

    return {
      dailyPnl,
      dailyPnlPct: bankroll > 0 ? (dailyPnl / bankroll) * 100 : 0,
      bankroll,
    };
  } catch {
    return { dailyPnl: 0, dailyPnlPct: 0, bankroll };
  }
}

function createExecutionService(adapter: CryptoAdapter): LiveExecutionService {
  return {
    async execute(trade) {
      const result = await adapter.placeTrade({
        symbol: trade.symbol,
        side: trade.direction === Direction.LONG ? 'buy' : 'sell',
        type: trade.orderType === OrderType.MARKET ? 'market' : 'limit',
        amount: trade.size,
        price: trade.orderType === OrderType.LIMIT ? (trade.metadata?.expectedPrice as number | undefined) : undefined,
      });

      const now = new Date().toISOString();
      return {
        id: crypto.randomUUID(),
        tradeId: trade.id,
        externalOrderId: result.orderId,
        status: result.status === 'rejected' ? 'rejected' : 'pending',
        filledSize: result.filledAmount ?? 0,
        executedAt: now,
        createdAt: now,
        updatedAt: now,
      };
    },
  };
}

async function persistLiveTrade(
  trade: { id: string; symbol: string; direction: Direction; size: number; metadata?: Record<string, unknown> },
  execution: { externalOrderId: string; executedAt?: string },
  userId: string,
  strategyId: string,
): Promise<void> {
  try {
    const db = createUntypedAdminClient();
    await db.from('live_trades').insert({
      id: trade.id,
      user_id: userId,
      strategy_id: strategyId,
      symbol: trade.symbol,
      direction: trade.direction,
      size: trade.size,
      entry_price: trade.metadata?.expectedPrice ?? null,
      broker_entry_order_id: execution.externalOrderId,
      status: 'open',
      executed_at: execution.executedAt,
    });
  } catch (err) {
    console.error(`[Cron/live-tick] Failed to persist trade ${trade.id}: ${err instanceof Error ? err.message : err}`);
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
