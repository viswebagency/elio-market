/**
 * Portfolio Sync — compares DB positions with real exchange positions.
 *
 * Detects:
 * - Phantom positions (in DB but not on exchange)
 * - Untracked positions (on exchange but not in DB)
 * - Quantity mismatches (both exist but differ)
 * - USDT balance discrepancies
 *
 * Alerting only — NEVER auto-corrects divergences.
 */

import type { CryptoAdapter, SpotPosition } from '@/plugins/crypto/adapter';
import type { CryptoBalance } from '@/plugins/crypto/types';
import { getTelegramClient } from '@/lib/telegram';
import { auditLogger } from '@/services/execution/audit-logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DbPosition {
  id: string;
  asset_symbol: string;
  quantity: number;
  status: string;
  direction: string;
}

export interface PortfolioMismatch {
  symbol: string;
  dbQuantity: number;
  exchangeQuantity: number;
  diffPct: number;
}

export interface PortfolioSyncResult {
  inSync: boolean;
  phantomPositions: DbPosition[];
  untrackedPositions: SpotPosition[];
  mismatches: PortfolioMismatch[];
  dbPositions: DbPosition[];
  exchangePositions: SpotPosition[];
  usdtBalance: {
    expected: number;
    actual: number;
  };
}

// Dust tolerance: ignore differences < 0.1%
const DUST_TOLERANCE_PCT = 0.1;

const ELIO_CHAT_ID = 8659384895;

// ---------------------------------------------------------------------------
// DB query interface (injected for testability)
// ---------------------------------------------------------------------------

export interface PortfolioDbClient {
  getOpenLivePositions(userId: string): Promise<DbPosition[]>;
}

export function createPortfolioDbClient(db: {
  from: (table: string) => any;
}): PortfolioDbClient {
  return {
    async getOpenLivePositions(userId: string): Promise<DbPosition[]> {
      const { data, error } = await db
        .from('trades')
        .select('id, asset_symbol, quantity, status, direction')
        .eq('user_id', userId)
        .eq('execution_type', 'live')
        .eq('status', 'open');

      if (error) {
        throw new Error(`Failed to load live positions: ${error.message}`);
      }

      return (data ?? []) as DbPosition[];
    },
  };
}

// ---------------------------------------------------------------------------
// Core sync logic
// ---------------------------------------------------------------------------

export async function syncPortfolio(
  adapter: CryptoAdapter,
  userId: string,
  dbClient: PortfolioDbClient,
): Promise<PortfolioSyncResult> {
  // 1. Read DB positions
  const dbPositions = await dbClient.getOpenLivePositions(userId);

  // 2. Read exchange positions and balances
  const exchangePositions = await adapter.getPositions();
  const balances = await adapter.getBalances();

  // 3. Compare
  const phantomPositions: DbPosition[] = [];
  const mismatches: PortfolioMismatch[] = [];

  // Build exchange position map: symbol -> amount
  const exchangeMap = new Map<string, SpotPosition>();
  for (const pos of exchangePositions) {
    // pos.symbol is "BTC/USDT", normalize to just asset symbol for matching
    const asset = pos.symbol.split('/')[0];
    exchangeMap.set(asset, pos);
  }

  // Check each DB position against exchange
  const matchedExchangeSymbols = new Set<string>();

  for (const dbPos of dbPositions) {
    // Normalize: DB stores "BTCUSDT" or "BTC/USDT" or just "BTC"
    const asset = normalizeAssetSymbol(dbPos.asset_symbol);
    const exchangePos = exchangeMap.get(asset);

    if (!exchangePos) {
      // Phantom position: in DB but not on exchange
      phantomPositions.push(dbPos);
    } else {
      matchedExchangeSymbols.add(asset);

      // Check quantity mismatch (with dust tolerance)
      const dbQty = Number(dbPos.quantity);
      const exQty = exchangePos.amount;
      const diffPct = exQty > 0 ? (Math.abs(dbQty - exQty) / exQty) * 100 : (dbQty > 0 ? 100 : 0);

      if (diffPct > DUST_TOLERANCE_PCT) {
        mismatches.push({
          symbol: asset,
          dbQuantity: dbQty,
          exchangeQuantity: exQty,
          diffPct,
        });
      }
    }
  }

  // Untracked positions: on exchange but not in DB
  const untrackedPositions: SpotPosition[] = [];
  for (const pos of exchangePositions) {
    const asset = pos.symbol.split('/')[0];
    if (!matchedExchangeSymbols.has(asset) && !dbPositions.some((d) => normalizeAssetSymbol(d.asset_symbol) === asset)) {
      untrackedPositions.push(pos);
    }
  }

  // USDT balance
  const usdtBalance = balances.find((b) => b.asset === 'USDT');
  const actualUsdt = usdtBalance?.total ?? 0;

  const inSync =
    phantomPositions.length === 0 &&
    untrackedPositions.length === 0 &&
    mismatches.length === 0;

  return {
    inSync,
    phantomPositions,
    untrackedPositions,
    mismatches,
    dbPositions,
    exchangePositions,
    usdtBalance: {
      expected: 0, // We don't track expected USDT in DB — informational only
      actual: actualUsdt,
    },
  };
}

// ---------------------------------------------------------------------------
// Alert divergence via Telegram + audit log
// ---------------------------------------------------------------------------

export async function alertDivergence(
  syncResult: PortfolioSyncResult,
  userId: string,
): Promise<void> {
  if (syncResult.inSync) return;

  const lines: string[] = [
    '\u26A0\uFE0F <b>PORTFOLIO SYNC — DIVERGENZA RILEVATA</b>',
    '',
  ];

  // Phantom positions
  for (const pos of syncResult.phantomPositions) {
    lines.push(
      `\u{1F47B} <b>Phantom:</b> ${escapeHtml(pos.asset_symbol)} nel DB (qty: ${pos.quantity}) ma NON su Binance`,
    );
  }

  // Untracked positions
  for (const pos of syncResult.untrackedPositions) {
    lines.push(
      `\u{1F50D} <b>Untracked:</b> ${escapeHtml(pos.symbol)} su Binance (qty: ${pos.amount.toFixed(8)}) ma NON nel DB`,
    );
  }

  // Mismatches
  for (const m of syncResult.mismatches) {
    lines.push(
      `\u{1F504} <b>Mismatch:</b> ${escapeHtml(m.symbol)} — DB: ${m.dbQuantity}, Binance: ${m.exchangeQuantity.toFixed(8)} (diff: ${m.diffPct.toFixed(2)}%)`,
    );
  }

  lines.push('');
  lines.push(`\uD83D\uDCB0 <b>USDT disponibile:</b> $${syncResult.usdtBalance.actual.toFixed(2)}`);
  lines.push('');
  lines.push(`<i>${new Date().toLocaleString('it-IT')}</i>`);

  // Send Telegram alert
  try {
    const client = getTelegramClient();
    await client.sendMessage(ELIO_CHAT_ID, lines.join('\n'));
  } catch {
    console.error('[PortfolioSync] Failed to send Telegram alert');
  }

  // Audit log
  await auditLogger.logKillSwitch(userId, `Portfolio divergence: ${syncResult.phantomPositions.length} phantom, ${syncResult.untrackedPositions.length} untracked, ${syncResult.mismatches.length} mismatches`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeAssetSymbol(symbol: string): string {
  // "BTCUSDT" -> "BTC", "BTC/USDT" -> "BTC", "BTC" -> "BTC"
  return symbol
    .replace(/\/USDT$/, '')
    .replace(/USDT$/, '')
    .toUpperCase();
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
