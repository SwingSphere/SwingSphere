import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, ImageOff, RefreshCw, Search } from 'lucide-react';
import * as api from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { getCloudflareImageUrl } from '../../lib/media/getCloudflareImageUrl';
import { getMediaRule, MEDIA_OWNER_TYPES, MEDIA_ROLES } from '../../lib/media/mediaRules';
import type { MediaAsset, MediaOwnerType, MediaRole, MediaStatus } from '../../lib/media/types';

type ImageSource = 'media_asset' | 'legacy_url';

type ImageRecord = {
  id: string;
  ownerType: MediaOwnerType;
  ownerId: string;
  ownerName: string;
  role: MediaRole;
  roleLabel: string;
  url: string | null;
  source: ImageSource;
  status?: MediaStatus;
  mediaAssetId?: string;
  externalId?: string;
  updatedAt?: string;
};

type LegacyMediaEntity = {
  id: string;
  type: Exclude<MediaOwnerType, 'user'>;
  name: string;
  logoImageUrl?: string;
  headerImageUrl?: string;
  galleryImageUrls?: string[];
};

type LoadResult = {
  images: ImageRecord[];
  warnings: string[];
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

  const entityNames = new Map<string, string>();
  const registerEntity = (entity: { type: MediaOwnerType; id: string; name: string }) => {
    entityNames.set(`${entity.type}:${entity.id}`, entity.name);
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
  users.forEach((user) => entityNames.set(`user:${user.id}`, user.displayName || user.handle || user.id));

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
    });
  });

  if (mediaAssetsResult.status === 'rejected') {
    warnings.push(`Canonical media: ${mediaAssetsResult.reason instanceof Error ? mediaAssetsResult.reason.message : 'failed to load'}`);
  } else if (mediaAssetsResult.value.error) {
    warnings.push(`Canonical media: ${mediaAssetsResult.value.error.message}`);
  } else {
    const mediaAssets = (mediaAssetsResult.value.data ?? []) as MediaAsset[];
    mediaAssets.forEach((asset) => {
      const rule = getMediaRule(asset.role);
      const url = getCloudflareImageUrl({ externalId: asset.external_id, variant: rule.defaultVariant });
      images.push({
        id: `asset:${asset.id}`,
        ownerType: asset.owner_type,
        ownerId: asset.owner_id,
        ownerName: entityNames.get(`${asset.owner_type}:${asset.owner_id}`) ?? asset.owner_id,
        role: asset.role,
        roleLabel: roleLabels[asset.role],
        url,
        source: 'media_asset',
        status: asset.status,
        mediaAssetId: asset.id,
        externalId: asset.external_id,
        updatedAt: asset.updated_at,
      });
    });
  }

  const unique = new Map<string, ImageRecord>();
  images.forEach((image) => {
    const key = `${image.ownerType}|${image.ownerId}|${image.role}|${image.url ?? image.externalId ?? image.id}`;
    const current = unique.get(key);
    if (!current || image.source === 'media_asset') unique.set(key, image);
  });

  return {
    images: Array.from(unique.values()).sort((a, b) => {
      const nameCompare = a.ownerName.localeCompare(b.ownerName);
      if (nameCompare !== 0) return nameCompare;
      return a.role.localeCompare(b.role);
    }),
    warnings,
  };
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
  const [page, setPage] = useState(1);
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());

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
      if (ownerType !== 'all' && image.ownerType !== ownerType) return false;
      if (role !== 'all' && image.role !== role) return false;
      if (source !== 'all' && image.source !== source) return false;
      if (!normalizedQuery) return true;
      return [image.ownerName, image.ownerId, image.ownerType, image.role, image.url, image.externalId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [images, ownerType, query, role, source]);

  useEffect(() => {
    setPage(1);
  }, [ownerType, query, role, source]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const canonicalCount = images.filter((image) => image.source === 'media_asset').length;
  const legacyCount = images.length - canonicalCount;
  const brokenVisibleCount = visible.filter((image) => brokenIds.has(image.id) || !image.url).length;

  return (
    <div className="min-h-full bg-[#060708] px-4 py-8 text-gray-100 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1800px]">
        <div className="flex flex-col gap-5 border-b border-white/10 pb-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-red-400">Dev utility</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Image Library</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
              Browse image references attached to current SwingSphere entities and profiles. Canonical Cloudflare media and legacy image URL fields are shown together; results are paginated and thumbnails load lazily.
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

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Image references', images.length],
            ['Canonical media', canonicalCount],
            ['Legacy URL fields', legacyCount],
            ['Broken on this page', brokenVisibleCount],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500">{label}</div>
              <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
            </div>
          ))}
        </div>

        <div className="sticky top-0 z-20 -mx-2 mt-5 border-y border-white/10 bg-[#060708]/95 px-2 py-3 backdrop-blur-xl">
          <div className="grid gap-2 md:grid-cols-[minmax(260px,1fr)_repeat(3,minmax(150px,0.25fr))]">
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
          </div>
        </div>

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
              return (
                <article key={image.id} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
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
                        className={`h-full w-full ${image.role === 'logo' || image.role === 'flyer' ? 'object-contain p-2' : 'object-cover'}`}
                      />
                    )}
                    <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1">
                      <span className="rounded-md bg-black/75 px-1.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white">{ownerLabels[image.ownerType]}</span>
                      <span className="rounded-md bg-black/75 px-1.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-gray-300">{image.roleLabel}</span>
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
                      <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${image.source === 'media_asset' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-sky-400/10 text-sky-300'}`}>
                        {image.source === 'media_asset' ? 'Canonical' : 'Legacy URL'}
                      </span>
                      {image.status ? <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] text-gray-400">{image.status.replace('_', ' ')}</span> : null}
                      {broken ? <span className="rounded-md bg-red-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-red-300">Broken</span> : null}
                    </div>
                    {image.externalId ? <div className="truncate font-mono text-[9px] text-gray-600" title={image.externalId}>CF: {image.externalId}</div> : null}
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
    </div>
  );
};

export default DevImageLibraryPage;
