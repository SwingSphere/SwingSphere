import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCanonicalMediaCatalog,
  evaluateAssetRoleQuality,
  applyAssetAssignmentToListing,
  removeEventLogoOverrideFromListing,
  previewDuplicateConsolidation,
  validateExternalImageUrl,
  computeFileSha256Hex,
} from '../lib/media/canonicalAssetModel';
import {
  getCanonicalMediaSignature,
  resolveEventLogoState,
  resolveBrandLogo,
  resolveBrandHeader,
  type BrandMediaCatalog,
} from '../lib/entityBrandMedia';
import {
  getEventCardImageUrl,
  getListingCardImageUrl,
  getListingLogoUrl,
  getListingFlyerUrl,
  LISTING_IMAGE_FALLBACK,
} from '../lib/listingImage';
import { mockOrganizations } from '../data/mockOrganizations';
import { mockVenues } from '../data/mockVenues';
import { mockOrganizationVenueRelationships } from '../data/mockEntityRelationships';
import type { ClubData, EventData, EventSeriesData } from '../types';

const mockIlluminaughtySeries: EventSeriesData = {
  id: 'series-illuminaughty-signature',
  type: 'event_series',
  name: 'Illuminaughty Signature Events',
  slug: 'illuminaughty-signature',
  organizerOrganizationId: 'org-promoter-illuminaughty',
  logoImageUrl: 'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/ae6636d9-f865-4baa-6256-794aa12f8b00/logosquare',
  status: 'approved',
};

const createMockEvent = (overrides: Partial<EventData> = {}): EventData => ({
  id: 'event-illuminaughty-test-1',
  type: 'event',
  name: 'Illuminaughty: Winter Masquerade',
  hostName: 'Illuminaughty',
  organizerOrganizationId: 'org-promoter-illuminaughty',
  eventSeriesId: 'series-illuminaughty-signature',
  description_full: 'Signature winter masquerade event.',
  location: 'Las Vegas, NV',
  contactEmail: 'vip@illuminaughty.com',
  time: {
    start: '2026-12-12T21:00:00Z',
    end: '2026-12-13T03:00:00Z',
  },
  geopoint: {
    latitude: 36.1147,
    longitude: -115.1728,
    address: {
      city: 'Las Vegas',
      region: 'NV',
      country: 'USA',
    },
  },
  tags: ['Masquerade', 'Upscale'],
  status: 'approved',
  postedByUserId: 'admin-1',
  ...overrides,
});

const createMockClub = (overrides: Partial<ClubData> = {}): ClubData => ({
  id: 'club-test-1',
  type: 'club',
  name: 'Sanctuary Club',
  description_short: 'Premier private social club.',
  location: 'Miami, FL',
  schedule: [],
  generalAmenities: [],
  geopoint: {
    latitude: 25.7617,
    longitude: -80.1918,
    address: {
      city: 'Miami',
      region: 'FL',
      country: 'USA',
    },
  },
  status: 'approved',
  postedByUserId: 'admin-1',
  ...overrides,
});

test('1. Canonical asset catalog: Illuminaughty host logo is shared across host + child events', async () => {
  const listingsModule = await import('../data/listings.local.json');
  const listings = (listingsModule.default || listingsModule) as (ClubData | EventData)[];

  const catalog = buildCanonicalMediaCatalog({
    listings,
    organizations: mockOrganizations,
    venues: mockVenues,
    relationships: mockOrganizationVenueRelationships,
    eventSeries: [mockIlluminaughtySeries],
  });
  assert.ok(catalog.assets.length > 0, 'Catalog should contain canonical assets');

  // Find the Illuminaughty official logo canonical asset
  const illuminaughtyOrg = mockOrganizations.find((o) => o.id === 'org-promoter-illuminaughty');
  assert.ok(illuminaughtyOrg?.logoImageUrl, 'Illuminaughty org should have a canonical logoImageUrl');

  const sig = getCanonicalMediaSignature(illuminaughtyOrg.logoImageUrl);
  const canonicalLogo = catalog.assets.find((a) => a.canonicalId === sig);
  assert.ok(canonicalLogo, 'Illuminaughty logo should exist as a single canonical asset in the catalog');
  assert.equal(canonicalLogo.primaryCategory, 'logo');

  // It should show explicit ownership by the host/series and inherited usage by child Illuminaughty events
  const hasHostExplicit = canonicalLogo.usages.some(
    (u) =>
      u.assignmentKind === 'explicit'
      && u.entityType === 'organization'
      && u.entityId === 'org-promoter-illuminaughty',
  );
  assert.ok(hasHostExplicit, 'Canonical logo should record explicit assignment to Illuminaughty (Host)');
  assert.ok(
    canonicalLogo.inheritedReferenceCount > 0,
    'Canonical logo should record inherited usage across Illuminaughty child events',
  );
  assert.ok(
    canonicalLogo.redundantCopyCount > 0,
    'Canonical logo should identify legacy redundant event occurrence copies',
  );
});

test('2. Host-logo inheritance & precedence: Explicit event override → Parent host asset → Fallback', () => {
  const illuminaughtyOrg = mockOrganizations.find((o) => o.id === 'org-promoter-illuminaughty')!;

  const baseCatalog: BrandMediaCatalog = {
    listings: [],
    organizations: mockOrganizations,
    eventSeries: [mockIlluminaughtySeries],
  };

  // Case A: Event with no direct logo inherits parent host logo
  const inheritedEvent = createMockEvent({
    logoImageUrl: undefined,
    mediaAssets: [],
  });
  const inheritedState = resolveEventLogoState(inheritedEvent, {
    ...baseCatalog,
    listings: [inheritedEvent],
  });
  assert.equal(inheritedState.mode, 'inherited_host');
  assert.equal(inheritedState.hasRedundantOccurrenceCopy, false);
  assert.equal(
    getCanonicalMediaSignature(inheritedState.resolvedLogo.url),
    getCanonicalMediaSignature(illuminaughtyOrg.logoImageUrl),
  );

  // Case B: Event with redundant occurrence copy of the same Cloudflare asset is recognized as inherited_host
  const redundantCopyEvent = createMockEvent({
    logoImageUrl: illuminaughtyOrg.logoImageUrl,
    mediaAssets: [
      {
        id: 'dup-logo-record',
        owner_type: 'event',
        owner_id: 'event-illuminaughty-test-1',
        role: 'logo',
        storage_provider: 'cloudflare_images',
        external_id: 'ae6636d9-f865-4baa-6256-794aa12f8b00',
        status: 'approved',
      },
    ],
  });
  const redundantState = resolveEventLogoState(redundantCopyEvent, {
    ...baseCatalog,
    listings: [redundantCopyEvent],
  });
  assert.equal(redundantState.mode, 'inherited_host');
  assert.equal(redundantState.hasRedundantOccurrenceCopy, true);
  assert.equal(redundantState.resolvedLogo.inherited, true);

  // Case C: Event with distinct explicit override logo takes precedence over parent host logo
  const customOverrideUrl =
    'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/custom-halloween-logo-uuid/logosquare';
  const overriddenEvent = createMockEvent({
    logoOverride: true,
    logoImageUrl: customOverrideUrl,
    mediaAssets: [
      {
        id: 'override-logo-record',
        owner_type: 'event',
        owner_id: 'event-illuminaughty-test-1',
        role: 'logo',
        storage_provider: 'cloudflare_images',
        external_id: 'custom-halloween-logo-uuid',
        status: 'approved',
      },
    ],
  });
  const overrideCatalog: BrandMediaCatalog = {
    ...baseCatalog,
    listings: [overriddenEvent],
  };
  const overrideState = resolveEventLogoState(overriddenEvent, overrideCatalog);
  assert.equal(overrideState.mode, 'explicit_override');
  assert.equal(
    getCanonicalMediaSignature(overrideState.resolvedLogo.url),
    getCanonicalMediaSignature(customOverrideUrl),
  );
  assert.equal(
    getCanonicalMediaSignature(getListingLogoUrl(overriddenEvent)),
    getCanonicalMediaSignature(customOverrideUrl),
  );

  const brandLogo = resolveBrandLogo('event', overriddenEvent.id, overrideCatalog);
  assert.equal(
    getCanonicalMediaSignature(brandLogo.url),
    getCanonicalMediaSignature(customOverrideUrl),
  );
  assert.equal(brandLogo.inherited, false);

  // Case D: Orphan event with neither override nor parent host falls back cleanly
  const orphanEvent = createMockEvent({
    id: 'orphan-event-999',
    hostName: 'Unknown Independent Host',
    organizerOrganizationId: undefined,
    eventSeriesId: undefined,
    venueClubId: undefined,
    logoImageUrl: undefined,
    mediaAssets: [],
  });
  const fallbackState = resolveEventLogoState(orphanEvent, {
    listings: [orphanEvent],
    organizations: [],
  });
  assert.equal(fallbackState.mode, 'fallback');
  assert.equal(getListingLogoUrl(orphanEvent), LISTING_IMAGE_FALLBACK);
});

test('3. Removing explicit event logo override restores parent host inheritance without touching flyer/hero', () => {
  const illuminaughtyOrg = mockOrganizations.find((o) => o.id === 'org-promoter-illuminaughty')!;
  const eventWithOverride = createMockEvent({
    logoOverride: true,
    logoImageUrl: 'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/custom-override-logo/logosquare',
    flyerImageUrl: 'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/event-flyer-uuid/flyercard',
    headerImageUrl: 'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/event-hero-uuid/herowide',
    mediaAssets: [
      {
        id: 'asset-logo',
        owner_type: 'event',
        owner_id: 'event-illuminaughty-test-1',
        role: 'logo',
        storage_provider: 'cloudflare_images',
        external_id: 'custom-override-logo',
        status: 'approved',
      },
      {
        id: 'asset-flyer',
        owner_type: 'event',
        owner_id: 'event-illuminaughty-test-1',
        role: 'flyer',
        storage_provider: 'cloudflare_images',
        external_id: 'event-flyer-uuid',
        status: 'approved',
      },
      {
        id: 'asset-hero',
        owner_type: 'event',
        owner_id: 'event-illuminaughty-test-1',
        role: 'hero',
        storage_provider: 'cloudflare_images',
        external_id: 'event-hero-uuid',
        status: 'approved',
      },
    ],
  });

  const restoredEvent = removeEventLogoOverrideFromListing(eventWithOverride);
  assert.equal(restoredEvent.logoOverride, false);
  assert.equal(restoredEvent.logoImageUrl, undefined);

  // Verify host logo inheritance resumes
  const stateAfterRemoval = resolveEventLogoState(restoredEvent, {
    listings: [restoredEvent],
    organizations: mockOrganizations,
    eventSeries: [mockIlluminaughtySeries],
  });
  assert.equal(stateAfterRemoval.mode, 'inherited_host');
  assert.equal(
    getCanonicalMediaSignature(stateAfterRemoval.resolvedLogo.url),
    getCanonicalMediaSignature(illuminaughtyOrg.logoImageUrl),
  );

  // Verify event flyer and hero were preserved untouched
  assert.ok(getEventCardImageUrl(restoredEvent).includes('event-flyer-uuid'));
  assert.ok(restoredEvent.headerImageUrl?.includes('event-hero-uuid'));
});

test('4. Host logo is never substituted for an event flyer on directory cards', () => {
  const illuminaughtyOrg = mockOrganizations.find((o) => o.id === 'org-promoter-illuminaughty')!;
  const eventWithoutFlyerOrHero = createMockEvent({
    logoImageUrl: undefined,
    headerImageUrl: undefined,
    flyerImageUrl: undefined,
    mediaAssets: [],
  });

  // Event inherits Illuminaughty's host logo for its host badge:
  const state = resolveEventLogoState(eventWithoutFlyerOrHero, {
    listings: [eventWithoutFlyerOrHero],
    organizations: mockOrganizations,
  });
  assert.equal(
    getCanonicalMediaSignature(state.resolvedLogo.url),
    getCanonicalMediaSignature(illuminaughtyOrg.logoImageUrl),
  );

  // Its directory card / flyer image MUST use the intentional card fallback, NEVER the host logo
  const cardImageUrl = getEventCardImageUrl(eventWithoutFlyerOrHero);
  const flyerUrl = getListingFlyerUrl(eventWithoutFlyerOrHero);
  assert.equal(cardImageUrl, LISTING_IMAGE_FALLBACK);
  assert.equal(flyerUrl, LISTING_IMAGE_FALLBACK);
  assert.notEqual(cardImageUrl, state.resolvedLogo.url);
});

test('5. resolveBrandLogo never returns a wide header banner as a logo', () => {
  const clubWithHeaderOnly = createMockClub({
    logoImageUrl: undefined,
    headerImageUrl: 'https://images.example.com/clubs/wide-hero-banner.jpg',
    mediaAssets: [],
  });
  const catalog: BrandMediaCatalog = {
    listings: [clubWithHeaderOnly],
  };

  const resolvedLogo = resolveBrandLogo('club', clubWithHeaderOnly.id, catalog);
  assert.equal(resolvedLogo.url, undefined, 'resolveBrandLogo must not return a wide header when logo is missing');

  const resolvedHeader = resolveBrandHeader('club', clubWithHeaderOnly.id, catalog);
  assert.equal(resolvedHeader.url, 'https://images.example.com/clubs/wide-hero-banner.jpg');
});

test('6. Assigning an existing canonical asset to a listing updates target role cleanly without clobbering other creative assets', () => {
  const baseEvent = createMockEvent({
    headerImageUrl: 'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/existing-hero-uuid/herowide',
    flyerImageUrl: 'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/existing-flyer-uuid/flyercard',
    mediaAssets: [
      {
        id: 'existing-hero',
        owner_type: 'event',
        owner_id: 'event-illuminaughty-test-1',
        role: 'hero',
        storage_provider: 'cloudflare_images',
        external_id: 'existing-hero-uuid',
        status: 'approved',
      },
      {
        id: 'existing-flyer',
        owner_type: 'event',
        owner_id: 'event-illuminaughty-test-1',
        role: 'flyer',
        storage_provider: 'cloudflare_images',
        external_id: 'existing-flyer-uuid',
        status: 'approved',
      },
    ],
  });

  // Assign new flyer from library
  const updatedEvent = applyAssetAssignmentToListing(
    baseEvent,
    {
      externalId: 'new-shared-flyer-uuid',
      originalPreviewUrl: 'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/new-shared-flyer-uuid/flyernatural',
      title: 'Winter Masquerade Official Flyer',
    },
    'flyer',
  );

  // Flyer should now resolve to the newly assigned canonical asset
  assert.ok(getEventCardImageUrl(updatedEvent).includes('new-shared-flyer-uuid'));
  assert.ok(getListingCardImageUrl(updatedEvent).includes('new-shared-flyer-uuid'));

  // Existing hero must remain untouched
  const heroAsset = updatedEvent.mediaAssets?.find((a) => a.role === 'hero');
  assert.equal(heroAsset?.external_id, 'existing-hero-uuid');
});

test('7. Duplicate detection & non-destructive consolidation preview', async () => {
  const listingsModule = await import('../data/listings.local.json');
  const listings = (listingsModule.default || listingsModule) as (ClubData | EventData)[];

  const catalog = buildCanonicalMediaCatalog({
    listings,
    organizations: mockOrganizations,
    venues: mockVenues,
    relationships: mockOrganizationVenueRelationships,
    eventSeries: [mockIlluminaughtySeries],
  });
  assert.ok(catalog.duplicateGroups.length > 0, 'Should detect duplicate/reuse groups in dataset');

  // Verify duplicate_db_records group exists for Illuminaughty / Her Fantasy Party occurrence copies
  const dbDupGroup = catalog.duplicateGroups.find((g) => g.kind === 'duplicate_db_records');
  assert.ok(dbDupGroup, 'Should identify redundant database records pointing to the same canonical asset');
  assert.ok(dbDupGroup.recommendedCanonicalId);

  const preview = previewDuplicateConsolidation(dbDupGroup, dbDupGroup.recommendedCanonicalId);

  assert.ok(preview.affectedEntities.length > 0, 'Preview must list affected entities before confirming a merge');
  assert.ok(
    preview.warnings.some((w) => w.includes('NOT be deleted automatically')),
    'Consolidation preview must confirm underlying storage files are never deleted automatically',
  );
});

test('8. Image role & aspect-ratio quality checks: horizontal flyers are never flagged as errors', () => {
  // Horizontal event flyer (16:9 landscape flyer) -> must be ok (never flagged as error or warning)
  const horizontalFlyerCheck = evaluateAssetRoleQuality({
    roles: ['flyer'],
    width: 1920,
    height: 1080,
    isValidUrl: true,
  });
  assert.equal(horizontalFlyerCheck.overallLevel, 'ok');
  assert.equal(horizontalFlyerCheck.aspectRatioLabel, '16:9');

  // Portrait event flyer (4:5 portrait flyer) -> ok
  const portraitFlyerCheck = evaluateAssetRoleQuality({
    roles: ['flyer'],
    width: 1080,
    height: 1350,
    isValidUrl: true,
  });
  assert.equal(portraitFlyerCheck.overallLevel, 'ok');
  assert.equal(portraitFlyerCheck.aspectRatioLabel, '4:5');

  // Tall portrait image assigned as a wide Hero banner -> warning (not hard error)
  const portraitHeroCheck = evaluateAssetRoleQuality({
    roles: ['hero'],
    width: 800,
    height: 1200,
    isValidUrl: true,
  });
  assert.equal(portraitHeroCheck.overallLevel, 'warning');
  assert.ok(portraitHeroCheck.checks.some((c) => c.code === 'hero_non_landscape'));

  // Extreme banner assigned as square Logo -> warning
  const wideLogoCheck = evaluateAssetRoleQuality({
    roles: ['logo'],
    width: 1600,
    height: 400,
    isValidUrl: true,
  });
  assert.equal(wideLogoCheck.overallLevel, 'warning');
  assert.ok(wideLogoCheck.checks.some((c) => c.code === 'logo_non_square'));
});

test('9. External URL validation & SHA-256 content hashing', async () => {
  assert.equal(validateExternalImageUrl('https://images.example.com/club/hero.webp').valid, true);
  assert.equal(validateExternalImageUrl('javascript:alert(1)').valid, false);
  assert.equal(validateExternalImageUrl('http://localhost:3000/secret.png').valid, false);
  assert.equal(validateExternalImageUrl('   ').valid, false);

  const bytesA = new TextEncoder().encode('identical-image-payload-bytes');
  const bytesB = new TextEncoder().encode('identical-image-payload-bytes');
  const bytesC = new TextEncoder().encode('different-image-payload-bytes');

  const hashA = await computeFileSha256Hex(bytesA.buffer);
  const hashB = await computeFileSha256Hex(bytesB.buffer);
  const hashC = await computeFileSha256Hex(bytesC.buffer);

  assert.equal(hashA.length, 64);
  assert.equal(hashA, hashB, 'Identical bytes must produce identical SHA-256 hashes');
  assert.notEqual(hashA, hashC, 'Different bytes must produce distinct SHA-256 hashes');
});
