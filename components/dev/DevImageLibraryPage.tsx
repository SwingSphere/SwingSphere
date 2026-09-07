import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CircleHelp, Eye, ExternalLink, ImageOff, RefreshCw, Search, ShieldAlert, Trash2, Upload, UserRound, X } from 'lucide-react';
import * as api from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { getCloudflareImageUrl } from '../../lib/media/getCloudflareImageUrl';
import { getMediaOwnerId } from '../../lib/media/getMediaOwnerId';
import { isPlaceholderMediaUrl } from '../../lib/entityBrandMedia';
import { getMediaRule, MEDIA_OWNER_TYPES, MEDIA_ROLES } from '../../lib/media/mediaRules';
import type { MediaAsset, MediaOwnerType, MediaRole, MediaStatus } from '../../lib/media/types';
import MediaUploader from '../media/MediaUploader';

type ImageSource = 'media_asset' | 'legacy_url';
type ImageUsage = 'current' | 'extra' | 'unresolved';

type ImageRecord = {
  id: string;
  ownerType: MediaOwnerType;
  ownerId: string;
  ownerName: string;
  storageOwnerId?: string;
  role: MediaRole;
  roleLabel: string;
  url: string | null;
  source: ImageSource;
  status?: MediaStatus;
  mediaAssetId?: string;
  externalId?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  uploaderName?: string;
  altText?: string | null;
  sortOrder?: number;
  aspectMode?: 'contain' | 'cover';
  targetRatio?: string | null;
  focalPointX?: number | null;
  focalPointY?: number | null;
  isCurrent: boolean;
  currentReason?: string;
  ownerResolved: boolean;
  usage: ImageUsage;
  ownerRoleCount: number;
  exactDuplicateCount: number;
  currentConflict: boolean;
};

type LegacyMediaEntity = {
  id: string;
  type: Exclude<MediaOwnerType, 'user'>;
  name: string;
  logoImageUrl?: string;
  headerImageUrl?: string;
  galleryImageUrls?: string[];
  mediaAssets?: MediaAsset[];
};

type LoadResult = {
  images: ImageRecord[];
  warnings: string[];
};

type ImageDimensions = {
  width: number;
  height: number;
  source: 'source' | 'delivery';
};

type QuickView = 'all' | 'needs_attention' | 'pending_review';
type ModerationFilter = 'all' | MediaStatus | 'legacy';
type AttentionTone = 'amber' | 'red' | 'violet';
type AttentionReason = {
  key: string;
  label: string;
  detail: string;
  tone: AttentionTone;
};

const PAGE_SIZE = 60;

const ownerLabels: Record<MediaOwnerType, string> = {
  club: 'Club',
  club_brand: 'Club brand',
  venue: 'Venue',
  event: 'Event',
  organization: 'Organization',
  event_series: 'Event series',
  resort: 'Resort',
  cruise_series: 'Cruise series',
  cruise_sailing: 'Cruise sailing',
  user: 'User profile',
};

const roleLabels: Record<MediaRole, string> = {
  logo: 'Logo',
  avatar: 'Avatar',
  hero: 'Hero',
  cover: 'Cover',
  flyer: 'Flyer',
  gallery: 'Gallery',
};

const isNonEmptyUrl = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());

const addLegacyEntityImages = (target: ImageRecord[], entity: LegacyMediaEntity) => {
  const add = (role: MediaRole, value: unknown, suffix: string) => {
    if (!isNonEmptyUrl(value)) return;
    target.push({
      id: `legacy:${entity.type}:${entity.id}:${suffix}:${value}`,
      ownerType: entity.type,
      ownerId: entity.id,
      ownerName: entity.name,
      role,
      roleLabel: roleLabels[role],
      url: value.trim(),
      source: 'legacy_url',
      isCurrent: true,
      currentReason: 'Current entity field',
      ownerResolved: true,
      usage: 'current',
      ownerRoleCount: 1,
      exactDuplicateCount: 1,
      currentConflict: false,
    });
  };

  add('logo', entity.logoImageUrl, 'logo');
  add('hero', entity.headerImageUrl, 'header');
  (entity.galleryImageUrls ?? []).forEach((url, index) => add('gallery', url, `gallery-${index}`));
};

const loadImageLibrary = async (): Promise<LoadResult> => {
  const warnings: string[] = [];
  const images: ImageRecord[] = [];

  const [
    listingsResult,
    usersResult,
    venuesResult,
    eventSeriesResult,
    organizationsResult,
    clubBrandsResult,
    resortsResult,
    cruiseSeriesResult,
    cruiseSailingsResult,
    mediaAssetsResult,
  ] = await Promise.allSettled([
    api.getListings(),
    api.getUsers(),
    api.getVenues(),
    api.getEventSeries(),
    api.getOrganizations(),
    api.getClubBrands(),
    api.getResorts(),
    api.getCruiseSeries(),
    api.getCruiseSailings(),
    supabase
      .from('media_assets')
      .select('id, owner_type, owner_id, role, storage_provider, external_id, status, aspect_mode, target_ratio, alt_text, sort_order, focal_point_x, focal_point_y, created_by, created_at, updated_at')
      .order('updated_at', { ascending: false }),
  ]);

  const entityIdentities = new Map<string, { id: string; name: string }>();
  const attachedAssetIds = new Set<string>();
  const registerEntity = (entity: { type: MediaOwnerType; id: string; name: string; mediaAssets?: MediaAsset[] }) => {
    const identity = { id: entity.id, name: entity.name };
    entityIdentities.set(`${entity.type}:${entity.id}`, identity);
    entityIdentities.set(`${entity.type}:${getMediaOwnerId(entity.type, entity.id)}`, identity);
    (entity.mediaAssets ?? []).forEach((asset) => attachedAssetIds.add(asset.id));
  };

  const registerCollection = <T extends { type: MediaOwnerType; id: string; name: string }>(
    result: PromiseSettledResult<T[]>,
    label: string,
  ): T[] => {
    if (result.status === 'rejected') {
      warnings.push(`${label}: ${result.reason instanceof Error ? result.reason.message : 'failed to load'}`);
      return [];
    }
    result.value.forEach(registerEntity);
    return result.value;
  };

  const listings = registerCollection(listingsResult, 'Listings');
  const venues = registerCollection(venuesResult, 'Venues');
  const eventSeries = registerCollection(eventSeriesResult, 'Event series');
  const organizations = registerCollection(organizationsResult, 'Organizations');
  const clubBrands = registerCollection(clubBrandsResult, 'Club brands');
  const resorts = registerCollection(resortsResult, 'Resorts');
  const cruiseSeries = registerCollection(cruiseSeriesResult, 'Cruise series');
  const cruiseSailings = registerCollection(cruiseSailingsResult, 'Cruise sailings');

  const users = usersResult.status === 'fulfilled' ? usersResult.value : [];
  if (usersResult.status === 'rejected') {
    warnings.push(`User profiles: ${usersResult.reason instanceof Error ? usersResult.reason.message : 'failed to load'}`);
  }
  const userNames = new Map(users.map((user) => [user.id, user.displayName || user.handle || user.id] as const));
  users.forEach((user) => {
    const name = userNames.get(user.id) ?? user.id;
    const identity = { id: user.id, name };
    entityIdentities.set(`user:${user.id}`, identity);
    entityIdentities.set(`user:${getMediaOwnerId('user', user.id)}`, identity);
  });

  [
    ...listings,
    ...venues,
    ...eventSeries,
    ...organizations,
    ...clubBrands,
    ...resorts,
    ...cruiseSeries,
    ...cruiseSailings,
  ].forEach((entity) => addLegacyEntityImages(images, entity as LegacyMediaEntity));

  users.forEach((user) => {
    if (!isNonEmptyUrl(user.avatarUrl)) return;
    images.push({
      id: `legacy:user:${user.id}:avatar:${user.avatarUrl}`,
      ownerType: 'user',
      ownerId: user.id,
      ownerName: user.displayName || user.handle || user.id,
      role: 'avatar',
      roleLabel: roleLabels.avatar,
      url: user.avatarUrl.trim(),
      source: 'legacy_url',
      isCurrent: true,
      currentReason: 'Current profile field',
      ownerResolved: true,
      usage: 'current',
      ownerRoleCount: 1,
      exactDuplicateCount: 1,
      currentConflict: false,
    });
  });

  if (mediaAssetsResult.status === 'rejected') {
    warnings.push(`Canonical media: ${mediaAssetsResult.reason instanceof Error ? mediaAssetsResult.reason.message : 'failed to load'}`);
  } else if (mediaAssetsResult.value.error) {
    warnings.push(`Canonical media: ${mediaAssetsResult.value.error.message}`);
  } else {
    const mediaAssets = (mediaAssetsResult.value.data ?? []) as MediaAsset[];
    const latestApprovedProfileAssetIds = new Set<string>();
    const seenProfileRoles = new Set<string>();

    [...mediaAssets]
      .filter((asset) => asset.owner_type === 'user' && asset.status === 'approved' && (asset.role === 'avatar' || asset.role === 'hero'))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .forEach((asset) => {
        const key = `${asset.owner_id}:${asset.role}`;
        if (seenProfileRoles.has(key)) return;
        seenProfileRoles.add(key);
        latestApprovedProfileAssetIds.add(asset.id);
      });

    mediaAssets.forEach((asset) => {
      const rule = getMediaRule(asset.role);
      const url = getCloudflareImageUrl({ externalId: asset.external_id, variant: rule.defaultVariant });
      const ownerKey = `${asset.owner_type}:${asset.owner_id}`;
      const resolvedOwner = entityIdentities.get(ownerKey);
      const isAttached = attachedAssetIds.has(asset.id);
      const isProfileDisplayAsset = latestApprovedProfileAssetIds.has(asset.id);
      images.push({
        id: `asset:${asset.id}`,
        ownerType: asset.owner_type,
        ownerId: resolvedOwner?.id ?? asset.owner_id,
        ownerName: resolvedOwner?.name ?? asset.owner_id,
        storageOwnerId: asset.owner_id,
        role: asset.role,
        roleLabel: roleLabels[asset.role],
        url,
        source: 'media_asset',
        status: asset.status,
        mediaAssetId: asset.id,
        externalId: asset.external_id,
        createdAt: asset.created_at,
        updatedAt: asset.updated_at,
        createdBy: asset.created_by ?? undefined,
        uploaderName: asset.created_by ? userNames.get(asset.created_by) ?? undefined : undefined,
        altText: asset.alt_text,
        sortOrder: asset.sort_order,
        aspectMode: asset.aspect_mode,
        targetRatio: asset.target_ratio,
        focalPointX: asset.focal_point_x,
        focalPointY: asset.focal_point_y,
        isCurrent: isAttached || isProfileDisplayAsset,
        currentReason: isAttached ? 'Attached to current entity record' : isProfileDisplayAsset ? 'Newest approved profile media' : undefined,
        ownerResolved: Boolean(resolvedOwner),
        usage: isAttached || isProfileDisplayAsset ? 'current' : 'unresolved',
        ownerRoleCount: 1,
        exactDuplicateCount: 1,
        currentConflict: false,
      });
    });
  }

  // Canonical Cloudflare URLs are also written into some current entity fields.
  // Collapse that field reference into the canonical card and mark the asset current.
  const canonicalByOwnerRoleUrl = new Map<string, ImageRecord[]>();
  images.filter((image) => image.source === 'media_asset' && image.url).forEach((image) => {
    const key = `${image.ownerType}|${image.ownerId}|${image.role}|${image.url}`;
    const group = canonicalByOwnerRoleUrl.get(key) ?? [];
    group.push(image);
    canonicalByOwnerRoleUrl.set(key, group);
  });

  const collapsed = images.filter((image) => {
    if (image.source !== 'legacy_url' || !image.url) return true;
    const key = `${image.ownerType}|${image.ownerId}|${image.role}|${image.url}`;
    const canonicalMatches = canonicalByOwnerRoleUrl.get(key);
    if (!canonicalMatches?.length) return true;
    const canonical = canonicalMatches[0];
    canonical.isCurrent = true;
    canonical.usage = 'current';
    canonical.currentReason = canonical.currentReason ?? 'Current entity field points to this asset';
    return false;
  });

  const ownerRoleGroups = new Map<string, ImageRecord[]>();
  collapsed.forEach((image) => {
    const key = `${image.ownerType}|${image.ownerId}|${image.role}`;
    const group = ownerRoleGroups.get(key) ?? [];
    group.push(image);
    ownerRoleGroups.set(key, group);
  });

  ownerRoleGroups.forEach((group) => {
    const currentCount = group.filter((image) => image.isCurrent).length;
    const hasCurrent = currentCount > 0;
    const referenceCounts = new Map<string, number>();
    group.forEach((image) => {
      const signature = image.externalId ? `cf:${image.externalId}` : `url:${image.url ?? image.id}`;
      referenceCounts.set(signature, (referenceCounts.get(signature) ?? 0) + 1);
    });
    group.forEach((image) => {
      const signature = image.externalId ? `cf:${image.externalId}` : `url:${image.url ?? image.id}`;
      image.ownerRoleCount = group.length;
      image.exactDuplicateCount = referenceCounts.get(signature) ?? 1;
      image.currentConflict = currentCount > 1;
      if (!image.isCurrent) image.usage = hasCurrent ? 'extra' : 'unresolved';
    });
  });

  return {
    images: collapsed.sort((a, b) => {
      const nameCompare = a.ownerName.localeCompare(b.ownerName);
      if (nameCompare !== 0) return nameCompare;
      if (a.role !== b.role) return a.role.localeCompare(b.role);
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return new Date(b.createdAt ?? b.updatedAt ?? 0).getTime() - new Date(a.createdAt ?? a.updatedAt ?? 0).getTime();
    }),
    warnings,
  };
};

const formatAssetDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

const getApiError = async (response: Response) => {
  const text = await response.text().catch(() => '');
  if (!text) return `Request failed with status ${response.status}.`;
  try {
    const parsed = JSON.parse(text);
    return parsed.error || parsed.message || text;
  } catch {
    return text;
  }
};

const getMediaAuditUrl = (image: ImageRecord) => {
  if (image.externalId) {
    return getCloudflareImageUrl({ externalId: image.externalId, variant: 'public', fallback: image.url });
  }
  return image.url;
};

const isPlaceholderRecord = (image: ImageRecord) => Boolean(image.url && isPlaceholderMediaUrl(image.url));

const mediaQaTargets: Record<MediaRole, { width: number; height: number; label: string }> = {
  logo: { width: 384, height: 384, label: '384×384 contain' },
  avatar: { width: 384, height: 384, label: '384×384 cover' },
  hero: { width: 1280, height: 720, label: '1280×720 cover' },
  cover: { width: 1280, height: 427, label: '1280×427 cover' },
  flyer: { width: 1080, height: 1350, label: '1080×1350 contain' },
  gallery: { width: 1280, height: 960, label: '1280×960 cover' },
};

const getMediaQa = (role: MediaRole, dimensions?: ImageDimensions) => {
  if (!dimensions) return null;
  const target = mediaQaTargets[role];
  const rule = getMediaRule(role);
  const widthScale = target.width / Math.max(1, dimensions.width);
  const heightScale = target.height / Math.max(1, dimensions.height);
  const requiredUpscale = rule.aspectMode === 'contain'
    ? Math.min(widthScale, heightScale)
    : Math.max(widthScale, heightScale);
  const resolution = requiredUpscale <= 0.75 ? 'Excellent' : requiredUpscale <= 1 ? 'Good' : requiredUpscale <= 1.35 ? 'Usable but small' : 'Too small';
  const resolutionTone = requiredUpscale <= 1 ? 'good' : requiredUpscale <= 1.35 ? 'warn' : 'bad';
  const ratio = dimensions.width / Math.max(1, dimensions.height);
  const shape = role === 'logo'
    ? ratio >= 2.5 ? 'Wide · width-limited' : ratio > 1.25 ? 'Wide · width-limited' : ratio <= 0.4 ? 'Very tall' : ratio < 0.8 ? 'Tall' : 'Square-ish'
    : null;
  const shapeTone = role === 'logo' && ratio <= 0.4 ? 'warn' : 'good';
  return { resolution, resolutionTone, shape, shapeTone, targetLabel: target.label, requiredUpscale } as const;
};

const getAttentionReasons = (
  image: ImageRecord,
  broken: boolean,
  dimensions?: ImageDimensions,
): AttentionReason[] => {
  const reasons: AttentionReason[] = [];
  if (isPlaceholderRecord(image)) reasons.push({ key: 'placeholder', label: 'Placeholder', detail: 'Known temporary placeholder media is still referenced.', tone: 'amber' });
  if (image.usage === 'extra') reasons.push({ key: 'extra', label: 'Extra upload', detail: 'Another image is currently selected for this owner and role.', tone: 'amber' });
  if (image.exactDuplicateCount > 1) reasons.push({ key: 'duplicate', label: 'Duplicate ref', detail: 'Multiple records point to the same underlying image reference.', tone: 'violet' });
  if (image.usage === 'unresolved' || !image.ownerResolved) reasons.push({ key: 'unresolved', label: 'Unresolved', detail: 'SwingSphere cannot confidently match this media to a current owner state.', tone: 'violet' });
  if (image.currentConflict) reasons.push({ key: 'conflict', label: 'Multiple current refs', detail: 'More than one image is claiming to be current for the same owner and role.', tone: 'red' });
  if (broken) reasons.push({ key: 'broken', label: 'Broken', detail: 'The image failed to load in the current browser session.', tone: 'red' });
  if (image.status === 'pending_review') reasons.push({ key: 'pending', label: 'Pending review', detail: 'Canonical media is waiting for an administrator moderation decision.', tone: 'amber' });
  if (image.status === 'rejected') reasons.push({ key: 'rejected', label: 'Rejected', detail: 'This canonical asset has been rejected but remains in media history.', tone: 'red' });
  const mediaQa = getMediaQa(image.role, dimensions);
  if (mediaQa?.resolutionTone === 'warn') reasons.push({ key: 'small', label: `Small ${image.roleLabel.toLowerCase()}`, detail: `The detected resolution is usable but requires some upscaling to reach SwingSphere's ${mediaQa.targetLabel} target.`, tone: 'amber' });
  if (mediaQa?.resolutionTone === 'bad') reasons.push({ key: 'too-small', label: `Low-res ${image.roleLabel.toLowerCase()}`, detail: `The detected resolution requires significant upscaling to reach SwingSphere's ${mediaQa.targetLabel} target and may look soft.`, tone: 'red' });
  return reasons;
};

const getRoleUsageDescription = (image: ImageRecord) => {
  const roleUse: Record<MediaRole, string> = {
    logo: 'Feeds identity treatments such as detail headers, discovery cards, sidebars, and other surfaces that request the current logo.',
    avatar: 'Feeds member/profile identity surfaces that request the current avatar.',
    hero: 'Feeds hero and background presentation where the current hero image is requested.',
    cover: 'Feeds wide cover or banner presentation where supported.',
    flyer: 'Feeds event-flyer presentation and flyer previews.',
    gallery: 'Feeds gallery rails, media collections, and gallery previews.',
  };
  return roleUse[image.role];
};

const attentionToneClass: Record<AttentionTone, string> = {
  amber: 'border-amber-300/20 bg-amber-300/[0.07] text-amber-200',
  red: 'border-red-400/20 bg-red-400/[0.07] text-red-300',
  violet: 'border-violet-400/20 bg-violet-400/[0.07] text-violet-300',
};

const replaceOwnerLogo = async (image: ImageRecord, asset: MediaAsset) => {
  const logoImageUrl = getCloudflareImageUrl({ externalId: asset.external_id, variant: 'logosquare' });
  if (!logoImageUrl) throw new Error('The replacement uploaded, but SwingSphere could not build its Cloudflare delivery URL.');

  if (image.ownerType === 'club' || image.ownerType === 'event') {
    const listings = await api.getListings();
    const owner = listings.find((item) => item.id === image.ownerId);
    if (!owner) throw new Error(`Could not reload ${image.ownerName} before attaching the replacement logo.`);
    const mediaAssets = [...(owner.mediaAssets ?? []).filter((item) => item.role !== 'logo'), asset];
    if (owner.type === 'club') {
      await api.saveClub({ ...owner, logoImageUrl, mediaAssets }, { requirePersistence: true });
    } else {
      await api.saveEvent({ ...owner, logoImageUrl, mediaAssets });
    }
    return;
  }

  if (image.ownerType === 'user' || image.ownerType === 'cruise_sailing') {
    throw new Error(`Logo replacement is not supported for ${ownerLabels[image.ownerType].toLowerCase()} records.`);
  }

  const loaders = {
    venue: api.getVenues,
    organization: api.getOrganizations,
    event_series: api.getEventSeries,
    club_brand: api.getClubBrands,
    resort: api.getResorts,
    cruise_series: api.getCruiseSeries,
  } as const;
  const savers = {
    venue: api.saveVenue,
    organization: api.saveOrganization,
    event_series: api.saveEventSeries,
    club_brand: api.saveClubBrand,
    resort: api.saveResort,
    cruise_series: api.saveCruiseSeries,
  } as const;

  const ownerType = image.ownerType as keyof typeof loaders;
  const owners = await loaders[ownerType]();
  const owner = owners.find((item: { id: string }) => item.id === image.ownerId);
  if (!owner) throw new Error(`Could not reload ${image.ownerName} before attaching the replacement logo.`);
  await (savers[ownerType] as (value: any) => Promise<unknown>)({ ...owner, logoImageUrl });
};

const clearPlaceholderReference = async (image: ImageRecord) => {
  if (!image.url || image.source !== 'legacy_url' || !isPlaceholderMediaUrl(image.url)) {
    throw new Error('This image is not a removable placeholder URL reference.');
  }
  if (image.ownerType === 'user') {
    throw new Error('Profile placeholder cleanup is not supported from this dev tool yet.');
  }

  const clearFields = <T extends Record<string, any>>(owner: T): T => {
    if (image.role === 'logo') return { ...owner, logoImageUrl: undefined };
    if (image.role === 'hero' || image.role === 'cover') return { ...owner, headerImageUrl: undefined };
    if (image.role === 'gallery') {
      return {
        ...owner,
        galleryImageUrls: (owner.galleryImageUrls ?? []).filter((url: string) => url !== image.url),
      };
    }
    return owner;
  };

  if (image.ownerType === 'club' || image.ownerType === 'event') {
    const listings = await api.getListings();
    const owner = listings.find((item) => item.id === image.ownerId);
    if (!owner) throw new Error(`Could not reload ${image.ownerName} before clearing its placeholder.`);
    const next = clearFields(owner);
    if (owner.type === 'club') {
      await api.saveClub(next as typeof owner, { requirePersistence: true });
    } else {
      await api.saveEvent(next as typeof owner);
    }
    return;
  }

  const loaders = {
    venue: api.getVenues,
    organization: api.getOrganizations,
    event_series: api.getEventSeries,
    club_brand: api.getClubBrands,
    resort: api.getResorts,
    cruise_series: api.getCruiseSeries,
    cruise_sailing: api.getCruiseSailings,
  } as const;
  const savers = {
    venue: api.saveVenue,
    organization: api.saveOrganization,
    event_series: api.saveEventSeries,
    club_brand: api.saveClubBrand,
    resort: api.saveResort,
    cruise_series: api.saveCruiseSeries,
    cruise_sailing: api.saveCruiseSailing,
  } as const;

  const ownerType = image.ownerType as keyof typeof loaders;
  const owners = await loaders[ownerType]();
  const owner = owners.find((item: { id: string }) => item.id === image.ownerId);
  if (!owner) throw new Error(`Could not reload ${image.ownerName} before clearing its placeholder.`);
  await (savers[ownerType] as (value: any) => Promise<unknown>)(clearFields(owner as Record<string, any>));
};

const DevImageLibraryPage: React.FC = () => {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState('');
  const [ownerType, setOwnerType] = useState<'all' | MediaOwnerType>('all');
  const [role, setRole] = useState<'all' | MediaRole>('all');
  const [source, setSource] = useState<'all' | ImageSource>('all');
  const [usage, setUsage] = useState<'all' | ImageUsage | 'exact_duplicate' | 'placeholder'>('all');
  const [moderationFilter, setModerationFilter] = useState<ModerationFilter>('all');
  const [quickView, setQuickView] = useState<QuickView>('all');
  const [brokenOnly, setBrokenOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ImageRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [cleanupNotice, setCleanupNotice] = useState('');
  const [dimensionsById, setDimensionsById] = useState<Record<string, ImageDimensions>>({});
  const [replacementBusyId, setReplacementBusyId] = useState<string | null>(null);
  const [replacementError, setReplacementError] = useState('');
  const [placeholderTarget, setPlaceholderTarget] = useState<ImageRecord | null>(null);
  const [clearingPlaceholder, setClearingPlaceholder] = useState(false);
  const [placeholderError, setPlaceholderError] = useState('');
  const [detailsTarget, setDetailsTarget] = useState<ImageRecord | null>(null);
  const [moderationBusyId, setModerationBusyId] = useState<string | null>(null);
  const [moderationError, setModerationError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadImageLibrary()
      .then((result) => {
        if (!active) return;
        setImages(result.images);
        setWarnings(result.warnings);
        setBrokenIds(new Set());
      })
      .catch((error) => {
        if (!active) return;
        setImages([]);
        setWarnings([error instanceof Error ? error.message : 'Image library failed to load.']);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return images.filter((image) => {
      const broken = brokenIds.has(image.id) || !image.url;
      const attentionReasons = getAttentionReasons(image, broken, dimensionsById[image.id]);
      if (ownerType !== 'all' && image.ownerType !== ownerType) return false;
      if (role !== 'all' && image.role !== role) return false;
      if (source !== 'all' && image.source !== source) return false;
      if (moderationFilter === 'legacy' && image.source !== 'legacy_url') return false;
      if (moderationFilter !== 'all' && moderationFilter !== 'legacy' && image.status !== moderationFilter) return false;
      if (usage === 'exact_duplicate' && image.exactDuplicateCount <= 1) return false;
      if (usage === 'placeholder' && !isPlaceholderRecord(image)) return false;
      if (usage !== 'all' && usage !== 'exact_duplicate' && usage !== 'placeholder' && image.usage !== usage) return false;
      if (quickView === 'needs_attention' && attentionReasons.length === 0) return false;
      if (quickView === 'pending_review' && image.status !== 'pending_review') return false;
      if (brokenOnly && !broken) return false;
      if (!normalizedQuery) return true;
      return [image.ownerName, image.ownerId, image.storageOwnerId, image.ownerType, image.role, image.url, image.externalId, image.mediaAssetId, image.currentReason, image.usage, image.status, image.uploaderName, image.createdBy]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [brokenIds, brokenOnly, dimensionsById, images, moderationFilter, ownerType, query, quickView, role, source, usage]);

  useEffect(() => {
    setPage(1);
  }, [brokenOnly, moderationFilter, ownerType, query, quickView, role, source, usage]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const currentCount = images.filter((image) => image.isCurrent).length;
  const extraCount = images.filter((image) => image.usage === 'extra').length;
  const exactDuplicateCount = images.filter((image) => image.exactDuplicateCount > 1).length;
  const placeholderCount = images.filter(isPlaceholderRecord).length;
  const unresolvedCount = images.filter((image) => image.usage === 'unresolved' || !image.ownerResolved).length;
  const pendingReviewCount = images.filter((image) => image.status === 'pending_review').length;
  const needsAttentionCount = images.filter((image) => getAttentionReasons(image, brokenIds.has(image.id) || !image.url, dimensionsById[image.id]).length > 0).length;
  const brokenVisibleCount = visible.filter((image) => brokenIds.has(image.id) || !image.url).length;
  const visibleMediaAuditKey = visible
    .filter((image) => image.url)
    .map((image) => `${image.id}:${image.externalId ?? image.url}`)
    .join('|');

  useEffect(() => {
    let cancelled = false;
    const candidates = visible.filter((image) => image.url && !dimensionsById[image.id]);
    candidates.forEach((image) => {
      const auditUrl = getMediaAuditUrl(image);
      if (!auditUrl || !image.url) return;
      const probe = new Image();
      const record = (source: ImageDimensions['source']) => {
        if (cancelled || !probe.naturalWidth || !probe.naturalHeight) return;
        setDimensionsById((current) => current[image.id]
          ? current
          : { ...current, [image.id]: { width: probe.naturalWidth, height: probe.naturalHeight, source } });
      };
      probe.onload = () => record(auditUrl === image.url ? 'delivery' : 'source');
      probe.onerror = () => {
        if (auditUrl === image.url) return;
        const fallback = new Image();
        fallback.onload = () => {
          if (cancelled || !fallback.naturalWidth || !fallback.naturalHeight) return;
          setDimensionsById((current) => current[image.id]
            ? current
            : { ...current, [image.id]: { width: fallback.naturalWidth, height: fallback.naturalHeight, source: 'delivery' } });
        };
        fallback.src = image.url!;
      };
      probe.src = auditUrl;
    });
    return () => {
      cancelled = true;
    };
  }, [visibleMediaAuditKey]);

  const handleLogoUploaded = async (image: ImageRecord, asset: MediaAsset) => {
    setReplacementBusyId(image.id);
    setReplacementError('');
    try {
      await replaceOwnerLogo(image, asset);
      setCleanupNotice(`Updated the current logo for ${image.ownerName}. The previous logo is still preserved as an extra upload until you choose to remove it.`);
      setDimensionsById((current) => {
        const next = { ...current };
        delete next[image.id];
        return next;
      });
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setReplacementError(error instanceof Error ? error.message : 'The replacement logo uploaded but could not be attached to the entity.');
      setRefreshKey((value) => value + 1);
    } finally {
      setReplacementBusyId(null);
    }
  };

  const requestPlaceholderClear = (image: ImageRecord) => {
    if (!image.isCurrent || image.source !== 'legacy_url' || !isPlaceholderRecord(image) || image.ownerType === 'user') return;
    setPlaceholderError('');
    setPlaceholderTarget(image);
  };

  const confirmPlaceholderClear = async () => {
    if (!placeholderTarget || clearingPlaceholder) return;
    setClearingPlaceholder(true);
    setPlaceholderError('');
    try {
      await clearPlaceholderReference(placeholderTarget);
      setCleanupNotice(`Cleared the placeholder ${placeholderTarget.roleLabel.toLowerCase()} reference from ${placeholderTarget.ownerName}. No Cloudflare image was deleted.`);
      setPlaceholderTarget(null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setPlaceholderError(error instanceof Error ? error.message : 'Placeholder cleanup failed.');
    } finally {
      setClearingPlaceholder(false);
    }
  };

  const handleModeration = async (image: ImageRecord, nextStatus: MediaStatus) => {
    if (!image.mediaAssetId || moderationBusyId) return;
    if ((nextStatus === 'rejected' || nextStatus === 'archived') && image.isCurrent) {
      setModerationError(`Replace or remove the current reference before marking this asset ${nextStatus.replace('_', ' ')}. This prevents non-approved media from remaining visibly attached.`);
      return;
    }
    setModerationBusyId(image.id);
    setModerationError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Your admin session has expired. Sign in again before moderating media.');
      const response = await fetch('/api/media/moderate-asset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ assetId: image.mediaAssetId, status: nextStatus }),
      });
      if (!response.ok) throw new Error(await getApiError(response));
      setImages((current) => current.map((item) => item.id === image.id ? { ...item, status: nextStatus } : item));
      setDetailsTarget((current) => current?.id === image.id ? { ...current, status: nextStatus } : current);
      setCleanupNotice(`${image.ownerName} ${image.roleLabel.toLowerCase()} marked ${nextStatus.replace('_', ' ')}. The moderation change was recorded in the admin audit log.`);
    } catch (error) {
      setModerationError(error instanceof Error ? error.message : 'Media moderation failed.');
    } finally {
      setModerationBusyId(null);
    }
  };

  const requestDelete = (image: ImageRecord) => {
    if (image.isCurrent || image.source !== 'media_asset' || !image.mediaAssetId || !image.externalId) return;
    setDeleteError('');
    setDeleteTarget(image);
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.mediaAssetId || !deleteTarget.externalId || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Your admin session has expired. Sign in again before deleting media.');
      const response = await fetch('/api/media/delete-asset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          assetId: deleteTarget.mediaAssetId,
          externalId: deleteTarget.externalId,
        }),
      });
      if (!response.ok) throw new Error(await getApiError(response));
      const result = await response.json();
      setCleanupNotice(result.cleanupWarning
        ? `Removed the unused ${deleteTarget.roleLabel.toLowerCase()} record for ${deleteTarget.ownerName}, but Cloudflare cleanup could not be confirmed: ${result.cleanupWarning}`
        : result.retainedCloudflareImage
          ? `Removed the redundant ${deleteTarget.roleLabel.toLowerCase()} reference for ${deleteTarget.ownerName}. The shared Cloudflare image was kept because another media record still uses it.`
          : `Deleted the unused ${deleteTarget.roleLabel.toLowerCase()} for ${deleteTarget.ownerName} from SwingSphere and Cloudflare Images.`);
      setDeleteTarget(null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Media deletion failed.');
    } finally {
      setDeleting(false);
    }
  };

  const resetFilters = () => {
    setQuery('');
    setOwnerType('all');
    setRole('all');
    setSource('all');
    setUsage('all');
    setModerationFilter('all');
    setQuickView('all');
    setBrokenOnly(false);
  };

  const applySummaryFilter = (kind: 'current' | 'placeholder' | 'extra' | 'duplicate' | 'unresolved' | 'broken') => {
    setQuery('');
    setOwnerType('all');
    setRole('all');
    setSource('all');
    setQuickView('all');
    setModerationFilter('all');
    setBrokenOnly(false);
    setUsage(kind === 'current'
      ? 'current'
      : kind === 'placeholder'
        ? 'placeholder'
        : kind === 'extra'
          ? 'extra'
          : kind === 'duplicate'
            ? 'exact_duplicate'
            : kind === 'unresolved'
              ? 'unresolved'
              : 'all');
    if (kind === 'broken') setBrokenOnly(true);
  };

  const hasActiveFilters = Boolean(query.trim()) || ownerType !== 'all' || role !== 'all' || source !== 'all' || usage !== 'all' || moderationFilter !== 'all' || quickView !== 'all' || brokenOnly;
  const detailsDimensions = detailsTarget ? dimensionsById[detailsTarget.id] : undefined;
  const detailsAttentionReasons = detailsTarget
    ? getAttentionReasons(detailsTarget, brokenIds.has(detailsTarget.id) || !detailsTarget.url, detailsDimensions)
    : [];
  const detailsMediaQa = detailsTarget ? getMediaQa(detailsTarget.role, detailsDimensions) : null;

  return (
    <div className="min-h-full bg-[#060708] px-4 py-8 text-gray-100 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1800px]">
        <div className="flex flex-col gap-5 border-b border-white/10 pb-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-red-400">Dev utility</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Image Library</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
              Browse current image references and upload history across SwingSphere. Green cards are actively attached or selected by the current display logic; extra uploads stay visible so duplicate-looking records can be audited without guessing which one is in use.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-gray-200 transition hover:bg-white/[0.09] disabled:cursor-wait disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh catalog
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {[
            { kind: 'current' as const, label: 'Current / in use', value: currentCount, description: 'Referenced by the current entity/profile display state. These are protected from generic deletion; recognized placeholders remain separately removable.' },
            { kind: 'placeholder' as const, label: 'Placeholders', value: placeholderCount, description: 'Known temporary placeholder URLs such as Picsum or placeholder services. These should eventually be replaced or cleared.' },
            { kind: 'extra' as const, label: 'Extra uploads', value: extraCount, description: 'A different image is current for the same owner + role, so this upload is retained history but is not selected for display.' },
            { kind: 'duplicate' as const, label: 'Exact duplicate refs', value: exactDuplicateCount, description: 'Multiple records point to the exact same Cloudflare image ID or URL. This does not mean visually similar re-uploads are detected yet.' },
            { kind: 'unresolved' as const, label: 'Unresolved', value: unresolvedCount, description: 'SwingSphere cannot confidently resolve the owner or determine a current attachment for this media reference.' },
            { kind: 'broken' as const, label: 'Broken on this page', value: brokenVisibleCount, description: 'Images that failed to load among the cards currently rendered in this browser session. This count grows as more pages are inspected.' },
          ].map((stat) => (
            <button
              key={stat.kind}
              type="button"
              onClick={() => applySummaryFilter(stat.kind)}
              title={stat.description}
              className="group relative rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300/70"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500">
                <span>{stat.label}</span>
                <CircleHelp className="h-3.5 w-3.5 shrink-0 text-gray-600" />
              </div>
              <div className="mt-1 text-2xl font-semibold text-white">{stat.value}</div>
              <div className="pointer-events-none absolute left-3 top-[calc(100%+8px)] z-50 hidden w-72 rounded-xl border border-white/10 bg-[#17191c] px-3 py-2.5 text-[11px] font-normal normal-case leading-5 tracking-normal text-gray-300 shadow-2xl group-hover:block group-focus-visible:block">
                {stat.description}
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-red-300/70">Click to filter</div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex w-fit rounded-xl border border-white/10 bg-white/[0.025] p-1">
            {[
              { id: 'all' as const, label: 'All media', count: images.length },
              { id: 'needs_attention' as const, label: 'Needs attention', count: needsAttentionCount },
              { id: 'pending_review' as const, label: 'Pending review', count: pendingReviewCount },
            ].map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => { setQuickView(view.id); setBrokenOnly(false); }}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${quickView === view.id ? 'bg-white/[0.09] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {view.label} <span className="ml-1 text-[10px] text-gray-500">{view.count}</span>
              </button>
            ))}
          </div>
          {hasActiveFilters ? (
            <button type="button" onClick={resetFilters} className="w-fit text-xs font-semibold text-gray-500 transition hover:text-gray-200">Clear filters</button>
          ) : null}
        </div>

        <div className="sticky top-0 z-20 -mx-2 mt-5 border-y border-white/10 bg-[#060708]/95 px-2 py-3 backdrop-blur-xl">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_repeat(5,minmax(135px,0.22fr))]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, ID, URL, or Cloudflare ID…"
                className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.05] pl-9 pr-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-red-500/50"
              />
            </label>
            <select value={ownerType} onChange={(event) => setOwnerType(event.target.value as 'all' | MediaOwnerType)} className="h-10 rounded-xl border border-white/10 bg-[#101214] px-3 text-sm text-gray-200 outline-none">
              <option value="all">All entity types</option>
              {MEDIA_OWNER_TYPES.map((type) => <option key={type} value={type}>{ownerLabels[type]}</option>)}
            </select>
            <select value={role} onChange={(event) => setRole(event.target.value as 'all' | MediaRole)} className="h-10 rounded-xl border border-white/10 bg-[#101214] px-3 text-sm text-gray-200 outline-none">
              <option value="all">All image roles</option>
              {MEDIA_ROLES.map((mediaRole) => <option key={mediaRole} value={mediaRole}>{roleLabels[mediaRole]}</option>)}
            </select>
            <select value={source} onChange={(event) => setSource(event.target.value as 'all' | ImageSource)} className="h-10 rounded-xl border border-white/10 bg-[#101214] px-3 text-sm text-gray-200 outline-none">
              <option value="all">All sources</option>
              <option value="media_asset">Canonical media</option>
              <option value="legacy_url">Legacy URL field</option>
            </select>
            <select value={usage} onChange={(event) => setUsage(event.target.value as 'all' | ImageUsage | 'exact_duplicate' | 'placeholder')} className="h-10 rounded-xl border border-white/10 bg-[#101214] px-3 text-sm text-gray-200 outline-none">
              <option value="all">All usage states</option>
              <option value="current">Current / in use</option>
              <option value="placeholder">Placeholder media</option>
              <option value="extra">Extra uploads</option>
              <option value="exact_duplicate">Exact duplicate refs</option>
              <option value="unresolved">Unresolved</option>
            </select>
            <select value={moderationFilter} onChange={(event) => setModerationFilter(event.target.value as ModerationFilter)} className="h-10 rounded-xl border border-white/10 bg-[#101214] px-3 text-sm text-gray-200 outline-none">
              <option value="all">All moderation states</option>
              <option value="pending_review">Pending review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="archived">Archived</option>
              <option value="legacy">Legacy / unmoderated</option>
            </select>
          </div>
        </div>

        {cleanupNotice ? (
          <div className="mt-4 flex items-start justify-between gap-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-100/85">
            <span>{cleanupNotice}</span>
            <button type="button" onClick={() => setCleanupNotice('')} className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200/70 hover:text-emerald-100">Dismiss</button>
          </div>
        ) : null}

        {replacementError ? (
          <div className="mt-4 flex items-start justify-between gap-4 rounded-2xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-100/85">
            <span>{replacementError}</span>
            <button type="button" onClick={() => setReplacementError('')} className="text-xs font-semibold uppercase tracking-[0.12em] text-red-200/70 hover:text-red-100">Dismiss</button>
          </div>
        ) : null}

        {moderationError ? (
          <div className="mt-4 flex items-start justify-between gap-4 rounded-2xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-100/85">
            <span>{moderationError}</span>
            <button type="button" onClick={() => setModerationError('')} className="text-xs font-semibold uppercase tracking-[0.12em] text-red-200/70 hover:text-red-100">Dismiss</button>
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100/80">
            <div className="font-semibold text-amber-200">Some image sources could not be read.</div>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-amber-100/65">
              {warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-between text-xs text-gray-500">
          <span>{loading ? 'Loading image catalog…' : `${filtered.length} matching image reference${filtered.length === 1 ? '' : 's'}`}</span>
          {!loading && filtered.length > 0 ? <span>Page {safePage} of {pageCount}</span> : null}
        </div>

        {!loading && visible.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-white/10 py-20 text-center text-sm text-gray-500">No images match the current filters.</div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {visible.map((image) => {
              const broken = brokenIds.has(image.id) || !image.url;
              const placeholder = isPlaceholderRecord(image);
              const dimensions = dimensionsById[image.id];
              const mediaQa = getMediaQa(image.role, dimensions);
              const attentionReasons = getAttentionReasons(image, broken, dimensions);
              const canReplaceLogo = image.role === 'logo' && image.isCurrent && image.ownerResolved && image.ownerType !== 'user' && image.ownerType !== 'cruise_sailing';
              const replaceInputId = `replace-logo-${image.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
              return (
                <article key={image.id} className={`group overflow-hidden rounded-2xl border ${placeholder ? 'border-amber-300/45 bg-amber-300/[0.045] shadow-[0_0_0_1px_rgba(252,211,77,0.05)]' : image.isCurrent ? 'border-emerald-400/45 bg-emerald-400/[0.045] shadow-[0_0_0_1px_rgba(52,211,153,0.05)]' : image.usage === 'extra' ? 'border-amber-400/15 bg-white/[0.03]' : 'border-white/10 bg-white/[0.025]'}`}>
                  <div className="relative aspect-[4/3] bg-black/30">
                    {broken ? (
                      <div className="flex h-full items-center justify-center gap-2 text-xs font-semibold text-red-300/80"><ImageOff className="h-4 w-4" /> Image unavailable</div>
                    ) : (
                      <img
                        src={image.url ?? undefined}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        onError={() => setBrokenIds((current) => new Set(current).add(image.id))}
                        className={`h-full w-full ${image.role === 'logo' ? 'object-contain' : image.role === 'flyer' ? 'object-contain p-2' : 'object-cover'}`}
                      />
                    )}
                    <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1">
                      {image.isCurrent ? <span className="rounded-md bg-emerald-500/90 px-1.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-black">Current / in use</span> : null}
                      {placeholder ? <span className="rounded-md bg-amber-300 px-1.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-black">Placeholder</span> : null}
                      <span className="rounded-md bg-black/75 px-1.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white">{ownerLabels[image.ownerType]}</span>
                      <span className="rounded-md bg-black/75 px-1.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-gray-300">{image.roleLabel}</span>
                      {image.ownerRoleCount > 1 ? <span className="rounded-md bg-black/75 px-1.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-amber-200">{image.ownerRoleCount} {image.roleLabel} refs</span> : null}
                    </div>
                    {image.url ? (
                      <a href={image.url} target="_blank" rel="noreferrer" className="absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-black/75 text-gray-300 opacity-0 transition hover:text-white group-hover:opacity-100" aria-label="Open image in new tab">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>
                  <div className="space-y-2 p-3">
                    <div>
                      <div className="truncate text-sm font-semibold text-white" title={image.ownerName}>{image.ownerName}</div>
                      <div className="mt-0.5 truncate font-mono text-[10px] text-gray-600" title={image.ownerId}>{image.ownerId}</div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {image.isCurrent ? <span className="rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-300">In use</span> : null}
                      {placeholder ? <span className="rounded-md bg-amber-300/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-amber-200">Placeholder media</span> : null}
                      {image.usage === 'extra' ? <span className="rounded-md bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-amber-300">Extra upload</span> : null}
                      {image.usage === 'unresolved' ? <span className="rounded-md bg-violet-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-violet-300">Not resolved</span> : null}
                      {image.exactDuplicateCount > 1 ? <span className="rounded-md bg-fuchsia-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-fuchsia-300">Exact duplicate ref ×{image.exactDuplicateCount}</span> : null}
                      {image.currentConflict ? <span className="rounded-md bg-red-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-red-300">Multiple current refs</span> : null}
                      {!image.ownerResolved ? <span className="rounded-md bg-red-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-red-300">Owner missing</span> : null}
                      <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${image.source === 'media_asset' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-sky-400/10 text-sky-300'}`}>
                        {image.source === 'media_asset' ? 'Canonical' : 'Legacy URL'}
                      </span>
                      {image.status ? <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] text-gray-400">{image.status.replace('_', ' ')}</span> : null}
                      {broken ? <span className="rounded-md bg-red-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-red-300">Broken</span> : null}
                    </div>
                    {attentionReasons.length > 0 ? (
                      <div className="rounded-lg border border-amber-300/15 bg-amber-300/[0.035] px-2.5 py-2">
                        <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-amber-200/80"><ShieldAlert className="h-3.5 w-3.5" /> Needs attention</div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {attentionReasons.slice(0, 4).map((reason) => <span key={reason.key} className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${attentionToneClass[reason.tone]}`}>{reason.label}</span>)}
                          {attentionReasons.length > 4 ? <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-gray-400">+{attentionReasons.length - 4}</span> : null}
                        </div>
                      </div>
                    ) : null}
                    <div className="rounded-lg border border-white/8 bg-black/20 px-2.5 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-gray-500">Media QA · target {mediaQa?.targetLabel ?? mediaQaTargets[image.role].label}</span>
                        {mediaQa ? (
                          <>
                            <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${mediaQa.resolutionTone === 'good' ? 'bg-emerald-400/10 text-emerald-300' : mediaQa.resolutionTone === 'warn' ? 'bg-amber-400/10 text-amber-300' : 'bg-red-400/10 text-red-300'}`}>{mediaQa.resolution}</span>
                            {mediaQa.shape ? <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${mediaQa.shapeTone === 'good' ? 'bg-sky-400/10 text-sky-300' : 'bg-amber-400/10 text-amber-300'}`}>{mediaQa.shape}</span> : null}
                          </>
                        ) : null}
                      </div>
                      <div className="mt-1.5 text-[10px] leading-4 text-gray-500">
                        {dimensions
                          ? `${dimensions.source === 'source' ? 'Source rendition' : 'Delivered rendition'}: ${dimensions.width}×${dimensions.height}px${dimensions.source === 'delivery' && image.source === 'media_asset' ? ' · original source size unavailable' : ''}`
                          : broken ? 'Dimensions unavailable.' : 'Checking dimensions…'}
                      </div>
                      {image.role === 'logo' && mediaQa?.shapeTone === 'warn' ? <div className="mt-1 text-[9px] leading-4 text-amber-200/65">This shape is allowed. Wide logos scale to the left/right bounds; tall logos scale to the top/bottom bounds. No cropping or distortion is applied.</div> : null}
                    </div>
                    {placeholder ? <div className="text-[10px] leading-4 text-amber-200/75">Recognized placeholder URL. It may be current, but it is not treated as finished media.</div> : null}
                    {image.currentReason ? <div className={`text-[10px] leading-4 ${placeholder ? 'text-amber-100/55' : 'text-emerald-200/70'}`}>{image.currentReason}</div> : null}
                    {image.mediaAssetId ? <div className="truncate font-mono text-[9px] text-gray-500" title={image.mediaAssetId}>Asset: {image.mediaAssetId}</div> : null}
                    {image.externalId ? <div className="truncate font-mono text-[9px] text-gray-600" title={image.externalId}>CF: {image.externalId}</div> : null}
                    {formatAssetDate(image.createdAt ?? image.updatedAt) ? <div className="text-[9px] uppercase tracking-[0.08em] text-gray-600">Uploaded {formatAssetDate(image.createdAt ?? image.updatedAt)}</div> : null}
                    {image.source === 'media_asset' ? (
                      <div className="flex items-center gap-1.5 text-[9px] text-gray-500">
                        <UserRound className="h-3 w-3" />
                        <span className="truncate" title={image.createdBy}>{image.uploaderName ? `Uploaded by ${image.uploaderName}` : image.createdBy ? `Uploader ${image.createdBy}` : 'Uploader not recorded'}</span>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setDetailsTarget(image)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
                    >
                      <Eye className="h-3.5 w-3.5" /> Inspect / usage
                    </button>
                    {image.source === 'media_asset' && image.mediaAssetId && image.status === 'pending_review' ? (
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          disabled={moderationBusyId === image.id}
                          onClick={() => void handleModeration(image, 'approved')}
                          className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] px-2 py-2 text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-300 transition hover:bg-emerald-400/[0.12] disabled:opacity-50"
                        >Approve</button>
                        <button
                          type="button"
                          disabled={moderationBusyId === image.id || image.isCurrent}
                          onClick={() => void handleModeration(image, 'rejected')}
                          title={image.isCurrent ? 'Replace or clear the current reference before rejecting this asset.' : 'Reject this media asset.'}
                          className="rounded-lg border border-red-400/20 bg-red-400/[0.06] px-2 py-2 text-[9px] font-bold uppercase tracking-[0.1em] text-red-300 transition hover:bg-red-400/[0.11] disabled:cursor-not-allowed disabled:opacity-35"
                        >Reject</button>
                      </div>
                    ) : image.source === 'media_asset' && image.mediaAssetId && image.status === 'rejected' ? (
                      <button type="button" disabled={moderationBusyId === image.id} onClick={() => void handleModeration(image, 'approved')} className="w-full rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] px-2 py-2 text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-300 transition hover:bg-emerald-400/[0.12] disabled:opacity-50">Approve rejected asset</button>
                    ) : null}
                    {canReplaceLogo ? (
                      <div className="pt-1">
                        <MediaUploader
                          ownerType={image.ownerType}
                          ownerId={getMediaOwnerId(image.ownerType, image.ownerId)}
                          role="logo"
                          inputId={replaceInputId}
                          triggerOnly
                          onUploaded={(asset) => { void handleLogoUploaded(image, asset); }}
                          onError={(message) => setReplacementError(message)}
                        />
                        <label
                          htmlFor={replaceInputId}
                          className={`inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-sky-400/20 bg-sky-400/[0.06] px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-sky-300 transition hover:border-sky-400/35 hover:bg-sky-400/[0.1] ${replacementBusyId === image.id ? 'pointer-events-none opacity-50' : ''}`}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {replacementBusyId === image.id ? 'Attaching new logo…' : 'Replace logo'}
                        </label>
                      </div>
                    ) : null}
                    {placeholder && image.isCurrent && image.source === 'legacy_url' && image.ownerType !== 'user' ? (
                      <button
                        type="button"
                        onClick={() => requestPlaceholderClear(image)}
                        className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300/25 bg-amber-300/[0.07] px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200 transition hover:border-amber-300/40 hover:bg-amber-300/[0.12]"
                      >
                        <ImageOff className="h-3.5 w-3.5" />
                        Remove placeholder
                      </button>
                    ) : !image.isCurrent && image.source === 'media_asset' && image.mediaAssetId && image.externalId ? (
                      <button
                        type="button"
                        onClick={() => requestDelete(image)}
                        className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/20 bg-red-400/[0.06] px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-red-300 transition hover:border-red-400/35 hover:bg-red-400/[0.1]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {image.exactDuplicateCount > 1 ? 'Remove duplicate ref' : 'Delete unused image'}
                      </button>
                    ) : image.isCurrent ? (
                      <div className={`pt-1 text-[9px] font-semibold uppercase tracking-[0.1em] ${placeholder ? 'text-amber-200/55' : 'text-emerald-300/50'}`}>
                        {placeholder ? 'Current placeholder reference' : 'Protected from deletion'}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!loading && filtered.length > PAGE_SIZE ? (
          <div className="mt-8 flex items-center justify-center gap-3 pb-6">
            <button type="button" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-gray-300 disabled:opacity-30">Previous</button>
            <span className="text-xs text-gray-500">{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
            <button type="button" disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-gray-300 disabled:opacity-30">Next</button>
          </div>
        ) : null}
      </div>

      {detailsTarget ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/75 px-4 py-8 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="media-details-title">
          <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#111315] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-300/70">Media details & usage</div>
                <h2 id="media-details-title" className="mt-1 text-xl font-semibold text-white">{detailsTarget.ownerName}</h2>
                <p className="mt-1 text-sm text-gray-400">{ownerLabels[detailsTarget.ownerType]} · {detailsTarget.roleLabel}</p>
              </div>
              <button type="button" onClick={() => setDetailsTarget(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-gray-400 transition hover:bg-white/[0.08] hover:text-white" aria-label="Close media details"><X className="h-4 w-4" /></button>
            </div>

            <div className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-4">
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                  <div className="aspect-[4/3]">
                    {detailsTarget.url ? <img src={detailsTarget.url} alt="" className={`h-full w-full ${detailsTarget.role === 'logo' || detailsTarget.role === 'flyer' ? 'object-contain' : 'object-cover'}`} /> : <div className="flex h-full items-center justify-center gap-2 text-sm text-red-300"><ImageOff className="h-5 w-5" /> Image unavailable</div>}
                  </div>
                </div>

                {detailsTarget.url ? <a href={detailsTarget.url} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs font-semibold text-gray-300 transition hover:bg-white/[0.08] hover:text-white"><ExternalLink className="h-4 w-4" /> Open image</a> : null}

                {detailsTarget.source === 'media_asset' && detailsTarget.mediaAssetId ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-gray-400"><UserRound className="h-4 w-4" /> Provenance</div>
                    <dl className="mt-3 space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-3"><dt className="text-gray-500">Uploader</dt><dd className="max-w-[70%] text-right text-gray-300">{detailsTarget.uploaderName ?? detailsTarget.createdBy ?? 'Not recorded'}</dd></div>
                      <div className="flex items-start justify-between gap-3"><dt className="text-gray-500">Uploaded</dt><dd className="text-right text-gray-300">{formatAssetDate(detailsTarget.createdAt) ?? 'Unknown'}</dd></div>
                      <div className="flex items-start justify-between gap-3"><dt className="text-gray-500">Moderation</dt><dd className="text-right capitalize text-gray-300">{detailsTarget.status?.replace('_', ' ') ?? 'Unknown'}</dd></div>
                      <div className="flex items-start justify-between gap-3"><dt className="text-gray-500">Storage</dt><dd className="text-right text-gray-300">Cloudflare Images</dd></div>
                      <div className="flex items-start justify-between gap-3"><dt className="text-gray-500">Fit</dt><dd className="text-right text-gray-300">{detailsTarget.aspectMode ?? getMediaRule(detailsTarget.role).aspectMode}{detailsTarget.targetRatio ? ` · ${detailsTarget.targetRatio}` : ''}</dd></div>
                      <div className="flex items-start justify-between gap-3"><dt className="text-gray-500">Sort order</dt><dd className="text-right text-gray-300">{detailsTarget.sortOrder ?? 0}</dd></div>
                      <div className="flex items-start justify-between gap-3"><dt className="text-gray-500">Alt text</dt><dd className="max-w-[70%] text-right text-gray-300">{detailsTarget.altText || 'Not provided'}</dd></div>
                      {detailsTarget.focalPointX != null && detailsTarget.focalPointY != null ? <div className="flex items-start justify-between gap-3"><dt className="text-gray-500">Focal point</dt><dd className="text-right text-gray-300">{detailsTarget.focalPointX}, {detailsTarget.focalPointY}</dd></div> : null}
                    </dl>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-sky-400/10 bg-sky-400/[0.035] p-4 text-xs leading-5 text-sky-100/60">Legacy URL field. Original uploader and moderation history are not available for this reference.</div>
                )}
              </div>

              <div className="space-y-4">
                <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-gray-400"><Eye className="h-4 w-4" /> Where this is used</div>
                  <div className="mt-3 rounded-xl border border-white/8 bg-black/20 p-3 text-sm leading-6 text-gray-300">
                    {detailsTarget.isCurrent
                      ? `This is currently selected as ${detailsTarget.ownerName}'s ${detailsTarget.roleLabel.toLowerCase()}.`
                      : `No current display reference was detected for this ${detailsTarget.roleLabel.toLowerCase()} record.`}
                  </div>
                  {detailsTarget.currentReason ? <div className="mt-2 text-xs leading-5 text-emerald-200/70">{detailsTarget.currentReason}</div> : null}
                  <p className="mt-3 text-xs leading-5 text-gray-500">{getRoleUsageDescription(detailsTarget)}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg border border-white/8 bg-black/20 px-2.5 py-2 text-gray-500"><span className="block uppercase tracking-[0.1em]">Owner + role refs</span><span className="mt-1 block text-sm font-semibold text-gray-200">{detailsTarget.ownerRoleCount}</span></div>
                    <div className="rounded-lg border border-white/8 bg-black/20 px-2.5 py-2 text-gray-500"><span className="block uppercase tracking-[0.1em]">Exact refs</span><span className="mt-1 block text-sm font-semibold text-gray-200">{detailsTarget.exactDuplicateCount}</span></div>
                  </div>
                </section>

                <section className={`rounded-2xl border p-4 ${detailsAttentionReasons.length ? 'border-amber-300/15 bg-amber-300/[0.035]' : 'border-emerald-400/15 bg-emerald-400/[0.035]'}`}>
                  <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] ${detailsAttentionReasons.length ? 'text-amber-200' : 'text-emerald-300'}`}><ShieldAlert className="h-4 w-4" /> {detailsAttentionReasons.length ? 'Needs attention' : 'No detected issues'}</div>
                  {detailsAttentionReasons.length ? (
                    <div className="mt-3 space-y-2">
                      {detailsAttentionReasons.map((reason) => <div key={reason.key} className={`rounded-xl border px-3 py-2.5 ${attentionToneClass[reason.tone]}`}><div className="text-xs font-semibold">{reason.label}</div><div className="mt-1 text-[11px] leading-5 opacity-75">{reason.detail}</div></div>)}
                    </div>
                  ) : <p className="mt-2 text-xs leading-5 text-emerald-100/60">Nothing in the current structural or visible quality checks requires action.</p>}
                </section>

                {detailsDimensions ? (
                  <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                    <div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">Detected dimensions</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-lg font-semibold text-white">{detailsDimensions.width} × {detailsDimensions.height}px</span>{detailsMediaQa ? <span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${detailsMediaQa.resolutionTone === 'good' ? 'bg-emerald-400/10 text-emerald-300' : detailsMediaQa.resolutionTone === 'warn' ? 'bg-amber-400/10 text-amber-300' : 'bg-red-400/10 text-red-300'}`}>{detailsMediaQa.resolution}</span> : null}</div>
                    <div className="mt-1 text-xs text-gray-500">{detailsDimensions.source === 'source' ? 'Source rendition' : 'Delivered rendition'} · target {detailsMediaQa?.targetLabel ?? mediaQaTargets[detailsTarget.role].label}</div>
                  </section>
                ) : null}

                {detailsTarget.source === 'media_asset' && detailsTarget.mediaAssetId ? (
                  <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                    <div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">Moderation actions</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {detailsTarget.status !== 'approved' ? <button type="button" disabled={moderationBusyId === detailsTarget.id} onClick={() => void handleModeration(detailsTarget, 'approved')} className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-400/[0.13] disabled:opacity-50">Approve</button> : null}
                      {detailsTarget.status !== 'rejected' ? <button type="button" disabled={moderationBusyId === detailsTarget.id || detailsTarget.isCurrent} onClick={() => void handleModeration(detailsTarget, 'rejected')} title={detailsTarget.isCurrent ? 'Replace or clear the current reference first.' : 'Reject this media asset.'} className="rounded-xl border border-red-400/20 bg-red-400/[0.07] px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-400/[0.12] disabled:cursor-not-allowed disabled:opacity-35">Reject</button> : null}
                      {detailsTarget.status !== 'archived' ? <button type="button" disabled={moderationBusyId === detailsTarget.id || detailsTarget.isCurrent} onClick={() => void handleModeration(detailsTarget, 'archived')} title={detailsTarget.isCurrent ? 'Replace or clear the current reference first.' : 'Archive this media asset.'} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-gray-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35">Archive</button> : null}
                      {detailsTarget.status === 'archived' ? <button type="button" disabled={moderationBusyId === detailsTarget.id} onClick={() => void handleModeration(detailsTarget, 'pending_review')} className="rounded-xl border border-amber-300/20 bg-amber-300/[0.07] px-3 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-300/[0.12] disabled:opacity-50">Return to review</button> : null}
                    </div>
                    {detailsTarget.isCurrent ? <p className="mt-2 text-[11px] leading-5 text-gray-500">Reject and Archive stay disabled while the asset is current. Replace or clear the live reference first.</p> : null}
                  </section>
                ) : null}

                <section className="rounded-2xl border border-white/10 bg-black/20 p-4 font-mono text-[10px] leading-5 text-gray-500">
                  <div className="break-all">Owner: {detailsTarget.ownerType}:{detailsTarget.ownerId}</div>
                  {detailsTarget.storageOwnerId && detailsTarget.storageOwnerId !== detailsTarget.ownerId ? <div className="break-all">Media owner UUID: {detailsTarget.storageOwnerId}</div> : null}
                  {detailsTarget.mediaAssetId ? <div className="break-all">Asset: {detailsTarget.mediaAssetId}</div> : null}
                  {detailsTarget.externalId ? <div className="break-all">Cloudflare: {detailsTarget.externalId}</div> : null}
                  {detailsTarget.createdBy ? <div className="break-all">Created by: {detailsTarget.createdBy}</div> : null}
                </section>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {placeholderTarget ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="clear-placeholder-title">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-amber-300/25 bg-[#111315] shadow-2xl">
            <div className="border-b border-white/10 px-5 py-4 sm:px-6">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-300/10 text-amber-200"><ImageOff className="h-5 w-5" /></div>
                <div>
                  <h2 id="clear-placeholder-title" className="text-lg font-semibold text-white">Remove placeholder reference?</h2>
                  <p className="mt-1 text-sm leading-5 text-gray-400">
                    This image is currently referenced by the entity, but SwingSphere recognizes the URL as placeholder media.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5 sm:px-6">
              <div className="grid grid-cols-[96px_1fr] gap-4">
                <div className="aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/30">
                  {placeholderTarget.url ? <img src={placeholderTarget.url} alt="" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-gray-600"><ImageOff className="h-5 w-5" /></div>}
                </div>
                <div className="min-w-0 space-y-1.5 text-sm">
                  <div className="font-semibold text-white">{placeholderTarget.ownerName}</div>
                  <div className="text-gray-400">{ownerLabels[placeholderTarget.ownerType]} · {placeholderTarget.roleLabel}</div>
                  <div className="text-amber-200/70">Recognized placeholder URL</div>
                </div>
              </div>

              <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-3 text-xs leading-5 text-amber-100/80">
                This clears only the current placeholder URL from the entity. It does not delete a Cloudflare image. The page will then use its normal missing/inherited-media behavior until you upload a real replacement.
              </div>

              {placeholderError ? <div className="rounded-xl border border-red-400/25 bg-red-400/[0.08] px-3 py-2.5 text-sm text-red-200">{placeholderError}</div> : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-white/10 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button type="button" disabled={clearingPlaceholder} onClick={() => { setPlaceholderTarget(null); setPlaceholderError(''); }} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-gray-300 transition hover:bg-white/[0.08] disabled:opacity-50">Cancel</button>
              <button type="button" disabled={clearingPlaceholder} onClick={() => void confirmPlaceholderClear()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-60">
                <ImageOff className="h-4 w-4" />
                {clearingPlaceholder ? 'Clearing placeholder…' : 'Remove placeholder'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-image-title">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-red-400/20 bg-[#111315] shadow-2xl">
            <div className="border-b border-white/10 px-5 py-4 sm:px-6">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-400/10 text-red-300"><AlertTriangle className="h-5 w-5" /></div>
                <div>
                  <h2 id="delete-image-title" className="text-lg font-semibold text-white">Delete unused image?</h2>
                  <p className="mt-1 text-sm leading-5 text-gray-400">
                    The server will verify this asset is still unused before deleting anything. Current images are never removable from this view.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5 sm:px-6">
              <div className="grid grid-cols-[96px_1fr] gap-4">
                <div className="aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/30">
                  {deleteTarget.url ? <img src={deleteTarget.url} alt="" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-gray-600"><ImageOff className="h-5 w-5" /></div>}
                </div>
                <div className="min-w-0 space-y-1.5 text-sm">
                  <div className="font-semibold text-white">{deleteTarget.ownerName}</div>
                  <div className="text-gray-400">{ownerLabels[deleteTarget.ownerType]} · {deleteTarget.roleLabel}</div>
                  {deleteTarget.status ? <div className="text-gray-500">Status: {deleteTarget.status.replace('_', ' ')}</div> : null}
                  {formatAssetDate(deleteTarget.createdAt ?? deleteTarget.updatedAt) ? <div className="text-gray-500">Uploaded {formatAssetDate(deleteTarget.createdAt ?? deleteTarget.updatedAt)}</div> : null}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 font-mono text-[10px] leading-5 text-gray-500">
                <div className="truncate" title={deleteTarget.mediaAssetId}>Asset: {deleteTarget.mediaAssetId}</div>
                <div className="truncate" title={deleteTarget.externalId}>Cloudflare: {deleteTarget.externalId}</div>
              </div>

              {deleteTarget.exactDuplicateCount > 1 ? (
                <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/[0.06] px-3 py-3 text-xs leading-5 text-fuchsia-100/80">
                  This is an exact duplicate reference. If another database record points to the same Cloudflare image, only this redundant record will be removed; the shared image file will be kept.
                </div>
              ) : deleteTarget.usage === 'unresolved' || !deleteTarget.ownerResolved ? (
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-3 text-xs leading-5 text-amber-100/80">
                  SwingSphere could not fully resolve this asset's current owner state. The server will perform one final reference check before allowing deletion.
                </div>
              ) : (
                <div className="rounded-xl border border-red-400/20 bg-red-400/[0.05] px-3 py-3 text-xs leading-5 text-red-100/75">
                  This removes the media record and, when nothing else references it, permanently deletes the underlying Cloudflare image. There is no restore from this action.
                </div>
              )}

              {deleteError ? <div className="rounded-xl border border-red-400/25 bg-red-400/[0.08] px-3 py-2.5 text-sm text-red-200">{deleteError}</div> : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-white/10 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button type="button" disabled={deleting} onClick={() => { setDeleteTarget(null); setDeleteError(''); }} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-gray-300 transition hover:bg-white/[0.08] disabled:opacity-50">Cancel</button>
              <button type="button" disabled={deleting} onClick={() => void confirmDelete()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-wait disabled:opacity-60">
                <Trash2 className="h-4 w-4" />
                {deleting ? 'Verifying & deleting…' : deleteTarget.exactDuplicateCount > 1 ? 'Remove duplicate reference' : 'Delete image'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DevImageLibraryPage;
