/**
 * Meta dashboard — overview of all 5 areas, key metrics, recent activity.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MARKET_AREAS_LIST } from '@/core/constants/market-areas';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-1">Panoramica completa del tuo portfolio multi-area</p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Capitale totale', value: 'EUR 0.00', change: '+0.00%' },
          { label: 'P&L oggi', value: 'EUR 0.00', change: '+0.00%' },
          { label: 'Strategie attive', value: '0', change: '' },
          { label: 'Trade aperti', value: '0', change: '' },
        ].map((metric) => (
          <Card key={metric.label}>
            <CardContent className="pt-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">{metric.label}</p>
              <p className="text-xl font-bold text-gray-100 mt-1">{metric.value}</p>
              {metric.change && (
                <p className="text-xs text-emerald-400 mt-1">{metric.change}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Area overview */}
      <div>
        <h2 className="text-lg font-semibold text-gray-200 mb-3">Aree Mercato</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MARKET_AREAS_LIST.map((area) => (
            <Card key={area.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    <span className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: area.color }}
                      />
                      {area.nameIt}
                    </span>
                  </CardTitle>
                  <Badge variant="default">Non connesso</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-400">{area.descriptionIt}</p>
                <div className="mt-3 flex gap-4 text-xs text-gray-500">
                  <span>Strategie: 0</span>
                  <span>P&L: EUR 0.00</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent activity placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Attivita&apos; recente</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 text-center py-8">
            Nessuna attivita&apos; recente. Inizia collegando un&apos;area mercato.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
