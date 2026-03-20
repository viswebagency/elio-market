import { describe, it, expect } from 'vitest';
import { parseStrategy, validateParsedStrategy, StrategyRulesJson } from '@/core/engine/dsl-parser';
import { TierLevel } from '@/core/engine/signals';

const PM001_RULES: StrategyRulesJson = {
  entry_rules: [
    {
      id: 'price_range',
      condition: 'QUANDO prezzo >= $0.05 E prezzo <= $0.45',
      description: 'Prezzo nel range di sottovalutazione',
      params: { min_price: 0.05, max_price: 0.45 },
    },
    {
      id: 'volume_min',
      condition: 'E volume_totale > $100.000',
      description: 'Volume sufficiente per liquidita',
      params: { min_volume_usd: 100000 },
    },
    {
      id: 'expiry_window',
      condition: 'E scadenza < 30 giorni',
      description: 'Scadenza vicina per catalizzatore temporale',
      params: { max_days_to_expiry: 30 },
    },
    {
      id: 'catalyst',
      condition: 'E catalizzatore_imminente = TRUE',
      description: 'Evento imminente che puo muovere il prezzo',
      params: { requires_catalyst: true },
    },
  ],
  exit_rules: [
    {
      id: 'tp_1_third',
      condition: 'ESCI_SE profitto >= +50%',
      action: 'ALLORA vendi 1/3 posizione',
      description: 'Primo take profit: vendi un terzo',
      params: { profit_pct: 50, sell_fraction: 0.333 },
    },
    {
      id: 'tp_half',
      condition: 'ESCI_SE profitto >= +100%',
      action: 'ALLORA vendi 1/2 posizione rimanente',
      description: 'Secondo take profit: vendi meta del rimanente',
      params: { profit_pct: 100, sell_fraction: 0.5 },
    },
    {
      id: 'tp_full',
      condition: 'ESCI_SE profitto >= +200%',
      action: 'ALLORA vendi tutto tranne lottery ticket',
      description: 'Terzo take profit: esci quasi completamente',
      params: { profit_pct: 200, sell_fraction: 0.95 },
    },
    {
      id: 'stop_loss',
      condition: 'ESCI_SE perdita >= -30%',
      action: 'ALLORA vendi tutto',
      description: 'Stop loss rigido al -30%',
      params: { loss_pct: -30, sell_fraction: 1.0 },
    },
  ],
  bankroll_tiers: {
    tier1: { allocation_pct: 50, description: 'Alta fiducia' },
    tier2: { allocation_pct: 30, description: 'Media fiducia' },
    tier3: { allocation_pct: 20, description: 'Speculativo' },
  },
  liquidity_reserve_pct: 20,
  circuit_breaker_total: {
    loss_pct: -50,
    action: 'Pausa totale strategia',
    description: 'Se il bankroll totale scende del 50%, pausa',
  },
};

const PM001_ROW = {
  id: '00000000-0000-0000-0000-0000000a0001',
  code: 'PM-001',
  name: 'Compra la Paura, Vendi lo Spike',
  area: 'polymarket',
  rules: PM001_RULES,
  max_drawdown: 50,
  max_allocation_pct: 10,
  max_consecutive_losses: 5,
};

describe('DSL Parser', () => {
  it('parsa la strategia PM-001 senza errori', () => {
    const parsed = parseStrategy(PM001_ROW);

    expect(parsed.strategyId).toBe('00000000-0000-0000-0000-0000000a0001');
    expect(parsed.code).toBe('PM-001');
    expect(parsed.name).toBe('Compra la Paura, Vendi lo Spike');
    expect(parsed.area).toBe('polymarket');
  });

  it('estrae 4 entry rules con parametri corretti', () => {
    const parsed = parseStrategy(PM001_ROW);

    expect(parsed.entryRules).toHaveLength(4);

    const priceRule = parsed.entryRules.find(r => r.id === 'price_range');
    expect(priceRule).toBeDefined();
    expect(priceRule!.params).toEqual({
      type: 'price_range',
      minPrice: 0.05,
      maxPrice: 0.45,
    });

    const volumeRule = parsed.entryRules.find(r => r.id === 'volume_min');
    expect(volumeRule).toBeDefined();
    expect(volumeRule!.params).toEqual({
      type: 'min_volume',
      minVolumeUsd: 100000,
    });
  });

  it('estrae 4 exit rules ordinate per soglia', () => {
    const parsed = parseStrategy(PM001_ROW);

    expect(parsed.exitRules).toHaveLength(4);

    // Il stop loss (-30) e ordinato prima dei take profit
    expect(parsed.exitRules[0].id).toBe('stop_loss');
    expect(parsed.exitRules[0].isStopLoss).toBe(true);
    expect(parsed.exitRules[0].lossPct).toBe(-30);
    expect(parsed.exitRules[0].sellFraction).toBe(1.0);

    expect(parsed.exitRules[1].profitPct).toBe(50);
    expect(parsed.exitRules[2].profitPct).toBe(100);
    expect(parsed.exitRules[3].profitPct).toBe(200);
  });

  it('parsa i bankroll tiers correttamente', () => {
    const parsed = parseStrategy(PM001_ROW);

    expect(parsed.bankrollTiers).toHaveLength(3);

    const tier1 = parsed.bankrollTiers.find(t => t.tier === TierLevel.TIER1);
    expect(tier1).toBeDefined();
    expect(tier1!.allocationPct).toBe(50);

    const tier2 = parsed.bankrollTiers.find(t => t.tier === TierLevel.TIER2);
    expect(tier2!.allocationPct).toBe(30);

    const tier3 = parsed.bankrollTiers.find(t => t.tier === TierLevel.TIER3);
    expect(tier3!.allocationPct).toBe(20);
  });

  it('parsa il circuit breaker', () => {
    const parsed = parseStrategy(PM001_ROW);

    expect(parsed.circuitBreaker.lossPct).toBe(-50);
    expect(parsed.circuitBreaker.action).toBe('Pausa totale strategia');
    expect(parsed.liquidityReservePct).toBe(20);
  });

  it('validazione positiva per PM-001', () => {
    const parsed = parseStrategy(PM001_ROW);
    const errors = validateParsedStrategy(parsed);
    expect(errors).toHaveLength(0);
  });

  it('validazione rileva mancanza stop loss', () => {
    const rulesNoSL = {
      ...PM001_RULES,
      exit_rules: PM001_RULES.exit_rules.filter(r => r.id !== 'stop_loss'),
    };
    const parsed = parseStrategy({ ...PM001_ROW, rules: rulesNoSL });
    const errors = validateParsedStrategy(parsed);
    expect(errors.some(e => e.includes('stop loss'))).toBe(true);
  });

  it('validazione rileva tier non sommano a 100%', () => {
    const rulesBadTiers = {
      ...PM001_RULES,
      bankroll_tiers: {
        tier1: { allocation_pct: 50, description: 'Alta' },
        tier2: { allocation_pct: 30, description: 'Media' },
        // Manca tier3 -> somma 80%
      },
    };
    const parsed = parseStrategy({ ...PM001_ROW, rules: rulesBadTiers });
    const errors = validateParsedStrategy(parsed);
    expect(errors.some(e => e.includes('100%'))).toBe(true);
  });

  it('errore se mancano entry_rules nel JSON', () => {
    const badRules = { ...PM001_RULES, entry_rules: undefined } as unknown as StrategyRulesJson;
    expect(() => parseStrategy({ ...PM001_ROW, rules: badRules })).toThrow('missing entry_rules');
  });
});
