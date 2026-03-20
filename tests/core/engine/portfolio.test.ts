import { describe, it, expect } from 'vitest';
import { VirtualPortfolio, CircuitBreakerLimits } from '@/core/engine/portfolio';
import { TierLevel } from '@/core/engine/signals';

const TIERS = [
  { tier: TierLevel.TIER1, allocationPct: 50 },
  { tier: TierLevel.TIER2, allocationPct: 30 },
  { tier: TierLevel.TIER3, allocationPct: 20 },
];

const CB_LIMITS: CircuitBreakerLimits = {
  strategyMaxDrawdownPct: 50,
  areaMaxDrawdownPct: 25,
  globalMaxDrawdownPct: 30,
  maxConsecutiveLosses: 5,
};

function createPortfolio(bankroll = 1000): VirtualPortfolio {
  return new VirtualPortfolio(bankroll, TIERS, 20, CB_LIMITS);
}

describe('VirtualPortfolio', () => {
  it('inizializza con bankroll corretto', () => {
    const portfolio = createPortfolio(1000);
    const snap = portfolio.getSnapshot();

    expect(snap.totalBankroll).toBe(1000);
    expect(snap.initialBankroll).toBe(1000);
    expect(snap.availableCash).toBe(1000);
    expect(snap.lockedInPositions).toBe(0);
    expect(snap.realizedPnl).toBe(0);
    expect(snap.openPositions).toHaveLength(0);
  });

  it('allocazione tier rispetta riserva di liquidita', () => {
    const portfolio = createPortfolio(1000);
    const snap = portfolio.getSnapshot();

    // 1000 * (1 - 20%) = 800 deployable
    const tier1 = snap.tierBankrolls.find(t => t.tier === TierLevel.TIER1);
    expect(tier1!.allocated).toBe(400); // 800 * 50%

    const tier2 = snap.tierBankrolls.find(t => t.tier === TierLevel.TIER2);
    expect(tier2!.allocated).toBe(240); // 800 * 30%

    const tier3 = snap.tierBankrolls.find(t => t.tier === TierLevel.TIER3);
    expect(tier3!.allocated).toBe(160); // 800 * 20%
  });

  it('apre una posizione e aggiorna cash/locked', () => {
    const portfolio = createPortfolio(1000);

    const pos = portfolio.openPosition({
      marketId: 'mkt-001',
      marketName: 'Test Market',
      strategyId: 'strat-001',
      tier: TierLevel.TIER1,
      price: 0.25,
      stake: 100,
    });

    expect(pos).not.toBeNull();
    expect(pos!.entryPrice).toBe(0.25);
    expect(pos!.stake).toBe(100);
    expect(pos!.quantity).toBe(400); // 100 / 0.25

    const snap = portfolio.getSnapshot();
    expect(snap.availableCash).toBe(900);
    expect(snap.lockedInPositions).toBe(100);
    expect(snap.openPositions).toHaveLength(1);
  });

  it('chiude una posizione con profitto', () => {
    const portfolio = createPortfolio(1000);

    const pos = portfolio.openPosition({
      marketId: 'mkt-001',
      marketName: 'Test Market',
      strategyId: 'strat-001',
      tier: TierLevel.TIER1,
      price: 0.25,
      stake: 100,
    })!;

    const closed = portfolio.closePosition(pos.id, 0.50, 1.0, 'take_profit');

    expect(closed).not.toBeNull();
    expect(closed!.entryPrice).toBe(0.25);
    expect(closed!.exitPrice).toBe(0.50);
    expect(closed!.grossPnl).toBe(100); // 400 * (0.50 - 0.25) = 100
    expect(closed!.returnPct).toBe(100); // +100%

    const snap = portfolio.getSnapshot();
    expect(snap.openPositions).toHaveLength(0);
    expect(snap.realizedPnl).toBe(100);
    expect(snap.consecutiveLosses).toBe(0);
  });

  it('chiude una posizione con perdita e incrementa consecutive losses', () => {
    const portfolio = createPortfolio(1000);

    const pos = portfolio.openPosition({
      marketId: 'mkt-001',
      marketName: 'Test Market',
      strategyId: 'strat-001',
      tier: TierLevel.TIER1,
      price: 0.25,
      stake: 100,
    })!;

    const closed = portfolio.closePosition(pos.id, 0.15, 1.0, 'stop_loss');

    expect(closed!.grossPnl).toBe(-40); // 400 * (0.15 - 0.25) = -40
    expect(closed!.returnPct).toBe(-40); // -40%

    const snap = portfolio.getSnapshot();
    expect(snap.consecutiveLosses).toBe(1);
  });

  it('chiusura parziale lascia posizione aperta', () => {
    const portfolio = createPortfolio(1000);

    const pos = portfolio.openPosition({
      marketId: 'mkt-001',
      marketName: 'Test Market',
      strategyId: 'strat-001',
      tier: TierLevel.TIER1,
      price: 0.25,
      stake: 100,
    })!;

    portfolio.closePosition(pos.id, 0.50, 0.333, 'take_profit_1');

    const snap = portfolio.getSnapshot();
    expect(snap.openPositions).toHaveLength(1);
    expect(snap.closedPositions).toHaveLength(1);

    const remaining = snap.openPositions[0];
    expect(remaining.remainingQuantity).toBeCloseTo(400 * (1 - 0.333), 0);
  });

  it('aggiorna prezzo mercato e P&L non realizzato', () => {
    const portfolio = createPortfolio(1000);

    portfolio.openPosition({
      marketId: 'mkt-001',
      marketName: 'Test Market',
      strategyId: 'strat-001',
      tier: TierLevel.TIER1,
      price: 0.25,
      stake: 100,
    });

    portfolio.updateMarketPrice('mkt-001', 0.35);

    const snap = portfolio.getSnapshot();
    const pos = snap.openPositions[0];

    expect(pos.currentPrice).toBe(0.35);
    expect(pos.unrealizedPnl).toBe(40); // 400 * (0.35 - 0.25) = 40
    expect(pos.unrealizedPnlPct).toBe(40); // +40%
  });

  it('circuit breaker per consecutive losses', () => {
    const cbLimits = { ...CB_LIMITS, maxConsecutiveLosses: 3 };
    const portfolio = new VirtualPortfolio(1000, TIERS, 20, cbLimits);

    for (let i = 0; i < 3; i++) {
      const pos = portfolio.openPosition({
        marketId: `mkt-${i}`,
        marketName: `Market ${i}`,
        strategyId: 'strat-001',
        tier: TierLevel.TIER3,
        price: 0.25,
        stake: 50,
      })!;

      portfolio.closePosition(pos.id, 0.15, 1.0, 'stop_loss');
    }

    const snap = portfolio.getSnapshot();
    expect(snap.consecutiveLosses).toBe(3);
    expect(snap.isCircuitBroken).toBe(true);
  });

  it('non apre posizioni quando circuit breaker attivo', () => {
    const cbLimits = { ...CB_LIMITS, maxConsecutiveLosses: 1 };
    const portfolio = new VirtualPortfolio(1000, TIERS, 20, cbLimits);

    const pos = portfolio.openPosition({
      marketId: 'mkt-001',
      marketName: 'Market 1',
      strategyId: 'strat-001',
      tier: TierLevel.TIER1,
      price: 0.25,
      stake: 50,
    })!;

    portfolio.closePosition(pos.id, 0.10, 1.0, 'stop_loss');

    const blocked = portfolio.openPosition({
      marketId: 'mkt-002',
      marketName: 'Market 2',
      strategyId: 'strat-001',
      tier: TierLevel.TIER1,
      price: 0.25,
      stake: 50,
    });

    expect(blocked).toBeNull();
  });

  it('limita stake al disponibile nel tier', () => {
    const portfolio = createPortfolio(1000);

    // Tier3 ha 160 disponibili
    const pos = portfolio.openPosition({
      marketId: 'mkt-001',
      marketName: 'Test Market',
      strategyId: 'strat-001',
      tier: TierLevel.TIER3,
      price: 0.25,
      stake: 500, // richiede piu del disponibile
    });

    expect(pos).not.toBeNull();
    expect(pos!.stake).toBe(160); // limitato a 160 (tier3 allocation)
  });

  it('operation log traccia tutte le operazioni', () => {
    const portfolio = createPortfolio(1000);

    const pos = portfolio.openPosition({
      marketId: 'mkt-001',
      marketName: 'Test',
      strategyId: 'strat-001',
      tier: TierLevel.TIER1,
      price: 0.25,
      stake: 100,
    })!;

    portfolio.closePosition(pos.id, 0.50, 1.0, 'take_profit');

    const snap = portfolio.getSnapshot();
    expect(snap.operationLog).toHaveLength(2);
    expect(snap.operationLog[0].action).toBe('open');
    expect(snap.operationLog[1].action).toBe('full_close');
  });

  it('getPositionByMarket trova posizione esistente', () => {
    const portfolio = createPortfolio(1000);

    portfolio.openPosition({
      marketId: 'mkt-001',
      marketName: 'Test',
      strategyId: 'strat-001',
      tier: TierLevel.TIER1,
      price: 0.25,
      stake: 100,
    });

    expect(portfolio.getPositionByMarket('mkt-001')).not.toBeNull();
    expect(portfolio.getPositionByMarket('mkt-999')).toBeNull();
  });
});
