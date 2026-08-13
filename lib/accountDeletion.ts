import { supabase } from './supabase';

export type AccountDeletionBlocker = {
  code: string;
  message: string;
  organizationId?: string;
};

export type AccountDeletionPreview = {
  canDelete: boolean;
  recentAuthentication: boolean;
  blockers: AccountDeletionBlocker[];
  mediaCount: number;
  request?: Record<string, unknown>;
};

export const getAccountDeletionPreview = async (): Promise<AccountDeletionPreview> => {
  const { data, error } = await supabase.rpc('account_deletion_preview');
  if (error) throw error;
  const row = (data ?? {}) as Record<string, any>;
  return {
    canDelete: row.canDelete !== false,
    recentAuthentication: Boolean(row.recentAuthentication),
    blockers: Array.isArray(row.blockers) ? row.blockers : [],
    mediaCount: Number(row.mediaCount ?? 0),
    request: row.request && typeof row.request === 'object' ? row.request : undefined,
  };
};

export const deleteMyAccount = async (email: string, password: string): Promise<{ receiptCode: string; requestId: string }> => {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !authData.session) {
    throw new Error('Password confirmation failed. Your account was not deleted.');
  }

  const response = await fetch('/api/account/delete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authData.session.access_token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Account deletion failed.');
  return {
    receiptCode: String(payload?.receiptCode ?? ''),
    requestId: String(payload?.requestId ?? ''),
  };
};
