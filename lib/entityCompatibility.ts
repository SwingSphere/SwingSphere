import type {
  BuildingAsset,
  ClubData,
  EventData,
  Geopoint,
  Listing,
  OrganizationData,
  OrganizationVenueRelationship,
  VenueData,
} from '../types';
import { clubKey, nameSlug, normalizeHostName } from './identityUtils';
import { mockOrganizations } from '../data/mockOrganizations';
import { mockOrganizationVenueRelationships } from '../data/mockEntityRelationships';
import { mockVenues } from '../data/mockVenues';

export type EntityCollections = {
  listings?: Listing[];
  venues?: VenueData[];
  organizations?: OrganizationData[];
  relationships?: OrganizationVenueRelationship[];
};

const defaultCollections = (collections: EntityCollections = {}) => ({
  listings: collections.listings ?? [],
  venues: collections.venues ?? mockVenues,
  organizations: collections.organizations ?? mockOrganizations,
  relationships: collections.relationships ?? mockOrganizationVenueRelationships,
});

const findClubByVenueKey = (venueKey: string | undefined, listings: Listing[]): ClubData | null => {
  if (!venueKey) return null;
  return listings.find((listing): listing is ClubData => (
    listing.type === 'club' && clubKey(listing) === venueKey
  )) ?? null;
};

const findVenueByListingFallback = (listing: Listing, venues: VenueData[]): VenueData | null => (
  venues.find((venue) => venue.id === `venue-${listing.id}`) ?? null
);

const venueToGeopoint = (venue: VenueData): Geopoint => ({
  latitude: venue.latitude,
  longitude: venue.longitude,
  address: venue.address,
});

const isSyntheticListingVenue = (listing: Listing, venue: VenueData | null): boolean =>
  venue?.id === `venue-${listing.id}`;

export const resolveEventVenueId = (
  event: EventData,
  collections: EntityCollections = {},
): string | undefined => {
  const { listings, venues } = defaultCollections(collections);
  if (event.venueId) {
    if (venues.some((venue) => venue.id === event.venueId)) return event.venueId;
    const legacyVenueClub = listings.find((listing): listing is ClubData => (
      listing.type === 'club' && listing.id === event.venueId
    ));
    if (legacyVenueClub) return legacyVenueClub.primaryVenueId ?? `venue-${legacyVenueClub.id}`;
    return event.venueId;
  }
  const venueClub = findClubByVenueKey(event.venueKey, listings);
  if (venueClub) return venueClub.primaryVenueId ?? `venue-${venueClub.id}`;
  return findVenueByListingFallback(event, venues)?.id;
};

export const resolveEventOrganizerOrganizationId = (
  event: EventData,
  collections: EntityCollections = {},
): string | undefined => {
  if (event.organizerOrganizationId) return event.organizerOrganizationId;
  const { organizations } = defaultCollections(collections);
  const normalizedHost = normalizeHostName(event.hostName ?? '');
  if (!normalizedHost) return undefined;
  return organizations.find((organization) => (
    organization.slug === nameSlug(normalizedHost) ||
    organization.id === `org-host-${nameSlug(normalizedHost)}` ||
    normalizeHostName(organization.name) === normalizedHost
  ))?.id;
};

export const getPrimaryVenueForClub = (
  club: ClubData,
  collections: EntityCollections = {},
): VenueData | null => {
  const { venues, relationships } = defaultCollections(collections);
  if (club.primaryVenueId) {
    const explicitVenue = venues.find((venue) => venue.id === club.primaryVenueId);
    if (explicitVenue) return explicitVenue;
  }

  const relationship = relationships.find((rel) => (
    club.ownerOrganizationId
      ? rel.organizationId === club.ownerOrganizationId && rel.isPrimary
      : false
  ));
  if (relationship) {
    const venue = venues.find((candidate) => candidate.id === relationship.venueId);
    if (venue) return venue;
  }

  return findVenueByListingFallback(club, venues);
};

export const getVenueForEvent = (
  event: EventData,
  collections: EntityCollections = {},
): VenueData | null => {
  const resolvedVenueId = resolveEventVenueId(event, collections);
  const { venues } = defaultCollections(collections);
  return resolvedVenueId
    ? venues.find((venue) => venue.id === resolvedVenueId) ?? null
    : null;
};

export const getVenueForListing = (
  listing: Listing,
  collections: EntityCollections = {},
): VenueData | null => (
  listing.type === 'club'
    ? getPrimaryVenueForClub(listing, collections)
    : getVenueForEvent(listing, collections)
);

export const getOrganizationForClub = (
  club: ClubData,
  collections: EntityCollections = {},
): OrganizationData | null => {
  const { organizations } = defaultCollections(collections);
  if (club.ownerOrganizationId) {
    return organizations.find((organization) => organization.id === club.ownerOrganizationId) ?? null;
  }
  // Legacy fallback for pre-normalization fixtures only. Production listings now
  // receive ownerOrganizationId from the normalized Supabase relationship.
  return organizations.find((organization) => organization.id === `org-${club.id}`) ?? null;
};

export const getClubForOrganization = (
  organization: OrganizationData,
  collections: EntityCollections = {},
): ClubData | null => {
  const { listings } = defaultCollections(collections);
  return listings.find((listing): listing is ClubData => (
    listing.type === 'club' && getOrganizationForClub(listing, collections)?.id === organization.id
  )) ?? null;
};

export const getOrganizationForEvent = (
  event: EventData,
  collections: EntityCollections = {},
): OrganizationData | null => {
  const organizationId = resolveEventOrganizerOrganizationId(event, collections);
  const { organizations } = defaultCollections(collections);
  return organizationId
    ? organizations.find((organization) => organization.id === organizationId) ?? null
    : null;
};

export const getBuildingAssetVenueId = (
  asset: BuildingAsset,
  collections: EntityCollections = {},
): string | undefined => {
  if (asset.venueId) return asset.venueId;
  const { listings } = defaultCollections(collections);
  const listing = listings.find((candidate) => candidate.id === asset.listingId);
  return listing ? getVenueForListing(listing, collections)?.id : undefined;
};

export const getBuildingAssetForListing = (
  listing: Listing | null,
  assets: BuildingAsset[],
  collections: EntityCollections = {},
): BuildingAsset | null => {
  if (!listing) return null;
  const venue = getVenueForListing(listing, collections);
  const venueId = venue?.id;
  const { listings } = defaultCollections(collections);

  // Physical building geometry belongs to the Venue, not to each event that
  // happens there. Prefer the Venue's explicit asset pointer when one exists.
  if (venue?.buildingAssetId) {
    const explicitVenueAsset = assets.find((asset) => asset.id === venue.buildingAssetId);
    if (explicitVenueAsset) return explicitVenueAsset;
  }

  if (venueId) {
    // Older canonical club assets predate venueId on BuildingAsset. Infer their
    // venue through the source listing so every event at that Venue can reuse
    // the same geometry instead of creating a duplicate event-owned asset.
    const canonicalVenueAsset = assets.find((asset) => {
      if (getBuildingAssetVenueId(asset, collections) !== venueId) return false;
      const sourceListing = listings.find((candidate) => candidate.id === asset.listingId);
      return sourceListing?.type === 'club';
    });
    if (canonicalVenueAsset) return canonicalVenueAsset;

    const venueMatch = assets.find((asset) => getBuildingAssetVenueId(asset, collections) === venueId);
    if (venueMatch) return venueMatch;
  }

  const authoredAssetId = listing.buildingAssetId;
  if (authoredAssetId) {
    const exactMatch = assets.find((asset) => asset.id === authoredAssetId);
    if (exactMatch) return exactMatch;
  }

  // TODO(SEMv2 Phase 4): remove listingId matching after all authored assets carry venueId.
  const directListingMatch = assets.find((asset) => asset.listingId === listing.id);
  if (directListingMatch) return directListingMatch;

  // Legacy events may point at a club listing id instead of a Venue entity id.
  // In that case the event shares the club's physical building asset.
  if (listing.type === 'event') {
    const { listings } = defaultCollections(collections);
    const legacyVenueClub = listings.find((candidate): candidate is ClubData => (
      candidate.type === 'club' && (
        candidate.id === listing.venueId ||
        (listing.venueKey ? clubKey(candidate) === listing.venueKey : false)
      )
    ));
    if (legacyVenueClub) {
      if (legacyVenueClub.buildingAssetId) {
        const exactClubAsset = assets.find((asset) => asset.id === legacyVenueClub.buildingAssetId);
        if (exactClubAsset) return exactClubAsset;
      }
      const clubListingAsset = assets.find((asset) => asset.listingId === legacyVenueClub.id);
      if (clubListingAsset) return clubListingAsset;
    }
  }

  return null;
};

export const getListingPhysicalGeopoint = (
  listing: Listing,
  collections: EntityCollections = {},
): Geopoint => {
  const venue = getVenueForListing(listing, collections);
  if (isSyntheticListingVenue(listing, venue)) return listing.geopoint;
  // TODO(SEMv2 Phase 4): remove the listing.geopoint fallback once Venue is required for physical location.
  return venue ? venueToGeopoint(venue) : listing.geopoint;
};

export const getListingPhysicalCoords = (
  listing: Listing,
  collections: EntityCollections = {},
): { lat: number; lng: number } | null => {
  const geopoint = getListingPhysicalGeopoint(listing, collections);
  const { latitude, longitude } = geopoint;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { lat: latitude, lng: longitude };
};

export const getListingPhysicalAddress = (
  listing: Listing,
  collections: EntityCollections = {},
): Geopoint['address'] => getListingPhysicalGeopoint(listing, collections).address;

export const formatListingPhysicalAddress = (
  listing: Listing,
  collections: EntityCollections = {},
): string => {
  const venue = getVenueForListing(listing, collections);
  if (!venue && listing.location?.trim()) return listing.location;
  const address = getListingPhysicalAddress(listing, collections);
  return [
    address.addressLine1,
    address.addressLine2,
    address.city,
    address.region,
    address.postalCode,
    address.country,
  ].filter(Boolean).join(', ');
};

export const getListingPhysicalCityLabel = (
  listing: Listing,
  collections: EntityCollections = {},
): string => {
  const address = getListingPhysicalAddress(listing, collections);
  return [address.city, address.region, address.country].filter(Boolean).join(', ') || 'Unknown location';
};

export const getListingDisplayVenue = (
  listing: Listing,
  collections: EntityCollections = {},
): Pick<VenueData, 'id' | 'name' | 'slug' | 'visibility'> | null => {
  const venue = getVenueForListing(listing, collections);
  return venue
    ? {
        id: venue.id,
        name: venue.name,
        slug: venue.slug,
        visibility: venue.visibility,
      }
    : null;
};
