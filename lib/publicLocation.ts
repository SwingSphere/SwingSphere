import type { Listing } from '../types';
import { getListingPhysicalAddress, getListingPhysicalCoords, type EntityCollections } from './entityCompatibility';

const APPROXIMATE_RADIUS_METERS = 1200;
const APPROXIMATE_COORDINATE_PRECISION = 2;

type PrivacyAwareListing = Listing & {
  locationVisibility?: 'exact_public' | 'approximate_public';
  isAddressPrivate?: boolean;
};

const hasLegacyPrivacyHint = (listing: Listing): boolean => {
  const addressLine1 = listing.geopoint?.address?.addressLine1?.trim().toLowerCase() ?? '';
  const location = listing.location?.trim().toLowerCase() ?? '';
  const warnings = listing.locationMeta?.warnings?.map((warning) => warning.trim().toLowerCase()) ?? [];

  if (addressLine1.startsWith('private location') || location.startsWith('private location')) return true;

  return warnings.some((warning) => (
    warning.includes('exact-address')
    && (warning.includes('private') || warning.includes('hidden') || warning.includes('ticketed'))
  ));
};

export const isApproximateLocation = (listing: Listing | null | undefined): boolean => {
  if (!listing) return false;
  const privacyAwareListing = listing as PrivacyAwareListing;
  return (
    privacyAwareListing.locationVisibility === 'approximate_public' ||
    privacyAwareListing.isAddressPrivate === true ||
    hasLegacyPrivacyHint(listing)
  );
};

export const getApproximateRadiusMeters = (_listing: Listing): number => APPROXIMATE_RADIUS_METERS;

export const getApproximateLocationCenter = (
  listing: Listing,
  collections: EntityCollections = {},
): { latitude: number; longitude: number } | null => {
  const coords = getListingPhysicalCoords(listing, collections);
  if (!coords) return null;
  const factor = 10 ** APPROXIMATE_COORDINATE_PRECISION;
  return {
    latitude: Math.round(coords.lat * factor) / factor,
    longitude: Math.round(coords.lng * factor) / factor,
  };
};

export const getPublicLocationLabel = (
  listing: Listing,
  collections: EntityCollections = {},
): string => {
  if (!isApproximateLocation(listing)) {
    return listing.location?.trim() || 'Location TBD';
  }

  const address = getListingPhysicalAddress(listing, collections);
  if (address.postalCode?.trim()) return `${address.postalCode.trim()} area`;

  const cityRegion = [address.city, address.region].filter(Boolean).join(', ');
  if (cityRegion) return `${cityRegion} area`;
  if (address.city) return `${address.city} area`;
  if (address.region) return `${address.region} area`;
  return 'Approximate location';
};

