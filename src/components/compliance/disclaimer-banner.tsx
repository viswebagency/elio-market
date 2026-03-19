/**
 * Legal disclaimer banner — shown on first visit and in footer.
 */

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

export function DisclaimerBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem('elio-disclaimer-accepted');
    if (!accepted) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem('elio-disclaimer-accepted', new Date().toISOString());
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="max-w-lg mx-4 rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-100">Disclaimer Legale</h2>
        <div className="text-sm text-gray-300 space-y-3">
          <p>
            <strong>Elio.Market</strong> e&apos; una piattaforma di analisi e gestione multi-mercato.
            NON fornisce consulenza finanziaria, di investimento o di gioco d&apos;azzardo.
          </p>
          <p>
            Il trading, le scommesse exchange e i mercati predittivi comportano <strong>rischi significativi</strong>,
            inclusa la possibilita&apos; di perdere l&apos;intero capitale investito.
          </p>
          <p>
            Le performance passate non sono indicative dei risultati futuri.
            Ogni decisione operativa e&apos; di esclusiva responsabilita&apos; dell&apos;utente.
          </p>
          <p className="text-xs text-gray-500">
            Consultare sempre un consulente finanziario qualificato prima di prendere decisioni di investimento.
          </p>
        </div>
        <Button onClick={accept} className="w-full">
          Ho compreso e accetto
        </Button>
      </div>
    </div>
  );
}
