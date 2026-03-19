/**
 * Auth middleware helpers — session validation and route protection.
 */

import { createServerSupabaseClient } from '@/lib/db/supabase/server';

/** Get the current authenticated user or null */
export async function getCurrentUser() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/** Require authentication — throws if not authenticated */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

/** Get user profile from the profiles table */
export async function getUserProfile(userId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}

/** Protected API route wrapper */
export function withAuth<T>(
  handler: (userId: string, ...args: unknown[]) => Promise<T>
) {
  return async (...args: unknown[]): Promise<T> => {
    const user = await requireAuth();
    return handler(user.id, ...args);
  };
}
