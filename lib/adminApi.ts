const getAccessToken = async (): Promise<string> => {
  // Keep the authenticated browser client lazy so pure geometry/verification
  // modules can be exercised headlessly without requiring Vite env globals.
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token?.trim() ?? '';
  if (!token) throw new Error('Admin authentication is required. Please sign in again.');
  return token;
};

export const adminFetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
  const token = await getAccessToken();
  const headers = new Headers(init.headers ?? {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  return fetch(input, { ...init, headers });
};

export const adminFetchJson = async <T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> => {
  const response = await adminFetch(input, init);
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Admin request failed with status ${response.status}.`);
  }
  return await response.json() as T;
};
