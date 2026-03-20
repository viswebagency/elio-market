/**
 * Test per cron-auth — verifica autenticazione endpoint cron.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyCronAuth } from '@/lib/cron-auth';

// ---------------------------------------------------------------------------
// Mock NextRequest
// ---------------------------------------------------------------------------

function createMockRequest(authHeader?: string) {
  const headers = new Map<string, string>();
  if (authHeader) {
    headers.set('authorization', authHeader);
  }
  return {
    headers: {
      get: (key: string) => headers.get(key) ?? null,
    },
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('verifyCronAuth', () => {
  const originalEnv = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CRON_SECRET = originalEnv;
    } else {
      delete process.env.CRON_SECRET;
    }
  });

  it('allows all requests in dev mode (no CRON_SECRET)', () => {
    delete process.env.CRON_SECRET;
    const request = createMockRequest();
    expect(verifyCronAuth(request)).toBe(true);
  });

  it('rejects requests without Authorization header', () => {
    process.env.CRON_SECRET = 'test-secret-123';
    const request = createMockRequest();
    expect(verifyCronAuth(request)).toBe(false);
  });

  it('rejects requests with wrong token', () => {
    process.env.CRON_SECRET = 'test-secret-123';
    const request = createMockRequest('Bearer wrong-token');
    expect(verifyCronAuth(request)).toBe(false);
  });

  it('accepts requests with correct Bearer token', () => {
    process.env.CRON_SECRET = 'test-secret-123';
    const request = createMockRequest('Bearer test-secret-123');
    expect(verifyCronAuth(request)).toBe(true);
  });

  it('rejects empty Authorization header', () => {
    process.env.CRON_SECRET = 'test-secret-123';
    const request = createMockRequest('');
    expect(verifyCronAuth(request)).toBe(false);
  });
});
