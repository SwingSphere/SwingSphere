import { createClient } from '@supabase/supabase-js';
import { getMediaRule, isMediaOwnerType, isMediaRole } from './mediaRules';

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const requireEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
};

const getBearerToken = (authorization?: string | null) => {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const getAuthenticatedSupabase = async (authorization?: string | null) => {
  const token = getBearerToken(authorization);
  if (!token) throw new Error('Authentication is required for media uploads.');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase server credentials for media uploads.');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('Your session is invalid or expired. Please log in again.');

  return { supabase, user: data.user };
};

const validateUploadOwnership = (ownerType: string, ownerId: string, userId: string) => {
  if (ownerType === 'user' && ownerId !== userId) {
    throw new Error('You can only upload media for your own profile.');
  }
};

export const createCloudflareDirectUpload = async (body: any, authorization?: string | null) => {
  const ownerType = body?.ownerType ?? body?.owner_type;
  const ownerId = String(body?.ownerId ?? body?.owner_id ?? '').trim();
  const role = body?.role;

  if (!isMediaOwnerType(ownerType)) throw new Error('Invalid media owner type.');
  if (!isMediaRole(role)) throw new Error('Invalid media role.');
  if (!ownerId) throw new Error('Missing ownerId.');
  if (!isUuid(ownerId)) throw new Error('Media ownerId must be a UUID before upload.');

  const { user } = await getAuthenticatedSupabase(authorization);
  validateUploadOwnership(ownerType, ownerId, user.id);

  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID');
  const apiToken = requireEnv('CLOUDFLARE_IMAGES_API_TOKEN');
  const metadata = JSON.stringify({ ownerType, ownerId, role, createdBy: user.id });
  const formData = new FormData();
  formData.append('requireSignedURLs', 'false');
  formData.append('metadata', metadata);

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v2/direct_upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}` },
    body: formData,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const message = payload?.errors?.[0]?.message || payload?.messages?.[0]?.message || 'Cloudflare upload URL creation failed.';
    throw new Error(message);
  }

  return {
    uploadURL: payload.result?.uploadURL,
    id: payload.result?.id,
  };
};

export const completeMediaUpload = async (body: any, authorization?: string | null) => {
  const ownerType = body?.ownerType ?? body?.owner_type;
  const ownerId = String(body?.ownerId ?? body?.owner_id ?? '').trim();
  const role = body?.role;
  const externalId = String(body?.externalId ?? body?.external_id ?? body?.cloudflareImageId ?? '').trim();
  const altText = typeof body?.altText === 'string' ? body.altText.trim() : null;
  const focalPointX = Number.isFinite(Number(body?.focalPointX)) ? Number(body.focalPointX) : null;
  const focalPointY = Number.isFinite(Number(body?.focalPointY)) ? Number(body.focalPointY) : null;

  if (!isMediaOwnerType(ownerType)) throw new Error('Invalid media owner type.');
  if (!isMediaRole(role)) throw new Error('Invalid media role.');
  if (!ownerId) throw new Error('Missing ownerId.');
  if (!isUuid(ownerId)) throw new Error('Media ownerId must be a UUID before upload.');
  if (!externalId) throw new Error('Missing Cloudflare image id.');

  const { supabase, user } = await getAuthenticatedSupabase(authorization);
  validateUploadOwnership(ownerType, ownerId, user.id);

  const rule = getMediaRule(role);
  const row = {
    owner_type: ownerType,
    owner_id: ownerId,
    role,
    storage_provider: 'cloudflare_images',
    external_id: externalId,
    status: 'pending_review',
    aspect_mode: rule.aspectMode,
    target_ratio: rule.targetRatio,
    alt_text: altText,
    sort_order: Number.isFinite(Number(body?.sortOrder)) ? Number(body.sortOrder) : 0,
    focal_point_x: focalPointX,
    focal_point_y: focalPointY,
    created_by: user.id,
  };

  const { data, error } = await supabase
    .from('media_assets')
    .insert(row)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return { asset: data };
};
