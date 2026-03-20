/**
 * Market Scanner for Paper Trading
 *
 * Scans all active Polymarket markets against active strategies,
 * evaluates each with the strategy evaluator, and returns ranked opportunities.
 */

import { getPolymarketClient, ParsedMarket } from '@/lib/polymarket-client';
import { parseStrategy, RawStrategyRow } from '../engine/dsl-parser';
import { MarketSnapshot, evaluateEntry } from '../engine/evaluator';
import { TierLevel } from '../engine/signals';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';
import { ScanOpportunity } from './state';

// ============================================================================
// Types
// ============================================================================

interface ScanConfig {
  minScore: number;
  maxMarkets: number;
  userId?: string;
}

interface ScanResult {
  opportunities: ScanOpportunity[];
  marketsScanned: number;
  strategiesEvaluated: number;
  scanDurationMs: number;
  scannedAt: string;
}

// ============================================================================
// Rate Limiting
// ============================================================================

let lastScanTimestamp = 0;
const MIN_SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minuti

// ============================================================================
// Scanner
// ============================================================================

export class MarketScanner {
  private config: ScanConfig;

  constructor(config?: Partial<ScanConfig>) {
    this.config = {
      minScore: 60,
      maxMarkets: 100,
      ...config,
    };
  }

  /**
   * Scan all markets against all active strategies.
   * Rate limited: max 1 scan every 5 minutes.
   */
  async scan(): Promise<ScanResult> {
    const now = Date.now();
    const elapsed = now - lastScanTimestamp;

    if (elapsed < MIN_SCAN_INTERVAL_MS) {
      const remainingSec = Math.ceil((MIN_SCAN_INTERVAL_MS - elapsed) / 1000);
      throw new Error(
        `Rate limit: prossimo scan disponibile tra ${remainingSec} secondi`,
      );
    }

    lastScanTimestamp = now;
    const startTime = performance.now();

    // Fetch active markets
    const markets = await this.fetchMarkets();

    // Load active strategies with paper sessions running
    const strategies = await this.loadActiveStrategies();

    const opportunities: ScanOpportunity[] = [];

    // Evaluate each market against each strategy
    for (const strategy of strategies) {
      for (const market of markets) {
        const snapshot = polymarketToSnapshot(market);
        const evaluation = evaluateEntry(strategy.parsed, snapshot);

        if (evaluation.passed && evaluation.totalScore >= this.config.minScore) {
          const tier = determineTier(evaluation.totalScore);
          const suggestedStake = calculateSuggestedStake(
            evaluation.totalScore,
            tier,
            strategy.parsed.maxAllocationPct,
          );

          opportunities.push({
            marketId: market.id,
            marketName: market.question,
            marketCategory: market.category,
            strategyId: strategy.parsed.strategyId,
            strategyName: strategy.parsed.name,
            strategyCode: strategy.parsed.code,
            score: evaluation.totalScore,
            motivation: evaluation.summary,
            suggestedStake,
            currentPrice: snapshot.price,
            volume24h: market.volume24hr,
            scannedAt: new Date().toISOString(),
          });
        }
      }
    }

    // Sort by score descending
    opportunities.sort((a, b) => b.score - a.score);

    const scanDurationMs = Math.round(performance.now() - startTime);
    const scannedAt = new Date().toISOString();

    // Persist results to DB
    await this.persistResults(opportunities);

    return {
      opportunities,
      marketsScanned: markets.length,
      strategiesEvaluated: strategies.length,
      scanDurationMs,
      scannedAt,
    };
  }

  /**
   * Get cached scan results from DB (last scan).
   */
  async getLastResults(limit = 50): Promise<ScanOpportunity[]> {
    const db = createUntypedAdminClient();

    const { data: rows } = await db
      .from('paper_scan_results')
      .select('*')
      .gte('score', this.config.minScore)
      .order('score', { ascending: false })
      .limit(limit);

    if (!rows || rows.length === 0) return [];

    // Load strategy names
    const strategyIds = [...new Set(rows.map((r) => r.strategy_id))];
    const { data: strategies } = await db
      .from('strategies')
      .select('id, name, code')
      .in('id', strategyIds);

    const stratMap = new Map(
      (strategies ?? []).map((s) => [s.id, { name: s.name, code: s.code }]),
    );

    return rows.map((row) => {
      const strat = stratMap.get(row.strategy_id);
      return {
        marketId: row.market_id,
        marketName: row.market_name,
        marketCategory: row.market_category ?? 'Uncategorized',
        strategyId: row.strategy_id,
        strategyName: strat?.name ?? 'Sconosciuta',
        strategyCode: strat?.code ?? '???',
        score: row.score,
        motivation: row.motivation,
        suggestedStake: row.suggested_stake ?? 0,
        currentPrice: row.current_price,
        volume24h: row.volume_24h ?? 0,
        scannedAt: row.scanned_at,
      };
    });
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private async fetchMarkets(): Promise<ParsedMarket[]> {
    const client = getPolymarketClient();

    return client.getMarkets({
      limit: this.config.maxMarkets,
      active: true,
      closed: false,
      sortBy: 'volume24hr',
      ascending: false,
    });
  }

  private async loadActiveStrategies(): Promise<
    { parsed: ReturnType<typeof parseStrategy> }[]
  > {
    const db = createUntypedAdminClient();

    let query = db
      .from('strategies')
      .select(
        'id, code, name, area, rules, max_drawdown, max_allocation_pct, max_consecutive_losses',
      )
      .eq('is_active', true)
      .eq('area', 'polymarket');

    if (this.config.userId) {
      query = query.eq('user_id', this.config.userId);
    }

    const { data: rows } = await query;

    if (!rows || rows.length === 0) return [];

    const results: { parsed: ReturnType<typeof parseStrategy> }[] = [];

    for (const row of rows) {
      try {
        const parsed = parseStrategy(row as unknown as RawStrategyRow);
        results.push({ parsed });
      } catch {
        // Skip invalid strategies
      }
    }

    return results;
  }

  private async persistResults(opportunities: ScanOpportunity[]): Promise<void> {
    if (opportunities.length === 0) return;

    const db = createUntypedAdminClient();

    const rows = opportunities.map((opp) => ({
      strategy_id: opp.strategyId,
      market_id: opp.marketId,
      market_name: opp.marketName,
      market_category: opp.marketCategory,
      score: opp.score,
      motivation: opp.motivation,
      suggested_stake: opp.suggestedStake,
      current_price: opp.currentPrice,
      volume_24h: opp.volume24h,
      scanned_at: opp.scannedAt,
    }));

    await db.from('paper_scan_results').insert(rows);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function polymarketToSnapshot(market: ParsedMarket): MarketSnapshot {
  const yesPrice = market.outcomePrices[0] ?? 0.5;

  return {
    marketId: market.id,
    name: market.question,
    price: yesPrice,
    volume24hUsd: market.volume24hr,
    totalVolumeUsd: market.volume,
    expiryDate: market.endDate,
    hasCatalyst: false,
    catalystDescription: null,
    category: market.category,
    status: market.active && !market.closed ? 'open' : 'closed',
  };
}

function determineTier(score: number): TierLevel {
  if (score >= 80) return TierLevel.TIER1;
  if (score >= 60) return TierLevel.TIER2;
  return TierLevel.TIER3;
}

function calculateSuggestedStake(
  score: number,
  _tier: TierLevel,
  maxAllocationPct: number,
): number {
  // Base suggestion: percentage of a hypothetical 1000 portfolio
  // scaled by score/100 and capped at maxAllocationPct
  const base = 1000;
  const scoreFactor = score / 100;
  const maxStake = base * (maxAllocationPct / 100);
  return Math.round(maxStake * scoreFactor * 100) / 100;
}

// ============================================================================
// Singleton
// ============================================================================

let scannerInstance: MarketScanner | null = null;

export function getMarketScanner(config?: Partial<ScanConfig>): MarketScanner {
  if (!scannerInstance) {
    scannerInstance = new MarketScanner(config);
  }
  return scannerInstance;
}
