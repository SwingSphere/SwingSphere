import { FEEDBACK_SIGNAL_REGISTRY_VERSION } from './promptRegistry';
import type { FeedbackDraft, FeedbackSubmission, FeedbackTargetType } from './types';

export const createDemoFeedbackSubmission = (input: {
  authorUserId: string;
  targetType: FeedbackTargetType;
  targetId: string;
  draft: FeedbackDraft;
}): FeedbackSubmission => {
  const now = new Date().toISOString();
  return {
    id: `demo-feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    authorUserId: input.authorUserId,
    targetType: input.targetType,
    targetId: input.targetId,
    overallSentiment: input.draft.overallSentiment ?? 'mixed',
    positiveSignalIds: [...input.draft.positiveSignalIds],
    improvementSignalIds: [...input.draft.improvementSignalIds],
    structuredStatus: 'eligible',
    signalRegistryVersion: FEEDBACK_SIGNAL_REGISTRY_VERSION,
    writtenExperience: {
      currentDraftText: input.draft.reviewText?.trim() || undefined,
      approvedText: input.draft.reviewText?.trim() || undefined,
      moderationStatus: input.draft.reviewText?.trim() ? 'approved' : 'not_submitted',
      submittedAt: input.draft.reviewText?.trim() ? now : undefined,
      approvedAt: input.draft.reviewText?.trim() ? now : undefined,
      updatedAt: now,
    },
    relatedEventId: input.draft.relatedEventId,
    relatedVenueId: input.draft.relatedVenueId,
    visitDate: input.draft.visitDate,
    experienceScope: input.draft.experienceScope,
    attendanceCountRange: input.draft.attendanceCountRange,
    attendanceVerification: input.draft.attendanceVerification ?? 'self_reported',
    createdAt: now,
    updatedAt: now,
  };
};
