/**
 * Backtest Data Loader
 *
 * Carica dati storici da Polymarket per il backtest.
 * Se lo storico prezzi non e' disponibile, interpola linearmente
 * dal prezzo iniziale al prezzo finale (outcome).
 */

import { getPolymarketClient, ParsedMarket } from '@/lib/polymarket-client';
import { HistoricalMarketData, HistoricalTick } from './engine';
import { generateSyntheticMarkets } from './synthetic-data';

// ---------------------------------------------------------------------------
// Cache in memoria per evitare ri-fetch
// ---------------------------------------------------------------------------

interface CachedData {
  data: HistoricalMarketData[];
  fetchedAt: number;
}

const dataCache = new Map<string, CachedData>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minuti

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DataLoaderConfig {
  /** Numero massimo di mercati chiusi da caricare */
  maxMarkets: number;
  /** Numero di tick da generare per mercato quando si interpola */
  ticksPerMarket: number;
  /** Categoria da filtrare (opzionale) */
  category?: string;
  /** Volume minimo richiesto */
  minVolume?: number;
  /** Skip CLOB price history fetch — use interpolation only (much faster) */
  fastMode?: boolean;
  /** Use synthetic data instead of real Polymarket data (for L1 when real data is insufficient) */
  synthetic?: boolean;
  /** Random seed for synthetic data (for reproducibility) */
  syntheticSeed?: number;
}

const DEFAULT_LOADER_CONFIG: DataLoaderConfig = {
  maxMarkets: 100,
  ticksPerMarket: 30,
};

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loadHistoricalData(
  config?: Partial<DataLoaderConfig>,
): Promise<HistoricalMarketData[]> {
  const cfg: DataLoaderConfig = { ...DEFAULT_LOADER_CONFIG, ...config };

  const mode = cfg.synthetic ? ':synth' : cfg.fastMode ? ':fast' : '';
  const cacheKey = `${cfg.maxMarkets}:${cfg.ticksPerMarket}:${cfg.category ?? ''}:${cfg.minVolume ?? 0}${mode}`;
  const cached = dataCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  // Synthetic mode: generate realistic data for L1 backtesting
  if (cfg.synthetic) {
    const syntheticData = generateSyntheticMarkets({
      numMarkets: cfg.maxMarkets,
      ticksPerMarket: cfg.ticksPerMarket,
      seed: cfg.syntheticSeed ?? 42,
      minVolume: cfg.minVolume,
    });
    dataCache.set(cacheKey, { data: syntheticData, fetchedAt: Date.now() });
    return syntheticData;
  }

  const client = getPolymarketClient();

  // Fetch mercati chiusi
  const closedMarkets = await client.getMarkets({
    closed: true,
    active: false,
    limit: cfg.maxMarkets,
    sortBy: 'volume',
    ascending: false,
    category: cfg.category,
    minVolume: cfg.minVolume,
  });

  const historicalData: HistoricalMarketData[] = [];

  for (const market of closedMarkets) {
    const data = cfg.fastMode
      ? buildMarketTimelineFast(market, cfg.ticksPerMarket)
      : await buildMarketTimeline(client, market, cfg.ticksPerMarket);
    if (data) {
      historicalData.push(data);
    }
  }

  dataCache.set(cacheKey, {
    data: historicalData,
    fetchedAt: Date.now(),
  });

  return historicalData;
}

/**
 * Fast version: interpolation only, no CLOB API calls.
 * Good enough for L1 Quick Scan where speed matters more than precision.
 */
function buildMarketTimelineFast(
  market: ParsedMarket,
  tickCount: number,
): HistoricalMarketData | null {
  const startDate = market.startDate ?? market.endDate;
  const endDate = market.endDate;
  if (!endDate) return null;

  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return null;

  const resolvedOutcome = determineOutcome(market);
  const ticks = interpolateTicks(market, startMs, endMs, tickCount, resolvedOutcome);

  return {
    marketId: market.id,
    marketName: market.question,
    category: market.category,
    startDate,
    endDate,
    resolvedOutcome,
    ticks,
  };
}

/**
 * Costruisce la timeline dei prezzi per un mercato.
 * Tenta prima di usare i trade storici dal CLOB, altrimenti interpola.
 */
async function buildMarketTimeline(
  client: ReturnType<typeof getPolymarketClient>,
  market: ParsedMarket,
  tickCount: number,
): Promise<HistoricalMarketData | null> {
  const startDate = market.startDate ?? market.endDate;
  const endDate = market.endDate;

  if (!endDate) return null;

  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();

  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return null;

  // Determina il resolved outcome dal prezzo finale
  const resolvedOutcome = determineOutcome(market);

  // Prova a caricare storico reale dai trade
  let ticks: HistoricalTick[];

  if (market.clobTokenIds.length > 0) {
    try {
      const trades = await client.getPriceHistory(market.clobTokenIds[0], 200);
      if (trades.length >= 5) {
        ticks = tradesToTicks(trades, market, resolvedOutcome);
      } else {
        ticks = interpolateTicks(market, startMs, endMs, tickCount, resolvedOutcome);
      }
    } catch {
      ticks = interpolateTicks(market, startMs, endMs, tickCount, resolvedOutcome);
    }
  } else {
    ticks = interpolateTicks(market, startMs, endMs, tickCount, resolvedOutcome);
  }

  return {
    marketId: market.id,
    marketName: market.question,
    category: market.category,
    startDate,
    endDate,
    resolvedOutcome,
    ticks,
  };
}

/**
 * Converte trade reali in tick giornalieri aggregati.
 */
function tradesToTicks(
  trades: { timestamp: string; price: number; side: string; size: number }[],
  market: ParsedMarket,
  resolvedOutcome: number | null,
): HistoricalTick[] {
  // Ordina per timestamp
  const sorted = [...trades].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  // Raggruppa per giorno, prendi il prezzo medio ponderato
  const dayMap = new Map<string, { totalPrice: number; totalSize: number; count: number }>();

  for (const trade of sorted) {
    const dayKey = trade.timestamp.substring(0, 10);
    const existing = dayMap.get(dayKey);
    if (existing) {
      existing.totalPrice += trade.price * trade.size;
      existing.totalSize += trade.size;
      existing.count++;
    } else {
      dayMap.set(dayKey, {
        totalPrice: trade.price * trade.size,
        totalSize: trade.size,
        count: 1,
      });
    }
  }

  const ticks: HistoricalTick[] = [];
  const entries = Array.from(dayMap.entries()).sort(
    (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime(),
  );

  for (let i = 0; i < entries.length; i++) {
    const [day, data] = entries[i];
    const vwap = data.totalSize > 0 ? data.totalPrice / data.totalSize : 0;
    const isLast = i === entries.length - 1;

    ticks.push({
      timestamp: `${day}T12:00:00.000Z`,
      marketId: market.id,
      marketName: market.question,
      price: vwap,
      volume24hUsd: data.totalSize,
      totalVolumeUsd: market.volume,
      expiryDate: market.endDate,
      category: market.category,
      status: isLast ? 'settled' : 'open',
      resolvedOutcome: isLast ? resolvedOutcome : null,
    });
  }

  return ticks;
}

/**
 * Interpolazione lineare dal prezzo iniziale al prezzo finale.
 * Aggiunge rumore controllato per realismo.
 */
function interpolateTicks(
  market: ParsedMarket,
  startMs: number,
  endMs: number,
  tickCount: number,
  resolvedOutcome: number | null,
): HistoricalTick[] {
  const ticks: HistoricalTick[] = [];

  // Prezzo iniziale: dal primo outcome price disponibile, o 0.5
  const startPrice = market.outcomePrices.length > 0 ? market.outcomePrices[0] : 0.5;
  // Prezzo finale: outcome risolto o ultimo prezzo noto
  const endPrice = resolvedOutcome !== null ? resolvedOutcome : startPrice;

  const actualTickCount = Math.max(2, Math.min(tickCount, Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000))));
  const intervalMs = (endMs - startMs) / (actualTickCount - 1);

  // Genera seed deterministico dal marketId per rumore riproducibile
  let seed = hashString(market.id);

  for (let i = 0; i < actualTickCount; i++) {
    const t = i / (actualTickCount - 1); // 0..1
    const basePrice = startPrice + (endPrice - startPrice) * t;

    // Rumore: proporzionale alla distanza dagli estremi, massimo al centro
    const noiseFactor = 0.05 * Math.sin(t * Math.PI); // max 5% di noise al centro
    seed = pseudoRandom(seed);
    const noise = (seed / 2147483647 - 0.5) * 2 * noiseFactor;
    const price = Math.max(0.01, Math.min(0.99, basePrice + noise));

    const isLast = i === actualTickCount - 1;
    const tickTimestamp = new Date(startMs + intervalMs * i);

    ticks.push({
      timestamp: tickTimestamp.toISOString(),
      marketId: market.id,
      marketName: market.question,
      price: isLast ? endPrice : price,
      volume24hUsd: market.volume24hr,
      totalVolumeUsd: market.volume,
      expiryDate: market.endDate,
      category: market.category,
      status: isLast ? 'settled' : 'open',
      resolvedOutcome: isLast ? resolvedOutcome : null,
    });
  }

  return ticks;
}

function determineOutcome(market: ParsedMarket): number | null {
  if (!market.closed) return null;

  // Se il mercato e' chiuso, il prezzo finale di YES dovrebbe essere ~1 o ~0
  if (market.outcomePrices.length > 0) {
    const yesPrice = market.outcomePrices[0];
    if (yesPrice >= 0.95) return 1;
    if (yesPrice <= 0.05) return 0;
    // Prezzo ambiguo: usa come proxy
    return yesPrice;
  }

  return null;
}

/**
 * Hash deterministico per stringhe (per seed del rumore).
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) || 1;
}

/**
 * Generatore pseudo-random deterministico (LCG).
 */
function pseudoRandom(seed: number): number {
  return (seed * 1103515245 + 12345) & 0x7fffffff;
}

/**
 * Svuota la cache dei dati storici.
 */
export function clearDataCache(): void {
  dataCache.clear();
}
