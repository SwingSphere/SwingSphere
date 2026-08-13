import type { ClubData, EventData, Listing, OrganizationData } from '../types';
import { nameSlug, normalizeHostName } from '../lib/identityUtils';
import { mockData } from './mockData';
import { communityHostOrganization } from './communityHostSeed';

const isClub = (listing: Listing): listing is ClubData => listing.type === 'club';
const isEvent = (listing: Listing): listing is EventData => listing.type === 'event';

const hostRegion = (id: string, city: string, region: string, country: string, latitude: number, longitude: number) => ({
  id,
  label: [city, region].filter(Boolean).join(', '),
  city,
  region,
  country,
  latitude,
  longitude,
  status: 'recurring' as const,
});

const illuminaughtyRegions = [
  hostRegion('albuquerque', 'Albuquerque', 'NM', 'United States', 35.0844, -106.6504),
  hostRegion('atlanta', 'Atlanta', 'GA', 'United States', 33.749, -84.388),
  hostRegion('austin', 'Austin', 'TX', 'United States', 30.2672, -97.7431),
  hostRegion('baltimore', 'Baltimore', 'MD', 'United States', 39.2904, -76.6122),
  hostRegion('boston', 'Boston', 'MA', 'United States', 42.3601, -71.0589),
  hostRegion('charlotte', 'Charlotte', 'NC', 'United States', 35.2271, -80.8431),
  hostRegion('chicago', 'Chicago', 'IL', 'United States', 41.8781, -87.6298),
  hostRegion('cincinnati', 'Cincinnati', 'OH', 'United States', 39.1031, -84.512),
  hostRegion('cleveland', 'Cleveland', 'OH', 'United States', 41.4993, -81.6944),
  hostRegion('colorado-springs', 'Colorado Springs', 'CO', 'United States', 38.8339, -104.8214),
  hostRegion('columbus', 'Columbus', 'OH', 'United States', 39.9612, -82.9988),
  hostRegion('dallas', 'Dallas', 'TX', 'United States', 32.7767, -96.797),
  hostRegion('denver', 'Denver', 'CO', 'United States', 39.7392, -104.9903),
  hostRegion('detroit', 'Detroit', 'MI', 'United States', 42.3314, -83.0458),
  hostRegion('houston', 'Houston', 'TX', 'United States', 29.7604, -95.3698),
  hostRegion('indianapolis', 'Indianapolis', 'IN', 'United States', 39.7684, -86.1581),
  hostRegion('jacksonville', 'Jacksonville', 'FL', 'United States', 30.3322, -81.6557),
  hostRegion('kansas-city', 'Kansas City', 'MO', 'United States', 39.0997, -94.5786),
  hostRegion('las-vegas', 'Las Vegas', 'NV', 'United States', 36.1699, -115.1398),
  hostRegion('los-angeles', 'Los Angeles', 'CA', 'United States', 34.0522, -118.2437),
  hostRegion('louisville', 'Louisville', 'KY', 'United States', 38.2527, -85.7585),
  hostRegion('miami', 'Miami', 'FL', 'United States', 25.7617, -80.1918),
  hostRegion('milwaukee', 'Milwaukee', 'WI', 'United States', 43.0389, -87.9065),
  hostRegion('minneapolis', 'Minneapolis', 'MN', 'United States', 44.9778, -93.265),
  hostRegion('nashville', 'Nashville', 'TN', 'United States', 36.1627, -86.7816),
  hostRegion('new-york-city', 'New York City', 'NY', 'United States', 40.7128, -74.006),
  hostRegion('oklahoma-city', 'Oklahoma City', 'OK', 'United States', 35.4676, -97.5164),
  hostRegion('orlando', 'Orlando', 'FL', 'United States', 28.5383, -81.3792),
  hostRegion('philadelphia', 'Philadelphia', 'PA', 'United States', 39.9526, -75.1652),
  hostRegion('phoenix', 'Phoenix', 'AZ', 'United States', 33.4484, -112.074),
  hostRegion('pittsburgh', 'Pittsburgh', 'PA', 'United States', 40.4406, -79.9959),
  hostRegion('portland', 'Portland', 'OR', 'United States', 45.5152, -122.6784),
  hostRegion('providence', 'Providence', 'RI', 'United States', 41.824, -71.4128),
  hostRegion('raleigh', 'Raleigh', 'NC', 'United States', 35.7796, -78.6382),
  hostRegion('reno', 'Reno', 'NV', 'United States', 39.5296, -119.8138),
  hostRegion('richmond', 'Richmond', 'VA', 'United States', 37.5407, -77.436),
  hostRegion('sacramento', 'Sacramento', 'CA', 'United States', 38.5816, -121.4944),
  hostRegion('saint-louis', 'St. Louis', 'MO', 'United States', 38.627, -90.1994),
  hostRegion('san-antonio', 'San Antonio', 'TX', 'United States', 29.4241, -98.4936),
  hostRegion('san-diego', 'San Diego', 'CA', 'United States', 32.7157, -117.1611),
  hostRegion('san-francisco', 'San Francisco', 'CA', 'United States', 37.7749, -122.4194),
  hostRegion('san-jose', 'San Jose', 'CA', 'United States', 37.3382, -121.8863),
  hostRegion('seattle', 'Seattle', 'WA', 'United States', 47.6062, -122.3321),
  hostRegion('tampa', 'Tampa', 'FL', 'United States', 27.9506, -82.4572),
  hostRegion('tucson', 'Tucson', 'AZ', 'United States', 32.2226, -110.9747),
  hostRegion('virginia-beach', 'Virginia Beach', 'VA', 'United States', 36.8529, -75.978),
  hostRegion('washington-dc', 'Washington', 'DC', 'United States', 38.9072, -77.0369),
];

const inferredHostPresenceByName: Record<string, OrganizationData['globePresence']> = {
  illuminaughty: { visibility: 'visible', regions: illuminaughtyRegions },
  'connect dance love': {
    visibility: 'visible',
    regions: [hostRegion('east-bay', 'Oakland', 'CA', 'United States', 37.8044, -122.2712)],
  },
};

const clubToOrganization = (club: ClubData): OrganizationData => ({
  // SEMv2 Phase 1 compatibility ID. Replace with persisted organization IDs when organizations are stored independently.
  id: `org-${club.id}`,
  type: 'organization',
  name: club.name,
  slug: nameSlug(club.name),
  displayTypes: ['club'],
  descriptionShort: club.description_short,
  website: club.website,
  contactEmail: club.contactEmail,
  logoImageUrl: club.logoImageUrl,
  headerImageUrl: club.headerImageUrl,
  galleryImageUrls: club.galleryImageUrls,
  status: club.status,
  postedByUserId: club.postedByUserId,
});

const hostOrganizationsByNormalizedName = new Map<string, OrganizationData>();

for (const event of mockData.filter(isEvent)) {
  const normalizedHostName = normalizeHostName(event.hostName);
  if (!normalizedHostName || hostOrganizationsByNormalizedName.has(normalizedHostName)) continue;
  hostOrganizationsByNormalizedName.set(normalizedHostName, {
    // SEMv2 Phase 1 compatibility ID. Replace with persisted organization IDs when host/promoter records exist.
    id: `org-host-${nameSlug(normalizedHostName)}`,
    type: 'organization',
    name: event.hostName,
    slug: nameSlug(normalizedHostName),
    displayTypes: ['host'],
    globePresence: inferredHostPresenceByName[normalizedHostName],
    status: 'approved',
  });
}

const hostOrganizations = Array.from(hostOrganizationsByNormalizedName.values());

const standaloneOrganizations: OrganizationData[] = [
  {
    id: 'org-promoter-illuminaughty',
    type: 'organization',
    name: 'Illuminaughty',
    slug: 'illuminaughty',
    displayTypes: ['promoter', 'host', 'community', 'producer'],
    descriptionShort: 'A multi-city lifestyle event promoter producing curated private parties and themed social experiences across the United States.',
    website: 'https://weareilluminaughty.com/',
    contactEmail: 'support@weareilluminaughty.com',
    globePresence: { visibility: 'visible', regions: illuminaughtyRegions },
    status: 'approved',
    postedByUserId: 'user1',
  },
  {
    id: 'org-promoter-mumbai-velvet',
    type: 'organization',
    name: 'Mumbai Velvet',
    slug: 'mumbai-velvet',
    displayTypes: ['promoter', 'host', 'community'],
    descriptionShort: 'Mumbai Velvet, also branded as Mumvel, is an India-based lifestyle community and event promoter producing curated private gatherings in Mumbai, Goa, Daman, Delhi/NCR and other destinations.',
    descriptionFull: 'Mumbai Velvet organizes screened lifestyle experiences rather than operating a permanent public club. Its programming includes pool parties, themed nights, private house gatherings, yacht parties and multi-day destination events. Locations and admission details vary by event, with exact venues often shared only with approved attendees.',
    website: 'https://mumvel.com/',
    globePresence: {
      visibility: 'visible',
      regions: [
        hostRegion('mumbai', 'Mumbai', 'Maharashtra', 'India', 19.076, 72.8777),
        hostRegion('goa', 'Panaji', 'Goa', 'India', 15.4909, 73.8278),
        hostRegion('daman', 'Daman', 'Dadra and Nagar Haveli and Daman and Diu', 'India', 20.3974, 72.8328),
        hostRegion('delhi-ncr', 'New Delhi', 'Delhi', 'India', 28.6139, 77.209),
      ],
    },
    status: 'approved',
    postedByUserId: 'user1',
  },
  {
    id: 'org-promoter-sinful-house',
    type: 'organization',
    name: 'Sinful House',
    slug: 'sinful-house',
    displayTypes: ['promoter', 'host', 'community'],
    descriptionShort: 'Sinful House is a Bangkok-based private members lifestyle community and event organizer serving vetted adults across Thailand and Southeast Asia.',
    descriptionFull: 'Sinful House produces curated members-only lifestyle events using rotating partner venues rather than a permanent public clubhouse. Programming includes open mixed nights, couples-only parties, exploratory couples events and special festival or nightlife meetups. Registration, approval and advance event booking are required, and exact venues are shared privately with approved members.',
    website: 'https://sinfulhouse.com/',
    logoImageUrl: 'https://sinfulhouse.com/logos/red-sh-icon-t.png',
    headerImageUrl: 'https://sinfulhouse.com/meta-banner-sh.jpg',
    globePresence: {
      visibility: 'visible',
      regions: [hostRegion('bangkok', 'Bangkok', 'Bangkok', 'Thailand', 13.7563, 100.5018)],
    },
    status: 'approved',
    postedByUserId: 'user1',
  },
  {
    id: 'org-promoter-margarita-pleasures',
    type: 'organization',
    name: 'Margarita Pleasures',
    slug: 'margarita-pleasures',
    displayTypes: ['promoter', 'host', 'community', 'producer'],
    descriptionShort: 'Margarita Pleasures is an international lifestyle event and cruise organizer producing upscale, adults-only experiences across Italy, Slovenia, Croatia and other European destinations.',
    descriptionFull: 'Margarita Pleasures organizes rotating destination events rather than operating a permanent public club. Its programming has included luxury cruises, villa and mansion parties, international weekends, castle events, pool parties and collaborations with established clubs. Events are primarily designed for couples, with a limited number of approved single women and men admitted on selected dates. Exact venues, dress codes and participation details may be disclosed only to registered members or confirmed guests.',
    website: 'https://www.margarita-pleasures.com/',
    contactEmail: 'info@margarita-pleasures.com',
    logoImageUrl: 'https://www.margarita-pleasures.com/images/logo/margarita-barvni-na-crni-podlagi-dolg-logo.jpg',
    headerImageUrl: 'https://www.margarita-pleasures.com/images/2025/10/03/cruise_slideshow.png',
    globePresence: {
      visibility: 'visible',
      regions: [
        hostRegion('northeast-italy', 'Trieste', 'Friuli-Venezia Giulia', 'Italy', 45.6495, 13.7768),
        hostRegion('slovenia', 'Ljubljana', 'Ljubljana', 'Slovenia', 46.0569, 14.5058),
        hostRegion('croatia', 'Split', 'Split-Dalmatia', 'Croatia', 43.5081, 16.4402),
      ],
    },
    status: 'approved',
    postedByUserId: 'user1',
  },
  {
    id: 'org-operator-modern-lifestyle-events',
    type: 'organization',
    name: 'Modern Lifestyle Events',
    slug: 'modern-lifestyle-events',
    displayTypes: ['producer'],
    descriptionShort: 'Production organization behind multiple lifestyle event brands, including Bronze Party and Her Fantasy Party.',
    status: 'approved',
    postedByUserId: 'user1',
  },
  {
    id: 'org-promoter-her-fantasy-party',
    type: 'organization',
    name: 'Her Fantasy Party',
    slug: 'her-fantasy-party',
    displayTypes: ['event_brand', 'promoter', 'host'],
    descriptionShort: 'A recurring lifestyle event brand at Twist SF with its own themed editions and audience format.',
    operatingRegions: ['San Francisco Bay Area'],
    globePresence: {
      visibility: 'visible',
      regions: [hostRegion('san-francisco-bay-area-her-fantasy', 'San Francisco', 'CA', 'United States', 37.7749, -122.4194)],
    },
    status: 'approved',
    postedByUserId: 'user1',
  },
  {
    id: 'org-promoter-bronze-party',
    type: 'organization',
    name: 'Bronze Party',
    slug: 'bronze-party',
    displayTypes: ['event_brand', 'promoter', 'host', 'community'],
    descriptionShort: 'A Bay Area lifestyle event brand producing recurring screened parties, themed nights, private gatherings and major holiday events at Twist SF and other venues.',
    website: 'https://bronzeparty.com/',
    globePresence: {
      visibility: 'visible',
      regions: [hostRegion('san-francisco-bay-area', 'San Francisco', 'CA', 'United States', 37.7749, -122.4194)],
    },
    status: 'approved',
    postedByUserId: 'user1',
  },
  {
    id: 'org-promoter-allures',
    type: 'organization',
    name: 'Allures',
    slug: 'allures',
    displayTypes: ['promoter', 'host', 'community', 'producer'],
    descriptionShort: 'A Sacramento-area lifestyle organization producing upscale private hotel parties, meet-and-greets, destination trips, cruises and selected on-premise events for couples and approved singles.',
    descriptionFull: 'Allures is a Northern California lifestyle community and event producer rather than a permanent public clubhouse. Its programming includes private hotel dance parties with optional on-premise play, meet-and-greets, boating and motorcycle outings, destination trips and international cruises. The organization is primarily couples-focused and welcomes approved single guests at selected events. Membership, advance ticketing and event-specific screening may be required, while exact private-event locations are released to confirmed guests after ticketing. Allures publishes explicit consent, privacy, anti-harassment and no-recording rules for its events.',
    website: 'https://allureslifestyle.com/',
    contactEmail: 'allures@allureslifestyle.com',
    logoImageUrl: 'https://modernlifestyle-prod.nyc3.cdn.digitaloceanspaces.com/749722/97c883e1-745e-41af-91f8-3ad494d41191/original.jpg?v=pfdpy4',
    headerImageUrl: 'https://modernlifestyle-prod.nyc3.cdn.digitaloceanspaces.com/729499/529556ab-6da3-4156-8792-5582675400c6/original.jpg?v=pe4yy1',
    operatingRegions: ['Sacramento Area', 'Northern California', 'Destination Travel'],
    globePresence: {
      visibility: 'visible',
      regions: [hostRegion('sacramento-area', 'Sacramento', 'California', 'United States', 38.5816, -121.4944)],
    },
    standards: [
      'Consent required before touching',
      'No harassment or stalking',
      'No photography or recording',
      'Couples arrive and depart together',
      'Private event locations remain confidential',
      'No drugs or prostitution',
    ],
    status: 'approved',
    postedByUserId: 'user1',
  },
];

export const mockOrganizations: OrganizationData[] = [
  ...mockData.filter(isClub).map(clubToOrganization),
  ...hostOrganizations,
  ...standaloneOrganizations,
  communityHostOrganization,
];
