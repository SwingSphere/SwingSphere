import test from 'node:test';
import assert from 'node:assert/strict';
import type { EventData, OrganizationData } from '../types';
import { buildEntityIndex } from '../lib/entityIndex';

const host: OrganizationData = {
  id: 'org-b1-club-escape-cleveland',
  type: 'organization',
  name: 'Club Escape',
  slug: 'club-escape-cleveland',
  displayTypes: ['host'],
  status: 'approved',
  logoImageUrl: 'https://example.com/club-escape-logo.png',
};
const event = (id: string, hostName: string): EventData => ({
  id,
  type: 'event',
  name: id,
  status: 'approved',
  hostName,
  organizerOrganizationId: host.id,
  time: { start: '2026-10-24T19:00:00-04:00', end: '2026-10-25T02:00:00-04:00' },
} as EventData);

test('Club Escape canonical host shows events despite geographic slug and host-name case differences', () => {
  const index = buildEntityIndex([
    event('midweek', 'club escape'),
    event('halloween', 'Club Escape'),
  ], [], [], [host], [], [], []);
  const profile = index.hostsBySlug.get('club-escape-cleveland');
  assert.equal(profile?.organization?.id, host.id);
  assert.deepEqual(profile?.events.map((item) => item.id), ['midweek', 'halloween']);
  assert.equal(index.eventsByOrganizationId.get(host.id)?.length, 2);
  assert.equal(index.hostsBySlug.has('club-escape'), false);
});

test('legacy events without a canonical organization still have a host page', () => {
  const orphan = { ...event('legacy', 'Unlisted Promoter'), organizerOrganizationId: undefined };
  const index = buildEntityIndex([orphan], [], [], [host], [], [], []);
  assert.equal(index.hostsBySlug.get('unlisted-promoter')?.events[0].id, 'legacy');
});

test('canonical organizations do not inherit unrelated events sharing a venue', () => {
  const unrelated = { ...event('guest', 'Guest Promoter'), organizerOrganizationId: undefined, venueId: 'venue-b1-club-escape-cleveland' };
  const index = buildEntityIndex([event('owned', 'Club Escape'), unrelated], [], [], [host], [], [], []);
  assert.deepEqual(index.hostsBySlug.get(host.slug)?.events.map((item) => item.id), ['owned']);
});
