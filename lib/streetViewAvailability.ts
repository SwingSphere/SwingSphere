import buildingAssetsJson from 'virtual:swingsphere-public-street-view-building-assets';
import publicListingsJson from 'virtual:swingsphere-public-listings';
import type { BuildingAsset, Listing } from '../types';
import { getBuildingAssetForListing, type EntityCollections } from './entityCompatibility';

const buildingAssets = buildingAssetsJson as unknown as BuildingAsset[];
const publicListings = publicListingsJson as unknown as Listing[];
const streetViewListingIds = new Set(
  publicListings
    .filter((listing) => (
      listing?.status === 'approved'
      && listing?.type === 'club'
      && listing?.isAddressPrivate !== true
      && listing?.locationVisibility !== 'approximate_public'
      && listing?.locationVisibility !== 'private'
      && listing?.locationVisibility !== 'hidden'
      && listing?.locationMeta?.status !== 'private'
      && Boolean(listing?.geopoint?.address?.addressLine1?.trim())
    ))
    .map((listing) => String(listing.id).trim())
    .filter(Boolean),
);

export const isStreetViewEligibleListing = (listing?: Listing | null): boolean => Boolean(
  listing
  && listing.status === 'approved'
  && listing.type === 'club'
  && listing.isAddressPrivate !== true
  && listing.locationVisibility !== 'approximate_public'
  && listing.locationVisibility !== 'private'
  && listing.locationVisibility !== 'hidden'
  && listing.locationMeta?.status !== 'private'
  && listing.geopoint?.address?.addressLine1?.trim()
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
