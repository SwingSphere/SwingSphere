import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const hostAdapterSource = readFileSync(path.join(process.cwd(), 'lib/hostGlobeAdapter.ts'), 'utf8');
const organizationSource = readFileSync(path.join(process.cwd(), 'data/mockOrganizations.ts'), 'utf8');
const activityRegionSource = readFileSync(path.join(process.cwd(), 'lib/activityRegionProvider.ts'), 'utf8');

test('host discovery points carry host IDs into activity-region membership', () => {
  assert.match(hostAdapterSource, /hostIds:\s*\[markerId\]/);
  assert.match(activityRegionSource, /const hostCount = unique\(members\.flatMap\(\(point\) => point\.hostIds \?\? \[\]\)\)\.length/);
  assert.match(activityRegionSource, /hostCount,/);
});

test('Illuminaughty has the multi-city presences behind the reported empty regions', () => {
  for (const cityId of [
    'denver',
    'colorado-springs',
    'chicago',
    'milwaukee',
    'baltimore',
    'washington-dc',
    'boston',
    'providence',
  ]) {
    assert.match(organizationSource, new RegExp(`hostRegion\\('${cityId}'`));
  }
});
