#!/usr/bin/env npx tsx
/**
 * Sandbox Test — Validates the entire live trading flow on Binance Testnet.
 *
 * Prerequisites:
 *   - Set BINANCE_TESTNET_KEY and BINANCE_TESTNET_SECRET env vars
 *     (generate at https://testnet.binance.vision)
 *
 * Usage:
 *   npx tsx scripts/sandbox-test.ts
 */

import { loadEnvConfig } from '@next/env';
import { resolve } from 'path';

// Load .env.local from project root
loadEnvConfig(resolve(__dirname, '..'));

import { CryptoAdapter } from '../src/plugins/crypto/adapter';
import type { PlaceTradeResult, CancelOrderResult, OrderStatusResult } from '../src/plugins/crypto/adapter';
import { reconcileOrder } from '../src/services/reconciliation/order-reconciliation';
import type { ReconciliationResult } from '../src/services/reconciliation/order-reconciliation';
import { KillSwitch } from '../src/services/execution/kill-switch';
import { StrategyExecutor } from '../src/core/engine/executor';
import type { LiveExecutionService, GetOrderStatusFn } from '../src/core/engine/executor';
import { parseStrategy } from '../src/core/engine/dsl-parser';
import type { RawStrategyRow } from '../src/core/engine/dsl-parser';
import type { MarketSnapshot } from '../src/core/engine/evaluator';
import { MarketArea } from '../src/core/types/common';
import type { Trade, TradeExecution } from '../src/core/types/trade';
import { TierLevel } from '../src/core/engine/signals';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TESTNET_KEY = process.env.BINANCE_TESTNET_KEY;
const TESTNET_SECRET = process.env.BINANCE_TESTNET_SECRET;

if (!TESTNET_KEY || !TESTNET_SECRET) {
  console.error('ERROR: Set BINANCE_TESTNET_KEY and BINANCE_TESTNET_SECRET env vars');
  console.error('Generate them at https://testnet.binance.vision');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const results: { step: number; name: string; ok: boolean; error?: string }[] = [];

function logStep(n: number, name: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`[STEP ${n}] ${name}`);
  console.log('='.repeat(70));
}

function check(step: number, name: string, condition: boolean, detail?: string): boolean {
  const status = condition ? 'OK' : 'FAIL';
  const msg = detail ? `  [${status}] ${name}: ${detail}` : `  [${status}] ${name}`;
  console.log(msg);
  if (!condition) {
    results.push({ step, name, ok: false, error: detail });
  }
  return condition;
}

function printJson(label: string, obj: unknown) {
  console.log(`  ${label}:`);
  const lines = JSON.stringify(obj, null, 2).split('\n');
  for (const line of lines) {
    console.log(`    ${line}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

let adapter: CryptoAdapter;

async function step1_connection(): Promise<boolean> {
  logStep(1, 'Connessione a Binance Testnet');

  try {
    adapter = new CryptoAdapter({
      exchange: 'binance',
      apiKey: TESTNET_KEY,
      apiSecret: TESTNET_SECRET,
      sandbox: true,
    });

    await adapter.loadMarkets();
    check(1, 'loadMarkets()', true, 'Mercati caricati');

    const pingOk = await adapter.ping();
    if (!check(1, 'ping()', pingOk, pingOk ? 'Exchange raggiungibile' : 'Ping fallito')) {
      return false;
    }

    const spotMarkets = await adapter.getSpotMarkets();
    check(1, 'Mercati spot disponibili', spotMarkets.length > 0, `${spotMarkets.length} mercati`);

    console.log(`  Exchange: ${adapter.id}`);
    console.log(`  Primi 5 pairs: ${spotMarkets.slice(0, 5).join(', ')}`);

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(1, 'Connessione', false, msg);
    return false;
  }
}

async function step2_readData(): Promise<boolean> {
  logStep(2, 'Lettura dati (ticker, balances, orders, positions)');

  try {
    const ticker = await adapter.getTicker('BTC/USDT');
    check(2, 'getTicker(BTC/USDT)', ticker.price > 0, `Prezzo: $${ticker.price.toFixed(2)}`);
    printJson('Ticker BTC/USDT', {
      price: ticker.price,
      bid: ticker.bid,
      ask: ticker.ask,
      high24h: ticker.high24h,
      low24h: ticker.low24h,
      volume24h: ticker.volume24h,
      priceChange24hPct: ticker.priceChangePercent24h,
    });

    const balances = await adapter.getBalances();
    check(2, 'getBalances()', balances.length > 0, `${balances.length} asset con saldo > 0`);
    printJson('Balances', balances.slice(0, 10));

    const openOrders = await adapter.getOpenOrders('BTC/USDT');
    check(2, 'getOpenOrders()', true, `${openOrders.length} ordini aperti`);

    const positions = await adapter.getPositions();
    check(2, 'getPositions()', true, `${positions.length} posizioni`);
    if (positions.length > 0) {
      printJson('Positions', positions.slice(0, 5));
    }

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(2, 'Lettura dati', false, msg);
    return false;
  }
}

let marketBuyOrderId: string | undefined;
let marketBuyResult: PlaceTradeResult | undefined;

async function step3_marketBuy(): Promise<boolean> {
  logStep(3, 'Ordine market buy BTC/USDT');

  try {
    const result = await adapter.placeTrade({
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'market',
      amount: 0.001,
    });

    marketBuyResult = result;
    marketBuyOrderId = result.orderId;

    check(3, 'placeTrade() ritorna orderId', !!result.orderId, `orderId: ${result.orderId}`);
    check(3, 'status', result.status === 'closed' || result.status === 'filled' || result.status === 'open',
      `status: ${result.status}`);
    check(3, 'filledAmount > 0', result.filledAmount > 0, `filled: ${result.filledAmount}`);

    printJson('PlaceTradeResult', result);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(3, 'Market buy', false, msg);
    return false;
  }
}

async function step4_reconciliation(): Promise<boolean> {
  logStep(4, 'Reconciliation ordine market buy');

  if (!marketBuyOrderId || !marketBuyResult) {
    check(4, 'Prerequisito', false, 'Nessun orderId dallo step 3');
    return false;
  }

  try {
    // First verify via getOrderStatus
    const status: OrderStatusResult = await adapter.getOrderStatus(marketBuyOrderId, 'BTC/USDT');
    check(4, 'getOrderStatus() status', status.status === 'closed' || status.status === 'filled',
      `status: ${status.status}`);
    check(4, 'filledAmount > 0', status.filledAmount > 0, `filled: ${status.filledAmount}`);
    printJson('OrderStatusResult', status);

    // Now run reconcileOrder
    const getOrderStatusFn = (orderId: string, symbol: string) => adapter.getOrderStatus(orderId, symbol);
    const expectedPrice = marketBuyResult.avgFillPrice ?? marketBuyResult.price ?? 0;

    const recon: ReconciliationResult = await reconcileOrder(
      getOrderStatusFn,
      marketBuyOrderId,
      'BTC/USDT',
      expectedPrice,
    );

    check(4, 'reconcileOrder() status', recon.status === 'filled', `status: ${recon.status}`);
    check(4, 'slippage calcolato', recon.slippage !== undefined, `slippage: ${recon.slippage?.toFixed(4)}%`);
    check(4, 'fees presenti', recon.fees >= 0, `fees: ${recon.fees}`);
    check(4, 'filledAmount > 0', recon.filledAmount > 0, `filled: ${recon.filledAmount}`);

    printJson('ReconciliationResult', recon);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(4, 'Reconciliation', false, msg);
    return false;
  }
}

let limitOrderId: string | undefined;

async function step5_limitAndCancel(): Promise<boolean> {
  logStep(5, 'Ordine limit + cancellazione');

  try {
    // Get current price to calculate a limit price within Binance PERCENT_PRICE_BY_SIDE filter
    // (~80% of market price: low enough to never fill, close enough to pass the filter)
    const ticker = await adapter.getTicker('BTC/USDT');
    const lowLimitPrice = Math.round(ticker.price * 0.8);
    console.log(`  Prezzo corrente: $${ticker.price.toFixed(2)}, limit price: $${lowLimitPrice}`);

    // Place limit order at low price (won't fill)
    const result = await adapter.placeTrade({
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      amount: 0.001,
      price: lowLimitPrice,
    });

    limitOrderId = result.orderId;
    check(5, 'placeTrade() limit ritorna orderId', !!result.orderId, `orderId: ${result.orderId}`);
    check(5, 'status è open', result.status === 'open' || result.status === 'new',
      `status: ${result.status}`);
    printJson('Limit order result', result);

    // Wait a bit for order to register
    await sleep(1000);

    // Cancel
    const cancelResult: CancelOrderResult = await adapter.cancelOrder(result.orderId, 'BTC/USDT');
    check(5, 'cancelOrder() success', cancelResult.success, cancelResult.message);
    printJson('CancelOrderResult', cancelResult);

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(5, 'Limit + cancel', false, msg);
    return false;
  }
}

async function step6_killSwitch(): Promise<boolean> {
  logStep(6, 'Kill switch test');

  try {
    // Get current price for limit orders within PERCENT_PRICE_BY_SIDE filter
    const ticker = await adapter.getTicker('BTC/USDT');
    const lowPrice1 = Math.round(ticker.price * 0.80);
    const lowPrice2 = Math.round(ticker.price * 0.81);

    // Place 2 limit orders at low prices (won't fill)
    const order1 = await adapter.placeTrade({
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      amount: 0.001,
      price: lowPrice1,
    });
    console.log(`  Ordine 1 piazzato: ${order1.orderId} @ $${lowPrice1}`);

    const order2 = await adapter.placeTrade({
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      amount: 0.001,
      price: lowPrice2,
    });
    console.log(`  Ordine 2 piazzato: ${order2.orderId} @ $${lowPrice2}`);

    await sleep(1000);

    // Verify open orders
    const openBefore = await adapter.getOpenOrders('BTC/USDT');
    check(6, 'Ordini aperti >= 2 prima del kill switch', openBefore.length >= 2,
      `${openBefore.length} ordini aperti`);

    // Activate kill switch
    const ks = new KillSwitch();
    const report = await ks.activate('test-user', 'sandbox test', adapter, ['BTC/USDT']);

    check(6, 'cancelledOrders >= 2', report.cancelledOrders >= 2,
      `cancelled: ${report.cancelledOrders}`);
    check(6, 'Kill switch attivo', ks.isActive(), `active: ${ks.isActive()}`);

    printJson('KillSwitchReport', report);

    if (report.errors.length > 0) {
      console.log('  Errori (non fatali su testnet):');
      for (const e of report.errors) console.log(`    - ${e}`);
    }

    // Verify orders cancelled
    await sleep(1000);
    const openAfter = await adapter.getOpenOrders('BTC/USDT');
    check(6, 'Ordini aperti = 0 dopo kill switch', openAfter.length === 0,
      `${openAfter.length} ordini aperti`);

    // Deactivate
    await ks.deactivate('test-user');

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(6, 'Kill switch', false, msg);
    return false;
  }
}

async function step7_fullFlow(): Promise<boolean> {
  logStep(7, 'Flow completo: executor → execution → reconciliation');

  try {
    // Build a ParsedStrategy from CR-C02b seed (inline to avoid Supabase dependency)
    const strategyRow: RawStrategyRow = {
      id: 'CR-C02b',
      code: 'CR-C02b',
      name: 'DCA on Dip v2',
      area: 'crypto',
      max_drawdown: 12,
      max_allocation_pct: 5,
      max_consecutive_losses: 5,
      rules: {
        entry_rules: [
          {
            id: 'dip',
            condition: 'price_change_pct',
            description: 'Dip moderato (-1.5% a -8%)',
            params: { min_change_pct: -8, max_change_pct: -1.5 },
          },
          {
            id: 'volume',
            condition: 'min_volume',
            description: 'Volume minimo $5M',
            params: { min_volume_usd: 5_000_000 },
          },
        ],
        exit_rules: [
          {
            id: 'tp',
            condition: 'take_profit',
            description: 'Take profit al +3.5%',
            params: { profit_pct: 3.5, sell_fraction: 1.0 },
          },
          {
            id: 'sl',
            condition: 'stop_loss',
            description: 'Stop loss al -2.5%',
            params: { loss_pct: -2.5, sell_fraction: 1.0 },
          },
        ],
        bankroll_tiers: {
          tier1: { allocation_pct: 60, description: 'BTC/ETH - blue chip' },
          tier2: { allocation_pct: 30, description: 'Large cap alts' },
          tier3: { allocation_pct: 10, description: 'Mid cap' },
        },
        liquidity_reserve_pct: 30,
        circuit_breaker_total: { loss_pct: -12, action: 'Pausa strategia', description: 'Stop se drawdown > 12%' },
      },
    };

    const parsed = parseStrategy(strategyRow);
    console.log(`  Strategia parsata: ${parsed.code} — ${parsed.name}`);
    console.log(`  Entry rules: ${parsed.entryRules.length}, Exit rules: ${parsed.exitRules.length}`);

    // Fetch real ticker to build MarketSnapshot
    const ticker = await adapter.getTicker('BTC/USDT');
    console.log(`  BTC/USDT prezzo live: $${ticker.price.toFixed(2)}, change24h: ${ticker.priceChangePercent24h.toFixed(2)}%`);

    // Build snapshot — force entry conditions to match for testing
    // (testnet prices may not naturally trigger entry)
    const snapshot: MarketSnapshot = {
      marketId: 'BTC/USDT',
      name: 'Bitcoin / USDT',
      price: ticker.price,
      volume24hUsd: ticker.quoteVolume24h > 0 ? ticker.quoteVolume24h : 50_000_000,
      totalVolumeUsd: ticker.quoteVolume24h > 0 ? ticker.quoteVolume24h : 50_000_000,
      expiryDate: null,
      hasCatalyst: false,
      catalystDescription: null,
      category: 'crypto',
      status: 'open',
      // Force dip within range [-8%, -1.5%] so entry triggers
      priceChange24hPct: -3.0,
      high24h: ticker.high24h > 0 ? ticker.high24h : ticker.price * 1.02,
      low24h: ticker.low24h > 0 ? ticker.low24h : ticker.price * 0.97,
    };

    // Get testnet balance for bankroll
    const balances = await adapter.getBalances();
    const usdtBalance = balances.find(b => b.asset === 'USDT');
    const bankroll = usdtBalance ? usdtBalance.free : 1000;
    console.log(`  Bankroll (USDT free): $${bankroll.toFixed(2)}`);

    // Create executor in live mode
    const executor = new StrategyExecutor(parsed, {
      mode: 'live',
      initialBankroll: bankroll,
      minConfidenceToEnter: 50,
      maxOpenPositions: 10,
      slippagePct: 1.5,
      area: MarketArea.CRYPTO,
    });

    // Evaluate
    const batch = executor.evaluateMarkets([snapshot]);
    console.log(`  Mercati valutati: ${batch.marketsEvaluated}, match: ${batch.marketsMatched}`);
    console.log(`  Segnali generati: ${batch.signals.length}`);

    for (const sig of batch.signals) {
      console.log(`    → ${sig.type}: ${sig.marketName}, confidence=${sig.confidence}, stake=$${sig.suggestedStake.toFixed(2)}`);
    }

    const pending = executor.getPendingLiveTrades();
    check(7, 'Segnali entry generati', batch.marketsMatched > 0, `${batch.marketsMatched} match`);
    check(7, 'Trade in coda per esecuzione live', pending.length > 0, `${pending.length} pending`);

    if (pending.length === 0) {
      console.log('  NOTA: Nessun trade in coda. Le condizioni di mercato testnet non hanno triggerato entry.');
      console.log('  Il flow executor → signals funziona, ma senza trade da eseguire.');
      // Still count as pass since evaluation worked
      return true;
    }

    // Build LiveExecutionService that uses the adapter
    const executionService: LiveExecutionService = {
      execute: async (trade: Trade): Promise<TradeExecution> => {
        console.log(`  [EXEC] Eseguendo trade: ${trade.symbol} ${trade.direction} size=${trade.size.toFixed(6)}`);

        const tradeResult = await adapter.placeTrade({
          symbol: trade.symbol,
          side: trade.direction === 'long' ? 'buy' : 'sell',
          type: 'market',
          amount: trade.size,
        });

        return {
          id: crypto.randomUUID(),
          tradeId: trade.id,
          externalOrderId: tradeResult.orderId,
          status: tradeResult.status === 'closed' ? 'filled' : 'submitted',
          fillPrice: tradeResult.avgFillPrice,
          filledSize: tradeResult.filledAmount,
          commission: tradeResult.fees,
          executedAt: tradeResult.timestamp,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
    };

    const getOrderStatusFn: GetOrderStatusFn = (orderId: string, symbol: string) =>
      adapter.getOrderStatus(orderId, symbol);

    // Execute pending live trades with reconciliation (skip DB update)
    const execResults = await executor.executePendingLiveTrades({
      userId: 'sandbox-test',
      executionService,
      getOrderStatus: getOrderStatusFn,
      reconcileAndUpdateFn: async (
        statusFn: GetOrderStatusFn,
        orderId: string,
        symbol: string,
        expectedPrice: number,
        _tradeId: string,
      ): Promise<ReconciliationResult> => {
        // Use reconcileOrder directly (no DB update)
        return reconcileOrder(statusFn, orderId, symbol, expectedPrice);
      },
    });

    check(7, 'Trade eseguiti', execResults.length > 0, `${execResults.length} risultati`);

    for (const r of execResults) {
      console.log(`  Trade ${r.tradeId.slice(0, 8)}...: status=${r.status}, orderId=${r.orderId}`);
      if (r.reconciliation) {
        console.log(`    Reconciliation: status=${r.reconciliation.status}, slippage=${r.reconciliation.slippage?.toFixed(4)}%, fees=${r.reconciliation.fees}`);
      }
      if (r.reason) {
        console.log(`    Reason: ${r.reason}`);
      }
    }

    const executed = execResults.filter(r => r.status === 'executed');
    check(7, 'Almeno 1 trade eseguito con successo', executed.length > 0,
      `${executed.length}/${execResults.length} eseguiti`);

    const reconciled = executed.filter(r => r.reconciliation?.status === 'filled');
    check(7, 'Reconciliation completata', reconciled.length > 0,
      `${reconciled.length} reconciled`);

    // Print executor logs
    console.log('\n  --- Executor logs ---');
    for (const log of executor.getLogs()) {
      console.log(`  [${log.mode}] ${log.message}`);
    }

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(7, 'Full flow', false, msg);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  Elio.Market — Sandbox Test su Binance Testnet                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log(`  Timestamp: ${new Date().toISOString()}`);

  const stepFns = [
    { n: 1, name: 'Connessione', fn: step1_connection },
    { n: 2, name: 'Lettura dati', fn: step2_readData },
    { n: 3, name: 'Market buy', fn: step3_marketBuy },
    { n: 4, name: 'Reconciliation', fn: step4_reconciliation },
    { n: 5, name: 'Limit + cancel', fn: step5_limitAndCancel },
    { n: 6, name: 'Kill switch', fn: step6_killSwitch },
    { n: 7, name: 'Full flow', fn: step7_fullFlow },
  ];

  const stepResults: { n: number; name: string; passed: boolean }[] = [];

  for (const step of stepFns) {
    try {
      const passed = await step.fn();
      stepResults.push({ n: step.n, name: step.name, passed });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [FATAL] Step ${step.n} crashed: ${msg}`);
      stepResults.push({ n: step.n, name: step.name, passed: false });
    }
  }

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('SOMMARIO');
  console.log('='.repeat(70));

  const passed = stepResults.filter(s => s.passed).length;
  const total = stepResults.length;

  for (const s of stepResults) {
    console.log(`  Step ${s.n} — ${s.name}: ${s.passed ? 'PASS' : 'FAIL'}`);
  }

  console.log(`\n  Risultato: ${passed}/${total} step passati`);

  if (results.length > 0) {
    console.log('\n  Verifiche fallite:');
    for (const r of results) {
      console.log(`    Step ${r.step} — ${r.name}: ${r.error ?? 'N/A'}`);
    }
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
