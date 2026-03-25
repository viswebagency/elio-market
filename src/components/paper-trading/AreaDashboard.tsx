/**
 * AreaDashboard — Componente riutilizzabile per la dashboard paper trading
 * di una singola area (crypto, stocks, forex, betfair).
 * Fetch dati reali da API, sessioni espandibili, equity curve, start/stop.
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

interface SessionSnapshot {
  timestamp: string;
  equity: number;
  pnlPct: number;
}

interface UnifiedSession {
  id: string;
  area: string;
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
  tickers?: string[];
  eventTypes?: string[];
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
  byArea: Record<string, AreaBreakdown>;
  sessions: UnifiedSession[];
}

// ---------------------------------------------------------------------------
// Config per area
// ---------------------------------------------------------------------------

export type AreaKey = 'polymarket' | 'crypto' | 'stocks' | 'betfair' | 'forex';

interface AreaConfig {
  key: AreaKey;
  label: string;
  subtitle: string;
  color: string;
  startEndpoint: string;
  stopEndpoint: string;
  /** Label per il campo extra specifico dell'area (pairs, tickers, eventTypes) */
  extraLabel?: string;
}

export const AREA_CONFIGS: Record<AreaKey, AreaConfig> = {
  polymarket: {
    key: 'polymarket',
    label: 'Polymarket',
    subtitle: 'Mercati predittivi',
    color: '#8B5CF6',
    startEndpoint: '/api/paper-trading/start',
    stopEndpoint: '/api/paper-trading/stop',
  },
  crypto: {
    key: 'crypto',
    label: 'Crypto',
    subtitle: 'Mercati delle criptovalute',
    color: '#F97316',
    startEndpoint: '/api/paper-trading/crypto/start',
    stopEndpoint: '/api/paper-trading/crypto/stop',
    extraLabel: 'Pairs',
  },
  stocks: {
    key: 'stocks',
    label: 'Azioni',
    subtitle: 'Mercati azionari e ETF',
    color: '#10B981',
    startEndpoint: '/api/paper-trading/stocks/start',
    stopEndpoint: '/api/paper-trading/stocks/stop',
    extraLabel: 'Ticker',
  },
  betfair: {
    key: 'betfair',
    label: 'Betfair',
    subtitle: 'Trading sportivo exchange',
    color: '#F59E0B',
    startEndpoint: '/api/paper-trading/betfair/start',
    stopEndpoint: '/api/paper-trading/betfair/stop',
    extraLabel: 'Eventi',
  },
  forex: {
    key: 'forex',
    label: 'Forex',
    subtitle: 'Mercati valutari',
    color: '#3B82F6',
    startEndpoint: '/api/paper-trading/forex/start',
    stopEndpoint: '/api/paper-trading/forex/stop',
    extraLabel: 'Pairs',
  },
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

function timeAgo(isoString: string | null): string {
  if (!isoString) return 'mai';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'ora';
  if (mins < 60) return `${mins}m fa`;
  const hours = Math.floor(mins / 60);
  return `${hours}h fa`;
}

/** Mappa area dashboard → area nel DB strategies (MarketArea enum) */
const AREA_TO_DB: Record<AreaKey, string> = {
  polymarket: 'prediction',
  crypto: 'crypto',
  stocks: 'stocks',
  betfair: 'exchange_betting',
  forex: 'forex',
};

interface StrategyOption {
  id: string;
  code: string;
  name: string;
}

function getSessionExtra(s: UnifiedSession): string[] {
  if (s.pairs && s.pairs.length > 0) return s.pairs;
  if (s.tickers && s.tickers.length > 0) return s.tickers;
  if (s.eventTypes && s.eventTypes.length > 0) return s.eventTypes;
  return [];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AreaDashboardProps {
  area: AreaKey;
  /** Contenuto extra da renderizzare sotto l'header (es. browser Betfair) */
  children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AreaDashboard({ area, children }: AreaDashboardProps) {
  const config = AREA_CONFIGS[area];

  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  // Start session state
  const [showStartForm, setShowStartForm] = useState(false);
  const [strategies, setStrategies] = useState<StrategyOption[]>([]);
  const [strategiesLoading, setStrategiesLoading] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [startCapital, setStartCapital] = useState('100');
  const [startLoading, setStartLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Fetch data
  const fetchData = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        const res = await fetch(
          `/api/paper-trading/overview?area=${area}&snapshots=true&snapshotLimit=200`,
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
    },
    [area],
  );

  // Auto-refresh 30s
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Stop session
  const handleStop = async (sessionId: string) => {
    setActionLoading(sessionId);
    try {
      await fetch(config.stopEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      await fetchData();
    } finally {
      setActionLoading(null);
    }
  };

  // Fetch strategies for start form
  const fetchStrategies = useCallback(async () => {
    if (strategies.length > 0) return;
    setStrategiesLoading(true);
    try {
      const res = await fetch('/api/strategies');
      const json = await res.json();
      if (json.ok && json.strategies) {
        const dbArea = AREA_TO_DB[area];
        const filtered = json.strategies
          .filter((s: { area: string; isActive: boolean }) => s.area === dbArea && s.isActive)
          .map((s: { id: string; code: string; name: string }) => ({
            id: s.id,
            code: s.code,
            name: s.name,
          }));
        setStrategies(filtered);
        if (filtered.length > 0) setSelectedStrategy(filtered[0].code);
      }
    } catch {
      // Silently fail
    } finally {
      setStrategiesLoading(false);
    }
  }, [area, strategies.length]);

  // Start session
  const handleStart = async () => {
    if (!selectedStrategy) return;
    setStartLoading(true);
    setStartError(null);
    try {
      const body: Record<string, unknown> =
        area === 'polymarket'
          ? {
              strategyId: strategies.find((s) => s.code === selectedStrategy)?.id,
              initialCapital: Number(startCapital) || 100,
            }
          : {
              strategyCode: selectedStrategy,
              initialCapital: Number(startCapital) || 100,
            };

      const res = await fetch(config.startEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Errore avvio sessione');
      setShowStartForm(false);
      await fetchData();
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Errore sconosciuto');
    } finally {
      setStartLoading(false);
    }
  };

  // Open start form
  const openStartForm = () => {
    setShowStartForm(true);
    fetchStrategies();
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <AreaHeader config={config} />
        {children}
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-gray-500">
            Caricamento {config.label}...
          </div>
        </div>
      </div>
    );
  }

  const areaData = data?.byArea?.[area];
  const sessions = (data?.sessions ?? []).filter((s) => s.area === area);
  const activeSessions = sessions.filter(
    (s) => s.status === 'running' || s.status === 'paused',
  );
  const sortedSessions = [...activeSessions].sort(
    (a, b) => b.totalPnlPct - a.totalPnlPct,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <AreaHeader config={config} />
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${refreshing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}
              />
              <span className="text-xs text-gray-500">
                {refreshing
                  ? 'Aggiornamento...'
                  : lastRefresh.toLocaleTimeString('it-IT')}
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
            variant="primary"
            size="sm"
            onClick={openStartForm}
          >
            + Nuova sessione
          </Button>
        </div>
      </div>

      {/* Start session form */}
      {showStartForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Avvia nuova sessione {config.label}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowStartForm(false)}>
                Chiudi
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {strategiesLoading ? (
              <div className="flex items-center gap-2 text-gray-400 py-4">
                <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Caricamento strategie...</span>
              </div>
            ) : strategies.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">
                Nessuna strategia attiva trovata per {config.label}.
                Le strategie vengono create dalla pagina Strategie o tramite seed automatici.
              </p>
            ) : (
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1.5">
                    Strategia
                  </label>
                  <select
                    value={selectedStrategy}
                    onChange={(e) => setSelectedStrategy(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-gray-500"
                  >
                    {strategies.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-40">
                  <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1.5">
                    Capitale ($)
                  </label>
                  <input
                    type="number"
                    value={startCapital}
                    onChange={(e) => setStartCapital(e.target.value)}
                    min="1"
                    max="100000"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:border-gray-500"
                  />
                </div>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleStart}
                  loading={startLoading}
                  disabled={!selectedStrategy}
                >
                  Avvia
                </Button>
              </div>
            )}
            {startError && (
              <p className="text-red-400 text-xs mt-3">{startError}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Capitale"
          value={`$${(areaData?.capital ?? 0).toFixed(2)}`}
        />
        <MetricCard
          label="P&L"
          value={formatPnl(areaData?.pnl ?? 0)}
          valueColor={pnlClass(areaData?.pnl ?? 0)}
        />
        <MetricCard
          label="Sessioni attive"
          value={String(activeSessions.filter((s) => s.status === 'running').length)}
          sub={
            activeSessions.filter((s) => s.status === 'paused').length > 0
              ? `${activeSessions.filter((s) => s.status === 'paused').length} in pausa`
              : undefined
          }
          subColor="text-amber-400"
        />
        <MetricCard
          label="Posizioni aperte"
          value={String(
            activeSessions.reduce((sum, s) => sum + s.openPositions, 0),
          )}
        />
      </div>

      {/* Area-specific extra content (e.g., Betfair market browser) */}
      {children}

      {/* Sessions */}
      <div>
        <h2 className="text-lg font-semibold text-gray-200 mb-3">
          Sessioni Paper Trading
          <span className="text-sm font-normal text-gray-500 ml-2">
            {sortedSessions.length} attiv{sortedSessions.length !== 1 ? 'e' : 'a'}
          </span>
        </h2>

        {sortedSessions.length > 0 ? (
          <div className="space-y-4">
            {sortedSessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                areaColor={config.color}
                extraLabel={config.extraLabel}
                expanded={expandedSession === s.id}
                onToggle={() =>
                  setExpandedSession(expandedSession === s.id ? null : s.id)
                }
                onStop={() => handleStop(s.id)}
                stopLoading={actionLoading === s.id}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500">
                Nessuna sessione attiva per {config.label}.
              </p>
              <p className="text-gray-600 text-xs mt-2">
                Avvia una sessione dalla pagina Paper Trading o tramite cron automatico.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Completed sessions */}
      {sessions.filter((s) => s.status === 'completed' || s.status === 'stopped').length > 0 && (
        <CompletedSessionsTable
          sessions={sessions.filter((s) => s.status === 'completed' || s.status === 'stopped')}
          areaColor={config.color}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AreaHeader
// ---------------------------------------------------------------------------

function AreaHeader({ config }: { config: AreaConfig }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-100">
        <span
          className="inline-block w-3 h-3 rounded-full mr-2"
          style={{ backgroundColor: config.color }}
        />
        {config.label}
      </h1>
      <p className="text-sm text-gray-400 mt-1">{config.subtitle}</p>
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
  areaColor,
  extraLabel,
  expanded,
  onToggle,
  onStop,
  stopLoading,
}: {
  session: UnifiedSession;
  areaColor: string;
  extraLabel?: string;
  expanded: boolean;
  onToggle: () => void;
  onStop: () => void;
  stopLoading: boolean;
}) {
  const extras = getSessionExtra(s);

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
            <span className={pnlClass(s.totalPnlPct)}>
              {formatPct(s.totalPnlPct)}
            </span>
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
                {extras.length > 0 && extraLabel && (
                  <span className="text-xs text-gray-500">
                    {extraLabel}: {extras.join(', ')}
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

// ---------------------------------------------------------------------------
// CompletedSessionsTable
// ---------------------------------------------------------------------------

function CompletedSessionsTable({
  sessions,
  areaColor,
}: {
  sessions: UnifiedSession[];
  areaColor: string;
}) {
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-200 mb-3">
        Sessioni completate
        <span className="text-sm font-normal text-gray-500 ml-2">
          {sorted.length}
        </span>
      </h2>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                <th className="text-left py-2 px-4">Strategia</th>
                <th className="text-right py-2 px-2">Capitale finale</th>
                <th className="text-right py-2 px-2">P&L</th>
                <th className="text-right py-2 px-2">P&L %</th>
                <th className="text-right py-2 px-2">DD Max</th>
                <th className="text-right py-2 px-2">Trades</th>
                <th className="text-right py-2 px-4">Data</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-gray-800/50 hover:bg-gray-800/30"
                >
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: areaColor }}
                      />
                      <span className="font-mono text-gray-300">
                        {s.strategyCode}
                      </span>
                      <span className="text-gray-500 text-xs">
                        {s.strategyName}
                      </span>
                    </div>
                  </td>
                  <td className="text-right py-2 px-2 font-mono text-gray-300">
                    ${s.currentCapital.toFixed(2)}
                  </td>
                  <td
                    className={`text-right py-2 px-2 font-mono ${pnlClass(s.totalPnl)}`}
                  >
                    {formatPnl(s.totalPnl)}
                  </td>
                  <td
                    className={`text-right py-2 px-2 font-mono ${pnlClass(s.totalPnlPct)}`}
                  >
                    {formatPct(s.totalPnlPct)}
                  </td>
                  <td className="text-right py-2 px-2 font-mono text-amber-400">
                    {s.maxDrawdownPct.toFixed(1)}%
                  </td>
                  <td className="text-right py-2 px-2 font-mono text-gray-400">
                    {s.totalTicks}
                  </td>
                  <td className="text-right py-2 px-4 text-gray-500 text-xs">
                    {new Date(s.startedAt).toLocaleDateString('it-IT')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
