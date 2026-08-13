import {
  FEEDBACK_SIGNAL_REGISTRY_VERSION,
  getFeedbackSignal,
  isSafetyConcernCategory,
} from './promptRegistry';
import type {
  FeedbackDraft,
  FeedbackSignalPolarity,
  FeedbackSubmission,
  FeedbackSubmissionCreateInput,
  FeedbackTargetType,
  FeedbackValidationContext,
  FeedbackValidationError,
  FeedbackValidationResult,
  SubmitSafetyConcernInput,
} from './types';

export const FEEDBACK_REVIEW_TEXT_MIN_LENGTH = 10;
export const FEEDBACK_REVIEW_TEXT_MAX_LENGTH = 5000;
export const FEEDBACK_SAFETY_NARRATIVE_MAX_LENGTH = 4000;
type ValidatableFeedback = FeedbackDraft & { authorUserId?: string; signalRegistryVersion?: number };
const TARGET_TYPES: FeedbackTargetType[] = ['event', 'club', 'organization'];
const CLIENT_ATTENDANCE = ['self_reported', 'linked_event'];

const addError = (errors: FeedbackValidationError[], field: FeedbackValidationError['field'], code: string, message: string) => errors.push({ field, code, message });

const validateSignals = (errors: FeedbackValidationError[], targetType: FeedbackTargetType, signalIds: string[], polarity: FeedbackSignalPolarity) => {
  const field = polarity === 'positive' ? 'positiveSignalIds' : 'improvementSignalIds';
  if (new Set(signalIds).size !== signalIds.length) addError(errors, field, 'duplicate_signal', 'Each signal can only be selected once.');
  signalIds.forEach((signalId) => {
    const definition = getFeedbackSignal(signalId);
    const supportsPolarity = definition && (definition.polaritySupport === 'both' || definition.polaritySupport === polarity);
    if (!definition || !definition.targetTypes.includes(targetType) || !supportsPolarity || definition.safetySensitive) {
      addError(errors, field, 'invalid_signal', `“${signalId}” is not a valid ${polarity} signal for ${targetType} feedback.`);
    }
  });
};

const validateCrossPolarityDuplicates = (errors: FeedbackValidationError[], positive: string[], improvement: string[]) => {
  positive.forEach((signalId) => {
    if (improvement.includes(signalId) && !getFeedbackSignal(signalId)?.allowDualPolarity) {
      addError(errors, 'improvementSignalIds', 'signal_in_both_polarities', 'The same signal cannot be selected as both positive and needing improvement.');
    }
  });
};

const asTimestamp = (value: Date | string): number => value instanceof Date ? value.getTime() : new Date(value).getTime();

const validateTargetContext = (
  feedback: ValidatableFeedback | FeedbackSubmissionCreateInput | FeedbackSubmission,
  errors: FeedbackValidationError[],
  context: FeedbackValidationContext,
  validateEventTiming: boolean,
) => {
  const { targetType } = feedback;
  const now = context.now ? asTimestamp(context.now) : Date.now();
  if (targetType === 'event') {
    if (validateEventTiming) {
      if (!context.eventEndAt) addError(errors, 'eventEndAt', 'required', 'The event end time is required to confirm feedback eligibility.');
      else {
        const endAt = asTimestamp(context.eventEndAt);
        if (!Number.isFinite(endAt)) addError(errors, 'eventEndAt', 'invalid_date', 'The event end time is invalid.');
        else if (now < endAt) addError(errors, 'eventEndAt', 'event_not_ended', 'Feedback opens after this event.');
      }
    }
    if (feedback.relatedEventId !== feedback.targetId) addError(errors, 'relatedEventId', 'event_target_mismatch', 'Event feedback must relate to the target event.');
    if (feedback.relatedVenueId) addError(errors, 'relatedVenueId', 'invalid_context', 'Event feedback cannot set a related venue directly.');
  }
  if (targetType === 'club') {
    if (feedback.visitDate) {
      const visitAt = asTimestamp(`${feedback.visitDate}T00:00:00`);
      if (!Number.isFinite(visitAt)) addError(errors, 'visitDate', 'invalid_date', 'Choose a valid visit date.');
      else if (visitAt > now) addError(errors, 'visitDate', 'future_date', 'Visit date cannot be in the future.');
    }
    if (feedback.experienceScope && feedback.experienceScope !== 'single_visit') addError(errors, 'experienceScope', 'invalid_scope', 'Club feedback must describe a single visit.');
  }
  if (targetType === 'organization') {
    if (!feedback.experienceScope || !['single_event', 'multiple_events', 'communication_only'].includes(feedback.experienceScope)) {
      addError(errors, 'experienceScope', feedback.experienceScope ? 'invalid_scope' : 'required', 'Choose what experience this feedback is based on.');
    }
    if (feedback.experienceScope === 'single_event' && !feedback.relatedEventId) addError(errors, 'relatedEventId', 'required', 'Choose the event this feedback relates to.');
    if (feedback.experienceScope === 'multiple_events' && !feedback.attendanceCountRange) addError(errors, 'attendanceCountRange', 'required', 'Choose how many events informed your experience.');
    if (feedback.experienceScope === 'communication_only' && (feedback.relatedEventId || feedback.attendanceCountRange)) {
      addError(errors, 'experienceScope', 'communication_scope_attendance_conflict', 'Communication-only feedback must not imply event attendance.');
    }
    if (feedback.relatedVenueId) addError(errors, 'relatedVenueId', 'invalid_context', 'Organization feedback cannot set a related venue.');
  }
};

export const validateFeedbackSubmission = (
  feedback: ValidatableFeedback | FeedbackSubmissionCreateInput,
  context: FeedbackValidationContext = {},
): FeedbackValidationResult => {
  const errors: FeedbackValidationError[] = [];
  const targetType = feedback.targetType;
  const positive = feedback.positiveSignalIds ?? [];
  const improvement = feedback.improvementSignalIds ?? [];
  const raw = feedback as unknown as Record<string, unknown>;
  const writtenText = 'writtenDraftText' in feedback
    ? feedback.writtenDraftText
    : (feedback as ValidatableFeedback).reviewText;
  if (!feedback.authorUserId?.trim()) addError(errors, 'authorUserId', 'required', 'A signed-in user is required.');
  if (!targetType || !TARGET_TYPES.includes(targetType)) addError(errors, 'targetType', 'invalid_target_type', 'Choose a valid feedback target type.');
  if (!feedback.targetId?.trim()) addError(errors, 'targetId', 'required', 'A feedback target is required.');
  if (!feedback.overallSentiment || !['positive', 'mixed', 'negative'].includes(feedback.overallSentiment)) addError(errors, 'overallSentiment', 'required', 'Choose your overall experience.');
  const writtenLength = writtenText?.trim().length ?? 0;
  if (writtenLength > 0 && writtenLength < FEEDBACK_REVIEW_TEXT_MIN_LENGTH) addError(errors, 'reviewText', 'too_short', `Written context must be at least ${FEEDBACK_REVIEW_TEXT_MIN_LENGTH} characters.`);
  if ((writtenText?.length ?? 0) > FEEDBACK_REVIEW_TEXT_MAX_LENGTH) addError(errors, 'reviewText', 'too_long', `Written context must be ${FEEDBACK_REVIEW_TEXT_MAX_LENGTH} characters or fewer.`);
  if (feedback.signalRegistryVersion !== FEEDBACK_SIGNAL_REGISTRY_VERSION) addError(errors, 'signalRegistryVersion', 'unsupported_registry_version', 'Refresh and try again with the current feedback prompts.');
  if (!feedback.attendanceVerification || !CLIENT_ATTENDANCE.includes(feedback.attendanceVerification)) addError(errors, 'attendanceVerification', raw.attendanceVerification === 'platform_confirmed' ? 'server_controlled' : 'required', 'Attendance confirmation must use a client-supported value.');
  if ('structuredStatus' in raw) addError(errors, 'structuredStatus', 'server_controlled', 'Structured eligibility is controlled by the service.');
  if ('approvedText' in raw || 'writtenExperience' in raw) addError(errors, 'writtenExperience', 'server_controlled', 'Published text and moderation state are controlled by the service.');
  if (targetType && TARGET_TYPES.includes(targetType)) {
    validateSignals(errors, targetType, positive, 'positive');
    validateSignals(errors, targetType, improvement, 'improvement');
    validateCrossPolarityDuplicates(errors, positive, improvement);
    validateTargetContext(feedback, errors, context, true);
  }
  return { valid: errors.length === 0, errors };
};

export const validateStoredFeedbackSubmission = (submission: FeedbackSubmission): FeedbackValidationResult => {
  const errors: FeedbackValidationError[] = [];
  if (!TARGET_TYPES.includes(submission.targetType)) addError(errors, 'targetType', 'invalid_target_type', 'Stored feedback has an invalid target type.');
  if (!submission.authorUserId?.trim()) addError(errors, 'authorUserId', 'required', 'Stored feedback requires an author.');
  if (!submission.targetId?.trim()) addError(errors, 'targetId', 'required', 'Stored feedback requires a target.');
  if (submission.signalRegistryVersion !== FEEDBACK_SIGNAL_REGISTRY_VERSION) addError(errors, 'signalRegistryVersion', 'unsupported_registry_version', 'Stored feedback uses an unsupported signal registry.');
  if (!['eligible', 'excluded', 'withdrawn'].includes(submission.structuredStatus)) addError(errors, 'structuredStatus', 'invalid_status', 'Stored feedback has an invalid structured status.');
  if (!['self_reported', 'linked_event', 'platform_confirmed'].includes(submission.attendanceVerification)) addError(errors, 'attendanceVerification', 'invalid_attendance_verification', 'Stored feedback has invalid attendance verification.');
  if (submission.structuredStatus === 'withdrawn' && !submission.withdrawnAt) addError(errors, 'withdrawnAt', 'required', 'Withdrawn feedback requires a withdrawal timestamp.');
  if (submission.structuredStatus !== 'withdrawn' && submission.withdrawnAt) addError(errors, 'withdrawnAt', 'status_conflict', 'Only withdrawn feedback may have a withdrawal timestamp.');
  const written = submission.writtenExperience;
  if (!written || !['not_submitted', 'pending', 'approved', 'rejected', 'needs_revision'].includes(written.moderationStatus)) addError(errors, 'writtenExperience', 'invalid_status', 'Stored feedback has invalid written moderation state.');
  if ((written?.currentDraftText?.length ?? 0) > FEEDBACK_REVIEW_TEXT_MAX_LENGTH || (written?.approvedText?.length ?? 0) > FEEDBACK_REVIEW_TEXT_MAX_LENGTH) addError(errors, 'writtenExperience', 'too_long', 'Stored written feedback exceeds the maximum length.');
  if (written?.moderationStatus === 'approved' && !written.approvedText?.trim()) addError(errors, 'writtenExperience', 'approved_text_required', 'Approved written feedback requires published text.');
  validateSignals(errors, submission.targetType, submission.positiveSignalIds, 'positive');
  validateSignals(errors, submission.targetType, submission.improvementSignalIds, 'improvement');
  validateCrossPolarityDuplicates(errors, submission.positiveSignalIds, submission.improvementSignalIds);
  validateTargetContext(submission, errors, { now: submission.updatedAt }, false);
  return { valid: errors.length === 0, errors };
};

export const validateSafetyReport = (report: SubmitSafetyConcernInput): FeedbackValidationResult => {
  const errors: FeedbackValidationError[] = [];
  if (!report.authorUserId.trim()) addError(errors, 'authorUserId', 'required', 'A signed-in user is required.');
  if (!TARGET_TYPES.includes(report.targetType)) addError(errors, 'targetType', 'invalid_target_type', 'Choose a valid concern target.');
  if (!report.targetId.trim()) addError(errors, 'targetId', 'required', 'A concern target is required.');
  if (!isSafetyConcernCategory(report.categoryId)) addError(errors, 'safetyConcernCategory', 'invalid_safety_category', 'Choose a valid private concern category.');
  const narrative = report.narrative;
  if (!narrative?.trim()) addError(errors, 'reviewText', 'required', 'Describe the concern so the safety team has enough context.');
  if ((narrative?.length ?? 0) > FEEDBACK_SAFETY_NARRATIVE_MAX_LENGTH) addError(errors, 'reviewText', 'too_long', `Private concern details must be ${FEEDBACK_SAFETY_NARRATIVE_MAX_LENGTH} characters or fewer.`);
  return { valid: errors.length === 0, errors };
};
