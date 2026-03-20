/**
 * Strategie — Dashboard confronto strategie con dati reali da Supabase.
 */

'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { StrategyTable, type StrategyRow, type StrategyMode } from '@/components/strategies/StrategyTable';
import { StrategyComparison } from '@/components/strategies/StrategyComparison';
import { MarketArea } from '@/core/types/common';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiStrategy {
  id: string;
  code: string;
  name: string;
  area: string;
  mode: string;
  riskLevel: string;
  isActive: boolean;
  metrics: {
    winRate: number;
    roiTotal: number;
    sharpeRatio: number;
    maxDrawdownPct: number;
    totalTrades: number;
    profitFactor: number;
    avgTradeReturn: number;
  };
  session: {
    status: string;
    initialCapital: number;
    currentCapital: number;
    totalPnl: number;
    totalPnlPct: number;
    totalTicks: number;
  } | null;
}

// ---------------------------------------------------------------------------
// Area mapping
// ---------------------------------------------------------------------------

const AREA_MAP: Record<string, MarketArea> = {
  polymarket: MarketArea.PREDICTION,
  prediction: MarketArea.PREDICTION,
  betfair: MarketArea.EXCHANGE_BETTING,
  exchange_betting: MarketArea.EXCHANGE_BETTING,
  stocks: MarketArea.STOCKS,
  forex: MarketArea.FOREX,
  crypto: MarketArea.CRYPTO,
};

const RISK_COLORS: Record<string, string> = {
  conservative: 'text-emerald-400',
  moderate: 'text-amber-400',
  aggressive: 'text-red-400',
};

const RISK_LABELS: Record<string, string> = {
  conservative: 'Conservativo',
  moderate: 'Moderato',
  aggressive: 'Aggressivo',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StrategiesPage() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [apiStrategies, setApiStrategies] = useState<ApiStrategy[]>([]);
  const [equityCurves, setEquityCurves] = useState<Record<string, { timestamp: string; equity: number }[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [stratRes, equityRes] = await Promise.all([
          fetch('/api/strategies'),
          fetch('/api/strategies/equity?days=90'),
        ]);
        const stratJson = await stratRes.json();
        const equityJson = await equityRes.json();

        if (stratJson.ok && stratJson.strategies) {
          setApiStrategies(stratJson.strategies);
        }
        if (equityJson.ok && equityJson.curves) {
          setEquityCurves(equityJson.curves);
        }
      } catch {
        // Keep empty state
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const strategies: StrategyRow[] = useMemo(() => {
    return apiStrategies.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      area: AREA_MAP[s.area] ?? MarketArea.PREDICTION,
      mode: (s.mode === 'paper' ? 'paper' : s.mode === 'live' ? 'live' : 'observation') as StrategyMode,
      isActive: s.isActive,
      metrics: s.metrics,
      equityCurve: equityCurves[s.id] ?? [],
    }));
  }, [apiStrategies, equityCurves]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-500">Caricamento strategie...</div>
      </div>
    );
  }

  const activeCount = strategies.filter((s) => s.isActive).length;
  const liveCount = strategies.filter((s) => s.mode === 'live').length;
  const paperCount = strategies.filter((s) => s.mode === 'paper').length;
  const avgRoi = strategies.length > 0
    ? strategies.reduce((sum, s) => sum + s.metrics.roiTotal, 0) / strategies.length
    : 0;

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
        <SummaryStatCard label="Strategie attive" value={String(activeCount)} />
        <SummaryStatCard
          label="Paper trading"
          value={String(paperCount)}
          accent="violet"
        />
        <SummaryStatCard
          label="ROI medio"
          value={`${avgRoi >= 0 ? '+' : ''}${avgRoi.toFixed(2)}%`}
          accent={avgRoi >= 0 ? 'emerald' : 'red'}
        />
        <SummaryStatCard
          label="Aree coperte"
          value={String(new Set(strategies.map((s) => s.area)).size)}
        />
      </div>

      {/* Risk level breakdown */}
      <div className="grid grid-cols-3 gap-4">
        {(['conservative', 'moderate', 'aggressive'] as const).map((level) => {
          const count = apiStrategies.filter((s) => s.riskLevel === level).length;
          const levelStrategies = apiStrategies.filter((s) => s.riskLevel === level);
          const avgPnl = levelStrategies.length > 0
            ? levelStrategies.reduce((sum, s) => sum + (s.session?.totalPnl ?? 0), 0) / levelStrategies.length
            : 0;
          return (
            <div key={level} className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3">
              <p className={`text-xs uppercase tracking-wider ${RISK_COLORS[level]}`}>
                {RISK_LABELS[level]}
              </p>
              <p className="text-lg font-bold text-gray-100 mt-1">{count} strategie</p>
              <p className={`text-xs font-mono mt-1 ${avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                P&L medio: {avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(2)}
              </p>
            </div>
          );
        })}
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
