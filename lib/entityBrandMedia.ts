import { getCloudflareImageUrl } from './media/getCloudflareImageUrl';
import { resolveEventOrganizerOrganizationId, resolveEventVenueId } from './entityCompatibility';
import { normalizeHostName } from './identityUtils';
import { mockOrganizations } from '../data/mockOrganizations';
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
  VenueData,
} from '../types';

export type BrandMediaEntityType =
  | 'club'
  | 'club_brand'
  | 'venue'
  | 'event'
  | 'event_series'
  | 'organization'
  | 'resort'
  | 'cruise_series'
  | 'cruise_sailing';

export type BrandMediaCatalog = {
  listings: Listing[];
  venues?: VenueData[];
  organizations?: OrganizationData[];
  relationships?: OrganizationVenueRelationship[];
  eventSeries?: EventSeriesData[];
  clubBrands?: ClubBrandData[];
  resorts?: ResortData[];
  cruiseSeries?: CruiseSeriesData[];
  cruiseSailings?: CruiseSailingData[];
};

export type BrandMediaResolution = {
  url?: string;
  sourceType?: BrandMediaEntityType;
  sourceId?: string;
  sourceName?: string;
  sourceRole?: 'logo' | 'header';
  inherited: boolean;
  depth: number;
};

type EntityRef = { type: BrandMediaEntityType; id: string };
type MediaNode = EntityRef & {
  name: string;
  logoImageUrl?: string;
  headerImageUrl?: string;
};

type MediaBearingEntity = {
  logoImageUrl?: string;
  headerImageUrl?: string;
  mediaAssets?: Array<{
    role?: string;
    external_id?: string;
  }>;
};

const resolveUploadedMediaUrl = (entity: MediaBearingEntity, role: 'logo' | 'hero'): string | undefined => {
  const asset = entity.mediaAssets?.find((item) => item.role === role && item.external_id?.trim());
  if (!asset?.external_id) return undefined;
  return getCloudflareImageUrl({
    externalId: asset.external_id.trim(),
    variant: role === 'logo' ? 'logosquare' : 'herocard',
  }) ?? undefined;
};

const mediaNodeFields = (entity: MediaBearingEntity) => ({
  logoImageUrl: resolveUploadedMediaUrl(entity, 'logo') ?? entity.logoImageUrl,
  headerImageUrl: resolveUploadedMediaUrl(entity, 'hero') ?? entity.headerImageUrl,
});

const refKey = (ref: EntityRef) => `${ref.type}:${ref.id}`;

export const isPlaceholderMediaUrl = (url?: string | null): boolean => {
  if (!url) return false;
  const value = url.toLowerCase().trim();
  return value === '/swingsphere-logo_2.png'
    || value.endsWith('/swingsphere-logo_2.png')
    || value.includes('picsum.photos')
    || value.includes('placehold.co')
    || value.includes('placeholder.com')
    || value.includes('via.placeholder');
};

const isUsableLogo = (url?: string | null) => Boolean(url && !isPlaceholderMediaUrl(url));
const isUsableHeader = (url?: string | null) => Boolean(url && !isPlaceholderMediaUrl(url));

const relationshipPriority = (relationship: OrganizationVenueRelationship): number => {
  if (relationship.relationshipType === 'owner_operator') return relationship.isPrimary ? 0 : 1;
  if (relationship.relationshipType === 'primary_home') return relationship.isPrimary ? 2 : 3;
  if (relationship.isPrimary) return 4;
  return 10;
};

const uniqueRefs = (refs: EntityRef[]): EntityRef[] => {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = refKey(ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const mockOrgById = new Map(mockOrganizations.map((org) => [org.id, org]));

export const hydrateOrganizationsFromCatalog = (catalog: BrandMediaCatalog): OrganizationData[] => {
  const orgMap = new Map<string, OrganizationData>();
  for (const org of mockOrganizations) orgMap.set(org.id, { ...org });
  for (const org of catalog.organizations ?? []) {
    const existing = orgMap.get(org.id);
    orgMap.set(org.id, {
      ...(existing ?? {}),
      ...org,
      logoImageUrl: org.logoImageUrl?.trim() || existing?.logoImageUrl,
      headerImageUrl: org.headerImageUrl?.trim() || existing?.headerImageUrl,
    });
  }

  const organizations = Array.from(orgMap.values());
  const events = (catalog.listings ?? []).filter((item): item is EventData => item.type === 'event');
  const cruiseSeries = catalog.cruiseSeries ?? [];
  const eventSeries = catalog.eventSeries ?? [];
  const clubBrands = catalog.clubBrands ?? [];
  const collections = {
    listings: catalog.listings ?? [],
    venues: catalog.venues ?? [],
    organizations,
    relationships: catalog.relationships ?? [],
  };

  // Pre-group non-overridden events by resolved organizer ID in a single O(events) pass
  const childEventsByOrgId = new Map<string, EventData[]>();
  for (const ev of events) {
    if (ev.logoOverride === true) continue;
    const orgId = resolveEventOrganizerOrganizationId(ev, collections);
    if (!orgId) continue;
    const list = childEventsByOrgId.get(orgId);
    if (list) list.push(ev);
    else childEventsByOrgId.set(orgId, [ev]);
  }

  return organizations.map((org) => {
    const mockFallbackLogo = mockOrgById.get(org.id)?.logoImageUrl;
    const mockFallbackHeader = mockOrgById.get(org.id)?.headerImageUrl;
    const currentLogo = mediaNodeFields(org).logoImageUrl?.trim();
    const currentHeader = mediaNodeFields(org).headerImageUrl?.trim();
    const normOrgName = normalizeHostName(org.name);

    const matchesSeriesOrg = (s: EventSeriesData) =>
      s.organizerOrganizationId === org.id
      || (!s.organizerOrganizationId && (s.slug === org.slug || normalizeHostName(s.name) === normOrgName));

    const seriesLogo =
      clubBrands
        .map((b) => (b.operatorOrganizationId === org.id ? mediaNodeFields(b).logoImageUrl : undefined))
        .find((url) => isUsableLogo(url))
      ?? eventSeries
        .map((s) => (matchesSeriesOrg(s) ? mediaNodeFields(s).logoImageUrl : undefined))
        .find((url) => isUsableLogo(url))
      ?? cruiseSeries
        .map((s) => (s.operatorOrganizationId === org.id ? mediaNodeFields(s).logoImageUrl : undefined))
        .find((url) => isUsableLogo(url));

    const seriesHeader =
      clubBrands
        .map((b) => (b.operatorOrganizationId === org.id ? mediaNodeFields(b).headerImageUrl : undefined))
        .find((url) => isUsableHeader(url))
      ?? eventSeries
        .map((s) => (matchesSeriesOrg(s) ? mediaNodeFields(s).headerImageUrl : undefined))
        .find((url) => isUsableHeader(url))
      ?? cruiseSeries
        .map((s) => (s.operatorOrganizationId === org.id ? mediaNodeFields(s).headerImageUrl : undefined))
        .find((url) => isUsableHeader(url));

    const childEvents = childEventsByOrgId.get(org.id) ?? [];
    const sigCounts = new Map<string, { count: number; url: string }>();
    for (const ev of childEvents) {
      const candidateUrl = mediaNodeFields(ev).logoImageUrl?.trim();
      if (!candidateUrl || !isUsableLogo(candidateUrl)) continue;
      const sig = getCanonicalMediaSignature(candidateUrl);
      if (!sig) continue;
      const prev = sigCounts.get(sig);
      if (prev) prev.count += 1;
      else sigCounts.set(sig, { count: 1, url: candidateUrl });
    }
    let sharedEventLogo: string | undefined;
    let bestCount = 0;
    for (const { count, url } of sigCounts.values()) {
      if (count >= 2 && count > bestCount) {
        bestCount = count;
        sharedEventLogo = url;
      }
    }

    // If >= 2 child events share the same non-overridden brand logo, that is the active canonical host logo.
    // Otherwise, only fall back to seriesLogo / mockFallbackLogo when the organization has no usable logo.
    const inferredLogo = sharedEventLogo || (isUsableLogo(currentLogo) ? currentLogo : (seriesLogo || mockFallbackLogo));
    const inferredHeader = isUsableHeader(currentHeader) ? currentHeader : (seriesHeader || mockFallbackHeader);

    if (
      (inferredLogo && inferredLogo !== org.logoImageUrl)
      || (inferredHeader && inferredHeader !== org.headerImageUrl)
    ) {
      return {
        ...org,
        ...(inferredLogo ? { logoImageUrl: inferredLogo } : {}),
        ...(inferredHeader ? { headerImageUrl: inferredHeader } : {}),
      };
    }
    return org;
  });
};

type BuiltNodeMaps = {
  nodeByKey: Map<string, MediaNode>;
  neighborsByKey: Map<string, EntityRef[]>;
  clubs: ClubData[];
  events: EventData[];
  venues: VenueData[];
  organizations: OrganizationData[];
  relationships: OrganizationVenueRelationship[];
  eventSeries: EventSeriesData[];
  clubBrands: ClubBrandData[];
  resorts: ResortData[];
  cruiseSeries: CruiseSeriesData[];
  cruiseSailings: CruiseSailingData[];
};

const NODE_MAPS_CACHE_LIMIT = 6;
const nodeMapsCache: Array<{ catalog: BrandMediaCatalog; maps: BuiltNodeMaps }> = [];

const isSameCatalogInputs = (a: BrandMediaCatalog, b: BrandMediaCatalog): boolean =>
  a.listings === b.listings
  && a.venues === b.venues
  && a.organizations === b.organizations
  && a.relationships === b.relationships
  && a.eventSeries === b.eventSeries
  && a.clubBrands === b.clubBrands
  && a.resorts === b.resorts
  && a.cruiseSeries === b.cruiseSeries
  && a.cruiseSailings === b.cruiseSailings;

const buildNodeMaps = (catalog: BrandMediaCatalog): BuiltNodeMaps => {
  const cached = nodeMapsCache.find((entry) => isSameCatalogInputs(entry.catalog, catalog));
  if (cached) return cached.maps;

  const listings = catalog.listings ?? [];
  const venues = catalog.venues ?? [];
  const organizations = hydrateOrganizationsFromCatalog(catalog);
  const eventSeries = catalog.eventSeries ?? [];
  const clubBrands = catalog.clubBrands ?? [];
  const resorts = catalog.resorts ?? [];
  const cruiseSeries = catalog.cruiseSeries ?? [];
  const cruiseSailings = catalog.cruiseSailings ?? [];

  const nodeByKey = new Map<string, MediaNode>();
  const add = (node: MediaNode) => nodeByKey.set(refKey(node), node);

  for (const listing of listings) {
    add({
      type: listing.type,
      id: listing.id,
      name: listing.name,
      ...mediaNodeFields(listing),
    });
  }
  for (const venue of venues) add({ type: 'venue', id: venue.id, name: venue.name, ...mediaNodeFields(venue) });
  for (const organization of organizations) add({ type: 'organization', id: organization.id, name: organization.name, ...mediaNodeFields(organization) });
  for (const series of eventSeries) add({ type: 'event_series', id: series.id, name: series.name, ...mediaNodeFields(series) });
  for (const brand of clubBrands) add({ type: 'club_brand', id: brand.id, name: brand.name, ...mediaNodeFields(brand) });
  for (const resort of resorts) add({ type: 'resort', id: resort.id, name: resort.name, ...mediaNodeFields(resort) });
  for (const series of cruiseSeries) add({ type: 'cruise_series', id: series.id, name: series.name, ...mediaNodeFields(series) });
  for (const sailing of cruiseSailings) add({ type: 'cruise_sailing', id: sailing.id, name: sailing.name, ...mediaNodeFields(sailing) });

  const maps: BuiltNodeMaps = {
    nodeByKey,
    neighborsByKey: new Map<string, EntityRef[]>(),
    clubs: listings.filter((listing): listing is ClubData => listing.type === 'club'),
    events: listings.filter((listing): listing is EventData => listing.type === 'event'),
    venues,
    organizations,
    relationships: catalog.relationships ?? [],
    eventSeries,
    clubBrands,
    resorts,
    cruiseSeries,
    cruiseSailings,
  };

  nodeMapsCache.unshift({ catalog: { ...catalog }, maps });
  if (nodeMapsCache.length > NODE_MAPS_CACHE_LIMIT) {
    nodeMapsCache.pop();
  }
  return maps;
};

const computeNeighbors = (
  ref: EntityRef,
  maps: BuiltNodeMaps,
): EntityRef[] => {
  const {
    clubs,
    events,
    venues,
    organizations,
    relationships,
    eventSeries,
    clubBrands,
    resorts,
    cruiseSeries,
    cruiseSailings,
  } = maps;

  switch (ref.type) {
    case 'club': {
      const club = clubs.find((item) => item.id === ref.id);
      if (!club) return [];
      return uniqueRefs([
        ...(club.clubBrandId ? [{ type: 'club_brand' as const, id: club.clubBrandId }] : []),
        ...(club.ownerOrganizationId ? [{ type: 'organization' as const, id: club.ownerOrganizationId }] : []),
        ...(club.primaryVenueId ? [{ type: 'venue' as const, id: club.primaryVenueId }] : []),
      ]);
    }
    case 'venue': {
      const venueRelationships = relationships
        .filter((relationship) => relationship.venueId === ref.id)
        .sort((a, b) => relationshipPriority(a) - relationshipPriority(b));
      return uniqueRefs([
        ...venueRelationships.map((relationship) => ({ type: 'organization' as const, id: relationship.organizationId })),
        ...clubs.filter((club) => club.primaryVenueId === ref.id).map((club) => ({ type: 'club' as const, id: club.id })),
        ...eventSeries.filter((series) => series.defaultVenueId === ref.id).map((series) => ({ type: 'event_series' as const, id: series.id })),
      ]);
    }
    case 'organization': {
      const org = organizations.find((item) => item.id === ref.id);
      const primaryRelationships = relationships
        .filter((relationship) => relationship.organizationId === ref.id)
        .sort((a, b) => relationshipPriority(a) - relationshipPriority(b));
      return uniqueRefs([
        ...clubBrands.filter((brand) => brand.operatorOrganizationId === ref.id).map((brand) => ({ type: 'club_brand' as const, id: brand.id })),
        ...clubs.filter((club) => club.ownerOrganizationId === ref.id).map((club) => ({ type: 'club' as const, id: club.id })),
        ...eventSeries
          .filter(
            (series) =>
              series.organizerOrganizationId === ref.id
              || (!series.organizerOrganizationId && org && (series.slug === org.slug || normalizeHostName(series.name) === normalizeHostName(org.name))),
          )
          .map((series) => ({ type: 'event_series' as const, id: series.id })),
        ...primaryRelationships.map((relationship) => ({ type: 'venue' as const, id: relationship.venueId })),
        ...events.filter((event) => event.organizerOrganizationId === ref.id).map((event) => ({ type: 'event' as const, id: event.id })),
        ...resorts.filter((resort) => resort.operatorOrganizationId === ref.id).map((resort) => ({ type: 'resort' as const, id: resort.id })),
        ...cruiseSeries.filter((series) => series.operatorOrganizationId === ref.id).map((series) => ({ type: 'cruise_series' as const, id: series.id })),
      ]);
    }
    case 'event': {
      const event = events.find((item) => item.id === ref.id);
      if (!event) return [];
      const collections = {
        listings: [...clubs, ...events],
        venues,
        organizations,
        relationships,
      };
      const organizerOrganizationId = resolveEventOrganizerOrganizationId(event, collections);
      const venueId = resolveEventVenueId(event, collections);
      return uniqueRefs([
        ...(organizerOrganizationId ? [{ type: 'organization' as const, id: organizerOrganizationId }] : []),
        ...(event.eventSeriesId ? [{ type: 'event_series' as const, id: event.eventSeriesId }] : []),
        ...(venueId ? [{ type: 'venue' as const, id: venueId }] : []),
      ]);
    }
    case 'event_series': {
      const series = eventSeries.find((item) => item.id === ref.id);
      if (!series) return [];
      const inferredOrganizerId =
        series.organizerOrganizationId
        || organizations.find(
          (org) => org.slug === series.slug || normalizeHostName(org.name) === normalizeHostName(series.name),
        )?.id;
      return uniqueRefs([
        ...(inferredOrganizerId ? [{ type: 'organization' as const, id: inferredOrganizerId }] : []),
        ...(series.defaultVenueId ? [{ type: 'venue' as const, id: series.defaultVenueId }] : []),
        ...events.filter((event) => event.eventSeriesId === ref.id).map((event) => ({ type: 'event' as const, id: event.id })),
      ]);
    }
    case 'club_brand': {
      const brand = clubBrands.find((item) => item.id === ref.id);
      if (!brand) return [];
      return uniqueRefs([
        ...(brand.operatorOrganizationId ? [{ type: 'organization' as const, id: brand.operatorOrganizationId }] : []),
        ...clubs.filter((club) => club.clubBrandId === ref.id).map((club) => ({ type: 'club' as const, id: club.id })),
      ]);
    }
    case 'resort': {
      const resort = resorts.find((item) => item.id === ref.id);
      return resort?.operatorOrganizationId ? [{ type: 'organization', id: resort.operatorOrganizationId }] : [];
    }
    case 'cruise_series': {
      const series = cruiseSeries.find((item) => item.id === ref.id);
      if (!series) return [];
      return uniqueRefs([
        ...(series.operatorOrganizationId ? [{ type: 'organization' as const, id: series.operatorOrganizationId }] : []),
        ...cruiseSailings.filter((sailing) => sailing.cruiseSeriesId === ref.id).map((sailing) => ({ type: 'cruise_sailing' as const, id: sailing.id })),
      ]);
    }
    case 'cruise_sailing': {
      const sailing = cruiseSailings.find((item) => item.id === ref.id);
      return sailing ? [{ type: 'cruise_series', id: sailing.cruiseSeriesId }] : [];
    }
    default:
      return [];
  }
};

const getNeighbors = (ref: EntityRef, maps: BuiltNodeMaps): EntityRef[] => {
  const key = refKey(ref);
  const cached = maps.neighborsByKey.get(key);
  if (cached) return cached;
  const computed = computeNeighbors(ref, maps);
  maps.neighborsByKey.set(key, computed);
  return computed;
};

const searchGraphForRole = (
  target: EntityRef,
  catalog: BrandMediaCatalog,
  role: 'logo' | 'header',
  maxDepth: number,
  options: { skipTargetMedia?: boolean; excludeTypes?: BrandMediaEntityType[] } = {},
): BrandMediaResolution => {
  const maps = buildNodeMaps(catalog);
  const start = maps.nodeByKey.get(refKey(target));
  if (!start) return { inherited: false, depth: 0 };

  const queue: Array<{ ref: EntityRef; depth: number }> = [{ ref: target, depth: 0 }];
  const visited = new Set<string>();

  const excludedTypes = new Set(options.excludeTypes ?? []);

  while (queue.length) {
    const current = queue.shift()!;
    const key = refKey(current.ref);
    if (visited.has(key)) continue;
    visited.add(key);

    const node = maps.nodeByKey.get(key);
    if (!node) continue;
    const mayUseNodeMedia = !excludedTypes.has(node.type)
      && !(options.skipTargetMedia && current.depth === 0);
    if (mayUseNodeMedia) {
      const candidate = role === 'logo' ? node.logoImageUrl : node.headerImageUrl;
      const usable = role === 'logo' ? isUsableLogo(candidate) : isUsableHeader(candidate);
      if (usable && candidate) {
        return {
          url: candidate,
          sourceType: node.type,
          sourceId: node.id,
          sourceName: node.name,
          sourceRole: role,
          inherited: current.depth > 0,
          depth: current.depth,
        };
      }
    }

    if (current.depth >= maxDepth) continue;
    for (const neighbor of getNeighbors(current.ref, maps)) {
      if (excludedTypes.has(neighbor.type)) continue;
      if (!visited.has(refKey(neighbor))) queue.push({ ref: neighbor, depth: current.depth + 1 });
    }
  }

  return { inherited: false, depth: 0 };
};

export const extractCloudflareExternalIdFromUrl = (url?: string | null): string | null => {
  if (!url) return null;
  return url.match(/imagedelivery\.net\/[^/]+\/([^/?#]+)/i)?.[1]?.trim() ?? null;
};

export const getCanonicalMediaSignature = (url?: string | null, externalId?: string | null): string | null => {
  if (externalId?.trim()) return `cf:${externalId.trim().toLowerCase()}`;
  const cfId = extractCloudflareExternalIdFromUrl(url);
  if (cfId) return `cf:${cfId.toLowerCase()}`;
  const trimmed = url?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return `url:${parsed.origin.toLowerCase()}${parsed.pathname}`;
  } catch {
    return `url:${trimmed.toLowerCase()}`;
  }
};

export type EventLogoInheritanceMode = 'explicit_override' | 'inherited_host' | 'fallback';

export type EventLogoInheritanceState = {
  mode: EventLogoInheritanceMode;
  resolvedLogo: BrandMediaResolution;
  directEventLogo: BrandMediaResolution;
  inheritedHostLogo: BrandMediaResolution;
  hasRedundantOccurrenceCopy: boolean;
};

export const resolveEventLogoState = (
  event: EventData,
  catalog: BrandMediaCatalog,
): EventLogoInheritanceState => {
  const target: EntityRef = { type: 'event', id: event.id };
  const catalogWithEvent: BrandMediaCatalog = {
    ...catalog,
    listings: catalog.listings?.some((item) => item.id === event.id)
      ? catalog.listings
      : [...(catalog.listings ?? []), event],
  };

  const directEventLogo = searchGraphForRole(target, catalogWithEvent, 'logo', 0);
  const inheritedRes = searchGraphForRole(target, catalogWithEvent, 'logo', 4, {
    skipTargetMedia: true,
    excludeTypes: ['event'],
  });
  const inheritedHostLogo: BrandMediaResolution = inheritedRes.url
    ? {
        ...inheritedRes,
        inherited: true,
        depth: Math.max(1, inheritedRes.depth),
      }
    : { inherited: false, depth: 0 };

  const directLogoAsset = event.mediaAssets?.find((item) => item.role === 'logo' && item.external_id?.trim());
  const directSig = getCanonicalMediaSignature(directEventLogo.url, directLogoAsset?.external_id);
  const inheritedSig = getCanonicalMediaSignature(inheritedHostLogo.url);

  const isSameAsInherited = Boolean(directSig && inheritedSig && directSig === inheritedSig);
  const hasRedundantOccurrenceCopy = Boolean(directEventLogo.url && inheritedHostLogo.url && isSameAsInherited && event.logoOverride !== true);

  // Precedence: Explicit event override -> Parent host/series/venue asset -> Fallback
  if (event.logoOverride !== false && directEventLogo.url) {
    const isExplicitOverride =
      event.logoOverride === true
      || !inheritedHostLogo.url
      || (Boolean(directSig && inheritedSig) && directSig !== inheritedSig);
    if (isExplicitOverride) {
      const resolved: BrandMediaResolution = {
        ...directEventLogo,
        inherited: false,
        depth: 0,
      };
      return {
        mode: 'explicit_override',
        resolvedLogo: resolved,
        directEventLogo: resolved,
        inheritedHostLogo,
        hasRedundantOccurrenceCopy: false,
      };
    }
  }

  if (inheritedHostLogo.url) {
    return {
      mode: 'inherited_host',
      resolvedLogo: inheritedHostLogo,
      directEventLogo,
      inheritedHostLogo,
      hasRedundantOccurrenceCopy,
    };
  }

  if (directEventLogo.url && event.logoOverride !== false) {
    const resolved: BrandMediaResolution = {
      ...directEventLogo,
      inherited: false,
      depth: 0,
    };
    return {
      mode: 'explicit_override',
      resolvedLogo: resolved,
      directEventLogo: resolved,
      inheritedHostLogo,
      hasRedundantOccurrenceCopy: false,
    };
  }

  return {
    mode: 'fallback',
    resolvedLogo: { inherited: false, depth: 0 },
    directEventLogo,
    inheritedHostLogo,
    hasRedundantOccurrenceCopy: false,
  };
};

export const resolveBrandLogo = (
  targetType: BrandMediaEntityType,
  targetId: string,
  catalog: BrandMediaCatalog,
): BrandMediaResolution => {
  const target: EntityRef = { type: targetType, id: targetId };

  if (targetType === 'event') {
    const eventEntity = catalog.listings?.find(
      (item): item is EventData => item.type === 'event' && item.id === targetId,
    );
    if (eventEntity) {
      return resolveEventLogoState(eventEntity, catalog).resolvedLogo;
    }

    const inheritedLogo = searchGraphForRole(target, catalog, 'logo', 4, {
      skipTargetMedia: true,
      excludeTypes: ['event'],
    });
    const eventLogo = searchGraphForRole(target, catalog, 'logo', 0);
    const eventSig = getCanonicalMediaSignature(eventLogo.url);
    const inheritedSig = getCanonicalMediaSignature(inheritedLogo.url);

    if (eventLogo.url && (!inheritedLogo.url || (eventSig && inheritedSig && eventSig !== inheritedSig))) {
      return {
        ...eventLogo,
        inherited: false,
        depth: 0,
      };
    }

    if (inheritedLogo.url) {
      return {
        ...inheritedLogo,
        inherited: true,
        depth: Math.max(1, inheritedLogo.depth),
      };
    }

    return eventLogo;
  }

  return searchGraphForRole(target, catalog, 'logo', 4);
};

export const resolveBrandHeader = (
  targetType: BrandMediaEntityType,
  targetId: string,
  catalog: BrandMediaCatalog,
): BrandMediaResolution => searchGraphForRole({ type: targetType, id: targetId }, catalog, 'header', 4);

export const brandMediaSourceLabel = (resolution: BrandMediaResolution): string | undefined => {
  if (!resolution.url || !resolution.inherited || !resolution.sourceName) return undefined;
  return `Inherited from ${resolution.sourceName}`;
};

