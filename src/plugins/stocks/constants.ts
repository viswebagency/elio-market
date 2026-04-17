/**
 * Stocks constants — broker endpoints, ticker lists, and configuration.
 */

/** Interactive Brokers endpoints (Phase 2 — live trading) */
export const IBKR_CLIENT_PORTAL_API = 'https://localhost:5000/v1/api';
export const IBKR_TWS_API_PORT = 7496;
export const IBKR_PAPER_API_PORT = 7497;

/** Twelve Data (free market data — 8 calls/min, 800/day, batch support) */
export const TWELVE_DATA_API_URL = 'https://api.twelvedata.com';

/** Alpha Vantage (free data — legacy, kept for reference) */
export const ALPHA_VANTAGE_API = 'https://www.alphavantage.co/query';

/** Yahoo Finance (unofficial) */
export const YAHOO_FINANCE_API = 'https://query1.finance.yahoo.com/v8/finance';

export const STOCK_EXCHANGES = {
  NYSE: { name: 'New York Stock Exchange', mic: 'XNYS', currency: 'USD' },
  NASDAQ: { name: 'NASDAQ', mic: 'XNAS', currency: 'USD' },
  LSE: { name: 'London Stock Exchange', mic: 'XLON', currency: 'GBP' },
  MIL: { name: 'Borsa Italiana', mic: 'XMIL', currency: 'EUR' },
  XETRA: { name: 'XETRA', mic: 'XETR', currency: 'EUR' },
} as const;

export const STOCK_RATE_LIMITS = {
  twelveData: { requestsPerMinute: 8, requestsPerDay: 800 },
  alphaVantage: { requestsPerMinute: 5 },
  ibkr: { requestsPerSecond: 50 },
};

/** US top tickers — used for paper trading strategies */
export const STOCK_US_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA',
] as const;

/** EU tickers — Finnhub uses exchange suffix (e.g., SAP.DE for XETRA) */
export const STOCK_EU_TICKERS = [
  'SAP.DE',    // SAP — XETRA
  'ASML.AS',   // ASML — Amsterdam
  'SIE.DE',    // Siemens — XETRA
] as const;

/** All monitored tickers */
export const STOCK_ALL_TICKERS = [
  ...STOCK_US_TICKERS,
  ...STOCK_EU_TICKERS,
] as const;

/**
 * Tickers fetched per cron tick on Twelve Data free tier (800 credits/day).
 * Paired with a 15-min cron to stay under budget.
 */
export const STOCK_FREE_TIER_TICKERS = [
  'AAPL', 'MSFT', 'NVDA',
] as const;
