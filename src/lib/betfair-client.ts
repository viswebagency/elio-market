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
    { id: '1', name: 'Soccer', marketCount: 4520 },
    { id: '2', name: 'Tennis', marketCount: 1830 },
    { id: '7522', name: 'Basketball', marketCount: 920 },
    { id: '7', name: 'Horse Racing', marketCount: 680 },
    { id: '4', name: 'Cricket', marketCount: 340 },
    { id: '7524', name: 'Ice Hockey', marketCount: 290 },
    { id: '6423', name: 'American Football', marketCount: 180 },
    { id: '7511', name: 'Baseball', marketCount: 150 },
    { id: '3', name: 'Golf', marketCount: 120 },
    { id: '6', name: 'Boxing', marketCount: 45 },
    { id: '2378961', name: 'Politics', marketCount: 35 },
  ];
}

function generateMockCompetitions(sportId: string): BetfairCompetition[] {
  const competitionsBySport: Record<string, BetfairCompetition[]> = {
    '1': [
      { id: '81', name: 'Italian Serie A', region: 'IT', marketCount: 320 },
      { id: '31', name: 'English Premier League', region: 'GB', marketCount: 410 },
      { id: '117', name: 'Spanish La Liga', region: 'ES', marketCount: 280 },
      { id: '59', name: 'German Bundesliga', region: 'DE', marketCount: 250 },
      { id: '55', name: 'French Ligue 1', region: 'FR', marketCount: 220 },
      { id: '228', name: 'UEFA Champions League', region: 'EU', marketCount: 180 },
      { id: '300', name: 'UEFA Europa League', region: 'EU', marketCount: 140 },
    ],
    '2': [
      { id: '200', name: 'ATP Tour', region: 'INTL', marketCount: 450 },
      { id: '201', name: 'WTA Tour', region: 'INTL', marketCount: 380 },
      { id: '202', name: 'Grand Slam', region: 'INTL', marketCount: 120 },
    ],
    '7522': [
      { id: '400', name: 'NBA', region: 'US', marketCount: 520 },
      { id: '401', name: 'Euroleague', region: 'EU', marketCount: 180 },
      { id: '402', name: 'Italian Serie A Basketball', region: 'IT', marketCount: 90 },
    ],
  };

  return competitionsBySport[sportId] ?? [
    { id: '999', name: 'Main', region: 'INTL', marketCount: 50 },
  ];
}

// Mappa quote fisse per evento: [home back, draw back, away back]
// Le quote riflettono il reale equilibrio tra le squadre
const MOCK_ODDS: Record<string, [number, number, number]> = {
  // Serie A - Giornata 29 (22-23 marzo 2026)
  e1: [2.60, 3.30, 2.80],   // Juventus v Napoli — match equilibrato, lieve vantaggio casa
  e2: [2.10, 3.40, 3.60],   // Inter v Genoa — Inter netta favorita
  e3: [2.90, 3.20, 2.55],   // Lazio v Atalanta — Atalanta leggermente favorita
  e4: [1.85, 3.50, 4.50],   // Milan v Monza — Milan favorito
  e5: [2.50, 3.20, 2.95],   // Fiorentina v Roma — equilibrato
  e6: [2.00, 3.40, 3.80],   // Bologna v Cagliari — Bologna favorito
  e7: [1.75, 3.60, 5.00],   // Torino v Lecce — Torino netto favorito
  e8: [3.10, 3.30, 2.35],   // Empoli v Udinese — Udinese favorita in trasferta
  // Serie A - Giornata 30 (29-30 marzo 2026)
  e9: [2.70, 3.25, 2.70],   // Napoli v Roma — equilibrato
  e10a: [1.65, 3.80, 5.50], // Inter v Lecce — Inter super favorita

  // Premier League - Matchday 30 (22 marzo 2026)
  e10: [1.55, 4.20, 6.00],  // Arsenal v Leicester — Arsenal netto favorito
  e11: [1.70, 3.80, 5.00],  // Liverpool v Wolves — Liverpool favorito
  e12: [2.40, 3.40, 3.00],  // Man Utd v Aston Villa — equilibrato
  e13: [1.90, 3.50, 4.20],  // Newcastle v West Ham — Newcastle favorito
  e14: [2.80, 3.30, 2.60],  // Chelsea v Brighton — Brighton leggermente favorito

  // La Liga - Jornada 29 (22-23 marzo 2026)
  e20: [1.45, 4.50, 7.50],  // Real Madrid v Valladolid — Real nettissimo favorito
  e21: [1.60, 4.00, 5.50],  // Barcelona v Celta Vigo — Barca netto favorito
  e22: [1.80, 3.60, 4.60],  // Atletico Madrid v Real Betis — Atletico favorito
  e23: [2.30, 3.30, 3.20],  // Real Sociedad v Villarreal — equilibrato
  e24: [2.50, 3.20, 2.90],  // Athletic Bilbao v Girona — equilibrato

  // Bundesliga - Spieltag 27 (22 marzo 2026)
  e30b: [1.40, 4.80, 8.00], // Bayern Munich v Mainz — Bayern nettissimo favorito
  e31b: [1.75, 3.70, 4.80], // Borussia Dortmund v Hoffenheim — BVB favorito
  e32b: [1.90, 3.50, 4.20], // Bayer Leverkusen v Freiburg — Leverkusen favorito
  e33b: [2.30, 3.30, 3.20], // RB Leipzig v Wolfsburg — Leipzig legg. favorito

  // Ligue 1 - Journée 28 (22-23 marzo 2026)
  e40l: [1.25, 6.00, 12.00], // PSG v Montpellier — PSG dominante
  e41l: [2.10, 3.40, 3.50],  // Marseille v Lens — OM legg. favorito
  e42l: [1.85, 3.50, 4.40],  // Monaco v Rennes — Monaco favorito
  e43l: [2.00, 3.40, 3.80],  // Lyon v Nantes — Lyon favorito

  // Champions League - Quarti di finale (andata, 8-9 aprile 2026)
  e30: [2.20, 3.40, 3.30],  // Arsenal v Barcelona — equilibrato, legg. Arsenal
  e31: [2.50, 3.30, 2.85],  // Bayern Munich v Real Madrid — legg. Real favorito
  e32: [2.40, 3.30, 3.00],  // Inter v Atletico Madrid — equilibrato
  e33: [3.20, 3.40, 2.25],  // PSG v Liverpool — Liverpool favorito

  // Europa League - Quarti di finale (andata, 10 aprile 2026)
  e50: [2.00, 3.40, 3.80],  // Lazio v Athletic Bilbao — Lazio legg. favorita
  e51: [2.30, 3.30, 3.20],  // Tottenham v Lyon — equilibrato

  // NBA
  e40: [1.80, 0, 2.05],     // LA Lakers v Boston Celtics (no pareggio)
  e41: [1.95, 0, 1.90],     // Golden State Warriors v Miami Heat
};

function generateMockEvents(competitionId: string): BetfairEvent[] {
  const eventsByCompetition: Record<string, BetfairEvent[]> = {
    // -----------------------------------------------------------------------
    // Serie A 2025/2026 — Giornate 29 e 30
    // Squadre: Inter, Napoli, Juventus, Milan, Atalanta, Lazio, Roma,
    //          Fiorentina, Bologna, Torino, Udinese, Genoa, Cagliari,
    //          Empoli, Monza, Lecce, Como, Verona, Parma, Venezia
    // -----------------------------------------------------------------------
    '81': [
      { id: 'e1', name: 'Juventus v Napoli', countryCode: 'IT', timezone: 'CET', openDate: '2026-03-22T17:00:00Z', marketCount: 45, competitionId: '81', competitionName: 'Italian Serie A' },
      { id: 'e2', name: 'Inter v Genoa', countryCode: 'IT', timezone: 'CET', openDate: '2026-03-22T19:45:00Z', marketCount: 42, competitionId: '81', competitionName: 'Italian Serie A' },
      { id: 'e3', name: 'Lazio v Atalanta', countryCode: 'IT', timezone: 'CET', openDate: '2026-03-23T14:00:00Z', marketCount: 40, competitionId: '81', competitionName: 'Italian Serie A' },
      { id: 'e4', name: 'Milan v Monza', countryCode: 'IT', timezone: 'CET', openDate: '2026-03-23T17:00:00Z', marketCount: 38, competitionId: '81', competitionName: 'Italian Serie A' },
      { id: 'e5', name: 'Fiorentina v Roma', countryCode: 'IT', timezone: 'CET', openDate: '2026-03-23T19:45:00Z', marketCount: 42, competitionId: '81', competitionName: 'Italian Serie A' },
      { id: 'e6', name: 'Bologna v Cagliari', countryCode: 'IT', timezone: 'CET', openDate: '2026-03-22T14:00:00Z', marketCount: 35, competitionId: '81', competitionName: 'Italian Serie A' },
      { id: 'e7', name: 'Torino v Lecce', countryCode: 'IT', timezone: 'CET', openDate: '2026-03-22T14:00:00Z', marketCount: 35, competitionId: '81', competitionName: 'Italian Serie A' },
      { id: 'e8', name: 'Empoli v Udinese', countryCode: 'IT', timezone: 'CET', openDate: '2026-03-22T14:00:00Z', marketCount: 32, competitionId: '81', competitionName: 'Italian Serie A' },
      { id: 'e9', name: 'Napoli v Roma', countryCode: 'IT', timezone: 'CET', openDate: '2026-03-29T19:45:00Z', marketCount: 44, competitionId: '81', competitionName: 'Italian Serie A' },
      { id: 'e10a', name: 'Inter v Lecce', countryCode: 'IT', timezone: 'CET', openDate: '2026-03-29T17:00:00Z', marketCount: 40, competitionId: '81', competitionName: 'Italian Serie A' },
    ],

    // -----------------------------------------------------------------------
    // Premier League 2025/2026 — Matchday 30
    // -----------------------------------------------------------------------
    '31': [
      { id: 'e10', name: 'Arsenal v Leicester', countryCode: 'GB', timezone: 'GMT', openDate: '2026-03-22T14:00:00Z', marketCount: 55, competitionId: '31', competitionName: 'English Premier League' },
      { id: 'e11', name: 'Liverpool v Wolves', countryCode: 'GB', timezone: 'GMT', openDate: '2026-03-22T16:30:00Z', marketCount: 52, competitionId: '31', competitionName: 'English Premier League' },
      { id: 'e12', name: 'Man Utd v Aston Villa', countryCode: 'GB', timezone: 'GMT', openDate: '2026-03-22T14:00:00Z', marketCount: 48, competitionId: '31', competitionName: 'English Premier League' },
      { id: 'e13', name: 'Newcastle v West Ham', countryCode: 'GB', timezone: 'GMT', openDate: '2026-03-22T14:00:00Z', marketCount: 45, competitionId: '31', competitionName: 'English Premier League' },
      { id: 'e14', name: 'Chelsea v Brighton', countryCode: 'GB', timezone: 'GMT', openDate: '2026-03-23T15:00:00Z', marketCount: 50, competitionId: '31', competitionName: 'English Premier League' },
    ],

    // -----------------------------------------------------------------------
    // La Liga 2025/2026 — Jornada 29
    // -----------------------------------------------------------------------
    '117': [
      { id: 'e20', name: 'Real Madrid v Valladolid', countryCode: 'ES', timezone: 'CET', openDate: '2026-03-22T20:00:00Z', marketCount: 55, competitionId: '117', competitionName: 'Spanish La Liga' },
      { id: 'e21', name: 'Barcelona v Celta Vigo', countryCode: 'ES', timezone: 'CET', openDate: '2026-03-23T17:30:00Z', marketCount: 52, competitionId: '117', competitionName: 'Spanish La Liga' },
      { id: 'e22', name: 'Atletico Madrid v Real Betis', countryCode: 'ES', timezone: 'CET', openDate: '2026-03-22T17:30:00Z', marketCount: 45, competitionId: '117', competitionName: 'Spanish La Liga' },
      { id: 'e23', name: 'Real Sociedad v Villarreal', countryCode: 'ES', timezone: 'CET', openDate: '2026-03-22T14:00:00Z', marketCount: 40, competitionId: '117', competitionName: 'Spanish La Liga' },
      { id: 'e24', name: 'Athletic Bilbao v Girona', countryCode: 'ES', timezone: 'CET', openDate: '2026-03-23T20:00:00Z', marketCount: 42, competitionId: '117', competitionName: 'Spanish La Liga' },
    ],

    // -----------------------------------------------------------------------
    // Bundesliga 2025/2026 — Spieltag 27
    // -----------------------------------------------------------------------
    '59': [
      { id: 'e30b', name: 'Bayern Munich v Mainz', countryCode: 'DE', timezone: 'CET', openDate: '2026-03-22T14:30:00Z', marketCount: 48, competitionId: '59', competitionName: 'German Bundesliga' },
      { id: 'e31b', name: 'Borussia Dortmund v Hoffenheim', countryCode: 'DE', timezone: 'CET', openDate: '2026-03-22T14:30:00Z', marketCount: 45, competitionId: '59', competitionName: 'German Bundesliga' },
      { id: 'e32b', name: 'Bayer Leverkusen v Freiburg', countryCode: 'DE', timezone: 'CET', openDate: '2026-03-22T17:30:00Z', marketCount: 42, competitionId: '59', competitionName: 'German Bundesliga' },
      { id: 'e33b', name: 'RB Leipzig v Wolfsburg', countryCode: 'DE', timezone: 'CET', openDate: '2026-03-23T14:30:00Z', marketCount: 40, competitionId: '59', competitionName: 'German Bundesliga' },
    ],

    // -----------------------------------------------------------------------
    // Ligue 1 2025/2026 — Journée 28
    // -----------------------------------------------------------------------
    '55': [
      { id: 'e40l', name: 'PSG v Montpellier', countryCode: 'FR', timezone: 'CET', openDate: '2026-03-22T20:00:00Z', marketCount: 48, competitionId: '55', competitionName: 'French Ligue 1' },
      { id: 'e41l', name: 'Marseille v Lens', countryCode: 'FR', timezone: 'CET', openDate: '2026-03-23T19:45:00Z', marketCount: 44, competitionId: '55', competitionName: 'French Ligue 1' },
      { id: 'e42l', name: 'Monaco v Rennes', countryCode: 'FR', timezone: 'CET', openDate: '2026-03-22T16:00:00Z', marketCount: 40, competitionId: '55', competitionName: 'French Ligue 1' },
      { id: 'e43l', name: 'Lyon v Nantes', countryCode: 'FR', timezone: 'CET', openDate: '2026-03-23T14:00:00Z', marketCount: 38, competitionId: '55', competitionName: 'French Ligue 1' },
    ],

    // -----------------------------------------------------------------------
    // UEFA Champions League 2025/2026 — Quarti di finale (andata)
    // -----------------------------------------------------------------------
    '228': [
      { id: 'e30', name: 'Arsenal v Barcelona', countryCode: 'EU', timezone: 'CET', openDate: '2026-04-08T19:00:00Z', marketCount: 55, competitionId: '228', competitionName: 'UEFA Champions League' },
      { id: 'e31', name: 'Bayern Munich v Real Madrid', countryCode: 'EU', timezone: 'CET', openDate: '2026-04-08T21:00:00Z', marketCount: 55, competitionId: '228', competitionName: 'UEFA Champions League' },
      { id: 'e32', name: 'Inter v Atletico Madrid', countryCode: 'EU', timezone: 'CET', openDate: '2026-04-09T19:00:00Z', marketCount: 52, competitionId: '228', competitionName: 'UEFA Champions League' },
      { id: 'e33', name: 'PSG v Liverpool', countryCode: 'EU', timezone: 'CET', openDate: '2026-04-09T21:00:00Z', marketCount: 52, competitionId: '228', competitionName: 'UEFA Champions League' },
    ],

    // -----------------------------------------------------------------------
    // UEFA Europa League 2025/2026 — Quarti di finale (andata)
    // -----------------------------------------------------------------------
    '300': [
      { id: 'e50', name: 'Lazio v Athletic Bilbao', countryCode: 'EU', timezone: 'CET', openDate: '2026-04-10T19:00:00Z', marketCount: 42, competitionId: '300', competitionName: 'UEFA Europa League' },
      { id: 'e51', name: 'Tottenham v Lyon', countryCode: 'EU', timezone: 'CET', openDate: '2026-04-10T21:00:00Z', marketCount: 42, competitionId: '300', competitionName: 'UEFA Europa League' },
    ],

    // -----------------------------------------------------------------------
    // NBA 2025/2026
    // -----------------------------------------------------------------------
    '400': [
      { id: 'e40', name: 'LA Lakers v Boston Celtics', countryCode: 'US', timezone: 'EST', openDate: '2026-03-22T00:30:00Z', marketCount: 30, competitionId: '400', competitionName: 'NBA' },
      { id: 'e41', name: 'Golden State Warriors v Miami Heat', countryCode: 'US', timezone: 'EST', openDate: '2026-03-23T00:00:00Z', marketCount: 28, competitionId: '400', competitionName: 'NBA' },
    ],
  };

  return eventsByCompetition[competitionId] ?? [];
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

function generateMockRunners(eventId: string, eventName: string): BetfairRunner[] {
  const parts = eventName.split(' v ');
  const home = parts[0] ?? 'Home';
  const away = parts[1] ?? 'Away';

  // Quote fisse dalla mappa, fallback realistici
  const odds = MOCK_ODDS[eventId] ?? [2.50, 3.30, 2.90];
  const homeOdds = odds[0];
  const drawOdds = odds[1];
  const awayOdds = odds[2];

  // Per sport senza pareggio (es. NBA/basket), drawOdds === 0
  const isNoDraw = drawOdds === 0;

  const runners: BetfairRunner[] = [
    {
      selectionId: 1001,
      runnerName: home,
      handicap: 0,
      lastPriceTraded: homeOdds,
      totalMatched: parseFloat((homeOdds < 2.0 ? 85000 + Math.random() * 40000 : 45000 + Math.random() * 30000).toFixed(2)),
      status: 'ACTIVE',
      ex: {
        availableToBack: generateMockPrice(homeOdds, 0.02),
        availableToLay: generateMockPrice(homeOdds + 0.03, 0.02),
        tradedVolume: [],
      },
    },
  ];

  if (!isNoDraw) {
    runners.push({
      selectionId: 1002,
      runnerName: 'The Draw',
      handicap: 0,
      lastPriceTraded: drawOdds,
      totalMatched: parseFloat((15000 + Math.random() * 20000).toFixed(2)),
      status: 'ACTIVE',
      ex: {
        availableToBack: generateMockPrice(drawOdds, 0.05),
        availableToLay: generateMockPrice(drawOdds + 0.05, 0.05),
        tradedVolume: [],
      },
    });
  }

  runners.push({
    selectionId: 1003,
    runnerName: away,
    handicap: 0,
    lastPriceTraded: awayOdds,
    totalMatched: parseFloat((awayOdds < 2.0 ? 85000 + Math.random() * 40000 : 35000 + Math.random() * 25000).toFixed(2)),
    status: 'ACTIVE',
    ex: {
      availableToBack: generateMockPrice(awayOdds, 0.03),
      availableToLay: generateMockPrice(awayOdds + 0.04, 0.03),
      tradedVolume: [],
    },
  });

  return runners;
}

/** Helper: raccoglie tutti gli eventi mock da tutte le competizioni */
function getAllMockEvents(): BetfairEvent[] {
  const competitionIds = ['81', '31', '117', '59', '55', '228', '300', '400'];
  return competitionIds.flatMap((cid) => generateMockEvents(cid));
}

function generateMockMarketCatalogue(eventId: string, eventName: string): BetfairMarket[] {
  // Trova la data dell'evento dai mock per usarla come startTime
  const allEvents = getAllMockEvents();
  const event = allEvents.find((e) => e.id === eventId);
  const startTime = event?.openDate ?? new Date(Date.now() + 4 * 3600000).toISOString();

  return [
    {
      marketId: `m-${eventId}-mo`,
      marketName: 'Match Odds',
      eventId,
      marketStartTime: startTime,
      totalMatched: parseFloat((Math.random() * 500000 + 50000).toFixed(2)),
      runners: generateMockRunners(eventId, eventName),
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

  // Trova il nome dell'evento dai mock
  const allEvents = getAllMockEvents();
  const event = allEvents.find((e) => e.id === eventId);
  const eventName = event?.name ?? 'Home v Away';
  const startTime = event?.openDate ?? new Date(Date.now() + 4 * 3600000).toISOString();

  if (suffix === 'mo') {
    return {
      marketId,
      marketName: 'Match Odds',
      eventId,
      marketStartTime: startTime,
      totalMatched: parseFloat((Math.random() * 500000 + 50000).toFixed(2)),
      runners: generateMockRunners(eventId, eventName),
      status: 'OPEN',
      inPlay: false,
    };
  }

  // Default generico (Over/Under, BTTS, ecc.)
  return {
    marketId,
    marketName: 'Market',
    eventId,
    marketStartTime: startTime,
    totalMatched: parseFloat((Math.random() * 100000 + 10000).toFixed(2)),
    runners: [
      {
        selectionId: 9001,
        runnerName: 'Selection 1',
        handicap: 0,
        lastPriceTraded: 2.0,
        status: 'ACTIVE',
        ex: {
          availableToBack: generateMockPrice(2.0, 0.02),
          availableToLay: generateMockPrice(2.04, 0.02),
          tradedVolume: [],
        },
      },
      {
        selectionId: 9002,
        runnerName: 'Selection 2',
        handicap: 0,
        lastPriceTraded: 1.9,
        status: 'ACTIVE',
        ex: {
          availableToBack: generateMockPrice(1.9, 0.02),
          availableToLay: generateMockPrice(1.94, 0.02),
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
      let events: BetfairEvent[];
      if (params.competitionId) {
        events = generateMockEvents(params.competitionId);
      } else {
        // When only sportId is given, return all events from all competitions of that sport
        events = getAllMockEvents();
      }
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
      const allMockEvents = getAllMockEvents();
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
