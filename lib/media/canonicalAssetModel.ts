import type {
  ClubBrandData,
  ClubData,
  CruiseSailingData,
  CruiseSeriesData,
  EventData,
  EventSeriesData,
  Listing,
  OrganizationData,
  OrganizationVenueRelationship,
  ResortData,
  User,
  VenueData,
} from '../../types';
import {
  extractCloudflareExternalIdFromUrl,
  getCanonicalMediaSignature,
  hydrateOrganizationsFromCatalog,
  isPlaceholderMediaUrl,
  resolveBrandHeader,
  resolveBrandLogo,
  resolveEventLogoState,
  type BrandMediaCatalog,
} from '../entityBrandMedia';
import { buildEntityIndex } from '../entityIndex';
import { getClubCanonicalPath, getEventCanonicalPath, getHostCanonicalPath } from '../entityUtils';
import {
  getListingPrimaryFlyerUrl,
  getListingPrimaryHeroUrl,
  getListingPrimaryLogoUrl,
  LISTING_IMAGE_FALLBACK,
} from '../listingImage';
import { getCloudflareImageUrl } from './getCloudflareImageUrl';
import { getMediaOwnerId } from './getMediaOwnerId';
import { getMediaRule } from './mediaRules';
import type { MediaAsset, MediaRole, MediaStatus } from './types';
import { mockOrganizations } from '../../data/mockOrganizations';
import { mockVenues } from '../../data/mockVenues';
import { mockOrganizationVenueRelationships } from '../../data/mockEntityRelationships';
import { eventSeries as defaultEventSeries } from '../../data/eventSeries';

export type CanonicalAssetCategory = 'all' | 'logo' | 'hero' | 'flyer' | 'gallery' | 'other';

export type CanonicalEntityType =
  | 'club'
  | 'event'
  | 'organization'
  | 'venue'
  | 'resort'
  | 'cruise_series'
  | 'cruise_sailing'
  | 'event_series'
  | 'club_brand'
  | 'user';

export type AssetAssignmentKind =
  | 'explicit'
  | 'inherited'
  | 'redundant_copy'
  | 'historical_extra';

export type AssetStatusBadge =
  | 'Linked'
  | 'Unlinked'
  | 'Missing'
  | 'Potential Duplicate'
  | 'Invalid URL'
  | 'Broken Image'
  | 'Referenced by Multiple Listings';

export interface CanonicalAssetUsage {
  id: string;
  entityType: CanonicalEntityType;
  entityId: string;
  entityName: string;
  entitySlug?: string;
  publicRoute: string | null;
  role: MediaRole | 'avatar';
  assignmentKind: AssetAssignmentKind;
  isActiveOnSite: boolean;
  inheritedFrom?: {
    entityType: CanonicalEntityType;
    entityId: string;
    entityName: string;
  };
  note?: string;
}

export interface CanonicalMediaAsset {
  canonicalId: string;
  externalId: string | null;
  storageProvider: 'cloudflare_images' | 'external_url' | 'static_local';
  storageLocationLabel: string;
  originalPreviewUrl: string;
  thumbnailUrl: string;
  filename: string;
  title: string;
  altText: string;
  primaryCategory: Exclude<CanonicalAssetCategory, 'all'>;
  roles: Array<MediaRole | 'avatar'>;
  status: MediaStatus;
  createdAt: string | null;
  updatedAt: string | null;
  targetRatio: string | null;
  aspectMode: string | null;
  fileType: string;
  fileSizeBytes: number | null;
  contentHash: string | null;
  visualHash: string | null;
  dbRecords: MediaAsset[];
  usages: CanonicalAssetUsage[];
  activeReferenceCount: number;
  explicitReferenceCount: number;
  inheritedReferenceCount: number;
  redundantCopyCount: number;
  isPlaceholder: boolean;
  isValidUrl: boolean;
  duplicateFlags: {
    hasDuplicateDbRecords: boolean;
    hasRedundantEventCopies: boolean;
    exactByteDuplicateGroupId: string | null;
    repeatedUrlGroupId: string | null;
    visualSimilarityGroupId: string | null;
    isUnlinkedOrOrphaned: boolean;
  };
  statusBadges: AssetStatusBadge[];
}

export interface MissingMediaAssignmentSlot {
  id: string;
  entityType: CanonicalEntityType;
  entityId: string;
  entityName: string;
  publicRoute: string | null;
  missingRole: 'logo' | 'hero' | 'flyer';
  severity: 'warning' | 'info';
  reason: string;
}

export type DuplicateCandidateKind =
  | 'exact_byte_duplicates'
  | 'duplicate_db_records'
  | 'repeated_storage_urls'
  | 'visual_similarity_candidates'
  | 'unused_or_orphaned';

export interface DuplicateReviewGroup {
  id: string;
  kind: DuplicateCandidateKind;
  title: string;
  summary: string;
  canAutoRecommendCanonical: boolean;
  recommendedCanonicalId: string | null;
  assets: CanonicalMediaAsset[];
  affectedUsages: CanonicalAssetUsage[];
  consequencesSummary: string[];
}

export interface ConsolidationAffectedEntity {
  entityType: CanonicalEntityType;
  entityId: string;
  entityName: string;
  role: MediaRole | 'avatar';
  previousUrl?: string;
  nextUrl: string;
  action: 'migrated_reference' | 'removed_redundant_override';
}

export interface ConsolidationPreview {
  groupId: string;
  kind: DuplicateCandidateKind;
  canonicalAsset: CanonicalMediaAsset;
  secondaryAssets: CanonicalMediaAsset[];
  affectedEntities: ConsolidationAffectedEntity[];
  dbRecordsToArchiveCount: number;
  warnings: string[];
}

export interface ConsolidationAuditEntry {
  id: string;
  timestamp: string;
  actorLabel: string;
  canonicalAssetId: string;
  canonicalTitle: string;
  canonicalUrl: string;
  consolidatedAssetIds: string[];
  kind: DuplicateCandidateKind | 'redundant_event_logo_cleanup';
  affectedEntities: ConsolidationAffectedEntity[];
  sourceFilesDeleted: false;
}

export interface AssetQualityCheckItem {
  level: 'ok' | 'warning' | 'error' | 'info';
  code: string;
  message: string;
}

export interface AssetQualityReport {
  overallLevel: 'ok' | 'warning' | 'error';
  aspectRatioLabel: string | null;
  numericRatio: number | null;
  checks: AssetQualityCheckItem[];
}

export interface CanonicalCatalogInput {
  listings: Listing[];
  organizations?: OrganizationData[];
  venues?: VenueData[];
  relationships?: OrganizationVenueRelationship[];
  eventSeries?: EventSeriesData[];
  clubBrands?: ClubBrandData[];
  resorts?: ResortData[];
  cruiseSeries?: CruiseSeriesData[];
  cruiseSailings?: CruiseSailingData[];
  users?: User[];
  mediaAssetRows?: MediaAsset[];
  knownContentHashes?: Record<string, string>;
  knownVisualHashes?: Record<string, string>;
  knownFileSizes?: Record<string, number>;
}

export interface CanonicalMediaCatalogResult {
  assets: CanonicalMediaAsset[];
  assetsById: Map<string, CanonicalMediaAsset>;
  missingSlots: MissingMediaAssignmentSlot[];
  duplicateGroups: DuplicateReviewGroup[];
  summary: {
    totalCanonicalAssets: number;
    linkedAssets: number;
    unlinkedAssets: number;
    multiReferencedAssets: number;
    inheritedEventUsages: number;
    redundantEventLogoCopies: number;
    duplicateCandidateGroups: number;
    missingEntitySlots: number;
    externalUrlAssets: number;
  };
}

export const CONSOLIDATION_AUDIT_STORAGE_KEY = 'swingsphere:media-consolidation-audit:v2';
export const UPLOAD_METADATA_STORAGE_KEY = 'swingsphere:media-upload-metadata:v2';

export type StoredUploadMetadata = {
  sha256?: string;
  visualHash?: string;
  fileSizeBytes?: number;
  originalFilename?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  uploadedAt?: string;
};

export const readStoredUploadMetadata = (): Record<string, StoredUploadMetadata> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(UPLOAD_METADATA_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const saveStoredUploadMetadata = (canonicalOrExternalId: string, meta: StoredUploadMetadata) => {
  if (typeof window === 'undefined' || !canonicalOrExternalId) return;
  try {
    const existing = readStoredUploadMetadata();
    existing[canonicalOrExternalId] = {
      ...(existing[canonicalOrExternalId] ?? {}),
      ...meta,
    };
    window.localStorage.setItem(UPLOAD_METADATA_STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // Ignore storage quota errors in dev/browser environments.
  }
};

export const readConsolidationAuditLog = (): ConsolidationAuditEntry[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CONSOLIDATION_AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const appendConsolidationAuditEntry = (entry: ConsolidationAuditEntry): ConsolidationAuditEntry[] => {
  const current = readConsolidationAuditLog();
  const next = [entry, ...current].slice(0, 200);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CONSOLIDATION_AUDIT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors.
    }
  }
  return next;
};

export const validateExternalImageUrl = (rawUrl: string): {
  valid: boolean;
  normalizedUrl?: string;
  host?: string;
  isCloudflareManaged: boolean;
  error?: string;
} => {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, isCloudflareManaged: false, error: 'Enter an image URL.' };
  }
  if (trimmed.startsWith('/')) {
    return {
      valid: true,
      normalizedUrl: trimmed,
      host: 'swingsphere.local',
      isCloudflareManaged: false,
    };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        valid: false,
        isCloudflareManaged: false,
        error: 'Only HTTP/HTTPS image URLs are allowed.',
      };
    }
    if (parsed.username || parsed.password) {
      return {
        valid: false,
        isCloudflareManaged: false,
        error: 'URLs containing embedded credentials are not permitted.',
      };
    }
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.internal')) {
      return {
        valid: false,
        isCloudflareManaged: false,
        error: 'Private or loopback network URLs cannot be used as external media sources.',
      };
    }
    const isCloudflareManaged = host === 'imagedelivery.net';
    return {
      valid: true,
      normalizedUrl: parsed.toString(),
      host,
      isCloudflareManaged,
    };
  } catch {
    return {
      valid: false,
      isCloudflareManaged: false,
      error: 'Enter a valid HTTPS image URL.',
    };
  }
};

export const computeFileSha256Hex = async (input: File | ArrayBuffer | Uint8Array): Promise<string> => {
  const buffer = input instanceof Uint8Array
    ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
    : input instanceof ArrayBuffer
      ? input
      : await input.arrayBuffer();
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  // Deterministic FNV-1a 64-bit fallback if SubtleCrypto is unavailable
  const bytes = new Uint8Array(buffer);
  let h1 = 0xdeadbeef ^ bytes.length;
  let h2 = 0x41c6ce57 ^ bytes.length;
  for (let i = 0; i < bytes.length; i++) {
    const ch = bytes[i];
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
};

const inferFileTypeFromUrl = (url: string, storageProvider: CanonicalMediaAsset['storageProvider']): string => {
  const clean = url.split('?')[0].split('#')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'PNG';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'JPEG';
  if (clean.endsWith('.webp')) return 'WebP';
  if (clean.endsWith('.avif')) return 'AVIF';
  if (clean.endsWith('.svg')) return 'SVG';
  if (clean.endsWith('.gif')) return 'GIF';
  if (storageProvider === 'cloudflare_images') return 'Cloudflare Variant (Auto WebP/AVIF)';
  return 'Image';
};

const inferFilenameFromUrl = (url: string, externalId: string | null, fallbackTitle: string): string => {
  if (externalId) {
    return `${externalId.slice(0, 12)}.cf-image`;
  }
  try {
    const parsed = new URL(url, 'https://swingsphere.local');
    const lastSegment = parsed.pathname.split('/').filter(Boolean).pop();
    if (lastSegment && lastSegment.length <= 64) {
      return decodeURIComponent(lastSegment);
    }
  } catch {
    // Fall through
  }
  return fallbackTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'asset';
};

const toPrimaryCategory = (roles: Array<MediaRole | 'avatar'>): Exclude<CanonicalAssetCategory, 'all'> => {
  if (roles.includes('logo')) return 'logo';
  if (roles.includes('flyer')) return 'flyer';
  if (roles.includes('hero') || roles.includes('cover')) return 'hero';
  if (roles.includes('gallery')) return 'gallery';
  return 'other';
};

const getOriginalPreviewUrlForAsset = (
  externalId: string | null,
  rawUrl: string,
  primaryRole: MediaRole | 'avatar',
): string => {
  if (externalId) {
    // Request the full-size stored variant for inspection (never darkened)
    const variant =
      primaryRole === 'logo'
        ? 'logosquare'
        : primaryRole === 'avatar'
          ? 'avatarsquare'
          : primaryRole === 'flyer'
            ? 'flyerpage'
            : primaryRole === 'gallery'
              ? 'gallerypage'
              : primaryRole === 'cover'
                ? 'coverpage'
                : 'heropage';
    return getCloudflareImageUrl({ externalId, variant }) ?? rawUrl;
  }
  return rawUrl;
};

const getThumbnailUrlForAsset = (
  externalId: string | null,
  rawUrl: string,
  primaryRole: MediaRole | 'avatar',
): string => {
  if (externalId) {
    // Use lightweight card/thumb variants in the grid so we never fetch full-resolution images for every card
    const variant =
      primaryRole === 'logo'
        ? 'logosquare'
        : primaryRole === 'avatar'
          ? 'avatarsquare'
          : primaryRole === 'flyer'
            ? 'flyercard'
            : primaryRole === 'gallery'
              ? 'gallerythumb'
              : primaryRole === 'cover'
                ? 'coverpage'
                : 'herocard';
    return getCloudflareImageUrl({ externalId, variant }) ?? rawUrl;
  }
  return rawUrl;
};

export const formatRatioBadge = (width?: number, height?: number): string | null => {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const ratio = width / height;
  if (Math.abs(ratio - 1) <= 0.06) return '1:1';
  if (Math.abs(ratio - 4 / 5) <= 0.06) return '4:5';
  if (Math.abs(ratio - 16 / 9) <= 0.08) return '16:9';
  if (Math.abs(ratio - 4 / 3) <= 0.07) return '4:3';
  if (Math.abs(ratio - 3 / 2) <= 0.07) return '3:2';
  if (Math.abs(ratio - 2 / 3) <= 0.07) return '2:3';
  return `${ratio.toFixed(2)}:1`;
};

export const evaluateAssetRoleQuality = (params: {
  roles: Array<MediaRole | 'avatar'>;
  width?: number;
  height?: number;
  isValidUrl: boolean;
  isBroken?: boolean;
  isPlaceholder?: boolean;
}): AssetQualityReport => {
  const { roles, width, height, isValidUrl, isBroken, isPlaceholder } = params;
  const checks: AssetQualityCheckItem[] = [];

  if (!isValidUrl) {
    checks.push({
      level: 'error',
      code: 'invalid_url',
      message: 'Asset URL is malformed or uses an unsupported protocol.',
    });
  }
  if (isBroken) {
    checks.push({
      level: 'error',
      code: 'broken_image',
      message: 'Image failed to load in the browser preview.',
    });
  }
  if (isPlaceholder) {
    checks.push({
      level: 'warning',
      code: 'placeholder_url',
      message: 'Placeholder service URL detected; replace with authentic brand or event artwork.',
    });
  }

  const numericRatio = width && height && height > 0 ? width / height : null;
  const aspectRatioLabel = formatRatioBadge(width, height);

  if (width && height) {
    const shortestSide = Math.min(width, height);
    if (shortestSide < 200) {
      checks.push({
        level: 'warning',
        code: 'low_resolution',
        message: `Low resolution (${width}×${height}px). May appear soft on high-DPI displays.`,
      });
    }

    if (numericRatio !== null) {
      if (roles.includes('logo') && (numericRatio < 0.72 || numericRatio > 1.38)) {
        checks.push({
          level: 'warning',
          code: 'logo_non_square',
          message: `Logo aspect ratio is ${aspectRatioLabel} (${width}×${height}px). Square (1:1) logos fit circular and square identity badges best.`,
        });
      }

      if ((roles.includes('hero') || roles.includes('cover')) && !roles.includes('flyer') && numericRatio < 1.2) {
        checks.push({
          level: 'warning',
          code: 'hero_non_landscape',
          message: `Hero image is ${aspectRatioLabel} (${width}×${height}px). Wide landscape (16:9) is recommended to prevent vertical cropping in page headers.`,
        });
      }

      if (roles.includes('flyer')) {
        if (numericRatio > 1.15) {
          // Intentional horizontal flyers must NEVER be flagged as errors
          checks.push({
            level: 'info',
            code: 'flyer_horizontal_format',
            message: `Horizontal flyer (${aspectRatioLabel}, ${width}×${height}px). Rendered using natural aspect ratio on event pages;portrait (4:5) is also supported.`,
          });
        } else {
          checks.push({
            level: 'ok',
            code: 'flyer_ratio_ok',
            message: `Portrait/square flyer (${aspectRatioLabel}, ${width}×${height}px) matches directory card and flyer showcase layout.`,
          });
        }
      }
    }
  }

  if (checks.length === 0) {
    checks.push({
      level: 'ok',
      code: 'healthy',
      message: 'Asset URL and role configuration look healthy.',
    });
  }

  const overallLevel: AssetQualityReport['overallLevel'] = checks.some((c) => c.level === 'error')
    ? 'error'
    : checks.some((c) => c.level === 'warning')
      ? 'warning'
      : 'ok';

  return {
    overallLevel,
    aspectRatioLabel,
    numericRatio,
    checks,
  };
};

type EntityMeta = {
  entityType: CanonicalEntityType;
  entityId: string;
  entityName: string;
  entitySlug?: string;
  publicRoute: string | null;
};

export const buildCanonicalMediaCatalog = (input: CanonicalCatalogInput): CanonicalMediaCatalogResult => {
  const listings = input.listings ?? [];

  const venueMap = new Map<string, VenueData>();
  for (const v of mockVenues) venueMap.set(v.id, v);
  for (const v of input.venues ?? []) venueMap.set(v.id, { ...(venueMap.get(v.id) ?? {}), ...v });
  const venues = Array.from(venueMap.values());

  const relationships =
    input.relationships && input.relationships.length > 0
      ? input.relationships
      : mockOrganizationVenueRelationships;

  const seriesMap = new Map<string, EventSeriesData>();
  for (const s of defaultEventSeries) seriesMap.set(s.id, s);
  for (const s of input.eventSeries ?? []) seriesMap.set(s.id, { ...(seriesMap.get(s.id) ?? {}), ...s });
  const eventSeries = Array.from(seriesMap.values());

  const clubBrands = input.clubBrands ?? [];
  const resorts = input.resorts ?? [];
  const cruiseSeries = input.cruiseSeries ?? [];
  const cruiseSailings = input.cruiseSailings ?? [];
  const users = input.users ?? [];
  const mediaAssetRows = input.mediaAssetRows ?? [];

  const organizations = hydrateOrganizationsFromCatalog({
    listings,
    venues,
    organizations: input.organizations ?? [],
    relationships,
    eventSeries,
    clubBrands,
    resorts,
    cruiseSeries,
    cruiseSailings,
  });

  const storedMeta = readStoredUploadMetadata();
  const knownContentHashes = {
    ...Object.fromEntries(
      Object.entries(storedMeta)
        .filter(([, v]) => Boolean(v.sha256))
        .map(([k, v]) => [k, v.sha256!]),
    ),
    ...(input.knownContentHashes ?? {}),
  };
  const knownVisualHashes = {
    ...Object.fromEntries(
      Object.entries(storedMeta)
        .filter(([, v]) => Boolean(v.visualHash))
        .map(([k, v]) => [k, v.visualHash!]),
    ),
    ...(input.knownVisualHashes ?? {}),
  };
  const knownFileSizes = {
    ...Object.fromEntries(
      Object.entries(storedMeta)
        .filter(([, v]) => typeof v.fileSizeBytes === 'number')
        .map(([k, v]) => [k, v.fileSizeBytes!]),
    ),
    ...(input.knownFileSizes ?? {}),
  };

  const entityIndex = buildEntityIndex(
    listings,
    users as any,
    venues.length > 0 ? venues : undefined,
    organizations.length > 0 ? organizations : undefined,
    relationships.length > 0 ? relationships : undefined,
    eventSeries.length > 0 ? eventSeries : undefined,
  );

  const brandCatalog: BrandMediaCatalog = {
    listings,
    venues,
    organizations,
    relationships,
    eventSeries,
    clubBrands,
    resorts,
    cruiseSeries,
    cruiseSailings,
  };

  // Map deterministic media owner UUID -> EntityMeta
  const ownerUuidToEntity = new Map<string, EntityMeta>();
  const entityKeyToMeta = new Map<string, EntityMeta>();

  const registerEntity = (meta: EntityMeta) => {
    const key = `${meta.entityType}:${meta.entityId}`;
    entityKeyToMeta.set(key, meta);
    ownerUuidToEntity.set(`${meta.entityType}:${getMediaOwnerId(meta.entityType, meta.entityId)}`, meta);
  };

  for (const listing of listings) {
    if (listing.type === 'club') {
      registerEntity({
        entityType: 'club',
        entityId: listing.id,
        entityName: listing.name,
        publicRoute: getClubCanonicalPath(listing, entityIndex),
      });
    } else {
      registerEntity({
        entityType: 'event',
        entityId: listing.id,
        entityName: listing.name,
        publicRoute: getEventCanonicalPath(listing, entityIndex),
      });
    }
  }
  for (const org of organizations) {
    registerEntity({
      entityType: 'organization',
      entityId: org.id,
      entityName: org.name,
      entitySlug: org.slug,
      publicRoute: org.slug ? getHostCanonicalPath(org.slug) : null,
    });
  }
  for (const venue of venues) {
    registerEntity({
      entityType: 'venue',
      entityId: venue.id,
      entityName: venue.name,
      entitySlug: venue.slug,
      publicRoute: venue.slug ? `/venues/${venue.slug}` : null,
    });
  }
  for (const series of eventSeries) {
    registerEntity({
      entityType: 'event_series',
      entityId: series.id,
      entityName: series.name,
      entitySlug: series.slug,
      publicRoute: null,
    });
  }
  for (const brand of clubBrands) {
    registerEntity({
      entityType: 'club_brand',
      entityId: brand.id,
      entityName: brand.name,
      entitySlug: brand.slug,
      publicRoute: null,
    });
  }
  for (const resort of resorts) {
    registerEntity({
      entityType: 'resort',
      entityId: resort.id,
      entityName: resort.name,
      entitySlug: resort.slug,
      publicRoute: resort.slug ? `/resorts/${resort.slug}` : null,
    });
  }
  for (const series of cruiseSeries) {
    registerEntity({
      entityType: 'cruise_series',
      entityId: series.id,
      entityName: series.name,
      entitySlug: series.slug,
      publicRoute: series.slug ? `/cruises/${series.slug}` : null,
    });
  }
  for (const sailing of cruiseSailings) {
    const parentSeries = cruiseSeries.find((s) => s.id === sailing.cruiseSeriesId);
    registerEntity({
      entityType: 'cruise_sailing',
      entityId: sailing.id,
      entityName: sailing.name,
      entitySlug: sailing.slug,
      publicRoute: parentSeries?.slug ? `/cruises/${parentSeries.slug}` : sailing.slug ? `/cruises/${sailing.slug}` : null,
    });
  }
  for (const user of users) {
    registerEntity({
      entityType: 'user',
      entityId: user.id,
      entityName: user.displayName || user.handle || user.id,
      entitySlug: user.handle,
      publicRoute: user.handle ? `/users/${user.handle}` : null,
    });
  }

  // Canonical accumulator
  type MutableCanonical = {
    canonicalId: string;
    externalId: string | null;
    rawUrls: Set<string>;
    primaryUrl: string;
    storageProvider: CanonicalMediaAsset['storageProvider'];
    roles: Set<MediaRole | 'avatar'>;
    statuses: Set<MediaStatus>;
    createdAt: string | null;
    updatedAt: string | null;
    targetRatio: string | null;
    aspectMode: string | null;
    altTexts: string[];
    titles: string[];
    dbRecords: MediaAsset[];
    usages: CanonicalAssetUsage[];
  };

  const canonicalMap = new Map<string, MutableCanonical>();

  const ensureCanonical = (params: {
    url?: string | null;
    externalId?: string | null;
    role: MediaRole | 'avatar';
    status?: MediaStatus;
    titleHint?: string;
    altText?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    targetRatio?: string | null;
    aspectMode?: string | null;
    dbRecord?: MediaAsset;
  }): MutableCanonical | null => {
    const resolvedExtId = params.externalId?.trim() || extractCloudflareExternalIdFromUrl(params.url);
    const fallbackUrl = resolvedExtId
      ? getCloudflareImageUrl({
          externalId: resolvedExtId,
          variant: params.role === 'avatar' ? 'logosquare' : getMediaRule(params.role).defaultVariant,
        })
      : null;
    const effectiveUrl = (params.url?.trim() || fallbackUrl || '').trim();
    if (!effectiveUrl || effectiveUrl === LISTING_IMAGE_FALLBACK) return null;

    const canonicalId = getCanonicalMediaSignature(effectiveUrl, resolvedExtId);
    if (!canonicalId) return null;

    let entry = canonicalMap.get(canonicalId);
    if (!entry) {
      const storageProvider: CanonicalMediaAsset['storageProvider'] = resolvedExtId
        ? 'cloudflare_images'
        : effectiveUrl.startsWith('/')
          ? 'static_local'
          : 'external_url';
      entry = {
        canonicalId,
        externalId: resolvedExtId ?? null,
        rawUrls: new Set([effectiveUrl]),
        primaryUrl: effectiveUrl,
        storageProvider,
        roles: new Set([params.role]),
        statuses: new Set([params.status ?? 'approved']),
        createdAt: params.createdAt ?? null,
        updatedAt: params.updatedAt ?? null,
        targetRatio: params.targetRatio ?? null,
        aspectMode: params.aspectMode ?? null,
        altTexts: params.altText?.trim() ? [params.altText.trim()] : [],
        titles: params.titleHint?.trim() ? [params.titleHint.trim()] : [],
        dbRecords: params.dbRecord ? [params.dbRecord] : [],
        usages: [],
      };
      canonicalMap.set(canonicalId, entry);
    } else {
      entry.rawUrls.add(effectiveUrl);
      entry.roles.add(params.role);
      if (params.status) entry.statuses.add(params.status);
      if (params.altText?.trim() && !entry.altTexts.includes(params.altText.trim())) {
        entry.altTexts.push(params.altText.trim());
      }
      if (params.titleHint?.trim() && !entry.titles.includes(params.titleHint.trim())) {
        entry.titles.push(params.titleHint.trim());
      }
      if (params.createdAt && (!entry.createdAt || params.createdAt < entry.createdAt)) {
        entry.createdAt = params.createdAt;
      }
      if (params.updatedAt && (!entry.updatedAt || params.updatedAt > entry.updatedAt)) {
        entry.updatedAt = params.updatedAt;
      }
      if (!entry.targetRatio && params.targetRatio) entry.targetRatio = params.targetRatio;
      if (!entry.aspectMode && params.aspectMode) entry.aspectMode = params.aspectMode;
      if (params.dbRecord && !entry.dbRecords.some((r) => r.id === params.dbRecord!.id)) {
        entry.dbRecords.push(params.dbRecord);
      }
    }
    return entry;
  };

  const addUsage = (entry: MutableCanonical, usage: CanonicalAssetUsage) => {
    const existingIdx = entry.usages.findIndex(
      (u) =>
        u.entityType === usage.entityType
        && u.entityId === usage.entityId
        && u.role === usage.role
        && u.assignmentKind === usage.assignmentKind,
    );
    if (existingIdx >= 0) {
      if (usage.isActiveOnSite) entry.usages[existingIdx].isActiveOnSite = true;
      return;
    }
    entry.usages.push(usage);
  };

  // 1. Register explicit & inherited usages on Clubs & Events
  for (const listing of listings) {
    const meta = entityKeyToMeta.get(`${listing.type}:${listing.id}`)!;
    const embeddedAssets = listing.mediaAssets ?? [];

    if (listing.type === 'club') {
      const club = listing;
      const resolvedLogo = resolveBrandLogo('club', club.id, brandCatalog);
      const directLogoUrl = getListingPrimaryLogoUrl(club);
      const directLogoAsset = embeddedAssets.find((a) => a.role === 'logo');

      if (directLogoUrl || directLogoAsset) {
        const entry = ensureCanonical({
          url: directLogoUrl,
          externalId: directLogoAsset?.external_id,
          role: 'logo',
          titleHint: `${club.name} — Official Logo`,
          altText: directLogoAsset?.alt_text,
          createdAt: directLogoAsset?.created_at,
          updatedAt: directLogoAsset?.updated_at,
          targetRatio: directLogoAsset?.target_ratio,
          aspectMode: directLogoAsset?.aspect_mode,
          dbRecord: directLogoAsset,
        });
        if (entry) {
          addUsage(entry, {
            id: `${club.id}:logo:explicit`,
            entityType: 'club',
            entityId: club.id,
            entityName: club.name,
            publicRoute: meta.publicRoute,
            role: 'logo',
            assignmentKind: 'explicit',
            isActiveOnSite: true,
          });
        }
      } else if (resolvedLogo.url && resolvedLogo.inherited && resolvedLogo.sourceId && resolvedLogo.sourceType) {
        const entry = ensureCanonical({
          url: resolvedLogo.url,
          role: 'logo',
          titleHint: `${resolvedLogo.sourceName || club.name} — Brand Logo`,
        });
        if (entry) {
          addUsage(entry, {
            id: `${club.id}:logo:inherited`,
            entityType: 'club',
            entityId: club.id,
            entityName: club.name,
            publicRoute: meta.publicRoute,
            role: 'logo',
            assignmentKind: 'inherited',
            isActiveOnSite: true,
            inheritedFrom: {
              entityType: resolvedLogo.sourceType,
              entityId: resolvedLogo.sourceId,
              entityName: resolvedLogo.sourceName || resolvedLogo.sourceId,
            },
          });
        }
      }

      const heroUrl = getListingPrimaryHeroUrl(club);
      const heroAsset = embeddedAssets.find((a) => a.role === 'hero' || a.role === 'cover');
      if (heroUrl || heroAsset) {
        const entry = ensureCanonical({
          url: heroUrl,
          externalId: heroAsset?.external_id,
          role: 'hero',
          titleHint: `${club.name} — Hero Image`,
          altText: heroAsset?.alt_text,
          createdAt: heroAsset?.created_at,
          updatedAt: heroAsset?.updated_at,
          targetRatio: heroAsset?.target_ratio,
          aspectMode: heroAsset?.aspect_mode,
          dbRecord: heroAsset,
        });
        if (entry) {
          addUsage(entry, {
            id: `${club.id}:hero:explicit`,
            entityType: 'club',
            entityId: club.id,
            entityName: club.name,
            publicRoute: meta.publicRoute,
            role: 'hero',
            assignmentKind: 'explicit',
            isActiveOnSite: true,
          });
        }
      }
    } else {
      // Event listing
      const event = listing;
      const logoState = resolveEventLogoState(event, brandCatalog);
      const directLogoAsset = embeddedAssets.find((a) => a.role === 'logo');
      const directLogoUrl = getListingPrimaryLogoUrl(event);

      if (logoState.mode === 'explicit_override' && logoState.resolvedLogo.url) {
        const entry = ensureCanonical({
          url: logoState.resolvedLogo.url,
          externalId: directLogoAsset?.external_id,
          role: 'logo',
          titleHint: `${event.name} — Event Logo Override`,
          altText: directLogoAsset?.alt_text,
          createdAt: directLogoAsset?.created_at,
          updatedAt: directLogoAsset?.updated_at,
          dbRecord: directLogoAsset,
        });
        if (entry) {
          addUsage(entry, {
            id: `${event.id}:logo:explicit`,
            entityType: 'event',
            entityId: event.id,
            entityName: event.name,
            publicRoute: meta.publicRoute,
            role: 'logo',
            assignmentKind: 'explicit',
            isActiveOnSite: true,
            note: 'Explicit event logo override',
          });
        }
      } else if (logoState.mode === 'inherited_host' && logoState.inheritedHostLogo.url) {
        const inherited = logoState.inheritedHostLogo;
        const entry = ensureCanonical({
          url: inherited.url,
          role: 'logo',
          titleHint: `${inherited.sourceName || event.hostName || 'Host'} — Official Logo`,
        });
        if (entry) {
          addUsage(entry, {
            id: `${event.id}:logo:inherited`,
            entityType: 'event',
            entityId: event.id,
            entityName: event.name,
            publicRoute: meta.publicRoute,
            role: 'logo',
            assignmentKind: 'inherited',
            isActiveOnSite: true,
            inheritedFrom: inherited.sourceType && inherited.sourceId
              ? {
                  entityType: inherited.sourceType,
                  entityId: inherited.sourceId,
                  entityName: inherited.sourceName || inherited.sourceId,
                }
              : undefined,
          });
          if (logoState.hasRedundantOccurrenceCopy && (directLogoUrl || directLogoAsset)) {
            if (directLogoAsset && !entry.dbRecords.some((r) => r.id === directLogoAsset.id)) {
              entry.dbRecords.push(directLogoAsset);
            }
            addUsage(entry, {
              id: `${event.id}:logo:redundant_copy`,
              entityType: 'event',
              entityId: event.id,
              entityName: event.name,
              publicRoute: meta.publicRoute,
              role: 'logo',
              assignmentKind: 'redundant_copy',
              isActiveOnSite: false,
              inheritedFrom: inherited.sourceType && inherited.sourceId
                ? {
                    entityType: inherited.sourceType,
                    entityId: inherited.sourceId,
                    entityName: inherited.sourceName || inherited.sourceId,
                  }
                : undefined,
              note: 'Redundant occurrence copy of parent host/series logo',
            });
          }
        }
      }

      // Event Flyer
      const flyerUrl = getListingPrimaryFlyerUrl(event);
      const flyerAsset = embeddedAssets.find((a) => a.role === 'flyer');
      if (flyerUrl || flyerAsset) {
        const entry = ensureCanonical({
          url: flyerUrl,
          externalId: flyerAsset?.external_id,
          role: 'flyer',
          titleHint: `${event.name} — Event Flyer`,
          altText: flyerAsset?.alt_text,
          createdAt: flyerAsset?.created_at,
          updatedAt: flyerAsset?.updated_at,
          targetRatio: flyerAsset?.target_ratio,
          aspectMode: flyerAsset?.aspect_mode,
          dbRecord: flyerAsset,
        });
        if (entry) {
          addUsage(entry, {
            id: `${event.id}:flyer:explicit`,
            entityType: 'event',
            entityId: event.id,
            entityName: event.name,
            publicRoute: meta.publicRoute,
            role: 'flyer',
            assignmentKind: 'explicit',
            isActiveOnSite: true,
          });
        }
      }

      // Event Hero
      const heroAsset = embeddedAssets.find((a) => a.role === 'hero' || a.role === 'cover');
      const rawHeroUrl = event.headerImageUrl?.trim() || (heroAsset?.external_id
        ? getCloudflareImageUrl({ externalId: heroAsset.external_id, variant: 'heropage' })
        : undefined);
      if (rawHeroUrl || heroAsset) {
        const entry = ensureCanonical({
          url: rawHeroUrl,
          externalId: heroAsset?.external_id,
          role: 'hero',
          titleHint: `${event.name} — Event Hero`,
          altText: heroAsset?.alt_text,
          createdAt: heroAsset?.created_at,
          updatedAt: heroAsset?.updated_at,
          targetRatio: heroAsset?.target_ratio,
          aspectMode: heroAsset?.aspect_mode,
          dbRecord: heroAsset,
        });
        if (entry) {
          addUsage(entry, {
            id: `${event.id}:hero:explicit`,
            entityType: 'event',
            entityId: event.id,
            entityName: event.name,
            publicRoute: meta.publicRoute,
            role: 'hero',
            assignmentKind: 'explicit',
            isActiveOnSite: true,
          });
        }
      }
    }

    // Gallery images on club/event
    const galleryAssets = embeddedAssets.filter((a) => a.role === 'gallery');
    for (const gAsset of galleryAssets) {
      const gUrl = getCloudflareImageUrl({ externalId: gAsset.external_id, variant: 'gallerypage' });
      const entry = ensureCanonical({
        url: gUrl,
        externalId: gAsset.external_id,
        role: 'gallery',
        titleHint: `${listing.name} — Gallery Image`,
        altText: gAsset.alt_text,
        createdAt: gAsset.created_at,
        updatedAt: gAsset.updated_at,
        dbRecord: gAsset,
      });
      if (entry) {
        addUsage(entry, {
          id: `${listing.id}:gallery:${gAsset.id}`,
          entityType: listing.type,
          entityId: listing.id,
          entityName: listing.name,
          publicRoute: meta.publicRoute,
          role: 'gallery',
          assignmentKind: 'explicit',
          isActiveOnSite: true,
        });
      }
    }
    for (let i = 0; i < (listing.galleryImageUrls ?? []).length; i++) {
      const gUrl = listing.galleryImageUrls![i];
      const entry = ensureCanonical({
        url: gUrl,
        role: 'gallery',
        titleHint: `${listing.name} — Gallery #${i + 1}`,
      });
      if (entry) {
        addUsage(entry, {
          id: `${listing.id}:gallery:url:${i}`,
          entityType: listing.type,
          entityId: listing.id,
          entityName: listing.name,
          publicRoute: meta.publicRoute,
          role: 'gallery',
          assignmentKind: 'explicit',
          isActiveOnSite: true,
        });
      }
    }
  }

  // 2. Register catalog entities (organizations/hosts, venues, event_series, club_brands, resorts, cruises)
  const registerCatalogEntityMedia = (
    entityType: CanonicalEntityType,
    entity: {
      id: string;
      name: string;
      logoImageUrl?: string;
      headerImageUrl?: string;
      galleryImageUrls?: string[];
      mediaAssets?: MediaAsset[];
    },
    roleLabelPrefix: string,
  ) => {
    const meta = entityKeyToMeta.get(`${entityType}:${entity.id}`);
    const publicRoute = meta?.publicRoute ?? null;
    const logoAsset = entity.mediaAssets?.find((a) => a.role === 'logo');
    if (entity.logoImageUrl || logoAsset) {
      const entry = ensureCanonical({
        url: entity.logoImageUrl,
        externalId: logoAsset?.external_id,
        role: 'logo',
        titleHint: `${entity.name} — ${roleLabelPrefix} Logo`,
        dbRecord: logoAsset,
      });
      if (entry) {
        addUsage(entry, {
          id: `${entityType}:${entity.id}:logo:explicit`,
          entityType,
          entityId: entity.id,
          entityName: entity.name,
          publicRoute,
          role: 'logo',
          assignmentKind: 'explicit',
          isActiveOnSite: true,
        });
      }
    }
    const heroAsset = entity.mediaAssets?.find((a) => a.role === 'hero' || a.role === 'cover');
    if (entity.headerImageUrl || heroAsset) {
      const entry = ensureCanonical({
        url: entity.headerImageUrl,
        externalId: heroAsset?.external_id,
        role: 'hero',
        titleHint: `${entity.name} — ${roleLabelPrefix} Hero`,
        dbRecord: heroAsset,
      });
      if (entry) {
        addUsage(entry, {
          id: `${entityType}:${entity.id}:hero:explicit`,
          entityType,
          entityId: entity.id,
          entityName: entity.name,
          publicRoute,
          role: 'hero',
          assignmentKind: 'explicit',
          isActiveOnSite: true,
        });
      }
    }
    for (let i = 0; i < (entity.galleryImageUrls ?? []).length; i++) {
      const gUrl = entity.galleryImageUrls![i];
      const entry = ensureCanonical({
        url: gUrl,
        role: 'gallery',
        titleHint: `${entity.name} — Gallery #${i + 1}`,
      });
      if (entry) {
        addUsage(entry, {
          id: `${entityType}:${entity.id}:gallery:${i}`,
          entityType,
          entityId: entity.id,
          entityName: entity.name,
          publicRoute,
          role: 'gallery',
          assignmentKind: 'explicit',
          isActiveOnSite: true,
        });
      }
    }
  };

  for (const org of organizations) registerCatalogEntityMedia('organization', org, 'Official');
  for (const venue of venues) registerCatalogEntityMedia('venue', venue, 'Venue');
  for (const series of eventSeries) registerCatalogEntityMedia('event_series', series, 'Series');
  for (const brand of clubBrands) registerCatalogEntityMedia('club_brand', brand, 'Brand');
  for (const resort of resorts) registerCatalogEntityMedia('resort', resort, 'Resort');
  for (const series of cruiseSeries) registerCatalogEntityMedia('cruise_series', series, 'Cruise');
  for (const sailing of cruiseSailings) registerCatalogEntityMedia('cruise_sailing', sailing, 'Sailing');

  for (const user of users) {
    if (!user.avatarUrl) continue;
    const meta = entityKeyToMeta.get(`user:${user.id}`);
    const entry = ensureCanonical({
      url: user.avatarUrl,
      role: 'avatar',
      titleHint: `${user.displayName || user.handle || 'Member'} — Avatar`,
    });
    if (entry) {
      addUsage(entry, {
        id: `user:${user.id}:avatar:explicit`,
        entityType: 'user',
        entityId: user.id,
        entityName: user.displayName || user.handle || user.id,
        publicRoute: meta?.publicRoute ?? null,
        role: 'avatar',
        assignmentKind: 'explicit',
        isActiveOnSite: true,
      });
    }
  }

  // 3. Register all rows from public.media_assets table (including historical/extra or unlinked rows)
  for (const row of mediaAssetRows) {
    if (row.status === 'deleted') continue;
    const ownerMeta = ownerUuidToEntity.get(`${row.owner_type}:${row.owner_id}`);
    const url = getCloudflareImageUrl({
      externalId: row.external_id,
      variant: getMediaRule(row.role).defaultVariant,
    });
    const entry = ensureCanonical({
      url,
      externalId: row.external_id,
      role: row.role,
      status: row.status,
      titleHint: ownerMeta ? `${ownerMeta.entityName} — ${row.role}` : `Unlinked ${row.owner_type} ${row.role}`,
      altText: row.alt_text,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      targetRatio: row.target_ratio,
      aspectMode: row.aspect_mode,
      dbRecord: row,
    });
    if (!entry) continue;

    if (ownerMeta) {
      const hasActiveUsageOnSameEntityRole = entry.usages.some(
        (u) => u.entityType === ownerMeta.entityType && u.entityId === ownerMeta.entityId && u.role === row.role,
      );
      if (!hasActiveUsageOnSameEntityRole) {
        addUsage(entry, {
          id: `db:${row.id}`,
          entityType: ownerMeta.entityType,
          entityId: ownerMeta.entityId,
          entityName: ownerMeta.entityName,
          publicRoute: ownerMeta.publicRoute,
          role: row.role,
          assignmentKind: 'historical_extra',
          isActiveOnSite: false,
          note: 'Stored in media_assets but superseded by current entity image',
        });
      }
    }
  }

  // 4. Finalize CanonicalMediaAsset objects & compute duplicate groups
  const finalizedAssets: CanonicalMediaAsset[] = [];

  for (const entry of canonicalMap.values()) {
    const roles = Array.from(entry.roles);
    const primaryRole = roles[0] ?? 'hero';
    const primaryCategory = toPrimaryCategory(roles);
    const originalPreviewUrl = getOriginalPreviewUrlForAsset(entry.externalId, entry.primaryUrl, primaryRole);
    const thumbnailUrl = getThumbnailUrlForAsset(entry.externalId, entry.primaryUrl, primaryRole);
    const validation = validateExternalImageUrl(originalPreviewUrl);

    // Choose best title (prefer Host / Organization first, then Club / Brand / Series over Occurrence titles)
    const explicitHostOrClubUsage =
      entry.usages.find((u) => u.assignmentKind === 'explicit' && u.entityType === 'organization')
      ?? entry.usages.find(
        (u) => u.assignmentKind === 'explicit' && ['club_brand', 'club', 'resort', 'cruise_series', 'event_series'].includes(u.entityType),
      );
    const primaryUsage = explicitHostOrClubUsage ?? entry.usages[0];
    const roleTitleLabel =
      primaryCategory === 'logo'
        ? 'Official Logo'
        : primaryCategory === 'flyer'
          ? 'Event Flyer'
          : primaryCategory === 'hero'
            ? 'Hero Image'
            : primaryCategory === 'gallery'
              ? 'Gallery Image'
              : 'Media Asset';
    const title = primaryUsage
      ? `${primaryUsage.entityName} — ${roleTitleLabel}`
      : entry.titles[0] ?? `Unlinked ${roleTitleLabel}`;

    const filename =
      (entry.externalId && storedMeta[entry.externalId]?.originalFilename)
      || storedMeta[entry.canonicalId]?.originalFilename
      || inferFilenameFromUrl(originalPreviewUrl, entry.externalId, title);

    const contentHash =
      (entry.externalId && knownContentHashes[entry.externalId])
      || knownContentHashes[entry.canonicalId]
      || null;

    const visualHash =
      (entry.externalId && knownVisualHashes[entry.externalId])
      || knownVisualHashes[entry.canonicalId]
      || null;

    const fileSizeBytes =
      (entry.externalId && knownFileSizes[entry.externalId])
      || knownFileSizes[entry.canonicalId]
      || null;

    const activeUsages = entry.usages.filter((u) => u.isActiveOnSite);
    const explicitUsages = entry.usages.filter((u) => u.assignmentKind === 'explicit');
    const inheritedUsages = entry.usages.filter((u) => u.assignmentKind === 'inherited');
    const redundantCopies = entry.usages.filter((u) => u.assignmentKind === 'redundant_copy');

    const storageLocationLabel =
      entry.storageProvider === 'cloudflare_images'
        ? `Cloudflare Images (${entry.externalId?.slice(0, 12) ?? 'managed'})`
        : entry.storageProvider === 'static_local'
          ? `Local Static (${originalPreviewUrl})`
          : `External URL (${validation.host ?? 'remote'})`;

    const status: MediaStatus = entry.statuses.has('pending')
      ? 'pending'
      : entry.statuses.has('rejected')
        ? 'rejected'
        : entry.statuses.has('approved')
          ? 'approved'
          : 'ready';

    const hasDuplicateDbRecords = entry.dbRecords.length > 1;
    const hasRedundantEventCopies = redundantCopies.length > 0;
    const isUnlinkedOrOrphaned = activeUsages.length === 0;

    const statusBadges: AssetStatusBadge[] = [];
    if (activeUsages.length > 0) statusBadges.push('Linked');
    else statusBadges.push('Unlinked');

    if (activeUsages.length > 1) {
      statusBadges.push('Referenced by Multiple Listings');
    }
    if (!validation.valid) {
      statusBadges.push('Invalid URL');
    }
    if (hasDuplicateDbRecords || hasRedundantEventCopies) {
      statusBadges.push('Potential Duplicate');
    }

    finalizedAssets.push({
      canonicalId: entry.canonicalId,
      externalId: entry.externalId,
      storageProvider: entry.storageProvider,
      storageLocationLabel,
      originalPreviewUrl,
      thumbnailUrl,
      filename,
      title,
      altText: entry.altTexts[0] ?? title,
      primaryCategory,
      roles,
      status,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      targetRatio: entry.targetRatio,
      aspectMode: entry.aspectMode,
      fileType: inferFileTypeFromUrl(originalPreviewUrl, entry.storageProvider),
      fileSizeBytes,
      contentHash,
      visualHash,
      dbRecords: entry.dbRecords,
      usages: entry.usages,
      activeReferenceCount: activeUsages.length,
      explicitReferenceCount: explicitUsages.length,
      inheritedReferenceCount: inheritedUsages.length,
      redundantCopyCount: redundantCopies.length,
      isPlaceholder: isPlaceholderMediaUrl(originalPreviewUrl),
      isValidUrl: validation.valid,
      duplicateFlags: {
        hasDuplicateDbRecords,
        hasRedundantEventCopies,
        exactByteDuplicateGroupId: null,
        repeatedUrlGroupId: explicitUsages.length > 1 && entry.storageProvider === 'external_url' ? `url-dup:${entry.canonicalId}` : null,
        visualSimilarityGroupId: null,
        isUnlinkedOrOrphaned,
      },
      statusBadges,
    });
  }

  // 5. Group exact byte duplicates (by SHA-256 contentHash across distinct canonicalIds)
  const byContentHash = new Map<string, CanonicalMediaAsset[]>();
  for (const asset of finalizedAssets) {
    if (!asset.contentHash) continue;
    const list = byContentHash.get(asset.contentHash) ?? [];
    list.push(asset);
    byContentHash.set(asset.contentHash, list);
  }
  for (const [hash, group] of byContentHash.entries()) {
    if (group.length < 2) continue;
    const groupId = `sha256:${hash.slice(0, 12)}`;
    for (const asset of group) {
      asset.duplicateFlags.exactByteDuplicateGroupId = groupId;
      if (!asset.statusBadges.includes('Potential Duplicate')) {
        asset.statusBadges.push('Potential Duplicate');
      }
    }
  }

  // 6. Group visual similarity candidates (same visualHash OR same entity + multiple active/historical uploads in same role category)
  const byVisualKey = new Map<string, CanonicalMediaAsset[]>();
  for (const asset of finalizedAssets) {
    if (asset.visualHash) {
      const key = `vhash:${asset.visualHash}`;
      const list = byVisualKey.get(key) ?? [];
      list.push(asset);
      byVisualKey.set(key, list);
    }
  }
  // Also detect entities that have both an active asset and historical/extra assets for the same role
  const byEntityRoleHistory = new Map<string, CanonicalMediaAsset[]>();
  for (const asset of finalizedAssets) {
    for (const usage of asset.usages) {
      if (usage.entityType === 'user') continue;
      const key = `${usage.entityType}:${usage.entityId}:${usage.role}`;
      const list = byEntityRoleHistory.get(key) ?? [];
      if (!list.some((a) => a.canonicalId === asset.canonicalId)) {
        list.push(asset);
      }
      byEntityRoleHistory.set(key, list);
    }
  }
  for (const [key, group] of byVisualKey.entries()) {
    if (group.length < 2) continue;
    for (const asset of group) {
      asset.duplicateFlags.visualSimilarityGroupId = key;
      if (!asset.statusBadges.includes('Potential Duplicate')) {
        asset.statusBadges.push('Potential Duplicate');
      }
    }
  }

  // 7. Build Duplicate Review Groups
  const duplicateGroups: DuplicateReviewGroup[] = [];

  // 7a. Exact byte duplicates (SHA-256 match across distinct assets)
  for (const [hash, group] of byContentHash.entries()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => b.activeReferenceCount - a.activeReferenceCount);
    const recommended = sorted[0];
    duplicateGroups.push({
      id: `exact-bytes-${hash.slice(0, 12)}`,
      kind: 'exact_byte_duplicates',
      title: `Exact Byte Duplicates (${group.length} files)`,
      summary: `Multiple uploaded files share identical SHA-256 content hash (${hash.slice(0, 12)}…).`,
      canAutoRecommendCanonical: true,
      recommendedCanonicalId: recommended.canonicalId,
      assets: sorted,
      affectedUsages: sorted.flatMap((a) => a.usages),
      consequencesSummary: [
        `Consolidates ${group.length} identical physical uploads to canonical asset "${recommended.title}".`,
        `Migrates ${sorted.slice(1).reduce((acc, a) => acc + a.explicitReferenceCount, 0)} explicit entity reference(s) without breaking existing URLs.`,
        'Does not automatically delete source files from Cloudflare Images.',
      ],
    });
  }

  // 7b. Same-file duplicate DB records / Redundant event logo occurrence copies
  for (const asset of finalizedAssets) {
    if (asset.duplicateFlags.hasRedundantEventCopies || asset.duplicateFlags.hasDuplicateDbRecords) {
      const redundantUsages = asset.usages.filter((u) => u.assignmentKind === 'redundant_copy');
      duplicateGroups.push({
        id: `same-file-${asset.canonicalId}`,
        kind: 'duplicate_db_records',
        title: `${asset.title} — Redundant Records (${redundantUsages.length || asset.dbRecords.length})`,
        summary: redundantUsages.length > 0
          ? `${redundantUsages.length} event occurrence(s) store a redundant copy of this canonical host/series logo.`
          : `${asset.dbRecords.length} database records point to the same physical Cloudflare file (${asset.externalId ?? asset.canonicalId}).`,
        canAutoRecommendCanonical: true,
        recommendedCanonicalId: asset.canonicalId,
        assets: [asset],
        affectedUsages: redundantUsages.length > 0 ? redundantUsages : asset.usages,
        consequencesSummary: [
          redundantUsages.length > 0
            ? `Removes ${redundantUsages.length} redundant occurrence-level logo field(s) so those events cleanly inherit from ${asset.usages.find((u) => u.assignmentKind === 'explicit')?.entityName ?? 'their parent host'}.`
            : `Consolidates ${asset.dbRecords.length} duplicate database records onto canonical asset ${asset.externalId ?? asset.canonicalId}.`,
          'Public rendering remains identical because inheritance resolves the canonical parent logo.',
          'Source file is preserved.',
        ],
      });
    }
  }

  // 7c. Repeated external/storage URLs across multiple unrelated explicit entities
  for (const asset of finalizedAssets) {
    const explicitNonInherited = asset.usages.filter((u) => u.assignmentKind === 'explicit');
    if (explicitNonInherited.length > 1 && !asset.duplicateFlags.hasRedundantEventCopies) {
      duplicateGroups.push({
        id: `repeated-url-${asset.canonicalId}`,
        kind: 'repeated_storage_urls',
        title: `${asset.title} — Shared Across ${explicitNonInherited.length} Entities`,
        summary: `The same storage URL is explicitly assigned across ${explicitNonInherited.length} entities (${explicitNonInherited.map((u) => u.entityName).slice(0, 3).join(', ')}${explicitNonInherited.length > 3 ? '…' : ''}).`,
        canAutoRecommendCanonical: true,
        recommendedCanonicalId: asset.canonicalId,
        assets: [asset],
        affectedUsages: explicitNonInherited,
        consequencesSummary: [
          'Verifies whether this multi-entity reference is intentional canonical reuse (e.g. same brand/venue) or an accidental cross-listing copy.',
          'Allows keeping canonical linkage or reassigning individual listings.',
        ],
      });
    }
  }

  // 7d. Visual similarity / multi-revision review candidates (never auto-merged)
  for (const [key, group] of byEntityRoleHistory.entries()) {
    if (group.length < 2) continue;
    const [entityType, entityId, role] = key.split(':');
    const entityMeta = entityKeyToMeta.get(`${entityType}:${entityId}`);
    for (const asset of group) {
      if (!asset.duplicateFlags.visualSimilarityGroupId) {
        asset.duplicateFlags.visualSimilarityGroupId = `rev:${key}`;
      }
      if (!asset.statusBadges.includes('Potential Duplicate')) {
        asset.statusBadges.push('Potential Duplicate');
      }
    }
    const activeAsset = group.find((a) =>
      a.usages.some((u) => u.entityType === entityType && u.entityId === entityId && u.role === role && u.isActiveOnSite),
    ) ?? group[0];

    duplicateGroups.push({
      id: `visual-candidate-${key}`,
      kind: 'visual_similarity_candidates',
      title: `${entityMeta?.entityName ?? entityId} — Multiple ${role.toUpperCase()} Candidates (${group.length})`,
      summary: `Multiple ${role} uploads exist for ${entityMeta?.entityName ?? entityId}. Review side-by-side to distinguish intentional revisions from duplicate uploads.`,
      canAutoRecommendCanonical: false,
      recommendedCanonicalId: activeAsset.canonicalId,
      assets: group,
      affectedUsages: group.flatMap((a) => a.usages.filter((u) => u.entityId === entityId)),
      consequencesSummary: [
        'Visual/revision candidates are never merged automatically.',
        'Selecting a canonical asset updates the active entity reference while keeping historical revisions in the audit trail.',
      ],
    });
  }

  // 7e. Unused or orphaned assets
  const orphanedAssets = finalizedAssets.filter((a) => a.duplicateFlags.isUnlinkedOrOrphaned);
  if (orphanedAssets.length > 0) {
    duplicateGroups.push({
      id: 'unused-or-orphaned-assets',
      kind: 'unused_or_orphaned',
      title: `Unused / Superseded Uploads (${orphanedAssets.length})`,
      summary: `${orphanedAssets.length} uploaded asset(s) have no active public site reference (superseded by newer uploads or unlinked).`,
      canAutoRecommendCanonical: false,
      recommendedCanonicalId: null,
      assets: orphanedAssets,
      affectedUsages: orphanedAssets.flatMap((a) => a.usages),
      consequencesSummary: [
        'These assets are not currently displayed on any public page.',
        'You can reassign any of these assets to a listing or archive superseded records after review.',
      ],
    });
  }

  // 8. Detect Missing Asset Assignments across active entities
  const missingSlots: MissingMediaAssignmentSlot[] = [];
  for (const listing of listings) {
    if (listing.status !== 'approved') continue;
    const meta = entityKeyToMeta.get(`${listing.type}:${listing.id}`)!;
    if (listing.type === 'club') {
      const hasLogo = Boolean(resolveBrandLogo('club', listing.id, brandCatalog).url);
      const hasHero = Boolean(getListingPrimaryHeroUrl(listing));
      if (!hasLogo) {
        missingSlots.push({
          id: `missing:club:${listing.id}:logo`,
          entityType: 'club',
          entityId: listing.id,
          entityName: listing.name,
          publicRoute: meta.publicRoute,
          missingRole: 'logo',
          severity: 'warning',
          reason: 'Club is missing an official square logo.',
        });
      }
      if (!hasHero) {
        missingSlots.push({
          id: `missing:club:${listing.id}:hero`,
          entityType: 'club',
          entityId: listing.id,
          entityName: listing.name,
          publicRoute: meta.publicRoute,
          missingRole: 'hero',
          severity: 'warning',
          reason: 'Club is missing a wide hero header image.',
        });
      }
    } else {
      const hasFlyer = Boolean(getListingPrimaryFlyerUrl(listing));
      const hasHero = Boolean(getListingPrimaryHeroUrl(listing));
      const hasLogo = Boolean(resolveBrandLogo('event', listing.id, brandCatalog).url);
      if (!hasFlyer) {
        missingSlots.push({
          id: `missing:event:${listing.id}:flyer`,
          entityType: 'event',
          entityId: listing.id,
          entityName: listing.name,
          publicRoute: meta.publicRoute,
          missingRole: 'flyer',
          severity: hasHero ? 'info' : 'warning',
          reason: hasHero
            ? 'Event has a hero image but no dedicated event flyer (cards fall back to hero).'
            : 'Event has neither an event flyer nor a hero image (displaying fallback placeholder).',
        });
      }
      if (!hasLogo) {
        missingSlots.push({
          id: `missing:event:${listing.id}:logo`,
          entityType: 'event',
          entityId: listing.id,
          entityName: listing.name,
          publicRoute: meta.publicRoute,
          missingRole: 'logo',
          severity: 'info',
          reason: 'Neither event nor its host organization has an assigned logo.',
        });
      }
    }
  }

  for (const org of organizations) {
    if (org.status !== 'approved' && org.status !== 'active') continue;
    const isHostOrPromoter = org.displayTypes?.some((t) => ['host', 'promoter', 'producer', 'event_brand'].includes(t));
    if (!isHostOrPromoter) continue;
    const meta = entityKeyToMeta.get(`organization:${org.id}`);
    if (!org.logoImageUrl) {
      missingSlots.push({
        id: `missing:organization:${org.id}:logo`,
        entityType: 'organization',
        entityId: org.id,
        entityName: org.name,
        publicRoute: meta?.publicRoute ?? null,
        missingRole: 'logo',
        severity: 'warning',
        reason: 'Host/promoter profile has no canonical host logo for event inheritance.',
      });
    }
  }

  // Sort assets: active multi-ref first, then active, then newest
  finalizedAssets.sort((a, b) => {
    if ((a.activeReferenceCount > 0) !== (b.activeReferenceCount > 0)) {
      return a.activeReferenceCount > 0 ? -1 : 1;
    }
    if (a.activeReferenceCount !== b.activeReferenceCount) {
      return b.activeReferenceCount - a.activeReferenceCount;
    }
    return a.title.localeCompare(b.title);
  });

  const assetsById = new Map(finalizedAssets.map((a) => [a.canonicalId, a]));

  return {
    assets: finalizedAssets,
    assetsById,
    missingSlots,
    duplicateGroups,
    summary: {
      totalCanonicalAssets: finalizedAssets.length,
      linkedAssets: finalizedAssets.filter((a) => a.activeReferenceCount > 0).length,
      unlinkedAssets: finalizedAssets.filter((a) => a.activeReferenceCount === 0).length,
      multiReferencedAssets: finalizedAssets.filter((a) => a.activeReferenceCount > 1).length,
      inheritedEventUsages: finalizedAssets.reduce((sum, a) => sum + a.inheritedReferenceCount, 0),
      redundantEventLogoCopies: finalizedAssets.reduce((sum, a) => sum + a.redundantCopyCount, 0),
      duplicateCandidateGroups: duplicateGroups.length,
      missingEntitySlots: missingSlots.length,
      externalUrlAssets: finalizedAssets.filter((a) => a.storageProvider === 'external_url').length,
    },
  };
};

export const applyAssetAssignmentToListing = <T extends Listing>(
  listing: T,
  asset: {
    externalId?: string | null;
    originalPreviewUrl: string;
    title?: string;
  },
  role: 'logo' | 'hero' | 'flyer' | 'gallery',
  options: { explicitEventLogoOverride?: boolean } = {},
): T => {
  const extId = asset.externalId?.trim() || extractCloudflareExternalIdFromUrl(asset.originalPreviewUrl);
  const resolvedUrl = extId
    ? getCloudflareImageUrl({
        externalId: extId,
        variant: role === 'logo' ? 'logosquare' : role === 'flyer' ? 'flyercard' : role === 'gallery' ? 'gallerypage' : 'heropage',
      }) ?? asset.originalPreviewUrl
    : asset.originalPreviewUrl;

  const existingMediaAssets = [...(listing.mediaAssets ?? [])];
  let nextMediaAssets = existingMediaAssets;

  if (extId) {
    const rule = getMediaRule(role);
    const newRecord: MediaAsset = {
      id: `assigned-${listing.id}-${role}-${extId.slice(0, 8)}`,
      owner_type: listing.type,
      owner_id: getMediaOwnerId(listing.type, listing.id),
      role,
      storage_provider: 'cloudflare_images',
      external_id: extId,
      status: 'approved',
      aspect_mode: rule.aspectMode,
      target_ratio: rule.targetRatio,
      alt_text: asset.title ?? `${listing.name} ${role}`,
      sort_order: role === 'gallery' ? existingMediaAssets.filter((a) => a.role === 'gallery').length : 0,
    };
    nextMediaAssets = role === 'gallery'
      ? [...existingMediaAssets.filter((a) => !(a.role === 'gallery' && a.external_id === extId)), newRecord]
      : [...existingMediaAssets.filter((a) => a.role !== role), newRecord];
  } else if (role !== 'gallery') {
    nextMediaAssets = existingMediaAssets.filter((a) => a.role !== role);
  }

  if (listing.type === 'club') {
    const nextClub: ClubData = {
      ...listing,
      mediaAssets: nextMediaAssets,
      ...(role === 'logo' ? { logoImageUrl: resolvedUrl } : {}),
      ...(role === 'hero' ? { headerImageUrl: resolvedUrl } : {}),
      ...(role === 'gallery'
        ? { galleryImageUrls: Array.from(new Set([...(listing.galleryImageUrls ?? []), resolvedUrl])) }
        : {}),
    };
    return nextClub as T;
  }

  const nextEvent: EventData = {
    ...listing,
    mediaAssets: nextMediaAssets,
    ...(role === 'logo'
      ? {
          logoImageUrl: resolvedUrl,
          logoOverride: options.explicitEventLogoOverride ?? true,
        }
      : {}),
    ...(role === 'hero' ? { headerImageUrl: resolvedUrl } : {}),
    ...(role === 'flyer' ? { flyerImageUrl: resolvedUrl } : {}),
    ...(role === 'gallery'
      ? { galleryImageUrls: Array.from(new Set([...(listing.galleryImageUrls ?? []), resolvedUrl])) }
      : {}),
  };
  return nextEvent as T;
};

export const removeEventLogoOverrideFromListing = (event: EventData): EventData => {
  const nextEvent: EventData = {
    ...event,
    logoImageUrl: undefined,
    logoOverride: false,
    mediaAssets: (event.mediaAssets ?? []).filter((asset) => asset.role !== 'logo'),
  };
  delete nextEvent.logoImageUrl;
  return nextEvent;
};

export const previewDuplicateConsolidation = (
  group: DuplicateReviewGroup,
  chosenCanonicalId: string,
): ConsolidationPreview => {
  const canonicalAsset = group.assets.find((a) => a.canonicalId === chosenCanonicalId) ?? group.assets[0];
  const secondaryAssets = group.assets.filter((a) => a.canonicalId !== canonicalAsset.canonicalId);
  const affectedEntities: ConsolidationAffectedEntity[] = [];

  if (group.kind === 'duplicate_db_records' && canonicalAsset.duplicateFlags.hasRedundantEventCopies) {
    for (const usage of canonicalAsset.usages) {
      if (usage.assignmentKind === 'redundant_copy') {
        affectedEntities.push({
          entityType: usage.entityType,
          entityId: usage.entityId,
          entityName: usage.entityName,
          role: usage.role,
          previousUrl: canonicalAsset.originalPreviewUrl,
          nextUrl: canonicalAsset.originalPreviewUrl,
          action: 'removed_redundant_override',
        });
      }
    }
  } else {
    for (const sec of secondaryAssets) {
      for (const usage of sec.usages) {
        if (usage.assignmentKind === 'explicit' || usage.assignmentKind === 'redundant_copy') {
          affectedEntities.push({
            entityType: usage.entityType,
            entityId: usage.entityId,
            entityName: usage.entityName,
            role: usage.role,
            previousUrl: sec.originalPreviewUrl,
            nextUrl: canonicalAsset.originalPreviewUrl,
            action: 'migrated_reference',
          });
        }
      }
    }
  }

  const warnings: string[] = [];
  if (group.kind === 'visual_similarity_candidates') {
    warnings.push(
      'Visual similarity candidates may represent intentionally distinct date flyers or revisions. Verify each affected listing before confirming.',
    );
  }
  warnings.push('Underlying storage files will NOT be deleted automatically. A recoverable audit trail entry will be recorded.');

  return {
    groupId: group.id,
    kind: group.kind,
    canonicalAsset,
    secondaryAssets,
    affectedEntities,
    dbRecordsToArchiveCount: secondaryAssets.reduce((sum, a) => sum + a.dbRecords.length, 0),
    warnings,
  };
};
