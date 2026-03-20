/**
 * Stocks API adapter — handles HTTP requests to stock data providers.
 */

import { ALPHA_VANTAGE_API } from './constants';
import { StockQuote, StockCandle } from './types';

export class StocksAdapter {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /** Get a stock quote */
  async getQuote(symbol: string): Promise<StockQuote> {
    const data = await this.alphaVantageCall('GLOBAL_QUOTE', { symbol });
    const quote = data['Global Quote'];
    return {
      symbol: quote['01. symbol'],
      name: symbol,
      exchange: '',
      price: parseFloat(quote['05. price']),
      open: parseFloat(quote['02. open']),
      high: parseFloat(quote['03. high']),
      low: parseFloat(quote['04. low']),
      close: parseFloat(quote['08. previous close']),
      previousClose: parseFloat(quote['08. previous close']),
      volume: parseInt(quote['06. volume']),
      timestamp: quote['07. latest trading day'],
    };
  }

  /** Get historical candles */
  async getCandles(symbol: string, interval: string = 'daily'): Promise<StockCandle[]> {
    const fnMap: Record<string, string> = {
      daily: 'TIME_SERIES_DAILY',
      weekly: 'TIME_SERIES_WEEKLY',
      monthly: 'TIME_SERIES_MONTHLY',
    };

    const data = await this.alphaVantageCall(fnMap[interval] ?? 'TIME_SERIES_DAILY', { symbol });
    const timeSeriesKey = Object.keys(data).find((k) => k.includes('Time Series'));
    if (!timeSeriesKey) return [];

    const timeSeries = data[timeSeriesKey];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Object.entries(timeSeries).map(([date, values]: [string, any]) => ({
      timestamp: date,
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
      volume: parseInt(values['5. volume']),
    }));
  }

  /** Search for symbols */
  async searchSymbol(query: string): Promise<{ symbol: string; name: string; type: string }[]> {
    const data = await this.alphaVantageCall('SYMBOL_SEARCH', { keywords: query });
    return (data.bestMatches ?? []).map((m: Record<string, string>) => ({
      symbol: m['1. symbol'],
      name: m['2. name'],
      type: m['3. type'],
    }));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async alphaVantageCall(fn: string, params: Record<string, string>): Promise<any> {
    const searchParams = new URLSearchParams({ function: fn, apikey: this.apiKey, ...params });
    const response = await fetch(`${ALPHA_VANTAGE_API}?${searchParams}`);
    if (!response.ok) throw new Error(`Alpha Vantage error: ${response.status}`);
    return response.json();
  }
}
