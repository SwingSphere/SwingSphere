import type { ClubData, EventData, Listing } from '../types';
import bundledPublicListings from 'virtual:swingsphere-public-listings';
import { isApproximateLocation } from './publicLocation';
import { normalizeListing } from './explorerFilters';

const bundledById = new Map(bundledPublicListings.map((listing) => [listing.id, listing]));

/**
 * Dev Mobile uses live/Supabase listings for normal content, but the bundled
 * catalog acts as a privacy floor. If the bundled record says a location is
 * private or approximate, a stale remote row must never re-expose an older
 * exact address or exact map position inside the mobile experiment.
 *
 * This intentionally does not overwrite exact-public remote listings with
 * bundled data. It only upgrades privacy protection.
 */
export const applyDevMobileListingSafety = (listing: Listing): Listing => {
  const normalized = normalizeListing(listing);
  const bundled = bundledById.get(normalized.id);
  if (!bundled || !isApproximateLocation(bundled)) return normalized;

  const base = {
    ...normalized,
    location: bundled.location,
    geopoint: bundled.geopoint,
    locationMeta: bundled.locationMeta,
  };

  if (normalized.type === 'club' && bundled.type === 'club') {
    return {
      ...base,
      locationVisibility: bundled.locationVisibility ?? 'approximate_public',
    } as ClubData;
  }

  if (normalized.type === 'event' && bundled.type === 'event') {
    return {
      ...base,
      isAddressPrivate: true,
    } as EventData;
  }

  return normalized;
};

export const applyDevMobileListingSafetyToAll = (listings: Listing[]): Listing[] =>
  listings.map(applyDevMobileListingSafety);
