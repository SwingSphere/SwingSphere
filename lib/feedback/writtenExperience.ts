import type { FeedbackSubmission } from './types';

export const getPublicWrittenText = (submission: FeedbackSubmission): string | undefined => {
  if (submission.structuredStatus === 'withdrawn' || submission.withdrawnAt) return undefined;
  return submission.writtenExperience.approvedText?.trim() || undefined;
};

export const hasPendingWrittenRevision = (submission: FeedbackSubmission): boolean => {
  const written = submission.writtenExperience;
  return Boolean(getPublicWrittenText(submission) && written.currentDraftText?.trim() && written.currentDraftText.trim() !== written.approvedText?.trim() && written.moderationStatus === 'pending');
};
