import { TierLevel } from './signals';

export interface EntryRule {
  id: string;
  description: string;
  params: EntryRuleParams;
}

export type EntryRuleParams =
  | PriceRangeParams
  | MinVolumeParams
  | MaxExpiryParams
  | CatalystParams;

export interface PriceRangeParams {
  type: 'price_range';
  minPrice: number;
  maxPrice: number;
}

export interface MinVolumeParams {
  type: 'min_volume';
  minVolumeUsd: number;
}

export interface MaxExpiryParams {
  type: 'max_expiry';
  maxDaysToExpiry: number;
}

export interface CatalystParams {
  type: 'catalyst';
  requiresCatalyst: boolean;
}

export interface ExitRule {
  id: string;
  description: string;
  profitPct: number | null;
  lossPct: number | null;
  sellFraction: number;
  isStopLoss: boolean;
}

export interface BankrollTier {
  tier: TierLevel;
  allocationPct: number;
  description: string;
}

export interface CircuitBreakerConfig {
  lossPct: number;
  action: string;
  description: string;
}

export interface ParsedStrategy {
  strategyId: string;
  code: string;
  name: string;
  area: string;
  entryRules: EntryRule[];
  exitRules: ExitRule[];
  bankrollTiers: BankrollTier[];
  liquidityReservePct: number;
  circuitBreaker: CircuitBreakerConfig;
  maxDrawdown: number;
  maxAllocationPct: number;
  maxConsecutiveLosses: number;
}

export interface StrategyRulesJson {
  entry_rules: RawEntryRule[];
  exit_rules: RawExitRule[];
  bankroll_tiers: Record<string, RawBankrollTier>;
  liquidity_reserve_pct: number;
  circuit_breaker_total: RawCircuitBreaker;
}

interface RawEntryRule {
  id: string;
  condition: string;
  description: string;
  params: Record<string, number | boolean>;
}

interface RawExitRule {
  id: string;
  condition: string;
  action?: string;
  description: string;
  params: { profit_pct?: number; loss_pct?: number; sell_fraction: number };
}

interface RawBankrollTier {
  allocation_pct: number;
  description: string;
}

interface RawCircuitBreaker {
  loss_pct: number;
  action: string;
  description: string;
}

interface RawStrategyRow {
  id: string;
  code: string;
  name: string;
  area: string;
  rules: StrategyRulesJson;
  max_drawdown: number;
  max_allocation_pct: number;
  max_consecutive_losses: number;
}

function parseEntryRule(raw: RawEntryRule): EntryRule {
  const params = raw.params;
  let typedParams: EntryRuleParams;

  if ('min_price' in params && 'max_price' in params) {
    typedParams = {
      type: 'price_range',
      minPrice: params.min_price as number,
      maxPrice: params.max_price as number,
    };
  } else if ('min_volume_usd' in params) {
    typedParams = {
      type: 'min_volume',
      minVolumeUsd: params.min_volume_usd as number,
    };
  } else if ('max_days_to_expiry' in params) {
    typedParams = {
      type: 'max_expiry',
      maxDaysToExpiry: params.max_days_to_expiry as number,
    };
  } else if ('requires_catalyst' in params) {
    typedParams = {
      type: 'catalyst',
      requiresCatalyst: params.requires_catalyst as boolean,
    };
  } else {
    throw new Error(`Unknown entry rule params: ${JSON.stringify(params)}`);
  }

  return {
    id: raw.id,
    description: raw.description,
    params: typedParams,
  };
}

function parseExitRule(raw: RawExitRule): ExitRule {
  const isStopLoss = raw.params.loss_pct !== undefined && raw.params.loss_pct < 0;

  return {
    id: raw.id,
    description: raw.description,
    profitPct: raw.params.profit_pct ?? null,
    lossPct: raw.params.loss_pct ?? null,
    sellFraction: raw.params.sell_fraction,
    isStopLoss,
  };
}

function parseBankrollTiers(tiers: Record<string, RawBankrollTier>): BankrollTier[] {
  const tierMap: Record<string, TierLevel> = {
    tier1: TierLevel.TIER1,
    tier2: TierLevel.TIER2,
    tier3: TierLevel.TIER3,
  };

  return Object.entries(tiers).map(([key, raw]) => ({
    tier: tierMap[key] ?? TierLevel.TIER3,
    allocationPct: raw.allocation_pct,
    description: raw.description,
  }));
}

export function parseStrategy(row: RawStrategyRow): ParsedStrategy {
  const rules = row.rules;

  if (!rules.entry_rules || !rules.exit_rules) {
    throw new Error(`Strategy ${row.code}: missing entry_rules or exit_rules in rules JSON`);
  }

  const entryRules = rules.entry_rules.map(parseEntryRule);
  const exitRules = rules.exit_rules
    .sort((a, b) => {
      const aVal = a.params.profit_pct ?? a.params.loss_pct ?? 0;
      const bVal = b.params.profit_pct ?? b.params.loss_pct ?? 0;
      return aVal - bVal;
    })
    .map(parseExitRule);

  const bankrollTiers = rules.bankroll_tiers
    ? parseBankrollTiers(rules.bankroll_tiers)
    : [];

  const circuitBreaker: CircuitBreakerConfig = rules.circuit_breaker_total
    ? {
        lossPct: rules.circuit_breaker_total.loss_pct,
        action: rules.circuit_breaker_total.action,
        description: rules.circuit_breaker_total.description,
      }
    : { lossPct: -50, action: 'Pausa totale strategia', description: 'Default circuit breaker' };

  return {
    strategyId: row.id,
    code: row.code,
    name: row.name,
    area: row.area,
    entryRules,
    exitRules,
    bankrollTiers,
    liquidityReservePct: rules.liquidity_reserve_pct ?? 20,
    circuitBreaker,
    maxDrawdown: row.max_drawdown,
    maxAllocationPct: row.max_allocation_pct,
    maxConsecutiveLosses: row.max_consecutive_losses,
  };
}

export function validateParsedStrategy(strategy: ParsedStrategy): string[] {
  const errors: string[] = [];

  if (strategy.entryRules.length === 0) {
    errors.push('Nessuna entry rule definita');
  }

  if (strategy.exitRules.length === 0) {
    errors.push('Nessuna exit rule definita');
  }

  const hasStopLoss = strategy.exitRules.some(r => r.isStopLoss);
  if (!hasStopLoss) {
    errors.push('Manca lo stop loss: ogni strategia DEVE avere uno stop loss');
  }

  const totalTierPct = strategy.bankrollTiers.reduce((sum, t) => sum + t.allocationPct, 0);
  if (strategy.bankrollTiers.length > 0 && Math.abs(totalTierPct - 100) > 0.01) {
    errors.push(`La somma dei tier deve essere 100%, attuale: ${totalTierPct}%`);
  }

  if (strategy.liquidityReservePct < 0 || strategy.liquidityReservePct > 50) {
    errors.push(`Riserva di liquidita fuori range: ${strategy.liquidityReservePct}%`);
  }

  if (strategy.circuitBreaker.lossPct >= 0) {
    errors.push(`Circuit breaker loss deve essere negativo: ${strategy.circuitBreaker.lossPct}`);
  }

  return errors;
}
