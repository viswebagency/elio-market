/**
 * Polymarket dashboard — prediction markets overview.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GamblingWarning } from '@/components/compliance/gambling-warning';

export default function PolymarketPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">
          <span className="inline-block w-3 h-3 rounded-full bg-violet-500 mr-2" />
          Mercati Predittivi
        </h1>
        <p className="text-sm text-gray-400 mt-1">Polymarket — trading su esiti di eventi</p>
      </div>

      <GamblingWarning />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase">Mercati attivi</p>
            <p className="text-xl font-bold text-gray-100 mt-1">--</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase">Posizioni aperte</p>
            <p className="text-xl font-bold text-gray-100 mt-1">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase">P&L totale</p>
            <p className="text-xl font-bold text-gray-100 mt-1">0.00 USDC</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mercati in evidenza</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 text-center py-8">
            Collega il tuo account Polymarket per visualizzare i mercati.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
