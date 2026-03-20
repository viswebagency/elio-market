import { MarketArea } from '../types/common';
import { ParsedStrategy } from './dsl-parser';
import { MarketSnapshot, evaluateEntry, evaluateExit, EvaluationResult } from './evaluator';
import { VirtualPortfolio, PortfolioSnapshot, CircuitBreakerLimits } from './portfolio';
import { Signal, SignalBatch, SignalType, TierLevel, createSignal, createSkipSignal } from './signals';

export type StrategyMode = 'observation' | 'paper' | 'live';

export interface ExecutorConfig {
  mode: StrategyMode;
  initialBankroll: number;
  minConfidenceToEnter: number;
  maxOpenPositions: number;
  slippagePct: number;
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

  constructor(strategy: ParsedStrategy, config?: Partial<ExecutorConfig>) {
    this.strategy = strategy;
    this.config = { ...DEFAULT_CONFIG, ...config };

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

        if (this.config.mode === 'paper') {
          this.executeSignal(signal, market);
        }
      } else {
        const skipSignal = createSkipSignal(
          market.marketId,
          market.name,
          this.strategy.strategyId,
          this.strategy.code,
          market.status === 'open' ? MarketArea.PREDICTION : MarketArea.PREDICTION,
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
      area: MarketArea.PREDICTION,
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
        area: MarketArea.PREDICTION,
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
        area: MarketArea.PREDICTION,
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
      this.addLog(`[LIVE] Placeholder - esecuzione live non implementata: ${market.name}`, signal);
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

  private addLog(message: string, signal: Signal | null): void {
    this.logs.push({
      timestamp: new Date().toISOString(),
      mode: this.config.mode,
      message,
      signal,
    });
  }
}
