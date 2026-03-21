#!/usr/bin/env npx tsx
/**
 * CLI Script — Crypto Backtest with Real Historical Data
 *
 * Downloads OHLCV data from Binance, runs L1+L2 on all 11 strategies,
 * and prints a comparative report: synthetic vs real data.
 *
 * Usage:
 *   npx tsx scripts/crypto-backtest-real.ts
 *   npx tsx scripts/crypto-backtest-real.ts --force-refresh
 *   npx tsx scripts/crypto-backtest-real.ts --pairs BTC/USDT,ETH/USDT
 *   npx tsx scripts/crypto-backtest-real.ts --timeframe 4h --days 180
 */

import { HistoricalDataFetcher } from '../src/plugins/crypto/historical';
import {
  CRYPTO_STRATEGIES,
  CryptoStrategySeed,
} from '../src/core/strategies/crypto-strategies';
import {
  runCryptoL1,
  runCryptoL2,
  runCryptoL1WithRealData,
  runCryptoL2WithRealData,
  parseCryptoSeedToStrategy,
} from '../src/core/backtest/crypto-pipeline';
import { L1Result, L2Result } from '../src/core/backtest/pipeline';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const forceRefresh = args.includes('--force-refresh');
const pairsIdx = args.indexOf('--pairs');
const timeframeIdx = args.indexOf('--timeframe');
const daysIdx = args.indexOf('--days');

const pairs = pairsIdx >= 0 && args[pairsIdx + 1]
  ? args[pairsIdx + 1].split(',')
  : ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT', 'ADA/USDT', 'DOGE/USDT', 'AVAX/USDT'];

const timeframe = timeframeIdx >= 0 && args[timeframeIdx + 1]
  ? args[timeframeIdx + 1]
  : '2h';

const periodDays = daysIdx >= 0 && args[daysIdx + 1]
  ? parseInt(args[daysIdx + 1], 10)
  : 90;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StrategyReport {
  code: string;
  name: string;
  syntheticL1: L1Result;
  syntheticL2: L2Result | null;
  realL1: L1Result;
  realL2: L2Result | null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(80));
  console.log('  CRYPTO BACKTEST — Real Data vs Synthetic Data');
  console.log('='.repeat(80));
  console.log(`  Pairs: ${pairs.join(', ')}`);
  console.log(`  Timeframe: ${timeframe}`);
  console.log(`  Period: ${periodDays} days`);
  console.log(`  Force refresh: ${forceRefresh}`);
  console.log('='.repeat(80));
  console.log();

  // 1. Download real data
  console.log('[1/3] Downloading historical data from Binance...');
  const fetcher = new HistoricalDataFetcher({
    pairs,
    timeframe,
    periodDays,
    forceRefresh,
  });

  const fetchResults = await fetcher.fetchAll();
  for (const r of fetchResults) {
    console.log(`  ${r.pair}: ${r.candles.length} candles ${r.fromCache ? '(cached)' : '(downloaded)'}`);
  }
  console.log();

  const realData = fetcher.convertToHistoricalData(fetchResults);

  // 2. Run backtest on all strategies
  console.log('[2/3] Running backtests...');
  const reports: StrategyReport[] = [];

  for (const seed of CRYPTO_STRATEGIES) {
    const strategy = parseCryptoSeedToStrategy(seed);

    // Synthetic L1 + L2
    const syntheticL1 = runCryptoL1(strategy, seed);
    const syntheticL2 = syntheticL1.passed ? runCryptoL2(strategy) : null;

    // Real data L1 + L2
    const realL1 = runCryptoL1WithRealData(strategy, realData, seed);
    const realL2 = realL1.passed ? runCryptoL2WithRealData(strategy, realData) : null;

    reports.push({
      code: seed.code,
      name: seed.name,
      syntheticL1,
      syntheticL2,
      realL1,
      realL2,
    });

    const sl1 = syntheticL1.passed ? 'PASS' : 'FAIL';
    const sl2 = syntheticL2 ? (syntheticL2.passed ? 'PASS' : 'FAIL') : 'N/A';
    const rl1 = realL1.passed ? 'PASS' : 'FAIL';
    const rl2 = realL2 ? (realL2.passed ? 'PASS' : 'FAIL') : 'N/A';
    console.log(`  ${seed.code.padEnd(10)} Synthetic: L1=${sl1} L2=${sl2}  |  Real: L1=${rl1} L2=${rl2}`);
  }
  console.log();

  // 3. Print detailed report
  console.log('[3/3] Detailed Report');
  console.log('='.repeat(80));

  printComparisonTable(reports);
  printSummary(reports);
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

function printComparisonTable(reports: StrategyReport[]) {
  const header = [
    'Strategy'.padEnd(12),
    'S-L1'.padEnd(5),
    'S-ROI%'.padEnd(8),
    'S-WR%'.padEnd(7),
    'S-DD%'.padEnd(7),
    'S-L2'.padEnd(5),
    '|',
    'R-L1'.padEnd(5),
    'R-ROI%'.padEnd(8),
    'R-WR%'.padEnd(7),
    'R-DD%'.padEnd(7),
    'R-L2'.padEnd(5),
  ].join(' ');

  console.log(header);
  console.log('-'.repeat(header.length));

  for (const r of reports) {
    const sm = r.syntheticL1.metrics;
    const rm = r.realL1.metrics;

    const row = [
      r.code.padEnd(12),
      (r.syntheticL1.passed ? 'PASS' : 'FAIL').padEnd(5),
      sm.roiTotal.toFixed(2).padStart(7).padEnd(8),
      sm.winRate.toFixed(1).padStart(6).padEnd(7),
      sm.maxDrawdownPct.toFixed(1).padStart(6).padEnd(7),
      (r.syntheticL2 ? (r.syntheticL2.passed ? 'PASS' : 'FAIL') : ' N/A').padEnd(5),
      '|',
      (r.realL1.passed ? 'PASS' : 'FAIL').padEnd(5),
      rm.roiTotal.toFixed(2).padStart(7).padEnd(8),
      rm.winRate.toFixed(1).padStart(6).padEnd(7),
      rm.maxDrawdownPct.toFixed(1).padStart(6).padEnd(7),
      (r.realL2 ? (r.realL2.passed ? 'PASS' : 'FAIL') : ' N/A').padEnd(5),
    ].join(' ');

    console.log(row);
  }

  console.log();
}

function printSummary(reports: StrategyReport[]) {
  const synL1Pass = reports.filter(r => r.syntheticL1.passed).length;
  const synL2Pass = reports.filter(r => r.syntheticL2?.passed).length;
  const realL1Pass = reports.filter(r => r.realL1.passed).length;
  const realL2Pass = reports.filter(r => r.realL2?.passed).length;

  console.log('SUMMARY');
  console.log('-'.repeat(40));
  console.log(`  Synthetic — L1 pass: ${synL1Pass}/${reports.length}, L2 pass: ${synL2Pass}/${reports.length}`);
  console.log(`  Real data — L1 pass: ${realL1Pass}/${reports.length}, L2 pass: ${realL2Pass}/${reports.length}`);
  console.log();

  // Highlight strategies that pass on real but fail on synthetic (or vice versa)
  const divergences = reports.filter(
    r => r.syntheticL1.passed !== r.realL1.passed,
  );

  if (divergences.length > 0) {
    console.log('DIVERGENCES (synthetic vs real):');
    for (const d of divergences) {
      const sStatus = d.syntheticL1.passed ? 'PASS' : 'FAIL';
      const rStatus = d.realL1.passed ? 'PASS' : 'FAIL';
      console.log(`  ${d.code}: Synthetic=${sStatus}, Real=${rStatus}`);
      if (!d.realL1.passed && d.realL1.reason) {
        console.log(`    Reason: ${d.realL1.reason}`);
      }
    }
    console.log();
  }

  // Strategies that pass L2 on real data
  const realL2Passing = reports.filter(r => r.realL2?.passed);
  if (realL2Passing.length > 0) {
    console.log('STRATEGIES PASSING L2 ON REAL DATA:');
    for (const r of realL2Passing) {
      const l2 = r.realL2!;
      console.log(`  ${r.code} (${r.name}): ${l2.passedFolds}/${l2.totalFolds} windows, avgROI=${l2.avgRoi.toFixed(2)}%, avgSharpe=${l2.avgSharpe.toFixed(2)}`);
    }
    console.log();
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
