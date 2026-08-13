import { useCallback, useEffect, useState } from 'react';
import {
  getContentVoteSnapshot,
  subscribeToContentVotes,
  toggleContentVote,
  type ContentVoteDirection,
  type ContentVoteSnapshot,
} from '../lib/community/contentVotes';

export const useContentVote = (input: {
  contentKey: string;
  userId?: string;
  baseUpvotes?: number;
  baseDownvotes?: number;
}) => {
  const {
    contentKey,
    userId,
    baseUpvotes = 0,
    baseDownvotes = 0,
  } = input;

  const readSnapshot = useCallback(() => getContentVoteSnapshot(
    contentKey,
    userId,
    baseUpvotes,
    baseDownvotes,
  ), [baseDownvotes, baseUpvotes, contentKey, userId]);

  const [snapshot, setSnapshot] = useState<ContentVoteSnapshot>(readSnapshot);

  useEffect(() => {
    setSnapshot(readSnapshot());
    return subscribeToContentVotes(() => setSnapshot(readSnapshot()));
  }, [readSnapshot]);

  const vote = useCallback((direction: ContentVoteDirection) => {
    if (!userId) return null;
    const next = toggleContentVote(
      contentKey,
      userId,
      direction,
      baseUpvotes,
      baseDownvotes,
    );
    setSnapshot(next);
    return next;
  }, [baseDownvotes, baseUpvotes, contentKey, userId]);

  return { ...snapshot, vote };
};
