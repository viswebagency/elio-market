/**
 * Gambling warning — required for prediction markets and exchange betting.
 * Includes Italian gambling helpline number (800-558822).
 */

export function GamblingWarning() {
  return (
    <div className="rounded-lg border border-amber-800/50 bg-amber-900/20 p-4 text-sm">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 text-amber-400 font-bold text-lg">!</div>
        <div className="space-y-2">
          <p className="font-medium text-amber-300">
            Avviso sul gioco d&apos;azzardo
          </p>
          <p className="text-gray-300">
            I mercati predittivi e le scommesse exchange possono creare dipendenza.
            Gioca responsabilmente e non investire piu&apos; di quanto puoi permetterti di perdere.
          </p>
          <p className="text-gray-300">
            Se pensi di avere un problema con il gioco d&apos;azzardo, chiama il
            <strong className="text-amber-300"> Telefono Verde: 800-558822</strong> (gratuito, attivo lun-ven 10-16).
          </p>
          <p className="text-xs text-gray-500">
            Servizio a cura dell&apos;Istituto Superiore di Sanita&apos; — OSSFAD (Osservatorio Fumo, Alcol e Droga).
            Vietato ai minori di 18 anni.
          </p>
        </div>
      </div>
    </div>
  );
}
