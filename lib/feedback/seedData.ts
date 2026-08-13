import { FEEDBACK_SIGNAL_REGISTRY_VERSION } from './promptRegistry';
import type { FeedbackSafetyReport, FeedbackSubmission, FeedbackWrittenExperience } from './types';

export const FEEDBACK_DEMO_EVENT_ID = 'event-community-winter-masquerade';

const writtenScenarios: Record<number, FeedbackWrittenExperience> = {
  1: { approvedText: 'A warm welcome, clear expectations, and an easy arrival made the evening feel considered.', currentDraftText: 'A warm welcome, clear expectations, and an easy arrival made the evening feel considered.', moderationStatus: 'approved', submittedAt: '2026-05-25T18:00:00.000Z', approvedAt: '2026-05-26T18:00:00.000Z' },
  2: { approvedText: 'The hosts communicated clearly and made the newcomer experience comfortable.', currentDraftText: 'The hosts communicated clearly, and the welcome felt even more considered this time.', moderationStatus: 'pending', submittedAt: '2026-05-30T18:00:00.000Z', updatedAt: '2026-05-30T18:00:00.000Z', approvedAt: '2026-05-26T18:00:00.000Z' },
  3: { currentDraftText: 'The music was strong and the social areas had a good flow.', moderationStatus: 'pending', submittedAt: '2026-05-30T18:00:00.000Z' },
  4: { approvedText: 'Check-in was smooth and the listing set accurate expectations.', currentDraftText: 'This rejected revision should never replace the currently published version.', moderationStatus: 'rejected', submittedAt: '2026-05-30T18:00:00.000Z', approvedAt: '2026-05-26T18:00:00.000Z', updatedAt: '2026-05-30T18:00:00.000Z' },
};

const eligible = (sequence: number, overallSentiment: FeedbackSubmission['overallSentiment'], positiveSignalIds: string[], improvementSignalIds: string[] = []): FeedbackSubmission => {
  const timestamp = `2026-05-${String(24 + Math.min(sequence, 6)).padStart(2, '0')}T18:00:00.000Z`;
  return {
    id: `feedback-demo-eligible-${sequence}`,
    authorUserId: `feedback-demo-user-${String(sequence).padStart(2, '0')}`,
    targetType: 'event', targetId: FEEDBACK_DEMO_EVENT_ID, relatedEventId: FEEDBACK_DEMO_EVENT_ID,
    experienceScope: 'single_event', overallSentiment, positiveSignalIds, improvementSignalIds,
    structuredStatus: 'eligible', signalRegistryVersion: FEEDBACK_SIGNAL_REGISTRY_VERSION,
    attendanceVerification: sequence === 1 ? 'platform_confirmed' : 'self_reported',
    writtenExperience: writtenScenarios[sequence] ?? { moderationStatus: 'not_submitted' },
    createdAt: timestamp, updatedAt: timestamp,
  };
};

export const MOCK_FEEDBACK_SEED: FeedbackSubmission[] = [
  eligible(1, 'positive', ['friendly_crowd', 'great_music', 'smooth_check_in', 'matched_listing']),
  eligible(2, 'positive', ['friendly_crowd', 'newcomer_friendly', 'clear_rules', 'clear_communication']),
  eligible(3, 'positive', ['great_music', 'enough_social_space', 'clean_environment']),
  eligible(4, 'positive', ['smooth_check_in', 'clear_communication', 'matched_listing']),
  eligible(5, 'positive', ['friendly_crowd', 'newcomer_friendly', 'enough_social_space']),
  eligible(6, 'positive', ['great_music', 'clear_rules', 'clean_environment']),
  eligible(7, 'positive', ['friendly_crowd', 'matched_listing', 'enough_play_space']),
  eligible(8, 'positive', ['clear_communication', 'smooth_check_in', 'great_music']),
  eligible(9, 'mixed', ['friendly_crowd', 'great_music'], ['smooth_check_in']),
  eligible(10, 'mixed', ['clear_rules', 'matched_listing'], ['enough_social_space']),
  eligible(11, 'mixed', ['newcomer_friendly'], ['clear_communication', 'smooth_check_in']),
  eligible(12, 'negative', [], ['matched_listing', 'clean_environment', 'enough_play_space']),
  {
    ...eligible(13, 'mixed', ['great_music'], ['enough_social_space']),
    id: 'feedback-demo-withdrawn-1', authorUserId: 'feedback-demo-user-13', structuredStatus: 'withdrawn',
    withdrawnAt: '2026-05-31T18:00:00.000Z', writtenExperience: { approvedText: 'Withdrawn text must not remain public.', moderationStatus: 'approved', approvedAt: '2026-05-30T18:00:00.000Z' },
  },
  {
    ...eligible(14, 'negative', [], ['great_music']),
    id: 'feedback-demo-excluded-1', authorUserId: 'feedback-demo-user-14', structuredStatus: 'excluded',
    writtenExperience: { currentDraftText: 'This first submission was rejected during text moderation.', moderationStatus: 'rejected', submittedAt: '2026-05-30T18:00:00.000Z' },
  },
];

export const MOCK_SAFETY_REPORT_SEED: FeedbackSafetyReport[] = [{
  id: 'feedback-demo-private-safety-1', authorUserId: 'feedback-demo-user-16', targetType: 'event',
  targetId: FEEDBACK_DEMO_EVENT_ID, relatedEventId: FEEDBACK_DEMO_EVENT_ID, categoryId: 'privacy_violation',
  status: 'pending', createdAt: '2026-05-30T22:00:00.000Z', updatedAt: '2026-05-30T22:00:00.000Z',
}];
