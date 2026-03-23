/**
 * Tests for 2FA gate — blocks live trading without 2FA.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { check2FAFromProfile, TwoFARequiredError } from '@/lib/auth/require-2fa';

// Mock supabase for require2FA
vi.mock('@/lib/db/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

describe('2FA Gate', () => {
  describe('check2FAFromProfile', () => {
    it('should block when two_fa_enabled is false', () => {
      const result = check2FAFromProfile({ two_fa_enabled: false });
      expect(result.allowed).toBe(false);
      expect(result.message).toContain('2FA obbligatoria');
    });

    it('should block when two_fa_enabled is undefined', () => {
      const result = check2FAFromProfile({});
      expect(result.allowed).toBe(false);
      expect(result.message).toContain('2FA obbligatoria');
    });

    it('should allow when two_fa_enabled is true', () => {
      const result = check2FAFromProfile({ two_fa_enabled: true });
      expect(result.allowed).toBe(true);
      expect(result.message).toBe('');
    });
  });

  describe('TwoFARequiredError', () => {
    it('should have correct status code and message', () => {
      const error = new TwoFARequiredError();
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('2FA obbligatoria');
      expect(error.name).toBe('TwoFARequiredError');
    });
  });

  describe('require2FA (with Supabase mock)', () => {
    it('should throw TwoFARequiredError when 2FA is disabled', async () => {
      const { createServerSupabaseClient } = await import('@/lib/db/supabase/server');
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { two_fa_enabled: false },
                error: null,
              }),
            }),
          }),
        }),
      };
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any);

      const { require2FA } = await import('@/lib/auth/require-2fa');
      await expect(require2FA('user-1')).rejects.toThrow(TwoFARequiredError);
    });

    it('should pass when 2FA is enabled', async () => {
      const { createServerSupabaseClient } = await import('@/lib/db/supabase/server');
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { two_fa_enabled: true },
                error: null,
              }),
            }),
          }),
        }),
      };
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any);

      const { require2FA } = await import('@/lib/auth/require-2fa');
      await expect(require2FA('user-1')).resolves.toBeUndefined();
    });
  });
});
