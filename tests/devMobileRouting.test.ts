import test from 'node:test';
import assert from 'node:assert/strict';
import listingsData from '../data/listings.local.json';
import { buildEntityIndex } from '../lib/entityIndex';
import { parsePrettyKeyParam } from '../lib/identityUtils';
import type { Listing } from '../types';
import { getDevMobileListingPath, getDevMobileMapPath, toDevMobilePath } from '../components/dev/mobile/devMobileRouting';
import { canScheduleMobileListingHandoff } from '../lib/mobileListingHandoff';
import {
  eventOverlapsTimeLens,
  matchesExplorerAccessFilter,
  normalizeListing,
  normalizeListings,
} from '../lib/explorerFilters';

const listings = listingsData as Listing[];
const index = buildEntityIndex(listings, []);

const assertRoundTrip = (name: string, type: Listing['type']) => {
  const listing = listings.find((candidate) => candidate.name === name && candidate.type === type);
  assert.ok(listing, `${name} fixture should exist`);
  const path = getDevMobileListingPath(listing, index);
  assert.match(path, new RegExp(`^/mobile/${type === 'club' ? 'clubs' : 'events'}/`));
  const slug = path.split('/').at(-1) ?? '';
  const key = parsePrettyKeyParam(slug);
  const resolved = type === 'club' ? index.clubsByKey.get(key) : index.eventsByKey.get(key);
  assert.equal(resolved?.id, listing.id, `${name} should resolve back to the same entity`);
};

test('Dev Mobile canonical listing routes round-trip through the current entity index', () => {
  assertRoundTrip('Our Secret Spot', 'club');
  assertRoundTrip('Coliseum Club', 'club');
  assertRoundTrip('Her Fantasy - White Party', 'event');
});

test('Dev Mobile path prefixing is isolated and idempotent', () => {
  assert.equal(toDevMobilePath('/'), '/mobile');
  assert.equal(toDevMobilePath('/events'), '/mobile/events');
  assert.equal(toDevMobilePath('/add'), '/mobile/add');
  assert.equal(toDevMobilePath('/mobile/saved'), '/mobile/saved');
  assert.equal(getDevMobileMapPath('club-twist-sf'), '/mobile?mapListing=club-twist-sf');
});

test('mobile listing handoff only remains armed for the arrived listing', () => {
  const arrived = {
    travelPhase: 'globe-arrived',
    travelDestination: { type: 'listing', listingId: 'club-twist-sf' },
  };
  assert.equal(canScheduleMobileListingHandoff(arrived, 'club-twist-sf'), true);
  assert.equal(canScheduleMobileListingHandoff(arrived, 'another-listing'), false);
  assert.equal(canScheduleMobileListingHandoff({ ...arrived, travelPhase: 'globe-travel' }, 'club-twist-sf'), false);
  assert.equal(canScheduleMobileListingHandoff({ travelPhase: 'globe-arrived', travelDestination: { type: 'region' } }, 'club-twist-sf'), false);
});

test('normalizeListing safely normalizes events without tags and clubs without generalAmenities or schedule', () => {
  const rawIncompleteEvent = {
    id: 'event-kink-store-92231-2026',
    name: 'Kinkoween 2026 at The Kink Store',
    type: 'event',
    status: 'approved',
    time: {
      start: '2026-10-31T20:00:00-07:00',
      end: '2026-11-01T00:00:00-07:00',
    },
    geopoint: {
      latitude: 37.7791,
      longitude: -122.4079,
      address: {
        city: 'San Francisco',
        region: 'California',
        country: 'United States',
      },
    },
    attendancePolicy: 'mixed_open',
    description_short: 'Halloween play-party gathering at The Kink Store SF.',
    // tags, galleryImageUrls, entryRequirements, mediaAssets intentionally omitted
  } as unknown as Listing;

  const normalizedEvent = normalizeListing(rawIncompleteEvent);
  assert.equal(normalizedEvent.type, 'event');
  if (normalizedEvent.type === 'event') {
    assert.deepEqual(normalizedEvent.tags, []);
    assert.deepEqual(normalizedEvent.tags.slice(0, 3), []);
    assert.deepEqual([...normalizedEvent.tags], []);
    assert.equal(normalizedEvent.description_full, 'Halloween play-party gathering at The Kink Store SF.');
    assert.deepEqual(normalizedEvent.mediaAssets, []);
    assert.deepEqual(normalizedEvent.entryRequirements, []);
    assert.deepEqual(normalizedEvent.galleryImageUrls, []);
  }

  const rawMalformedClub = {
    id: 'club-rich-moscow',
    name: 'Club RICH',
    type: 'club',
    status: 'approved',
    generalAmenities: null,
    schedule: undefined,
    galleryImageUrls: 'not-an-array',
    geopoint: {
      latitude: 55.7558,
      longitude: 37.6173,
      address: {
        city: 'Moscow',
        region: 'Moscow',
        country: 'Russia',
      },
    },
  } as unknown as Listing;

  const normalizedClub = normalizeListing(rawMalformedClub);
  assert.equal(normalizedClub.type, 'club');
  if (normalizedClub.type === 'club') {
    assert.deepEqual(normalizedClub.generalAmenities, []);
    assert.deepEqual(normalizedClub.generalAmenities.slice(0, 3), []);
    assert.deepEqual(normalizedClub.schedule, []);
    assert.deepEqual(normalizedClub.galleryImageUrls, []);
  }

  const batch = normalizeListings([rawIncompleteEvent, rawMalformedClub]);
  assert.equal(batch.length, 2);

  // Also verify filter & time lens helpers do not throw even on unnormalized records
  assert.equal(matchesExplorerAccessFilter(rawIncompleteEvent, 'single-men'), true);
  assert.equal(matchesExplorerAccessFilter(rawMalformedClub, 'couples-only'), false);
  assert.equal(
    eventOverlapsTimeLens(rawIncompleteEvent, { mode: 'date', date: '2026-10-31' }, new Date('2026-10-16T00:00:00Z')),
    true,
  );
});


