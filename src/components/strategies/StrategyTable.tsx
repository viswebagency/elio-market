/**
 * StrategyTable — tabella strategie con sorting e filtri.
 */

'use client';

import { useState, useMemo } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { MarketArea } from '@/core/types/common';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StrategyMode = 'observation' | 'paper' | 'live';

export interface StrategyMetrics {
  winRate: number;
  roiTotal: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  totalTrades: number;
  profitFactor: number;
  avgTradeReturn: number;
}

export interface StrategyRow {
  id: string;
  code: string;
  name: string;
  area: MarketArea;
  mode: StrategyMode;
  isActive: boolean;
  metrics: StrategyMetrics;
  equityCurve: { timestamp: string; equity: number }[];
}

type SortField = keyof StrategyMetrics | 'name' | 'area' | 'mode';
type SortOrder = 'asc' | 'desc';

interface StrategyTableProps {
  strategies: StrategyRow[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  maxSelect?: number;
}

// ---------------------------------------------------------------------------
// Area config
// ---------------------------------------------------------------------------

const AREA_LABELS: Record<string, string> = {
  prediction: 'Prediction',
  exchange_betting: 'Betfair',
  stocks: 'Azioni',
  forex: 'Forex',
  crypto: 'Crypto',
};

const AREA_BADGE_VARIANT: Record<string, 'prediction' | 'betting' | 'stocks' | 'forex' | 'crypto'> = {
  prediction: 'prediction',
  exchange_betting: 'betting',
  stocks: 'stocks',
  forex: 'forex',
  crypto: 'crypto',
};

const MODE_LABELS: Record<StrategyMode, string> = {
  observation: 'Osservazione',
  paper: 'Paper',
  live: 'Live',
};

const MODE_BADGE_VARIANT: Record<StrategyMode, 'default' | 'warning' | 'success'> = {
  observation: 'default',
  paper: 'warning',
  live: 'success',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StrategyTable({
  strategies,
  selectedIds,
  onToggleSelect,
  maxSelect = 3,
}: StrategyTableProps) {
  const [sortField, setSortField] = useState<SortField>('roiTotal');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterArea, setFilterArea] = useState<string>('all');
  const [filterMode, setFilterMode] = useState<string>('all');
  const [filterPerformance, setFilterPerformance] = useState<string>('all');

  // Derive unique areas
  const areas = useMemo(
    () => [...new Set(strategies.map((s) => s.area))],
    [strategies],
  );

  // Filter
  const filtered = useMemo(() => {
    let result = strategies;

    if (filterArea !== 'all') {
      result = result.filter((s) => s.area === filterArea);
    }
    if (filterMode !== 'all') {
      result = result.filter((s) => s.mode === filterMode);
    }
    if (filterPerformance === 'profitable') {
      result = result.filter((s) => s.metrics.roiTotal > 0);
    } else if (filterPerformance === 'losing') {
      result = result.filter((s) => s.metrics.roiTotal <= 0);
    }

    return result;
  }, [strategies, filterArea, filterMode, filterPerformance]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      if (sortField === 'name') {
        aVal = a.name;
        bVal = b.name;
      } else if (sortField === 'area') {
        aVal = a.area;
        bVal = b.area;
      } else if (sortField === 'mode') {
        aVal = a.mode;
        bVal = b.mode;
      } else {
        aVal = a.metrics[sortField];
        bVal = b.metrics[sortField];
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      const numA = aVal as number;
      const numB = bVal as number;
      return sortOrder === 'asc' ? numA - numB : numB - numA;
    });
    return arr;
  }, [filtered, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return '';
    return sortOrder === 'asc' ? ' \u2191' : ' \u2193';
  };

  const canSelect = (id: string) =>
    selectedIds.includes(id) || selectedIds.length < maxSelect;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <FilterSelect
          label="Area"
          value={filterArea}
          onChange={setFilterArea}
          options={[
            { value: 'all', label: 'Tutte' },
            ...areas.map((a) => ({ value: a, label: AREA_LABELS[a] ?? a })),
          ]}
        />
        <FilterSelect
          label="Stato"
          value={filterMode}
          onChange={setFilterMode}
          options={[
            { value: 'all', label: 'Tutti' },
            { value: 'observation', label: 'Osservazione' },
            { value: 'paper', label: 'Paper' },
            { value: 'live', label: 'Live' },
          ]}
        />
        <FilterSelect
          label="Performance"
          value={filterPerformance}
          onChange={setFilterPerformance}
          options={[
            { value: 'all', label: 'Tutte' },
            { value: 'profitable', label: 'Profittevoli' },
            { value: 'losing', label: 'In perdita' },
          ]}
        />
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">{''}</TableHead>
            <SortableHead field="name" current={sortField} label="Strategia" onSort={handleSort} indicator={sortIndicator} />
            <SortableHead field="area" current={sortField} label="Area" onSort={handleSort} indicator={sortIndicator} />
            <SortableHead field="mode" current={sortField} label="Stato" onSort={handleSort} indicator={sortIndicator} />
            <SortableHead field="totalTrades" current={sortField} label="Trades" onSort={handleSort} indicator={sortIndicator} className="text-right" />
            <SortableHead field="winRate" current={sortField} label="Win Rate" onSort={handleSort} indicator={sortIndicator} className="text-right" />
            <SortableHead field="roiTotal" current={sortField} label="ROI" onSort={handleSort} indicator={sortIndicator} className="text-right" />
            <SortableHead field="sharpeRatio" current={sortField} label="Sharpe" onSort={handleSort} indicator={sortIndicator} className="text-right" />
            <SortableHead field="maxDrawdownPct" current={sortField} label="Max DD" onSort={handleSort} indicator={sortIndicator} className="text-right" />
            <SortableHead field="profitFactor" current={sortField} label="Profit F." onSort={handleSort} indicator={sortIndicator} className="text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 && (
            <TableRow>
              <TableCell className="text-center text-gray-500 py-8" colSpan={10}>
                Nessuna strategia trovata
              </TableCell>
            </TableRow>
          )}
          {sorted.map((s) => {
            const isSelected = selectedIds.includes(s.id);
            const selectable = canSelect(s.id);

            return (
              <TableRow
                key={s.id}
                className={isSelected ? 'bg-violet-900/20 border-l-2 border-l-violet-500' : ''}
              >
                <TableCell>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={!selectable && !isSelected}
                    onChange={() => onToggleSelect(s.id)}
                    className="rounded border-gray-600 bg-gray-800 text-violet-500 focus:ring-violet-500 focus:ring-offset-0 disabled:opacity-30"
                  />
                </TableCell>
                <TableCell>
                  <div>
                    <span className="font-medium text-gray-100">{s.name}</span>
                    <span className="ml-2 text-xs text-gray-500 font-mono">{s.code}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={AREA_BADGE_VARIANT[s.area] ?? 'default'}>
                    {AREA_LABELS[s.area] ?? s.area}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={MODE_BADGE_VARIANT[s.mode]}>
                    {MODE_LABELS[s.mode]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {s.metrics.totalTrades}
                </TableCell>
                <TableCell className="text-right font-mono">
                  <MetricValue value={s.metrics.winRate} suffix="%" positiveAbove={50} />
                </TableCell>
                <TableCell className="text-right font-mono">
                  <MetricValue value={s.metrics.roiTotal} suffix="%" positiveAbove={0} signed />
                </TableCell>
                <TableCell className="text-right font-mono">
                  <MetricValue value={s.metrics.sharpeRatio} positiveAbove={1} />
                </TableCell>
                <TableCell className="text-right font-mono">
                  <span className="text-red-400">-{s.metrics.maxDrawdownPct.toFixed(1)}%</span>
                </TableCell>
                <TableCell className="text-right font-mono">
                  <MetricValue value={s.metrics.profitFactor} positiveAbove={1} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <p className="text-xs text-gray-500">
        {sorted.length} strategie mostrate. Seleziona fino a {maxSelect} per confronto.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-400 uppercase tracking-wider">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SortableHead({
  field,
  current,
  label,
  onSort,
  indicator,
  className = '',
}: {
  field: SortField;
  current: SortField;
  label: string;
  onSort: (f: SortField) => void;
  indicator: (f: SortField) => string;
  className?: string;
}) {
  return (
    <TableHead className={`cursor-pointer select-none hover:text-gray-200 transition-colors ${className}`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`font-medium ${current === field ? 'text-violet-400' : ''}`}
      >
        {label}{indicator(field)}
      </button>
    </TableHead>
  );
}

function MetricValue({
  value,
  suffix = '',
  positiveAbove,
  signed = false,
}: {
  value: number;
  suffix?: string;
  positiveAbove: number;
  signed?: boolean;
}) {
  const isPositive = value >= positiveAbove;
  const formatted = value === Infinity ? 'Inf' : value.toFixed(2);
  const sign = signed && value > 0 ? '+' : '';

  return (
    <span className={isPositive ? 'text-emerald-400' : 'text-red-400'}>
      {sign}{formatted}{suffix}
    </span>
  );
}

