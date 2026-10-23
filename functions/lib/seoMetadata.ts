import listingsData from '../../data/listings.local.json';
import { mockOrganizations } from '../../data/mockOrganizations';
import { mockVenues } from '../../data/mockVenues';
import { eventSeries as defaultEventSeries } from '../../data/eventSeries';
import { resorts as defaultResorts, cruiseSeries as defaultCruiseSeries, cruiseSailings as defaultCruiseSailings } from '../../data/travelExperiences';
import {
  clubKey,
  eventKey,
  getCandidateClubKeys,
  getCandidateEventKeys,
  hasExplicitKeyParam,
  hostSlug,
  legacyClubKey,
  matchesClubVenueKey,
  nameSlug,
  normalizeHostName,
  parsePrettyKeyParam,
} from '../../lib/identityUtils';
import { slugifyPlace } from '../../lib/geoNormalize';
import { eventCanonicalSlug, eventPublicSlug } from '../../lib/eventPublicSlug';
import { VERIFIED_RESORT_PUBLIC_COORDINATES } from '../../lib/travelMarkerModel';

export const SITE_ORIGIN = 'https://swingsphere.co';
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-image-v2.png`;
export const DEFAULT_OG_IMAGE_ALT = 'SwingSphere | Global Lifestyle Discovery Platform';
export const DEFAULT_OG_WIDTH = 1200;
export const DEFAULT_OG_HEIGHT = 630;

export type SeoPayload = {
  title: string;
  description: string;
  canonicalUrl: string;
  ogType: 'website' | 'article' | 'profile';
  twitterCard: 'summary' | 'summary_large_image';
  imageUrl: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
  noIndex: boolean;
  robots?: string;
  status?: 200 | 301 | 404 | 503;
  redirectUrl?: string;
  retryAfterSeconds?: number;
  bodyHtml?: string;
  structuredData: Record<string, unknown> | Array<Record<string, unknown>>;
};

export type CityCatalogEntry = {
  slug: string;
  name: string;
  region: string;
  country: string;
  clubs: any[];
  events: any[];
  lastmod?: string;
};

export type ListingCatalog = {
  clubsByKey: Map<string, any>;
  clubRedirectByKey: Map<string, any>;
  clubsById: Map<string, any>;
  clubsBySlug: Map<string, any>;
  unambiguousClubBySlug: Map<string, any>;
  eventsByKey: Map<string, any>;
  eventsByPublicSlug: Map<string, any>;
  eventRedirectByKey: Map<string, any>;
  eventsById: Map<string, any>;
  eventsBySlug: Map<string, any>;
  unambiguousEventBySlug: Map<string, any>;
  hostsBySlug: Map<string, any>;
  hostSlugAliases: Map<string, string>;
  organizationsById: Map<string, any>;
  venuesById: Map<string, any>;
  venuesBySlug: Map<string, any>;
  eventSeriesById: Map<string, any>;
  resortsBySlug: Map<string, any>;
  resorts: any[];
  cruisesBySlug: Map<string, any>;
  cruises: any[];
  sailingsBySeriesId: Map<string, any[]>;
  citiesMap: Map<string, CityCatalogEntry>;
  clubs: any[];
  events: any[];
  isDegradedUnavailable?: boolean;
};

const POLLUTING_TEST_LISTING_IDS = new Set([
  '0c726e60-2e1e-4b03-9516-99af7d49024d',
  '1c0e1492-d453-46b2-ab7d-8b926380994a',
]);

const POLLUTING_TEST_ORG_IDS = new Set([
  'org-claim-2097981ab901444b926132938ef4ca14',
  'org-host-community-host',
  'org-host-discovery-demo-host',
]);

const POLLUTING_TEST_ORG_SLUGS = new Set([
  'community-host',
  'discovery-demo-host',
  'test-club-2097981a',
]);

export const isDemoOrTestListing = (listing: any): boolean => {
  if (!listing || typeof listing !== 'object') return true;
  const id = String(listing.id ?? '').trim();
  if (POLLUTING_TEST_LISTING_IDS.has(id)) return true;
  if (id.startsWith('event-community-') || id.startsWith('dev-mock-') || id.includes('dummy')) return true;
  const name = String(listing.name ?? '').trim();
  if (/^test\s+(club|event|listing)$/i.test(name)) return true;
  const country = String(listing.geopoint?.address?.country ?? '').trim();
  if (country === 'French Southern and Antarctic Lands') return true;
  if (listing.type === 'event') {
    const normHost = normalizeHostName(listing.hostName ?? '');
    if (normHost === 'discovery demo host' || normHost === 'community host') return true;
  }
  return false;
};

export const isDemoOrTestOrganization = (org: any): boolean => {
  if (!org || typeof org !== 'object') return true;
  const id = String(org.id ?? '').trim();
  const slug = String(org.slug ?? '').trim().toLowerCase();
  if (POLLUTING_TEST_ORG_IDS.has(id) || POLLUTING_TEST_ORG_SLUGS.has(slug)) return true;
  if (slug.startsWith('test-club-')) return true;
  const name = String(org.name ?? '').trim();
  if (/^test\s+(club|host|organization)$/i.test(name)) return true;
  if (typeof org.website === 'string' && org.website.includes('example.com')) return true;
  return false;
};

const isSyntheticHostShim = (org: any): boolean => {
  if (!org || typeof org.id !== 'string' || !org.id.startsWith('org-host-')) return false;
  if (org.createdAt || org.updatedAt || org.created_at || org.updated_at || org.postedByUserId) return false;
  if (org.descriptionShort || org.descriptionFull || org.description_short || org.description_full || org.website || org.contactEmail) return false;
  if (Array.isArray(org.displayTypes) && org.displayTypes.some((t: string) => t !== 'host')) return false;
  return true;
};

const isUsableMediaUrl = (url?: string | null): url is string => {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.includes('picsum.photos')) return false;
  if (trimmed.includes('example.com')) return false;
  if (trimmed.includes('margarita-pleasures.com/images/yacht-exterior-01.png')) return false;
  return true;
};

export const toAbsoluteUrl = (pathOrUrl?: string | null): string => {
  if (!isUsableMediaUrl(pathOrUrl)) return DEFAULT_OG_IMAGE;
  const trimmed = pathOrUrl
    .trim()
    .replace(/([#&])ss-crop=[^&#]*/gi, (_m, sep) => (sep === '#' ? '#' : ''))
    .replace(/#[&]*$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${SITE_ORIGIN}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
};

export const truncateCleanDescription = (input: string, maxLength: number = 165): string => {
  const cleaned = String(input ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+\./g, '.')
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  const slice = cleaned.slice(0, maxLength - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[.,;:\-\s]+$/, '')}…`;
};

const escapeHtml = (value: string): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toIsoDateOnly = (value?: string | null): string | undefined => {
  if (!value || typeof value !== 'string') return undefined;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return undefined;
  const nowMs = Date.now() || Date.parse('2026-10-13T00:00:00Z');
  const clampedMs = Math.min(ms, nowMs);
  return new Date(clampedMs).toISOString().split('T')[0];
};

const extractEntityLastmod = (entity: any, fallbackDateStr: string): string => {
  const candidates = [
    entity?.updatedAt,
    entity?.updated_at,
    entity?.createdAt,
    entity?.created_at,
    entity?.time?.start,
    entity?.startsAt,
    entity?.starts_at,
  ];
  for (const c of candidates) {
    const parsed = toIsoDateOnly(c);
    if (parsed) return parsed;
  }
  return fallbackDateStr;
};

// Bundled listings lookup by ID so we always preserve pre-rename legacy keys from listings.local.json
const bundledListingsById = new Map<string, any>();
for (const item of (listingsData as any[]) || []) {
  if (item && item.id) {
    bundledListingsById.set(item.id, item);
  }
}

const STATIC_HOST_ALIASES: Record<string, string> = {
  'club-escape': 'club-escape-cleveland',
  'the-bronze-party': 'bronze-party',
  'mumvel': 'mumbai-velvet',
  'club-unhinged': 'the-club-unhinged',
  'connect-dance-love-oakland': 'connect-dance-love',
};

export type CatalogSeedCollections = {
  organizations?: any[];
  venues?: any[];
  eventSeries?: any[];
  resorts?: any[];
  cruiseSeries?: any[];
  cruiseSailings?: any[];
};

export const buildListingCatalog = (
  rawListings: any[],
  collections: CatalogSeedCollections = {},
): ListingCatalog => {
  const approvedListings = (rawListings || []).filter(
    (l) =>
      l &&
      l.status === 'approved' &&
      ['club', 'event'].includes(l.type) &&
      !isDemoOrTestListing(l),
  );

  const clubs = approvedListings.filter((l) => l.type === 'club');
  const events = approvedListings.filter((l) => l.type === 'event');

  // Venues
  const rawVenues = collections.venues && collections.venues.length > 0 ? collections.venues : mockVenues;
  const venuesById = new Map<string, any>();
  const venuesBySlug = new Map<string, any>();
  for (const v of rawVenues) {
    if (!v || (v.status && v.status !== 'approved' && v.status !== 'active')) continue;
    if (v.id?.startsWith('venue-community-')) continue;
    venuesById.set(v.id, v);
    if (v.slug) venuesBySlug.set(String(v.slug).toLowerCase(), v);
    const shortVenueSlug = nameSlug(v.name ?? '');
    if (shortVenueSlug && !venuesBySlug.has(shortVenueSlug)) {
      venuesBySlug.set(shortVenueSlug, v);
    }
  }

  // Event series
  const rawSeries = collections.eventSeries && collections.eventSeries.length > 0 ? collections.eventSeries : defaultEventSeries;
  const eventSeriesById = new Map<string, any>();
  for (const s of rawSeries) {
    if (!s || (s.status && s.status !== 'approved' && s.status !== 'active')) continue;
    eventSeriesById.set(s.id, s);
  }

  // Organizations (merge remote + mockOrganizations while filtering demo/test and synthetic shims)
  const mergedOrgsById = new Map<string, any>();
  const hasRemoteOrgs = Boolean(collections.organizations && collections.organizations.length > 0);
  for (const mockOrg of mockOrganizations) {
    if (isDemoOrTestOrganization(mockOrg)) continue;
    if (hasRemoteOrgs && isSyntheticHostShim(mockOrg)) continue;
    mergedOrgsById.set(mockOrg.id, mockOrg);
  }
  if (!mergedOrgsById.has('org-club-club-escape-cleveland')) {
    mergedOrgsById.set('org-club-club-escape-cleveland', {
      id: 'org-club-club-escape-cleveland',
      type: 'organization',
      name: 'Club Escape Cleveland',
      slug: 'club-escape-cleveland',
      displayTypes: ['club', 'host', 'promoter'],
      descriptionShort: 'Cleveland on-premise lifestyle club and party host welcoming couples and single women.',
      status: 'approved',
    });
  }
  if (collections.organizations) {
    for (const remoteOrg of collections.organizations) {
      if (isDemoOrTestOrganization(remoteOrg)) continue;
      const existing = mergedOrgsById.get(remoteOrg.id);
      const remoteName = typeof remoteOrg.name === 'string' ? remoteOrg.name.trim() : '';
      const resolvedName =
        existing?.name && (!remoteName || remoteName === remoteName.toLowerCase())
          ? existing.name
          : (remoteName || existing?.name);
      mergedOrgsById.set(remoteOrg.id, {
        ...(existing ?? {}),
        ...remoteOrg,
        name: resolvedName,
        displayTypes: remoteOrg.displayTypes ?? remoteOrg.display_types ?? existing?.displayTypes ?? [],
        descriptionShort: remoteOrg.descriptionShort ?? remoteOrg.description_short ?? existing?.descriptionShort,
        descriptionFull: remoteOrg.descriptionFull ?? remoteOrg.description_full ?? existing?.descriptionFull,
        logoImageUrl: remoteOrg.logoImageUrl ?? remoteOrg.logo_image_url ?? existing?.logoImageUrl,
        headerImageUrl: remoteOrg.headerImageUrl ?? remoteOrg.header_image_url ?? existing?.headerImageUrl,
        galleryImageUrls: remoteOrg.galleryImageUrls ?? remoteOrg.gallery_image_urls ?? existing?.galleryImageUrls ?? [],
        createdAt: remoteOrg.createdAt ?? remoteOrg.created_at ?? existing?.createdAt,
        updatedAt: remoteOrg.updatedAt ?? remoteOrg.updated_at ?? existing?.updatedAt,
      });
    }
  }

  const organizationsById = new Map<string, any>();
  const organizationsBySlug = new Map<string, any>();
  for (const org of mergedOrgsById.values()) {
    if (org.status !== 'approved' && org.status !== 'active') continue;
    organizationsById.set(org.id, org);
    if (org.slug) organizationsBySlug.set(String(org.slug).toLowerCase(), org);
  }

  // Clubs indexing
  const clubsByKey = new Map<string, any>();
  const clubRedirectByKey = new Map<string, any>();
  const clubsById = new Map<string, any>();
  const clubsBySlug = new Map<string, any>();
  const unambiguousClubBySlug = new Map<string, any>();
  const clubSlugCounts = new Map<string, number>();
  const canonicalClubKeyByCandidateKey = new Map<string, string>();
  const clubByVenueId = new Map<string, any>();

  for (const club of clubs) {
    const key = clubKey(club);
    const pretty = nameSlug(club.name);
    clubsByKey.set(key, club);
    clubsById.set(club.id, club);
    clubsBySlug.set(pretty, club);

    const bundledClub = bundledListingsById.get(club.id);
    const candidateKeys = getCandidateClubKeys(
      club,
      bundledClub && bundledClub.type === 'club' ? [bundledClub] : [],
    );
    for (const candidate of candidateKeys) {
      if (!clubRedirectByKey.has(candidate)) {
        clubRedirectByKey.set(candidate, club);
      }
      if (!canonicalClubKeyByCandidateKey.has(candidate)) {
        canonicalClubKeyByCandidateKey.set(candidate, key);
      }
    }

    if (pretty) {
      const nextCount = (clubSlugCounts.get(pretty) ?? 0) + 1;
      clubSlugCounts.set(pretty, nextCount);
      if (nextCount === 1) {
        unambiguousClubBySlug.set(pretty, club);
      } else {
        unambiguousClubBySlug.delete(pretty);
      }
    }

    if (club.primaryVenueId) clubByVenueId.set(club.primaryVenueId, club);
    clubByVenueId.set(`venue-${club.id}`, club);
    const linkedVenue =
      (club.primaryVenueId ? venuesById.get(club.primaryVenueId) : undefined) ??
      venuesById.get(`venue-${club.id}`);
    if (linkedVenue && pretty && !venuesBySlug.has(pretty)) {
      venuesBySlug.set(pretty, linkedVenue);
    }
  }

  // Events indexing & Host event aggregation
  const eventsByKey = new Map<string, any>();
  const eventsByPublicSlug = new Map<string, any>();
  const eventRedirectByKey = new Map<string, any>();
  const eventsById = new Map<string, any>();
  const eventsBySlug = new Map<string, any>();
  const unambiguousEventBySlug = new Map<string, any>();
  const eventSlugCounts = new Map<string, number>();
  const eventsByOrgId = new Map<string, any[]>();
  const hostSlugAliases = new Map<string, string>(Object.entries(STATIC_HOST_ALIASES));

  const resolveOrgForEvent = (event: any): any | null => {
    if (event.organizerOrganizationId) {
      const exact = organizationsById.get(event.organizerOrganizationId);
      const isProducerOnly = Array.isArray(exact?.displayTypes) && exact.displayTypes.length === 1 && exact.displayTypes[0] === 'producer';
      if (exact && !isProducerOnly && !isSyntheticHostShim(exact)) return exact;
    }
    if (event.eventSeriesId) {
      const series = eventSeriesById.get(event.eventSeriesId);
      if (series?.organizerOrganizationId) {
        const seriesOrg = organizationsById.get(series.organizerOrganizationId);
        if (seriesOrg) return seriesOrg;
      }
    }
    const normHost = normalizeHostName(event.hostName ?? '');
    if (!normHost) return null;
    const hSlug = nameSlug(normHost);
    const aliasTarget = hostSlugAliases.get(hSlug);
    if (aliasTarget && organizationsBySlug.has(aliasTarget)) {
      return organizationsBySlug.get(aliasTarget)!;
    }
    const candidates = Array.from(organizationsById.values()).filter(
      (o) =>
        o.id === event.organizerOrganizationId ||
        o.slug === hSlug ||
        o.id === `org-host-${hSlug}` ||
        normalizeHostName(o.name ?? '') === normHost,
    );
    if (candidates.length === 0) return null;
    return (
      candidates.find((o) => Boolean(o.logoImageUrl) && !isSyntheticHostShim(o)) ??
      candidates.find((o) => !isSyntheticHostShim(o)) ??
      candidates[0]
    );
  };

  for (const event of events) {
    const resolvedOrg = resolveOrgForEvent(event);
    const resolvedHostName = resolvedOrg?.name || event.hostName || '';
    const key = eventKey(event, resolvedHostName);
    const pretty = nameSlug(event.name);
    eventsByKey.set(key, event);
    const publicSlug = eventPublicSlug(event);
    if (publicSlug && !eventsByPublicSlug.has(publicSlug)) eventsByPublicSlug.set(publicSlug, event);
    eventsById.set(event.id, event);
    eventsBySlug.set(pretty, event);

    // Find linked club if any for extraVenueKeys
    const linkedClub =
      (event.venueId ? clubByVenueId.get(event.venueId) ?? clubsById.get(event.venueId) : null) ??
      (event.venueKey ? clubs.find((c) => matchesClubVenueKey(c, event.venueKey)) : null);
    const extraVenueKeys: string[] = [];
    if (linkedClub) {
      extraVenueKeys.push(clubKey(linkedClub), legacyClubKey(linkedClub));
    }

    const bundledEvent = bundledListingsById.get(event.id);
    const candidateKeys = getCandidateEventKeys(
      event,
      resolvedHostName,
      bundledEvent && bundledEvent.type === 'event' ? [bundledEvent] : [],
      extraVenueKeys,
    );
    for (const candidate of candidateKeys) {
      if (!eventRedirectByKey.has(candidate)) {
        eventRedirectByKey.set(candidate, event);
      }
    }

    if (pretty) {
      const nextCount = (eventSlugCounts.get(pretty) ?? 0) + 1;
      eventSlugCounts.set(pretty, nextCount);
      if (nextCount === 1) {
        unambiguousEventBySlug.set(pretty, event);
      } else {
        unambiguousEventBySlug.delete(pretty);
      }
    }

    if (resolvedOrg) {
      const orgEvents = eventsByOrgId.get(resolvedOrg.id) ?? [];
      orgEvents.push(event);
      eventsByOrgId.set(resolvedOrg.id, orgEvents);

      const rawHostSlug = hostSlug(event.hostName ?? '');
      if (rawHostSlug && rawHostSlug !== resolvedOrg.slug) {
        hostSlugAliases.set(rawHostSlug, resolvedOrg.slug);
      }
    }
  }

  // Eligible Host Profiles (exclude club-only orgs that have no host role and no approved events/series)
  const orgIdsWithApprovedSeries = new Set<string>();
  for (const s of eventSeriesById.values()) {
    if (s.organizerOrganizationId) orgIdsWithApprovedSeries.add(s.organizerOrganizationId);
  }

  const hostsBySlug = new Map<string, any>();
  for (const org of organizationsById.values()) {
    const displayTypes: string[] = Array.isArray(org.displayTypes) ? org.displayTypes : [];
    const hasHostRole = displayTypes.some((t) =>
      ['host', 'promoter', 'event_brand', 'producer', 'community'].includes(t),
    );
    const orgEvents = eventsByOrgId.get(org.id) ?? [];
    const hasSeries = orgIdsWithApprovedSeries.has(org.id);
    if (!hasHostRole && orgEvents.length === 0 && !hasSeries) {
      continue;
    }
    const slug = String(org.slug ?? '').toLowerCase();
    if (!slug) continue;
    hostsBySlug.set(slug, {
      ...org,
      events: orgEvents,
    });
    const derivedNameSlug = hostSlug(org.name ?? '');
    if (derivedNameSlug && derivedNameSlug !== slug && !hostsBySlug.has(derivedNameSlug)) {
      hostSlugAliases.set(derivedNameSlug, slug);
    }
  }

  for (const [alias, target] of Array.from(hostSlugAliases.entries())) {
    if (hostsBySlug.has(alias) || !hostsBySlug.has(target)) {
      hostSlugAliases.delete(alias);
    }
  }

  // Resorts
  const mergedResortsById = new Map<string, any>();
  for (const r of defaultResorts) {
    if (r && r.status === 'approved') mergedResortsById.set(r.id, r);
  }
  if (collections.resorts) {
    for (const row of collections.resorts) {
      if (!row || (row.status !== 'approved' && row.status !== 'active')) continue;
      const existing = mergedResortsById.get(row.id);
      const rawGeopoint = row.geopoint ?? existing?.geopoint ?? { address: {} };
      const verifiedCoords = VERIFIED_RESORT_PUBLIC_COORDINATES[row.id];
      const resolvedVisibility =
        row.locationVisibility ??
        row.location_visibility ??
        existing?.locationVisibility ??
        (row.id === 'resort-sea-mountain-inn-spa' ? 'approximate' : undefined);
      const isPrivateOrApprox = resolvedVisibility === 'private' || resolvedVisibility === 'approximate';
      mergedResortsById.set(row.id, {
        ...(existing ?? {}),
        ...row,
        slug: row.slug ?? existing?.slug,
        descriptionShort: row.descriptionShort ?? row.description_short ?? existing?.descriptionShort ?? '',
        descriptionFull: row.descriptionFull ?? row.description_full ?? existing?.descriptionFull ?? '',
        locationVisibility: resolvedVisibility,
        geopoint: {
          ...rawGeopoint,
          latitude: isPrivateOrApprox
            ? undefined
            : (rawGeopoint.latitude ?? verifiedCoords?.latitude ?? existing?.geopoint?.latitude),
          longitude: isPrivateOrApprox
            ? undefined
            : (rawGeopoint.longitude ?? verifiedCoords?.longitude ?? existing?.geopoint?.longitude),
          address: rawGeopoint.address ?? existing?.geopoint?.address ?? {},
        },
        logoImageUrl: row.logoImageUrl ?? row.logo_image_url ?? existing?.logoImageUrl,
        headerImageUrl: row.headerImageUrl ?? row.header_image_url ?? existing?.headerImageUrl,
        createdAt: row.createdAt ?? row.created_at ?? existing?.createdAt,
        updatedAt: row.updatedAt ?? row.updated_at ?? existing?.updatedAt,
      });
    }
  }
  const resortsList = Array.from(mergedResortsById.values());
  const resortsBySlug = new Map<string, any>();
  for (const resort of resortsList) {
    resortsBySlug.set(String(resort.slug).toLowerCase(), resort);
    resortsBySlug.set(String(resort.id).toLowerCase(), resort);
    if (resort.id === 'resort-hedonism-ii-negril') {
      resortsBySlug.set('hedonism-ii', { ...resort, slug: 'hedonism-ii' });
      resortsBySlug.set('hedonism-ii-negril', { ...resort, slug: 'hedonism-ii' });
    }
  }

  // Cruises & Sailings
  const mergedCruisesById = new Map<string, any>();
  for (const c of defaultCruiseSeries) {
    if (c && c.status === 'approved') mergedCruisesById.set(c.id, c);
  }
  if (collections.cruiseSeries) {
    for (const row of collections.cruiseSeries) {
      if (!row || (row.status !== 'approved' && row.status !== 'active')) continue;
      const existing = mergedCruisesById.get(row.id);
      const rawHeader = row.headerImageUrl ?? row.header_image_url ?? existing?.headerImageUrl;
      mergedCruisesById.set(row.id, {
        ...(existing ?? {}),
        ...row,
        operatorOrganizationId: row.operatorOrganizationId ?? row.operator_organization_id ?? existing?.operatorOrganizationId,
        descriptionShort: row.descriptionShort ?? row.description_short ?? existing?.descriptionShort ?? '',
        descriptionFull: row.descriptionFull ?? row.description_full ?? existing?.descriptionFull ?? '',
        logoImageUrl: row.logoImageUrl ?? row.logo_image_url ?? existing?.logoImageUrl,
        headerImageUrl: isUsableMediaUrl(rawHeader) ? rawHeader : existing?.headerImageUrl,
        createdAt: row.createdAt ?? row.created_at ?? existing?.createdAt,
        updatedAt: row.updatedAt ?? row.updated_at ?? existing?.updatedAt,
      });
    }
  }
  const cruisesList = Array.from(mergedCruisesById.values());
  const cruisesBySlug = new Map<string, any>();
  for (const cruise of cruisesList) {
    cruisesBySlug.set(String(cruise.slug).toLowerCase(), cruise);
    cruisesBySlug.set(String(cruise.id).toLowerCase(), cruise);
  }

  const mergedSailingsById = new Map<string, any>();
  for (const s of defaultCruiseSailings) {
    if (s && s.status === 'approved') mergedSailingsById.set(s.id, s);
  }
  if (collections.cruiseSailings) {
    for (const row of collections.cruiseSailings) {
      if (!row || (row.status !== 'approved' && row.status !== 'active')) continue;
      const existing = mergedSailingsById.get(row.id);
      mergedSailingsById.set(row.id, {
        ...(existing ?? {}),
        ...row,
        cruiseSeriesId: row.cruiseSeriesId ?? row.cruise_series_id ?? existing?.cruiseSeriesId,
        shipName: row.shipName ?? row.ship_name ?? existing?.shipName,
        startsAt: row.startsAt ?? row.starts_at ?? existing?.startsAt,
        endsAt: row.endsAt ?? row.ends_at ?? existing?.endsAt,
        departurePort: row.departurePort ?? row.departure_port ?? existing?.departurePort ?? {},
        itinerary: row.itinerary ?? existing?.itinerary ?? [],
        durationNights: Number(row.durationNights ?? row.duration_nights ?? existing?.durationNights ?? 0),
        bookingUrl: row.bookingUrl ?? row.booking_url ?? existing?.bookingUrl,
        bookingStatus: row.bookingStatus ?? row.booking_status ?? existing?.bookingStatus,
      });
    }
  }
  const sailingsBySeriesId = new Map<string, any[]>();
  for (const sailing of mergedSailingsById.values()) {
    if (sailing.status !== 'approved' && sailing.status !== 'active') continue;
    const list = sailingsBySeriesId.get(sailing.cruiseSeriesId) ?? [];
    list.push(sailing);
    list.sort((a, b) => Date.parse(a.startsAt || '') - Date.parse(b.startsAt || ''));
    sailingsBySeriesId.set(sailing.cruiseSeriesId, list);
  }

  // Cities (evaluated dynamically at catalog construction time, never module load time)
  const citiesMap = new Map<string, CityCatalogEntry>();
  const nowMs = Date.now() || Date.parse('2026-10-13T00:00:00Z');
  const thirtyDaysAgoMs = nowMs - 30 * 24 * 60 * 60 * 1000;
  const fallbackDateStr = new Date(nowMs).toISOString().split('T')[0];

  for (const listing of approvedListings) {
    const city = listing.geopoint?.address?.city;
    if (!city || typeof city !== 'string' || !city.trim()) continue;
    const slug = slugifyPlace(city);
    if (!slug) continue;

    if (!citiesMap.has(slug)) {
      citiesMap.set(slug, {
        slug,
        name: city.trim(),
        region: listing.geopoint?.address?.region || listing.geopoint?.address?.state || '',
        country: listing.geopoint?.address?.country || '',
        clubs: [],
        events: [],
        lastmod: undefined,
      });
    }

    const cityEntry = citiesMap.get(slug)!;
    const itemLastmod = extractEntityLastmod(listing, fallbackDateStr);
    if (!cityEntry.lastmod || itemLastmod > cityEntry.lastmod) {
      cityEntry.lastmod = itemLastmod;
    }

    if (listing.type === 'club') {
      cityEntry.clubs.push(listing);
    } else if (listing.type === 'event') {
      const endOrStartMs = listing.time?.end
        ? Date.parse(listing.time.end)
        : listing.time?.start
        ? Date.parse(listing.time.start)
        : 0;
      if (!endOrStartMs || endOrStartMs >= thirtyDaysAgoMs) {
        cityEntry.events.push(listing);
      }
    }
  }

  return {
    clubsByKey,
    clubRedirectByKey,
    clubsById,
    clubsBySlug,
    unambiguousClubBySlug,
    eventsByKey,
    eventsByPublicSlug,
    eventRedirectByKey,
    eventsById,
    eventsBySlug,
    unambiguousEventBySlug,
    hostsBySlug,
    hostSlugAliases,
    organizationsById,
    venuesById,
    venuesBySlug,
    eventSeriesById,
    resortsBySlug,
    resorts: resortsList,
    cruisesBySlug,
    cruises: cruisesList,
    sailingsBySeriesId,
    citiesMap,
    clubs,
    events,
  };
};

// Static build-time snapshot fallback (rebuilt on demand if needed)
const staticCatalog = buildListingCatalog(listingsData as any[]);

// Live in-memory cache with in-flight deduplication
let cachedLiveCatalog: { catalog: ListingCatalog; timestamp: number } | null = null;
let inFlightCatalogPromise: Promise<ListingCatalog> | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const fetchJsonWithAuth = async (url: string, apiKey: string, signal: AbortSignal, method: 'GET' | 'POST' = 'GET'): Promise<any> => {
  const res = await fetch(url, {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Supabase fetch failed (${res.status}): ${url}`);
  }
  return res.json();
};

export const getListingCatalog = async (env?: Record<string, unknown>): Promise<ListingCatalog> => {
  if (env?.FORCE_CATALOG_UNAVAILABLE === true) {
    return {
      ...buildListingCatalog([]),
      isDegradedUnavailable: true,
    };
  }

  const supabaseUrl = (env?.VITE_SUPABASE_URL || env?.SUPABASE_URL) as string | undefined;
  const supabaseKey = (env?.VITE_SUPABASE_PUBLISHABLE_KEY || env?.SUPABASE_ANON_KEY || env?.VITE_SUPABASE_ANON_KEY) as string | undefined;

  if (!supabaseUrl || !supabaseKey) {
    return staticCatalog;
  }

  const now = Date.now();
  if (cachedLiveCatalog && now - cachedLiveCatalog.timestamp < CACHE_TTL_MS) {
    return cachedLiveCatalog.catalog;
  }

  if (inFlightCatalogPromise) {
    return inFlightCatalogPromise;
  }

  inFlightCatalogPromise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const cleanUrl = supabaseUrl.replace(/\/+$/, '');
    try {
      const [
        listingsRes,
        orgsRes,
        venuesRes,
        seriesRes,
        resortsRes,
        cruisesRes,
        sailingsRes,
      ] = await Promise.allSettled([
        fetchJsonWithAuth(`${cleanUrl}/rest/v1/rpc/list_public_listings`, supabaseKey, controller.signal, 'POST'),
        fetchJsonWithAuth(
          `${cleanUrl}/rest/v1/organizations?status=eq.approved&select=id,name,slug,display_types,description_short,description_full,website,instagram,fetlife,contact_email,logo_image_url,header_image_url,gallery_image_urls,operating_regions,globe_presence,standards,status,created_at,updated_at`,
          supabaseKey,
          controller.signal,
        ),
        fetchJsonWithAuth(
          `${cleanUrl}/rest/v1/venues?status=eq.approved&select=id,name,slug,description,address,latitude,longitude,location_meta,visibility,status,amenities,logo_image_url,header_image_url,created_at,updated_at`,
          supabaseKey,
          controller.signal,
        ),
        fetchJsonWithAuth(
          `${cleanUrl}/rest/v1/event_series?status=eq.approved&select=id,name,slug,organizer_organization_id,description_short,description_full,logo_image_url,header_image_url,default_venue_id,default_tags,status,created_at,updated_at`,
          supabaseKey,
          controller.signal,
        ),
        fetchJsonWithAuth(
          `${cleanUrl}/rest/v1/resorts?status=eq.approved&select=id,name,slug,operator_organization_id,description_short,description_full,geopoint,location_visibility,resort_style,audience_label,accommodation_summary,stay_length_summary,booking_url,contact_email,amenities,experience_highlights,logo_image_url,header_image_url,gallery_image_urls,status,created_at,updated_at`,
          supabaseKey,
          controller.signal,
        ),
        fetchJsonWithAuth(
          `${cleanUrl}/rest/v1/cruise_series?status=eq.approved&select=id,name,slug,operator_organization_id,description_short,description_full,audience_label,experience_highlights,logo_image_url,header_image_url,gallery_image_urls,status,created_at,updated_at`,
          supabaseKey,
          controller.signal,
        ),
        fetchJsonWithAuth(
          `${cleanUrl}/rest/v1/cruise_sailings?status=eq.approved&select=id,cruise_series_id,name,slug,ship_name,starts_at,ends_at,departure_port,itinerary,duration_nights,booking_url,booking_status,cabin_summary,pricing_summary,theme,logo_image_url,header_image_url,status,created_at,updated_at`,
          supabaseKey,
          controller.signal,
        ),
      ]);
      clearTimeout(timeoutId);

      if (listingsRes.status === 'fulfilled' && Array.isArray(listingsRes.value) && listingsRes.value.length > 0) {
        const liveCatalog = buildListingCatalog(listingsRes.value, {
          organizations: orgsRes.status === 'fulfilled' && Array.isArray(orgsRes.value) ? orgsRes.value : undefined,
          venues: venuesRes.status === 'fulfilled' && Array.isArray(venuesRes.value) ? venuesRes.value : undefined,
          eventSeries: seriesRes.status === 'fulfilled' && Array.isArray(seriesRes.value) ? seriesRes.value : undefined,
          resorts: resortsRes.status === 'fulfilled' && Array.isArray(resortsRes.value) ? resortsRes.value : undefined,
          cruiseSeries: cruisesRes.status === 'fulfilled' && Array.isArray(cruisesRes.value) ? cruisesRes.value : undefined,
          cruiseSailings: sailingsRes.status === 'fulfilled' && Array.isArray(sailingsRes.value) ? sailingsRes.value : undefined,
        });
        cachedLiveCatalog = { catalog: liveCatalog, timestamp: Date.now() };
        return liveCatalog;
      }
    } catch (_err) {
      clearTimeout(timeoutId);
    }

    if (cachedLiveCatalog) {
      return cachedLiveCatalog.catalog;
    }
    if (env?.DISABLE_STATIC_FALLBACK === true) {
      return {
        ...buildListingCatalog([]),
        isDegradedUnavailable: true,
      };
    }
    return {
      ...staticCatalog,
      isDegradedUnavailable: true,
    };
  })().finally(() => {
    inFlightCatalogPromise = null;
  });

  return inFlightCatalogPromise;
};

export const getApprovedCities = (catalog: ListingCatalog = staticCatalog): CityCatalogEntry[] => {
  return Array.from(catalog.citiesMap.values()).sort(
    (a, b) => b.clubs.length + b.events.length - (a.clubs.length + a.events.length),
  );
};

export const getCityBySlug = (slug: string, catalog: ListingCatalog = staticCatalog): CityCatalogEntry | null => {
  const clean = slugifyPlace(slug);
  return catalog.citiesMap.get(clean) ?? null;
};

const DEFAULT_CLOUDFLARE_DELIVERY_BASE = 'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q';

const resolveCloudflareDeliveryBase = (...urls: Array<unknown>): string => {
  for (const url of urls) {
    if (typeof url === 'string') {
      const match = url.trim().match(/^https:\/\/imagedelivery\.net\/[^/]+/i);
      if (match) return match[0];
    }
  }
  return DEFAULT_CLOUDFLARE_DELIVERY_BASE;
};

const extractMediaAssetUrlByRole = (
  mediaAssets: unknown,
  role: 'flyer' | 'hero' | 'logo',
  variant: string,
  deliveryBase: string,
): string | undefined => {
  if (!Array.isArray(mediaAssets)) return undefined;
  for (const item of mediaAssets) {
    if (!item || typeof item !== 'object') continue;
    if (item.role !== role || item.status === 'rejected') continue;
    const directUrl = (item as any).url || (item as any).src;
    if (isUsableMediaUrl(directUrl)) {
      return toAbsoluteUrl(directUrl);
    }
    const extId = String((item as any).external_id || (item as any).externalId || (item as any).cloudflareImageId || '').trim();
    if (extId && (!(item as any).storage_provider || (item as any).storage_provider === 'cloudflare_images')) {
      return `${deliveryBase}/${encodeURIComponent(extId)}/${encodeURIComponent(variant)}`;
    }
  }
  return undefined;
};

export const resolveListingSocialImage = (
  listing: any,
  fallbackLogoUrl?: string,
): { url: string; width: number; height: number; alt: string; card: 'summary' | 'summary_large_image' } => {
  const bundled = listing?.id ? bundledListingsById.get(listing.id) : null;
  const deliveryBase = resolveCloudflareDeliveryBase(
    listing?.flyerImageUrl,
    listing?.flyer_image_url,
    listing?.flyerUrl,
    listing?.headerImageUrl,
    listing?.header_image_url,
    listing?.coverImage,
    listing?.imageUrl,
    listing?.logoImageUrl,
    listing?.logo_image_url,
    listing?.logo,
    fallbackLogoUrl,
    bundled?.logoImageUrl,
    bundled?.headerImageUrl,
  );

  const directFlyer = listing?.flyerImageUrl || listing?.flyer_image_url || listing?.flyerUrl;
  const mediaFlyer =
    extractMediaAssetUrlByRole(listing?.mediaAssets, 'flyer', 'flyercard', deliveryBase) ||
    extractMediaAssetUrlByRole(bundled?.mediaAssets, 'flyer', 'flyercard', deliveryBase);
  const bundledFlyer = bundled?.flyerImageUrl || bundled?.flyer_image_url || bundled?.flyerUrl;
  const resolvedFlyer = isUsableMediaUrl(directFlyer)
    ? toAbsoluteUrl(directFlyer)
    : mediaFlyer || (isUsableMediaUrl(bundledFlyer) ? toAbsoluteUrl(bundledFlyer) : undefined);

  const directHero = listing?.headerImageUrl || listing?.header_image_url || listing?.coverImage || listing?.imageUrl;
  const mediaHero =
    extractMediaAssetUrlByRole(listing?.mediaAssets, 'hero', 'heropage', deliveryBase) ||
    extractMediaAssetUrlByRole(bundled?.mediaAssets, 'hero', 'heropage', deliveryBase);
  const bundledHero = bundled?.headerImageUrl || bundled?.header_image_url || bundled?.coverImage || bundled?.imageUrl;
  const resolvedHero = isUsableMediaUrl(directHero)
    ? toAbsoluteUrl(directHero)
    : mediaHero || (isUsableMediaUrl(bundledHero) ? toAbsoluteUrl(bundledHero) : undefined);

  const directLogo = listing?.logoImageUrl || listing?.logo_image_url || listing?.logo;
  const mediaLogo =
    extractMediaAssetUrlByRole(listing?.mediaAssets, 'logo', 'logosquare', deliveryBase) ||
    extractMediaAssetUrlByRole(bundled?.mediaAssets, 'logo', 'logosquare', deliveryBase);
  const bundledLogo = bundled?.logoImageUrl || bundled?.logo_image_url || bundled?.logo;
  const resolvedLogo = isUsableMediaUrl(directLogo)
    ? toAbsoluteUrl(directLogo)
    : mediaLogo ||
      (isUsableMediaUrl(bundledLogo) ? toAbsoluteUrl(bundledLogo) : undefined) ||
      (isUsableMediaUrl(fallbackLogoUrl) ? toAbsoluteUrl(fallbackLogoUrl) : undefined);

  // Events strictly prioritize:
  // 1. Event flyer
  // 2. Event hero image
  // 3. Event logo
  // 4. Default SwingSphere social image
  if (listing?.type === 'event') {
    if (resolvedFlyer) {
      return {
        url: resolvedFlyer,
        width: 1080,
        height: 1350,
        alt: `${listing.name} flyer`,
        card: 'summary_large_image',
      };
    }
    if (resolvedHero) {
      return {
        url: resolvedHero,
        width: 1280,
        height: 720,
        alt: `${listing.name} cover`,
        card: 'summary_large_image',
      };
    }
    if (resolvedLogo) {
      return {
        url: resolvedLogo,
        width: 800,
        height: 800,
        alt: `${listing.name} logo`,
        card: 'summary',
      };
    }
    return {
      url: DEFAULT_OG_IMAGE,
      width: DEFAULT_OG_WIDTH,
      height: DEFAULT_OG_HEIGHT,
      alt: `${listing.name} on SwingSphere`,
      card: 'summary_large_image',
    };
  }

  // Club pages retain their existing cover-first behavior.
  if (resolvedHero) {
    return {
      url: resolvedHero,
      width: 1280,
      height: 720,
      alt: `${listing.name} cover`,
      card: 'summary_large_image',
    };
  }

  if (resolvedFlyer) {
    return {
      url: resolvedFlyer,
      width: 1080,
      height: 1350,
      alt: `${listing.name} flyer`,
      card: 'summary_large_image',
    };
  }

  if (resolvedLogo) {
    return {
      url: resolvedLogo,
      width: 800,
      height: 800,
      alt: `${listing.name} logo`,
      card: 'summary',
    };
  }

  return {
    url: DEFAULT_OG_IMAGE,
    width: DEFAULT_OG_WIDTH,
    height: DEFAULT_OG_HEIGHT,
    alt: `${listing.name} on SwingSphere`,
    card: 'summary_large_image',
  };
};

const resolveEntitySocialImage = (
  entityName: string,
  headerUrl?: string | null,
  logoUrl?: string | null,
): { url: string; width: number; height: number; alt: string; card: 'summary' | 'summary_large_image' } => {
  if (isUsableMediaUrl(headerUrl)) {
    return {
      url: toAbsoluteUrl(headerUrl),
      width: 1200,
      height: 630,
      alt: `${entityName} cover`,
      card: 'summary_large_image',
    };
  }
  if (isUsableMediaUrl(logoUrl)) {
    return {
      url: toAbsoluteUrl(logoUrl),
      width: 800,
      height: 800,
      alt: `${entityName} logo`,
      card: 'summary',
    };
  }
  return {
    url: DEFAULT_OG_IMAGE,
    width: DEFAULT_OG_WIDTH,
    height: DEFAULT_OG_HEIGHT,
    alt: `${entityName} on SwingSphere`,
    card: 'summary_large_image',
  };
};

const formatLocationString = (city?: string, region?: string, country?: string): string => {
  const parts = [city?.trim(), region?.trim(), country?.trim()].filter(Boolean);
  return parts.join(', ');
};

const buildSemanticShellHtml = (opts: {
  heading: string;
  badge?: string;
  subtitle?: string;
  metaItems?: Array<{ label: string; value: string; href?: string }>;
  description?: string;
  links?: Array<{ label: string; href: string }>;
}): string => {
  const metaHtml =
    opts.metaItems && opts.metaItems.length > 0
      ? `<dl class="mt-4 grid gap-2 sm:grid-cols-2">${opts.metaItems
          .filter((item) => Boolean(item.value))
          .map(
            (item) =>
              `<div><dt class="text-xs uppercase tracking-wider text-gray-400">${escapeHtml(item.label)}</dt><dd class="text-sm font-medium text-gray-100">${
                item.href
                  ? `<a href="${escapeHtml(item.href)}" class="text-red-300 underline">${escapeHtml(item.value)}</a>`
                  : escapeHtml(item.value)
              }</dd></div>`,
          )
          .join('')}</dl>`
      : '';

  const linksHtml =
    opts.links && opts.links.length > 0
      ? `<nav aria-label="Related discovery links" class="mt-6 border-t border-white/10 pt-4"><ul class="flex flex-wrap gap-3 text-sm">${opts.links
          .map(
            (l) =>
              `<li><a href="${escapeHtml(l.href)}" class="text-red-300 underline hover:text-white">${escapeHtml(l.label)}</a></li>`,
          )
          .join('')}</ul></nav>`
      : '';

  return `<main class="ss-seo-prerender mx-auto max-w-5xl px-6 py-12 text-gray-100"><article>${
    opts.badge ? `<p class="text-xs font-bold uppercase tracking-widest text-red-400">${escapeHtml(opts.badge)}</p>` : ''
  }<h1 class="mt-1 text-3xl font-bold text-white">${escapeHtml(opts.heading)}</h1>${
    opts.subtitle ? `<p class="mt-2 text-sm text-gray-300">${escapeHtml(opts.subtitle)}</p>` : ''
  }${metaHtml}${
    opts.description ? `<div class="mt-4 text-base leading-relaxed text-gray-200"><p>${escapeHtml(opts.description)}</p></div>` : ''
  }${linksHtml}</article></main>`;
};

const buildNotFoundSeo = (cleanPath: string, entityLabel: string): SeoPayload => {
  const canonicalUrl = `${SITE_ORIGIN}${cleanPath === '/' ? '/' : cleanPath}`;
  const title = `${entityLabel} Not Found | SwingSphere`;
  const description = `The requested ${entityLabel.toLowerCase()} could not be found on SwingSphere. Explore approved lifestyle clubs, swinger parties, hosts, resorts, and cruises.`;
  return {
    title,
    description,
    canonicalUrl,
    ogType: 'website',
    twitterCard: 'summary_large_image',
    imageUrl: DEFAULT_OG_IMAGE,
    imageAlt: DEFAULT_OG_IMAGE_ALT,
    imageWidth: DEFAULT_OG_WIDTH,
    imageHeight: DEFAULT_OG_HEIGHT,
    noIndex: true,
    robots: 'noindex, nofollow',
    status: 404,
    bodyHtml: buildSemanticShellHtml({
      heading: `${entityLabel} Not Found`,
      badge: '404 Not Found',
      description,
      links: [
        { label: 'Browse Directory', href: '/discover' },
        { label: 'Upcoming Events', href: '/events' },
        { label: 'Resorts & Cruises', href: '/travel' },
        { label: 'SwingSphere Home', href: '/' },
      ],
    }),
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      url: canonicalUrl,
    },
  };
};

const buildServiceUnavailableSeo = (cleanPath: string): SeoPayload => {
  const canonicalUrl = `${SITE_ORIGIN}${cleanPath === '/' ? '/' : cleanPath}`;
  return {
    title: 'Temporarily Unavailable | SwingSphere',
    description: 'SwingSphere is temporarily refreshing its discovery catalog. Please try again shortly.',
    canonicalUrl,
    ogType: 'website',
    twitterCard: 'summary_large_image',
    imageUrl: DEFAULT_OG_IMAGE,
    imageAlt: DEFAULT_OG_IMAGE_ALT,
    imageWidth: DEFAULT_OG_WIDTH,
    imageHeight: DEFAULT_OG_HEIGHT,
    noIndex: true,
    robots: 'noindex, nofollow',
    status: 503,
    retryAfterSeconds: 60,
    bodyHtml: buildSemanticShellHtml({
      heading: 'Service Temporarily Unavailable',
      badge: '503 Service Unavailable',
      description: 'SwingSphere is temporarily refreshing its discovery catalog. Please retry in a moment.',
      links: [{ label: 'SwingSphere Home', href: '/' }],
    }),
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Temporarily Unavailable | SwingSphere',
      url: canonicalUrl,
    },
  };
};

export const resolvePageSeoWithCatalog = (pathname: string, catalog: ListingCatalog): SeoPayload => {
  const cleanPath = pathname.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  const canonicalUrl = `${SITE_ORIGIN}${cleanPath === '/' ? '/' : cleanPath}`;

  // 1. Private, account, moderation, dev, and utility routes -> 200 + noindex, nofollow
  const isPrivate = /^(\/admin|\/dev|\/account|\/host-dashboard|\/submission|\/login|\/signup|\/auth|\/forgot-password|\/reset-password|\/mobile|\/tablet|\/users\/|\/street-view)/.test(cleanPath);
  if (isPrivate) {
    return {
      title: 'SwingSphere | Account & Administration',
      description: 'SwingSphere account, administration, and platform tools.',
      canonicalUrl,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: DEFAULT_OG_IMAGE_ALT,
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: true,
      robots: 'noindex, nofollow',
      status: 200,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'SwingSphere',
        url: SITE_ORIGIN,
      },
    };
  }

  // Legacy /listing/:id redirect route
  const legacyListingMatch = cleanPath.match(/^\/listing\/([^/]+)$/);
  if (legacyListingMatch) {
    const id = decodeURIComponent(legacyListingMatch[1]).trim();
    const club = catalog.clubsById.get(id);
    if (club) {
      const targetPath = `/clubs/${nameSlug(club.name)}--${clubKey(club)}`;
      const resolved = resolvePageSeoWithCatalog(targetPath, catalog);
      return { ...resolved, status: 301, redirectUrl: `${SITE_ORIGIN}${targetPath}` };
    }
    const event = catalog.eventsById.get(id);
    if (event) {
      const targetPath = `/events/${eventCanonicalSlug(event)}`;
      const resolved = resolvePageSeoWithCatalog(targetPath, catalog);
      return { ...resolved, status: 301, redirectUrl: `${SITE_ORIGIN}${targetPath}` };
    }
    if (catalog.isDegradedUnavailable) return buildServiceUnavailableSeo(cleanPath);
    return buildNotFoundSeo(cleanPath, 'Listing');
  }

  // 2. Club detail page: /clubs/:slug
  const clubMatch = cleanPath.match(/^\/clubs\/([^/]+)$/);
  if (clubMatch) {
    const rawParam = decodeURIComponent(clubMatch[1]).trim();
    const parsedKey = parsePrettyKeyParam(rawParam);
    const hasKey = hasExplicitKeyParam(rawParam);

    const club =
      catalog.clubsByKey.get(parsedKey) ??
      catalog.clubRedirectByKey.get(parsedKey) ??
      (!hasKey
        ? catalog.unambiguousClubBySlug.get(rawParam.toLowerCase()) ??
          catalog.clubRedirectByKey.get(rawParam)
        : null);

    if (!club) {
      if (catalog.isDegradedUnavailable) return buildServiceUnavailableSeo(cleanPath);
      return buildNotFoundSeo(cleanPath, 'Club');
    }

    const address = club.geopoint?.address ?? {};
    const city = address.city || '';
    const region = address.region || '';
    const country = address.country || '';
    const loc = formatLocationString(city, region);
    const isPrivateLocation =
      club.isAddressPrivate === true ||
      club.isPrivateLocation === true ||
      club.locationVisibility === 'approximate' ||
      club.locationVisibility === 'approximate_public' ||
      club.locationVisibility === 'private' ||
      club.locationVisibility === 'hidden' ||
      club.geopoint?.locationVisibility === 'approximate' ||
      club.geopoint?.locationVisibility === 'private';

    const ownerOrg = club.ownerOrganizationId ? catalog.organizationsById.get(club.ownerOrganizationId) : null;
    const imageInfo = resolveListingSocialImage(club, ownerOrg?.logoImageUrl);
    const title = loc
      ? `${club.name} | Swinger & Lifestyle Club in ${loc} | SwingSphere`
      : `${club.name} | Lifestyle Club | SwingSphere`;

    const rawDesc = club.description_short?.trim()
      ? `Explore ${club.name}${loc ? ` in ${loc}` : ''}. ${club.description_short.trim()} Operating schedule, amenities, dress code, and access guidelines on SwingSphere.`
      : `Explore ${club.name}${loc ? ` in ${loc}` : ''} on SwingSphere. View lifestyle club amenities, operating schedule, party calendar, dress code, and guest guidelines.`;
    const description = truncateCleanDescription(rawDesc, 165);

    const key = clubKey(club);
    const prettySlug = `${nameSlug(club.name)}--${key}`;
    const canonicalPathOnly = `/clubs/${prettySlug}`;
    const canonicalPath = `${SITE_ORIGIN}${canonicalPathOnly}`;
    const isCanonicalRequest = rawParam === prettySlug;

    const postalAddress: Record<string, unknown> = {
      '@type': 'PostalAddress',
      addressLocality: city || undefined,
      addressRegion: region || undefined,
      addressCountry: country || 'US',
    };
    if (!isPrivateLocation && address.addressLine1) {
      postalAddress.streetAddress = address.addressLine1;
    }
    if (!isPrivateLocation && address.postalCode) {
      postalAddress.postalCode = address.postalCode;
    }

    const citySlug = city ? slugifyPlace(city) : '';
    const cityEntry = citySlug ? catalog.citiesMap.get(citySlug) : null;
    const relatedLinks: Array<{ label: string; href: string }> = [
      { label: 'All Lifestyle Clubs', href: '/discover?type=club' },
    ];
    const nowMsForClubEvents = Date.now() || Date.parse('2026-10-13T00:00:00Z');
    const clubHostedEvents = catalog.events
      .filter(
        (ev) =>
          ev.venueId === club.primaryVenueId ||
          ev.venueId === `venue-${club.id}` ||
          ev.venueId === club.id ||
          (ev.venueKey && matchesClubVenueKey(club, ev.venueKey)),
      )
      .sort((a, b) => {
        const aMs = Date.parse(a.time?.start || '') || 0;
        const bMs = Date.parse(b.time?.start || '') || 0;
        const aFuture = aMs >= nowMsForClubEvents - 14 * 24 * 60 * 60 * 1000 ? 0 : 1;
        const bFuture = bMs >= nowMsForClubEvents - 14 * 24 * 60 * 60 * 1000 ? 0 : 1;
        if (aFuture !== bFuture) return aFuture - bFuture;
        return aMs - bMs;
      })
      .slice(0, 20);
    for (const ev of clubHostedEvents) {
      relatedLinks.push({
        label: `Event: ${ev.name}`,
        href: `/events/${eventCanonicalSlug(ev)}`,
      });
    }
    if (cityEntry && cityEntry.clubs.length > 0) {
      relatedLinks.push({ label: `Swinger Clubs in ${cityEntry.name}`, href: `/swinger-clubs/${cityEntry.slug}` });
    }
    if (cityEntry && cityEntry.events.length > 0) {
      relatedLinks.push({ label: `Swinger Parties in ${cityEntry.name}`, href: `/swinger-parties/${cityEntry.slug}` });
    }
    if (ownerOrg && catalog.hostsBySlug.has(ownerOrg.slug)) {
      relatedLinks.push({ label: `Host Profile: ${ownerOrg.name}`, href: `/hosts/${ownerOrg.slug}` });
    }

    const structuredData: any[] = [
      {
        '@context': 'https://schema.org',
        '@type': 'NightClub',
        '@id': `${canonicalPath}#nightclub`,
        name: club.name,
        description: club.description_short?.trim() || description,
        url: canonicalPath,
        image: imageInfo.url,
        address: postalAddress,
        ...(!isPrivateLocation &&
        typeof club.geopoint?.latitude === 'number' &&
        typeof club.geopoint?.longitude === 'number'
          ? {
              geo: {
                '@type': 'GeoCoordinates',
                latitude: club.geopoint.latitude,
                longitude: club.geopoint.longitude,
              },
            }
          : {}),
        ...(club.website ? { sameAs: [club.website] } : {}),
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Clubs', item: `${SITE_ORIGIN}/discover` },
          ...(cityEntry && cityEntry.clubs.length > 0
            ? [
                {
                  '@type': 'ListItem',
                  position: 3,
                  name: `${cityEntry.name} Clubs`,
                  item: `${SITE_ORIGIN}/swinger-clubs/${cityEntry.slug}`,
                },
                { '@type': 'ListItem', position: 4, name: club.name, item: canonicalPath },
              ]
            : [{ '@type': 'ListItem', position: 3, name: club.name, item: canonicalPath }]),
        ],
      },
    ];

    return {
      title,
      description,
      canonicalUrl: canonicalPath,
      ogType: 'article',
      twitterCard: imageInfo.card,
      imageUrl: imageInfo.url,
      imageAlt: imageInfo.alt,
      imageWidth: imageInfo.width,
      imageHeight: imageInfo.height,
      noIndex: false,
      status: isCanonicalRequest ? 200 : 301,
      redirectUrl: isCanonicalRequest ? undefined : canonicalPath,
      bodyHtml: buildSemanticShellHtml({
        heading: club.name,
        badge: 'Lifestyle Club',
        subtitle: formatLocationString(city, region, country),
        metaItems: [
          {
            label: 'Location',
            value: isPrivateLocation
              ? `${formatLocationString(city, region, country)} (Approximate area)`
              : [address.addressLine1, city, region, country].filter(Boolean).join(', '),
          },
          ...(ownerOrg && catalog.hostsBySlug.has(ownerOrg.slug)
            ? [{ label: 'Operator / Host', value: ownerOrg.name, href: `/hosts/${ownerOrg.slug}` }]
            : []),
        ],
        description: club.description_short?.trim() || description,
        links: relatedLinks,
      }),
      structuredData,
    };
  }

  // 3. Event detail page: /events/:slug
  const eventMatch = cleanPath.match(/^\/events\/([^/]+)$/);
  if (eventMatch) {
    const rawParam = decodeURIComponent(eventMatch[1]).trim();
    const parsedKey = parsePrettyKeyParam(rawParam);
    const hasKey = hasExplicitKeyParam(rawParam);

    const event =
      catalog.eventsByKey.get(parsedKey) ??
      catalog.eventsByPublicSlug.get(rawParam.toLowerCase()) ??
      catalog.eventRedirectByKey.get(parsedKey) ??
      (!hasKey
        ? catalog.unambiguousEventBySlug.get(rawParam.toLowerCase()) ??
          catalog.eventRedirectByKey.get(rawParam)
        : null);

    if (!event) {
      if (catalog.isDegradedUnavailable) return buildServiceUnavailableSeo(cleanPath);
      return buildNotFoundSeo(cleanPath, 'Event');
    }

    const address = event.geopoint?.address ?? {};
    const city = address.city || '';
    const region = address.region || '';
    const country = address.country || '';
    const loc = formatLocationString(city, region);

    // Resolve linked venue and club
    const linkedVenue = event.venueId ? catalog.venuesById.get(event.venueId) : null;
    const linkedClub =
      (event.venueId
        ? catalog.clubs.find(
            (c) => c.primaryVenueId === event.venueId || `venue-${c.id}` === event.venueId || c.id === event.venueId,
          )
        : null) ??
      (event.venueKey ? catalog.clubs.find((c) => matchesClubVenueKey(c, event.venueKey)) : null);

    // Resolve canonical organizer organization
    const resolvedOrg =
      (event.organizerOrganizationId ? catalog.organizationsById.get(event.organizerOrganizationId) : null) ??
      (event.eventSeriesId && catalog.eventSeriesById.get(event.eventSeriesId)?.organizerOrganizationId
        ? catalog.organizationsById.get(catalog.eventSeriesById.get(event.eventSeriesId).organizerOrganizationId)
        : null) ??
      catalog.hostsBySlug.get(hostSlug(event.hostName ?? '')) ??
      (catalog.hostSlugAliases.has(hostSlug(event.hostName ?? ''))
        ? catalog.hostsBySlug.get(catalog.hostSlugAliases.get(hostSlug(event.hostName ?? ''))!)
        : null);

    const isPrivateLocation =
      event.isAddressPrivate === true ||
      event.isPrivateLocation === true ||
      event.locationVisibility === 'approximate' ||
      event.locationVisibility === 'approximate_public' ||
      event.locationVisibility === 'private' ||
      event.locationVisibility === 'hidden' ||
      event.geopoint?.locationVisibility === 'approximate' ||
      event.geopoint?.locationVisibility === 'private' ||
      Boolean(linkedVenue?.visibility && linkedVenue.visibility !== 'public_exact');

    const dateStr = event.time?.start
      ? new Date(event.time.start).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '';

    const hostName = resolvedOrg?.name || event.hostName || 'Event Host';
    const canonicalHostSlug =
      resolvedOrg?.slug && catalog.hostsBySlug.has(resolvedOrg.slug)
        ? resolvedOrg.slug
        : catalog.hostSlugAliases.get(hostSlug(hostName)) ??
          (catalog.hostsBySlug.has(hostSlug(hostName)) ? hostSlug(hostName) : undefined);

    const imageInfo = resolveListingSocialImage(event, resolvedOrg?.logoImageUrl || linkedClub?.logoImageUrl);
    const title = loc
      ? `${event.name} | Swinger & Lifestyle Party in ${loc} | SwingSphere`
      : `${event.name} | Lifestyle Party & Event | SwingSphere`;

    const rawDesc = event.description_full?.trim()
      ? `${dateStr ? `${dateStr}: ` : ''}${event.description_full.trim()} Hosted by ${hostName}.`
      : `${event.name}${dateStr ? ` on ${dateStr}` : ''}${loc ? ` in ${loc}` : ''}. Hosted by ${hostName}. Explore schedule, attendee guidelines, and access details on SwingSphere.`;
    const description = truncateCleanDescription(rawDesc, 165);

    const key = eventKey(event, hostName);
    const prettySlug = eventCanonicalSlug(event, hostName);
    const canonicalPathOnly = `/events/${prettySlug}`;
    const canonicalPath = `${SITE_ORIGIN}${canonicalPathOnly}`;
    const isCanonicalRequest = rawParam === prettySlug;

    const postalAddress: Record<string, unknown> = {
      '@type': 'PostalAddress',
      addressLocality: city || undefined,
      addressRegion: region || undefined,
      addressCountry: country || 'US',
    };
    if (!isPrivateLocation && address.addressLine1) {
      postalAddress.streetAddress = address.addressLine1;
    }
    if (!isPrivateLocation && address.postalCode) {
      postalAddress.postalCode = address.postalCode;
    }

    const linkedClubCanonicalPath = linkedClub
      ? `/clubs/${nameSlug(linkedClub.name)}--${clubKey(linkedClub)}`
      : undefined;
    const placeName = isPrivateLocation
      ? `${city || 'Private'} Area`
      : linkedClub?.name || linkedVenue?.name || event.location || city || 'Event Venue';

    const ticketOrAccessUrl = event.ticketUrl || event.website;

    const citySlug = city ? slugifyPlace(city) : '';
    const cityEntry = citySlug ? catalog.citiesMap.get(citySlug) : null;
    const relatedLinks: Array<{ label: string; href: string }> = [
      { label: 'Upcoming Lifestyle Events', href: '/events' },
    ];
    if (canonicalHostSlug) {
      relatedLinks.push({ label: `Hosted by ${hostName}`, href: `/hosts/${canonicalHostSlug}` });
    }
    if (linkedClub && linkedClubCanonicalPath) {
      relatedLinks.push({ label: `Venue: ${linkedClub.name}`, href: linkedClubCanonicalPath });
    }
    if (cityEntry && cityEntry.events.length > 0) {
      relatedLinks.push({ label: `Swinger Parties in ${cityEntry.name}`, href: `/swinger-parties/${cityEntry.slug}` });
    }
    if (cityEntry && cityEntry.clubs.length > 0) {
      relatedLinks.push({ label: `Swinger Clubs in ${cityEntry.name}`, href: `/swinger-clubs/${cityEntry.slug}` });
    }

    const structuredData: any[] = [
      {
        '@context': 'https://schema.org',
        '@type': 'Event',
        '@id': `${canonicalPath}#event`,
        name: event.name,
        description: event.description_full?.trim() || description,
        url: canonicalPath,
        image: imageInfo.url,
        startDate: event.time?.start || undefined,
        endDate: event.time?.end || undefined,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: {
          '@type': 'Place',
          name: placeName,
          ...(linkedClubCanonicalPath && !isPrivateLocation
            ? { url: `${SITE_ORIGIN}${linkedClubCanonicalPath}` }
            : {}),
          address: postalAddress,
          ...(!isPrivateLocation &&
          typeof event.geopoint?.latitude === 'number' &&
          typeof event.geopoint?.longitude === 'number'
            ? {
                geo: {
                  '@type': 'GeoCoordinates',
                  latitude: event.geopoint.latitude,
                  longitude: event.geopoint.longitude,
                },
              }
            : {}),
        },
        organizer: {
          '@type': 'Organization',
          name: hostName,
          ...(canonicalHostSlug ? { url: `${SITE_ORIGIN}/hosts/${canonicalHostSlug}` } : {}),
        },
        ...(ticketOrAccessUrl && /^https?:\/\//i.test(ticketOrAccessUrl)
          ? {
              offers: {
                '@type': 'Offer',
                url: ticketOrAccessUrl,
                availability: 'https://schema.org/InStock',
              },
            }
          : {}),
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Events', item: `${SITE_ORIGIN}/events` },
          ...(cityEntry && cityEntry.events.length > 0
            ? [
                {
                  '@type': 'ListItem',
                  position: 3,
                  name: `${cityEntry.name} Parties`,
                  item: `${SITE_ORIGIN}/swinger-parties/${cityEntry.slug}`,
                },
                { '@type': 'ListItem', position: 4, name: event.name, item: canonicalPath },
              ]
            : [{ '@type': 'ListItem', position: 3, name: event.name, item: canonicalPath }]),
        ],
      },
    ];

    return {
      title,
      description,
      canonicalUrl: canonicalPath,
      ogType: 'article',
      twitterCard: imageInfo.card,
      imageUrl: imageInfo.url,
      imageAlt: imageInfo.alt,
      imageWidth: imageInfo.width,
      imageHeight: imageInfo.height,
      noIndex: false,
      status: isCanonicalRequest ? 200 : 301,
      redirectUrl: isCanonicalRequest ? undefined : canonicalPath,
      bodyHtml: buildSemanticShellHtml({
        heading: event.name,
        badge: 'Lifestyle Event',
        subtitle: [dateStr, formatLocationString(city, region, country)].filter(Boolean).join(' · '),
        metaItems: [
          ...(dateStr ? [{ label: 'Date', value: dateStr }] : []),
          {
            label: 'Venue / Location',
            value: isPrivateLocation ? `${placeName} (Disclosed to approved guests)` : placeName,
            href: !isPrivateLocation ? linkedClubCanonicalPath : undefined,
          },
          {
            label: 'Organizer',
            value: hostName,
            href: canonicalHostSlug ? `/hosts/${canonicalHostSlug}` : undefined,
          },
        ],
        description: event.description_full?.trim() || description,
        links: relatedLinks,
      }),
      structuredData,
    };
  }

  // 4. Host detail page: /hosts/:slug
  const hostMatch = cleanPath.match(/^\/hosts\/([^/]+)$/);
  if (hostMatch) {
    const rawParam = decodeURIComponent(hostMatch[1]).trim().toLowerCase();
    const aliasTarget =
      catalog.hostSlugAliases.get(rawParam) ??
      catalog.hostSlugAliases.get(hostSlug(rawParam));
    const resolvedSlug = aliasTarget ?? rawParam;
    const host =
      catalog.hostsBySlug.get(resolvedSlug) ??
      catalog.hostsBySlug.get(hostSlug(resolvedSlug));

    if (!host) {
      if (catalog.isDegradedUnavailable) return buildServiceUnavailableSeo(cleanPath);
      return buildNotFoundSeo(cleanPath, 'Host');
    }

    const canonicalPathOnly = `/hosts/${host.slug}`;
    const canonicalPath = `${SITE_ORIGIN}${canonicalPathOnly}`;
    const isCanonicalRequest = rawParam === host.slug;
    const title = `${host.name} | Lifestyle Host & Event Promoter | SwingSphere`;
    const rawDesc = host.descriptionShort?.trim()
      ? `${host.descriptionShort.trim()} Explore upcoming swinger parties, play parties, and events produced by ${host.name} on SwingSphere.`
      : `Explore events and parties hosted by ${host.name} on SwingSphere. Verified screening policies, party schedules, and community guidelines.`;
    const description = truncateCleanDescription(rawDesc, 165);

    const imageInfo = resolveEntitySocialImage(host.name, host.headerImageUrl, host.logoImageUrl);
    const hostEvents: any[] = Array.isArray(host.events) ? host.events : [];
    const sameAs = [host.website, host.instagram, host.fetlife].filter(
      (u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u) && !u.includes('example.com'),
    );

    const eventLinks = hostEvents.slice(0, 12).map((ev) => ({
      label: ev.name,
      href: `/events/${eventCanonicalSlug(ev, host.name)}`,
    }));

    const structuredData: any[] = [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        '@id': `${canonicalPath}#organization`,
        name: host.name,
        description: host.descriptionShort?.trim() || description,
        url: canonicalPath,
        logo: isUsableMediaUrl(host.logoImageUrl) ? toAbsoluteUrl(host.logoImageUrl) : undefined,
        image: imageInfo.url,
        ...(sameAs.length > 0 ? { sameAs } : {}),
        ...(hostEvents.length > 0
          ? {
              event: hostEvents.slice(0, 10).map((ev) => ({
                '@type': 'Event',
                name: ev.name,
                startDate: ev.time?.start || undefined,
                url: `${SITE_ORIGIN}/events/${eventCanonicalSlug(ev, host.name)}`,
              })),
            }
          : {}),
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Hosts', item: `${SITE_ORIGIN}/discover?type=host` },
          { '@type': 'ListItem', position: 3, name: host.name, item: canonicalPath },
        ],
      },
    ];

    return {
      title,
      description,
      canonicalUrl: canonicalPath,
      ogType: 'profile',
      twitterCard: imageInfo.card,
      imageUrl: imageInfo.url,
      imageAlt: imageInfo.alt,
      imageWidth: imageInfo.width,
      imageHeight: imageInfo.height,
      noIndex: false,
      status: isCanonicalRequest ? 200 : 301,
      redirectUrl: isCanonicalRequest ? undefined : canonicalPath,
      bodyHtml: buildSemanticShellHtml({
        heading: host.name,
        badge: 'Host & Promoter',
        subtitle: Array.isArray(host.operatingRegions) && host.operatingRegions.length > 0
          ? host.operatingRegions.join(' · ')
          : 'Lifestyle Event Organizer',
        description: host.descriptionFull?.trim() || host.descriptionShort?.trim() || description,
        links: [
          ...eventLinks,
          { label: 'Browse All Hosts', href: '/discover?type=host' },
          { label: 'Upcoming Events', href: '/events' },
        ],
      }),
      structuredData,
    };
  }

  // 4b. Venue support page: /venues/:slug (Option B: 200 + noindex, follow for valid venues; 404 for unknown)
  const venueMatch = cleanPath.match(/^\/venues\/([^/]+)$/);
  if (venueMatch) {
    const slug = decodeURIComponent(venueMatch[1]).trim().toLowerCase();
    const venue = catalog.venuesBySlug.get(slug) ?? catalog.venuesById.get(slug);
    if (!venue) {
      if (catalog.isDegradedUnavailable) return buildServiceUnavailableSeo(cleanPath);
      return buildNotFoundSeo(cleanPath, 'Venue');
    }
    const isPrivateVenue = venue.visibility && venue.visibility !== 'public_exact';
    const city = venue.address?.city || '';
    const region = venue.address?.region || '';
    const country = venue.address?.country || '';
    const loc = formatLocationString(city, region);
    const canonicalPath = `${SITE_ORIGIN}/venues/${slug}`;
    const title = loc ? `${venue.name} | Venue in ${loc} | SwingSphere` : `${venue.name} | Venue | SwingSphere`;
    const description = truncateCleanDescription(
      venue.description?.trim() || `Venue details and hosted events for ${venue.name}${loc ? ` in ${loc}` : ''} on SwingSphere.`,
      165,
    );

    return {
      title,
      description,
      canonicalUrl: canonicalPath,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: `${venue.name} on SwingSphere`,
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: true,
      robots: 'noindex, follow',
      status: 200,
      bodyHtml: buildSemanticShellHtml({
        heading: venue.name,
        badge: 'Venue Profile',
        subtitle: isPrivateVenue ? `${loc || 'Private Area'} (Approximate)` : formatLocationString(city, region, country),
        description,
        links: [
          { label: 'Browse Clubs & Venues', href: '/discover' },
          { label: 'Upcoming Events', href: '/events' },
        ],
      }),
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'Place',
        name: venue.name,
        url: canonicalPath,
        address: {
          '@type': 'PostalAddress',
          addressLocality: city || undefined,
          addressRegion: region || undefined,
          addressCountry: country || 'US',
          ...(!isPrivateVenue && venue.address?.addressLine1 ? { streetAddress: venue.address.addressLine1 } : {}),
        },
      },
    };
  }

  // 5. Resort detail page: /resorts/:slug
  const resortMatch = cleanPath.match(/^\/resorts\/([^/]+)$/);
  if (resortMatch) {
    const slug = decodeURIComponent(resortMatch[1]).trim().toLowerCase();
    const resort = catalog.resortsBySlug.get(slug);
    if (!resort) {
      if (catalog.isDegradedUnavailable) return buildServiceUnavailableSeo(cleanPath);
      return buildNotFoundSeo(cleanPath, 'Resort');
    }

    const canonicalPathOnly = `/resorts/${resort.slug}`;
    const canonicalPath = `${SITE_ORIGIN}${canonicalPathOnly}`;
    const isCanonicalRequest = slug === String(resort.slug).toLowerCase();
    const address = resort.geopoint?.address ?? {};
    const city = address.city || resort.city || '';
    const region = address.region || resort.region || '';
    const country = address.country || resort.country || '';
    const loc = formatLocationString(city, country || region);
    const isPrivateOrApprox =
      resort.locationVisibility === 'approximate' || resort.locationVisibility === 'private';

    const title = loc
      ? `${resort.name} | Adults-Only Lifestyle Resort in ${loc} | SwingSphere`
      : `${resort.name} | Adults-Only Lifestyle Resort | SwingSphere`;

    const rawDesc = resort.descriptionShort?.trim()
      ? `${resort.name}${loc ? ` in ${loc}` : ''}. ${resort.descriptionShort.trim()} Amenities, theme nights, dress codes, and booking details on SwingSphere.`
      : `Discover ${resort.name}${loc ? ` in ${loc}` : ''} on SwingSphere. Premier adults-only lifestyle resort, clothing-optional amenities, entertainment, and booking info.`;
    const description = truncateCleanDescription(rawDesc, 165);

    const imageInfo = resolveEntitySocialImage(resort.name, resort.headerImageUrl, resort.logoImageUrl);
    const lat = resort.geopoint?.latitude;
    const lng = resort.geopoint?.longitude;

    const structuredData: any[] = [
      {
        '@context': 'https://schema.org',
        '@type': 'Resort',
        '@id': `${canonicalPath}#resort`,
        name: resort.name,
        description: resort.descriptionShort?.trim() || description,
        url: canonicalPath,
        image: imageInfo.url,
        address: {
          '@type': 'PostalAddress',
          addressLocality: city || undefined,
          addressRegion: region || undefined,
          addressCountry: country || undefined,
          ...(!isPrivateOrApprox && address.addressLine1 ? { streetAddress: address.addressLine1 } : {}),
        },
        ...(!isPrivateOrApprox && typeof lat === 'number' && typeof lng === 'number'
          ? {
              geo: {
                '@type': 'GeoCoordinates',
                latitude: lat,
                longitude: lng,
              },
            }
          : {}),
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Travel', item: `${SITE_ORIGIN}/travel` },
          { '@type': 'ListItem', position: 3, name: resort.name, item: canonicalPath },
        ],
      },
    ];

    return {
      title,
      description,
      canonicalUrl: canonicalPath,
      ogType: 'article',
      twitterCard: imageInfo.card,
      imageUrl: imageInfo.url,
      imageAlt: imageInfo.alt,
      imageWidth: imageInfo.width,
      imageHeight: imageInfo.height,
      noIndex: false,
      status: isCanonicalRequest ? 200 : 301,
      redirectUrl: isCanonicalRequest ? undefined : canonicalPath,
      bodyHtml: buildSemanticShellHtml({
        heading: resort.name,
        badge: 'Lifestyle Resort',
        subtitle: formatLocationString(city, region, country),
        metaItems: [
          {
            label: 'Destination',
            value: isPrivateOrApprox
              ? `${formatLocationString(city, region, country)} (General region)`
              : formatLocationString(city, region, country),
          },
          ...(resort.audienceLabel ? [{ label: 'Audience', value: resort.audienceLabel }] : []),
        ],
        description: resort.descriptionFull?.trim() || resort.descriptionShort?.trim() || description,
        links: [
          { label: 'All Lifestyle Resorts & Cruises', href: '/travel' },
          { label: 'Explore 3D Globe', href: '/globe' },
        ],
      }),
      structuredData,
    };
  }

  // 6. Cruise detail page: /cruises/:slug
  const cruiseMatch = cleanPath.match(/^\/cruises\/([^/]+)$/);
  if (cruiseMatch) {
    const slug = decodeURIComponent(cruiseMatch[1]).trim().toLowerCase();
    const cruise = catalog.cruisesBySlug.get(slug);
    if (!cruise) {
      if (catalog.isDegradedUnavailable) return buildServiceUnavailableSeo(cleanPath);
      return buildNotFoundSeo(cleanPath, 'Cruise');
    }

    const canonicalPathOnly = `/cruises/${cruise.slug}`;
    const canonicalPath = `${SITE_ORIGIN}${canonicalPathOnly}`;
    const isCanonicalRequest = slug === String(cruise.slug).toLowerCase();
    const operatorOrg = cruise.operatorOrganizationId
      ? catalog.organizationsById.get(cruise.operatorOrganizationId)
      : null;
    const providerName = operatorOrg?.name || cruise.organizerName || cruise.cruiseLine || undefined;
    const providerHostSlug =
      operatorOrg?.slug && catalog.hostsBySlug.has(operatorOrg.slug) ? operatorOrg.slug : undefined;

    const approvedSailings = catalog.sailingsBySeriesId.get(cruise.id) ?? [];
    const title = `${cruise.name} | Adults-Only Lifestyle Cruise | SwingSphere`;
    const rawDesc = cruise.descriptionShort?.trim()
      ? `${cruise.descriptionShort.trim()} Discover luxury adults-only swinger cruises, theme sailings, and booking details on SwingSphere.`
      : `Explore ${cruise.name} on SwingSphere. Adults-only lifestyle cruise, luxury amenities, clothing-optional decks, and itinerary details.`;
    const description = truncateCleanDescription(rawDesc, 165);

    const imageInfo = resolveEntitySocialImage(
      cruise.name,
      cruise.headerImageUrl || approvedSailings[0]?.headerImageUrl,
      cruise.logoImageUrl || operatorOrg?.logoImageUrl,
    );

    const structuredData: any[] = [
      {
        '@context': 'https://schema.org',
        '@type': 'TouristTrip',
        '@id': `${canonicalPath}#cruise`,
        name: cruise.name,
        description: cruise.descriptionShort?.trim() || description,
        url: canonicalPath,
        image: imageInfo.url,
        ...(providerName
          ? {
              provider: {
                '@type': 'Organization',
                name: providerName,
                ...(providerHostSlug ? { url: `${SITE_ORIGIN}/hosts/${providerHostSlug}` } : {}),
              },
            }
          : {}),
        ...(approvedSailings.length > 0
          ? {
              subTrip: approvedSailings.map((sailing) => ({
                '@type': 'TouristTrip',
                name: sailing.name,
                description: [sailing.shipName, sailing.theme, sailing.cabinSummary].filter(Boolean).join(' · '),
                ...(sailing.bookingUrl
                  ? {
                      offers: {
                        '@type': 'Offer',
                        url: sailing.bookingUrl,
                        description: sailing.pricingSummary || undefined,
                      },
                    }
                  : {}),
              })),
            }
          : {}),
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Travel', item: `${SITE_ORIGIN}/travel` },
          { '@type': 'ListItem', position: 3, name: cruise.name, item: canonicalPath },
        ],
      },
    ];

    return {
      title,
      description,
      canonicalUrl: canonicalPath,
      ogType: 'article',
      twitterCard: imageInfo.card,
      imageUrl: imageInfo.url,
      imageAlt: imageInfo.alt,
      imageWidth: imageInfo.width,
      imageHeight: imageInfo.height,
      noIndex: false,
      status: isCanonicalRequest ? 200 : 301,
      redirectUrl: isCanonicalRequest ? undefined : canonicalPath,
      bodyHtml: buildSemanticShellHtml({
        heading: cruise.name,
        badge: 'Lifestyle Cruise Series',
        subtitle: providerName ? `Operated by ${providerName}` : 'Adults-Only Cruise',
        metaItems: [
          ...(providerName
            ? [
                {
                  label: 'Operator',
                  value: providerName,
                  href: providerHostSlug ? `/hosts/${providerHostSlug}` : undefined,
                },
              ]
            : []),
          ...(approvedSailings.length > 0
            ? [{ label: 'Scheduled Sailings', value: approvedSailings.map((s) => s.name).join(' · ') }]
            : []),
        ],
        description: cruise.descriptionFull?.trim() || cruise.descriptionShort?.trim() || description,
        links: [
          ...(providerHostSlug ? [{ label: `Host Profile: ${providerName}`, href: `/hosts/${providerHostSlug}` }] : []),
          { label: 'All Lifestyle Resorts & Cruises', href: '/travel' },
        ],
      }),
      structuredData,
    };
  }

  // 7. Regional discovery routes:
  // /swinger-clubs/:city, /lifestyle-clubs/:city
  // /swinger-parties/:city, /lifestyle-events/:city, /play-parties/:city
  const regionalMatch = cleanPath.match(
    /^\/(swinger-clubs|lifestyle-clubs|swinger-parties|lifestyle-events|play-parties)\/([^/]+)$/,
  );
  if (regionalMatch) {
    const routeCategory = regionalMatch[1];
    const citySlug = slugifyPlace(decodeURIComponent(regionalMatch[2]));
    const cityEntry = getCityBySlug(citySlug, catalog);

    const isClubIntent = routeCategory === 'swinger-clubs' || routeCategory === 'lifestyle-clubs';
    const isPlayPartyIntent = routeCategory === 'play-parties';
    const isPrimaryCategory = routeCategory === 'swinger-clubs' || routeCategory === 'swinger-parties';

    // Unify canonicalization: club intents -> /swinger-clubs/:city, party/event/play-party intents -> /swinger-parties/:city
    const primaryPrefix = isClubIntent ? 'swinger-clubs' : 'swinger-parties';
    const cityCanonical = `${SITE_ORIGIN}/${primaryPrefix}/${citySlug}`;

    if (cityEntry) {
      const listingsForIntent = isClubIntent ? cityEntry.clubs : cityEntry.events;
      const count = listingsForIntent.length;
      const noun = isClubIntent ? (count === 1 ? 'venue' : 'venues') : count === 1 ? 'party' : 'parties';
      const countText = count > 0 ? ` (${count} approved ${noun})` : '';
      const regionState = cityEntry.region ? `, ${cityEntry.region}` : '';
      const cityHeading = `${cityEntry.name}${regionState}`;

      const title = isPlayPartyIntent
        ? `Play Parties & Lifestyle Events in ${cityHeading} | SwingSphere`
        : isClubIntent
        ? `Swinger Clubs & Lifestyle Venues in ${cityHeading} | SwingSphere`
        : `Swinger Parties & Lifestyle Events in ${cityHeading} | SwingSphere`;

      const rawDesc = isPlayPartyIntent
        ? `Explore curated play parties, consent-first lifestyle events, and adult socials in ${cityHeading}${countText}. Attendee guidelines, schedules, and RSVP access on SwingSphere.`
        : isClubIntent
        ? `Discover approved swinger clubs and lifestyle venues in ${cityHeading}${countText}. View club amenities, access policies, dress codes, and upcoming party schedules on SwingSphere.`
        : `Browse upcoming swinger parties, play parties, and lifestyle events in ${cityHeading}${countText}. Attendee requirements, theme nights, and ticket access on SwingSphere.`;
      const description = truncateCleanDescription(rawDesc, 165);

      const topListing = listingsForIntent[0];
      const imageInfo = topListing
        ? resolveListingSocialImage(topListing)
        : {
            url: DEFAULT_OG_IMAGE,
            width: DEFAULT_OG_WIDTH,
            height: DEFAULT_OG_HEIGHT,
            alt: `${cityHeading} lifestyle discovery on SwingSphere`,
            card: 'summary_large_image' as const,
          };

      const itemLinks = listingsForIntent.slice(0, 20).map((item) => {
        const href =
          item.type === 'club'
            ? `/clubs/${nameSlug(item.name)}--${clubKey(item)}`
            : `/events/${eventCanonicalSlug(item)}`;
        return { label: item.name, href, fullUrl: `${SITE_ORIGIN}${href}` };
      });

      const structuredData: any[] = [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          description,
          url: cityCanonical,
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: count,
            itemListElement: itemLinks.map((entry, idx) => ({
              '@type': 'ListItem',
              position: idx + 1,
              name: entry.label,
              url: entry.fullUrl,
            })),
          },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
            { '@type': 'ListItem', position: 2, name: 'Directory', item: `${SITE_ORIGIN}/discover` },
            {
              '@type': 'ListItem',
              position: 3,
              name: `${cityEntry.name} ${isClubIntent ? 'Clubs' : 'Parties'}`,
              item: cityCanonical,
            },
          ],
        },
      ];

      return {
        title,
        description,
        canonicalUrl: cityCanonical,
        ogType: 'website',
        twitterCard: imageInfo.card,
        imageUrl: imageInfo.url,
        imageAlt: imageInfo.alt,
        imageWidth: imageInfo.width,
        imageHeight: imageInfo.height,
        noIndex: count === 0,
        status: count === 0 ? 404 : isPrimaryCategory ? 200 : 301,
        redirectUrl: count > 0 && !isPrimaryCategory ? cityCanonical : undefined,
        bodyHtml: buildSemanticShellHtml({
          heading: isClubIntent
            ? `Swinger Clubs & Lifestyle Venues in ${cityHeading}`
            : `Swinger Parties & Lifestyle Events in ${cityHeading}`,
          badge: `${cityEntry.name} Discovery`,
          subtitle: `${count} approved ${noun} in ${cityHeading}`,
          description,
          links: [
            ...itemLinks.map((i) => ({ label: i.label, href: i.href })),
            ...(isClubIntent && cityEntry.events.length > 0
              ? [{ label: `Swinger Parties in ${cityEntry.name}`, href: `/swinger-parties/${cityEntry.slug}` }]
              : []),
            ...(!isClubIntent && cityEntry.clubs.length > 0
              ? [{ label: `Swinger Clubs in ${cityEntry.name}`, href: `/swinger-clubs/${cityEntry.slug}` }]
              : []),
            { label: 'Full Directory', href: '/discover' },
          ],
        }),
        structuredData,
      };
    }

    if (catalog.isDegradedUnavailable) return buildServiceUnavailableSeo(cleanPath);

    const cleanCityName = citySlug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return {
      title: `Lifestyle Discovery in ${cleanCityName} | SwingSphere`,
      description: `Explore lifestyle clubs, swinger parties, and community nightlife in ${cleanCityName} on SwingSphere.`,
      canonicalUrl: cityCanonical,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: DEFAULT_OG_IMAGE_ALT,
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: true,
      robots: 'noindex, nofollow',
      status: 404,
      bodyHtml: buildSemanticShellHtml({
        heading: `No Approved Listings in ${cleanCityName}`,
        badge: 'City Discovery',
        description: `There are currently no approved public listings in ${cleanCityName}. Browse active destinations in the SwingSphere directory.`,
        links: [
          { label: 'Browse Directory', href: '/discover' },
          { label: 'Upcoming Events', href: '/events' },
        ],
      }),
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'SwingSphere',
        url: SITE_ORIGIN,
      },
    };
  }

  // 8. Main Directory: /discover
  if (cleanPath === '/discover') {
    const topClubs = catalog.clubs.slice(0, 12).map((c) => ({
      label: c.name,
      href: `/clubs/${nameSlug(c.name)}--${clubKey(c)}`,
    }));
    const topCities = getApprovedCities(catalog)
      .filter((c) => c.clubs.length > 0)
      .slice(0, 10)
      .map((c) => ({
        label: `${c.name} Clubs`,
        href: `/swinger-clubs/${c.slug}`,
      }));

    return {
      title: 'Discover Lifestyle Clubs, Swinger Parties & Hosts | SwingSphere',
      description:
        'Explore approved swinger clubs, lifestyle events, play parties, and hosts worldwide. Filter by audience, amenities, and location on SwingSphere.',
      canonicalUrl: `${SITE_ORIGIN}/discover`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: 'Discover Lifestyle Clubs & Events on SwingSphere',
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      status: 200,
      bodyHtml: buildSemanticShellHtml({
        heading: 'Discover Lifestyle Clubs, Swinger Parties & Hosts',
        badge: 'Global Directory',
        description:
          'Explore approved swinger clubs, lifestyle events, play parties, and hosts worldwide. Filter by audience, amenities, and location on SwingSphere.',
        links: [...topClubs, ...topCities, { label: 'Upcoming Events', href: '/events' }, { label: 'Resorts & Cruises', href: '/travel' }],
      }),
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Discover Lifestyle Clubs, Swinger Parties & Hosts',
        description:
          'Global discovery platform for approved lifestyle clubs, swinger parties, play parties, and community hosts.',
        url: `${SITE_ORIGIN}/discover`,
      },
    };
  }

  // 9. Events Index: /events
  if (cleanPath === '/events') {
    const topEvents = catalog.events.slice(0, 12).map((e) => ({
      label: e.name,
      href: `/events/${eventCanonicalSlug(e)}`,
    }));
    return {
      title: 'Upcoming Lifestyle Events & Swinger Parties | SwingSphere',
      description:
        'Browse upcoming lifestyle events, swinger parties, play parties, and club theme nights worldwide. Access details, schedules, and tickets on SwingSphere.',
      canonicalUrl: `${SITE_ORIGIN}/events`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: 'Upcoming Lifestyle Events on SwingSphere',
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      status: 200,
      bodyHtml: buildSemanticShellHtml({
        heading: 'Upcoming Lifestyle Events & Swinger Parties',
        badge: 'Events Calendar',
        description:
          'Browse upcoming lifestyle events, swinger parties, play parties, and club theme nights worldwide.',
        links: [...topEvents, { label: 'Browse Directory', href: '/discover' }],
      }),
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Upcoming Lifestyle Events & Swinger Parties',
        description: 'Calendar of upcoming lifestyle events, swinger parties, and play parties.',
        url: `${SITE_ORIGIN}/events`,
      },
    };
  }

  // 10. Travel Index: /travel
  if (cleanPath === '/travel') {
    const travelLinks = [
      ...catalog.resorts.map((r) => ({ label: r.name, href: `/resorts/${r.slug}` })),
      ...catalog.cruises.map((c) => ({ label: c.name, href: `/cruises/${c.slug}` })),
    ];
    return {
      title: 'Lifestyle Resorts & Swinger Cruises | SwingSphere',
      description:
        'Discover premier adults-only lifestyle resorts, clothing-optional destinations, and luxury swinger cruises around the globe on SwingSphere.',
      canonicalUrl: `${SITE_ORIGIN}/travel`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: 'Lifestyle Resorts & Swinger Cruises',
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      status: 200,
      bodyHtml: buildSemanticShellHtml({
        heading: 'Lifestyle Resorts & Swinger Cruises',
        badge: 'Travel Destinations',
        description:
          'Discover premier adults-only lifestyle resorts, clothing-optional destinations, and luxury swinger cruises around the globe.',
        links: travelLinks,
      }),
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Lifestyle Resorts & Swinger Cruises',
        description: 'Adults-only lifestyle resorts, clothing-optional destinations, and swinger cruises.',
        url: `${SITE_ORIGIN}/travel`,
      },
    };
  }

  // 11. 3D Globe / Map: /globe, /map, /explore
  if (cleanPath === '/globe' || cleanPath === '/map' || cleanPath === '/explore') {
    return {
      title: 'Interactive 3D Lifestyle Globe & Map | SwingSphere',
      description:
        'Explore lifestyle clubs, swinger events, and communities across the world with SwingSphere’s interactive 3D globe and discovery map.',
      canonicalUrl: `${SITE_ORIGIN}/globe`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: 'Interactive 3D Lifestyle Globe',
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      status: 200,
      bodyHtml: buildSemanticShellHtml({
        heading: 'Interactive 3D Lifestyle Globe & Map',
        badge: 'Spatial Explorer',
        description:
          'Explore lifestyle clubs, swinger events, resorts, cruises, and communities across the world with SwingSphere’s interactive 3D globe and discovery map.',
        links: [
          { label: 'Browse Directory', href: '/discover' },
          { label: 'Upcoming Events', href: '/events' },
          { label: 'Resorts & Cruises', href: '/travel' },
        ],
      }),
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'SwingSphere 3D Discovery Globe',
        url: `${SITE_ORIGIN}/globe`,
      },
    };
  }

  // 12. Informational pages: /about, /faq, /contact, /tos, /privacy
  if (cleanPath === '/about') {
    return {
      title: 'About SwingSphere | Global Lifestyle Discovery',
      description:
        'Learn about SwingSphere: the premium discovery platform for lifestyle clubs, swinger events, venues, hosts, resorts, and cruises.',
      canonicalUrl: `${SITE_ORIGIN}/about`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: DEFAULT_OG_IMAGE_ALT,
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      status: 200,
      bodyHtml: buildSemanticShellHtml({
        heading: 'About SwingSphere',
        description:
          'SwingSphere is the global discovery platform for lifestyle clubs, swinger events, venues, hosts, promoters, resorts, and cruises.',
        links: [{ label: 'Browse Directory', href: '/discover' }],
      }),
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: 'About SwingSphere',
        url: `${SITE_ORIGIN}/about`,
      },
    };
  }

  if (cleanPath === '/faq') {
    return {
      title: 'Frequently Asked Questions | SwingSphere',
      description:
        'Common questions about lifestyle clubs, swinger party etiquette, privacy protection, event tickets, and community standards on SwingSphere.',
      canonicalUrl: `${SITE_ORIGIN}/faq`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: DEFAULT_OG_IMAGE_ALT,
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      status: 200,
      bodyHtml: buildSemanticShellHtml({
        heading: 'Frequently Asked Questions',
        description:
          'Common questions about lifestyle clubs, swinger party etiquette, privacy protection, event tickets, and community standards on SwingSphere.',
        links: [{ label: 'Browse Directory', href: '/discover' }],
      }),
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        name: 'SwingSphere FAQ',
        url: `${SITE_ORIGIN}/faq`,
      },
    };
  }

  if (cleanPath === '/privacy') {
    return {
      title: 'Privacy Policy | SwingSphere',
      description:
        'SwingSphere’s privacy policy, personal data protection, private event location safeguards, and security standards.',
      canonicalUrl: `${SITE_ORIGIN}/privacy`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: DEFAULT_OG_IMAGE_ALT,
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      status: 200,
      bodyHtml: buildSemanticShellHtml({
        heading: 'Privacy Policy',
        description:
          'SwingSphere’s privacy policy, personal data protection, private event location safeguards, and security standards.',
        links: [{ label: 'SwingSphere Home', href: '/' }],
      }),
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'SwingSphere Privacy Policy',
        url: `${SITE_ORIGIN}/privacy`,
      },
    };
  }

  if (cleanPath === '/tos') {
    return {
      title: 'Terms of Service | SwingSphere',
      description: 'SwingSphere platform terms of service, community standards, and user guidelines.',
      canonicalUrl: `${SITE_ORIGIN}/tos`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: DEFAULT_OG_IMAGE_ALT,
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      status: 200,
      bodyHtml: buildSemanticShellHtml({
        heading: 'Terms of Service',
        description: 'SwingSphere platform terms of service, community standards, and user guidelines.',
        links: [{ label: 'SwingSphere Home', href: '/' }],
      }),
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'SwingSphere Terms of Service',
        url: `${SITE_ORIGIN}/tos`,
      },
    };
  }

  if (cleanPath === '/contact') {
    return {
      title: 'Contact SwingSphere | Support & Inquiries',
      description:
        'Get in touch with the SwingSphere team for listing inquiries, club partnerships, promoter access, and platform support.',
      canonicalUrl: `${SITE_ORIGIN}/contact`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: DEFAULT_OG_IMAGE_ALT,
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      status: 200,
      bodyHtml: buildSemanticShellHtml({
        heading: 'Contact SwingSphere',
        description:
          'Get in touch with the SwingSphere team for listing inquiries, club partnerships, promoter access, and platform support.',
        links: [{ label: 'SwingSphere Home', href: '/' }],
      }),
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'ContactPage',
        name: 'Contact SwingSphere',
        url: `${SITE_ORIGIN}/contact`,
      },
    };
  }

  // 13. Homepage: /
  if (cleanPath === '/') {
    const featuredLinks = catalog.clubs.slice(0, 8).map((c) => ({
      label: c.name,
      href: `/clubs/${nameSlug(c.name)}--${clubKey(c)}`,
    }));
    return {
      title: 'SwingSphere | Lifestyle Clubs, Swinger Parties & Events',
      description:
        'Discover lifestyle clubs, swinger parties, play parties, adult nightlife, hosts, luxury lifestyle resorts, and cruises worldwide with SwingSphere.',
      canonicalUrl: `${SITE_ORIGIN}/`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: DEFAULT_OG_IMAGE_ALT,
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      status: 200,
      bodyHtml: buildSemanticShellHtml({
        heading: 'Explore the lifestyle. Around the corner or around the world.',
        badge: 'SwingSphere',
        description:
          'Discover lifestyle clubs, swinger parties, play parties, adult nightlife, hosts, luxury lifestyle resorts, and cruises worldwide with SwingSphere.',
        links: [
          { label: 'Explore the 3D Globe', href: '/globe' },
          { label: 'Browse the Directory', href: '/discover' },
          { label: 'Upcoming Events', href: '/events' },
          { label: 'Lifestyle Resorts & Cruises', href: '/travel' },
          ...featuredLinks,
        ],
      }),
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'SwingSphere',
          url: `${SITE_ORIGIN}/`,
          description:
            'Discover lifestyle clubs, swinger parties, play parties, events, hosts, resorts, and cruises around the world with SwingSphere.',
          potentialAction: {
            '@type': 'SearchAction',
            target: `${SITE_ORIGIN}/discover?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'SwingSphere',
          url: `${SITE_ORIGIN}/`,
          logo: `${SITE_ORIGIN}/swingsphere-logo_2.png`,
          description: 'Global discovery platform for lifestyle clubs, swinger events, and community nightlife.',
        },
      ],
    };
  }

  // 14. Any other unknown route -> 404 Not Found + noindex (never canonicalize unknown routes to /)
  return buildNotFoundSeo(cleanPath, 'Page');
};

export const resolvePageSeo = async (
  pathname: string,
  env?: Record<string, unknown>,
): Promise<SeoPayload> => {
  const catalog = await getListingCatalog(env);
  const result = resolvePageSeoWithCatalog(pathname, catalog);
  return {
    ...result,
    robots: result.robots ?? (result.noIndex ? 'noindex, nofollow' : 'index, follow'),
  };
};

export const resolvePageSeoSync = (pathname: string): SeoPayload => {
  const result = resolvePageSeoWithCatalog(pathname, staticCatalog);
  return {
    ...result,
    robots: result.robots ?? (result.noIndex ? 'noindex, nofollow' : 'index, follow'),
  };
};

export const generateSitemapXmlWithCatalog = (catalog: ListingCatalog): string => {
  const urls: Array<{ loc: string; changefreq: string; priority: string; lastmod?: string }> = [];
  const nowMs = Date.now() || Date.parse('2026-10-13T00:00:00Z');
  const todayStr = new Date(nowMs).toISOString().split('T')[0];
  const fourteenDaysAgoMs = nowMs - 14 * 24 * 60 * 60 * 1000;

  // Core static pages
  urls.push({ loc: `${SITE_ORIGIN}/`, changefreq: 'weekly', priority: '1.0', lastmod: todayStr });
  urls.push({ loc: `${SITE_ORIGIN}/discover`, changefreq: 'daily', priority: '0.9', lastmod: todayStr });
  urls.push({ loc: `${SITE_ORIGIN}/events`, changefreq: 'daily', priority: '0.9', lastmod: todayStr });
  urls.push({ loc: `${SITE_ORIGIN}/travel`, changefreq: 'weekly', priority: '0.8', lastmod: todayStr });
  urls.push({ loc: `${SITE_ORIGIN}/globe`, changefreq: 'weekly', priority: '0.8', lastmod: todayStr });
  urls.push({ loc: `${SITE_ORIGIN}/about`, changefreq: 'monthly', priority: '0.5', lastmod: '2026-08-01' });
  urls.push({ loc: `${SITE_ORIGIN}/faq`, changefreq: 'monthly', priority: '0.5', lastmod: '2026-08-01' });
  urls.push({ loc: `${SITE_ORIGIN}/contact`, changefreq: 'monthly', priority: '0.4', lastmod: '2026-08-01' });
  urls.push({ loc: `${SITE_ORIGIN}/privacy`, changefreq: 'monthly', priority: '0.3', lastmod: '2026-08-01' });
  urls.push({ loc: `${SITE_ORIGIN}/tos`, changefreq: 'monthly', priority: '0.3', lastmod: '2026-08-01' });

  // Approved clubs
  for (const club of catalog.clubs) {
    if (isDemoOrTestListing(club)) continue;
    const key = clubKey(club);
    const prettySlug = `${nameSlug(club.name)}--${key}`;
    const loc = `${SITE_ORIGIN}/clubs/${prettySlug}`;
    urls.push({
      loc,
      changefreq: 'weekly',
      priority: '0.8',
      lastmod: extractEntityLastmod(club, '2026-10-12'),
    });
  }

  // Approved upcoming & recent events (exclude events that ended more than 14 days ago)
  for (const event of catalog.events) {
    if (isDemoOrTestListing(event)) continue;
    const endOrStartMs = event.time?.end
      ? Date.parse(event.time.end)
      : event.time?.start
      ? Date.parse(event.time.start)
      : 0;
    if (endOrStartMs && endOrStartMs < fourteenDaysAgoMs) continue;

    const host = normalizeHostName(event.hostName ?? '');
    const key = eventKey(event, host);
    const prettySlug = eventCanonicalSlug(event, host);
    const loc = `${SITE_ORIGIN}/events/${prettySlug}`;
    urls.push({
      loc,
      changefreq: 'daily',
      priority: '0.8',
      lastmod: extractEntityLastmod(event, '2026-10-12'),
    });
  }

  // Approved eligible hosts (canonical slugs only; excludes aliases, club-only non-host orgs, and demo/test fixtures)
  for (const host of catalog.hostsBySlug.values()) {
    if (!host?.slug || isDemoOrTestOrganization(host)) continue;
    urls.push({
      loc: `${SITE_ORIGIN}/hosts/${host.slug}`,
      changefreq: 'weekly',
      priority: '0.7',
      lastmod: extractEntityLastmod(host, '2026-10-12'),
    });
  }

  // Approved resorts
  for (const resort of catalog.resorts) {
    if ((resort.status === 'approved' || resort.status === 'active') && resort.slug) {
      const canonicalSlug = resort.id === 'resort-hedonism-ii-negril' ? 'hedonism-ii' : resort.slug;
      urls.push({
        loc: `${SITE_ORIGIN}/resorts/${canonicalSlug}`,
        changefreq: 'weekly',
        priority: '0.8',
        lastmod: extractEntityLastmod(resort, '2026-10-12'),
      });
    }
  }

  // Approved cruises
  for (const cruise of catalog.cruises) {
    if ((cruise.status === 'approved' || cruise.status === 'active') && cruise.slug) {
      urls.push({
        loc: `${SITE_ORIGIN}/cruises/${cruise.slug}`,
        changefreq: 'weekly',
        priority: '0.8',
        lastmod: extractEntityLastmod(cruise, '2026-10-12'),
      });
    }
  }

  // Active regional discovery pages (ONLY cities with approved clubs or active events)
  const approvedCities = getApprovedCities(catalog);
  for (const city of approvedCities) {
    const cityLastmod = city.lastmod || '2026-10-12';
    if (city.clubs.length > 0) {
      urls.push({
        loc: `${SITE_ORIGIN}/swinger-clubs/${city.slug}`,
        changefreq: 'weekly',
        priority: '0.7',
        lastmod: cityLastmod,
      });
    }
    if (city.events.length > 0) {
      urls.push({
        loc: `${SITE_ORIGIN}/swinger-parties/${city.slug}`,
        changefreq: 'daily',
        priority: '0.7',
        lastmod: cityLastmod,
      });
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const uniqueUrls = urls.filter((item) => {
    if (seen.has(item.loc)) return false;
    seen.add(item.loc);
    return true;
  });

  const xmlItems = uniqueUrls
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlItems}
</urlset>
`;
};

export const generateSitemapXml = async (env?: Record<string, unknown>): Promise<string> => {
  const catalog = await getListingCatalog(env);
  return generateSitemapXmlWithCatalog(catalog);
};
