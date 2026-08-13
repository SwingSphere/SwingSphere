import type {
  FeedbackAttendanceCountRange,
  FeedbackEligibility,
  FeedbackExperienceScope,
  FeedbackSubmission,
} from './types';

type EligibilityBase = {
  userId?: string | null;
  existingSubmission?: FeedbackSubmission | null;
};

const asTimestamp = (value: Date | string): number => (
  value instanceof Date ? value.getTime() : new Date(value).getTime()
);

export const isActiveFeedbackSubmission = (submission: FeedbackSubmission): boolean => (
  submission.structuredStatus !== 'withdrawn' && !submission.withdrawnAt
);

export const canSubmitEventFeedback = ({
  userId,
  eventEndAt,
  now = new Date(),
  existingSubmission,
}: EligibilityBase & { eventEndAt: Date | string; now?: Date | string }): FeedbackEligibility => {
  if (!userId) {
    return { allowed: false, mode: 'unavailable', reason: 'Sign in to share your experience.' };
  }

  const eventEnd = asTimestamp(eventEndAt);
  const currentTime = asTimestamp(now);
  if (!Number.isFinite(eventEnd)) {
    return { allowed: false, mode: 'unavailable', reason: 'This event needs a valid end time before feedback can open.' };
  }
  if (currentTime < eventEnd) {
    return { allowed: false, mode: 'unavailable', reason: 'Feedback opens after this event.' };
  }

  if (existingSubmission && isActiveFeedbackSubmission(existingSubmission)) {
    return {
      allowed: true,
      mode: 'update',
      existingSubmissionId: existingSubmission.id,
    };
  }

  if (existingSubmission) {
    return { allowed: false, mode: 'unavailable', reason: 'This feedback was withdrawn and cannot be resubmitted yet.' };
  }

  return { allowed: true, mode: 'create' };
};

export const canSubmitClubFeedback = ({
  userId,
  visitDate,
  existingSubmission,
  now = new Date(),
}: EligibilityBase & { visitDate?: string; now?: Date | string }): FeedbackEligibility => {
  if (!userId) {
    return { allowed: false, mode: 'unavailable', reason: 'Sign in to leave a review.' };
  }
  if (visitDate) {
    const visitTime = asTimestamp(`${visitDate}T00:00:00`);
    if (!Number.isFinite(visitTime)) {
      return { allowed: false, mode: 'unavailable', reason: 'Choose a valid visit date.' };
    }
    if (visitTime > asTimestamp(now)) {
      return { allowed: false, mode: 'unavailable', reason: 'Visit date cannot be in the future.' };
    }
  }
  if (existingSubmission && isActiveFeedbackSubmission(existingSubmission)) {
    return {
      allowed: true,
      mode: 'update',
      existingSubmissionId: existingSubmission.id,
    };
  }
  if (existingSubmission) {
    return { allowed: false, mode: 'unavailable', reason: 'This review was withdrawn and cannot be resubmitted yet.' };
  }
  return { allowed: true, mode: 'create' };
};

export const canSubmitOrganizationFeedback = ({
  userId,
  experienceScope,
  relatedEventId,
  attendanceCountRange,
  existingSubmission,
}: EligibilityBase & {
  experienceScope?: FeedbackExperienceScope;
  relatedEventId?: string;
  attendanceCountRange?: FeedbackAttendanceCountRange;
}): FeedbackEligibility => {
  if (!userId) {
    return { allowed: false, mode: 'unavailable', reason: 'Sign in to share your experience.' };
  }
  if (!experienceScope) {
    return { allowed: false, mode: 'unavailable', reason: 'Choose the experience this feedback is based on.' };
  }
  if (experienceScope === 'single_event' && !relatedEventId) {
    return { allowed: false, mode: 'unavailable', reason: 'Choose the event this experience relates to.' };
  }
  if (experienceScope === 'multiple_events' && !attendanceCountRange) {
    return { allowed: false, mode: 'unavailable', reason: 'Choose how many events informed your experience.' };
  }
  if (existingSubmission && isActiveFeedbackSubmission(existingSubmission)) {
    return {
      allowed: true,
      mode: 'update',
      existingSubmissionId: existingSubmission.id,
    };
  }
  if (existingSubmission) {
    return { allowed: false, mode: 'unavailable', reason: 'This feedback was withdrawn and cannot be resubmitted yet.' };
  }
  return { allowed: true, mode: 'create' };
};
