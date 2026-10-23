import test from 'node:test';
import assert from 'node:assert/strict';
import listingsData from '../data/listings.local.json';
import { buildEntityIndex } from '../lib/entityIndex';
import { resolveClubFromParam, resolveEventFromParam } from '../lib/entityUtils';
import { formatEventTimeRange } from '../lib/formatting';
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

test('club-event relationships remain intact across event renames, club renames, organizer edits, and archive states', () => {
  assert.ok(twist);
  assert.ok(halloween);
  const originalIndex = buildEntityIndex([twist, halloween], []);
  const originalClubLookup = resolveClubFromParam(twist.id, originalIndex);
  const originalEventLookup = resolveEventFromParam(halloween.id, originalIndex);
  assert.ok(originalClubLookup);
  assert.ok(originalEventLookup);

  const renamedClub: ClubData = { ...twist, name: 'Twist San Francisco Lounge Renamed' };
  const renamedEvent: EventData = {
    ...halloween,
    name: 'Halloween Kickoff Renamed Edition',
    hostName: 'Bronze Party SF Updated',
  };
  const archivedEvent: EventData & { archivedAt?: string } = {
    ...halloween,
    id: 'event-archived-at-twist',
    archivedAt: '2026-10-20T00:00:00Z',
  };

  const mutatedIndex = buildEntityIndex([renamedClub, renamedEvent, archivedEvent], []);
  const key = mutatedIndex.clubKeyById.get(renamedClub.id);
  assert.ok(key);
  const clubEvents = mutatedIndex.eventsByVenueClubKey.get(key) ?? [];
  assert.equal(clubEvents.length, 1);
  assert.equal(clubEvents[0]?.id, renamedEvent.id);

  // Old pretty-key URLs still resolve and redirect cleanly after renames
  const oldClubSlug = originalClubLookup.canonicalPath.replace('/clubs/', '');
  const oldEventSlug = originalEventLookup.canonicalPath.replace('/events/', '');
  assert.equal(resolveClubFromParam(oldClubSlug, mutatedIndex)?.club.id, renamedClub.id);
  assert.equal(resolveEventFromParam(oldEventSlug, mutatedIndex)?.event.id, renamedEvent.id);
});

test('formatEventTimeRange preserves venue wall-clock time across timezone offsets and includes weekday', () => {
  const italyTime = formatEventTimeRange(
    '2026-10-23T22:30:00+02:00',
    '2026-10-24T03:00:00+02:00',
  );
  assert.match(italyTime, /Fri, Oct 23/);
  assert.match(italyTime, /10:30 PM – 3:00 AM/);
});
