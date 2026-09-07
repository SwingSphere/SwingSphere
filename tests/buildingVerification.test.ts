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
  extractHouseNumber,
  houseNumbersMatch,
  normalizeAddressText,
  planAutomaticBuildingPersistence,
  scoreBuildingAddressCandidate,
  type VerificationCandidateInput,
} from '../lib/buildingVerification.ts';
import { getBuildingAssetForListing, getListingPhysicalCoords } from '../lib/entityCompatibility.ts';
import { buildBuildingCatalogShadowReport } from '../lib/buildingShadowAudit.ts';
import { createNominatimBuildingAddressResolver, createCachedBuildingAddressResolver, type BuildingAddressResolver } from '../lib/buildingAddressResolver.ts';
import { runBuildingVerificationPipeline } from '../lib/buildingVerificationPipeline.ts';
import { createBuildingAssetRevision, createBuildingVerificationInputSnapshot, guardBuildingAssetPersistence } from '../lib/buildingPersistenceGuard.ts';
import { fuseBuildingNeighborhood } from '../lib/buildingNeighborhoodFusion.ts';
import { createGeneratedBuildingCandidate, GENERATED_BUILDING_ID_PREFIX } from '../lib/buildingReconstruction.ts';
import { isResolvedAddressPlausibleForInput } from '../lib/listingLocationValidation.ts';
import { assessListingCoordinateQuality } from '../lib/listingLocationQuality.ts';
import { auditStaleBuildingAssets } from '../lib/buildingStaleAssetAudit.ts';
import type { BuildingVerificationEvidenceRecord } from '../lib/buildingVerificationEvidence.ts';

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

test('international exact-address validation rejects a street-only Colombian segment that drops the cross-street number', () => {
  assert.equal(isResolvedAddressPlausibleForInput(
    'Calle 82 #19A-05, Bogotá, Colombia',
    { addressLine1: 'Calle 82', city: 'Bogotá', region: 'Bogotá, Distrito Capital', postalCode: '110221', country: 'Colombia' },
  ), false);
  assert.equal(isResolvedAddressPlausibleForInput(
    'Calle 82 #19A-05, Bogotá, Colombia',
    { addressLine1: '19A-05, Calle 82', city: 'Bogotá', region: 'Bogotá, Distrito Capital', postalCode: '110221', country: 'Colombia' },
  ), true);
});

test('international street detection still accepts a matching non-English building address', () => {
  assert.equal(isResolvedAddressPlausibleForInput(
    'Rua Visconde de Caravelas, 176, Rio de Janeiro, Brazil',
    { addressLine1: '176, Rua Visconde de Caravelas', city: 'Rio de Janeiro', country: 'Brazil' },
  ), true);
  assert.equal(isResolvedAddressPlausibleForInput(
    'Chacabuco 162, Buenos Aires, Argentina',
    { addressLine1: '162, Chacabuco', city: 'Buenos Aires', country: 'Argentina' },
  ), true);
});

test('international postal codes are compared without US-only assumptions', () => {
  assert.equal(isResolvedAddressPlausibleForInput(
    '13-17 Sutherland Street, Swinton, M27 6AT, United Kingdom',
    { addressLine1: '13-17 Sutherland Street', city: 'Swinton', postalCode: 'M276AT', country: 'United Kingdom' },
  ), true);
  assert.equal(isResolvedAddressPlausibleForInput(
    'Middelweg 18, 2841 LA Moordrecht, Netherlands',
    { addressLine1: 'Middelweg 18', city: 'Moordrecht', postalCode: '2841LA', country: 'Netherlands' },
  ), true);
  assert.equal(isResolvedAddressPlausibleForInput(
    '47 Blaauwberg Road, Table View, Cape Town, 7441, South Africa',
    { addressLine1: '47 Blaauwberg Road', city: 'Cape Town', postalCode: '7441', country: 'South Africa' },
  ), true);
});

test('weak street-segment provenance cannot outrank an existing saved asset', () => {
  const coliseum = listings.find((listing) => listing.id === 'club-coliseum-mexico-city')!;
  const quality = assessListingCoordinateQuality(coliseum, { listings });
  assert.equal(quality.level, 'street_level');
  assert.equal(quality.canPreferPinOverSavedAsset, false);
  const evidence = JSON.parse(fs.readFileSync(path.join(root, 'data/building-verification-evidence.local.json'), 'utf8')) as BuildingVerificationEvidenceRecord[];
  const audit = auditStaleBuildingAssets([coliseum.id], listings, assets, evidence)[0];
  assert.equal(audit.recommendation, 'needs_human_research');
  assert.match(audit.reasons.join(' '), /pin is not authoritative enough/i);
});

test('house-number parsing handles international and numbered-street formats', () => {
  assert.equal(extractHouseNumber('Calle 82 #19A-05'), '19a-05');
  assert.equal(extractHouseNumber('Carrera 18 No. 78-50'), '78-50');
  assert.equal(extractHouseNumber('Unit 14, 70 5th Street'), '70');
  assert.equal(extractHouseNumber('Rua Visconde de Caravelas, 176'), '176');
  assert.equal(extractHouseNumber('785/5 Pracha Uthit Road'), '785/5');
  assert.equal(extractHouseNumber('Calle 82'), '');
});

test('exact submitted addresses reject otherwise matching street-only geocodes', () => {
  assert.equal(isResolvedAddressPlausibleForInput(
    '47 Blaauwberg Road, Table View, Cape Town, 7441, South Africa',
    { addressLine1: 'Blaauwberg Road', city: 'Cape Town', postalCode: '7441', country: 'South Africa' },
  ), false);
  assert.equal(isResolvedAddressPlausibleForInput(
    '785/5 Pracha Uthit Road, Bangkok 10310, Thailand',
    { addressLine1: 'Pracha Uthit Road', city: 'Bangkok', postalCode: '10310', country: 'Thailand' },
  ), false);
});

test('Colombian grid addresses score their premise number instead of the numbered street', () => {
  const score = scoreBuildingAddressCandidate(
    { addressLine1: 'Calle 82 #19A-05', city: 'Bogotá', region: 'Bogotá, Distrito Capital', postalCode: '110221', country: 'Colombia' },
    { houseNumber: '19A-05', road: 'Calle 82', city: 'Bogotá', postalCode: '110221', country: 'Colombia' },
    { pinIntersects: true, distanceMeters: 0 },
  );
  assert.equal(score.houseNumberMatch, true);
  assert.ok(score.streetSimilarity >= 0.99);
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

test('explicit locality contradictions cannot pass with two other locality matches', () => {
  const decision = evaluateBuildingVerification([candidate({ address: { ...candidate().address, country: 'Canada' } })], {
    listingAddress: { addressLine1: '1319 Cypress Creek Parkway', city: 'Houston', region: 'Texas', postalCode: '77090', country: 'United States' },
  });
  assert.equal(decision.autoAccept, false);
  assert.equal(decision.outcome, 'address_mismatch');
});

test('localized country labels match through Nominatim country codes', () => {
  const score = scoreBuildingAddressCandidate(
    { addressLine1: '75 Allenby Street', city: 'Tel Aviv', region: 'Tel Aviv District', country: 'Israel' },
    { houseNumber: '75', road: 'Allenby Street', city: 'תל־אביב–יפו', country: 'ישראל', countryCode: 'IL' },
  );
  assert.equal(score.countryMatch, true);
});

test('city label differences are contextual when postal code and country agree', () => {
  const decision = evaluateBuildingVerification([candidate({
    address: { houseNumber: '1319', road: 'Cypress Creek Parkway', city: 'North Houston District', postalCode: '77090', country: 'United States', countryCode: 'US' },
  })], {
    listingAddress: { addressLine1: '1319 Cypress Creek Parkway', city: 'Houston', region: 'Texas', postalCode: '77090', country: 'United States' },
  });
  assert.equal(decision.autoAccept, true);
  assert.equal(decision.outcome, 'verified');
});

test('authoritative unique pin can verify when reverse geocoder only returns a nearby object', () => {
  const decision = evaluateBuildingVerification([candidate({
    address: { houseNumber: '184', road: 'Rua Visconde de Caravelas', city: 'Rio de Janeiro', postalCode: '22271-060', country: 'Brasil', countryCode: 'BR' },
    addressScope: 'nearby_object',
  })], {
    listingAddress: { addressLine1: 'Rua Visconde de Caravelas, 176', city: 'Rio de Janeiro', region: 'RJ', postalCode: '22271-041', country: 'Brazil' },
    locationConfidence: 0.99,
    geocoderSource: 'official-site+google-maps',
    manuallyAdjusted: true,
  });
  assert.equal(decision.autoAccept, true);
  assert.equal(decision.autoAcceptMethod, 'authoritative_unique_pin');
  assert.equal(decision.outcome, 'verified');
});

test('legacy location source provenance participates in the headless authoritative-pin route', async () => {
  const base = listings.find((item) => item.id === 'club-2a2-rio-de-janeiro')!;
  const listing = {
    ...base,
    locationMeta: { ...base.locationMeta!, geocoderSource: undefined, source: 'official-site+google-maps', confidence: 0.99, manualAdjustment: false },
  } as Listing;
  const center = getListingPhysicalCoords(listing, { listings: [listing] })!;
  const geometry = square(center.lng - 0.00002, center.lat - 0.00002, 0.00004);
  const result = await runBuildingVerificationPipeline({
    listing,
    collections: { listings: [listing], venues: [] },
    source: { async load() { return { features: [{ id: 'trusted-pin', geometry, source: 'test' }], source: 'test', complete: true, warnings: [] }; } },
    addresses: { async resolve() { return null; }, async resolveDetailed() { return { status: 'no_address', address: null }; } },
  });
  assert.equal(result.decision?.autoAccept, true);
  assert.equal(result.decision?.autoAcceptMethod, 'authoritative_unique_pin');
});

test('authoritative unique-pin verification does not depend on reverse-geocoder availability', async () => {
  const base = listings.find((item) => item.id === 'club-2a2-rio-de-janeiro')!;
  const listing = {
    ...base,
    locationMeta: { ...base.locationMeta!, geocoderSource: 'google-maps', confidence: 0.99, manualAdjustment: false },
  } as Listing;
  const center = getListingPhysicalCoords(listing, { listings: [listing] })!;
  const primary = square(center.lng - 0.00002, center.lat - 0.00002, 0.00004);
  const distant = square(center.lng + 0.0005, center.lat + 0.0005, 0.00004);
  const result = await runBuildingVerificationPipeline({
    listing,
    collections: { listings: [listing], venues: [] },
    source: { async load() { return { features: [{ id: 'trusted-pin', geometry: primary, source: 'test' }, { id: 'other', geometry: distant, source: 'test' }], source: 'test', complete: true, warnings: [] }; } },
    addresses: {
      async resolve() { return null; },
      async resolveDetailed() { return { status: 'provider_error', address: null, errorCode: 'unavailable', retryable: true }; },
    },
  });
  assert.equal(result.decision?.autoAccept, true);
  assert.equal(result.decision?.autoAcceptMethod, 'authoritative_unique_pin');
  assert.ok(result.reasons.some((reason) => /address provider failures/.test(reason)));
});

test('an unaddressed overlapping footprint still blocks a unique-pin claim', () => {
  const decision = evaluateBuildingVerification([candidate(), candidate({ fingerprint: 'overlap', address: null })], {
    listingAddress: { addressLine1: '1319 Cypress Creek Parkway', city: 'Houston', region: 'Texas', postalCode: '77090', country: 'United States' },
    locationConfidence: 1, manuallyAdjusted: true,
  });
  assert.equal(decision.outcome, 'ambiguous');
  assert.equal(decision.autoAccept, false);
});

test('a persisted Venue retaining a legacy identifier owns its canonical pin', () => {
  const club = listings.find((item) => item.id === 'club-twist-sf')!;
  const venue: VenueData = { id: `venue-${club.id}`, type: 'venue', name: club.name, slug: 'test', address: club.geopoint.address, latitude: 40, longitude: -70, visibility: 'public_exact', status: 'approved', amenities: [] };
  assert.deepEqual(getListingPhysicalCoords(club, { venues: [venue], listings }), { lat: 40, lng: -70 });
});

test('legacy events inherit the current owner club coordinate instead of stale bundled Venue geography', () => {
  const club = listings.find((item) => item.id === 'club-twist-sf')!;
  const event = listings.find((item) => item.id === 'event-her-fantasy-back-to-school-twist-2026-08-16')!;
  assert.deepEqual(getListingPhysicalCoords(event, { listings }), getListingPhysicalCoords(club, { listings }));
});

test('a nearest-object reverse address is neither definitive evidence nor a footprint conflict', () => {
  const result = evaluateBuildingVerification([candidate({ addressScope: 'nearby_object' })], {
    listingAddress: { addressLine1: '1319 Cypress Creek Parkway', city: 'Houston', region: 'Texas', postalCode: '77090', country: 'United States' },
  });
  assert.equal(result.autoAccept, false);
  assert.equal(result.outcome, 'needs_location_review');
  assert.match(result.reasons[0], /nearby object/);
});

test('rejected address lookups are evicted so retries can recover', async () => {
  let calls = 0;
  const resolver = createCachedBuildingAddressResolver({
    async resolve() { return null; },
    async resolveDetailed() { calls++; if (calls === 1) throw new Error('connection lost'); return { status: 'no_address', address: null }; },
  });
  await assert.rejects(resolver.resolveDetailed(1, 2));
  assert.equal((await resolver.resolveDetailed(1, 2)).status, 'no_address');
  assert.equal(calls, 2);
});

test('private and hidden locations cause zero pipeline provider calls and redacted reports', async () => {
  const base = listings.find((item) => item.type === 'club')!;
  const listing = { ...base, locationVisibility: 'approximate_public' } as Listing;
  const fail = async (): Promise<never> => { throw new Error('must never request private coordinates'); };
  const result = await runBuildingVerificationPipeline({ listing, collections: { listings: [listing], venues: [] }, source: { load: fail }, addresses: { resolve: fail, resolveDetailed: fail } });
  assert.equal(result.status, 'skipped');
  const report = buildBuildingCatalogShadowReport([listing], assets, { venues: [] });
  assert.equal(report.entries[0].coordinate, null);
  assert.equal(report.entries[0].evidence, null);
  assert.deepEqual(report.entries[0].providerFeatureIds, []);
});

test('pipeline deadlines terminate non-cooperative providers explicitly', async () => {
  const listing = listings.find((item) => item.id === 'club-twist-sf')!;
  const addresses: BuildingAddressResolver = { async resolve() { return null; }, async resolveDetailed() { return { status: 'no_address', address: null }; } };
  const result = await runBuildingVerificationPipeline({ listing, collections: { listings, venues: [] }, source: { load: () => new Promise(() => {}) }, addresses, timeoutMs: 10 });
  assert.equal(result.status, 'provider_failure');
  assert.match(result.reasons[0], /deadline/i);
});

test('address normalization preserves international scripts', () => {
  assert.notEqual(normalizeAddressText('улица Ленина'), normalizeAddressText('улица Мира'));
  assert.notEqual(normalizeAddressText('東京都'), '');
});

test('linear geometry canonicalization preserves legacy saved-asset fingerprints', () => {
  const expected: Record<string, string> = {
    'club-club-joi-la': 'footprint-v2-i4n7qr-1-4',
    'club-dalliance-columbia': 'footprint-v2-5gjemj-1-14',
    'club-coliseum-mexico-city': 'footprint-v2-foyw0y-1-4',
    'club-twist-sf': 'footprint-v2-esslg2-2-11',
    'club-colette-houston': 'footprint-v2-1jovkwk-1-33',
  };
  for (const [id, fingerprint] of Object.entries(expected)) {
    assert.equal(geometryFingerprint(assets.find((asset) => asset.listingId === id)!.geometry), fingerprint);
  }
});

test('BuildingAsset persistence rejects stale location and asset revisions', () => {
  const listing = listings.find((item) => item.id === 'club-twist-sf')!;
  const asset = assets.find((item) => item.listingId === 'club-twist-sf')!;
  const snapshot = createBuildingVerificationInputSnapshot(listing, { listings });
  const revision = createBuildingAssetRevision(asset);
  assert.ok(snapshot);
  assert.ok(revision);

  const valid = guardBuildingAssetPersistence({
    listing,
    collections: { listings },
    asset,
    expectedSnapshot: snapshot,
    existingAsset: asset,
    expectedExistingAsset: revision,
    mode: 'manual',
    allowReplaceExisting: true,
  });
  assert.equal(valid.ok, true, valid.reasons.join('; '));

  const movedListing = {
    ...listing,
    geopoint: { ...listing.geopoint, latitude: listing.geopoint.latitude + 0.001 },
  } as Listing;
  const staleLocation = guardBuildingAssetPersistence({
    listing: movedListing,
    collections: { listings: listings.map((item) => item.id === listing.id ? movedListing : item) },
    asset,
    expectedSnapshot: snapshot,
    existingAsset: asset,
    expectedExistingAsset: revision,
    mode: 'manual',
    allowReplaceExisting: true,
  });
  assert.equal(staleLocation.ok, false);
  assert.ok(staleLocation.reasons.some((reason) => reason.includes('location changed')));

  const newerAsset: BuildingAsset = {
    ...asset,
    capture: { ...asset.capture, updatedAt: new Date(Date.parse(asset.capture.updatedAt) + 1000).toISOString() },
  };
  const staleAsset = guardBuildingAssetPersistence({
    listing,
    collections: { listings },
    asset,
    expectedSnapshot: snapshot,
    existingAsset: newerAsset,
    expectedExistingAsset: revision,
    mode: 'manual',
    allowReplaceExisting: true,
  });
  assert.equal(staleAsset.ok, false);
  assert.ok(staleAsset.reasons.some((reason) => reason.includes('BuildingAsset changed')));
});

test('current snapshot hash prevents verbose display-address evidence from blocking a manual save', () => {
  const listing = listings.find((item) => item.id === 'club-lussuria-bangkok')!;
  const snapshot = createBuildingVerificationInputSnapshot(listing, { listings })!;
  const geometry = square(snapshot.longitude - 0.00002, snapshot.latitude - 0.00002, 0.00004);
  const asset: BuildingAsset = {
    id: 'building-asset-club-lussuria-bangkok-test',
    listingId: listing.id,
    version: 1,
    provider: { source: 'Microsoft Global ML Building Footprints', featureIds: ['microsoft-ml:test'] },
    geometry,
    renderHeightMeters: 6,
    renderMinHeightMeters: 0,
    capture: {
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
      polygonCount: 1,
      ringCount: 1,
      vertexCount: 5,
    },
  };
  const evidence: BuildingVerificationEvidenceRecord = {
    version: 1,
    listingId: listing.id,
    venueId: null,
    inputSnapshotHash: snapshot.hash,
    listingName: listing.name,
    normalizedAddress: normalizeAddressText('785/5 Pracha Uthit Road, Samsen Nok, Huai Khwang, Bangkok 10310, Thailand'),
    canonicalCoordinate: { lat: snapshot.latitude, lng: snapshot.longitude },
    coordinateProvenance: snapshot.coordinateProvenance,
    coordinateConfidence: snapshot.coordinateConfidence,
    evaluatedAt: '2026-09-06T00:00:00.000Z',
    providerSnapshot: {
      source: 'Hybrid · OSM + Microsoft',
      status: 'completed',
      searchRadiusMeters: 250,
      tileFeatureCount: 10,
      individualFootprintCount: 10,
    },
    outcome: 'needs_location_review',
    autoAccept: false,
    autoAcceptMethod: null,
    bestCandidate: null,
    runnerUp: null,
    scoreMargin: null,
    acceptanceReasons: [],
    rejectionReasons: ['manual review required'],
  };
  assert.notEqual(evidence.normalizedAddress, snapshot.normalizedAddress, 'fixture must reproduce the district/suburb display-address mismatch');
  const result = guardBuildingAssetPersistence({
    listing,
    collections: { listings },
    asset,
    expectedSnapshot: snapshot,
    evidence,
    existingAsset: null,
    expectedExistingAsset: null,
    mode: 'manual',
  });
  assert.equal(result.ok, true, result.reasons.join('; '));
});

test('automatic persistence cannot replace authored assets or precise private locations', () => {
  const listing = listings.find((item) => item.id === 'club-twist-sf')!;
  const asset = assets.find((item) => item.listingId === 'club-twist-sf')!;
  const snapshot = createBuildingVerificationInputSnapshot(listing, { listings })!;
  const revision = createBuildingAssetRevision(asset)!;
  const blockedExisting = guardBuildingAssetPersistence({
    listing,
    collections: { listings },
    asset,
    expectedSnapshot: snapshot,
    existingAsset: asset,
    expectedExistingAsset: revision,
    mode: 'automatic',
  });
  assert.equal(blockedExisting.ok, false);
  assert.ok(blockedExisting.reasons.some((reason) => reason.includes('cannot replace')));

  const privateListing = {
    ...listing,
    id: 'private-location-test',
    locationVisibility: 'approximate_public',
  } as Listing;
  const privateSnapshot = createBuildingVerificationInputSnapshot(privateListing, { listings: [privateListing] })!;
  const blockedPrivate = guardBuildingAssetPersistence({
    listing: privateListing,
    collections: { listings: [privateListing] },
    asset: { ...asset, id: 'private-asset', listingId: privateListing.id },
    expectedSnapshot: privateSnapshot,
    existingAsset: null,
    expectedExistingAsset: null,
    mode: 'manual',
  });
  assert.equal(blockedPrivate.ok, false);
  assert.ok(blockedPrivate.reasons.some((reason) => reason.includes('private or approximate')));
});

test('shared neighborhood fusion supplements missing coverage deterministically', async () => {
  const center = { lng: 151.16448, lat: -33.88791 };
  const primary = [{ id: 'primary-away', geometry: square(center.lng + 0.002, center.lat + 0.002), source: 'OpenFreeMap' }];
  let supplementCalls = 0;
  const result = await fuseBuildingNeighborhood({
    mode: 'auto',
    listingId: 'fusion-test',
    country: 'Australia',
    center,
    radiusMeters: 250,
    primaryFeatures: primary,
    loadSupplemental: async () => {
      supplementCalls += 1;
      return {
        provider: 'Microsoft Global ML Building Footprints',
        truncated: false,
        features: [{ id: 'microsoft-target', geometry: square(center.lng - 0.00003, center.lat - 0.00003, 0.00006), source: 'microsoft-global-ml-buildings' }],
      };
    },
  });
  assert.equal(supplementCalls, 1);
  assert.equal(result.complete, true);
  assert.equal(result.usedSupplemental, true);
  assert.match(result.sourceLabel, /Hybrid/);
  const workspace = extractIndividualBuildingFootprints(result.features, center, { radiusMeters: 250 });
  assert.ok(workspace.footprints.some((footprint) => footprint.pinIntersects));
});

test('generated footprint fallback requires an authoritative precise pin and never replaces sourced geometry', () => {
  const center = { lng: 4.650135, lat: 52.000233 };
  const candidate = createGeneratedBuildingCandidate({
    listingId: 'club-fun4two-moordrecht',
    center,
    primaryFeatures: [{ id: 'nearby', geometry: square(center.lng + 0.0002, center.lat + 0.0001), source: 'OpenFreeMap' }],
    locationConfidence: 0.99,
    geocoderSource: 'official-site+official-google-map',
    manuallyAdjusted: true,
  });
  assert.ok(candidate);
  assert.match(String(candidate?.feature.id), new RegExp(`^${GENERATED_BUILDING_ID_PREFIX}`));
  assert.equal(pointIntersectsBuildingGeometry(center, candidate!.feature.geometry as GeoJSON.Polygon), true);

  const weak = createGeneratedBuildingCandidate({
    listingId: 'weak-pin',
    center,
    primaryFeatures: [],
    locationConfidence: 0.86,
    geocoderSource: 'nominatim-road',
  });
  assert.equal(weak, null);

  const sourced = createGeneratedBuildingCandidate({
    listingId: 'already-covered',
    center,
    primaryFeatures: [{ id: 'target', geometry: square(center.lng - 0.00003, center.lat - 0.00003, 0.00006), source: 'OpenFreeMap' }],
    locationConfidence: 0.99,
    geocoderSource: 'google-maps',
  });
  assert.equal(sourced, null);
});

test('dense 16000-vertex footprints retain rotation invariant identity', () => {
  const ring = Array.from({ length: 16_000 }, (_, index) => {
    const angle = index * Math.PI * 2 / 16_000;
    return [20 + Math.cos(angle) * 0.01, 40 + Math.sin(angle) * 0.01];
  });
  const shifted = [...ring.slice(7000), ...ring.slice(0, 7000)];
  assert.equal(geometryFingerprint({ type: 'Polygon', coordinates: [[...ring, ring[0]]] }), geometryFingerprint({ type: 'Polygon', coordinates: [[...shifted, shifted[0]]] }));
});
