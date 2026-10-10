import type { SyntheticEvent } from 'react';
import type { Listing, OrganizationData, EventSeriesData } from '../types';
import type { EntityIndex } from './entityIndex';
import { hostSlug, normalizeHostName } from './identityUtils';
import { getCloudflareImageUrl } from './media/getCloudflareImageUrl';
import { getCanonicalMediaSignature } from './entityBrandMedia';

export const LISTING_IMAGE_FALLBACK = '/swingsphere-logo_2.png';

const failedMediaUrls = new Set<string>();
const loggedMediaDiagnostics = new Set<string>();

const normalizeUrlKey = (url?: string | null): string => {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (typeof window !== 'undefined' && trimmed.startsWith('/')) {
    try {
      return new URL(trimmed, window.location.origin).pathname;
    } catch {
      return trimmed;
    }
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname === LISTING_IMAGE_FALLBACK) return LISTING_IMAGE_FALLBACK;
    return parsed.href;
  } catch {
    return trimmed;
  }
};

const sanitizeUrlForLog = (url?: string | null): string => {
  if (!url) return '';
  try {
    const parsed = new URL(url, 'https://swingsphere.co');
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(url).slice(0, 160);
  }
};

export const isMediaUrlKnownFailed = (url?: string | null): boolean => {
  const key = normalizeUrlKey(url);
  if (!key || key === LISTING_IMAGE_FALLBACK) return false;
  return failedMediaUrls.has(key) || failedMediaUrls.has(url?.trim() ?? '');
};

export const resetKnownFailedMediaUrls = (): void => {
  failedMediaUrls.clear();
  loggedMediaDiagnostics.clear();
};

export const parseCloudflareDeliveryUrl = (
  url?: string | null,
): { accountHash: string; externalId: string; variant: string } | null => {
  if (!url || typeof url !== 'string') return null;
  const match = url.trim().match(/^https?:\/\/imagedelivery\.net\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)/i);
  if (!match) return null;
  return {
    accountHash: match[1],
    externalId: match[2],
    variant: match[3],
  };
};

const VARIANT_FALLBACK_ORDER: Record<string, string[]> = {
  flyerpage: ['flyercard', 'public'],
  flyercard: ['flyerpage', 'public'],
  heropage: ['herocard', 'public'],
  herocard: ['heropage', 'public'],
  logosquare: ['public'],
  avatarsquare: ['logosquare', 'public'],
  gallerypage: ['gallerythumb', 'public'],
  gallerythumb: ['gallerypage', 'public'],
  coverpage: ['heropage', 'herocard', 'public'],
};

export const getCloudflareAlternateVariantUrls = (url?: string | null): string[] => {
  const parsed = parseCloudflareDeliveryUrl(url);
  if (!parsed) return [];
  const alternates = VARIANT_FALLBACK_ORDER[parsed.variant.toLowerCase()] ?? (parsed.variant !== 'public' ? ['public'] : []);
  const results: string[] = [];
  for (const altVariant of alternates) {
    const candidate = getCloudflareImageUrl({
      externalId: parsed.externalId,
      variant: altVariant,
    });
    if (candidate && candidate !== url?.trim() && !isMediaUrlKnownFailed(candidate)) {
      results.push(candidate);
    }
  }
  return results;
};

export const withPreferredCloudflareVariant = (
  url: string | null | undefined,
  preferredVariant?: string,
): string | null => {
  if (!url) return null;
  if (!preferredVariant) return url;
  const parsed = parseCloudflareDeliveryUrl(url);
  if (!parsed || parsed.variant === preferredVariant) return url;
  const preferredUrl = getCloudflareImageUrl({
    externalId: parsed.externalId,
    variant: preferredVariant,
  });
  if (preferredUrl && !isMediaUrlKnownFailed(preferredUrl)) {
    return preferredUrl;
  }
  return url;
};

export const markMediaUrlFailed = (
  url?: string | null,
  context?: string | { entityId?: string; role?: string; nextUrl?: string | null },
): void => {
  const key = normalizeUrlKey(url);
  if (!key || key === LISTING_IMAGE_FALLBACK) return;
  failedMediaUrls.add(key);
  if (url?.trim()) failedMediaUrls.add(url.trim());

  const normalizedContext = typeof context === 'string' ? { role: context } : context;
  if (!loggedMediaDiagnostics.has(key)) {
    loggedMediaDiagnostics.add(key);
    const parsedCf = parseCloudflareDeliveryUrl(url);
    console.warn('[SwingSphere Media] Asset load failed; switching to fallback', {
      failedUrl: sanitizeUrlForLog(url),
      cloudflareImageId: parsedCf?.externalId ?? null,
      failedVariant: parsedCf?.variant ?? null,
      entityId: normalizedContext?.entityId ?? null,
      role: normalizedContext?.role ?? null,
      nextCandidate: normalizedContext?.nextUrl ? sanitizeUrlForLog(normalizedContext.nextUrl) : LISTING_IMAGE_FALLBACK,
    });
  }
};

export const isPlaceholderMediaUrl = (url?: string | null): boolean => {
  if (!url) return false;
  const value = url.toLowerCase().trim();
  return value === LISTING_IMAGE_FALLBACK
    || value.endsWith(LISTING_IMAGE_FALLBACK)
    || value.includes('picsum.photos')
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
    if (!value || value === LISTING_IMAGE_FALLBACK || value.endsWith(LISTING_IMAGE_FALLBACK)) return null;
    if (isMediaUrlKnownFailed(value)) {
      const altVariant = getCloudflareAlternateVariantUrls(value)[0];
      return altVariant ?? null;
    }
    return value;
  }

  if (candidate && typeof candidate === 'object') {
    const record = candidate as { url?: unknown; src?: unknown };
    return resolveImageCandidate(record.url) ?? resolveImageCandidate(record.src);
  }

  return null;
};

type MediaBearingEntity = {
  logoImageUrl?: string;
  headerImageUrl?: string;
  mediaAssets?: Array<{ role?: string; external_id?: string }>;
};

const getMediaAssetUrl = (
  listing: (Listing & MediaBearingEntity) | MediaBearingEntity | null | undefined,
  role: 'logo' | 'hero' | 'flyer' | 'gallery',
  variantOverride?: string,
) => {
  const asset = listing?.mediaAssets?.find(
    (item) => item.role === role && typeof item.external_id === 'string' && item.external_id.trim(),
  );
  if (!asset || !asset.external_id) {
    return null;
  }
  const defaultVariant =
    role === 'logo'
      ? 'logosquare'
      : role === 'flyer'
        ? 'flyercard'
        : role === 'gallery'
          ? 'gallerypage'
          : 'herocard';
  const url = getCloudflareImageUrl({
    externalId: asset.external_id.trim(),
    variant: variantOverride || defaultVariant,
  });
  return resolveImageCandidate(url);
};

export const getListingPrimaryLogoUrl = (listing: Listing | null | undefined): string | null => {
  if (!listing) return null;
  const aliases = listing as Listing & ListingImageAliases;
  const candidates: unknown[] = [
    getMediaAssetUrl(listing, 'logo', 'logosquare'),
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

const getEntityPrimaryLogoUrl = (entity: MediaBearingEntity | null | undefined): string | null => {
  if (!entity) return null;
  const candidates: unknown[] = [
    getMediaAssetUrl(entity, 'logo', 'logosquare'),
    entity.logoImageUrl,
  ];
  for (const candidate of candidates) {
    const resolved = resolveImageCandidate(candidate);
    if (resolved && !isPlaceholderMediaUrl(resolved)) return resolved;
  }
  return null;
};

const getEntityPrimaryHeroUrl = (
  entity: MediaBearingEntity | null | undefined,
  variant: 'herocard' | 'heropage' = 'herocard',
): string | null => {
  if (!entity) return null;
  const candidates: unknown[] = [
    getMediaAssetUrl(entity, 'hero', variant),
    withPreferredCloudflareVariant(entity.headerImageUrl, variant),
    entity.headerImageUrl,
  ];
  for (const candidate of candidates) {
    const resolved = resolveImageCandidate(candidate);
    if (resolved && !isPlaceholderMediaUrl(resolved)) return resolved;
  }
  return null;
};

const findSeriesOrganizer = (
  series: EventSeriesData | undefined,
  entityIndex: EntityIndex,
): OrganizationData | undefined => {
  if (!series) return undefined;
  if (series.organizerOrganizationId) {
    const direct = entityIndex.organizationsById.get(series.organizerOrganizationId);
    if (direct) return direct;
  }
  if (series.slug) {
    const byHostSlug = entityIndex.hostsBySlug.get(series.slug)?.organization;
    if (byHostSlug) return byHostSlug;
  }
  const normalizedName = normalizeHostName(series.name);
  if (normalizedName) {
    const byName = entityIndex.hostsBySlug.get(hostSlug(normalizedName))?.organization;
    if (byName) return byName;
  }
  for (const org of entityIndex.organizationsById.values()) {
    if (
      (series.slug && org.slug === series.slug)
      || (normalizedName && normalizeHostName(org.name) === normalizedName)
    ) {
      return org;
    }
  }
  return undefined;
};

const getIndexedEventInheritedLogoUrl = (
  listing: Extract<Listing, { type: 'event' }>,
  entityIndex: EntityIndex,
): string | null => {
  if (listing.eventSeriesId) {
    const series = entityIndex.eventSeriesById.get(listing.eventSeriesId);
    const seriesLogo = getEntityPrimaryLogoUrl(series);
    if (seriesLogo) return seriesLogo;
    const seriesOrgLogo = getEntityPrimaryLogoUrl(findSeriesOrganizer(series, entityIndex));
    if (seriesOrgLogo) return seriesOrgLogo;
  }

  const organizer = listing.organizerOrganizationId
    ? entityIndex.organizationsById.get(listing.organizerOrganizationId)
    : listing.hostName
      ? entityIndex.hostsBySlug.get(hostSlug(normalizeHostName(listing.hostName)))?.organization
      : undefined;
  const organizerLogo = getEntityPrimaryLogoUrl(organizer);
  if (organizerLogo) return organizerLogo;

  const venueClubKey = entityIndex.eventVenueClubKeyById.get(listing.id);
  if (venueClubKey) {
    const clubLogo = getListingPrimaryLogoUrl(entityIndex.clubsByKey.get(venueClubKey));
    if (clubLogo) return clubLogo;
  }

  return null;
};

export const getIndexedEventInheritedHeroUrl = (
  listing: Extract<Listing, { type: 'event' }>,
  entityIndex?: EntityIndex,
  variant: 'herocard' | 'heropage' = 'herocard',
): string | null => {
  if (!entityIndex) return null;

  if (listing.eventSeriesId) {
    const series = entityIndex.eventSeriesById.get(listing.eventSeriesId);
    const seriesHero = getEntityPrimaryHeroUrl(series, variant);
    if (seriesHero) return seriesHero;
    const seriesOrgHero = getEntityPrimaryHeroUrl(findSeriesOrganizer(series, entityIndex), variant);
    if (seriesOrgHero) return seriesOrgHero;
  }

  const organizer = listing.organizerOrganizationId
    ? entityIndex.organizationsById.get(listing.organizerOrganizationId)
    : listing.hostName
      ? entityIndex.hostsBySlug.get(hostSlug(normalizeHostName(listing.hostName)))?.organization
      : undefined;
  const organizerHero = getEntityPrimaryHeroUrl(organizer, variant);
  if (organizerHero) return organizerHero;

  const venueClubKey = entityIndex.eventVenueClubKeyById.get(listing.id);
  if (venueClubKey) {
    const clubHero = getListingPrimaryHeroUrl(entityIndex.clubsByKey.get(venueClubKey), variant);
    if (clubHero) return clubHero;
  }

  return null;
};

export const getListingLogoUrl = (listing: Listing | null | undefined, entityIndex?: EntityIndex): string => {
  if (!listing) return LISTING_IMAGE_FALLBACK;
  if (listing.type === 'event') {
    const directEventLogo = getListingPrimaryLogoUrl(listing);
    const inheritedLogo = entityIndex ? getIndexedEventInheritedLogoUrl(listing, entityIndex) : null;

    if (listing.logoOverride === false) {
      return inheritedLogo ?? LISTING_IMAGE_FALLBACK;
    }

    if (directEventLogo) {
      const directSig = getCanonicalMediaSignature(
        directEventLogo,
        listing.mediaAssets?.find((item) => item.role === 'logo')?.external_id,
      );
      const inheritedSig = getCanonicalMediaSignature(inheritedLogo);
      if (
        listing.logoOverride === true
        || !inheritedLogo
        || (Boolean(directSig && inheritedSig) && directSig !== inheritedSig)
      ) {
        return directEventLogo;
      }
    }

    if (inheritedLogo) return inheritedLogo;
    return directEventLogo ?? LISTING_IMAGE_FALLBACK;
  }

  if (listing.type === 'club' && entityIndex) {
    const directClubLogo = getListingPrimaryLogoUrl(listing);
    if (directClubLogo) return directClubLogo;
    if (listing.ownerOrganizationId) {
      const orgLogo = getEntityPrimaryLogoUrl(entityIndex.organizationsById.get(listing.ownerOrganizationId));
      if (orgLogo) return orgLogo;
    }
  }

  return getListingPrimaryLogoUrl(listing) ?? LISTING_IMAGE_FALLBACK;
};

export const getListingPrimaryFlyerUrl = (
  listing: Listing | null | undefined,
  variant: 'flyercard' | 'flyerpage' = 'flyercard',
): string | null => {
  if (!listing) return null;
  const aliases = listing as Listing & ListingImageAliases;
  const candidates: unknown[] = [
    getMediaAssetUrl(listing, 'flyer', variant),
    withPreferredCloudflareVariant(typeof aliases.flyerImageUrl === 'string' ? aliases.flyerImageUrl : null, variant),
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

export const getListingPrimaryHeroUrl = (
  listing: Listing | null | undefined,
  variant: 'herocard' | 'heropage' = 'herocard',
): string | null => {
  if (!listing) return null;
  const aliases = listing as Listing & ListingImageAliases;
  const candidates: unknown[] = [
    getMediaAssetUrl(listing, 'hero', variant),
    withPreferredCloudflareVariant(listing.headerImageUrl, variant),
    listing.headerImageUrl,
    aliases.heroImage,
    aliases.coverImage,
    aliases.imageUrl,
    aliases.image,
    aliases.thumbnail,
    aliases.photos?.[0],
    listing.galleryImageUrls?.[0],
    getMediaAssetUrl(listing, 'gallery', 'gallerypage'),
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
 * 3. Inherited series/organizer/venue hero image (when entityIndex is provided; never a logo)
 * 4. Default event placeholder fallback
 */
export const getEventCardImageUrl = (
  event: Listing | null | undefined,
  entityIndex?: EntityIndex,
): string => {
  if (!event) return LISTING_IMAGE_FALLBACK;
  const direct = getListingPrimaryFlyerUrl(event, 'flyercard')
    ?? getListingPrimaryHeroUrl(event, 'herocard');
  if (direct) return direct;
  if (event.type === 'event' && entityIndex) {
    const inheritedHero = getIndexedEventInheritedHeroUrl(event, entityIndex, 'herocard');
    if (inheritedHero) return inheritedHero;
  }
  return LISTING_IMAGE_FALLBACK;
};

export const getListingFlyerUrl = (
  listing: Listing | null | undefined,
  entityIndex?: EntityIndex,
): string => getEventCardImageUrl(listing, entityIndex);

/**
 * Shared listing card image resolver for globe carousel/rotary stack,
 * nearby carousel, discovery rails, mobile/tablet cards, and preview cards.
 *
 * For events:
 *   1. Flyer image
 *   2. Hero image (only if no valid flyer exists)
 *   3. Inherited series/organizer/venue hero image (when entityIndex is provided)
 *   4. Default placeholder
 *
 * For clubs:
 *   1. Hero image (or inherited organization header)
 *   2. Logo image
 *   3. Default placeholder
 */
export const getListingCardImageUrl = (
  listing: Listing | null | undefined,
  entityIndex?: EntityIndex,
): string => {
  if (!listing) return LISTING_IMAGE_FALLBACK;
  if (listing.type === 'event') {
    return getEventCardImageUrl(listing, entityIndex);
  }
  return getListingHeroUrl(listing, entityIndex);
};

export const getListingHeroUrl = (
  listing: Listing | null | undefined,
  entityIndex?: EntityIndex,
): string => {
  if (!listing) return LISTING_IMAGE_FALLBACK;
  if (listing.type === 'event') {
    return getEventCardImageUrl(listing, entityIndex);
  }
  const directHero = getListingPrimaryHeroUrl(listing, 'herocard');
  if (directHero) return directHero;
  if (listing.type === 'club' && entityIndex && listing.ownerOrganizationId) {
    const orgHero = getEntityPrimaryHeroUrl(entityIndex.organizationsById.get(listing.ownerOrganizationId), 'herocard');
    if (orgHero) return orgHero;
  }
  return getListingLogoUrl(listing, entityIndex);
};

export const getListingImageUrl = (
  listing: Listing | null | undefined,
  entityIndex?: EntityIndex,
): string => {
  if (!listing) return LISTING_IMAGE_FALLBACK;
  if (listing.type === 'event') {
    return getEventCardImageUrl(listing, entityIndex);
  }
  return getListingHeroUrl(listing, entityIndex);
};

export const buildFallbackCandidateChain = (
  candidates: Array<string | null | undefined>,
  includeGenericFallback = true,
): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();

  const pushUnique = (rawUrl?: string | null) => {
    if (!rawUrl || typeof rawUrl !== 'string') return;
    const trimmed = rawUrl.trim();
    if (!trimmed) return;
    if (trimmed === LISTING_IMAGE_FALLBACK || trimmed.endsWith(LISTING_IMAGE_FALLBACK)) return;
    if (isPlaceholderMediaUrl(trimmed)) return;
    const key = normalizeUrlKey(trimmed);
    if (!key || seen.has(key)) return;
    if (!isMediaUrlKnownFailed(trimmed)) {
      seen.add(key);
      result.push(trimmed);
    }
    for (const altVariantUrl of getCloudflareAlternateVariantUrls(trimmed)) {
      const altKey = normalizeUrlKey(altVariantUrl);
      if (altKey && !seen.has(altKey) && !isMediaUrlKnownFailed(altVariantUrl)) {
        seen.add(altKey);
        result.push(altVariantUrl);
      }
    }
  };

  for (const candidate of candidates) {
    pushUnique(candidate);
  }

  if (includeGenericFallback) {
    result.push(LISTING_IMAGE_FALLBACK);
  }

  return result;
};

export const getListingImageCandidates = (
  listing: Listing | null | undefined,
  options: {
    role?: 'card' | 'flyer' | 'hero' | 'logo';
    variant?: 'flyercard' | 'flyerpage' | 'herocard' | 'heropage' | 'logosquare';
    entityIndex?: EntityIndex;
    extraCandidates?: Array<string | null | undefined>;
    includeGenericFallback?: boolean;
  } = {},
): string[] => {
  const {
    role = 'card',
    variant,
    entityIndex,
    extraCandidates = [],
    includeGenericFallback = true,
  } = options;

  if (!listing) {
    return buildFallbackCandidateChain(extraCandidates, includeGenericFallback);
  }

  const rawCandidates: Array<string | null | undefined> = [];

  if (role === 'logo') {
    if (listing.type === 'event') {
      const primaryLogo = getListingLogoUrl(listing, entityIndex);
      rawCandidates.push(primaryLogo);
      rawCandidates.push(getListingPrimaryLogoUrl(listing));
      if (entityIndex) {
        rawCandidates.push(getIndexedEventInheritedLogoUrl(listing, entityIndex));
      }
    } else {
      rawCandidates.push(getListingPrimaryLogoUrl(listing));
      rawCandidates.push(getListingLogoUrl(listing, entityIndex));
    }
  } else if (listing.type === 'event') {
    const flyerVariant = variant === 'flyerpage' ? 'flyerpage' : 'flyercard';
    const heroVariant = variant === 'heropage' ? 'heropage' : 'herocard';
    if (role === 'hero') {
      rawCandidates.push(getListingPrimaryHeroUrl(listing, heroVariant));
      if (entityIndex) {
        rawCandidates.push(getIndexedEventInheritedHeroUrl(listing, entityIndex, heroVariant));
      }
      rawCandidates.push(getListingPrimaryFlyerUrl(listing, flyerVariant));
      rawCandidates.push(...(listing.galleryImageUrls ?? []));
    } else {
      // 'card' or 'flyer'
      rawCandidates.push(getListingPrimaryFlyerUrl(listing, flyerVariant));
      rawCandidates.push(getListingPrimaryHeroUrl(listing, heroVariant));
      if (entityIndex) {
        rawCandidates.push(getIndexedEventInheritedHeroUrl(listing, entityIndex, heroVariant));
      }
      rawCandidates.push(...(listing.galleryImageUrls ?? []));
    }
  } else {
    // club
    const heroVariant = variant === 'heropage' ? 'heropage' : 'herocard';
    rawCandidates.push(getListingPrimaryHeroUrl(listing, heroVariant));
    if (entityIndex && listing.ownerOrganizationId) {
      rawCandidates.push(
        getEntityPrimaryHeroUrl(entityIndex.organizationsById.get(listing.ownerOrganizationId), heroVariant),
      );
    }
    rawCandidates.push(...(listing.galleryImageUrls ?? []));
    rawCandidates.push(getListingPrimaryLogoUrl(listing));
  }

  rawCandidates.push(...extraCandidates);

  return buildFallbackCandidateChain(rawCandidates, includeGenericFallback);
};

export const serializeFallbackCandidates = (candidates: Array<string | null | undefined>): string =>
  buildFallbackCandidateChain(candidates, true).join('|');

const parseDatasetCandidates = (image: HTMLImageElement): string[] => {
  const raw = image.dataset.fallbackCandidates;
  const single = image.dataset.fallbackSrc;
  const list: string[] = [];
  if (raw) {
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === 'string' && item.trim()) list.push(item.trim());
          }
        }
      } catch {
        // Ignore malformed JSON and fall through to pipe split
      }
    }
    if (list.length === 0) {
      for (const part of raw.split('|')) {
        if (part.trim()) list.push(part.trim());
      }
    }
  }
  if (single && single.trim()) {
    list.push(single.trim());
  }
  return list;
};

export const handleListingImageError = (event: SyntheticEvent<HTMLImageElement>) => {
  const image = event.currentTarget;
  const failedSrc = image.getAttribute('src') || image.currentSrc || image.src;
  const entityId = image.dataset.entityId;
  const mediaRole = image.dataset.mediaRole;

  const altVariants = getCloudflareAlternateVariantUrls(failedSrc);
  const explicitCandidates = parseDatasetCandidates(image);
  const allCandidates = [...altVariants, ...explicitCandidates, LISTING_IMAGE_FALLBACK];

  // Record the failed URL before picking the next candidate
  const failedKey = normalizeUrlKey(failedSrc);
  if (failedKey && failedKey !== LISTING_IMAGE_FALLBACK) {
    failedMediaUrls.add(failedKey);
    if (failedSrc?.trim()) failedMediaUrls.add(failedSrc.trim());
  }

  let nextSrc: string | null = null;
  for (const candidate of allCandidates) {
    if (!candidate) continue;
    const candidateKey = normalizeUrlKey(candidate);
    if (candidateKey === failedKey) continue;
    if (candidate === LISTING_IMAGE_FALLBACK || candidateKey === LISTING_IMAGE_FALLBACK) {
      if (image.dataset.fallbackApplied === 'true') continue;
      nextSrc = LISTING_IMAGE_FALLBACK;
      break;
    }
    if (!isMediaUrlKnownFailed(candidate)) {
      nextSrc = candidate;
      break;
    }
  }

  markMediaUrlFailed(failedSrc, {
    entityId,
    role: mediaRole,
    nextUrl: nextSrc,
  });

  if (!nextSrc || nextSrc === LISTING_IMAGE_FALLBACK) {
    if (image.dataset.fallbackApplied === 'true') return;
    image.dataset.fallbackApplied = 'true';
    image.src = LISTING_IMAGE_FALLBACK;
    return;
  }

  image.src = nextSrc;
};

