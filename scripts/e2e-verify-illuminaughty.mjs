import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

console.log('===============================================================');
console.log('🧪 END-TO-END VERIFICATION: ILLUMINAUGHTY ON SWINGSPHERE');
console.log('===============================================================\n');

// Helper to bundle and run a TS module
const loadTsModule = (entryRelative) => {
  const result = esbuild.buildSync({
    absWorkingDir: rootDir,
    entryPoints: [entryRelative],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    logLevel: 'silent',
    external: ['virtual:*'],
  });
  const mod = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, {
    module: mod,
    exports: mod.exports,
    require,
    console,
    process,
    setTimeout,
    clearTimeout,
  });
  return mod.exports;
};

// 1. Verify data/listings.local.json
console.log('--- 1. Listings Store Validation ---');
const listings = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'listings.local.json'), 'utf8'));
const illEvents = listings.filter((l) => l.organizerOrganizationId === 'org-promoter-illuminaughty');
console.log(`✓ Total Illuminaughty events in listings.local.json: ${illEvents.length}`);
if (illEvents.length !== 15) throw new Error(`Expected 15 events, found ${illEvents.length}`);

// 2. Build EntityIndex & Verify Host Page (/hosts/illuminaughty)
console.log('\n--- 2. Entity Index & Host Page (/hosts/illuminaughty) Verification ---');
const entityIndexMod = loadTsModule('lib/entityIndex.ts');
const mockOrgsMod = loadTsModule('data/mockOrganizations.ts');
const mockVenuesMod = loadTsModule('data/mockVenues.ts');
const entityUtilsMod = loadTsModule('lib/entityUtils.ts');

const index = entityIndexMod.buildEntityIndex(
  listings,
  [], // users
  mockVenuesMod.mockVenues || [],
  mockOrgsMod.mockOrganizations || [],
  [], // relationships
  [], // series
  [] // organizationRelationships
);

const hostProfile = index.hostsBySlug.get('illuminaughty');
if (!hostProfile) {
  throw new Error("Failed to find hostProfile for slug 'illuminaughty' in EntityIndex!");
}
console.log(`✓ Found Host Profile: "${hostProfile.name}" (Slug: ${hostProfile.slug})`);
console.log(`✓ Associated Organization: "${hostProfile.organization?.name}" (ID: ${hostProfile.organization?.id})`);
console.log(`✓ Events attached to Host Profile: ${hostProfile.events.length}`);
if (hostProfile.events.length < 15) {
  throw new Error(`Expected at least 15 events on host profile, got ${hostProfile.events.length}`);
}

// 3. Verify Event Detail Routes (/events/:slug)
console.log('\n--- 3. Event Detail Route (/events/:slug) Resolution Audit ---');
const canonicalSlugs = [];
for (const event of illEvents) {
  const canonicalPath = entityUtilsMod.getEventCanonicalPath(event, index);
  const slug = canonicalPath.replace('/events/', '');
  canonicalSlugs.push({ id: event.id, name: event.name, path: canonicalPath, slug });

  // Simulate EventPage resolution
  const key = slug.includes('--') ? slug.split('--').pop() : slug;
  const resolved = index.eventsByKey.get(key);
  if (!resolved || resolved.id !== event.id) {
    throw new Error(`Failed to resolve event detail page for slug "${slug}" (key: "${key}")! Resolved: ${resolved?.id}`);
  }
}
console.log(`✓ All 15 event detail pages resolved uniquely and bidirectionally:`);
canonicalSlugs.slice(0, 5).forEach((s) => console.log(`   - ${s.path}`));
console.log(`   ... and ${canonicalSlugs.length - 5} more`);

// 4. Directory Results Simulation
console.log('\n--- 4. Directory & Search Results Simulation ---');
const allApprovedEvents = listings.filter((l) => l.type === 'event' && l.status === 'approved');
console.log(`✓ Total approved events in directory: ${allApprovedEvents.length}`);

const directoryIllEvents = allApprovedEvents.filter((l) => l.organizerOrganizationId === 'org-promoter-illuminaughty');
console.log(`✓ Illuminaughty events appearing in directory: ${directoryIllEvents.length} / 15`);
if (directoryIllEvents.length !== 15) {
  throw new Error(`Directory event count mismatch! Found ${directoryIllEvents.length}`);
}

// Search queries simulation
const searchTerms = ['illuminaughty', 'halloween', 'cruise', 'pajama', 'masquerade', 'las vegas'];
for (const term of searchTerms) {
  const matches = directoryIllEvents.filter((e) =>
    e.name.toLowerCase().includes(term) ||
    e.description_full?.toLowerCase().includes(term) ||
    e.location?.toLowerCase().includes(term) ||
    e.tags?.some((t) => t.toLowerCase().includes(term))
  );
  console.log(`   - Search "${term}": ${matches.length} matching Illuminaughty events found`);
}

// 5. Globe & Map Placement Verification
console.log('\n--- 5. Globe & Map Spatial Marker Verification ---');
for (const event of illEvents) {
  const lat = event.geopoint?.latitude;
  const lng = event.geopoint?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    throw new Error(`Invalid coordinates on event ${event.id}: [${lat}, ${lng}]`);
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error(`Coordinates out of bounds on event ${event.id}: [${lat}, ${lng}]`);
  }
}
console.log('✓ All 15 events have valid WGS84 geographic coordinates for Globe and MapLibre rendering.');

// 6. Media Integrity Check
console.log('\n--- 6. Media Integrity & Live Cloudflare Headers ---');
const flyerUrls = illEvents.map((e) => ({
  name: e.name,
  city: e.geopoint.address.city,
  url: e.flyerImageUrl,
}));

let verifiedCount = 0;
for (const item of flyerUrls) {
  const head = await fetch(item.url, { method: 'HEAD' });
  if (head.status !== 200) {
    throw new Error(`Broken image URL: ${item.url} returned status ${head.status}`);
  }
  verifiedCount += 1;
}
console.log(`✓ Verified ${verifiedCount}/15 live Cloudflare flyer images (HTTP 200 OK).`);

console.log('\n===============================================================');
console.log('✅ ALL VERIFICATION CHECKS PASSED WITH 100% SUCCESS!');
console.log('===============================================================');
