export type ContentVoteDirection = 'up' | 'down';

export type ContentVoteSnapshot = {
  upvotes: number;
  downvotes: number;
  currentVote: ContentVoteDirection | null;
};

type StoredVoteState = Record<string, Record<string, ContentVoteDirection>>;

const STORAGE_KEY = 'swingsphere:community-content-votes:v1';
const CHANGE_EVENT = 'swingsphere:community-content-votes-changed';

const readState = (): StoredVoteState => {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed as StoredVoteState : {};
  } catch {
    return {};
  }
};

const writeState = (state: StoredVoteState) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
};

export const getContentVoteSnapshot = (
  contentKey: string,
  userId: string | undefined,
  baseUpvotes = 0,
  baseDownvotes = 0,
): ContentVoteSnapshot => {
  const votes = readState()[contentKey] ?? {};
  const values = Object.values(votes);
  return {
    upvotes: Math.max(0, baseUpvotes) + values.filter((vote) => vote === 'up').length,
    downvotes: Math.max(0, baseDownvotes) + values.filter((vote) => vote === 'down').length,
    currentVote: userId ? votes[userId] ?? null : null,
  };
};

export const toggleContentVote = (
  contentKey: string,
  userId: string,
  direction: ContentVoteDirection,
  baseUpvotes = 0,
  baseDownvotes = 0,
): ContentVoteSnapshot => {
  const state = readState();
  const votes = { ...(state[contentKey] ?? {}) };

  if (votes[userId] === direction) {
    delete votes[userId];
  } else {
    votes[userId] = direction;
  }

  if (Object.keys(votes).length) state[contentKey] = votes;
  else delete state[contentKey];
  writeState(state);

  return getContentVoteSnapshot(contentKey, userId, baseUpvotes, baseDownvotes);
};

export const subscribeToContentVotes = (listener: () => void) => {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
};
