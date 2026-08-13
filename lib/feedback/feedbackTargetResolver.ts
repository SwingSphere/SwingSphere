import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { FeedbackRepositoryError, toFeedbackRepositoryError } from './errors';
import type { FeedbackRepositoryMode } from './repositoryFactory';

export const WINTER_MASQUERADE_SOURCE_EVENT_ID = 'event-community-winter-masquerade';
export const TWIST_SF_SOURCE_CLUB_ID = 'club-twist-sf';

export type EventFeedbackTarget = {
  sourceEventId: string;
  feedbackTargetId: string;
  targetType: 'event';
  status: 'active';
};

export type ClubFeedbackTarget = {
  sourceClubId: string;
  feedbackTargetId: string;
  targetType: 'club';
  status: 'active';
};

export type FeedbackTargetRecord = { id: string; source_ref: string | null; status: string };
export type FeedbackTargetLookup = (sourceRef: string) => Promise<FeedbackTargetRecord | null>;

export const createMockEventFeedbackTarget = (sourceEventId: string): EventFeedbackTarget => ({
  sourceEventId,
  feedbackTargetId: sourceEventId,
  targetType: 'event',
  status: 'active',
});

export const createMockClubFeedbackTarget = (sourceClubId: string): ClubFeedbackTarget => ({
  sourceClubId,
  feedbackTargetId: sourceClubId,
  targetType: 'club',
  status: 'active',
});

export const createSupabaseFeedbackTargetLookup = (
  table: 'feedback_target_events' | 'feedback_target_clubs',
  client: SupabaseClient = supabase,
): FeedbackTargetLookup => async (sourceRef) => {
  const { data, error } = await client
    .from(table)
    .select('id, source_ref, status')
    .eq('source_ref', sourceRef)
    .maybeSingle<FeedbackTargetRecord>();
  if (error) throw toFeedbackRepositoryError(error);
  return data;
};

export const resolveEventFeedbackTarget = async (
  sourceEventId: string,
  mode: FeedbackRepositoryMode,
  lookup: FeedbackTargetLookup = createSupabaseFeedbackTargetLookup('feedback_target_events'),
): Promise<EventFeedbackTarget> => {
  if (!sourceEventId.trim()) throw new FeedbackRepositoryError('target_not_registered');
  if (mode === 'mock') return createMockEventFeedbackTarget(sourceEventId);

  let record: FeedbackTargetRecord | null;
  try {
    record = await lookup(sourceEventId);
  } catch (error) {
    throw toFeedbackRepositoryError(error);
  }

  if (!record || record.source_ref !== sourceEventId || record.status !== 'active') {
    throw new FeedbackRepositoryError('target_not_registered');
  }

  return {
    sourceEventId,
    feedbackTargetId: record.id,
    targetType: 'event',
    status: 'active',
  };
};

export const resolveClubFeedbackTarget = async (
  sourceClubId: string,
  mode: FeedbackRepositoryMode,
  lookup: FeedbackTargetLookup = createSupabaseFeedbackTargetLookup('feedback_target_clubs'),
): Promise<ClubFeedbackTarget> => {
  if (!sourceClubId.trim()) throw new FeedbackRepositoryError('target_not_registered');
  if (mode === 'mock') return createMockClubFeedbackTarget(sourceClubId);

  let record: FeedbackTargetRecord | null;
  try {
    record = await lookup(sourceClubId);
  } catch (error) {
    throw toFeedbackRepositoryError(error);
  }

  if (!record || record.source_ref !== sourceClubId || record.status !== 'active') {
    throw new FeedbackRepositoryError('target_not_registered');
  }

  return {
    sourceClubId,
    feedbackTargetId: record.id,
    targetType: 'club',
    status: 'active',
  };
};
