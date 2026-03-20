'use client';

/**
 * Portfolio Dashboard — Paper trading overview, strategy status,
 * positions, operations history, and scanner opportunities.
 */

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StrategyStatus } from '@/components/portfolio/StrategyStatus';
import { PositionList } from '@/components/portfolio/PositionList';
import { OpportunityCard } from '@/components/portfolio/OpportunityCard';

// ============================================================================
// Types (matching API responses)
// ============================================================================

interface PaperPosition {
  id: string;
  marketId: string;
  marketName: string;
  tier: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  remainingQuantity: number;
  stake: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  entryReason: string;
  signalConfidence: number;
  openedAt: string;
}

interface PaperTrade {
  id: string;
  marketName: string;
  action: string;
  price: number;
  quantity: number;
  netPnl: number;
  returnPct: number;
  reason: string;
  executedAt: string;
}

interface SessionMetrics {
  initialCapital: number;
  currentCapital: number;
  peakCapital: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  totalPnlPct: number;
  maxDrawdownPct: number;
  totalTicks: number;
  lastTickAt: string | null;
}

interface PaperSession {
  id: string;
  strategyId: string;
  strategyName: string;
  strategyCode: string;
  status: 'running' | 'paused' | 'stopped';
  pauseReason: string | null;
  metrics: SessionMetrics;
  isCircuitBroken: boolean;
  circuitBrokenReason: string | null;
  openPositions: PaperPosition[];
  recentTrades: PaperTrade[];
}

interface Overview {
  totalCapital: number;
  totalPnl: number;
  totalPnlToday: number;
  activeSessions: number;
  pausedSessions: number;
  totalOpenPositions: number;
  sessions: PaperSession[];
}

interface Opportunity {
  marketId: string;
  marketName: string;
  marketCategory: string;
  strategyId: string;
  strategyName: string;
  strategyCode: string;
  score: number;
  motivation: string;
  suggestedStake: number;
  currentPrice: number;
  volume24h: number;
  scannedAt: string;
}

// ============================================================================
// Component
// ============================================================================

export default function PortfolioPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [tickLoading, setTickLoading] = useState(false);
  const [stoppingSession, setStoppingSession] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // Data fetching
  // --------------------------------------------------------------------------

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/paper-trading/status');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setOverview({
        totalCapital: data.totalCapital,
        totalPnl: data.totalPnl,
        totalPnlToday: data.totalPnlToday,
        activeSessions: data.activeSessions,
        pausedSessions: data.pausedSessions,
        totalOpenPositions: data.totalOpenPositions,
        sessions: data.sessions,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore caricamento stato');
    }
  }, []);

  const fetchOpportunities = useCallback(async () => {
    try {
      const res = await fetch('/api/paper-trading/scan?cached=true');
      const data = await res.json();
      if (data.ok) {
        setOpportunities(data.opportunities ?? []);
      }
    } catch {
      // Silently fail for cached scan
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchStatus(), fetchOpportunities()]);
      setLoading(false);
    };
    load();
  }, [fetchStatus, fetchOpportunities]);

  // --------------------------------------------------------------------------
  // Actions
  // --------------------------------------------------------------------------

  const handleStop = async (sessionId: string) => {
    setStoppingSession(sessionId);
    try {
      const res = await fetch('/api/paper-trading/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore stop');
    } finally {
      setStoppingSession(null);
    }
  };

  const handleTick = async () => {
    setTickLoading(true);
    try {
      const res = await fetch('/api/paper-trading/tick', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore tick');
    } finally {
      setTickLoading(false);
    }
  };

  const handleScan = async () => {
    setScanLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/paper-trading/scan');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setOpportunities(data.opportunities ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore scan');
    } finally {
      setScanLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Caricamento portfolio...</span>
        </div>
      </div>
    );
  }

  const sessions = overview?.sessions ?? [];
  const pnlColor = (overview?.totalPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Portfolio</h1>
          <p className="text-sm text-gray-400 mt-1">
            Paper trading live — Polymarket
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTick}
            loading={tickLoading}
          >
            Tick manuale
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleScan}
            loading={scanLoading}
          >
            Scan mercati
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300 text-xs ml-4"
          >
            Chiudi
          </button>
        </div>
      )}

      {/* Overview Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Capitale totale</p>
            <p className="text-xl font-bold font-mono text-gray-100 mt-1">
              ${(overview?.totalCapital ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">P&L Totale</p>
            <p className={`text-xl font-bold font-mono mt-1 ${pnlColor}`}>
              {(overview?.totalPnl ?? 0) >= 0 ? '+' : ''}
              ${(overview?.totalPnl ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Strategie attive</p>
            <p className="text-xl font-bold font-mono text-gray-100 mt-1">
              {overview?.activeSessions ?? 0}
              {(overview?.pausedSessions ?? 0) > 0 && (
                <span className="text-sm text-amber-400 ml-1">
                  +{overview?.pausedSessions} in pausa
                </span>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Posizioni aperte</p>
            <p className="text-xl font-bold font-mono text-gray-100 mt-1">
              {overview?.totalOpenPositions ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Strategy Sessions */}
      {sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 text-sm">
              Nessuna strategia in paper trading.
            </p>
            <p className="text-gray-600 text-xs mt-2">
              Avvia una strategia dalla pagina strategie per iniziare il paper trading.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-200">
            Strategie in esecuzione
          </h2>
          {sessions.map((session) => (
            <div key={session.id}>
              <div
                className="cursor-pointer"
                onClick={() =>
                  setExpandedSession(
                    expandedSession === session.id ? null : session.id,
                  )
                }
              >
                <StrategyStatus
                  sessionId={session.id}
                  strategyName={session.strategyName}
                  strategyCode={session.strategyCode}
                  status={session.status}
                  initialCapital={session.metrics.initialCapital}
                  currentCapital={session.metrics.currentCapital}
                  totalPnl={session.metrics.totalPnl}
                  totalPnlPct={session.metrics.totalPnlPct}
                  unrealizedPnl={session.metrics.unrealizedPnl}
                  realizedPnl={session.metrics.realizedPnl}
                  maxDrawdownPct={session.metrics.maxDrawdownPct}
                  openPositionsCount={session.openPositions.length}
                  totalTicks={session.metrics.totalTicks}
                  lastTickAt={session.metrics.lastTickAt}
                  isCircuitBroken={session.isCircuitBroken}
                  circuitBrokenReason={session.circuitBrokenReason}
                  onStop={handleStop}
                  isLoading={stoppingSession === session.id}
                />
              </div>
              {expandedSession === session.id && (
                <div className="mt-2">
                  <PositionList
                    positions={session.openPositions}
                    recentTrades={session.recentTrades}
                    strategyCode={session.strategyCode}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Scanner Opportunities */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-200">
            Opportunita
            {opportunities.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({opportunities.length} trovate)
              </span>
            )}
          </h2>
        </div>
        {opportunities.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500 text-sm">
                Nessuna opportunita trovata.
              </p>
              <p className="text-gray-600 text-xs mt-2">
                Premi &quot;Scan mercati&quot; per analizzare i mercati attivi.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {opportunities.map((opp) => (
              <OpportunityCard
                key={`${opp.marketId}-${opp.strategyId}`}
                marketName={opp.marketName}
                marketCategory={opp.marketCategory}
                strategyCode={opp.strategyCode}
                strategyName={opp.strategyName}
                score={opp.score}
                motivation={opp.motivation}
                suggestedStake={opp.suggestedStake}
                currentPrice={opp.currentPrice}
                volume24h={opp.volume24h}
                scannedAt={opp.scannedAt}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
