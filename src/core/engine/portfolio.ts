import { TierLevel } from './signals';

export interface Position {
  id: string;
  marketId: string;
  marketName: string;
  strategyId: string;
  tier: TierLevel;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  remainingQuantity: number;
  stake: number;
  enteredAt: string;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
}

export interface ClosedPosition {
  id: string;
  marketId: string;
  marketName: string;
  strategyId: string;
  tier: TierLevel;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  stake: number;
  enteredAt: string;
  exitedAt: string;
  grossPnl: number;
  netPnl: number;
  returnPct: number;
  exitReason: string;
}

export interface OperationLog {
  timestamp: string;
  action: 'open' | 'partial_close' | 'full_close' | 'circuit_breaker';
  positionId: string;
  marketId: string;
  details: string;
  price: number;
  quantity: number;
  pnl: number;
}

export interface TierBankroll {
  tier: TierLevel;
  allocated: number;
  used: number;
  available: number;
}

export interface PortfolioSnapshot {
  totalBankroll: number;
  initialBankroll: number;
  availableCash: number;
  lockedInPositions: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  totalPnlPct: number;
  peakBankroll: number;
  currentDrawdownPct: number;
  openPositions: Position[];
  closedPositions: ClosedPosition[];
  tierBankrolls: TierBankroll[];
  consecutiveLosses: number;
  isCircuitBroken: boolean;
  circuitBrokenReason: string | null;
  operationLog: OperationLog[];
}

export interface CircuitBreakerLimits {
  strategyMaxDrawdownPct: number;
  areaMaxDrawdownPct: number;
  globalMaxDrawdownPct: number;
  maxConsecutiveLosses: number;
}

export class VirtualPortfolio {
  private positions: Map<string, Position> = new Map();
  private closedPositions: ClosedPosition[] = [];
  private operationLog: OperationLog[] = [];
  private initialBankroll: number;
  private currentCash: number;
  private peakBankroll: number;
  private realizedPnl = 0;
  private consecutiveLosses = 0;
  private isCircuitBroken = false;
  private circuitBrokenReason: string | null = null;
  private tierAllocations: Map<TierLevel, number>;
  private tierUsed: Map<TierLevel, number>;
  private liquidityReservePct: number;
  private circuitBreakerLimits: CircuitBreakerLimits;
  private nextPositionId = 1;

  constructor(
    initialBankroll: number,
    tierAllocations: { tier: TierLevel; allocationPct: number }[],
    liquidityReservePct: number,
    circuitBreakerLimits: CircuitBreakerLimits,
  ) {
    this.initialBankroll = initialBankroll;
    this.currentCash = initialBankroll;
    this.peakBankroll = initialBankroll;
    this.liquidityReservePct = liquidityReservePct;
    this.circuitBreakerLimits = circuitBreakerLimits;

    this.tierAllocations = new Map();
    this.tierUsed = new Map();

    const deployable = initialBankroll * (1 - liquidityReservePct / 100);
    for (const t of tierAllocations) {
      this.tierAllocations.set(t.tier, deployable * t.allocationPct / 100);
      this.tierUsed.set(t.tier, 0);
    }
  }

  getSnapshot(): PortfolioSnapshot {
    const lockedInPositions = Array.from(this.positions.values())
      .reduce((sum, p) => sum + p.stake, 0);

    const unrealizedPnl = Array.from(this.positions.values())
      .reduce((sum, p) => sum + p.unrealizedPnl, 0);

    const totalBankroll = this.currentCash + lockedInPositions + unrealizedPnl;
    const totalPnl = totalBankroll - this.initialBankroll;
    const totalPnlPct = this.initialBankroll > 0
      ? (totalPnl / this.initialBankroll) * 100
      : 0;

    const currentDrawdownPct = this.peakBankroll > 0
      ? ((this.peakBankroll - totalBankroll) / this.peakBankroll) * 100
      : 0;

    const tierBankrolls: TierBankroll[] = [];
    for (const [tier, allocated] of Array.from(this.tierAllocations.entries())) {
      const used = this.tierUsed.get(tier) ?? 0;
      tierBankrolls.push({
        tier,
        allocated,
        used,
        available: Math.max(0, allocated - used),
      });
    }

    return {
      totalBankroll,
      initialBankroll: this.initialBankroll,
      availableCash: this.currentCash,
      lockedInPositions,
      realizedPnl: this.realizedPnl,
      unrealizedPnl,
      totalPnl,
      totalPnlPct,
      peakBankroll: this.peakBankroll,
      currentDrawdownPct: Math.max(0, currentDrawdownPct),
      openPositions: Array.from(this.positions.values()),
      closedPositions: [...this.closedPositions],
      tierBankrolls,
      consecutiveLosses: this.consecutiveLosses,
      isCircuitBroken: this.isCircuitBroken,
      circuitBrokenReason: this.circuitBrokenReason,
      operationLog: [...this.operationLog],
    };
  }

  openPosition(params: {
    marketId: string;
    marketName: string;
    strategyId: string;
    tier: TierLevel;
    price: number;
    stake: number;
  }): Position | null {
    if (this.isCircuitBroken) {
      return null;
    }

    const tierAvailable = this.getTierAvailable(params.tier);
    const effectiveStake = Math.min(params.stake, tierAvailable, this.currentCash);

    if (effectiveStake <= 0) {
      return null;
    }

    const quantity = effectiveStake / params.price;
    const positionId = `pos_${this.nextPositionId++}`;

    const position: Position = {
      id: positionId,
      marketId: params.marketId,
      marketName: params.marketName,
      strategyId: params.strategyId,
      tier: params.tier,
      entryPrice: params.price,
      currentPrice: params.price,
      quantity,
      remainingQuantity: quantity,
      stake: effectiveStake,
      enteredAt: new Date().toISOString(),
      unrealizedPnl: 0,
      unrealizedPnlPct: 0,
    };

    this.positions.set(positionId, position);
    this.currentCash -= effectiveStake;
    this.tierUsed.set(params.tier, (this.tierUsed.get(params.tier) ?? 0) + effectiveStake);

    this.log({
      action: 'open',
      positionId,
      marketId: params.marketId,
      details: `Aperta posizione ${params.tier} su ${params.marketName} @ $${params.price.toFixed(4)}, stake $${effectiveStake.toFixed(2)}`,
      price: params.price,
      quantity,
      pnl: 0,
    });

    return position;
  }

  closePosition(positionId: string, exitPrice: number, fraction: number, exitReason: string): ClosedPosition | null {
    const position = this.positions.get(positionId);
    if (!position) {
      return null;
    }

    const closeFraction = Math.min(1, Math.max(0, fraction));
    const closeQuantity = position.remainingQuantity * closeFraction;
    const closeStake = position.stake * (closeQuantity / position.quantity);

    const grossPnl = closeQuantity * (exitPrice - position.entryPrice);
    const netPnl = grossPnl;
    const returnPct = position.entryPrice > 0
      ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
      : 0;

    const closed: ClosedPosition = {
      id: `${positionId}_close_${this.closedPositions.length}`,
      marketId: position.marketId,
      marketName: position.marketName,
      strategyId: position.strategyId,
      tier: position.tier,
      entryPrice: position.entryPrice,
      exitPrice,
      quantity: closeQuantity,
      stake: closeStake,
      enteredAt: position.enteredAt,
      exitedAt: new Date().toISOString(),
      grossPnl,
      netPnl,
      returnPct,
      exitReason,
    };

    this.closedPositions.push(closed);
    this.realizedPnl += netPnl;
    this.currentCash += closeStake + grossPnl;

    const tierUsed = this.tierUsed.get(position.tier) ?? 0;
    this.tierUsed.set(position.tier, Math.max(0, tierUsed - closeStake));

    if (netPnl < 0) {
      this.consecutiveLosses++;
    } else if (netPnl > 0) {
      this.consecutiveLosses = 0;
    }

    position.remainingQuantity -= closeQuantity;
    position.stake -= closeStake;

    const isFullClose = position.remainingQuantity <= 0.0001 || closeFraction >= 0.999;

    if (isFullClose) {
      this.positions.delete(positionId);
    } else {
      this.positions.set(positionId, position);
    }

    const action = isFullClose ? 'full_close' as const : 'partial_close' as const;
    this.log({
      action,
      positionId,
      marketId: position.marketId,
      details: `${isFullClose ? 'Chiusa' : 'Chiusura parziale'} posizione su ${position.marketName} @ $${exitPrice.toFixed(4)} (${exitReason}), P&L: $${netPnl.toFixed(2)} (${returnPct.toFixed(1)}%)`,
      price: exitPrice,
      quantity: closeQuantity,
      pnl: netPnl,
    });

    this.updatePeakAndCheckCircuitBreaker();

    return closed;
  }

  updateMarketPrice(marketId: string, newPrice: number): void {
    for (const [, position] of this.positions) {
      if (position.marketId === marketId) {
        position.currentPrice = newPrice;
        position.unrealizedPnl = position.remainingQuantity * (newPrice - position.entryPrice);
        position.unrealizedPnlPct = position.entryPrice > 0
          ? ((newPrice - position.entryPrice) / position.entryPrice) * 100
          : 0;
      }
    }
  }

  getPositionByMarket(marketId: string): Position | null {
    for (const [, position] of this.positions) {
      if (position.marketId === marketId) {
        return position;
      }
    }
    return null;
  }

  getOpenPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  checkCircuitBreaker(): { broken: boolean; reason: string | null } {
    if (this.isCircuitBroken) {
      return { broken: true, reason: this.circuitBrokenReason };
    }

    const snapshot = this.getSnapshot();

    if (snapshot.currentDrawdownPct >= this.circuitBreakerLimits.strategyMaxDrawdownPct) {
      return {
        broken: true,
        reason: `Drawdown strategia ${snapshot.currentDrawdownPct.toFixed(1)}% >= limite ${this.circuitBreakerLimits.strategyMaxDrawdownPct}%`,
      };
    }

    if (this.consecutiveLosses >= this.circuitBreakerLimits.maxConsecutiveLosses) {
      return {
        broken: true,
        reason: `${this.consecutiveLosses} perdite consecutive >= limite ${this.circuitBreakerLimits.maxConsecutiveLosses}`,
      };
    }

    return { broken: false, reason: null };
  }

  private updatePeakAndCheckCircuitBreaker(): void {
    const snapshot = this.getSnapshot();

    if (snapshot.totalBankroll > this.peakBankroll) {
      this.peakBankroll = snapshot.totalBankroll;
    }

    const cbCheck = this.checkCircuitBreaker();
    if (cbCheck.broken && !this.isCircuitBroken) {
      this.isCircuitBroken = true;
      this.circuitBrokenReason = cbCheck.reason;

      this.log({
        action: 'circuit_breaker',
        positionId: '',
        marketId: '',
        details: `CIRCUIT BREAKER ATTIVATO: ${cbCheck.reason}`,
        price: 0,
        quantity: 0,
        pnl: snapshot.totalPnl,
      });
    }
  }

  private getTierAvailable(tier: TierLevel): number {
    const allocated = this.tierAllocations.get(tier) ?? 0;
    const used = this.tierUsed.get(tier) ?? 0;
    return Math.max(0, allocated - used);
  }

  private log(entry: Omit<OperationLog, 'timestamp'>): void {
    this.operationLog.push({
      timestamp: new Date().toISOString(),
      ...entry,
    });
  }
}
