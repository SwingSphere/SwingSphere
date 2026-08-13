import type { Listing } from '../types';

export const GLOBE_PERFORMANCE_FIXTURE_COUNTS = [100, 500, 1000, 5000] as const;
export type GlobePerformanceFixtureCount = typeof GLOBE_PERFORMANCE_FIXTURE_COUNTS[number];

const CENTERS = [
  ['San Francisco', 'CA', 'United States', 37.7749, -122.4194],
  ['Los Angeles', 'CA', 'United States', 34.0522, -118.2437],
  ['New York', 'NY', 'United States', 40.7128, -74.006],
  ['Miami', 'FL', 'United States', 25.7617, -80.1918],
  ['London', 'England', 'United Kingdom', 51.5074, -0.1278],
  ['Berlin', 'Berlin', 'Germany', 52.52, 13.405],
  ['Tokyo', 'Tokyo', 'Japan', 35.6762, 139.6503],
  ['Sydney', 'NSW', 'Australia', -33.8688, 151.2093],
  ['São Paulo', 'SP', 'Brazil', -23.5505, -46.6333],
  ['Cape Town', 'Western Cape', 'South Africa', -33.9249, 18.4241],
] as const;

export const parseGlobePerformanceFixtureCount = (value: string | null | undefined): GlobePerformanceFixtureCount | null => {
  const numeric = Number(value);
  return GLOBE_PERFORMANCE_FIXTURE_COUNTS.includes(numeric as GlobePerformanceFixtureCount)
    ? numeric as GlobePerformanceFixtureCount
    : null;
};

export const buildGlobePerformanceFixtureListings = (count: GlobePerformanceFixtureCount): Listing[] => {
  const random = mulberry32(0x5a17c0de + count);
  const listings: Listing[] = [];
  for (let index = 0; index < count; index += 1) {
    const center = CENTERS[index % CENTERS.length];
    const ring = Math.floor(index / CENTERS.length);
    const angle = random() * Math.PI * 2;
    const radius = 0.05 + Math.sqrt(random()) * (0.35 + (ring % 9) * 0.025);
    const latitude = clamp(center[3] + Math.sin(angle) * radius, -80, 80);
    const longitudeScale = Math.max(Math.cos(latitude * Math.PI / 180), 0.3);
    const longitude = wrapLongitude(center[4] + Math.cos(angle) * radius / longitudeScale);
    const type = index % 5 === 0 ? 'event' : 'club';
    const id = `dev-perf:${count}:${String(index).padStart(5, '0')}`;
    listings.push({
      id,
      type,
      status: 'approved',
      name: `Performance ${type === 'event' ? 'Event' : 'Club'} ${index + 1}`,
      location: `${center[0]}, ${center[1]}`,
      description_short: 'Deterministic development-only globe and map performance fixture.',
      geopoint: {
        latitude,
        longitude,
        address: {
          city: center[0],
          region: center[1],
          country: center[2],
        },
      },
      ...(type === 'event'
        ? {
            time: {
              start: '2099-01-01T20:00:00.000Z',
              end: '2099-01-02T02:00:00.000Z',
            },
          }
        : {}),
    } as Listing);
  }
  return listings;
};

function mulberry32(seed: number) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function wrapLongitude(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}
