import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  ClubData,
  EventData,
  EventSeriesData,
  OrganizationData,
  ResortData,
  VenueData,
} from '../types';
import { buildEntityIndex } from '../lib/entityIndex';
import {
  formatListingPhysicalAddress,
  isSyntheticHostOrganization,
  resolveEventOrganizerOrganizationId,
} from '../lib/entityCompatibility';
import { getEventTemporalState, isPastEvent } from '../lib/eventLifecycle';
import { getPublicLocationLabel, isApproximateLocation } from '../lib/publicLocation';
import {
  resolveBrandLogo,
  resolveEventLogoState,
} from '../lib/entityBrandMedia';
import { getListingLogoUrl } from '../lib/listingImage';
import { buildResortMarkers } from '../lib/travelMarkerModel';

const twistOrg: OrganizationData = {
  id: 'org-club-twist-sf',
  type: 'organization',
  name: 'Twist SF',
  slug: 'twist-sf',
  displayTypes: ['club'],
  status: 'approved',
  logoImageUrl: 'https://imagedelivery.net/twist-sf-canonical-logo/public',
};

const twistVenue: VenueData = {
  id: 'venue-club-twist-sf',
  type: 'venue',
  name: 'Twist SF Venue',
  slug: 'twist-sf-venue',
  status: 'approved',
  latitude: 37.7941,
  longitude: -122.4043,
  amenities: [],
  address: {
    addressLine1: '653 Commercial St',
    city: 'San Francisco',
    region: 'CA',
    country: 'US',
  },
  visibility: 'public_exact',
};

const twistClub: ClubData = {
  id: 'club-twist-sf',
  type: 'club',
  name: 'Twist SF',
  status: 'approved',
  ownerOrganizationId: twistOrg.id,
  primaryVenueId: twistVenue.id,
  venueKey: 'twist-sf',
  logoImageUrl: 'https://imagedelivery.net/twist-sf-canonical-logo/public',
  address: '653 Commercial St, San Francisco, CA',
} as ClubData;

// 1. Club Escape exposes all eligible linked events, not just six.
test('1. Club Escape exposes all 13 eligible linked events without truncation and redirects legacy slug', () => {
  const clubEscapeOrg: OrganizationData = {
    id: 'org-b1-club-escape-cleveland',
    type: 'organization',
    name: 'Club Escape',
    slug: 'club-escape-cleveland',
    displayTypes: ['club', 'host'],
    status: 'approved',
    logoImageUrl: 'https://imagedelivery.net/club-escape-logo/public',
  };

  const events: EventData[] = Array.from({ length: 13 }, (_, idx) => ({
    id: `event-club-escape-${idx + 1}`,
    type: 'event',
    name: `Club Escape Night #${idx + 1}`,
    status: 'approved',
    hostName: idx % 2 === 0 ? 'Club Escape' : 'club escape',
    organizerOrganizationId: clubEscapeOrg.id,
    time: {
      start: `2026-11-${String(idx + 10).padStart(2, '0')}T20:00:00-05:00`,
      end: `2026-11-${String(idx + 11).padStart(2, '0')}T02:00:00-05:00`,
    },
  } as EventData));

  const index = buildEntityIndex(events, [], [], [clubEscapeOrg], [], [], []);
  const profile = index.hostsBySlug.get('club-escape-cleveland');
  assert.ok(profile, 'Canonical host profile for club-escape-cleveland should exist');
  assert.equal(profile.events.length, 13, 'All 13 approved events must be indexed without truncation');
  assert.equal(
    index.hostSlugAliases.get('club-escape'),
    'club-escape-cleveland',
    'Legacy slug club-escape should redirect to canonical club-escape-cleveland',
  );
});

// 2. Bronze Party and Her Fantasy Party never inherit Twist SF's logo merely because they use its venue.
test('2. Bronze Party and Her Fantasy Party never inherit Twist SF logo via shared venue', () => {
  const bronzeOrg: OrganizationData = {
    id: 'org-host-the-bronze-party',
    type: 'organization',
    name: 'The Bronze Party',
    slug: 'the-bronze-party',
    displayTypes: ['host', 'event_brand'],
    status: 'approved',
    logoImageUrl: 'https://imagedelivery.net/bronze-party-canonical-logo/public',
  };

  const herFantasyOrg: OrganizationData = {
    id: 'org-host-her-fantasy-party',
    type: 'organization',
    name: 'Her Fantasy Party',
    slug: 'her-fantasy-party',
    displayTypes: ['host', 'event_brand'],
    status: 'approved',
    logoImageUrl: 'https://imagedelivery.net/her-fantasy-canonical-logo/public',
  };

  // Simulate contaminated series-her-fantasy carrying Twist SF's logo URL
  const herFantasySeriesContaminated: EventSeriesData = {
    id: 'series-her-fantasy',
    type: 'event_series',
    name: 'Her Fantasy Party',
    slug: 'her-fantasy-party',
    status: 'approved',
    organizerOrganizationId: herFantasyOrg.id,
    venueId: twistVenue.id,
    logoImageUrl: twistClub.logoImageUrl,
  };

  const bronzeEventAtTwist: EventData = {
    id: 'event-bronze-at-twist',
    type: 'event',
    name: 'Bronze Party SF',
    status: 'approved',
    hostName: 'The Bronze Party',
    organizerOrganizationId: bronzeOrg.id,
    venueId: twistVenue.id,
    venueKey: 'twist-sf',
    time: { start: '2026-11-15T21:00:00-08:00', end: '2026-11-16T03:00:00-08:00' },
  } as EventData;

  const herFantasyEventAtTwist: EventData = {
    id: 'event-her-fantasy-at-twist',
    type: 'event',
    name: 'Her Fantasy Party at Twist',
    status: 'approved',
    hostName: 'Her Fantasy Party',
    organizerOrganizationId: herFantasyOrg.id,
    eventSeriesId: herFantasySeriesContaminated.id,
    venueId: twistVenue.id,
    venueKey: 'twist-sf',
    time: { start: '2026-11-22T21:00:00-08:00', end: '2026-11-23T03:00:00-08:00' },
  } as EventData;

  const catalog = {
    listings: [twistClub, bronzeEventAtTwist, herFantasyEventAtTwist],
    venues: [twistVenue],
    organizations: [twistOrg, bronzeOrg, herFantasyOrg],
    eventSeries: [herFantasySeriesContaminated],
  };

  const bronzeState = resolveEventLogoState(bronzeEventAtTwist, catalog);
  assert.equal(bronzeState.resolvedLogo.url, bronzeOrg.logoImageUrl);
  assert.notEqual(bronzeState.resolvedLogo.url, twistClub.logoImageUrl);

  const herFantasyState = resolveEventLogoState(herFantasyEventAtTwist, catalog);
  assert.equal(herFantasyState.resolvedLogo.url, herFantasyOrg.logoImageUrl);
  assert.notEqual(herFantasyState.resolvedLogo.url, twistClub.logoImageUrl);

  const index = buildEntityIndex(
    [twistClub, bronzeEventAtTwist, herFantasyEventAtTwist],
    [],
    [twistVenue],
    [twistOrg, bronzeOrg, herFantasyOrg],
    [],
    [herFantasySeriesContaminated],
    [],
  );
  assert.equal(getListingLogoUrl(bronzeEventAtTwist, index), bronzeOrg.logoImageUrl);
  assert.equal(getListingLogoUrl(herFantasyEventAtTwist, index), herFantasyOrg.logoImageUrl);
});

// 3. Updating a canonical host logo propagates across its events unless a legitimate override exists.
test('3. Updating a canonical host logo propagates across events even when stale occurrence logoImageUrl exists, unless logoOverride === true', () => {
  const updatedHostOrg: OrganizationData = {
    id: 'org-host-illuminaughty',
    type: 'organization',
    name: 'Illuminaughty',
    slug: 'illuminaughty',
    displayTypes: ['host', 'promoter'],
    status: 'approved',
    logoImageUrl: 'https://imagedelivery.net/illuminaughty-new-2026-logo/public',
  };

  const staleCopiedEvent: EventData = {
    id: 'event-illuminaughty-standard',
    type: 'event',
    name: 'Illuminaughty Masquerade',
    status: 'approved',
    hostName: 'Illuminaughty',
    organizerOrganizationId: updatedHostOrg.id,
    logoImageUrl: 'https://imagedelivery.net/illuminaughty-old-2024-logo/public',
    // logoOverride is not true -> stale occurrence copy must NOT block canonical host logo
    time: { start: '2026-12-05T21:00:00-08:00', end: '2026-12-06T03:00:00-08:00' },
  } as EventData;

  const intentionalOverrideEvent: EventData = {
    id: 'event-illuminaughty-special-edition',
    type: 'event',
    name: 'Illuminaughty NYE Special Brand',
    status: 'approved',
    hostName: 'Illuminaughty',
    organizerOrganizationId: updatedHostOrg.id,
    logoImageUrl: 'https://imagedelivery.net/illuminaughty-nye-custom-logo/public',
    logoOverride: true,
    time: { start: '2026-12-31T21:00:00-08:00', end: '2027-01-01T04:00:00-08:00' },
  } as EventData;

  const catalog = {
    listings: [staleCopiedEvent, intentionalOverrideEvent],
    organizations: [updatedHostOrg],
  };

  const standardState = resolveEventLogoState(staleCopiedEvent, catalog);
  assert.equal(standardState.mode, 'inherited_host');
  assert.equal(standardState.resolvedLogo.url, updatedHostOrg.logoImageUrl);
  assert.equal(standardState.hasRedundantOccurrenceCopy, true);

  const overrideState = resolveEventLogoState(intentionalOverrideEvent, catalog);
  assert.equal(overrideState.mode, 'explicit_override');
  assert.equal(overrideState.resolvedLogo.url, intentionalOverrideEvent.logoImageUrl);
});

// 4. Events never inherit logos from unrelated promoters sharing a venue.
test('4. Unaffiliated or third-party promoter events at a club venue never inherit the club or peer promoter logo', () => {
  const independentPromoterWithoutLogo: OrganizationData = {
    id: 'org-host-indie-collective',
    type: 'organization',
    name: 'Indie Collective SF',
    slug: 'indie-collective-sf',
    displayTypes: ['host', 'promoter'],
    status: 'approved',
  };

  const indieEventAtTwist: EventData = {
    id: 'event-indie-at-twist',
    type: 'event',
    name: 'Indie Collective Takeover',
    status: 'approved',
    hostName: 'Indie Collective SF',
    organizerOrganizationId: independentPromoterWithoutLogo.id,
    venueId: twistVenue.id,
    venueKey: 'twist-sf',
    time: { start: '2026-11-28T21:00:00-08:00', end: '2026-11-29T03:00:00-08:00' },
  } as EventData;

  const twistOwnEvent: EventData = {
    id: 'event-twist-saturday',
    type: 'event',
    name: 'Twist Saturday Night',
    status: 'approved',
    hostName: 'Twist SF',
    venueId: twistVenue.id,
    venueKey: 'twist-sf',
    time: { start: '2026-11-29T21:00:00-08:00', end: '2026-11-30T03:00:00-08:00' },
  } as EventData;

  const catalog = {
    listings: [twistClub, indieEventAtTwist, twistOwnEvent],
    venues: [twistVenue],
    organizations: [twistOrg, independentPromoterWithoutLogo],
  };

  const indieLogo = resolveBrandLogo('event', indieEventAtTwist.id, catalog);
  assert.equal(indieLogo.url, undefined, 'Independent promoter without a logo must not inherit Twist SF logo');

  const twistOwnLogo = resolveBrandLogo('event', twistOwnEvent.id, catalog);
  assert.equal(twistOwnLogo.url, twistClub.logoImageUrl, 'Affirmatively Twist-operated event inherits Twist SF logo');
});

// 5. Connect.Dance.Love and Krystal Club Privé resolve their canonical host pages correctly.
test('5. Persisted org-host-* organizations (Connect.Dance.Love & Krystal Club Privé) resolve as canonical non-synthetic hosts', () => {
  const connectDanceLove: OrganizationData = {
    id: 'org-host-connect-dance-love',
    type: 'organization',
    name: 'Connect.Dance.Love',
    slug: 'connect-dance-love',
    displayTypes: ['host', 'promoter'],
    status: 'approved',
    createdAt: '2026-04-01T00:00:00.000Z',
    logoImageUrl: 'https://imagedelivery.net/connect-dance-love-logo/public',
  };

  const krystalClubPrive: OrganizationData = {
    id: 'org-host-krystal-club-prive',
    type: 'organization',
    name: 'Krystal Club Privé',
    slug: 'krystal-club-prive',
    displayTypes: ['host', 'event_brand'],
    status: 'approved',
    createdAt: '2026-04-01T00:00:00.000Z',
    logoImageUrl: 'https://imagedelivery.net/krystal-club-prive-logo/public',
  };

  const syntheticShim: OrganizationData = {
    id: 'org-host-ad-hoc-promoter',
    type: 'organization',
    name: 'Ad Hoc Promoter',
    slug: 'ad-hoc-promoter',
    displayTypes: ['host'],
    status: 'approved',
  };

  assert.equal(isSyntheticHostOrganization(connectDanceLove), false);
  assert.equal(isSyntheticHostOrganization(krystalClubPrive), false);
  assert.equal(isSyntheticHostOrganization(syntheticShim), true);

  const cdlEvent: EventData = {
    id: 'event-1776045966824',
    type: 'event',
    name: 'Connect.Dance.Love Social',
    status: 'approved',
    hostName: 'Connect.Dance.Love',
    time: { start: '2026-11-14T20:00:00-05:00', end: '2026-11-15T02:00:00-05:00' },
  } as EventData;

  const krystalEvent: EventData = {
    id: 'event-1775599220599',
    type: 'event',
    name: 'Krystal Soirée',
    status: 'approved',
    hostName: 'Krystal Club Privé',
    time: { start: '2026-11-21T21:00:00-05:00', end: '2026-11-22T03:00:00-05:00' },
  } as EventData;

  const collections = {
    listings: [cdlEvent, krystalEvent],
    venues: [],
    organizations: [connectDanceLove, krystalClubPrive],
    relationships: [],
    eventSeries: [],
  };

  assert.equal(resolveEventOrganizerOrganizationId(cdlEvent, collections), connectDanceLove.id);
  assert.equal(resolveEventOrganizerOrganizationId(krystalEvent, collections), krystalClubPrive.id);

  const index = buildEntityIndex(
    [cdlEvent, krystalEvent],
    [],
    [],
    [connectDanceLove, krystalClubPrive],
    [],
    [],
    [],
  );

  assert.equal(index.hostsBySlug.get('connect-dance-love')?.organization?.id, connectDanceLove.id);
  assert.equal(index.hostsBySlug.get('connect-dance-love')?.events.length, 1);
  assert.equal(index.hostsBySlug.get('krystal-club-prive')?.organization?.id, krystalClubPrive.id);
  assert.equal(index.hostsBySlug.get('krystal-club-prive')?.events.length, 1);
});

// 6. Midweek Escape's recurring occurrences can be associated with one series without creating duplicate events.
test('6. Midweek Escape recurring occurrences associate with one series without duplicate events and inherit series organizer', () => {
  const clubEscapeOrg: OrganizationData = {
    id: 'org-b1-club-escape-cleveland',
    type: 'organization',
    name: 'Club Escape',
    slug: 'club-escape-cleveland',
    displayTypes: ['club', 'host'],
    status: 'approved',
  };

  const midweekSeries: EventSeriesData = {
    id: 'series-midweek-escape-1775765315109',
    type: 'event_series',
    name: 'Midweek Escape',
    slug: 'midweek-escape',
    status: 'approved',
    organizerOrganizationId: clubEscapeOrg.id,
    cadenceSummary: 'Weekly on Wednesdays',
  };

  const occurrenceIds = [
    'event-1775498062796',
    'event-1775500501297',
    'event-1775500825641',
    'event-1775501342632',
  ];

  const occurrences: EventData[] = occurrenceIds.map((id, i) => ({
    id,
    type: 'event',
    name: 'Midweek Escape',
    status: 'approved',
    hostName: 'Club Escape',
    eventSeriesId: midweekSeries.id,
    time: {
      start: `2026-10-${String(7 + i * 7).padStart(2, '0')}T19:00:00-04:00`,
      end: `2026-10-${String(7 + i * 7).padStart(2, '0')}T23:59:00-04:00`,
    },
  } as EventData));

  const index = buildEntityIndex(
    occurrences,
    [],
    [],
    [clubEscapeOrg],
    [],
    [midweekSeries],
    [],
  );

  const seriesEvents = index.eventsBySeriesId.get(midweekSeries.id) ?? [];
  assert.equal(seriesEvents.length, 4);
  assert.deepEqual(
    new Set(seriesEvents.map((e) => e.id)).size,
    4,
    'Series occurrences must have 4 distinct event IDs without duplicates',
  );
  const hostEvents = index.eventsByOrganizationId.get(clubEscapeOrg.id) ?? [];
  assert.equal(hostEvents.length, 4, 'All 4 series occurrences inherit organizerOrganizationId from the series');
});

// 7. Resorts with verified public coordinates appear on the globe/map.
test('7. Resorts with verified public coordinates appear on the globe/map while private/approximate resorts are excluded', () => {
  const resorts: ResortData[] = [
    {
      id: 'resort-hedonism-ii-negril',
      type: 'resort',
      name: 'Hedonism II',
      slug: 'hedonism-ii-negril',
      status: 'approved',
      accommodationSummary: 'All-inclusive lifestyle resort in Negril',
      locationVisibility: 'public_exact',
    } as unknown as ResortData,
    {
      id: 'resort-paradise-lakes-resort',
      type: 'resort',
      name: 'Paradise Lakes Resort',
      slug: 'paradise-lakes-resort',
      status: 'approved',
      accommodationSummary: 'Clothing-optional resort in Lutz, FL',
      locationVisibility: 'public_exact',
    } as unknown as ResortData,
    {
      id: 'resort-the-kraken-resort',
      type: 'resort',
      name: 'The Kraken Resort',
      slug: 'the-kraken-resort',
      status: 'approved',
      accommodationSummary: 'Adults-only resort in Texas',
      locationVisibility: 'public_exact',
    } as unknown as ResortData,
    {
      id: 'resort-sea-mountain-inn-spa',
      type: 'resort',
      name: 'Sea Mountain Inn & Spa',
      slug: 'sea-mountain-inn-spa',
      status: 'approved',
      accommodationSummary: 'Private luxury spa resort',
      locationVisibility: 'approximate',
      geopoint: { latitude: 33.95, longitude: -116.5 },
    } as unknown as ResortData,
  ];

  const markers = buildResortMarkers(resorts);
  const markerIds = markers.map((m) => m.id);
  assert.ok(markerIds.includes('resort-hedonism-ii-negril'));
  assert.ok(markerIds.includes('resort-paradise-lakes-resort'));
  assert.ok(markerIds.includes('resort-the-kraken-resort'));
  assert.ok(
    !markerIds.includes('resort-sea-mountain-inn-spa'),
    'Resort with approximate/private locationVisibility must never emit an exact globe/map marker',
  );
});

// 8. Live events remain visible until their scheduled end, with past events clearly separated.
test('8. Live events remain active (!isPastEvent and happening_now) until scheduled end; past events are separated', () => {
  const liveEvent: EventData = {
    id: 'event-currently-live',
    type: 'event',
    name: 'Saturday Late Night',
    status: 'approved',
    time: {
      start: '2026-10-24T20:00:00Z',
      end: '2026-10-25T03:00:00Z',
    },
  } as EventData;

  const midEventNow = Date.parse('2026-10-24T23:30:00Z');
  assert.equal(getEventTemporalState(liveEvent, midEventNow), 'happening_now', 'Event should be marked happening_now between start and end');
  assert.equal(isPastEvent(liveEvent, midEventNow), false, 'Live event must NOT be treated as past before end time');

  const afterEndNow = Date.parse('2026-10-25T03:00:01Z');
  assert.equal(getEventTemporalState(liveEvent, afterEndNow), 'past');
  assert.equal(isPastEvent(liveEvent, afterEndNow), true, 'Event becomes past after its scheduled end time');
});

// 9. Club-to-host links never navigate to nonexistent profiles.
test('9. Organizations that own clubs or event series have resolvable hostsBySlug profiles when eligible, and non-host orgs are verifiable via hostsBySlug.has', () => {
  const clubWithEventsOrg: OrganizationData = {
    id: 'org-club-with-events',
    type: 'organization',
    name: 'Velvet Lounge',
    slug: 'velvet-lounge',
    displayTypes: ['club'],
    status: 'approved',
  };

  const clubOnlyNoEventsOrg: OrganizationData = {
    id: 'org-club-no-events',
    type: 'organization',
    name: 'Quiet Club',
    slug: 'quiet-club',
    displayTypes: ['club'],
    status: 'approved',
  };

  const velvetEvent: EventData = {
    id: 'event-velvet-1',
    type: 'event',
    name: 'Velvet Fridays',
    status: 'approved',
    organizerOrganizationId: clubWithEventsOrg.id,
    time: { start: '2026-11-06T21:00:00Z', end: '2026-11-07T02:00:00Z' },
  } as EventData;

  const index = buildEntityIndex(
    [velvetEvent],
    [],
    [],
    [clubWithEventsOrg, clubOnlyNoEventsOrg],
    [],
    [],
    [],
  );

  assert.equal(
    index.hostsBySlug.has(clubWithEventsOrg.slug),
    true,
    'Club organization with approved events has a valid hostsBySlug profile',
  );
  assert.equal(
    index.hostsBySlug.has(clubOnlyNoEventsOrg.slug),
    false,
    'Club organization with no host role and no events/series is absent from hostsBySlug so ClubPage suppresses dead host link',
  );
});

// 10. Private-location data remains protected.
test('10. Private-location data (isAddressPrivate and private/approximate venues) never leaks exact street addresses', () => {
  const privateVenue: VenueData = {
    id: 'venue-secret-mansion',
    type: 'venue',
    name: 'Secret Mansion',
    slug: 'secret-mansion',
    status: 'approved',
    latitude: 34.0837,
    longitude: -118.4004,
    amenities: [],
    visibility: 'private',
    address: {
      addressLine1: '999 Hidden Beverly Hills Dr',
      city: 'Los Angeles',
      region: 'CA',
      country: 'US',
    },
  };

  const privateEvent: EventData = {
    id: 'event-private-mansion-party',
    type: 'event',
    name: 'Private Mansion Soirée',
    status: 'approved',
    isAddressPrivate: true,
    venueId: privateVenue.id,
    location: '999 Hidden Beverly Hills Dr, Los Angeles, CA',
    geopoint: {
      latitude: 34.0837,
      longitude: -118.4004,
      address: {
        addressLine1: '999 Hidden Beverly Hills Dr',
        city: 'Los Angeles',
        region: 'CA',
        country: 'US',
      },
    },
    time: { start: '2026-11-14T21:00:00-08:00', end: '2026-11-15T03:00:00-08:00' },
  } as EventData;

  const collections = {
    listings: [privateEvent],
    venues: [privateVenue],
  };
  const displayAddress = formatListingPhysicalAddress(privateEvent, collections);
  const publicLabel = getPublicLocationLabel(privateEvent, collections);

  assert.equal(isApproximateLocation(privateEvent), true);
  assert.ok(
    !displayAddress.includes('999 Hidden Beverly Hills Dr'),
    'Exact street address must never be returned when isAddressPrivate is true',
  );
  assert.ok(
    !publicLabel.includes('999 Hidden Beverly Hills Dr'),
    'Public location label must never expose exact street address',
  );
  assert.equal(displayAddress, 'Los Angeles, CA, US');
  assert.equal(publicLabel, 'Los Angeles, CA area');
});
