import type { Listing } from '../types';
import { getListingPhysicalCoords, type EntityCollections } from './entityCompatibility';
import { isApproximateLocation } from './publicLocation';

const GRID_SIZE = 0.02;
const GRID_JITTER = 0.4;

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number) => {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const getPrivacySafePoint = (lat: number, lng: number, listingId: string) => {
  const rand = mulberry32(hashString(`listing:${listingId}`));
  const snappedLat = Math.floor(lat / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2;
  const snappedLng = Math.floor(lng / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2;
  return {
    lat: snappedLat + (rand() - 0.5) * GRID_SIZE * GRID_JITTER,
    lng: snappedLng + (rand() - 0.5) * GRID_SIZE * GRID_JITTER,
  };
};

export const getListingDisplayCoords = (
  listing: Listing,
  collections: EntityCollections = {},
) => {
  const coords = getListingPhysicalCoords(listing, collections);
  if (!coords) return null;
  if (isApproximateLocation(listing)) {
    return getPrivacySafePoint(coords.lat, coords.lng, listing.id);
  }
  return coords;
};

export const getListingCanonicalCoords = (
  listing: Listing,
  collections: EntityCollections = {},
) => {
  return getListingPhysicalCoords(listing, collections);
};

export type ExplorerMarker = {
  listingId: string;
  type: Listing['type'];
  name: string;
  lng: number;
  lat: number;
  isPrivate: boolean;
};

export const buildExplorerMarkers = (
  listings: Listing[],
  collections: EntityCollections = {},
): ExplorerMarker[] =>
  listings
    .map((listing) => {
      const coords = getListingDisplayCoords(listing, collections);
      if (!coords) return null;
      return {
        listingId: listing.id,
        type: listing.type,
        name: listing.name,
        lng: coords.lng,
        lat: coords.lat,
        isPrivate: isApproximateLocation(listing),
      };
    })
    .filter((marker): marker is ExplorerMarker => marker !== null);
