/**
 * Strategy hook — manages strategy CRUD operations.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/db/supabase/client';
import type { StrategyDefinition } from '@/core/types/strategy';

export function useStrategies() {
  const [strategies, setStrategies] = useState<StrategyDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStrategies = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('strategies')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setStrategies(data as unknown as StrategyDefinition[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nel caricamento strategie');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  return { strategies, loading, error, refetch: fetchStrategies };
}

export function useStrategy(strategyId: string) {
  const [strategy, setStrategy] = useState<StrategyDefinition | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!strategyId) return;

    const supabase = createClient();
    supabase
      .from('strategies')
      .select('*')
      .eq('id', strategyId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setStrategy(data as unknown as StrategyDefinition);
        }
        setLoading(false);
      });
  }, [strategyId]);

  return { strategy, loading };
}
