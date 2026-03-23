/**
 * /dashboard/live-trading — Dashboard live trading.
 * Overview, posizioni aperte, trade history, equity curve,
 * controlli (kill switch, circuit breaker), pending approvals.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { EquityCurve } from '@/components/paper-trading/equity-curve';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LiveStats {
  bankroll: number;
  initialBankroll: number;
  peakBankroll: number;
  currency: string;
  dailyPnl: number;
  dailyPnlPct: number;
  totalPnl: number;
  totalPnlPct: number;
  totalTrades: number;
  todayTrades: number;
  killSwitch: { active: boolean; activatedAt: string | null; activatedBy: string | null; reason: string | null };
  circuitBreaker: { tripped: boolean; trippedAt: string | null; reason: string | null; consecutiveLosses: number; dailyLossPct: number; recentErrors: number };
}

interface LivePosition {
  id: string;
  symbol: string;
  direction: string;
  size: number;
  entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  opened_at: string;
}

interface LiveTrade {
  id: string;
  symbol: string;
  direction: string;
  entry_price: number;
  exit_price: number;
  pnl: number;
  commission: number;
  slippage: number;
  executed_at: string;
}

interface EquitySnapshot {
  timestamp: string;
  equity: number;
  pnlPct: number;
}

interface PendingApprovalItem {
  id: string;
  symbol: string;
  direction: string;
  size: number;
  tradeValueUsd: number;
  bankrollPct: number;
  reason?: string;
  requestedAt: string;
}

type TradeFilter = 'today' | 'week' | 'month' | 'all';

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

export default function LiveTradingDashboard() {
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const [trades, setTrades] = useState<LiveTrade[]>([]);
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>('today');
  const [tradePage, setTradePage] = useState(1);
  const [tradeTotalPages, setTradeTotalPages] = useState(1);
  const [equity, setEquity] = useState<EquitySnapshot[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [killSwitchLoading, setKillSwitchLoading] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);
  const [killSwitchConfirm, setKillSwitchConfirm] = useState(false);

  // Fetch all data
  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const [statsRes, posRes, equityRes, pendingRes, tradesRes] = await Promise.all([
        fetch('/api/live-trading/stats'),
        fetch('/api/live-trading/positions'),
        fetch('/api/live-trading/equity?limit=200'),
        fetch('/api/live-trading/pending-approvals'),
        fetch(`/api/live-trading/trades?period=${tradeFilter}&page=${tradePage}&limit=20`),
      ]);

      const [statsJson, posJson, equityJson, pendingJson, tradesJson] = await Promise.all([
        statsRes.json(),
        posRes.json(),
        equityRes.json(),
        pendingRes.json(),
        tradesRes.json(),
      ]);

      if (statsJson.stats) setStats(statsJson.stats);
      if (posJson.positions) setPositions(posJson.positions);
      if (equityJson.snapshots) setEquity(equityJson.snapshots);
      if (pendingJson.pending) setPendingApprovals(pendingJson.pending);
      if (tradesJson.trades) {
        setTrades(tradesJson.trades);
        setTradeTotalPages(tradesJson.pagination?.totalPages ?? 1);
      }

      setLastRefresh(new Date());
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tradeFilter, tradePage]);

  // Auto-refresh 30s
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Kill switch toggle
  const handleKillSwitch = async () => {
    if (!stats) return;
    if (!stats.killSwitch.active && !killSwitchConfirm) {
      setKillSwitchConfirm(true);
      return;
    }

    setKillSwitchLoading(true);
    setKillSwitchConfirm(false);
    try {
      await fetch('/api/live-trading/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: stats.killSwitch.active ? 'deactivate' : 'activate' }),
      });
      await fetchData();
    } finally {
      setKillSwitchLoading(false);
    }
  };

  // Approve/reject trade
  const handleApproval = async (tradeId: string, approve: boolean) => {
    setApprovalLoading(tradeId);
    try {
      const endpoint = approve ? '/api/live-trading/approve' : '/api/live-trading/reject';
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeId }),
      });
      await fetchData();
    } finally {
      setApprovalLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-500">Caricamento live trading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Live Trading</h1>
          <p className="text-sm text-gray-400 mt-1">Dashboard operativa — Crypto</p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${refreshing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}
              />
              <span className="text-xs text-gray-500">
                {refreshing ? 'Aggiornamento...' : lastRefresh.toLocaleTimeString('it-IT')}
              </span>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => fetchData(true)} loading={refreshing}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Pending approvals banner */}
      {pendingApprovals.length > 0 && (
        <Card className="border-amber-800/50 bg-amber-900/10">
          <CardHeader>
            <CardTitle className="text-amber-400">
              Trade in attesa di approvazione ({pendingApprovals.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingApprovals.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-amber-800/30 px-4 py-3 bg-gray-900/50">
                  <div className="flex items-center gap-4 text-sm">
                    <Badge variant="crypto">{p.symbol}</Badge>
                    <span className="text-gray-300">{p.direction.toUpperCase()}</span>
                    <span className="font-mono text-gray-200">${p.tradeValueUsd.toFixed(2)}</span>
                    <span className="text-gray-500">({p.bankrollPct.toFixed(1)}% bankroll)</span>
                    {p.reason && <span className="text-gray-500 text-xs">{p.reason}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleApproval(p.id, true)}
                      loading={approvalLoading === p.id}
                    >
                      Approva
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleApproval(p.id, false)}
                      loading={approvalLoading === p.id}
                    >
                      Rifiuta
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overview metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Bankroll"
          value={`$${(stats?.bankroll ?? 0).toFixed(2)}`}
          sub={stats ? `${formatPct(stats.dailyPnlPct)} oggi` : undefined}
          subColor={pnlClass(stats?.dailyPnlPct ?? 0)}
        />
        <MetricCard
          label="P&L Totale"
          value={formatPnl(stats?.totalPnl ?? 0)}
          valueColor={pnlClass(stats?.totalPnl ?? 0)}
          sub={formatPct(stats?.totalPnlPct ?? 0)}
          subColor={pnlClass(stats?.totalPnlPct ?? 0)}
        />
        <MetricCard
          label="P&L Oggi"
          value={formatPnl(stats?.dailyPnl ?? 0)}
          valueColor={pnlClass(stats?.dailyPnl ?? 0)}
        />
        <MetricCard
          label="Trade"
          value={`${stats?.todayTrades ?? 0} oggi`}
          sub={`${stats?.totalTrades ?? 0} totali`}
          subColor="text-gray-500"
        />
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Kill switch */}
        <Card className={stats?.killSwitch.active ? 'border-red-800/50 bg-red-900/10' : ''}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Kill Switch</p>
                <p className="text-sm font-semibold mt-1">
                  {stats?.killSwitch.active ? (
                    <span className="text-red-400">ATTIVO</span>
                  ) : (
                    <span className="text-emerald-400">Disattivo</span>
                  )}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {killSwitchConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-400">Sei sicuro?</span>
                    <Button variant="danger" size="sm" onClick={handleKillSwitch} loading={killSwitchLoading}>
                      Conferma
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setKillSwitchConfirm(false)}>
                      Annulla
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant={stats?.killSwitch.active ? 'secondary' : 'danger'}
                    size="sm"
                    onClick={handleKillSwitch}
                    loading={killSwitchLoading}
                  >
                    {stats?.killSwitch.active ? 'Disattiva' : 'Attiva Kill Switch'}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Circuit breaker */}
        <Card className={stats?.circuitBreaker.tripped ? 'border-red-800/50 bg-red-900/10' : ''}>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Circuit Breaker</p>
            <p className="text-sm font-semibold mt-1">
              {stats?.circuitBreaker.tripped ? (
                <span className="text-red-400">TRIPPED</span>
              ) : (
                <span className="text-emerald-400">OK</span>
              )}
            </p>
            {stats?.circuitBreaker.tripped && stats.circuitBreaker.reason && (
              <p className="text-xs text-gray-500 mt-1">{stats.circuitBreaker.reason}</p>
            )}
            {!stats?.circuitBreaker.tripped && (
              <p className="text-xs text-gray-500 mt-1">
                Losses: {stats?.circuitBreaker.consecutiveLosses ?? 0}/3 |
                Errori: {stats?.circuitBreaker.recentErrors ?? 0}/3
              </p>
            )}
          </CardContent>
        </Card>

        {/* Portfolio sync placeholder */}
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Portfolio Sync</p>
            <p className="text-sm font-semibold mt-1 text-emerald-400">In sync</p>
            <p className="text-xs text-gray-500 mt-1">Ultimo controllo: cron live-tick</p>
          </CardContent>
        </Card>
      </div>

      {/* Equity curve */}
      <Card>
        <CardHeader>
          <CardTitle>Equity Curve</CardTitle>
        </CardHeader>
        <CardContent>
          <EquityCurve
            snapshots={equity}
            initialCapital={stats?.initialBankroll ?? 0}
            height={250}
            areaColor="#F97316"
          />
        </CardContent>
      </Card>

      {/* Open positions */}
      <Card>
        <CardHeader>
          <CardTitle>Posizioni Aperte ({positions.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {positions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Simbolo</TableHead>
                  <TableHead>Direzione</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Prezzo Ingresso</TableHead>
                  <TableHead>Prezzo Attuale</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>P&L %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((pos) => (
                  <TableRow key={pos.id}>
                    <TableCell className="font-mono font-semibold">{pos.symbol}</TableCell>
                    <TableCell>
                      <Badge variant={pos.direction === 'long' ? 'success' : 'danger'}>
                        {pos.direction.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{pos.size}</TableCell>
                    <TableCell className="font-mono">${pos.entry_price.toFixed(2)}</TableCell>
                    <TableCell className="font-mono">${pos.current_price.toFixed(2)}</TableCell>
                    <TableCell className={`font-mono ${pnlClass(pos.unrealized_pnl)}`}>
                      {formatPnl(pos.unrealized_pnl)}
                    </TableCell>
                    <TableCell className={`font-mono ${pnlClass(pos.unrealized_pnl_pct)}`}>
                      {formatPct(pos.unrealized_pnl_pct)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">Nessuna posizione aperta.</p>
          )}
        </CardContent>
      </Card>

      {/* Trade history */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Trade History</CardTitle>
            <div className="flex items-center gap-2">
              {(['today', 'week', 'month', 'all'] as const).map((f) => (
                <Button
                  key={f}
                  variant={tradeFilter === f ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => { setTradeFilter(f); setTradePage(1); }}
                >
                  {f === 'today' ? 'Oggi' : f === 'week' ? 'Settimana' : f === 'month' ? 'Mese' : 'Tutti'}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {trades.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Simbolo</TableHead>
                    <TableHead>Direzione</TableHead>
                    <TableHead>Prezzo Ingresso</TableHead>
                    <TableHead>Prezzo Uscita</TableHead>
                    <TableHead>P&L</TableHead>
                    <TableHead>Commissioni</TableHead>
                    <TableHead>Slippage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trades.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-gray-400 text-xs">
                        {new Date(t.executed_at).toLocaleString('it-IT', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell className="font-mono font-semibold">{t.symbol}</TableCell>
                      <TableCell>
                        <Badge variant={t.direction === 'long' ? 'success' : 'danger'}>
                          {t.direction.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">${t.entry_price?.toFixed(2) ?? '-'}</TableCell>
                      <TableCell className="font-mono">${t.exit_price?.toFixed(2) ?? '-'}</TableCell>
                      <TableCell className={`font-mono ${pnlClass(t.pnl)}`}>
                        {formatPnl(t.pnl)}
                      </TableCell>
                      <TableCell className="font-mono text-gray-400">
                        ${(t.commission ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="font-mono text-gray-400">
                        {(t.slippage ?? 0).toFixed(2)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {/* Pagination */}
              {tradeTotalPages > 1 && (
                <div className="flex items-center justify-center gap-4 py-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTradePage((p) => Math.max(1, p - 1))}
                    disabled={tradePage <= 1}
                  >
                    Precedente
                  </Button>
                  <span className="text-xs text-gray-500">
                    Pagina {tradePage} di {tradeTotalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTradePage((p) => Math.min(tradeTotalPages, p + 1))}
                    disabled={tradePage >= tradeTotalPages}
                  >
                    Successiva
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">Nessun trade per il periodo selezionato.</p>
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
