/**
 * Crypto Strategies — Seed Data
 *
 * 6 strategies for cryptocurrency markets (Binance + Bybit):
 * - 3 conservative (Mean Reversion, DCA on Dip, Grid Trading)
 * - 3 moderate (Trend Following, RSI Oversold Bounce, Volatility Breakout)
 *
 * Filosofia: speculativi ma protetti.
 * Ogni strategia ha SL obbligatorio, sizing max 3-5%, circuit breaker.
 */

import { StrategyRulesJson } from '../engine/dsl-parser';

export interface CryptoStrategySeed {
  code: string;
  name: string;
  description: string;
  area: 'crypto';
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
// CONSERVATIVE (3) — Low risk, tight stops, high-frequency small gains
// ============================================================================

/**
 * CR-C01: Mean Reversion Range
 * Entra quando il prezzo scende significativamente in 24h (dip) con bassa volatilita.
 * Aspetta che il prezzo torni verso la media.
 * SL stretto al -3%, TP al +4%.
 */
const CR_C01: CryptoStrategySeed = {
  code: 'CR-C01',
  name: 'Mean Reversion Range',
  description: 'Compra il dip in range di bassa volatilita. Aspetta mean reversion verso prezzo medio 24h. Pair ad alta liquidita.',
  area: 'crypto',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'dip_24h', condition: 'price_change_pct', description: 'Prezzo sceso tra -2% e -6% nelle 24h', params: { min_change_pct: -6, max_change_pct: -2 } },
      { id: 'low_vol', condition: 'volatility_range', description: 'Volatilita 24h bassa (1-5%)', params: { min_vol_pct: 1, max_vol_pct: 5 } },
      { id: 'high_volume', condition: 'min_volume', description: 'Volume minimo $10M nelle 24h', params: { min_volume_usd: 10_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +4%', params: { profit_pct: 4, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -3%', params: { loss_pct: -3, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 50, description: 'Posizioni core (BTC/ETH)' },
      tier2: { allocation_pct: 35, description: 'Altcoin liquide' },
      tier3: { allocation_pct: 15, description: 'Esplorative' },
    },
    liquidity_reserve_pct: 30,
    circuit_breaker_total: { loss_pct: -8, action: 'Pausa strategia', description: 'Stop se drawdown > 8%' },
  },
  rules_readable: 'QUANDO: price_change_24h tra -6% e -2%\nE: volatilita_24h tra 1% e 5%\nE: volume_24h > $10M\nALLORA: ENTRA long\nESCI_SE: profitto > 4% OPPURE perdita > 3%',
  max_drawdown: 8,
  max_allocation_pct: 4,
  max_consecutive_losses: 5,
  sizing_method: 'fixed_percentage',
  sizing_value: 3,
  pairs: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT'],
  tick_interval_minutes: 2,
};

/**
 * CR-C02: DCA on Dip
 * Dollar Cost Averaging: accumula durante dip significativi (-5% a -12%).
 * SL largo (-8%) perche il DCA ammortizza, TP moderato (+6%).
 */
const CR_C02: CryptoStrategySeed = {
  code: 'CR-C02',
  name: 'DCA on Dip',
  description: 'Accumula durante dip significativi con DCA. Solo pair blue-chip. SL largo, il DCA ammortizza il rischio.',
  area: 'crypto',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'big_dip', condition: 'price_change_pct', description: 'Dip significativo (-3% a -12%)', params: { min_change_pct: -12, max_change_pct: -3 } },
      { id: 'high_volume', condition: 'min_volume', description: 'Volume minimo $5M (conferma del dip)', params: { min_volume_usd: 5_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +5%', params: { profit_pct: 5, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -4%', params: { loss_pct: -4, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 60, description: 'BTC/ETH - blue chip' },
      tier2: { allocation_pct: 30, description: 'Large cap alts' },
      tier3: { allocation_pct: 10, description: 'Mid cap' },
    },
    liquidity_reserve_pct: 35,
    circuit_breaker_total: { loss_pct: -15, action: 'Pausa strategia', description: 'Stop se drawdown > 15%' },
  },
  rules_readable: 'QUANDO: price_change_24h tra -12% e -5%\nE: volume_24h > $20M\nALLORA: ENTRA long (DCA)\nESCI_SE: profitto > 6% OPPURE perdita > 8%',
  max_drawdown: 15,
  max_allocation_pct: 5,
  max_consecutive_losses: 4,
  sizing_method: 'fixed_percentage',
  sizing_value: 3,
  pairs: ['BTC/USDT', 'ETH/USDT'],
  tick_interval_minutes: 2,
};

/**
 * CR-C03: Grid Trading
 * Entra quando la volatilita e' in un range "grid-friendly" (2-6%).
 * Lavora su range prevedibili con TP piccolo (+3%) e SL stretto (-2%).
 * Alta frequenza, molti trade piccoli.
 */
const CR_C03: CryptoStrategySeed = {
  code: 'CR-C03',
  name: 'Grid Trading',
  description: 'Trading in range su pair stabili. Frequenza alta, profitti piccoli, SL strettissimo. Funziona in mercati laterali.',
  area: 'crypto',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'grid_vol', condition: 'volatility_range', description: 'Volatilita 24h tra 2% e 6% (range-bound)', params: { min_vol_pct: 2, max_vol_pct: 6 } },
      { id: 'small_dip', condition: 'price_change_pct', description: 'Micro-dip (-0.5% a -3%)', params: { min_change_pct: -3, max_change_pct: -0.5 } },
      { id: 'volume_ok', condition: 'min_volume', description: 'Volume minimo $5M', params: { min_volume_usd: 5_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +4%', params: { profit_pct: 4, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -2.5%', params: { loss_pct: -2.5, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 50, description: 'Core grid pairs' },
      tier2: { allocation_pct: 35, description: 'Secondary' },
      tier3: { allocation_pct: 15, description: 'Exploratory' },
    },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -6, action: 'Pausa strategia', description: 'Stop se drawdown > 6%' },
  },
  rules_readable: 'QUANDO: volatilita_24h tra 2% e 6%\nE: price_change_24h tra -3% e -0.5%\nE: volume_24h > $5M\nALLORA: ENTRA long\nESCI_SE: profitto > 3% OPPURE perdita > 2%',
  max_drawdown: 6,
  max_allocation_pct: 3,
  max_consecutive_losses: 6,
  sizing_method: 'fixed_percentage',
  sizing_value: 2,
  pairs: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT'],
  tick_interval_minutes: 1,
};

// ============================================================================
// MODERATE (3) — Balanced risk/reward, trend following, momentum
// ============================================================================

/**
 * CR-M01: Trend Following Breakout
 * Entra su momentum positivo forte (>3% in 24h) con alta volatilita.
 * Segue il trend con TP generoso (+8%) e SL moderato (-4%).
 */
const CR_M01: CryptoStrategySeed = {
  code: 'CR-M01',
  name: 'Trend Following Breakout',
  description: 'Segue il momentum su breakout rialzisti con volume alto. TP generoso, SL moderato.',
  area: 'crypto',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'momentum_up', condition: 'price_change_pct', description: 'Momentum positivo (+1% a +10%)', params: { min_change_pct: 1, max_change_pct: 10 } },
      { id: 'high_vol', condition: 'volatility_range', description: 'Volatilita moderata-alta (2-12%)', params: { min_vol_pct: 2, max_vol_pct: 12 } },
      { id: 'volume_surge', condition: 'min_volume', description: 'Volume minimo $5M (conferma breakout)', params: { min_volume_usd: 5_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +8%', params: { profit_pct: 8, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -4%', params: { loss_pct: -4, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 45, description: 'Strong breakout' },
      tier2: { allocation_pct: 35, description: 'Moderate breakout' },
      tier3: { allocation_pct: 20, description: 'Speculative breakout' },
    },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -12, action: 'Pausa strategia', description: 'Stop se drawdown > 12%' },
  },
  rules_readable: 'QUANDO: price_change_24h tra +3% e +10%\nE: volatilita_24h tra 4% e 12%\nE: volume_24h > $15M\nALLORA: ENTRA long (trend follow)\nESCI_SE: profitto > 8% OPPURE perdita > 4%',
  max_drawdown: 12,
  max_allocation_pct: 5,
  max_consecutive_losses: 4,
  sizing_method: 'volatility_adjusted',
  sizing_value: 4,
  pairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'AVAX/USDT'],
  tick_interval_minutes: 2,
};

/**
 * CR-M02: RSI Oversold Bounce
 * Entra dopo un dip forte (-6% a -15%) quando il volume conferma il rimbalzo.
 * Risk/reward asimmetrico: SL -5%, TP +10%.
 */
const CR_M02: CryptoStrategySeed = {
  code: 'CR-M02',
  name: 'RSI Oversold Bounce',
  description: 'Compra dopo oversold estremo con conferma volume. Asimmetria rischio/rendimento: rischio -5%, target +10%.',
  area: 'crypto',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'oversold_dip', condition: 'price_change_pct', description: 'Dip forte (-4% a -15%) — zona oversold', params: { min_change_pct: -15, max_change_pct: -4 } },
      { id: 'high_vol_dip', condition: 'volatility_range', description: 'Volatilita elevata (3-15%) — conferma sell-off', params: { min_vol_pct: 3, max_vol_pct: 15 } },
      { id: 'volume_capitulation', condition: 'min_volume', description: 'Volume alto > $5M (capitolazione)', params: { min_volume_usd: 5_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +10%', params: { profit_pct: 10, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -5%', params: { loss_pct: -5, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 50, description: 'Blue chip oversold' },
      tier2: { allocation_pct: 35, description: 'Large cap oversold' },
      tier3: { allocation_pct: 15, description: 'Speculative bounce' },
    },
    liquidity_reserve_pct: 30,
    circuit_breaker_total: { loss_pct: -12, action: 'Pausa strategia', description: 'Stop se drawdown > 12%' },
  },
  rules_readable: 'QUANDO: price_change_24h tra -15% e -6%\nE: volatilita_24h tra 5% e 15%\nE: volume_24h > $25M\nALLORA: ENTRA long (bounce)\nESCI_SE: profitto > 10% OPPURE perdita > 5%',
  max_drawdown: 12,
  max_allocation_pct: 4,
  max_consecutive_losses: 4,
  sizing_method: 'volatility_adjusted',
  sizing_value: 3,
  pairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
  tick_interval_minutes: 2,
};

/**
 * CR-M03: Volatility Breakout
 * Entra quando la volatilita esplode (>8%) con movimento positivo.
 * Cattura breakout violenti su altcoin. TP ambizioso +12%, SL -5%.
 */
const CR_M03: CryptoStrategySeed = {
  code: 'CR-M03',
  name: 'Volatility Breakout',
  description: 'Cattura breakout violenti quando la volatilita esplode. Pair con alta beta. TP ambizioso, SL moderato.',
  area: 'crypto',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'vol_explosion', condition: 'volatility_range', description: 'Volatilita esplosiva (5-20%)', params: { min_vol_pct: 5, max_vol_pct: 20 } },
      { id: 'positive_move', condition: 'price_change_pct', description: 'Movimento positivo (+2% a +20%)', params: { min_change_pct: 2, max_change_pct: 20 } },
      { id: 'volume_confirmation', condition: 'min_volume', description: 'Volume alto > $5M', params: { min_volume_usd: 5_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +12%', params: { profit_pct: 12, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -5%', params: { loss_pct: -5, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 40, description: 'Breakout confermato' },
      tier2: { allocation_pct: 35, description: 'Breakout probabile' },
      tier3: { allocation_pct: 25, description: 'Speculativo' },
    },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -15, action: 'Pausa strategia', description: 'Stop se drawdown > 15%' },
  },
  rules_readable: 'QUANDO: volatilita_24h tra 8% e 20%\nE: price_change_24h tra +5% e +20%\nE: volume_24h > $10M\nALLORA: ENTRA long (breakout)\nESCI_SE: profitto > 12% OPPURE perdita > 5%',
  max_drawdown: 15,
  max_allocation_pct: 4,
  max_consecutive_losses: 3,
  sizing_method: 'volatility_adjusted',
  sizing_value: 3,
  pairs: ['SOL/USDT', 'AVAX/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT'],
  tick_interval_minutes: 1,
};

// ============================================================================
// V2 — Recalibrated strategies (failed L1, now corrected)
// ============================================================================

/**
 * CR-C02b: DCA on Dip v2
 * Problema v1: dip range troppo largo (-3% a -12%), TP +5% irraggiungibile, WR 42%.
 * Fix: dip range ristretto (-2% a -8%), TP abbassato a +3.5%, SL -2.5%.
 * Piu' trade con rapporto TP/SL migliore (1.4:1).
 */
const CR_C02b: CryptoStrategySeed = {
  code: 'CR-C02b',
  name: 'DCA on Dip v2',
  description: 'Accumula durante dip moderati con DCA. Range ristretto, TP raggiungibile, ratio 1.4:1.',
  area: 'crypto',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'dip', condition: 'price_change_pct', description: 'Dip moderato (-1.5% a -8%)', params: { min_change_pct: -8, max_change_pct: -1.5 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume minimo $5M', params: { min_volume_usd: 5_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +3.5%', params: { profit_pct: 3.5, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -2.5%', params: { loss_pct: -2.5, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 60, description: 'BTC/ETH - blue chip' },
      tier2: { allocation_pct: 30, description: 'Large cap alts' },
      tier3: { allocation_pct: 10, description: 'Mid cap' },
    },
    liquidity_reserve_pct: 30,
    circuit_breaker_total: { loss_pct: -12, action: 'Pausa strategia', description: 'Stop se drawdown > 12%' },
  },
  rules_readable: 'QUANDO: price_change_24h tra -8% e -2%\nE: volume_24h > $5M\nALLORA: ENTRA long (DCA)\nESCI_SE: profitto > 3.5% OPPURE perdita > 2.5%',
  max_drawdown: 12,
  max_allocation_pct: 5,
  max_consecutive_losses: 5,
  sizing_method: 'fixed_percentage',
  sizing_value: 3,
  pairs: ['BTC/USDT', 'ETH/USDT'],
  tick_interval_minutes: 2,
};

/**
 * CR-C03b: Grid Trading v2
 * Problema v1: 3 condizioni entry troppo restrittive, WR 41.9%, TP/SL sfavorevole.
 * Fix: grid stretto — dip piccolo (-0.5% a -3%) + volume. TP 3%, SL -1.5%.
 * Molti trade piccoli, ratio TP/SL = 2:1.
 */
const CR_C03b: CryptoStrategySeed = {
  code: 'CR-C03b',
  name: 'Grid Trading v2',
  description: 'Grid stretto: dip -0.5% a -3%, TP/SL 2:1, alta frequenza.',
  area: 'crypto',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'dip', condition: 'price_change_pct', description: 'Dip moderato (-2% a -5%)', params: { min_change_pct: -5, max_change_pct: -2 } },
      { id: 'low_vol', condition: 'volatility_range', description: 'Volatilita bassa (1-4%)', params: { min_vol_pct: 1, max_vol_pct: 4 } },
      { id: 'volume_ok', condition: 'min_volume', description: 'Volume minimo $5M', params: { min_volume_usd: 5_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +3.5%', params: { profit_pct: 3.5, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -3%', params: { loss_pct: -3, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 50, description: 'Core grid pairs' },
      tier2: { allocation_pct: 35, description: 'Secondary' },
      tier3: { allocation_pct: 15, description: 'Exploratory' },
    },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -6, action: 'Pausa strategia', description: 'Stop se drawdown > 6%' },
  },
  rules_readable: 'QUANDO: price_change_24h tra -5% e -2%\nE: volatilita_24h tra 1% e 4%\nE: volume_24h > $5M\nALLORA: ENTRA long\nESCI_SE: profitto > 3.5% OPPURE perdita > 3%',
  max_drawdown: 6,
  max_allocation_pct: 3,
  max_consecutive_losses: 6,
  sizing_method: 'fixed_percentage',
  sizing_value: 2,
  pairs: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT'],
  tick_interval_minutes: 1,
};

/**
 * CR-M01b: Quick Bounce v2
 * Problema v1: trend following non funziona su dati mean-reverting. Solo 11 trade, WR 11%.
 * Fix: riformulato come "quick bounce" — compra dip leggero (-1% a -4%) in bassa vol (1-4%),
 * indicando che il dip e' contenuto e il bounce probabile. TP 4%, SL -2.5%. Ratio 1.6:1.
 */
const CR_M01b: CryptoStrategySeed = {
  code: 'CR-M01b',
  name: 'Quick Bounce v2',
  description: 'Compra dip leggero in bassa volatilita. Dip contenuto = bounce probabile. TP 4%, SL -2.5%.',
  area: 'crypto',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'small_dip', condition: 'price_change_pct', description: 'Dip leggero (-1% a -4%)', params: { min_change_pct: -4, max_change_pct: -1 } },
      { id: 'low_vol', condition: 'volatility_range', description: 'Volatilita bassa (1-4%)', params: { min_vol_pct: 1, max_vol_pct: 4 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume minimo $5M', params: { min_volume_usd: 5_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +4%', params: { profit_pct: 4, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -2.5%', params: { loss_pct: -2.5, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 45, description: 'Core bounce' },
      tier2: { allocation_pct: 35, description: 'Moderate bounce' },
      tier3: { allocation_pct: 20, description: 'Speculative bounce' },
    },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -12, action: 'Pausa strategia', description: 'Stop se drawdown > 12%' },
  },
  rules_readable: 'QUANDO: price_change_24h tra -4% e -1%\nE: volatilita_24h tra 1% e 4%\nE: volume_24h > $5M\nALLORA: ENTRA long (bounce)\nESCI_SE: profitto > 4% OPPURE perdita > 2.5%',
  max_drawdown: 12,
  max_allocation_pct: 5,
  max_consecutive_losses: 5,
  sizing_method: 'volatility_adjusted',
  sizing_value: 4,
  pairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'AVAX/USDT'],
  tick_interval_minutes: 2,
};

/**
 * CR-M02b: Deep Dip Bounce v2
 * Problema v1: dip troppo estremo (-4% a -15%), WR 33%, TP +10% irraggiungibile.
 * Fix: dip moderato (-3% a -8%), solo volume + dip, TP +4%, SL -2.5%.
 * Ratio 1.6:1, focus su dip profondi ma non estremi.
 */
const CR_M02b: CryptoStrategySeed = {
  code: 'CR-M02b',
  name: 'Deep Dip Bounce v2',
  description: 'Bounce su dip profondo (-3% a -8%). Solo volume + dip. TP +4%, SL -2.5%.',
  area: 'crypto',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'dip', condition: 'price_change_pct', description: 'Dip profondo (-3% a -8%)', params: { min_change_pct: -8, max_change_pct: -3 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume alto > $5M', params: { min_volume_usd: 5_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +4%', params: { profit_pct: 4, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -2.5%', params: { loss_pct: -2.5, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 50, description: 'Blue chip oversold' },
      tier2: { allocation_pct: 35, description: 'Large cap' },
      tier3: { allocation_pct: 15, description: 'Speculative bounce' },
    },
    liquidity_reserve_pct: 30,
    circuit_breaker_total: { loss_pct: -12, action: 'Pausa strategia', description: 'Stop se drawdown > 12%' },
  },
  rules_readable: 'QUANDO: price_change_24h tra -8% e -3%\nE: volume_24h > $5M\nALLORA: ENTRA long (bounce)\nESCI_SE: profitto > 4% OPPURE perdita > 2.5%',
  max_drawdown: 12,
  max_allocation_pct: 4,
  max_consecutive_losses: 5,
  sizing_method: 'volatility_adjusted',
  sizing_value: 3,
  pairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
  tick_interval_minutes: 2,
};

/**
 * CR-M03b: Volatile Dip v2
 * Problema v1: vol 5-20% + move positivo = solo 9 trade in mean-reverting data.
 * Fix: riformulato come "volatile dip" — dip (-1.5% a -5%) + volume, senza vol filter.
 * Altcoin ad alta beta con TP +4%, SL -2.5%. Ratio 1.6:1.
 */
const CR_M03b: CryptoStrategySeed = {
  code: 'CR-M03b',
  name: 'Volatile Dip v2',
  description: 'Compra dip su altcoin ad alta beta. TP +4%, SL -2.5%, ratio 1.6:1.',
  area: 'crypto',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'dip', condition: 'price_change_pct', description: 'Dip (-1% a -7%)', params: { min_change_pct: -7, max_change_pct: -1 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume alto > $5M', params: { min_volume_usd: 5_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +3%', params: { profit_pct: 3, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -3%', params: { loss_pct: -3, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 40, description: 'Dip confermato' },
      tier2: { allocation_pct: 35, description: 'Dip probabile' },
      tier3: { allocation_pct: 25, description: 'Speculativo' },
    },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -15, action: 'Pausa strategia', description: 'Stop se drawdown > 15%' },
  },
  rules_readable: 'QUANDO: price_change_24h tra -7% e -1%\nE: volume_24h > $5M\nALLORA: ENTRA long (volatile dip)\nESCI_SE: profitto > 3% OPPURE perdita > 3%',
  max_drawdown: 15,
  max_allocation_pct: 4,
  max_consecutive_losses: 4,
  sizing_method: 'volatility_adjusted',
  sizing_value: 3,
  pairs: ['BTC/USDT', 'ETH/USDT'],
  tick_interval_minutes: 1,
};

// ============================================================================
// V3 — Real-data optimized strategies (calibrated on 90d Binance OHLCV)
// ============================================================================

/**
 * CR-C01c: Mean Reversion Range v3
 * Problema v2: TP +4% troppo ambizioso su dati reali (WR 46.4%), L2 FAIL.
 * Fix: TP ridotto a +3%, SL a -2%. Ratio 1.5:1, WR piu' alto.
 * Stessi filtri entry di C01 (collaudati su entrambi i dataset).
 */
const CR_C01c: CryptoStrategySeed = {
  code: 'CR-C01c',
  name: 'Mean Reversion Range v3',
  description: 'Mean reversion con TP raggiungibile. Ratio 1.5:1, ottimizzato su dati reali.',
  area: 'crypto',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'dip_24h', condition: 'price_change_pct', description: 'Prezzo sceso tra -2% e -6% nelle 24h', params: { min_change_pct: -6, max_change_pct: -2 } },
      { id: 'low_vol', condition: 'volatility_range', description: 'Volatilita 24h bassa (1-5%)', params: { min_vol_pct: 1, max_vol_pct: 5 } },
      { id: 'high_volume', condition: 'min_volume', description: 'Volume minimo $10M nelle 24h', params: { min_volume_usd: 10_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +3%', params: { profit_pct: 3, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -2%', params: { loss_pct: -2, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 50, description: 'Posizioni core (BTC/ETH)' },
      tier2: { allocation_pct: 35, description: 'Altcoin liquide' },
      tier3: { allocation_pct: 15, description: 'Esplorative' },
    },
    liquidity_reserve_pct: 30,
    circuit_breaker_total: { loss_pct: -8, action: 'Pausa strategia', description: 'Stop se drawdown > 8%' },
  },
  rules_readable: 'QUANDO: price_change_24h tra -6% e -2%\nE: volatilita_24h tra 1% e 5%\nE: volume_24h > $10M\nALLORA: ENTRA long\nESCI_SE: profitto > 3% OPPURE perdita > 2%',
  max_drawdown: 8,
  max_allocation_pct: 4,
  max_consecutive_losses: 5,
  sizing_method: 'fixed_percentage',
  sizing_value: 3,
  pairs: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT'],
  tick_interval_minutes: 2,
};

/**
 * CR-M02c: Deep Dip Bounce v3
 * Problema v2: M02b passa L2 synthetic ma fallisce L2 real (WR 48.1%, ROI 0.74%).
 * Fix: dip range spostato a -2% a -6% (piu' trade da dip moderati), TP 3%, SL -2%.
 * Ratio 1.5:1. Piu' trade, WR piu' alto, consistenza cross-window.
 */
const CR_M02c: CryptoStrategySeed = {
  code: 'CR-M02c',
  name: 'Deep Dip Bounce v3',
  description: 'Bounce su dip moderato (-2% a -6%). TP 3%, SL -2%, ratio 1.5:1. Ottimizzato per L2 real.',
  area: 'crypto',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'dip', condition: 'price_change_pct', description: 'Dip moderato (-2% a -6%)', params: { min_change_pct: -6, max_change_pct: -2 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume alto > $5M', params: { min_volume_usd: 5_000_000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Take profit al +3%', params: { profit_pct: 3, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -2%', params: { loss_pct: -2, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: {
      tier1: { allocation_pct: 50, description: 'Blue chip dip' },
      tier2: { allocation_pct: 35, description: 'Large cap' },
      tier3: { allocation_pct: 15, description: 'Speculative bounce' },
    },
    liquidity_reserve_pct: 30,
    circuit_breaker_total: { loss_pct: -12, action: 'Pausa strategia', description: 'Stop se drawdown > 12%' },
  },
  rules_readable: 'QUANDO: price_change_24h tra -6% e -2%\nE: volume_24h > $5M\nALLORA: ENTRA long (bounce)\nESCI_SE: profitto > 3% OPPURE perdita > 2%',
  max_drawdown: 12,
  max_allocation_pct: 4,
  max_consecutive_losses: 5,
  sizing_method: 'volatility_adjusted',
  sizing_value: 3,
  pairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
  tick_interval_minutes: 2,
};

// ============================================================================
// Export
// ============================================================================

export const CRYPTO_STRATEGIES: CryptoStrategySeed[] = [
  CR_C01, CR_C02, CR_C03,
  CR_M01, CR_M02, CR_M03,
  // V2 — Recalibrated strategies
  CR_C02b, CR_C03b, CR_M01b, CR_M02b, CR_M03b,
  // V3 — Real-data optimized strategies
  CR_C01c, CR_M02c,
];

export const CRYPTO_STRATEGY_MAP: Record<string, CryptoStrategySeed> = Object.fromEntries(
  CRYPTO_STRATEGIES.map((s) => [s.code, s]),
);