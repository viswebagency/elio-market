/**
 * Betfair plugin types — re-export from shared types.
 *
 * I tipi canonici sono in @/types/betfair.ts.
 * Questo file mantiene la compatibilita col vecchio adapter.
 */

export type {
  BetfairSport,
  BetfairCompetition,
  BetfairEvent,
  BetfairMarket,
  BetfairRunner,
  BetfairExchangePrices,
  BetfairPrice as BetfairPriceSize,
  BetfairOrder,
} from '@/types/betfair';
