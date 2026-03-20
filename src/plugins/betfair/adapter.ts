/**
 * Betfair API adapter — delega al BetfairClient centralizzato
 * per rate limiting, retry con exponential backoff e cache in memoria.
 */

import { getBetfairClient } from '@/lib/betfair-client';
import type {
  BetfairSport,
  BetfairCompetition,
  BetfairEvent,
  BetfairMarket,
  BetfairOrder,
} from '@/types/betfair';

export class BetfairAdapter {
  /** Lista sport disponibili */
  async listEventTypes(): Promise<BetfairSport[]> {
    const client = getBetfairClient();
    return client.listEventTypes();
  }

  /** Lista competizioni per sport */
  async listCompetitions(sportId: string): Promise<BetfairCompetition[]> {
    const client = getBetfairClient();
    return client.listCompetitions(sportId);
  }

  /** Lista eventi per sport/competizione */
  async listEvents(params: {
    sportId?: string;
    competitionId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<BetfairEvent[]> {
    const client = getBetfairClient();
    return client.listEvents(params);
  }

  /** Catalogo mercati per un evento */
  async listMarketCatalogue(eventId: string): Promise<BetfairMarket[]> {
    const client = getBetfairClient();
    return client.listMarketCatalogue(eventId);
  }

  /** Quote live (back/lay) con profondita */
  async listMarketBook(marketIds: string[]): Promise<BetfairMarket[]> {
    const client = getBetfairClient();
    return client.listMarketBook(marketIds);
  }

  /** Ordini aperti */
  async listCurrentOrders(): Promise<BetfairOrder[]> {
    const client = getBetfairClient();
    return client.listCurrentOrders();
  }
}
