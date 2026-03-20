/**
 * Polymarket API Client
 *
 * Gestisce chiamate reali alle API Polymarket (Gamma + CLOB)
 * con rate limiting, retry con exponential backoff e cache in memoria.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PolymarketRawMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  endDate: string;
  startDate?: string;
  category?: string;
  liquidity: string;
  description: string;
  outcomes: string; // JSON-encoded string array
  outcomePrices: string; // JSON-encoded string array
  volume: string;
  active: boolean;
  closed: boolean;
  image?: string;
  icon?: string;
  volumeNum: number;
  liquidityNum: number;
  volume24hr: number;
  volume1wk: number;
  volume1mo: number;
  volume1yr: number;
  clobTokenIds: string; // JSON-encoded string array
  enableOrderBook?: boolean;
  orderPriceMinTickSize?: number;
  orderMinSize?: number;
  resolved?: boolean;
  resolvedBy?: string;
  events?: PolymarketRawEvent[];
}

export interface PolymarketRawEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  category?: string;
  markets?: PolymarketRawMarket[];
}

export interface PolymarketOrderBook {
  market: string;
  asset_id: string;
  timestamp: string;
  hash: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface OrderBookLevel {
  price: string;
  size: string;
}

export interface PolymarketMidpoint {
  mid: string;
}

export interface ParsedMarket {
  id: string;
  question: string;
  slug: string;
  category: string;
  description: string;
  outcomes: string[];
  outcomePrices: number[];
  volume: number;
  volume24hr: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  endDate: string;
  startDate: string | null;
  image: string | null;
  clobTokenIds: string[];
  enableOrderBook: boolean;
}

export interface MarketWithOrderBook extends ParsedMarket {
  orderBook: {
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
    midpoint: number | null;
    spread: number | null;
    timestamp: string;
  } | null;
}

export interface FetchMarketsParams {
  limit?: number;
  offset?: number;
  active?: boolean;
  closed?: boolean;
  category?: string;
  minVolume?: number;
  sortBy?: 'volume' | 'volume24hr' | 'liquidity' | 'endDate';
  ascending?: boolean;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

class RateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    // Rimuovi timestamp fuori dalla finestra
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      const oldestInWindow = this.timestamps[0];
      const waitTime = this.windowMs - (now - oldestInWindow) + 10;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.timestamps.push(Date.now());
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

const CACHE_TTL_MARKETS = 5 * 60 * 1000; // 5 minuti
const CACHE_TTL_PRICES = 30 * 1000; // 30 secondi

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 500;

class PolymarketClient {
  private cache = new MemoryCache();
  private rateLimiter = new RateLimiter(10, 1000); // 10 req/sec

  // -------------------------------------------------------------------------
  // Fetch generico con retry + exponential backoff
  // -------------------------------------------------------------------------

  private async fetchWithRetry<T>(url: string, retries = MAX_RETRIES): Promise<T> {
    await this.rateLimiter.waitForSlot();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
        });

        if (response.status === 429) {
          // Rate limited: aspetta e riprova
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (!response.ok) {
          throw new Error(`Polymarket API ${response.status}: ${response.statusText} — ${url}`);
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < retries) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new Error(`Failed to fetch ${url}`);
  }

  // -------------------------------------------------------------------------
  // Markets (Gamma API)
  // -------------------------------------------------------------------------

  async getMarkets(params: FetchMarketsParams = {}): Promise<ParsedMarket[]> {
    const {
      limit = 50,
      offset = 0,
      active = true,
      closed = false,
      category,
      minVolume,
      sortBy = 'volume24hr',
      ascending = false,
    } = params;

    const cacheKey = `markets:${JSON.stringify(params)}`;
    const cached = this.cache.get<ParsedMarket[]>(cacheKey);
    if (cached) return cached;

    const searchParams = new URLSearchParams();
    searchParams.set('limit', String(limit));
    searchParams.set('offset', String(offset));
    searchParams.set('active', String(active));
    searchParams.set('closed', String(closed));

    // Gamma API usa "order" per il sort field e "ascending" per la direzione
    const orderMap: Record<string, string> = {
      volume: 'volume',
      volume24hr: 'volume24hr',
      liquidity: 'liquidityNum',
      endDate: 'endDate',
    };
    searchParams.set('order', orderMap[sortBy] ?? 'volume24hr');
    searchParams.set('ascending', String(ascending));

    const url = `${GAMMA_API}/markets?${searchParams}`;
    const raw = await this.fetchWithRetry<PolymarketRawMarket[]>(url);

    let markets = raw.map(parseRawMarket);

    // Filtra per categoria (client-side, Gamma non supporta filtro diretto)
    if (category) {
      const cat = category.toLowerCase();
      markets = markets.filter((m) => m.category.toLowerCase().includes(cat));
    }

    // Filtra per volume minimo
    if (minVolume !== undefined && minVolume > 0) {
      markets = markets.filter((m) => m.volume >= minVolume);
    }

    this.cache.set(cacheKey, markets, CACHE_TTL_MARKETS);
    return markets;
  }

  async getMarket(marketId: string): Promise<ParsedMarket> {
    const cacheKey = `market:${marketId}`;
    const cached = this.cache.get<ParsedMarket>(cacheKey);
    if (cached) return cached;

    const url = `${GAMMA_API}/markets/${marketId}`;
    const raw = await this.fetchWithRetry<PolymarketRawMarket>(url);
    const market = parseRawMarket(raw);

    this.cache.set(cacheKey, market, CACHE_TTL_MARKETS);
    return market;
  }

  // -------------------------------------------------------------------------
  // Events (Gamma API)
  // -------------------------------------------------------------------------

  async getEvents(params: {
    limit?: number;
    offset?: number;
    active?: boolean;
    closed?: boolean;
    slug?: string;
    tag?: string;
  } = {}): Promise<PolymarketRawEvent[]> {
    const cacheKey = `events:${JSON.stringify(params)}`;
    const cached = this.cache.get<PolymarketRawEvent[]>(cacheKey);
    if (cached) return cached;

    const searchParams = new URLSearchParams();
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.offset) searchParams.set('offset', String(params.offset));
    if (params.active !== undefined) searchParams.set('active', String(params.active));
    if (params.closed !== undefined) searchParams.set('closed', String(params.closed));
    if (params.slug) searchParams.set('slug', params.slug);
    if (params.tag) searchParams.set('tag', params.tag);

    const url = `${GAMMA_API}/events?${searchParams}`;
    const data = await this.fetchWithRetry<PolymarketRawEvent[]>(url);

    this.cache.set(cacheKey, data, CACHE_TTL_MARKETS);
    return data;
  }

  // -------------------------------------------------------------------------
  // Prices & OrderBook (CLOB API)
  // -------------------------------------------------------------------------

  async getOrderBook(tokenId: string): Promise<PolymarketOrderBook> {
    const cacheKey = `book:${tokenId}`;
    const cached = this.cache.get<PolymarketOrderBook>(cacheKey);
    if (cached) return cached;

    const url = `${CLOB_API}/book?token_id=${tokenId}`;
    const data = await this.fetchWithRetry<PolymarketOrderBook>(url);

    this.cache.set(cacheKey, data, CACHE_TTL_PRICES);
    return data;
  }

  async getMidpoint(tokenId: string): Promise<number | null> {
    const cacheKey = `mid:${tokenId}`;
    const cached = this.cache.get<number>(cacheKey);
    if (cached !== null) return cached;

    try {
      const url = `${CLOB_API}/midpoint?token_id=${tokenId}`;
      const data = await this.fetchWithRetry<PolymarketMidpoint>(url);
      const mid = parseFloat(data.mid);
      if (!isNaN(mid)) {
        this.cache.set(cacheKey, mid, CACHE_TTL_PRICES);
        return mid;
      }
      return null;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Market con OrderBook completo
  // -------------------------------------------------------------------------

  async getMarketWithOrderBook(marketId: string): Promise<MarketWithOrderBook> {
    const market = await this.getMarket(marketId);

    let orderBook: MarketWithOrderBook['orderBook'] = null;

    if (market.clobTokenIds.length > 0 && market.enableOrderBook) {
      const yesTokenId = market.clobTokenIds[0];
      try {
        const [book, midpoint] = await Promise.all([
          this.getOrderBook(yesTokenId),
          this.getMidpoint(yesTokenId),
        ]);

        const bestBid = book.bids.length > 0
          ? parseFloat(book.bids[book.bids.length - 1].price)
          : null;
        const bestAsk = book.asks.length > 0
          ? parseFloat(book.asks[0].price)
          : null;

        const spread = bestBid !== null && bestAsk !== null
          ? parseFloat((bestAsk - bestBid).toFixed(4))
          : null;

        orderBook = {
          bids: book.bids,
          asks: book.asks,
          midpoint,
          spread,
          timestamp: book.timestamp,
        };
      } catch {
        // OrderBook non disponibile, restituisci il mercato senza
      }
    }

    return { ...market, orderBook };
  }

  // -------------------------------------------------------------------------
  // Storico prezzi (costruito da trades Gamma)
  // -------------------------------------------------------------------------

  async getPriceHistory(marketId: string, limit = 100): Promise<{
    timestamp: string;
    price: number;
    side: string;
    size: number;
  }[]> {
    const cacheKey = `history:${marketId}:${limit}`;
    const cached = this.cache.get<{ timestamp: string; price: number; side: string; size: number }[]>(cacheKey);
    if (cached) return cached;

    // Gamma API espone i prezzi storici come timeseries sulla pagina dell'evento,
    // ma non c'e un endpoint pubblico dedicato. Usiamo il CLOB /trades.
    try {
      const url = `${CLOB_API}/trades?market=${marketId}&limit=${limit}`;
      const trades = await this.fetchWithRetry<Array<{
        id: string;
        price: string;
        size: string;
        side: string;
        timestamp: string;
      }>>(url);

      const history = (Array.isArray(trades) ? trades : []).map((t) => ({
        timestamp: t.timestamp,
        price: parseFloat(t.price),
        side: t.side,
        size: parseFloat(t.size),
      }));

      this.cache.set(cacheKey, history, CACHE_TTL_PRICES);
      return history;
    } catch {
      return [];
    }
  }

  /** Svuota la cache */
  clearCache(): void {
    this.cache.clear();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeJsonParse<T>(str: string | undefined | null, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

function parseRawMarket(raw: PolymarketRawMarket): ParsedMarket {
  return {
    id: raw.id,
    question: raw.question,
    slug: raw.slug,
    category: raw.category ?? raw.events?.[0]?.category ?? 'Uncategorized',
    description: raw.description,
    outcomes: safeJsonParse<string[]>(raw.outcomes, []),
    outcomePrices: safeJsonParse<string[]>(raw.outcomePrices, []).map(Number),
    volume: raw.volumeNum ?? parseFloat(raw.volume) ?? 0,
    volume24hr: raw.volume24hr ?? 0,
    liquidity: raw.liquidityNum ?? parseFloat(raw.liquidity) ?? 0,
    active: raw.active,
    closed: raw.closed,
    endDate: raw.endDate,
    startDate: raw.startDate ?? null,
    image: raw.image ?? raw.icon ?? null,
    clobTokenIds: safeJsonParse<string[]>(raw.clobTokenIds, []),
    enableOrderBook: raw.enableOrderBook ?? false,
  };
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

let clientInstance: PolymarketClient | null = null;

export function getPolymarketClient(): PolymarketClient {
  if (!clientInstance) {
    clientInstance = new PolymarketClient();
  }
  return clientInstance;
}

export { PolymarketClient };
