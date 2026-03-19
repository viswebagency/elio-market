/**
 * TimescaleDB client — for time-series data (candles, ticks, metrics).
 * Uses pg Pool for connection pooling.
 */

import { Pool, PoolConfig } from 'pg';

let pool: Pool | null = null;

/** Get or create the TimescaleDB connection pool */
export function getTimescalePool(): Pool {
  if (!pool) {
    const config: PoolConfig = {
      connectionString: process.env.TIMESCALE_DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    };

    pool = new Pool(config);

    pool.on('error', (err) => {
      console.error('[TimescaleDB] Unexpected error on idle client:', err);
    });
  }

  return pool;
}

/** Execute a query */
export async function tsQuery<T>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await getTimescalePool().connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

/** Close the pool (for graceful shutdown) */
export async function closeTimescalePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
