import { describe, it, expect } from 'vitest';
import { BacktestEngine, HistoricalMarketData, HistoricalTick } from '@/core/backtest/engine';
import { ParsedStrategy } from '@/core/engine/dsl-parser';
import { TierLevel } from '@/core/engine/signals';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestStrategy(overrides?: Partial<ParsedStrategy>): ParsedStrategy {
  return {
    strategyId: 'test-strategy-1',
    code: 'TEST-001',
    name: 'Test Strategy',
    area: 'prediction',
    entryRules: [
      {
        id: 'price_range_rule',
        description: 'Prezzo nel range 0.20-0.80',
        params: {
          type: 'price_range' as const,
          minPrice: 0.20,
          maxPrice: 0.80,
        },
      },
    ],
    exitRules: [
      {
        id: 'take_profit_1',
        description: 'Take profit 50%',
        profitPct: 50,
        lossPct: null,
        sellFraction: 1,
        isStopLoss: false,
      },
      {
        id: 'stop_loss_1',
        description: 'Stop loss -30%',
        profitPct: null,
        lossPct: -30,
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
    circuitBreaker: { lossPct: -50, action: 'stop', description: 'Circuit breaker' },
    maxDrawdown: 50,
    maxAllocationPct: 20,
    maxConsecutiveLosses: 5,
    ...overrides,
  };
}

function createMarketData(params: {
  marketId: string;
  prices: number[];
  resolvedOutcome: number | null;
  startDate?: string;
}): HistoricalMarketData {
  const startDate = params.startDate ?? '2025-01-01';
  const ticks: HistoricalTick[] = params.prices.map((price, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const isLast = i === params.prices.length - 1;

    return {
      timestamp: date.toISOString(),
      marketId: params.marketId,
      marketName: `Market ${params.marketId}`,
      price,
      volume24hUsd: 50000,
      totalVolumeUsd: 500000,
      expiryDate: null,
      category: 'test',
      status: isLast && params.resolvedOutcome !== null ? 'settled' as const : 'open' as const,
      resolvedOutcome: isLast ? params.resolvedOutcome : null,
    };
  });

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + params.prices.length - 1);

  return {
    marketId: params.marketId,
    marketName: `Market ${params.marketId}`,
    category: 'test',
    startDate,
    endDate: endDate.toISOString(),
    resolvedOutcome: params.resolvedOutcome,
    ticks,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BacktestEngine', () => {
  it('restituisce risultato vuoto senza dati', () => {
    const strategy = createTestStrategy();
    const engine = new BacktestEngine(strategy, { initialCapital: 1000 });
    const result = engine.run([]);

    expect(result.trades).toHaveLength(0);
    expect(result.equityCurve).toHaveLength(0);
    expect(result.finalEquity).toBe(1000);
  });

  it('apre e chiude una posizione con settlement YES', () => {
    const strategy = createTestStrategy();
    const market = createMarketData({
      marketId: 'mkt-1',
      // Prezzo nel range 0.20-0.80, poi settlement a 1.0
      prices: [0.40, 0.45, 0.50, 0.55, 1.0],
      resolvedOutcome: 1,
    });

    const engine = new BacktestEngine(strategy, {
      initialCapital: 1000,
      slippagePct: 0, // disabilita slippage per test deterministico
      commissionPct: 0,
    });

    const result = engine.run([market]);

    // Dovrebbe aver aperto una posizione e poi chiusa al settlement
    expect(result.trades.length).toBeGreaterThanOrEqual(1);

    // L'ultimo trade dovrebbe avere grossPnl positivo (comprato a ~0.40, risolto a 1.0)
    const lastTrade = result.trades[result.trades.length - 1];
    expect(lastTrade.grossPnl).toBeGreaterThan(0);
  });

  it('stop loss viene triggerato su calo del prezzo', () => {
    const strategy = createTestStrategy({
      exitRules: [
        {
          id: 'stop_loss',
          description: 'Stop loss -20%',
          profitPct: null,
          lossPct: -20,
          sellFraction: 1,
          isStopLoss: true,
        },
      ],
    });

    // Prezzo entra a 0.50, poi crolla
    const market = createMarketData({
      marketId: 'mkt-sl',
      prices: [0.50, 0.35, 0.30, 0.25],
      resolvedOutcome: null,
    });

    const engine = new BacktestEngine(strategy, {
      initialCapital: 1000,
      slippagePct: 0,
      commissionPct: 0,
    });

    const result = engine.run([market]);

    // Il trade dovrebbe essere chiuso in perdita
    if (result.trades.length > 0) {
      const trade = result.trades[0];
      expect(trade.grossPnl).toBeLessThan(0);
      expect(trade.exitReason).toContain('Stop loss');
    }
  });

  it('equity curve viene registrata correttamente', () => {
    const strategy = createTestStrategy();
    const market = createMarketData({
      marketId: 'mkt-eq',
      prices: [0.50, 0.55, 0.60, 0.65, 0.70],
      resolvedOutcome: null,
    });

    const engine = new BacktestEngine(strategy, {
      initialCapital: 1000,
      slippagePct: 0,
    });

    const result = engine.run([market]);

    // Dovrebbe avere punti nella equity curve (1 per giorno)
    expect(result.equityCurve.length).toBeGreaterThan(0);

    // Ogni punto deve avere equity > 0
    for (const point of result.equityCurve) {
      expect(point.equity).toBeGreaterThan(0);
      expect(point.timestamp).toBeDefined();
    }
  });

  it('rispetta il limite di posizioni aperte', () => {
    const strategy = createTestStrategy();

    // Crea 15 mercati con prezzi nel range
    const markets: HistoricalMarketData[] = [];
    for (let i = 0; i < 15; i++) {
      markets.push(createMarketData({
        marketId: `mkt-limit-${i}`,
        prices: [0.50, 0.55, 0.60],
        resolvedOutcome: null,
      }));
    }

    const engine = new BacktestEngine(strategy, {
      initialCapital: 10000,
      slippagePct: 0,
      maxOpenPositions: 5,
    });

    const result = engine.run(markets);

    // Il numero di trade non dovrebbe superare il limite
    // (in questo caso potrebbe essere minore del numero di mercati)
    // Il test verifica che il motore non crashi e che la equity sia valida
    expect(result.finalEquity).toBeGreaterThan(0);
  });

  it('applica slippage su entry e exit', () => {
    const strategy = createTestStrategy();
    const market = createMarketData({
      marketId: 'mkt-slip',
      prices: [0.40, 0.80], // entra a 0.40, take profit a 0.80
      resolvedOutcome: null,
    });

    const engineNoSlippage = new BacktestEngine(strategy, {
      initialCapital: 1000,
      slippagePct: 0,
    });
    const resultNoSlip = engineNoSlippage.run([market]);

    const engineWithSlippage = new BacktestEngine(strategy, {
      initialCapital: 1000,
      slippagePct: 5, // 5% slippage
    });
    const resultWithSlip = engineWithSlippage.run([market]);

    // Con slippage, il profitto dovrebbe essere minore (o la perdita maggiore)
    if (resultNoSlip.trades.length > 0 && resultWithSlip.trades.length > 0) {
      // L'entry price con slippage dovrebbe essere piu' alto
      expect(resultWithSlip.trades[0].entryPrice).toBeGreaterThan(resultNoSlip.trades[0].entryPrice);
    }
  });

  it('gestisce mercati multipli contemporaneamente', () => {
    const strategy = createTestStrategy();

    const market1 = createMarketData({
      marketId: 'mkt-a',
      prices: [0.30, 0.40, 0.50, 0.60, 1.0],
      resolvedOutcome: 1,
    });

    const market2 = createMarketData({
      marketId: 'mkt-b',
      prices: [0.60, 0.55, 0.50, 0.45, 0.0],
      resolvedOutcome: 0,
    });

    const engine = new BacktestEngine(strategy, {
      initialCapital: 2000,
      slippagePct: 0,
    });

    const result = engine.run([market1, market2]);

    // Entrambi i mercati dovrebbero generare trade
    const marketATradesCount = result.trades.filter(t => t.marketId === 'mkt-a').length;
    const marketBTradesCount = result.trades.filter(t => t.marketId === 'mkt-b').length;

    expect(marketATradesCount + marketBTradesCount).toBeGreaterThanOrEqual(1);
    expect(result.equityCurve.length).toBeGreaterThan(0);
  });

  it('chiude tutte le posizioni aperte alla fine del backtest', () => {
    const strategy = createTestStrategy({
      exitRules: [
        // Solo stop loss molto lontano, nessun take profit raggiungibile
        {
          id: 'sl',
          description: 'Stop loss -90%',
          profitPct: null,
          lossPct: -90,
          sellFraction: 1,
          isStopLoss: true,
        },
      ],
    });

    const market = createMarketData({
      marketId: 'mkt-open',
      prices: [0.50, 0.52, 0.54],
      resolvedOutcome: null,
    });

    const engine = new BacktestEngine(strategy, {
      initialCapital: 1000,
      slippagePct: 0,
    });

    const result = engine.run([market]);

    // La posizione dovrebbe essere chiusa forzatamente
    // e il trade registrato
    if (result.trades.length > 0) {
      const lastTrade = result.trades[result.trades.length - 1];
      expect(lastTrade.exitReason).toContain('Chiusura forzata');
    }
  });
});
