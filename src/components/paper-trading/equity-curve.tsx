/**
 * EquityCurve — Recharts line chart for session equity over time.
 */

'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

interface SnapshotPoint {
  timestamp: string;
  equity: number;
  pnlPct: number;
}

interface EquityCurveProps {
  snapshots: SnapshotPoint[];
  initialCapital: number;
  height?: number;
  areaColor?: string;
}

export function EquityCurve({
  snapshots,
  initialCapital,
  height = 200,
  areaColor = '#8B5CF6',
}: EquityCurveProps) {
  if (snapshots.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-gray-600 text-xs"
        style={{ height }}
      >
        Nessun dato — in attesa del primo tick
      </div>
    );
  }

  const data = snapshots.map((s) => ({
    time: new Date(s.timestamp).toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    equity: Number(s.equity.toFixed(2)),
    pnlPct: Number(s.pnlPct.toFixed(2)),
  }));

  const minEquity = Math.min(...data.map((d) => d.equity));
  const maxEquity = Math.max(...data.map((d) => d.equity));
  const padding = (maxEquity - minEquity) * 0.1 || 1;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="time"
          tick={{ fill: '#6b7280', fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
        />
        <YAxis
          domain={[minEquity - padding, maxEquity + padding]}
          tick={{ fill: '#6b7280', fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
          tickFormatter={(v: number) => `$${v.toFixed(0)}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '0.5rem',
            fontSize: 12,
          }}
          labelStyle={{ color: '#9ca3af' }}
          formatter={(value, name) => {
            const v = Number(value);
            if (name === 'equity') return [`$${v.toFixed(2)}`, 'Equity'];
            return [`${v.toFixed(2)}%`, 'P&L %'];
          }}
        />
        <ReferenceLine
          y={initialCapital}
          stroke="#374151"
          strokeDasharray="3 3"
          label={{
            value: 'Iniziale',
            position: 'right',
            fill: '#4b5563',
            fontSize: 10,
          }}
        />
        <Line
          type="monotone"
          dataKey="equity"
          stroke={areaColor}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, fill: areaColor }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
