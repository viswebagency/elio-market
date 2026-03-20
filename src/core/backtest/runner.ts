/**
 * Backtest Runner — Orchestratore
 *
 * Coordina il caricamento dati, l'esecuzione del backtest engine
 * e il calcolo delle metriche. Restituisce un report strutturato completo.
 */

import { ParsedStrategy } from '../engine/dsl-parser';
import { BacktestEngine, BacktestConfig, HistoricalMarketData } from './engine';
import { BacktestTrade, EquityPoint, BacktestMetrics, calculateMetrics } from './metrics';
import { loadHistoricalData, DataLoaderConfig } from './data-loader';
import { MarketArea } from '../types/common';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BacktestRunParams {
  strategy: ParsedStrategy;
  /** Periodo in giorni per il backtest */
  periodDays: number;
  /** Capitale iniziale in USD */
  initialCapital: number;
  /** Slippage percentuale (default 1%) */
  slippagePct?: number;
  /** Commissione percentuale (default 0) */
  commissionPct?: number;
  /** Massimo posizioni aperte (default 10) */
  maxOpenPositions?: number;
  /** Numero massimo di mercati da caricare */
  maxMarkets?: number;
  /** Categoria da filtrare */
  category?: string;
  /** Volume minimo per mercato */
  minVolume?: number;
}

export interface BacktestReport {
  strategyId: string;
  strategyName: string;
  strategyCode: string;
  area: string;
  runTimestamp: string;
  config: {
    initialCapital: number;
    slippagePct: number;
    commissionPct: number;
    maxOpenPositions: number;
    periodDays: number;
    maxMarkets: number;
  };
  marketsAnalyzed: number;
  metrics: BacktestMetrics;
  equityCurve: EquityPoint[];
  trades: BacktestTrade[];
  marketsSummary: MarketSummary[];
}

export interface MarketSummary {
  marketId: string;
  marketName: string;
  category: string;
  resolvedOutcome: number | null;
  tradesCount: number;
  totalPnl: number;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runBacktest(params: BacktestRunParams): Promise<BacktestReport> {
  const {
    strategy,
    periodDays,
    initialCapital,
    slippagePct = 1,
    commissionPct = 0,
    maxOpenPositions = 10,
    maxMarkets = 100,
    category,
    minVolume,
  } = params;

  // 1. Carica dati storici
  const loaderConfig: Partial<DataLoaderConfig> = {
    maxMarkets,
    ticksPerMarket: Math.max(10, Math.min(periodDays, 90)),
    category,
    minVolume,
  };

  const historicalData = await loadHistoricalData(loaderConfig);

  // 2. Configura e avvia il backtest engine
  const engineConfig: Partial<BacktestConfig> = {
    initialCapital,
    slippagePct,
    commissionPct,
    maxOpenPositions,
  };

  const engine = new BacktestEngine(strategy, engineConfig);
  const result = engine.run(historicalData);

  // 3. Calcola metriche
  const metrics = calculateMetrics(
    result.trades,
    result.equityCurve,
    initialCapital,
    result.totalDays > 0 ? result.totalDays : periodDays,
  );

  // 4. Costruisci sommario per mercato
  const marketsSummary = buildMarketsSummary(historicalData, result.trades);

  // 5. Assembla il report
  return {
    strategyId: strategy.strategyId,
    strategyName: strategy.name,
    strategyCode: strategy.code,
    area: strategy.area,
    runTimestamp: new Date().toISOString(),
    config: {
      initialCapital,
      slippagePct,
      commissionPct,
      maxOpenPositions,
      periodDays,
      maxMarkets,
    },
    marketsAnalyzed: historicalData.length,
    metrics,
    equityCurve: result.equityCurve,
    trades: result.trades,
    marketsSummary,
  };
}

/**
 * Versione del runner che accetta dati storici gia' caricati
 * (per test o per evitare ri-fetch).
 */
export function runBacktestWithData(
  strategy: ParsedStrategy,
  historicalData: HistoricalMarketData[],
  config: {
    initialCapital: number;
    slippagePct?: number;
    commissionPct?: number;
    maxOpenPositions?: number;
    periodDays: number;
  },
): BacktestReport {
  const {
    initialCapital,
    slippagePct = 1,
    commissionPct = 0,
    maxOpenPositions = 10,
    periodDays,
  } = config;

  const engineConfig: Partial<BacktestConfig> = {
    initialCapital,
    slippagePct,
    commissionPct,
    maxOpenPositions,
  };

  const engine = new BacktestEngine(strategy, engineConfig);
  const result = engine.run(historicalData);

  const metrics = calculateMetrics(
    result.trades,
    result.equityCurve,
    initialCapital,
    result.totalDays > 0 ? result.totalDays : periodDays,
  );

  const marketsSummary = buildMarketsSummary(historicalData, result.trades);

  return {
    strategyId: strategy.strategyId,
    strategyName: strategy.name,
    strategyCode: strategy.code,
    area: strategy.area,
    runTimestamp: new Date().toISOString(),
    config: {
      initialCapital,
      slippagePct,
      commissionPct,
      maxOpenPositions,
      periodDays,
      maxMarkets: historicalData.length,
    },
    marketsAnalyzed: historicalData.length,
    metrics,
    equityCurve: result.equityCurve,
    trades: result.trades,
    marketsSummary,
  };
}

function buildMarketsSummary(
  historicalData: HistoricalMarketData[],
  trades: BacktestTrade[],
): MarketSummary[] {
  const summaries: MarketSummary[] = [];

  for (const market of historicalData) {
    const marketTrades = trades.filter(t => t.marketId === market.marketId);
    const totalPnl = marketTrades.reduce((sum, t) => sum + t.netPnl, 0);

    summaries.push({
      marketId: market.marketId,
      marketName: market.marketName,
      category: market.category,
      resolvedOutcome: market.resolvedOutcome,
      tradesCount: marketTrades.length,
      totalPnl,
    });
  }

  return summaries;
}
