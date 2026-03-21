/**
 * Crypto Paper Trading Manager
 *
 * Manages N crypto strategies running simultaneously in paper trading mode.
 * Key differences from Polymarket paper trading:
 * - Tick every 1-2 minutes (vs 5 min for Polymarket)
 * - MarketSnapshot includes priceChange24hPct, high24h, low24h
 * - Sizing based on volatility profile
 * - Supports multiple pairs per strategy (BTC/USDT, ETH/USDT, etc.)
 * - Persistence in Supabase (crypto_paper_sessions table)
 * - Auto-start for L1-passing strategies
 */

import { StrategyExecutor, ExecutorConfig } from '../engine/executor';
import { ParsedStrategy, parseStrategy, RawStrategyRow } from '../engine/dsl-parser';
import { MarketSnapshot } from '../engine/evaluator';
import { MarketArea } from '../types/common';
import { SignalType } from '../engine/signals';
import { CryptoAdapter, SupportedExchange } from '@/plugins/crypto/adapter';
import { CryptoStrategySeed, CRYPTO_STRATEGY_MAP } from '../strategies/crypto-strategies';
import { CRYPTO_TOP_PAIRS } from '@/plugins/crypto/constants';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';

// ============================================================================
// L1-passing strategies — auto-started by cron if no active sessions
// ============================================================================

export const CRYPTO_L1_STRATEGY_CODES = [
  'CR-C01',
  'CR-C02b',
  'CR-M01b',
  'CR-M02b',
  'CR-M03b',
  // V3 — Real-data optimized (pass L1 on both synthetic + real)
  'CR-C01c',
  'CR-M02c',
] as const;

export const CRYPTO_L1_DEFAULT_CAPITAL = 100;

// ============================================================================
// Auto-rotation constants
// ============================================================================

/** Cooldown period after circuit breaker for crypto sessions (6 hours) */
export const CRYPTO_COOLDOWN_HOURS = 6;

/** Maximum automatic rotations before permanent stop */
export const MAX_AUTO_ROTATIONS = 3;

// ============================================================================
// Types
// ============================================================================

export interface CryptoPaperSession {
  sessionId: string;
  strategy: ParsedStrategy;
  strategySeed: CryptoStrategySeed;
  executor: StrategyExecutor;
  pairs: string[];
  initialCapital: number;
  totalTicks: number;
  lastTickAt: string | null;
  status: 'running' | 'paused' | 'stopped';
  startedAt: string;
}

export interface CryptoTickResult {
  sessionId: string;
  strategyCode: string;
  pairsEvaluated: number;
  signalsGenerated: number;
  positionsOpened: number;
  positionsClosed: number;
  circuitBroken: boolean;
  portfolioValue: number;
  totalPnlPct: number;
  errors: string[];
}

export interface CryptoSessionOverview {
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
  pairs: string[];
  startedAt: string;
  lastTickAt: string | null;
  isCircuitBroken: boolean;
}

export interface CryptoPaperOverview {
  totalSessions: number;
  activeSessions: number;
  stoppedSessions: number;
  totalCapital: number;
  totalPnl: number;
  totalPnlPct: number;
  sessions: CryptoSessionOverview[];
}

// ============================================================================
// Manager
// ============================================================================

export class CryptoPaperTradingManager {
  private sessions: Map<string, CryptoPaperSession> = new Map();
  private adapter: CryptoAdapter | null = null;

  /** Initialize adapter for market data */
  async initializeAdapter(exchange: SupportedExchange = 'binance'): Promise<void> {
    if (!this.adapter) {
      this.adapter = new CryptoAdapter({ exchange });
      await this.adapter.loadMarkets();
    }
  }

  /**
   * Auto-start sessions for all L1-passing strategies.
   * Only starts if no running sessions exist for that strategy.
   * Returns the list of newly started session IDs.
   */
  async autoStartL1Sessions(initialCapital = CRYPTO_L1_DEFAULT_CAPITAL): Promise<string[]> {
    await this.loadActiveSessions();

    const activeStrategyCodes = new Set(
      [...this.sessions.values()]
        .filter((s) => s.status === 'running')
        .map((s) => s.strategySeed.code),
    );

    const started: string[] = [];

    for (const code of CRYPTO_L1_STRATEGY_CODES) {
      if (activeStrategyCodes.has(code)) continue;

      const seed = CRYPTO_STRATEGY_MAP[code];
      if (!seed) continue;

      const session = await this.startSession(seed, initialCapital);
      started.push(session.sessionId);
    }

    return started;
  }

  /** Start a paper trading session for a crypto strategy */
  async startSession(seed: CryptoStrategySeed, initialCapital = 1000): Promise<CryptoPaperSession> {
    const strategy = parseCryptoSeed(seed);

    const config: ExecutorConfig = {
      mode: 'paper',
      initialBankroll: initialCapital,
      minConfidenceToEnter: 50,
      maxOpenPositions: 5,
      slippagePct: 0.5,
      area: MarketArea.CRYPTO,
    };

    const executor = new StrategyExecutor(strategy, config);

    // Persist to Supabase
    const db = createUntypedAdminClient();
    const { data: row, error } = await db
      .from('crypto_paper_sessions')
      .insert({
        strategy_code: seed.code,
        strategy_name: seed.name,
        initial_capital: initialCapital,
        current_capital: initialCapital,
        peak_capital: initialCapital,
        status: 'running',
        pairs: seed.pairs,
      })
      .select('id, started_at')
      .single();

    if (error || !row) {
      throw new Error(`Errore creazione sessione crypto: ${error?.message ?? 'sconosciuto'}`);
    }

    const session: CryptoPaperSession = {
      sessionId: row.id,
      strategy,
      strategySeed: seed,
      executor,
      pairs: [...seed.pairs],
      initialCapital,
      totalTicks: 0,
      lastTickAt: null,
      status: 'running',
      startedAt: row.started_at,
    };

    this.sessions.set(session.sessionId, session);
    return session;
  }

  /** Stop a session */
  async stopSession(sessionId: string): Promise<void> {
    const db = createUntypedAdminClient();

    await db
      .from('crypto_paper_sessions')
      .update({
        status: 'stopped',
        stopped_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'stopped';
    }
    this.sessions.delete(sessionId);
  }

  /** Execute a tick on all running sessions using live market data */
  async tick(): Promise<CryptoTickResult[]> {
    if (!this.adapter) {
      throw new Error('Adapter not initialized. Call initializeAdapter() first.');
    }

    // Reload sessions from DB (Vercel may have restarted)
    await this.loadActiveSessions();

    const snapshots = await this.fetchCryptoSnapshots();
    const results: CryptoTickResult[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (session.status !== 'running') continue;

      const result = await this.tickSession(sessionId, session, snapshots);
      results.push(result);
    }

    return results;
  }

  /** Execute a tick using provided snapshots (for testing/backtest) */
  tickWithSnapshots(snapshots: MarketSnapshot[]): CryptoTickResult[] {
    const results: CryptoTickResult[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (session.status !== 'running') continue;

      const filteredSnapshots = snapshots.filter((s) =>
        session.pairs.some((p) => s.marketId.includes(p.replace('/', '')))
      );

      const result = this.tickSessionSync(sessionId, session, filteredSnapshots);
      results.push(result);
    }

    return results;
  }

  /** Get all active sessions */
  getActiveSessions(): CryptoPaperSession[] {
    return [...this.sessions.values()].filter((s) => s.status === 'running');
  }

  /** Get session by ID */
  getSession(sessionId: string): CryptoPaperSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Get overview from in-memory sessions (for testing) */
  getOverview(): CryptoPaperOverview {
    const sessions = [...this.sessions.values()];
    let totalCapital = 0;
    let totalPnl = 0;

    const sessionSummaries: CryptoSessionOverview[] = sessions.map((s) => {
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
        pairs: s.pairs,
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

  /** Get overview from Supabase (for API — includes stopped sessions) */
  async getOverviewFromDb(): Promise<CryptoPaperOverview> {
    const db = createUntypedAdminClient();

    const { data: rows, error } = await db
      .from('crypto_paper_sessions')
      .select('*')
      .order('started_at', { ascending: false });

    if (error || !rows) {
      return {
        totalSessions: 0,
        activeSessions: 0,
        stoppedSessions: 0,
        totalCapital: 0,
        totalPnl: 0,
        totalPnlPct: 0,
        sessions: [],
      };
    }

    let totalCapital = 0;
    let totalPnl = 0;
    let initialTotal = 0;

    const sessions: CryptoSessionOverview[] = rows.map((r: Record<string, unknown>) => {
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
        openPositions: 0, // Would need separate query for live positions
        pairs: (r.pairs as string[]) || [],
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

  /**
   * Start a rotated session — closes the old one and creates a new one
   * with fresh capital, linking to the parent session.
   */
  async startRotatedSession(
    oldSessionId: string,
    strategyCode: string,
    currentRotationCount: number,
    initialCapital = CRYPTO_L1_DEFAULT_CAPITAL,
  ): Promise<string> {
    const db = createUntypedAdminClient();

    // Close old session
    await db
      .from('crypto_paper_sessions')
      .update({
        status: 'stopped',
        stopped_at: new Date().toISOString(),
      })
      .eq('id', oldSessionId);

    this.sessions.delete(oldSessionId);

    // Create new session
    const seed = CRYPTO_STRATEGY_MAP[strategyCode];
    if (!seed) throw new Error(`Strategy ${strategyCode} not found`);

    const strategy = parseCryptoSeed(seed);

    const config: ExecutorConfig = {
      mode: 'paper',
      initialBankroll: initialCapital,
      minConfidenceToEnter: 50,
      maxOpenPositions: 5,
      slippagePct: 0.5,
      area: MarketArea.CRYPTO,
    };

    const executor = new StrategyExecutor(strategy, config);

    const { data: row, error } = await db
      .from('crypto_paper_sessions')
      .insert({
        strategy_code: seed.code,
        strategy_name: seed.name,
        initial_capital: initialCapital,
        current_capital: initialCapital,
        peak_capital: initialCapital,
        status: 'running',
        pairs: seed.pairs,
        auto_rotation_count: currentRotationCount + 1,
        parent_session_id: oldSessionId,
      })
      .select('id, started_at')
      .single();

    if (error || !row) {
      throw new Error(`Errore creazione sessione ruotata: ${error?.message ?? 'sconosciuto'}`);
    }

    const session: CryptoPaperSession = {
      sessionId: row.id,
      strategy,
      strategySeed: seed,
      executor,
      pairs: [...seed.pairs],
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

  /** Tick with DB persistence */
  private async tickSession(
    sessionId: string,
    session: CryptoPaperSession,
    snapshots: MarketSnapshot[],
  ): Promise<CryptoTickResult> {
    // Capture open positions BEFORE tick to detect new opens and closes
    const preTickSnapshot = session.executor.getPortfolioSnapshot();
    const preOpenIds = new Set(preTickSnapshot.openPositions.map((p) => p.id));
    const preClosedCount = preTickSnapshot.closedPositions.length;

    const result = this.tickSessionSync(sessionId, session, snapshots);

    // Persist metrics + granular positions/trades to DB
    try {
      const snapshot = session.executor.getPortfolioSnapshot();
      const db = createUntypedAdminClient();

      // --- Persist new positions opened this tick ---
      for (const pos of snapshot.openPositions) {
        if (!preOpenIds.has(pos.id)) {
          // New position opened this tick
          const symbol = pos.marketName || pos.marketId.replace('CRY:', '').replace('USDT', '/USDT');

          await db.from('crypto_paper_positions').insert({
            session_id: sessionId,
            symbol,
            direction: 'long',
            entry_price: pos.entryPrice,
            current_price: pos.currentPrice,
            size: pos.quantity,
            stake: pos.stake,
            pnl: pos.unrealizedPnl,
            pnl_pct: pos.unrealizedPnlPct,
            entry_reason: `Signal confidence ${Math.round(pos.unrealizedPnlPct)}% — ${pos.tier}`,
            signal_confidence: 0,
            status: 'open',
            opened_at: new Date().toISOString(),
          });

          await db.from('crypto_paper_trades').insert({
            session_id: sessionId,
            symbol,
            action: 'enter',
            price: pos.entryPrice,
            size: pos.quantity,
            stake: pos.stake,
            pnl: 0,
            pnl_pct: 0,
            reason: `Open ${pos.tier} position`,
            executed_at: new Date().toISOString(),
          });
        }
      }

      // --- Persist positions closed this tick ---
      const newClosedPositions = snapshot.closedPositions.slice(preClosedCount);
      for (const closed of newClosedPositions) {
        const symbol = closed.marketName || closed.marketId.replace('CRY:', '').replace('USDT', '/USDT');

        // Mark position as closed in DB
        await db
          .from('crypto_paper_positions')
          .update({
            status: 'closed',
            current_price: closed.exitPrice,
            pnl: closed.netPnl,
            pnl_pct: closed.returnPct,
            closed_at: new Date().toISOString(),
          })
          .eq('session_id', sessionId)
          .eq('symbol', symbol)
          .eq('status', 'open');

        await db.from('crypto_paper_trades').insert({
          session_id: sessionId,
          symbol,
          action: 'full_close',
          price: closed.exitPrice,
          size: closed.quantity,
          stake: closed.stake,
          pnl: closed.netPnl,
          pnl_pct: closed.returnPct,
          reason: closed.exitReason || 'Position closed',
          executed_at: new Date().toISOString(),
        });
      }

      // --- Circuit breaker: log trade for each position force-closed ---
      if (result.circuitBroken) {
        // All remaining open positions are force-closed by circuit breaker
        for (const pos of preTickSnapshot.openPositions) {
          const symbol = pos.marketName || pos.marketId.replace('CRY:', '').replace('USDT', '/USDT');

          await db.from('crypto_paper_trades').insert({
            session_id: sessionId,
            symbol,
            action: 'circuit_breaker',
            price: pos.currentPrice,
            size: pos.quantity,
            stake: pos.stake,
            pnl: pos.unrealizedPnl,
            pnl_pct: pos.unrealizedPnlPct,
            reason: snapshot.circuitBrokenReason || 'Circuit breaker triggered',
            executed_at: new Date().toISOString(),
          });

          await db
            .from('crypto_paper_positions')
            .update({
              status: 'closed',
              current_price: pos.currentPrice,
              pnl: pos.unrealizedPnl,
              pnl_pct: pos.unrealizedPnlPct,
              closed_at: new Date().toISOString(),
            })
            .eq('session_id', sessionId)
            .eq('symbol', symbol)
            .eq('status', 'open');
        }
      }

      // --- Update current price on still-open positions ---
      for (const pos of snapshot.openPositions) {
        if (preOpenIds.has(pos.id)) {
          const symbol = pos.marketName || pos.marketId.replace('CRY:', '').replace('USDT', '/USDT');
          await db
            .from('crypto_paper_positions')
            .update({
              current_price: pos.currentPrice,
              pnl: pos.unrealizedPnl,
              pnl_pct: pos.unrealizedPnlPct,
            })
            .eq('session_id', sessionId)
            .eq('symbol', symbol)
            .eq('status', 'open');
        }
      }

      // --- Update session metrics ---
      const updateData: Record<string, unknown> = {
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
      };

      if (result.circuitBroken) {
        const cooldownUntil = new Date(Date.now() + CRYPTO_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
        updateData.status = 'paused';
        updateData.pause_reason = 'Circuit breaker triggered';
        updateData.is_circuit_broken = true;
        updateData.circuit_broken_reason = snapshot.circuitBrokenReason;
        updateData.circuit_broken_at = new Date().toISOString();
        updateData.cooldown_until = cooldownUntil;
      }

      await db
        .from('crypto_paper_sessions')
        .update(updateData)
        .eq('id', sessionId);

      // Save tick snapshot for equity curve
      await db.from('paper_trading_snapshots').insert({
        session_id: sessionId,
        area: 'crypto',
        equity: snapshot.totalBankroll,
        pnl_pct: snapshot.totalPnlPct,
        open_positions: snapshot.openPositions.length,
      });
    } catch (err) {
      result.errors.push(`DB update failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return result;
  }

  /** Core tick logic (no DB, sync — used by both tick() and tickWithSnapshots()) */
  private tickSessionSync(
    sessionId: string,
    session: CryptoPaperSession,
    snapshots: MarketSnapshot[],
  ): CryptoTickResult {
    const result: CryptoTickResult = {
      sessionId,
      strategyCode: session.strategySeed.code,
      pairsEvaluated: snapshots.length,
      signalsGenerated: 0,
      positionsOpened: 0,
      positionsClosed: 0,
      circuitBroken: false,
      portfolioValue: 0,
      totalPnlPct: 0,
      errors: [],
    };

    try {
      // Filter snapshots to this strategy's pairs
      const relevantSnapshots = snapshots.filter((s) =>
        session.pairs.some((p) => s.marketId.includes(p.replace('/', '')))
      );

      const batch = session.executor.evaluateMarkets(relevantSnapshots);
      result.signalsGenerated = batch.signals.length;

      // Count actions
      for (const signal of batch.signals) {
        if (signal.type === SignalType.ENTER_LONG) result.positionsOpened++;
        if (signal.type === SignalType.EXIT_FULL || signal.type === SignalType.STOP_LOSS) result.positionsClosed++;
      }

      // Check circuit breaker
      if (session.executor.isCircuitBroken()) {
        result.circuitBroken = true;
        session.status = 'paused';
      }

      // Update metrics
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

  /** Load active sessions from DB (for Vercel cold starts) */
  private async loadActiveSessions(): Promise<void> {
    const db = createUntypedAdminClient();

    const { data: rows } = await db
      .from('crypto_paper_sessions')
      .select('*')
      .eq('status', 'running');

    if (!rows) return;

    for (const row of rows) {
      // Skip if already in memory
      if (this.sessions.has(row.id)) continue;

      const seed = CRYPTO_STRATEGY_MAP[row.strategy_code];
      if (!seed) continue;

      const strategy = parseCryptoSeed(seed);

      const config: ExecutorConfig = {
        mode: 'paper',
        initialBankroll: Number(row.initial_capital),
        minConfidenceToEnter: 50,
        maxOpenPositions: 5,
        slippagePct: 0.5,
        area: MarketArea.CRYPTO,
      };

      const executor = new StrategyExecutor(strategy, config);

      this.sessions.set(row.id, {
        sessionId: row.id,
        strategy,
        strategySeed: seed,
        executor,
        pairs: row.pairs || [...seed.pairs],
        initialCapital: Number(row.initial_capital),
        totalTicks: row.total_ticks || 0,
        lastTickAt: row.last_tick_at || null,
        status: 'running',
        startedAt: row.started_at,
      });
    }
  }

  private async fetchCryptoSnapshots(): Promise<MarketSnapshot[]> {
    if (!this.adapter) return [];

    const snapshots: MarketSnapshot[] = [];

    for (const pair of CRYPTO_TOP_PAIRS) {
      try {
        const ticker = await this.adapter.getTicker(pair);
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
}

// ============================================================================
// Helpers
// ============================================================================

function parseCryptoSeed(seed: CryptoStrategySeed): ParsedStrategy {
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

let cryptoManagerInstance: CryptoPaperTradingManager | null = null;

export function getCryptoPaperTradingManager(): CryptoPaperTradingManager {
  if (!cryptoManagerInstance) {
    cryptoManagerInstance = new CryptoPaperTradingManager();
  }
  return cryptoManagerInstance;
}
