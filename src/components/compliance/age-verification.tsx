/**
 * Age verification gate — required before accessing prediction markets / betting.
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface AgeVerificationProps {
  onVerified: () => void;
  onRejected: () => void;
}

export function AgeVerification({ onVerified, onRejected }: AgeVerificationProps) {
  const [step, setStep] = useState<'ask' | 'confirm'>('ask');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="max-w-sm mx-4 rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4 text-center">
        {step === 'ask' ? (
          <>
            <h2 className="text-xl font-bold text-gray-100">Verifica eta&apos;</h2>
            <p className="text-sm text-gray-300">
              Per accedere a questa sezione devi avere almeno <strong>18 anni</strong>.
            </p>
            <p className="text-xs text-gray-500">
              Richiesto dalla normativa italiana sul gioco d&apos;azzardo (D.L. 158/2012).
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onRejected} className="flex-1">
                Ho meno di 18 anni
              </Button>
              <Button onClick={() => setStep('confirm')} className="flex-1">
                Ho 18+ anni
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold text-gray-100">Conferma</h2>
            <p className="text-sm text-gray-300">
              Confermo di avere almeno 18 anni e di essere consapevole dei rischi
              legati ai mercati predittivi e alle scommesse exchange.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep('ask')} className="flex-1">
                Indietro
              </Button>
              <Button onClick={onVerified} className="flex-1">
                Confermo
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
