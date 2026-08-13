import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'data', 'listings.local.json');
const listings = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

if (!Array.isArray(listings) || listings.length === 0) {
  throw new Error('data/listings.local.json must contain at least one listing.');
}

const invalid = listings.filter((listing) => (
  !listing
  || !['club', 'event'].includes(listing.type)
  || !String(listing.id ?? '').trim()
  || !String(listing.name ?? '').trim()
));
if (invalid.length) {
  throw new Error(`Refusing to import: ${invalid.length} listing record(s) are missing an id, type, or name.`);
}

const payload = JSON.stringify(listings);
const dollarTag = '$swingsphere_legacy_catalog$';
if (payload.includes(dollarTag)) {
  throw new Error('Legacy catalog unexpectedly contains the SQL dollar-quote delimiter.');
}

const expectedCount = listings.length;
const sql = `
begin;

select set_config(
  'request.jwt.claim.sub',
  (
    select id::text
    from public.profiles
    where role = 'admin' and status = 'active'
    order by created_at
    limit 1
  ),
  true
);

DO $admin_guard$
begin
  if auth.uid() is null or not private.is_active_admin(auth.uid()) then
    raise exception 'An active admin profile is required for the legacy listing import.';
  end if;
end;
$admin_guard$;

select public.admin_import_legacy_listings(
  ${dollarTag}${payload}${dollarTag}::jsonb
);

DO $verify$
declare
  v_count integer;
  v_imported integer;
begin
  select count(*)::integer into v_count
  from public.listings
  where provenance = 'legacy';

  select legacy_import_count into v_imported
  from public.listing_store_settings
  where singleton = true;

  if v_count < ${expectedCount} or v_imported < ${expectedCount} then
    raise exception 'Legacy listing backfill verification failed. Expected at least %, found %.', ${expectedCount}, v_count;
  end if;
end;
$verify$;

commit;
`;

const tempPath = path.join(os.tmpdir(), `swingsphere-listing-backfill-${process.pid}.sql`);
fs.writeFileSync(tempPath, sql, 'utf8');

try {
  console.log(`Backfilling ${expectedCount} canonical listing records into linked Supabase…`);
  const result = spawnSync(
    'supabase',
    ['db', 'query', '--linked', '--file', tempPath, '--output', 'table'],
    {
      cwd: root,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`Supabase listing backfill failed with exit code ${result.status ?? 'unknown'}.`);
  }

  console.log(`Legacy listing backfill verified (${expectedCount} source records).`);
} finally {
  try { fs.unlinkSync(tempPath); } catch { /* temp cleanup is best-effort */ }
}
