/**
 * GET /api/betfair/market/[id]
 *
 * Restituisce il dettaglio di un mercato Betfair con quote back/lay live.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBetfairClient } from '@/lib/betfair-client';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Market ID is required' },
        { status: 400 }
      );
    }

    const client = getBetfairClient();
    const markets = await client.listMarketBook([id]);

    if (!markets.length) {
      return NextResponse.json(
        { ok: false, error: 'Market not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      market: markets[0],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API /betfair/market/${params?.id}]`, message);

    const status = message.includes('404') ? 404 : 500;
    return NextResponse.json(
      { ok: false, error: message },
      { status }
    );
  }
}
