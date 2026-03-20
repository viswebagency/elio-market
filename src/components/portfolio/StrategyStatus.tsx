'use client';

/**
 * StrategyStatus — Card per lo stato di una strategia in paper trading.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface StrategyStatusProps {
  sessionId: string;
  strategyName: string;
  strategyCode: string;
  status: 'running' | 'paused' | 'stopped';
  initialCapital: number;
  currentCapital: number;
  totalPnl: number;
  totalPnlPct: number;
  unrealizedPnl: number;
  realizedPnl: number;
  maxDrawdownPct: number;
  openPositionsCount: number;
  totalTicks: number;
  lastTickAt: string | null;
  isCircuitBroken: boolean;
  circuitBrokenReason: string | null;
  onStop: (sessionId: string) => void;
  isLoading?: boolean;
}

const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' }> = {
  running: { label: 'Attivo', variant: 'success' },
  paused: { label: 'In pausa', variant: 'warning' },
  stopped: { label: 'Fermato', variant: 'danger' },
};

function formatCurrency(value: number): string {
  return value.toLocaleString('it-IT', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Mai';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ora';
  if (mins < 60) return `${mins}m fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  return `${Math.floor(hours / 24)}g fa`;
}

export function StrategyStatus({
  sessionId,
  strategyName,
  strategyCode,
  status,
  initialCapital,
  currentCapital,
  totalPnl,
  totalPnlPct,
  unrealizedPnl,
  realizedPnl,
  maxDrawdownPct,
  openPositionsCount,
  totalTicks,
  lastTickAt,
  isCircuitBroken,
  circuitBrokenReason,
  onStop,
  isLoading,
}: StrategyStatusProps) {
  const statusCfg = statusConfig[status] ?? statusConfig.stopped;
  const pnlColor = totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">
              <span className="font-mono text-violet-400 mr-2">{strategyCode}</span>
              {strategyName}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
            {status === 'running' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onStop(sessionId)}
                loading={isLoading}
                className="text-red-400 hover:text-red-300"
              >
                Stop
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Circuit breaker alert */}
        {isCircuitBroken && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-xs">
            Circuit breaker attivo: {circuitBrokenReason ?? 'limite raggiunto'}
          </div>
        )}

        {/* Metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCell
            label="Capitale"
            value={formatCurrency(currentCapital)}
            sub={`Iniziale: ${formatCurrency(initialCapital)}`}
          />
          <MetricCell
            label="P&L Totale"
            value={formatCurrency(totalPnl)}
            sub={formatPct(totalPnlPct)}
            valueClassName={pnlColor}
          />
          <MetricCell
            label="Realizzato"
            value={formatCurrency(realizedPnl)}
            sub={`Unrealized: ${formatCurrency(unrealizedPnl)}`}
            valueClassName={realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
          />
          <MetricCell
            label="Max Drawdown"
            value={formatPct(-maxDrawdownPct)}
            sub={`${openPositionsCount} posizioni aperte`}
            valueClassName="text-amber-400"
          />
        </div>

        {/* Footer info */}
        <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
          <span>
            <span className="font-mono text-gray-400">{totalTicks}</span> tick eseguiti
          </span>
          <span>Ultimo tick: {timeAgo(lastTickAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCell({
  label,
  value,
  sub,
  valueClassName = 'text-gray-100',
}: {
  label: string;
  value: string;
  sub?: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-mono font-semibold mt-0.5 ${valueClassName}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}
