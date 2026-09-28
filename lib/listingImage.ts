import type { SyntheticEvent } from 'react';
import type { Listing } from '../types';
import { getCloudflareImageUrl } from './media/getCloudflareImageUrl';

export const LISTING_IMAGE_FALLBACK = '/swingsphere-logo_2.png';

export const isPlaceholderMediaUrl = (url?: string | null): boolean => {
  if (!url) return false;
  const value = url.toLowerCase();
  return value.includes('picsum.photos')
    || value.includes('placehold.co')
    || value.includes('placeholder.com')
    || value.includes('via.placeholder');
};

type ListingImageAliases = {
  imageUrl?: unknown;
  image?: unknown;
  coverImage?: unknown;
  thumbnail?: unknown;
  heroImage?: unknown;
  flyerImageUrl?: unknown;
  flyer_image_url?: unknown;
  flyerUrl?: unknown;
  flyerImage?: unknown;
  flyer?: unknown;
  logoUrl?: unknown;
  logo?: unknown;
  icon?: unknown;
  photos?: unknown[];
};

const resolveImageCandidate = (candidate: unknown): string | null => {
  if (typeof candidate === 'string') {
    const value = candidate.trim();
    if (!value || value === LISTING_IMAGE_FALLBACK) return null;
    return value;
  }

  if (candidate && typeof candidate === 'object') {
    const record = candidate as { url?: unknown; src?: unknown };
    return resolveImageCandidate(record.url) ?? resolveImageCandidate(record.src);
  }

  return null;
};

const getMediaAssetUrl = (listing: Listing | null | undefined, role: 'logo' | 'hero' | 'flyer') => {
  const asset = listing?.mediaAssets?.find((item) => item.role === role);
  if (!asset || !asset.external_id || typeof asset.external_id !== 'string' || !asset.external_id.trim()) {
    return null;
  }
  const url = getCloudflareImageUrl({
    externalId: asset.external_id.trim(),
    variant: role === 'logo' ? 'logosquare' : role === 'flyer' ? 'flyercard' : 'herocard',
  });
  return resolveImageCandidate(url);
};

export const getListingPrimaryLogoUrl = (listing: Listing | null | undefined): string | null => {
  if (!listing) return null;
  const aliases = listing as Listing & ListingImageAliases;
  const candidates: unknown[] = [
    getMediaAssetUrl(listing, 'logo'),
    listing.logoImageUrl,
    aliases.logoUrl,
    aliases.logo,
    aliases.icon,
  ];

  for (const candidate of candidates) {
    const resolved = resolveImageCandidate(candidate);
    if (resolved && !isPlaceholderMediaUrl(resolved)) return resolved;
  }

  for (const candidate of candidates) {
    const resolved = resolveImageCandidate(candidate);
    if (resolved) return resolved;
  }

  return null;
};

export const getListingLogoUrl = (listing: Listing | null | undefined): string =>
  getListingPrimaryLogoUrl(listing) ?? LISTING_IMAGE_FALLBACK;

export const getListingPrimaryFlyerUrl = (listing: Listing | null | undefined): string | null => {
  if (!listing) return null;
  const aliases = listing as Listing & ListingImageAliases;
  const candidates: unknown[] = [
    getMediaAssetUrl(listing, 'flyer'),
    aliases.flyerImageUrl,
    aliases.flyer_image_url,
    aliases.flyerUrl,
    aliases.flyerImage,
    aliases.flyer,
  ];

  for (const candidate of candidates) {
    const resolved = resolveImageCandidate(candidate);
    if (resolved && !isPlaceholderMediaUrl(resolved)) return resolved;
  }

  return null;
};

export const getListingPrimaryHeroUrl = (listing: Listing | null | undefined): string | null => {
  if (!listing) return null;
  const aliases = listing as Listing & ListingImageAliases;
  const candidates: unknown[] = [
    getMediaAssetUrl(listing, 'hero'),
    listing.headerImageUrl,
    aliases.heroImage,
    aliases.coverImage,
    aliases.imageUrl,
    aliases.image,
    aliases.thumbnail,
    aliases.photos?.[0],
    listing.galleryImageUrls?.[0],
  ];

  for (const candidate of candidates) {
    const resolved = resolveImageCandidate(candidate);
    if (resolved && !isPlaceholderMediaUrl(resolved)) return resolved;
  }

  for (const candidate of candidates) {
    const resolved = resolveImageCandidate(candidate);
    if (resolved) return resolved;
  }

  return null;
};

/**
 * Shared image resolution for events across all cards, previews, and discovery views.
 * Priority order:
 * 1. Flyer image
 * 2. Hero image (only if no valid flyer exists)
 * 3. Default event placeholder fallback
 */
export const getEventCardImageUrl = (event: Listing | null | undefined): string => {
  if (!event) return LISTING_IMAGE_FALLBACK;
  return getListingPrimaryFlyerUrl(event)
    ?? getListingPrimaryHeroUrl(event)
    ?? LISTING_IMAGE_FALLBACK;
};

export const getListingFlyerUrl = (listing: Listing | null | undefined): string =>
  getEventCardImageUrl(listing);

/**
 * Shared listing card image resolver for globe carousel/rotary stack,
 * nearby carousel, discovery rails, mobile/tablet cards, and preview cards.
 *
 * For events:
 *   1. Flyer image
 *   2. Hero image (only if no valid flyer exists)
 *   3. Default placeholder
 *
 * For clubs:
 *   1. Hero image
 *   2. Logo image
 *   3. Default placeholder
 */
export const getListingCardImageUrl = (listing: Listing | null | undefined): string => {
  if (!listing) return LISTING_IMAGE_FALLBACK;
  if (listing.type === 'event') {
    return getEventCardImageUrl(listing);
  }
  return getListingHeroUrl(listing);
};

export const getListingHeroUrl = (listing: Listing | null | undefined): string => {
  if (!listing) return LISTING_IMAGE_FALLBACK;
  if (listing.type === 'event') {
    return getEventCardImageUrl(listing);
  }
  return getListingPrimaryHeroUrl(listing)
    ?? getListingLogoUrl(listing);
};

export const getListingImageUrl = (listing: Listing | null | undefined): string => {
  if (!listing) return LISTING_IMAGE_FALLBACK;
  if (listing.type === 'event') {
    return getEventCardImageUrl(listing);
  }
  return getListingHeroUrl(listing);
};

export const handleListingImageError = (event: SyntheticEvent<HTMLImageElement>) => {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === 'true') return;
  image.dataset.fallbackApplied = 'true';
  image.src = LISTING_IMAGE_FALLBACK;
};
