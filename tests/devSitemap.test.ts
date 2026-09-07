import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DEV_ROUTE_CATALOG, filterCatalogEntries, summarizeListingMedia } from '../lib/devSitemap.ts';
import type { Listing } from '../types.ts';

const club = (overrides: Partial<Listing> = {}): Listing => ({
  id: 'club-test',
  type: 'club',
  name: 'Test Club',
  location: 'Test City',
  status: 'approved',
  postedByUserId: 'user1',
  geopoint: {
    latitude: 1,
    longitude: 1,
    address: { city: 'Test City', region: 'Test Region', country: 'Test Country' },
  },
  schedule: [],
  generalAmenities: [],
  ...overrides,
} as Listing);

test('dev route catalog covers every registered /dev route exactly once', () => {
  const indexSource = fs.readFileSync(path.join(process.cwd(), 'index.tsx'), 'utf8');
  const registeredPaths = [...indexSource.matchAll(/path=["'](\/?dev\/[^"']+)["']/g)]
    .map((match) => `/${match[1].replace(/^\//, '')}`)
    .sort();
  const catalogPaths = DEV_ROUTE_CATALOG.map((route) => route.path).sort();

  assert.deepEqual(catalogPaths, registeredPaths);
  assert.equal(new Set(catalogPaths).size, catalogPaths.length);
});

test('media summary separates no-image and one-image states', () => {
  assert.equal(summarizeListingMedia(club()).status, 'none');
  const oneLogo = summarizeListingMedia(club({ logoImageUrl: 'https://images.example/logo.png' }));
  assert.equal(oneLogo.status, 'minimal');
  assert.equal(oneLogo.hasLogo, true);
  assert.equal(oneLogo.hasHero, false);
});

test('media summary includes usable canonical assets without double counting their legacy URL', () => {
  const externalId = '6800a11e-4819-45e6-0258-60c519a12900';
  const summary = summarizeListingMedia(club({
    headerImageUrl: `https://imagedelivery.net/account/${externalId}/heropage`,
    mediaAssets: [{
      id: 'asset-1',
      owner_type: 'club',
      owner_id: 'club-test',
      role: 'hero',
      storage_provider: 'cloudflare_images',
      external_id: externalId,
      status: 'approved',
      aspect_mode: 'cover',
      target_ratio: null,
      alt_text: null,
      sort_order: 0,
      focal_point_x: null,
      focal_point_y: null,
      created_by: null,
      created_at: '2026-09-02T00:00:00Z',
      updated_at: '2026-09-02T00:00:00Z',
    }],
  }));

  assert.equal(summary.total, 1);
  assert.equal(summary.heroCount, 1);
  assert.equal(summary.hasHero, true);
});

test('rejected and archived canonical assets are not treated as usable', () => {
  const summary = summarizeListingMedia(club({
    mediaAssets: [
      {
        id: 'asset-rejected',
        owner_type: 'club',
        owner_id: 'club-test',
        role: 'logo',
        storage_provider: 'cloudflare_images',
        external_id: 'rejected-image',
        status: 'rejected',
        aspect_mode: 'contain',
        target_ratio: null,
        alt_text: null,
        sort_order: 0,
        focal_point_x: null,
        focal_point_y: null,
        created_by: null,
        created_at: '2026-09-02T00:00:00Z',
        updated_at: '2026-09-02T00:00:00Z',
      },
    ],
  }));

  assert.equal(summary.total, 0);
  assert.equal(summary.status, 'none');
});

test('catalog search matches labels, paths, descriptions, and metadata', () => {
  const routes = filterCatalogEntries(DEV_ROUTE_CATALOG, 'hybrid globe');
  assert.deepEqual(routes.map((route) => route.path), ['/dev/hybrid-globe']);
});
