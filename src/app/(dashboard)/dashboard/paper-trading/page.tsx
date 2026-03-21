/**
 * /dashboard/paper-trading — Vista unificata di tutte le sessioni paper trading.
 * Polymarket + Crypto con filtri, azioni, equity curve e auto-refresh 30s.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EquityCurve } from '@/components/paper-trading/equity-curve';

// ---------------------------------------------------------------------------
// Types (mirror API response)
// ---------------------------------------------------------------------------

type AreaFilter = 'all' | 'polymarket' | 'crypto';

interface SessionSnapshot {
  timestamp: string;
  equity: number;
  pnlPct: number;
}

interface UnifiedSession {
  id: string;
  area: 'polymarket' | 'crypto';
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
  pairs?: string[];
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
  };
  sessions: UnifiedSession[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AREA_COLORS: Record<string, string> = {
  polymarket: '#8B5CF6',
  crypto: '#F97316',
};

const AREA_LABELS: Record<string, string> = {
  polymarket: 'Polymarket',
  crypto: 'Crypto',
};

function pnlClass(value: number): string {
  return value >= 0 ? 'text-emerald-400' : 'text-red-400';
}

function formatPnl(value: number): string {
  return `${value >= 0 ? '+' : ''}$${Math.abs(value).toFixed(2)}`;
}

function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function timeAgo(isoString: string | null): string {
  if (!isoString) return 'mai';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'ora';
  if (mins < 60) return `${mins}m fa`;
  const hours = Math.floor(mins / 60);
  return `${hours}h fa`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PaperTradingDashboard() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('all');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  // Fetch data
  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch(
        `/api/paper-trading/overview?area=${areaFilter}&snapshots=true&snapshotLimit=200`,
      );
      const json = await res.json();
      if (json.ok !== false) {
        setData(json as OverviewData);
      }
      setLastRefresh(new Date());
    } catch {
      // Silently fail — show stale data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [areaFilter]);

  // Auto-refresh 30s
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Actions
  const handleStop = async (sessionId: string, area: string) => {
    setActionLoading(sessionId);
    try {
      const endpoint =
        area === 'crypto'
          ? '/api/paper-trading/crypto/stop'
          : '/api/paper-trading/stop';
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      await fetchData();
    } finally {
      setActionLoading(null);
    }
  };

  const handleTick = async () => {
    setRefreshing(true);
    try {
      // Tick both managers
      await Promise.all([
        fetch('/api/paper-trading/tick', { method: 'POST' }),
        fetch('/api/paper-trading/crypto/tick', { method: 'POST' }).catch(() => {}),
      ]);
      // Wait a beat then refresh data
      await new Promise((r) => setTimeout(r, 500));
      await fetchData();
    } finally {
      setRefreshing(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-500">Caricamento paper trading...</div>
      </div>
    );
  }

  const sessions = data?.sessions ?? [];
  const filteredSessions = sessions.filter(
    (s) => areaFilter === 'all' || s.area === areaFilter,
  );
  const activeSessions = filteredSessions.filter(
    (s) => s.status === 'running' || s.status === 'paused',
  );
  const sortedSessions = [...activeSessions].sort(
    (a, b) => b.totalPnlPct - a.totalPnlPct,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Paper Trading</h1>
          <p className="text-sm text-gray-400 mt-1">
            Vista unificata — Polymarket + Crypto
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Last refresh indicator */}
          {lastRefresh && (
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${refreshing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}
              />
              <span className="text-xs text-gray-500">
                {refreshing
                  ? 'Aggiornamento...'
                  : `${lastRefresh.toLocaleTimeString('it-IT')}`}
              </span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            loading={refreshing}
          >
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTick}
            loading={refreshing}
          >
            Force Tick
          </Button>
        </div>
      </div>

      {/* Global metrics */}
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
          value="30s"
          sub="Prossimo tick automatico"
          subColor="text-gray-500"
        />
      </div>

      {/* Area breakdown */}
      {data?.byArea && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(['polymarket', 'crypto'] as const).map((area) => {
            const b = data.byArea[area];
            return (
              <div
                key={area}
                className="rounded-xl border px-5 py-3 flex items-center justify-between"
                style={{
                  borderColor: `${AREA_COLORS[area]}30`,
                  backgroundColor: `${AREA_COLORS[area]}08`,
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: AREA_COLORS[area] }}
                  />
                  <span className="text-sm font-medium text-gray-200">
                    {AREA_LABELS[area]}
                  </span>
                  <span className="text-xs text-gray-500">
                    {b.sessions} session{b.sessions !== 1 ? 'i' : 'e'}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="text-gray-300">${b.capital.toFixed(2)}</span>
                  <span className={pnlClass(b.pnl)}>{formatPnl(b.pnl)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2">
        {(['all', 'polymarket', 'crypto'] as const).map((f) => (
          <Button
            key={f}
            variant={areaFilter === f ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setAreaFilter(f)}
          >
            {f === 'all' ? 'Tutte' : AREA_LABELS[f]}
          </Button>
        ))}
        <span className="text-xs text-gray-500 ml-2">
          {sortedSessions.length} session{sortedSessions.length !== 1 ? 'i' : 'e'}
        </span>
      </div>

      {/* Sessions table */}
      {sortedSessions.length > 0 ? (
        <div className="space-y-4">
          {sortedSessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              expanded={expandedSession === s.id}
              onToggle={() =>
                setExpandedSession(expandedSession === s.id ? null : s.id)
              }
              onStop={() => handleStop(s.id, s.area)}
              stopLoading={actionLoading === s.id}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">
              Nessuna sessione attiva per il filtro selezionato.
            </p>
          </CardContent>
        </Card>
      )}
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
        <p className={`text-xl font-bold font-mono mt-1 ${valueColor ?? 'text-gray-100'}`}>
          {value}
        </p>
        {sub && (
          <p className={`text-xs mt-1 ${subColor ?? 'text-gray-400'}`}>{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SessionCard
// ---------------------------------------------------------------------------

function SessionCard({
  session: s,
  expanded,
  onToggle,
  onStop,
  stopLoading,
}: {
  session: UnifiedSession;
  expanded: boolean;
  onToggle: () => void;
  onStop: () => void;
  stopLoading: boolean;
}) {
  const areaColor = AREA_COLORS[s.area];

  return (
    <Card>
      {/* Header row */}
      <div
        className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-800/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: areaColor }}
          />
          <span className="font-mono text-sm font-semibold text-gray-100">
            {s.strategyCode}
          </span>
          <span className="text-xs text-gray-500">{s.strategyName}</span>
          <Badge variant={s.area as 'crypto' | 'prediction'}>
            {AREA_LABELS[s.area]}
          </Badge>
          {s.isCircuitBroken && <Badge variant="danger">CB</Badge>}
          {s.status === 'paused' && !s.isCircuitBroken && (
            <Badge variant="warning">Pausa</Badge>
          )}
        </div>

        <div className="flex items-center gap-6 text-xs font-mono">
          <div className="text-center">
            <span className="text-gray-500 block">Capitale</span>
            <span className="text-gray-200">${s.currentCapital.toFixed(2)}</span>
          </div>
          <div className="text-center">
            <span className="text-gray-500 block">P&L</span>
            <span className={pnlClass(s.totalPnl)}>{formatPnl(s.totalPnl)}</span>
          </div>
          <div className="text-center">
            <span className="text-gray-500 block">P&L %</span>
            <span className={pnlClass(s.totalPnlPct)}>{formatPct(s.totalPnlPct)}</span>
          </div>
          <div className="text-center">
            <span className="text-gray-500 block">DD Max</span>
            <span className="text-amber-400">{s.maxDrawdownPct.toFixed(1)}%</span>
          </div>
          <div className="text-center">
            <span className="text-gray-500 block">Trades</span>
            <span className="text-gray-400">{s.totalTicks}</span>
          </div>
          <div className="text-center">
            <span className="text-gray-500 block">Open</span>
            <span className="text-gray-400">{s.openPositions}</span>
          </div>
          <div className="text-center">
            <span className="text-gray-500 block">Ultimo tick</span>
            <span className="text-gray-400">{timeAgo(s.lastTickAt)}</span>
          </div>
        </div>
      </div>

      {/* Expanded: equity curve + actions */}
      {expanded && (
        <div className="border-t border-gray-800">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                Equity Curve
              </p>
              <div className="flex items-center gap-2">
                {s.pairs && s.pairs.length > 0 && (
                  <span className="text-xs text-gray-500">
                    Pairs: {s.pairs.join(', ')}
                  </span>
                )}
                <Button
                  variant="danger"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStop();
                  }}
                  loading={stopLoading}
                >
                  Stop
                </Button>
              </div>
            </div>
            <EquityCurve
              snapshots={s.snapshots ?? []}
              initialCapital={s.initialCapital}
              height={180}
              areaColor={areaColor}
            />
            <div className="mt-3 flex gap-6 text-xs text-gray-500">
              <span>
                Avviata: {new Date(s.startedAt).toLocaleDateString('it-IT')}{' '}
                {new Date(s.startedAt).toLocaleTimeString('it-IT', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span>Capitale iniziale: ${s.initialCapital.toFixed(2)}</span>
              <span>Ticks totali: {s.totalTicks}</span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
