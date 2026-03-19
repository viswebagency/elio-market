/**
 * Crypto API adapter — handles HTTP requests to Binance API.
 */

import { BINANCE_API_BASE } from './constants';
import { CryptoTicker, CryptoCandle, CryptoBalance } from './types';

export class CryptoAdapter {
  private apiKey?: string;
  private apiSecret?: string;

  constructor(apiKey?: string, apiSecret?: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  /** Get 24h ticker for a symbol */
  async getTicker(symbol: string): Promise<CryptoTicker> {
    const data = await this.publicCall(`/ticker/24hr?symbol=${symbol}`) as Record<string, string>;
    return {
      symbol: data.symbol,
      baseAsset: symbol.replace(/USDT$|USDC$|BTC$/, ''),
      quoteAsset: symbol.endsWith('USDC') ? 'USDC' : symbol.endsWith('BTC') ? 'BTC' : 'USDT',
      price: parseFloat(data.lastPrice),
      bid: parseFloat(data.bidPrice),
      ask: parseFloat(data.askPrice),
      high24h: parseFloat(data.highPrice),
      low24h: parseFloat(data.lowPrice),
      volume24h: parseFloat(data.volume),
      quoteVolume24h: parseFloat(data.quoteVolume),
      priceChange24h: parseFloat(data.priceChange),
      priceChangePercent24h: parseFloat(data.priceChangePercent),
      timestamp: new Date(parseInt(data.closeTime)).toISOString(),
    };
  }

  /** Get candles (klines) */
  async getCandles(symbol: string, interval: string, limit = 100): Promise<CryptoCandle[]> {
    const data = await this.publicCall(
      `/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    ) as unknown[][];

    return data.map((k) => ({
      openTime: k[0] as number,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
      closeTime: k[6] as number,
      quoteVolume: parseFloat(k[7] as string),
      trades: k[8] as number,
    }));
  }

  /** Get all tickers */
  async getAllTickers(): Promise<CryptoTicker[]> {
    const data = await this.publicCall('/ticker/24hr') as Record<string, string>[];
    return data.map((d) => ({
      symbol: d.symbol,
      baseAsset: '',
      quoteAsset: '',
      price: parseFloat(d.lastPrice),
      bid: parseFloat(d.bidPrice),
      ask: parseFloat(d.askPrice),
      high24h: parseFloat(d.highPrice),
      low24h: parseFloat(d.lowPrice),
      volume24h: parseFloat(d.volume),
      quoteVolume24h: parseFloat(d.quoteVolume),
      priceChange24h: parseFloat(d.priceChange),
      priceChangePercent24h: parseFloat(d.priceChangePercent),
      timestamp: new Date(parseInt(d.closeTime)).toISOString(),
    }));
  }

  /** Get account balances (requires auth) */
  async getBalances(): Promise<CryptoBalance[]> {
    // TODO: implement signed request with HMAC
    throw new Error('Authenticated requests not yet implemented');
  }

  private async publicCall(path: string): Promise<unknown> {
    const response = await fetch(`${BINANCE_API_BASE}${path}`);
    if (!response.ok) throw new Error(`Binance API error: ${response.status}`);
    return response.json();
  }
}
