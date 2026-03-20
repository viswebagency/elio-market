/**
 * Market Adapter — interfaccia di normalizzazione dati di mercato.
 *
 * Ogni area di mercato implementa MarketAdapter per fornire dati
 * in un formato unificato (NormalizedMarket) al motore strategie.
 */

import { MarketArea } from '../types/common';
import { MarketSnapshot } from './evaluator';

// ---------------------------------------------------------------------------
// Normalized types
// ---------------------------------------------------------------------------

export interface NormalizedMarket {
  id: string;
  name: string;
  price: number;
  volume24hUsd: number;
  totalVolumeUsd: number;
  expiryDate: string | null;
  category: string;
  area: MarketArea;
  status: 'open' | 'closed' | 'suspended' | 'settled' | 'expired';
}

export interface NormalizedMarketDetail extends NormalizedMarket {
  description: string;
  hasCatalyst: boolean;
  catalystDescription: string | null;
  outcomes: string[];
  outcomePrices: number[];
  liquidity: number;
  createdAt: string | null;
}

export interface MarketFilters {
  limit?: number;
  offset?: number;
  category?: string;
  active?: boolean;
  sortBy?: 'volume' | 'price' | 'expiry';
  ascending?: boolean;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface MarketAdapter {
  readonly area: MarketArea;

  /** Fetch mercati normalizzati con filtri opzionali */
  fetchMarkets(filters?: MarketFilters): Promise<NormalizedMarket[]>;

  /** Fetch dettaglio singolo mercato */
  fetchMarketDetail(id: string): Promise<NormalizedMarketDetail>;

  /** Tasso commissione dell'area (es. 0.02 = 2%) */
  getCommissionRate(): number;

  /** Stake minimo per l'area in USD */
  getMinStake(): number;
}

// ---------------------------------------------------------------------------
// Helper: NormalizedMarket -> MarketSnapshot
// ---------------------------------------------------------------------------

/**
 * Converte un NormalizedMarket nel MarketSnapshot usato dall'evaluator.
 * Se servono campi aggiuntivi (catalyst), fornire il detail.
 */
export function normalizedToSnapshot(
  market: NormalizedMarket,
  detail?: Partial<NormalizedMarketDetail>,
): MarketSnapshot {
  return {
    marketId: market.id,
    name: market.name,
    price: market.price,
    volume24hUsd: market.volume24hUsd,
    totalVolumeUsd: market.totalVolumeUsd,
    expiryDate: market.expiryDate,
    hasCatalyst: detail?.hasCatalyst ?? false,
    catalystDescription: detail?.catalystDescription ?? null,
    category: market.category,
    status: market.status,
  };
}

// ---------------------------------------------------------------------------
// Polymarket adapter
// ---------------------------------------------------------------------------

export class PolymarketMarketAdapter implements MarketAdapter {
  readonly area = MarketArea.PREDICTION;

  async fetchMarkets(filters?: MarketFilters): Promise<NormalizedMarket[]> {
    const { getPolymarketClient } = await import('@/lib/polymarket-client');
    const client = getPolymarketClient();

    const markets = await client.getMarkets({
      limit: filters?.limit ?? 50,
      active: filters?.active ?? true,
      closed: false,
      sortBy: filters?.sortBy === 'volume' ? 'volume24hr' : 'volume24hr',
      ascending: filters?.ascending ?? false,
    });

    return markets.map((m): NormalizedMarket => {
      const yesPrice = m.outcomePrices[0] ?? 0.5;
      return {
        id: m.id,
        name: m.question,
        price: yesPrice,
        volume24hUsd: m.volume24hr,
        totalVolumeUsd: m.volume,
        expiryDate: m.endDate,
        category: m.category,
        area: MarketArea.PREDICTION,
        status: m.active && !m.closed ? 'open' : 'closed',
      };
    });
  }

  async fetchMarketDetail(id: string): Promise<NormalizedMarketDetail> {
    const { getPolymarketClient } = await import('@/lib/polymarket-client');
    const client = getPolymarketClient();
    const m = await client.getMarket(id);

    const yesPrice = m.outcomePrices[0] ?? 0.5;

    return {
      id: m.id,
      name: m.question,
      price: yesPrice,
      volume24hUsd: m.volume24hr,
      totalVolumeUsd: m.volume,
      expiryDate: m.endDate,
      category: m.category,
      area: MarketArea.PREDICTION,
      status: m.active && !m.closed ? 'open' : 'closed',
      description: m.description ?? '',
      hasCatalyst: false,
      catalystDescription: null,
      outcomes: m.outcomes,
      outcomePrices: m.outcomePrices,
      liquidity: m.liquidity,
      createdAt: null,
    };
  }

  getCommissionRate(): number {
    return 0;
  }

  getMinStake(): number {
    return 1;
  }
}

// ---------------------------------------------------------------------------
// Betfair adapter
// ---------------------------------------------------------------------------

export class BetfairMarketAdapter implements MarketAdapter {
  readonly area = MarketArea.EXCHANGE_BETTING;

  async fetchMarkets(filters?: MarketFilters): Promise<NormalizedMarket[]> {
    const { getBetfairClient } = await import('@/lib/betfair-client');
    const client = getBetfairClient();

    const events = await client.listEvents({});
    const allMarkets: NormalizedMarket[] = [];

    for (const event of events.slice(0, filters?.limit ?? 20)) {
      try {
        const catalogue = await client.listMarketCatalogue(event.id);
        for (const m of catalogue) {
          const bestPrice = m.runners?.[0]?.lastPriceTraded ?? 0;
          allMarkets.push({
            id: m.marketId,
            name: `${event.name} - ${m.marketName}`,
            price: bestPrice > 0 ? 1 / bestPrice : 0,
            volume24hUsd: m.totalMatched ?? 0,
            totalVolumeUsd: m.totalMatched ?? 0,
            expiryDate: m.marketStartTime ?? null,
            category: event.competitionName ?? 'Sport',
            area: MarketArea.EXCHANGE_BETTING,
            status: m.status === 'OPEN' ? 'open' : 'closed',
          });
        }
      } catch {
        // Skip events con errori
      }
    }

    return allMarkets;
  }

  async fetchMarketDetail(id: string): Promise<NormalizedMarketDetail> {
    const { getBetfairClient } = await import('@/lib/betfair-client');
    const client = getBetfairClient();

    const books = await client.listMarketBook([id]);
    const book = books[0];

    if (!book) {
      throw new Error(`Betfair market ${id} not found`);
    }

    const bestPrice = book.runners?.[0]?.lastPriceTraded ?? 0;

    return {
      id: book.marketId,
      name: book.marketName ?? id,
      price: bestPrice > 0 ? 1 / bestPrice : 0,
      volume24hUsd: book.totalMatched ?? 0,
      totalVolumeUsd: book.totalMatched ?? 0,
      expiryDate: book.marketStartTime ?? null,
      category: 'Sport',
      area: MarketArea.EXCHANGE_BETTING,
      status: book.status === 'OPEN' ? 'open' : 'closed',
      description: '',
      hasCatalyst: false,
      catalystDescription: null,
      outcomes: (book.runners ?? []).map((r: { runnerName?: string }) => r.runnerName ?? 'Unknown'),
      outcomePrices: (book.runners ?? []).map((r: { lastPriceTraded?: number }) => r.lastPriceTraded ?? 0),
      liquidity: book.totalMatched ?? 0,
      createdAt: null,
    };
  }

  getCommissionRate(): number {
    return 0.05; // 5% Betfair standard commission
  }

  getMinStake(): number {
    return 2; // 2 GBP minimum
  }
}

// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------

const adapterRegistry = new Map<MarketArea, MarketAdapter>();

export function registerMarketAdapter(adapter: MarketAdapter): void {
  adapterRegistry.set(adapter.area, adapter);
}

export function getMarketAdapter(area: MarketArea): MarketAdapter {
  const adapter = adapterRegistry.get(area);
  if (!adapter) {
    throw new Error(`Nessun adapter registrato per l'area: ${area}`);
  }
  return adapter;
}

export function getRegisteredAreas(): MarketArea[] {
  return Array.from(adapterRegistry.keys());
}

/**
 * Inizializza gli adapter predefiniti.
 * Chiamare all'avvio dell'applicazione.
 */
export function initializeDefaultAdapters(): void {
  if (!adapterRegistry.has(MarketArea.PREDICTION)) {
    registerMarketAdapter(new PolymarketMarketAdapter());
  }
  if (!adapterRegistry.has(MarketArea.EXCHANGE_BETTING)) {
    registerMarketAdapter(new BetfairMarketAdapter());
  }
}
