import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LISTING_IMAGE_FALLBACK,
  getEventCardImageUrl,
  getListingCardImageUrl,
  getListingFlyerUrl,
  getListingHeroUrl,
  getListingImageUrl,
  getListingPrimaryFlyerUrl,
  getListingPrimaryHeroUrl,
} from '../lib/listingImage';
import type { ClubData, EventData } from '../types';

const createMockEvent = (overrides: Partial<EventData> = {}): EventData => ({
  id: 'test-event-1',
  type: 'event',
  name: 'Test Event',
  hostName: 'Test Host',
  description_full: 'Full description',
  location: 'San Francisco, CA',
  contactEmail: 'test@example.com',
  time: {
    start: '2026-10-01T20:00:00Z',
    end: '2026-10-02T02:00:00Z',
  },
  geopoint: {
    latitude: 37.7749,
    longitude: -122.4194,
    address: {
      city: 'San Francisco',
      region: 'CA',
      country: 'USA',
    },
  },
  tags: ['Event'],
  status: 'approved',
  postedByUserId: 'user-1',
  ...overrides,
});

const createMockClub = (overrides: Partial<ClubData> = {}): ClubData => ({
  id: 'test-club-1',
  type: 'club',
  name: 'Test Club',
  description_short: 'A short description',
  location: 'Atlanta, GA',
  schedule: [],
  generalAmenities: [],
  geopoint: {
    latitude: 33.749,
    longitude: -84.388,
    address: {
      city: 'Atlanta',
      region: 'GA',
      country: 'USA',
    },
  },
  status: 'approved',
  postedByUserId: 'user-1',
  ...overrides,
});

test('event with flyer + hero → flyer', () => {
  const event = createMockEvent({
    mediaAssets: [
      {
        id: 'asset-hero',
        owner_type: 'event',
        owner_id: 'event-1',
        role: 'hero',
        storage_provider: 'cloudflare_images',
        external_id: 'hero-asset-uuid',
        status: 'approved',
      },
      {
        id: 'asset-flyer',
        owner_type: 'event',
        owner_id: 'event-1',
        role: 'flyer',
        storage_provider: 'cloudflare_images',
        external_id: 'flyer-asset-uuid',
        status: 'approved',
      },
    ],
  });

  const resolvedCardImage = getListingCardImageUrl(event);
  const resolvedEventImage = getEventCardImageUrl(event);
  const resolvedHeroUrl = getListingHeroUrl(event);
  const resolvedFlyerUrl = getListingFlyerUrl(event);

  assert.ok(resolvedCardImage.includes('flyer-asset-uuid'));
  assert.ok(resolvedCardImage.includes('flyercard'));
  assert.equal(resolvedEventImage, resolvedCardImage);
  assert.equal(resolvedHeroUrl, resolvedCardImage);
  assert.equal(resolvedFlyerUrl, resolvedCardImage);
});

test('event with flyer only → flyer', () => {
  const event = createMockEvent({
    mediaAssets: [
      {
        id: 'asset-flyer',
        owner_type: 'event',
        owner_id: 'event-1',
        role: 'flyer',
        storage_provider: 'cloudflare_images',
        external_id: 'flyer-asset-uuid',
        status: 'approved',
      },
    ],
  });

  const resolved = getListingCardImageUrl(event);
  assert.ok(resolved.includes('flyer-asset-uuid'));
  assert.ok(resolved.includes('flyercard'));
  assert.equal(getEventCardImageUrl(event), resolved);
});

test('event with hero only → hero', () => {
  const event = createMockEvent({
    mediaAssets: [
      {
        id: 'asset-hero',
        owner_type: 'event',
        owner_id: 'event-1',
        role: 'hero',
        storage_provider: 'cloudflare_images',
        external_id: 'hero-asset-uuid',
        status: 'approved',
      },
    ],
  });

  const resolved = getListingCardImageUrl(event);
  assert.ok(resolved.includes('hero-asset-uuid'));
  assert.ok(resolved.includes('herocard'));
  assert.equal(getEventCardImageUrl(event), resolved);
});

test('event with neither → default', () => {
  const event = createMockEvent();

  const resolved = getListingCardImageUrl(event);
  assert.equal(resolved, LISTING_IMAGE_FALLBACK);
  assert.equal(getEventCardImageUrl(event), LISTING_IMAGE_FALLBACK);
  assert.equal(getListingHeroUrl(event), LISTING_IMAGE_FALLBACK);
  assert.equal(getListingFlyerUrl(event), LISTING_IMAGE_FALLBACK);
});

test('event with direct flyerImageUrl alias + headerImageUrl hero → flyer', () => {
  const event = createMockEvent({
    headerImageUrl: 'https://images.example.com/events/hero-banner.jpg',
    // @ts-expect-error test alias
    flyerImageUrl: 'https://images.example.com/events/official-flyer.jpg',
  });

  assert.equal(getListingCardImageUrl(event), 'https://images.example.com/events/official-flyer.jpg');
  assert.equal(getEventCardImageUrl(event), 'https://images.example.com/events/official-flyer.jpg');
});

test('event with empty flyer + valid hero → hero fallback', () => {
  const event = createMockEvent({
    headerImageUrl: 'https://images.example.com/events/hero-fallback.jpg',
    // @ts-expect-error test alias
    flyerImageUrl: '   ',
  });

  assert.equal(getListingCardImageUrl(event), 'https://images.example.com/events/hero-fallback.jpg');
  assert.equal(getEventCardImageUrl(event), 'https://images.example.com/events/hero-fallback.jpg');
});

test('event with placeholder flyer + valid hero → hero fallback', () => {
  const event = createMockEvent({
    headerImageUrl: 'https://images.example.com/events/hero-fallback.jpg',
    // @ts-expect-error test alias
    flyerImageUrl: 'https://picsum.photos/seed/placeholder/500/500',
  });

  assert.equal(getListingCardImageUrl(event), 'https://images.example.com/events/hero-fallback.jpg');
  assert.equal(getEventCardImageUrl(event), 'https://images.example.com/events/hero-fallback.jpg');
});

test('event with placeholder flyer + fallback logo hero → default fallback', () => {
  const event = createMockEvent({
    // @ts-expect-error test alias
    flyerImageUrl: '/swingsphere-logo.png',
    headerImageUrl: '/swingsphere-logo.png',
  });

  assert.equal(getListingCardImageUrl(event), LISTING_IMAGE_FALLBACK);
});

test('Twist SF event with headerImageUrl (flyer only, no mediaAssets) → uses headerImageUrl', () => {
  const twistEvent = createMockEvent({
    id: 'event-twist-sf-1',
    headerImageUrl: 'https://modernlifestyle-prod.nyc3.cdn.digitaloceanspaces.com/6688689/1cd216a9-8785-45a3-b4d9-786e3fadc29a/original.jpg?v=tczqur',
  });

  const resolved = getListingCardImageUrl(twistEvent);
  assert.equal(resolved, 'https://modernlifestyle-prod.nyc3.cdn.digitaloceanspaces.com/6688689/1cd216a9-8785-45a3-b4d9-786e3fadc29a/original.jpg?v=tczqur');
});

test('club card behavior is preserved: hero + logo → hero', () => {
  const club = createMockClub({
    headerImageUrl: 'https://images.example.com/clubs/trapeze-hero.jpg',
    logoImageUrl: 'https://images.example.com/clubs/trapeze-logo.png',
  });

  assert.equal(getListingCardImageUrl(club), 'https://images.example.com/clubs/trapeze-hero.jpg');
  assert.equal(getListingHeroUrl(club), 'https://images.example.com/clubs/trapeze-hero.jpg');
});

test('club card behavior is preserved: logo only → logo', () => {
  const club = createMockClub({
    logoImageUrl: 'https://images.example.com/clubs/trapeze-logo.png',
  });

  assert.equal(getListingCardImageUrl(club), 'https://images.example.com/clubs/trapeze-logo.png');
  assert.equal(getListingHeroUrl(club), 'https://images.example.com/clubs/trapeze-logo.png');
});

test('club card behavior is preserved: neither → default', () => {
  const club = createMockClub();

  assert.equal(getListingCardImageUrl(club), LISTING_IMAGE_FALLBACK);
  assert.equal(getListingHeroUrl(club), LISTING_IMAGE_FALLBACK);
});

test('real listing dataset: event with flyer + hero selects flyer', async () => {
  const listingsModule = await import('../data/listings.local.json');
  const listings = (listingsModule.default || listingsModule) as (ClubData | EventData)[];
  const kinkEvent = listings.find((item) => item.id === 'event-her-fantasy-kink-twist-2026-08-02');

  assert.ok(kinkEvent);
  const flyerAsset = kinkEvent.mediaAssets?.find((a) => a.role === 'flyer');
  assert.ok(flyerAsset);

  const resolved = getListingCardImageUrl(kinkEvent);
  assert.ok(resolved.includes(flyerAsset.external_id));
  assert.ok(resolved.includes('flyercard'));
});

test('real listing dataset: Trapeze Atlanta club selects hero image', async () => {
  const listingsModule = await import('../data/listings.local.json');
  const listings = (listingsModule.default || listingsModule) as (ClubData | EventData)[];
  const trapeze = listings.find((item) => item.id === 'club-trapeze-atlanta');

  assert.ok(trapeze);
  const resolved = getListingCardImageUrl(trapeze);
  assert.ok(resolved.includes('Screen-Shot-2023-01-02'));
});

