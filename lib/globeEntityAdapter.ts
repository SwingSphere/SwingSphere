import countryIso2Aliases from '../data/country_iso2.json';
import type { GlobeV1RuntimeEvent } from '../data/globeV1MockData';
import type { Listing } from '../types';
import { normalizeCountry } from './geoNormalize';
import { buildExplorerMarkers, getListingCanonicalCoords } from './explorerMarkers';
import { getListingPhysicalAddress } from './entityCompatibility';
import { isActiveDiscoveryListing } from './eventLifecycle';

const countryAliases = (countryIso2Aliases as { aliases?: Record<string, string> }).aliases ?? {};

const iso3ByIso2 = Object.entries(countryAliases).reduce<Record<string, string>>(
  (codes, [alias, iso2]) => {
    if (/^[a-z]{3}$/.test(alias) && /^[a-z]{2}$/.test(iso2) && !codes[iso2]) {
      codes[iso2] = alias;
    }
    return codes;
  },
  {},
);

export const resolveCountryIsoCodes = (country: string | null | undefined): { iso2: string; iso3: string } => {
  const iso2 = normalizeCountry(country ?? '').toLowerCase();
  return {
    iso2: iso2.toUpperCase(),
    iso3: (iso3ByIso2[iso2] ?? '').toUpperCase(),
  };
};

export const isGlobeEligibleListing = (listing: Listing): boolean => {
  const coords = getListingCanonicalCoords(listing);

  return listing.status === 'approved'
    && isActiveDiscoveryListing(listing)
    && Boolean(coords)
    && Number.isFinite(coords?.lat)
    && Number.isFinite(coords?.lng)
    && coords!.lat >= -90
    && coords!.lat <= 90
    && coords!.lng >= -180
    && coords!.lng <= 180;
};

export const adaptListingsToGlobeEvents = (listings: Listing[]): GlobeV1RuntimeEvent[] => {
  const listingsById = new Map(listings.map((listing) => [listing.id, listing] as const));
  return buildExplorerMarkers(listings).map((marker) => {
    const listing = listingsById.get(marker.listingId);
    if (!listing) {
      throw new Error(`Missing listing for marker ${marker.listingId}`);
    }
    const countryCodes = resolveCountryIsoCodes(getListingPhysicalAddress(listing).country);

    return {
      id: listing.id,
      name: listing.name,
      entityType: listing.type,
      lat: marker.lat,
      lon: marker.lng,
      countryIso2: countryCodes.iso2,
      countryIso3: countryCodes.iso3,
      listingId: listing.id,
      listing,
    };
  });
};
