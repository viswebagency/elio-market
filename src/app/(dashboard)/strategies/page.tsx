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

interface BacktestLevelResult {
  level: string;
  passed: boolean;
  reason: string | null;
  metrics?: {
    roiTotal: number;
    sharpeRatio: number;
    maxDrawdownPct: number;
    winRate: number;
    totalTrades: number;
  };
}

interface BacktestSummary {
  strategyCode: string;
  strategyName: string;
  highestLevel: string | null;
  l1: BacktestLevelResult | null;
  l2: BacktestLevelResult | null;
  l3: BacktestLevelResult | null;
  l4: BacktestLevelResult | null;
}

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
  backtest: {
    summary: BacktestSummary;
    highestLevel: string | null;
    passedLevels: string[];
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
  const [runningPipeline, setRunningPipeline] = useState<Set<string>>(new Set());

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

  const handleRunPipeline = useCallback(async (code: string) => {
    setRunningPipeline(prev => new Set(prev).add(code));
    try {
      const res = await fetch('/api/backtest/run-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        // Refresh strategies data
        const stratRes = await fetch('/api/strategies');
        const stratJson = await stratRes.json();
        if (stratJson.ok && stratJson.strategies) {
          setApiStrategies(stratJson.strategies);
        }
      }
    } catch {
      // Silently handle
    } finally {
      setRunningPipeline(prev => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
    }
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

      {/* Backtest Pipeline Status */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-100">Pipeline Backtest</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {apiStrategies.map((s) => (
            <BacktestCard
              key={s.id}
              strategy={s}
              isRunning={runningPipeline.has(s.code)}
              onRunPipeline={() => handleRunPipeline(s.code)}
            />
          ))}
        </div>
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

// ---------------------------------------------------------------------------
// Backtest level config
// ---------------------------------------------------------------------------

const LEVEL_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  quick_scan: { label: 'L1', color: 'text-blue-400', bgColor: 'bg-blue-900/50', borderColor: 'border-blue-800' },
  robustness: { label: 'L2', color: 'text-emerald-400', bgColor: 'bg-emerald-900/50', borderColor: 'border-emerald-800' },
  stress_test: { label: 'L3', color: 'text-amber-400', bgColor: 'bg-amber-900/50', borderColor: 'border-amber-800' },
  overfitting_check: { label: 'L4', color: 'text-yellow-300', bgColor: 'bg-yellow-900/50', borderColor: 'border-yellow-700' },
};

const LEVEL_ORDER = ['quick_scan', 'robustness', 'stress_test', 'overfitting_check'];

function getNextLevel(highestLevel: string | null): string | null {
  if (!highestLevel) return 'quick_scan';
  const idx = LEVEL_ORDER.indexOf(highestLevel);
  if (idx < 0 || idx >= LEVEL_ORDER.length - 1) return null;
  return LEVEL_ORDER[idx + 1];
}

function getFailedLevel(summary: BacktestSummary): { level: string; reason: string } | null {
  const levels = [
    { key: 'l1', name: 'L1' },
    { key: 'l2', name: 'L2' },
    { key: 'l3', name: 'L3' },
    { key: 'l4', name: 'L4' },
  ] as const;

  for (const { key, name } of levels) {
    const result = summary[key];
    if (result && !result.passed) {
      return { level: name, reason: result.reason ?? 'Motivo non specificato' };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Backtest Card
// ---------------------------------------------------------------------------

function BacktestCard({
  strategy,
  isRunning,
  onRunPipeline,
}: {
  strategy: ApiStrategy;
  isRunning: boolean;
  onRunPipeline: () => void;
}) {
  const bt = strategy.backtest;
  const highestLevel = bt?.highestLevel ?? null;
  const levelCfg = highestLevel ? LEVEL_CONFIG[highestLevel] : null;
  const summary = bt?.summary ?? null;
  const failed = summary ? getFailedLevel(summary) : null;

  // Get metrics from the highest passed level
  const highestResult = summary
    ? highestLevel === 'overfitting_check' ? summary.l4
      : highestLevel === 'stress_test' ? summary.l3
      : highestLevel === 'robustness' ? summary.l2
      : highestLevel === 'quick_scan' ? summary.l1
      : null
    : null;

  // L1 metrics are the most detailed
  const l1Metrics = summary?.l1?.metrics;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3 space-y-2">
      {/* Header: name + badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-100">{strategy.name}</span>
          <span className="text-xs text-gray-500 font-mono">{strategy.code}</span>
        </div>
        {levelCfg ? (
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${levelCfg.bgColor} ${levelCfg.color} ${levelCfg.borderColor}`}>
            {levelCfg.label}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-gray-700 bg-gray-800 px-2.5 py-0.5 text-xs font-bold text-gray-500">
            L0
          </span>
        )}
      </div>

      {/* Level progress dots */}
      <div className="flex gap-1.5">
        {LEVEL_ORDER.map((lvl) => {
          const passed = bt?.passedLevels?.includes(lvl);
          const cfg = LEVEL_CONFIG[lvl];
          return (
            <div
              key={lvl}
              className={`h-1.5 flex-1 rounded-full ${passed ? cfg.bgColor.replace('/50', '') : 'bg-gray-800'}`}
              title={`${cfg.label}: ${passed ? 'Superato' : 'Non superato'}`}
            />
          );
        })}
      </div>

      {/* Metrics from L1 (most detailed) */}
      {l1Metrics && (
        <div className="grid grid-cols-4 gap-2 text-xs font-mono">
          <div>
            <span className="text-gray-500 block">ROI</span>
            <span className={l1Metrics.roiTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {l1Metrics.roiTotal >= 0 ? '+' : ''}{l1Metrics.roiTotal.toFixed(2)}%
            </span>
          </div>
          <div>
            <span className="text-gray-500 block">Sharpe</span>
            <span className={l1Metrics.sharpeRatio >= 1 ? 'text-emerald-400' : 'text-red-400'}>
              {l1Metrics.sharpeRatio.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-gray-500 block">Max DD</span>
            <span className="text-red-400">-{l1Metrics.maxDrawdownPct.toFixed(1)}%</span>
          </div>
          <div>
            <span className="text-gray-500 block">Win Rate</span>
            <span className={l1Metrics.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}>
              {l1Metrics.winRate.toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {/* Failed reason */}
      {failed && (
        <div className="text-xs rounded-lg bg-red-950/30 border border-red-900/50 px-3 py-2">
          <span className="text-red-400 font-medium">Fallito {failed.level}:</span>{' '}
          <span className="text-red-300/80">{failed.reason}</span>
        </div>
      )}

      {/* No backtest yet */}
      {!summary && (
        <p className="text-xs text-gray-500">Nessun backtest eseguito</p>
      )}

      {/* Run pipeline button */}
      <button
        onClick={onRunPipeline}
        disabled={isRunning}
        className={`w-full text-xs font-medium rounded-lg px-3 py-1.5 transition-colors ${
          isRunning
            ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
            : 'bg-violet-900/50 text-violet-300 border border-violet-800 hover:bg-violet-800/50'
        }`}
      >
        {isRunning
          ? 'Pipeline in esecuzione...'
          : highestLevel === 'overfitting_check'
            ? 'Riesegui pipeline'
            : `Lancia ${getNextLevel(highestLevel) ? LEVEL_CONFIG[getNextLevel(highestLevel)!]?.label ?? 'pipeline' : 'pipeline'}`}
      </button>
    </div>
  );
}
