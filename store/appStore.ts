import React, { useState, useContext, createContext, useRef, useCallback, useMemo, useEffect } from 'react';
import type { AppState, Toast, TimeLens } from '../types';
import { mockUsers, type User } from '../data/mockUsers';
import { getPublicTagCategories, getPublicTags } from '../lib/taxonomySupabase';
import { supabase } from '../lib/supabase';
import { getCloudflareImageUrl } from '../lib/media/getCloudflareImageUrl';
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
  withAuthDeadline,
} from '../lib/authResilience';

export {
  buildFallbackUserFromAuthSession,
  cacheUserProfile,
  clearCachedUserProfiles,
  createDeduplicatedProfileLoader,
  isRevokedOrInvalidSessionError,
  isTransientAuthOrNetworkError,
  readCachedUserProfile,
  readPersistedSupabaseSession,
  resolveAuthTransition,
};

const AppContext = createContext<AppState | undefined>(undefined);

type ProfileRow = {
  id: string;
  display_name: string;
  handle: string;
  bio: string | null;
  role: 'user' | 'promoter' | 'admin';
  status: 'active' | 'suspended' | 'deleted';
  avatar_url: string | null;
  created_at: string;
};

type ProfileMediaRow = {
  role: 'avatar' | 'hero';
  external_id: string;
  created_at: string;
};

const mapProfile = (profile: ProfileRow, email: string, media: ProfileMediaRow[] = []): User => {
  const avatarAsset = media.find((asset) => asset.role === 'avatar');
  const heroAsset = media.find((asset) => asset.role === 'hero');
  const avatarUrl = avatarAsset
    ? getCloudflareImageUrl({ externalId: avatarAsset.external_id, variant: 'avatarsquare' })
    : profile.avatar_url;
  const bannerUrl = heroAsset
    ? getCloudflareImageUrl({ externalId: heroAsset.external_id, variant: 'heropage' })
    : null;

  return {
    id: profile.id,
    displayName: profile.display_name,
    email,
    role: profile.role === 'admin' ? 'Admin' : profile.role === 'promoter' ? 'Host' : 'User',
    joinDate: profile.created_at,
    submissionCount: 0,
    status: profile.status === 'active' ? 'Active' : profile.status === 'deleted' ? 'Deleted' : 'Suspended',
    handle: profile.handle,
    bio: profile.bio ?? undefined,
    avatarUrl: avatarUrl ?? undefined,
    bannerUrl: bannerUrl ?? undefined,
  };
};

const USER_MEDIA_CACHE_TTL_MS = 10 * 60 * 1000;
const userMediaCache = new Map<string, { rows: ProfileMediaRow[]; expiresAt: number }>();

const loadUserMediaNonBlocking = async (userId: string): Promise<ProfileMediaRow[]> => {
  const nowMs = Date.now();
  const cached = userMediaCache.get(userId);
  if (cached && cached.expiresAt > nowMs) {
    return cached.rows;
  }

  try {
    const { data: mediaRows, error: mediaError } = await withAuthDeadline(
      supabase
        .from('media_assets')
        .select('role, external_id, created_at')
        .eq('owner_type', 'user')
        .eq('owner_id', userId)
        .in('role', ['avatar', 'hero'])
        .order('created_at', { ascending: false }),
      'Member media lookup timed out.',
      1800,
    );
    if (mediaError) {
      console.warn('Failed to load member media:', mediaError);
      return cached?.rows ?? [];
    }
    const rows = (mediaRows ?? []) as ProfileMediaRow[];
    userMediaCache.set(userId, { rows, expiresAt: nowMs + USER_MEDIA_CACHE_TTL_MS });
    return rows;
  } catch (mediaErr) {
    console.warn('Non-fatal member media lookup error:', mediaErr);
    return cached?.rows ?? [];
  }
};

const loadProfile = async (userId: string, email: string): Promise<User> => {
  const { data, error } = await withAuthDeadline(
    supabase
      .from('profiles')
      .select('id, display_name, handle, bio, role, status, avatar_url, created_at')
      .eq('id', userId)
      .single<ProfileRow>(),
    'Account profile lookup timed out.',
    4000,
  );

  if (error || !data) {
    console.error('Failed to load profile:', error);
    const wrapped = new Error(
      `Signed in, but SwingSphere could not load your account profile: ${error?.message || 'Unknown error'}`,
    ) as Error & { status?: number; code?: string };
    wrapped.code = (error as any)?.code;
    wrapped.status = Number((error as any)?.status || 0) || undefined;
    throw wrapped;
  }

  // Only query media_assets after profiles succeeds, with a 10-minute per-user cache
  const mediaRows = await loadUserMediaNonBlocking(userId);
  const mapped = mapProfile(data, email, mediaRows);
  cacheUserProfile(mapped);
  return mapped;
};

const profileLoader = createDeduplicatedProfileLoader(loadProfile, {
  retryDelaysMs: [400],
  attemptTimeoutMs: 4500,
});

const loadProfileWithRetry = (userId: string, email: string): Promise<User> =>
  profileLoader.load(userId, email);

const MIN_ACCOUNT_REFRESH_COOLDOWN_MS = 60_000;
const ACCOUNT_REFRESH_INTERVAL_MS = 5 * 60_000;

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUserState] = useState<AppState['currentUser']>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authConnectionError, setAuthConnectionError] = useState<string | null>(null);
  const [tags, setTags] = useState<AppState['tags']>([]);
  const [tagCategories, setTagCategories] = useState<AppState['tagCategories']>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [timeLens, setTimeLensState] = useState<TimeLens>({ mode: 'none' });
  const [debugInfo, setDebugInfoState] = useState<{ label: string; extra?: string }>({ label: '' });
  const baseDebugInfo = useRef<{ label: string; extra?: string }>({ label: '' });
  const debugTimeoutRef = useRef<number | null>(null);
  const currentUserRef = useRef<User | null>(null);
  const lastRefreshAtRef = useRef<number>(0);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const setCurrentUser = useCallback((next: User | null) => {
    currentUserRef.current = next;
    setCurrentUserState(next);
  }, []);

  const isDevAdminFallback = useCallback(
    () =>
      import.meta.env.DEV &&
      typeof window !== 'undefined' &&
      ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname.toLowerCase()) &&
      window.localStorage.getItem('swingsphere:dev-admin') === 'true',
    [],
  );

  const purgeRevokedLocalSession = useCallback(() => {
    clearCachedUserProfiles();
    void supabase.auth.signOut({ scope: 'local' }).catch(() => {
      // Ignore local signOut cleanup errors
    });
  }, []);

  const restoreSessionAndProfile = useCallback(async () => {
    let sessionUser: import('@supabase/supabase-js').User | null = null;
    let sessionError: unknown = null;

    try {
      const { data, error } = await withAuthDeadline(
        supabase.auth.getSession(),
        'Session restoration timed out. Please retry signing in.',
        10000,
      );
      if (error) {
        sessionError = error;
      } else {
        sessionUser = data.session?.user ?? null;
      }
    } catch (error) {
      sessionError = error;
      console.warn('Session restoration did not complete:', error);
    }

    const persisted = readPersistedSupabaseSession();
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

    let profile: User | null = null;
    let profileError: unknown = null;

    if (sessionUser) {
      try {
        profile = await loadProfileWithRetry(sessionUser.id, sessionUser.email ?? '');
      } catch (error) {
        profileError = error;
        console.error('Failed to restore authenticated profile:', error);
      }
    } else if (!sessionError && !persisted.hasToken && isDevAdminFallback()) {
      profile = mockUsers[0];
    }

    const transition = resolveAuthTransition({
      sessionUser,
      sessionError,
      profile,
      profileError,
      previousUser: currentUserRef.current,
      hasStoredToken: persisted.hasToken,
      persistedUser: persisted.user,
      isOffline,
    });

    if (transition.shouldClearSession) {
      purgeRevokedLocalSession();
    }

    const finalUser =
      transition.nextUser ||
      (!transition.shouldClearSession && !sessionUser && !sessionError && !persisted.hasToken && isDevAdminFallback()
        ? mockUsers[0]
        : null);

    setCurrentUser(finalUser);
    setAuthConnectionError(transition.connectionError);
    setIsAuthLoading(false);
    lastRefreshAtRef.current = Date.now();
  }, [isDevAdminFallback, purgeRevokedLocalSession, setCurrentUser]);

  useEffect(() => {
    let mounted = true;

    void restoreSessionAndProfile();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      window.setTimeout(async () => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          clearCachedUserProfiles();
          setCurrentUser(isDevAdminFallback() ? mockUsers[0] : null);
          setAuthConnectionError(null);
          setIsAuthLoading(false);
          return;
        }

        const sessionUser = session?.user ?? null;
        const persisted = readPersistedSupabaseSession();
        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

        let profile: User | null = null;
        let profileError: unknown = null;

        if (sessionUser) {
          try {
            profile = await loadProfileWithRetry(sessionUser.id, sessionUser.email ?? '');
          } catch (error) {
            profileError = error;
            console.error('Failed to load authenticated profile after auth state change:', error);
          }
        } else if (!persisted.hasToken && isDevAdminFallback()) {
          profile = mockUsers[0];
        }

        if (!mounted) return;

        const transition = resolveAuthTransition({
          event,
          sessionUser,
          profile,
          profileError,
          previousUser: currentUserRef.current,
          hasStoredToken: persisted.hasToken,
          persistedUser: persisted.user,
          isOffline,
        });

        if (transition.shouldClearSession) {
          purgeRevokedLocalSession();
        }

        setCurrentUser(
          transition.nextUser ||
            (!transition.shouldClearSession && !sessionUser && !persisted.hasToken && isDevAdminFallback()
              ? mockUsers[0]
              : null),
        );
        setAuthConnectionError(transition.connectionError);
        setIsAuthLoading(false);
        lastRefreshAtRef.current = Date.now();
      }, 0);
    });

    const refreshAccountState = async (force = false) => {
      if (!mounted) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && !force) {
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false && !force) {
        return;
      }
      const elapsed = Date.now() - lastRefreshAtRef.current;
      if (!force && elapsed < MIN_ACCOUNT_REFRESH_COOLDOWN_MS) {
        return;
      }
      if (refreshInFlightRef.current) {
        return refreshInFlightRef.current;
      }

      const task = (async () => {
        lastRefreshAtRef.current = Date.now();
        let sessionUser: import('@supabase/supabase-js').User | null = null;
        let sessionError: unknown = null;

        try {
          const { data, error } = await withAuthDeadline(
            supabase.auth.getSession(),
            'Background session check timed out.',
            10000,
          );
          if (error) {
            sessionError = error;
          } else {
            sessionUser = data.session?.user ?? null;
          }
        } catch (err) {
          sessionError = err;
        }

        const persisted = readPersistedSupabaseSession();
        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

        if (!sessionUser) {
          const transition = resolveAuthTransition({
            sessionUser: null,
            sessionError,
            previousUser: currentUserRef.current,
            hasStoredToken: persisted.hasToken,
            persistedUser: persisted.user,
            isOffline,
          });
          if (mounted) {
            if (transition.shouldClearSession || (!persisted.hasToken && !sessionError && !isOffline)) {
              if (transition.shouldClearSession) {
                purgeRevokedLocalSession();
              }
              setCurrentUser(isDevAdminFallback() ? mockUsers[0] : null);
              setAuthConnectionError(null);
            } else {
              if (transition.nextUser) {
                setCurrentUser(transition.nextUser);
              }
              setAuthConnectionError(transition.connectionError);
            }
          }
          return;
        }

        try {
          const profile = await loadProfileWithRetry(sessionUser.id, sessionUser.email ?? '');
          if (mounted) {
            setCurrentUser(profile);
            setAuthConnectionError(null);
          }
        } catch (error) {
          if (isRevokedOrInvalidSessionError(error)) {
            purgeRevokedLocalSession();
            if (mounted) {
              setCurrentUser(null);
              setAuthConnectionError(null);
            }
            return;
          }
          // Keep the last known profile on a transient refresh failure. Backend
          // RLS still enforces the current role/status on every privileged write.
          console.warn('Failed to refresh account role/status:', error);
          if (mounted && !currentUserRef.current) {
            setCurrentUser(buildFallbackUserFromAuthSession(sessionUser, null));
          }
        }
      })().finally(() => {
        refreshInFlightRef.current = null;
      });

      refreshInFlightRef.current = task;
      return task;
    };

    const handleFocus = () => void refreshAccountState(false);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshAccountState(false);
    };
    const accountRefreshInterval = window.setInterval(
      () => void refreshAccountState(false),
      ACCOUNT_REFRESH_INTERVAL_MS,
    );
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      window.clearInterval(accountRefreshInterval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isDevAdminFallback, purgeRevokedLocalSession, restoreSessionAndProfile, setCurrentUser]);

  const setDebugInfo: AppState['setDebugInfo'] = useCallback((info, duration) => {
    if (!duration) baseDebugInfo.current = info;
    if (debugTimeoutRef.current) clearTimeout(debugTimeoutRef.current);
    setDebugInfoState(info);
    if (duration) {
      debugTimeoutRef.current = window.setTimeout(() => {
        setDebugInfoState(baseDebugInfo.current);
        debugTimeoutRef.current = null;
      }, duration);
    }
  }, []);

  const setTimeLens: AppState['setTimeLens'] = useCallback((lens) => setTimeLensState(lens), []);
  const clearTimeLens: AppState['clearTimeLens'] = useCallback(() => setTimeLensState({ mode: 'none' }), []);

  const login: AppState['login'] = useCallback(async (email, password) => {
    const { data, error } = await withAuthDeadline(
      supabase.auth.signInWithPassword({ email, password }),
      'Sign-in is taking too long. Please retry.',
      12000,
    );
    if (error) throw error;
    if (!data.user) return null;

    // Immediately establish authenticated session user so profile query latency
    // (504 / 522 on /rest/v1/profiles) never blocks login completion.
    const immediateUser = buildFallbackUserFromAuthSession(data.user, currentUserRef.current);
    setCurrentUser(immediateUser);

    try {
      const profile = await withAuthDeadline(
        loadProfileWithRetry(data.user.id, data.user.email ?? email),
        'Account profile request timed out.',
        4500,
      );
      setCurrentUser(profile);
      setAuthConnectionError(null);
      return profile;
    } catch (profileErr) {
      if (!isRevokedOrInvalidSessionError(profileErr)) {
        setCurrentUser(immediateUser);
        setAuthConnectionError(
          'Signed in, but SwingSphere is temporarily unable to reach the profile service. Retrying automatically.',
        );
        return immediateUser;
      }
      throw profileErr;
    }
  }, [setCurrentUser]);

  const signInWithGoogle: AppState['signInWithGoogle'] = useCallback(async (nextPath = '/account') => {
    const safeNextPath = nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/account';
    window.sessionStorage.setItem('swingsphere:oauth-next', safeNextPath);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
  }, []);

  const logout: AppState['logout'] = useCallback(async () => {
    try {
      await withAuthDeadline(supabase.auth.signOut(), 'Sign-out timed out.', 5000);
    } catch (err) {
      console.warn('Non-fatal signOut error (clearing local session anyway):', err);
    }
    clearCachedUserProfiles();
    setCurrentUser(null);
    setAuthConnectionError(null);
  }, [setCurrentUser]);

  const signUp: AppState['signUp'] = useCallback(async ({ displayName, email, password, accountIntent }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName, account_intent: accountIntent },
        emailRedirectTo: `${window.location.origin}/account`,
      },
    });
    if (error) throw error;
    if (!data.user) throw new Error('Supabase did not return a user after signup.');

    return {
      id: data.user.id,
      displayName,
      email,
      role: 'User',
      joinDate: data.user.created_at,
      submissionCount: 0,
      status: 'Active',
    };
  }, []);

  const requestPasswordReset: AppState['requestPasswordReset'] = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  }, []);

  const updateUserProfile: AppState['updateUserProfile'] = useCallback(async (userId, profileData) => {
    if (!currentUser || currentUser.id !== userId) throw new Error('Unauthorized');

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        display_name: profileData.displayName,
        handle: profileData.handle,
        bio: profileData.bio || null,
        ...(profileData.avatarUrl !== undefined ? { avatar_url: profileData.avatarUrl || null } : {}),
      })
      .eq('id', userId);
    if (profileError) throw profileError;

    if (profileData.email !== currentUser.email) {
      const { error: emailError } = await supabase.auth.updateUser({ email: profileData.email });
      if (emailError) throw emailError;
    }

    const { data: authData } = await supabase.auth.getUser();
    const updatedUser = await loadProfileWithRetry(userId, authData.user?.email ?? profileData.email);
    setCurrentUser(updatedUser);
    return updatedUser;
  }, [currentUser, setCurrentUser]);

  const removeToast: AppState['removeToast'] = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast: AppState['addToast'] = useCallback((toast) => {
    const newToast = { ...toast, id: Date.now() };
    setToasts((prev) => [...prev, newToast]);
    setTimeout(() => removeToast(newToast.id), 5000);
  }, [removeToast]);

  const fetchTags: AppState['fetchTags'] = useCallback(async () => {
    try {
      const [tagsData, categoriesData] = await Promise.all([getPublicTags(), getPublicTagCategories()]);
      setTags(tagsData);
      setTagCategories(categoriesData);
    } catch {
      addToast({ message: 'Failed to fetch tags.', type: 'error' });
    }
  }, [addToast]);

  const value: AppState = useMemo(() => ({
    currentUser,
    isAuthLoading,
    authConnectionError,
    retryAuthRestore: restoreSessionAndProfile,
    tags,
    tagCategories,
    toasts,
    debugInfo,
    timeLens,
    setTimeLens,
    clearTimeLens,
    setDebugInfo,
    login,
    signInWithGoogle,
    logout,
    signUp,
    requestPasswordReset,
    updateUserProfile,
    addToast,
    removeToast,
    fetchTags,
  }), [
    currentUser,
    isAuthLoading,
    authConnectionError,
    restoreSessionAndProfile,
    tags,
    tagCategories,
    toasts,
    debugInfo,
    timeLens,
    setTimeLens,
    clearTimeLens,
    setDebugInfo,
    login,
    signInWithGoogle,
    logout,
    signUp,
    requestPasswordReset,
    updateUserProfile,
    addToast,
    removeToast,
    fetchTags,
  ]);

  return React.createElement(AppContext.Provider, { value }, children);
};

export const useAppStore = (): AppState => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppStore must be used within an AppProvider');
  return context;
};
