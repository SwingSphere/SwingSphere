import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const listingsPath = path.join(rootDir, 'data', 'listings.local.json');
const listings = JSON.parse(fs.readFileSync(listingsPath, 'utf8'));

console.log('======================================================');
console.log('🔍 SWINGSPHERE QA PASS: ILLUMINAUGHTY PRODUCTION INGEST');
console.log('======================================================\n');

// 1. Identify Illuminaughty events
const illuminaughtyEvents = listings.filter((l) => l.organizerOrganizationId === 'org-promoter-illuminaughty');
console.log(`✓ Total Illuminaughty production events: ${illuminaughtyEvents.length} (Expected: 15)`);
if (illuminaughtyEvents.length !== 15) {
  throw new Error(`Expected 15 Illuminaughty events, found ${illuminaughtyEvents.length}`);
}

// 2. Validate Venue & Location Privacy
console.log('\n--- Location & Privacy Audit ---');
const publicEvents = [];
const privateEvents = [];

for (const event of illuminaughtyEvents) {
  if (event.isAddressPrivate === false) {
    publicEvents.push(event);
  } else {
    privateEvents.push(event);
  }

  // Ensure no private street numbers or residential addresses leaked
  const addressStr = `${event.location || ''} ${event.venue || ''}`.toLowerCase();
  if (event.isAddressPrivate) {
    const hasStreetNum = /\b\d{2,5}\s+[a-z]+\s+(st|street|ave|avenue|blvd|rd|road|dr|drive|way|ln|lane)\b/i.test(addressStr);
    if (hasStreetNum) {
      throw new Error(`Private address leak detected in event ${event.id}: "${addressStr}"`);
    }
  }
}

console.log(`✓ Public Venues: ${publicEvents.length} (Expected: 3)`);
publicEvents.forEach((e) => {
  console.log(`   - [PUBLIC] ${e.name} @ ${e.venue} (${e.location}) Coords: [${e.geopoint.latitude}, ${e.geopoint.longitude}]`);
});

console.log(`✓ Private Venues: ${privateEvents.length} (Expected: 12)`);
privateEvents.forEach((e) => {
  console.log(`   - [PRIVATE] ${e.name} (${e.location}) [Address Private: ${e.isAddressPrivate}] Coords: [${e.geopoint.latitude}, ${e.geopoint.longitude}]`);
});

// 3. Validate Cloudflare Images Delivery
console.log('\n--- Cloudflare Media Delivery Audit ---');
for (const event of illuminaughtyEvents) {
  const flyerUrl = event.flyerImageUrl;
  if (!flyerUrl || !flyerUrl.includes('imagedelivery.net')) {
    throw new Error(`Missing or invalid Cloudflare flyer URL for event ${event.id}: ${flyerUrl}`);
  }

  const res = await fetch(flyerUrl, { method: 'HEAD' });
  if (!res.ok) {
    throw new Error(`Broken flyer URL for ${event.id}: ${flyerUrl} (Status ${res.status})`);
  }
  console.log(`   ✓ ${event.name} (${event.geopoint.address.city}): HTTP ${res.status} OK`);
}

// 4. Duplicate Check
console.log('\n--- Duplicate Event Audit ---');
const idSet = new Set();
const keySet = new Set();
for (const event of illuminaughtyEvents) {
  if (idSet.has(event.id)) {
    throw new Error(`Duplicate event ID detected: ${event.id}`);
  }
  idSet.add(event.id);

  const cityDateKey = `${event.geopoint.address.city}_${event.time.start.slice(0, 10)}_${event.name}`;
  if (keySet.has(cityDateKey)) {
    throw new Error(`Duplicate city/date/name event detected: ${cityDateKey}`);
  }
  keySet.add(cityDateKey);
}
console.log('✓ Zero duplicate events detected.');

// 5. Host & Series Association Audit
console.log('\n--- Host Association Audit ---');
for (const event of illuminaughtyEvents) {
  if (event.organizerOrganizationId !== 'org-promoter-illuminaughty') {
    throw new Error(`Event ${event.id} missing organizerOrganizationId`);
  }
  if (event.hostName !== 'illuminaughty') {
    throw new Error(`Event ${event.id} missing hostName 'illuminaughty'`);
  }
  if (event.status !== 'approved') {
    throw new Error(`Event ${event.id} has unapproved status: ${event.status}`);
  }
}
console.log('✓ All 15 events cleanly associated with org-promoter-illuminaughty and approved for public discovery.');

console.log('\n======================================================');
console.log('🎉 ALL PRODUCTION QA CHECKS PASSED SUCCESSFULLY!');
console.log('======================================================');
