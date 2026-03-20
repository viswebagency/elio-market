/**
 * Backtest Engine — Quick Scan (Livello 1)
 *
 * Simula l'esecuzione di una strategia parsata su dati storici.
 * Per ogni tick temporale valuta entry/exit, applica slippage e commissioni,
 * e traccia posizioni tramite VirtualPortfolio.
 */

import { ParsedStrategy } from '../engine/dsl-parser';
import { MarketSnapshot, evaluateEntry, evaluateExit } from '../engine/evaluator';
import { VirtualPortfolio, CircuitBreakerLimits, ClosedPosition } from '../engine/portfolio';
import { TierLevel, SignalType } from '../engine/signals';
import { MarketArea } from '../types/common';
import { BacktestTrade, EquityPoint } from './metrics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HistoricalTick {
  timestamp: string;
  marketId: string;
  marketName: string;
  price: number;
  volume24hUsd: number;
  totalVolumeUsd: number;
  expiryDate: string | null;
  category: string;
  status: 'open' | 'closed' | 'suspended' | 'settled' | 'expired';
  /** Outcome finale del mercato: 1 = YES vince, 0 = NO vince, null = non risolto */
  resolvedOutcome: number | null;
}

export interface HistoricalMarketData {
  marketId: string;
  marketName: string;
  category: string;
  startDate: string;
  endDate: string;
  resolvedOutcome: number | null;
  ticks: HistoricalTick[];
}

export interface BacktestConfig {
  initialCapital: number;
  slippagePct: number;
  commissionPct: number;
  maxOpenPositions: number;
  tickIntervalMs: number;
}

export interface BacktestEngineResult {
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  finalEquity: number;
  totalDays: number;
}

const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  initialCapital: 1000,
  slippagePct: 1,
  commissionPct: 0,
  maxOpenPositions: 10,
  tickIntervalMs: 24 * 60 * 60 * 1000, // 1 giorno
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class BacktestEngine {
  private strategy: ParsedStrategy;
  private config: BacktestConfig;
  private portfolio: VirtualPortfolio;
  private trades: BacktestTrade[] = [];
  private equityCurve: EquityPoint[] = [];
  private tradeCounter = 0;
  private previousEquity: number;

  constructor(strategy: ParsedStrategy, config?: Partial<BacktestConfig>) {
    this.strategy = strategy;
    this.config = { ...DEFAULT_BACKTEST_CONFIG, ...config };
    this.previousEquity = this.config.initialCapital;

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
      this.config.initialCapital,
      tierAllocations,
      strategy.liquidityReservePct,
      cbLimits,
    );
  }

  /**
   * Esegue il backtest su un set di mercati storici.
   * I tick di tutti i mercati vengono uniti e ordinati per timestamp,
   * poi processati sequenzialmente.
   */
  run(markets: HistoricalMarketData[]): BacktestEngineResult {
    // Unisci tutti i tick e ordina per timestamp
    const allTicks = this.mergeAndSortTicks(markets);

    if (allTicks.length === 0) {
      return {
        trades: [],
        equityCurve: [],
        finalEquity: this.config.initialCapital,
        totalDays: 0,
      };
    }

    // Raggruppa i tick per timestamp (stesso giorno = stesso batch)
    const tickBatches = this.groupTicksByTimestamp(allTicks);

    // Mappa per outcome finali
    const marketOutcomes = new Map<string, number | null>();
    for (const market of markets) {
      marketOutcomes.set(market.marketId, market.resolvedOutcome);
    }

    // Processa ogni batch temporale
    for (const [timestamp, ticks] of tickBatches) {
      this.processTick(timestamp, ticks, marketOutcomes);
    }

    // Forza la chiusura di tutte le posizioni aperte rimaste
    this.closeAllRemainingPositions(marketOutcomes);

    // Calcola durata totale
    const firstTimestamp = new Date(allTicks[0].timestamp).getTime();
    const lastTimestamp = new Date(allTicks[allTicks.length - 1].timestamp).getTime();
    const totalDays = Math.max(1, Math.ceil((lastTimestamp - firstTimestamp) / (1000 * 60 * 60 * 24)));

    const snapshot = this.portfolio.getSnapshot();

    return {
      trades: this.trades,
      equityCurve: this.equityCurve,
      finalEquity: snapshot.totalBankroll,
      totalDays,
    };
  }

  private mergeAndSortTicks(markets: HistoricalMarketData[]): HistoricalTick[] {
    const allTicks: HistoricalTick[] = [];
    for (const market of markets) {
      allTicks.push(...market.ticks);
    }
    allTicks.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return allTicks;
  }

  private groupTicksByTimestamp(ticks: HistoricalTick[]): Map<string, HistoricalTick[]> {
    const groups = new Map<string, HistoricalTick[]>();
    for (const tick of ticks) {
      // Normalizza al giorno (ignora ore/minuti per quick scan)
      const dayKey = tick.timestamp.substring(0, 10);
      const existing = groups.get(dayKey);
      if (existing) {
        existing.push(tick);
      } else {
        groups.set(dayKey, [tick]);
      }
    }
    return groups;
  }

  private processTick(
    timestamp: string,
    ticks: HistoricalTick[],
    marketOutcomes: Map<string, number | null>,
  ): void {
    // Check circuit breaker
    const cbCheck = this.portfolio.checkCircuitBreaker();
    if (cbCheck.broken) {
      this.recordEquityPoint(timestamp);
      return;
    }

    for (const tick of ticks) {
      // Se il mercato e' settled/closed/expired, chiudi la posizione aperta
      if (tick.status === 'settled' || tick.status === 'expired') {
        this.handleSettlement(tick, marketOutcomes);
        continue;
      }

      const existingPosition = this.portfolio.getPositionByMarket(tick.marketId);

      if (existingPosition) {
        // Aggiorna prezzo e valuta exit
        this.portfolio.updateMarketPrice(tick.marketId, tick.price);
        this.evaluateAndExecuteExit(existingPosition.id, tick);
      } else if (tick.status === 'open') {
        // Valuta entry
        this.evaluateAndExecuteEntry(tick);
      }
    }

    this.recordEquityPoint(timestamp);
  }

  private evaluateAndExecuteEntry(tick: HistoricalTick): void {
    const openPositions = this.portfolio.getOpenPositions();
    if (openPositions.length >= this.config.maxOpenPositions) {
      return;
    }

    const snapshot: MarketSnapshot = {
      marketId: tick.marketId,
      name: tick.marketName,
      price: tick.price,
      volume24hUsd: tick.volume24hUsd,
      totalVolumeUsd: tick.totalVolumeUsd,
      expiryDate: tick.expiryDate,
      hasCatalyst: false,
      catalystDescription: null,
      category: tick.category,
      status: tick.status,
    };

    const evaluation = evaluateEntry(this.strategy, snapshot);

    if (!evaluation.passed) {
      return;
    }

    const tier = this.determineTier(evaluation.totalScore);
    const stake = this.calculateStake(tier);

    if (stake <= 0) {
      return;
    }

    // Applica slippage all'entry
    const slippedPrice = tick.price * (1 + this.config.slippagePct / 100);

    this.portfolio.openPosition({
      marketId: tick.marketId,
      marketName: tick.marketName,
      strategyId: this.strategy.strategyId,
      tier,
      price: slippedPrice,
      stake,
    });
  }

  private evaluateAndExecuteExit(positionId: string, tick: HistoricalTick): void {
    const position = this.portfolio.getOpenPositions().find(p => p.id === positionId);
    if (!position) return;

    const currentProfitPct = position.unrealizedPnlPct;
    const exitEvaluations = evaluateExit(this.strategy.exitRules, currentProfitPct);
    const triggered = exitEvaluations.filter(e => e.triggered);

    if (triggered.length === 0) return;

    for (const exit of triggered) {
      // Applica slippage all'exit
      const slippedPrice = tick.price * (1 - this.config.slippagePct / 100);

      const closed = this.portfolio.closePosition(positionId, slippedPrice, exit.sellFraction, exit.reason);

      if (closed) {
        this.recordTrade(closed, tick, exit.reason);
      }

      if (exit.isStopLoss || exit.sellFraction >= 0.99) {
        break;
      }
    }
  }

  private handleSettlement(tick: HistoricalTick, marketOutcomes: Map<string, number | null>): void {
    const position = this.portfolio.getPositionByMarket(tick.marketId);
    if (!position) return;

    const outcome = marketOutcomes.get(tick.marketId);
    // Se il mercato e' settled: il prezzo finale e' 1 (YES vince) o 0 (NO vince)
    const settlementPrice = outcome !== null && outcome !== undefined ? outcome : tick.price;

    const closed = this.portfolio.closePosition(
      position.id,
      settlementPrice,
      1,
      `Mercato risolto: outcome=${outcome !== null ? outcome : 'unknown'}`,
    );

    if (closed) {
      this.recordTrade(closed, tick, `Settlement: outcome=${outcome}`);
    }
  }

  private closeAllRemainingPositions(marketOutcomes: Map<string, number | null>): void {
    const openPositions = this.portfolio.getOpenPositions();
    for (const position of openPositions) {
      const outcome = marketOutcomes.get(position.marketId);
      const exitPrice = outcome !== null && outcome !== undefined ? outcome : position.currentPrice;

      const closed = this.portfolio.closePosition(
        position.id,
        exitPrice,
        1,
        'Chiusura forzata fine backtest',
      );

      if (closed) {
        this.recordTrade(closed, {
          timestamp: new Date().toISOString(),
          marketId: position.marketId,
          marketName: position.marketName,
          price: exitPrice,
          volume24hUsd: 0,
          totalVolumeUsd: 0,
          expiryDate: null,
          category: '',
          status: 'closed',
          resolvedOutcome: outcome ?? null,
        }, 'Chiusura forzata fine backtest');
      }
    }
  }

  private recordTrade(closed: ClosedPosition, tick: HistoricalTick, exitReason: string): void {
    this.tradeCounter++;

    const commissionCost = closed.stake * (this.config.commissionPct / 100);
    const slippageCost = closed.stake * (this.config.slippagePct / 100);
    const netPnl = closed.grossPnl - commissionCost;

    const trade: BacktestTrade = {
      tradeId: `bt_${this.tradeCounter}`,
      marketId: closed.marketId,
      marketName: closed.marketName,
      entryPrice: closed.entryPrice,
      exitPrice: closed.exitPrice,
      stake: closed.stake,
      quantity: closed.quantity,
      entryTimestamp: closed.enteredAt,
      exitTimestamp: closed.exitedAt,
      grossPnl: closed.grossPnl,
      netPnl,
      returnPct: closed.stake > 0 ? (netPnl / closed.stake) * 100 : 0,
      slippageCost,
      commissionCost,
      exitReason,
      // Stima della probabilita: usiamo il prezzo di entry (prima dello slippage) come proxy
      estimatedProbability: closed.entryPrice / (1 + this.config.slippagePct / 100),
    };

    this.trades.push(trade);
  }

  private recordEquityPoint(timestamp: string): void {
    const snapshot = this.portfolio.getSnapshot();
    const equity = snapshot.totalBankroll;
    const dailyReturn = this.previousEquity > 0
      ? (equity - this.previousEquity) / this.previousEquity
      : 0;

    let drawdownPct = 0;
    if (this.equityCurve.length > 0) {
      let peak = this.config.initialCapital;
      for (const point of this.equityCurve) {
        if (point.equity > peak) peak = point.equity;
      }
      if (equity > peak) peak = equity;
      drawdownPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    }

    this.equityCurve.push({
      timestamp,
      equity,
      drawdownPct: Math.max(0, drawdownPct),
      dailyReturn,
    });

    this.previousEquity = equity;
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
}
