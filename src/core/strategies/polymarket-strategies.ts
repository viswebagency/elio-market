/**
 * Polymarket Strategies — Seed Data
 *
 * 13 strategies for Polymarket prediction markets:
 * - 5 conservative (low risk, high probability)
 * - 5 moderate (balanced risk/reward)
 * - 3 aggressive (high reward, high volatility)
 *
 * Each strategy has its own entry/exit rules in the DSL format,
 * risk parameters, and circuit breaker config.
 *
 * FILE_SACRO section 3.4: 10-15 strategies per area initially.
 */

import { StrategyRulesJson } from '../engine/dsl-parser';

export interface StrategySeed {
  code: string;
  name: string;
  description: string;
  area: 'polymarket';
  risk_level: 'conservative' | 'moderate' | 'aggressive';
  rules: StrategyRulesJson;
  rules_readable: string;
  max_drawdown: number;
  max_allocation_pct: number;
  max_consecutive_losses: number;
  sizing_method: 'fixed_percentage' | 'kelly' | 'fixed_amount';
  sizing_value: number;
  min_ev: number;
  min_probability: number;
}

// ============================================================================
// CONSERVATIVE (5) — Low risk, high probability, tight stops
// ============================================================================

const PM_C01: StrategySeed = {
  code: 'PM-C01',
  name: 'Safe Haven',
  description: 'Mercati ad alto volume con quote estreme (>0.72). Sfrutta la convergenza verso il risultato ovvio con margine minimo ma alta probabilita.',
  area: 'polymarket',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'price_extreme', condition: 'price_range', description: 'Quote molto alte o molto basse', params: { min_price: 0.72, max_price: 0.98 } },
      { id: 'high_volume', condition: 'min_volume', description: 'Volume 24h minimo $50k', params: { min_volume_usd: 50000 } },
      { id: 'near_expiry', condition: 'max_expiry', description: 'Scadenza entro 14 giorni', params: { max_days_to_expiry: 14 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Prendi profitto al 5%', params: { profit_pct: 5, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -3%', params: { loss_pct: -3, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: { tier1: { allocation_pct: 50, description: 'Posizioni core' }, tier2: { allocation_pct: 35, description: 'Posizioni secondarie' }, tier3: { allocation_pct: 15, description: 'Esplorative' } },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -10, action: 'Pausa strategia', description: 'Stop se drawdown > 10%' },
  },
  rules_readable: 'QUANDO: prezzo > 0.72 E prezzo < 0.98\nE: volume24h > $50k\nE: scadenza < 14 giorni\nALLORA: ENTRA long\nESCI_SE: profitto > 5% OPPURE perdita > 3%',
  max_drawdown: 10,
  max_allocation_pct: 8,
  max_consecutive_losses: 5,
  sizing_method: 'fixed_percentage',
  sizing_value: 3,
  min_ev: 5,
  min_probability: 60,
};

const PM_C02: StrategySeed = {
  code: 'PM-C02',
  name: 'Volume Sentinel',
  description: 'Entra solo su mercati con volume eccezionale (>$100k/24h). Il volume alto indica consenso forte e riduce il rischio di manipolazione.',
  area: 'polymarket',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'mid_price', condition: 'price_range', description: 'Quote tra 0.55 e 0.80', params: { min_price: 0.55, max_price: 0.80 } },
      { id: 'very_high_volume', condition: 'min_volume', description: 'Volume 24h minimo $100k', params: { min_volume_usd: 100000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Prendi profitto al 8%', params: { profit_pct: 8, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -5%', params: { loss_pct: -5, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: { tier1: { allocation_pct: 50, description: 'Core' }, tier2: { allocation_pct: 35, description: 'Secondarie' }, tier3: { allocation_pct: 15, description: 'Esplorative' } },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -12, action: 'Pausa strategia', description: 'Stop se drawdown > 12%' },
  },
  rules_readable: 'QUANDO: prezzo 0.55-0.80\nE: volume24h > $100k\nALLORA: ENTRA long\nESCI_SE: profitto > 8% OPPURE perdita > 5%',
  max_drawdown: 12,
  max_allocation_pct: 8,
  max_consecutive_losses: 5,
  sizing_method: 'fixed_percentage',
  sizing_value: 3,
  min_ev: 5,
  min_probability: 55,
};

const PM_C03: StrategySeed = {
  code: 'PM-C03',
  name: 'Expiry Squeeze',
  description: 'Mercati a scadenza imminente (<7 giorni) con quote alte. La convergenza temporale forza il prezzo verso 0 o 1.',
  area: 'polymarket',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'high_price', condition: 'price_range', description: 'Quote alte (favoriti)', params: { min_price: 0.75, max_price: 0.92 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume minimo $30k', params: { min_volume_usd: 30000 } },
      { id: 'near_expiry', condition: 'max_expiry', description: 'Scadenza entro 7 giorni', params: { max_days_to_expiry: 7 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Prendi profitto al 4%', params: { profit_pct: 4, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -3%', params: { loss_pct: -3, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: { tier1: { allocation_pct: 50, description: 'Core' }, tier2: { allocation_pct: 35, description: 'Secondarie' }, tier3: { allocation_pct: 15, description: 'Esplorative' } },
    liquidity_reserve_pct: 30,
    circuit_breaker_total: { loss_pct: -8, action: 'Pausa strategia', description: 'Stop se drawdown > 8%' },
  },
  rules_readable: 'QUANDO: prezzo 0.75-0.92\nE: volume24h > $30k\nE: scadenza < 7 giorni\nALLORA: ENTRA long\nESCI_SE: profitto > 4% OPPURE perdita > 3%',
  max_drawdown: 8,
  max_allocation_pct: 7,
  max_consecutive_losses: 4,
  sizing_method: 'fixed_percentage',
  sizing_value: 2.5,
  min_ev: 5,
  min_probability: 65,
};

const PM_C04: StrategySeed = {
  code: 'PM-C04',
  name: 'Blue Chip Only',
  description: 'Solo mercati con volume totale >$500k. Massima liquidita, minimo slippage.',
  area: 'polymarket',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'mid_price', condition: 'price_range', description: 'Quote 0.60-0.85', params: { min_price: 0.60, max_price: 0.85 } },
      { id: 'mega_volume', condition: 'min_volume', description: 'Volume 24h minimo $200k', params: { min_volume_usd: 200000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Prendi profitto al 6%', params: { profit_pct: 6, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -4%', params: { loss_pct: -4, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: { tier1: { allocation_pct: 60, description: 'Core' }, tier2: { allocation_pct: 30, description: 'Secondarie' }, tier3: { allocation_pct: 10, description: 'Esplorative' } },
    liquidity_reserve_pct: 20,
    circuit_breaker_total: { loss_pct: -10, action: 'Pausa strategia', description: 'Stop se drawdown > 10%' },
  },
  rules_readable: 'QUANDO: prezzo 0.60-0.85\nE: volume24h > $200k\nALLORA: ENTRA long\nESCI_SE: profitto > 6% OPPURE perdita > 4%',
  max_drawdown: 10,
  max_allocation_pct: 8,
  max_consecutive_losses: 5,
  sizing_method: 'fixed_percentage',
  sizing_value: 3,
  min_ev: 5,
  min_probability: 60,
};

const PM_C05: StrategySeed = {
  code: 'PM-C05',
  name: 'Scalp Express',
  description: 'Micro-profitti rapidi su mercati stabili. Entra e esci con target 2-3%, stop strettissimo.',
  area: 'polymarket',
  risk_level: 'conservative',
  rules: {
    entry_rules: [
      { id: 'stable_price', condition: 'price_range', description: 'Quote stabili 0.50-0.70', params: { min_price: 0.50, max_price: 0.70 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume 24h minimo $40k', params: { min_volume_usd: 40000 } },
      { id: 'mid_expiry', condition: 'max_expiry', description: 'Scadenza entro 30 giorni', params: { max_days_to_expiry: 30 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Prendi profitto al 3%', params: { profit_pct: 3, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -2%', params: { loss_pct: -2, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: { tier1: { allocation_pct: 50, description: 'Core' }, tier2: { allocation_pct: 35, description: 'Secondarie' }, tier3: { allocation_pct: 15, description: 'Esplorative' } },
    liquidity_reserve_pct: 20,
    circuit_breaker_total: { loss_pct: -8, action: 'Pausa strategia', description: 'Stop se drawdown > 8%' },
  },
  rules_readable: 'QUANDO: prezzo 0.50-0.70\nE: volume24h > $40k\nE: scadenza < 30gg\nALLORA: ENTRA long\nESCI_SE: profitto > 3% OPPURE perdita > 2%',
  max_drawdown: 8,
  max_allocation_pct: 6,
  max_consecutive_losses: 6,
  sizing_method: 'fixed_percentage',
  sizing_value: 2,
  min_ev: 5,
  min_probability: 60,
};

// ============================================================================
// MODERATE (5) — Balanced risk/reward
// ============================================================================

const PM_M01: StrategySeed = {
  code: 'PM-M01',
  name: 'Compra la Paura',
  description: 'Swing trading: compra quando il prezzo scende bruscamente su mercati con volume alto. Sfrutta il panico irrazionale.',
  area: 'polymarket',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'undervalued', condition: 'price_range', description: 'Quote sottovalutate 0.25-0.55', params: { min_price: 0.25, max_price: 0.55 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume 24h minimo $50k', params: { min_volume_usd: 50000 } },
      { id: 'time', condition: 'max_expiry', description: 'Almeno 10 giorni alla scadenza', params: { max_days_to_expiry: 60 } },
    ],
    exit_rules: [
      { id: 'tp1', condition: 'take_profit_partial', description: 'Prendi 50% al 15%', params: { profit_pct: 15, sell_fraction: 0.5 } },
      { id: 'tp2', condition: 'take_profit', description: 'Esci totale al 25%', params: { profit_pct: 25, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -10%', params: { loss_pct: -10, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: { tier1: { allocation_pct: 40, description: 'Core' }, tier2: { allocation_pct: 40, description: 'Secondarie' }, tier3: { allocation_pct: 20, description: 'Esplorative' } },
    liquidity_reserve_pct: 20,
    circuit_breaker_total: { loss_pct: -20, action: 'Pausa strategia', description: 'Stop se drawdown > 20%' },
  },
  rules_readable: 'QUANDO: prezzo 0.25-0.55 (sottovalutato)\nE: volume24h > $50k\nE: scadenza < 60gg\nALLORA: ENTRA long\nESCI_SE: profitto > 15% (50%) OPPURE profitto > 25% (tutto) OPPURE perdita > 10%',
  max_drawdown: 20,
  max_allocation_pct: 10,
  max_consecutive_losses: 6,
  sizing_method: 'fixed_percentage',
  sizing_value: 5,
  min_ev: 3,
  min_probability: 45,
};

const PM_M02: StrategySeed = {
  code: 'PM-M02',
  name: 'Trend Follower',
  description: 'Segue il momentum: entra su mercati con prezzo in crescita e volume alto. Cavalca il trend fino all\'esaurimento.',
  area: 'polymarket',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'rising', condition: 'price_range', description: 'Quote in zona di crescita 0.40-0.70', params: { min_price: 0.40, max_price: 0.70 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume 24h minimo $75k', params: { min_volume_usd: 75000 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Prendi profitto al 20%', params: { profit_pct: 20, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -8%', params: { loss_pct: -8, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: { tier1: { allocation_pct: 45, description: 'Core' }, tier2: { allocation_pct: 35, description: 'Secondarie' }, tier3: { allocation_pct: 20, description: 'Esplorative' } },
    liquidity_reserve_pct: 20,
    circuit_breaker_total: { loss_pct: -18, action: 'Pausa strategia', description: 'Stop se drawdown > 18%' },
  },
  rules_readable: 'QUANDO: prezzo 0.40-0.70\nE: volume24h > $75k\nALLORA: ENTRA long\nESCI_SE: profitto > 20% OPPURE perdita > 8%',
  max_drawdown: 18,
  max_allocation_pct: 10,
  max_consecutive_losses: 5,
  sizing_method: 'fixed_percentage',
  sizing_value: 5,
  min_ev: 3,
  min_probability: 45,
};

const PM_M03: StrategySeed = {
  code: 'PM-M03',
  name: 'Catalyst Hunter',
  description: 'Cerca mercati con catalizzatori noti (elezioni, report, scadenze). Il catalizzatore forza la risoluzione e crea opportunita.',
  area: 'polymarket',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'mid_price', condition: 'price_range', description: 'Quote 0.35-0.65', params: { min_price: 0.35, max_price: 0.65 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume 24h minimo $30k', params: { min_volume_usd: 30000 } },
      { id: 'catalyst', condition: 'catalyst', description: 'Richiede catalizzatore noto', params: { requires_catalyst: true } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Prendi profitto al 18%', params: { profit_pct: 18, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -8%', params: { loss_pct: -8, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: { tier1: { allocation_pct: 40, description: 'Core' }, tier2: { allocation_pct: 40, description: 'Secondarie' }, tier3: { allocation_pct: 20, description: 'Esplorative' } },
    liquidity_reserve_pct: 20,
    circuit_breaker_total: { loss_pct: -15, action: 'Pausa strategia', description: 'Stop se drawdown > 15%' },
  },
  rules_readable: 'QUANDO: prezzo 0.35-0.65\nE: volume24h > $30k\nE: catalizzatore presente\nALLORA: ENTRA long\nESCI_SE: profitto > 18% OPPURE perdita > 8%',
  max_drawdown: 15,
  max_allocation_pct: 10,
  max_consecutive_losses: 5,
  sizing_method: 'fixed_percentage',
  sizing_value: 4,
  min_ev: 3,
  min_probability: 50,
};

const PM_M04: StrategySeed = {
  code: 'PM-M04',
  name: 'Mid-Range Grinder',
  description: 'Lavora su quote centrali (0.40-0.60) dove il mercato e indeciso. Cerca edge nei dati fondamentali.',
  area: 'polymarket',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'indecision', condition: 'price_range', description: 'Quote 50-50 zone', params: { min_price: 0.40, max_price: 0.60 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume 24h minimo $60k', params: { min_volume_usd: 60000 } },
      { id: 'time', condition: 'max_expiry', description: 'Scadenza entro 45 giorni', params: { max_days_to_expiry: 45 } },
    ],
    exit_rules: [
      { id: 'tp1', condition: 'take_profit_partial', description: 'Prendi 50% al 12%', params: { profit_pct: 12, sell_fraction: 0.5 } },
      { id: 'tp2', condition: 'take_profit', description: 'Esci al 22%', params: { profit_pct: 22, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -7%', params: { loss_pct: -7, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: { tier1: { allocation_pct: 40, description: 'Core' }, tier2: { allocation_pct: 40, description: 'Secondarie' }, tier3: { allocation_pct: 20, description: 'Esplorative' } },
    liquidity_reserve_pct: 20,
    circuit_breaker_total: { loss_pct: -16, action: 'Pausa strategia', description: 'Stop se drawdown > 16%' },
  },
  rules_readable: 'QUANDO: prezzo 0.40-0.60\nE: volume24h > $60k\nE: scadenza < 45gg\nALLORA: ENTRA long\nESCI_SE: profitto > 12% (50%) OPPURE profitto > 22% (tutto) OPPURE perdita > 7%',
  max_drawdown: 16,
  max_allocation_pct: 10,
  max_consecutive_losses: 6,
  sizing_method: 'fixed_percentage',
  sizing_value: 4,
  min_ev: 3,
  min_probability: 45,
};

const PM_M05: StrategySeed = {
  code: 'PM-M05',
  name: 'Wide Net',
  description: 'Ampio range di prezzo, seleziona solo mercati con volume sopra la media. Diversificazione massima.',
  area: 'polymarket',
  risk_level: 'moderate',
  rules: {
    entry_rules: [
      { id: 'wide', condition: 'price_range', description: 'Qualsiasi quota ragionevole', params: { min_price: 0.20, max_price: 0.80 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume 24h minimo $80k', params: { min_volume_usd: 80000 } },
      { id: 'time', condition: 'max_expiry', description: 'Scadenza entro 90 giorni', params: { max_days_to_expiry: 90 } },
    ],
    exit_rules: [
      { id: 'tp', condition: 'take_profit', description: 'Prendi profitto al 15%', params: { profit_pct: 15, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -8%', params: { loss_pct: -8, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: { tier1: { allocation_pct: 35, description: 'Core' }, tier2: { allocation_pct: 40, description: 'Secondarie' }, tier3: { allocation_pct: 25, description: 'Esplorative' } },
    liquidity_reserve_pct: 20,
    circuit_breaker_total: { loss_pct: -18, action: 'Pausa strategia', description: 'Stop se drawdown > 18%' },
  },
  rules_readable: 'QUANDO: prezzo 0.20-0.80\nE: volume24h > $80k\nE: scadenza < 90gg\nALLORA: ENTRA long\nESCI_SE: profitto > 15% OPPURE perdita > 8%',
  max_drawdown: 18,
  max_allocation_pct: 8,
  max_consecutive_losses: 7,
  sizing_method: 'fixed_percentage',
  sizing_value: 3,
  min_ev: 3,
  min_probability: 45,
};

// ============================================================================
// AGGRESSIVE (3) — High reward, high volatility
// ============================================================================

const PM_A01: StrategySeed = {
  code: 'PM-A01',
  name: 'Deep Value',
  description: 'Compra quote molto basse (<0.25) su mercati con volume sufficiente. Scommette su eventi sottovalutati dal mercato — alto rischio, alto rendimento.',
  area: 'polymarket',
  risk_level: 'aggressive',
  rules: {
    entry_rules: [
      { id: 'deep_value', condition: 'price_range', description: 'Quote molto basse (underdog)', params: { min_price: 0.05, max_price: 0.25 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume 24h minimo $20k', params: { min_volume_usd: 20000 } },
      { id: 'time', condition: 'max_expiry', description: 'Scadenza entro 60 giorni', params: { max_days_to_expiry: 60 } },
    ],
    exit_rules: [
      { id: 'tp1', condition: 'take_profit_partial', description: 'Prendi 30% al 50%', params: { profit_pct: 50, sell_fraction: 0.3 } },
      { id: 'tp2', condition: 'take_profit', description: 'Esci al 100%', params: { profit_pct: 100, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -15%', params: { loss_pct: -15, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: { tier1: { allocation_pct: 30, description: 'Core' }, tier2: { allocation_pct: 40, description: 'Secondarie' }, tier3: { allocation_pct: 30, description: 'Esplorative' } },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -25, action: 'Pausa strategia', description: 'Stop se drawdown > 25%' },
  },
  rules_readable: 'QUANDO: prezzo 0.05-0.25 (deep value)\nE: volume24h > $20k\nE: scadenza < 60gg\nALLORA: ENTRA long\nESCI_SE: profitto > 50% (30%) OPPURE profitto > 100% (tutto) OPPURE perdita > 15%',
  max_drawdown: 25,
  max_allocation_pct: 5,
  max_consecutive_losses: 8,
  sizing_method: 'fixed_percentage',
  sizing_value: 2,
  min_ev: 1,
  min_probability: 0,
};

const PM_A02: StrategySeed = {
  code: 'PM-A02',
  name: 'Momentum Rocket',
  description: 'Entra aggressivamente su mercati con movimento forte e volume in crescita. Cavalca l\'onda fino allo stallo.',
  area: 'polymarket',
  risk_level: 'aggressive',
  rules: {
    entry_rules: [
      { id: 'any_price', condition: 'price_range', description: 'Quote dinamiche 0.15-0.60', params: { min_price: 0.15, max_price: 0.60 } },
      { id: 'high_volume', condition: 'min_volume', description: 'Volume 24h minimo $100k', params: { min_volume_usd: 100000 } },
    ],
    exit_rules: [
      { id: 'tp1', condition: 'take_profit_partial', description: 'Prendi 40% al 30%', params: { profit_pct: 30, sell_fraction: 0.4 } },
      { id: 'tp2', condition: 'take_profit', description: 'Esci al 60%', params: { profit_pct: 60, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -12%', params: { loss_pct: -12, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: { tier1: { allocation_pct: 30, description: 'Core' }, tier2: { allocation_pct: 40, description: 'Secondarie' }, tier3: { allocation_pct: 30, description: 'Esplorative' } },
    liquidity_reserve_pct: 20,
    circuit_breaker_total: { loss_pct: -22, action: 'Pausa strategia', description: 'Stop se drawdown > 22%' },
  },
  rules_readable: 'QUANDO: prezzo 0.15-0.60\nE: volume24h > $100k\nALLORA: ENTRA long\nESCI_SE: profitto > 30% (40%) OPPURE profitto > 60% (tutto) OPPURE perdita > 12%',
  max_drawdown: 22,
  max_allocation_pct: 7,
  max_consecutive_losses: 7,
  sizing_method: 'fixed_percentage',
  sizing_value: 4,
  min_ev: 1,
  min_probability: 0,
};

const PM_A03: StrategySeed = {
  code: 'PM-A03',
  name: 'Contrarian Play',
  description: 'Va contro il consenso su mercati molto sbilanciati. Quando tutti sono su un lato, cerca l\'inversione.',
  area: 'polymarket',
  risk_level: 'aggressive',
  rules: {
    entry_rules: [
      { id: 'extreme_low', condition: 'price_range', description: 'Quote molto basse (contro consenso)', params: { min_price: 0.03, max_price: 0.20 } },
      { id: 'volume', condition: 'min_volume', description: 'Volume 24h minimo $50k', params: { min_volume_usd: 50000 } },
      { id: 'time', condition: 'max_expiry', description: 'Scadenza entro 90 giorni', params: { max_days_to_expiry: 90 } },
    ],
    exit_rules: [
      { id: 'tp1', condition: 'take_profit_partial', description: 'Prendi 25% al 80%', params: { profit_pct: 80, sell_fraction: 0.25 } },
      { id: 'tp2', condition: 'take_profit', description: 'Esci al 200%', params: { profit_pct: 200, sell_fraction: 1.0 } },
      { id: 'sl', condition: 'stop_loss', description: 'Stop loss al -20%', params: { loss_pct: -20, sell_fraction: 1.0 } },
    ],
    bankroll_tiers: { tier1: { allocation_pct: 25, description: 'Core' }, tier2: { allocation_pct: 40, description: 'Secondarie' }, tier3: { allocation_pct: 35, description: 'Esplorative' } },
    liquidity_reserve_pct: 25,
    circuit_breaker_total: { loss_pct: -30, action: 'Pausa strategia', description: 'Stop se drawdown > 30%' },
  },
  rules_readable: 'QUANDO: prezzo 0.03-0.20 (contrarian)\nE: volume24h > $50k\nE: scadenza < 90gg\nALLORA: ENTRA long\nESCI_SE: profitto > 80% (25%) OPPURE profitto > 200% (tutto) OPPURE perdita > 20%',
  max_drawdown: 30,
  max_allocation_pct: 4,
  max_consecutive_losses: 10,
  sizing_method: 'fixed_percentage',
  sizing_value: 1.5,
  min_ev: 1,
  min_probability: 0,
};

// ============================================================================
// Export all strategies
// ============================================================================

export const POLYMARKET_STRATEGIES: StrategySeed[] = [
  // Conservative
  PM_C01, PM_C02, PM_C03, PM_C04, PM_C05,
  // Moderate
  PM_M01, PM_M02, PM_M03, PM_M04, PM_M05,
  // Aggressive
  PM_A01, PM_A02, PM_A03,
];
