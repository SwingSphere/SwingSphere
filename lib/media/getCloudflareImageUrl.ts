import type { MediaVariant } from './types';

const getAccountHash = () => {
  const env = import.meta.env as Record<string, string | undefined>;
  return env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH || env.VITE_CLOUDFLARE_IMAGES_ACCOUNT_HASH || '';
};

type CloudflareImageUrlInput = {
  externalId?: string | null;
  cloudflareImageId?: string | null;
  variant?: MediaVariant | string | null;
  fallback?: string | null;
};

export const getCloudflareImageUrl = ({
  externalId,
  cloudflareImageId,
  variant,
  fallback = null,
}: CloudflareImageUrlInput): string | null => {
  const accountHash = getAccountHash().trim();
  const imageId = (externalId || cloudflareImageId || '').trim();
  const variantName = (variant || '').trim();

  if (!accountHash || !imageId || !variantName) return fallback;

  return `https://imagedelivery.net/${encodeURIComponent(accountHash)}/${encodeURIComponent(imageId)}/${encodeURIComponent(variantName)}`;
};
