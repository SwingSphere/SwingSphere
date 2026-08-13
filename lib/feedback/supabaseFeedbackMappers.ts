import { FeedbackRepositoryError } from './errors';
import type {
  FeedbackAggregate,
  FeedbackApprovedWrittenExperience,
  FeedbackAttendanceVerification,
  FeedbackExperienceScope,
  FeedbackSafetyReportReceipt,
  FeedbackSentiment,
  FeedbackSignalAggregate,
  FeedbackSubmission,
  FeedbackTargetType,
  FeedbackTextModerationStatus,
} from './types';

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const pick = (value: JsonRecord, camel: string, snake: string): unknown => value[camel] ?? value[snake];
const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new FeedbackRepositoryError('server_error', `Feedback response is missing ${field}.`);
  return value;
};
const optionalString = (value: unknown): string | undefined => typeof value === 'string' && value.length ? value : undefined;
const isoString = (value: unknown, field: string): string => {
  const raw = requiredString(value, field);
  const timestamp = new Date(raw);
  if (!Number.isFinite(timestamp.getTime())) throw new FeedbackRepositoryError('server_error', `Feedback response has an invalid ${field}.`);
  return timestamp.toISOString();
};
const optionalIsoString = (value: unknown): string | undefined => value == null ? undefined : isoString(value, 'timestamp');

const TARGET_TYPES: FeedbackTargetType[] = ['event', 'club', 'organization'];
const SENTIMENTS: FeedbackSentiment[] = ['positive', 'mixed', 'negative'];
const ATTENDANCE: FeedbackAttendanceVerification[] = ['self_reported', 'linked_event', 'platform_confirmed'];
const TEXT_STATUSES: FeedbackTextModerationStatus[] = ['not_submitted', 'pending', 'approved', 'rejected', 'needs_revision'];
const SCOPES: FeedbackExperienceScope[] = ['single_event', 'single_visit', 'multiple_events', 'communication_only'];

export const mapFeedbackSubmission = (value: unknown): FeedbackSubmission => {
  const raw = record(value);
  const targetType = requiredString(pick(raw, 'targetType', 'target_type'), 'targetType') as FeedbackTargetType;
  const sentiment = requiredString(pick(raw, 'overallSentiment', 'overall_sentiment'), 'overallSentiment') as FeedbackSentiment;
  const attendance = requiredString(pick(raw, 'attendanceVerification', 'attendance_verification'), 'attendanceVerification') as FeedbackAttendanceVerification;
  const structuredStatus = requiredString(pick(raw, 'structuredStatus', 'structured_status'), 'structuredStatus') as FeedbackSubmission['structuredStatus'];
  if (!TARGET_TYPES.includes(targetType) || !SENTIMENTS.includes(sentiment) || !ATTENDANCE.includes(attendance) || !['eligible', 'excluded', 'withdrawn'].includes(structuredStatus)) {
    throw new FeedbackRepositoryError('server_error', 'Feedback response contains an unsupported lifecycle value.');
  }
  const signals = Array.isArray(raw.signals) ? raw.signals.map(record) : [];
  const positiveSignalIds: string[] = [];
  const improvementSignalIds: string[] = [];
  signals.forEach((signal) => {
    const signalId = requiredString(pick(signal, 'signalId', 'signal_id'), 'signalId');
    const polarity = requiredString(signal.polarity, 'signal polarity');
    if (polarity === 'positive') positiveSignalIds.push(signalId);
    else if (polarity === 'improvement') improvementSignalIds.push(signalId);
    else throw new FeedbackRepositoryError('server_error', 'Feedback response contains an unsupported signal polarity.');
  });
  const writtenRawValue = pick(raw, 'writtenExperience', 'written_experience');
  const written = record(writtenRawValue);
  const moderationStatus = writtenRawValue == null
    ? 'not_submitted'
    : requiredString(pick(written, 'moderationStatus', 'moderation_status'), 'written moderation status') as FeedbackTextModerationStatus;
  if (!TEXT_STATUSES.includes(moderationStatus)) throw new FeedbackRepositoryError('server_error', 'Feedback response contains an unsupported written status.');
  const scopeValue = optionalString(pick(raw, 'experienceScope', 'experience_scope')) as FeedbackExperienceScope | undefined;
  if (scopeValue && !SCOPES.includes(scopeValue)) throw new FeedbackRepositoryError('server_error', 'Feedback response contains an unsupported experience scope.');
  const registryVersion = Number(pick(raw, 'signalRegistryVersion', 'signal_registry_version'));
  if (!Number.isInteger(registryVersion)) throw new FeedbackRepositoryError('server_error', 'Feedback response is missing signalRegistryVersion.');
  return {
    id: requiredString(raw.id, 'id'),
    authorUserId: requiredString(pick(raw, 'authorUserId', 'author_user_id'), 'authorUserId'),
    targetType,
    targetId: requiredString(pick(raw, 'targetId', 'target_id'), 'targetId'),
    overallSentiment: sentiment,
    positiveSignalIds,
    improvementSignalIds,
    structuredStatus,
    signalRegistryVersion: registryVersion,
    writtenExperience: {
      currentDraftText: optionalString(pick(written, 'currentDraftText', 'current_draft_text')),
      approvedText: optionalString(pick(written, 'approvedText', 'approved_text')),
      moderationStatus,
      submittedAt: optionalIsoString(pick(written, 'submittedAt', 'submitted_at')),
      approvedAt: optionalIsoString(pick(written, 'approvedAt', 'approved_at')),
      updatedAt: optionalIsoString(pick(written, 'updatedAt', 'updated_at')),
    },
    relatedEventId: optionalString(pick(raw, 'relatedEventId', 'related_event_id')),
    relatedVenueId: optionalString(pick(raw, 'relatedVenueId', 'related_venue_id')),
    visitDate: optionalString(pick(raw, 'visitDate', 'visit_date')),
    experienceScope: scopeValue,
    attendanceCountRange: optionalString(pick(raw, 'attendanceCountRange', 'attendance_count_range')) as FeedbackSubmission['attendanceCountRange'],
    attendanceVerification: attendance,
    withdrawnAt: optionalIsoString(pick(raw, 'withdrawnAt', 'withdrawn_at')),
    createdAt: isoString(pick(raw, 'createdAt', 'created_at'), 'createdAt'),
    updatedAt: isoString(pick(raw, 'updatedAt', 'updated_at'), 'updatedAt'),
  };
};

const percentage = (count: number, total: number): number => Math.round((count / total) * 1000) / 10;

export const mapFeedbackAggregate = (value: unknown): FeedbackAggregate => {
  const raw = record(value);
  const threshold = Number(raw.threshold);
  const meetsThreshold = pick(raw, 'meetsThreshold', 'meets_threshold') === true;
  if (!Number.isInteger(threshold) || threshold < 1) throw new FeedbackRepositoryError('server_error', 'Feedback aggregate is missing its threshold.');
  if (!meetsThreshold) {
    return {
      status: 'insufficient_data', threshold, eligibleResponseCount: null, sentimentCounts: null, sentimentPercentages: null,
      signalMentionCounts: null, signalPercentages: null, mostPraisedSignals: [], mostCommonImprovementSignals: [],
    };
  }
  const total = Number(pick(raw, 'submissionCount', 'submission_count'));
  if (!Number.isInteger(total) || total < threshold) throw new FeedbackRepositoryError('server_error', 'Feedback aggregate has an invalid response count.');
  const sentimentRaw = record(pick(raw, 'sentimentPercentages', 'sentiment_percentages'));
  const sentimentPercentages = {
    positive: Number(sentimentRaw.positive ?? 0),
    mixed: Number(sentimentRaw.mixed ?? 0),
    negative: Number(sentimentRaw.negative ?? 0),
  };
  const positiveCounts: Record<string, number> = {};
  const improvementCounts: Record<string, number> = {};
  const positiveSignals: FeedbackSignalAggregate[] = [];
  const improvementSignals: FeedbackSignalAggregate[] = [];
  (Array.isArray(raw.signals) ? raw.signals : []).map(record).forEach((signal) => {
    const signalId = requiredString(pick(signal, 'signalId', 'signal_id'), 'aggregate signalId');
    const polarity = requiredString(signal.polarity, 'aggregate polarity');
    const count = Number(signal.count);
    if (!Number.isInteger(count) || count < 0 || (polarity !== 'positive' && polarity !== 'improvement')) throw new FeedbackRepositoryError('server_error', 'Feedback aggregate contains an invalid signal result.');
    const mapped = { signalId, count, percentage: percentage(count, total) };
    if (polarity === 'positive') { positiveCounts[signalId] = count; positiveSignals.push(mapped); }
    else { improvementCounts[signalId] = count; improvementSignals.push(mapped); }
  });
  return {
    status: 'public_ready', threshold, eligibleResponseCount: total, sentimentCounts: null, sentimentPercentages,
    signalMentionCounts: { positive: positiveCounts, improvement: improvementCounts },
    signalPercentages: {
      positive: Object.fromEntries(positiveSignals.map((signal) => [signal.signalId, signal.percentage])),
      improvement: Object.fromEntries(improvementSignals.map((signal) => [signal.signalId, signal.percentage])),
    },
    mostPraisedSignals: positiveSignals,
    mostCommonImprovementSignals: improvementSignals,
  };
};

export const mapApprovedWrittenExperience = (value: unknown): FeedbackApprovedWrittenExperience => {
  const raw = record(value);
  const sentiment = requiredString(pick(raw, 'overallSentiment', 'overall_sentiment'), 'overallSentiment') as FeedbackSentiment;
  if (!SENTIMENTS.includes(sentiment)) throw new FeedbackRepositoryError('server_error', 'Approved written response has an invalid sentiment.');
  const scope = optionalString(pick(raw, 'experienceScope', 'experience_scope')) as FeedbackExperienceScope | undefined;
  return {
    submissionId: requiredString(pick(raw, 'submissionId', 'feedback_submission_id'), 'submissionId'),
    approvedText: requiredString(pick(raw, 'approvedText', 'approved_text'), 'approvedText'),
    approvedAt: isoString(pick(raw, 'approvedAt', 'approved_at'), 'approvedAt'),
    overallSentiment: sentiment,
    experienceScope: scope,
    authorDisplayName: optionalString(pick(raw, 'authorDisplayName', 'author_display_name')),
    authorHandle: optionalString(pick(raw, 'authorHandle', 'author_handle')),
    authorAvatarUrl: optionalString(pick(raw, 'authorAvatarUrl', 'author_avatar_url')),
  };
};

export const mapSafetyReportReceipt = (value: unknown, context: Omit<FeedbackSafetyReportReceipt, 'id'>): FeedbackSafetyReportReceipt => ({
  ...context,
  id: requiredString(typeof value === 'string' ? value : record(value).id, 'safety report id'),
});
