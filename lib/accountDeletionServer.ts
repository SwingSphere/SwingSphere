import { createClient } from '@supabase/supabase-js';

const getBearerToken = (authorization?: string | null) => {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const requireServerEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Server configuration is missing ${name}.`);
  return value;
};

const getSupabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://oieiotogdyfewsmdlsmh.supabase.co';
const getPublicSupabaseKey = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const getSecretSupabaseKey = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const getAuthenticatedClient = async (authorization?: string | null) => {
  const token = getBearerToken(authorization);
  if (!token) throw new Error('Authentication is required.');
  const publicKey = getPublicSupabaseKey();
  if (!publicKey) throw new Error('Server configuration is missing the Supabase public key.');

  const supabase = createClient(getSupabaseUrl(), publicKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('Your session is invalid or expired. Please sign in again.');
  return { supabase, user: data.user };
};

const getServiceClient = () => {
  const secretKey = getSecretSupabaseKey();
  if (!secretKey) {
    throw new Error('Account deletion is not fully configured on the server. Missing SUPABASE_SECRET_KEY.');
  }
  return createClient(getSupabaseUrl(), secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};

const deleteCloudflareImage = async (externalId: string) => {
  const accountId = requireServerEnv('CLOUDFLARE_ACCOUNT_ID');
  const apiToken = requireServerEnv('CLOUDFLARE_IMAGES_API_TOKEN');
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/images/v1/${encodeURIComponent(externalId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${apiToken}` } },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const message = payload?.errors?.[0]?.message || payload?.messages?.[0]?.message || `Cloudflare image deletion failed (${response.status}).`;
    throw new Error(message);
  }
};

type DeletionPreview = {
  canDelete?: boolean;
  blockers?: Array<{ code?: string; message?: string; organizationId?: string }>;
  media?: Array<{ externalId?: string; role?: string; status?: string }>;
  mediaCount?: number;
};

type BeginDeletionResult = {
  requestId: string;
  receiptCode: string;
  mediaCount: number;
  status: string;
};

export const deleteAuthenticatedAccount = async (authorization?: string | null) => {
  const { supabase: userClient, user } = await getAuthenticatedClient(authorization);

  const { data: beginData, error: beginError } = await userClient.rpc('begin_my_account_deletion');
  if (beginError) throw new Error(beginError.message);
  const begin = beginData as BeginDeletionResult;

  const { data: previewData, error: previewError } = await userClient.rpc('account_deletion_preview');
  if (previewError) throw new Error(previewError.message);
  const preview = (previewData ?? {}) as DeletionPreview;
  if (preview.canDelete === false) {
    const messages = (preview.blockers ?? []).map((blocker) => blocker.message).filter(Boolean);
    throw new Error(messages.join(' ') || 'Account deletion is blocked until account ownership responsibilities are transferred.');
  }

  const externalIds = (preview.media ?? [])
    .map((item) => String(item.externalId ?? '').trim())
    .filter(Boolean);

  let serviceClient: ReturnType<typeof getServiceClient> | null = null;
  try {
    if (externalIds.length) {
      // Fail closed: do not remove the Auth/profile identity until every external
      // profile image has been confirmed deleted from Cloudflare Images.
      serviceClient = getServiceClient();
      for (const externalId of externalIds) await deleteCloudflareImage(externalId);
      const { error: clearedError } = await serviceClient.rpc('admin_mark_account_deletion_media_cleared', {
        p_request_id: begin.requestId,
        p_external_ids: externalIds,
      });
      if (clearedError) throw new Error(clearedError.message);
    }

    const { data: deletedData, error: deletedError } = await userClient.rpc('delete_my_account');
    if (deletedError) throw new Error(deletedError.message);

    return {
      ...(deletedData as Record<string, unknown>),
      email: user.email ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Account deletion failed.';
    if (serviceClient) {
      await serviceClient.rpc('admin_fail_account_deletion', {
        p_request_id: begin.requestId,
        p_failure_code: externalIds.length ? 'account_deletion_failed' : 'database_deletion_failed',
        p_failure_detail: message,
      }).catch(() => undefined);
    }
    throw error;
  }
};
