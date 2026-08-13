import type { SupabaseClient } from '@supabase/supabase-js';
import { FeedbackRepositoryError, toFeedbackRepositoryError } from './errors';
import { FEEDBACK_SIGNAL_REGISTRY_VERSION } from './promptRegistry';
import {
  mapApprovedWrittenExperience,
  mapFeedbackAggregate,
  mapFeedbackSubmission,
  mapSafetyReportReceipt,
} from './supabaseFeedbackMappers';
import type {
  FeedbackAggregate,
  FeedbackApprovedWrittenExperience,
  FeedbackRepository,
  FeedbackSafetyReportReceipt,
  FeedbackStructuredUpdateInput,
  FeedbackSubmission,
  FeedbackSubmissionCreateInput,
  FeedbackTargetType,
  SubmitSafetyConcernInput,
} from './types';

type RpcResult = { data: unknown; error: unknown };

export class SupabaseFeedbackRepository implements FeedbackRepository {
  constructor(private readonly client: SupabaseClient) {}

  private fail(error: unknown): never {
    if (import.meta.env.DEV) console.error('Feedback repository request failed:', error);
    throw toFeedbackRepositoryError(error);
  }

  private async rpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
    let result: RpcResult;
    try {
      result = await this.client.rpc(name, parameters) as RpcResult;
    } catch (error) {
      this.fail(error);
    }
    if (result.error) this.fail(result.error);
    return result.data;
  }

  private async authenticatedUserId(expectedUserId?: string): Promise<string> {
    try {
      const { data, error } = await this.client.auth.getUser();
      if (error || !data.user) throw error ?? new FeedbackRepositoryError('not_authenticated');
      if (expectedUserId && data.user.id !== expectedUserId) throw new FeedbackRepositoryError('not_authenticated');
      return data.user.id;
    } catch (error) {
      this.fail(error);
    }
  }

  async listForTarget(targetType: FeedbackTargetType, targetId: string): Promise<FeedbackSubmission[]> {
    await this.authenticatedUserId();
    const data = await this.rpc('feedback_list_for_target', { p_target_type: targetType, p_target_id: targetId });
    if (!Array.isArray(data)) throw new FeedbackRepositoryError('server_error');
    return data.map(mapFeedbackSubmission);
  }

  async getSubmissionById(id: string): Promise<FeedbackSubmission | null> {
    await this.authenticatedUserId();
    const data = await this.rpc('feedback_get_submission_by_id', { p_submission_id: id });
    return data == null ? null : mapFeedbackSubmission(data);
  }

  async getUserSubmission(targetType: FeedbackTargetType, targetId: string, userId: string): Promise<FeedbackSubmission | null> {
    await this.authenticatedUserId(userId);
    const data = await this.rpc('feedback_get_user_submission', { p_target_type: targetType, p_target_id: targetId, p_visit_date: null });
    return data == null ? null : mapFeedbackSubmission(data);
  }

  async createSubmission(input: FeedbackSubmissionCreateInput): Promise<FeedbackSubmission> {
    await this.authenticatedUserId(input.authorUserId);
    const data = await this.rpc('feedback_create_submission', {
      p_target_type: input.targetType,
      p_target_id: input.targetId,
      p_overall_sentiment: input.overallSentiment,
      p_experience_scope: input.experienceScope ?? null,
      p_visit_date: input.visitDate ?? null,
      p_attendance_count_range: input.attendanceCountRange ?? null,
      p_attendance_verification: input.attendanceVerification,
      p_related_event_id: input.relatedEventId ?? null,
      p_related_venue_id: input.relatedVenueId ?? null,
      p_signal_registry_version: input.signalRegistryVersion,
      p_signals: [
        ...input.positiveSignalIds.map((signalId) => ({ signalId, polarity: 'positive' })),
        ...input.improvementSignalIds.map((signalId) => ({ signalId, polarity: 'improvement' })),
      ],
    });
    return mapFeedbackSubmission(data);
  }

  async updateSubmission(id: string, input: FeedbackStructuredUpdateInput): Promise<FeedbackSubmission> {
    await this.authenticatedUserId();
    if (input.signalRegistryVersion !== FEEDBACK_SIGNAL_REGISTRY_VERSION) throw new FeedbackRepositoryError('unsupported_registry_version');
    const data = await this.rpc('feedback_update_submission', {
      p_submission_id: id,
      p_overall_sentiment: input.overallSentiment,
      p_experience_scope: input.experienceScope ?? null,
      p_visit_date: input.visitDate ?? null,
      p_attendance_count_range: input.attendanceCountRange ?? null,
      p_attendance_verification: input.attendanceVerification,
      p_related_event_id: input.relatedEventId ?? null,
      p_related_venue_id: input.relatedVenueId ?? null,
      p_signals: [
        ...input.positiveSignalIds.map((signalId) => ({ signalId, polarity: 'positive' })),
        ...input.improvementSignalIds.map((signalId) => ({ signalId, polarity: 'improvement' })),
      ],
    });
    return mapFeedbackSubmission(data);
  }

  async submitWrittenRevision(id: string, text: string): Promise<FeedbackSubmission> {
    await this.authenticatedUserId();
    return mapFeedbackSubmission(await this.rpc('feedback_submit_written_revision', { p_submission_id: id, p_text: text }));
  }

  async withdrawSubmission(id: string): Promise<FeedbackSubmission> {
    await this.authenticatedUserId();
    return mapFeedbackSubmission(await this.rpc('feedback_withdraw_submission', { p_submission_id: id }));
  }

  async createSafetyReport(input: SubmitSafetyConcernInput): Promise<FeedbackSafetyReportReceipt> {
    await this.authenticatedUserId(input.authorUserId);
    const data = await this.rpc('feedback_create_safety_report', {
      p_target_type: input.targetType,
      p_target_id: input.targetId,
      p_category: input.categoryId,
      p_narrative: input.narrative,
      p_related_event_id: input.relatedEventId ?? null,
      p_related_venue_id: input.relatedVenueId ?? null,
      p_evidence: [],
    });
    return mapSafetyReportReceipt(data, { targetType: input.targetType, targetId: input.targetId, categoryId: input.categoryId });
  }

  async getAggregate(targetType: FeedbackTargetType, targetId: string): Promise<FeedbackAggregate> {
    return mapFeedbackAggregate(await this.rpc('feedback_aggregate', { p_target_type: targetType, p_target_id: targetId }));
  }

  async listApprovedWritten(targetType: FeedbackTargetType, targetId: string, limit = 20, offset = 0): Promise<FeedbackApprovedWrittenExperience[]> {
    const data = await this.rpc('feedback_list_approved_written', { p_target_type: targetType, p_target_id: targetId, p_limit: limit, p_offset: offset });
    if (!Array.isArray(data)) throw new FeedbackRepositoryError('server_error');
    return data.map(mapApprovedWrittenExperience);
  }
}
