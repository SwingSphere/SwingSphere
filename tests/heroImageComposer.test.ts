import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDragDeltaToFraming,
  buildHeroCssVariables,
  computeCenterFraming,
  computeFillFraming,
  computeFitFraming,
  computeHeroVisibleRect,
  DEFAULT_HERO_CROP,
  encodeHeroCropToUrl,
  evaluateHeroFramingWarnings,
  extractHeroCropFromUrl,
  formatAspectRatioLabel,
  HERO_VIEWPORT_RATIOS,
  normalizeHeroCrop,
  resolveEntityHeroCrop,
  resolveViewportFraming,
  stripHeroCropFromUrl,
  type HeroCropConfig,
} from '../lib/media/heroCrop.ts';
import {
  getHeroCloudflareImageUrl,
  normalizeHeroDeliveryUrl,
  selectHeroCloudflareVariant,
} from '../lib/media/getCloudflareImageUrl.ts';
import { getMediaOwnerId } from '../lib/media/getMediaOwnerId.ts';
import {
  getCanonicalMediaSignature,
  resolveBrandHeader,
  resolveBrandLogo,
  resolveUploadedMediaUrl,
} from '../lib/entityBrandMedia.ts';
import {
  getListingHeroPageUrl,
  getListingImageUrl,
  getListingPrimaryFlyerUrl,
  getListingPrimaryHeroUrl,
} from '../lib/listingImage.ts';
import type { ClubData, EventData, OrganizationData } from '../types.ts';
import type { MediaAsset } from '../lib/media/types.ts';

const assertClose = (actual: number, expected: number, epsilon = 0.005, message?: string) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    message ?? `Expected ${actual} to be within ${epsilon} of ${expected}`,
  );
};

test('WYSIWYG Hero Image Composer — computes accurate visible crop rects and aspect labels for 1:1, 4:5, 16:9, 20:9, and 21:9 source images across desktop, tablet, and mobile', () => {
  const sourceDimensions: Array<{ label: string; width: number; height: number; expectedRatioPrefix: string }> = [
    { label: '1:1 square', width: 1080, height: 1080, expectedRatioPrefix: '1:1' },
    { label: '4:5 portrait', width: 1080, height: 1350, expectedRatioPrefix: '4:5' },
    { label: '16:9 widescreen', width: 1920, height: 1080, expectedRatioPrefix: '16:9' },
    { label: '20:9 hero native', width: 2000, height: 900, expectedRatioPrefix: '20:9' },
    { label: '21:9 ultrawide', width: 2520, height: 1080, expectedRatioPrefix: '21:9' },
  ];

  const defaultFraming = computeFillFraming();

  for (const { label, width, height, expectedRatioPrefix } of sourceDimensions) {
    assert.ok(
      formatAspectRatioLabel(width, height).startsWith(expectedRatioPrefix),
      `Ratio label mismatch for ${label}: got ${formatAspectRatioLabel(width, height)}`,
    );

    for (const viewport of ['desktop', 'tablet', 'mobile'] as const) {
      const containerAspect = HERO_VIEWPORT_RATIOS[viewport].numeric;
      const rect = computeHeroVisibleRect({
        sourceAspect: width / height,
        containerAspect,
        framing: defaultFraming,
      });

      assert.ok(rect.visibleWidthFraction > 0 && rect.visibleWidthFraction <= 1, `${label} ${viewport} visibleWidthFraction`);
      assert.ok(rect.visibleHeightFraction > 0 && rect.visibleHeightFraction <= 1, `${label} ${viewport} visibleHeightFraction`);
      assert.ok(rect.visibleAreaPercent > 0 && rect.visibleAreaPercent <= 100, `${label} ${viewport} visibleAreaPercent`);
      assertClose(rect.xMax - rect.xMin, rect.visibleWidthFraction);
      assertClose(rect.yMax - rect.yMin, rect.visibleHeightFraction);
    }
  }
});

test('WYSIWYG Hero Image Composer — preserves 100% visible area for 20:9 source in 20:9 desktop hero and crops 16:9 symmetrically', () => {
  const nativeRect = computeHeroVisibleRect({
    sourceAspect: 2000 / 900,
    containerAspect: HERO_VIEWPORT_RATIOS.desktop.numeric,
    framing: computeFillFraming(),
  });
  assertClose(nativeRect.visibleWidthFraction, 1);
  assertClose(nativeRect.visibleHeightFraction, 1);
  assert.equal(nativeRect.visibleAreaPercent, 100);
  assertClose(nativeRect.yMin, 0);
  assertClose(nativeRect.yMax, 1);

  const widescreenRect = computeHeroVisibleRect({
    sourceAspect: 1920 / 1080,
    containerAspect: HERO_VIEWPORT_RATIOS.desktop.numeric,
    framing: computeCenterFraming(DEFAULT_HERO_CROP),
  });
  assertClose(widescreenRect.visibleWidthFraction, 1);
  assertClose(widescreenRect.visibleHeightFraction, (16 / 9) / (20 / 9)); // 0.8
  assertClose(widescreenRect.yMin, 0.1);
  assertClose(widescreenRect.yMax, 0.9);
  assert.equal(widescreenRect.visibleAreaPercent, 80);
});

test('WYSIWYG Hero Image Composer — supports vertical/horizontal focal panning, Fit, Fill, Center, and Reset', () => {
  const topFraming = { focalX: 50, focalY: 0, zoom: 1, fitMode: 'fill' as const };
  const bottomFraming = { focalX: 50, focalY: 100, zoom: 1, fitMode: 'fill' as const };
  const topRect = computeHeroVisibleRect({
    sourceAspect: 1080 / 1350,
    containerAspect: HERO_VIEWPORT_RATIOS.desktop.numeric,
    framing: topFraming,
  });
  const bottomRect = computeHeroVisibleRect({
    sourceAspect: 1080 / 1350,
    containerAspect: HERO_VIEWPORT_RATIOS.desktop.numeric,
    framing: bottomFraming,
  });

  assertClose(topRect.yMin, 0);
  assert.ok(topRect.yMax < 0.5);
  assertClose(bottomRect.yMax, 1);
  assert.ok(bottomRect.yMin > 0.5);

  const start = computeFillFraming();
  const dragged = applyDragDeltaToFraming({
    framing: start,
    deltaX: 120,
    deltaY: 60,
    containerWidth: 600,
    containerHeight: 270,
    sourceAspect: 1080 / 1350,
  });
  assert.ok(dragged.focalY < start.focalY, 'Dragging downward should move focalY toward the top of the image');

  const fit = computeFitFraming();
  assert.equal(fit.fitMode, 'fit');
  assert.equal(fit.zoom, 1);
  const fitRect = computeHeroVisibleRect({
    sourceAspect: 1080 / 1350,
    containerAspect: HERO_VIEWPORT_RATIOS.desktop.numeric,
    framing: fit,
  });
  assert.equal(fitRect.visibleAreaPercent, 100);

  const centered = computeCenterFraming(dragged);
  assert.equal(centered.focalX, 50);
  assert.equal(centered.focalY, 50);

  const reset = normalizeHeroCrop(DEFAULT_HERO_CROP);
  assert.equal(reset.focalX, 50);
  assert.equal(reset.focalY, 50);
  assert.equal(reset.zoom, 1);
  assert.equal(reset.fitMode, 'fill');
});

test('WYSIWYG Hero Image Composer — applies global framing across viewports and honors breakpoint-specific overrides via CSS variables', () => {
  const crop: HeroCropConfig = normalizeHeroCrop({
    focalX: 40,
    focalY: 35,
    zoom: 1.25,
    fitMode: 'fill',
    sourceWidth: 1920,
    sourceHeight: 1080,
    viewports: {
      mobile: {
        focalX: 65,
        focalY: 20,
        zoom: 1.5,
        fitMode: 'fill',
      },
    },
  });

  assertClose(resolveViewportFraming(crop, 'desktop').focalX, 40);
  assertClose(resolveViewportFraming(crop, 'desktop').focalY, 35);
  assertClose(resolveViewportFraming(crop, 'tablet').focalX, 40);
  assertClose(resolveViewportFraming(crop, 'tablet').focalY, 35);
  assertClose(resolveViewportFraming(crop, 'mobile').focalX, 65);
  assertClose(resolveViewportFraming(crop, 'mobile').focalY, 20);
  assertClose(resolveViewportFraming(crop, 'mobile').zoom, 1.5);

  const cssVars = buildHeroCssVariables(crop);
  assert.equal(cssVars['--ss-hero-desktop-pos'], '40% 35%');
  assert.equal(cssVars['--ss-hero-tablet-pos'], '40% 35%');
  assert.equal(cssVars['--ss-hero-mobile-pos'], '65% 20%');
  assert.equal(cssVars['--ss-hero-desktop-scale'], '1.25');
  assert.equal(cssVars['--ss-hero-mobile-scale'], '1.5');
});

test('WYSIWYG Hero Image Composer — surfaces intelligent framing warnings for low resolution, overlay collisions, and mobile edge cutoff', () => {
  const lowResWarnings = evaluateHeroFramingWarnings({
    crop: {
      focalX: 15,
      focalY: 85,
      zoom: 1,
      fitMode: 'fill',
    },
    sourceWidth: 800,
    sourceHeight: 450,
    activeViewport: 'desktop',
  });

  assert.ok(lowResWarnings.some((w) => w.id === 'low-source-resolution'));
  assert.ok(lowResWarnings.some((w) => w.id === 'bottom-title-overlay'));
  assert.ok(lowResWarnings.some((w) => w.id === 'mobile-edge-cutoff'));
});

test('WYSIWYG Hero Image Composer — round-trips HeroCropConfig through URL fragment, selects uncropped Cloudflare variant when needed, and deduplicates canonical signatures', () => {
  const baseUrl = 'https://imagedelivery.net/hash123/swingsphere-event-1-hero-999/flyerpage';
  const crop = normalizeHeroCrop({
    focalX: 42,
    focalY: 28,
    zoom: 1.35,
    fitMode: 'fill',
    sourceWidth: 1080,
    sourceHeight: 1350,
    viewports: {
      mobile: { focalX: 50, focalY: 20, zoom: 1.1, fitMode: 'fill' },
    },
  });

  const encodedUrl = encodeHeroCropToUrl(baseUrl, crop);
  assert.ok(encodedUrl.includes('#ss-crop='));
  assert.equal(stripHeroCropFromUrl(encodedUrl), baseUrl);

  const { cleanUrl, crop: extracted } = extractHeroCropFromUrl(encodedUrl);
  assert.equal(cleanUrl, baseUrl);
  assert.ok(extracted);
  assertClose(extracted.focalX, 42);
  assertClose(extracted.focalY, 28);
  assertClose(extracted.zoom, 1.35);
  assertClose(extracted.viewports?.mobile?.focalY ?? 0, 20);

  const resolved = resolveEntityHeroCrop({ headerImageUrl: encodedUrl, heroCrop: null });
  assertClose(resolved.focalX, 42);
  assertClose(resolved.focalY, 28);

  // Variant selection: non-16:9 or fit-mode crops use flyerpage (fit: contain)
  const portraitCrop = normalizeHeroCrop({ sourceWidth: 1080, sourceHeight: 1350 });
  assert.equal(selectHeroCloudflareVariant(portraitCrop), 'flyerpage');

  const widescreenCrop = normalizeHeroCrop({ sourceWidth: 1920, sourceHeight: 1080 });
  assert.equal(selectHeroCloudflareVariant(widescreenCrop), 'heropage');

  const fitWidescreenCrop = normalizeHeroCrop({ sourceWidth: 1920, sourceHeight: 1080, fitMode: 'fit' });
  assert.equal(selectHeroCloudflareVariant(fitWidescreenCrop), 'flyerpage');

  const cfUrl = getHeroCloudflareImageUrl('swingsphere-club-1-hero-100', portraitCrop);
  assert.ok(cfUrl?.includes('/flyerpage'));

  // Upgrading herocard to heropage/flyerpage while preserving crop fragment
  const upgraded = normalizeHeroDeliveryUrl(
    'https://imagedelivery.net/hash123/swingsphere-club-1-hero-100/herocard',
    portraitCrop,
  );
  assert.ok(upgraded.includes('/flyerpage#ss-crop='));

  // Canonical deduplication ignores #ss-crop=
  assert.equal(getCanonicalMediaSignature(baseUrl), 'cf:swingsphere-event-1-hero-999');
  assert.equal(getCanonicalMediaSignature(encodedUrl), 'cf:swingsphere-event-1-hero-999');
});

test('WYSIWYG Hero Image Composer — preserves media-owner UUID normalization and isolates club/promoter logos and event flyers from hero crop changes', () => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const ownerType of [
    'club',
    'event',
    'organization',
    'venue',
    'resort',
    'cruise_series',
    'cruise_sailing',
    'event_series',
    'club_brand',
  ] as const) {
    const normalized = getMediaOwnerId(ownerType, `${ownerType}-legacy-slug-01`);
    assert.match(normalized, uuidRegex);
  }

  const organization: OrganizationData = {
    id: 'org-1',
    name: 'Velvet Society',
    slug: 'velvet-society',
    displayTypes: ['promoter'],
    status: 'approved',
    logoImageUrl: 'https://imagedelivery.net/acct/swingsphere-org-1-logo-111/logosquare',
    headerImageUrl: 'https://imagedelivery.net/acct/swingsphere-org-1-hero-222/heropage',
  };

  const club: ClubData = {
    id: 'club-1',
    type: 'club',
    name: 'Velvet Lounge',
    description_short: 'Upscale club',
    location: 'Miami, FL',
    contactEmail: 'info@velvet.example',
    geopoint: { latitude: 25.76, longitude: -80.19, address: { city: 'Miami', region: 'FL', country: 'US' } },
    schedule: [],
    generalAmenities: [],
    status: 'approved',
    postedByUserId: 'admin',
    ownerOrganizationId: 'org-1',
    headerImageUrl: encodeHeroCropToUrl(
      'https://imagedelivery.net/acct/swingsphere-club-1-hero-333/flyerpage',
      { focalX: 50, focalY: 30, zoom: 1.2, fitMode: 'fill', sourceWidth: 1080, sourceHeight: 1350 },
    ),
  };

  const catalog = { listings: [club], organizations: [organization] };
  const resolvedClubLogo = resolveBrandLogo('club', club.id, catalog);
  const resolvedOrgLogo = resolveBrandLogo('organization', organization.id, catalog);
  const resolvedHeader = resolveBrandHeader('club', club.id, catalog);

  assert.equal(resolvedClubLogo.url, organization.logoImageUrl);
  assert.equal(resolvedOrgLogo.url, organization.logoImageUrl);
  assert.equal(resolvedOrgLogo.sourceType, 'organization');
  assert.equal(resolvedHeader.url, club.headerImageUrl);

  const cardUrl = getListingImageUrl(club);
  const heroPageUrl = getListingHeroPageUrl(club);
  assert.ok(cardUrl.includes('/herocard'));
  assert.ok(heroPageUrl.includes('/flyerpage#ss-crop='));

  // Event flyer-as-hero fallback leaves canonical flyer untouched
  const flyerUrl = 'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/swingsphere-event-1-flyer-444/flyerpage';
  const eventWithFlyerOnly: EventData = {
    id: 'event-1',
    type: 'event',
    name: 'Midnight Masquerade',
    hostName: 'Velvet Society',
    description_full: 'Masquerade night',
    location: 'Miami, FL',
    contactEmail: 'info@velvet.example',
    geopoint: { latitude: 25.76, longitude: -80.19, address: { city: 'Miami', region: 'FL', country: 'US' } },
    isAddressPrivate: false,
    time: { start: '2026-12-31T21:00:00Z', end: '2027-01-01T03:00:00Z' },
    tags: [],
    flyerImageUrl: flyerUrl,
    status: 'approved',
    postedByUserId: 'admin',
  };

  assert.equal(getListingPrimaryFlyerUrl(eventWithFlyerOnly, 'flyerpage'), flyerUrl);
  assert.equal(getListingPrimaryHeroUrl(eventWithFlyerOnly, 'heropage'), null);
  assert.equal(getListingHeroPageUrl(eventWithFlyerOnly), flyerUrl);
  assert.equal(eventWithFlyerOnly.flyerImageUrl, flyerUrl);

  // Uploaded MediaAsset preserves exact resolvedUrl + crop
  const heroCrop = normalizeHeroCrop({
    focalX: 55,
    focalY: 40,
    zoom: 1.2,
    fitMode: 'fill',
    sourceWidth: 1600,
    sourceHeight: 900,
  });
  const uploadedAsset: MediaAsset = {
    id: 'asset-hero-1',
    owner_type: 'club',
    owner_id: getMediaOwnerId('club', 'club-1'),
    role: 'hero',
    storage_provider: 'cloudflare_images',
    external_id: 'swingsphere-club-1-hero-777',
    status: 'approved',
    aspect_mode: 'cover',
    target_ratio: '20:9',
    alt_text: null,
    sort_order: 0,
    focal_point_x: 55,
    focal_point_y: 40,
    hero_crop: heroCrop,
    source_width: 1600,
    source_height: 900,
  };

  const resolvedUploadedUrl = resolveUploadedMediaUrl(uploadedAsset);
  const { crop: extractedFromUpload } = extractHeroCropFromUrl(resolvedUploadedUrl);
  assert.ok(extractedFromUpload);
  assertClose(extractedFromUpload.focalX, 55);
  assertClose(extractedFromUpload.focalY, 40);
  assertClose(extractedFromUpload.zoom, 1.2);
});
