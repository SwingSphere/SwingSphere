import type { ClubData, Listing, VenueData, VenueVisibility } from '../types';
import { nameSlug } from '../lib/identityUtils';
import { mockData } from './mockData';

const toVenueVisibility = (listing: Listing): VenueVisibility => {
  if (listing.type === 'event' && listing.isAddressPrivate) return 'private';
  return 'public_exact';
};

const toVenueName = (listing: Listing): string => {
  if (listing.type === 'club') return listing.name;
  return listing.isAddressPrivate ? `${listing.geopoint.address.city || listing.location} private venue` : listing.location || listing.name;
};

const toVenueSlug = (listing: Listing): string => {
  const baseSlug = nameSlug(toVenueName(listing));
  return `${baseSlug}-${listing.id}`;
};

const listingToVenue = (listing: Listing): VenueData => ({
  // SEMv2 Phase 1 compatibility ID. Replace with persisted venue IDs when venues are stored independently.
  id: `venue-${listing.id}`,
  type: 'venue',
  name: toVenueName(listing),
  slug: toVenueSlug(listing),
  description: listing.type === 'club' ? listing.description_short : undefined,
  address: listing.geopoint.address,
  latitude: listing.geopoint.latitude,
  longitude: listing.geopoint.longitude,
  locationMeta: listing.locationMeta,
  visibility: toVenueVisibility(listing),
  status: listing.status,
  amenities: listing.type === 'club' ? [...listing.generalAmenities] : [],
  logoImageUrl: listing.logoImageUrl,
  headerImageUrl: listing.headerImageUrl,
  galleryImageUrls: listing.galleryImageUrls,
  buildingAssetId: listing.buildingAssetId,
});

const isClub = (listing: Listing): listing is ClubData => listing.type === 'club';

const hasVerifiedStreetAddress = (venue: VenueData) => Boolean(venue.address.addressLine1?.trim());

const VERIFIED_VENUE_SOURCE_IDS = new Set([
  'club-twist-sf',
  'club-power-exchange-sf',
  'club-club-joi-la',
]);

export const mockVenues: VenueData[] = mockData
  .filter(isClub)
  .filter((club) => VERIFIED_VENUE_SOURCE_IDS.has(club.id))
  .map(listingToVenue)
  .filter(hasVerifiedStreetAddress);
