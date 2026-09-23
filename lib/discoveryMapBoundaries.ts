import type { Listing } from '../types';
import { getListingPhysicalAddress } from './entityCompatibility';
import { buildGeoUrlPaths } from './geoAdmin';

const BAY_AREA_SEVEN_COUNTY_BOUNDARIES = [
  '/geo/admin/us/ca/counties/alameda.geojson',
  '/geo/admin/us/ca/counties/contra-costa.geojson',
  '/geo/admin/us/ca/counties/marin.geojson',
  '/geo/admin/us/ca/san-francisco-city.geojson',
  '/geo/admin/us/ca/counties/san-mateo.geojson',
  '/geo/admin/us/ca/counties/santa-clara.geojson',
  '/geo/admin/us/ca/counties/sonoma.geojson',
] as const;

const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase();

const looksLikeBayArea = (name: string) => {
  const value = normalized(name);
  return value === 'bay area'
    || value === 'san francisco bay area'
    || value.includes('bay area');
};

const listingsAreCalifornia = (listings: Listing[]) => {
  if (!listings.length) return false;
  return listings.some((listing) => {
    const address = getListingPhysicalAddress(listing);
    const region = normalized(address.region);
    const country = normalized(address.country);
    return (region === 'ca' || region === 'california')
      && (!country || country === 'united states' || country === 'usa' || country === 'us');
  });
};

export const getDiscoveryContextBoundaryUrls = (
  scopeName: string | null | undefined,
  listings: Listing[],
): string[] => {
  if (!scopeName || !looksLikeBayArea(scopeName) || !listingsAreCalifornia(listings)) return [];
  return [...BAY_AREA_SEVEN_COUNTY_BOUNDARIES];
};

export const getListingCityBoundaryUrl = (listing: Listing | null | undefined): string | null => {
  if (!listing) return null;
  const address = getListingPhysicalAddress(listing);
  const city = normalized(address.city);
  const region = normalized(address.region);
  const country = normalized(address.country);

  if (
    city === 'san francisco'
    && (region === 'ca' || region === 'california')
    && (!country || country === 'united states' || country === 'usa' || country === 'us')
  ) {
    return '/geo/admin/us/ca/san-francisco-city.geojson';
  }

  const paths = buildGeoUrlPaths({
    country: address.country,
    region: address.region,
    city: address.city,
    postalCode: address.postalCode,
    countrySlug: address.countrySlug,
    admin1Slug: address.admin1Slug,
    citySlug: address.citySlug,
  });

  return paths.paths.city || null;
};

export const BAY_AREA_SEVEN_COUNTY_BOUNDARY_URLS = [...BAY_AREA_SEVEN_COUNTY_BOUNDARIES];
