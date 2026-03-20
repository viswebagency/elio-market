/**
 * GET /api/betfair/markets
 *
 * Restituisce il catalogo mercati per un evento Betfair.
 *
 * Query params:
 *   eventId — ID evento Betfair
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBetfairClient } from '@/lib/betfair-client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json(
        { ok: false, error: 'eventId is required' },
        { status: 400 }
      );
    }

    const client = getBetfairClient();
    const markets = await client.listMarketCatalogue(eventId);

    // Per ogni mercato, prova ad arricchire con le quote live
    const marketIds = markets.map((m) => m.marketId);
    let enrichedMarkets = markets;

    if (marketIds.length > 0) {
      try {
        const books = await client.listMarketBook(marketIds);
        // Merge catalogo + book
        enrichedMarkets = markets.map((catalogue) => {
          const book = books.find((b) => b.marketId === catalogue.marketId);
          if (!book) return catalogue;
          return {
            ...catalogue,
            totalMatched: book.totalMatched || catalogue.totalMatched,
            status: book.status || catalogue.status,
            inPlay: book.inPlay || catalogue.inPlay,
            runners: catalogue.runners.map((catRunner) => {
              const bookRunner = book.runners.find(
                (br) => br.selectionId === catRunner.selectionId
              );
              if (!bookRunner) return catRunner;
              return {
                ...catRunner,
                lastPriceTraded: bookRunner.lastPriceTraded,
                totalMatched: bookRunner.totalMatched,
                ex: bookRunner.ex ?? catRunner.ex,
              };
            }),
          };
        });
      } catch {
        // Se il book fallisce, restituisci comunque il catalogo
      }
    }

    return NextResponse.json({
      ok: true,
      markets: enrichedMarkets,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /betfair/markets]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
