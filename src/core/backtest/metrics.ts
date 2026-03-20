/**
 * Backtest Metrics Calculator
 *
 * Calcola tutte le metriche post-backtest in modo matematicamente rigoroso.
 * Nessuna dipendenza esterna.
 */

export interface BacktestTrade {
  tradeId: string;
  marketId: string;
  marketName: string;
  entryPrice: number;
  exitPrice: number;
  stake: number;
  quantity: number;
  entryTimestamp: string;
  exitTimestamp: string;
  grossPnl: number;
  netPnl: number;
  returnPct: number;
  slippageCost: number;
  commissionCost: number;
  exitReason: string;
  estimatedProbability: number;
}

export interface EquityPoint {
  timestamp: string;
  equity: number;
  drawdownPct: number;
  dailyReturn: number;
}

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  roiTotal: number;
  roiAnnualized: number;
  profitFactor: number;
  maxDrawdownPct: number;
  maxDrawdownAbs: number;
  sharpeRatio: number;
  avgTradeDurationMs: number;
  avgTradeDurationDays: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  avgEdge: number;
  recoveryFactor: number;
  totalGrossProfit: number;
  totalGrossLoss: number;
  totalNetProfit: number;
  totalSlippageCost: number;
  totalCommissionCost: number;
  avgTradeReturn: number;
  bestTrade: number;
  worstTrade: number;
}

/**
 * Calcola tutte le metriche di backtest dai trade e dalla equity curve.
 */
export function calculateMetrics(
  trades: BacktestTrade[],
  equityCurve: EquityPoint[],
  initialCapital: number,
  periodDays: number,
): BacktestMetrics {
  const totalTrades = trades.length;

  if (totalTrades === 0) {
    return emptyMetrics();
  }

  // Win/loss separation
  const winningTrades = trades.filter(t => t.netPnl > 0).length;
  const losingTrades = trades.filter(t => t.netPnl < 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

  // P&L totals
  const totalGrossProfit = trades
    .filter(t => t.grossPnl > 0)
    .reduce((sum, t) => sum + t.grossPnl, 0);
  const totalGrossLoss = Math.abs(
    trades
      .filter(t => t.grossPnl < 0)
      .reduce((sum, t) => sum + t.grossPnl, 0),
  );
  const totalNetProfit = trades.reduce((sum, t) => sum + t.netPnl, 0);
  const totalSlippageCost = trades.reduce((sum, t) => sum + t.slippageCost, 0);
  const totalCommissionCost = trades.reduce((sum, t) => sum + t.commissionCost, 0);

  // ROI
  const roiTotal = initialCapital > 0 ? (totalNetProfit / initialCapital) * 100 : 0;
  const roiAnnualized = periodDays > 0
    ? (Math.pow(1 + totalNetProfit / initialCapital, 365 / periodDays) - 1) * 100
    : 0;

  // Profit Factor
  const profitFactor = totalGrossLoss > 0 ? totalGrossProfit / totalGrossLoss : totalGrossProfit > 0 ? Infinity : 0;

  // Max Drawdown (dalla equity curve)
  const { maxDrawdownPct, maxDrawdownAbs } = calculateMaxDrawdown(equityCurve);

  // Sharpe Ratio (risk-free rate = 0)
  const sharpeRatio = calculateSharpeRatio(equityCurve);

  // Average trade duration
  const avgTradeDurationMs = calculateAvgTradeDuration(trades);
  const avgTradeDurationDays = avgTradeDurationMs / (1000 * 60 * 60 * 24);

  // Consecutive wins/losses
  const { maxConsecutiveWins, maxConsecutiveLosses } = calculateConsecutiveStreaks(trades);

  // Average edge (differenza tra probabilita stimata e prezzo mercato)
  const avgEdge = calculateAvgEdge(trades);

  // Recovery factor
  const recoveryFactor = maxDrawdownAbs > 0 ? totalNetProfit / maxDrawdownAbs : totalNetProfit > 0 ? Infinity : 0;

  // Trade-level stats
  const returns = trades.map(t => t.returnPct);
  const avgTradeReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const bestTrade = Math.max(...returns);
  const worstTrade = Math.min(...returns);

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    roiTotal,
    roiAnnualized,
    profitFactor,
    maxDrawdownPct,
    maxDrawdownAbs,
    sharpeRatio,
    avgTradeDurationMs,
    avgTradeDurationDays,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    avgEdge,
    recoveryFactor,
    totalGrossProfit,
    totalGrossLoss,
    totalNetProfit,
    totalSlippageCost,
    totalCommissionCost,
    avgTradeReturn,
    bestTrade,
    worstTrade,
  };
}

function calculateMaxDrawdown(equityCurve: EquityPoint[]): { maxDrawdownPct: number; maxDrawdownAbs: number } {
  if (equityCurve.length === 0) {
    return { maxDrawdownPct: 0, maxDrawdownAbs: 0 };
  }

  let peak = equityCurve[0].equity;
  let maxDrawdownPct = 0;
  let maxDrawdownAbs = 0;

  for (const point of equityCurve) {
    if (point.equity > peak) {
      peak = point.equity;
    }

    const drawdownAbs = peak - point.equity;
    const drawdownPct = peak > 0 ? (drawdownAbs / peak) * 100 : 0;

    if (drawdownPct > maxDrawdownPct) {
      maxDrawdownPct = drawdownPct;
      maxDrawdownAbs = drawdownAbs;
    }
  }

  return { maxDrawdownPct, maxDrawdownAbs };
}

function calculateSharpeRatio(equityCurve: EquityPoint[]): number {
  const dailyReturns = equityCurve.map(p => p.dailyReturn).filter(r => r !== 0 || equityCurve.length > 1);

  if (dailyReturns.length < 2) {
    return 0;
  }

  const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (dailyReturns.length - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return 0;
  }

  // Annualizzato: sqrt(252) per trading days, ma per prediction markets usiamo sqrt(365)
  return (mean / stdDev) * Math.sqrt(365);
}

function calculateAvgTradeDuration(trades: BacktestTrade[]): number {
  if (trades.length === 0) return 0;

  const totalDuration = trades.reduce((sum, t) => {
    const entry = new Date(t.entryTimestamp).getTime();
    const exit = new Date(t.exitTimestamp).getTime();
    return sum + (exit - entry);
  }, 0);

  return totalDuration / trades.length;
}

function calculateConsecutiveStreaks(trades: BacktestTrade[]): {
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
} {
  let maxWins = 0;
  let maxLosses = 0;
  let currentWins = 0;
  let currentLosses = 0;

  for (const trade of trades) {
    if (trade.netPnl > 0) {
      currentWins++;
      currentLosses = 0;
      if (currentWins > maxWins) maxWins = currentWins;
    } else if (trade.netPnl < 0) {
      currentLosses++;
      currentWins = 0;
      if (currentLosses > maxLosses) maxLosses = currentLosses;
    } else {
      // breakeven: reset entrambi
      currentWins = 0;
      currentLosses = 0;
    }
  }

  return { maxConsecutiveWins: maxWins, maxConsecutiveLosses: maxLosses };
}

function calculateAvgEdge(trades: BacktestTrade[]): number {
  const tradesWithEdge = trades.filter(t => t.estimatedProbability > 0);
  if (tradesWithEdge.length === 0) return 0;

  const totalEdge = tradesWithEdge.reduce((sum, t) => {
    // Edge = probabilita stimata - prezzo pagato (in termini di probabilita)
    const edge = t.estimatedProbability - t.entryPrice;
    return sum + edge;
  }, 0);

  return totalEdge / tradesWithEdge.length;
}

function emptyMetrics(): BacktestMetrics {
  return {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    roiTotal: 0,
    roiAnnualized: 0,
    profitFactor: 0,
    maxDrawdownPct: 0,
    maxDrawdownAbs: 0,
    sharpeRatio: 0,
    avgTradeDurationMs: 0,
    avgTradeDurationDays: 0,
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
    avgEdge: 0,
    recoveryFactor: 0,
    totalGrossProfit: 0,
    totalGrossLoss: 0,
    totalNetProfit: 0,
    totalSlippageCost: 0,
    totalCommissionCost: 0,
    avgTradeReturn: 0,
    bestTrade: 0,
    worstTrade: 0,
  };
}
