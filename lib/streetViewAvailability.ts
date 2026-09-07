import buildingAssetsJson from 'virtual:swingsphere-public-street-view-building-assets';
import type { BuildingAsset, Listing } from '../types';
import { getBuildingAssetForListing, type EntityCollections } from './entityCompatibility';

const buildingAssets = buildingAssetsJson as unknown as BuildingAsset[];
const streetViewListingIds = new Set(
  buildingAssets
    .map((asset) => String(asset?.listingId ?? '').trim())
    .filter(Boolean),
);

export const hasStreetViewForListing = (listingId?: string | null): boolean =>
  Boolean(listingId && streetViewListingIds.has(listingId));

/**
 * Street View profiles are still keyed by the canonical listing that authored
 * the venue geometry. Resolve through Venue ownership first so clubs and events
 * at the same physical venue share one Street View scene.
 */
export const resolveStreetViewSourceListingId = (
  listing: Listing | null,
  collections: EntityCollections = {},
): string | null => {
  if (!listing) return null;
  const asset = getBuildingAssetForListing(listing, buildingAssets, collections);
  const sourceListingId = String(asset?.listingId ?? '').trim();
  return sourceListingId && streetViewListingIds.has(sourceListingId) ? sourceListingId : null;
};

export const getStreetViewPath = (listingId: string): string =>
  `/street-view?listingId=${encodeURIComponent(listingId)}`;
