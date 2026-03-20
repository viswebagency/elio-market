import {
  EntryRule,
  EntryRuleParams,
  PriceRangeParams,
  MinVolumeParams,
  MaxExpiryParams,
  CatalystParams,
  ParsedStrategy,
  ExitRule,
} from './dsl-parser';

export interface MarketSnapshot {
  marketId: string;
  name: string;
  price: number;
  volume24hUsd: number;
  totalVolumeUsd: number;
  expiryDate: string | null;
  hasCatalyst: boolean;
  catalystDescription: string | null;
  category: string;
  status: 'open' | 'closed' | 'suspended' | 'settled' | 'expired';
  /** Reference date for expiry calculation (backtest mode). Defaults to now. */
  referenceDate?: Date;
}

export interface ConditionResult {
  ruleId: string;
  passed: boolean;
  score: number;
  detail: string;
}

export interface EvaluationResult {
  marketId: string;
  marketName: string;
  totalScore: number;
  passed: boolean;
  conditions: ConditionResult[];
  failedConditions: ConditionResult[];
  summary: string;
}

export interface ExitEvaluation {
  ruleId: string;
  triggered: boolean;
  sellFraction: number;
  isStopLoss: boolean;
  reason: string;
}

function evaluatePriceRange(params: PriceRangeParams, price: number): ConditionResult {
  const passed = price >= params.minPrice && price <= params.maxPrice;

  let score = 0;
  if (passed) {
    const midpoint = (params.minPrice + params.maxPrice) / 2;
    const range = params.maxPrice - params.minPrice;
    const distFromMid = Math.abs(price - midpoint);
    score = Math.round(100 * (1 - distFromMid / (range / 2)));
  }

  return {
    ruleId: 'price_range',
    passed,
    score,
    detail: passed
      ? `Prezzo $${price.toFixed(2)} nel range [$${params.minPrice}, $${params.maxPrice}] (score: ${score})`
      : `Prezzo $${price.toFixed(2)} fuori range [$${params.minPrice}, $${params.maxPrice}]`,
  };
}

function evaluateMinVolume(params: MinVolumeParams, totalVolumeUsd: number): ConditionResult {
  const passed = totalVolumeUsd >= params.minVolumeUsd;
  const ratio = totalVolumeUsd / params.minVolumeUsd;
  const score = passed ? Math.min(100, Math.round(ratio * 50)) : 0;

  return {
    ruleId: 'volume_min',
    passed,
    score,
    detail: passed
      ? `Volume $${formatNumber(totalVolumeUsd)} >= minimo $${formatNumber(params.minVolumeUsd)} (score: ${score})`
      : `Volume $${formatNumber(totalVolumeUsd)} < minimo $${formatNumber(params.minVolumeUsd)}`,
  };
}

function evaluateMaxExpiry(params: MaxExpiryParams, expiryDate: string | null, referenceDate?: Date): ConditionResult {
  if (!expiryDate) {
    return {
      ruleId: 'expiry_window',
      passed: false,
      score: 0,
      detail: 'Nessuna data di scadenza impostata',
    };
  }

  const now = referenceDate ?? new Date();
  const expiry = new Date(expiryDate);
  const daysToExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysToExpiry < 0) {
    return {
      ruleId: 'expiry_window',
      passed: false,
      score: 0,
      detail: `Mercato gia scaduto da ${Math.abs(daysToExpiry)} giorni`,
    };
  }

  const passed = daysToExpiry <= params.maxDaysToExpiry;
  const score = passed
    ? Math.round(100 * (1 - daysToExpiry / params.maxDaysToExpiry))
    : 0;

  return {
    ruleId: 'expiry_window',
    passed,
    score,
    detail: passed
      ? `${daysToExpiry} giorni alla scadenza <= ${params.maxDaysToExpiry} max (score: ${score})`
      : `${daysToExpiry} giorni alla scadenza > ${params.maxDaysToExpiry} max`,
  };
}

function evaluateCatalyst(params: CatalystParams, hasCatalyst: boolean, catalystDescription: string | null): ConditionResult {
  const passed = !params.requiresCatalyst || hasCatalyst;
  const score = passed ? (catalystDescription ? 100 : 70) : 0;

  return {
    ruleId: 'catalyst',
    passed,
    score,
    detail: passed
      ? `Catalizzatore presente${catalystDescription ? ': ' + catalystDescription : ''} (score: ${score})`
      : 'Catalizzatore richiesto ma non presente',
  };
}

function evaluateEntryCondition(params: EntryRuleParams, market: MarketSnapshot): ConditionResult {
  switch (params.type) {
    case 'price_range':
      return evaluatePriceRange(params, market.price);
    case 'min_volume':
      return evaluateMinVolume(params, market.totalVolumeUsd);
    case 'max_expiry':
      return evaluateMaxExpiry(params, market.expiryDate, market.referenceDate);
    case 'catalyst':
      return evaluateCatalyst(params, market.hasCatalyst, market.catalystDescription);
  }
}

export function evaluateEntry(strategy: ParsedStrategy, market: MarketSnapshot): EvaluationResult {
  if (market.status !== 'open') {
    return {
      marketId: market.marketId,
      marketName: market.name,
      totalScore: 0,
      passed: false,
      conditions: [],
      failedConditions: [{
        ruleId: 'market_status',
        passed: false,
        score: 0,
        detail: `Mercato non aperto: ${market.status}`,
      }],
      summary: `Mercato non aperto (${market.status})`,
    };
  }

  const conditions: ConditionResult[] = strategy.entryRules.map(
    (rule: EntryRule) => evaluateEntryCondition(rule.params, market),
  );

  const allPassed = conditions.every(c => c.passed);
  const failedConditions = conditions.filter(c => !c.passed);
  const totalScore = allPassed
    ? Math.round(conditions.reduce((sum, c) => sum + c.score, 0) / conditions.length)
    : 0;

  const summary = allPassed
    ? `Tutte le ${conditions.length} condizioni soddisfatte (score: ${totalScore}/100)`
    : `${failedConditions.length}/${conditions.length} condizioni non soddisfatte`;

  return {
    marketId: market.marketId,
    marketName: market.name,
    totalScore,
    passed: allPassed,
    conditions,
    failedConditions,
    summary,
  };
}

export function evaluateExit(exitRules: ExitRule[], currentProfitPct: number): ExitEvaluation[] {
  return exitRules.map(rule => {
    let triggered = false;
    let reason = '';

    if (rule.isStopLoss && rule.lossPct !== null) {
      triggered = currentProfitPct <= rule.lossPct;
      reason = triggered
        ? `Stop loss triggerato: ${currentProfitPct.toFixed(1)}% <= ${rule.lossPct}%`
        : `Stop loss non raggiunto: ${currentProfitPct.toFixed(1)}% > ${rule.lossPct}%`;
    } else if (rule.profitPct !== null) {
      triggered = currentProfitPct >= rule.profitPct;
      reason = triggered
        ? `Take profit raggiunto: ${currentProfitPct.toFixed(1)}% >= +${rule.profitPct}%`
        : `Take profit non raggiunto: ${currentProfitPct.toFixed(1)}% < +${rule.profitPct}%`;
    }

    return {
      ruleId: rule.id,
      triggered,
      sellFraction: rule.sellFraction,
      isStopLoss: rule.isStopLoss,
      reason,
    };
  });
}

export function evaluateComposite(
  results: ConditionResult[],
  logic: 'and' | 'or',
): { passed: boolean; score: number } {
  if (results.length === 0) {
    return { passed: false, score: 0 };
  }

  const passed = logic === 'and'
    ? results.every(r => r.passed)
    : results.some(r => r.passed);

  const score = logic === 'and'
    ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
    : Math.max(...results.map(r => r.score));

  return { passed, score };
}

export function evaluateNot(result: ConditionResult): ConditionResult {
  return {
    ...result,
    passed: !result.passed,
    score: result.passed ? 0 : 100,
    detail: `NOT(${result.detail})`,
  };
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}
