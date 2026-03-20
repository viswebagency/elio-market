/**
 * Backtest UI — configurazione ed esecuzione backtest per strategie Polymarket.
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import type { BacktestReport } from '@/core/backtest/runner';
import type { BacktestMetrics, BacktestTrade, EquityPoint } from '@/core/backtest/metrics';

type Period = '1m' | '3m' | '6m' | '1y';

const PERIOD_DAYS: Record<Period, number> = {
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '1y': 365,
};

const PERIOD_LABELS: Record<Period, string> = {
  '1m': '1 mese',
  '3m': '3 mesi',
  '6m': '6 mesi',
  '1y': '1 anno',
};

export default function BacktestPage() {
  const [period, setPeriod] = useState<Period>('3m');
  const [initialCapital, setInitialCapital] = useState('1000');
  const [slippage, setSlippage] = useState('1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [activeTab, setActiveTab] = useState<'metrics' | 'equity' | 'trades'>('metrics');

  const handleRun = async () => {
    setLoading(true);
    setError('');
    setReport(null);

    try {
      const res = await fetch('/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId: 'PM-001',
          period: PERIOD_DAYS[period],
          startingCapital: parseFloat(initialCapital) || 1000,
          slippage: parseFloat(slippage) || 1,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error?.message || 'Errore durante il backtest');
        return;
      }

      setReport(data.data);
      setActiveTab('metrics');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore di rete');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Backtest</h1>
        <p className="text-sm text-gray-400 mt-1">
          Simula strategie su dati storici Polymarket
        </p>
      </div>

      {/* Config form */}
      <Card>
        <CardHeader>
          <CardTitle>Configurazione</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Strategia */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-300">Strategia</label>
              <select
                className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                defaultValue="PM-001"
                disabled
              >
                <option value="PM-001">PM-001 — Compra la Paura</option>
              </select>
            </div>

            {/* Periodo */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-300">Periodo</label>
              <div className="flex gap-1">
                {(Object.keys(PERIOD_DAYS) as Period[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      period === p
                        ? 'bg-violet-600 text-white'
                        : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700 border border-gray-700'
                    }`}
                  >
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            {/* Capitale iniziale */}
            <Input
              label="Capitale iniziale (USD)"
              type="number"
              value={initialCapital}
              onChange={(e) => setInitialCapital(e.target.value)}
              min="100"
              step="100"
              className="font-mono"
            />

            {/* Slippage */}
            <Input
              label="Slippage %"
              type="number"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              min="0"
              max="10"
              step="0.1"
              className="font-mono"
            />
          </div>

          <div className="mt-4 flex items-center gap-4">
            <Button onClick={handleRun} loading={loading} size="lg">
              Esegui Backtest
            </Button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {report && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard
              label="Win Rate"
              value={`${report.metrics.winRate.toFixed(1)}%`}
              positive={report.metrics.winRate >= 50}
            />
            <SummaryCard
              label="ROI Totale"
              value={`${report.metrics.roiTotal.toFixed(2)}%`}
              positive={report.metrics.roiTotal >= 0}
            />
            <SummaryCard
              label="Sharpe Ratio"
              value={report.metrics.sharpeRatio.toFixed(2)}
              positive={report.metrics.sharpeRatio >= 1}
            />
            <SummaryCard
              label="Max Drawdown"
              value={`-${report.metrics.maxDrawdownPct.toFixed(2)}%`}
              positive={report.metrics.maxDrawdownPct < 20}
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-800 pb-0">
            {(['metrics', 'equity', 'trades'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? 'border-violet-500 text-violet-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab === 'metrics' && 'Metriche'}
                {tab === 'equity' && 'Equity Curve'}
                {tab === 'trades' && `Operazioni (${report.trades.length})`}
              </button>
            ))}
          </div>

          {activeTab === 'metrics' && <MetricsTable metrics={report.metrics} />}
          {activeTab === 'equity' && (
            <EquityCurveChart
              points={report.equityCurve}
              initialCapital={report.config.initialCapital}
            />
          )}
          {activeTab === 'trades' && <TradesTable trades={report.trades} />}
        </>
      )}
    </div>
  );
}

/* --- Sub-components --- */

function SummaryCard({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
        <p
          className={`text-xl font-bold font-mono mt-1 ${
            positive ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function MetricsTable({ metrics }: { metrics: BacktestMetrics }) {
  const rows: { label: string; value: string; group: string }[] = [
    { group: 'Performance', label: 'Trade totali', value: String(metrics.totalTrades) },
    { group: 'Performance', label: 'Vincenti', value: String(metrics.winningTrades) },
    { group: 'Performance', label: 'Perdenti', value: String(metrics.losingTrades) },
    { group: 'Performance', label: 'Win Rate', value: `${metrics.winRate.toFixed(1)}%` },
    { group: 'Performance', label: 'Profit Factor', value: metrics.profitFactor === Infinity ? 'Inf' : metrics.profitFactor.toFixed(2) },
    { group: 'Rendimento', label: 'ROI Totale', value: `${metrics.roiTotal.toFixed(2)}%` },
    { group: 'Rendimento', label: 'ROI Annualizzato', value: `${metrics.roiAnnualized.toFixed(2)}%` },
    { group: 'Rendimento', label: 'Profitto netto', value: `$${metrics.totalNetProfit.toFixed(2)}` },
    { group: 'Rendimento', label: 'Profitto lordo', value: `$${metrics.totalGrossProfit.toFixed(2)}` },
    { group: 'Rendimento', label: 'Perdita lorda', value: `$${metrics.totalGrossLoss.toFixed(2)}` },
    { group: 'Rischio', label: 'Sharpe Ratio', value: metrics.sharpeRatio.toFixed(2) },
    { group: 'Rischio', label: 'Max Drawdown %', value: `${metrics.maxDrawdownPct.toFixed(2)}%` },
    { group: 'Rischio', label: 'Max Drawdown $', value: `$${metrics.maxDrawdownAbs.toFixed(2)}` },
    { group: 'Rischio', label: 'Recovery Factor', value: metrics.recoveryFactor === Infinity ? 'Inf' : metrics.recoveryFactor.toFixed(2) },
    { group: 'Streaks', label: 'Max vinte consecutive', value: String(metrics.maxConsecutiveWins) },
    { group: 'Streaks', label: 'Max perse consecutive', value: String(metrics.maxConsecutiveLosses) },
    { group: 'Dettaglio', label: 'Rendimento medio trade', value: `${metrics.avgTradeReturn.toFixed(2)}%` },
    { group: 'Dettaglio', label: 'Miglior trade', value: `${metrics.bestTrade.toFixed(2)}%` },
    { group: 'Dettaglio', label: 'Peggior trade', value: `${metrics.worstTrade.toFixed(2)}%` },
    { group: 'Dettaglio', label: 'Edge medio', value: `${(metrics.avgEdge * 100).toFixed(2)}%` },
    { group: 'Costi', label: 'Slippage totale', value: `$${metrics.totalSlippageCost.toFixed(2)}` },
    { group: 'Costi', label: 'Commissioni totali', value: `$${metrics.totalCommissionCost.toFixed(2)}` },
    { group: 'Costi', label: 'Durata media trade', value: `${metrics.avgTradeDurationDays.toFixed(1)} giorni` },
  ];

  const groups = [...new Set(rows.map((r) => r.group))];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {groups.map((group) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle className="text-sm">{group}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {rows
                  .filter((r) => r.group === group)
                  .map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className="text-gray-400">{row.label}</TableCell>
                      <TableCell className="text-right font-mono text-gray-100">
                        {row.value}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EquityCurveChart({
  points,
  initialCapital,
}: {
  points: EquityPoint[];
  initialCapital: number;
}) {
  if (points.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-gray-500 text-center py-8">Nessun dato per la equity curve</p>
        </CardContent>
      </Card>
    );
  }

  const width = 800;
  const height = 300;
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const equities = points.map((p) => p.equity);
  const minEq = Math.min(...equities, initialCapital) * 0.98;
  const maxEq = Math.max(...equities, initialCapital) * 1.02;
  const range = maxEq - minEq || 1;

  const toX = (i: number) => padding.left + (i / Math.max(points.length - 1, 1)) * chartW;
  const toY = (eq: number) => padding.top + chartH - ((eq - minEq) / range) * chartH;

  // Build SVG path
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p.equity).toFixed(1)}`)
    .join(' ');

  // Area fill
  const areaD = `${pathD} L ${toX(points.length - 1).toFixed(1)} ${(padding.top + chartH).toFixed(1)} L ${padding.left} ${(padding.top + chartH).toFixed(1)} Z`;

  // Initial capital line
  const capitalY = toY(initialCapital);

  // Y-axis labels (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const val = minEq + (range * i) / 4;
    return { val, y: toY(val) };
  });

  // X-axis labels
  const xTickCount = Math.min(5, points.length);
  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const idx = Math.floor((i / Math.max(xTickCount - 1, 1)) * (points.length - 1));
    const p = points[idx];
    return {
      x: toX(idx),
      label: p.timestamp.substring(5, 10),
    };
  });

  const finalEquity = equities[equities.length - 1];
  const isProfit = finalEquity >= initialCapital;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Equity Curve</CardTitle>
          <span className={`font-mono text-sm ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
            ${finalEquity.toFixed(2)}
          </span>
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
                ${tick.val.toFixed(0)}
              </text>
            </g>
          ))}

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

          {/* Initial capital dashed line */}
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={capitalY}
            y2={capitalY}
            stroke="#6366F1"
            strokeWidth="1"
            strokeDasharray="6"
            opacity="0.5"
          />

          {/* Area fill */}
          <path d={areaD} fill={isProfit ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)'} />

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke={isProfit ? '#34D399' : '#F87171'}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </CardContent>
    </Card>
  );
}

function TradesTable({ trades }: { trades: BacktestTrade[] }) {
  if (trades.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-gray-500 text-center py-8">Nessun trade eseguito</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Mercato</TableHead>
              <TableHead className="text-right">Entry</TableHead>
              <TableHead className="text-right">Exit</TableHead>
              <TableHead className="text-right">Stake</TableHead>
              <TableHead className="text-right">P&L</TableHead>
              <TableHead className="text-right">Return</TableHead>
              <TableHead>Motivo uscita</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades.map((trade) => (
              <TableRow key={trade.tradeId}>
                <TableCell className="font-mono text-xs text-gray-500">
                  {trade.tradeId}
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  <span title={trade.marketName}>{trade.marketName}</span>
                </TableCell>
                <TableCell className="text-right font-mono">
                  ${trade.entryPrice.toFixed(3)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  ${trade.exitPrice.toFixed(3)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  ${trade.stake.toFixed(2)}
                </TableCell>
                <TableCell
                  className={`text-right font-mono ${
                    trade.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {trade.netPnl >= 0 ? '+' : ''}${trade.netPnl.toFixed(2)}
                </TableCell>
                <TableCell
                  className={`text-right font-mono ${
                    trade.returnPct >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {trade.returnPct >= 0 ? '+' : ''}{trade.returnPct.toFixed(1)}%
                </TableCell>
                <TableCell className="text-xs text-gray-400 max-w-[180px] truncate">
                  <span title={trade.exitReason}>{trade.exitReason}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
