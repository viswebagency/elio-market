/**
 * Onboarding wizard — 4 steps to set up the user profile.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MARKET_AREAS_LIST } from '@/core/constants/market-areas';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const totalSteps = 4;

  const next = () => {
    if (step < totalSteps) setStep(step + 1);
    else router.push('/dashboard');
  };

  const prev = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
      {/* Progress */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i < step ? 'bg-violet-500' : 'bg-gray-700'}`}
          />
        ))}
      </div>

      <h2 className="text-xl font-semibold text-gray-100 mb-4">
        {step === 1 && 'Informazioni base'}
        {step === 2 && 'Esperienza'}
        {step === 3 && 'Profilo di rischio'}
        {step === 4 && 'Termini legali'}
      </h2>

      {step === 1 && (
        <div className="space-y-4">
          <Input label="Nome visualizzato" placeholder="Il tuo nome" />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-300">Paese</label>
            <select className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100">
              <option value="IT">Italia</option>
              <option value="US">Stati Uniti</option>
              <option value="GB">Regno Unito</option>
              <option value="DE">Germania</option>
            </select>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Seleziona le aree di tuo interesse:</p>
          <div className="grid grid-cols-1 gap-2">
            {MARKET_AREAS_LIST.map((area) => (
              <label
                key={area.id}
                className="flex items-center gap-3 rounded-lg border border-gray-700 p-3 cursor-pointer hover:border-violet-600 transition-colors"
              >
                <input type="checkbox" className="rounded border-gray-600" />
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: area.color }}
                />
                <span className="text-sm text-gray-200">{area.nameIt}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Qual e&apos; il tuo profilo di rischio?</p>
          {(['conservative', 'moderate', 'aggressive'] as const).map((profile) => (
            <label
              key={profile}
              className="flex items-center gap-3 rounded-lg border border-gray-700 p-3 cursor-pointer hover:border-violet-600"
            >
              <input type="radio" name="risk" className="text-violet-600" />
              <div>
                <p className="text-sm font-medium text-gray-200 capitalize">{profile}</p>
                <p className="text-xs text-gray-500">
                  {profile === 'conservative' && 'Preservazione del capitale, rendimenti moderati'}
                  {profile === 'moderate' && 'Equilibrio tra rischio e rendimento'}
                  {profile === 'aggressive' && 'Massimo rendimento, alto rischio'}
                </p>
              </div>
            </label>
          ))}
          <Input label="Capitale iniziale (EUR)" type="number" placeholder="1000" />
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 rounded border-gray-600" />
            <span className="text-sm text-gray-300">
              Confermo di avere almeno <strong>18 anni</strong>.
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 rounded border-gray-600" />
            <span className="text-sm text-gray-300">
              Ho letto e accetto il <strong>disclaimer legale</strong>.
              Comprendo che il trading comporta rischi di perdita del capitale.
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 rounded border-gray-600" />
            <span className="text-sm text-gray-300">
              Comprendo l&apos;avviso sul <strong>gioco d&apos;azzardo</strong>
              (mercati predittivi e exchange betting). Telefono Verde: 800-558822.
            </span>
          </label>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex gap-3 mt-6">
        {step > 1 && (
          <Button variant="outline" onClick={prev} className="flex-1">
            Indietro
          </Button>
        )}
        <Button onClick={next} className="flex-1">
          {step === totalSteps ? 'Completa' : 'Avanti'}
        </Button>
      </div>
    </div>
  );
}
