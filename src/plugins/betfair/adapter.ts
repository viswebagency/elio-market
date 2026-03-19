/**
 * Betfair API adapter — handles HTTP requests to the Betfair Exchange API.
 */

import { BETFAIR_BETTING_API, BETFAIR_ACCOUNT_API } from './constants';
import { BetfairEvent, BetfairMarket, BetfairOrder } from './types';

export class BetfairAdapter {
  private sessionToken: string | null = null;
  private appKey: string;

  constructor(appKey: string) {
    this.appKey = appKey;
  }

  /** Login to Betfair */
  async login(username: string, password: string): Promise<void> {
    const response = await fetch('https://identitysso.betfair.com/api/login', {
      method: 'POST',
      headers: {
        'X-Application': this.appKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    });
    const data = await response.json();
    if (data.status !== 'SUCCESS') {
      throw new Error(`Betfair login failed: ${data.error}`);
    }
    this.sessionToken = data.token;
  }

  /** List events */
  async listEvents(eventTypeId: string): Promise<BetfairEvent[]> {
    const result = await this.apiCall('listEvents', {
      filter: { eventTypeIds: [eventTypeId] },
    });
    return result.map((r: { event: BetfairEvent }) => r.event);
  }

  /** List markets for an event */
  async listMarkets(eventId: string): Promise<BetfairMarket[]> {
    return this.apiCall('listMarketCatalogue', {
      filter: { eventIds: [eventId] },
      maxResults: 100,
      marketProjection: ['RUNNER_METADATA', 'MARKET_START_TIME'],
    });
  }

  /** Get market book (prices) */
  async getMarketBook(marketId: string): Promise<BetfairMarket> {
    const result = await this.apiCall('listMarketBook', {
      marketIds: [marketId],
      priceProjection: { priceData: ['EX_BEST_OFFERS', 'EX_TRADED'] },
    });
    return result[0];
  }

  /** Get current orders */
  async getCurrentOrders(): Promise<BetfairOrder[]> {
    const result = await this.apiCall('listCurrentOrders', {});
    return result.currentOrders ?? [];
  }

  /** Place a bet */
  async placeBet(
    marketId: string,
    selectionId: number,
    side: 'BACK' | 'LAY',
    price: number,
    size: number
  ): Promise<unknown> {
    return this.apiCall('placeOrders', {
      marketId,
      instructions: [
        {
          selectionId,
          side,
          orderType: 'LIMIT',
          limitOrder: { size, price, persistenceType: 'LAPSE' },
        },
      ],
    });
  }

  private async apiCall(method: string, params: unknown): Promise<unknown[]> {
    if (!this.sessionToken) throw new Error('Not logged in to Betfair');

    const response = await fetch(`${BETFAIR_BETTING_API}/${method}/`, {
      method: 'POST',
      headers: {
        'X-Application': this.appKey,
        'X-Authentication': this.sessionToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Betfair API error: ${response.status}`);
    }

    return response.json() as Promise<unknown[]>;
  }
}
