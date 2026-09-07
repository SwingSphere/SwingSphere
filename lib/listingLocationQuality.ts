import type { Listing, ListingLocationMeta } from '../types';
import { isAuthoritativeLocationSource, listingHasExactBuildingAddress } from './buildingVerification';
import { getVenueForListing, type EntityCollections } from './entityCompatibility';
import { isApproximateLocation } from './publicLocation';

export type ListingCoordinateQualityLevel =
  | 'authoritative'
  | 'building_level'
  | 'street_level'
  | 'legacy_untyped'
  | 'uncertain'
  | 'approximate_private'
  | 'invalid';

export type ListingCoordinateQuality = {
  level: ListingCoordinateQualityLevel;
  source: string | null;
  confidence: number | null;
  precision: ListingLocationMeta['coordinatePrecision'] | null;
  exactBuildingAddress: boolean;
  weakForBuildingSelection: boolean;
  canPreferPinOverSavedAsset: boolean;
  reasons: string[];
};

const WEAK_COORDINATE_PATTERN = /(?:nominatim[-+](?:street|road)|street[-_ ]?(?:segment|level)|road[-_ ]?(?:segment|level)|resolved[-_ ]?(?:at|near|to)[-_ ]?(?:a[-_ ]?)?(?:nearby[-_ ]?)?(?:street|road)[-_ ]?segment|address-number-not-resolved|street-address-resolved-to-locality|city[-_ ]?center|city[-_ ]?area|coordinate-represents-(?:.*district|.*city)|nominatim-district)/i;
const BUILDING_SOURCE_PATTERN = /(?:nominatim[-+](?:address|building|venue)|rooftop|building[-_ ]?level|address[-_ ]?level|parcel)/i;

const getMeta = (listing: Listing, collections: EntityCollections): ListingLocationMeta | undefined =>
  getVenueForListing(listing, collections)?.locationMeta ?? listing.locationMeta;

export const assessListingCoordinateQuality = (
  listing: Listing,
  collections: EntityCollections = {},
): ListingCoordinateQuality => {
  const venue = getVenueForListing(listing, collections);
  const meta = getMeta(listing, collections);
  const source = meta?.geocoderSource ?? meta?.source ?? null;
  const confidence = typeof meta?.confidence === 'number' ? meta.confidence : null;
  const precision = meta?.coordinatePrecision ?? null;
  const warnings = meta?.warnings ?? [];
  const evidenceText = [source ?? '', ...warnings].join(' ');
  const exactBuildingAddress = listingHasExactBuildingAddress(listing, collections);
  const coords = venue
    ? { lat: Number(venue.latitude), lng: Number(venue.longitude) }
    : { lat: Number(listing.geopoint?.latitude), lng: Number(listing.geopoint?.longitude) };
  const reasons: string[] = [];

  if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng) || (coords.lat === 0 && coords.lng === 0)) {
    return {
      level: 'invalid', source, confidence, precision, exactBuildingAddress,
      weakForBuildingSelection: true, canPreferPinOverSavedAsset: false,
      reasons: ['coordinate is missing or invalid'],
    };
  }

  if (isApproximateLocation(listing) || (venue && venue.visibility !== 'public_exact')) {
    return {
      level: 'approximate_private', source, confidence, precision, exactBuildingAddress,
      weakForBuildingSelection: true, canPreferPinOverSavedAsset: false,
      reasons: ['location is intentionally private or approximate'],
    };
  }

  const weakStreetEvidence = precision === 'street'
    || precision === 'locality'
    || WEAK_COORDINATE_PATTERN.test(evidenceText);
  if (weakStreetEvidence) {
    if (precision === 'street' || /street|road/i.test(evidenceText)) reasons.push('coordinate provenance is street/road-level rather than building-level');
    if (/address-number-not-resolved/i.test(evidenceText)) reasons.push('house number was not resolved');
    if (meta?.status === 'validated') reasons.push('metadata says validated despite weak coordinate precision');
    return {
      level: 'street_level', source, confidence, precision, exactBuildingAddress,
      weakForBuildingSelection: true, canPreferPinOverSavedAsset: false, reasons,
    };
  }

  const authoritative = isAuthoritativeLocationSource(source, meta?.manualAdjustment)
    && (confidence ?? 0) >= 0.97;
  if (authoritative) {
    return {
      level: 'authoritative', source, confidence, precision, exactBuildingAddress,
      weakForBuildingSelection: false, canPreferPinOverSavedAsset: true,
      reasons: ['high-confidence authoritative coordinate provenance'],
    };
  }

  const buildingLevel = precision === 'address'
    || precision === 'building'
    || precision === 'poi'
    || BUILDING_SOURCE_PATTERN.test(source ?? '');
  if (buildingLevel && (confidence ?? 0) >= 0.92) {
    return {
      level: 'building_level', source, confidence, precision, exactBuildingAddress,
      weakForBuildingSelection: false,
      canPreferPinOverSavedAsset: (confidence ?? 0) >= 0.97,
      reasons: ['coordinate provenance resolves at address/building/venue level'],
    };
  }

  if (meta?.status === 'validated' && (confidence ?? 0) >= 0.9) {
    return {
      level: 'legacy_untyped', source, confidence, precision, exactBuildingAddress,
      weakForBuildingSelection: true, canPreferPinOverSavedAsset: false,
      reasons: ['legacy validated coordinate lacks sufficiently explicit building-level provenance'],
    };
  }

  return {
    level: 'uncertain', source, confidence, precision, exactBuildingAddress,
    weakForBuildingSelection: true, canPreferPinOverSavedAsset: false,
    reasons: [meta?.status ? `location metadata is ${meta.status}` : 'location provenance is missing'],
  };
};
