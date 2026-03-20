/**
 * Cron Authentication
 *
 * Verifies that cron endpoint calls come from Vercel Cron
 * by checking the Authorization header against CRON_SECRET.
 */

import { NextRequest } from 'next/server';

/**
 * Verify that a request is authorized to call a cron endpoint.
 * Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
 *
 * In development, if CRON_SECRET is not set, all requests are allowed.
 */
export function verifyCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // Development: allow all if no secret configured
  if (!cronSecret) {
    console.warn('[Cron] CRON_SECRET not set — allowing request (dev mode)');
    return true;
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;

  const token = authHeader.replace('Bearer ', '');
  return token === cronSecret;
}
