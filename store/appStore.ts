import React, { useState, useContext, createContext, useRef, useCallback, useMemo, useEffect } from 'react';
import type { AppState, Toast, TimeLens } from '../types';
import type { User } from '../data/mockUsers';
import * as api from '../lib/api';
import { supabase } from '../lib/supabase';
import { getCloudflareImageUrl } from '../lib/media/getCloudflareImageUrl';

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

const loadProfile = async (userId: string, email: string): Promise<User> => {
  const [{ data, error }, { data: mediaRows, error: mediaError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, handle, bio, role, status, avatar_url, created_at')
      .eq('id', userId)
      .single<ProfileRow>(),
    supabase
      .from('media_assets')
      .select('role, external_id, created_at')
      .eq('owner_type', 'user')
      .eq('owner_id', userId)
      .in('role', ['avatar', 'hero'])
      .order('created_at', { ascending: false }),
  ]);

  if (error) {
    console.error('Failed to load profile:', error);
    throw new Error(`Signed in, but SwingSphere could not load your account profile: ${error.message}`);
  }
  if (mediaError) console.warn('Failed to load member media:', mediaError);
  return mapProfile(data, email, (mediaRows ?? []) as ProfileMediaRow[]);
};

const loadProfileWithRetry = async (userId: string, email: string): Promise<User> => {
  try {
    return await loadProfile(userId, email);
  } catch (firstError) {
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    try {
      return await loadProfile(userId, email);
    } catch {
      throw firstError;
    }
  }
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppState['currentUser']>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [tags, setTags] = useState<AppState['tags']>([]);
  const [tagCategories, setTagCategories] = useState<AppState['tagCategories']>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [timeLens, setTimeLensState] = useState<TimeLens>({ mode: 'none' });
  const [debugInfo, setDebugInfoState] = useState<{ label: string; extra?: string }>({ label: '' });
  const baseDebugInfo = useRef<{ label: string; extra?: string }>({ label: '' });
  const debugTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const restore = async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      let profile: User | null = null;
      if (user) {
        try {
          profile = await loadProfileWithRetry(user.id, user.email ?? '');
        } catch (error) {
          console.error('Failed to restore authenticated profile:', error);
        }
      }
      if (mounted) {
        setCurrentUser(profile);
        setIsAuthLoading(false);
      }
    };

    void restore();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(async () => {
        let profile: User | null = null;
        if (session?.user) {
          try {
            profile = await loadProfileWithRetry(session.user.id, session.user.email ?? '');
          } catch (error) {
            console.error('Failed to load authenticated profile after auth state change:', error);
          }
        }
        if (mounted) {
          setCurrentUser(profile);
          setIsAuthLoading(false);
        }
      }, 0);
    });

    const refreshAccountState = async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) {
        if (mounted) setCurrentUser(null);
        return;
      }
      try {
        const profile = await loadProfileWithRetry(user.id, user.email ?? '');
        if (mounted) setCurrentUser(profile);
      } catch (error) {
        // Keep the last known profile on a transient refresh failure. Backend
        // RLS still enforces the current role/status on every privileged write.
        console.warn('Failed to refresh account role/status:', error);
      }
    };

    const handleFocus = () => void refreshAccountState();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshAccountState();
    };
    const accountRefreshInterval = window.setInterval(() => void refreshAccountState(), 60_000);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      window.clearInterval(accountRefreshInterval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user) return null;
    const profile = await loadProfileWithRetry(data.user.id, data.user.email ?? email);
    setCurrentUser(profile);
    return profile;
  }, []);

  const logout: AppState['logout'] = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setCurrentUser(null);
  }, []);

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
  }, [currentUser]);

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
      const [tagsData, categoriesData] = await Promise.all([api.getTags(), api.getTagCategories()]);
      setTags(tagsData);
      setTagCategories(categoriesData);
    } catch {
      addToast({ message: 'Failed to fetch tags.', type: 'error' });
    }
  }, [addToast]);

  const value: AppState = useMemo(() => ({
    currentUser,
    isAuthLoading,
    tags,
    tagCategories,
    toasts,
    debugInfo,
    timeLens,
    setTimeLens,
    clearTimeLens,
    setDebugInfo,
    login,
    logout,
    signUp,
    requestPasswordReset,
    updateUserProfile,
    addToast,
    removeToast,
    fetchTags,
  }), [currentUser, isAuthLoading, tags, tagCategories, toasts, debugInfo, timeLens, setTimeLens, clearTimeLens, setDebugInfo, login, logout, signUp, requestPasswordReset, updateUserProfile, addToast, removeToast, fetchTags]);

  return React.createElement(AppContext.Provider, { value }, children);
};

export const useAppStore = (): AppState => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppStore must be used within an AppProvider');
  return context;
};
