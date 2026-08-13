import { canSubmitClubFeedback, canSubmitEventFeedback, canSubmitOrganizationFeedback, isActiveFeedbackSubmission } from './eligibility';
import { feedbackRepository } from './repositoryFactory';
import { FEEDBACK_SIGNAL_REGISTRY_VERSION } from './promptRegistry';
import { FEEDBACK_REVIEW_TEXT_MAX_LENGTH, FEEDBACK_REVIEW_TEXT_MIN_LENGTH, validateFeedbackSubmission, validateSafetyReport } from './validation';
import type {
  FeedbackAggregate,
  FeedbackApprovedWrittenExperience,
  FeedbackDraft,
  FeedbackRepository,
  FeedbackSafetyReportReceipt,
  FeedbackStructuredUpdateInput,
  FeedbackSubmission,
  FeedbackSubmissionCreateInput,
  FeedbackTargetType,
  SubmitFeedbackContext,
  SubmitSafetyConcernInput,
} from './types';

export class FeedbackSubmissionValidationError extends Error {
  constructor(public readonly errors: ReturnType<typeof validateFeedbackSubmission>['errors']) {
    super(errors[0]?.message ?? 'Feedback could not be submitted.'); this.name = 'FeedbackSubmissionValidationError';
  }
}

export class FeedbackService {
  constructor(public readonly repository: FeedbackRepository) {}

  async listForTarget(targetType: FeedbackTargetType, targetId: string): Promise<FeedbackSubmission[]> { return this.repository.listForTarget(targetType, targetId); }
  async getAggregate(targetType: FeedbackTargetType, targetId: string): Promise<FeedbackAggregate> { return this.repository.getAggregate(targetType, targetId); }
  async listApprovedWritten(targetType: FeedbackTargetType, targetId: string, limit = 20, offset = 0): Promise<FeedbackApprovedWrittenExperience[]> { return this.repository.listApprovedWritten(targetType, targetId, limit, offset); }
  async getUserSubmission(targetType: FeedbackTargetType, targetId: string, userId: string): Promise<FeedbackSubmission | null> { return this.repository.getUserSubmission(targetType, targetId, userId); }

  private normalizeDraft(draft: FeedbackDraft, context: SubmitFeedbackContext): FeedbackSubmissionCreateInput {
    const targetType = draft.targetType as FeedbackTargetType;
    return {
      authorUserId: context.authorUserId, targetType, targetId: draft.targetId?.trim() ?? '', overallSentiment: draft.overallSentiment ?? 'mixed',
      positiveSignalIds: [...draft.positiveSignalIds], improvementSignalIds: [...draft.improvementSignalIds], signalRegistryVersion: FEEDBACK_SIGNAL_REGISTRY_VERSION,
      writtenDraftText: draft.reviewText?.trim() || undefined,
      relatedEventId: targetType === 'event' ? draft.targetId : draft.relatedEventId || undefined,
      relatedVenueId: targetType === 'club' ? draft.relatedVenueId || undefined : undefined,
      visitDate: draft.visitDate || undefined,
      experienceScope: targetType === 'event' ? 'single_event' : targetType === 'club' ? 'single_visit' : draft.experienceScope,
      attendanceCountRange: draft.attendanceCountRange,
      attendanceVerification: draft.attendanceVerification ?? (targetType === 'organization' && draft.relatedEventId ? 'linked_event' : 'self_reported'),
    };
  }

  private async findExisting(input: FeedbackSubmissionCreateInput): Promise<FeedbackSubmission | null> {
    const candidates = (await this.repository.listForTarget(input.targetType, input.targetId)).filter((submission) => submission.authorUserId === input.authorUserId);
    return candidates[0] ?? null;
  }

  private assertEligibility(input: FeedbackSubmissionCreateInput, existing: FeedbackSubmission | null, context: SubmitFeedbackContext): void {
    const eligibility = input.targetType === 'club'
      ? canSubmitClubFeedback({ userId: input.authorUserId, visitDate: input.visitDate, existingSubmission: existing, now: context.now })
      : input.targetType === 'organization'
        ? canSubmitOrganizationFeedback({ userId: input.authorUserId, experienceScope: input.experienceScope, relatedEventId: input.relatedEventId, attendanceCountRange: input.attendanceCountRange, existingSubmission: existing })
        : canSubmitEventFeedback({ userId: input.authorUserId, eventEndAt: context.eventEndAt as Date | string, now: context.now, existingSubmission: existing });
    if (!eligibility.allowed) throw new Error(eligibility.reason);
  }

  async submitFeedback(draft: FeedbackDraft, context: SubmitFeedbackContext): Promise<FeedbackSubmission> {
    const normalized = this.normalizeDraft(draft, context);
    const validation = validateFeedbackSubmission(normalized, context);
    if (!validation.valid) throw new FeedbackSubmissionValidationError(validation.errors);
    const existing = await this.findExisting(normalized);
    this.assertEligibility(normalized, existing, context);
    if (!existing) {
      let created = await this.repository.createSubmission(normalized);
      if (normalized.writtenDraftText) created = await this.repository.submitWrittenRevision(created.id, normalized.writtenDraftText);
      return created;
    }
    return this.updateFeedback(existing.id, draft, context);
  }

  async updateFeedback(id: string, draft: FeedbackDraft, context: SubmitFeedbackContext): Promise<FeedbackSubmission> {
    const current = await this.repository.getSubmissionById(id);
    if (!current) throw new Error('Feedback submission not found.');
    if (current.authorUserId !== context.authorUserId) throw new Error('You can only update your own feedback.');
    if (!isActiveFeedbackSubmission(current)) throw new Error('Withdrawn feedback cannot be updated.');
    const normalized = this.normalizeDraft(draft, context);
    if (normalized.targetType !== current.targetType || normalized.targetId !== current.targetId) throw new Error('A feedback target cannot be changed during an update.');
    const validation = validateFeedbackSubmission(normalized, context);
    if (!validation.valid) throw new FeedbackSubmissionValidationError(validation.errors);
    const structuredInput: FeedbackStructuredUpdateInput = {
      overallSentiment: normalized.overallSentiment, positiveSignalIds: normalized.positiveSignalIds, improvementSignalIds: normalized.improvementSignalIds,
      signalRegistryVersion: normalized.signalRegistryVersion, relatedEventId: normalized.relatedEventId, relatedVenueId: normalized.relatedVenueId,
      visitDate: normalized.visitDate, experienceScope: normalized.experienceScope, attendanceCountRange: normalized.attendanceCountRange, attendanceVerification: normalized.attendanceVerification,
    };
    let updated = await this.repository.updateSubmission(id, structuredInput);
    const nextText = normalized.writtenDraftText?.trim();
    const currentText = current.writtenExperience.currentDraftText?.trim() ?? current.writtenExperience.approvedText?.trim();
    if (nextText && nextText !== currentText) updated = await this.repository.submitWrittenRevision(id, nextText);
    return updated;
  }

  async submitWrittenRevision(id: string, text: string, authorUserId: string): Promise<FeedbackSubmission> {
    const submission = await this.repository.getSubmissionById(id);
    if (!submission) throw new Error('Feedback submission not found.');
    if (submission.authorUserId !== authorUserId) throw new Error('You can only revise your own feedback.');
    if (!text.trim()) throw new Error('Written context cannot be empty.');
    if (text.trim().length < FEEDBACK_REVIEW_TEXT_MIN_LENGTH) throw new Error(`Written context must be at least ${FEEDBACK_REVIEW_TEXT_MIN_LENGTH} characters.`);
    if (text.length > FEEDBACK_REVIEW_TEXT_MAX_LENGTH) throw new Error(`Written context must be ${FEEDBACK_REVIEW_TEXT_MAX_LENGTH} characters or fewer.`);
    return this.repository.submitWrittenRevision(id, text.trim());
  }

  async withdrawFeedback(id: string, authorUserId: string): Promise<FeedbackSubmission> {
    const submission = await this.repository.getSubmissionById(id);
    if (!submission) throw new Error('Feedback submission not found.');
    if (submission.authorUserId !== authorUserId) throw new Error('You can only withdraw your own feedback.');
    return this.repository.withdrawSubmission(id);
  }

  async submitSafetyConcern(input: SubmitSafetyConcernInput): Promise<FeedbackSafetyReportReceipt> {
    const validation = validateSafetyReport(input);
    if (!validation.valid) throw new FeedbackSubmissionValidationError(validation.errors);
    return this.repository.createSafetyReport(input);
  }
}

export const feedbackService = new FeedbackService(feedbackRepository);
