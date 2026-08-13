import type { Listing } from '../types';
import { clubKey } from './identityUtils';
import {
  getListingPhysicalGeopoint,
  getVenueForListing,
  type EntityCollections,
} from './entityCompatibility';

export type DiscoveryPoint = {
  id: string;
  latitude: number;
  longitude: number;
  listingIds: string[];
  clubIds: string[];
  eventIds: string[];
  city: string;
  region: string;
  country: string;
  listingName?: string;
  logoImageUrl?: string;
};

type MutableDiscoveryPoint = DiscoveryPoint & { coordinateCount: number };

export const adaptListingsToDiscoveryPoints = (
  listings: Listing[],
  collections: EntityCollections = {},
): DiscoveryPoint[] => {
  const points = new Map<string, MutableDiscoveryPoint>();

  for (const listing of listings) {
    const physicalGeopoint = getListingPhysicalGeopoint(listing, { ...collections, listings });
    const latitude = physicalGeopoint.latitude;
    const longitude = physicalGeopoint.longitude;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const venue = getVenueForListing(listing, { ...collections, listings });
    // TODO(SEMv2 Phase 4): remove legacy clubKey fallback after all discovery points are venue-backed.
    const pointId = venue ? `venue:${venue.id}` : `venue:${listing.type === 'club' ? clubKey(listing) : listing.id}`;
    const existing = points.get(pointId);

    if (existing) {
      const nextCount = existing.coordinateCount + 1;
      existing.latitude += (latitude - existing.latitude) / nextCount;
      existing.longitude += (longitude - existing.longitude) / nextCount;
      existing.coordinateCount = nextCount;
      existing.listingIds.push(listing.id);
      if (listing.type === 'club') existing.clubIds.push(listing.id);
      else existing.eventIds.push(listing.id);
      continue;
    }

    points.set(pointId, {
      id: pointId,
      latitude,
      longitude,
      listingIds: [listing.id],
      clubIds: listing.type === 'club' ? [listing.id] : [],
      eventIds: listing.type === 'event' ? [listing.id] : [],
      city: physicalGeopoint.address.city,
      region: physicalGeopoint.address.region,
      country: physicalGeopoint.address.country,
      listingName: listing.name,
      logoImageUrl: listing.logoImageUrl,
      coordinateCount: 1,
    });
  }

  return Array.from(points.values(), ({ coordinateCount: _coordinateCount, ...point }) => point);
};
