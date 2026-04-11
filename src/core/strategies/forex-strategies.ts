/**
 * Forex Strategies — Seed Data
 *
 * 6 strategies for major forex pairs (Twelve Data data, MT5 execution later):
 * - 3 conservative (london session dip, swing mean reversion, range scalper)
 * - 3 moderate (breakout momentum, news fade, cross pairs swing)
 *
 * Filosofia: speculativi ma protetti.
 * Ogni strategia ha SL obbligatorio, sizing max 3-4%, circuit breaker.
 * Commissioni incluse nel calcolo PnL (regola sacra).
 *
 * Forex 24/5: domenica 22:00 UTC → venerdi 22:00 UTC.
 * Tick interval: 5 minuti.
 */

import { StrategyRulesJson } from '../engine/dsl-parser';

export interface ForexStrategySeed {
  code: string;
  name: string;
  description: string;
  area: 'forex';
  risk_level: 'conservative' | 'moderate';
  rules: StrategyRulesJson;
  rules_readable: string;
  max_drawdown: number;
  max_allocation_pct: number;
  max_consecutive_losses: number;
  sizing_method: 'fixed_percentage' | 'volatility_adjusted';
  sizing_value: number;
  pairs: string[];
  tick_interval_minutes: number;
}

// ============================================================================
// CONSERVATIVE (3) — Low risk, tight stops, major pairs only
// ============================================================================

/**
 * FX-C01: London Session Dip Buyer
 * Compra dip durante la sessione di Londra (08:00-17:00 UTC), la piu' liquida.
 * Major pairs con spread stretto. TP +1.5%, SL -1%.
 * Ratio 1.5:1. Alta frequenza intraday.
 */
const FX_C01: ForexStrategySeed = {
  code: 'FX-C01',
  name: 'London Session Dip Buyer',
  description: 'Compra dip su major pairs durante sessione Londra. TP +1.5%, SL -1%. Ratio 1.5:1.',
  area: 'forex',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'dip_intraday', condition: 'price_change_pct', description: 'Dip intraday (-0.2% a -3%)', params: { min_change_pct: -3, max_change_pct: -0.2 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume minimo $500K', params: { min_volume_usd: 500_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +2%', params: { profit_pct: 2, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -1.2%', params: { loss_pct: -1.2, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 50, description: 'EUR pairs (EURUSD, EURGBP)' },
      tier2: { allocation_pct: 35, description: 'GBP/JPY majors' },
      tier3: { allocation_pct: 15, description: 'Commodity currencies' },
    },
    liquidity_reserve_pct: 30,
    circuit_breaker_total: { loss_pct: -8, action: 'Pausa strategia', description: 'Stop se drawdown > 8%' },
  },
  rules_readable: 'QUANDO: price_change tra -3% e -0.2%\nE: volume > $500K\nALLORA: ENTRA long\nESCI_SE: profitto > 2% OPPURE perdita > 1.2%',
  max_drawdown: 8,
  max_allocation_pct: 4,
  max_consecutive_losses: 6,
  sizing_method: 'fixed_percentage',
  sizing_value: 3,
  pairs: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD'],
  tick_interval_minutes: 5,
};

/**
 * FX-C02: Swing Mean Reversion
 * Compra su deviazioni piu' ampie (-0.5% a -2%) su major pairs.
 * Holding period: ore/giorni. TP +2%, SL -1.2%.
 * Ratio 1.67:1. Meno trade, precision piu' alta.
 */
const FX_C02: ForexStrategySeed = {
  code: 'FX-C02',
  name: 'Swing Mean Reversion',
  description: 'Mean reversion su major pairs con dip significativo. TP +2%, SL -1.2%. Ratio 1.67:1.',
  area: 'forex',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'dip', condition: 'price_change_pct', description: 'Dip profondo (-0.3% a -4%)', params: { min_change_pct: -4, max_change_pct: -0.3 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume minimo $500K', params: { min_volume_usd: 500_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +2.5%', params: { profit_pct: 2.5, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -1.5%', params: { loss_pct: -1.5, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 55, description: 'Major pairs (EURUSD, GBPUSD)' },
      tier2: { allocation_pct: 30, description: 'JPY crosses' },
      tier3: { allocation_pct: 15, description: 'AUD/NZD pairs' },
    },
    liquidity_reserve_pct: 30,
    circuit_breaker_total: { loss_pct: -8, action: 'Pausa strategia', description: 'Stop se drawdown > 8%' },
  },
  rules_readable: 'QUANDO: price_change tra -4% e -0.3%\nE: volume > $500K\nALLORA: ENTRA long (swing)\nESCI_SE: profitto > 2.5% OPPURE perdita > 1.5%',
  max_drawdown: 8,
  max_allocation_pct: 4,
  max_consecutive_losses: 5,
  sizing_method: 'fixed_percentage',
  sizing_value: 3,
  pairs: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'],
  tick_interval_minutes: 5,
};

/**
 * FX-C03: Range Scalper
 * Scalpa in range sui major pairs quando il mercato e' laterale.
 * Entry su piccoli dip (-0.1% a -0.8%), uscita rapida.
 * TP +0.8%, SL -0.5%. Ratio 1.6:1 con win rate alto.
 */
const FX_C03: ForexStrategySeed = {
  code: 'FX-C03',
  name: 'Range Scalper',
  description: 'Scalping in range su major pairs. TP +0.8%, SL -0.5%. Ratio 1.6:1.',
  area: 'forex',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'small_dip', condition: 'price_change_pct', description: 'Piccolo dip (-0.1% a -2%)', params: { min_change_pct: -2, max_change_pct: -0.1 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume minimo $300K', params: { min_volume_usd: 300_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +1.5%', params: { profit_pct: 1.5, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -0.8%', params: { loss_pct: -0.8, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 50, description: 'EURUSD, GBPUSD (spread piu stretto)' },
      tier2: { allocation_pct: 35, description: 'USDJPY, USDCHF' },
      tier3: { allocation_pct: 15, description: 'AUDUSD, NZDUSD' },
    },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -7, action: 'Pausa strategia', description: 'Stop se drawdown > 7%' },
  },
  rules_readable: 'QUANDO: price_change tra -2% e -0.1%\nE: volume > $300K\nALLORA: ENTRA long (scalp)\nESCI_SE: profitto > 1.5% OPPURE perdita > 0.8%',
  max_drawdown: 7,
  max_allocation_pct: 3,
  max_consecutive_losses: 8,
  sizing_method: 'fixed_percentage',
  sizing_value: 2,
  pairs: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD'],
  tick_interval_minutes: 5,
};

// ============================================================================
// MODERATE (3) — Balanced risk/reward, breakout + momentum
// ============================================================================

/**
 * FX-M01: Breakout Momentum
 * Entra su breakout con momentum forte (+0.3% a +2%) su sessione London/NY overlap.
 * Periodo piu volatile della giornata (13:00-17:00 UTC).
 * TP +2%, SL -1.2%. Ratio 1.67:1.
 */
const FX_M01: ForexStrategySeed = {
  code: 'FX-M01',
  name: 'Breakout Momentum',
  description: 'Segue breakout rialzisti su major pairs. TP +2%, SL -1.2%. Ratio 1.67:1.',
  area: 'forex',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'breakout', condition: 'price_change_pct', description: 'Breakout (+0.2% a +4%)', params: { min_change_pct: 0.2, max_change_pct: 4 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume > $500K', params: { min_volume_usd: 500_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +2.5%', params: { profit_pct: 2.5, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -1.5%', params: { loss_pct: -1.5, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 45, description: 'Breakout confermato su major' },
      tier2: { allocation_pct: 35, description: 'Breakout su cross' },
      tier3: { allocation_pct: 20, description: 'Breakout speculativo' },
    },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -9, action: 'Pausa strategia', description: 'Stop se drawdown > 9%' },
  },
  rules_readable: 'QUANDO: price_change tra +0.2% e +4%\nE: volume > $500K\nALLORA: ENTRA long (breakout)\nESCI_SE: profitto > 2.5% OPPURE perdita > 1.5%',
  max_drawdown: 9,
  max_allocation_pct: 5,
  max_consecutive_losses: 5,
  sizing_method: 'volatility_adjusted',
  sizing_value: 4,
  pairs: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'NZDUSD'],
  tick_interval_minutes: 5,
};

/**
 * FX-M02: News Fade
 * Compra reazioni eccessive a notizie (-0.8% a -3%) su major pairs.
 * Il mercato forex tende a sovra-reagire e poi mean-revertire.
 * TP +1.8%, SL -1%. Ratio 1.8:1.
 */
const FX_M02: ForexStrategySeed = {
  code: 'FX-M02',
  name: 'News Fade',
  description: 'Compra reazione eccessiva su major pairs. TP +1.8%, SL -1%. Ratio 1.8:1.',
  area: 'forex',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'news_dip', condition: 'price_change_pct', description: 'Dip da news (-0.8% a -3%)', params: { min_change_pct: -3, max_change_pct: -0.8 } },
      { id: 'volume_surge', condition: 'min_volume', description: 'Volume > $2M', params: { min_volume_usd: 2_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +1.8%', params: { profit_pct: 1.8, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -1%', params: { loss_pct: -1, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 50, description: 'Major pairs (reazione eccessiva)' },
      tier2: { allocation_pct: 35, description: 'Cross pairs con dip' },
      tier3: { allocation_pct: 15, description: 'Commodity currencies' },
    },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -10, action: 'Pausa strategia', description: 'Stop se drawdown > 10%' },
  },
  rules_readable: 'QUANDO: price_change tra -3% e -0.8%\nE: volume > $2M\nALLORA: ENTRA long (news fade)\nESCI_SE: profitto > 1.8% OPPURE perdita > 1%',
  max_drawdown: 10,
  max_allocation_pct: 5,
  max_consecutive_losses: 4,
  sizing_method: 'volatility_adjusted',
  sizing_value: 4,
  pairs: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD'],
  tick_interval_minutes: 5,
};

/**
 * FX-M03: Cross Pairs Swing
 * Swing trading su cross pairs (EURGBP, EURJPY, GBPJPY).
 * I cross hanno volatilita piu alta = opportunita piu grandi.
 * TP +2.5%, SL -1.5%. Ratio 1.67:1.
 */
const FX_M03: ForexStrategySeed = {
  code: 'FX-M03',
  name: 'Cross Pairs Swing',
  description: 'Swing trade su cross pairs con dip. TP +2.5%, SL -1.5%. Ratio 1.67:1.',
  area: 'forex',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'dip', condition: 'price_change_pct', description: 'Dip su cross (-0.5% a -2.5%)', params: { min_change_pct: -2.5, max_change_pct: -0.5 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume minimo $500K', params: { min_volume_usd: 500_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +2.5%', params: { profit_pct: 2.5, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -1.5%', params: { loss_pct: -1.5, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 45, description: 'EUR cross (EURGBP, EURJPY)' },
      tier2: { allocation_pct: 35, description: 'GBP cross (GBPJPY)' },
      tier3: { allocation_pct: 20, description: 'AUD/JPY cross' },
    },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -10, action: 'Pausa strategia', description: 'Stop se drawdown > 10%' },
  },
  rules_readable: 'QUANDO: price_change tra -2.5% e -0.5%\nE: volume > $500K\nALLORA: ENTRA long (swing cross)\nESCI_SE: profitto > 2.5% OPPURE perdita > 1.5%',
  max_drawdown: 10,
  max_allocation_pct: 4,
  max_consecutive_losses: 5,
  sizing_method: 'fixed_percentage',
  sizing_value: 3,
  pairs: ['EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'EURUSD', 'GBPUSD'],
  tick_interval_minutes: 5,
};

// ============================================================================
// Export
// ============================================================================

export const FOREX_STRATEGIES: ForexStrategySeed[] = [
  FX_C01, FX_C02, FX_C03,
  FX_M01, FX_M02, FX_M03,
];

export const FOREX_STRATEGY_MAP: Record<string, ForexStrategySeed> = Object.fromEntries(
  FOREX_STRATEGIES.map((s) => [s.code, s]),
);
