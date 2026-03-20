'use client';

/**
 * PositionList — Lista posizioni aperte con P&L unrealized.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Position {
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

interface Trade {
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

interface PositionListProps {
  positions: Position[];
  recentTrades: Trade[];
  strategyCode: string;
}

function formatPrice(value: number): string {
  return `$${value.toFixed(4)}`;
}

function formatCurrency(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${value.toFixed(2)}`;
}

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

const tierLabels: Record<string, string> = {
  tier1: 'T1',
  tier2: 'T2',
  tier3: 'T3',
};

const actionLabels: Record<string, { label: string; color: string }> = {
  open: { label: 'Apertura', color: 'text-blue-400' },
  partial_close: { label: 'Chiusura parziale', color: 'text-amber-400' },
  full_close: { label: 'Chiusura', color: 'text-gray-300' },
  circuit_breaker: { label: 'Circuit Breaker', color: 'text-red-400' },
};

export function PositionList({ positions, recentTrades, strategyCode }: PositionListProps) {
  return (
    <div className="space-y-4">
      {/* Open Positions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Posizioni aperte
            <span className="ml-2 font-mono text-violet-400">{strategyCode}</span>
            <span className="ml-2 text-gray-500 font-normal">
              ({positions.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {positions.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-500">
              Nessuna posizione aperta
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-2 text-left">Mercato</th>
                    <th className="px-4 py-2 text-right">Tier</th>
                    <th className="px-4 py-2 text-right">Entry</th>
                    <th className="px-4 py-2 text-right">Corrente</th>
                    <th className="px-4 py-2 text-right">Stake</th>
                    <th className="px-4 py-2 text-right">P&L</th>
                    <th className="px-4 py-2 text-right">Conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => {
                    const pnlColor = pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400';
                    return (
                      <tr
                        key={pos.id}
                        className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="text-gray-200 text-xs leading-tight max-w-[280px] truncate">
                            {pos.marketName}
                          </p>
                          <p className="text-[10px] text-gray-500 mt-0.5 truncate max-w-[280px]">
                            {pos.entryReason}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Badge variant="default" className="text-[10px]">
                            {tierLabels[pos.tier] ?? pos.tier}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-300 text-xs">
                          {formatPrice(pos.entryPrice)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-300 text-xs">
                          {formatPrice(pos.currentPrice)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-300 text-xs">
                          ${pos.stake.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-mono text-xs font-semibold ${pnlColor}`}>
                            {formatCurrency(pos.unrealizedPnl)}
                          </span>
                          <br />
                          <span className={`font-mono text-[10px] ${pnlColor}`}>
                            {formatPct(pos.unrealizedPnlPct)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-400 text-xs">
                          {pos.signalConfidence}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Trades */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Operazioni recenti
            <span className="ml-2 text-gray-500 font-normal">
              ({recentTrades.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentTrades.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-500">
              Nessuna operazione recente
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-2 text-left">Azione</th>
                    <th className="px-4 py-2 text-left">Mercato</th>
                    <th className="px-4 py-2 text-right">Prezzo</th>
                    <th className="px-4 py-2 text-right">P&L</th>
                    <th className="px-4 py-2 text-left">Motivo</th>
                    <th className="px-4 py-2 text-right">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.slice(0, 10).map((trade) => {
                    const actionCfg = actionLabels[trade.action] ?? actionLabels.open;
                    const pnlColor =
                      trade.action === 'open'
                        ? 'text-gray-400'
                        : trade.netPnl >= 0
                          ? 'text-emerald-400'
                          : 'text-red-400';

                    return (
                      <tr
                        key={trade.id}
                        className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                      >
                        <td className={`px-4 py-3 text-xs font-medium ${actionCfg.color}`}>
                          {actionCfg.label}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-300 max-w-[200px] truncate">
                          {trade.marketName}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-300 text-xs">
                          {formatPrice(trade.price)}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono text-xs font-semibold ${pnlColor}`}>
                          {trade.action === 'open' ? '-' : formatCurrency(trade.netPnl)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">
                          {trade.reason}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-gray-500 font-mono">
                          {new Date(trade.executedAt).toLocaleTimeString('it-IT', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
