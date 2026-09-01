import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { BuildingAsset, Listing, VenueData } from '../types.ts';
import {
  auditBuildingGeometry,
  extractIndividualBuildingFootprints,
  geometryFingerprint,
  pointIntersectsBuildingGeometry,
  pointToBuildingDistanceMeters,
} from '../lib/buildingGeometry.ts';
import {
  evaluateBuildingVerification,
  houseNumbersMatch,
  normalizeAddressText,
  planAutomaticBuildingPersistence,
  scoreBuildingAddressCandidate,
  type VerificationCandidateInput,
} from '../lib/buildingVerification.ts';
import { getBuildingAssetForListing } from '../lib/entityCompatibility.ts';
import { buildBuildingCatalogShadowReport } from '../lib/buildingShadowAudit.ts';
import { createNominatimBuildingAddressResolver } from '../lib/buildingAddressResolver.ts';

const root = process.cwd();
const listings = JSON.parse(fs.readFileSync(path.join(root, 'data/listings.local.json'), 'utf8')) as Listing[];
const assets = JSON.parse(fs.readFileSync(path.join(root, 'data/building-assets.local.json'), 'utf8')) as BuildingAsset[];
const square = (lng: number, lat: number, size = 0.0001): GeoJSON.Polygon => ({
  type: 'Polygon',
  coordinates: [[[lng, lat], [lng + size, lat], [lng + size, lat + size], [lng, lat + size], [lng, lat]]],
});

test('geometry fingerprints ignore ring start and direction but preserve topology', () => {
  const a = square(-1, 52);
  const b: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[-0.9999, 52], [-1, 52], [-1, 52.0001], [-0.9999, 52.0001], [-0.9999, 52]]] };
  const crossed: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[-1, 52], [-0.9999, 52.0001], [-0.9999, 52], [-1, 52.0001], [-1, 52]]] };
  assert.equal(geometryFingerprint(a), geometryFingerprint(b));
  assert.notEqual(geometryFingerprint(a), geometryFingerprint(crossed));
});

test('duplicate tile polygons collapse without grouping distinct buildings by provider ID', () => {
  const first = square(26.1306, 44.4392);
  const second = square(26.1310, 44.4392);
  const workspace = extractIndividualBuildingFootprints([
    { id: 235840250, geometry: first, source: 'OpenFreeMap' },
    { id: 235840250, geometry: first, source: 'OpenFreeMap' },
    { id: 235840250, geometry: second, source: 'OpenFreeMap' },
  ], { lng: 26.1306887, lat: 44.4392618 }, { radiusMeters: 100 });
  assert.equal(workspace.footprints.length, 2, 'Attraction Club regression: one feature ID may contain independent buildings');
  assert.equal(workspace.diagnostics.duplicatePolygonCount, 1);
});

test('address normalization supports accents, abbreviations and number ranges', () => {
  assert.equal(normalizeAddressText('Cypress Creek Pkwy.'), 'cypress creek parkway');
  assert.equal(normalizeAddressText('Strada Agricultori'), 'strada agricultori');
  assert.equal(houseNumbersMatch('13-17', '13'), true);
  const score = scoreBuildingAddressCandidate(
    { addressLine1: '13-17 Sutherland St', city: 'Swinton', region: 'Greater Manchester', postalCode: 'M27 6AT', country: 'United Kingdom' },
    { houseNumber: '13', road: 'Sutherland Street', city: 'Swinton', postalCode: 'M27 6AT', country: 'United Kingdom' },
    { pinIntersects: true, distanceMeters: 0 },
  );
  assert.equal(score.houseNumberMatch, true);
  assert.ok(score.streetSimilarity >= 0.99);
});

const candidate = (overrides: Partial<VerificationCandidateInput> = {}): VerificationCandidateInput => ({
  fingerprint: 'footprint-best',
  geometry: square(-95.4492, 30.0124),
  providerFeatureIds: ['provider-1'],
  source: 'OpenFreeMap',
  pinIntersects: true,
  pinToFootprintMeters: 0,
  pinToCentroidMeters: 10,
  address: { houseNumber: '1319', road: 'Cypress Creek Parkway', city: 'Houston', postalCode: '77090', country: 'United States' },
  addressLabel: '1319 Cypress Creek Parkway, Houston, TX 77090',
  ...overrides,
});

test('definitive exact-address tier auto-accepts in shadow mode without persisting', () => {
  const decision = evaluateBuildingVerification([candidate()], {
    listingAddress: { addressLine1: '1319 Cypress Creek Parkway', city: 'Houston', region: 'Texas', postalCode: '77090', country: 'United States' },
    locationConfidence: 0.98,
    geocoderSource: 'official_club_embedded_map',
  });
  assert.equal(decision.outcome, 'verified');
  assert.equal(decision.autoAccept, true);
  const plan = planAutomaticBuildingPersistence(decision, { mode: 'shadow' });
  assert.equal(plan.shouldPersist, false);
  assert.match(plan.reason, /shadow mode/);
});

test('runner-up ambiguity blocks automatic acceptance', () => {
  const decision = evaluateBuildingVerification([
    candidate(),
    candidate({ fingerprint: 'footprint-runner-up', providerFeatureIds: ['provider-2'], pinIntersects: false, pinToFootprintMeters: 2, pinToCentroidMeters: 12 }),
  ], {
    listingAddress: { addressLine1: '1319 Cypress Creek Parkway', city: 'Houston', region: 'Texas', postalCode: '77090', country: 'United States' },
    locationConfidence: 0.98,
    geocoderSource: 'official_club_embedded_map',
  });
  assert.equal(decision.outcome, 'ambiguous');
  assert.equal(decision.autoAccept, false);
});

test('nearest footprint alone is rejected when address and pin evidence conflict', () => {
  const decision = evaluateBuildingVerification([candidate({
    pinIntersects: false,
    pinToFootprintMeters: 70,
    address: { houseNumber: '1401', road: 'Cypress Creek Parkway', city: 'Houston', postalCode: '77090', country: 'United States' },
  })], {
    listingAddress: { addressLine1: '1319 Cypress Creek Parkway', city: 'Houston', region: 'Texas', postalCode: '77090', country: 'United States' },
    locationConfidence: 0.5,
    geocoderSource: 'nominatim',
  });
  assert.equal(decision.outcome, 'address_mismatch');
  assert.equal(decision.autoAccept, false);
});

test('Clube 2A2 dense-city saved asset remains valid and the corrected pin reaches its footprint', () => {
  const listing = listings.find((item) => item.id === 'club-2a2-rio-de-janeiro')!;
  const asset = assets.find((item) => item.id === listing.buildingAssetId)!;
  const audit = auditBuildingGeometry(asset.geometry);
  assert.equal(audit.valid, true);
  const point = { lng: listing.geopoint.longitude, lat: listing.geopoint.latitude };
  assert.ok(pointToBuildingDistanceMeters(point, asset.geometry) < 35, 'dense-city workspace must not regress to a blank/unreachable footprint');
});

test('Attraction Club asset is an individual renderable footprint despite aggregate provider provenance', () => {
  const listing = listings.find((item) => item.id === 'club-attraction-bucharest')!;
  const asset = assets.find((item) => item.id === listing.buildingAssetId)!;
  const audit = auditBuildingGeometry(asset.geometry);
  assert.equal(audit.valid, true);
  assert.equal(audit.polygonCount, 1);
  assert.ok(asset.provider.featureIds.length > 1, 'fixture preserves proof that provider IDs are provenance only');
});

test('Colette Houston corrected coordinate is materially better than the stale coordinate', () => {
  const listing = listings.find((item) => item.id === 'club-colette-houston')!;
  const asset = assets.find((item) => item.id === listing.buildingAssetId)!;
  const corrected = pointToBuildingDistanceMeters({ lng: listing.geopoint.longitude, lat: listing.geopoint.latitude }, asset.geometry);
  const stale = pointToBuildingDistanceMeters({ lng: -95.4305, lat: 29.987 }, asset.geometry);
  assert.ok(corrected < stale);
  assert.ok(stale > 1000);
});

test('Twist events inherit the canonical Venue asset and do not replace it', () => {
  const club = listings.find((item) => item.id === 'club-twist-sf')!;
  const event = listings.find((item) => item.id === 'event-her-fantasy-back-to-school-twist-2026-08-16')!;
  const venue: VenueData = {
    id: 'venue-club-twist-sf', type: 'venue', name: 'Twist SF', slug: 'twist-sf',
    address: club.geopoint.address, latitude: club.geopoint.latitude, longitude: club.geopoint.longitude,
    visibility: 'public_exact', status: 'approved', amenities: [], buildingAssetId: 'building-asset-club-twist-sf',
  };
  const resolved = getBuildingAssetForListing(event, assets, { listings, venues: [venue], organizations: [], relationships: [] });
  assert.equal(resolved?.id, 'building-asset-club-twist-sf');
  const decision = evaluateBuildingVerification([], { listingAddress: event.geopoint.address, existingVerifiedAsset: true });
  assert.equal(planAutomaticBuildingPersistence(decision, { mode: 'enabled', existingAsset: true }).shouldPersist, false);
  const report = buildBuildingCatalogShadowReport(listings, assets, { listings });
  assert.equal(
    report.entries.find((entry) => entry.listingId === event.id)?.category,
    'has_verified_shared_asset',
    'legacy event coordinates must not create false drift against the canonical Venue asset',
  );
});

test('an inside pin is not flagged because a large footprint centroid is far away', () => {
  const base = listings.find((item) => item.id === 'club-cupids-swinton')!;
  const listing: Listing = {
    ...base,
    id: 'club-large-footprint-regression',
    name: 'Large Footprint Regression',
    buildingAssetId: 'building-asset-large-footprint-regression',
    geopoint: { ...base.geopoint, latitude: 51.50001, longitude: -0.19999 },
  };
  const geometry: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [[[-0.2, 51.5], [-0.18, 51.5], [-0.18, 51.51], [-0.2, 51.51], [-0.2, 51.5]]],
  };
  const asset: BuildingAsset = {
    id: listing.buildingAssetId!, listingId: listing.id, version: 1,
    provider: { source: 'test', featureIds: ['large'] }, geometry,
    renderHeightMeters: 5, renderMinHeightMeters: 0,
    capture: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', polygonCount: 1, ringCount: 1, vertexCount: 5 },
  };
  const report = buildBuildingCatalogShadowReport([listing], [asset], { listings: [listing] });
  assert.equal(report.entries[0]?.pinIntersects, true);
  assert.equal(report.entries[0]?.pinToFootprintMeters, 0);
  assert.equal(report.entries[0]?.category, 'has_verified_shared_asset');
});

test('malformed and pathological geometry fails explicitly instead of throwing', () => {
  const malformed = auditBuildingGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, Number.NaN], [0, 0]]] } as GeoJSON.Polygon);
  assert.equal(malformed.valid, false);
  assert.ok(malformed.failures.includes('non_finite_coordinate'));
});

test('reverse geocoding distinguishes no address from transient provider failure', async () => {
  const noAddress = createNominatimBuildingAddressResolver({
    minimumIntervalMs: 0,
    maximumAttempts: 1,
    fetchImpl: (async () => new Response('', { status: 404 })) as typeof fetch,
  });
  assert.equal((await noAddress.resolveDetailed(1, 2)).status, 'no_address');
  const unavailable = createNominatimBuildingAddressResolver({
    minimumIntervalMs: 0,
    maximumAttempts: 1,
    fetchImpl: (async () => new Response('', { status: 503 })) as typeof fetch,
  });
  const result = await unavailable.resolveDetailed(1, 2);
  assert.equal(result.status, 'provider_error');
  if (result.status === 'provider_error') assert.equal(result.retryable, true);
});
