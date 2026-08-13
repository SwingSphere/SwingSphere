import { validateStoredFeedbackSubmission } from './validation';
import type { FeedbackAggregate, FeedbackSentiment, FeedbackSignalAggregate, FeedbackSubmission } from './types';

export const EVENT_PUBLIC_FEEDBACK_THRESHOLD = 1;
export const CLUB_PUBLIC_FEEDBACK_THRESHOLD = 10;
export const ORGANIZATION_PUBLIC_FEEDBACK_THRESHOLD = 10;
export const PUBLIC_FEEDBACK_THRESHOLD = CLUB_PUBLIC_FEEDBACK_THRESHOLD;

export const getPublicFeedbackThreshold = (targetType: 'event' | 'club' | 'organization'): number => {
  if (targetType === 'event') return EVENT_PUBLIC_FEEDBACK_THRESHOLD;
  if (targetType === 'organization') return ORGANIZATION_PUBLIC_FEEDBACK_THRESHOLD;
  return CLUB_PUBLIC_FEEDBACK_THRESHOLD;
};
const percentage = (count: number, total: number): number => total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
const countSignals = (submissions: FeedbackSubmission[], field: 'positiveSignalIds' | 'improvementSignalIds') => submissions.reduce<Record<string, number>>((counts, submission) => {
  submission[field].forEach((signalId) => { counts[signalId] = (counts[signalId] ?? 0) + 1; });
  return counts;
}, {});
const rankSignals = (counts: Record<string, number>, total: number): FeedbackSignalAggregate[] => Object.entries(counts).map(([signalId, count]) => ({ signalId, count, percentage: percentage(count, total) })).sort((left, right) => right.count - left.count || left.signalId.localeCompare(right.signalId));

export const isEligibleForPublicFeedbackAggregate = (submission: FeedbackSubmission): boolean => submission.structuredStatus === 'eligible' && !submission.withdrawnAt && validateStoredFeedbackSubmission(submission).valid;

export const aggregateFeedback = (
  submissions: FeedbackSubmission[],
  threshold = getPublicFeedbackThreshold(submissions[0]?.targetType ?? 'club'),
): FeedbackAggregate => {
  const eligible = submissions.filter(isEligibleForPublicFeedbackAggregate);
  const sentimentCounts: Record<FeedbackSentiment, number> = { positive: 0, mixed: 0, negative: 0 };
  eligible.forEach((submission) => { sentimentCounts[submission.overallSentiment] += 1; });
  const eligibleResponseCount = eligible.length;
  const positive = countSignals(eligible, 'positiveSignalIds');
  const improvement = countSignals(eligible, 'improvementSignalIds');
  const publicReady = eligibleResponseCount >= threshold;
  return {
    status: publicReady ? 'public_ready' : 'insufficient_data', threshold, eligibleResponseCount, sentimentCounts,
    sentimentPercentages: publicReady ? { positive: percentage(sentimentCounts.positive, eligibleResponseCount), mixed: percentage(sentimentCounts.mixed, eligibleResponseCount), negative: percentage(sentimentCounts.negative, eligibleResponseCount) } : null,
    signalMentionCounts: { positive, improvement },
    signalPercentages: publicReady ? {
      positive: Object.fromEntries(rankSignals(positive, eligibleResponseCount).map((signal) => [signal.signalId, signal.percentage])),
      improvement: Object.fromEntries(rankSignals(improvement, eligibleResponseCount).map((signal) => [signal.signalId, signal.percentage])),
    } : null,
    mostPraisedSignals: publicReady ? rankSignals(positive, eligibleResponseCount) : [],
    mostCommonImprovementSignals: publicReady ? rankSignals(improvement, eligibleResponseCount) : [],
  };
};
