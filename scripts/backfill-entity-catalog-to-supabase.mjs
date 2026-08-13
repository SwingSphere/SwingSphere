import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const loadTsModule = (entryPoint) => {
  const result = esbuild.buildSync({
    absWorkingDir: root,
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    logLevel: 'silent',
  });
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, {
    module,
    exports: module.exports,
    require,
    console,
    process,
    setTimeout,
    clearTimeout,
  });
  return module.exports;
};

const organizationsModule = loadTsModule('data/mockOrganizations.ts');
const venuesModule = loadTsModule('data/mockVenues.ts');
const relationshipsModule = loadTsModule('data/mockEntityRelationships.ts');
const organizationRelationshipsModule = loadTsModule('data/organizationRelationships.ts');
const eventSeriesModule = loadTsModule('data/eventSeries.ts');
const clubBrandsModule = loadTsModule('data/clubBrands.ts');
const travelModule = loadTsModule('data/travelExperiences.ts');

// Import only curated production candidates. Compatibility test/demo entities and
// explicit preview fixtures stay local and never become public production data.
const allowedOrganizationIds = new Set([
  'org-club-twist-sf',
  'org-club-power-exchange-sf',
  'org-club-club-joi-la',
  'org-promoter-illuminaughty',
  'org-promoter-mumbai-velvet',
  'org-promoter-sinful-house',
  'org-promoter-margarita-pleasures',
  'org-promoter-bronze-party',
  'org-promoter-her-fantasy-party',
  'org-operator-modern-lifestyle-events',
  'org-promoter-allures',
]);

const organizations = organizationsModule.mockOrganizations
  .filter((item) => allowedOrganizationIds.has(item.id))
  .map((item) => ({
    id: item.id,
    name: item.name,
    slug: item.slug,
    display_types: item.displayTypes ?? [],
    description_short: item.descriptionShort ?? null,
    description_full: item.descriptionFull ?? null,
    website: item.website ?? null,
    instagram: item.instagram ?? null,
    fetlife: item.fetlife ?? null,
    contact_email: item.contactEmail ?? null,
    logo_image_url: item.logoImageUrl ?? null,
    header_image_url: item.headerImageUrl ?? null,
    gallery_image_urls: item.galleryImageUrls ?? [],
    operating_regions: item.operatingRegions ?? [],
    globe_presence: item.globePresence ?? null,
    standards: item.standards ?? [],
    status: item.status,
  }));

const venues = venuesModule.mockVenues.map((item) => ({
  id: item.id,
  name: item.name,
  slug: item.slug,
  description: item.description ?? null,
  address: item.address ?? {},
  latitude: item.latitude,
  longitude: item.longitude,
  location_meta: item.locationMeta ?? null,
  visibility: item.visibility,
  status: item.status,
  amenities: item.amenities ?? [],
  parking_notes: item.parkingNotes ?? null,
  accessibility_notes: item.accessibilityNotes ?? null,
  logo_image_url: item.logoImageUrl ?? null,
  header_image_url: item.headerImageUrl ?? null,
  gallery_image_urls: item.galleryImageUrls ?? [],
  building_asset_id: item.buildingAssetId ?? null,
}));

const venueIds = new Set(venues.map((item) => item.id));
const relationships = relationshipsModule.mockOrganizationVenueRelationships
  .filter((item) => allowedOrganizationIds.has(item.organizationId) && venueIds.has(item.venueId))
  .map((item) => ({
    id: item.id,
    organization_id: item.organizationId,
    venue_id: item.venueId,
    relationship_type: item.relationshipType,
    label: item.label ?? null,
    starts_at: item.startsAt ?? null,
    ends_at: item.endsAt ?? null,
    is_primary: item.isPrimary ?? false,
    confidence: item.confidence ?? null,
    notes: item.notes ?? null,
  }));

const organizationRelationships = organizationRelationshipsModule.organizationRelationships
  .filter((item) => allowedOrganizationIds.has(item.sourceOrganizationId) && allowedOrganizationIds.has(item.targetOrganizationId))
  .map((item) => ({
    source_organization_id: item.sourceOrganizationId,
    target_organization_id: item.targetOrganizationId,
    relationship_type: item.relationshipType,
    label: item.label ?? null,
    starts_at: item.startsAt ?? null,
    ends_at: item.endsAt ?? null,
    is_primary: item.isPrimary ?? false,
    notes: item.notes ?? null,
  }));

const eventSeries = eventSeriesModule.eventSeries.map((item) => {
  let defaultVenueId = item.defaultVenueId ?? null;
  if (defaultVenueId && !venueIds.has(defaultVenueId) && venueIds.has(`venue-${defaultVenueId}`)) {
    defaultVenueId = `venue-${defaultVenueId}`;
  }
  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    organizer_organization_id: item.organizerOrganizationId ?? null,
    description_short: item.descriptionShort ?? null,
    description_full: item.descriptionFull ?? null,
    logo_image_url: item.logoImageUrl ?? null,
    header_image_url: item.headerImageUrl ?? null,
    default_venue_id: defaultVenueId,
    default_tags: item.defaultTags ?? [],
    status: item.status,
    posted_by_user_id: null,
  };
});

const clubBrands = clubBrandsModule.clubBrands.map((item) => ({
  id: item.id,
  name: item.name,
  slug: item.slug,
  operator_organization_id: item.operatorOrganizationId ?? null,
  description_short: item.descriptionShort ?? null,
  description_full: item.descriptionFull ?? null,
  logo_image_url: item.logoImageUrl ?? null,
  header_image_url: item.headerImageUrl ?? null,
  default_amenities: item.defaultAmenities ?? [],
  status: item.status,
}));

const resorts = travelModule.resorts
  .filter((item) => item.status === 'approved' && !item.id.includes('preview'))
  .map((item) => ({
    id: item.id,
    slug: item.slug,
    name: item.name,
    operator_organization_id: item.operatorOrganizationId ?? null,
    description_short: item.descriptionShort,
    description_full: item.descriptionFull,
    geopoint: item.geopoint,
    location_visibility: item.locationVisibility ?? null,
    resort_style: item.resortStyle,
    audience_label: item.audienceLabel,
    accommodation_summary: item.accommodationSummary,
    stay_length_summary: item.stayLengthSummary ?? null,
    booking_url: item.bookingUrl ?? null,
    contact_email: item.contactEmail ?? null,
    amenities: item.amenities ?? [],
    experience_highlights: item.experienceHighlights ?? [],
    access_notes: item.accessNotes ?? [],
    transportation_notes: item.transportationNotes ?? [],
    logo_image_url: item.logoImageUrl ?? null,
    header_image_url: item.headerImageUrl ?? null,
    gallery_image_urls: item.galleryImageUrls ?? [],
    status: item.status,
  }));

const cruiseSeries = travelModule.cruiseSeries.filter((item) => item.status === 'approved' && !item.id.includes('preview'));
const cruiseSailings = travelModule.cruiseSailings.filter((item) => item.status === 'approved' && !item.id.includes('preview'));

if (organizations.length !== allowedOrganizationIds.size) {
  throw new Error(`Expected ${allowedOrganizationIds.size} curated organizations, found ${organizations.length}.`);
}
if (venues.length !== 3 || relationships.length !== 3 || organizationRelationships.length !== 2 || eventSeries.length !== 3 || clubBrands.length !== 5 || resorts.length !== 1) {
  throw new Error('Curated entity source counts changed. Review the backfill allowlist before importing.');
}
if (cruiseSeries.length || cruiseSailings.length) {
  throw new Error('Approved cruise records now exist in preview fixtures. Review them manually before production import.');
}

const dollar = (tag, value) => {
  const delimiter = `$${tag}$`;
  const json = JSON.stringify(value);
  if (json.includes(delimiter)) throw new Error(`Payload contains SQL delimiter ${delimiter}.`);
  return `${delimiter}${json}${delimiter}::jsonb`;
};

const sql = `
begin;

insert into public.organizations (
  id,name,slug,display_types,description_short,description_full,website,instagram,fetlife,
  contact_email,logo_image_url,header_image_url,gallery_image_urls,operating_regions,
  globe_presence,standards,status
)
select id,name,slug,display_types,description_short,description_full,website,instagram,fetlife,
  contact_email,logo_image_url,header_image_url,gallery_image_urls,operating_regions,
  globe_presence,standards,status
from jsonb_populate_recordset(null::public.organizations, ${dollar('organizations', organizations)})
on conflict (id) do update set
  name=excluded.name, slug=excluded.slug, display_types=excluded.display_types,
  description_short=excluded.description_short, description_full=excluded.description_full,
  website=excluded.website, instagram=excluded.instagram, fetlife=excluded.fetlife,
  contact_email=excluded.contact_email,
  logo_image_url=coalesce(excluded.logo_image_url, public.organizations.logo_image_url),
  header_image_url=coalesce(excluded.header_image_url, public.organizations.header_image_url),
  gallery_image_urls=case when cardinality(excluded.gallery_image_urls) > 0 then excluded.gallery_image_urls else public.organizations.gallery_image_urls end,
  operating_regions=excluded.operating_regions, globe_presence=excluded.globe_presence,
  standards=excluded.standards, status=excluded.status;

insert into public.venues (
  id,name,slug,description,address,latitude,longitude,location_meta,visibility,status,
  amenities,parking_notes,accessibility_notes,logo_image_url,header_image_url,
  gallery_image_urls,building_asset_id
)
select id,name,slug,description,address,latitude,longitude,location_meta,visibility,status,
  amenities,parking_notes,accessibility_notes,logo_image_url,header_image_url,
  gallery_image_urls,building_asset_id
from jsonb_populate_recordset(null::public.venues, ${dollar('venues', venues)})
on conflict (id) do update set
  name=excluded.name, slug=excluded.slug, description=excluded.description,
  address=excluded.address, latitude=excluded.latitude, longitude=excluded.longitude,
  location_meta=excluded.location_meta, visibility=excluded.visibility, status=excluded.status,
  amenities=excluded.amenities, parking_notes=excluded.parking_notes,
  accessibility_notes=excluded.accessibility_notes,
  logo_image_url=coalesce(excluded.logo_image_url, public.venues.logo_image_url),
  header_image_url=coalesce(excluded.header_image_url, public.venues.header_image_url),
  gallery_image_urls=case when cardinality(excluded.gallery_image_urls) > 0 then excluded.gallery_image_urls else public.venues.gallery_image_urls end,
  building_asset_id=excluded.building_asset_id;

insert into public.organization_venue_relationships (
  id,organization_id,venue_id,relationship_type,label,starts_at,ends_at,is_primary,confidence,notes
)
select id,organization_id,venue_id,relationship_type,label,starts_at,ends_at,is_primary,confidence,notes
from jsonb_populate_recordset(null::public.organization_venue_relationships, ${dollar('relationships', relationships)})
on conflict (id) do update set
  organization_id=excluded.organization_id, venue_id=excluded.venue_id,
  relationship_type=excluded.relationship_type, label=excluded.label,
  starts_at=excluded.starts_at, ends_at=excluded.ends_at, is_primary=excluded.is_primary,
  confidence=excluded.confidence, notes=excluded.notes;

insert into public.organization_relationships (
  source_organization_id,target_organization_id,relationship_type,label,starts_at,ends_at,is_primary,notes
)
select source_organization_id,target_organization_id,relationship_type,label,starts_at,ends_at,is_primary,notes
from jsonb_populate_recordset(null::public.organization_relationships, ${dollar('organizationrelationships', organizationRelationships)})
on conflict (source_organization_id,target_organization_id,relationship_type) do update set
  label=excluded.label, starts_at=excluded.starts_at, ends_at=excluded.ends_at,
  is_primary=excluded.is_primary, notes=excluded.notes;

insert into public.event_series (
  id,name,slug,organizer_organization_id,description_short,description_full,logo_image_url,
  header_image_url,default_venue_id,default_tags,status,posted_by_user_id
)
select id,name,slug,organizer_organization_id,description_short,description_full,logo_image_url,
  header_image_url,default_venue_id,default_tags,status,posted_by_user_id
from jsonb_populate_recordset(null::public.event_series, ${dollar('eventseries', eventSeries)})
on conflict (id) do update set
  name=excluded.name, slug=excluded.slug, organizer_organization_id=excluded.organizer_organization_id,
  description_short=excluded.description_short, description_full=excluded.description_full,
  logo_image_url=coalesce(excluded.logo_image_url, public.event_series.logo_image_url),
  header_image_url=coalesce(excluded.header_image_url, public.event_series.header_image_url),
  default_venue_id=excluded.default_venue_id, default_tags=excluded.default_tags,
  status=excluded.status;

insert into public.club_brands (
  id,name,slug,operator_organization_id,description_short,description_full,logo_image_url,
  header_image_url,default_amenities,status
)
select id,name,slug,operator_organization_id,description_short,description_full,logo_image_url,
  header_image_url,default_amenities,status
from jsonb_populate_recordset(null::public.club_brands, ${dollar('clubbrands', clubBrands)})
on conflict (id) do update set
  name=excluded.name, slug=excluded.slug, operator_organization_id=excluded.operator_organization_id,
  description_short=excluded.description_short, description_full=excluded.description_full,
  logo_image_url=coalesce(excluded.logo_image_url, public.club_brands.logo_image_url),
  header_image_url=coalesce(excluded.header_image_url, public.club_brands.header_image_url),
  default_amenities=excluded.default_amenities, status=excluded.status;

insert into public.resorts (
  id,slug,name,operator_organization_id,description_short,description_full,geopoint,
  location_visibility,resort_style,audience_label,accommodation_summary,stay_length_summary,
  booking_url,contact_email,amenities,experience_highlights,access_notes,transportation_notes,
  logo_image_url,header_image_url,gallery_image_urls,status
)
select id,slug,name,operator_organization_id,description_short,description_full,geopoint,
  location_visibility,resort_style,audience_label,accommodation_summary,stay_length_summary,
  booking_url,contact_email,amenities,experience_highlights,access_notes,transportation_notes,
  logo_image_url,header_image_url,gallery_image_urls,status
from jsonb_populate_recordset(null::public.resorts, ${dollar('resorts', resorts)})
on conflict (id) do update set
  slug=excluded.slug, name=excluded.name, operator_organization_id=excluded.operator_organization_id,
  description_short=excluded.description_short, description_full=excluded.description_full,
  geopoint=excluded.geopoint, location_visibility=excluded.location_visibility,
  resort_style=excluded.resort_style, audience_label=excluded.audience_label,
  accommodation_summary=excluded.accommodation_summary, stay_length_summary=excluded.stay_length_summary,
  booking_url=excluded.booking_url, contact_email=excluded.contact_email, amenities=excluded.amenities,
  experience_highlights=excluded.experience_highlights, access_notes=excluded.access_notes,
  transportation_notes=excluded.transportation_notes, logo_image_url=excluded.logo_image_url,
  header_image_url=excluded.header_image_url, gallery_image_urls=excluded.gallery_image_urls,
  status=excluded.status;

DO $verify$
declare
  v_org integer;
  v_venue integer;
  v_rel integer;
  v_org_rel integer;
  v_series integer;
  v_brand integer;
  v_resort integer;
begin
  select count(*) into v_org from public.organizations where id = any(array[${organizations.map((item) => `'${item.id.replaceAll("'", "''")}'`).join(',')}]);
  select count(*) into v_venue from public.venues where id = any(array[${venues.map((item) => `'${item.id.replaceAll("'", "''")}'`).join(',')}]);
  select count(*) into v_rel from public.organization_venue_relationships where id = any(array[${relationships.map((item) => `'${item.id.replaceAll("'", "''")}'`).join(',')}]);
  select count(*) into v_org_rel from public.organization_relationships where (source_organization_id,target_organization_id,relationship_type) in (${organizationRelationships.map((item) => `('${item.source_organization_id.replaceAll("'", "''")}','${item.target_organization_id.replaceAll("'", "''")}','${item.relationship_type.replaceAll("'", "''")}')`).join(',')});
  select count(*) into v_series from public.event_series where id = any(array[${eventSeries.map((item) => `'${item.id.replaceAll("'", "''")}'`).join(',')}]);
  select count(*) into v_brand from public.club_brands where id = any(array[${clubBrands.map((item) => `'${item.id.replaceAll("'", "''")}'`).join(',')}]);
  select count(*) into v_resort from public.resorts where id = any(array[${resorts.map((item) => `'${item.id.replaceAll("'", "''")}'`).join(',')}]);
  if v_org <> ${organizations.length} or v_venue <> ${venues.length} or v_rel <> ${relationships.length}
     or v_org_rel <> ${organizationRelationships.length} or v_series <> ${eventSeries.length} or v_brand <> ${clubBrands.length} or v_resort <> ${resorts.length} then
    raise exception 'Entity catalog verification failed: org %, venue %, venue-rel %, org-rel %, series %, brand %, resort %',
      v_org, v_venue, v_rel, v_org_rel, v_series, v_brand, v_resort;
  end if;
end;
$verify$;

commit;
`;

const tempPath = path.join(os.tmpdir(), `swingsphere-entity-catalog-backfill-${process.pid}.sql`);
fs.writeFileSync(tempPath, sql, 'utf8');

try {
  console.log(`Backfilling curated entity catalog: ${organizations.length} organizations, ${venues.length} venues, ${relationships.length} venue relationships, ${organizationRelationships.length} organization relationships, ${eventSeries.length} event series, ${clubBrands.length} club brands, ${resorts.length} resorts.`);
  const result = spawnSync('supabase', ['db', 'query', '--linked', '--file', tempPath, '--output', 'table'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`Entity catalog backfill failed with exit code ${result.status ?? 'unknown'}.`);
  console.log('Curated entity catalog backfill verified. Preview/test fixtures were not imported.');
} finally {
  try { fs.unlinkSync(tempPath); } catch { /* best effort */ }
}
