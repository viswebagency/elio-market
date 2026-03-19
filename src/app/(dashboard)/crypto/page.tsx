/**
 * Crypto dashboard — cryptocurrency markets overview.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function CryptoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">
          <span className="inline-block w-3 h-3 rounded-full bg-orange-500 mr-2" />
          Crypto
        </h1>
        <p className="text-sm text-gray-400 mt-1">Mercati delle criptovalute</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase">Portfolio crypto</p>
            <p className="text-xl font-bold text-gray-100 mt-1">0.00 USDT</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase">Posizioni</p>
            <p className="text-xl font-bold text-gray-100 mt-1">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase">P&L 24h</p>
            <p className="text-xl font-bold text-gray-100 mt-1">0.00 USDT</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Top crypto</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 text-center py-8">
            Collega un exchange crypto per visualizzare i mercati.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
