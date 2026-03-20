/**
 * GET /api/paper-trading/scan
 *
 * Lancia uno scan dei mercati e restituisce opportunita'.
 * Rate limited: max 1 scan ogni 5 minuti.
 * Query params: userId (opzionale), cached (se "true" ritorna risultati precedenti)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMarketScanner } from '@/core/paper-trading/scanner';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId') ?? undefined;
    const cached = request.nextUrl.searchParams.get('cached') === 'true';

    const scanner = getMarketScanner({ userId });

    if (cached) {
      const opportunities = await scanner.getLastResults();
      return NextResponse.json({
        ok: true,
        cached: true,
        opportunities,
        count: opportunities.length,
      });
    }

    const result = await scanner.scan();

    return NextResponse.json({
      ok: true,
      cached: false,
      opportunities: result.opportunities,
      count: result.opportunities.length,
      marketsScanned: result.marketsScanned,
      strategiesEvaluated: result.strategiesEvaluated,
      scanDurationMs: result.scanDurationMs,
      scannedAt: result.scannedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';

    // Rate limit: return 429
    if (message.includes('Rate limit')) {
      return NextResponse.json(
        { ok: false, error: message },
        { status: 429 },
      );
    }

    console.error('[API /paper-trading/scan]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
