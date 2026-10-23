import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterSuitableClubGalleryUrls,
  isIntrinsicFlyerOrInvalidGalleryImage,
  resolveClubGalleryLightboxUrl,
} from '../lib/clubGallery';
import type { ClubData } from '../types';

const makeClub = (overrides: Partial<ClubData> & Record<string, unknown> = {}): ClubData =>
  ({
    id: 'club-test',
    type: 'club',
    name: 'Test Club',
    description_short: 'Test venue',
    location: 'San Francisco, CA',
    geopoint: {
      latitude: 37.7749,
      longitude: -122.4194,
      address: { city: 'San Francisco', region: 'CA', country: 'USA' },
    },
    status: 'approved',
    postedByUserId: 'user-1',
    ...overrides,
  }) as ClubData;

test('preserves external interior photograph URLs and does not impose a minimum image count', () => {
  const singleExternalPhotoClub = makeClub({
    galleryImageUrls: ['https://www.fata-morgana.nl/wp-content/uploads/2024/10/nieuwebar-okt2024.jpg'],
  });
  assert.deepEqual(filterSuitableClubGalleryUrls(singleExternalPhotoClub), [
    'https://www.fata-morgana.nl/wp-content/uploads/2024/10/nieuwebar-okt2024.jpg',
  ]);

  const multiExternalPhotoClub = makeClub({
    headerImageUrl: 'https://tokyolifestyleclub.com/assets/img/about.jpg',
    galleryImageUrls: [
      'https://tokyolifestyleclub.com/assets/img/relaxation-beds.jpg',
      'https://tokyolifestyleclub.com/assets/img/amsterdam-booths.jpg',
      'https://tokyolifestyleclub.com/assets/img/vip-rooms.jpg',
    ],
  });
  assert.deepEqual(filterSuitableClubGalleryUrls(multiExternalPhotoClub), [
    'https://tokyolifestyleclub.com/assets/img/relaxation-beds.jpg',
    'https://tokyolifestyleclub.com/assets/img/amsterdam-booths.jpg',
    'https://tokyolifestyleclub.com/assets/img/vip-rooms.jpg',
  ]);
});

test('excludes duplicate hero, logo, and event flyer artwork', () => {
  const clubWithDuplicateHeroAndEventArtwork = makeClub({
    headerImageUrl:
      'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/216d753b-3d2c-4735-87b0-680305b58700/heropage',
    logoImageUrl:
      'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/0fea5efc-22c8-4269-d912-9f9cf4a56700/logosquare',
    galleryImageUrls: [
      // Same Cloudflare ID as hero under gallerythumb variant
      'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/216d753b-3d2c-4735-87b0-680305b58700/gallerythumb',
      // Re-uploaded duplicate of hero with same normalized alt_text ("Signature Weekend-cropped")
      'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/731d8310-54cd-4be2-5883-47947cb59600/gallerythumb',
      // Event flyer used by an event at this club
      'https://cdn.example.com/events/halloween-flyer.jpg',
      // Genuine interior photo
      'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/47c60d65-a4b1-4bfa-e2d6-ebeeeebb6e00/gallerythumb',
    ],
    mediaAssets: [
      {
        role: 'hero',
        alt_text: 'SignatureWeekend-cropped',
        external_id: '216d753b-3d2c-4735-87b0-680305b58700',
        status: 'approved',
      },
      {
        role: 'gallery',
        alt_text: 'Signature Weekend-cropped',
        external_id: '731d8310-54cd-4be2-5883-47947cb59600',
        status: 'approved',
      },
      {
        role: 'gallery',
        alt_text: 'lounge_3-cropped',
        external_id: '47c60d65-a4b1-4bfa-e2d6-ebeeeebb6e00',
        status: 'approved',
      },
    ],
  });

  assert.deepEqual(
    filterSuitableClubGalleryUrls(clubWithDuplicateHeroAndEventArtwork, {
      eventImageUrls: ['https://cdn.example.com/events/halloween-flyer.jpg'],
    }),
    [
      'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/47c60d65-a4b1-4bfa-e2d6-ebeeeebb6e00/gallerythumb',
    ],
  );
});

test('excludes promotional banners, dated event flyers, and dress-code graphics while keeping real space photos', () => {
  const club = makeClub({
    galleryImageUrls: [
      'https://www.krystal-club.it/wp-content/uploads/2026/08/26settembre-920x415.jpg',
      'https://www.fun4two.nl/data250/images/fun4two-header_02.jpg',
      'https://www.fun4two.nl/programma/images/fun4two-progr-banners-juli-26-11.jpg',
      'https://www.casaswinger.com.mx/images/CasaSwingerMexico-2026/club-swinger-viernes-ciudad-de-mexico.png',
      'https://soho-graz.at/wp-content/uploads/2025/03/was-ziehe-ich-an-02.jpg',
      'https://i0.wp.com/club-more.com/wp-content/uploads/2025/07/gridart_20250722_121649135.jpg?fit=768%2C1024&ssl=1',
      'https://epicure.club/sites/default/files/styles/carousel_768x320/public/2026-05/epicure-dj-shuggah.webp',
      'https://epicure.club/sites/default/files/styles/carousel_768x320/public/2026-05/epicure-club-cape-town-pool.webp',
    ],
  });

  assert.deepEqual(filterSuitableClubGalleryUrls(club), [
    'https://epicure.club/sites/default/files/styles/carousel_768x320/public/2026-05/epicure-club-cape-town-pool.webp',
  ]);
});

test('gracefully hides broken external images and intrinsic portrait flyers at runtime', () => {
  const club = makeClub({
    galleryImageUrls: [
      'https://external.example.com/broken-interior.jpg',
      'https://external.example.com/lounge-interior.jpg',
    ],
  });

  assert.deepEqual(
    filterSuitableClubGalleryUrls(club, {
      hiddenUrls: ['https://external.example.com/broken-interior.jpg'],
    }),
    ['https://external.example.com/lounge-interior.jpg'],
  );

  // Portrait flyer dimensions (768x1080) on external URL are flagged
  assert.equal(
    isIntrinsicFlyerOrInvalidGalleryImage({
      url: 'https://external.example.com/party.jpg',
      naturalWidth: 768,
      naturalHeight: 1080,
    }),
    true,
  );

  // Authentic landscape interior photo (1200x800) is kept
  assert.equal(
    isIntrinsicFlyerOrInvalidGalleryImage({
      url: 'https://external.example.com/lounge-interior.jpg',
      naturalWidth: 1200,
      naturalHeight: 800,
    }),
    false,
  );

  // Lightbox upgrades Cloudflare gallerythumb to gallerypage while keeping external URLs intact
  assert.equal(
    resolveClubGalleryLightboxUrl('https://external.example.com/lounge-interior.jpg'),
    'https://external.example.com/lounge-interior.jpg',
  );
  assert.match(
    resolveClubGalleryLightboxUrl(
      'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/47c60d65-a4b1-4bfa-e2d6-ebeeeebb6e00/gallerythumb',
    ) ?? '',
    /\/gallerypage$/,
  );
});
