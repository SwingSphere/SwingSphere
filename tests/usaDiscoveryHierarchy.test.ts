import assert from 'node:assert/strict';
import test from 'node:test';
import {
  USA_DISCOVERY_REGIONS,
  findUsaMetro,
  getUsaMetroListings,
  getUsaMetroMarkers,
  getUsaRegionMarkers,
} from '../data/usaDiscoveryHierarchy';

test('the USA prototype exposes the requested region and metro hierarchy', () => {
  assert.deepEqual(
    USA_DISCOVERY_REGIONS.map((region) => region.name),
    ['West', 'Southwest', 'Midwest', 'Southeast', 'Northeast'],
  );

  assert.deepEqual(
    USA_DISCOVERY_REGIONS.find((region) => region.id === 'west')?.metros.map((metro) => metro.name),
    ['Bay Area', 'Los Angeles', 'Seattle', 'Portland'],
  );
  assert.deepEqual(
    USA_DISCOVERY_REGIONS.find((region) => region.id === 'southwest')?.metros.map((metro) => metro.name),
    ['Las Vegas', 'Phoenix'],
  );
  assert.equal(findUsaMetro('chicago')?.region.id, 'midwest');
  assert.equal(findUsaMetro('atlanta')?.region.id, 'southeast');
  assert.equal(findUsaMetro('south-florida')?.region.id, 'southeast');
  assert.equal(findUsaMetro('new-york-north-jersey')?.region.id, 'northeast');
});

test('region and metro discovery markers remain logical ActivityRegion data', () => {
  const regionMarkers = getUsaRegionMarkers();
  const westMetroMarkers = getUsaMetroMarkers('west');

  assert.equal(regionMarkers.length, 5);
  assert.equal(westMetroMarkers.length, 4);
  assert.deepEqual(westMetroMarkers.map((marker) => marker.name), ['Bay Area', 'Los Angeles', 'Seattle', 'Portland']);
  assert.ok(regionMarkers.every((marker) => marker.countryIso2 === 'US'));
  assert.ok(westMetroMarkers.every((marker) => marker.listingIds.length >= 2));
});

test('Bay Area is represented by one metro marker and ten distinct local points', () => {
  const bayArea = findUsaMetro('bay-area')?.metro;
  assert.ok(bayArea);
  const bayAreaListings = getUsaMetroListings(bayArea.id);
  assert.equal(getUsaMetroMarkers('west').filter((marker) => marker.name === 'Bay Area').length, 1);
  assert.equal(bayAreaListings.length, 10);

  const coordinates = bayAreaListings.map((listing) =>
    `${listing.geopoint.latitude}:${listing.geopoint.longitude}`);
  assert.equal(new Set(coordinates).size, 10);

  const latitudes = bayAreaListings.map((listing) => listing.geopoint.latitude);
  const longitudes = bayAreaListings.map((listing) => listing.geopoint.longitude);
  const northSouthMiles = (Math.max(...latitudes) - Math.min(...latitudes)) * 69;
  const eastWestMiles = (Math.max(...longitudes) - Math.min(...longitudes)) * 54.6;
  assert.ok(northSouthMiles <= 7);
  assert.ok(eastWestMiles <= 7);
});
