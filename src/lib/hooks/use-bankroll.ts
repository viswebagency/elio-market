/**
 * Bankroll hook — manages bankroll state and P&L tracking.
 */

'use client';

import { useState, useEffect } from 'react';
import type { BankrollState } from '@/core/types/money-management';

export function useBankroll() {
  const [bankroll, setBankroll] = useState<BankrollState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBankroll = async () => {
      try {
        const response = await fetch('/api/bankroll');
        if (!response.ok) throw new Error('Failed to fetch bankroll');
        const data = await response.json();
        setBankroll(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Errore');
      } finally {
        setLoading(false);
      }
    };

    fetchBankroll();
    const interval = setInterval(fetchBankroll, 30000); // Refresh every 30s

    return () => clearInterval(interval);
  }, []);

  return { bankroll, loading, error };
}
