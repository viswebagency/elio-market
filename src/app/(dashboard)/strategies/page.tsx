/**
 * Strategie — Dashboard confronto strategie multi-area.
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import { StrategyTable, type StrategyRow, type StrategyMode, type StrategyMetrics } from '@/components/strategies/StrategyTable';
import { StrategyComparison } from '@/components/strategies/StrategyComparison';
import { MarketArea } from '@/core/types/common';

// ---------------------------------------------------------------------------
// Mock data generator
// ---------------------------------------------------------------------------

function generateMockStrategies(): StrategyRow[] {
  const strategies: StrategyRow[] = [
    {
      id: 'str-001',
      code: 'PM-001',
      name: 'Compra la Paura',
      area: MarketArea.PREDICTION,
      mode: 'paper' as StrategyMode,
      isActive: true,
      metrics: {
        winRate: 67.3,
        roiTotal: 24.8,
        sharpeRatio: 1.85,
        maxDrawdownPct: 12.4,
        totalTrades: 48,
        profitFactor: 2.15,
        avgTradeReturn: 3.2,
      },
      equityCurve: generateEquityCurve(1000, 0.248, 90),
    },
    {
      id: 'str-002',
      code: 'PM-002',
      name: 'Momentum Politico',
      area: MarketArea.PREDICTION,
      mode: 'observation' as StrategyMode,
      isActive: true,
      metrics: {
        winRate: 58.1,
        roiTotal: 11.2,
        sharpeRatio: 1.22,
        maxDrawdownPct: 18.7,
        totalTrades: 31,
        profitFactor: 1.54,
        avgTradeReturn: 1.8,
      },
      equityCurve: generateEquityCurve(1000, 0.112, 90),
    },
    {
      id: 'str-003',
      code: 'BF-001',
      name: 'Calcio Under Value',
      area: MarketArea.EXCHANGE_BETTING,
      mode: 'paper' as StrategyMode,
      isActive: true,
      metrics: {
        winRate: 54.2,
        roiTotal: 8.7,
        sharpeRatio: 0.95,
        maxDrawdownPct: 22.1,
        totalTrades: 112,
        profitFactor: 1.32,
        avgTradeReturn: 0.9,
      },
      equityCurve: generateEquityCurve(1000, 0.087, 90),
    },
    {
      id: 'str-004',
      code: 'BF-002',
      name: 'Tennis Lay Favorite',
      area: MarketArea.EXCHANGE_BETTING,
      mode: 'live' as StrategyMode,
      isActive: true,
      metrics: {
        winRate: 71.4,
        roiTotal: 31.5,
        sharpeRatio: 2.14,
        maxDrawdownPct: 9.3,
        totalTrades: 63,
        profitFactor: 2.87,
        avgTradeReturn: 4.1,
      },
      equityCurve: generateEquityCurve(1000, 0.315, 90),
    },
    {
      id: 'str-005',
      code: 'CR-001',
      name: 'BTC Mean Reversion',
      area: MarketArea.CRYPTO,
      mode: 'observation' as StrategyMode,
      isActive: true,
      metrics: {
        winRate: 45.8,
        roiTotal: -5.3,
        sharpeRatio: 0.42,
        maxDrawdownPct: 35.2,
        totalTrades: 24,
        profitFactor: 0.78,
        avgTradeReturn: -1.4,
      },
      equityCurve: generateEquityCurve(1000, -0.053, 90),
    },
    {
      id: 'str-006',
      code: 'FX-001',
      name: 'EUR/USD Breakout',
      area: MarketArea.FOREX,
      mode: 'paper' as StrategyMode,
      isActive: true,
      metrics: {
        winRate: 52.0,
        roiTotal: 6.1,
        sharpeRatio: 0.88,
        maxDrawdownPct: 15.8,
        totalTrades: 87,
        profitFactor: 1.18,
        avgTradeReturn: 0.6,
      },
      equityCurve: generateEquityCurve(1000, 0.061, 90),
    },
    {
      id: 'str-007',
      code: 'ST-001',
      name: 'Value Investing SP500',
      area: MarketArea.STOCKS,
      mode: 'observation' as StrategyMode,
      isActive: false,
      metrics: {
        winRate: 62.5,
        roiTotal: 15.4,
        sharpeRatio: 1.45,
        maxDrawdownPct: 11.2,
        totalTrades: 16,
        profitFactor: 1.92,
        avgTradeReturn: 5.2,
      },
      equityCurve: generateEquityCurve(1000, 0.154, 90),
    },
  ];

  return strategies;
}

/**
 * Genera una equity curve sintetica ma realistica con random walk + drift.
 */
function generateEquityCurve(
  initialCapital: number,
  totalReturnPct: number,
  days: number,
): { timestamp: string; equity: number }[] {
  const curve: { timestamp: string; equity: number }[] = [];
  const dailyDrift = totalReturnPct / days;
  const volatility = Math.abs(totalReturnPct) * 0.15 + 0.005;

  let equity = initialCapital;
  const now = new Date();

  // Seed deterministico basato su totalReturnPct per consistenza
  let seed = Math.abs(totalReturnPct * 1000) + days;
  const pseudoRandom = () => {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed / 2147483647) - 0.5;
  };

  for (let d = days; d >= 0; d--) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    const dateStr = date.toISOString().substring(0, 10);

    curve.push({ timestamp: dateStr, equity: Math.max(equity, 0) });

    const dailyReturn = dailyDrift + pseudoRandom() * volatility;
    equity = equity * (1 + dailyReturn);
  }

  return curve;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StrategiesPage() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // In un'app reale, queste verrebbero da API/DB.
  // Se non ci sono strategie nel DB, usiamo mock data.
  const strategies = useMemo(() => generateMockStrategies(), []);

  const selectedStrategies = useMemo(
    () => strategies.filter((s) => selectedIds.includes(s.id)),
    [strategies, selectedIds],
  );

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Strategie</h1>
        <p className="text-sm text-gray-400 mt-1">
          Confronta le performance delle strategie su tutte le aree di mercato
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryStatCard
          label="Strategie attive"
          value={String(strategies.filter((s) => s.isActive).length)}
        />
        <SummaryStatCard
          label="In live"
          value={String(strategies.filter((s) => s.mode === 'live').length)}
          accent="emerald"
        />
        <SummaryStatCard
          label="ROI medio"
          value={`${(strategies.reduce((sum, s) => sum + s.metrics.roiTotal, 0) / strategies.length).toFixed(1)}%`}
          accent={
            strategies.reduce((sum, s) => sum + s.metrics.roiTotal, 0) / strategies.length >= 0
              ? 'emerald'
              : 'red'
          }
        />
        <SummaryStatCard
          label="Aree coperte"
          value={String(new Set(strategies.map((s) => s.area)).size)}
        />
      </div>

      {/* Strategy Table */}
      <StrategyTable
        strategies={strategies}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        maxSelect={3}
      />

      {/* Comparison section */}
      {selectedIds.length >= 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-100">
              Confronto ({selectedIds.length} strategie)
            </h2>
            <button
              onClick={() => setSelectedIds([])}
              className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              Deseleziona tutto
            </button>
          </div>
          <StrategyComparison strategies={selectedStrategies} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary stat card
// ---------------------------------------------------------------------------

function SummaryStatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'emerald' | 'red' | 'violet';
}) {
  const colorClass =
    accent === 'emerald'
      ? 'text-emerald-400'
      : accent === 'red'
        ? 'text-red-400'
        : accent === 'violet'
          ? 'text-violet-400'
          : 'text-gray-100';

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm px-6 py-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold font-mono mt-1 ${colorClass}`}>{value}</p>
    </div>
  );
}
