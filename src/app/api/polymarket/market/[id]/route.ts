/**
 * GET /api/polymarket/market/[id]
 *
 * Restituisce i dettagli completi di un singolo mercato Polymarket,
 * inclusi orderbook e midpoint dal CLOB.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPolymarketClient } from '@/lib/polymarket-client';

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

    const client = getPolymarketClient();

    const [marketWithBook, priceHistory] = await Promise.all([
      client.getMarketWithOrderBook(id),
      client.getPriceHistory(id, 50),
    ]);

    return NextResponse.json({
      ok: true,
      market: marketWithBook,
      priceHistory,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API /polymarket/market/${params?.id}]`, message);

    const status = message.includes('404') ? 404 : 500;
    return NextResponse.json(
      { ok: false, error: message },
      { status }
    );
  }
}
