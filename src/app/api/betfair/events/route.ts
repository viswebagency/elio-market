/**
 * GET /api/betfair/events
 *
 * Restituisce competizioni ed eventi per uno sport Betfair.
 *
 * Query params:
 *   sportId       — ID tipo sport (es. "1" per calcio)
 *   competitionId — ID competizione (es. "81" per Serie A)
 *   dateFrom      — data inizio filtro (ISO 8601)
 *   dateTo        — data fine filtro (ISO 8601)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBetfairClient } from '@/lib/betfair-client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const sportId = searchParams.get('sportId') ?? undefined;
    const competitionId = searchParams.get('competitionId') ?? undefined;
    const dateFrom = searchParams.get('dateFrom') ?? undefined;
    const dateTo = searchParams.get('dateTo') ?? undefined;

    if (!sportId && !competitionId) {
      return NextResponse.json(
        { ok: false, error: 'sportId or competitionId is required' },
        { status: 400 }
      );
    }

    const client = getBetfairClient();

    // Fetch competizioni e eventi in parallelo se abbiamo sportId
    const [competitions, events] = await Promise.all([
      sportId ? client.listCompetitions(sportId) : Promise.resolve([]),
      client.listEvents({ sportId, competitionId, dateFrom, dateTo }),
    ]);

    return NextResponse.json({
      ok: true,
      competitions,
      events,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /betfair/events]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
