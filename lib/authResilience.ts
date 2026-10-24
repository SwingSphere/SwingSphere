import type { User } from '../data/mockUsers';

export interface MinimalAuthSessionUser {
  id: string;
  email?: string | null;
  created_at?: string;
  user_metadata?: Record<string, any>;
  app_metadata?: Record<string, any>;
}

const TRANSIENT_STATUS_CODES = new Set([
  408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530,
]);

const REVOKED_OR_INVALID_CODES = new Set([
  'invalid_grant',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'session_not_found',
  'session_expired',
  'user_not_found',
  'user_banned',
  'bad_jwt',
  'invalid_jwt',
  'invalid_credentials',
]);

export const isRevokedOrInvalidSessionError = (error: unknown): boolean => {
  if (!error) return false;
  const errObj = typeof error === 'object' ? (error as Record<string, any>) : null;
  const status = Number(errObj?.status ?? errObj?.statusCode ?? 0);
  const code = String(errObj?.code ?? errObj?.error_code ?? '').toLowerCase().trim();
  const name = String(errObj?.name ?? '').toLowerCase();
  const message = String(errObj?.message ?? errObj?.error_description ?? error ?? '').toLowerCase();

  if (name === 'authretryablefetcherror') {
    return false;
  }
  if (TRANSIENT_STATUS_CODES.has(status)) {
    return false;
  }
  if (code && REVOKED_OR_INVALID_CODES.has(code)) {
    return true;
  }
  if (
    /\b(invalid_grant|refresh_token_not_found|session_not_found|invalid refresh token|jwt expired|invalid jwt|user_not_found)\b/i.test(
      message,
    )
  ) {
    return true;
  }
  if ((status === 401 || status === 403) && !/\b(timeout|timed out|521|522|503|504)\b/i.test(message)) {
    return true;
  }
  return false;
};

export const isTransientAuthOrNetworkError = (error: unknown): boolean => {
  if (!error) return false;
  if (isRevokedOrInvalidSessionError(error)) return false;

  const errObj = typeof error === 'object' ? (error as Record<string, any>) : null;
  const status = Number(errObj?.status ?? errObj?.statusCode ?? 0);
  const name = String(errObj?.name ?? '');
  const code = String(errObj?.code ?? '');
  const message = String(errObj?.message ?? error ?? '');

  if (name === 'AuthRetryableFetchError' || name === 'AbortError' || name === 'TimeoutError') {
    return true;
  }
  if (TRANSIENT_STATUS_CODES.has(status)) {
    return true;
  }
  if (
    /\b(408|429|500|502|503|504|520|521|522|523|524|525|526|530|57014|pgrst000|pgrst001|pgrst002|pgrst003|request_timeout|timed out|timeout|taking too long|failed to fetch|networkerror|network request failed|load failed|fetch failed|econnreset|etimedout|offline|temporarily unavailable|web server is down|connection timed out|gateway time-out|canceling statement due to statement timeout|thread killed by timeout manager|connection terminated)\b/i.test(
      `${code} ${message}`,
    ) ||
    /<!doctype html|<html\b|error code 52\d|unexpected token '<'/i.test(message)
  ) {
    return true;
  }
  return false;
};

export const readPersistedSupabaseSession = (
  storage?: Pick<Storage, 'length' | 'key' | 'getItem'> | null,
): {
  hasToken: boolean;
  user: MinimalAuthSessionUser | null;
} => {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined' && window.localStorage
        ? window.localStorage
        : null;

  if (!targetStorage) {
    return { hasToken: false, user: null };
  }

  try {
    for (let i = 0; i < targetStorage.length; i += 1) {
      const key = targetStorage.key(i);
      if (!key || !/^sb-[a-z0-9_-]+-auth-token$/i.test(key)) continue;
      const raw = targetStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const sessionCandidate = parsed?.currentSession || parsed?.session || parsed;
      const hasToken = Boolean(
        sessionCandidate?.refresh_token || sessionCandidate?.access_token,
      );
      const user =
        sessionCandidate?.user && typeof sessionCandidate.user.id === 'string'
          ? (sessionCandidate.user as MinimalAuthSessionUser)
          : null;
      if (hasToken || user) {
        return { hasToken, user };
      }
    }
  } catch {
    // Ignore storage access or JSON parse errors
  }

  return { hasToken: false, user: null };
};

const CACHED_PROFILE_KEY_PREFIX = 'swingsphere:cached-profile:';

type CachedDisplayProfile = {
  id: string;
  displayName: string;
  email: string;
  joinDate: string;
  handle?: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
};

/**
 * Caches only non-privileged display metadata in localStorage.
 * Security invariant: elevated roles ('Admin', 'Host') and account status are
 * NEVER persisted in or trusted from browser storage.
 */
export const cacheUserProfile = (
  user: User,
  storage?: Pick<Storage, 'setItem'> | null,
): void => {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined' && window.localStorage
        ? window.localStorage
        : null;
  if (!targetStorage || !user?.id) return;
  try {
    const safePayload: CachedDisplayProfile = {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      joinDate: user.joinDate,
      ...(user.handle ? { handle: user.handle } : {}),
      ...(user.bio ? { bio: user.bio } : {}),
      ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
      ...(user.bannerUrl ? { bannerUrl: user.bannerUrl } : {}),
    };
    targetStorage.setItem(`${CACHED_PROFILE_KEY_PREFIX}${user.id}`, JSON.stringify(safePayload));
  } catch {
    // Ignore storage quota or private-mode errors
  }
};

/**
 * Reads cached display metadata for a user and always returns a least-privilege
 * 'User' role. Modifying localStorage cannot elevate client-side permissions.
 */
export const readCachedUserProfile = (
  userId: string,
  storage?: Pick<Storage, 'getItem'> | null,
): User | null => {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined' && window.localStorage
        ? window.localStorage
        : null;
  if (!targetStorage || !userId) return null;
  try {
    const raw = targetStorage.getItem(`${CACHED_PROFILE_KEY_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'string' && parsed.id === userId) {
      return {
        id: parsed.id,
        displayName: typeof parsed.displayName === 'string' && parsed.displayName ? parsed.displayName : 'SwingSphere Member',
        email: typeof parsed.email === 'string' ? parsed.email : '',
        role: 'User',
        joinDate: typeof parsed.joinDate === 'string' ? parsed.joinDate : new Date().toISOString(),
        submissionCount: 0,
        status: 'Active',
        handle: typeof parsed.handle === 'string' ? parsed.handle : undefined,
        bio: typeof parsed.bio === 'string' ? parsed.bio : undefined,
        avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : undefined,
        bannerUrl: typeof parsed.bannerUrl === 'string' ? parsed.bannerUrl : undefined,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return null;
};

export const clearCachedUserProfiles = (
  storage?: Pick<Storage, 'length' | 'key' | 'removeItem'> | null,
): void => {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined' && window.localStorage
        ? window.localStorage
        : null;
  if (!targetStorage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < targetStorage.length; i += 1) {
      const k = targetStorage.key(i);
      if (k && k.startsWith(CACHED_PROFILE_KEY_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      targetStorage.removeItem(k);
    }
  } catch {
    // Ignore storage errors
  }
};

export const buildFallbackUserFromAuthSession = (
  authUser: MinimalAuthSessionUser,
  previousUser?: User | null,
  storage?: Pick<Storage, 'getItem'> | null,
): User => {
  if (previousUser && previousUser.id === authUser.id) {
    return previousUser;
  }
  const cachedProfile = readCachedUserProfile(authUser.id, storage);
  if (cachedProfile) {
    return {
      ...cachedProfile,
      email: authUser.email || cachedProfile.email,
      role: 'User',
      status: 'Active',
    };
  }
  const email = authUser.email ?? '';
  const meta = authUser.user_metadata || {};
  const emailPrefix = email ? email.split('@')[0] : 'member';
  const displayName =
    meta.display_name ||
    meta.full_name ||
    meta.name ||
    emailPrefix ||
    'SwingSphere Member';
  const handle =
    meta.handle ||
    meta.user_name ||
    emailPrefix.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() ||
    `user_${authUser.id.slice(0, 6)}`;

  return {
    id: authUser.id,
    displayName: String(displayName),
    email,
    // Security invariant: never derive elevated roles ('Admin', 'Host') from
    // unverified localStorage or user-editable user_metadata. Elevated roles
    // require a live server-verified /rest/v1/profiles response.
    role: 'User',
    joinDate: authUser.created_at || new Date().toISOString(),
    submissionCount: 0,
    status: 'Active',
    handle: String(handle),
    avatarUrl: typeof meta.avatar_url === 'string' ? meta.avatar_url : undefined,
  };
};

export const withAuthDeadline = <T>(
  promise: PromiseLike<T>,
  message: string,
  ms = 10000,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const timeoutErr = new Error(message) as Error & { code?: string; status?: number };
      timeoutErr.code = 'request_timeout';
      timeoutErr.status = 504;
      reject(timeoutErr);
    }, ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

export const createDeduplicatedProfileLoader = <T = User>(
  fetcher: (userId: string, email: string) => Promise<T>,
  options?: {
    retryDelaysMs?: number[];
    attemptTimeoutMs?: number;
  },
) => {
  const retryDelaysMs = options?.retryDelaysMs ?? [600, 1500];
  const attemptTimeoutMs = options?.attemptTimeoutMs ?? 9000;
  const inFlight = new Map<string, Promise<T>>();

  const load = async (userId: string, email: string): Promise<T> => {
    const key = `${userId}:${email}`;
    const existing = inFlight.get(key);
    if (existing) {
      return existing;
    }

    const task = (async () => {
      let lastError: unknown;
      const totalAttempts = retryDelaysMs.length + 1;
      for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
        try {
          return await withAuthDeadline(
            fetcher(userId, email),
            'Account profile request timed out.',
            attemptTimeoutMs,
          );
        } catch (err) {
          lastError = err;
          if (attempt >= retryDelaysMs.length || !isTransientAuthOrNetworkError(err)) {
            throw err;
          }
          const delayMs = retryDelaysMs[attempt];
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
      throw lastError;
    })().finally(() => {
      inFlight.delete(key);
    });

    inFlight.set(key, task);
    return task;
  };

  return {
    load,
    getInFlightCount: () => inFlight.size,
  };
};

export interface AuthTransitionInput {
  event?: string;
  sessionUser: MinimalAuthSessionUser | null;
  sessionError?: unknown;
  profile?: User | null;
  profileError?: unknown;
  previousUser: User | null;
  hasStoredToken?: boolean;
  persistedUser?: MinimalAuthSessionUser | null;
  isOffline?: boolean;
}

export interface AuthTransitionResult {
  nextUser: User | null;
  connectionError: string | null;
  shouldClearSession: boolean;
}

export const resolveAuthTransition = (input: AuthTransitionInput): AuthTransitionResult => {
  const {
    event,
    sessionUser,
    sessionError,
    profile,
    profileError,
    previousUser,
    hasStoredToken = false,
    persistedUser = null,
    isOffline = false,
  } = input;

  if (event === 'SIGNED_OUT') {
    return {
      nextUser: null,
      connectionError: null,
      shouldClearSession: true,
    };
  }

  if (sessionError) {
    if (isRevokedOrInvalidSessionError(sessionError)) {
      return {
        nextUser: null,
        connectionError: null,
        shouldClearSession: true,
      };
    }

    const effectiveSessionUser = sessionUser || persistedUser;
    const preservedUser =
      previousUser ||
      (effectiveSessionUser
        ? buildFallbackUserFromAuthSession(effectiveSessionUser, previousUser)
        : null);

    return {
      nextUser: preservedUser,
      connectionError:
        'Connection to SwingSphere authentication is temporarily degraded. Your session has been preserved.',
      shouldClearSession: false,
    };
  }

  if (sessionUser) {
    if (profile) {
      return {
        nextUser: profile,
        connectionError: null,
        shouldClearSession: false,
      };
    }

    if (profileError) {
      if (isRevokedOrInvalidSessionError(profileError)) {
        return {
          nextUser: null,
          connectionError: null,
          shouldClearSession: true,
        };
      }
      const fallbackUser = buildFallbackUserFromAuthSession(sessionUser, previousUser);
      return {
        nextUser: fallbackUser,
        connectionError:
          'Signed in, but SwingSphere is temporarily unable to reach the profile service. Retrying automatically.',
        shouldClearSession: false,
      };
    }

    return {
      nextUser: buildFallbackUserFromAuthSession(sessionUser, previousUser),
      connectionError: null,
      shouldClearSession: false,
    };
  }

  // No sessionUser and no explicit sessionError:
  // If the browser is offline or a stored refresh token still exists during a transient refresh gap, preserve previousUser
  if ((isOffline || hasStoredToken) && previousUser) {
    return {
      nextUser: previousUser,
      connectionError: isOffline
        ? 'You appear to be offline. Keeping your active SwingSphere session until connectivity returns.'
        : 'Connection to SwingSphere temporarily interrupted. Preserving your session.',
      shouldClearSession: false,
    };
  }

  if (hasStoredToken && persistedUser) {
    return {
      nextUser: buildFallbackUserFromAuthSession(persistedUser, previousUser),
      connectionError:
        'Connection to SwingSphere temporarily interrupted. Preserving your session.',
      shouldClearSession: false,
    };
  }

  return {
    nextUser: null,
    connectionError: null,
    shouldClearSession: false,
  };
};
