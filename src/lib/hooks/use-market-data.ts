/**
 * Market data hook — real-time and historical market data.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { NormalizedPrice } from '@/core/types/market-data';

export function useMarketPrice(symbol: string | null) {
  const [price, setPrice] = useState<NormalizedPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;

    const fetchPrice = async () => {
      try {
        const response = await fetch(`/api/market/price?symbol=${encodeURIComponent(symbol)}`);
        if (!response.ok) throw new Error('Failed to fetch price');
        const data = await response.json();
        setPrice(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Errore');
      } finally {
        setLoading(false);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 5000); // Poll every 5s

    return () => clearInterval(interval);
  }, [symbol]);

  return { price, loading, error };
}

export function useMarketPrices(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, NormalizedPrice>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (symbols.length === 0) return;

    const fetchPrices = async () => {
      try {
        const response = await fetch('/api/market/prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols }),
        });
        if (!response.ok) throw new Error('Failed to fetch prices');
        const data = await response.json();
        setPrices(data);
      } catch {
        // Silently fail for batch updates
      } finally {
        setLoading(false);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 5000);

    return () => clearInterval(interval);
  }, [symbols.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return { prices, loading };
}
