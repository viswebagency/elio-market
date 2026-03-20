/**
 * GET /api/betfair/sports
 *
 * Restituisce la lista degli sport disponibili su Betfair Exchange.
 */

import { NextResponse } from 'next/server';
import { getBetfairClient } from '@/lib/betfair-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const client = getBetfairClient();
    const sports = await client.listEventTypes();

    return NextResponse.json({
      ok: true,
      sports,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /betfair/sports]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
