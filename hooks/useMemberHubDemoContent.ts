import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '../data/mockUsers';
import {
  isSwingSphereAdminDemoUser,
  readMemberHubDemoState,
  removeMemberHubDemoState,
  resetMemberHubDemoState,
  writeMemberHubDemoState,
  type MemberHubDemoContribution,
  type MemberHubDemoState,
  type MemberHubDemoTargetType,
} from '../lib/profile/memberHubDemoData';

const emptyState: MemberHubDemoState = {
  version: 2,
  enabled: false,
  contributions: [],
  savedDiscoveries: [],
};

export const useMemberHubDemoContent = (user: User | null | undefined) => {
  const isEligible = isSwingSphereAdminDemoUser(user);
  const [state, setState] = useState<MemberHubDemoState>(() => (
    isEligible && user ? readMemberHubDemoState(user.id) : emptyState
  ));

  useEffect(() => {
    if (!isEligible || !user) {
      setState(emptyState);
      return;
    }
    setState(readMemberHubDemoState(user.id));
  }, [isEligible, user?.id]);

  useEffect(() => {
    if (!isEligible || !user || typeof window === 'undefined') return;
    const handleChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ userId?: string }>;
      if (customEvent.detail?.userId && customEvent.detail.userId !== user.id) return;
      setState(readMemberHubDemoState(user.id));
    };
    window.addEventListener('swingsphere:member-hub-demo-changed', handleChange);
    window.addEventListener('storage', handleChange);
    return () => {
      window.removeEventListener('swingsphere:member-hub-demo-changed', handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }, [isEligible, user?.id]);

  const persist = useCallback((next: MemberHubDemoState) => {
    if (!user || !isEligible) return;
    writeMemberHubDemoState(user.id, next);
    setState(next);
  }, [isEligible, user]);

  const editReview = useCallback((contributionId: string, body: string) => {
    if (!state.enabled) return;
    persist({
      ...state,
      contributions: state.contributions.map((contribution) => (
        contribution.id === contributionId
          ? { ...contribution, body: body.trim(), editedAt: new Date().toISOString() }
          : contribution
      )),
    });
  }, [persist, state]);

  const deleteContribution = useCallback((contributionId: string) => {
    if (!state.enabled) return;
    persist({
      ...state,
      contributions: state.contributions.filter((contribution) => contribution.id !== contributionId),
    });
  }, [persist, state]);

  const addReview = useCallback((input: {
    targetType: MemberHubDemoTargetType;
    targetId: string;
    targetName: string;
    body: string;
    sentiment?: 'positive' | 'mixed' | 'negative';
  }): MemberHubDemoContribution | null => {
    if (!state.enabled || !user || !isEligible || !input.body.trim()) return null;
    const now = new Date().toISOString();
    const existing = state.contributions.find((contribution) => (
      contribution.targetType === input.targetType && contribution.targetId === input.targetId
    ));
    if (existing) {
      const updated: MemberHubDemoContribution = {
        ...existing,
        targetName: input.targetName,
        body: input.body.trim(),
        sentiment: input.sentiment ?? existing.sentiment ?? 'mixed',
        editedAt: now,
      };
      persist({
        ...state,
        contributions: state.contributions.map((contribution) => contribution.id === existing.id ? updated : contribution),
      });
      return updated;
    }
    const contribution: MemberHubDemoContribution = {
      id: `demo-review-${input.targetType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'review',
      targetType: input.targetType,
      targetId: input.targetId,
      targetName: input.targetName,
      body: input.body.trim(),
      createdAt: now,
      sentiment: input.sentiment ?? 'mixed',
      upvoteCount: 0,
      downvoteCount: 0,
      status: 'published',
    };
    persist({
      ...state,
      contributions: [contribution, ...state.contributions],
    });
    return contribution;
  }, [isEligible, persist, state, user]);

  const addSavedDiscovery = useCallback((input: {
    entityType: MemberHubDemoState['savedDiscoveries'][number]['entityType'];
    entityId: string;
    targetName?: string;
    location?: string;
  }) => {
    if (!state.enabled || !user || !isEligible) return null;
    const existing = state.savedDiscoveries.find((saved) => (
      saved.entityType === input.entityType && saved.entityId === input.entityId
    ));
    if (existing) return existing;
    const created = {
      id: `demo-saved-${input.entityType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      entityType: input.entityType,
      entityId: input.entityId,
      targetName: input.targetName?.trim() || input.entityId,
      location: input.location?.trim() || '',
      createdAt: new Date().toISOString(),
    };
    persist({
      ...state,
      savedDiscoveries: [created, ...state.savedDiscoveries],
    });
    return created;
  }, [isEligible, persist, state, user]);

  const deleteSavedDiscovery = useCallback((savedId: string) => {
    if (!state.enabled) return;
    persist({
      ...state,
      savedDiscoveries: state.savedDiscoveries.filter((saved) => saved.id !== savedId),
    });
  }, [persist, state]);

  const reset = useCallback(() => {
    if (!user || !isEligible) return;
    setState(resetMemberHubDemoState(user.id));
  }, [isEligible, user]);

  const removeAll = useCallback(() => {
    if (!user || !isEligible) return;
    setState(removeMemberHubDemoState(user.id));
  }, [isEligible, user]);

  return useMemo(() => ({
    isEligible,
    isEnabled: isEligible && state.enabled,
    contributions: state.enabled ? state.contributions : [],
    savedDiscoveries: state.enabled ? state.savedDiscoveries : [],
    editReview,
    addReview,
    deleteContribution,
    addSavedDiscovery,
    deleteSavedDiscovery,
    reset,
    removeAll,
  }), [
    addReview,
    addSavedDiscovery,
    deleteContribution,
    deleteSavedDiscovery,
    editReview,
    isEligible,
    removeAll,
    reset,
    state,
  ]);
};
