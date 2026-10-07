import { supabase } from '../supabase';

export type MemberActivityKind = 'page_view' | 'outbound' | 'save' | 'unsave';
export type MemberActivityReport = {
  sharingEnabled: boolean;
  since?: string;
  retentionDays?: number;
  pageViews?: number;
  outboundClicks?: number;
  saveActions?: number;
  savedCount?: number;
  lastActivityAt?: string | null;
  topPages?: Array<{ path: string; views: number; lastViewedAt: string }>;
  recent?: Array<{ id: string; kind: MemberActivityKind; path: string; entityType: string; entityId: string; destination: string; occurredAt: string }>;
  saved?: Array<{ id: string; name: string; entityType: string; entityId: string; savedAt: string }>;
};
export const getMemberActivitySharing = async (): Promise<boolean> => {
  const { data, error } = await supabase.rpc('get_member_activity_sharing');
  if (error) throw error;
  return data === true;
};
export const setMemberActivitySharing = async (enabled: boolean): Promise<boolean> => {
  const { data, error } = await supabase.rpc('set_member_activity_sharing', { p_enabled: enabled });
  if (error) throw error;
  return data === true;
};
export const getAdminMemberActivity = async (userId: string): Promise<MemberActivityReport> => {
  const { data, error } = await supabase.rpc('admin_get_member_activity', { p_user_id: userId });
  if (error) throw error;
  return data as MemberActivityReport;
};
export const recordMemberActivity = async (kind: MemberActivityKind, path: string, entityType = '', entityId = '', destination = ''): Promise<void> => {
  try {
    const { error } = await supabase.rpc('record_member_activity', {
      p_kind: kind, p_path: path.split(/[?#]/)[0], p_entity_type: entityType, p_entity_id: entityId, p_destination: destination,
    });
    if (error && import.meta.env.DEV) console.warn('Member activity could not be recorded:', error.message);
  } catch {
    // Analytics must never block navigation, saves, or outbound links.
  }
};
