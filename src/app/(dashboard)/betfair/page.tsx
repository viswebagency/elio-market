/**
 * Betfair dashboard — exchange betting overview.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GamblingWarning } from '@/components/compliance/gambling-warning';

export default function BetfairPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">
          <span className="inline-block w-3 h-3 rounded-full bg-amber-500 mr-2" />
          Scommesse Exchange
        </h1>
        <p className="text-sm text-gray-400 mt-1">Betfair Exchange — trading sportivo</p>
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
            <p className="text-xs text-gray-500 uppercase">Scommesse aperte</p>
            <p className="text-xl font-bold text-gray-100 mt-1">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase">P&L totale</p>
            <p className="text-xl font-bold text-gray-100 mt-1">GBP 0.00</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Eventi in corso</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 text-center py-8">
            Collega il tuo account Betfair per visualizzare gli eventi.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
