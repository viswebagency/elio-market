/**
 * Betfair constants — API endpoints, event types, and configuration.
 */

export const BETFAIR_API_BASE = 'https://api.betfair.com/exchange';
export const BETFAIR_BETTING_API = `${BETFAIR_API_BASE}/betting/rest/v1.0`;
export const BETFAIR_ACCOUNT_API = `${BETFAIR_API_BASE}/account/rest/v1.0`;
export const BETFAIR_STREAM_URL = 'stream-api.betfair.com';
export const BETFAIR_STREAM_PORT = 443;

/** Betfair event type IDs */
export const BETFAIR_EVENT_TYPES = {
  SOCCER: '1',
  TENNIS: '2',
  GOLF: '3',
  CRICKET: '4',
  RUGBY_UNION: '5',
  BOXING: '6',
  HORSE_RACING: '7',
  MOTOR_SPORT: '8',
  CYCLING: '11',
  BASKETBALL: '7522',
  AMERICAN_FOOTBALL: '6423',
  BASEBALL: '7511',
  ICE_HOCKEY: '7524',
  POLITICS: '2378961',
} as const;

export const BETFAIR_COMMISSION_RATE = 0.05; // 5% on net winnings

export const BETFAIR_RATE_LIMITS = {
  requestsPerSecond: 5,
  requestsPerHour: 1000,
};
