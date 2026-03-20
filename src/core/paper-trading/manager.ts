/**
 * Paper Trading Manager
 *
 * Manages N strategies running simultaneously in paper trading mode.
 * Each strategy has its own VirtualPortfolio, executor, and persistent state.
 */

import { StrategyExecutor, ExecutorConfig } from '../engine/executor';
import { ParsedStrategy, parseStrategy, RawStrategyRow } from '../engine/dsl-parser';
import { MarketSnapshot } from '../engine/evaluator';
import { SignalType, TierLevel } from '../engine/signals';
import { PortfolioSnapshot, OperationLog } from '../engine/portfolio';
import { getPolymarketClient, ParsedMarket } from '@/lib/polymarket-client';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';
import {
  PaperSession,
  PaperSessionStatus,
  PaperPosition,
  PaperTrade,
  PaperSessionMetrics,
  PaperTradingOverview,
  serializePosition,
  serializeTrade,
  deserializePosition,
  deserializeTrade,
} from './state';

// ============================================================================
// Types
// ============================================================================

interface ActiveSession {
  sessionId: string;
  userId: string;
  strategy: ParsedStrategy;
  executor: StrategyExecutor;
  config: ExecutorConfig;
  status: PaperSessionStatus;
  initialCapital: number;
  totalTicks: number;
  lastTickAt: string | null;
  startedAt: string;
}

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

// ============================================================================
// Manager
// ============================================================================

export class PaperTradingManager {
  private sessions: Map<string, ActiveSession> = new Map();

  /**
   * Start paper trading for a strategy.
   */
  async start(userId: string, strategyId: string, initialCapital: number): Promise<PaperSession> {
    const db = createUntypedAdminClient();

    // Check for existing running session
    const { data: existing } = await db
      .from('paper_sessions')
      .select('id')
      .eq('strategy_id', strategyId)
      .eq('user_id', userId)
      .eq('status', 'running')
      .maybeSingle();

    if (existing) {
      throw new Error(`Strategia ${strategyId} ha gia una sessione attiva`);
    }

    // Load strategy from DB
    const { data: strategyRow, error: stratError } = await db
      .from('strategies')
      .select('id, code, name, area, rules, max_drawdown, max_allocation_pct, max_consecutive_losses')
      .eq('id', strategyId)
      .eq('user_id', userId)
      .single();

    if (stratError || !strategyRow) {
      throw new Error(`Strategia ${strategyId} non trovata: ${stratError?.message ?? 'non esistente'}`);
    }

    const parsed = parseStrategy(strategyRow as unknown as RawStrategyRow);

    // Create executor in paper mode
    const config: ExecutorConfig = {
      mode: 'paper',
      initialBankroll: initialCapital,
      minConfidenceToEnter: 50,
      maxOpenPositions: 10,
      slippagePct: 1.5,
    };

    const executor = new StrategyExecutor(parsed, config);

    // Create DB session
    const { data: session, error: insertErr } = await db
      .from('paper_sessions')
      .insert({
        user_id: userId,
        strategy_id: strategyId,
        initial_capital: initialCapital,
        current_capital: initialCapital,
        peak_capital: initialCapital,
        status: 'running',
        portfolio_state: {},
      })
      .select()
      .single();

    if (insertErr || !session) {
      throw new Error(`Errore creazione sessione: ${insertErr?.message ?? 'sconosciuto'}`);
    }

    const activeSession: ActiveSession = {
      sessionId: session.id,
      userId,
      strategy: parsed,
      executor,
      config,
      status: 'running',
      initialCapital,
      totalTicks: 0,
      lastTickAt: null,
      startedAt: session.started_at,
    };

    this.sessions.set(session.id, activeSession);

    return this.buildSessionResponse(session.id, parsed, executor, activeSession, [], []);
  }

  /**
   * Stop a paper trading session.
   */
  async stop(sessionId: string): Promise<void> {
    const db = createUntypedAdminClient();

    await db
      .from('paper_sessions')
      .update({
        status: 'stopped',
        stopped_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    // Update open positions to closed
    await db
      .from('paper_positions')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId)
      .eq('status', 'open');

    this.sessions.delete(sessionId);
  }

  /**
   * Execute a tick for all running sessions.
   * Fetches markets, evaluates signals, opens/closes positions.
   */
  async tick(): Promise<TickResult[]> {
    const results: TickResult[] = [];

    // Load running sessions from DB if not in memory
    await this.loadActiveSessions();

    // Fetch markets once for all sessions
    const markets = await this.fetchMarketSnapshots();

    for (const [sessionId, session] of this.sessions) {
      if (session.status !== 'running') continue;

      const result = await this.tickSession(sessionId, session, markets);
      results.push(result);
    }

    return results;
  }

  /**
   * Get status of all sessions for a user (or all if no userId).
   */
  async getStatus(userId?: string): Promise<PaperTradingOverview> {
    const db = createUntypedAdminClient();

    let query = db
      .from('paper_sessions')
      .select('*')
      .in('status', ['running', 'paused']);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: sessionRows } = await query;

    if (!sessionRows || sessionRows.length === 0) {
      return {
        totalCapital: 0,
        totalPnl: 0,
        totalPnlToday: 0,
        activeSessions: 0,
        pausedSessions: 0,
        totalOpenPositions: 0,
        sessions: [],
      };
    }

    const sessions: PaperSession[] = [];
    let totalCapital = 0;
    let totalPnl = 0;
    let totalOpenPositions = 0;
    let activeSessions = 0;
    let pausedSessions = 0;

    for (const row of sessionRows) {
      // Load strategy info
      const { data: strat } = await db
        .from('strategies')
        .select('name, code')
        .eq('id', row.strategy_id)
        .single();

      // Load open positions
      const { data: posRows } = await db
        .from('paper_positions')
        .select('*')
        .eq('session_id', row.id)
        .eq('status', 'open');

      // Load recent trades
      const { data: tradeRows } = await db
        .from('paper_trades')
        .select('*')
        .eq('session_id', row.id)
        .order('executed_at', { ascending: false })
        .limit(20);

      const openPositions = (posRows ?? []).map(deserializePosition);
      const recentTrades = (tradeRows ?? []).map(deserializeTrade);

      const metrics: PaperSessionMetrics = {
        initialCapital: row.initial_capital,
        currentCapital: row.current_capital,
        peakCapital: row.peak_capital,
        realizedPnl: row.realized_pnl,
        unrealizedPnl: row.unrealized_pnl,
        totalPnl: row.total_pnl,
        totalPnlPct: row.total_pnl_pct,
        maxDrawdownPct: row.max_drawdown_pct,
        totalTicks: row.total_ticks,
        lastTickAt: row.last_tick_at,
      };

      const session: PaperSession = {
        id: row.id,
        userId: row.user_id,
        strategyId: row.strategy_id,
        strategyName: strat?.name ?? 'Sconosciuta',
        strategyCode: strat?.code ?? '???',
        status: row.status as PaperSessionStatus,
        pauseReason: row.pause_reason,
        metrics,
        isCircuitBroken: row.is_circuit_broken,
        circuitBrokenReason: row.circuit_broken_reason,
        circuitBrokenAt: row.circuit_broken_at,
        openPositions,
        recentTrades,
        startedAt: row.started_at,
        stoppedAt: row.stopped_at,
      };

      sessions.push(session);
      totalCapital += row.current_capital;
      totalPnl += row.total_pnl;
      totalOpenPositions += openPositions.length;

      if (row.status === 'running') activeSessions++;
      if (row.status === 'paused') pausedSessions++;
    }

    return {
      totalCapital,
      totalPnl,
      totalPnlToday: 0, // Calcolato da trade di oggi
      activeSessions,
      pausedSessions,
      totalOpenPositions,
      sessions,
    };
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private async tickSession(
    sessionId: string,
    session: ActiveSession,
    markets: MarketSnapshot[],
  ): Promise<TickResult> {
    const result: TickResult = {
      sessionId,
      strategyId: session.strategy.strategyId,
      strategyCode: session.strategy.code,
      marketsEvaluated: markets.length,
      signalsGenerated: 0,
      positionsOpened: 0,
      positionsClosed: 0,
      circuitBroken: false,
      errors: [],
    };

    try {
      // Run executor
      const batch = session.executor.evaluateMarkets(markets);
      result.signalsGenerated = batch.signals.length;

      const snapshot = session.executor.getPortfolioSnapshot();
      const db = createUntypedAdminClient();

      // Process signals -> persist new positions and trades
      for (const signal of batch.signals) {
        if (signal.type === SignalType.ENTER_LONG) {
          // The executor already opened the position in paper mode
          // We need to log it to DB
          const pos = snapshot.openPositions.find(
            (p) => p.marketId === signal.marketId,
          );

          if (pos) {
            result.positionsOpened++;

            const paperPos: PaperPosition = {
              id: pos.id,
              sessionId,
              strategyId: session.strategy.strategyId,
              marketId: pos.marketId,
              marketName: pos.marketName,
              tier: pos.tier,
              entryPrice: pos.entryPrice,
              currentPrice: pos.currentPrice,
              quantity: pos.quantity,
              remainingQuantity: pos.remainingQuantity,
              stake: pos.stake,
              unrealizedPnl: pos.unrealizedPnl,
              unrealizedPnlPct: pos.unrealizedPnlPct,
              entryReason: signal.reason,
              signalConfidence: signal.confidence,
              status: 'open',
              openedAt: new Date().toISOString(),
              closedAt: null,
            };

            await db.from('paper_positions').upsert(serializePosition(paperPos));

            const trade: PaperTrade = {
              id: `trade_${Date.now()}_${pos.id}`,
              sessionId,
              positionId: pos.id,
              strategyId: session.strategy.strategyId,
              marketId: pos.marketId,
              marketName: pos.marketName,
              action: 'open',
              tier: pos.tier,
              price: pos.entryPrice,
              quantity: pos.quantity,
              stake: pos.stake,
              grossPnl: 0,
              netPnl: 0,
              returnPct: 0,
              reason: signal.reason,
              signalConfidence: signal.confidence,
              executedAt: new Date().toISOString(),
            };

            await db.from('paper_trades').insert(serializeTrade(trade));
          }
        }

        if (
          signal.type === SignalType.EXIT_FULL ||
          signal.type === SignalType.EXIT_PARTIAL ||
          signal.type === SignalType.STOP_LOSS
        ) {
          result.positionsClosed++;

          // Find the closed position in the snapshot's closedPositions
          const closed = snapshot.closedPositions.find(
            (c) => c.marketId === signal.marketId,
          );

          if (closed) {
            // Mark position as closed in DB
            await db
              .from('paper_positions')
              .update({
                status: 'closed',
                closed_at: new Date().toISOString(),
                current_price: closed.exitPrice,
              })
              .eq('session_id', sessionId)
              .eq('market_id', signal.marketId)
              .eq('status', 'open');

            const trade: PaperTrade = {
              id: `trade_${Date.now()}_exit_${closed.id}`,
              sessionId,
              positionId: closed.id,
              strategyId: session.strategy.strategyId,
              marketId: closed.marketId,
              marketName: closed.marketName,
              action: signal.type === SignalType.EXIT_PARTIAL ? 'partial_close' : 'full_close',
              tier: closed.tier,
              price: closed.exitPrice,
              quantity: closed.quantity,
              stake: closed.stake,
              grossPnl: closed.grossPnl,
              netPnl: closed.netPnl,
              returnPct: closed.returnPct,
              reason: signal.reason,
              signalConfidence: signal.confidence,
              executedAt: new Date().toISOString(),
            };

            await db.from('paper_trades').insert(serializeTrade(trade));
          }
        }
      }

      // Update open positions prices in DB
      for (const pos of snapshot.openPositions) {
        await db
          .from('paper_positions')
          .update({
            current_price: pos.currentPrice,
            unrealized_pnl: pos.unrealizedPnl,
            unrealized_pnl_pct: pos.unrealizedPnlPct,
            remaining_quantity: pos.remainingQuantity,
          })
          .eq('session_id', sessionId)
          .eq('market_id', pos.marketId)
          .eq('status', 'open');
      }

      // Check circuit breaker
      if (session.executor.isCircuitBroken()) {
        result.circuitBroken = true;
        session.status = 'paused';

        const cbCheck = snapshot.circuitBrokenReason;

        await db
          .from('paper_sessions')
          .update({
            status: 'paused',
            pause_reason: `Circuit breaker: ${cbCheck ?? 'limite raggiunto'}`,
            is_circuit_broken: true,
            circuit_broken_reason: cbCheck,
            circuit_broken_at: new Date().toISOString(),
          })
          .eq('id', sessionId);
      }

      // Update session metrics
      session.totalTicks++;
      session.lastTickAt = new Date().toISOString();

      await db
        .from('paper_sessions')
        .update({
          current_capital: snapshot.totalBankroll,
          peak_capital: snapshot.peakBankroll,
          realized_pnl: snapshot.realizedPnl,
          unrealized_pnl: snapshot.unrealizedPnl,
          total_pnl: snapshot.totalPnl,
          total_pnl_pct: snapshot.totalPnlPct,
          max_drawdown_pct: snapshot.currentDrawdownPct,
          total_ticks: session.totalTicks,
          last_tick_at: session.lastTickAt,
          portfolio_state: {
            availableCash: snapshot.availableCash,
            tierBankrolls: snapshot.tierBankrolls,
            consecutiveLosses: snapshot.consecutiveLosses,
          },
        })
        .eq('id', sessionId);
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }

    return result;
  }

  private async loadActiveSessions(): Promise<void> {
    const db = createUntypedAdminClient();

    const { data: rows } = await db
      .from('paper_sessions')
      .select('*')
      .eq('status', 'running');

    if (!rows) return;

    for (const row of rows) {
      if (this.sessions.has(row.id)) continue;

      // Load strategy
      const { data: stratRow } = await db
        .from('strategies')
        .select('id, code, name, area, rules, max_drawdown, max_allocation_pct, max_consecutive_losses')
        .eq('id', row.strategy_id)
        .single();

      if (!stratRow) continue;

      const parsed = parseStrategy(stratRow as unknown as RawStrategyRow);

      const config: ExecutorConfig = {
        mode: 'paper',
        initialBankroll: row.initial_capital,
        minConfidenceToEnter: 50,
        maxOpenPositions: 10,
        slippagePct: 1.5,
      };

      const executor = new StrategyExecutor(parsed, config);

      this.sessions.set(row.id, {
        sessionId: row.id,
        userId: row.user_id,
        strategy: parsed,
        executor,
        config,
        status: 'running',
        initialCapital: row.initial_capital,
        totalTicks: row.total_ticks,
        lastTickAt: row.last_tick_at,
        startedAt: row.started_at,
      });
    }
  }

  private async fetchMarketSnapshots(): Promise<MarketSnapshot[]> {
    const client = getPolymarketClient();

    const markets = await client.getMarkets({
      limit: 100,
      active: true,
      closed: false,
      sortBy: 'volume24hr',
      ascending: false,
    });

    return markets.map(polymarketToSnapshot);
  }

  private buildSessionResponse(
    sessionId: string,
    strategy: ParsedStrategy,
    executor: StrategyExecutor,
    session: ActiveSession,
    positions: PaperPosition[],
    trades: PaperTrade[],
  ): PaperSession {
    const snapshot = executor.getPortfolioSnapshot();

    return {
      id: sessionId,
      userId: session.userId,
      strategyId: strategy.strategyId,
      strategyName: strategy.name,
      strategyCode: strategy.code,
      status: session.status,
      pauseReason: null,
      metrics: {
        initialCapital: session.initialCapital,
        currentCapital: snapshot.totalBankroll,
        peakCapital: snapshot.peakBankroll,
        realizedPnl: snapshot.realizedPnl,
        unrealizedPnl: snapshot.unrealizedPnl,
        totalPnl: snapshot.totalPnl,
        totalPnlPct: snapshot.totalPnlPct,
        maxDrawdownPct: snapshot.currentDrawdownPct,
        totalTicks: session.totalTicks,
        lastTickAt: session.lastTickAt,
      },
      isCircuitBroken: snapshot.isCircuitBroken,
      circuitBrokenReason: snapshot.circuitBrokenReason,
      circuitBrokenAt: null,
      openPositions: positions,
      recentTrades: trades,
      startedAt: session.startedAt,
      stoppedAt: null,
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

function polymarketToSnapshot(market: ParsedMarket): MarketSnapshot {
  const yesPrice = market.outcomePrices[0] ?? 0.5;

  return {
    marketId: market.id,
    name: market.question,
    price: yesPrice,
    volume24hUsd: market.volume24hr,
    totalVolumeUsd: market.volume,
    expiryDate: market.endDate,
    hasCatalyst: false,
    catalystDescription: null,
    category: market.category,
    status: market.active && !market.closed ? 'open' : 'closed',
  };
}

// ============================================================================
// Singleton
// ============================================================================

let managerInstance: PaperTradingManager | null = null;

export function getPaperTradingManager(): PaperTradingManager {
  if (!managerInstance) {
    managerInstance = new PaperTradingManager();
  }
  return managerInstance;
}
