/**
 * Polymarket-specific types — prediction market data structures.
 */

/** Raw Polymarket event from API */
export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  markets: PolymarketMarket[];
}

/** Raw Polymarket market (outcome within an event) */
export interface PolymarketMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  /** Outcome tokens */
  outcomes: string[];
  /** Current prices [yes, no] */
  outcomePrices: string[];
  /** 24h volume in USDC */
  volume24hr: number;
  /** Total liquidity */
  liquidity: number;
  /** Whether the market has resolved */
  resolved: boolean;
  /** Winning outcome (if resolved) */
  winningOutcome?: string;
}

/** Polymarket order book entry */
export interface PolymarketOrderBookEntry {
  price: string;
  size: string;
}

/** Polymarket trade (from history) */
export interface PolymarketTrade {
  id: string;
  marketId: string;
  side: 'BUY' | 'SELL';
  outcome: 'YES' | 'NO';
  price: string;
  size: string;
  timestamp: string;
  transactionHash: string;
}
