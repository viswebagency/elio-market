'use client';

import { useEffect, useState, useCallback } from 'react';

// ---- KB Analysis Types ----
interface KBAnalysisData {
  id: string;
  content: string;
  confidence: number;
  dataPointsUsed: { label: string; value: string; source: string }[];
  structuredData: {
    sentiment?: string;
    keyFactors?: string[];
    risks?: string[];
    opportunities?: string[];
  };
  cacheLevel: 'fresh' | 'l1_exact' | 'l2_delta' | 'l3_template';
  version: number;
  createdAt: string;
  expiresAt: string;
}

interface OrderBookLevel {
  price: string;
  size: string;
}

interface MarketData {
  id: string;
  question: string;
  description: string;
  category: string;
  outcomes: string[];
  outcomePrices: number[];
  volume: number;
  volume24hr: number;
  liquidity: number;
  endDate: string;
  startDate: string | null;
  image: string | null;
  active: boolean;
  closed: boolean;
  orderBook: {
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
    midpoint: number | null;
    spread: number | null;
    timestamp: string;
  } | null;
}

interface PricePoint {
  timestamp: string;
  price: number;
  side: string;
  size: number;
}

interface MarketDetailProps {
  marketId: string;
  onClose: () => void;
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---- SVG Price Chart ----
function PriceChart({ data }: { data: PricePoint[] }) {
  if (data.length < 2) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
        Dati insufficienti per il grafico
      </div>
    );
  }

  // Ordina per timestamp crescente
  const sorted = [...data].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const prices = sorted.map((p) => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 0.01;

  const W = 600;
  const H = 180;
  const padX = 0;
  const padY = 10;
  const chartW = W - padX * 2;
  const chartH = H - padY * 2;

  const points = sorted.map((p, i) => {
    const x = padX + (i / (sorted.length - 1)) * chartW;
    const y = padY + chartH - ((p.price - minP) / range) * chartH;
    return { x, y };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  // Gradient area
  const areaD = `${pathD} L${points[points.length - 1].x},${H} L${points[0].x},${H} Z`;

  const lastPrice = prices[prices.length - 1];
  const firstPrice = prices[0];
  const isUp = lastPrice >= firstPrice;
  const strokeColor = isUp ? '#22c55e' : '#ef4444';
  const gradientId = isUp ? 'grad-green' : 'grad-red';

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-48" preserveAspectRatio="none">
        <defs>
          <linearGradient id="grad-green" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="grad-red" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((frac) => {
          const y = padY + chartH * (1 - frac);
          return (
            <line
              key={frac}
              x1={padX}
              y1={y}
              x2={W - padX}
              y2={y}
              stroke="#374151"
              strokeWidth="0.5"
              strokeDasharray="4 4"
            />
          );
        })}
        {/* Area fill */}
        <path d={areaD} fill={`url(#${gradientId})`} />
        {/* Line */}
        <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinejoin="round" />
        {/* Last point */}
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r="3"
          fill={strokeColor}
        />
      </svg>
      <div className="flex justify-between text-xs text-gray-500 mt-1 font-mono px-1">
        <span>{new Date(sorted[0].timestamp).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</span>
        <span>{new Date(sorted[sorted.length - 1].timestamp).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</span>
      </div>
    </div>
  );
}

// ---- OrderBook Component ----
function OrderBook({
  bids,
  asks,
}: {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}) {
  const topBids = bids.slice(-8).reverse();
  const topAsks = asks.slice(0, 8);

  const allSizes = [...topBids, ...topAsks].map((l) => parseFloat(l.size));
  const maxSize = Math.max(...allSizes, 1);

  return (
    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
      {/* Bids */}
      <div>
        <div className="flex justify-between text-gray-500 mb-1 px-1">
          <span>Prezzo</span>
          <span>Size</span>
        </div>
        {topBids.length === 0 && (
          <div className="text-gray-600 text-center py-2">Nessun bid</div>
        )}
        {topBids.map((b, i) => {
          const pct = (parseFloat(b.size) / maxSize) * 100;
          return (
            <div
              key={`bid-${i}`}
              className="relative flex justify-between px-1 py-0.5"
            >
              <div
                className="absolute inset-0 bg-green-500/10 rounded"
                style={{ width: `${pct}%` }}
              />
              <span className="relative text-green-400">
                {parseFloat(b.price).toFixed(3)}
              </span>
              <span className="relative text-gray-400">
                {parseFloat(b.size).toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Asks */}
      <div>
        <div className="flex justify-between text-gray-500 mb-1 px-1">
          <span>Prezzo</span>
          <span>Size</span>
        </div>
        {topAsks.length === 0 && (
          <div className="text-gray-600 text-center py-2">Nessun ask</div>
        )}
        {topAsks.map((a, i) => {
          const pct = (parseFloat(a.size) / maxSize) * 100;
          return (
            <div
              key={`ask-${i}`}
              className="relative flex justify-between px-1 py-0.5"
            >
              <div
                className="absolute inset-0 bg-red-500/10 rounded right-0"
                style={{ width: `${pct}%`, marginLeft: 'auto' }}
              />
              <span className="relative text-red-400">
                {parseFloat(a.price).toFixed(3)}
              </span>
              <span className="relative text-gray-400">
                {parseFloat(a.size).toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Main Component ----
export default function MarketDetail({ marketId, onClose }: MarketDetailProps) {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<KBAnalysisData | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisType, setAnalysisType] = useState<string>('market_overview');

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/polymarket/market/${marketId}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Errore API');
      setMarket(data.market);
      setPriceHistory(data.priceHistory ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto');
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  const fetchAnalysis = useCallback(async (type: string) => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const res = await fetch(`/api/kb/analysis?marketId=${marketId}&type=${type}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Errore analisi AI');
      setAnalysis(data.analysis);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Errore sconosciuto');
    } finally {
      setAnalysisLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  useEffect(() => {
    if (!loading && market) {
      fetchAnalysis(analysisType);
    }
  }, [loading, market, analysisType, fetchAnalysis]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-2xl w-full mx-4">
          <div className="flex items-center justify-center gap-3 text-gray-400">
            <div className="w-5 h-5 border-2 border-prediction-500 border-t-transparent rounded-full animate-spin" />
            Caricamento...
          </div>
        </div>
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-2xl w-full mx-4">
          <p className="text-red-400 text-center mb-4">{error ?? 'Mercato non trovato'}</p>
          <button
            onClick={onClose}
            className="block mx-auto px-4 py-2 text-sm bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    );
  }

  const yesPrice = market.outcomePrices[0] ?? 0;
  const noPrice = market.outcomePrices[1] ?? 1 - yesPrice;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-8">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-3xl w-full mx-4 my-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-800">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-prediction-700/30 text-prediction-400 uppercase tracking-wider">
                {market.category}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${market.active ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                {market.active ? 'Attivo' : 'Chiuso'}
              </span>
            </div>
            <h2 className="text-lg font-bold text-white leading-snug">
              {market.question}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1"
            aria-label="Chiudi"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Prices */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-900/20 border border-green-800/30 rounded-xl p-4 text-center">
              <p className="text-xs text-green-400/70 uppercase tracking-wider mb-1">
                {market.outcomes[0] ?? 'Yes'}
              </p>
              <p className="text-2xl font-mono font-bold text-green-400">
                {(yesPrice * 100).toFixed(1)}%
              </p>
              <p className="text-xs font-mono text-green-400/50 mt-1">
                ${yesPrice.toFixed(3)}
              </p>
            </div>
            <div className="bg-red-900/20 border border-red-800/30 rounded-xl p-4 text-center">
              <p className="text-xs text-red-400/70 uppercase tracking-wider mb-1">
                {market.outcomes[1] ?? 'No'}
              </p>
              <p className="text-2xl font-mono font-bold text-red-400">
                {(noPrice * 100).toFixed(1)}%
              </p>
              <p className="text-xs font-mono text-red-400/50 mt-1">
                ${noPrice.toFixed(3)}
              </p>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricBox label="Volume totale" value={formatVolume(market.volume)} />
            <MetricBox label="Volume 24h" value={formatVolume(market.volume24hr)} />
            <MetricBox
              label="Spread"
              value={
                market.orderBook?.spread !== null && market.orderBook?.spread !== undefined
                  ? `${(market.orderBook.spread * 100).toFixed(2)}%`
                  : 'N/A'
              }
            />
            <MetricBox
              label="Midpoint"
              value={
                market.orderBook?.midpoint !== null && market.orderBook?.midpoint !== undefined
                  ? `$${market.orderBook.midpoint.toFixed(3)}`
                  : 'N/A'
              }
            />
          </div>

          {/* Scadenza + Liquidita */}
          <div className="grid grid-cols-2 gap-3">
            <MetricBox label="Scadenza" value={formatDate(market.endDate)} />
            <MetricBox label="Liquidita" value={formatVolume(market.liquidity)} />
          </div>

          {/* Price Chart */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">
              Storico prezzi
            </h3>
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-800">
              <PriceChart data={priceHistory} />
            </div>
          </div>

          {/* Order Book */}
          {market.orderBook && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">
                Order Book
              </h3>
              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-800">
                <OrderBook
                  bids={market.orderBook.bids}
                  asks={market.orderBook.asks}
                />
              </div>
            </div>
          )}

          {/* Descrizione */}
          {market.description && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wider">
                Descrizione
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed line-clamp-4">
                {market.description}
              </p>
            </div>
          )}

          {/* Analisi AI */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                Analisi AI
              </h3>
              {analysis && (
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    analysis.cacheLevel === 'fresh'
                      ? 'bg-green-900/30 text-green-400 border border-green-700/30'
                      : 'bg-prediction-900/30 text-prediction-400 border border-prediction-700/30'
                  }`}
                >
                  {analysis.cacheLevel === 'fresh' ? 'fresh' : 'cached'}
                </span>
              )}
            </div>

            {/* Analysis type selector */}
            <div className="flex gap-1.5 mb-3 overflow-x-auto">
              {[
                { key: 'market_overview', label: 'Panoramica' },
                { key: 'entry_analysis', label: 'Ingresso' },
                { key: 'exit_analysis', label: 'Uscita' },
                { key: 'risk_assessment', label: 'Rischio' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setAnalysisType(tab.key)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    analysisType === tab.key
                      ? 'bg-prediction-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="bg-prediction-900/20 border border-prediction-700/30 rounded-xl p-4">
              {analysisLoading ? (
                <div className="flex items-center gap-3 text-gray-400">
                  <div className="w-5 h-5 border-2 border-prediction-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Generazione analisi...</span>
                </div>
              ) : analysisError ? (
                <div className="text-sm text-red-400">{analysisError}</div>
              ) : analysis ? (
                <div className="space-y-3">
                  {/* Confidence bar */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Confidence</span>
                    <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${
                          analysis.confidence >= 70
                            ? 'bg-green-500'
                            : analysis.confidence >= 50
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                        }`}
                        style={{ width: `${analysis.confidence}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-gray-400">{analysis.confidence}%</span>
                  </div>

                  {/* Analysis content */}
                  <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                    {analysis.content
                      .replace(/\*\*(.*?)\*\*/g, '$1')
                      .replace(/\|.*\|/g, '')
                      .replace(/\|-+\|/g, '')}
                  </div>

                  {/* Data points */}
                  {analysis.dataPointsUsed.length > 0 && (
                    <div className="pt-2 border-t border-prediction-700/20">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
                        Dati utilizzati
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.dataPointsUsed.map((dp, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-800/80 text-gray-400 border border-gray-700/50"
                          >
                            {dp.label}: {dp.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Timestamp */}
                  <p className="text-[10px] text-gray-600 font-mono">
                    v{analysis.version} — aggiornata {formatDate(analysis.createdAt)}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-prediction-700/30 flex items-center justify-center shrink-0">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 1v14M1 8h14" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-prediction-300 font-medium">Analisi non disponibile</p>
                    <p className="text-xs text-prediction-400/60 mt-0.5">
                      Riprova tra qualche momento
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Azioni */}
          <div className="flex gap-3 pt-2">
            <button className="flex-1 px-4 py-2.5 bg-prediction-600 hover:bg-prediction-500 text-white text-sm font-medium rounded-lg transition-colors">
              Aggiungi a strategia
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
            >
              Chiudi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-800">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm font-mono font-semibold text-gray-200">{value}</p>
    </div>
  );
}
