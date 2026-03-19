/**
 * Forex dashboard — foreign exchange overview.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ForexPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-2" />
          Forex
        </h1>
        <p className="text-sm text-gray-400 mt-1">Mercati valutari</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase">Equity</p>
            <p className="text-xl font-bold text-gray-100 mt-1">EUR 0.00</p>
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
            <p className="text-xs text-gray-500 uppercase">Margine utilizzato</p>
            <p className="text-xl font-bold text-gray-100 mt-1">0%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Coppie principali</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 text-center py-8">
            Collega un broker forex per visualizzare i prezzi in tempo reale.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
