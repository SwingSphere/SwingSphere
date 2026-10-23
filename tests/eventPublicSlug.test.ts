import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EventData } from '../types';
import { eventCanonicalSlug, makeEventPublicSlug } from '../lib/eventPublicSlug';
import { buildEntityIndex } from '../lib/entityIndex';
import { getEventCanonicalPath, resolveEventFromParam } from '../lib/entityUtils';

const make = (id: string, overrides: Partial<EventData> = {}): EventData => ({
  id, type: 'event', name: 'Halloween Party', hostName: 'Illuminati',
  description_full: '', location: 'Private Address', contactEmail: '',
  time: { start: '2026-10-31T20:00:00-07:00', end: '2026-11-01T01:00:00-07:00' },
  geopoint: { latitude: 37, longitude: -121, address: { city: 'San Jose', region: 'CA', country: 'US' } },
  tags: [], status: 'approved', postedByUserId: 'admin', isAddressPrivate: true, ...overrides,
});

test('new event slugs include public city and ISO local date, never street address', () => {
  const event = make('new-1');
  assert.equal(makeEventPublicSlug(event, []), 'halloween-party-san-jose-2026-10-31');
});

test('duplicate title, city and date gets a short stable suffix', () => {
  const first = make('one', { publicSlug: 'halloween-party-san-jose-2026-10-31' });
  const duplicate = make('two');
  assert.match(makeEventPublicSlug(duplicate, [first])!, /^halloween-party-san-jose-2026-10-31-[a-z0-9]{8}$/);
});

test('existing events retain hash URL and new events resolve their stored slug', () => {
  const legacy = make('old-event');
  const newer = make('new-event', { publicSlug: 'halloween-party-san-jose-2026-10-31' });
  const index = buildEntityIndex([legacy, newer], []);
  assert.match(getEventCanonicalPath(legacy, index), /^\/events\/halloween-party--/);
  assert.equal(getEventCanonicalPath(newer, index), '/events/halloween-party-san-jose-2026-10-31');
  assert.equal(resolveEventFromParam(newer.publicSlug, index)?.event.id, newer.id);
  assert.equal(eventCanonicalSlug(legacy).startsWith('halloween-party--'), true);
});
