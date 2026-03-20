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
import { parseStrategy, ParsedStrategy, StrategyRulesJson, RawStrategyRow } from '@/core/engine/dsl-parser';
import { runBacktest, BacktestReport } from '@/core/backtest/runner';
import { ApiResponse } from '@/core/types/common';
import { createServerSupabaseClient } from '@/lib/db/supabase/server';

interface BacktestRequestBody {
  strategyId: string;
  period: number;
  slippage?: number;
  startingCapital?: number;
  commissionPct?: number;
  maxMarkets?: number;
  category?: string;
}

/**
 * Fallback hardcoded della strategia PM-001 — Compra la Paura, Vendi lo Spike.
 * Usata quando la strategia non e' presente nel database.
 */
function getPM001Fallback(): ParsedStrategy {
  const rules: StrategyRulesJson = {
    entry_rules: [
      {
        id: 'E1',
        condition: 'price_range',
        description: 'Prezzo tra $0.05 e $0.45',
        params: { min_price: 0.05, max_price: 0.45 },
      },
      {
        id: 'E2',
        condition: 'min_volume',
        description: 'Volume totale > $100K',
        params: { min_volume_usd: 100000 },
      },
      {
        id: 'E3',
        condition: 'max_expiry',
        description: 'Scadenza entro 30 giorni',
        params: { max_days_to_expiry: 30 },
      },
    ],
    exit_rules: [
      {
        id: 'X1',
        condition: 'take_profit_1',
        description: '+50% -> vendere 1/3',
        params: { profit_pct: 50, sell_fraction: 0.33 },
      },
      {
        id: 'X2',
        condition: 'take_profit_2',
        description: '+100% -> vendere 1/2',
        params: { profit_pct: 100, sell_fraction: 0.5 },
      },
      {
        id: 'X3',
        condition: 'take_profit_3',
        description: '+200% -> vendere tutto',
        params: { profit_pct: 200, sell_fraction: 1 },
      },
      {
        id: 'X4',
        condition: 'stop_loss',
        description: '-30% -> stop loss',
        params: { loss_pct: -30, sell_fraction: 1 },
      },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 50, description: 'Alta convinzione' },
      tier2: { allocation_pct: 30, description: 'Speculativi ragionati' },
      tier3: { allocation_pct: 20, description: 'Lottery' },
    },
    liquidity_reserve_pct: 20,
    circuit_breaker_total: {
      loss_pct: -50,
      action: 'Pausa totale strategia',
      description: 'Se perdi 50% del bankroll totale, FERMATI',
    },
  };

  return parseStrategy({
    id: 'PM-001',
    code: 'PM-001',
    name: 'Compra la Paura, Vendi lo Spike',
    area: 'prediction',
    max_drawdown: 50,
    max_allocation_pct: 25,
    max_consecutive_losses: 5,
    rules,
  });
}

/**
 * Tenta di caricare la strategia dal database Supabase.
 * Ritorna null se non trovata o in caso di errore.
 */
async function loadStrategyFromDB(strategyId: string): Promise<ParsedStrategy | null> {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('strategies')
      .select('*')
      .eq('id', strategyId)
      .single();

    if (error || !data) {
      return null;
    }

    // Cast esplicito: il DB ha tipi generici, noi sappiamo la struttura
    const row = data as { id: string; name: string; area: string; rules: unknown };

    const rawRow: RawStrategyRow = {
      id: row.id,
      code: row.id,
      name: row.name,
      area: row.area,
      max_drawdown: 50,
      max_allocation_pct: 25,
      max_consecutive_losses: 5,
      rules: row.rules as StrategyRulesJson,
    };

    return parseStrategy(rawRow);
  } catch {
    return null;
  }
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

    // 1. Prova a caricare la strategia dal database
    let strategy = await loadStrategyFromDB(body.strategyId);

    // 2. Se non trovata nel DB e l'ID e' PM-001, usa il fallback hardcoded
    if (!strategy) {
      if (body.strategyId === 'PM-001') {
        strategy = getPM001Fallback();
      } else {
        return NextResponse.json({
          success: false,
          error: {
            code: 'STRATEGY_NOT_FOUND',
            message: `Strategia "${body.strategyId}" non trovata nel database`,
          },
          timestamp: new Date().toISOString(),
        }, { status: 404 });
      }
    }

    // 3. Esegui il backtest
    const report = await runBacktest({
      strategy,
      periodDays: body.period,
      initialCapital: startingCapital,
      slippagePct: slippage,
      commissionPct,
      maxMarkets,
      category: body.category,
    });

    return NextResponse.json({
      success: true,
      data: report,
      timestamp: new Date().toISOString(),
    });

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
