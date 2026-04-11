/**
 * Betfair Strategies — Seed Data
 *
 * 6 strategies for exchange betting markets (Betfair):
 * - 3 conservative (Back Favorite, Lay High Odds, Value Back)
 * - 3 moderate (Odds Drift, Contrarian Lay, In-Play Momentum)
 *
 * Filosofia: speculativi ma protetti.
 * Commissione Betfair: 5% su profitti netti — gia' inclusa nel motore.
 * Quote espresse come back odds (1.01 - 1000).
 * Volume in GBP matched.
 */

import { StrategyRulesJson } from '../engine/dsl-parser';

export interface BetfairStrategySeed {
  code: string;
  name: string;
  description: string;
  area: 'exchange_betting';
  risk_level: 'conservative' | 'moderate';
  rules: StrategyRulesJson;
  rules_readable: string;
  max_drawdown: number;
  max_allocation_pct: number;
  max_consecutive_losses: number;
  sizing_method: 'fixed_percentage' | 'volatility_adjusted';
  sizing_value: number;
  event_types: string[];
  tick_interval_minutes: number;
}

// ============================================================================
// CONSERVATIVE (3) — Low risk, favorites, high liquidity
// ============================================================================

/**
 * BF-C01: Back Favorite
 * Back su favoriti con odds basse (1.2 - 2.5) e alta liquidita'.
 * Win rate alto, profitti piccoli. TP +4%, SL -2%. Ratio 2:1.
 */
const BF_C01: BetfairStrategySeed = {
  code: 'BF-C01',
  name: 'Back Favorite',
  description: 'Back su favoriti con odds 1.2-2.5 e alta liquidita. Win rate alto, profitti costanti.',
  area: 'exchange_betting',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'odds_dip', condition: 'price_change_pct', description: 'Odds in calo (-0.5% a -5%)', params: { min_change_pct: -5, max_change_pct: -0.5 } },
      { id: 'high_liquidity', condition: 'min_volume', description: 'Matched > £500', params: { min_volume_usd: 500 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +3%', params: { profit_pct: 3, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -2%', params: { loss_pct: -2, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 50, description: 'Favoriti forti (odds < 1.8)' },
      tier2: { allocation_pct: 35, description: 'Favoriti moderati (odds 1.8-2.2)' },
      tier3: { allocation_pct: 15, description: 'Favoriti deboli (odds 2.2-2.5)' },
    },
    liquidity_reserve_pct: 30,
    circuit_breaker_total: { loss_pct: -8, action: 'Pausa strategia', description: 'Stop se drawdown > 8%' },
  },
  rules_readable: 'QUANDO: odds_back tra 1.2 e 2.5\nE: matched > £5,000\nALLORA: BACK favorito\nESCI_SE: profitto > 4% OPPURE perdita > 2%',
  max_drawdown: 8,
  max_allocation_pct: 5,
  max_consecutive_losses: 6,
  sizing_method: 'fixed_percentage',
  sizing_value: 3,
  event_types: ['1', '2', '7522'], // Soccer, Tennis, Basketball
  tick_interval_minutes: 5,
};

/**
 * BF-C02: Lay High Odds
 * Lay su outsider con odds alte (6.0 - 20.0).
 * Alta probabilita' di vincere il lay. TP +3%, SL -3%. Ratio 1:1 ma WR 70%+.
 */
const BF_C02: BetfairStrategySeed = {
  code: 'BF-C02',
  name: 'Lay High Odds',
  description: 'Lay su outsider con odds 6-20. Alta probabilita di vincere. TP +3%, SL -3%.',
  area: 'exchange_betting',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'odds_drift_up', condition: 'price_change_pct', description: 'Odds in salita (+0.5% a +5%)', params: { min_change_pct: 0.5, max_change_pct: 5 } },
      { id: 'liquidity', condition: 'min_volume', description: 'Matched > £500', params: { min_volume_usd: 500 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +3.5%', params: { profit_pct: 3.5, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -2%', params: { loss_pct: -2, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 45, description: 'Outsider chiari (odds > 10)' },
      tier2: { allocation_pct: 35, description: 'Outsider moderati (odds 6-10)' },
      tier3: { allocation_pct: 20, description: 'Lay speculativi' },
    },
    liquidity_reserve_pct: 35,
    circuit_breaker_total: { loss_pct: -10, action: 'Pausa strategia', description: 'Stop se drawdown > 10%' },
  },
  rules_readable: 'QUANDO: odds tra 6.0 e 20.0\nE: matched > £3,000\nALLORA: LAY outsider\nESCI_SE: profitto > 3% OPPURE perdita > 3%',
  max_drawdown: 10,
  max_allocation_pct: 4,
  max_consecutive_losses: 5,
  sizing_method: 'fixed_percentage',
  sizing_value: 2,
  event_types: ['1', '7'], // Soccer, Horse Racing
  tick_interval_minutes: 5,
};

/**
 * BF-C03: Value Back
 * Back su selezioni con odds tra 2.5 e 5.0 (range medio) e volume alto.
 * Cerca valore dove le odds sono "giuste". TP +5%, SL -2.5%. Ratio 2:1.
 */
const BF_C03: BetfairStrategySeed = {
  code: 'BF-C03',
  name: 'Value Back',
  description: 'Back su odds medie (2.5-5.0) con alto volume. Cerca valore nel mercato. TP +5%, SL -2.5%.',
  area: 'exchange_betting',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'dip', condition: 'price_change_pct', description: 'Odds in calo (-0.5% a -6%)', params: { min_change_pct: -6, max_change_pct: -0.5 } },
      { id: 'volume', condition: 'min_volume', description: 'Matched > £500', params: { min_volume_usd: 500 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +3%', params: { profit_pct: 3, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -2%', params: { loss_pct: -2, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 50, description: 'Value chiaro' },
      tier2: { allocation_pct: 35, description: 'Value probabile' },
      tier3: { allocation_pct: 15, description: 'Speculativo' },
    },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -10, action: 'Pausa strategia', description: 'Stop se drawdown > 10%' },
  },
  rules_readable: 'QUANDO: odds tra 2.5 e 5.0\nE: matched > £8,000\nALLORA: BACK valore\nESCI_SE: profitto > 5% OPPURE perdita > 2.5%',
  max_drawdown: 10,
  max_allocation_pct: 5,
  max_consecutive_losses: 5,
  sizing_method: 'fixed_percentage',
  sizing_value: 3,
  event_types: ['1', '2', '7522'], // Soccer, Tennis, Basketball
  tick_interval_minutes: 5,
};

// ============================================================================
// MODERATE (3) — Balanced risk, odds movement, in-play
// ============================================================================

/**
 * BF-M01: Odds Drift Back
 * Back quando le odds si accorciano (drift negativo = favorito si rafforza).
 * Cerca odds in calo (-2% a -8%) con liquidita'. TP +4%, SL -2.5%.
 */
const BF_M01: BetfairStrategySeed = {
  code: 'BF-M01',
  name: 'Odds Drift Back',
  description: 'Back quando le odds calano (favorito si rafforza). TP +4%, SL -2.5%.',
  area: 'exchange_betting',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'odds_shortening', condition: 'price_change_pct', description: 'Odds in calo (-0.5% a -8%)', params: { min_change_pct: -8, max_change_pct: -0.5 } },
      { id: 'liquid_market', condition: 'min_volume', description: 'Matched > £500', params: { min_volume_usd: 500 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +4%', params: { profit_pct: 4, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -2.5%', params: { loss_pct: -2.5, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 45, description: 'Drift forte' },
      tier2: { allocation_pct: 35, description: 'Drift moderato' },
      tier3: { allocation_pct: 20, description: 'Drift leggero' },
    },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -12, action: 'Pausa strategia', description: 'Stop se drawdown > 12%' },
  },
  rules_readable: 'QUANDO: odds_change tra -8% e -1%\nE: matched > £5,000\nALLORA: BACK (drift)\nESCI_SE: profitto > 4% OPPURE perdita > 2.5%',
  max_drawdown: 12,
  max_allocation_pct: 5,
  max_consecutive_losses: 4,
  sizing_method: 'volatility_adjusted',
  sizing_value: 4,
  event_types: ['1', '2', '7'], // Soccer, Tennis, Horse Racing
  tick_interval_minutes: 5,
};

/**
 * BF-M02: Contrarian Lay
 * Lay su favoriti sopravvalutati (odds 1.5-3.0) quando le odds salgono.
 * Odds in aumento = il mercato dubita del favorito. TP +3.5%, SL -3%.
 */
const BF_M02: BetfairStrategySeed = {
  code: 'BF-M02',
  name: 'Contrarian Lay',
  description: 'Lay su favoriti con odds in aumento (mercato dubita). TP +3.5%, SL -3%.',
  area: 'exchange_betting',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'odds_drifting', condition: 'price_change_pct', description: 'Odds in aumento (+0.5% a +6%)', params: { min_change_pct: 0.5, max_change_pct: 6 } },
      { id: 'volume', condition: 'min_volume', description: 'Matched > £500', params: { min_volume_usd: 500 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +3.5%', params: { profit_pct: 3.5, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -3%', params: { loss_pct: -3, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 40, description: 'Lay forte' },
      tier2: { allocation_pct: 35, description: 'Lay moderato' },
      tier3: { allocation_pct: 25, description: 'Lay speculativo' },
    },
    liquidity_reserve_pct: 30,
    circuit_breaker_total: { loss_pct: -12, action: 'Pausa strategia', description: 'Stop se drawdown > 12%' },
  },
  rules_readable: 'QUANDO: odds tra 1.5 e 3.0\nE: odds_change tra +1% e +8%\nE: matched > £5,000\nALLORA: LAY (contrarian)\nESCI_SE: profitto > 3.5% OPPURE perdita > 3%',
  max_drawdown: 12,
  max_allocation_pct: 4,
  max_consecutive_losses: 4,
  sizing_method: 'volatility_adjusted',
  sizing_value: 3,
  event_types: ['1', '2'], // Soccer, Tennis
  tick_interval_minutes: 5,
};

/**
 * BF-M03: In-Play Momentum
 * Back su selezioni con odds basse (1.1-2.0) e movimento forte.
 * L'in-play amplifica i movimenti. TP +3%, SL -2%. Ratio 1.5:1.
 */
const BF_M03: BetfairStrategySeed = {
  code: 'BF-M03',
  name: 'In-Play Momentum',
  description: 'Back in-play su odds basse con momentum. Movimento amplificato dal live. TP +3%, SL -2%.',
  area: 'exchange_betting',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'momentum', condition: 'price_change_pct', description: 'Odds in calo (-0.5% a -7%)', params: { min_change_pct: -7, max_change_pct: -0.5 } },
      { id: 'volume', condition: 'min_volume', description: 'Matched > £500', params: { min_volume_usd: 500 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +3%', params: { profit_pct: 3, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -2%', params: { loss_pct: -2, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 45, description: 'Momentum forte' },
      tier2: { allocation_pct: 35, description: 'Momentum moderato' },
      tier3: { allocation_pct: 20, description: 'Speculativo' },
    },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -10, action: 'Pausa strategia', description: 'Stop se drawdown > 10%' },
  },
  rules_readable: 'QUANDO: odds tra 1.1 e 2.0\nE: odds_change tra -10% e -2%\nE: matched > £3,000\nALLORA: BACK (momentum)\nESCI_SE: profitto > 3% OPPURE perdita > 2%',
  max_drawdown: 10,
  max_allocation_pct: 4,
  max_consecutive_losses: 5,
  sizing_method: 'volatility_adjusted',
  sizing_value: 3,
  event_types: ['1', '2', '7522'], // Soccer, Tennis, Basketball
  tick_interval_minutes: 5,
};

// ============================================================================
// Export
// ============================================================================

export const BETFAIR_STRATEGIES: BetfairStrategySeed[] = [
  BF_C01, BF_C02, BF_C03,
  BF_M01, BF_M02, BF_M03,
];

export const BETFAIR_STRATEGY_MAP: Record<string, BetfairStrategySeed> = Object.fromEntries(
  BETFAIR_STRATEGIES.map((s) => [s.code, s]),
);
