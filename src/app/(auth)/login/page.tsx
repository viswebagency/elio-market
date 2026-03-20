/**
 * Login page — email/password authentication via Supabase Auth.
 */

'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/db/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 animate-pulse h-80" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      if (authError.message === 'Invalid login credentials') {
        setError('Credenziali non valide. Controlla email e password.');
      } else if (authError.message === 'Email not confirmed') {
        setError('Email non confermata. Controlla la tua casella di posta.');
      } else {
        setError(authError.message);
      }
      setLoading(false);
      return;
    }

    // Controlla se l'onboarding e' completo
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single() as { data: { onboarding_completed: boolean } | null };

      if (profile && !profile.onboarding_completed) {
        router.push('/onboarding');
        return;
      }
    }

    router.push(redirectTo);
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
      <h2 className="text-xl font-semibold text-gray-100 mb-6">Accedi</h2>


      <form onSubmit={handleLogin} className="space-y-4">
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
          placeholder="La tua password"
          required
        />

        {error && (
          <div className="rounded-lg bg-red-900/20 border border-red-800 p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <Button type="submit" className="w-full" loading={loading}>
          Accedi
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-400">
        Non hai un account?{' '}
        <Link href="/register" className="text-violet-400 hover:text-violet-300">
          Registrati
        </Link>
      </p>
    </div>
  );
}
