/**
 * StrategyComparison — vista comparazione side-by-side con equity curves sovrapposte.
 */

'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { StrategyRow } from './StrategyTable';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StrategyComparisonProps {
  strategies: StrategyRow[];
}

interface MetricDef {
  key: string;
  label: string;
  format: (v: number) => string;
  /** true = piu alto e' meglio, false = piu basso e' meglio */
  higherIsBetter: boolean;
}

// ---------------------------------------------------------------------------
// Colors per strategy (max 3)
// ---------------------------------------------------------------------------

const STRATEGY_COLORS = ['#8B5CF6', '#34D399', '#F59E0B'];
const STRATEGY_COLORS_DIM = ['rgba(139,92,246,0.15)', 'rgba(52,211,153,0.15)', 'rgba(245,158,11,0.15)'];

// ---------------------------------------------------------------------------
// Metrics definitions
// ---------------------------------------------------------------------------

const METRICS: MetricDef[] = [
  { key: 'totalTrades', label: 'Trades totali', format: (v) => String(Math.round(v)), higherIsBetter: true },
  { key: 'winRate', label: 'Win Rate', format: (v) => `${v.toFixed(1)}%`, higherIsBetter: true },
  { key: 'roiTotal', label: 'ROI Totale', format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, higherIsBetter: true },
  { key: 'sharpeRatio', label: 'Sharpe Ratio', format: (v) => v.toFixed(2), higherIsBetter: true },
  { key: 'maxDrawdownPct', label: 'Max Drawdown', format: (v) => `-${v.toFixed(1)}%`, higherIsBetter: false },
  { key: 'profitFactor', label: 'Profit Factor', format: (v) => v === Infinity ? 'Inf' : v.toFixed(2), higherIsBetter: true },
  { key: 'avgTradeReturn', label: 'Rendimento medio', format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, higherIsBetter: true },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StrategyComparison({ strategies }: StrategyComparisonProps) {
  if (strategies.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-gray-500 text-center py-8">
            Seleziona almeno 2 strategie dalla tabella per confrontarle
          </p>
        </CardContent>
      </Card>
    );
  }

  if (strategies.length === 1) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-gray-500 text-center py-8">
            Seleziona almeno un&apos;altra strategia per il confronto
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metrics comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Confronto metriche</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-4 py-3 text-left text-xs uppercase text-gray-400 font-medium">
                    Metrica
                  </th>
                  {strategies.map((s, i) => (
                    <th
                      key={s.id}
                      className="px-4 py-3 text-right text-xs uppercase font-medium"
                      style={{ color: STRATEGY_COLORS[i] }}
                    >
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {METRICS.map((metric) => (
                  <MetricRow key={metric.key} metric={metric} strategies={strategies} />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Equity curves overlay */}
      <EquityCurveOverlay strategies={strategies} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetricRow
// ---------------------------------------------------------------------------

function MetricRow({
  metric,
  strategies,
}: {
  metric: MetricDef;
  strategies: StrategyRow[];
}) {
  const values = strategies.map(
    (s) => s.metrics[metric.key as keyof typeof s.metrics] as number,
  );

  // Determina il "vincitore"
  const bestIdx = useMemo(() => {
    if (values.length < 2) return -1;
    const validValues = values.filter((v) => v !== Infinity && v !== -Infinity);
    if (validValues.length === 0) return -1;

    if (metric.higherIsBetter) {
      const max = Math.max(...values.filter((v) => v !== Infinity));
      return values.indexOf(max);
    } else {
      const min = Math.min(...values.filter((v) => v !== -Infinity));
      return values.indexOf(min);
    }
  }, [values, metric.higherIsBetter]);

  return (
    <tr className="hover:bg-gray-800/30 transition-colors">
      <td className="px-4 py-3 text-gray-400">{metric.label}</td>
      {values.map((val, i) => {
        const isBest = i === bestIdx && strategies.length > 1;
        const allEqual = values.every((v) => Math.abs(v - values[0]) < 0.001);

        return (
          <td key={strategies[i].id} className="px-4 py-3 text-right font-mono">
            <span
              className={
                allEqual
                  ? 'text-gray-300'
                  : isBest
                    ? 'text-emerald-400 font-semibold'
                    : 'text-red-400'
              }
            >
              {metric.format(val)}
            </span>
          </td>
        );
      })}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Equity Curve Overlay (SVG)
// ---------------------------------------------------------------------------

function EquityCurveOverlay({ strategies }: { strategies: StrategyRow[] }) {
  const width = 800;
  const height = 320;
  const padding = { top: 20, right: 20, bottom: 50, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Normalize equity curves: convertile in returns percentuali dalla prima equity
  const normalizedCurves = useMemo(() => {
    return strategies.map((s) => {
      if (s.equityCurve.length === 0) return [];
      const firstEq = s.equityCurve[0].equity;
      return s.equityCurve.map((p) => ({
        timestamp: p.timestamp,
        returnPct: firstEq > 0 ? ((p.equity - firstEq) / firstEq) * 100 : 0,
      }));
    });
  }, [strategies]);

  // Trova min/max return e max lunghezza
  const allReturns = normalizedCurves.flat().map((p) => p.returnPct);
  if (allReturns.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-gray-500 text-center py-8">
            Nessun dato equity curve disponibile
          </p>
        </CardContent>
      </Card>
    );
  }

  const minR = Math.min(...allReturns, 0) * 1.1;
  const maxR = Math.max(...allReturns, 0) * 1.1;
  const range = maxR - minR || 1;
  const maxLen = Math.max(...normalizedCurves.map((c) => c.length));

  const toX = (i: number, total: number) =>
    padding.left + (i / Math.max(total - 1, 1)) * chartW;
  const toY = (r: number) =>
    padding.top + chartH - ((r - minR) / range) * chartH;

  // Y-axis ticks
  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount }, (_, i) => {
    const val = minR + (range * i) / (yTickCount - 1);
    return { val, y: toY(val) };
  });

  // X-axis ticks (use longest curve timestamps)
  const longestCurve = normalizedCurves.reduce(
    (a, b) => (a.length >= b.length ? a : b),
    [],
  );
  const xTickCount = Math.min(6, longestCurve.length);
  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const idx = Math.floor(
      (i / Math.max(xTickCount - 1, 1)) * (longestCurve.length - 1),
    );
    return {
      x: toX(idx, longestCurve.length),
      label: longestCurve[idx]?.timestamp.substring(5, 10) ?? '',
    };
  });

  // Zero line
  const zeroY = toY(0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Equity Curves sovrapposte (return %)</CardTitle>
          <div className="flex gap-4">
            {strategies.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-0.5 rounded"
                  style={{ backgroundColor: STRATEGY_COLORS[i] }}
                />
                <span className="text-xs text-gray-400">{s.code}</span>
              </div>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {/* Grid */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={tick.y}
                y2={tick.y}
                stroke="#374151"
                strokeWidth="0.5"
                strokeDasharray="4"
              />
              <text
                x={padding.left - 8}
                y={tick.y + 4}
                textAnchor="end"
                fill="#6B7280"
                fontSize="10"
                fontFamily="monospace"
              >
                {tick.val >= 0 ? '+' : ''}{tick.val.toFixed(1)}%
              </text>
            </g>
          ))}

          {/* Zero line */}
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={zeroY}
            y2={zeroY}
            stroke="#6366F1"
            strokeWidth="1"
            strokeDasharray="6"
            opacity="0.4"
          />

          {/* X-axis labels */}
          {xTicks.map((tick, i) => (
            <text
              key={i}
              x={tick.x}
              y={height - 8}
              textAnchor="middle"
              fill="#6B7280"
              fontSize="10"
              fontFamily="monospace"
            >
              {tick.label}
            </text>
          ))}

          {/* Curves */}
          {normalizedCurves.map((curve, ci) => {
            if (curve.length < 2) return null;

            const pathD = curve
              .map(
                (p, i) =>
                  `${i === 0 ? 'M' : 'L'} ${toX(i, curve.length).toFixed(1)} ${toY(p.returnPct).toFixed(1)}`,
              )
              .join(' ');

            // Area fill
            const areaD = `${pathD} L ${toX(curve.length - 1, curve.length).toFixed(1)} ${zeroY.toFixed(1)} L ${padding.left} ${zeroY.toFixed(1)} Z`;

            return (
              <g key={strategies[ci].id}>
                <path d={areaD} fill={STRATEGY_COLORS_DIM[ci]} />
                <path
                  d={pathD}
                  fill="none"
                  stroke={STRATEGY_COLORS[ci]}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}
        </svg>
      </CardContent>
    </Card>
  );
}
