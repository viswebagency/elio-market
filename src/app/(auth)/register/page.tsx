/**
 * Register page — email/password registration via Supabase Auth.
 * Dopo la registrazione, mostra un messaggio di conferma email.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/db/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Le password non corrispondono');
      return;
    }

    if (password.length < 8) {
      setError('La password deve avere almeno 8 caratteri');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/onboarding`,
      },
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        setError('Questa email e gia registrata. Prova ad accedere.');
      } else {
        setError(authError.message);
      }
      setLoading(false);
      return;
    }

    // Se Supabase conferma la sessione immediatamente (email confirm disabilitato)
    if (data.session) {
      router.push('/onboarding');
      return;
    }

    // Altrimenti mostra messaggio conferma email
    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-violet-900/50 border border-violet-700 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-100 mb-2">Controlla la tua email</h2>
        <p className="text-sm text-gray-400 mb-4">
          Abbiamo inviato un link di conferma a <strong className="text-gray-200">{email}</strong>.
          Clicca il link per completare la registrazione.
        </p>
        <p className="text-xs text-gray-500">
          Non trovi l&apos;email? Controlla la cartella spam.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block text-sm text-violet-400 hover:text-violet-300"
        >
          Torna al login
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
      <h2 className="text-xl font-semibold text-gray-100 mb-6">Crea account</h2>

      <form onSubmit={handleRegister} className="space-y-4">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@esempio.com"
          required
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Almeno 8 caratteri"
          required
        />
        <Input
          label="Conferma password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Ripeti la password"
          required
        />

        {error && (
          <div className="rounded-lg bg-red-900/20 border border-red-800 p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <Button type="submit" className="w-full" loading={loading}>
          Registrati
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-400">
        Hai gia&apos; un account?{' '}
        <Link href="/login" className="text-violet-400 hover:text-violet-300">
          Accedi
        </Link>
      </p>
    </div>
  );
}
