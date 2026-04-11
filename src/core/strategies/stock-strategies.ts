/**
 * Stock Strategies — Seed Data
 *
 * 6 strategies for US + EU equity markets (Finnhub data, IBKR execution later):
 * - 3 conservative (intraday mean reversion, swing dip buying, earnings momentum)
 * - 3 moderate (gap fade, breakout swing, sector rotation)
 *
 * Filosofia: speculativi ma protetti.
 * Ogni strategia ha SL obbligatorio, sizing max 3-5%, circuit breaker.
 * Commissioni incluse nel calcolo PnL (regola sacra).
 */

import { StrategyRulesJson } from '../engine/dsl-parser';

export interface StockStrategySeed {
  code: string;
  name: string;
  description: string;
  area: 'stocks';
  risk_level: 'conservative' | 'moderate';
  rules: StrategyRulesJson;
  rules_readable: string;
  max_drawdown: number;
  max_allocation_pct: number;
  max_consecutive_losses: number;
  sizing_method: 'fixed_percentage' | 'volatility_adjusted';
  sizing_value: number;
  tickers: string[];
  tick_interval_minutes: number;
}

// ============================================================================
// CONSERVATIVE (3) — Low risk, tight stops, liquid large-cap
// ============================================================================

/**
 * ST-C01: Intraday Mean Reversion
 * Compra su dip intraday (-1% a -3%) in bassa volatilita.
 * Large cap US ad alta liquidita. TP +2%, SL -1.5%.
 * Ratio 1.33:1. Alta frequenza, trade piccoli.
 */
const ST_C01: StockStrategySeed = {
  code: 'ST-C01',
  name: 'Intraday Mean Reversion',
  description: 'Compra su dip intraday di large cap US. TP +3%, SL -2%. Ratio 1.5:1.',
  area: 'stocks',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'dip_intraday', condition: 'price_change_pct', description: 'Dip intraday (-0.5% a -4%)', params: { min_change_pct: -4, max_change_pct: -0.5 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume minimo $5M', params: { min_volume_usd: 5_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +3%', params: { profit_pct: 3, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -2%', params: { loss_pct: -2, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 50, description: 'Mega cap (AAPL, MSFT, GOOGL)' },
      tier2: { allocation_pct: 35, description: 'Large cap growth' },
      tier3: { allocation_pct: 15, description: 'Large cap value' },
    },
    liquidity_reserve_pct: 30,
    circuit_breaker_total: { loss_pct: -8, action: 'Pausa strategia', description: 'Stop se drawdown > 8%' },
  },
  rules_readable: 'QUANDO: price_change tra -4% e -0.5%\nE: volume > $5M\nALLORA: ENTRA long\nESCI_SE: profitto > 3% OPPURE perdita > 2%',
  max_drawdown: 8,
  max_allocation_pct: 4,
  max_consecutive_losses: 6,
  sizing_method: 'fixed_percentage',
  sizing_value: 3,
  tickers: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA'],
  tick_interval_minutes: 5,
};

/**
 * ST-C02: Swing Dip Buyer
 * Compra dip piu' profondi (-2% a -5%) su blue chip.
 * Holding period: giorni. TP +3.5%, SL -2%.
 * Ratio 1.75:1. Meno trade, win rate piu' alto.
 */
const ST_C02: StockStrategySeed = {
  code: 'ST-C02',
  name: 'Swing Dip Buyer',
  description: 'Accumula su dip profondi di blue chip US. Swing trade 2-5 giorni. TP +3.5%, SL -2%.',
  area: 'stocks',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'dip', condition: 'price_change_pct', description: 'Dip profondo (-2% a -5%)', params: { min_change_pct: -5, max_change_pct: -2 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume minimo $30M', params: { min_volume_usd: 30_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +3.5%', params: { profit_pct: 3.5, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -2%', params: { loss_pct: -2, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 55, description: 'Blue chip (AAPL, MSFT, GOOGL)' },
      tier2: { allocation_pct: 30, description: 'Large growth (NVDA, TSLA)' },
      tier3: { allocation_pct: 15, description: 'EU blue chip' },
    },
    liquidity_reserve_pct: 30,
    circuit_breaker_total: { loss_pct: -8, action: 'Pausa strategia', description: 'Stop se drawdown > 8%' },
  },
  rules_readable: 'QUANDO: price_change tra -5% e -2%\nE: volume > $30M\nALLORA: ENTRA long (swing)\nESCI_SE: profitto > 3.5% OPPURE perdita > 2%',
  max_drawdown: 8,
  max_allocation_pct: 5,
  max_consecutive_losses: 5,
  sizing_method: 'fixed_percentage',
  sizing_value: 4,
  tickers: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'SAP.DE'],
  tick_interval_minutes: 5,
};

/**
 * ST-C03: Earnings Momentum
 * Compra su momentum positivo (+1% a +4%) con volume alto.
 * Post-earnings drift: le azioni tendono a continuare nella direzione del gap.
 * TP +3%, SL -1.5%. Ratio 2:1.
 */
const ST_C03: StockStrategySeed = {
  code: 'ST-C03',
  name: 'Earnings Momentum',
  description: 'Segue momentum positivo su large cap. TP +3.5%, SL -2%. Ratio 1.75:1.',
  area: 'stocks',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'momentum', condition: 'price_change_pct', description: 'Momentum positivo (+0.5% a +5%)', params: { min_change_pct: 0.5, max_change_pct: 5 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume > $5M', params: { min_volume_usd: 5_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +3.5%', params: { profit_pct: 3.5, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -2%', params: { loss_pct: -2, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 45, description: 'Strong momentum' },
      tier2: { allocation_pct: 35, description: 'Moderate momentum' },
      tier3: { allocation_pct: 20, description: 'Speculative momentum' },
    },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -8, action: 'Pausa strategia', description: 'Stop se drawdown > 8%' },
  },
  rules_readable: 'QUANDO: price_change tra +0.5% e +5%\nE: volume > $5M\nALLORA: ENTRA long (momentum)\nESCI_SE: profitto > 3.5% OPPURE perdita > 2%',
  max_drawdown: 8,
  max_allocation_pct: 4,
  max_consecutive_losses: 5,
  sizing_method: 'fixed_percentage',
  sizing_value: 3,
  tickers: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA'],
  tick_interval_minutes: 5,
};

// ============================================================================
// MODERATE (3) — Balanced risk/reward, swing + breakout
// ============================================================================

/**
 * ST-M01: Gap Fade
 * Compra quando il gap down e' eccessivo (-2% a -6%).
 * Gaps tendono a chiudersi entro la sessione. TP +3%, SL -2.5%.
 * Ratio 1.2:1 ma win rate alto.
 */
const ST_M01: StockStrategySeed = {
  code: 'ST-M01',
  name: 'Gap Fade',
  description: 'Compra gap down su large cap. TP +3.5%, SL -2%. Ratio 1.75:1.',
  area: 'stocks',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'gap_down', condition: 'price_change_pct', description: 'Gap down (-1% a -6%)', params: { min_change_pct: -6, max_change_pct: -1 } },
      { id: 'volume_surge', condition: 'min_volume', description: 'Volume > $5M', params: { min_volume_usd: 5_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +3.5%', params: { profit_pct: 3.5, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -2%', params: { loss_pct: -2, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 50, description: 'Blue chip gap' },
      tier2: { allocation_pct: 35, description: 'Large cap gap' },
      tier3: { allocation_pct: 15, description: 'Speculative gap' },
    },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -10, action: 'Pausa strategia', description: 'Stop se drawdown > 10%' },
  },
  rules_readable: 'QUANDO: price_change tra -6% e -1%\nE: volume > $5M\nALLORA: ENTRA long (gap fade)\nESCI_SE: profitto > 3.5% OPPURE perdita > 2%',
  max_drawdown: 10,
  max_allocation_pct: 5,
  max_consecutive_losses: 4,
  sizing_method: 'volatility_adjusted',
  sizing_value: 4,
  tickers: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA'],
  tick_interval_minutes: 5,
};

/**
 * ST-M02: Breakout Swing
 * Entra su breakout con momentum forte (+2% a +8%) e alta volatilita.
 * Swing 3-7 giorni. TP +5%, SL -3%. Ratio 1.67:1.
 */
const ST_M02: StockStrategySeed = {
  code: 'ST-M02',
  name: 'Breakout Swing',
  description: 'Segue breakout rialzisti. Swing 3-7 giorni. TP +4%, SL -2.5%. Ratio 1.6:1.',
  area: 'stocks',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'breakout', condition: 'price_change_pct', description: 'Breakout (+1% a +8%)', params: { min_change_pct: 1, max_change_pct: 8 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume > $5M', params: { min_volume_usd: 5_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +4%', params: { profit_pct: 4, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -2.5%', params: { loss_pct: -2.5, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 40, description: 'Breakout confermato' },
      tier2: { allocation_pct: 35, description: 'Breakout probabile' },
      tier3: { allocation_pct: 25, description: 'Speculativo' },
    },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -12, action: 'Pausa strategia', description: 'Stop se drawdown > 12%' },
  },
  rules_readable: 'QUANDO: price_change tra +1% e +8%\nE: volume > $5M\nALLORA: ENTRA long (swing breakout)\nESCI_SE: profitto > 4% OPPURE perdita > 2.5%',
  max_drawdown: 12,
  max_allocation_pct: 5,
  max_consecutive_losses: 4,
  sizing_method: 'volatility_adjusted',
  sizing_value: 4,
  tickers: ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'TSLA', 'AMZN', 'META'],
  tick_interval_minutes: 5,
};

/**
 * ST-M03: EU Large Cap Value
 * Compra dip su blue chip europee. Mercati EU meno volatili = dip piu' significativi.
 * TP +2.5%, SL -2%. Ratio 1.25:1 con win rate alto.
 */
const ST_M03: StockStrategySeed = {
  code: 'ST-M03',
  name: 'EU Large Cap Value',
  description: 'Compra dip su blue chip EU + US value. TP +3%, SL -2%. Ratio 1.5:1.',
  area: 'stocks',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'dip', condition: 'price_change_pct', description: 'Dip (-0.5% a -5%)', params: { min_change_pct: -5, max_change_pct: -0.5 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume minimo $2M', params: { min_volume_usd: 2_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +3%', params: { profit_pct: 3, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -2%', params: { loss_pct: -2, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 50, description: 'Blue chip EU (SAP, ASML)' },
      tier2: { allocation_pct: 35, description: 'Large cap EU' },
      tier3: { allocation_pct: 15, description: 'US value' },
    },
    liquidity_reserve_pct: 30,
    circuit_breaker_total: { loss_pct: -10, action: 'Pausa strategia', description: 'Stop se drawdown > 10%' },
  },
  rules_readable: 'QUANDO: price_change tra -5% e -0.5%\nE: volume > $2M\nALLORA: ENTRA long (value dip)\nESCI_SE: profitto > 3% OPPURE perdita > 2%',
  max_drawdown: 10,
  max_allocation_pct: 4,
  max_consecutive_losses: 5,
  sizing_method: 'fixed_percentage',
  sizing_value: 3,
  tickers: ['SAP.DE', 'ASML.AS', 'SIE.DE', 'AAPL', 'MSFT'],
  tick_interval_minutes: 5,
};

// ============================================================================
// Export
// ============================================================================

export const STOCK_STRATEGIES: StockStrategySeed[] = [
  ST_C01, ST_C02, ST_C03,
  ST_M01, ST_M02, ST_M03,
];

export const STOCK_STRATEGY_MAP: Record<string, StockStrategySeed> = Object.fromEntries(
  STOCK_STRATEGIES.map((s) => [s.code, s]),
);
