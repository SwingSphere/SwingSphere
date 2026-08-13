import { isActiveFeedbackSubmission } from './eligibility';
import { aggregateFeedback } from './aggregation';
import { FeedbackRepositoryError } from './errors';
import { FEEDBACK_SIGNAL_REGISTRY_VERSION, isSafetyConcernCategory } from './promptRegistry';
import { MOCK_FEEDBACK_SEED, MOCK_SAFETY_REPORT_SEED } from './seedData';
import { validateStoredFeedbackSubmission } from './validation';
import type {
  FeedbackRepository,
  FeedbackApprovedWrittenExperience,
  FeedbackAggregate,
  FeedbackSafetyReport,
  FeedbackSafetyReportReceipt,
  FeedbackStorageEnvelope,
  FeedbackStructuredUpdateInput,
  FeedbackSubmission,
  FeedbackSubmissionCreateInput,
  FeedbackTargetType,
  SubmitSafetyConcernInput,
} from './types';

export const FEEDBACK_STORAGE_KEY = 'swingsphere:feedback:v2';
export const LEGACY_FEEDBACK_STORAGE_KEY = 'swingsphere:feedback:v1';
export const FEEDBACK_STORAGE_SCHEMA_VERSION = 2;

export { FeedbackRepositoryError } from './errors';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const createId = (prefix = 'feedback'): string => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

type LegacySubmission = Record<string, unknown> & {
  id?: string; authorUserId?: string; targetType?: FeedbackTargetType; targetId?: string;
  overallSentiment?: FeedbackSubmission['overallSentiment']; positiveSignalIds?: string[]; improvementSignalIds?: string[];
  reviewText?: string; moderationStatus?: string; visibilityStatus?: string; containsSafetyConcern?: boolean;
  safetyConcernCategory?: string; relatedEventId?: string; relatedVenueId?: string; visitDate?: string;
  experienceScope?: FeedbackSubmission['experienceScope']; attendanceCountRange?: FeedbackSubmission['attendanceCountRange'];
  createdAt?: string; updatedAt?: string;
};

const seedEnvelope = (submissions = MOCK_FEEDBACK_SEED, safetyReports = MOCK_SAFETY_REPORT_SEED): FeedbackStorageEnvelope => ({
  schemaVersion: 2, submissions: clone(submissions), safetyReports: clone(safetyReports),
});

export const migrateFeedbackStorageV1 = (legacy: unknown): FeedbackStorageEnvelope | null => {
  if (!Array.isArray(legacy)) return null;
  const submissions: FeedbackSubmission[] = [];
  const safetyReports: FeedbackSafetyReport[] = [];
  for (const raw of legacy as LegacySubmission[]) {
    if (!raw || typeof raw !== 'object' || !raw.id || !raw.authorUserId || !raw.targetType || !raw.targetId || !raw.overallSentiment) return null;
    const createdAt = raw.createdAt ?? new Date(0).toISOString();
    const updatedAt = raw.updatedAt ?? createdAt;
    if (raw.containsSafetyConcern) {
      if (!raw.safetyConcernCategory) return null;
      safetyReports.push({ id: raw.id, authorUserId: raw.authorUserId, targetType: raw.targetType, targetId: raw.targetId, categoryId: raw.safetyConcernCategory, relatedEventId: raw.relatedEventId, relatedVenueId: raw.relatedVenueId, status: 'pending', createdAt, updatedAt });
      continue;
    }
    const text = raw.reviewText?.trim() || undefined;
    const wasPublic = raw.moderationStatus === 'approved' && raw.visibilityStatus === 'public';
    const writtenExperience: FeedbackSubmission['writtenExperience'] = !text ? { moderationStatus: 'not_submitted' }
      : wasPublic ? { currentDraftText: text, approvedText: text, moderationStatus: 'approved', submittedAt: createdAt, approvedAt: updatedAt }
        : raw.moderationStatus === 'rejected' ? { currentDraftText: text, moderationStatus: 'rejected', submittedAt: createdAt, updatedAt }
          : { currentDraftText: text, moderationStatus: 'pending', submittedAt: createdAt, updatedAt };
    submissions.push({
      id: raw.id, authorUserId: raw.authorUserId, targetType: raw.targetType, targetId: raw.targetId,
      overallSentiment: raw.overallSentiment, positiveSignalIds: raw.positiveSignalIds ?? [], improvementSignalIds: raw.improvementSignalIds ?? [],
      structuredStatus: wasPublic ? 'eligible' : 'excluded', signalRegistryVersion: FEEDBACK_SIGNAL_REGISTRY_VERSION,
      writtenExperience, relatedEventId: raw.relatedEventId, relatedVenueId: raw.relatedVenueId, visitDate: raw.visitDate,
      experienceScope: raw.experienceScope, attendanceCountRange: raw.attendanceCountRange, attendanceVerification: 'self_reported',
      createdAt, updatedAt,
    });
  }
  return { schemaVersion: 2, submissions, safetyReports };
};

export const isFeedbackStorageEnvelope = (value: unknown): value is FeedbackStorageEnvelope => {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<FeedbackStorageEnvelope>;
  return envelope.schemaVersion === FEEDBACK_STORAGE_SCHEMA_VERSION
    && Array.isArray(envelope.submissions)
    && envelope.submissions.every((submission) => validateStoredFeedbackSubmission(submission).valid)
    && Array.isArray(envelope.safetyReports)
    && envelope.safetyReports.every((report) => report.status === 'pending' && isSafetyConcernCategory(report.categoryId));
};

export class MockFeedbackRepository implements FeedbackRepository {
  private memory: FeedbackStorageEnvelope;

  constructor(seed: FeedbackSubmission[] = MOCK_FEEDBACK_SEED, safetySeed: FeedbackSafetyReport[] = MOCK_SAFETY_REPORT_SEED) {
    this.memory = seedEnvelope(seed, safetySeed);
  }

  private read(): FeedbackStorageEnvelope {
    if (typeof window === 'undefined') return clone(this.memory);
    const rawV2 = window.localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (rawV2) {
      try {
        const parsed = JSON.parse(rawV2);
        if (isFeedbackStorageEnvelope(parsed)) return parsed;
      } catch { /* reset below */ }
      return this.resetStorage();
    }
    const rawV1 = window.localStorage.getItem(LEGACY_FEEDBACK_STORAGE_KEY);
    if (rawV1) {
      try {
        const migrated = migrateFeedbackStorageV1(JSON.parse(rawV1));
        if (migrated && isFeedbackStorageEnvelope(migrated)) { this.write(migrated); return migrated; }
      } catch { /* reset below */ }
    }
    return this.resetStorage();
  }

  private write(envelope: FeedbackStorageEnvelope): void {
    this.memory = clone(envelope);
    if (typeof window !== 'undefined') window.localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(envelope));
  }

  resetStorage(): FeedbackStorageEnvelope {
    const reset = seedEnvelope();
    this.write(reset);
    return clone(reset);
  }

  private assertUnique(candidate: FeedbackSubmission, exceptId?: string): void {
    const duplicate = this.read().submissions.find((submission) => {
      if (submission.id === exceptId || !isActiveFeedbackSubmission(submission)) return false;
      if (submission.authorUserId !== candidate.authorUserId || submission.targetType !== candidate.targetType || submission.targetId !== candidate.targetId) return false;
      return true;
    });
    if (duplicate) {
      throw new FeedbackRepositoryError('duplicate_submission', 'An active feedback submission already exists for this experience.');
    }
  }

  async listForTarget(targetType: FeedbackTargetType, targetId: string): Promise<FeedbackSubmission[]> {
    return this.read().submissions.filter((submission) => submission.targetType === targetType && submission.targetId === targetId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
  }

  async getSubmissionById(id: string): Promise<FeedbackSubmission | null> {
    const submission = this.read().submissions.find((candidate) => candidate.id === id);
    return submission ? clone(submission) : null;
  }

  async getUserSubmission(targetType: FeedbackTargetType, targetId: string, userId: string): Promise<FeedbackSubmission | null> {
    const submission = this.read().submissions.filter((candidate) => candidate.targetType === targetType && candidate.targetId === targetId && candidate.authorUserId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    return submission ? clone(submission) : null;
  }

  async createSubmission(input: FeedbackSubmissionCreateInput): Promise<FeedbackSubmission> {
    const now = new Date().toISOString();
    const text = input.writtenDraftText?.trim() || undefined;
    const submission: FeedbackSubmission = {
      id: createId(), authorUserId: input.authorUserId, targetType: input.targetType, targetId: input.targetId,
      overallSentiment: input.overallSentiment, positiveSignalIds: clone(input.positiveSignalIds), improvementSignalIds: clone(input.improvementSignalIds),
      structuredStatus: 'eligible', signalRegistryVersion: input.signalRegistryVersion,
      writtenExperience: text ? { currentDraftText: text, moderationStatus: 'pending', submittedAt: now } : { moderationStatus: 'not_submitted' },
      relatedEventId: input.relatedEventId, relatedVenueId: input.relatedVenueId, visitDate: input.visitDate,
      experienceScope: input.experienceScope, attendanceCountRange: input.attendanceCountRange, attendanceVerification: input.attendanceVerification,
      createdAt: now, updatedAt: now,
    };
    this.assertUnique(submission);
    const envelope = this.read(); envelope.submissions.push(submission); this.write(envelope); return clone(submission);
  }

  async updateSubmission(id: string, input: FeedbackStructuredUpdateInput): Promise<FeedbackSubmission> {
    const envelope = this.read();
    const index = envelope.submissions.findIndex((submission) => submission.id === id);
    if (index < 0) throw new FeedbackRepositoryError('submission_not_found', 'Feedback submission not found.');
    if (!isActiveFeedbackSubmission(envelope.submissions[index])) throw new FeedbackRepositoryError('withdrawn_terminal', 'Withdrawn feedback cannot be updated.');
    const current = envelope.submissions[index];
    const next: FeedbackSubmission = { ...current, ...clone(input), id: current.id, authorUserId: current.authorUserId, targetType: current.targetType, targetId: current.targetId, structuredStatus: current.structuredStatus, writtenExperience: current.writtenExperience, withdrawnAt: current.withdrawnAt, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
    this.assertUnique(next, id); envelope.submissions[index] = next; this.write(envelope); return clone(next);
  }

  async submitWrittenRevision(id: string, text: string): Promise<FeedbackSubmission> {
    const envelope = this.read(); const index = envelope.submissions.findIndex((submission) => submission.id === id);
    if (index < 0) throw new FeedbackRepositoryError('submission_not_found', 'Feedback submission not found.');
    if (!isActiveFeedbackSubmission(envelope.submissions[index])) throw new FeedbackRepositoryError('withdrawn_terminal', 'Withdrawn feedback cannot be revised.');
    const now = new Date().toISOString(); const current = envelope.submissions[index];
    envelope.submissions[index] = { ...current, writtenExperience: { ...current.writtenExperience, currentDraftText: text.trim(), moderationStatus: 'pending', submittedAt: now, updatedAt: now }, updatedAt: now };
    this.write(envelope); return clone(envelope.submissions[index]);
  }

  async withdrawSubmission(id: string): Promise<FeedbackSubmission> {
    const envelope = this.read(); const index = envelope.submissions.findIndex((submission) => submission.id === id);
    if (index < 0) throw new FeedbackRepositoryError('submission_not_found', 'Feedback submission not found.');
    if (!isActiveFeedbackSubmission(envelope.submissions[index])) return clone(envelope.submissions[index]);
    const now = new Date().toISOString(); envelope.submissions[index] = { ...envelope.submissions[index], structuredStatus: 'withdrawn', withdrawnAt: now, updatedAt: now };
    this.write(envelope); return clone(envelope.submissions[index]);
  }

  async createSafetyReport(input: SubmitSafetyConcernInput): Promise<FeedbackSafetyReportReceipt> {
    const now = new Date().toISOString();
    const report: FeedbackSafetyReport = { authorUserId: input.authorUserId, targetType: input.targetType, targetId: input.targetId, categoryId: input.categoryId, relatedEventId: input.relatedEventId, relatedVenueId: input.relatedVenueId, id: createId('safety'), status: 'pending', createdAt: now, updatedAt: now };
    const envelope = this.read(); envelope.safetyReports.push(report); this.write(envelope); return clone(report);
  }

  async getAggregate(targetType: FeedbackTargetType, targetId: string): Promise<FeedbackAggregate> {
    return aggregateFeedback(await this.listForTarget(targetType, targetId));
  }

  async listApprovedWritten(targetType: FeedbackTargetType, targetId: string, limit = 20, offset = 0): Promise<FeedbackApprovedWrittenExperience[]> {
    return this.read().submissions
      .filter((submission) => submission.targetType === targetType && submission.targetId === targetId && submission.structuredStatus !== 'withdrawn' && submission.writtenExperience.approvedText)
      .sort((left, right) => (right.writtenExperience.approvedAt ?? '').localeCompare(left.writtenExperience.approvedAt ?? ''))
      .slice(offset, offset + Math.min(Math.max(limit, 1), 50))
      .map((submission) => ({
        submissionId: submission.id,
        approvedText: submission.writtenExperience.approvedText!,
        approvedAt: submission.writtenExperience.approvedAt ?? submission.updatedAt,
        overallSentiment: submission.overallSentiment,
        experienceScope: submission.experienceScope,
        authorDisplayName: 'SwingSphere member',
      }));
  }
}
