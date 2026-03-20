/**
 * Betfair Exchange types — shared across client, adapter, API routes and components.
 */

// ---------------------------------------------------------------------------
// Sport / Event Types
// ---------------------------------------------------------------------------

export interface BetfairSport {
  id: string;
  name: string;
  marketCount: number;
}

// ---------------------------------------------------------------------------
// Competition (league / tournament)
// ---------------------------------------------------------------------------

export interface BetfairCompetition {
  id: string;
  name: string;
  region: string;
  marketCount: number;
}

// ---------------------------------------------------------------------------
// Event (single match / game)
// ---------------------------------------------------------------------------

export interface BetfairEvent {
  id: string;
  name: string;
  countryCode: string;
  timezone: string;
  openDate: string;
  marketCount: number;
  competitionId?: string;
  competitionName?: string;
}

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------

export interface BetfairMarket {
  marketId: string;
  marketName: string;
  eventId: string;
  marketStartTime: string;
  totalMatched: number;
  runners: BetfairRunner[];
  status: BetfairMarketStatus;
  inPlay: boolean;
}

export type BetfairMarketStatus = 'OPEN' | 'SUSPENDED' | 'CLOSED' | 'SETTLED';

// ---------------------------------------------------------------------------
// Runner (selection: team / outcome)
// ---------------------------------------------------------------------------

export interface BetfairRunner {
  selectionId: number;
  runnerName: string;
  handicap: number;
  lastPriceTraded?: number;
  totalMatched?: number;
  status: BetfairRunnerStatus;
  ex?: BetfairExchangePrices;
}

export type BetfairRunnerStatus = 'ACTIVE' | 'REMOVED' | 'WINNER' | 'LOSER';

// ---------------------------------------------------------------------------
// Prices (back / lay with depth)
// ---------------------------------------------------------------------------

export interface BetfairExchangePrices {
  availableToBack: BetfairPrice[];
  availableToLay: BetfairPrice[];
  tradedVolume: BetfairPrice[];
}

export interface BetfairPrice {
  price: number;
  size: number;
}

// ---------------------------------------------------------------------------
// Order (for future live trading)
// ---------------------------------------------------------------------------

export interface BetfairOrder {
  betId: string;
  marketId: string;
  selectionId: number;
  side: 'BACK' | 'LAY';
  price: number;
  size: number;
  status: BetfairOrderStatus;
  placedDate: string;
  matchedDate?: string;
  profit?: number;
}

export type BetfairOrderStatus = 'EXECUTABLE' | 'EXECUTION_COMPLETE';

// ---------------------------------------------------------------------------
// API response wrappers
// ---------------------------------------------------------------------------

export interface BetfairSportsResponse {
  ok: boolean;
  sports: BetfairSport[];
  error?: string;
}

export interface BetfairEventsResponse {
  ok: boolean;
  competitions: BetfairCompetition[];
  events: BetfairEvent[];
  error?: string;
}

export interface BetfairMarketResponse {
  ok: boolean;
  market: BetfairMarket;
  error?: string;
}
