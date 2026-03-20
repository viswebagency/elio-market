/**
 * POST /api/backtest/run
 *
 * Lancia un backtest quick-scan per una strategia su mercati Polymarket chiusi.
 *
 * Body: {
 *   strategyId: string,        // ID della strategia da testare
 *   period: number,            // Periodo in giorni
 *   slippage?: number,         // Slippage % (default 1)
 *   startingCapital?: number,  // Capitale iniziale (default 1000)
 *   commissionPct?: number,    // Commissione % (default 0)
 *   maxMarkets?: number,       // Max mercati da analizzare (default 100)
 *   category?: string,         // Filtro categoria
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseStrategy } from '@/core/engine/dsl-parser';
import { runBacktest, BacktestReport } from '@/core/backtest/runner';
import { ApiResponse } from '@/core/types/common';

interface BacktestRequestBody {
  strategyId: string;
  period: number;
  slippage?: number;
  startingCapital?: number;
  commissionPct?: number;
  maxMarkets?: number;
  category?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<BacktestReport>>> {
  try {
    const body = await request.json() as BacktestRequestBody;

    // Validazione input
    if (!body.strategyId || typeof body.strategyId !== 'string') {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'strategyId e obbligatorio',
        },
        timestamp: new Date().toISOString(),
      }, { status: 400 });
    }

    if (!body.period || typeof body.period !== 'number' || body.period <= 0) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'period deve essere un numero positivo (giorni)',
        },
        timestamp: new Date().toISOString(),
      }, { status: 400 });
    }

    const startingCapital = body.startingCapital ?? 1000;
    const slippage = body.slippage ?? 1;
    const commissionPct = body.commissionPct ?? 0;
    const maxMarkets = body.maxMarkets ?? 100;

    if (startingCapital <= 0) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'startingCapital deve essere positivo',
        },
        timestamp: new Date().toISOString(),
      }, { status: 400 });
    }

    // TODO: Caricare la strategia dal database tramite strategyId.
    // Per ora, restituiamo un errore se non viene fornita in formato raw.
    // In futuro: const strategyRow = await db.strategies.findById(body.strategyId);
    // const strategy = parseStrategy(strategyRow);

    // Placeholder: per ora il client deve inviare anche i dati della strategia
    // tramite un endpoint separato o cache.
    // Qui usiamo un approccio con lookup dal database (da implementare).

    return NextResponse.json({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Il caricamento della strategia dal database non e ancora implementato. Usa l\'endpoint con strategia inline.',
      },
      timestamp: new Date().toISOString(),
    }, { status: 501 });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore interno';
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message,
      },
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
