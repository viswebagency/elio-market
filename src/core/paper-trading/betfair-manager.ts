/**
 * Betfair Paper Trading Manager
 *
 * Manages N Betfair strategies running simultaneously in paper trading mode.
 * Key differences from Crypto/Stock:
 * - Tick every 5 minutes (markets can be 24/7 but events have specific times)
 * - MarketSnapshot uses price (back odds) and volume (matched amount in GBP)
 * - priceChange24hPct represents odds drift percentage
 * - Commission: 5% on net winnings (Betfair standard)
 * - Persistence in Supabase (betfair_paper_sessions table)
 */

import { StrategyExecutor, ExecutorConfig } from '../engine/executor';
import { ParsedStrategy, parseStrategy, RawStrategyRow } from '../engine/dsl-parser';
import { MarketSnapshot } from '../engine/evaluator';
import { MarketArea } from '../types/common';
import { SignalType } from '../engine/signals';
import { BetfairStrategySeed, BETFAIR_STRATEGY_MAP } from '../strategies/betfair-strategies';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';

// ============================================================================
// L1-passing strategies — auto-started by cron if no active sessions
// ============================================================================

export const BETFAIR_L1_STRATEGY_CODES = [
  'BF-C01',  // L1 PASS — Back on odds dip, ROI +2.09%
  'BF-M01',  // L1 PASS — Odds Drift Back
] as const;

export const BETFAIR_L1_DEFAULT_CAPITAL = 100;

// ============================================================================
// Auto-rotation constants
// ============================================================================

export const BETFAIR_COOLDOWN_HOURS = 12;
export const BETFAIR_MAX_AUTO_ROTATIONS = 3;

// ============================================================================
// Types
// ============================================================================

export interface BetfairPaperSession {
  sessionId: string;
  strategy: ParsedStrategy;
  strategySeed: BetfairStrategySeed;
  executor: StrategyExecutor;
  eventTypes: string[];
  initialCapital: number;
  totalTicks: number;
  lastTickAt: string | null;
  status: 'running' | 'paused' | 'stopped';
  startedAt: string;
}

export interface BetfairTickResult {
  sessionId: string;
  strategyCode: string;
  marketsEvaluated: number;
  signalsGenerated: number;
  positionsOpened: number;
  positionsClosed: number;
  circuitBroken: boolean;
  portfolioValue: number;
  totalPnlPct: number;
  errors: string[];
}

export interface BetfairSessionOverview {
  sessionId: string;
  strategyCode: string;
  strategyName: string;
  status: string;
  initialCapital: number;
  currentCapital: number;
  totalPnl: number;
  totalPnlPct: number;
  maxDrawdownPct: number;
  totalTicks: number;
  openPositions: number;
  eventTypes: string[];
  startedAt: string;
  lastTickAt: string | null;
  isCircuitBroken: boolean;
}

export interface BetfairPaperOverview {
  totalSessions: number;
  activeSessions: number;
  stoppedSessions: number;
  totalCapital: number;
  totalPnl: number;
  totalPnlPct: number;
  sessions: BetfairSessionOverview[];
}

// ============================================================================
// Manager
// ============================================================================

export class BetfairPaperTradingManager {
  private sessions: Map<string, BetfairPaperSession> = new Map();

  async autoStartL1Sessions(initialCapital = BETFAIR_L1_DEFAULT_CAPITAL): Promise<string[]> {
    await this.loadActiveSessions();

    const activeStrategyCodes = new Set(
      [...this.sessions.values()]
        .filter((s) => s.status === 'running')
        .map((s) => s.strategySeed.code),
    );

    const started: string[] = [];

    for (const code of BETFAIR_L1_STRATEGY_CODES) {
      if (activeStrategyCodes.has(code)) continue;
      const seed = BETFAIR_STRATEGY_MAP[code];
      if (!seed) continue;
      const session = await this.startSession(seed, initialCapital);
      started.push(session.sessionId);
    }

    return started;
  }

  async startSession(seed: BetfairStrategySeed, initialCapital = 1000): Promise<BetfairPaperSession> {
    const strategy = parseBetfairSeed(seed);

    const config: ExecutorConfig = {
      mode: 'paper',
      initialBankroll: initialCapital,
      minConfidenceToEnter: 50,
      maxOpenPositions: 5,
      slippagePct: 0.2,
      area: MarketArea.EXCHANGE_BETTING,
    };

    const executor = new StrategyExecutor(strategy, config);

    const db = createUntypedAdminClient();
    const { data: row, error } = await db
      .from('betfair_paper_sessions')
      .insert({
        strategy_code: seed.code,
        strategy_name: seed.name,
        initial_capital: initialCapital,
        current_capital: initialCapital,
        peak_capital: initialCapital,
        status: 'running',
        event_types: seed.event_types,
      })
      .select('id, started_at')
      .single();

    if (error || !row) {
      throw new Error(`Errore creazione sessione betfair: ${error?.message ?? 'sconosciuto'}`);
    }

    const session: BetfairPaperSession = {
      sessionId: row.id,
      strategy,
      strategySeed: seed,
      executor,
      eventTypes: [...seed.event_types],
      initialCapital,
      totalTicks: 0,
      lastTickAt: null,
      status: 'running',
      startedAt: row.started_at,
    };

    this.sessions.set(session.sessionId, session);
    return session;
  }

  async stopSession(sessionId: string): Promise<void> {
    const db = createUntypedAdminClient();
    await db
      .from('betfair_paper_sessions')
      .update({ status: 'stopped', stopped_at: new Date().toISOString() })
      .eq('id', sessionId);

    const session = this.sessions.get(sessionId);
    if (session) session.status = 'stopped';
    this.sessions.delete(sessionId);
  }

  tickWithSnapshots(snapshots: MarketSnapshot[]): BetfairTickResult[] {
    const results: BetfairTickResult[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (session.status !== 'running') continue;
      const result = this.tickSessionSync(sessionId, session, snapshots);
      results.push(result);
    }

    return results;
  }

  getActiveSessions(): BetfairPaperSession[] {
    return [...this.sessions.values()].filter((s) => s.status === 'running');
  }

  getSession(sessionId: string): BetfairPaperSession | undefined {
    return this.sessions.get(sessionId);
  }

  getOverview(): BetfairPaperOverview {
    const sessions = [...this.sessions.values()];
    let totalCapital = 0;
    let totalPnl = 0;

    const sessionSummaries: BetfairSessionOverview[] = sessions.map((s) => {
      const snapshot = s.executor.getPortfolioSnapshot();
      totalCapital += snapshot.totalBankroll;
      totalPnl += snapshot.totalPnl;

      return {
        sessionId: s.sessionId,
        strategyCode: s.strategySeed.code,
        strategyName: s.strategySeed.name,
        status: s.status,
        initialCapital: s.initialCapital,
        currentCapital: snapshot.totalBankroll,
        totalPnl: snapshot.totalPnl,
        totalPnlPct: snapshot.totalPnlPct,
        maxDrawdownPct: snapshot.currentDrawdownPct,
        totalTicks: s.totalTicks,
        openPositions: snapshot.openPositions.length,
        eventTypes: s.eventTypes,
        startedAt: s.startedAt,
        lastTickAt: s.lastTickAt,
        isCircuitBroken: snapshot.isCircuitBroken,
      };
    });

    const initialTotal = sessions.reduce((sum, s) => sum + s.initialCapital, 0);

    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter((s) => s.status === 'running').length,
      stoppedSessions: sessions.filter((s) => s.status === 'stopped').length,
      totalCapital,
      totalPnl,
      totalPnlPct: initialTotal > 0 ? (totalPnl / initialTotal) * 100 : 0,
      sessions: sessionSummaries,
    };
  }

  async getOverviewFromDb(): Promise<BetfairPaperOverview> {
    const db = createUntypedAdminClient();

    const { data: rows, error } = await db
      .from('betfair_paper_sessions')
      .select('id, strategy_code, strategy_name, initial_capital, current_capital, total_pnl, total_pnl_pct, max_drawdown_pct, total_ticks, event_types, started_at, last_tick_at, status, is_circuit_broken, stopped_at')
      .order('started_at', { ascending: false });

    if (error || !rows) {
      return {
        totalSessions: 0, activeSessions: 0, stoppedSessions: 0,
        totalCapital: 0, totalPnl: 0, totalPnlPct: 0, sessions: [],
      };
    }

    let totalCapital = 0;
    let totalPnl = 0;
    let initialTotal = 0;

    const sessions: BetfairSessionOverview[] = rows.map((r: Record<string, unknown>) => {
      const currentCapital = Number(r.current_capital) || 0;
      const pnl = Number(r.total_pnl) || 0;
      const initial = Number(r.initial_capital) || 0;

      if (r.status === 'running') {
        totalCapital += currentCapital;
        totalPnl += pnl;
        initialTotal += initial;
      }

      return {
        sessionId: r.id as string,
        strategyCode: r.strategy_code as string,
        strategyName: r.strategy_name as string,
        status: r.status as string,
        initialCapital: initial,
        currentCapital,
        totalPnl: pnl,
        totalPnlPct: Number(r.total_pnl_pct) || 0,
        maxDrawdownPct: Number(r.max_drawdown_pct) || 0,
        totalTicks: Number(r.total_ticks) || 0,
        openPositions: 0,
        eventTypes: (r.event_types as string[]) || [],
        startedAt: r.started_at as string,
        lastTickAt: (r.last_tick_at as string) || null,
        isCircuitBroken: (r.is_circuit_broken as boolean) || false,
      };
    });

    return {
      totalSessions: rows.length,
      activeSessions: rows.filter((r: Record<string, unknown>) => r.status === 'running').length,
      stoppedSessions: rows.filter((r: Record<string, unknown>) => r.status === 'stopped').length,
      totalCapital,
      totalPnl,
      totalPnlPct: initialTotal > 0 ? (totalPnl / initialTotal) * 100 : 0,
      sessions,
    };
  }

  async startRotatedSession(
    oldSessionId: string,
    strategyCode: string,
    currentRotationCount: number,
    initialCapital = BETFAIR_L1_DEFAULT_CAPITAL,
  ): Promise<string> {
    const db = createUntypedAdminClient();

    await db
      .from('betfair_paper_sessions')
      .update({ status: 'stopped', stopped_at: new Date().toISOString() })
      .eq('id', oldSessionId);

    this.sessions.delete(oldSessionId);

    const seed = BETFAIR_STRATEGY_MAP[strategyCode];
    if (!seed) throw new Error(`Strategy ${strategyCode} not found`);

    const strategy = parseBetfairSeed(seed);
    const config: ExecutorConfig = {
      mode: 'paper',
      initialBankroll: initialCapital,
      minConfidenceToEnter: 50,
      maxOpenPositions: 5,
      slippagePct: 0.2,
      area: MarketArea.EXCHANGE_BETTING,
    };

    const executor = new StrategyExecutor(strategy, config);

    const { data: row, error } = await db
      .from('betfair_paper_sessions')
      .insert({
        strategy_code: seed.code,
        strategy_name: seed.name,
        initial_capital: initialCapital,
        current_capital: initialCapital,
        peak_capital: initialCapital,
        status: 'running',
        event_types: seed.event_types,
        auto_rotation_count: currentRotationCount + 1,
        parent_session_id: oldSessionId,
      })
      .select('id, started_at')
      .single();

    if (error || !row) {
      throw new Error(`Errore creazione sessione ruotata: ${error?.message ?? 'sconosciuto'}`);
    }

    const session: BetfairPaperSession = {
      sessionId: row.id,
      strategy,
      strategySeed: seed,
      executor,
      eventTypes: [...seed.event_types],
      initialCapital,
      totalTicks: 0,
      lastTickAt: null,
      status: 'running',
      startedAt: row.started_at,
    };

    this.sessions.set(session.sessionId, session);
    return session.sessionId;
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private tickSessionSync(
    sessionId: string,
    session: BetfairPaperSession,
    snapshots: MarketSnapshot[],
  ): BetfairTickResult {
    const result: BetfairTickResult = {
      sessionId,
      strategyCode: session.strategySeed.code,
      marketsEvaluated: snapshots.length,
      signalsGenerated: 0,
      positionsOpened: 0,
      positionsClosed: 0,
      circuitBroken: false,
      portfolioValue: 0,
      totalPnlPct: 0,
      errors: [],
    };

    try {
      const batch = session.executor.evaluateMarkets(snapshots);
      result.signalsGenerated = batch.signals.length;

      for (const signal of batch.signals) {
        if (signal.type === SignalType.ENTER_LONG) result.positionsOpened++;
        if (signal.type === SignalType.EXIT_FULL || signal.type === SignalType.STOP_LOSS) result.positionsClosed++;
      }

      if (session.executor.isCircuitBroken()) {
        result.circuitBroken = true;
        session.status = 'paused';
      }

      session.totalTicks++;
      session.lastTickAt = new Date().toISOString();

      const snapshot = session.executor.getPortfolioSnapshot();
      result.portfolioValue = snapshot.totalBankroll;
      result.totalPnlPct = snapshot.totalPnlPct;
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }

    return result;
  }

  async loadActiveSessions(): Promise<number> {
    const db = createUntypedAdminClient();

    const { data: rows, error } = await db
      .from('betfair_paper_sessions')
      .select('id, strategy_code, strategy_name, event_types, initial_capital, total_ticks, last_tick_at, started_at, status')
      .eq('status', 'running');

    if (error) {
      console.error('[BetfairManager] loadActiveSessions DB error:', error.message);
      return 0;
    }

    if (!rows || rows.length === 0) return 0;

    let loaded = 0;
    for (const row of rows) {
      try {
        if (this.sessions.has(row.id)) continue;

        const seed = BETFAIR_STRATEGY_MAP[row.strategy_code];
        if (!seed) continue;

        const strategy = parseBetfairSeed(seed);
        const config: ExecutorConfig = {
          mode: 'paper',
          initialBankroll: Number(row.initial_capital),
          minConfidenceToEnter: 50,
          maxOpenPositions: 5,
          slippagePct: 0.2,
          area: MarketArea.EXCHANGE_BETTING,
        };

        const executor = new StrategyExecutor(strategy, config);

        this.sessions.set(row.id, {
          sessionId: row.id,
          strategy,
          strategySeed: seed,
          executor,
          eventTypes: row.event_types || [...seed.event_types],
          initialCapital: Number(row.initial_capital),
          totalTicks: row.total_ticks || 0,
          lastTickAt: row.last_tick_at || null,
          status: 'running',
          startedAt: row.started_at,
        });
        loaded++;
      } catch (err) {
        console.error(`[BetfairManager] Error loading session ${row.strategy_code}:`, err instanceof Error ? err.message : err);
      }
    }

    return loaded;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function parseBetfairSeed(seed: BetfairStrategySeed): ParsedStrategy {
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

// ============================================================================
// Singleton
// ============================================================================

let betfairManagerInstance: BetfairPaperTradingManager | null = null;

export function getBetfairPaperTradingManager(): BetfairPaperTradingManager {
  if (!betfairManagerInstance) {
    betfairManagerInstance = new BetfairPaperTradingManager();
  }
  return betfairManagerInstance;
}
