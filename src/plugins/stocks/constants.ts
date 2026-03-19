/**
 * Stocks constants — broker endpoints and configuration.
 */

/** Interactive Brokers endpoints */
export const IBKR_CLIENT_PORTAL_API = 'https://localhost:5000/v1/api';
export const IBKR_TWS_API_PORT = 7496;
export const IBKR_PAPER_API_PORT = 7497;

/** Alpha Vantage (free data) */
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
  alphaVantage: { requestsPerMinute: 5 },
  ibkr: { requestsPerSecond: 50 },
};
