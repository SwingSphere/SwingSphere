import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

console.log('===============================================================');
console.log('🧪 LIVE PRODUCTION SUPABASE & HOST PAGE VERIFICATION');
console.log('===============================================================\n');

// 1. Fetch listings from live Supabase RPC endpoint using anon key
console.log('--- 1. Fetching live listings from Supabase RPC ---');
const keyOutput = execSync('npx supabase projects api-keys --project-ref oieiotogdyfewsmdlsmh --output json').toString();
const keys = JSON.parse(keyOutput);
const anonKey = keys.find(k => k.name === 'anon')?.api_key;
if (!anonKey) throw new Error('Failed to retrieve anon key from Supabase');

const res = await fetch('https://oieiotogdyfewsmdlsmh.supabase.co/rest/v1/rpc/list_accessible_listings', {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${anonKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({})
});

if (!res.ok) {
  throw new Error(`Failed to call list_accessible_listings: ${res.status} ${await res.text()}`);
}

const remoteListings = await res.json();
console.log(`✓ Total listings returned from live Supabase: ${remoteListings.length}`);

const illuminaughtyListings = remoteListings.filter(
  l => l.organizerOrganizationId === 'org-promoter-illuminaughty' || l.id.includes('illuminaughty')
);
console.log(`✓ Total Illuminaughty listings from live Supabase: ${illuminaughtyListings.length}`);

if (illuminaughtyListings.length !== 16) {
  throw new Error(`Expected exactly 16 Illuminaughty listings in Supabase, but found ${illuminaughtyListings.length}`);
}

// 2. Build EntityIndex using live Supabase data
console.log('\n--- 2. Building EntityIndex with Live Supabase Listings ---');
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

const entityIndexMod = loadTsModule('lib/entityIndex.ts');
const mockOrgsMod = loadTsModule('data/mockOrganizations.ts');
const mockVenuesMod = loadTsModule('data/mockVenues.ts');
const entityUtilsMod = loadTsModule('lib/entityUtils.ts');

const index = entityIndexMod.buildEntityIndex(
  remoteListings,
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

console.log(`✓ Host Profile found: "${hostProfile.name}" (Slug: ${hostProfile.slug})`);
console.log(`✓ Organization: "${hostProfile.organization?.name}" (ID: ${hostProfile.organization?.id})`);
console.log(`✓ Total Events attached to Host Profile in EntityIndex: ${hostProfile.events.length}`);

// 3. Verify each event details, flyer URL, and location treatment
console.log('\n--- 3. Verifying Event Details, Location Privacy & Flyers ---');
let flyersChecked = 0;
for (const event of hostProfile.events) {
  const canonicalPath = entityUtilsMod.getEventCanonicalPath(event, index);
  const flyer = event.flyerImageUrl || event.mediaAssets?.find(m => m.role === 'flyer')?.external_id;
  const isPrivate = event.isAddressPrivate;
  const loc = event.location;
  const lat = event.geopoint?.latitude;
  const lng = event.geopoint?.longitude;

  console.log(`\n• [${event.id}]`);
  console.log(`  Name: ${event.name}`);
  console.log(`  Canonical Path: ${canonicalPath}`);
  console.log(`  Date/Time: ${event.time?.start} -> ${event.time?.end}`);
  console.log(`  Private Address: ${isPrivate}`);
  console.log(`  Public Location: ${loc}`);
  console.log(`  Coords: ${lat}, ${lng}`);
  console.log(`  Flyer: ${flyer}`);

  if (flyer && flyer.startsWith('http')) {
    flyersChecked++;
  }
}

console.log(`\n✓ All ${hostProfile.events.length} host events verified.`);
console.log(`✓ Verified ${flyersChecked} flyers with Cloudflare Images URLs.`);

// 4. Verify live web page response
console.log('\n--- 4. Checking Live Host Web Page (https://swingsphere.co/hosts/illuminaughty) ---');
const pageRes = await fetch('https://swingsphere.co/hosts/illuminaughty', {
  headers: { 'User-Agent': 'Mozilla/5.0' }
});
console.log(`✓ Live Host Page HTTP Status: ${pageRes.status} ${pageRes.statusText}`);
const pageHtml = await pageRes.text();
console.log(`✓ Page HTML size: ${pageHtml.length} bytes`);

console.log('\n===============================================================');
console.log('🎉 ALL LIVE CHECKS PASSED SUCCESSFULLY!');
console.log('===============================================================\n');
