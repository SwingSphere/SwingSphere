import type { SyntheticEvent } from 'react';
import type { Listing } from '../types';
import { getCloudflareImageUrl } from './media/getCloudflareImageUrl';

export const LISTING_IMAGE_FALLBACK = '/swingsphere-logo.png';

type ListingImageAliases = {
  imageUrl?: unknown;
  image?: unknown;
  coverImage?: unknown;
  thumbnail?: unknown;
  heroImage?: unknown;
  photos?: unknown[];
};

const resolveImageCandidate = (candidate: unknown): string | null => {
  if (typeof candidate === 'string') {
    const value = candidate.trim();
    return value || null;
  }

  if (candidate && typeof candidate === 'object') {
    const record = candidate as { url?: unknown; src?: unknown };
    return resolveImageCandidate(record.url) ?? resolveImageCandidate(record.src);
  }

  return null;
};

const getMediaAssetUrl = (listing: Listing | null | undefined, role: 'logo' | 'hero') => {
  const asset = listing?.mediaAssets?.find((item) => item.role === role);
  if (!asset) return null;
  return getCloudflareImageUrl({
    externalId: asset.external_id,
    variant: role === 'logo' ? 'logosquare' : 'herocard',
  });
};

export const getListingLogoUrl = (listing: Listing | null | undefined): string => {
  if (!listing) return LISTING_IMAGE_FALLBACK;
  return getMediaAssetUrl(listing, 'logo')
    ?? resolveImageCandidate(listing.logoImageUrl)
    ?? LISTING_IMAGE_FALLBACK;
};

export const getListingHeroUrl = (listing: Listing | null | undefined): string => {
  if (!listing) return LISTING_IMAGE_FALLBACK;
  return getMediaAssetUrl(listing, 'hero')
    ?? resolveImageCandidate(listing.headerImageUrl)
    ?? resolveImageCandidate(listing.galleryImageUrls?.[0])
    ?? getListingLogoUrl(listing);
};

export const getListingImageUrl = (listing: Listing | null | undefined): string => {
  if (!listing) return LISTING_IMAGE_FALLBACK;

  const aliases = listing as Listing & ListingImageAliases;
  const candidates: unknown[] = [
    getMediaAssetUrl(listing, 'hero'),
    listing.headerImageUrl,
    aliases.imageUrl,
    aliases.image,
    aliases.coverImage,
    aliases.thumbnail,
    aliases.heroImage,
    aliases.photos?.[0],
    listing.galleryImageUrls?.[0],
  ];

  for (const candidate of candidates) {
    const resolved = resolveImageCandidate(candidate);
    if (resolved) return resolved;
  }

  return LISTING_IMAGE_FALLBACK;
};

export const handleListingImageError = (event: SyntheticEvent<HTMLImageElement>) => {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === 'true') return;
  image.dataset.fallbackApplied = 'true';
  image.src = LISTING_IMAGE_FALLBACK;
};
