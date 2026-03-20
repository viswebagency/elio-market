import { describe, it, expect } from 'vitest';
import { evaluateEntry, evaluateExit, evaluateComposite, evaluateNot, MarketSnapshot } from '@/core/engine/evaluator';
import { parseStrategy, StrategyRulesJson } from '@/core/engine/dsl-parser';

const PM001_RULES: StrategyRulesJson = {
  entry_rules: [
    { id: 'price_range', condition: '', description: '', params: { min_price: 0.05, max_price: 0.45 } },
    { id: 'volume_min', condition: '', description: '', params: { min_volume_usd: 100000 } },
    { id: 'expiry_window', condition: '', description: '', params: { max_days_to_expiry: 30 } },
    { id: 'catalyst', condition: '', description: '', params: { requires_catalyst: true } },
  ],
  exit_rules: [
    { id: 'tp_1_third', condition: '', description: '', params: { profit_pct: 50, sell_fraction: 0.333 } },
    { id: 'stop_loss', condition: '', description: '', params: { loss_pct: -30, sell_fraction: 1.0 } },
  ],
  bankroll_tiers: {
    tier1: { allocation_pct: 50, description: '' },
    tier2: { allocation_pct: 30, description: '' },
    tier3: { allocation_pct: 20, description: '' },
  },
  liquidity_reserve_pct: 20,
  circuit_breaker_total: { loss_pct: -50, action: '', description: '' },
};

const PM001_ROW = {
  id: 'test-strategy-id',
  code: 'PM-001',
  name: 'Test Strategy',
  area: 'polymarket',
  rules: PM001_RULES,
  max_drawdown: 50,
  max_allocation_pct: 10,
  max_consecutive_losses: 5,
};

function makeMarket(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  const now = new Date();
  const in15Days = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

  return {
    marketId: 'mkt-001',
    name: 'Test Market',
    price: 0.25,
    volume24hUsd: 50000,
    totalVolumeUsd: 500000,
    expiryDate: in15Days.toISOString(),
    hasCatalyst: true,
    catalystDescription: 'Elezione imminente',
    category: 'politics',
    status: 'open',
    ...overrides,
  };
}

describe('Evaluator - Entry', () => {
  const strategy = parseStrategy(PM001_ROW);

  it('mercato che soddisfa tutte le condizioni PM-001', () => {
    const market = makeMarket();
    const result = evaluateEntry(strategy, market);

    expect(result.passed).toBe(true);
    expect(result.totalScore).toBeGreaterThan(0);
    expect(result.totalScore).toBeLessThanOrEqual(100);
    expect(result.failedConditions).toHaveLength(0);
  });

  it('prezzo fuori range -> fallimento', () => {
    const market = makeMarket({ price: 0.80 });
    const result = evaluateEntry(strategy, market);

    expect(result.passed).toBe(false);
    expect(result.failedConditions.some(c => c.ruleId === 'price_range')).toBe(true);
  });

  it('volume insufficiente -> fallimento', () => {
    const market = makeMarket({ totalVolumeUsd: 50000 });
    const result = evaluateEntry(strategy, market);

    expect(result.passed).toBe(false);
    expect(result.failedConditions.some(c => c.ruleId === 'volume_min')).toBe(true);
  });

  it('scadenza troppo lontana -> fallimento', () => {
    const farFuture = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    const market = makeMarket({ expiryDate: farFuture });
    const result = evaluateEntry(strategy, market);

    expect(result.passed).toBe(false);
    expect(result.failedConditions.some(c => c.ruleId === 'expiry_window')).toBe(true);
  });

  it('nessun catalizzatore -> fallimento', () => {
    const market = makeMarket({ hasCatalyst: false });
    const result = evaluateEntry(strategy, market);

    expect(result.passed).toBe(false);
    expect(result.failedConditions.some(c => c.ruleId === 'catalyst')).toBe(true);
  });

  it('mercato chiuso -> fallimento immediato', () => {
    const market = makeMarket({ status: 'closed' });
    const result = evaluateEntry(strategy, market);

    expect(result.passed).toBe(false);
    expect(result.totalScore).toBe(0);
  });

  it('prezzo al centro del range ha score maggiore', () => {
    const strategy = parseStrategy(PM001_ROW);
    const centerMarket = makeMarket({ price: 0.25 }); // centro
    const edgeMarket = makeMarket({ price: 0.05 });  // bordo

    const centerResult = evaluateEntry(strategy, centerMarket);
    const edgeResult = evaluateEntry(strategy, edgeMarket);

    expect(centerResult.totalScore).toBeGreaterThan(edgeResult.totalScore);
  });

  it('nessuna data di scadenza -> fallimento expiry', () => {
    const market = makeMarket({ expiryDate: null });
    const result = evaluateEntry(strategy, market);

    expect(result.passed).toBe(false);
    expect(result.failedConditions.some(c => c.ruleId === 'expiry_window')).toBe(true);
  });
});

describe('Evaluator - Exit', () => {
  const strategy = parseStrategy(PM001_ROW);

  it('profitto +60% -> take profit triggerato', () => {
    const exits = evaluateExit(strategy.exitRules, 60);
    const tp = exits.find(e => e.ruleId === 'tp_1_third');

    expect(tp).toBeDefined();
    expect(tp!.triggered).toBe(true);
    expect(tp!.sellFraction).toBe(0.333);
  });

  it('perdita -35% -> stop loss triggerato', () => {
    const exits = evaluateExit(strategy.exitRules, -35);
    const sl = exits.find(e => e.ruleId === 'stop_loss');

    expect(sl).toBeDefined();
    expect(sl!.triggered).toBe(true);
    expect(sl!.isStopLoss).toBe(true);
    expect(sl!.sellFraction).toBe(1.0);
  });

  it('profitto +20% -> nessun trigger', () => {
    const exits = evaluateExit(strategy.exitRules, 20);
    const triggered = exits.filter(e => e.triggered);
    expect(triggered).toHaveLength(0);
  });

  it('perdita -25% -> nessun trigger (sotto soglia SL)', () => {
    const exits = evaluateExit(strategy.exitRules, -25);
    const triggered = exits.filter(e => e.triggered);
    expect(triggered).toHaveLength(0);
  });
});

describe('Evaluator - Composizione logica', () => {
  it('AND: tutte passate -> passed', () => {
    const results = [
      { ruleId: 'a', passed: true, score: 80, detail: '' },
      { ruleId: 'b', passed: true, score: 60, detail: '' },
    ];
    const result = evaluateComposite(results, 'and');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(70);
  });

  it('AND: una fallita -> failed', () => {
    const results = [
      { ruleId: 'a', passed: true, score: 80, detail: '' },
      { ruleId: 'b', passed: false, score: 0, detail: '' },
    ];
    const result = evaluateComposite(results, 'and');
    expect(result.passed).toBe(false);
  });

  it('OR: una passata -> passed', () => {
    const results = [
      { ruleId: 'a', passed: false, score: 0, detail: '' },
      { ruleId: 'b', passed: true, score: 80, detail: '' },
    ];
    const result = evaluateComposite(results, 'or');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(80);
  });

  it('NOT: inverte il risultato', () => {
    const original = { ruleId: 'a', passed: true, score: 90, detail: 'test' };
    const negated = evaluateNot(original);
    expect(negated.passed).toBe(false);
    expect(negated.score).toBe(0);
  });

  it('lista vuota -> failed', () => {
    expect(evaluateComposite([], 'and').passed).toBe(false);
    expect(evaluateComposite([], 'or').passed).toBe(false);
  });
});
