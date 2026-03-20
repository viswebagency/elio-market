/**
 * Meta dashboard — overview of all areas, key metrics, recent activity.
 * Fetches real data from paper trading API.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MARKET_AREAS_LIST } from '@/core/constants/market-areas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionMetrics {
  initialCapital: number;
  currentCapital: number;
  totalPnl: number;
  totalPnlPct: number;
  maxDrawdownPct: number;
  totalTicks: number;
  lastTickAt: string | null;
}

interface Position {
  marketName: string;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  stake: number;
}

interface Trade {
  action: string;
  marketName: string;
  netPnl: number;
  returnPct: number;
  executedAt: string;
}

interface Session {
  id: string;
  strategyName: string;
  strategyCode: string;
  status: string;
  metrics: SessionMetrics;
  isCircuitBroken: boolean;
  openPositions: Position[];
  recentTrades: Trade[];
}

interface Overview {
  totalCapital: number;
  totalPnl: number;
  totalPnlToday: number;
  activeSessions: number;
  pausedSessions: number;
  totalOpenPositions: number;
  sessions: Session[];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/paper-trading/status');
      const json = await res.json();
      if (json.ok !== false) {
        setData(json);
      }
      setLastRefresh(new Date());
    } catch {
      // Silently fail — will show stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000); // Refresh every 60s
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-500">Caricamento dashboard...</div>
      </div>
    );
  }

  const pnlColor = (data?.totalPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400';
  const pnlSign = (data?.totalPnl ?? 0) >= 0 ? '+' : '';

  // Count strategies per area
  const polymarketSessions = data?.sessions ?? [];
  const polymarketPnl = polymarketSessions.reduce((s, sess) => s + sess.metrics.totalPnl, 0);

  // Top performing and worst performing
  const sorted = [...(data?.sessions ?? [])].sort(
    (a, b) => b.metrics.totalPnlPct - a.metrics.totalPnlPct,
  );
  const topStrategy = sorted[0] ?? null;
  const worstStrategy = sorted[sorted.length - 1] ?? null;

  // Recent trades across all sessions
  const allTrades = (data?.sessions ?? [])
    .flatMap((s) => s.recentTrades.map((t) => ({ ...t, strategyCode: s.strategyCode })))
    .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">
            Panoramica completa — paper trading attivo
          </p>
        </div>
        {lastRefresh && (
          <p className="text-xs text-gray-600">
            Aggiornato: {lastRefresh.toLocaleTimeString('it-IT')}
          </p>
        )}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Capitale totale"
          value={`$${(data?.totalCapital ?? 0).toFixed(2)}`}
          sub={`${pnlSign}${(data?.totalPnl ?? 0).toFixed(2)}$`}
          subColor={pnlColor}
        />
        <MetricCard
          label="P&L totale"
          value={`${pnlSign}$${Math.abs(data?.totalPnl ?? 0).toFixed(2)}`}
          valueColor={pnlColor}
        />
        <MetricCard
          label="Strategie attive"
          value={String(data?.activeSessions ?? 0)}
          sub={data?.pausedSessions ? `${data.pausedSessions} in pausa` : undefined}
          subColor="text-amber-400"
        />
        <MetricCard
          label="Posizioni aperte"
          value={String(data?.totalOpenPositions ?? 0)}
        />
      </div>

      {/* Top / Worst strategy */}
      {topStrategy && worstStrategy && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Miglior strategia</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-100">{topStrategy.strategyCode}</p>
                  <p className="text-xs text-gray-400">{topStrategy.strategyName}</p>
                </div>
                <p className={`text-lg font-bold font-mono ${topStrategy.metrics.totalPnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {topStrategy.metrics.totalPnlPct >= 0 ? '+' : ''}{topStrategy.metrics.totalPnlPct.toFixed(2)}%
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Peggior strategia</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-100">{worstStrategy.strategyCode}</p>
                  <p className="text-xs text-gray-400">{worstStrategy.strategyName}</p>
                </div>
                <p className={`text-lg font-bold font-mono ${worstStrategy.metrics.totalPnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {worstStrategy.metrics.totalPnlPct >= 0 ? '+' : ''}{worstStrategy.metrics.totalPnlPct.toFixed(2)}%
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Area overview */}
      <div>
        <h2 className="text-lg font-semibold text-gray-200 mb-3">Aree Mercato</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MARKET_AREAS_LIST.map((area) => {
            const isPolymarket = area.id === 'prediction';
            const sessionCount = isPolymarket ? polymarketSessions.length : 0;
            const areaPnl = isPolymarket ? polymarketPnl : 0;
            const isConnected = sessionCount > 0;

            return (
              <Card key={area.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>
                      <span className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: area.color }}
                        />
                        {area.nameIt}
                      </span>
                    </CardTitle>
                    <Badge variant={isConnected ? 'default' : 'secondary'}>
                      {isConnected ? 'Attivo' : 'Non connesso'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-400">{area.descriptionIt}</p>
                  <div className="mt-3 flex gap-4 text-xs text-gray-500">
                    <span>Strategie: {sessionCount}</span>
                    <span className={areaPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      P&L: {areaPnl >= 0 ? '+' : ''}${areaPnl.toFixed(2)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Strategy sessions overview */}
      {data && data.sessions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-200 mb-3">
            Sessioni Paper Trading ({data.sessions.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                  <th className="text-left py-2 pr-4">Strategia</th>
                  <th className="text-right py-2 px-2">Capitale</th>
                  <th className="text-right py-2 px-2">P&L</th>
                  <th className="text-right py-2 px-2">P&L %</th>
                  <th className="text-right py-2 px-2">DD Max</th>
                  <th className="text-right py-2 px-2">Posizioni</th>
                  <th className="text-right py-2 px-2">Ticks</th>
                  <th className="text-right py-2 pl-2">Stato</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const pnl = s.metrics.totalPnl;
                  const pnlPct = s.metrics.totalPnlPct;
                  return (
                    <tr key={s.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-2 pr-4">
                        <span className="font-mono text-gray-300">{s.strategyCode}</span>
                        <span className="text-gray-500 ml-2 text-xs">{s.strategyName}</span>
                      </td>
                      <td className="text-right py-2 px-2 font-mono text-gray-300">
                        ${s.metrics.currentCapital.toFixed(2)}
                      </td>
                      <td className={`text-right py-2 px-2 font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                      </td>
                      <td className={`text-right py-2 px-2 font-mono ${pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                      </td>
                      <td className="text-right py-2 px-2 font-mono text-amber-400">
                        {s.metrics.maxDrawdownPct.toFixed(1)}%
                      </td>
                      <td className="text-right py-2 px-2 font-mono text-gray-400">
                        {s.openPositions.length}
                      </td>
                      <td className="text-right py-2 px-2 font-mono text-gray-500">
                        {s.metrics.totalTicks}
                      </td>
                      <td className="text-right py-2 pl-2">
                        {s.isCircuitBroken ? (
                          <Badge variant="destructive">CB</Badge>
                        ) : s.status === 'running' ? (
                          <Badge variant="default">Attivo</Badge>
                        ) : (
                          <Badge variant="secondary">{s.status}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle>Attivita&apos; recente</CardTitle>
        </CardHeader>
        <CardContent>
          {allTrades.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">
              Nessun trade eseguito ancora. I cron tick sono attivi — i primi trade arriveranno presto.
            </p>
          ) : (
            <div className="space-y-2">
              {allTrades.map((trade, i) => {
                const isOpen = trade.action === 'open';
                const icon = isOpen ? '🟢' : trade.netPnl >= 0 ? '🟢' : '🔴';
                return (
                  <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-gray-800/30">
                    <div className="flex items-center gap-2">
                      <span>{icon}</span>
                      <span className="text-gray-400 font-mono text-xs">{trade.strategyCode}</span>
                      <span className="text-gray-300 truncate max-w-[200px]">{trade.marketName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono text-xs ${trade.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isOpen ? 'OPEN' : `${trade.netPnl >= 0 ? '+' : ''}$${trade.netPnl.toFixed(2)}`}
                      </span>
                      <span className="text-gray-600 text-xs">
                        {new Date(trade.executedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetricCard
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  valueColor,
  sub,
  subColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
  subColor?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
        <p className={`text-xl font-bold font-mono mt-1 ${valueColor ?? 'text-gray-100'}`}>{value}</p>
        {sub && <p className={`text-xs mt-1 ${subColor ?? 'text-gray-400'}`}>{sub}</p>}
      </CardContent>
    </Card>
  );
}
