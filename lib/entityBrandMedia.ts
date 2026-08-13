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

const refKey = (ref: EntityRef) => `${ref.type}:${ref.id}`;

export const isPlaceholderMediaUrl = (url?: string | null): boolean => {
  if (!url) return false;
  const value = url.toLowerCase();
  return value.includes('picsum.photos')
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

const buildNodeMaps = (catalog: BrandMediaCatalog) => {
  const listings = catalog.listings ?? [];
  const venues = catalog.venues ?? [];
  const organizations = catalog.organizations ?? [];
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
      logoImageUrl: listing.logoImageUrl,
      headerImageUrl: listing.headerImageUrl,
    });
  }
  for (const venue of venues) add({ type: 'venue', id: venue.id, name: venue.name, logoImageUrl: venue.logoImageUrl, headerImageUrl: venue.headerImageUrl });
  for (const organization of organizations) add({ type: 'organization', id: organization.id, name: organization.name, logoImageUrl: organization.logoImageUrl, headerImageUrl: organization.headerImageUrl });
  for (const series of eventSeries) add({ type: 'event_series', id: series.id, name: series.name, logoImageUrl: series.logoImageUrl, headerImageUrl: series.headerImageUrl });
  for (const brand of clubBrands) add({ type: 'club_brand', id: brand.id, name: brand.name, logoImageUrl: brand.logoImageUrl, headerImageUrl: brand.headerImageUrl });
  for (const resort of resorts) add({ type: 'resort', id: resort.id, name: resort.name, logoImageUrl: resort.logoImageUrl, headerImageUrl: resort.headerImageUrl });
  for (const series of cruiseSeries) add({ type: 'cruise_series', id: series.id, name: series.name, logoImageUrl: series.logoImageUrl, headerImageUrl: series.headerImageUrl });
  for (const sailing of cruiseSailings) add({ type: 'cruise_sailing', id: sailing.id, name: sailing.name, headerImageUrl: sailing.headerImageUrl });

  return {
    nodeByKey,
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
};

const getNeighbors = (
  ref: EntityRef,
  maps: ReturnType<typeof buildNodeMaps>,
): EntityRef[] => {
  const {
    clubs,
    events,
    venues,
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
      const primaryRelationships = relationships
        .filter((relationship) => relationship.organizationId === ref.id)
        .sort((a, b) => relationshipPriority(a) - relationshipPriority(b));
      return uniqueRefs([
        ...clubBrands.filter((brand) => brand.operatorOrganizationId === ref.id).map((brand) => ({ type: 'club_brand' as const, id: brand.id })),
        ...clubs.filter((club) => club.ownerOrganizationId === ref.id).map((club) => ({ type: 'club' as const, id: club.id })),
        ...eventSeries.filter((series) => series.organizerOrganizationId === ref.id).map((series) => ({ type: 'event_series' as const, id: series.id })),
        ...primaryRelationships.map((relationship) => ({ type: 'venue' as const, id: relationship.venueId })),
        ...events.filter((event) => event.organizerOrganizationId === ref.id).map((event) => ({ type: 'event' as const, id: event.id })),
        ...resorts.filter((resort) => resort.operatorOrganizationId === ref.id).map((resort) => ({ type: 'resort' as const, id: resort.id })),
        ...cruiseSeries.filter((series) => series.operatorOrganizationId === ref.id).map((series) => ({ type: 'cruise_series' as const, id: series.id })),
      ]);
    }
    case 'event': {
      const event = events.find((item) => item.id === ref.id);
      if (!event) return [];
      return uniqueRefs([
        ...(event.eventSeriesId ? [{ type: 'event_series' as const, id: event.eventSeriesId }] : []),
        ...(event.organizerOrganizationId ? [{ type: 'organization' as const, id: event.organizerOrganizationId }] : []),
        ...(event.venueId ? [{ type: 'venue' as const, id: event.venueId }] : []),
      ]);
    }
    case 'event_series': {
      const series = eventSeries.find((item) => item.id === ref.id);
      if (!series) return [];
      return uniqueRefs([
        ...(series.organizerOrganizationId ? [{ type: 'organization' as const, id: series.organizerOrganizationId }] : []),
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

const searchGraphForRole = (
  target: EntityRef,
  catalog: BrandMediaCatalog,
  role: 'logo' | 'header',
  maxDepth: number,
): BrandMediaResolution => {
  const maps = buildNodeMaps(catalog);
  const start = maps.nodeByKey.get(refKey(target));
  if (!start) return { inherited: false, depth: 0 };

  const queue: Array<{ ref: EntityRef; depth: number }> = [{ ref: target, depth: 0 }];
  const visited = new Set<string>();

  while (queue.length) {
    const current = queue.shift()!;
    const key = refKey(current.ref);
    if (visited.has(key)) continue;
    visited.add(key);

    const node = maps.nodeByKey.get(key);
    if (!node) continue;
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

    if (current.depth >= maxDepth) continue;
    for (const neighbor of getNeighbors(current.ref, maps)) {
      if (!visited.has(refKey(neighbor))) queue.push({ ref: neighbor, depth: current.depth + 1 });
    }
  }

  return { inherited: false, depth: 0 };
};

export const resolveBrandLogo = (
  targetType: BrandMediaEntityType,
  targetId: string,
  catalog: BrandMediaCatalog,
): BrandMediaResolution => {
  const target: EntityRef = { type: targetType, id: targetId };
  const logo = searchGraphForRole(target, catalog, 'logo', 4);
  if (logo.url) return logo;

  // Only use a hero/header after exhausting real logos throughout the explicit
  // relationship graph. Placeholder fixture URLs are intentionally ignored.
  return searchGraphForRole(target, catalog, 'header', 3);
};

export const brandMediaSourceLabel = (resolution: BrandMediaResolution): string | undefined => {
  if (!resolution.url || !resolution.inherited || !resolution.sourceName) return undefined;
  return `Inherited from ${resolution.sourceName}`;
};
