import { MarketArea, Direction, OrderType } from '../types/common';
import { Trade, TradeExecution } from '../types/trade';
import { ParsedStrategy } from './dsl-parser';
import { MarketSnapshot, evaluateEntry, evaluateExit, EvaluationResult } from './evaluator';
import { VirtualPortfolio, PortfolioSnapshot, CircuitBreakerLimits } from './portfolio';
import { Signal, SignalBatch, SignalType, TierLevel, createSignal, createSkipSignal } from './signals';
import { MarketAdapter, NormalizedMarket, normalizedToSnapshot } from './market-adapter';
import type { ReconciliationResult } from '../../services/reconciliation/order-reconciliation';

export type StrategyMode = 'observation' | 'paper' | 'live';

/** Service interface for executing trades (dependency injection) */
export interface LiveExecutionService {
  execute: (trade: Trade) => Promise<TradeExecution>;
}

/** Function to get order status for reconciliation */
export type GetOrderStatusFn = (orderId: string, symbol: string) => Promise<{
  orderId: string;
  status: string;
  filledAmount: number;
  remainingAmount: number;
  avgFillPrice: number | undefined;
  fees: number;
}>;

export interface LiveExecutionResult {
  tradeId: string;
  orderId: string;
  status: 'executed' | 'blocked' | 'failed';
  reason?: string;
  execution?: TradeExecution;
  reconciliation?: ReconciliationResult;
}

export interface ExecutorConfig {
  mode: StrategyMode;
  initialBankroll: number;
  minConfidenceToEnter: number;
  maxOpenPositions: number;
  slippagePct: number;
  /** Area di mercato — sovrascrive il default PREDICTION */
  area?: MarketArea;
  /** User ID — required for live execution */
  userId?: string;
}

export interface ExecutionLog {
  timestamp: string;
  mode: StrategyMode;
  message: string;
  signal: Signal | null;
}

const DEFAULT_CONFIG: ExecutorConfig = {
  mode: 'observation',
  initialBankroll: 1000,
  minConfidenceToEnter: 50,
  maxOpenPositions: 10,
  slippagePct: 1.5,
};

export class StrategyExecutor {
  private strategy: ParsedStrategy;
  private config: ExecutorConfig;
  private portfolio: VirtualPortfolio;
  private logs: ExecutionLog[] = [];
  private adapter: MarketAdapter | null = null;
  private resolvedArea: MarketArea;
  private pendingLiveTrades: Array<{ signal: Signal; market: MarketSnapshot }> = [];

  constructor(strategy: ParsedStrategy, config?: Partial<ExecutorConfig>, adapter?: MarketAdapter) {
    this.strategy = strategy;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.adapter = adapter ?? null;
    this.resolvedArea = adapter?.area ?? config?.area ?? MarketArea.PREDICTION;

    const tierAllocations = strategy.bankrollTiers.map(t => ({
      tier: t.tier,
      allocationPct: t.allocationPct,
    }));

    const cbLimits: CircuitBreakerLimits = {
      strategyMaxDrawdownPct: Math.abs(strategy.circuitBreaker.lossPct),
      areaMaxDrawdownPct: 25,
      globalMaxDrawdownPct: 30,
      maxConsecutiveLosses: strategy.maxConsecutiveLosses,
    };

    this.portfolio = new VirtualPortfolio(
      this.config.initialBankroll,
      tierAllocations,
      strategy.liquidityReservePct,
      cbLimits,
    );
  }

  evaluateMarkets(markets: MarketSnapshot[]): SignalBatch {
    const signals: Signal[] = [];
    let marketsMatched = 0;

    const cbCheck = this.portfolio.checkCircuitBreaker();
    if (cbCheck.broken) {
      this.addLog(`CIRCUIT BREAKER ATTIVO: ${cbCheck.reason}. Nessuna valutazione.`, null);
      return {
        strategyId: this.strategy.strategyId,
        signals: [],
        generatedAt: new Date().toISOString(),
        marketsEvaluated: markets.length,
        marketsMatched: 0,
      };
    }

    for (const market of markets) {
      const existingPosition = this.portfolio.getPositionByMarket(market.marketId);

      if (existingPosition) {
        this.portfolio.updateMarketPrice(market.marketId, market.price);
        const exitSignals = this.evaluateExitConditions(existingPosition.id, market);
        signals.push(...exitSignals);
        continue;
      }

      const evaluation = evaluateEntry(this.strategy, market);

      if (evaluation.passed) {
        marketsMatched++;
        const signal = this.generateEntrySignal(evaluation, market);
        signals.push(signal);

        if (this.config.mode === 'paper' || this.config.mode === 'live') {
          this.executeSignal(signal, market);
        }
      } else {
        const skipSignal = createSkipSignal(
          market.marketId,
          market.name,
          this.strategy.strategyId,
          this.strategy.code,
          this.resolvedArea,
          evaluation.summary,
          market.price,
        );
        signals.push(skipSignal);
      }
    }

    this.addLog(
      `Valutati ${markets.length} mercati: ${marketsMatched} match, ${signals.filter(s => s.type === SignalType.SKIP).length} skip`,
      null,
    );

    return {
      strategyId: this.strategy.strategyId,
      signals,
      generatedAt: new Date().toISOString(),
      marketsEvaluated: markets.length,
      marketsMatched,
    };
  }

  private generateEntrySignal(evaluation: EvaluationResult, market: MarketSnapshot): Signal {
    const tier = this.determineTier(evaluation.totalScore);
    const stake = this.calculateStake(tier);

    const signal = createSignal({
      marketId: market.marketId,
      marketName: market.name,
      strategyId: this.strategy.strategyId,
      strategyCode: this.strategy.code,
      area: this.resolvedArea,
      type: SignalType.ENTER_LONG,
      confidence: evaluation.totalScore,
      reason: evaluation.summary,
      suggestedStake: stake,
      suggestedTier: tier,
      currentPrice: market.price,
    });

    this.addLog(`SEGNALE ENTRY: ${market.name} @ $${market.price.toFixed(4)}, confidence ${evaluation.totalScore}, tier ${tier}, stake $${stake.toFixed(2)}`, signal);

    return signal;
  }

  private evaluateExitConditions(positionId: string, market: MarketSnapshot): Signal[] {
    const signals: Signal[] = [];
    const position = this.portfolio.getOpenPositions().find(p => p.id === positionId);

    if (!position) return signals;

    const currentProfitPct = position.unrealizedPnlPct;
    const exitEvaluations = evaluateExit(this.strategy.exitRules, currentProfitPct);

    const triggered = exitEvaluations.filter(e => e.triggered);

    if (triggered.length === 0) {
      signals.push(createSignal({
        marketId: market.marketId,
        marketName: market.name,
        strategyId: this.strategy.strategyId,
        strategyCode: this.strategy.code,
        area: this.resolvedArea,
        type: SignalType.HOLD,
        confidence: 50,
        reason: `Posizione aperta, P&L: ${currentProfitPct.toFixed(1)}%, nessun exit trigger`,
        currentPrice: market.price,
      }));
      return signals;
    }

    for (const exit of triggered) {
      const signalType = exit.isStopLoss
        ? SignalType.STOP_LOSS
        : exit.sellFraction >= 0.99
          ? SignalType.EXIT_FULL
          : SignalType.EXIT_PARTIAL;

      const signal = createSignal({
        marketId: market.marketId,
        marketName: market.name,
        strategyId: this.strategy.strategyId,
        strategyCode: this.strategy.code,
        area: this.resolvedArea,
        type: signalType,
        confidence: 100,
        reason: exit.reason,
        sellFraction: exit.sellFraction,
        currentPrice: market.price,
      });

      signals.push(signal);

      this.addLog(`SEGNALE EXIT: ${market.name} - ${exit.reason}`, signal);

      if (this.config.mode === 'paper') {
        const slippedPrice = market.price * (1 - this.config.slippagePct / 100);
        this.portfolio.closePosition(positionId, slippedPrice, exit.sellFraction, exit.reason);
      }

      if (exit.isStopLoss || exit.sellFraction >= 0.99) {
        break;
      }
    }

    return signals;
  }

  private executeSignal(signal: Signal, market: MarketSnapshot): void {
    if (signal.type !== SignalType.ENTER_LONG) return;

    if (this.config.mode === 'observation') {
      this.addLog(`[OBSERVATION] Segnale registrato ma non eseguito: ${market.name}`, signal);
      return;
    }

    if (this.config.mode === 'live') {
      this.pendingLiveTrades.push({ signal, market });
      this.addLog(`[LIVE-EXEC] Segnale accodato per esecuzione live: ${market.name} @ $${market.price.toFixed(4)}`, signal);
      return;
    }

    const openPositions = this.portfolio.getOpenPositions();
    if (openPositions.length >= this.config.maxOpenPositions) {
      this.addLog(`Max posizioni aperte raggiunto (${this.config.maxOpenPositions}), skip ${market.name}`, signal);
      return;
    }

    const slippedPrice = market.price * (1 + this.config.slippagePct / 100);

    this.portfolio.openPosition({
      marketId: market.marketId,
      marketName: market.name,
      strategyId: this.strategy.strategyId,
      tier: signal.suggestedTier,
      price: slippedPrice,
      stake: signal.suggestedStake,
    });

    this.addLog(`[PAPER] Eseguito: aperta posizione su ${market.name} @ $${slippedPrice.toFixed(4)}`, signal);
  }

  private determineTier(score: number): TierLevel {
    if (score >= 80) return TierLevel.TIER1;
    if (score >= 60) return TierLevel.TIER2;
    return TierLevel.TIER3;
  }

  private calculateStake(tier: TierLevel): number {
    const snapshot = this.portfolio.getSnapshot();
    const tierBankroll = snapshot.tierBankrolls.find(t => t.tier === tier);

    if (!tierBankroll) return 0;

    const maxStake = tierBankroll.available;
    const maxPctStake = snapshot.totalBankroll * (this.strategy.maxAllocationPct / 100);

    return Math.min(maxStake, maxPctStake);
  }

  /**
   * Valuta mercati normalizzati da qualsiasi MarketAdapter.
   * Converte NormalizedMarket[] -> MarketSnapshot[] e delega a evaluateMarkets.
   */
  evaluateNormalizedMarkets(markets: NormalizedMarket[]): SignalBatch {
    const snapshots: MarketSnapshot[] = markets.map(m => normalizedToSnapshot(m));
    return this.evaluateMarkets(snapshots);
  }

  /**
   * Fetch e valuta mercati tramite l'adapter configurato.
   * Richiede che il costruttore sia stato chiamato con un MarketAdapter.
   */
  async fetchAndEvaluate(filters?: { limit?: number; category?: string }): Promise<SignalBatch> {
    if (!this.adapter) {
      throw new Error('Nessun MarketAdapter configurato. Passa un adapter al costruttore.');
    }

    const markets = await this.adapter.fetchMarkets({
      limit: filters?.limit ?? 50,
      category: filters?.category,
      active: true,
    });

    return this.evaluateNormalizedMarkets(markets);
  }

  /** Restituisce l'area di mercato risolta */
  getArea(): MarketArea {
    return this.resolvedArea;
  }

  /** Restituisce l'adapter configurato (null se non presente) */
  getAdapter(): MarketAdapter | null {
    return this.adapter;
  }

  getPortfolioSnapshot(): PortfolioSnapshot {
    return this.portfolio.getSnapshot();
  }

  getLogs(): ExecutionLog[] {
    return [...this.logs];
  }

  getMode(): StrategyMode {
    return this.config.mode;
  }

  isCircuitBroken(): boolean {
    return this.portfolio.checkCircuitBreaker().broken;
  }

  /** Get pending live trades (queued during evaluateMarkets in live mode) */
  getPendingLiveTrades(): Array<{ signal: Signal; market: MarketSnapshot }> {
    return [...this.pendingLiveTrades];
  }

  /**
   * Execute all pending live trades through the ExecutionService.
   * Call this after evaluateMarkets() when mode='live'.
   *
   * Flow: Executor -> ExecutionService -> Plugin (CryptoAdapter) -> CCXT -> Exchange
   */
  async executePendingLiveTrades(opts: {
    userId: string;
    executionService: LiveExecutionService;
    getOrderStatus?: GetOrderStatusFn;
    reconcileAndUpdateFn?: (
      getOrderStatusFn: GetOrderStatusFn,
      orderId: string,
      symbol: string,
      expectedPrice: number,
      tradeId: string,
    ) => Promise<ReconciliationResult>;
  }): Promise<LiveExecutionResult[]> {
    const results: LiveExecutionResult[] = [];

    if (this.pendingLiveTrades.length === 0) {
      this.addLog('[LIVE-EXEC] Nessun trade live in coda', null);
      return results;
    }

    this.addLog(`[LIVE-EXEC] Esecuzione di ${this.pendingLiveTrades.length} trade live`, null);

    for (const { signal, market } of this.pendingLiveTrades) {
      const trade = this.buildTrade(signal, market, opts.userId);

      try {
        const execution = await opts.executionService.execute(trade);
        this.addLog(
          `[LIVE-EXEC] Ordine piazzato: ${execution.externalOrderId} su ${market.name} — status=${execution.status}`,
          signal,
        );

        let reconciliation: ReconciliationResult | undefined;
        if (opts.getOrderStatus && opts.reconcileAndUpdateFn && execution.externalOrderId) {
          try {
            reconciliation = await opts.reconcileAndUpdateFn(
              opts.getOrderStatus,
              execution.externalOrderId,
              trade.symbol,
              signal.currentPrice ?? market.price,
              trade.id,
            );
            this.addLog(
              `[RECONCILIATION] ${trade.symbol}: status=${reconciliation.status}, slippage=${reconciliation.slippage?.toFixed(4) ?? 'N/A'}%, fees=${reconciliation.fees}`,
              signal,
            );
          } catch (err) {
            this.addLog(
              `[RECONCILIATION] Fallita per ${trade.symbol}: ${err instanceof Error ? err.message : 'Unknown'}`,
              signal,
            );
          }
        }

        results.push({
          tradeId: trade.id,
          orderId: execution.externalOrderId,
          status: 'executed',
          execution,
          reconciliation,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const isKillSwitch = message.includes('Kill switch');

        this.addLog(
          `[LIVE-EXEC] ${isKillSwitch ? 'BLOCCATO da kill switch' : 'Esecuzione fallita'} per ${market.name}: ${message}`,
          signal,
        );

        results.push({
          tradeId: trade.id,
          orderId: '',
          status: isKillSwitch ? 'blocked' : 'failed',
          reason: message,
        });
      }
    }

    this.pendingLiveTrades = [];
    return results;
  }

  private buildTrade(signal: Signal, market: MarketSnapshot, userId: string): Trade {
    const currentPrice = signal.currentPrice ?? market.price;
    const size = currentPrice > 0 ? (signal.suggestedStake ?? 0) / currentPrice : 0;

    return {
      id: crypto.randomUUID(),
      strategyId: signal.strategyId,
      userId,
      area: this.resolvedArea,
      symbol: signal.marketId,
      direction: signal.type === SignalType.ENTER_LONG ? Direction.LONG : Direction.SHORT,
      orderType: OrderType.MARKET,
      size,
      sizePercent: signal.suggestedStake
        ? (signal.suggestedStake / this.config.initialBankroll) * 100
        : undefined,
      currency: this.resolvedArea === MarketArea.CRYPTO ? 'USDT' : 'USD',
      metadata: {
        confidence: signal.confidence,
        tier: signal.suggestedTier,
        expectedPrice: currentPrice,
        executionType: 'live',
      },
      createdAt: new Date().toISOString(),
    };
  }

  private addLog(message: string, signal: Signal | null): void {
    this.logs.push({
      timestamp: new Date().toISOString(),
      mode: this.config.mode,
      message,
      signal,
    });
  }
}
