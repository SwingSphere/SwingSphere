import countryIso2Aliases from '../data/country_iso2.json';

export const ADMIN1_PLACEHOLDER = '_admin1';
export const SELF_CITY_SLUG = '_self';

export type NominatimResult = {
  osm_type?: string;
  osm_id?: number | string;
  address?: Record<string, string | undefined>;
  extratags?: Record<string, string | undefined>;
};

export type OsmRelationTags = {
  admin_level?: string;
  boundary?: string;
  name?: string;
  [key: string]: string | undefined;
};

export type GeoNormalizeInput = {
  country?: string;
  admin1?: string;
  city?: string;
  countrySlug?: string;
  admin1Slug?: string;
  citySlug?: string;
  isCityState?: boolean;
  geocode?: NominatimResult | null;
  relationTags?: OsmRelationTags | null;
};

export type GeoNormalizeResult = {
  normalizedCountrySlug: string;
  normalizedAdmin1Slug: string;
  normalizedCitySlug: string;
  rawAdmin1Slug: string;
  rawCitySlug: string;
  isCityState: boolean;
  usedPlaceholderAdmin1: boolean;
  normalizationWarnings: string[];
};

export const slugifyPlace = (value: string) => {
  if (!value) return '';
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
};

const COUNTRY_ALIAS_MAP = (countryIso2Aliases as { aliases?: Record<string, string> }).aliases ?? {};

export const normalizeCountry = (value: string) => {
  const slug = slugifyPlace(value);
  if (!slug) return '';
  if (slug.length === 2) return slug;
  return COUNTRY_ALIAS_MAP[slug] ?? '';
};

export const normalizeAdmin1 = (value: string, countrySlug: string) => {
  if (!value) return '';
  if (countrySlug === 'us') {
    const isoMatch = value.trim().match(/^us[-_](.+)$/i);
    if (isoMatch?.[1]) {
      return slugifyPlace(isoMatch[1]);
    }
  }
  const slug = slugifyPlace(value);
  if (countrySlug === 'us') {
    if (slug.length === 2) return slug;
    const US_STATE_MAP: Record<string, string> = {
      'alabama': 'al',
      'alaska': 'ak',
      'arizona': 'az',
      'arkansas': 'ar',
      'california': 'ca',
      'colorado': 'co',
      'connecticut': 'ct',
      'delaware': 'de',
      'district-of-columbia': 'dc',
      'florida': 'fl',
      'georgia': 'ga',
      'hawaii': 'hi',
      'idaho': 'id',
      'illinois': 'il',
      'indiana': 'in',
      'iowa': 'ia',
      'kansas': 'ks',
      'kentucky': 'ky',
      'louisiana': 'la',
      'maine': 'me',
      'maryland': 'md',
      'massachusetts': 'ma',
      'michigan': 'mi',
      'minnesota': 'mn',
      'mississippi': 'ms',
      'missouri': 'mo',
      'montana': 'mt',
      'nebraska': 'ne',
      'nevada': 'nv',
      'new-hampshire': 'nh',
      'new-jersey': 'nj',
      'new-mexico': 'nm',
      'new-york': 'ny',
      'north-carolina': 'nc',
      'north-dakota': 'nd',
      'ohio': 'oh',
      'oklahoma': 'ok',
      'oregon': 'or',
      'pennsylvania': 'pa',
      'rhode-island': 'ri',
      'south-carolina': 'sc',
      'south-dakota': 'sd',
      'tennessee': 'tn',
      'texas': 'tx',
      'utah': 'ut',
      'vermont': 'vt',
      'virginia': 'va',
      'washington': 'wa',
      'west-virginia': 'wv',
      'wisconsin': 'wi',
      'wyoming': 'wy',
    };
    return US_STATE_MAP[slug] ?? slug;
  }
  return slug;
};

const extractGeocodeValue = (geocode: NominatimResult | null | undefined, key: string) =>
  geocode?.address?.[key] ?? '';

const extractIsoAdmin1Code = (geocode: NominatimResult | null | undefined) => {
  const address = geocode?.address;
  if (!address) return '';
  const candidates: Array<{ level: number; value: string }> = [];
  Object.entries(address).forEach(([key, value]) => {
    if (!value) return;
    const match = key.match(/ISO3166-2-lvl(\d+)/i);
    if (!match) return;
    const level = Number(match[1]);
    candidates.push({ level: Number.isFinite(level) ? level : 999, value: String(value) });
  });
  if (candidates.length === 0) return '';
  candidates.sort((a, b) => a.level - b.level);
  const code = candidates[0].value.trim();
  if (!code) return '';
  const parts = code.split(/[-_]/);
  return parts[parts.length - 1]?.trim() ?? '';
};

const deriveAdmin1Value = (
  geocode: NominatimResult | null,
  countrySlug: string,
  admin1Input: string
) => {
  const admin1FromGeo =
    extractGeocodeValue(geocode, 'state')
    || extractGeocodeValue(geocode, 'region')
    || extractGeocodeValue(geocode, 'state_district');
  const isoAdmin1 = extractIsoAdmin1Code(geocode);

  if (countrySlug === 'us' && isoAdmin1) return isoAdmin1;
  if (admin1FromGeo) return admin1FromGeo;
  if (admin1Input) return admin1Input;
  if (isoAdmin1) return isoAdmin1;
  return '';
};

const deriveCityValue = (geocode: NominatimResult | null, cityInput: string) =>
  extractGeocodeValue(geocode, 'city')
  || extractGeocodeValue(geocode, 'town')
  || extractGeocodeValue(geocode, 'village')
  || extractGeocodeValue(geocode, 'municipality')
  || cityInput;

const isAdmin1LikeLevel = (
  _countrySlug: string,
  adminLevel: string | undefined,
  citySlug: string,
  countryName: string
) => {
  const level = (adminLevel ?? '').trim();
  if (!level) return false;
  if (level === '4' || level === '6') return true;
  if (level === '2') {
    return Boolean(citySlug && countryName && slugifyPlace(countryName) === citySlug);
  }
  return false;
};

export const normalizePlace = (input: GeoNormalizeInput): GeoNormalizeResult => {
  const geocode = input.geocode ?? null;
  const countryValue = extractGeocodeValue(geocode, 'country_code')
    || extractGeocodeValue(geocode, 'country')
    || input.country
    || '';
  const countryName = extractGeocodeValue(geocode, 'country') || input.country || '';

  const rawProvidedCountrySlug = (input.countrySlug ?? '').trim().toLowerCase();
  const providedCountrySlug = rawProvidedCountrySlug ? normalizeCountry(rawProvidedCountrySlug) : '';
  const providedAdmin1Slug = (input.admin1Slug ?? '').trim().toLowerCase();
  const providedCitySlug = (input.citySlug ?? '').trim().toLowerCase();
  const normalizedCountrySlug = providedCountrySlug || normalizeCountry(countryValue);
  const admin1Value = deriveAdmin1Value(geocode, normalizedCountrySlug, input.admin1 ?? '');
  const cityValue = deriveCityValue(geocode, input.city ?? '');
  const rawAdmin1Slug = normalizeAdmin1(admin1Value, normalizedCountrySlug);
  const rawCitySlug = slugifyPlace(cityValue);
  const warnings = new Set<string>();

  const explicitCityState = Boolean(input.isCityState || providedCitySlug === SELF_CITY_SLUG);
  let isCityState = explicitCityState;

  const relationTags = input.relationTags ?? null;
  const relationBoundaryOk = relationTags?.boundary === 'administrative';
  const admin1LikeLevel = isAdmin1LikeLevel(
    normalizedCountrySlug,
    relationTags?.admin_level,
    rawCitySlug,
    countryName
  );

  if (!isCityState && rawCitySlug && relationBoundaryOk && admin1LikeLevel) {
    if (rawAdmin1Slug && rawAdmin1Slug === rawCitySlug) {
      isCityState = true;
    }
  }

  if (rawAdmin1Slug && rawCitySlug && rawAdmin1Slug !== rawCitySlug) {
    isCityState = false;
  }

  if (normalizedCountrySlug === 'us') {
    if (isCityState) warnings.add('city-state-ignored-us');
    isCityState = false;
  }

  let normalizedAdmin1Slug = providedAdmin1Slug || rawAdmin1Slug;
  let usedPlaceholderAdmin1 = normalizedAdmin1Slug === ADMIN1_PLACEHOLDER;

  if (!normalizedAdmin1Slug && rawCitySlug) {
    normalizedAdmin1Slug = ADMIN1_PLACEHOLDER;
    usedPlaceholderAdmin1 = true;
    warnings.add('admin1-missing');
  }

  if (isCityState && rawCitySlug) {
    normalizedAdmin1Slug = providedAdmin1Slug || rawCitySlug;
    usedPlaceholderAdmin1 = false;
    warnings.add('city-state');
  }

  const normalizedCitySlug = providedCitySlug || (isCityState && rawCitySlug ? SELF_CITY_SLUG : rawCitySlug);

  if (!normalizedCountrySlug) warnings.add('country-missing');
  if ((countryValue || rawProvidedCountrySlug) && !normalizedCountrySlug) warnings.add('country-unknown');
  if (!rawCitySlug) warnings.add('city-missing');

  return {
    normalizedCountrySlug,
    normalizedAdmin1Slug,
    normalizedCitySlug,
    rawAdmin1Slug,
    rawCitySlug,
    isCityState,
    usedPlaceholderAdmin1,
    normalizationWarnings: Array.from(warnings),
  };
};
