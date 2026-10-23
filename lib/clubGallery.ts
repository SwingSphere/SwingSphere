import type { Listing } from '../types';
import { getCanonicalMediaSignature, isPlaceholderMediaUrl } from './entityBrandMedia';
import {
  isMediaUrlKnownFailed,
  parseCloudflareDeliveryUrl,
  withPreferredCloudflareVariant,
} from './listingImage';

/**
 * Club Gallery — Intended Purpose & Filtering Contract
 *
 * The club gallery is a small, optional visual preview of a venue's actual interior
 * (ideally 2–4 authentic photographs showing the club's atmosphere, facilities,
 * lounge areas, dance floor, or other publicly presented spaces).
 *
 * Rules:
 * - Preserve support for external image URLs as well as uploaded Cloudflare Images.
 * - Hide the gallery when no suitable photographs exist.
 * - Do not impose a strict minimum image count (1 suitable interior photo is valid).
 * - Avoid displaying event flyers, promotional banners, dress-code graphics, or
 *   duplicate hero/logo artwork as interior gallery images.
 * - Gracefully omit broken external images at runtime without rendering fallback logos.
 *
 * Future Content Curator enhancement note:
 * Candidate interior photographs discovered from official club websites should record
 * their source URLs, verify that external embedding or reuse is permitted, and be
 * submitted as candidates for administrator approval before publication.
 */

const PROMO_OR_FLYER_GALLERY_URL_RE =
  /(?:\/(?:programma|flyers?|banners?|posters?)\/|(?:^|[\/_-])(?:flyers?|posters?|banners?|progr-banners?|header[_-]?\d*|gridart|was-ziehe-ich-an|dress-?code|dj-[a-z0-9-]+|club-swinger-(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)|\d{1,2}(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre))(?:[\/_.-]|$))/i;

const isPortraitFlyerQueryUrl = (url: string): boolean => {
  const match =
    url.match(/(?:fit|resize)=(\d+)(?:%2C|,)(\d+)/i) ||
    url.match(/width=(\d+)&height=(\d+)/i);
  if (!match) return false;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > width * 1.15;
};

const normalizeMediaAltKey = (altText?: string | null): string =>
  String(altText ?? '')
    .toLowerCase()
    .replace(/-cropped$/i, '')
    .replace(/[^a-z0-9]+/g, '');

export interface FilterClubGalleryOptions {
  coverImageUrl?: string | null;
  logoImageUrl?: string | null;
  eventImageUrls?: Array<string | null | undefined>;
  hiddenUrls?: Iterable<string>;
  allowPlaceholders?: boolean;
}

export const filterSuitableClubGalleryUrls = (
  club: Listing | null | undefined,
  options: FilterClubGalleryOptions = {},
): string[] => {
  if (!club) return [];
  const rawGallery = Array.isArray(club.galleryImageUrls) ? club.galleryImageUrls : [];
  if (rawGallery.length === 0) return [];

  const extended = club as Listing & {
    headerImageUrl?: string;
    coverImageUrl?: string;
    heroImageUrl?: string;
    logoImageUrl?: string;
    flyerImageUrl?: string;
    mediaAssets?: Array<{
      role?: string;
      alt_text?: string | null;
      external_id?: string | null;
      status?: string | null;
    }>;
  };

  const excludedUrls = new Set<string>();
  const excludedSignatures = new Set<string>();

  const registerExcludedUrl = (url?: string | null) => {
    const trimmed = url?.trim();
    if (!trimmed) return;
    excludedUrls.add(trimmed);
    const sig = getCanonicalMediaSignature(trimmed);
    if (sig) excludedSignatures.add(sig);
  };

  registerExcludedUrl(options.coverImageUrl);
  registerExcludedUrl(options.logoImageUrl);
  registerExcludedUrl(club.imageUrl);
  registerExcludedUrl(extended.headerImageUrl);
  registerExcludedUrl(extended.coverImageUrl);
  registerExcludedUrl(extended.heroImageUrl);
  registerExcludedUrl(extended.logoImageUrl);
  registerExcludedUrl(extended.flyerImageUrl);

  for (const eventUrl of options.eventImageUrls ?? []) {
    registerExcludedUrl(eventUrl);
  }
  for (const hiddenUrl of options.hiddenUrls ?? []) {
    registerExcludedUrl(hiddenUrl);
  }

  const nonGalleryAltKeys = new Set<string>();
  for (const asset of extended.mediaAssets ?? []) {
    if (!asset || asset.status === 'rejected' || asset.status === 'archived') continue;
    if (asset.role === 'hero' || asset.role === 'logo' || asset.role === 'flyer') {
      if (asset.external_id) {
        excludedSignatures.add(`cf:${asset.external_id.trim().toLowerCase()}`);
      }
      const altKey = normalizeMediaAltKey(asset.alt_text);
      if (altKey) nonGalleryAltKeys.add(altKey);
    }
  }

  for (const asset of extended.mediaAssets ?? []) {
    if (!asset || asset.role !== 'gallery' || !asset.external_id) continue;
    const altKey = normalizeMediaAltKey(asset.alt_text);
    if (altKey && nonGalleryAltKeys.has(altKey)) {
      excludedSignatures.add(`cf:${asset.external_id.trim().toLowerCase()}`);
    }
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawUrl of rawGallery) {
    const trimmed = rawUrl?.trim();
    if (!trimmed) continue;
    if (!options.allowPlaceholders && isPlaceholderMediaUrl(trimmed)) continue;
    if (isMediaUrlKnownFailed(trimmed)) continue;
    if (excludedUrls.has(trimmed)) continue;

    const parsedCf = parseCloudflareDeliveryUrl(trimmed);
    if (
      parsedCf &&
      /^(flyerpage|flyercard|logosquare|avatarsquare|heropage|herocard|coverpage)$/i.test(
        parsedCf.variant,
      )
    ) {
      continue;
    }

    if (
      !parsedCf &&
      (PROMO_OR_FLYER_GALLERY_URL_RE.test(trimmed) || isPortraitFlyerQueryUrl(trimmed))
    ) {
      continue;
    }

    const sig = getCanonicalMediaSignature(trimmed) || trimmed;
    if (excludedSignatures.has(sig) || seen.has(sig)) continue;

    seen.add(sig);
    result.push(trimmed);
  }

  return result;
};

export const isIntrinsicFlyerOrInvalidGalleryImage = (params: {
  url: string;
  naturalWidth: number;
  naturalHeight: number;
}): boolean => {
  const { url, naturalWidth, naturalHeight } = params;
  if (naturalWidth <= 0 || naturalHeight <= 0) return false;
  if (naturalWidth < 120 || naturalHeight < 90) return true;

  const parsedCf = parseCloudflareDeliveryUrl(url);
  if (!parsedCf && naturalHeight > naturalWidth * 1.25) {
    return true;
  }

  return false;
};

export const resolveClubGalleryLightboxUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  const parsedCf = parseCloudflareDeliveryUrl(url);
  if (parsedCf && parsedCf.variant.toLowerCase() === 'gallerythumb') {
    return withPreferredCloudflareVariant(url, 'gallerypage') ?? url;
  }
  return url;
};
