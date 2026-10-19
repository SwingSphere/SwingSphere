import type { MediaVariant } from './types';
import {
  encodeHeroCropToUrl,
  extractHeroCropFromUrl,
  type HeroCropConfig,
} from './heroCrop';

const getAccountHash = () => {
  const env = (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : process.env) as Record<string, string | undefined> | undefined;
  return env?.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH
    || env?.VITE_CLOUDFLARE_IMAGES_ACCOUNT_HASH
    || '0YABV7zDubNpRHPPku3C9Q';
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

/**
 * Selects the optimal Cloudflare Images variant for a hero asset:
 * - If non-destructive crop metadata indicates a non-16:9 source image (e.g. 1:1, 4:5, 20:9, 21:9),
 *   uses `flyerpage` (`fit: contain`) so Cloudflare's edge does not center-crop the image to 16:9
 *   before client-side WYSIWYG framing is applied.
 * - Otherwise uses `heropage` (1280×720).
 */
export const selectHeroCloudflareVariant = (
  crop?: Partial<HeroCropConfig> | null,
): MediaVariant => {
  if (crop?.fitMode === 'fit') {
    return 'flyerpage';
  }
  if (
    crop?.sourceWidth &&
    crop?.sourceHeight &&
    crop.sourceWidth > 0 &&
    crop.sourceHeight > 0
  ) {
    const aspect = crop.sourceWidth / crop.sourceHeight;
    if (Math.abs(aspect - 16 / 9) > 0.04) {
      return 'flyerpage';
    }
  }
  return 'heropage';
};

type HeroCloudflareUrlOptions = {
  externalId?: string | null;
  crop?: Partial<HeroCropConfig> | null;
  preferredVariant?: MediaVariant | string | null;
  fallback?: string | null;
};

export function getHeroCloudflareImageUrl(
  externalId?: string | null,
  crop?: Partial<HeroCropConfig> | null,
  fallback?: string | null,
): string | null;
export function getHeroCloudflareImageUrl(options: HeroCloudflareUrlOptions): string | null;
export function getHeroCloudflareImageUrl(
  externalIdOrOptions?: string | HeroCloudflareUrlOptions | null,
  cropArg?: Partial<HeroCropConfig> | null,
  fallbackArg: string | null = null,
): string | null {
  if (externalIdOrOptions && typeof externalIdOrOptions === 'object') {
    const { externalId, crop, preferredVariant, fallback = null } = externalIdOrOptions;
    const variant =
      preferredVariant && preferredVariant !== 'heropage'
        ? preferredVariant
        : selectHeroCloudflareVariant(crop);
    const baseUrl = getCloudflareImageUrl({ externalId, variant, fallback });
    if (!baseUrl) return fallback;
    return crop ? encodeHeroCropToUrl(baseUrl, crop) : baseUrl;
  }
  const variant = selectHeroCloudflareVariant(cropArg);
  const baseUrl = getCloudflareImageUrl({ externalId: externalIdOrOptions, variant, fallback: fallbackArg });
  if (!baseUrl) return fallbackArg;
  return cropArg ? encodeHeroCropToUrl(baseUrl, cropArg) : baseUrl;
}

/**
 * Normalizes a hero URL so that:
 * 1. Low-resolution `/herocard` Cloudflare URLs are upgraded to `/heropage` (or `/flyerpage` for non-16:9 framed images).
 * 2. Any `#ss-crop=...` framing metadata is preserved or attached.
 */
export const normalizeHeroDeliveryUrl = (
  url?: string | null,
  explicitCrop?: Partial<HeroCropConfig> | null,
): string => {
  if (typeof url !== 'string' || !url.trim()) return '';
  const { cleanUrl, crop: urlCrop } = extractHeroCropFromUrl(url);
  const effectiveCrop = explicitCrop ?? urlCrop;

  const cfMatch = cleanUrl.match(/^(https?:\/\/imagedelivery\.net\/[^/]+\/[^/?#]+)\/([^/?#]+)(.*)$/i);
  if (cfMatch) {
    const [, prefix, currentVariant, rest] = cfMatch;
    let targetVariant = currentVariant;
    if (currentVariant === 'herocard') {
      targetVariant = selectHeroCloudflareVariant(effectiveCrop);
    } else if (currentVariant === 'heropage' && effectiveCrop) {
      targetVariant = selectHeroCloudflareVariant(effectiveCrop);
    }
    const upgraded = `${prefix}/${targetVariant}${rest}`;
    return effectiveCrop ? encodeHeroCropToUrl(upgraded, effectiveCrop) : upgraded;
  }

  return effectiveCrop ? encodeHeroCropToUrl(cleanUrl, effectiveCrop) : cleanUrl;
};
