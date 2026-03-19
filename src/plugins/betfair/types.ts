/**
 * Betfair-specific types — exchange betting data structures.
 */

export interface BetfairEvent {
  eventId: string;
  eventName: string;
  countryCode: string;
  timezone: string;
  openDate: string;
  marketCount: number;
}

export interface BetfairMarket {
  marketId: string;
  marketName: string;
  eventId: string;
  marketStartTime: string;
  totalMatched: number;
  runners: BetfairRunner[];
  status: 'OPEN' | 'SUSPENDED' | 'CLOSED' | 'SETTLED';
  inPlay: boolean;
}

export interface BetfairRunner {
  selectionId: number;
  runnerName: string;
  handicap: number;
  lastPriceTraded?: number;
  totalMatched?: number;
  status: 'ACTIVE' | 'REMOVED' | 'WINNER' | 'LOSER';
  ex?: BetfairExchangePrices;
}

export interface BetfairExchangePrices {
  availableToBack: BetfairPriceSize[];
  availableToLay: BetfairPriceSize[];
  tradedVolume: BetfairPriceSize[];
}

export interface BetfairPriceSize {
  price: number;
  size: number;
}

export interface BetfairOrder {
  betId: string;
  marketId: string;
  selectionId: number;
  side: 'BACK' | 'LAY';
  price: number;
  size: number;
  status: 'EXECUTABLE' | 'EXECUTION_COMPLETE';
  placedDate: string;
  matchedDate?: string;
  profit?: number;
}
