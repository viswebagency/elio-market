/**
 * 2FA gate — blocks live trading operations unless the user has 2FA enabled.
 *
 * Usage:
 *   await require2FA(userId);  // throws if 2FA not enabled
 *
 * Or as a Next.js API guard:
 *   const result = check2FA(profile);
 *   if (!result.allowed) return NextResponse.json({ error: result.message }, { status: 403 });
 */

import { createServerSupabaseClient } from '@/lib/db/supabase/server';

export interface TwoFACheckResult {
  allowed: boolean;
  message: string;
}

/**
 * Check if user has 2FA enabled.
 * Reads two_fa_enabled from profiles table.
 */
export async function require2FA(userId: string): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('two_fa_enabled')
    .eq('id', userId)
    .single();

  if (error) {
    throw new Error(`Failed to check 2FA status: ${error.message}`);
  }

  if (!data?.two_fa_enabled) {
    throw new TwoFARequiredError();
  }
}

/**
 * Non-throwing check — returns result object for API routes.
 */
export function check2FAFromProfile(profile: {
  two_fa_enabled?: boolean;
}): TwoFACheckResult {
  if (!profile.two_fa_enabled) {
    return {
      allowed: false,
      message:
        '2FA obbligatoria per il live trading. Attivala nelle impostazioni del profilo.',
    };
  }
  return { allowed: true, message: '' };
}

/** Custom error for 2FA requirement */
export class TwoFARequiredError extends Error {
  public readonly statusCode = 403;

  constructor() {
    super(
      '2FA obbligatoria per il live trading. Attivala nelle impostazioni del profilo.'
    );
    this.name = 'TwoFARequiredError';
  }
}
