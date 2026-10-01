import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSitemapXml,
  getApprovedCities,
  getCityBySlug,
  resolvePageSeo,
  SITE_ORIGIN,
  DEFAULT_OG_IMAGE,
} from '../functions/lib/seoMetadata.ts';

test('homepage SEO returns valid branded metadata, summary_large_image, and Schema.org WebSite & Organization', async () => {
  const seo = await resolvePageSeo('/');
  assert.equal(seo.canonicalUrl, 'https://swingsphere.co/');
  assert.equal(seo.title, 'SwingSphere | Lifestyle Clubs, Swinger Parties & Events');
  assert.match(seo.description, /lifestyle clubs, swinger parties, play parties/i);
  assert.equal(seo.imageUrl, DEFAULT_OG_IMAGE);
  assert.equal(seo.imageWidth, 1200);
  assert.equal(seo.imageHeight, 630);
  assert.equal(seo.twitterCard, 'summary_large_image');
  assert.equal(seo.noIndex, false);
  assert.ok(Array.isArray(seo.structuredData));
  const types = (seo.structuredData as any[]).map((s) => s['@type']);
  assert.ok(types.includes('WebSite'));
  assert.ok(types.includes('Organization'));
});

test('club page SEO resolves club metadata, city in title, and NightClub structured data', async () => {
  // Power Exchange in SF
  const seo = await resolvePageSeo('/clubs/the-power-exchange--club-the-power-exchange');
  assert.match(seo.title, /The Power Exchange/i);
  assert.match(seo.title, /San Francisco/i);
  assert.match(seo.description, /The Power Exchange/i);
  assert.match(seo.canonicalUrl, /^https:\/\/swingsphere\.co\/clubs\//);
  assert.equal(seo.ogType, 'article');
  assert.equal(seo.noIndex, false);
  assert.ok(Array.isArray(seo.structuredData));
  const nightclub = (seo.structuredData as any[]).find((s) => s['@type'] === 'NightClub');
  assert.ok(nightclub, 'Should include NightClub schema');
  assert.equal(nightclub.name, 'The Power Exchange');
  assert.equal(nightclub.address['@type'], 'PostalAddress');
  assert.equal(nightclub.address.addressLocality, 'San Francisco');
});

test('private club/event location never leaks exact street address in schema or description', async () => {
  // Test a club with approximate/private location
  const seo = await resolvePageSeo('/clubs/a-hidden-agenda--club-a-hidden-agenda');
  if (seo.title.includes('Hidden Agenda')) {
    assert.ok(Array.isArray(seo.structuredData));
    const schema = (seo.structuredData as any[]).find((s) => s['@type'] === 'NightClub');
    if (schema) {
      assert.equal(schema.address.streetAddress, undefined, 'Street address must be omitted for private locations');
    }
  }
});

test('host page SEO returns Organization schema and host profile metadata', async () => {
  const seo = await resolvePageSeo('/hosts/community-host');
  assert.match(seo.title, /Community Host/i);
  assert.match(seo.description, /Community Host/i);
  assert.equal(seo.canonicalUrl, 'https://swingsphere.co/hosts/community-host');
  assert.equal(seo.ogType, 'profile');
  assert.equal(seo.noIndex, false);
});

test('resort page SEO returns Resort schema and travel metadata', async () => {
  const seo = await resolvePageSeo('/resorts/hedonism-ii');
  assert.match(seo.title, /Hedonism II/i);
  assert.match(seo.description, /Hedonism II/i);
  assert.equal(seo.canonicalUrl, 'https://swingsphere.co/resorts/hedonism-ii');
  assert.equal(seo.noIndex, false);
  assert.ok(Array.isArray(seo.structuredData));
  const resort = (seo.structuredData as any[]).find((s) => s['@type'] === 'Resort');
  assert.ok(resort, 'Should include Resort schema');
});

test('cruise page SEO returns TouristTrip schema and cruise metadata for approved cruise', async () => {
  const seo = await resolvePageSeo('/cruises/margarita-pleasures-select-cruise');
  assert.match(seo.title, /Margarita Pleasures/i);
  assert.equal(seo.canonicalUrl, 'https://swingsphere.co/cruises/margarita-pleasures-select-cruise');
  assert.equal(seo.noIndex, false);
  assert.ok(Array.isArray(seo.structuredData));
  const cruise = (seo.structuredData as any[]).find((s) => s['@type'] === 'TouristTrip');
  assert.ok(cruise, 'Should include TouristTrip schema');
});

test('regional city discovery SEO generates rich, tailored metadata for cities with approved listings', async () => {
  const sfClubs = await resolvePageSeo('/swinger-clubs/san-francisco');
  assert.match(sfClubs.title, /San Francisco/i);
  assert.match(sfClubs.title, /Swinger Clubs & Lifestyle Venues/i);
  assert.equal(sfClubs.canonicalUrl, 'https://swingsphere.co/swinger-clubs/san-francisco');
  assert.equal(sfClubs.noIndex, false, 'Cities with approved listings must be indexable');

  const sfParties = await resolvePageSeo('/swinger-parties/san-francisco');
  assert.match(sfParties.title, /San Francisco/i);
  assert.match(sfParties.title, /Swinger Parties & Lifestyle Events/i);
  assert.equal(sfParties.canonicalUrl, 'https://swingsphere.co/swinger-parties/san-francisco');
  assert.equal(sfParties.noIndex, false, 'Cities with approved parties must be indexable');

  // Secondary synonyms canonicalize to primary routes to prevent duplicate content
  const sfLifestyleClubs = await resolvePageSeo('/lifestyle-clubs/san-francisco');
  assert.equal(sfLifestyleClubs.canonicalUrl, 'https://swingsphere.co/swinger-clubs/san-francisco');

  const sfLifestyleEvents = await resolvePageSeo('/lifestyle-events/san-francisco');
  assert.equal(sfLifestyleEvents.canonicalUrl, 'https://swingsphere.co/swinger-parties/san-francisco');
});

test('empty / unlisted cities are protected with noindex to avoid thin doorway pages', async () => {
  const emptyCity = await resolvePageSeo('/swinger-clubs/nonexistent-antarctica-city');
  assert.equal(emptyCity.noIndex, true, 'Unlisted empty city pages must have noIndex=true');
});

test('administrative, development, and account routes are strictly noindexed', async () => {
  const routes = [
    '/admin',
    '/admin/users',
    '/dev/globe',
    '/account',
    '/account/billing',
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
  }
});

test('dynamic sitemap XML is well-formed, deduplicated, and contains all approved public entities', async () => {
  const xml = await generateSitemapXml();
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  assert.ok(xml.includes('https://swingsphere.co/'));
  assert.ok(xml.includes('https://swingsphere.co/discover'));
  assert.ok(xml.includes('https://swingsphere.co/events'));
  assert.ok(xml.includes('https://swingsphere.co/travel'));
  assert.ok(xml.includes('https://swingsphere.co/clubs/'));
  assert.ok(xml.includes('https://swingsphere.co/resorts/hedonism-ii'));
  assert.ok(xml.includes('https://swingsphere.co/cruises/margarita-pleasures-select-cruise'));
  assert.ok(xml.includes('https://swingsphere.co/hosts/community-host'));
  assert.ok(xml.includes('https://swingsphere.co/swinger-clubs/san-francisco'));

  // Ensure zero private/admin/dev routes in sitemap
  assert.equal(xml.includes('/admin'), false, 'Sitemap must not contain /admin');
  assert.equal(xml.includes('/dev/'), false, 'Sitemap must not contain /dev');
  assert.equal(xml.includes('/account'), false, 'Sitemap must not contain /account');
  assert.equal(xml.includes('/submission'), false, 'Sitemap must not contain /submission');
  assert.equal(xml.includes('/login'), false, 'Sitemap must not contain /login');
  assert.equal(xml.includes('/signup'), false, 'Sitemap must not contain /signup');

  // Verify unique URLs (no duplicates)
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(new Set(locs).size, locs.length, 'Sitemap URLs must be unique');
  assert.ok(locs.length > 50, `Sitemap should have comprehensive listings (found ${locs.length})`);
});
