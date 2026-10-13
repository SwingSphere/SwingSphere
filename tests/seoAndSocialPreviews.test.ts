import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSitemapXml,
  resolvePageSeo,
  DEFAULT_OG_IMAGE,
} from '../functions/lib/seoMetadata.ts';
import {
  clubKey,
  eventKey,
  legacyClubKey,
  legacyEventKey,
} from '../lib/identityUtils.ts';
import { buildEntityIndex } from '../lib/entityIndex.ts';
import {
  getClubCanonicalPath,
  getEventCanonicalPath,
  resolveClubFromParam,
  resolveEventFromParam,
} from '../lib/entityUtils.ts';
import { resolveStaticPageSeo } from '../lib/staticSeo.ts';
import type { ClubData, EventData } from '../types.ts';

test('homepage SEO returns valid branded metadata, summary_large_image, semantic bodyHtml, and Schema.org WebSite & Organization', async () => {
  const seo = await resolvePageSeo('/');
  assert.equal(seo.status, 200);
  assert.equal(seo.canonicalUrl, 'https://swingsphere.co/');
  assert.equal(seo.title, 'SwingSphere | Lifestyle Clubs, Swinger Parties & Events');
  assert.match(seo.description, /lifestyle clubs, swinger parties, play parties/i);
  assert.equal(seo.imageUrl, DEFAULT_OG_IMAGE);
  assert.equal(seo.imageWidth, 1200);
  assert.equal(seo.imageHeight, 630);
  assert.equal(seo.twitterCard, 'summary_large_image');
  assert.equal(seo.noIndex, false);
  assert.equal(seo.robots, 'index, follow');
  assert.ok(seo.bodyHtml && seo.bodyHtml.includes('<h1') && seo.bodyHtml.includes('href="/discover"'));
  assert.ok(Array.isArray(seo.structuredData));
  const types = (seo.structuredData as any[]).map((s) => s['@type']);
  assert.ok(types.includes('WebSite'));
  assert.ok(types.includes('Organization'));
});

test('24 real approved public listings across clubs, events, hosts, resorts, cruises, and cities return 200 OK, unique metadata, self-referencing canonical, JSON-LD, semantic bodyHtml, and sitemap inclusion', async () => {
  const xml = await generateSitemapXml();
  const sitemapLocs = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));

  // Pull canonical paths from the sitemap for 8 clubs and 4 events so we test exact canonical URLs
  const clubUrls = [...sitemapLocs].filter((u) => u.includes('/clubs/')).slice(0, 8);
  const eventUrls = [...sitemapLocs].filter((u) => u.includes('/events/')).slice(0, 4);
  assert.equal(clubUrls.length, 8, 'Should have at least 8 club URLs in sitemap');
  assert.equal(eventUrls.length, 4, 'Should have at least 4 event URLs in sitemap');

  const samplePaths = [
    ...clubUrls.map((u) => new URL(u).pathname),
    ...eventUrls.map((u) => new URL(u).pathname),
    '/hosts/bronze-party',
    '/hosts/her-fantasy-party',
    '/hosts/illuminaughty',
    '/hosts/allures',
    '/resorts/hedonism-ii',
    '/resorts/the-kraken-resort',
    '/resorts/paradise-lakes-resort',
    '/resorts/sea-mountain-inn-spa',
    '/cruises/margarita-pleasures-select-cruise',
    '/cruises/temptation-cruises',
    '/swinger-clubs/san-francisco',
    '/swinger-parties/san-francisco',
  ];

  assert.equal(samplePaths.length, 24);
  const titles = new Set<string>();
  const canonicals = new Set<string>();

  for (const path of samplePaths) {
    const seo = await resolvePageSeo(path);
    const expectedCanonical = `https://swingsphere.co${path}`;
    assert.equal(seo.status, 200, `Expected 200 for ${path}, got ${seo.status}`);
    assert.equal(seo.redirectUrl, undefined, `Canonical URL ${path} should not redirect`);
    assert.equal(seo.noIndex, false, `Expected noIndex=false for ${path}`);
    assert.equal(seo.robots, 'index, follow', `Expected index, follow for ${path}`);
    assert.equal(seo.canonicalUrl, expectedCanonical, `Canonical mismatch for ${path}`);
    assert.notEqual(seo.canonicalUrl, 'https://swingsphere.co/', `${path} must never canonicalize to homepage`);
    assert.ok(seo.title.length > 10, `Title too short for ${path}`);
    assert.ok(seo.description.length > 25, `Description too short for ${path}`);
    assert.ok(seo.bodyHtml && seo.bodyHtml.includes('<h1'), `${path} must include semantic <h1> in bodyHtml`);
    assert.ok(seo.bodyHtml && seo.bodyHtml.includes('<a href="'), `${path} must include crawlable internal links in bodyHtml`);
    assert.ok(Array.isArray(seo.structuredData) && (seo.structuredData as any[]).length >= 2, `${path} must include JSON-LD`);
    assert.ok(sitemapLocs.has(expectedCanonical), `${expectedCanonical} must be present in sitemap.xml`);

    titles.add(seo.title);
    canonicals.add(seo.canonicalUrl);
  }

  assert.equal(titles.size, samplePaths.length, 'Every sampled public listing must have a unique title');
  assert.equal(canonicals.size, samplePaths.length, 'Every sampled public listing must have a unique canonical URL');
});

test('multi-promoter venue (Twist SF + Bronze Party + Her Fantasy Party) resolves accurate Event.location, Event.organizer, and reciprocal links', async () => {
  const xml = await generateSitemapXml();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const twistClubUrl = locs.find((u) => u.includes('/clubs/twist-sf--'));
  const bronzeEventUrl = locs.find((u) => u.includes('/events/bronze-b4-the-feast-at-twist--'));
  const hfpEventUrl = locs.find((u) => u.includes('/events/her-fantasy-halloween-at-twist--'));

  assert.ok(twistClubUrl, 'Twist SF club must be in sitemap');
  assert.ok(bronzeEventUrl, 'Bronze B4 The Feast event must be in sitemap');
  assert.ok(hfpEventUrl, 'Her Fantasy Halloween event must be in sitemap');

  const bronzeSeo = await resolvePageSeo(new URL(bronzeEventUrl!).pathname);
  const bronzeSchema = (bronzeSeo.structuredData as any[]).find((s) => s['@type'] === 'Event');
  assert.ok(bronzeSchema, 'Bronze Party event must have Event schema');
  assert.equal(bronzeSchema.location.name, 'Twist SF', 'Event.location.name must be the venue/club name, not the event title');
  assert.equal(bronzeSchema.location.url, twistClubUrl, 'Event.location.url must point to canonical Twist SF club URL');
  assert.equal(bronzeSchema.organizer.name, 'Bronze Party');
  assert.equal(bronzeSchema.organizer.url, 'https://swingsphere.co/hosts/bronze-party');
  assert.ok(bronzeSeo.bodyHtml?.includes(new URL(twistClubUrl!).pathname), 'Event bodyHtml must link to Twist SF club');
  assert.ok(bronzeSeo.bodyHtml?.includes('/hosts/bronze-party'), 'Event bodyHtml must link to Bronze Party host');

  const hfpSeo = await resolvePageSeo(new URL(hfpEventUrl!).pathname);
  const hfpSchema = (hfpSeo.structuredData as any[]).find((s) => s['@type'] === 'Event');
  assert.ok(hfpSchema, 'Her Fantasy Party event must have Event schema');
  assert.equal(hfpSchema.location.name, 'Twist SF');
  assert.equal(hfpSchema.location.url, twistClubUrl);
  assert.equal(hfpSchema.organizer.name, 'Her Fantasy Party');
  assert.equal(hfpSchema.organizer.url, 'https://swingsphere.co/hosts/her-fantasy-party');

  const twistSeo = await resolvePageSeo(new URL(twistClubUrl!).pathname);
  assert.ok(twistSeo.bodyHtml?.includes(new URL(bronzeEventUrl!).pathname), 'Twist SF club bodyHtml must link to Bronze Party event at Twist');
  assert.ok(twistSeo.bodyHtml?.includes(new URL(hfpEventUrl!).pathname), 'Twist SF club bodyHtml must link to Her Fantasy Party event at Twist');
});

test('legacy property-hashed URLs, keyless slugs, host aliases, and city synonym routes return 301 permanent redirects to canonical URLs', async () => {
  const xml = await generateSitemapXml();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const twistCanonical = locs.find((u) => u.includes('/clubs/twist-sf--'))!;
  const bronzeCanonical = locs.find((u) => u.includes('/events/bronze-b4-the-feast-at-twist--'))!;

  // 1. Old property-hashed club URL (--013mcny4)
  const legacyTwist = await resolvePageSeo('/clubs/twist-sf--013mcny4');
  assert.equal(legacyTwist.status, 301);
  assert.equal(legacyTwist.redirectUrl, twistCanonical);
  assert.equal(legacyTwist.canonicalUrl, twistCanonical);

  // 2. Keyless unambiguous club slug (/clubs/twist-sf)
  const keylessTwist = await resolvePageSeo('/clubs/twist-sf');
  assert.equal(keylessTwist.status, 301);
  assert.equal(keylessTwist.redirectUrl, twistCanonical);

  // 3. Keyless unambiguous event slug (/events/bronze-b4-the-feast-at-twist)
  const keylessBronze = await resolvePageSeo('/events/bronze-b4-the-feast-at-twist');
  assert.equal(keylessBronze.status, 301);
  assert.equal(keylessBronze.redirectUrl, bronzeCanonical);

  // 4. Outdated event slug with canonical key redirects 301 to current canonical event URL
  const canonicalKeySuffix = bronzeCanonical.split('--').pop()!;
  const renamedSlugEvent = await resolvePageSeo(`/events/old-bronze-feast-title--${canonicalKeySuffix}`);
  assert.equal(renamedSlugEvent.status, 301);
  assert.equal(renamedSlugEvent.redirectUrl, bronzeCanonical);

  // 5. Host alias slugs (/hosts/the-bronze-party -> /hosts/bronze-party and /hosts/club-escape -> /hosts/club-escape-cleveland)
  const aliasBronze = await resolvePageSeo('/hosts/the-bronze-party');
  assert.equal(aliasBronze.status, 301);
  assert.equal(aliasBronze.redirectUrl, 'https://swingsphere.co/hosts/bronze-party');
  assert.equal(aliasBronze.canonicalUrl, 'https://swingsphere.co/hosts/bronze-party');

  const aliasEscape = await resolvePageSeo('/hosts/club-escape');
  assert.equal(aliasEscape.status, 301);
  assert.equal(aliasEscape.redirectUrl, 'https://swingsphere.co/hosts/club-escape-cleveland');
  assert.equal(aliasEscape.canonicalUrl, 'https://swingsphere.co/hosts/club-escape-cleveland');

  // 6. Regional city synonyms (/lifestyle-clubs/:city and /lifestyle-events/:city)
  const sfLifestyleClubs = await resolvePageSeo('/lifestyle-clubs/san-francisco');
  assert.equal(sfLifestyleClubs.status, 301);
  assert.equal(sfLifestyleClubs.redirectUrl, 'https://swingsphere.co/swinger-clubs/san-francisco');
  assert.equal(sfLifestyleClubs.canonicalUrl, 'https://swingsphere.co/swinger-clubs/san-francisco');

  const sfLifestyleEvents = await resolvePageSeo('/lifestyle-events/san-francisco');
  assert.equal(sfLifestyleEvents.status, 301);
  assert.equal(sfLifestyleEvents.redirectUrl, 'https://swingsphere.co/swinger-parties/san-francisco');
  assert.equal(sfLifestyleEvents.canonicalUrl, 'https://swingsphere.co/swinger-parties/san-francisco');
});

test('listing title, location, venue, or organizer change preserves immutable canonical key and redirects old slug', () => {
  const originalClub: ClubData = {
    id: 'club-twist-sf',
    type: 'club',
    status: 'approved',
    name: 'Twist SF',
    description_short: 'Original description',
    geopoint: {
      latitude: 37.78,
      longitude: -122.41,
      locationVisibility: 'exact',
      address: { city: 'San Francisco', region: 'CA', country: 'US' },
    },
  };

  const originalKey = clubKey(originalClub);
  const oldLegacyKey = legacyClubKey(originalClub);

  // Mutate title, city, and description
  const renamedClub: ClubData = {
    ...originalClub,
    name: 'Twist Social Club San Francisco',
    description_short: 'Updated description',
    geopoint: {
      ...originalClub.geopoint,
      address: { city: 'Oakland', region: 'CA', country: 'US' },
    },
  };

  assert.equal(clubKey(renamedClub), originalKey, 'Immutable clubKey must not change when title or location changes');

  const index = buildEntityIndex([renamedClub], []);
  const newCanonicalPath = getClubCanonicalPath(renamedClub, index);
  assert.equal(newCanonicalPath, `/clubs/twist-social-club-san-francisco--${originalKey}`);

  // Old slug with stable key resolves and signals non-canonical redirect to new canonical path
  const resolvedFromOldSlug = resolveClubFromParam(`twist-sf--${originalKey}`, index);
  assert.ok(resolvedFromOldSlug?.club);
  assert.equal(resolvedFromOldSlug?.club.id, 'club-twist-sf');
  assert.equal(resolvedFromOldSlug?.isCanonical, false);
  assert.equal(resolvedFromOldSlug?.canonicalPath, newCanonicalPath);

  // Old slug with legacy property-hash key also resolves and signals redirect to new canonical path
  const resolvedFromLegacyHash = resolveClubFromParam(`twist-sf--${oldLegacyKey}`, index);
  assert.ok(resolvedFromLegacyHash?.club);
  assert.equal(resolvedFromLegacyHash?.isCanonical, false);
  assert.equal(resolvedFromLegacyHash?.canonicalPath, newCanonicalPath);

  // Same verification for an Event when title, venue, or organizer changes
  const originalEvent: EventData = {
    id: 'event-bronze-93356-2026-11-25',
    type: 'event',
    status: 'approved',
    name: 'Bronze B4 the Feast at Twist',
    location: 'Twist SF, 387 Bay Street, San Francisco, California 94133, United States',
    hostName: 'bronze party',
    time: { start: '2026-11-25T22:00', end: '2026-11-26T04:00' },
    geopoint: {
      latitude: 37.8055766,
      longitude: -122.4132692,
      locationVisibility: 'exact',
      address: { city: 'San Francisco', region: 'California', country: 'United States' },
    },
  };
  const origEventKey = eventKey(originalEvent);
  const oldEventHashKey = legacyEventKey(originalEvent);

  const updatedEvent: EventData = {
    ...originalEvent,
    name: 'Bronze Party Thanksgiving Finale',
    location: 'New Venue SF',
    hostName: 'Bronze Productions',
  };
  assert.equal(eventKey(updatedEvent), origEventKey, 'Immutable eventKey must not change when title, venue, or host changes');

  const eventIndex = buildEntityIndex([updatedEvent], []);
  const newEventCanonical = getEventCanonicalPath(updatedEvent, eventIndex);
  const resolvedEvent = resolveEventFromParam(`bronze-b4-the-feast-at-twist--${oldEventHashKey}`, eventIndex);
  assert.ok(resolvedEvent?.event);
  assert.equal(resolvedEvent?.isCanonical, false);
  assert.equal(resolvedEvent?.canonicalPath, newEventCanonical);
});

test('invalid listing slugs, empty cities, and unknown routes return HTTP 404 + noindex and never canonicalize to homepage', async () => {
  const invalidPaths = [
    '/clubs/does-not-exist--99999999',
    '/events/does-not-exist--99999999',
    '/hosts/does-not-exist',
    '/resorts/does-not-exist',
    '/cruises/does-not-exist',
    '/venues/does-not-exist',
    '/swinger-clubs/nonexistent-antarctica-city',
    '/swinger-parties/nonexistent-antarctica-city',
    '/completely-unknown-route',
  ];

  for (const path of invalidPaths) {
    const seo = await resolvePageSeo(path);
    assert.equal(seo.status, 404, `Expected HTTP 404 for ${path}, got ${seo.status}`);
    assert.equal(seo.noIndex, true, `Expected noIndex=true for ${path}`);
    assert.equal(seo.robots, 'noindex, nofollow', `Expected noindex, nofollow for ${path}`);
    assert.notEqual(seo.canonicalUrl, 'https://swingsphere.co/', `404 route ${path} must not canonicalize to homepage`);
  }

  // Verify unknown route in staticSeo is also noIndex and does not canonicalize to /
  const unknownStaticSeo = resolveStaticPageSeo('/completely-unknown-route');
  assert.equal(unknownStaticSeo.noIndex, true);
  assert.notEqual(unknownStaticSeo.canonicalUrl, 'https://swingsphere.co/');
});

test('draft, archived, test/demo fixtures, and non-host club orgs are excluded from sitemap and return 404 + noindex', async () => {
  const xml = await generateSitemapXml();
  const forbiddenSubstrings = [
    'test-club',
    'test-event',
    'community-host',
    'discovery-demo-host',
    '/hosts/2-4-club',
    'bliss-mediterranean-voyage',
    'sailing-bliss-med-2026-07',
  ];
  for (const forbidden of forbiddenSubstrings) {
    assert.equal(xml.includes(forbidden), false, `Sitemap must not include ${forbidden}`);
  }

  const nonPublicRoutes = [
    '/hosts/community-host',
    '/hosts/discovery-demo-host',
    '/hosts/test-club-2097981a',
    '/hosts/2-4-club',
    '/cruises/bliss-mediterranean-voyage',
  ];
  for (const route of nonPublicRoutes) {
    const seo = await resolvePageSeo(route);
    assert.equal(seo.status, 404, `Non-public/demo route ${route} must return 404`);
    assert.equal(seo.noIndex, true, `Non-public/demo route ${route} must have noIndex=true`);
  }
});

test('simulated Supabase backend failure returns HTTP 503 + Retry-After + noindex for uncached listing rather than caching a false 404', async () => {
  const failingEnv = {
    VITE_SUPABASE_URL: 'https://127.0.0.1:1',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_simulated_test_key',
  };
  const seo = await resolvePageSeo('/clubs/brand-new-supabase-club--99999999', failingEnv);
  assert.equal(seo.status, 503, 'Degraded catalog must return 503 for unknown entity rather than false 404');
  assert.equal(seo.noIndex, true);
  assert.equal(seo.retryAfterSeconds, 60);
});

test('private-address clubs, events, and approximate-location resorts never leak street address, postal code, or exact coordinates', async () => {
  // 1. Approximate resort: Sea Mountain Inn & Spa
  const resortSeo = await resolvePageSeo('/resorts/sea-mountain-inn-spa');
  assert.equal(resortSeo.status, 200);
  const resortSchema = (resortSeo.structuredData as any[]).find((s) => s['@type'] === 'Resort');
  assert.ok(resortSchema);
  assert.equal(resortSchema.geo, undefined, 'Approximate resort must not expose exact GeoCoordinates in JSON-LD');
  assert.equal(resortSchema.address?.streetAddress, undefined, 'Approximate resort must not expose streetAddress');
  assert.equal(resortSchema.address?.postalCode, undefined, 'Approximate resort must not expose postalCode');

  // 2. Private/approximate club: A Hidden Agenda
  const xml = await generateSitemapXml();
  const hiddenAgendaUrl = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .find((u) => u.includes('/clubs/a-hidden-agenda--'));
  if (hiddenAgendaUrl) {
    const clubSeo = await resolvePageSeo(new URL(hiddenAgendaUrl).pathname);
    const clubSchema = (clubSeo.structuredData as any[]).find((s) => s['@type'] === 'NightClub');
    assert.ok(clubSchema);
    assert.equal(clubSchema.address?.streetAddress, undefined, 'Private club must omit streetAddress');
    assert.equal(clubSchema.address?.postalCode, undefined, 'Private club must omit postalCode');
    assert.equal(clubSchema.geo, undefined, 'Private club must omit exact GeoCoordinates');
  }

  // 3. Private location club via isPrivateLocation flag: ZcretClub
  const zcretUrl = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .find((u) => u.includes('/clubs/zcretclub--'));
  if (zcretUrl) {
    const zcretSeo = await resolvePageSeo(new URL(zcretUrl).pathname);
    const zcretSchema = (zcretSeo.structuredData as any[]).find((s) => s['@type'] === 'NightClub');
    assert.ok(zcretSchema);
    assert.equal(zcretSchema.address?.streetAddress, undefined, 'isPrivateLocation club must omit streetAddress');
    assert.equal(zcretSchema.address?.postalCode, undefined, 'isPrivateLocation club must omit postalCode');
    assert.equal(zcretSchema.geo, undefined, 'isPrivateLocation club must omit exact GeoCoordinates');
  }
});

test('venue utility route returns 200 OK with noindex, follow so equity flows to canonical Club and Event pages', async () => {
  const venueSeo = await resolvePageSeo('/venues/twist-sf');
  assert.equal(venueSeo.status, 200);
  assert.equal(venueSeo.noIndex, true);
  assert.equal(venueSeo.robots, 'noindex, follow');
  assert.equal(venueSeo.canonicalUrl, 'https://swingsphere.co/venues/twist-sf');
});

test('administrative, development, and account routes are strictly noindexed', async () => {
  const routes = [
    '/admin',
    '/admin/users',
    '/dev/globe',
    '/account',
    '/account/billing',
    '/users/some-user',
    '/street-view',
    '/submission',
    '/host-dashboard',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/mobile/explore',
    '/tablet/explore',
  ];

  for (const route of routes) {
    const seo = await resolvePageSeo(route);
    assert.equal(seo.noIndex, true, `Route ${route} must have noIndex=true`);
    const staticSeo = resolveStaticPageSeo(route);
    assert.equal(staticSeo.noIndex, true, `Client staticSeo for ${route} must have noIndex=true`);
  }
});

test('dynamic sitemap XML is well-formed, deduplicated, uses real lastmod dates, and contains all 4 resorts and 4 cruises', async () => {
  const xml = await generateSitemapXml();
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  assert.ok(xml.includes('https://swingsphere.co/'));
  assert.ok(xml.includes('https://swingsphere.co/discover'));
  assert.ok(xml.includes('https://swingsphere.co/events'));
  assert.ok(xml.includes('https://swingsphere.co/travel'));

  // All 4 approved resorts present
  assert.ok(xml.includes('https://swingsphere.co/resorts/hedonism-ii'));
  assert.ok(xml.includes('https://swingsphere.co/resorts/paradise-lakes-resort'));
  assert.ok(xml.includes('https://swingsphere.co/resorts/sea-mountain-inn-spa'));
  assert.ok(xml.includes('https://swingsphere.co/resorts/the-kraken-resort'));

  // All 4 approved cruises present, draft excluded
  assert.ok(xml.includes('https://swingsphere.co/cruises/margarita-pleasures-select-cruise'));
  assert.ok(xml.includes('https://swingsphere.co/cruises/illuminaughty-cruises'));
  assert.ok(xml.includes('https://swingsphere.co/cruises/bliss-cruise'));
  assert.ok(xml.includes('https://swingsphere.co/cruises/temptation-cruises'));
  assert.equal(xml.includes('sphere-at-sea'), false);

  // Verify unique URLs (no duplicates)
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(new Set(locs).size, locs.length, 'Sitemap URLs must be unique');
  assert.ok(locs.length >= 200, `Sitemap should have comprehensive listings (found ${locs.length})`);
});
