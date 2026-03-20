/**
 * Trading Journal — log automatico di tutti i trade paper trading.
 * FILE_SACRO section 11.3: per ogni operazione, log automatico con
 * motivo, stato mercato, esito finale.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Trade {
  id: string;
  strategyCode: string;
  strategyName: string;
  riskLevel: string;
  marketName: string;
  action: string;
  tier: string;
  price: number;
  quantity: number;
  stake: number;
  grossPnl: number;
  netPnl: number;
  returnPct: number;
  reason: string;
  confidence: number;
  executedAt: string;
}

interface Summary {
  closedTrades: number;
  winRate: number;
  totalPnl: number;
  wins: number;
  losses: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  open: 'Apertura',
  full_close: 'Chiusura',
  partial_close: 'Chiusura parziale',
  circuit_breaker: 'Circuit Breaker',
};

const ACTION_COLORS: Record<string, string> = {
  open: 'text-blue-400',
  full_close: 'text-gray-300',
  partial_close: 'text-amber-400',
  circuit_breaker: 'text-red-400',
};

const RISK_BADGES: Record<string, 'success' | 'warning' | 'danger'> = {
  conservative: 'success',
  moderate: 'warning',
  aggressive: 'danger',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function JournalPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const fetchTrades = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filter !== 'all') params.set('action', filter);

      const res = await fetch(`/api/journal?${params}`);
      const json = await res.json();
      if (json.ok) {
        setTrades(json.trades);
        setSummary(json.summary);
      }
    } catch {
      // Keep empty
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-500">Caricamento journal...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Journal</h1>
        <p className="text-sm text-gray-400 mt-1">
          Log automatico di ogni operazione paper trading
        </p>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Trade totali" value={String(trades.length)} />
          <StatCard label="Trade chiusi" value={String(summary.closedTrades)} />
          <StatCard
            label="Win rate"
            value={`${summary.winRate.toFixed(1)}%`}
            color={summary.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}
          />
          <StatCard
            label="P&L netto"
            value={`${summary.totalPnl >= 0 ? '+' : ''}$${summary.totalPnl.toFixed(2)}`}
            color={summary.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
          />
          <StatCard
            label="W / L"
            value={`${summary.wins} / ${summary.losses}`}
            color="text-gray-300"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        {[
          { key: 'all', label: 'Tutti' },
          { key: 'open', label: 'Aperture' },
          { key: 'full_close', label: 'Chiusure' },
          { key: 'partial_close', label: 'Parziali' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              filter === f.key
                ? 'bg-violet-500/20 border-violet-500 text-violet-300'
                : 'bg-gray-900/50 border-gray-800 text-gray-400 hover:border-gray-600'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Trades list */}
      {trades.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <p className="text-sm text-gray-500 text-center">
              Nessun trade registrato. I primi trade arriveranno con i cron tick automatici.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {trades.map((trade) => (
            <TradeCard key={trade.id} trade={trade} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TradeCard
// ---------------------------------------------------------------------------

function TradeCard({ trade }: { trade: Trade }) {
  const isOpen = trade.action === 'open';
  const isClose = trade.action === 'full_close' || trade.action === 'partial_close';
  const pnlColor = trade.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-semibold uppercase ${ACTION_COLORS[trade.action] ?? 'text-gray-400'}`}>
                {ACTION_LABELS[trade.action] ?? trade.action}
              </span>
              <span className="text-xs text-gray-600">|</span>
              <span className="text-xs font-mono text-gray-400">{trade.strategyCode}</span>
              <Badge variant={RISK_BADGES[trade.riskLevel] ?? 'default'}>
                {trade.tier}
              </Badge>
            </div>

            <p className="text-sm text-gray-200 truncate">{trade.marketName}</p>

            <div className="flex gap-4 mt-2 text-xs text-gray-500">
              <span>Prezzo: {trade.price.toFixed(4)}</span>
              <span>Qty: {trade.quantity.toFixed(2)}</span>
              <span>Stake: ${trade.stake.toFixed(2)}</span>
              {trade.confidence > 0 && (
                <span>Confidence: {trade.confidence}%</span>
              )}
            </div>

            {trade.reason && (
              <p className="text-xs text-gray-500 mt-2 italic">
                {trade.reason}
              </p>
            )}
          </div>

          {/* Right: P&L and time */}
          <div className="text-right shrink-0">
            {isClose ? (
              <>
                <p className={`text-lg font-bold font-mono ${pnlColor}`}>
                  {trade.netPnl >= 0 ? '+' : ''}${trade.netPnl.toFixed(2)}
                </p>
                <p className={`text-xs font-mono ${pnlColor}`}>
                  {trade.returnPct >= 0 ? '+' : ''}{trade.returnPct.toFixed(1)}%
                </p>
              </>
            ) : (
              <p className="text-sm font-mono text-blue-400">
                ${trade.stake.toFixed(2)}
              </p>
            )}
            <p className="text-xs text-gray-600 mt-1">
              {new Date(trade.executedAt).toLocaleString('it-IT', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold font-mono mt-1 ${color ?? 'text-gray-100'}`}>{value}</p>
    </div>
  );
}
