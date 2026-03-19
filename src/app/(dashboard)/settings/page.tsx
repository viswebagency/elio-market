/**
 * Settings page — user profile, connections, preferences.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-100">Impostazioni</h1>

      <Card>
        <CardHeader><CardTitle>Profilo</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400">Gestisci il tuo profilo e le preferenze.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Connessioni</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400">Collega broker, exchange e piattaforme.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Notifiche</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400">Configura Telegram, email e push.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Abbonamento</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400">Piano attuale: <strong>Free</strong></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sicurezza</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400">Password, 2FA, sessioni attive.</p>
        </CardContent>
      </Card>
    </div>
  );
}
