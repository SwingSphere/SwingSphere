import type { User } from '../../data/mockUsers';
import type { SavedEntityType } from './profileTypes';

export type MemberHubDemoContributionKind = 'review';
export type MemberHubDemoTargetType = 'club' | 'event';

export type MemberHubDemoContribution = {
  id: string;
  kind: MemberHubDemoContributionKind;
  targetType: MemberHubDemoTargetType;
  targetId: string;
  targetName: string;
  body: string;
  createdAt: string;
  editedAt?: string;
  sentiment: 'positive' | 'mixed' | 'negative';
  upvoteCount?: number;
  downvoteCount?: number;
  status: 'published';
};

export type MemberHubDemoSavedDiscovery = {
  id: string;
  entityType: SavedEntityType;
  entityId: string;
  targetName: string;
  location: string;
  createdAt: string;
};

export type MemberHubDemoState = {
  version: 2;
  enabled: boolean;
  contributions: MemberHubDemoContribution[];
  savedDiscoveries: MemberHubDemoSavedDiscovery[];
};

const STORAGE_PREFIX = 'swingsphere:member-hub-demo:';
export const MEMBER_HUB_DEMO_EVENT_NAME = 'Winter Masquerade';

const createDefaultState = (): MemberHubDemoState => ({
  version: 2,
  enabled: true,
  contributions: [
    {
      id: 'demo-review-club-twist-sf',
      kind: 'review',
      targetType: 'club',
      targetId: 'club-twist-sf',
      targetName: 'Twist SF',
      body: 'Check-in felt organized, the hosts were visible, and the different social and play areas were easy to navigate. The listing matched what I experienced that evening.',
      createdAt: '2026-07-28T05:40:00.000Z',
      editedAt: '2026-08-04T18:32:00.000Z',
      sentiment: 'positive',
      upvoteCount: 12,
      downvoteCount: 1,
      status: 'published',
    },
    {
      id: 'demo-review-event-winter-masquerade',
      kind: 'review',
      targetType: 'event',
      targetId: 'event-community-winter-masquerade',
      targetName: MEMBER_HUB_DEMO_EVENT_NAME,
      body: 'A warm welcome, clear expectations, and an easy arrival made the evening feel considered. The hosts communicated well and the social spaces had a comfortable flow.',
      createdAt: '2026-05-25T18:00:00.000Z',
      sentiment: 'positive',
      upvoteCount: 9,
      downvoteCount: 1,
      status: 'published',
    },
  ],
  savedDiscoveries: [
    {
      id: 'demo-saved-winter-masquerade',
      entityType: 'event',
      entityId: 'event-community-winter-masquerade',
      targetName: MEMBER_HUB_DEMO_EVENT_NAME,
      location: 'San Francisco, CA',
      createdAt: '2026-08-05T19:20:00.000Z',
    },
    {
      id: 'demo-saved-twist-sf',
      entityType: 'club',
      entityId: 'club-twist-sf',
      targetName: 'Twist SF',
      location: 'San Francisco, CA',
      createdAt: '2026-08-03T21:05:00.000Z',
    },
    {
      id: 'demo-saved-connect-dance-love',
      entityType: 'event',
      entityId: 'event-1782943939781',
      targetName: 'Connect.Dance.Love',
      location: 'Oakland, CA',
      createdAt: '2026-08-02T16:45:00.000Z',
    },
  ],
});

const getStorageKey = (userId: string) => `${STORAGE_PREFIX}${userId}`;

export const isSwingSphereAdminDemoUser = (user: User | null | undefined) => Boolean(
  user
  && user.role === 'Admin'
  && (
    user.handle?.toLowerCase() === 'swingsphere'
    || user.email.toLowerCase() === 'admin@swingsphere.co'
    || user.displayName.toLowerCase() === 'swingsphere'
  )
);

export const readMemberHubDemoState = (userId: string): MemberHubDemoState => {
  if (typeof window === 'undefined') return createDefaultState();
  const key = getStorageKey(userId);
  const stored = window.localStorage.getItem(key);
  if (!stored) {
    const seeded = createDefaultState();
    window.localStorage.setItem(key, JSON.stringify(seeded));
    return seeded;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<MemberHubDemoState> & { version?: number };
    if (parsed.version !== 2 || !Array.isArray(parsed.contributions) || !Array.isArray(parsed.savedDiscoveries)) {
      throw new Error('Unsupported demo state.');
    }
    const defaults = createDefaultState();
    return {
      version: 2,
      enabled: parsed.enabled !== false,
      contributions: parsed.contributions
        .filter((item) => item?.kind === 'review')
        .map((item) => ({
          ...defaults.contributions.find((defaultItem) => defaultItem.id === item.id),
          ...item,
          kind: 'review',
          sentiment: item.sentiment ?? 'mixed',
        })) as MemberHubDemoContribution[],
      savedDiscoveries: parsed.savedDiscoveries.map((item) => ({
        ...defaults.savedDiscoveries.find((defaultItem) => defaultItem.id === item.id),
        ...item,
      })) as MemberHubDemoSavedDiscovery[],
    };
  } catch {
    const seeded = createDefaultState();
    window.localStorage.setItem(key, JSON.stringify(seeded));
    return seeded;
  }
};

export const writeMemberHubDemoState = (userId: string, state: MemberHubDemoState) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getStorageKey(userId), JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('swingsphere:member-hub-demo-changed', { detail: { userId } }));
};

export const resetMemberHubDemoState = (userId: string) => {
  const state = createDefaultState();
  writeMemberHubDemoState(userId, state);
  return state;
};

export const removeMemberHubDemoState = (userId: string) => {
  const state: MemberHubDemoState = {
    version: 2,
    enabled: false,
    contributions: [],
    savedDiscoveries: [],
  };
  writeMemberHubDemoState(userId, state);
  return state;
};
