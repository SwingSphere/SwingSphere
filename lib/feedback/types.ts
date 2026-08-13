export type FeedbackTargetType = 'event' | 'club' | 'organization';

export type FeedbackSentiment = 'positive' | 'mixed' | 'negative';

export type FeedbackExperienceScope =
  | 'single_event'
  | 'single_visit'
  | 'multiple_events'
  | 'communication_only';

export type FeedbackAttendanceCountRange = 'one' | 'two_to_four' | 'five_plus';

export type FeedbackAttendanceVerification =
  | 'self_reported'
  | 'linked_event'
  | 'platform_confirmed';

export type FeedbackClientAttendanceVerification = Exclude<
  FeedbackAttendanceVerification,
  'platform_confirmed'
>;

export type FeedbackStructuredStatus = 'eligible' | 'excluded' | 'withdrawn';

export type FeedbackTextModerationStatus =
  | 'not_submitted'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'needs_revision';

export type FeedbackWrittenExperience = {
  currentDraftText?: string;
  approvedText?: string;
  moderationStatus: FeedbackTextModerationStatus;
  submittedAt?: string;
  approvedAt?: string;
  updatedAt?: string;
};

export type FeedbackSignalPolarity = 'positive' | 'improvement';

export type FeedbackSignalDefinition = {
  id: string;
  targetTypes: FeedbackTargetType[];
  label: string;
  positiveLabel?: string;
  improvementLabel?: string;
  shortLabel?: string;
  description?: string;
  category: string;
  polaritySupport: 'positive' | 'improvement' | 'both';
  safetySensitive?: boolean;
  applicableTags?: string[];
  allowDualPolarity?: boolean;
};

export type FeedbackSafetyConcernDefinition = {
  id: string;
  label: string;
  description: string;
};

export type FeedbackSubmission = {
  id: string;
  authorUserId: string;
  targetType: FeedbackTargetType;
  targetId: string;
  overallSentiment: FeedbackSentiment;
  positiveSignalIds: string[];
  improvementSignalIds: string[];
  structuredStatus: FeedbackStructuredStatus;
  signalRegistryVersion: number;
  writtenExperience: FeedbackWrittenExperience;
  relatedEventId?: string;
  relatedVenueId?: string;
  visitDate?: string;
  experienceScope?: FeedbackExperienceScope;
  attendanceCountRange?: FeedbackAttendanceCountRange;
  attendanceVerification: FeedbackAttendanceVerification;
  withdrawnAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type FeedbackSafetyReport = {
  id: string;
  authorUserId: string;
  targetType: FeedbackTargetType;
  targetId: string;
  categoryId: string;
  relatedEventId?: string;
  relatedVenueId?: string;
  status: 'pending';
  createdAt: string;
  updatedAt: string;
};

export type FeedbackSafetyReportReceipt = {
  id: string;
  targetType: FeedbackTargetType;
  targetId: string;
  categoryId: string;
};

export type FeedbackApprovedWrittenExperience = {
  submissionId: string;
  approvedText: string;
  approvedAt: string;
  overallSentiment: FeedbackSentiment;
  experienceScope?: FeedbackExperienceScope;
  authorDisplayName?: string;
  authorHandle?: string;
  authorAvatarUrl?: string;
};

export type FeedbackSubmissionCreateInput = {
  authorUserId: string;
  targetType: FeedbackTargetType;
  targetId: string;
  overallSentiment: FeedbackSentiment;
  positiveSignalIds: string[];
  improvementSignalIds: string[];
  signalRegistryVersion: number;
  writtenDraftText?: string;
  relatedEventId?: string;
  relatedVenueId?: string;
  visitDate?: string;
  experienceScope?: FeedbackExperienceScope;
  attendanceCountRange?: FeedbackAttendanceCountRange;
  attendanceVerification: FeedbackClientAttendanceVerification;
};

export type FeedbackStructuredUpdateInput = Omit<
  FeedbackSubmissionCreateInput,
  'authorUserId' | 'targetType' | 'targetId' | 'writtenDraftText'
>;

export type FeedbackDraft = {
  targetType?: FeedbackTargetType;
  targetId?: string;
  overallSentiment?: FeedbackSentiment;
  positiveSignalIds: string[];
  improvementSignalIds: string[];
  reviewText?: string;
  relatedEventId?: string;
  relatedVenueId?: string;
  visitDate?: string;
  experienceScope?: FeedbackExperienceScope;
  attendanceCountRange?: FeedbackAttendanceCountRange;
  attendanceVerification?: FeedbackClientAttendanceVerification;
};

export type FeedbackValidationField =
  | 'authorUserId'
  | 'targetType'
  | 'targetId'
  | 'overallSentiment'
  | 'positiveSignalIds'
  | 'improvementSignalIds'
  | 'reviewText'
  | 'writtenExperience'
  | 'relatedEventId'
  | 'relatedVenueId'
  | 'visitDate'
  | 'experienceScope'
  | 'attendanceCountRange'
  | 'attendanceVerification'
  | 'structuredStatus'
  | 'signalRegistryVersion'
  | 'safetyConcernCategory'
  | 'eventEndAt'
  | 'withdrawnAt';

export type FeedbackValidationError = {
  field: FeedbackValidationField;
  code: string;
  message: string;
};

export type FeedbackValidationResult = {
  valid: boolean;
  errors: FeedbackValidationError[];
};

export type FeedbackValidationContext = {
  now?: Date | string;
  eventEndAt?: Date | string;
};

export type FeedbackEligibility = {
  allowed: boolean;
  mode: 'create' | 'update' | 'unavailable';
  reason?: string;
  existingSubmissionId?: string;
};

export type FeedbackSignalAggregate = {
  signalId: string;
  count: number;
  percentage: number;
};

export type FeedbackAggregate = {
  status: 'insufficient_data' | 'public_ready';
  threshold: number;
  eligibleResponseCount: number | null;
  sentimentCounts: Record<FeedbackSentiment, number> | null;
  sentimentPercentages: Record<FeedbackSentiment, number> | null;
  signalMentionCounts: {
    positive: Record<string, number>;
    improvement: Record<string, number>;
  } | null;
  signalPercentages: {
    positive: Record<string, number>;
    improvement: Record<string, number>;
  } | null;
  mostPraisedSignals: FeedbackSignalAggregate[];
  mostCommonImprovementSignals: FeedbackSignalAggregate[];
};

export interface FeedbackRepository {
  listForTarget(targetType: FeedbackTargetType, targetId: string): Promise<FeedbackSubmission[]>;
  getSubmissionById(id: string): Promise<FeedbackSubmission | null>;
  getUserSubmission(targetType: FeedbackTargetType, targetId: string, userId: string): Promise<FeedbackSubmission | null>;
  createSubmission(input: FeedbackSubmissionCreateInput): Promise<FeedbackSubmission>;
  updateSubmission(id: string, input: FeedbackStructuredUpdateInput): Promise<FeedbackSubmission>;
  submitWrittenRevision(id: string, text: string): Promise<FeedbackSubmission>;
  withdrawSubmission(id: string): Promise<FeedbackSubmission>;
  createSafetyReport(input: SubmitSafetyConcernInput): Promise<FeedbackSafetyReportReceipt>;
  getAggregate(targetType: FeedbackTargetType, targetId: string): Promise<FeedbackAggregate>;
  listApprovedWritten(targetType: FeedbackTargetType, targetId: string, limit?: number, offset?: number): Promise<FeedbackApprovedWrittenExperience[]>;
}

export type SubmitFeedbackContext = FeedbackValidationContext & {
  authorUserId: string;
};

export type SubmitSafetyConcernInput = {
  authorUserId: string;
  targetType: FeedbackTargetType;
  targetId: string;
  categoryId: string;
  narrative: string;
  relatedEventId?: string;
  relatedVenueId?: string;
};

export type FeedbackStorageEnvelope = {
  schemaVersion: 2;
  submissions: FeedbackSubmission[];
  safetyReports: FeedbackSafetyReport[];
};
