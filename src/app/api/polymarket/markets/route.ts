/**
 * GET /api/polymarket/markets
 *
 * Restituisce i mercati attivi Polymarket con prezzi.
 *
 * Query params:
 *   limit     — numero massimo di mercati (default 20, max 100)
 *   category  — filtra per categoria (es. "Politics", "Crypto")
 *   minVolume — volume minimo in USD (es. 10000)
 *   sortBy    — campo di ordinamento: volume | volume24hr | liquidity | endDate (default volume24hr)
 *   offset    — offset per paginazione (default 0)
 *   ascending — "true" per ordinamento crescente (default "false")
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPolymarketClient } from '@/lib/polymarket-client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10) || 20, 100);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10) || 0;
    const category = searchParams.get('category') ?? undefined;
    const minVolume = searchParams.get('minVolume')
      ? parseFloat(searchParams.get('minVolume')!)
      : undefined;
    const sortBy = (searchParams.get('sortBy') ?? 'volume24hr') as
      | 'volume'
      | 'volume24hr'
      | 'liquidity'
      | 'endDate';
    const ascending = searchParams.get('ascending') === 'true';

    const client = getPolymarketClient();

    const markets = await client.getMarkets({
      limit,
      offset,
      active: true,
      closed: false,
      category,
      minVolume,
      sortBy,
      ascending,
    });

    return NextResponse.json({
      ok: true,
      count: markets.length,
      markets,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /polymarket/markets]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
