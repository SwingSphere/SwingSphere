import type { Geopoint, ListingLocationMeta } from '../types';
import { extractAddressHouseNumber } from './addressParsing';

export type ListingAddress = {
  addressLine1?: string;
  addressLine2?: string;
  city: string;
  region?: string;
  postalCode?: string;
  country: string;
};

export type ListingLocationValidationInput = {
  freeformAddress: string;
  listingType: 'club' | 'event';
  venueKey?: string;
  advancedAddress?: ListingAddress;
};

export type ListingLocationValidationResult = {
  geopoint: Geopoint | null;
  meta: ListingLocationMeta;
  displayAddress: string;
  normalizedAddress: string;
  resolvedAddress: ListingAddress | null;
  rawGeocoderLabel?: string;
  warnings: string[];
};

type NominatimSearchResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  importance?: number;
  category?: string;
  type?: string;
  addresstype?: string;
  place_rank?: number;
  name?: string;
  address?: Record<string, string | undefined>;
};

type RankedGeocodeCandidate = {
  result: NominatimSearchResult;
  query: string;
  precision: LocationPrecision;
  precisionRank: number;
  importance: number;
};

type LocationPrecision = 'address' | 'building' | 'poi' | 'street' | 'neighborhood' | 'city';

const PRECISION_RANK: Record<LocationPrecision, number> = {
  address: 6,
  building: 5,
  poi: 4,
  street: 3,
  neighborhood: 2,
  city: 1,
};

const joinParts = (...parts: Array<string | undefined | null>) =>
  parts.filter((part): part is string => Boolean(part && part.trim())).join(', ');

export const formatListingAddress = (address: ListingAddress) =>
  joinParts(address.addressLine1, address.addressLine2, address.city, address.region, address.postalCode, address.country);

const pickAddressValue = (address: Record<string, string | undefined>, keys: string[]) => {
  for (const key of keys) {
    const value = address[key];
    if (value && value.trim()) return value.trim();
  }
  return '';
};

const buildAddressFromGeocode = (result: NominatimSearchResult): ListingAddress | null => {
  if (!result.address) return null;
  const street = joinParts(
    pickAddressValue(result.address, ['house_number']),
    pickAddressValue(result.address, ['road', 'pedestrian', 'footway', 'path', 'street']),
  );
  const line1 = street || pickAddressValue(result.address, ['amenity', 'building', 'attraction']);
  const city = pickAddressValue(result.address, ['city', 'town', 'village', 'hamlet', 'municipality', 'suburb']);
  const region = pickAddressValue(result.address, ['state', 'region', 'county']);
  const postalCode = pickAddressValue(result.address, ['postcode']);
  const country = pickAddressValue(result.address, ['country']) || 'United States';
  if (!city && !region && !country) return null;
  return {
    addressLine1: line1 || undefined,
    city: city || region || country,
    region: region || undefined,
    postalCode: postalCode || undefined,
    country,
  };
};

const getLocationPrecision = (result: NominatimSearchResult): LocationPrecision => {
  const address = result.address ?? {};
  const hasHouseNumber = Boolean(address.house_number?.trim());
  const hasRoad = Boolean(address.road?.trim());
  const addresstype = result.addresstype ?? '';
  const type = result.type ?? '';
  const category = result.category ?? '';

  if (hasHouseNumber && hasRoad) return 'address';
  if (['house', 'yes', 'residential', 'apartments', 'commercial', 'retail', 'office'].includes(type)) return 'building';
  if (['building'].includes(addresstype) || category === 'building') return 'building';
  if (['amenity', 'tourism', 'shop', 'leisure'].includes(category)) return 'poi';
  if (hasRoad || ['road', 'highway', 'street'].includes(addresstype) || category === 'highway') return 'street';
  if (['neighbourhood', 'neighborhood', 'suburb', 'quarter', 'city_district', 'district'].includes(addresstype) || ['neighbourhood', 'suburb', 'quarter'].includes(type)) {
    return 'neighborhood';
  }
  return 'city';
};

const rankGeocodeCandidates = (results: Array<{ query: string; result: NominatimSearchResult }>) =>
  results
    .filter(({ result }) => Boolean(result.lat && result.lon))
    .map<RankedGeocodeCandidate>(({ query, result }) => {
      const precision = getLocationPrecision(result);
      return {
        query,
        result,
        precision,
        precisionRank: PRECISION_RANK[precision],
        importance: result.importance ?? 0,
      };
    })
    .sort((a, b) => {
      if (b.precisionRank !== a.precisionRank) return b.precisionRank - a.precisionRank;
      if (b.importance !== a.importance) return b.importance - a.importance;
      return (a.result.place_rank ?? 99) - (b.result.place_rank ?? 99);
    });

const logRawGeocoderResponse = (query: string, data: NominatimSearchResult[]) => {
  if (typeof console === 'undefined') return;
  console.debug('[SwingSphere address validation] raw Nominatim response', {
    query,
    results: data,
  });
};

const STREET_DESIGNATOR_PATTERN = /\b(?:st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|ln|lane|ct|court|way|pkwy|parkway|hwy|highway|calle|carrera|avenida|avda|carretera|camino|paseo|rua|rue|via|viale|strada|strasse|straße|weg|ul|ulica)\b/iu;

const looksLikeStreetAddress = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || !/\d/.test(trimmed)) return false;
  const firstSegment = trimmed.split(',')[0]?.trim() ?? trimmed;
  const firstSegmentHasLettersAndNumbers = /\p{L}/u.test(firstSegment) && /\d/.test(firstSegment);
  return firstSegmentHasLettersAndNumbers || STREET_DESIGNATOR_PATTERN.test(trimmed) || /#\s*\d/iu.test(trimmed);
};

const normalizeAddressComparable = (value: string) => value
  .normalize('NFKD')
  .replace(/\p{M}/gu, '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const STREET_TOKEN_STOP_WORDS = new Set([
  'east', 'west', 'north', 'south', 'northeast', 'northwest', 'southeast', 'southwest',
  'ave', 'avenue', 'st', 'street', 'rd', 'road', 'dr', 'drive', 'blvd', 'boulevard',
  'ln', 'lane', 'ct', 'court', 'way', 'pkwy', 'parkway', 'hwy', 'highway', 'unit', 'suite',
  'apt', 'apartment', 'floor', 'fl', 'east', 'e', 'west', 'w', 'north', 'n', 'south', 's',
  'calle', 'carrera', 'avenida', 'avda', 'carretera', 'camino', 'paseo', 'rua', 'rue', 'via',
  'viale', 'strada', 'strasse', 'straße', 'weg', 'ul', 'ulica', 'de', 'del', 'da', 'do', 'dos',
  'das', 'la', 'el',
]);

const houseNumbersCompatible = (input: string, resolved: string) => {
  if (input === resolved) return true;
  const [inputStart, inputEnd] = input.split('-');
  const [resolvedStart, resolvedEnd] = resolved.split('-');
  if (inputEnd && !resolvedEnd && inputStart === resolved) return true;
  if (resolvedEnd && !inputEnd && resolvedStart === input) return true;
  return false;
};
const getPostalCode = (value: string) => {
  const normalized = value.normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase();
  const patterns = [
    /\b(?:GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/, // United Kingdom
    /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/, // Canada
    /\b\d{4}\s?[A-Z]{2}\b/, // Netherlands
    /\b\d{6}\b/, // Colombia, India and other six-digit systems
    /\b\d{5}(?:[-\s]?\d{4})?\b/, // United States and other five-digit systems
    /\b\d{4}\b/, // South Africa, Australia, Austria and other four-digit systems
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern)?.[0];
    if (match) return match.replace(/[^A-Z0-9]/g, '');
  }
  return '';
};

const getStreetTokensFromFreeform = (value: string) => {
  const firstSegment = value.split(',')[0] ?? value;
  return normalizeAddressComparable(firstSegment)
    .split(' ')
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token) && !STREET_TOKEN_STOP_WORDS.has(token));
};

export const isResolvedAddressPlausibleForInput = (inputAddress: string, resolvedAddress?: ListingAddress | null) => {
  if (!inputAddress.trim() || !resolvedAddress) return true;
  if (!looksLikeStreetAddress(inputAddress)) return true;

  const resolvedLine = normalizeAddressComparable(resolvedAddress.addressLine1 ?? '');
  const resolvedFull = normalizeAddressComparable(formatListingAddress(resolvedAddress));
  const inputHouseNumber = extractAddressHouseNumber(inputAddress);
  const resolvedHouseNumber = extractAddressHouseNumber(resolvedAddress.addressLine1 ?? '');
  const inputPostalCode = getPostalCode(inputAddress);
  const resolvedPostalCode = resolvedAddress.postalCode ? getPostalCode(resolvedAddress.postalCode) : '';
  const streetTokens = getStreetTokensFromFreeform(inputAddress);

  if (inputPostalCode && resolvedPostalCode && inputPostalCode !== resolvedPostalCode) return false;
  if (inputHouseNumber && !resolvedHouseNumber) return false;
  if (inputHouseNumber && resolvedHouseNumber && !houseNumbersCompatible(inputHouseNumber, resolvedHouseNumber)) return false;
  if (streetTokens.length && !streetTokens.some((token) => resolvedLine.includes(token) || resolvedFull.includes(token))) return false;

  return true;
};

const buildGeopoint = (lat: number, lng: number, address: ListingAddress): Geopoint => ({
  latitude: lat,
  longitude: lng,
  address: {
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    city: address.city,
    region: address.region ?? '',
    postalCode: address.postalCode,
    country: address.country,
  },
});

const buildMeta = (args: {
  status: ListingLocationMeta['status'];
  confidence: number;
  normalizedAddress?: string;
  geocoderLabel?: string;
  geocoderSource?: string;
  coordinatePrecision?: ListingLocationMeta['coordinatePrecision'];
  warnings?: string[];
  manualAdjustment?: boolean;
  validatedAt?: string;
}): ListingLocationMeta => ({
  status: args.status,
  confidence: args.confidence,
  normalizedAddress: args.normalizedAddress,
  geocoderLabel: args.geocoderLabel,
  geocoderSource: args.geocoderSource,
  coordinatePrecision: args.coordinatePrecision,
  warnings: args.warnings,
  manualAdjustment: args.manualAdjustment,
  validatedAt: args.validatedAt,
});

const getQueryList = (input: ListingLocationValidationInput) => {
  const queries = new Set<string>();
  const freeform = input.freeformAddress.trim();
  if (freeform) {
    queries.add(freeform);
    return Array.from(queries);
  }

  const advanced = input.advancedAddress;
  if (advanced) {
    const advancedFull = formatListingAddress(advanced);
    if (advancedFull) queries.add(advancedFull);
    const cityOnly = joinParts(advanced.city, advanced.region, advanced.country);
    if (cityOnly) queries.add(cityOnly);
  }

  return Array.from(queries);
};

const geocodeQuery = async (query: string): Promise<NominatimSearchResult[]> => {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&addressdetails=1&extratags=1&namedetails=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Geocoding failed with status ${response.status}.`);
  }
  const data = await response.json() as NominatimSearchResult[];
  const results = Array.isArray(data) ? data : [];
  logRawGeocoderResponse(query, results);
  return results;
};

export const validateListingLocation = async (
  input: ListingLocationValidationInput,
): Promise<ListingLocationValidationResult> => {
  const displayAddress = input.freeformAddress.trim();
  const warnings: string[] = [];
  const queries = getQueryList(input);
  const requiresStreetPrecision = looksLikeStreetAddress(displayAddress);

  if (typeof window === 'undefined') {
    return {
      geopoint: null,
      displayAddress,
      normalizedAddress: displayAddress,
      resolvedAddress: null,
      warnings: ['validation-unavailable-server-side'],
      meta: buildMeta({
        status: 'manual',
        confidence: 0,
        normalizedAddress: displayAddress || undefined,
        warnings: ['validation-unavailable-server-side'],
      }),
    };
  }

  const rawCandidates: Array<{ query: string; result: NominatimSearchResult }> = [];

  for (const query of queries) {
    try {
      const results = await geocodeQuery(query);
      if (!results.length) {
        warnings.push('no-geocode-match');
        continue;
      }
      rawCandidates.push(...results.map((result) => ({ query, result })));
    } catch {
      warnings.push('geocode-request-failed');
    }
  }

  const rankedCandidates = rankGeocodeCandidates(rawCandidates);

  for (const candidate of rankedCandidates) {
      const { result, query, precision } = candidate;
      const isAddressLevel = precision === 'address' || precision === 'building';
      const isStreetLevel = isAddressLevel || precision === 'poi' || precision === 'street';

      if (requiresStreetPrecision && !isStreetLevel) {
        warnings.push('street-address-resolved-to-locality');
        continue;
      }

      const lat = Number(result.lat);
      const lng = Number(result.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        warnings.push('invalid-geocode-coordinates');
        continue;
      }

      const resolvedAddress = buildAddressFromGeocode(result);
      if (requiresStreetPrecision && !isResolvedAddressPlausibleForInput(displayAddress, resolvedAddress)) {
        warnings.push('geocode-candidate-address-mismatch');
        continue;
      }
      const normalizedAddress = resolvedAddress ? formatListingAddress(resolvedAddress) : query;
      const hasCity = Boolean(resolvedAddress?.city);
      const confidence = precision === 'address'
        ? 0.98
        : precision === 'building'
          ? 0.92
          : precision === 'poi'
            ? 0.86
            : precision === 'street'
              ? 0.72
              : hasCity ? 0.62 : 0.35;
      const status = confidence >= 0.9 ? 'validated' : 'needs_review';

      if (result.importance && result.importance < 0.3) {
        warnings.push('low-geocode-confidence');
      }
      if (!isStreetLevel) warnings.push('street-not-resolved');
      if (!isAddressLevel && isStreetLevel) warnings.push('address-number-not-resolved');

      return {
        geopoint: buildGeopoint(lat, lng, resolvedAddress ?? {
          addressLine1: undefined,
          city: resolvedAddress?.city ?? query,
          region: resolvedAddress?.region,
          postalCode: resolvedAddress?.postalCode,
          country: resolvedAddress?.country ?? 'United States',
        }),
        displayAddress,
        normalizedAddress,
        resolvedAddress,
        rawGeocoderLabel: result.display_name,
        warnings,
        meta: buildMeta({
          status,
          confidence,
          normalizedAddress,
          geocoderLabel: result.display_name,
          geocoderSource: 'nominatim',
          coordinatePrecision: precision === 'city' || precision === 'neighborhood' ? 'locality' : precision,
          warnings: warnings.length ? Array.from(new Set(warnings)) : undefined,
          validatedAt: new Date().toISOString(),
        }),
      };
  }

  const fallbackAddress = input.advancedAddress;
  const fallbackDisplay = fallbackAddress ? formatListingAddress(fallbackAddress) : displayAddress;
  return {
    geopoint: null,
    displayAddress,
    normalizedAddress: fallbackDisplay || displayAddress,
    resolvedAddress: fallbackAddress ?? null,
    warnings: warnings.length ? warnings : ['validation-failed'],
    meta: buildMeta({
      status: 'needs_review',
      confidence: 0,
      normalizedAddress: fallbackDisplay || displayAddress || undefined,
      geocoderSource: 'nominatim',
      warnings: warnings.length ? warnings : ['validation-failed'],
      validatedAt: new Date().toISOString(),
    }),
  };
};
