import { supabase } from '../supabase';

export type AdminAuditLogEntry = {
  id: string;
  timestamp: string;
  adminId?: string;
  adminName: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName: string;
  reason?: string;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

type AdminAuditLogRow = {
  id: number | string;
  created_at: string;
  actor_user_id: string | null;
  actor_display_name: string | null;
  action: string;
  target_type: string;
  target_id: string;
  target_name: string | null;
  reason: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
};

export const getAdminAuditLog = async (limit = 500, offset = 0): Promise<AdminAuditLogEntry[]> => {
  const { data, error } = await supabase.rpc('admin_list_audit_log', {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;

  return ((data ?? []) as AdminAuditLogRow[]).map((row) => ({
    id: String(row.id),
    timestamp: row.created_at,
    adminId: row.actor_user_id ?? undefined,
    adminName: row.actor_display_name ?? 'Former administrator',
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    targetName: row.target_name ?? row.target_id,
    reason: row.reason ?? undefined,
    beforeState: row.before_state ?? {},
    afterState: row.after_state ?? {},
    metadata: row.metadata ?? {},
  }));
};
