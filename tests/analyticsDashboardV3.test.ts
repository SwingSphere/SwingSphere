import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatOsFamily,
  resolveAnalyticsDeviceClass,
  resolveBrowserFamily,
  resolveOsFamily,
} from '../lib/analytics/deviceAttribution';
import {
  classifyOutboundDestination,
  resolveAnalyticsEntity,
  resolveInternalRoute,
  type AnalyticsCatalog,
} from '../lib/analytics/routeEntityResolver';
import {
  buildAnalyticsTrendPoints,
  computePercentageChange,
  resolveRangeDates,
} from '../lib/analytics/trendSeries';

test('resolveOsFamily distinguishes iPadOS (including desktop-class Safari on iPadOS 13+) from macOS and iOS', () => {
  // Desktop-class Safari on iPadOS 13+ reports MacIntel with touch points > 1
  assert.equal(
    resolveOsFamily({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    }),
    'ipados',
  );

  // Genuine macOS desktop has maxTouchPoints 0
  assert.equal(
    resolveOsFamily({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    }),
    'macos',
  );

  // iPhone reports ios
  assert.equal(
    resolveOsFamily({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    }),
    'ios',
  );

  // Android tablet formats as Android tablet when paired with tablet deviceClass
  assert.equal(
    resolveOsFamily({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    }),
    'android',
  );
  assert.equal(formatOsFamily('android', 'tablet'), 'Android tablet');
  assert.equal(formatOsFamily('android', 'mobile'), 'Android');
  assert.equal(formatOsFamily('ipados', 'tablet'), 'iPadOS');
});

test('resolveAnalyticsDeviceClass does not misclassify narrow desktop browser windows as tablets', () => {
  assert.equal(
    resolveAnalyticsDeviceClass({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      platform: 'Win32',
      maxTouchPoints: 0,
      innerWidth: 900,
      innerHeight: 800,
      coarsePointer: false,
      finePointer: true,
      hoverCapable: true,
    }),
    'desktop',
  );
});

test('resolveBrowserFamily identifies Safari, Chrome, Firefox, and Edge accurately', () => {
  assert.equal(
    resolveBrowserFamily(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
    ),
    'edge',
  );
  assert.equal(
    resolveBrowserFamily(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    ),
    'chrome',
  );
  assert.equal(
    resolveBrowserFamily(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    ),
    'safari',
  );
  assert.equal(
    resolveBrowserFamily(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    ),
    'firefox',
  );
});

test('resolveInternalRoute resolves catalog entities and humanizes unindexed slugs', () => {
  const catalog: AnalyticsCatalog = {
    listings: [
      {
        id: 'evt-connect-1',
        type: 'event',
        name: 'Connect Dance Love',
        date: '2026-11-15',
        location: 'San Francisco, CA',
        geopoint: {
          latitude: 37.7749,
          longitude: -122.4194,
          address: { city: 'San Francisco', region: 'CA', country: 'USA' },
        },
        description: 'Test event',
        imageUrl: '',
        tags: [],
      } as any,
      {
        id: 'club-twist-sf',
        type: 'club',
        name: 'Twist SF',
        location: 'San Francisco, CA',
        geopoint: {
          latitude: 37.7749,
          longitude: -122.4194,
          address: { city: 'San Francisco', region: 'CA', country: 'USA' },
        },
        description: 'Test club',
        imageUrl: '',
        tags: [],
        generalAmenities: [],
      } as any,
    ],
  };

  const eventResolved = resolveInternalRoute('/events/connect-dance-love', catalog);
  assert.equal(eventResolved.title, 'Connect Dance Love');
  assert.equal(eventResolved.entityType, 'Event');
  assert.ok(eventResolved.href?.startsWith('/events/'));

  const clubResolved = resolveInternalRoute('/clubs/twist-sf', catalog);
  assert.equal(clubResolved.title, 'Twist SF');
  assert.equal(clubResolved.entityType, 'Club');
  assert.ok(clubResolved.href?.startsWith('/clubs/'));

  const globeResolved = resolveInternalRoute('/globe', catalog);
  assert.equal(globeResolved.title, '3D Globe Explorer');
  assert.equal(globeResolved.entityType, 'Globe');
  assert.equal(globeResolved.href, '/globe');

  // Unindexed event slug still gets a clean humanized title and clickable path
  const fallbackEvent = resolveInternalRoute('/events/midnight-masquerade-gala--ev99', catalog);
  assert.equal(fallbackEvent.title, 'Midnight Masquerade Gala');
  assert.equal(fallbackEvent.entityType, 'Event');
  assert.equal(fallbackEvent.href, '/events/midnight-masquerade-gala--ev99');
});

test('resolveAnalyticsEntity and classifyOutboundDestination enrich outbound Listing -> Destination flows', () => {
  const catalog: AnalyticsCatalog = {
    listings: [
      {
        id: 'club-twist-sf',
        type: 'club',
        name: 'Twist SF',
        location: 'San Francisco, CA',
        geopoint: {
          latitude: 37.7749,
          longitude: -122.4194,
          address: { city: 'San Francisco', region: 'CA', country: 'USA' },
        },
        description: '',
        imageUrl: '',
        tags: [],
        generalAmenities: [],
      } as any,
    ],
  };

  const entity = resolveAnalyticsEntity('club', 'club-twist-sf', catalog);
  assert.equal(entity.title, 'Twist SF');
  assert.equal(entity.entityType, 'Club');
  assert.ok(entity.href?.startsWith('/clubs/'));

  const ticketDest = classifyOutboundDestination('website', 'eventbrite.com', '/e/illuminati-tickets-123');
  assert.equal(ticketDest.categoryKey, 'ticket');
  assert.equal(ticketDest.providerLabel, 'Eventbrite');
  assert.equal(ticketDest.href, 'https://eventbrite.com/e/illuminati-tickets-123');

  const clubWebDest = classifyOutboundDestination('website', 'twist-sf.com', '');
  assert.equal(clubWebDest.categoryKey, 'website');
  assert.equal(clubWebDest.displayDestination, 'twist-sf.com');
  assert.equal(clubWebDest.href, 'https://twist-sf.com');
});

test('buildAnalyticsTrendPoints produces continuous buckets and computePercentageChange calculates growth deltas', () => {
  const points = buildAnalyticsTrendPoints({
    from: '2026-10-01',
    to: '2026-10-03',
    granularity: 'daily',
    daily: [
      { day: '2026-10-01', primary: 10, secondary: 8 },
      { day: '2026-10-03', primary: 20, secondary: 15 },
    ],
    previousDaily: [
      { day: '2026-09-28', primary: 5, secondary: 4 },
      { day: '2026-09-29', primary: 5, secondary: 4 },
      { day: '2026-09-30', primary: 10, secondary: 8 },
    ],
    hourly: [],
  });

  assert.equal(points.length, 3);
  assert.equal(points[0].primary, 10);
  assert.equal(points[1].primary, 0); // zero-filled gap day
  assert.equal(points[2].primary, 20);
  assert.equal(points[0].previousPrimary, 5);
  assert.equal(points[2].previousPrimary, 10);

  const delta = computePercentageChange(118, 100);
  assert.equal(delta.direction, 'up');
  assert.equal(delta.formatted, '+18.0%');

  const range24h = resolveRangeDates('24h', '2026-10-08');
  assert.equal(range24h.defaultGranularity, 'hourly');
});
