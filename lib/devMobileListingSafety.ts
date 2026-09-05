import type { ClubData, EventData, Listing } from '../types';
import bundledPublicListings from 'virtual:swingsphere-public-listings';
import { isApproximateLocation } from './publicLocation';

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
const normalizeDevMobileListing = (listing: Listing): Listing => {
  const common = {
    ...listing,
    location: typeof listing.location === 'string' ? listing.location : '',
    mediaAssets: Array.isArray(listing.mediaAssets) ? listing.mediaAssets : [],
    entryRequirements: Array.isArray(listing.entryRequirements) ? listing.entryRequirements : [],
  };

  if (listing.type === 'club') {
    return {
      ...common,
      schedule: Array.isArray(listing.schedule) ? listing.schedule : [],
      generalAmenities: Array.isArray(listing.generalAmenities) ? listing.generalAmenities : [],
      description_short: typeof listing.description_short === 'string' ? listing.description_short : '',
    } as ClubData;
  }

  if (listing.type === 'event') {
    const start = typeof listing.time?.start === 'string' ? listing.time.start : '';
    const end = typeof listing.time?.end === 'string' ? listing.time.end : start;
    return {
      ...common,
      tags: Array.isArray(listing.tags) ? listing.tags : [],
      time: { ...listing.time, start, end },
      description_full: typeof listing.description_full === 'string' ? listing.description_full : '',
    } as EventData;
  }

  return common as Listing;
};

export const applyDevMobileListingSafety = (listing: Listing): Listing => {
  const normalized = normalizeDevMobileListing(listing);
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
