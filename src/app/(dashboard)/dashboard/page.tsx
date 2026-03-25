/**
 * Meta dashboard — overview of all 5 areas, key metrics, recent activity.
 * Fetches real data from unified paper trading overview API.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EquityCurve } from '@/components/paper-trading/equity-curve';

// ---------------------------------------------------------------------------
// Types (mirror unified API response)
// ---------------------------------------------------------------------------

interface SessionSnapshot {
  timestamp: string;
  equity: number;
  pnlPct: number;
}

interface UnifiedSession {
  id: string;
  area: 'polymarket' | 'crypto' | 'stocks' | 'betfair' | 'forex';
  strategyCode: string;
  strategyName: string;
  status: string;
  initialCapital: number;
  currentCapital: number;
  totalPnl: number;
  totalPnlPct: number;
  maxDrawdownPct: number;
  totalTicks: number;
  openPositions: number;
  lastTickAt: string | null;
  startedAt: string;
  isCircuitBroken: boolean;
  snapshots?: SessionSnapshot[];
}

interface AreaBreakdown {
  capital: number;
  pnl: number;
  sessions: number;
}

interface OverviewData {
  totalCapital: number;
  totalPnl: number;
  totalPnlPct: number;
  activeSessions: number;
  pausedSessions: number;
  totalOpenPositions: number;
  byArea: {
    polymarket: AreaBreakdown;
    crypto: AreaBreakdown;
    stocks: AreaBreakdown;
    betfair: AreaBreakdown;
    forex: AreaBreakdown;
  };
  sessions: UnifiedSession[];
}

interface AiStats {
  totalCostUsd: number;
  todayCostUsd: number;
  dailyBudgetEur: number;
  totalTokensUsed: number;
  totalAnalyses: number;
  totalRequests: number;
  cacheHits: number;
  hitRate: number;
  estimatedSavingsUsd: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AREA_COLORS: Record<string, string> = {
  polymarket: '#8B5CF6',
  crypto: '#F97316',
  stocks: '#10B981',
  betfair: '#F59E0B',
  forex: '#3B82F6',
};

const AREA_LABELS: Record<string, string> = {
  polymarket: 'Polymarket',
  crypto: 'Crypto',
  stocks: 'Azioni',
  betfair: 'Betfair',
  forex: 'Forex',
};

const AREA_LINKS: Record<string, string> = {
  polymarket: '/polymarket',
  crypto: '/crypto',
  stocks: '/stocks',
  betfair: '/betfair',
  forex: '/forex',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pnlClass(value: number): string {
  return value >= 0 ? 'text-emerald-400' : 'text-red-400';
}

function formatPnl(value: number): string {
  return `${value >= 0 ? '+' : ''}$${Math.abs(value).toFixed(2)}`;
}

function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [aiStats, setAiStats] = useState<AiStats | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [overviewRes, kbRes] = await Promise.all([
        fetch('/api/paper-trading/overview?area=all&snapshots=true&snapshotLimit=50'),
        fetch('/api/kb/stats'),
      ]);
      const json = await overviewRes.json();
      if (json.ok !== false) {
        setData(json as OverviewData);
      }
      const kbJson = await kbRes.json();
      if (kbJson.ok && kbJson.stats) {
        setAiStats(kbJson.stats);
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
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-500">Caricamento dashboard...</div>
      </div>
    );
  }

  const sessions = data?.sessions ?? [];
  const activeSessions = sessions.filter(
    (s) => s.status === 'running' || s.status === 'paused',
  );
  const sorted = [...activeSessions].sort(
    (a, b) => b.totalPnlPct - a.totalPnlPct,
  );
  const topStrategy = sorted[0] ?? null;
  const worstStrategy = sorted.length > 1 ? sorted[sorted.length - 1] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">
            Panoramica completa — 5 aree operative
          </p>
        </div>
        {lastRefresh && (
          <p className="text-xs text-gray-600">
            Aggiornato: {lastRefresh.toLocaleTimeString('it-IT')}
          </p>
        )}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard
          label="Capitale totale"
          value={`$${(data?.totalCapital ?? 0).toFixed(2)}`}
        />
        <MetricCard
          label="P&L totale"
          value={formatPnl(data?.totalPnl ?? 0)}
          valueColor={pnlClass(data?.totalPnl ?? 0)}
          sub={formatPct(data?.totalPnlPct ?? 0)}
          subColor={pnlClass(data?.totalPnlPct ?? 0)}
        />
        <MetricCard
          label="Sessioni attive"
          value={String(data?.activeSessions ?? 0)}
          sub={data?.pausedSessions ? `${data.pausedSessions} in pausa` : undefined}
          subColor="text-amber-400"
        />
        <MetricCard
          label="Posizioni aperte"
          value={String(data?.totalOpenPositions ?? 0)}
        />
        <MetricCard
          label="Auto-refresh"
          value="60s"
          sub="Aggiornamento automatico"
          subColor="text-gray-500"
        />
      </div>

      {/* AI Usage */}
      {aiStats && (
        <div className="rounded-xl border border-violet-800/30 bg-violet-950/20 px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-xs text-violet-400 uppercase tracking-wider font-medium">AI Usage</p>
              <span className="text-xs text-gray-500">Claude Sonnet 4.6</span>
            </div>
            <div className="flex items-center gap-6 text-xs font-mono">
              <div className="text-center">
                <span className="text-gray-500 block">Oggi</span>
                <span className={`${aiStats.todayCostUsd * 0.92 > aiStats.dailyBudgetEur * 0.8 ? 'text-amber-400' : 'text-violet-300'}`}>
                  ${aiStats.todayCostUsd.toFixed(4)}
                </span>
                <span className="text-gray-600 text-[10px]"> / {aiStats.dailyBudgetEur}&euro;</span>
              </div>
              <div className="text-center">
                <span className="text-gray-500 block">Totale</span>
                <span className="text-violet-300">${aiStats.totalCostUsd.toFixed(4)}</span>
              </div>
              <div className="text-center">
                <span className="text-gray-500 block">Token</span>
                <span className="text-gray-300">{aiStats.totalTokensUsed.toLocaleString()}</span>
              </div>
              <div className="text-center">
                <span className="text-gray-500 block">Analisi</span>
                <span className="text-gray-300">{aiStats.totalAnalyses}</span>
              </div>
              <div className="text-center">
                <span className="text-gray-500 block">Cache hit</span>
                <span className="text-emerald-400">{(aiStats.hitRate * 100).toFixed(0)}%</span>
              </div>
              <div className="text-center">
                <span className="text-gray-500 block">Risparmiato</span>
                <span className="text-emerald-400">${aiStats.estimatedSavingsUsd.toFixed(4)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Area breakdown */}
      {data?.byArea && (
        <div>
          <h2 className="text-lg font-semibold text-gray-200 mb-3">Aree Mercato</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {(['polymarket', 'crypto', 'stocks', 'betfair', 'forex'] as const).map((area) => {
              const b = data.byArea[area];
              const isActive = b.sessions > 0;
              return (
                <a
                  key={area}
                  href={AREA_LINKS[area]}
                  className="block rounded-xl border px-5 py-4 transition-colors hover:bg-gray-800/30"
                  style={{
                    borderColor: `${AREA_COLORS[area]}${isActive ? '40' : '20'}`,
                    backgroundColor: `${AREA_COLORS[area]}08`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: AREA_COLORS[area] }}
                    />
                    <span className="text-sm font-medium text-gray-200">
                      {AREA_LABELS[area]}
                    </span>
                    <Badge variant={isActive ? 'success' : 'default'}>
                      {isActive ? `${b.sessions} attiv${b.sessions > 1 ? 'e' : 'a'}` : 'Inattivo'}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Capitale</span>
                      <span className="text-gray-300">${b.capital.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">P&L</span>
                      <span className={pnlClass(b.pnl)}>{formatPnl(b.pnl)}</span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Top / Worst strategy */}
      {topStrategy && (
        <div className={`grid grid-cols-1 ${worstStrategy ? 'md:grid-cols-2' : ''} gap-4`}>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Miglior strategia</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: AREA_COLORS[topStrategy.area] }}
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-100">{topStrategy.strategyCode}</p>
                    <p className="text-xs text-gray-400">{topStrategy.strategyName}</p>
                  </div>
                </div>
                <p className={`text-lg font-bold font-mono ${pnlClass(topStrategy.totalPnlPct)}`}>
                  {formatPct(topStrategy.totalPnlPct)}
                </p>
              </div>
            </CardContent>
          </Card>
          {worstStrategy && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Peggior strategia</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: AREA_COLORS[worstStrategy.area] }}
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-100">{worstStrategy.strategyCode}</p>
                      <p className="text-xs text-gray-400">{worstStrategy.strategyName}</p>
                    </div>
                  </div>
                  <p className={`text-lg font-bold font-mono ${pnlClass(worstStrategy.totalPnlPct)}`}>
                    {formatPct(worstStrategy.totalPnlPct)}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Sessions table — all areas */}
      {sorted.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-200 mb-3">
            Sessioni Paper Trading ({sorted.length})
          </h2>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                    <th className="text-left py-2 px-4">Area</th>
                    <th className="text-left py-2 px-2">Strategia</th>
                    <th className="text-right py-2 px-2">Capitale</th>
                    <th className="text-right py-2 px-2">P&L</th>
                    <th className="text-right py-2 px-2">P&L %</th>
                    <th className="text-right py-2 px-2">DD Max</th>
                    <th className="text-right py-2 px-2">Posizioni</th>
                    <th className="text-right py-2 px-2">Ticks</th>
                    <th className="text-right py-2 px-4">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s) => (
                    <tr key={s.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-2 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: AREA_COLORS[s.area] }}
                          />
                          <span className="text-xs text-gray-400">{AREA_LABELS[s.area]}</span>
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <span className="font-mono text-gray-300">{s.strategyCode}</span>
                        <span className="text-gray-500 ml-2 text-xs">{s.strategyName}</span>
                      </td>
                      <td className="text-right py-2 px-2 font-mono text-gray-300">
                        ${s.currentCapital.toFixed(2)}
                      </td>
                      <td className={`text-right py-2 px-2 font-mono ${pnlClass(s.totalPnl)}`}>
                        {formatPnl(s.totalPnl)}
                      </td>
                      <td className={`text-right py-2 px-2 font-mono ${pnlClass(s.totalPnlPct)}`}>
                        {formatPct(s.totalPnlPct)}
                      </td>
                      <td className="text-right py-2 px-2 font-mono text-amber-400">
                        {s.maxDrawdownPct.toFixed(1)}%
                      </td>
                      <td className="text-right py-2 px-2 font-mono text-gray-400">
                        {s.openPositions}
                      </td>
                      <td className="text-right py-2 px-2 font-mono text-gray-500">
                        {s.totalTicks}
                      </td>
                      <td className="text-right py-2 px-4">
                        {s.isCircuitBroken ? (
                          <Badge variant="danger">CB</Badge>
                        ) : s.status === 'running' ? (
                          <Badge variant="success">Attivo</Badge>
                        ) : (
                          <Badge variant="warning">{s.status}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Global equity curve — aggregate all active sessions */}
      {activeSessions.some((s) => (s.snapshots?.length ?? 0) > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Equity Curve Globale</CardTitle>
          </CardHeader>
          <CardContent>
            <AggregateEquityCurve sessions={activeSessions} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AggregateEquityCurve — merges snapshots from all sessions
// ---------------------------------------------------------------------------

function AggregateEquityCurve({ sessions }: { sessions: UnifiedSession[] }) {
  const totalInitial = sessions.reduce((sum, s) => sum + s.initialCapital, 0);

  // Build a time-series map: aggregate equity per timestamp
  const timeMap = new Map<string, number>();
  for (const s of sessions) {
    for (const snap of s.snapshots ?? []) {
      const key = snap.timestamp;
      timeMap.set(key, (timeMap.get(key) ?? 0) + snap.equity);
    }
  }

  const snapshots = [...timeMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([timestamp, equity]) => ({
      timestamp,
      equity,
      pnlPct: totalInitial > 0 ? ((equity - totalInitial) / totalInitial) * 100 : 0,
    }));

  return (
    <EquityCurve
      snapshots={snapshots}
      initialCapital={totalInitial}
      height={250}
      areaColor="#8B5CF6"
    />
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
