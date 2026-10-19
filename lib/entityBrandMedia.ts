import {
  getCloudflareImageUrl,
  getHeroCloudflareImageUrl,
  normalizeHeroDeliveryUrl,
} from './media/getCloudflareImageUrl';
import {
  encodeHeroCropToUrl,
  resolveEntityHeroCrop,
  stripHeroCropFromUrl,
  type HeroCropConfig,
} from './media/heroCrop';
import {
  isSyntheticHostOrganization,
  resolveEventOrganizerOrganizationId,
  resolveEventVenueId,
} from './entityCompatibility';
import { clubKey, matchesClubVenueKey, normalizeHostName } from './identityUtils';
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

type UploadedMediaAssetInput = {
  role?: string;
  external_id?: string;
  focal_point_x?: number | null;
  focal_point_y?: number | null;
  hero_crop?: HeroCropConfig | null;
  source_width?: number | null;
  source_height?: number | null;
};

type MediaBearingEntity = {
  logoImageUrl?: string;
  headerImageUrl?: string;
  heroCrop?: Partial<HeroCropConfig> | null;
  mediaAssets?: UploadedMediaAssetInput[];
};

const resolveSingleAssetMediaUrl = (
  asset: UploadedMediaAssetInput,
  roleOverride?: string,
  fallbackHeaderUrl?: string,
  entityCrop?: Partial<HeroCropConfig> | null,
): string | undefined => {
  const externalId = asset.external_id?.trim();
  if (!externalId) return undefined;
  const role = roleOverride || asset.role || 'hero';
  if (role === 'logo') {
    return getCloudflareImageUrl({ externalId, variant: 'logosquare' }) ?? undefined;
  }
  if (role === 'avatar') {
    return getCloudflareImageUrl({ externalId, variant: 'avatarsquare' }) ?? undefined;
  }
  if (role === 'flyer') {
    return getCloudflareImageUrl({ externalId, variant: 'flyerpage' }) ?? undefined;
  }
  if (role === 'gallery') {
    return getCloudflareImageUrl({ externalId, variant: 'gallerypage' }) ?? undefined;
  }
  const crop = resolveEntityHeroCrop(
    {
      headerImageUrl: fallbackHeaderUrl,
      heroCrop: asset.hero_crop ?? entityCrop ?? (
        asset.source_width && asset.source_height
          ? { sourceWidth: asset.source_width, sourceHeight: asset.source_height }
          : null
      ),
      mediaAssets: [asset as any],
    },
    fallbackHeaderUrl,
  );
  return getHeroCloudflareImageUrl(externalId, crop) ?? undefined;
};

export function resolveUploadedMediaUrl(asset: UploadedMediaAssetInput, role?: string): string;
export function resolveUploadedMediaUrl(entity: MediaBearingEntity, role: 'logo' | 'hero'): string | undefined;
export function resolveUploadedMediaUrl(
  input: UploadedMediaAssetInput | MediaBearingEntity,
  role?: string,
): string | undefined {
  if ('external_id' in input && typeof input.external_id === 'string') {
    return resolveSingleAssetMediaUrl(input, role) ?? '';
  }
  const entity = input as MediaBearingEntity;
  const targetRole = (role ?? 'hero') as 'logo' | 'hero';
  const matching = (entity.mediaAssets ?? []).filter((item) => item.role === targetRole && item.external_id?.trim());
  const asset = matching[matching.length - 1];
  if (!asset) return undefined;
  return resolveSingleAssetMediaUrl(asset, targetRole, entity.headerImageUrl, entity.heroCrop);
}

const mediaNodeFields = (entity: MediaBearingEntity) => {
  const crop = resolveEntityHeroCrop(entity as any, entity.headerImageUrl);
  const directHeader = entity.headerImageUrl
    ? normalizeHeroDeliveryUrl(entity.headerImageUrl, crop)
    : undefined;
  const uploadedHeader = resolveUploadedMediaUrl(entity, 'hero');
  return {
    logoImageUrl: resolveUploadedMediaUrl(entity, 'logo') ?? entity.logoImageUrl,
    headerImageUrl: directHeader || uploadedHeader,
  };
};

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

const collectForeignClubAndOrgLogoSignatures = (
  targetOrgId: string | undefined,
  clubs: ClubData[],
  organizations: OrganizationData[],
): Set<string> => {
  const sigs = new Set<string>();
  if (!targetOrgId) return sigs;
  for (const club of clubs) {
    if (!club.ownerOrganizationId || club.ownerOrganizationId === targetOrgId) continue;
    const sig = getCanonicalMediaSignature(mediaNodeFields(club).logoImageUrl);
    if (sig) sigs.add(sig);
  }
  for (const org of organizations) {
    if (org.id === targetOrgId) continue;
    const sig = getCanonicalMediaSignature(mediaNodeFields(org).logoImageUrl);
    if (sig) sigs.add(sig);
  }
  return sigs;
};

export const isEventAffirmativelyClubOperated = (
  event: EventData,
  collections: {
    clubs: ClubData[];
    venues: VenueData[];
    organizations: OrganizationData[];
    relationships: OrganizationVenueRelationship[];
    eventSeries?: EventSeriesData[];
  },
): boolean => {
  const { clubs, venues, organizations, relationships, eventSeries } = collections;
  const fullCollections = {
    listings: clubs as Listing[],
    venues,
    organizations,
    relationships,
    eventSeries,
  };
  const venueId = resolveEventVenueId(event, fullCollections);
  const venueClub = clubs.find(
    (club) =>
      (venueId && (club.primaryVenueId === venueId || `venue-${club.id}` === venueId))
      || matchesClubVenueKey(club, event.venueKey),
  );
  if (!venueClub) return false;

  const organizerId = resolveEventOrganizerOrganizationId(event, fullCollections);
  if (organizerId) {
    return Boolean(venueClub.ownerOrganizationId && organizerId === venueClub.ownerOrganizationId);
  }

  if (event.eventSeriesId) return false;

  const normHost = normalizeHostName(event.hostName ?? '');
  if (!normHost) return false;

  if (normHost === normalizeHostName(venueClub.name)) return true;
  if (venueClub.ownerOrganizationId) {
    const clubOrg = organizations.find((org) => org.id === venueClub.ownerOrganizationId);
    if (clubOrg && normHost === normalizeHostName(clubOrg.name)) return true;
  }
  return false;
};

export const hydrateOrganizationsFromCatalog = (catalog: BrandMediaCatalog): OrganizationData[] => {
  const orgMap = new Map<string, OrganizationData>();
  const hasExplicitOrgs = Boolean(catalog.organizations && catalog.organizations.length > 0);
  if (!hasExplicitOrgs) {
    for (const org of mockOrganizations) {
      orgMap.set(org.id, { ...org });
    }
  }
  for (const org of catalog.organizations ?? []) {
    const existing = orgMap.get(org.id) ?? mockOrgById.get(org.id);
    const hasExplicitLogoField = Object.prototype.hasOwnProperty.call(org, 'logoImageUrl');
    orgMap.set(org.id, {
      ...(existing ?? {}),
      ...org,
      logoImageUrl: org.logoImageUrl?.trim() || (hasExplicitLogoField && org.logoImageUrl === '' ? undefined : existing?.logoImageUrl),
      headerImageUrl: org.headerImageUrl?.trim() || existing?.headerImageUrl,
    });
  }

  const organizations = Array.from(orgMap.values());
  const clubs = (catalog.listings ?? []).filter((item): item is ClubData => item.type === 'club');
  const events = (catalog.listings ?? []).filter((item): item is EventData => item.type === 'event');
  const cruiseSeries = catalog.cruiseSeries ?? [];
  const eventSeries = catalog.eventSeries ?? [];
  const clubBrands = catalog.clubBrands ?? [];
  const collections = {
    listings: catalog.listings ?? [],
    venues: catalog.venues ?? [],
    organizations,
    relationships: catalog.relationships ?? [],
    eventSeries,
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
    const foreignLogoSigs = collectForeignClubAndOrgLogoSignatures(org.id, clubs, organizations);

    const ownedClubs = clubs.filter((club) => club.ownerOrganizationId === org.id);
    const singleOwnedClub = ownedClubs.length === 1 && !ownedClubs[0].clubBrandId ? ownedClubs[0] : undefined;
    const ownedClubLogo = singleOwnedClub ? mediaNodeFields(singleOwnedClub).logoImageUrl?.trim() : undefined;
    const ownedClubHasMediaLogo = Boolean(singleOwnedClub?.mediaAssets?.some((asset) => asset.role === 'logo'));
    const orgHasMediaLogo = Boolean(org.mediaAssets?.some((asset) => asset.role === 'logo'));
    const preferOwnedClubLogo =
      isUsableLogo(ownedClubLogo)
      && !orgHasMediaLogo
      && (ownedClubHasMediaLogo || !isUsableLogo(currentLogo))
      && (!currentLogo || currentLogo === mockFallbackLogo);

    const isUncontaminatedLogo = (url?: string | null) => {
      if (!isUsableLogo(url)) return false;
      const sig = getCanonicalMediaSignature(url);
      return !(sig && foreignLogoSigs.has(sig));
    };

    const matchesSeriesOrg = (s: EventSeriesData) =>
      s.organizerOrganizationId === org.id
      || (!s.organizerOrganizationId && (s.slug === org.slug || normalizeHostName(s.name) === normOrgName));

    const seriesLogo =
      clubBrands
        .map((b) => (b.operatorOrganizationId === org.id ? mediaNodeFields(b).logoImageUrl : undefined))
        .find((url) => isUncontaminatedLogo(url))
      ?? eventSeries
        .map((s) => (matchesSeriesOrg(s) ? mediaNodeFields(s).logoImageUrl : undefined))
        .find((url) => isUncontaminatedLogo(url))
      ?? cruiseSeries
        .map((s) => (s.operatorOrganizationId === org.id ? mediaNodeFields(s).logoImageUrl : undefined))
        .find((url) => isUncontaminatedLogo(url));

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
      if (!candidateUrl || !isUncontaminatedLogo(candidateUrl)) continue;
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

    // An explicit usable organization logo is authoritative unless the organization still holds
    // an un-updated mock fallback while its 1:1 owned club has a newer canonical logo.
    const inferredLogo = preferOwnedClubLogo
      ? ownedClubLogo
      : isUsableLogo(currentLogo)
        ? currentLogo
        : (ownedClubLogo || seriesLogo || sharedEventLogo || mockFallbackLogo);
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
  const clubs = listings.filter((listing): listing is ClubData => listing.type === 'club');
  const events = listings.filter((listing): listing is EventData => listing.type === 'event');
  const venues = catalog.venues ?? [];
  const organizations = hydrateOrganizationsFromCatalog(catalog);
  const orgById = new Map(organizations.map((org) => [org.id, org]));
  const eventSeries = catalog.eventSeries ?? [];
  const clubBrands = catalog.clubBrands ?? [];
  const resorts = catalog.resorts ?? [];
  const cruiseSeries = catalog.cruiseSeries ?? [];
  const cruiseSailings = catalog.cruiseSailings ?? [];

  const nodeByKey = new Map<string, MediaNode>();
  const add = (node: MediaNode) => nodeByKey.set(refKey(node), node);

  for (const listing of listings) {
    const fields = mediaNodeFields(listing);
    if (listing.type === 'club' && listing.ownerOrganizationId && !listing.clubBrandId) {
      const ownerOrg = orgById.get(listing.ownerOrganizationId);
      const ownedCount = clubs.filter((c) => c.ownerOrganizationId === listing.ownerOrganizationId).length;
      const mockLogo = mockOrgById.get(listing.ownerOrganizationId)?.logoImageUrl;
      const orgLogo = ownerOrg ? mediaNodeFields(ownerOrg).logoImageUrl?.trim() : undefined;
      const clubHasMediaLogo = Boolean(listing.mediaAssets?.some((asset) => asset.role === 'logo'));
      if (
        ownedCount === 1
        && isUsableLogo(orgLogo)
        && (!isUsableLogo(fields.logoImageUrl) || (!clubHasMediaLogo && fields.logoImageUrl === mockLogo && orgLogo !== mockLogo))
      ) {
        fields.logoImageUrl = orgLogo;
      }
    }
    add({
      type: listing.type,
      id: listing.id,
      name: listing.name,
      ...fields,
    });
  }
  for (const venue of venues) add({ type: 'venue', id: venue.id, name: venue.name, ...mediaNodeFields(venue) });
  for (const organization of organizations) add({ type: 'organization', id: organization.id, name: organization.name, ...mediaNodeFields(organization) });
  for (const series of eventSeries) {
    const fields = mediaNodeFields(series);
    const seriesOrgId =
      series.organizerOrganizationId
      || organizations.find(
        (org) => org.slug === series.slug || normalizeHostName(org.name) === normalizeHostName(series.name),
      )?.id;
    const foreignLogoSigs = collectForeignClubAndOrgLogoSignatures(seriesOrgId, clubs, organizations);
    const seriesLogoSig = getCanonicalMediaSignature(fields.logoImageUrl);
    const sanitizedLogo = seriesLogoSig && foreignLogoSigs.has(seriesLogoSig) ? undefined : fields.logoImageUrl;
    add({
      type: 'event_series',
      id: series.id,
      name: series.name,
      logoImageUrl: sanitizedLogo,
      headerImageUrl: fields.headerImageUrl,
    });
  }
  for (const brand of clubBrands) add({ type: 'club_brand', id: brand.id, name: brand.name, ...mediaNodeFields(brand) });
  for (const resort of resorts) add({ type: 'resort', id: resort.id, name: resort.name, ...mediaNodeFields(resort) });
  for (const series of cruiseSeries) add({ type: 'cruise_series', id: series.id, name: series.name, ...mediaNodeFields(series) });
  for (const sailing of cruiseSailings) add({ type: 'cruise_sailing', id: sailing.id, name: sailing.name, ...mediaNodeFields(sailing) });

  const maps: BuiltNodeMaps = {
    nodeByKey,
    neighborsByKey: new Map<string, EntityRef[]>(),
    clubs,
    events,
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
      // A venue may only connect to its owner_operator organization and primary club,
      // never to tenant promoters or recurring series sharing the venue.
      const ownerRelationships = relationships
        .filter((relationship) => relationship.venueId === ref.id && relationship.relationshipType === 'owner_operator')
        .sort((a, b) => relationshipPriority(a) - relationshipPriority(b));
      return uniqueRefs([
        ...ownerRelationships.map((relationship) => ({ type: 'organization' as const, id: relationship.organizationId })),
        ...clubs.filter((club) => club.primaryVenueId === ref.id).map((club) => ({ type: 'club' as const, id: club.id })),
      ]);
    }
    case 'organization': {
      const org = organizations.find((item) => item.id === ref.id);
      const ownerVenueRelationships = relationships
        .filter((relationship) => relationship.organizationId === ref.id && relationship.relationshipType === 'owner_operator')
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
        ...ownerVenueRelationships.map((relationship) => ({ type: 'venue' as const, id: relationship.venueId })),
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
        eventSeries,
      };
      const organizerOrganizationId = resolveEventOrganizerOrganizationId(event, collections);
      const venueId = resolveEventVenueId(event, collections);
      const clubOperated = isEventAffirmativelyClubOperated(event, {
        clubs,
        venues,
        organizations,
        relationships,
        eventSeries,
      });

      const series = event.eventSeriesId ? eventSeries.find((item) => item.id === event.eventSeriesId) : undefined;
      const organizer = organizerOrganizationId ? organizations.find((item) => item.id === organizerOrganizationId) : undefined;
      const isDistinctSeriesBrand = Boolean(
        series
        && (!organizer || normalizeHostName(series.name) !== normalizeHostName(organizer.name)),
      );

      const orderedParentRefs: EntityRef[] = isDistinctSeriesBrand
        ? [
            ...(event.eventSeriesId ? [{ type: 'event_series' as const, id: event.eventSeriesId }] : []),
            ...(organizerOrganizationId ? [{ type: 'organization' as const, id: organizerOrganizationId }] : []),
          ]
        : [
            ...(organizerOrganizationId ? [{ type: 'organization' as const, id: organizerOrganizationId }] : []),
            ...(event.eventSeriesId ? [{ type: 'event_series' as const, id: event.eventSeriesId }] : []),
          ];

      return uniqueRefs([
        ...orderedParentRefs,
        ...(clubOperated && venueId ? [{ type: 'venue' as const, id: venueId }] : []),
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
      const venueClub = series.defaultVenueId
        ? clubs.find((club) => club.primaryVenueId === series.defaultVenueId || `venue-${club.id}` === series.defaultVenueId)
        : undefined;
      const isClubOwnedSeries = Boolean(
        venueClub && inferredOrganizerId && venueClub.ownerOrganizationId === inferredOrganizerId,
      );
      return uniqueRefs([
        ...(inferredOrganizerId ? [{ type: 'organization' as const, id: inferredOrganizerId }] : []),
        ...(isClubOwnedSeries && series.defaultVenueId ? [{ type: 'venue' as const, id: series.defaultVenueId }] : []),
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
  const trimmed = stripHeroCropFromUrl(url);
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return `url:${parsed.origin.toLowerCase()}${parsed.pathname}`;
  } catch {
    return `url:${trimmed.split('#')[0].split('?')[0].toLowerCase()}`;
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

  const hasRedundantOccurrenceCopy = Boolean(
    directEventLogo.url && inheritedHostLogo.url && event.logoOverride !== true,
  );

  // 1. Intentional event-specific logo override (logoOverride === true) takes priority
  if (event.logoOverride === true && directEventLogo.url) {
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

  // 2-4. Inherited canonical series / organizer / club-operated logo
  if (inheritedHostLogo.url) {
    return {
      mode: 'inherited_host',
      resolvedLogo: inheritedHostLogo,
      directEventLogo,
      inheritedHostLogo,
      hasRedundantOccurrenceCopy,
    };
  }

  // 5. Preserve existing direct event imagery when safe (never borrow a foreign venue club logo)
  if (directEventLogo.url && event.logoOverride !== false) {
    const maps = buildNodeMaps(catalogWithEvent);
    const clubOperated = isEventAffirmativelyClubOperated(event, {
      clubs: maps.clubs,
      venues: maps.venues,
      organizations: maps.organizations,
      relationships: maps.relationships,
      eventSeries: maps.eventSeries,
    });
    const directSig = getCanonicalMediaSignature(
      directEventLogo.url,
      event.mediaAssets?.find((item) => item.role === 'logo' && item.external_id?.trim())?.external_id,
    );
    const venueId = resolveEventVenueId(event, {
      listings: [...maps.clubs, ...maps.events],
      venues: maps.venues,
      organizations: maps.organizations,
      relationships: maps.relationships,
      eventSeries: maps.eventSeries,
    });
    const venueClub = maps.clubs.find(
      (club) =>
        (venueId && (club.primaryVenueId === venueId || `venue-${club.id}` === venueId))
        || matchesClubVenueKey(club, event.venueKey),
    );
    const venueClubLogoSig = venueClub
      ? getCanonicalMediaSignature(mediaNodeFields(venueClub).logoImageUrl)
      : null;

    if (!(!clubOperated && directSig && venueClubLogoSig && directSig === venueClubLogoSig)) {
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

    if (inheritedLogo.url) {
      return {
        ...inheritedLogo,
        inherited: true,
        depth: Math.max(1, inheritedLogo.depth),
      };
    }

    if (eventLogo.url) {
      return {
        ...eventLogo,
        inherited: false,
        depth: 0,
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

