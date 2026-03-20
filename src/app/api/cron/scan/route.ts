/**
 * GET /api/cron/scan
 *
 * Vercel Cron — every hour.
 * Scans Polymarket markets against all active strategies,
 * ranks opportunities by score, and persists results to Supabase.
 * Sends a Telegram summary if high-score opportunities are found.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { getMarketScanner } from '@/core/paper-trading/scanner';
import { getTelegramClient } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ELIO_CHAT_ID = 8659384895;
const HIGH_SCORE_THRESHOLD = 75;

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const scanner = getMarketScanner();
    const result = await scanner.scan();

    const summary = {
      opportunities: result.opportunities.length,
      marketsScanned: result.marketsScanned,
      strategiesEvaluated: result.strategiesEvaluated,
      scanDurationMs: result.scanDurationMs,
      scannedAt: result.scannedAt,
    };

    // Send Telegram if high-score opportunities found
    const hotOpps = result.opportunities.filter((o) => o.score >= HIGH_SCORE_THRESHOLD);
    if (hotOpps.length > 0) {
      await sendScanNotification(hotOpps, result.marketsScanned);
    }

    console.log('[Cron/scan]', JSON.stringify(summary));

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';

    // Rate limit is expected — not an error
    if (message.includes('Rate limit')) {
      console.log('[Cron/scan] Rate limited, skipping');
      return NextResponse.json({ ok: true, skipped: true, reason: 'rate_limited' });
    }

    console.error('[Cron/scan] ERRORE:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ScanOpp {
  marketName: string;
  strategyCode: string;
  score: number;
  currentPrice: number;
  suggestedStake: number;
}

async function sendScanNotification(opportunities: ScanOpp[], marketsScanned: number): Promise<void> {
  const client = getTelegramClient();

  const lines: string[] = [
    `\uD83D\uDD0D <b>Scan Automatico</b> — ${opportunities.length} opportunit\u00E0 trovate`,
    `<i>${marketsScanned} mercati analizzati</i>`,
    '',
  ];

  // Show top 5
  const top = opportunities.slice(0, 5);
  for (const opp of top) {
    const scoreBar = '\u2588'.repeat(Math.round(opp.score / 10)) + '\u2591'.repeat(10 - Math.round(opp.score / 10));
    lines.push(`<b>${escapeHtml(opp.marketName)}</b>`);
    lines.push(`  Strategia: ${escapeHtml(opp.strategyCode)} | Score: ${opp.score}`);
    lines.push(`  <code>${scoreBar}</code>`);
    lines.push(`  Prezzo: ${opp.currentPrice.toFixed(4)} | Stake: $${opp.suggestedStake.toFixed(2)}`);
    lines.push('');
  }

  if (opportunities.length > 5) {
    lines.push(`<i>...e altre ${opportunities.length - 5} opportunit\u00E0</i>`);
  }

  await client.sendMessage(ELIO_CHAT_ID, lines.join('\n'));
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
