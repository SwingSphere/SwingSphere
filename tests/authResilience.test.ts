import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFallbackUserFromAuthSession,
  cacheUserProfile,
  clearCachedUserProfiles,
  createDeduplicatedProfileLoader,
  isRevokedOrInvalidSessionError,
  isTransientAuthOrNetworkError,
  readCachedUserProfile,
  readPersistedSupabaseSession,
  resolveAuthTransition,
} from '../lib/authResilience';
import type { User } from '../data/mockUsers';

const samplePreviousAdmin: User = {
  id: '0a1d803e-c705-416c-ba62-360bbdf5ec0a',
  displayName: 'Ryoga Admin',
  email: 'admin@swingsphere.co',
  role: 'Admin',
  joinDate: '2026-01-01T00:00:00Z',
  submissionCount: 12,
  status: 'Active',
  handle: 'ryoga',
};

test('Auth Resilience: classifies HTTP 503, 504, 521, 522, AuthRetryableFetchError, timeouts, and offline as transient and NOT revoked', () => {
  const transientSamples = [
    { name: 'AuthRetryableFetchError', status: 521, message: 'Web server is down' },
    { name: 'AuthRetryableFetchError', status: 522, message: 'Connection timed out' },
    { status: 503, message: 'Service Unavailable' },
    { status: 504, code: 'request_timeout', message: 'Gateway Timeout' },
    new Error('Session restoration timed out. Please retry signing in.'),
    new Error('TypeError: Failed to fetch'),
    new Error('Signed in, but SwingSphere could not load your account profile: HTTP 521'),
    new Error('<!DOCTYPE html>\n<html><head><title>supabase.co | 522: Connection timed out</title></head><body>Error code 522</body></html>'),
    { code: '57014', message: 'canceling statement due to statement timeout' },
    new Error('Warp server error: Thread killed by timeout manager'),
  ];

  for (const err of transientSamples) {
    assert.equal(
      isTransientAuthOrNetworkError(err),
      true,
      `Expected ${JSON.stringify(err)} to be classified as transient`,
    );
    assert.equal(
      isRevokedOrInvalidSessionError(err),
      false,
      `Expected ${JSON.stringify(err)} NOT to be classified as revoked/invalid`,
    );
  }

  const revokedSamples = [
    { status: 400, code: 'invalid_grant', message: 'Invalid Refresh Token: Refresh Token Not Found' },
    { status: 400, code: 'refresh_token_not_found', message: 'Refresh Token Not Found' },
    { status: 403, code: 'session_not_found', message: 'Session from session_id claim in JWT does not exist' },
    { status: 401, code: 'bad_jwt', message: 'invalid JWT: unable to parse or verify signature' },
  ];

  for (const err of revokedSamples) {
    assert.equal(
      isRevokedOrInvalidSessionError(err),
      true,
      `Expected ${JSON.stringify(err)} to be classified as revoked/invalid`,
    );
    assert.equal(
      isTransientAuthOrNetworkError(err),
      false,
      `Expected ${JSON.stringify(err)} NOT to be classified as transient`,
    );
  }
});

test('Auth Resilience: temporary 503, 504, 521, 522, offline, and profile timeouts preserve active session instead of logging out', () => {
  // Scenario A: Token refresh returns HTTP 521 / 522 (getSession returns sessionUser: null + AuthRetryableFetchError)
  for (const status of [503, 504, 521, 522]) {
    const res = resolveAuthTransition({
      sessionUser: null,
      sessionError: { name: 'AuthRetryableFetchError', status, message: `HTTP ${status}` },
      previousUser: samplePreviousAdmin,
      hasStoredToken: true,
      persistedUser: { id: samplePreviousAdmin.id, email: samplePreviousAdmin.email },
    });
    assert.equal(res.shouldClearSession, false, `HTTP ${status} must not clear session`);
    assert.ok(res.nextUser, `HTTP ${status} must preserve currentUser`);
    assert.equal(res.nextUser?.id, samplePreviousAdmin.id);
    assert.equal(res.nextUser?.role, 'Admin', 'Admin role must be preserved during transient 5xx');
    assert.ok(res.connectionError, 'Recoverable connection error banner should be set');
  }

  // Scenario B: Cold page reload during 521/522 outage when previousUser is null, but sb-*-auth-token is in localStorage
  const mockStorageData: Record<string, string> = {
    'sb-oieiotogdyfewsmdlsmh-auth-token': JSON.stringify({
      access_token: 'eyJhbGciOiJIUzI1NiJ9.mock',
      refresh_token: 'mock-refresh-token',
      user: {
        id: '0a1d803e-c705-416c-ba62-360bbdf5ec0a',
        email: 'admin@swingsphere.co',
        user_metadata: { display_name: 'Ryoga Admin', handle: 'ryoga' },
      },
    }),
  };
  const mockStorage = {
    length: Object.keys(mockStorageData).length,
    key: (idx: number) => Object.keys(mockStorageData)[idx] ?? null,
    getItem: (k: string) => mockStorageData[k] ?? null,
  };
  const persisted = readPersistedSupabaseSession(mockStorage);
  assert.equal(persisted.hasToken, true);
  assert.equal(persisted.user?.id, '0a1d803e-c705-416c-ba62-360bbdf5ec0a');

  const coldReloadOn522 = resolveAuthTransition({
    sessionUser: null,
    sessionError: { name: 'AuthRetryableFetchError', status: 522, message: 'Connection timed out' },
    previousUser: null,
    hasStoredToken: persisted.hasToken,
    persistedUser: persisted.user,
  });
  assert.equal(coldReloadOn522.shouldClearSession, false);
  assert.equal(coldReloadOn522.nextUser?.id, '0a1d803e-c705-416c-ba62-360bbdf5ec0a');
  assert.equal(coldReloadOn522.nextUser?.displayName, 'Ryoga Admin');

  // Scenario C: Session token is valid, but /rest/v1/profiles fails with HTTP 521 or times out
  const profileTimeoutTransition = resolveAuthTransition({
    sessionUser: {
      id: samplePreviousAdmin.id,
      email: samplePreviousAdmin.email,
      user_metadata: { display_name: 'Ryoga Admin' },
    },
    profile: null,
    profileError: new Error('Account profile request timed out.'),
    previousUser: samplePreviousAdmin,
  });
  assert.equal(profileTimeoutTransition.shouldClearSession, false);
  assert.equal(profileTimeoutTransition.nextUser?.id, samplePreviousAdmin.id);
  assert.equal(profileTimeoutTransition.nextUser?.role, 'Admin');
  assert.ok(profileTimeoutTransition.connectionError);

  // Scenario D: Browser goes offline during background check
  const offlineTransition = resolveAuthTransition({
    sessionUser: null,
    sessionError: null,
    previousUser: samplePreviousAdmin,
    hasStoredToken: true,
    isOffline: true,
  });
  assert.equal(offlineTransition.shouldClearSession, false);
  assert.equal(offlineTransition.nextUser?.id, samplePreviousAdmin.id);
});

test('Auth Resilience: genuine SIGNED_OUT or revoked refresh_token clears session immediately', () => {
  const signedOutRes = resolveAuthTransition({
    event: 'SIGNED_OUT',
    sessionUser: null,
    previousUser: samplePreviousAdmin,
    hasStoredToken: false,
  });
  assert.equal(signedOutRes.shouldClearSession, true);
  assert.equal(signedOutRes.nextUser, null);
  assert.equal(signedOutRes.connectionError, null);

  const revokedRes = resolveAuthTransition({
    sessionUser: null,
    sessionError: { status: 400, code: 'invalid_grant', message: 'Invalid Refresh Token' },
    previousUser: samplePreviousAdmin,
    hasStoredToken: false,
  });
  assert.equal(revokedRes.shouldClearSession, true);
  assert.equal(revokedRes.nextUser, null);
});

test('Auth Resilience: deduplicated profile loader coalesces concurrent requests and uses bounded backoff on transient 521/503 errors', async () => {
  let fetchCalls = 0;
  const loader = createDeduplicatedProfileLoader(
    async (userId, email) => {
      fetchCalls += 1;
      if (fetchCalls < 3) {
        const err = new Error('HTTP 521 Web Server Is Down') as Error & { status?: number };
        err.status = 521;
        throw err;
      }
      return buildFallbackUserFromAuthSession({ id: userId, email, user_metadata: { display_name: 'Recovered User' } });
    },
    { retryDelaysMs: [20, 40], attemptTimeoutMs: 500 },
  );

  // Fire 4 concurrent profile loads for the same user (simulating restore + onAuthStateChange + focus + visibilitychange)
  const results = await Promise.all([
    loader.load('user-123', 'member@swingsphere.co'),
    loader.load('user-123', 'member@swingsphere.co'),
    loader.load('user-123', 'member@swingsphere.co'),
    loader.load('user-123', 'member@swingsphere.co'),
  ]);

  assert.equal(fetchCalls, 3, '4 concurrent callers must share the same in-flight retry sequence (2 failures + 1 success)');
  for (const res of results) {
    assert.equal(res.id, 'user-123');
    assert.equal(res.displayName, 'Recovered User');
  }
  assert.equal(loader.getInFlightCount(), 0);
});

test('Auth Resilience & Security: cached user profile preserves display metadata during 504/522 but NEVER grants elevated Admin/Host roles from localStorage or tampered metadata', () => {
  const store: Record<string, string> = {};
  const mockStorage = {
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };

  cacheUserProfile(samplePreviousAdmin, mockStorage);
  const rawStored = JSON.parse(store[`swingsphere:cached-profile:${samplePreviousAdmin.id}`]);
  assert.equal(rawStored.role, undefined, 'Elevated role must never be written to localStorage');
  assert.equal(rawStored.status, undefined, 'Status must never be written to localStorage');

  const readBack = readCachedUserProfile(samplePreviousAdmin.id, mockStorage);
  assert.ok(readBack);
  assert.equal(readBack?.role, 'User', 'Cached profile read from localStorage must default to least-privilege User role');
  assert.equal(readBack?.displayName, 'Ryoga Admin');
  assert.equal(readBack?.handle, 'ryoga');

  // Security check: Tampering with localStorage to inject role: 'Admin' or user_metadata/app_metadata role: 'admin'
  // must NEVER grant elevated permissions when previousUser is null (unverified by server in current runtime)
  store[`swingsphere:cached-profile:${samplePreviousAdmin.id}`] = JSON.stringify({
    id: samplePreviousAdmin.id,
    displayName: 'Tampered User',
    email: samplePreviousAdmin.email,
    role: 'Admin',
    status: 'Active',
    handle: 'tampered',
  });

  const fallbackFromTamperedStorage = buildFallbackUserFromAuthSession(
    {
      id: samplePreviousAdmin.id,
      email: samplePreviousAdmin.email,
      user_metadata: { role: 'admin' },
      app_metadata: { role: 'admin' },
    },
    null,
    mockStorage,
  );
  assert.equal(
    fallbackFromTamperedStorage.role,
    'User',
    'Tampered localStorage or session metadata must never grant Admin role without live server profile verification',
  );
  assert.equal(fallbackFromTamperedStorage.displayName, 'Tampered User');

  // In-memory server-verified previousUser DOES preserve its role during a transient refresh failure
  const fallbackWithInMemoryVerifiedAdmin = buildFallbackUserFromAuthSession(
    { id: samplePreviousAdmin.id, email: samplePreviousAdmin.email },
    samplePreviousAdmin,
    mockStorage,
  );
  assert.equal(fallbackWithInMemoryVerifiedAdmin.role, 'Admin');

  // Clearing cached profiles on explicit logout removes the entry
  clearCachedUserProfiles(mockStorage);
  assert.equal(readCachedUserProfile(samplePreviousAdmin.id, mockStorage), null);
});
