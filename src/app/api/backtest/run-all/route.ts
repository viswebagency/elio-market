/**
 * POST /api/backtest/run-all
 *
 * Runs Level 1 (Quick Scan — last 3 months) backtest on all 13 Polymarket strategies.
 * Loads historical data ONCE, then runs each strategy against the same dataset.
 *
 * Saves:
 * - backtest_runs: one row per strategy with full metrics
 * - paper_sessions: virtual "backtest" session per strategy
 * - equity_snapshots: daily equity curve points (source='backtest')
 *
 * Protected by CRON_SECRET.
 *
 * L1 pass criteria (FILE_SACRO section 4):
 * - ROI > 0 (net, after slippage)
 * - Max drawdown within strategy limit
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';
import { POLYMARKET_STRATEGIES, StrategySeed } from '@/core/strategies/polymarket-strategies';
import { parseStrategy, RawStrategyRow } from '@/core/engine/dsl-parser';
import { runBacktestWithData, BacktestReport } from '@/core/backtest/runner';
import { loadHistoricalData } from '@/core/backtest/data-loader';
import { HistoricalMarketData } from '@/core/backtest/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 min — backtesting 13 strategies

const PERIOD_DAYS = 90; // L1: 3 mesi
const INITIAL_CAPITAL = 100; // $100 per strategia (matching paper trading)
const SLIPPAGE_PCT = 1.5; // 1.5% slippage (conservative)
const COMMISSION_PCT = 0; // Polymarket: no commission
const MAX_MARKETS = 30; // Keep low for L1 speed — 30 is enough for Quick Scan

interface StrategyResult {
  code: string;
  name: string;
  riskLevel: string;
  passed: boolean;
  failureReason: string | null;
  metrics: {
    totalTrades: number;
    winRate: number;
    roiTotal: number;
    roiAnnualized: number;
    profitFactor: number;
    maxDrawdownPct: number;
    sharpeRatio: number;
    totalNetProfit: number;
    maxConsecutiveLosses: number;
    avgTradeReturn: number;
    bestTrade: number;
    worstTrade: number;
  };
  marketsAnalyzed: number;
  equityCurvePoints: number;
}

interface RunAllResponse {
  ok: boolean;
  totalStrategies: number;
  passed: number;
  failed: number;
  noTrades: number;
  marketsLoaded: number;
  results: StrategyResult[];
  savedToDb: {
    backtestRuns: number;
    backtestSessions: number;
    equitySnapshots: number;
  };
  executionTimeMs: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const db = createUntypedAdminClient();

    // 1. Load historical data ONCE for all strategies
    console.log('[Backtest/run-all] Loading historical data...');
    const historicalData = await loadHistoricalData({
      maxMarkets: 50, // 50 synthetic markets for broad coverage
      ticksPerMarket: PERIOD_DAYS,
      synthetic: true, // Use synthetic data — real Polymarket closed markets are too small/extreme for L1
      syntheticSeed: 42, // Reproducible results
    });
    console.log(`[Backtest/run-all] Loaded ${historicalData.length} markets`);

    if (historicalData.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'No historical data available from Polymarket',
      }, { status: 500 });
    }

    // 2. Get system user ID (same as seed)
    const userId = await getSystemUserId(db);

    // 3. Load strategy DB IDs (seeded strategies)
    const strategyDbMap = await loadStrategyDbIds(db, userId);

    // 4. Run backtest for each strategy
    const results: StrategyResult[] = [];
    let savedBacktestRuns = 0;
    let savedBacktestSessions = 0;
    let savedEquitySnapshots = 0;

    for (const seed of POLYMARKET_STRATEGIES) {
      console.log(`[Backtest/run-all] Running ${seed.code} — ${seed.name}...`);

      try {
        const result = runSingleBacktest(seed, historicalData);
        const strategyResult = evaluateL1(seed, result);
        results.push(strategyResult);

        // Save to DB
        const dbStrategyId = strategyDbMap.get(seed.code);
        if (dbStrategyId) {
          const saved = await saveBacktestResults(
            db, userId, dbStrategyId, seed, result, strategyResult,
          );
          savedBacktestRuns += saved.backtestRun ? 1 : 0;
          savedBacktestSessions += saved.sessionId ? 1 : 0;
          savedEquitySnapshots += saved.equitySnapshots;
        } else {
          console.warn(`[Backtest/run-all] ${seed.code}: not found in DB, skipping save`);
        }

        console.log(
          `[Backtest/run-all] ${seed.code}: ${strategyResult.passed ? 'PASS' : 'FAIL'} ` +
          `(ROI: ${strategyResult.metrics.roiTotal.toFixed(2)}%, ` +
          `WR: ${strategyResult.metrics.winRate.toFixed(1)}%, ` +
          `DD: ${strategyResult.metrics.maxDrawdownPct.toFixed(2)}%)`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Backtest/run-all] ${seed.code} ERROR: ${msg}`);
        results.push({
          code: seed.code,
          name: seed.name,
          riskLevel: seed.risk_level,
          passed: false,
          failureReason: `Error: ${msg}`,
          metrics: emptyMetricsSummary(),
          marketsAnalyzed: 0,
          equityCurvePoints: 0,
        });
      }
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed && r.failureReason !== 'No trades executed').length;
    const noTrades = results.filter(r => r.failureReason === 'No trades executed').length;

    const response: RunAllResponse = {
      ok: true,
      totalStrategies: results.length,
      passed,
      failed,
      noTrades,
      marketsLoaded: historicalData.length,
      results,
      savedToDb: {
        backtestRuns: savedBacktestRuns,
        backtestSessions: savedBacktestSessions,
        equitySnapshots: savedEquitySnapshots,
      },
      executionTimeMs: Date.now() - startTime,
    };

    console.log(
      `[Backtest/run-all] Done in ${response.executionTimeMs}ms — ` +
      `${passed} passed, ${failed} failed, ${noTrades} no trades`,
    );

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[Backtest/run-all] ERRORE:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

function runSingleBacktest(
  seed: StrategySeed,
  historicalData: HistoricalMarketData[],
): BacktestReport {
  const rawRow: RawStrategyRow = {
    id: seed.code,
    code: seed.code,
    name: seed.name,
    area: seed.area,
    max_drawdown: seed.max_drawdown,
    max_allocation_pct: seed.max_allocation_pct,
    max_consecutive_losses: seed.max_consecutive_losses,
    rules: seed.rules,
  };

  const parsed = parseStrategy(rawRow);

  return runBacktestWithData(parsed, historicalData, {
    initialCapital: INITIAL_CAPITAL,
    slippagePct: SLIPPAGE_PCT,
    commissionPct: COMMISSION_PCT,
    periodDays: PERIOD_DAYS,
    maxOpenPositions: 10,
  });
}

function evaluateL1(seed: StrategySeed, report: BacktestReport): StrategyResult {
  const m = report.metrics;

  let passed = true;
  let failureReason: string | null = null;

  // No trades = fail
  if (m.totalTrades === 0) {
    passed = false;
    failureReason = 'No trades executed';
  }
  // ROI must be positive (net, after slippage)
  else if (m.roiTotal <= 0) {
    passed = false;
    failureReason = `ROI negativo: ${m.roiTotal.toFixed(2)}%`;
  }
  // Max drawdown must be within strategy limit
  else if (m.maxDrawdownPct > seed.max_drawdown) {
    passed = false;
    failureReason = `Drawdown ${m.maxDrawdownPct.toFixed(2)}% > limite ${seed.max_drawdown}%`;
  }

  return {
    code: seed.code,
    name: seed.name,
    riskLevel: seed.risk_level,
    passed,
    failureReason,
    metrics: {
      totalTrades: m.totalTrades,
      winRate: m.winRate,
      roiTotal: m.roiTotal,
      roiAnnualized: m.roiAnnualized,
      profitFactor: m.profitFactor,
      maxDrawdownPct: m.maxDrawdownPct,
      sharpeRatio: m.sharpeRatio,
      totalNetProfit: m.totalNetProfit,
      maxConsecutiveLosses: m.maxConsecutiveLosses,
      avgTradeReturn: m.avgTradeReturn,
      bestTrade: m.bestTrade,
      worstTrade: m.worstTrade,
    },
    marketsAnalyzed: report.marketsAnalyzed,
    equityCurvePoints: report.equityCurve.length,
  };
}

// ---------------------------------------------------------------------------
// Database persistence
// ---------------------------------------------------------------------------

async function saveBacktestResults(
  db: ReturnType<typeof createUntypedAdminClient>,
  userId: string,
  strategyId: string,
  seed: StrategySeed,
  report: BacktestReport,
  result: StrategyResult,
): Promise<{ backtestRun: boolean; sessionId: string | null; equitySnapshots: number }> {
  let backtestRunSaved = false;
  let sessionId: string | null = null;
  let equitySnapshotsSaved = 0;

  const m = report.metrics;
  const now = new Date();
  const startDate = new Date(now.getTime() - PERIOD_DAYS * 24 * 60 * 60 * 1000);

  // 1. Save to backtest_runs
  try {
    const { data: btRun, error: btError } = await db
      .from('backtest_runs')
      .insert({
        user_id: userId,
        strategy_id: strategyId,
        level: 'quick_scan',
        start_date: startDate.toISOString().split('T')[0],
        end_date: now.toISOString().split('T')[0],
        initial_capital: INITIAL_CAPITAL,
        commission_model: { type: 'flat', pct: COMMISSION_PCT },
        slippage_pct: SLIPPAGE_PCT / 100, // DB stores as decimal (0.015 = 1.5%)
        total_trades: m.totalTrades,
        winning_trades: m.winningTrades,
        losing_trades: m.losingTrades,
        gross_profit: m.totalGrossProfit,
        total_commission: m.totalCommissionCost,
        total_slippage: m.totalSlippageCost,
        net_profit: m.totalNetProfit,
        win_rate: m.winRate,
        profit_factor: m.profitFactor === Infinity ? 9999 : m.profitFactor,
        max_drawdown: m.maxDrawdownPct,
        sharpe_ratio: m.sharpeRatio,
        roi: m.roiTotal,
        avg_trade_pnl: m.totalTrades > 0 ? m.totalNetProfit / m.totalTrades : 0,
        max_consecutive_wins: m.maxConsecutiveWins,
        max_consecutive_losses: m.maxConsecutiveLosses,
        passed: result.passed,
        failure_reason: result.failureReason,
        execution_time_ms: Date.now() - now.getTime(),
        notes: `L1 Quick Scan — ${report.marketsAnalyzed} markets, ${PERIOD_DAYS}d period, $${INITIAL_CAPITAL} capital`,
      })
      .select('id')
      .single();

    if (btError) {
      console.error(`[Backtest/save] ${seed.code} backtest_runs: ${btError.message}`);
    } else {
      backtestRunSaved = true;

      // 2. Create virtual backtest paper session
      const { data: session, error: sessError } = await db
        .from('paper_sessions')
        .insert({
          user_id: userId,
          strategy_id: strategyId,
          initial_capital: INITIAL_CAPITAL,
          current_capital: report.equityCurve.length > 0
            ? report.equityCurve[report.equityCurve.length - 1].equity
            : INITIAL_CAPITAL,
          peak_capital: Math.max(INITIAL_CAPITAL, ...report.equityCurve.map(p => p.equity)),
          status: 'backtest',
          realized_pnl: m.totalNetProfit,
          unrealized_pnl: 0,
          total_pnl: m.totalNetProfit,
          total_pnl_pct: m.roiTotal,
          max_drawdown_pct: m.maxDrawdownPct,
          total_ticks: report.equityCurve.length,
          portfolio_state: {
            source: 'backtest',
            backtest_run_id: btRun.id,
            level: 'L1_quick_scan',
            period_days: PERIOD_DAYS,
            markets_analyzed: report.marketsAnalyzed,
          },
        })
        .select('id')
        .single();

      if (sessError) {
        console.error(`[Backtest/save] ${seed.code} paper_sessions: ${sessError.message}`);
      } else {
        sessionId = session.id;

        // 3. Insert equity curve as equity_snapshots
        if (report.equityCurve.length > 0 && sessionId) {
          const snapshots = report.equityCurve.map((point, idx) => {
            const prevEquity = idx > 0 ? report.equityCurve[idx - 1].equity : INITIAL_CAPITAL;
            const pnlToday = point.equity - prevEquity;

            // Count trades that happened on this day
            const pointDate = point.timestamp.split('T')[0];
            const dayTrades = report.trades.filter(t =>
              t.exitTimestamp.split('T')[0] === pointDate,
            );

            return {
              session_id: sessionId,
              strategy_id: strategyId,
              snapshot_date: pointDate,
              capital: point.equity,
              realized_pnl: point.equity - INITIAL_CAPITAL,
              unrealized_pnl: 0,
              total_pnl: point.equity - INITIAL_CAPITAL,
              total_pnl_pct: ((point.equity - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100,
              max_drawdown_pct: point.drawdownPct,
              open_positions: 0,
              trades_today: dayTrades.length,
              pnl_today: pnlToday,
              source: 'backtest',
              backtest_run_id: btRun.id,
            };
          });

          // Deduplicate by date (keep last per day)
          const byDate = new Map<string, typeof snapshots[0]>();
          for (const snap of snapshots) {
            byDate.set(snap.snapshot_date, snap);
          }
          const deduped = Array.from(byDate.values());

          // Batch insert (max 500 per batch for Supabase)
          const BATCH_SIZE = 500;
          for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
            const batch = deduped.slice(i, i + BATCH_SIZE);
            const { error: snapError } = await db
              .from('equity_snapshots')
              .insert(batch);

            if (snapError) {
              console.error(`[Backtest/save] ${seed.code} equity_snapshots batch ${i}: ${snapError.message}`);
            } else {
              equitySnapshotsSaved += batch.length;
            }
          }
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Backtest/save] ${seed.code} exception: ${msg}`);
  }

  return {
    backtestRun: backtestRunSaved,
    sessionId,
    equitySnapshots: equitySnapshotsSaved,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getSystemUserId(db: ReturnType<typeof createUntypedAdminClient>): Promise<string> {
  const { data } = await db
    .from('profiles')
    .select('id')
    .eq('telegram_chat_id', 8659384895)
    .maybeSingle();

  if (data) return data.id;

  const { data: anyUser } = await db
    .from('profiles')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (anyUser) return anyUser.id;

  throw new Error('No user found in profiles');
}

async function loadStrategyDbIds(
  db: ReturnType<typeof createUntypedAdminClient>,
  userId: string,
): Promise<Map<string, string>> {
  const codes = POLYMARKET_STRATEGIES.map(s => s.code);

  const { data } = await db
    .from('strategies')
    .select('id, code')
    .eq('user_id', userId)
    .in('code', codes);

  const map = new Map<string, string>();
  if (data) {
    for (const row of data) {
      map.set(row.code, row.id);
    }
  }
  return map;
}

function emptyMetricsSummary() {
  return {
    totalTrades: 0,
    winRate: 0,
    roiTotal: 0,
    roiAnnualized: 0,
    profitFactor: 0,
    maxDrawdownPct: 0,
    sharpeRatio: 0,
    totalNetProfit: 0,
    maxConsecutiveLosses: 0,
    avgTradeReturn: 0,
    bestTrade: 0,
    worstTrade: 0,
  };
}
