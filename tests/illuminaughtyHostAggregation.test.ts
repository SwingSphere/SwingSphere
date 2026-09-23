import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrganizationData, OrganizationGlobeRegion } from '../types';
import {
  adaptOrganizationsToDiscoveryPoints,
  adaptOrganizationsToGlobeEvents,
  getRenderableHostRegions,
} from '../lib/hostGlobeAdapter';

const region = (
  id: string,
  city: string,
  state: string,
  latitude: number,
  longitude: number,
): OrganizationGlobeRegion => ({
  id,
  label: `${city}, ${state}`,
  city,
  region: state,
  country: 'United States',
  latitude,
  longitude,
  status: 'recurring',
});

const illuminaughty: OrganizationData = {
  id: 'org-promoter-illuminaughty',
  type: 'organization',
  name: 'Illuminaughty',
  slug: 'illuminaughty',
  displayTypes: ['host', 'promoter'],
  status: 'approved',
  globePresence: {
    visibility: 'visible',
    regions: [
      region('denver', 'Denver', 'CO', 39.7392, -104.9903),
      region('colorado-springs', 'Colorado Springs', 'CO', 38.8339, -104.8214),
      region('richmond', 'Richmond', 'VA', 37.5407, -77.436),
      region('virginia-beach', 'Virginia Beach', 'VA', 36.8529, -75.978),
      region('raleigh', 'Raleigh', 'NC', 35.7796, -78.6382),
    ],
  },
};

test('Illuminaughty host presence collapses to one representative marker per state', () => {
  const renderable = getRenderableHostRegions(illuminaughty);
  assert.equal(renderable.length, 3);
  assert.deepEqual(
    renderable.map((item) => item.region).sort(),
    ['CO', 'NC', 'VA'],
  );
  assert.equal(renderable.filter((item) => item.region === 'CO').length, 1);
  assert.equal(renderable.filter((item) => item.region === 'VA').length, 1);
  assert.match(renderable.find((item) => item.region === 'CO')?.label ?? '', /2 areas/);
});

test('Illuminaughty state aggregation is shared by globe events and discovery points', () => {
  assert.equal(adaptOrganizationsToGlobeEvents([illuminaughty]).length, 3);
  assert.equal(adaptOrganizationsToDiscoveryPoints([illuminaughty]).length, 3);
});

test('other hosts retain their city-level presence', () => {
  const other: OrganizationData = {
    ...illuminaughty,
    id: 'org-other',
    name: 'Other Host',
    slug: 'other-host',
  };
  assert.equal(getRenderableHostRegions(other).length, 5);
});
