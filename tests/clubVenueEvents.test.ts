import test from 'node:test';
import assert from 'node:assert/strict';
import listingsData from '../data/listings.local.json';
import { buildEntityIndex } from '../lib/entityIndex';
import type { ClubData, EventData, Listing } from '../types';

const listings = listingsData as Listing[];
const twist = listings.find((listing): listing is ClubData => listing.type === 'club' && listing.id === 'club-twist-sf');
const halloween = listings.find((listing): listing is EventData => listing.type === 'event' && listing.id === 'event-bronze-halloween-kickoff-twist-2026-10-24');

test('events linked by venue ID appear on the corresponding club page once', () => {
  assert.ok(twist);
  assert.ok(halloween);
  const index = buildEntityIndex(listings, []);
  const key = index.clubKeyById.get(twist.id);
  assert.ok(key);
  const events = index.eventsByVenueClubKey.get(key) ?? [];
  assert.equal(events.filter((event) => event.id === halloween.id).length, 1);
  assert.equal(index.eventsByVenueId.get(halloween.venueId ?? '')?.some((event) => event.id === halloween.id), true);
});

test('a canonical venue ID takes precedence over an outdated legacy venue key', () => {
  assert.ok(twist);
  assert.ok(halloween);
  const otherClub = listings.find((listing): listing is ClubData => listing.type === 'club' && listing.id !== twist.id);
  assert.ok(otherClub);
  const index = buildEntityIndex([twist, otherClub, { ...halloween, venueKey: 'outdated-venue-key' }], []);
  const key = index.clubKeyById.get(twist.id);
  assert.ok(key);
  assert.equal(index.eventsByVenueClubKey.get(key)?.[0]?.id, halloween.id);
  assert.equal(index.eventsByVenueClubKey.has('outdated-venue-key'), false);
});
