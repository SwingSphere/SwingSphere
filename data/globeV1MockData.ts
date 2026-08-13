import type { EventData, Listing, OrganizationData } from '../types';

const makeTimeRange = (daysFromNow: number, startHourUtc: number, durationHours: number) => {
  const start = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  start.setUTCHours(startHourUtc, 0, 0, 0);
  const end = new Date(start);
  end.setUTCHours(startHourUtc + durationHours, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
};

export type GlobeV1EntityType = 'event' | 'club' | 'promoter';

export type GlobeV1RuntimeEvent = {
  id: string;
  name: string;
  entityType: GlobeV1EntityType;
  lat: number;
  lon: number;
  countryIso3: string;
  countryIso2: string;
  listingId: string;
  listing?: Listing;
  organizationId?: string;
  organizationSlug?: string;
  organization?: OrganizationData;
  hostRegionLabel?: string;
};

export type GlobeV1CountrySelection = {
  id?: string | number;
  name?: string;
  iso2?: string;
  iso3?: string;
  eventCount?: number;
};

export const globeV1MockListings: Listing[] = [
  {
    id: 'globe-v1-club-sf',
    type: 'club',
    name: 'Velvet Circuit',
    location: 'San Francisco, CA, USA',
    description_short: 'An intimate social club with curated Friday lounges and a polished, low-pressure atmosphere.',
    contactEmail: 'hello@velvetcircuit.example',
    geopoint: {
      latitude: 37.7749,
      longitude: -122.4194,
      address: { city: 'San Francisco', region: 'CA', country: 'USA' },
    },
    headerImageUrl: 'https://picsum.photos/seed/globe-v1-sf/900/700',
    schedule: [{ day: 'Friday', isClosed: false, open: '21:00', close: '02:00' }],
    generalAmenities: ['Lounge', 'Dress Code', 'Verified Host'],
    status: 'approved',
    postedByUserId: 'user-globe-v1',
    reviewScore: { thumbsUp: 42, thumbsDown: 3 },
  },
  {
    id: 'globe-v1-event-la',
    type: 'event',
    name: 'Afterdark Loft',
    hostName: 'SwingSphere Preview',
    location: 'Los Angeles, CA, USA',
    description_full: 'A private loft gathering built around music, conversation, and verified RSVP flow.',
    contactEmail: 'rsvp@afterdarkloft.example',
    isAddressPrivate: true,
    geopoint: {
      latitude: 34.0522,
      longitude: -118.2437,
      address: { city: 'Los Angeles', region: 'CA', country: 'USA' },
    },
    time: makeTimeRange(9, 20, 5),
    tags: ['Private RSVP', 'Music', 'Upscale'],
    headerImageUrl: 'https://picsum.photos/seed/globe-v1-la/900/700',
    status: 'approved',
    postedByUserId: 'user-globe-v1',
    reviewScore: { thumbsUp: 37, thumbsDown: 2 },
  },
  {
    id: 'globe-v1-club-nyc',
    type: 'club',
    name: 'Nocturne Society',
    location: 'New York, NY, USA',
    description_short: 'A members-focused city club with recurring socials and strong host verification.',
    contactEmail: 'info@nocturnesociety.example',
    geopoint: {
      latitude: 40.7128,
      longitude: -74.006,
      address: { city: 'New York', region: 'NY', country: 'USA' },
    },
    headerImageUrl: 'https://picsum.photos/seed/globe-v1-nyc/900/700',
    schedule: [{ day: 'Saturday', isClosed: false, open: '22:00', close: '04:00' }],
    generalAmenities: ['Members', 'Lounge', 'Concierge'],
    status: 'approved',
    postedByUserId: 'user-globe-v1',
    reviewScore: { thumbsUp: 58, thumbsDown: 4 },
  },
  {
    id: 'globe-v1-event-london',
    type: 'event',
    name: 'Soho Salon',
    hostName: 'SwingSphere Preview',
    location: 'London, UK',
    description_full: 'A hosted evening salon in central London with a moderated guest list and elevated service.',
    contactEmail: 'host@sohosalon.example',
    isAddressPrivate: true,
    geopoint: {
      latitude: 51.5074,
      longitude: -0.1278,
      address: { city: 'London', region: 'England', country: 'United Kingdom' },
    },
    time: makeTimeRange(14, 19, 5),
    tags: ['Salon', 'Moderated', 'Cocktails'],
    headerImageUrl: 'https://picsum.photos/seed/globe-v1-london/900/700',
    status: 'approved',
    postedByUserId: 'user-globe-v1',
    reviewScore: { thumbsUp: 29, thumbsDown: 1 },
  },
  {
    id: 'globe-v1-club-sydney',
    type: 'club',
    name: 'Harbour Room',
    location: 'Sydney, NSW, Australia',
    description_short: 'A discreet Sydney club with newcomer-friendly hosts and relaxed weekend programming.',
    contactEmail: 'hello@harbourroom.example',
    geopoint: {
      latitude: -33.8688,
      longitude: 151.2093,
      address: { city: 'Sydney', region: 'NSW', country: 'Australia' },
    },
    headerImageUrl: 'https://picsum.photos/seed/globe-v1-sydney/900/700',
    schedule: [{ day: 'Saturday', isClosed: false, open: '20:00', close: '01:00' }],
    generalAmenities: ['Newcomer Friendly', 'Lounge', 'Harbour Area'],
    status: 'approved',
    postedByUserId: 'user-globe-v1',
    reviewScore: { thumbsUp: 31, thumbsDown: 2 },
  },
];

const isoByCountry: Record<string, { iso2: string; iso3: string }> = {
  USA: { iso2: 'US', iso3: 'USA' },
  'United Kingdom': { iso2: 'GB', iso3: 'GBR' },
  Australia: { iso2: 'AU', iso3: 'AUS' },
};

export const globeV1RuntimeEvents: GlobeV1RuntimeEvent[] = globeV1MockListings.map((listing) => {
  const iso = isoByCountry[listing.geopoint.address.country] ?? { iso2: '', iso3: '' };
  return {
    id: listing.id,
    name: listing.name,
    entityType: listing.type,
    lat: listing.geopoint.latitude,
    lon: listing.geopoint.longitude,
    countryIso2: iso.iso2,
    countryIso3: iso.iso3,
    listingId: listing.id,
    listing,
  };
});
