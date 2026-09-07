import { createClient } from '@supabase/supabase-js';

const getBearerToken = (authorization?: string | null): string => {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
};

export type ActiveAdminIdentity = {
  userId: string;
  email: string | null;
};

export const createAuthenticatedSupabaseServerClient = (authorization?: string | null) => {
  const token = getBearerToken(authorization);
  if (!token) throw new Error('Active admin authentication is required.');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) throw new Error('Supabase server authentication is not configured.');

  return {
    token,
    supabase: createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }),
  };
};

export const requireActiveAdmin = async (authorization?: string | null): Promise<ActiveAdminIdentity> => {
  const { token, supabase } = createAuthenticatedSupabaseServerClient(authorization);
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) throw new Error('Your admin session is invalid or expired.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError) throw new Error(`Could not verify admin access: ${profileError.message}`);
  if (profile?.role !== 'admin' || profile.status !== 'active') {
    throw new Error('Active admin access is required for Building Inspector changes.');
  }

  return { userId: authData.user.id, email: authData.user.email ?? null };
};
