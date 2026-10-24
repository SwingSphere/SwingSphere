import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.');
}

const DEFAULT_SUPABASE_FETCH_TIMEOUT_MS = 12_000;

const createBoundedSupabaseFetch = (): typeof fetch => {
  return async (input, init) => {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      const timeoutSignal = AbortSignal.timeout(DEFAULT_SUPABASE_FETCH_TIMEOUT_MS);
      const signal =
        init?.signal && typeof AbortSignal.any === 'function'
          ? AbortSignal.any([init.signal, timeoutSignal])
          : init?.signal ?? timeoutSignal;
      return fetch(input, { ...init, signal });
    }
    return fetch(input, init);
  };
};

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: createBoundedSupabaseFetch(),
  },
});
