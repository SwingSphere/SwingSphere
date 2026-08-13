import type { CruiseSailingData, CruiseSeriesData, ResortData } from '../types';

// Preview fixtures establish the travel information architecture without publishing
// unverified third-party destination data. Replace or migrate these records when
// approved resort and cruise content is available.
export const resorts: ResortData[] = [
  {
    id: 'resort-hedonism-ii-negril',
    type: 'resort',
    name: 'Hedonism II',
    slug: 'hedonism-ii',
    descriptionShort: 'An adults-only, all-inclusive, clothing-optional lifestyle resort in Negril with beaches, pools, dining, nightlife, themed entertainment, play spaces, wellness facilities, and overnight accommodations.',
    descriptionFull: 'Hedonism II is a year-round adults-only lifestyle resort on the northern end of Negril’s Seven Mile Beach. It combines overnight lodging with clothing-optional beaches and pools, restaurants and bars, nightly entertainment, themed events, sports, water activities, spa and wellness services, and dedicated lifestyle play spaces. Couples and singles are welcome. Day and night guest passes are available, while some spaces are reserved for registered overnight guests.',
    geopoint: {
      latitude: 18.33796,
      longitude: -78.34086,
      address: {
        addressLine1: 'Norman Manley Boulevard',
        city: 'Negril',
        region: 'Westmoreland',
        country: 'Jamaica',
      },
    },
    resortStyle: 'destination_resort',
    audienceLabel: 'Adults-only, couples-and-singles lifestyle resort',
    accommodationSummary: 'All-inclusive guest rooms and suites with on-property dining, nightlife, beaches, and activities',
    stayLengthSummary: 'Designed for multi-night stays; day and night passes may also be available',
    bookingUrl: 'https://hedonism.com/',
    contactEmail: 'ask@hedonism.com',
    amenities: [
      'All-inclusive',
      'Clothing optional',
      'Overnight accommodations',
      'Private beach areas',
      'Pools and hot tubs',
      'Restaurants and bars',
      'Nightly entertainment',
      'Theme nights',
      'Play spaces',
      'Spa and wellness',
      'Fitness and sports',
      'Water activities',
    ],
    experienceHighlights: [
      'Stay on property',
      'Day-to-night programming',
      'Couples and singles welcome',
      'Hosted lifestyle weeks and special events',
    ],
    accessNotes: [
      'Adults 18+ only',
      'Valid identification required',
      'Some play spaces are reserved for registered overnight guests',
      'Programming and access may vary during hosted weeks',
    ],
    transportationNotes: ['Located on Norman Manley Boulevard in Negril'],
    logoImageUrl: 'https://hedonism.com/wp-content/uploads/2023/11/hedonism-web-logo-full.webp',
    headerImageUrl: 'https://hedonism.com/wp-content/uploads/2024/03/homepage-hero.webp',
    galleryImageUrls: ['https://hedonism.com/wp-content/uploads/2024/03/hedonism-resort-map.webp'],
    status: 'approved',
  },
  {
    id: 'resort-preview-crimson-cove',
    type: 'resort',
    name: 'Crimson Cove Resort',
    slug: 'crimson-cove-resort',
    descriptionShort: 'A SwingSphere preview of a destination resort built around lodging, social spaces, privacy, and multi-day programming.',
    descriptionFull: 'Crimson Cove demonstrates how a resort should feel inside SwingSphere: a permanent destination rather than a dated event. The page prioritizes where guests stay, what the property offers, who the experience is designed for, how access works, and which upcoming events are attached to the property.',
    geopoint: {
      latitude: 25.7617,
      longitude: -80.1918,
      address: { city: 'Miami', region: 'Florida', country: 'United States' },
    },
    resortStyle: 'destination_resort',
    audienceLabel: 'Lifestyle-friendly adult destination',
    accommodationSummary: 'Guest rooms, suites, and multi-night packages',
    stayLengthSummary: 'Best experienced as a 3–5 night stay',
    amenities: ['Pool complex', 'Private dining', 'Spa', 'Nightlife', 'Play spaces', 'Airport transfers'],
    experienceHighlights: ['Stay on property', 'Day-to-night programming', 'Privacy-conscious service', 'Hosted weekends'],
    accessNotes: ['Adults only', 'Property policies apply', 'Event access may require separate registration'],
    transportationNotes: ['Airport transfer guidance', 'On-property transportation', 'Local rideshare access'],
    status: 'draft',
  },
];

export const cruiseSeries: CruiseSeriesData[] = [
  {
    id: 'cruise-series-preview-sphere-at-sea',
    type: 'cruise_series',
    name: 'Sphere at Sea',
    slug: 'sphere-at-sea',
    descriptionShort: 'A SwingSphere preview of a recurring lifestyle cruise with multiple dated sailings.',
    descriptionFull: 'Sphere at Sea demonstrates the cruise-series model. The lasting cruise identity owns the brand, audience, expectations, and general onboard experience, while each sailing owns its ship, dates, departure port, itinerary, availability, and booking details.',
    audienceLabel: 'Curated adult lifestyle cruise',
    experienceHighlights: ['Full-ship social programming', 'Themed nights', 'Port excursions', 'Multiple future sailings'],
    status: 'draft',
  },
];

export const cruiseSailings: CruiseSailingData[] = [
  {
    id: 'cruise-sailing-preview-sphere-at-sea-2027-04',
    type: 'cruise_sailing',
    cruiseSeriesId: 'cruise-series-preview-sphere-at-sea',
    name: 'Sphere at Sea — Spring Sailing',
    slug: 'sphere-at-sea-spring-2027',
    shipName: 'Preview Vessel',
    startsAt: '2027-04-10T16:00:00-04:00',
    endsAt: '2027-04-17T07:00:00-04:00',
    durationNights: 7,
    bookingStatus: 'announced',
    cabinSummary: 'Interior through suite categories',
    pricingSummary: 'Pricing announced by the operator',
    theme: 'Spring escape',
    departurePort: {
      id: 'port-preview-miami',
      portName: 'PortMiami',
      city: 'Miami',
      country: 'United States',
      latitude: 25.7785,
      longitude: -80.1772,
      isEmbarkation: true,
      isDisembarkation: true,
    },
    itinerary: [
      { id: 'port-preview-miami-start', portName: 'PortMiami', city: 'Miami', country: 'United States', isEmbarkation: true },
      { id: 'port-preview-island-one', portName: 'Island Port', country: 'Caribbean' },
      { id: 'port-preview-island-two', portName: 'Coastal Port', country: 'Caribbean' },
      { id: 'port-preview-miami-end', portName: 'PortMiami', city: 'Miami', country: 'United States', isDisembarkation: true },
    ],
    status: 'draft',
  },
];

export const resortsBySlug = new Map(resorts.map((resort) => [resort.slug, resort]));
export const cruiseSeriesBySlug = new Map(cruiseSeries.map((series) => [series.slug, series]));
export const cruiseSailingsBySlug = new Map(cruiseSailings.map((sailing) => [sailing.slug, sailing]));
export const cruiseSailingsBySeriesId = cruiseSailings.reduce<Map<string, CruiseSailingData[]>>((index, sailing) => {
  const entries = index.get(sailing.cruiseSeriesId) ?? [];
  entries.push(sailing);
  entries.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  index.set(sailing.cruiseSeriesId, entries);
  return index;
}, new Map());
