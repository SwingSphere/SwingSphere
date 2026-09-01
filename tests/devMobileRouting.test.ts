import test from 'node:test';
import assert from 'node:assert/strict';
import listingsData from '../data/listings.local.json';
import { buildEntityIndex } from '../lib/entityIndex';
import { parsePrettyKeyParam } from '../lib/identityUtils';
import type { Listing } from '../types';
import { getDevMobileListingPath, getDevMobileMapPath, toDevMobilePath } from '../components/dev/mobile/devMobileRouting';

const listings = listingsData as Listing[];
const index = buildEntityIndex(listings, []);

const assertRoundTrip = (name: string, type: Listing['type']) => {
  const listing = listings.find((candidate) => candidate.name === name && candidate.type === type);
  assert.ok(listing, `${name} fixture should exist`);
  const path = getDevMobileListingPath(listing, index);
  assert.match(path, new RegExp(`^/dev/mobile-preview/${type === 'club' ? 'clubs' : 'events'}/`));
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
  assert.equal(toDevMobilePath('/'), '/dev/mobile-preview');
  assert.equal(toDevMobilePath('/events'), '/dev/mobile-preview/events');
  assert.equal(toDevMobilePath('/dev/mobile-preview/saved'), '/dev/mobile-preview/saved');
  assert.equal(getDevMobileMapPath('club-twist-sf'), '/dev/mobile-preview?mapListing=club-twist-sf');
});

