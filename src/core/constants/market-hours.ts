/**
 * Market hours per area — used for scheduling and alerts.
 */

import { MarketArea } from '../types/common';

export interface MarketHours {
  area: MarketArea;
  /** Whether this market is 24/7 */
  is24x7: boolean;
  /** Sessions (if not 24/7) */
  sessions: MarketSession[];
  /** Timezone for the market hours */
  timezone: string;
  /** Days closed (0=Sun, 6=Sat) */
  closedDays: number[];
}

export interface MarketSession {
  name: string;
  /** Open time in HH:MM format */
  open: string;
  /** Close time in HH:MM format */
  close: string;
}

export const MARKET_HOURS: Record<MarketArea, MarketHours> = {
  [MarketArea.PREDICTION]: {
    area: MarketArea.PREDICTION,
    is24x7: true,
    sessions: [],
    timezone: 'UTC',
    closedDays: [],
  },
  [MarketArea.EXCHANGE_BETTING]: {
    area: MarketArea.EXCHANGE_BETTING,
    is24x7: true, // Betfair is technically 24/7, events determine availability
    sessions: [],
    timezone: 'Europe/London',
    closedDays: [],
  },
  [MarketArea.STOCKS]: {
    area: MarketArea.STOCKS,
    is24x7: false,
    sessions: [
      { name: 'Pre-Market', open: '04:00', close: '09:30' },
      { name: 'Regular', open: '09:30', close: '16:00' },
      { name: 'After-Hours', open: '16:00', close: '20:00' },
    ],
    timezone: 'America/New_York',
    closedDays: [0, 6], // Saturday, Sunday
  },
  [MarketArea.FOREX]: {
    area: MarketArea.FOREX,
    is24x7: false,
    sessions: [
      { name: 'Sydney', open: '22:00', close: '07:00' },
      { name: 'Tokyo', open: '00:00', close: '09:00' },
      { name: 'London', open: '08:00', close: '17:00' },
      { name: 'New York', open: '13:00', close: '22:00' },
    ],
    timezone: 'UTC',
    closedDays: [0, 6], // Closed weekends
  },
  [MarketArea.CRYPTO]: {
    area: MarketArea.CRYPTO,
    is24x7: true,
    sessions: [],
    timezone: 'UTC',
    closedDays: [],
  },
};

/** Check if a market area is currently open */
export function isMarketOpen(area: MarketArea, now?: Date): boolean {
  const hours = MARKET_HOURS[area];
  if (hours.is24x7) return true;

  const date = now ?? new Date();
  const day = date.getDay();

  if (hours.closedDays.includes(day)) return false;

  // Simplified check — in production, use date-fns-tz for proper timezone conversion
  return true; // TODO: implement proper timezone-aware check
}
