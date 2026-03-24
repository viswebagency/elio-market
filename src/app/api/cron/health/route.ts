/**
 * GET /api/cron/health
 *
 * Health check for all cron jobs. Reports last execution time and status.
 * No auth required — returns only timing info, no sensitive data.
 */

import { NextResponse } from 'next/server';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';

export const dynamic = 'force-dynamic';

interface CronHealth {
  name: string;
  lastRunAt: string | null;
  minutesAgo: number | null;
  status: 'ok' | 'warning' | 'stale' | 'dead' | 'unknown';
  expectedIntervalMin: number;
  details?: string;
}

export async function GET() {
  try {
    const db = createUntypedAdminClient();
    const now = new Date();
    const crons: CronHealth[] = [];

    // 1. Crypto paper trading cron (every 2 min)
    const { data: cryptoSessions } = await db
      .from('crypto_paper_sessions')
      .select('last_tick_at')
      .eq('status', 'running')
      .order('last_tick_at', { ascending: false })
      .limit(1);

    const cryptoLastTick = cryptoSessions?.[0]?.last_tick_at ?? null;
    crons.push(buildHealth('crypto-tick', cryptoLastTick, now, 2));

    // 2. Polymarket paper trading cron (every 5 min)
    const { data: polySessions } = await db
      .from('paper_sessions')
      .select('last_tick_at')
      .eq('status', 'running')
      .order('last_tick_at', { ascending: false })
      .limit(1);

    const polyLastTick = polySessions?.[0]?.last_tick_at ?? null;
    crons.push(buildHealth('polymarket-tick', polyLastTick, now, 5));

    // 3. Equity snapshot cron (daily at 21:55 UTC)
    const { data: snapshots } = await db
      .from('paper_trading_snapshots')
      .select('timestamp')
      .order('timestamp', { ascending: false })
      .limit(1);

    const lastSnapshot = snapshots?.[0]?.timestamp ?? null;
    crons.push(buildHealth('equity-snapshot', lastSnapshot, now, 1440, 'Daily at 21:55 UTC'));

    // 4. Live trading cron (every 1 min — only if live sessions exist)
    const { data: liveSessions } = await db
      .from('live_equity_snapshots')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);

    const liveLastTick = liveSessions?.[0]?.created_at ?? null;
    crons.push(buildHealth('live-tick', liveLastTick, now, 1, 'Only active during live trading'));

    // Overall status
    const allStatuses = crons.map(c => c.status);
    const overallStatus = allStatuses.includes('dead') ? 'dead'
      : allStatuses.includes('stale') ? 'stale'
      : allStatuses.includes('warning') ? 'warning'
      : 'ok';

    return NextResponse.json({
      status: overallStatus,
      checkedAt: now.toISOString(),
      crons,
    });
  } catch (err) {
    return NextResponse.json({
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}

function buildHealth(
  name: string,
  lastRunAt: string | null,
  now: Date,
  expectedIntervalMin: number,
  details?: string,
): CronHealth {
  if (!lastRunAt) {
    return { name, lastRunAt: null, minutesAgo: null, status: 'unknown', expectedIntervalMin, details };
  }

  const lastRun = new Date(lastRunAt);
  const minutesAgo = Math.round((now.getTime() - lastRun.getTime()) / 60_000);

  let status: CronHealth['status'] = 'ok';
  if (minutesAgo > expectedIntervalMin * 10) {
    status = 'dead'; // 10x expected interval = dead
  } else if (minutesAgo > expectedIntervalMin * 5) {
    status = 'stale'; // 5x expected interval = stale
  } else if (minutesAgo > expectedIntervalMin * 3) {
    status = 'warning'; // 3x expected interval = warning
  }

  return { name, lastRunAt, minutesAgo, status, expectedIntervalMin, details };
}
