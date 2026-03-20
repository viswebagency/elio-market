'use client';

import { useEffect, useState, useCallback } from 'react';
import MarketCard from '@/components/polymarket/MarketCard';
import MarketFilters from '@/components/polymarket/MarketFilters';
import MarketDetail from '@/components/polymarket/MarketDetail';

interface Market {
  id: string;
  question: string;
  category: string;
  outcomes: string[];
  outcomePrices: number[];
  volume: number;
  volume24hr: number;
  liquidity: number;
  endDate: string;
  image: string | null;
  active: boolean;
  closed: boolean;
}

export default function PolymarketPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);

  // Filtri
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState('volume24hr');
  const [minVolume, setMinVolume] = useState('0');

  const fetchMarkets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: '40',
        sortBy,
      });
      if (category) params.set('category', category);
      if (minVolume !== '0') params.set('minVolume', minVolume);

      const res = await fetch(`/api/polymarket/markets?${params}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Errore API');
      setMarkets(data.markets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto');
    } finally {
      setLoading(false);
    }
  }, [category, sortBy, minVolume]);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  // Blocca scroll body quando il dettaglio e' aperto
  useEffect(() => {
    if (selectedMarketId) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedMarketId]);

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-950/90 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Polymarket
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Mercati predittivi in tempo reale
              </p>
            </div>
            <MarketFilters
              category={category}
              sortBy={sortBy}
              minVolume={minVolume}
              onCategoryChange={setCategory}
              onSortByChange={setSortBy}
              onMinVolumeChange={setMinVolume}
            />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats bar */}
        {!loading && !error && markets.length > 0 && (
          <div className="flex items-center gap-4 mb-6 text-xs text-gray-500">
            <span>
              <span className="font-mono text-gray-300">{markets.length}</span> mercati
            </span>
            <span className="w-px h-3 bg-gray-800" />
            <span>
              Vol. totale:{' '}
              <span className="font-mono text-gray-300">
                ${(markets.reduce((s, m) => s + m.volume24hr, 0) / 1_000_000).toFixed(1)}M
              </span>
            </span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="flex items-center gap-3 text-gray-400">
              <div className="w-5 h-5 border-2 border-prediction-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Caricamento mercati...</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={fetchMarkets}
              className="px-4 py-2 text-sm bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Riprova
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && markets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-gray-500">
            <p className="text-sm">Nessun mercato trovato con i filtri selezionati</p>
          </div>
        )}

        {/* Grid */}
        {!loading && !error && markets.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {markets.map((m) => (
              <MarketCard
                key={m.id}
                id={m.id}
                question={m.question}
                category={m.category}
                outcomes={m.outcomes}
                outcomePrices={m.outcomePrices}
                volume={m.volume}
                volume24hr={m.volume24hr}
                liquidity={m.liquidity}
                endDate={m.endDate}
                image={m.image}
                onClick={setSelectedMarketId}
              />
            ))}
          </div>
        )}
      </main>

      {/* Detail Modal */}
      {selectedMarketId && (
        <MarketDetail
          marketId={selectedMarketId}
          onClose={() => setSelectedMarketId(null)}
        />
      )}
    </div>
  );
}
