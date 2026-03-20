/**
 * Betfair Exchange API Client
 *
 * Gestisce chiamate reali alle Betfair Exchange API con:
 * - Autenticazione (app key + session token) con auto-refresh
 * - Rate limiting (5 req/sec)
 * - Cache in memoria (30s quote, 5min catalogo)
 * - Retry con exponential backoff
 * - Fallback a dati mock realistici se credenziali assenti
 */

import type {
  BetfairSport,
  BetfairCompetition,
  BetfairEvent,
  BetfairMarket,
  BetfairRunner,
  BetfairOrder,
  BetfairPrice,
} from '@/types/betfair';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BETFAIR_LOGIN_URL = 'https://identitysso.betfair.com/api/login';
const BETFAIR_BETTING_API = 'https://api.betfair.com/exchange/betting/rest/v1.0';

const CACHE_TTL_CATALOGUE = 5 * 60 * 1000; // 5 minuti
const CACHE_TTL_PRICES = 30 * 1000; // 30 secondi

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 500;

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
// Mock Data
// ---------------------------------------------------------------------------

function generateMockSports(): BetfairSport[] {
  return [
    { id: '1', name: 'Calcio', marketCount: 4520 },
    { id: '2', name: 'Tennis', marketCount: 1830 },
    { id: '7522', name: 'Basket', marketCount: 920 },
    { id: '7', name: 'Ippica', marketCount: 680 },
    { id: '4', name: 'Cricket', marketCount: 340 },
    { id: '7524', name: 'Hockey su ghiaccio', marketCount: 290 },
    { id: '6423', name: 'Football americano', marketCount: 180 },
    { id: '7511', name: 'Baseball', marketCount: 150 },
    { id: '3', name: 'Golf', marketCount: 120 },
    { id: '6', name: 'Boxe', marketCount: 45 },
    { id: '2378961', name: 'Politica', marketCount: 35 },
  ];
}

function generateMockCompetitions(sportId: string): BetfairCompetition[] {
  const competitionsBySport: Record<string, BetfairCompetition[]> = {
    '1': [
      { id: '81', name: 'Serie A', region: 'IT', marketCount: 320 },
      { id: '31', name: 'Premier League', region: 'GB', marketCount: 410 },
      { id: '117', name: 'La Liga', region: 'ES', marketCount: 280 },
      { id: '59', name: 'Bundesliga', region: 'DE', marketCount: 250 },
      { id: '55', name: 'Ligue 1', region: 'FR', marketCount: 220 },
      { id: '228', name: 'Champions League', region: 'EU', marketCount: 180 },
      { id: '300', name: 'Europa League', region: 'EU', marketCount: 140 },
    ],
    '2': [
      { id: '200', name: 'ATP Tour', region: 'INTL', marketCount: 450 },
      { id: '201', name: 'WTA Tour', region: 'INTL', marketCount: 380 },
      { id: '202', name: 'Grand Slam', region: 'INTL', marketCount: 120 },
    ],
    '7522': [
      { id: '400', name: 'NBA', region: 'US', marketCount: 520 },
      { id: '401', name: 'Euroleague', region: 'EU', marketCount: 180 },
      { id: '402', name: 'Serie A Basket', region: 'IT', marketCount: 90 },
    ],
  };

  return competitionsBySport[sportId] ?? [
    { id: '999', name: 'Principale', region: 'INTL', marketCount: 50 },
  ];
}

function generateMockEvents(competitionId: string): BetfairEvent[] {
  const now = Date.now();
  const hour = 3600000;

  const eventsByCompetition: Record<string, BetfairEvent[]> = {
    '81': [
      { id: 'e1', name: 'Juventus v Inter', countryCode: 'IT', timezone: 'CET', openDate: new Date(now + 2 * hour).toISOString(), marketCount: 45, competitionId: '81', competitionName: 'Serie A' },
      { id: 'e2', name: 'Milan v Napoli', countryCode: 'IT', timezone: 'CET', openDate: new Date(now + 5 * hour).toISOString(), marketCount: 42, competitionId: '81', competitionName: 'Serie A' },
      { id: 'e3', name: 'Roma v Lazio', countryCode: 'IT', timezone: 'CET', openDate: new Date(now + 24 * hour).toISOString(), marketCount: 40, competitionId: '81', competitionName: 'Serie A' },
      { id: 'e4', name: 'Atalanta v Fiorentina', countryCode: 'IT', timezone: 'CET', openDate: new Date(now + 26 * hour).toISOString(), marketCount: 38, competitionId: '81', competitionName: 'Serie A' },
      { id: 'e5', name: 'Bologna v Torino', countryCode: 'IT', timezone: 'CET', openDate: new Date(now + 48 * hour).toISOString(), marketCount: 35, competitionId: '81', competitionName: 'Serie A' },
    ],
    '31': [
      { id: 'e10', name: 'Arsenal v Chelsea', countryCode: 'GB', timezone: 'GMT', openDate: new Date(now + 3 * hour).toISOString(), marketCount: 55, competitionId: '31', competitionName: 'Premier League' },
      { id: 'e11', name: 'Liverpool v Man City', countryCode: 'GB', timezone: 'GMT', openDate: new Date(now + 6 * hour).toISOString(), marketCount: 52, competitionId: '31', competitionName: 'Premier League' },
      { id: 'e12', name: 'Man Utd v Tottenham', countryCode: 'GB', timezone: 'GMT', openDate: new Date(now + 28 * hour).toISOString(), marketCount: 48, competitionId: '31', competitionName: 'Premier League' },
    ],
    '117': [
      { id: 'e20', name: 'Real Madrid v Barcelona', countryCode: 'ES', timezone: 'CET', openDate: new Date(now + 4 * hour).toISOString(), marketCount: 58, competitionId: '117', competitionName: 'La Liga' },
      { id: 'e21', name: 'Atletico Madrid v Sevilla', countryCode: 'ES', timezone: 'CET', openDate: new Date(now + 27 * hour).toISOString(), marketCount: 42, competitionId: '117', competitionName: 'La Liga' },
    ],
    '228': [
      { id: 'e30', name: 'Bayern Munich v PSG', countryCode: 'EU', timezone: 'CET', openDate: new Date(now + 8 * hour).toISOString(), marketCount: 50, competitionId: '228', competitionName: 'Champions League' },
      { id: 'e31', name: 'Real Madrid v Man City', countryCode: 'EU', timezone: 'CET', openDate: new Date(now + 32 * hour).toISOString(), marketCount: 48, competitionId: '228', competitionName: 'Champions League' },
    ],
    '400': [
      { id: 'e40', name: 'LA Lakers v Boston Celtics', countryCode: 'US', timezone: 'EST', openDate: new Date(now + 10 * hour).toISOString(), marketCount: 30, competitionId: '400', competitionName: 'NBA' },
      { id: 'e41', name: 'Golden State Warriors v Miami Heat', countryCode: 'US', timezone: 'EST', openDate: new Date(now + 12 * hour).toISOString(), marketCount: 28, competitionId: '400', competitionName: 'NBA' },
    ],
  };

  return eventsByCompetition[competitionId] ?? [
    { id: 'e99', name: 'Evento di esempio', countryCode: 'XX', timezone: 'UTC', openDate: new Date(now + 5 * hour).toISOString(), marketCount: 10, competitionId, competitionName: 'Competizione' },
  ];
}

function generateMockPrice(basePrice: number, variance: number): BetfairPrice[] {
  const prices: BetfairPrice[] = [];
  for (let i = 0; i < 3; i++) {
    const offset = i * variance;
    prices.push({
      price: parseFloat((basePrice + offset).toFixed(2)),
      size: parseFloat((Math.random() * 500 + 50).toFixed(2)),
    });
  }
  return prices;
}

function generateMockRunners(eventName: string): BetfairRunner[] {
  const parts = eventName.split(' v ');
  const home = parts[0] ?? 'Home';
  const away = parts[1] ?? 'Away';

  // Quote realistiche per match odds
  const homeOdds = parseFloat((1.5 + Math.random() * 2.5).toFixed(2));
  const drawOdds = parseFloat((2.8 + Math.random() * 1.5).toFixed(2));
  const awayOdds = parseFloat((2.0 + Math.random() * 3.0).toFixed(2));

  return [
    {
      selectionId: 1001,
      runnerName: home,
      handicap: 0,
      lastPriceTraded: homeOdds,
      totalMatched: parseFloat((Math.random() * 100000 + 5000).toFixed(2)),
      status: 'ACTIVE',
      ex: {
        availableToBack: generateMockPrice(homeOdds, 0.02),
        availableToLay: generateMockPrice(homeOdds + 0.04, 0.02),
        tradedVolume: [],
      },
    },
    {
      selectionId: 1002,
      runnerName: 'Pareggio',
      handicap: 0,
      lastPriceTraded: drawOdds,
      totalMatched: parseFloat((Math.random() * 50000 + 2000).toFixed(2)),
      status: 'ACTIVE',
      ex: {
        availableToBack: generateMockPrice(drawOdds, 0.05),
        availableToLay: generateMockPrice(drawOdds + 0.08, 0.05),
        tradedVolume: [],
      },
    },
    {
      selectionId: 1003,
      runnerName: away,
      handicap: 0,
      lastPriceTraded: awayOdds,
      totalMatched: parseFloat((Math.random() * 80000 + 3000).toFixed(2)),
      status: 'ACTIVE',
      ex: {
        availableToBack: generateMockPrice(awayOdds, 0.03),
        availableToLay: generateMockPrice(awayOdds + 0.06, 0.03),
        tradedVolume: [],
      },
    },
  ];
}

function generateMockMarketCatalogue(eventId: string, eventName: string): BetfairMarket[] {
  const now = Date.now();
  const hour = 3600000;
  const startTime = new Date(now + 4 * hour).toISOString();

  return [
    {
      marketId: `m-${eventId}-mo`,
      marketName: 'Match Odds',
      eventId,
      marketStartTime: startTime,
      totalMatched: parseFloat((Math.random() * 500000 + 50000).toFixed(2)),
      runners: generateMockRunners(eventName),
      status: 'OPEN',
      inPlay: false,
    },
    {
      marketId: `m-${eventId}-ou25`,
      marketName: 'Over/Under 2.5 Goals',
      eventId,
      marketStartTime: startTime,
      totalMatched: parseFloat((Math.random() * 200000 + 20000).toFixed(2)),
      runners: [
        {
          selectionId: 2001,
          runnerName: 'Over 2.5 Goals',
          handicap: 0,
          lastPriceTraded: parseFloat((1.7 + Math.random() * 0.6).toFixed(2)),
          totalMatched: parseFloat((Math.random() * 50000).toFixed(2)),
          status: 'ACTIVE',
          ex: {
            availableToBack: generateMockPrice(1.85, 0.02),
            availableToLay: generateMockPrice(1.89, 0.02),
            tradedVolume: [],
          },
        },
        {
          selectionId: 2002,
          runnerName: 'Under 2.5 Goals',
          handicap: 0,
          lastPriceTraded: parseFloat((2.0 + Math.random() * 0.5).toFixed(2)),
          totalMatched: parseFloat((Math.random() * 50000).toFixed(2)),
          status: 'ACTIVE',
          ex: {
            availableToBack: generateMockPrice(2.12, 0.03),
            availableToLay: generateMockPrice(2.18, 0.03),
            tradedVolume: [],
          },
        },
      ],
      status: 'OPEN',
      inPlay: false,
    },
    {
      marketId: `m-${eventId}-btts`,
      marketName: 'Both Teams to Score',
      eventId,
      marketStartTime: startTime,
      totalMatched: parseFloat((Math.random() * 150000 + 10000).toFixed(2)),
      runners: [
        {
          selectionId: 3001,
          runnerName: 'Si',
          handicap: 0,
          lastPriceTraded: parseFloat((1.6 + Math.random() * 0.4).toFixed(2)),
          totalMatched: parseFloat((Math.random() * 40000).toFixed(2)),
          status: 'ACTIVE',
          ex: {
            availableToBack: generateMockPrice(1.75, 0.02),
            availableToLay: generateMockPrice(1.79, 0.02),
            tradedVolume: [],
          },
        },
        {
          selectionId: 3002,
          runnerName: 'No',
          handicap: 0,
          lastPriceTraded: parseFloat((2.1 + Math.random() * 0.4).toFixed(2)),
          totalMatched: parseFloat((Math.random() * 40000).toFixed(2)),
          status: 'ACTIVE',
          ex: {
            availableToBack: generateMockPrice(2.20, 0.03),
            availableToLay: generateMockPrice(2.26, 0.03),
            tradedVolume: [],
          },
        },
      ],
      status: 'OPEN',
      inPlay: false,
    },
  ];
}

function generateMockMarketBook(marketId: string): BetfairMarket {
  // Determina il tipo di mercato dal suffisso dell'id
  const suffix = marketId.split('-').pop();
  const eventId = marketId.split('-').slice(1, -1).join('-');

  if (suffix === 'mo') {
    return {
      marketId,
      marketName: 'Match Odds',
      eventId,
      marketStartTime: new Date(Date.now() + 4 * 3600000).toISOString(),
      totalMatched: parseFloat((Math.random() * 500000 + 50000).toFixed(2)),
      runners: generateMockRunners('Home v Away'),
      status: 'OPEN',
      inPlay: false,
    };
  }

  // Default generico
  return {
    marketId,
    marketName: 'Market',
    eventId,
    marketStartTime: new Date(Date.now() + 4 * 3600000).toISOString(),
    totalMatched: parseFloat((Math.random() * 100000 + 10000).toFixed(2)),
    runners: [
      {
        selectionId: 9001,
        runnerName: 'Selezione 1',
        handicap: 0,
        lastPriceTraded: 2.0,
        status: 'ACTIVE',
        ex: {
          availableToBack: generateMockPrice(2.0, 0.02),
          availableToLay: generateMockPrice(2.06, 0.02),
          tradedVolume: [],
        },
      },
      {
        selectionId: 9002,
        runnerName: 'Selezione 2',
        handicap: 0,
        lastPriceTraded: 1.9,
        status: 'ACTIVE',
        ex: {
          availableToBack: generateMockPrice(1.9, 0.02),
          availableToLay: generateMockPrice(1.96, 0.02),
          tradedVolume: [],
        },
      },
    ],
    status: 'OPEN',
    inPlay: false,
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

class BetfairClient {
  private cache = new MemoryCache();
  private rateLimiter = new RateLimiter(5, 1000); // 5 req/sec

  private sessionToken: string | null = null;
  private sessionExpiresAt = 0;

  private appKey: string | null;
  private username: string | null;
  private password: string | null;
  private useMock: boolean;

  constructor() {
    this.appKey = process.env.BETFAIR_APP_KEY ?? null;
    this.username = process.env.BETFAIR_USERNAME ?? null;
    this.password = process.env.BETFAIR_PASSWORD ?? null;
    this.useMock = !this.appKey || !this.username || !this.password;

    if (this.useMock) {
      console.info('[BetfairClient] Credenziali non configurate — uso dati mock');
    }
  }

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  private async ensureSession(): Promise<void> {
    if (this.useMock) return;

    if (this.sessionToken && Date.now() < this.sessionExpiresAt) return;

    await this.login();
  }

  private async login(): Promise<void> {
    if (!this.appKey || !this.username || !this.password) {
      throw new Error('Betfair credentials not configured');
    }

    const response = await fetch(BETFAIR_LOGIN_URL, {
      method: 'POST',
      headers: {
        'X-Application': this.appKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`,
    });

    const data: { status: string; token?: string; error?: string } = await response.json();

    if (data.status !== 'SUCCESS' || !data.token) {
      throw new Error(`Betfair login failed: ${data.error ?? 'unknown'}`);
    }

    this.sessionToken = data.token;
    // Session dura ~4 ore, rinnoviamo ogni 3
    this.sessionExpiresAt = Date.now() + 3 * 3600000;
  }

  // -------------------------------------------------------------------------
  // Generic API call
  // -------------------------------------------------------------------------

  private async apiCall<T>(method: string, params: Record<string, unknown>): Promise<T> {
    await this.ensureSession();
    await this.rateLimiter.waitForSlot();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${BETFAIR_BETTING_API}/${method}/`, {
          method: 'POST',
          headers: {
            'X-Application': this.appKey!,
            'X-Authentication': this.sessionToken!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params),
        });

        if (response.status === 429) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (response.status === 401) {
          // Session scaduta, rinnova
          this.sessionToken = null;
          await this.login();
          continue;
        }

        if (!response.ok) {
          throw new Error(`Betfair API ${response.status}: ${response.statusText}`);
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new Error(`Failed to call ${method}`);
  }

  // -------------------------------------------------------------------------
  // Public methods
  // -------------------------------------------------------------------------

  /** Lista tipi di sport */
  async listEventTypes(): Promise<BetfairSport[]> {
    const cacheKey = 'betfair:sports';
    const cached = this.cache.get<BetfairSport[]>(cacheKey);
    if (cached) return cached;

    if (this.useMock) {
      const sports = generateMockSports();
      this.cache.set(cacheKey, sports, CACHE_TTL_CATALOGUE);
      return sports;
    }

    const result = await this.apiCall<Array<{
      eventType: { id: string; name: string };
      marketCount: number;
    }>>('listEventTypes', { filter: {} });

    const sports: BetfairSport[] = result.map((r) => ({
      id: r.eventType.id,
      name: r.eventType.name,
      marketCount: r.marketCount,
    }));

    this.cache.set(cacheKey, sports, CACHE_TTL_CATALOGUE);
    return sports;
  }

  /** Lista competizioni per sport */
  async listCompetitions(sportId: string): Promise<BetfairCompetition[]> {
    const cacheKey = `betfair:competitions:${sportId}`;
    const cached = this.cache.get<BetfairCompetition[]>(cacheKey);
    if (cached) return cached;

    if (this.useMock) {
      const competitions = generateMockCompetitions(sportId);
      this.cache.set(cacheKey, competitions, CACHE_TTL_CATALOGUE);
      return competitions;
    }

    const result = await this.apiCall<Array<{
      competition: { id: string; name: string };
      competitionRegion: string;
      marketCount: number;
    }>>('listCompetitions', {
      filter: { eventTypeIds: [sportId] },
    });

    const competitions: BetfairCompetition[] = result.map((r) => ({
      id: r.competition.id,
      name: r.competition.name,
      region: r.competitionRegion,
      marketCount: r.marketCount,
    }));

    this.cache.set(cacheKey, competitions, CACHE_TTL_CATALOGUE);
    return competitions;
  }

  /** Lista eventi per competizione */
  async listEvents(params: {
    sportId?: string;
    competitionId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<BetfairEvent[]> {
    const cacheKey = `betfair:events:${JSON.stringify(params)}`;
    const cached = this.cache.get<BetfairEvent[]>(cacheKey);
    if (cached) return cached;

    if (this.useMock) {
      const events = generateMockEvents(params.competitionId ?? params.sportId ?? '81');
      this.cache.set(cacheKey, events, CACHE_TTL_CATALOGUE);
      return events;
    }

    const filter: Record<string, unknown> = {};
    if (params.sportId) filter.eventTypeIds = [params.sportId];
    if (params.competitionId) filter.competitionIds = [params.competitionId];
    if (params.dateFrom || params.dateTo) {
      filter.marketStartTime = {
        ...(params.dateFrom ? { from: params.dateFrom } : {}),
        ...(params.dateTo ? { to: params.dateTo } : {}),
      };
    }

    const result = await this.apiCall<Array<{
      event: { id: string; name: string; countryCode: string; timezone: string; openDate: string };
      marketCount: number;
    }>>('listEvents', { filter });

    const events: BetfairEvent[] = result.map((r) => ({
      id: r.event.id,
      name: r.event.name,
      countryCode: r.event.countryCode,
      timezone: r.event.timezone,
      openDate: r.event.openDate,
      marketCount: r.marketCount,
    }));

    this.cache.set(cacheKey, events, CACHE_TTL_CATALOGUE);
    return events;
  }

  /** Catalogo mercati per un evento */
  async listMarketCatalogue(eventId: string): Promise<BetfairMarket[]> {
    const cacheKey = `betfair:catalogue:${eventId}`;
    const cached = this.cache.get<BetfairMarket[]>(cacheKey);
    if (cached) return cached;

    if (this.useMock) {
      // Recupera il nome dell'evento dai mock per generare runner realistici
      const allMockEvents = [
        ...generateMockEvents('81'),
        ...generateMockEvents('31'),
        ...generateMockEvents('117'),
        ...generateMockEvents('228'),
        ...generateMockEvents('400'),
      ];
      const event = allMockEvents.find((e) => e.id === eventId);
      const eventName = event?.name ?? 'Home v Away';
      const markets = generateMockMarketCatalogue(eventId, eventName);
      this.cache.set(cacheKey, markets, CACHE_TTL_CATALOGUE);
      return markets;
    }

    const result = await this.apiCall<Array<{
      marketId: string;
      marketName: string;
      event: { id: string };
      marketStartTime: string;
      totalMatched: number;
      runners: Array<{
        selectionId: number;
        runnerName: string;
        handicap: number;
        metadata?: Record<string, string>;
      }>;
    }>>('listMarketCatalogue', {
      filter: { eventIds: [eventId] },
      maxResults: 100,
      marketProjection: ['RUNNER_METADATA', 'MARKET_START_TIME'],
    });

    const markets: BetfairMarket[] = result.map((r) => ({
      marketId: r.marketId,
      marketName: r.marketName,
      eventId: r.event.id,
      marketStartTime: r.marketStartTime,
      totalMatched: r.totalMatched ?? 0,
      runners: r.runners.map((run) => ({
        selectionId: run.selectionId,
        runnerName: run.runnerName,
        handicap: run.handicap,
        status: 'ACTIVE' as const,
      })),
      status: 'OPEN',
      inPlay: false,
    }));

    this.cache.set(cacheKey, markets, CACHE_TTL_CATALOGUE);
    return markets;
  }

  /** Quote live (back/lay) con profondita */
  async listMarketBook(marketIds: string[]): Promise<BetfairMarket[]> {
    const cacheKey = `betfair:book:${marketIds.join(',')}`;
    const cached = this.cache.get<BetfairMarket[]>(cacheKey);
    if (cached) return cached;

    if (this.useMock) {
      const markets = marketIds.map((id) => generateMockMarketBook(id));
      this.cache.set(cacheKey, markets, CACHE_TTL_PRICES);
      return markets;
    }

    const result = await this.apiCall<Array<{
      marketId: string;
      status: string;
      inplay: boolean;
      totalMatched: number;
      runners: Array<{
        selectionId: number;
        runnerName?: string;
        handicap: number;
        lastPriceTraded?: number;
        totalMatched?: number;
        status: string;
        ex?: {
          availableToBack: Array<{ price: number; size: number }>;
          availableToLay: Array<{ price: number; size: number }>;
          tradedVolume: Array<{ price: number; size: number }>;
        };
      }>;
    }>>('listMarketBook', {
      marketIds,
      priceProjection: { priceData: ['EX_BEST_OFFERS', 'EX_TRADED'] },
    });

    const markets: BetfairMarket[] = result.map((r) => ({
      marketId: r.marketId,
      marketName: '',
      eventId: '',
      marketStartTime: '',
      totalMatched: r.totalMatched,
      runners: r.runners.map((run) => ({
        selectionId: run.selectionId,
        runnerName: run.runnerName ?? '',
        handicap: run.handicap,
        lastPriceTraded: run.lastPriceTraded,
        totalMatched: run.totalMatched,
        status: run.status as BetfairRunner['status'],
        ex: run.ex ? {
          availableToBack: run.ex.availableToBack,
          availableToLay: run.ex.availableToLay,
          tradedVolume: run.ex.tradedVolume,
        } : undefined,
      })),
      status: r.status as BetfairMarket['status'],
      inPlay: r.inplay,
    }));

    this.cache.set(cacheKey, markets, CACHE_TTL_PRICES);
    return markets;
  }

  /** Ordini aperti (per futuro live trading) */
  async listCurrentOrders(): Promise<BetfairOrder[]> {
    if (this.useMock) return [];

    const result = await this.apiCall<{
      currentOrders: Array<{
        betId: string;
        marketId: string;
        selectionId: number;
        side: 'BACK' | 'LAY';
        price: number;
        size: number;
        status: 'EXECUTABLE' | 'EXECUTION_COMPLETE';
        placedDate: string;
        matchedDate?: string;
      }>;
    }>('listCurrentOrders', {});

    return (result.currentOrders ?? []).map((o) => ({
      betId: o.betId,
      marketId: o.marketId,
      selectionId: o.selectionId,
      side: o.side,
      price: o.price,
      size: o.size,
      status: o.status,
      placedDate: o.placedDate,
      matchedDate: o.matchedDate,
    }));
  }

  /** Svuota la cache */
  clearCache(): void {
    this.cache.clear();
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

let clientInstance: BetfairClient | null = null;

export function getBetfairClient(): BetfairClient {
  if (!clientInstance) {
    clientInstance = new BetfairClient();
  }
  return clientInstance;
}

export { BetfairClient };
