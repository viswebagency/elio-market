/**
 * Trading journal page.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function JournalPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Journal</h1>
          <p className="text-sm text-gray-400 mt-1">Diario di trading e note personali</p>
        </div>
        <Button>Nuova voce</Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Voci recenti</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 text-center py-8">
            Nessuna voce nel journal. Inizia a documentare i tuoi trade e le tue riflessioni.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
