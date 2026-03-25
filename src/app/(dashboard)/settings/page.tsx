/**
 * Settings page — connessioni exchange/broker, preferenze, limiti operativi.
 * Legge le env vars configurate (non mostra valori sensibili).
 */

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConnectionStatus {
  name: string;
  envKey: string;
  connected: boolean;
  area: string;
  color: string;
}

interface OperationalLimits {
  maxDrawdownPct: number;
  maxAllocationPct: number;
  dailyBudgetEur: number;
  circuitBreakerLosses: number;
}

interface SettingsData {
  connections: ConnectionStatus[];
  limits: OperationalLimits;
  cronActive: boolean;
  aiModel: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/settings/status');
        const json = await res.json();
        if (json.ok) setData(json.data);
      } catch {
        // Fallback to defaults
        setData(getDefaults());
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-500">Caricamento impostazioni...</div>
      </div>
    );
  }

  const settings = data ?? getDefaults();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Impostazioni</h1>
        <p className="text-sm text-gray-400 mt-1">
          Connessioni, limiti operativi e preferenze
        </p>
      </div>

      {/* Connessioni */}
      <Card>
        <CardHeader>
          <CardTitle>Connessioni Exchange e Broker</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {settings.connections.map((conn) => (
              <div
                key={conn.envKey}
                className="flex items-center justify-between py-2 border-b border-gray-800/50 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: conn.color }}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-200">{conn.name}</p>
                    <p className="text-xs text-gray-600 font-mono">{conn.envKey}</p>
                  </div>
                </div>
                <Badge variant={conn.connected ? 'success' : 'default'}>
                  {conn.connected ? 'Connesso' : 'Non configurato'}
                </Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-4">
            Le connessioni si configurano tramite variabili d&apos;ambiente (.env.local).
          </p>
        </CardContent>
      </Card>

      {/* Limiti operativi */}
      <Card>
        <CardHeader>
          <CardTitle>Limiti Operativi</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <LimitItem
              label="Max Drawdown"
              value={`${settings.limits.maxDrawdownPct}%`}
              description="Drawdown massimo prima del circuit breaker"
            />
            <LimitItem
              label="Max Allocazione"
              value={`${settings.limits.maxAllocationPct}%`}
              description="Percentuale massima del capitale per posizione"
            />
            <LimitItem
              label="Budget AI giornaliero"
              value={`${settings.limits.dailyBudgetEur}&euro;`}
              description="Limite spesa giornaliera per analisi AI"
            />
            <LimitItem
              label="Circuit Breaker"
              value={`${settings.limits.circuitBreakerLosses} perdite consecutive`}
              description="Numero di perdite consecutive per attivare il CB"
            />
          </div>
        </CardContent>
      </Card>

      {/* Sistema */}
      <Card>
        <CardHeader>
          <CardTitle>Sistema</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-800/50">
              <div>
                <p className="text-sm font-medium text-gray-200">Cron Jobs</p>
                <p className="text-xs text-gray-500">Tick automatici per paper trading</p>
              </div>
              <Badge variant={settings.cronActive ? 'success' : 'warning'}>
                {settings.cronActive ? 'Attivo' : 'Disattivato'}
              </Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-800/50">
              <div>
                <p className="text-sm font-medium text-gray-200">Modello AI</p>
                <p className="text-xs text-gray-500">Analisi di mercato e strategie</p>
              </div>
              <span className="text-sm text-gray-300 font-mono">{settings.aiModel}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-gray-200">Database</p>
                <p className="text-xs text-gray-500">Supabase PostgreSQL</p>
              </div>
              <Badge variant="success">Connesso</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Piano */}
      <Card>
        <CardHeader>
          <CardTitle>Abbonamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-200">Piano attuale</p>
              <p className="text-xs text-gray-500 mt-1">
                Accesso completo a tutte e 5 le aree operative
              </p>
            </div>
            <Badge variant="success">Elite</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LimitItem
// ---------------------------------------------------------------------------

function LimitItem({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-gray-800 p-3">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p
        className="text-lg font-bold font-mono text-gray-100 mt-1"
        dangerouslySetInnerHTML={{ __html: value }}
      />
      <p className="text-xs text-gray-600 mt-1">{description}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Defaults (fallback when API not available)
// ---------------------------------------------------------------------------

function getDefaults(): SettingsData {
  return {
    connections: [
      { name: 'Polymarket', envKey: 'POLYMARKET_API_KEY', connected: false, area: 'polymarket', color: '#8B5CF6' },
      { name: 'Binance', envKey: 'BINANCE_API_KEY', connected: false, area: 'crypto', color: '#F97316' },
      { name: 'Alpaca', envKey: 'ALPACA_API_KEY', connected: false, area: 'stocks', color: '#10B981' },
      { name: 'Betfair', envKey: 'BETFAIR_APP_KEY', connected: false, area: 'betfair', color: '#F59E0B' },
      { name: 'MetaTrader 5', envKey: 'MT5_SERVER', connected: false, area: 'forex', color: '#3B82F6' },
    ],
    limits: {
      maxDrawdownPct: 15,
      maxAllocationPct: 10,
      dailyBudgetEur: 1,
      circuitBreakerLosses: 3,
    },
    cronActive: true,
    aiModel: 'Claude Sonnet 4.6',
  };
}
