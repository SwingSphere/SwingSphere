import type { ActivityRegion } from '../lib/activityRegionProvider';
import type { Listing } from '../types';

export type UsaDiscoveryMetro = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  mapZoom: number;
  listingIds: string[];
};

export type UsaDiscoveryRegion = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  metros: UsaDiscoveryMetro[];
};

const club = (
  metroId: string,
  id: string,
  name: string,
  city: string,
  region: string,
  latitude: number,
  longitude: number,
): Listing => ({
  id: `dev-usa:${metroId}:${id}`,
  type: 'club',
  name,
  description_short: 'Development-only local discovery fixture.',
  location: `${city}, ${region}`,
  contactEmail: 'prototype@swingsphere.example',
  locationVisibility: 'exact_public',
  geopoint: {
    latitude,
    longitude,
    address: { city, region, country: 'United States' },
  },
  schedule: [],
  generalAmenities: ['Discovery prototype'],
  status: 'approved',
  postedByUserId: 'dev-usa-discovery',
});

const metro = (
  id: string,
  name: string,
  latitude: number,
  longitude: number,
  mapZoom: number,
): UsaDiscoveryMetro => ({
  id,
  name,
  latitude,
  longitude,
  mapZoom,
  listingIds: USA_DISCOVERY_LISTINGS_BY_METRO[id]?.map((listing) => listing.id) ?? [],
});

const pair = (
  metroId: string,
  city: string,
  region: string,
  latitude: number,
  longitude: number,
): Listing[] => [
  club(metroId, 'north', `${city} North Social`, city, region, latitude + 0.018, longitude - 0.014),
  club(metroId, 'south', `${city} South Social`, city, region, latitude - 0.018, longitude + 0.014),
];

const bayAreaListings: Listing[] = [
  club('bay-area', 'north-beach', 'North Beach Social', 'San Francisco', 'CA', 37.8056, -122.4133),
  club('bay-area', 'soma', 'SoMa After Dark', 'San Francisco', 'CA', 37.7821, -122.4108),
  club('bay-area', 'mission-north', 'Mission North Gathering', 'San Francisco', 'CA', 37.7724, -122.4141),
  club('bay-area', 'mission', 'Mission Social House', 'San Francisco', 'CA', 37.7597, -122.4148),
  club('bay-area', 'castro', 'Castro Night Society', 'San Francisco', 'CA', 37.7692, -122.4464),
  club('bay-area', 'civic-center', 'Civic Center Lounge', 'San Francisco', 'CA', 37.7868, -122.433),
  club('bay-area', 'nob-hill', 'Nob Hill Salon', 'San Francisco', 'CA', 37.7945, -122.422),
  club('bay-area', 'embarcadero', 'Embarcadero Social', 'San Francisco', 'CA', 37.7897, -122.3972),
  club('bay-area', 'twin-peaks', 'Twin Peaks Gathering', 'San Francisco', 'CA', 37.7544, -122.4477),
  club('bay-area', 'richmond', 'Richmond District Social', 'San Francisco', 'CA', 37.7783, -122.4724),
];

const USA_DISCOVERY_LISTINGS_BY_METRO: Record<string, Listing[]> = {
  'bay-area': bayAreaListings,
  'los-angeles': pair('los-angeles', 'Los Angeles', 'CA', 34.0522, -118.2437),
  seattle: pair('seattle', 'Seattle', 'WA', 47.6062, -122.3321),
  portland: pair('portland', 'Portland', 'OR', 45.5152, -122.6784),
  'las-vegas': pair('las-vegas', 'Las Vegas', 'NV', 36.1699, -115.1398),
  phoenix: pair('phoenix', 'Phoenix', 'AZ', 33.4484, -112.074),
  chicago: pair('chicago', 'Chicago', 'IL', 41.8781, -87.6298),
  atlanta: pair('atlanta', 'Atlanta', 'GA', 33.749, -84.388),
  'south-florida': pair('south-florida', 'Miami', 'FL', 25.7617, -80.1918),
  'new-york-north-jersey': pair('new-york-north-jersey', 'New York', 'NY', 40.7128, -74.006),
};

export const USA_DISCOVERY_LISTINGS = Object.values(USA_DISCOVERY_LISTINGS_BY_METRO).flat();

export const USA_DISCOVERY_REGIONS: UsaDiscoveryRegion[] = [
  {
    id: 'west',
    name: 'West',
    latitude: 41.2,
    longitude: -121.2,
    metros: [
      metro('bay-area', 'Bay Area', 37.7749, -122.4194, 12.1),
      metro('los-angeles', 'Los Angeles', 34.0522, -118.2437, 10.8),
      metro('seattle', 'Seattle', 47.6062, -122.3321, 11),
      metro('portland', 'Portland', 45.5152, -122.6784, 11),
    ],
  },
  {
    id: 'southwest',
    name: 'Southwest',
    latitude: 34.7,
    longitude: -112.2,
    metros: [
      metro('las-vegas', 'Las Vegas', 36.1699, -115.1398, 11),
      metro('phoenix', 'Phoenix', 33.4484, -112.074, 10.8),
    ],
  },
  {
    id: 'midwest',
    name: 'Midwest',
    latitude: 41.8781,
    longitude: -87.6298,
    metros: [
      metro('chicago', 'Chicago', 41.8781, -87.6298, 11),
    ],
  },
  {
    id: 'southeast',
    name: 'Southeast',
    latitude: 30.8,
    longitude: -82.8,
    metros: [
      metro('atlanta', 'Atlanta', 33.749, -84.388, 11),
      metro('south-florida', 'South Florida', 25.98, -80.19, 10.2),
    ],
  },
  {
    id: 'northeast',
    name: 'Northeast',
    latitude: 40.72,
    longitude: -74.02,
    metros: [
      metro('new-york-north-jersey', 'New York / North Jersey', 40.72, -74.02, 10.6),
    ],
  },
];

export const getUsaMetroListings = (metroId: string): Listing[] =>
  USA_DISCOVERY_LISTINGS_BY_METRO[metroId] ?? [];

const toMarker = (
  id: string,
  name: string,
  latitude: number,
  longitude: number,
  listings: Listing[],
): ActivityRegion => ({
  id,
  scopeKey: id,
  name,
  latitude,
  longitude,
  countryIso2: 'US',
  discoveryPointIds: listings.map((listing) => `venue:${listing.id}`),
  listingIds: listings.map((listing) => listing.id),
  clubCount: listings.filter((listing) => listing.type === 'club').length,
  eventCount: listings.filter((listing) => listing.type === 'event').length,
});

export const getUsaRegionMarkers = (): ActivityRegion[] => USA_DISCOVERY_REGIONS.map((region) =>
  toMarker(
    `dev-usa-region:${region.id}`,
    region.name,
    region.latitude,
    region.longitude,
    region.metros.flatMap((candidate) => getUsaMetroListings(candidate.id)),
  ));

export const getUsaMetroMarkers = (regionId: string): ActivityRegion[] => {
  const region = USA_DISCOVERY_REGIONS.find((candidate) => candidate.id === regionId);
  return region?.metros.map((candidate) =>
    toMarker(
      `dev-usa-metro:${candidate.id}`,
      candidate.name,
      candidate.latitude,
      candidate.longitude,
      getUsaMetroListings(candidate.id),
    )) ?? [];
};

export const findUsaRegion = (regionId: string | null | undefined) =>
  USA_DISCOVERY_REGIONS.find((region) => region.id === regionId) ?? null;

export const findUsaMetro = (metroId: string | null | undefined) => {
  for (const region of USA_DISCOVERY_REGIONS) {
    const found = region.metros.find((candidate) => candidate.id === metroId);
    if (found) return { region, metro: found };
  }
  return null;
};
