import { describe, it, expect } from 'vitest';
import {
  calculateMetrics,
  BacktestTrade,
  EquityPoint,
  BacktestMetrics,
} from '@/core/backtest/metrics';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrade(overrides: Partial<BacktestTrade> & { netPnl: number }): BacktestTrade {
  return {
    tradeId: 'bt_1',
    marketId: 'mkt_1',
    marketName: 'Test Market',
    entryPrice: 0.5,
    exitPrice: 0.6,
    stake: 100,
    quantity: 200,
    entryTimestamp: '2025-01-01T00:00:00.000Z',
    exitTimestamp: '2025-01-10T00:00:00.000Z',
    grossPnl: overrides.netPnl,
    returnPct: overrides.netPnl,
    slippageCost: 1,
    commissionCost: 0.5,
    exitReason: 'Take profit',
    estimatedProbability: 0.55,
    ...overrides,
  };
}

function makeEquityCurve(equities: number[], startDate = '2025-01-01'): EquityPoint[] {
  const points: EquityPoint[] = [];
  for (let i = 0; i < equities.length; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const prevEquity = i > 0 ? equities[i - 1] : equities[0];
    points.push({
      timestamp: date.toISOString().substring(0, 10),
      equity: equities[i],
      drawdownPct: 0, // calcolato internamente dalla funzione
      dailyReturn: i > 0 ? (equities[i] - prevEquity) / prevEquity : 0,
    });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BacktestMetrics - calculateMetrics', () => {
  it('restituisce metriche vuote per lista trade vuota', () => {
    const metrics = calculateMetrics([], [], 1000, 30);

    expect(metrics.totalTrades).toBe(0);
    expect(metrics.winRate).toBe(0);
    expect(metrics.roiTotal).toBe(0);
    expect(metrics.profitFactor).toBe(0);
    expect(metrics.sharpeRatio).toBe(0);
    expect(metrics.maxDrawdownPct).toBe(0);
  });

  it('calcola win rate correttamente', () => {
    const trades: BacktestTrade[] = [
      makeTrade({ tradeId: 'bt_1', netPnl: 20, grossPnl: 20 }),
      makeTrade({ tradeId: 'bt_2', netPnl: 15, grossPnl: 15 }),
      makeTrade({ tradeId: 'bt_3', netPnl: -10, grossPnl: -10 }),
      makeTrade({ tradeId: 'bt_4', netPnl: 5, grossPnl: 5 }),
    ];

    const curve = makeEquityCurve([1000, 1020, 1035, 1025, 1030]);
    const metrics = calculateMetrics(trades, curve, 1000, 30);

    expect(metrics.totalTrades).toBe(4);
    expect(metrics.winningTrades).toBe(3);
    expect(metrics.losingTrades).toBe(1);
    expect(metrics.winRate).toBe(75);
  });

  it('calcola ROI totale correttamente', () => {
    const trades: BacktestTrade[] = [
      makeTrade({ tradeId: 'bt_1', netPnl: 50, grossPnl: 50 }),
      makeTrade({ tradeId: 'bt_2', netPnl: -20, grossPnl: -20 }),
    ];

    const curve = makeEquityCurve([1000, 1050, 1030]);
    const metrics = calculateMetrics(trades, curve, 1000, 30);

    // Net profit = 50 + (-20) = 30
    // ROI = 30/1000 * 100 = 3%
    expect(metrics.roiTotal).toBeCloseTo(3, 1);
    expect(metrics.totalNetProfit).toBeCloseTo(30, 1);
  });

  it('calcola profit factor correttamente', () => {
    const trades: BacktestTrade[] = [
      makeTrade({ tradeId: 'bt_1', netPnl: 100, grossPnl: 100 }),
      makeTrade({ tradeId: 'bt_2', netPnl: 50, grossPnl: 50 }),
      makeTrade({ tradeId: 'bt_3', netPnl: -30, grossPnl: -30 }),
    ];

    const curve = makeEquityCurve([1000, 1100, 1150, 1120]);
    const metrics = calculateMetrics(trades, curve, 1000, 30);

    // Gross profit = 100 + 50 = 150
    // Gross loss = 30
    // PF = 150 / 30 = 5
    expect(metrics.profitFactor).toBeCloseTo(5, 1);
  });

  it('profit factor Infinity quando non ci sono perdite', () => {
    const trades: BacktestTrade[] = [
      makeTrade({ tradeId: 'bt_1', netPnl: 50, grossPnl: 50 }),
      makeTrade({ tradeId: 'bt_2', netPnl: 30, grossPnl: 30 }),
    ];

    const curve = makeEquityCurve([1000, 1050, 1080]);
    const metrics = calculateMetrics(trades, curve, 1000, 30);

    expect(metrics.profitFactor).toBe(Infinity);
  });

  it('calcola max drawdown dalla equity curve', () => {
    // Equity: 1000 -> 1100 -> 900 -> 1050
    // Peak: 1100, trough: 900, DD = 200/1100 = 18.18%
    const curve = makeEquityCurve([1000, 1100, 900, 1050]);
    const trades: BacktestTrade[] = [
      makeTrade({ tradeId: 'bt_1', netPnl: 50, grossPnl: 50 }),
    ];
    const metrics = calculateMetrics(trades, curve, 1000, 30);

    expect(metrics.maxDrawdownPct).toBeCloseTo(18.18, 1);
    expect(metrics.maxDrawdownAbs).toBeCloseTo(200, 0);
  });

  it('calcola consecutive wins/losses', () => {
    const trades: BacktestTrade[] = [
      makeTrade({ tradeId: 'bt_1', netPnl: 10, grossPnl: 10 }),
      makeTrade({ tradeId: 'bt_2', netPnl: 20, grossPnl: 20 }),
      makeTrade({ tradeId: 'bt_3', netPnl: 5, grossPnl: 5 }),
      makeTrade({ tradeId: 'bt_4', netPnl: -15, grossPnl: -15 }),
      makeTrade({ tradeId: 'bt_5', netPnl: -8, grossPnl: -8 }),
      makeTrade({ tradeId: 'bt_6', netPnl: 30, grossPnl: 30 }),
    ];

    const curve = makeEquityCurve([1000, 1010, 1030, 1035, 1020, 1012, 1042]);
    const metrics = calculateMetrics(trades, curve, 1000, 30);

    expect(metrics.maxConsecutiveWins).toBe(3);
    expect(metrics.maxConsecutiveLosses).toBe(2);
  });

  it('calcola average edge correttamente', () => {
    const trades: BacktestTrade[] = [
      makeTrade({ tradeId: 'bt_1', netPnl: 10, entryPrice: 0.40, estimatedProbability: 0.50 }),
      makeTrade({ tradeId: 'bt_2', netPnl: 5, entryPrice: 0.30, estimatedProbability: 0.45 }),
    ];

    const curve = makeEquityCurve([1000, 1010, 1015]);
    const metrics = calculateMetrics(trades, curve, 1000, 30);

    // Edge 1 = 0.50 - 0.40 = 0.10
    // Edge 2 = 0.45 - 0.30 = 0.15
    // Avg = 0.125
    expect(metrics.avgEdge).toBeCloseTo(0.125, 3);
  });

  it('calcola recovery factor correttamente', () => {
    const trades: BacktestTrade[] = [
      makeTrade({ tradeId: 'bt_1', netPnl: -100, grossPnl: -100 }),
      makeTrade({ tradeId: 'bt_2', netPnl: 200, grossPnl: 200 }),
    ];

    // Peak 1000, trough 900, DD abs = 100
    // Net profit = 100
    // Recovery factor = 100 / 100 = 1.0
    const curve = makeEquityCurve([1000, 900, 1100]);
    const metrics = calculateMetrics(trades, curve, 1000, 30);

    expect(metrics.recoveryFactor).toBeCloseTo(1.0, 1);
  });

  it('calcola sharpe ratio con rendimenti costanti', () => {
    // Tutti i daily returns uguali => stddev = 0 => sharpe = 0
    const curve = makeEquityCurve([1000, 1010, 1020.1, 1030.2]);
    const trades = [makeTrade({ tradeId: 'bt_1', netPnl: 30, grossPnl: 30 })];
    const metrics = calculateMetrics(trades, curve, 1000, 30);

    // Con rendimenti quasi uguali (~1%), lo stddev e' molto basso ma non zero
    // a causa di arrotondamenti. Il test verifica che non sia NaN.
    expect(Number.isFinite(metrics.sharpeRatio)).toBe(true);
  });

  it('calcola durata media trade in giorni', () => {
    const trades: BacktestTrade[] = [
      makeTrade({
        tradeId: 'bt_1',
        netPnl: 10,
        entryTimestamp: '2025-01-01T00:00:00.000Z',
        exitTimestamp: '2025-01-11T00:00:00.000Z', // 10 giorni
      }),
      makeTrade({
        tradeId: 'bt_2',
        netPnl: 5,
        entryTimestamp: '2025-01-05T00:00:00.000Z',
        exitTimestamp: '2025-01-25T00:00:00.000Z', // 20 giorni
      }),
    ];

    const curve = makeEquityCurve([1000, 1015]);
    const metrics = calculateMetrics(trades, curve, 1000, 30);

    // Media: (10 + 20) / 2 = 15 giorni
    expect(metrics.avgTradeDurationDays).toBeCloseTo(15, 0);
  });

  it('calcola ROI annualizzato correttamente', () => {
    const trades = [makeTrade({ tradeId: 'bt_1', netPnl: 100, grossPnl: 100 })];
    const curve = makeEquityCurve([1000, 1100]);
    const metrics = calculateMetrics(trades, curve, 1000, 365);

    // 10% in 365 giorni => annualizzato = 10%
    expect(metrics.roiAnnualized).toBeCloseTo(10, 0);
  });

  it('best e worst trade sono calcolati', () => {
    const trades: BacktestTrade[] = [
      makeTrade({ tradeId: 'bt_1', netPnl: 50, returnPct: 50 }),
      makeTrade({ tradeId: 'bt_2', netPnl: -30, returnPct: -30 }),
      makeTrade({ tradeId: 'bt_3', netPnl: 10, returnPct: 10 }),
    ];

    const curve = makeEquityCurve([1000, 1050, 1020, 1030]);
    const metrics = calculateMetrics(trades, curve, 1000, 30);

    expect(metrics.bestTrade).toBe(50);
    expect(metrics.worstTrade).toBe(-30);
  });
});
