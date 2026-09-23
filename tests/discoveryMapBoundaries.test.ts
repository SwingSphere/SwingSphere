import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BAY_AREA_SEVEN_COUNTY_BOUNDARY_URLS,
  getDiscoveryContextBoundaryUrls,
  getListingCityBoundaryUrl,
} from '../lib/discoveryMapBoundaries';
import { getUsaMetroListings } from '../data/usaDiscoveryHierarchy';

test('Bay Area discovery scope resolves to seven permanent county boundary assets', () => {
  const listings = getUsaMetroListings('bay-area');
  const urls = getDiscoveryContextBoundaryUrls('Bay Area', listings);

  assert.equal(urls.length, 7);
  assert.deepEqual(urls, BAY_AREA_SEVEN_COUNTY_BOUNDARY_URLS);
  assert.ok(urls.some((url) => url.includes('alameda')));
  assert.ok(urls.some((url) => url.includes('santa-clara')));
  assert.ok(!urls.some((url) => url.includes('napa')));
  assert.ok(!urls.some((url) => url.includes('solano')));

  for (const url of urls) {
    const diskPath = path.join(process.cwd(), 'public', url.replace(/^\//, ''));
    assert.equal(fs.existsSync(diskPath), true, `missing boundary asset: ${url}`);
  }
});

test('non-Bay-Area scopes do not inherit the Bay Area county outline', () => {
  const listings = getUsaMetroListings('los-angeles');
  assert.deepEqual(getDiscoveryContextBoundaryUrls('Los Angeles', listings), []);
});

test('San Francisco listings resolve to the permanent city outline', () => {
  const listing = getUsaMetroListings('bay-area')[0];
  assert.equal(getListingCityBoundaryUrl(listing), '/geo/admin/us/ca/san-francisco-city.geojson');
});
