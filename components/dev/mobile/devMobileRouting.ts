import type { EntityIndex } from '../../../lib/entityIndex';
import { getListingCanonicalPath } from '../../../lib/entityUtils';
import type { Listing } from '../../../types';

export const DEV_MOBILE_BASE = '/dev/mobile-preview';

export const toDevMobilePath = (path: string): string => {
  if (!path || path === '/') return DEV_MOBILE_BASE;
  if (path.startsWith(DEV_MOBILE_BASE)) return path;
  return `${DEV_MOBILE_BASE}${path.startsWith('/') ? path : `/${path}`}`;
};

export const getDevMobileListingPath = (listing: Listing, index?: EntityIndex): string =>
  toDevMobilePath(getListingCanonicalPath(listing, index));

export const getDevMobileMapPath = (listingId: string): string =>
  `${DEV_MOBILE_BASE}?mapListing=${encodeURIComponent(listingId)}`;

