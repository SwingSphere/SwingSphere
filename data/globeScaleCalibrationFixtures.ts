import type { GlobeV1RuntimeEvent } from './globeV1MockData';
import type { DiscoveryPoint } from '../lib/discoveryPointAdapter';
import type { Listing } from '../types';

export type GlobeScaleFixturePoint = {
  id: string;
  city: string;
  region: string;
  country: string;
  countryIso2: string;
  countryIso3: string;
  latitude: number;
  longitude: number;
};

export type GlobeScaleFixture = {
  id: string;
  name: string;
  center: { latitude: number; longitude: number };
  points: GlobeScaleFixturePoint[];
};

// US coordinates use 2025 Census/TIGER incorporated-place CENTLAT/CENTLON values:
// https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html
// London and Tokyo are documented comparison-center coordinates (not production
// venue positions): https://www.geonames.org/2643743/london.html and
// https://www.geonames.org/1850147/tokyo.html
export const GLOBE_SCALE_FIXTURES: GlobeScaleFixture[] = [
  {
    id: 'bay-area',
    name: 'San Francisco Bay Area',
    center: { latitude: 37.75, longitude: -122.18 },
    points: [
      // Existing trusted project coordinate from globeV1MockData.ts. The Census
      // polygon centroid is distorted westward by the Farallon Islands.
      point('san-francisco', 'San Francisco', 'CA', 'United States', 'US', 'USA', 37.7749, -122.4194),
      point('oakland', 'Oakland', 'CA', 'United States', 'US', 'USA', 37.7695164, -122.2244858),
      point('berkeley', 'Berkeley', 'CA', 'United States', 'US', 'USA', 37.8663942, -122.2989164),
      point('walnut-creek', 'Walnut Creek', 'CA', 'United States', 'US', 'USA', 37.9024277, -122.0398554),
      point('concord', 'Concord', 'CA', 'United States', 'US', 'USA', 37.9721841, -122.0015871),
      point('san-jose', 'San Jose', 'CA', 'United States', 'US', 'USA', 37.3013977, -121.8484397),
      point('santa-cruz', 'Santa Cruz', 'CA', 'United States', 'US', 'USA', 36.9733787, -122.0355326),
      point('santa-rosa', 'Santa Rosa', 'CA', 'United States', 'US', 'USA', 38.4457915, -122.7067262),
    ],
  },
  {
    id: 'south-florida',
    name: 'Miami / Fort Lauderdale',
    center: { latitude: 26.0, longitude: -80.18 },
    points: [
      point('miami', 'Miami', 'FL', 'United States', 'US', 'USA', 25.775163, -80.208615),
      point('fort-lauderdale', 'Fort Lauderdale', 'FL', 'United States', 'US', 'USA', 26.141289, -80.143985),
    ],
  },
  {
    id: 'atlanta',
    name: 'Atlanta and suburbs',
    center: { latitude: 33.82, longitude: -84.36 },
    points: [
      point('atlanta', 'Atlanta', 'GA', 'United States', 'US', 'USA', 33.762909, -84.422675),
      point('decatur', 'Decatur', 'GA', 'United States', 'US', 'USA', 33.771138, -84.297648),
      point('sandy-springs', 'Sandy Springs', 'GA', 'United States', 'US', 'USA', 33.936666, -84.370416),
    ],
  },
  {
    id: 'new-york-new-jersey',
    name: 'New York / North Jersey',
    center: { latitude: 40.72, longitude: -74.02 },
    points: [
      point('new-york', 'New York City', 'NY', 'United States', 'US', 'USA', 40.663468, -73.938697),
      point('jersey-city', 'Jersey City', 'NJ', 'United States', 'US', 'USA', 40.718355, -74.068957),
      point('newark', 'Newark', 'NJ', 'United States', 'US', 'USA', 40.72422, -74.172574),
    ],
  },
  {
    id: 'los-angeles-orange-county',
    name: 'Los Angeles / Orange County',
    center: { latitude: 33.92, longitude: -118.05 },
    points: [
      point('los-angeles', 'Los Angeles', 'CA', 'United States', 'US', 'USA', 34.1139, -118.4068),
      point('anaheim', 'Anaheim', 'CA', 'United States', 'US', 'USA', 33.8555, -117.7601),
      point('irvine', 'Irvine', 'CA', 'United States', 'US', 'USA', 33.6784, -117.7713),
    ],
  },
  {
    id: 'london',
    name: 'London',
    center: { latitude: 51.5074, longitude: -0.1278 },
    points: [point('london', 'London', 'England', 'United Kingdom', 'GB', 'GBR', 51.5074, -0.1278)],
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    center: { latitude: 35.6762, longitude: 139.6503 },
    points: [point('tokyo', 'Tokyo', 'Tokyo', 'Japan', 'JP', 'JPN', 35.6762, 139.6503)],
  },
];

export const getGlobeScaleFixture = (fixtureId: string): GlobeScaleFixture =>
  GLOBE_SCALE_FIXTURES.find((fixture) => fixture.id === fixtureId) ?? GLOBE_SCALE_FIXTURES[0];

export const buildGlobeScaleFixtureEvents = (fixtureId: string): GlobeV1RuntimeEvent[] =>
  getGlobeScaleFixture(fixtureId).points.map((fixturePoint) => {
    const id = `dev-scale:${fixtureId}:${fixturePoint.id}`;
    const listing = {
      id,
      type: 'club',
      status: 'approved',
      name: fixturePoint.city,
      location: `${fixturePoint.city}, ${fixturePoint.region}`,
      description_short: 'Development-only globe scale calibration fixture.',
      geopoint: {
        latitude: fixturePoint.latitude,
        longitude: fixturePoint.longitude,
        address: {
          city: fixturePoint.city,
          region: fixturePoint.region,
          country: fixturePoint.country,
        },
      },
    } as Listing;
    return {
      id,
      name: fixturePoint.city,
      entityType: 'club',
      lat: fixturePoint.latitude,
      lon: fixturePoint.longitude,
      countryIso2: fixturePoint.countryIso2,
      countryIso3: fixturePoint.countryIso3,
      listingId: id,
      listing,
    };
  });

export const buildGlobeScaleFixtureDiscoveryPoints = (fixtureId: string): DiscoveryPoint[] =>
  getGlobeScaleFixture(fixtureId).points.map((fixturePoint) => {
    const id = `dev-scale:${fixtureId}:${fixturePoint.id}`;
    return {
      id: `venue:${id}`,
      latitude: fixturePoint.latitude,
      longitude: fixturePoint.longitude,
      listingIds: [id],
      clubIds: [id],
      eventIds: [],
      city: fixturePoint.city,
      region: fixturePoint.region,
      country: fixturePoint.country,
    };
  });

function point(
  id: string,
  city: string,
  region: string,
  country: string,
  countryIso2: string,
  countryIso3: string,
  latitude: number,
  longitude: number,
): GlobeScaleFixturePoint {
  return { id, city, region, country, countryIso2, countryIso3, latitude, longitude };
}
