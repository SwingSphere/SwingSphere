import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const listingsJsonPath = path.join(rootDir, 'data', 'listings.local.json');
const allListings = JSON.parse(fs.readFileSync(listingsJsonPath, 'utf8'));

const illuminaughtyListings = allListings.filter(l => 
  (l.organizerOrganizationId === 'org-promoter-illuminaughty' || l.ownerOrganizationId === 'org-promoter-illuminaughty') &&
  l.id !== 'event-little-black-dress-santa-cruz-2026-08-29'
);

console.log(`Found ${illuminaughtyListings.length} Illuminaughty listings to ingest into Supabase.`);

if (illuminaughtyListings.length !== 15) {
  console.error(`Expected exactly 15 listings, but found ${illuminaughtyListings.length}. Aborting.`);
  process.exit(1);
}

// Check before count in Supabase
console.log('\n--- Checking Supabase listings BEFORE ingestion ---');
const beforeCountOutput = execSync(
  'npx supabase db query --linked "SELECT count(*) FROM public.listings WHERE owner_organization_id = \'org-promoter-illuminaughty\';"'
).toString();
console.log('Before count in public.listings:', beforeCountOutput);

const sqlLines = [];
sqlLines.push('BEGIN;');
sqlLines.push("SELECT set_config('request.jwt.claim.sub', '4274345f-e3f3-4a5e-a28c-eded7a5d82ed', true);");

const eventIds = [];
for (const listing of illuminaughtyListings) {
  eventIds.push(listing.id);
  const payloadStr = JSON.stringify(listing).replace(/'/g, "''");
  sqlLines.push(`SELECT public.admin_save_listing('${payloadStr}'::jsonb);`);
}

// Update provenance to 'promoter' to match their promoter organization identity
const idListSql = eventIds.map(id => `'${id}'`).join(', ');
sqlLines.push(`UPDATE public.listings SET provenance = 'promoter' WHERE id IN (${idListSql});`);

sqlLines.push('COMMIT;');

const tempSqlPath = path.join(rootDir, 'temp_ingest_illuminaughty.sql');
fs.writeFileSync(tempSqlPath, sqlLines.join('\n\n'), 'utf8');

console.log(`\nGenerated SQL script at ${tempSqlPath}. Executing against linked Supabase...`);

try {
  const result = execSync(`npx supabase db query --linked --file "${tempSqlPath}"`, {
    cwd: rootDir,
    maxBuffer: 50 * 1024 * 1024
  }).toString();
  console.log('Execution completed successfully!');
} catch (err) {
  console.error('Error executing SQL script:', err.message);
  if (err.stdout) console.error(err.stdout.toString());
  if (err.stderr) console.error(err.stderr.toString());
  process.exit(1);
} finally {
  if (fs.existsSync(tempSqlPath)) {
    fs.unlinkSync(tempSqlPath);
  }
}

// Check after count in Supabase
console.log('\n--- Checking Supabase listings AFTER ingestion ---');
const afterCountOutput = execSync(
  'npx supabase db query --linked "SELECT count(*) FROM public.listings WHERE owner_organization_id = \'org-promoter-illuminaughty\';"'
).toString();
console.log('After count in public.listings:', afterCountOutput);

// Check accessible listings count via list_accessible_listings
const accessibleCountOutput = execSync(
  'npx supabase db query --linked "SELECT count(*) FROM public.list_accessible_listings() l WHERE l->>\'organizerOrganizationId\' = \'org-promoter-illuminaughty\';"'
).toString();
console.log('Accessible Illuminaughty count via RPC:', accessibleCountOutput);

// Verify all 16 IDs exist in Supabase
const verifyIdsOutput = execSync(
  'npx supabase db query --linked "SELECT id, name, status, provenance FROM public.listings WHERE owner_organization_id = \'org-promoter-illuminaughty\' ORDER BY id;"'
).toString();
console.log('All Illuminaughty listings in public.listings:\n', verifyIdsOutput);
