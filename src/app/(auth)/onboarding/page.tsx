/**
 * Onboarding wizard — 4 steps per configurare il profilo utente.
 * Salva i dati su Supabase nel profilo dell'utente autenticato.
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/db/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MARKET_AREAS_LIST } from '@/core/constants/market-areas';
import type { MarketArea } from '@/core/types/common';

type RiskProfile = 'conservative' | 'moderate' | 'aggressive';

interface OnboardingData {
  displayName: string;
  country: string;
  interests: MarketArea[];
  riskProfile: RiskProfile;
  initialCapital: string;
  ageVerified: boolean;
  disclaimerAccepted: boolean;
  gamblingWarningAccepted: boolean;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const totalSteps = 4;

  const [data, setData] = useState<OnboardingData>({
    displayName: '',
    country: 'IT',
    interests: [],
    riskProfile: 'moderate',
    initialCapital: '1000',
    ageVerified: false,
    disclaimerAccepted: false,
    gamblingWarningAccepted: false,
  });

  // Verifica che l'utente sia autenticato
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login');
      } else {
        setCheckingAuth(false);
      }
    });
  }, [router]);

  const updateData = <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const toggleInterest = (areaId: MarketArea) => {
    setData((prev) => ({
      ...prev,
      interests: prev.interests.includes(areaId)
        ? prev.interests.filter((id) => id !== areaId)
        : [...prev.interests, areaId],
    }));
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 1:
        return data.displayName.trim().length >= 2;
      case 2:
        return data.interests.length > 0;
      case 3:
        return parseFloat(data.initialCapital) > 0;
      case 4:
        return data.ageVerified && data.disclaimerAccepted && data.gamblingWarningAccepted;
      default:
        return false;
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    setError('');

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: upsertError } = await (supabase
        .from('profiles') as any)
        .upsert({
          id: user.id,
          email: user.email || '',
          display_name: data.displayName.trim(),
          country: data.country,
          risk_profile: data.riskProfile,
          age_verified: data.ageVerified,
          onboarding_completed: true,
          tier: 'free',
          currency: 'EUR',
          locale: 'it',
        });

      if (upsertError) {
        setError(`Errore nel salvataggio: ${upsertError.message}`);
        setSaving(false);
        return;
      }

      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante il salvataggio');
      setSaving(false);
    }
  };

  const next = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const prev = () => {
    if (step > 1) setStep(step - 1);
  };

  if (checkingAuth) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-center">
        <p className="text-sm text-gray-400">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
      {/* Progress */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < step ? 'bg-violet-500' : 'bg-gray-700'
            }`}
          />
        ))}
      </div>

      <p className="text-xs text-gray-500 mb-2">Passo {step} di {totalSteps}</p>

      <h2 className="text-xl font-semibold text-gray-100 mb-4">
        {step === 1 && 'Informazioni base'}
        {step === 2 && 'Aree di interesse'}
        {step === 3 && 'Profilo di rischio'}
        {step === 4 && 'Termini legali'}
      </h2>

      {/* Step 1: Info base */}
      {step === 1 && (
        <div className="space-y-4">
          <Input
            label="Nome visualizzato"
            placeholder="Il tuo nome"
            value={data.displayName}
            onChange={(e) => updateData('displayName', e.target.value)}
            required
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-300">Paese</label>
            <select
              value={data.country}
              onChange={(e) => updateData('country', e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="IT">Italia</option>
              <option value="US">Stati Uniti</option>
              <option value="GB">Regno Unito</option>
              <option value="DE">Germania</option>
              <option value="FR">Francia</option>
              <option value="ES">Spagna</option>
            </select>
          </div>
        </div>
      )}

      {/* Step 2: Aree di interesse */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Seleziona le aree di mercato che ti interessano (minimo 1):
          </p>
          <div className="grid grid-cols-1 gap-2">
            {MARKET_AREAS_LIST.map((area) => {
              const selected = data.interests.includes(area.id);
              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => toggleInterest(area.id)}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    selected
                      ? 'border-violet-600 bg-violet-900/20'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                      selected
                        ? 'border-violet-500 bg-violet-600'
                        : 'border-gray-600'
                    }`}
                  >
                    {selected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: area.color }}
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-200">{area.nameIt}</span>
                    <p className="text-xs text-gray-500">{area.descriptionIt}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: Profilo di rischio */}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Qual e il tuo profilo di rischio?</p>
          {(
            [
              {
                value: 'conservative' as const,
                label: 'Conservativo',
                desc: 'Preservazione del capitale, rendimenti moderati',
              },
              {
                value: 'moderate' as const,
                label: 'Moderato',
                desc: 'Equilibrio tra rischio e rendimento',
              },
              {
                value: 'aggressive' as const,
                label: 'Aggressivo',
                desc: 'Massimo rendimento, alto rischio',
              },
            ] as const
          ).map((profile) => (
            <button
              key={profile.value}
              type="button"
              onClick={() => updateData('riskProfile', profile.value)}
              className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                data.riskProfile === profile.value
                  ? 'border-violet-600 bg-violet-900/20'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full border-2 ${
                  data.riskProfile === profile.value
                    ? 'border-violet-500 bg-violet-500'
                    : 'border-gray-600'
                }`}
              />
              <div>
                <p className="text-sm font-medium text-gray-200">{profile.label}</p>
                <p className="text-xs text-gray-500">{profile.desc}</p>
              </div>
            </button>
          ))}
          <Input
            label="Capitale iniziale (EUR)"
            type="number"
            value={data.initialCapital}
            onChange={(e) => updateData('initialCapital', e.target.value)}
            placeholder="1000"
            min="100"
            step="100"
            className="font-mono"
          />
        </div>
      )}

      {/* Step 4: Termini legali */}
      {step === 4 && (
        <div className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={data.ageVerified}
              onChange={(e) => updateData('ageVerified', e.target.checked)}
              className="mt-1 rounded border-gray-600 text-violet-600 focus:ring-violet-500"
            />
            <span className="text-sm text-gray-300">
              Confermo di avere almeno <strong>18 anni</strong>.
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={data.disclaimerAccepted}
              onChange={(e) => updateData('disclaimerAccepted', e.target.checked)}
              className="mt-1 rounded border-gray-600 text-violet-600 focus:ring-violet-500"
            />
            <span className="text-sm text-gray-300">
              Ho letto e accetto il <strong>disclaimer legale</strong>.
              Comprendo che il trading comporta rischi di perdita del capitale.
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={data.gamblingWarningAccepted}
              onChange={(e) => updateData('gamblingWarningAccepted', e.target.checked)}
              className="mt-1 rounded border-gray-600 text-violet-600 focus:ring-violet-500"
            />
            <span className="text-sm text-gray-300">
              Comprendo l&apos;avviso sul <strong>gioco d&apos;azzardo</strong>
              (mercati predittivi e exchange betting). Telefono Verde: 800-558822.
            </span>
          </label>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg bg-red-900/20 border border-red-800 p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex gap-3 mt-6">
        {step > 1 && (
          <Button variant="outline" onClick={prev} className="flex-1" disabled={saving}>
            Indietro
          </Button>
        )}
        <Button
          onClick={next}
          className="flex-1"
          disabled={!canProceed()}
          loading={saving}
        >
          {step === totalSteps ? 'Completa' : 'Avanti'}
        </Button>
      </div>
    </div>
  );
}
