import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const getBearerToken = (authorization?: string | null): string => {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
};

let cachedDotEnv: Record<string, string> | null = null;

const ENV_FALLBACK_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.cloudflare',
];

export const readLocalEnvFallback = (): Record<string, string> => {
  if (cachedDotEnv) return cachedDotEnv;
  const parsed: Record<string, string> = {};
  for (const filename of ENV_FALLBACK_FILES) {
    const filePath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIdx = line.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key) parsed[key] = val;
      }
    } catch {
      // Ignore unreadable env files
    }
  }
  cachedDotEnv = parsed;
  return parsed;
};

export const getResolvedServerEnvValue = (...keys: string[]): string => {
  const fallback = readLocalEnvFallback();
  for (const key of keys) {
    const fromProc = process.env[key]?.trim();
    if (fromProc) return fromProc;
    const fromFile = fallback[key]?.trim();
    if (fromFile) return fromFile;
  }
  return '';
};

export type ActiveAdminIdentity = {
  userId: string;
  email: string | null;
};

const createAuthError = (message: string, statusCode: number): Error & { statusCode: number } => {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
};

export const createAuthenticatedSupabaseServerClient = (authorization?: string | null) => {
  const token = getBearerToken(authorization);
  if (!token) throw createAuthError('Active admin authentication is required.', 401);

  const supabaseUrl = getResolvedServerEnvValue('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const publishableKey = getResolvedServerEnvValue(
    'SUPABASE_ANON_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_ANON_KEY',
  );
  if (!supabaseUrl || !publishableKey) {
    throw createAuthError('Supabase server authentication is not configured.', 500);
  }

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
  if (authError || !authData.user) {
    throw createAuthError('Your admin session is invalid or expired.', 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError) {
    throw createAuthError(`Could not verify admin access: ${profileError.message}`, 500);
  }
  if (profile?.role !== 'admin' || profile.status !== 'active') {
    throw createAuthError('Active admin access is required.', 403);
  }

  return { userId: authData.user.id, email: authData.user.email ?? null };
};
