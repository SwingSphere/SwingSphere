import { ADMIN1_PLACEHOLDER, normalizePlace } from './geoNormalize';

export type GeoLevel = 'zip' | 'city' | 'admin1' | 'country';

export type GeoAddress = {
  country?: string;
  region?: string;
  city?: string;
  postalCode?: string;
  countrySlug?: string;
  admin1Slug?: string;
  citySlug?: string;
  isCityState?: boolean;
};

const joinUrl = (...parts: string[]) => {
  const hasLeadingSlash = parts.some((part, index) => index === 0 && part.startsWith('/'));
  const joined = parts
    .filter(Boolean)
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .join('/')
    .replace(/\/+/g, '/');
  return hasLeadingSlash ? `/${joined}` : joined;
};

export const resolveGeoHierarchy = (address: GeoAddress) =>
  normalizePlace({
    country: address.country,
    admin1: address.region,
    city: address.city,
    countrySlug: address.countrySlug,
    admin1Slug: address.admin1Slug,
    citySlug: address.citySlug,
    isCityState: address.isCityState,
  });

export const getGeoSlugs = (address: GeoAddress) => resolveGeoHierarchy(address);

export const buildGeoUrlPaths = (address: GeoAddress) => {
  const {
    normalizedCountrySlug,
    normalizedAdmin1Slug,
    normalizedCitySlug,
    rawAdmin1Slug,
    rawCitySlug,
    isCityState,
    usedPlaceholderAdmin1,
    normalizationWarnings,
  } = resolveGeoHierarchy(address);
  const postalCode = (address.postalCode ?? '').trim();
  const base = '/geo/country';
  const country = normalizedCountrySlug ? joinUrl(base, normalizedCountrySlug, 'boundary-simplified.json') : '';
  const admin1 = normalizedAdmin1Slug
    ? joinUrl(base, normalizedCountrySlug, normalizedAdmin1Slug, 'boundary-simplified.json')
    : '';
  const cityBase = normalizedCountrySlug && normalizedAdmin1Slug && normalizedCitySlug
    ? joinUrl(base, normalizedCountrySlug, normalizedAdmin1Slug, normalizedCitySlug)
    : '';
  const city = cityBase ? joinUrl(cityBase, 'boundary-simplified.json') : '';
  const zip = postalCode && cityBase
    ? joinUrl(cityBase, 'zip', postalCode, 'boundary-simplified.json')
    : '';
  const roads = cityBase ? joinUrl(cityBase, 'roads-simplified.json') : '';
  const districts = cityBase ? joinUrl(cityBase, 'districts-simplified.json') : '';


  return {
    countrySlug: normalizedCountrySlug,
    admin1Slug: rawAdmin1Slug,
    normalizedAdmin1Slug,
    citySlug: rawCitySlug,
    cityFolder: normalizedCitySlug,
    postalCode,
    isCityState,
    usedPlaceholderAdmin1,
    normalizationWarnings,
    hierarchy: normalizedAdmin1Slug
      ? (rawCitySlug ? 'country-admin1-city' : 'country-admin1')
      : (rawCitySlug ? 'country-city' : 'country'),
    paths: { country, admin1, city, zip, roads, districts },
  };
};

export const buildBoundaryCandidates = (address: GeoAddress): Array<{ level: GeoLevel; path: string }> => {
  const { countrySlug, normalizedAdmin1Slug, cityFolder, postalCode, paths } = buildGeoUrlPaths(address);
  const candidates: Array<{ level: GeoLevel; path: string }> = [];

  if (postalCode && countrySlug && cityFolder && paths.zip) {
    candidates.push({ level: 'zip', path: paths.zip });
  }
  if (countrySlug && cityFolder && paths.city) {
    candidates.push({ level: 'city', path: paths.city });
  }
  if (countrySlug && normalizedAdmin1Slug && normalizedAdmin1Slug !== ADMIN1_PLACEHOLDER) {
    candidates.push({ level: 'admin1', path: paths.admin1 });
  }
  if (countrySlug) {
    candidates.push({ level: 'country', path: paths.country });
  }

  return candidates;
};
