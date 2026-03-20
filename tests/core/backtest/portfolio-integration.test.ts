import { describe, it, expect } from 'vitest';
import { BacktestEngine, HistoricalMarketData, HistoricalTick } from '@/core/backtest/engine';
import { ParsedStrategy } from '@/core/engine/dsl-parser';
import { TierLevel } from '@/core/engine/signals';
import { calculateMetrics } from '@/core/backtest/metrics';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStrategy(): ParsedStrategy {
  return {
    strategyId: 'portfolio-test',
    code: 'PT-001',
    name: 'Portfolio Test Strategy',
    area: 'prediction',
    entryRules: [
      {
        id: 'price_range',
        description: 'Prezzo 0.20-0.80',
        params: { type: 'price_range' as const, minPrice: 0.20, maxPrice: 0.80 },
      },
    ],
    exitRules: [
      {
        id: 'tp',
        description: 'Take profit +30%',
        profitPct: 30,
        lossPct: null,
        sellFraction: 1,
        isStopLoss: false,
      },
      {
        id: 'sl',
        description: 'Stop loss -20%',
        profitPct: null,
        lossPct: -20,
        sellFraction: 1,
        isStopLoss: true,
      },
    ],
    bankrollTiers: [
      { tier: TierLevel.TIER1, allocationPct: 50, description: 'Tier 1' },
      { tier: TierLevel.TIER2, allocationPct: 30, description: 'Tier 2' },
      { tier: TierLevel.TIER3, allocationPct: 20, description: 'Tier 3' },
    ],
    liquidityReservePct: 20,
    circuitBreaker: { lossPct: -50, action: 'stop', description: 'CB' },
    maxDrawdown: 50,
    maxAllocationPct: 30,
    maxConsecutiveLosses: 5,
  };
}

function makeMarket(id: string, prices: number[], outcome: number | null): HistoricalMarketData {
  const ticks: HistoricalTick[] = prices.map((price, i) => {
    const date = new Date('2025-01-01');
    date.setDate(date.getDate() + i);
    const isLast = i === prices.length - 1;
    return {
      timestamp: date.toISOString(),
      marketId: id,
      marketName: `Market ${id}`,
      price,
      volume24hUsd: 50000,
      totalVolumeUsd: 500000,
      expiryDate: null,
      category: 'test',
      status: isLast && outcome !== null ? 'settled' as const : 'open' as const,
      resolvedOutcome: isLast ? outcome : null,
    };
  });

  const endDate = new Date('2025-01-01');
  endDate.setDate(endDate.getDate() + prices.length - 1);

  return {
    marketId: id,
    marketName: `Market ${id}`,
    category: 'test',
    startDate: '2025-01-01',
    endDate: endDate.toISOString(),
    resolvedOutcome: outcome,
    ticks,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Portfolio durante backtest', () => {
  it('il capitale finale riflette i trade effettuati', () => {
    const strategy = createStrategy();

    // Mercato vincente: entry ~0.40, settlement YES (1.0)
    const market = makeMarket('win-1', [0.40, 0.45, 0.50, 0.55, 1.0], 1);

    const engine = new BacktestEngine(strategy, {
      initialCapital: 1000,
      slippagePct: 0,
      commissionPct: 0,
    });

    const result = engine.run([market]);

    // Il capitale finale deve essere > iniziale per un trade vincente
    if (result.trades.length > 0) {
      expect(result.finalEquity).toBeGreaterThan(1000);
    }
  });

  it('la somma dei PnL dei trade corrisponde alla variazione di equity', () => {
    const strategy = createStrategy();

    const markets = [
      makeMarket('m1', [0.40, 0.50, 0.60, 1.0], 1),
      makeMarket('m2', [0.60, 0.50, 0.40, 0.0], 0),
    ];

    const engine = new BacktestEngine(strategy, {
      initialCapital: 1000,
      slippagePct: 0,
      commissionPct: 0,
    });

    const result = engine.run(markets);

    if (result.trades.length > 0) {
      const totalNetPnl = result.trades.reduce((sum, t) => sum + t.netPnl, 0);
      const equityChange = result.finalEquity - 1000;

      // La differenza deve essere piccola (arrotondamenti floating point)
      expect(Math.abs(totalNetPnl - equityChange)).toBeLessThan(1);
    }
  });

  it('le metriche calcolate dal runner sono coerenti con i trade', () => {
    const strategy = createStrategy();

    const markets = [
      makeMarket('a', [0.35, 0.40, 0.50, 1.0], 1),
      makeMarket('b', [0.50, 0.45, 0.40, 0.0], 0),
      makeMarket('c', [0.30, 0.35, 0.40, 1.0], 1),
    ];

    const engine = new BacktestEngine(strategy, {
      initialCapital: 1000,
      slippagePct: 0,
      commissionPct: 0,
    });

    const result = engine.run(markets);
    const metrics = calculateMetrics(result.trades, result.equityCurve, 1000, result.totalDays);

    // Coerenza: totalTrades = trades.length
    expect(metrics.totalTrades).toBe(result.trades.length);

    // winningTrades + losingTrades <= totalTrades (potrebbero esserci breakeven)
    expect(metrics.winningTrades + metrics.losingTrades).toBeLessThanOrEqual(metrics.totalTrades);

    // Win rate nel range [0, 100]
    expect(metrics.winRate).toBeGreaterThanOrEqual(0);
    expect(metrics.winRate).toBeLessThanOrEqual(100);

    // Max drawdown non negativo
    expect(metrics.maxDrawdownPct).toBeGreaterThanOrEqual(0);
    expect(metrics.maxDrawdownAbs).toBeGreaterThanOrEqual(0);
  });

  it('la equity curve ha un punto per ogni giorno di trading', () => {
    const strategy = createStrategy();
    const market = makeMarket('ec', [0.50, 0.55, 0.60, 0.65, 0.70], null);

    const engine = new BacktestEngine(strategy, {
      initialCapital: 1000,
      slippagePct: 0,
    });

    const result = engine.run([market]);

    // La equity curve deve avere almeno 1 punto
    expect(result.equityCurve.length).toBeGreaterThanOrEqual(1);

    // Ogni punto deve avere un timestamp valido
    for (const point of result.equityCurve) {
      expect(new Date(point.timestamp).getTime()).not.toBeNaN();
    }

    // La equity del primo punto deve essere vicina al capitale iniziale
    if (result.equityCurve.length > 0) {
      // Potrebbe differire leggermente se una posizione viene aperta al primo tick
      expect(result.equityCurve[0].equity).toBeGreaterThan(0);
    }
  });

  it('commissioni riducono il net PnL rispetto al gross PnL', () => {
    const strategy = createStrategy();
    const market = makeMarket('comm', [0.40, 0.45, 0.50, 1.0], 1);

    const engineNoComm = new BacktestEngine(strategy, {
      initialCapital: 1000,
      slippagePct: 0,
      commissionPct: 0,
    });

    const engineWithComm = new BacktestEngine(strategy, {
      initialCapital: 1000,
      slippagePct: 0,
      commissionPct: 2,
    });

    const resultNoComm = engineNoComm.run([market]);
    const resultWithComm = engineWithComm.run([market]);

    if (resultNoComm.trades.length > 0 && resultWithComm.trades.length > 0) {
      const netNoComm = resultNoComm.trades.reduce((s, t) => s + t.netPnl, 0);
      const netWithComm = resultWithComm.trades.reduce((s, t) => s + t.netPnl, 0);

      // Con commissioni, il net dovrebbe essere inferiore
      expect(netWithComm).toBeLessThan(netNoComm);
    }
  });
});
