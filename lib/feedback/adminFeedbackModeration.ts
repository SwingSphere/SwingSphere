import { supabase } from '../supabase';

export type PendingWrittenReview = {
  revisionId: string;
  submissionId: string;
  text: string;
  submittedAt: string;
  targetType: 'event' | 'club' | 'organization';
  targetId: string;
  targetName: string;
  targetState?: string;
};

export const getPendingWrittenReviews = async (): Promise<PendingWrittenReview[]> => {
  const { data, error } = await supabase.rpc('admin_list_pending_written_reviews', { p_limit: 100 });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Unable to load written reviews.');
  return data as PendingWrittenReview[];
};

export const moderateWrittenReview = async (
  revisionId: string,
  status: 'approved' | 'rejected' | 'needs_revision',
  reasonCode?: string,
  privateNotes?: string,
): Promise<void> => {
  const { error } = await supabase.rpc('admin_moderate_written_review', {
    p_revision_id: revisionId,
    p_status: status,
    p_reason_code: reasonCode?.trim() || null,
    p_private_notes: privateNotes?.trim() || null,
  });
  if (error) throw error;
};
