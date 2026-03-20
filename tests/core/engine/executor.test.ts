import { describe, it, expect } from 'vitest';
import { StrategyExecutor } from '@/core/engine/executor';
import { parseStrategy, StrategyRulesJson } from '@/core/engine/dsl-parser';
import { MarketSnapshot } from '@/core/engine/evaluator';
import { SignalType } from '@/core/engine/signals';

const PM001_RULES: StrategyRulesJson = {
  entry_rules: [
    { id: 'price_range', condition: '', description: '', params: { min_price: 0.05, max_price: 0.45 } },
    { id: 'volume_min', condition: '', description: '', params: { min_volume_usd: 100000 } },
    { id: 'expiry_window', condition: '', description: '', params: { max_days_to_expiry: 30 } },
    { id: 'catalyst', condition: '', description: '', params: { requires_catalyst: true } },
  ],
  exit_rules: [
    { id: 'tp_1_third', condition: '', description: '', params: { profit_pct: 50, sell_fraction: 0.333 } },
    { id: 'tp_half', condition: '', description: '', params: { profit_pct: 100, sell_fraction: 0.5 } },
    { id: 'tp_full', condition: '', description: '', params: { profit_pct: 200, sell_fraction: 0.95 } },
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
  id: 'strat-pm001',
  code: 'PM-001',
  name: 'Compra la Paura',
  area: 'polymarket',
  rules: PM001_RULES,
  max_drawdown: 50,
  max_allocation_pct: 10,
  max_consecutive_losses: 5,
};

function makeMarket(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  const in15Days = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
  return {
    marketId: 'mkt-001',
    name: 'Test Election Market',
    price: 0.25,
    volume24hUsd: 50000,
    totalVolumeUsd: 500000,
    expiryDate: in15Days.toISOString(),
    hasCatalyst: true,
    catalystDescription: 'Elezione in 5 giorni',
    category: 'politics',
    status: 'open',
    ...overrides,
  };
}

describe('StrategyExecutor - Observation mode', () => {
  it('genera segnali senza eseguire in observation', () => {
    const strategy = parseStrategy(PM001_ROW);
    const executor = new StrategyExecutor(strategy, { mode: 'observation' });

    const goodMarket = makeMarket();
    const batch = executor.evaluateMarkets([goodMarket]);

    expect(batch.marketsEvaluated).toBe(1);
    expect(batch.marketsMatched).toBe(1);

    const entrySignals = batch.signals.filter(s => s.type === SignalType.ENTER_LONG);
    expect(entrySignals).toHaveLength(1);
    expect(entrySignals[0].confidence).toBeGreaterThan(0);

    const snap = executor.getPortfolioSnapshot();
    expect(snap.openPositions).toHaveLength(0);
  });

  it('genera SKIP per mercati non qualificati', () => {
    const strategy = parseStrategy(PM001_ROW);
    const executor = new StrategyExecutor(strategy, { mode: 'observation' });

    const badMarket = makeMarket({ price: 0.90 }); // fuori range
    const batch = executor.evaluateMarkets([badMarket]);

    expect(batch.marketsMatched).toBe(0);

    const skipSignals = batch.signals.filter(s => s.type === SignalType.SKIP);
    expect(skipSignals).toHaveLength(1);
  });
});

describe('StrategyExecutor - Paper mode', () => {
  it('esegue posizioni virtuali in paper mode', () => {
    const strategy = parseStrategy(PM001_ROW);
    const executor = new StrategyExecutor(strategy, {
      mode: 'paper',
      initialBankroll: 1000,
      slippagePct: 0,
    });

    const market = makeMarket();
    executor.evaluateMarkets([market]);

    const snap = executor.getPortfolioSnapshot();
    expect(snap.openPositions).toHaveLength(1);
    expect(snap.availableCash).toBeLessThan(1000);
  });

  it('gestisce mix di mercati buoni e cattivi', () => {
    const strategy = parseStrategy(PM001_ROW);
    const executor = new StrategyExecutor(strategy, {
      mode: 'paper',
      initialBankroll: 1000,
      slippagePct: 0,
    });

    const markets: MarketSnapshot[] = [
      makeMarket({ marketId: 'good-1', name: 'Good Market 1' }),
      makeMarket({ marketId: 'bad-1', name: 'Bad Market', price: 0.90 }),
      makeMarket({ marketId: 'good-2', name: 'Good Market 2' }),
    ];

    const batch = executor.evaluateMarkets(markets);

    expect(batch.marketsEvaluated).toBe(3);
    expect(batch.marketsMatched).toBe(2);

    const entries = batch.signals.filter(s => s.type === SignalType.ENTER_LONG);
    expect(entries).toHaveLength(2);

    const skips = batch.signals.filter(s => s.type === SignalType.SKIP);
    expect(skips).toHaveLength(1);
  });

  it('valuta exit su posizioni aperte con aggiornamento prezzo', () => {
    const strategy = parseStrategy(PM001_ROW);
    const executor = new StrategyExecutor(strategy, {
      mode: 'paper',
      initialBankroll: 1000,
      slippagePct: 0,
    });

    // Prima valutazione: apre posizione
    const market = makeMarket({ price: 0.20 });
    executor.evaluateMarkets([market]);

    expect(executor.getPortfolioSnapshot().openPositions).toHaveLength(1);

    // Seconda valutazione: prezzo salito del 60% -> TP1 trigger
    const updatedMarket = makeMarket({ price: 0.32 }); // +60% da 0.20
    const batch = executor.evaluateMarkets([updatedMarket]);

    const exitSignals = batch.signals.filter(
      s => s.type === SignalType.EXIT_PARTIAL || s.type === SignalType.EXIT_FULL || s.type === SignalType.STOP_LOSS,
    );

    // Dovrebbe triggerare almeno il TP1 (+50%)
    expect(exitSignals.length).toBeGreaterThanOrEqual(1);
  });

  it('stop loss chiude tutta la posizione', () => {
    const strategy = parseStrategy(PM001_ROW);
    const executor = new StrategyExecutor(strategy, {
      mode: 'paper',
      initialBankroll: 1000,
      slippagePct: 0,
    });

    const market = makeMarket({ price: 0.20 });
    executor.evaluateMarkets([market]);

    // Prezzo crollato del 35% -> SL trigger
    const crashedMarket = makeMarket({ price: 0.13 });
    const batch = executor.evaluateMarkets([crashedMarket]);

    const slSignals = batch.signals.filter(s => s.type === SignalType.STOP_LOSS);
    expect(slSignals.length).toBeGreaterThanOrEqual(1);

    const snap = executor.getPortfolioSnapshot();
    expect(snap.openPositions).toHaveLength(0);
    expect(snap.closedPositions).toHaveLength(1);
  });
});

describe('StrategyExecutor - Circuit Breaker', () => {
  it('ferma la valutazione quando circuit breaker attivo', () => {
    const cbRow = {
      ...PM001_ROW,
      max_consecutive_losses: 2,
    };
    const strategy = parseStrategy(cbRow);
    const executor = new StrategyExecutor(strategy, {
      mode: 'paper',
      initialBankroll: 1000,
      slippagePct: 0,
    });

    // Apri e chiudi 2 posizioni in perdita
    for (let i = 0; i < 2; i++) {
      const market = makeMarket({ marketId: `mkt-${i}`, price: 0.20 });
      executor.evaluateMarkets([market]);

      const crashedMarket = makeMarket({ marketId: `mkt-${i}`, price: 0.10 });
      executor.evaluateMarkets([crashedMarket]);
    }

    expect(executor.isCircuitBroken()).toBe(true);

    // Nuovo mercato perfetto -> nessun segnale
    const newMarket = makeMarket({ marketId: 'mkt-new' });
    const batch = executor.evaluateMarkets([newMarket]);
    expect(batch.signals).toHaveLength(0);
  });
});

describe('StrategyExecutor - Signal properties', () => {
  it('segnali di entry hanno tutti i campi richiesti', () => {
    const strategy = parseStrategy(PM001_ROW);
    const executor = new StrategyExecutor(strategy, { mode: 'observation' });

    const market = makeMarket();
    const batch = executor.evaluateMarkets([market]);

    const entry = batch.signals.find(s => s.type === SignalType.ENTER_LONG);
    expect(entry).toBeDefined();
    expect(entry!.marketId).toBe('mkt-001');
    expect(entry!.strategyId).toBe('strat-pm001');
    expect(entry!.strategyCode).toBe('PM-001');
    expect(entry!.confidence).toBeGreaterThanOrEqual(0);
    expect(entry!.confidence).toBeLessThanOrEqual(100);
    expect(entry!.reason).toBeTruthy();
    expect(entry!.suggestedStake).toBeGreaterThanOrEqual(0);
    expect(entry!.timestamp).toBeTruthy();
    expect(entry!.currentPrice).toBe(0.25);
  });

  it('log contiene tutte le operazioni', () => {
    const strategy = parseStrategy(PM001_ROW);
    const executor = new StrategyExecutor(strategy, { mode: 'observation' });

    executor.evaluateMarkets([makeMarket()]);

    const logs = executor.getLogs();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].mode).toBe('observation');
  });
});
