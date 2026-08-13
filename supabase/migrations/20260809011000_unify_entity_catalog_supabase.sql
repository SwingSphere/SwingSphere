-- Unify SwingSphere organizations, venues, event-series, club-brand, and travel
-- administration around canonical Supabase tables.
--
-- This is additive except for correcting club_brands text identifiers. The
-- production club_brands table was empty before this migration; converting its
-- UUID columns to text aligns it with the established text organization/entity
-- IDs used everywhere else in SwingSphere.

-- Organizations: preserve the richer frontend profile instead of dropping it.
alter table public.organizations
  add column if not exists instagram text,
  add column if not exists fetlife text,
  add column if not exists operating_regions text[] not null default '{}',
  add column if not exists globe_presence jsonb,
  add column if not exists standards text[] not null default '{}';

-- Canonical venues -----------------------------------------------------------
create table if not exists public.venues (
  id text primary key,
  name text not null,
  slug text not null unique,
  description text,
  address jsonb not null default '{}'::jsonb,
  latitude double precision not null,
  longitude double precision not null,
  location_meta jsonb,
  visibility text not null default 'public_exact'
    check (visibility in ('public_exact','public_approximate','private','admin_only')),
  status text not null default 'draft'
    check (status in ('draft','pending_review','pending_approval','approved','flagged','active','private','inactive','closed','archived')),
  amenities text[] not null default '{}',
  parking_notes text,
  accessibility_notes text,
  logo_image_url text,
  header_image_url text,
  gallery_image_urls text[] not null default '{}',
  building_asset_id text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venues_latitude_check check (latitude between -90 and 90),
  constraint venues_longitude_check check (longitude between -180 and 180),
  constraint venues_name_length check (char_length(trim(name)) between 1 and 160),
  constraint venues_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,119}$')
);

create index if not exists venues_status_idx on public.venues(status);
create index if not exists venues_location_idx on public.venues(latitude, longitude);

create trigger venues_set_updated_at
  before update on public.venues
  for each row execute procedure public.set_updated_at();

-- Durable organization <-> venue relationships ------------------------------
create table if not exists public.organization_venue_relationships (
  id text primary key,
  organization_id text not null references public.organizations(id) on delete cascade,
  venue_id text not null references public.venues(id) on delete cascade,
  relationship_type text not null default 'unknown'
    check (relationship_type in (
      'owner_operator','primary_home','resident','recurring_guest','monthly_guest',
      'annual_guest','one_time_guest','former_home','historical','unknown'
    )),
  label text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_primary boolean not null default false,
  confidence double precision check (confidence is null or confidence between 0 and 1),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, venue_id, relationship_type)
);

create index if not exists organization_venue_relationships_org_idx
  on public.organization_venue_relationships(organization_id);
create index if not exists organization_venue_relationships_venue_idx
  on public.organization_venue_relationships(venue_id);

create trigger organization_venue_relationships_set_updated_at
  before update on public.organization_venue_relationships
  for each row execute procedure public.set_updated_at();

-- Correct club-brand identifiers and connect brands to organizations ----------
alter table public.club_brands alter column id drop default;
alter table public.club_brands alter column id type text using id::text;
alter table public.club_brands alter column operator_organization_id type text using operator_organization_id::text;

alter table public.club_brands
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- Add missing foreign keys now that canonical venues exist. These constraints
-- are deliberately NOT VALID first, then validated; this is safe for future
-- non-empty environments and produces a clear failure if legacy IDs are bad.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'club_brands_operator_organization_fk'
  ) then
    alter table public.club_brands
      add constraint club_brands_operator_organization_fk
      foreign key (operator_organization_id) references public.organizations(id) on delete set null not valid;
  end if;
end $$;
alter table public.club_brands validate constraint club_brands_operator_organization_fk;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_series_organizer_organization_fk'
  ) then
    alter table public.event_series
      add constraint event_series_organizer_organization_fk
      foreign key (organizer_organization_id) references public.organizations(id) on delete set null not valid;
  end if;
end $$;
alter table public.event_series validate constraint event_series_organizer_organization_fk;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_series_default_venue_fk'
  ) then
    alter table public.event_series
      add constraint event_series_default_venue_fk
      foreign key (default_venue_id) references public.venues(id) on delete set null not valid;
  end if;
end $$;
alter table public.event_series validate constraint event_series_default_venue_fk;

alter table public.resorts
  add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.cruise_series
  add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.cruise_sailings
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- RLS ------------------------------------------------------------------------
alter table public.venues enable row level security;
alter table public.organization_venue_relationships enable row level security;

-- Tighten SQL privileges. RLS remains the authorization layer, but anonymous
-- clients do not need write/DDL-style privileges on these application tables.
revoke insert, update, delete, truncate, references, trigger
  on public.organizations, public.organization_members, public.venues,
     public.organization_venue_relationships, public.event_series,
     public.club_brands, public.resorts, public.cruise_series, public.cruise_sailings
  from anon;
revoke truncate, references, trigger
  on public.organizations, public.organization_members, public.venues,
     public.organization_venue_relationships, public.event_series,
     public.club_brands, public.resorts, public.cruise_series, public.cruise_sailings
  from authenticated;

grant select on public.venues, public.organization_venue_relationships to anon;
grant select, insert, update, delete on public.venues, public.organization_venue_relationships to authenticated;
grant select, insert, update, delete on public.event_series, public.club_brands,
  public.resorts, public.cruise_series, public.cruise_sailings to authenticated;

-- Keep updated_at authoritative on all catalog writes.
drop trigger if exists event_series_set_updated_at on public.event_series;
create trigger event_series_set_updated_at
  before update on public.event_series
  for each row execute procedure public.set_updated_at();
drop trigger if exists club_brands_set_updated_at on public.club_brands;
create trigger club_brands_set_updated_at
  before update on public.club_brands
  for each row execute procedure public.set_updated_at();
drop trigger if exists resorts_set_updated_at on public.resorts;
create trigger resorts_set_updated_at
  before update on public.resorts
  for each row execute procedure public.set_updated_at();
drop trigger if exists cruise_series_set_updated_at on public.cruise_series;
create trigger cruise_series_set_updated_at
  before update on public.cruise_series
  for each row execute procedure public.set_updated_at();
drop trigger if exists cruise_sailings_set_updated_at on public.cruise_sailings;
create trigger cruise_sailings_set_updated_at
  before update on public.cruise_sailings
  for each row execute procedure public.set_updated_at();

-- Organization deletion is an explicit admin action. Foreign keys detach most
-- references automatically; scrub the denormalized event payload reference too.
create or replace function private.detach_deleted_organization_from_listings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.listings
  set owner_organization_id = null,
      payload = payload - 'organizerOrganizationId'
  where owner_organization_id = old.id
     or payload ->> 'organizerOrganizationId' = old.id;
  return old;
end;
$$;

drop trigger if exists organizations_detach_listing_references on public.organizations;
create trigger organizations_detach_listing_references
  before delete on public.organizations
  for each row execute procedure private.detach_deleted_organization_from_listings();

revoke all on function private.detach_deleted_organization_from_listings() from public, anon, authenticated;

drop policy if exists "Admins can delete organizations" on public.organizations;
create policy "Admins can delete organizations"
on public.organizations for delete to authenticated
using (private.is_active_admin((select auth.uid())));

-- Venues: exact/approximate public venues are discoverable. Private/admin-only
-- venue rows are visible only to active admins or organization teams linked to
-- the venue.
drop policy if exists "Public can read discoverable venues" on public.venues;
create policy "Public can read discoverable venues"
on public.venues for select
to anon, authenticated
using (
  (status in ('approved','active') and visibility in ('public_exact','public_approximate'))
  or private.is_active_admin((select auth.uid()))
);

drop policy if exists "Admins can create venues" on public.venues;
create policy "Admins can create venues"
on public.venues for insert
to authenticated
with check (private.is_active_admin((select auth.uid())));

drop policy if exists "Admins can update venues" on public.venues;
create policy "Admins can update venues"
on public.venues for update
to authenticated
using (private.is_active_admin((select auth.uid())))
with check (private.is_active_admin((select auth.uid())));

drop policy if exists "Admins can delete venues" on public.venues;
create policy "Admins can delete venues"
on public.venues for delete
to authenticated
using (private.is_active_admin((select auth.uid())));

-- Relationships are public only when they connect two public entities.
drop policy if exists "Public can read public organization venue relationships" on public.organization_venue_relationships;
create policy "Public can read public organization venue relationships"
on public.organization_venue_relationships for select
to anon, authenticated
using (
  private.is_active_admin((select auth.uid()))
  or private.can_manage_organization(organization_id)
  or (
    exists (
      select 1 from public.organizations organization
      where organization.id = organization_id
        and organization.status in ('approved','active')
    )
    and exists (
      select 1 from public.venues venue
      where venue.id = venue_id
        and venue.status in ('approved','active')
        and venue.visibility in ('public_exact','public_approximate')
    )
  )
);

drop policy if exists "Organization teams manage venue relationships" on public.organization_venue_relationships;
create policy "Organization teams manage venue relationships"
on public.organization_venue_relationships for all
to authenticated
using (
  private.is_active_admin((select auth.uid()))
  or private.can_manage_organization(organization_id, array['owner','manager']::public.organization_member_role[])
)
with check (
  private.is_active_admin((select auth.uid()))
  or private.can_manage_organization(organization_id, array['owner','manager']::public.organization_member_role[])
);

-- Active admins must be able to see non-public rows in each existing catalog.
drop policy if exists "Admins can read all event series" on public.event_series;
create policy "Admins can read all event series"
on public.event_series for select to authenticated
using (private.is_active_admin((select auth.uid())));

drop policy if exists "Admins and organizers can create event series" on public.event_series;
create policy "Admins and organizers can create event series"
on public.event_series for insert to authenticated
with check (
  private.is_active_admin((select auth.uid()))
  or (
    organizer_organization_id is not null
    and private.can_manage_organization(organizer_organization_id, array['owner','manager']::public.organization_member_role[])
  )
);

drop policy if exists "Admins and organizers can update event series" on public.event_series;
create policy "Admins and organizers can update event series"
on public.event_series for update to authenticated
using (
  private.is_active_admin((select auth.uid()))
  or (
    organizer_organization_id is not null
    and private.can_manage_organization(organizer_organization_id, array['owner','manager','editor']::public.organization_member_role[])
  )
)
with check (
  private.is_active_admin((select auth.uid()))
  or (
    organizer_organization_id is not null
    and private.can_manage_organization(organizer_organization_id, array['owner','manager','editor']::public.organization_member_role[])
  )
);

drop policy if exists "Admins can delete event series" on public.event_series;
create policy "Admins can delete event series"
on public.event_series for delete to authenticated
using (private.is_active_admin((select auth.uid())));

-- Club brands.
drop policy if exists "Admins can read all club brands" on public.club_brands;
create policy "Admins can read all club brands"
on public.club_brands for select to authenticated
using (private.is_active_admin((select auth.uid())));

drop policy if exists "Admins and operators can create club brands" on public.club_brands;
create policy "Admins and operators can create club brands"
on public.club_brands for insert to authenticated
with check (
  private.is_active_admin((select auth.uid()))
  or (
    operator_organization_id is not null
    and private.can_manage_organization(operator_organization_id, array['owner','manager']::public.organization_member_role[])
  )
);

drop policy if exists "Admins and operators can update club brands" on public.club_brands;
create policy "Admins and operators can update club brands"
on public.club_brands for update to authenticated
using (
  private.is_active_admin((select auth.uid()))
  or (
    operator_organization_id is not null
    and private.can_manage_organization(operator_organization_id)
  )
)
with check (
  private.is_active_admin((select auth.uid()))
  or (
    operator_organization_id is not null
    and private.can_manage_organization(operator_organization_id)
  )
);

drop policy if exists "Admins can delete club brands" on public.club_brands;
create policy "Admins can delete club brands"
on public.club_brands for delete to authenticated
using (private.is_active_admin((select auth.uid())));

-- Travel tables. Organization operators may manage their own records; active
-- admins may manage all records including unowned drafts.
drop policy if exists "Admins can read all resorts" on public.resorts;
create policy "Admins can read all resorts"
on public.resorts for select to authenticated
using (
  private.is_active_admin((select auth.uid()))
  or (operator_organization_id is not null and private.can_manage_organization(operator_organization_id))
);

drop policy if exists "Admins and operators can create resorts" on public.resorts;
create policy "Admins and operators can create resorts"
on public.resorts for insert to authenticated
with check (
  private.is_active_admin((select auth.uid()))
  or (operator_organization_id is not null and private.can_manage_organization(operator_organization_id, array['owner','manager']::public.organization_member_role[]))
);

drop policy if exists "Admins and operators can update resorts" on public.resorts;
create policy "Admins and operators can update resorts"
on public.resorts for update to authenticated
using (
  private.is_active_admin((select auth.uid()))
  or (operator_organization_id is not null and private.can_manage_organization(operator_organization_id))
)
with check (
  private.is_active_admin((select auth.uid()))
  or (operator_organization_id is not null and private.can_manage_organization(operator_organization_id))
);

drop policy if exists "Admins can delete resorts" on public.resorts;
create policy "Admins can delete resorts"
on public.resorts for delete to authenticated
using (private.is_active_admin((select auth.uid())));

drop policy if exists "Admins can read all cruise series" on public.cruise_series;
create policy "Admins can read all cruise series"
on public.cruise_series for select to authenticated
using (
  private.is_active_admin((select auth.uid()))
  or (operator_organization_id is not null and private.can_manage_organization(operator_organization_id))
);

drop policy if exists "Admins and operators can create cruise series" on public.cruise_series;
create policy "Admins and operators can create cruise series"
on public.cruise_series for insert to authenticated
with check (
  private.is_active_admin((select auth.uid()))
  or (operator_organization_id is not null and private.can_manage_organization(operator_organization_id, array['owner','manager']::public.organization_member_role[]))
);

drop policy if exists "Admins and operators can update cruise series" on public.cruise_series;
create policy "Admins and operators can update cruise series"
on public.cruise_series for update to authenticated
using (
  private.is_active_admin((select auth.uid()))
  or (operator_organization_id is not null and private.can_manage_organization(operator_organization_id))
)
with check (
  private.is_active_admin((select auth.uid()))
  or (operator_organization_id is not null and private.can_manage_organization(operator_organization_id))
);

drop policy if exists "Admins can delete cruise series" on public.cruise_series;
create policy "Admins can delete cruise series"
on public.cruise_series for delete to authenticated
using (private.is_active_admin((select auth.uid())));

drop policy if exists "Admins can read all cruise sailings" on public.cruise_sailings;
create policy "Admins can read all cruise sailings"
on public.cruise_sailings for select to authenticated
using (
  private.is_active_admin((select auth.uid()))
  or exists (
    select 1 from public.cruise_series series
    where series.id = cruise_series_id
      and series.operator_organization_id is not null
      and private.can_manage_organization(series.operator_organization_id)
  )
);

drop policy if exists "Admins and operators can create cruise sailings" on public.cruise_sailings;
create policy "Admins and operators can create cruise sailings"
on public.cruise_sailings for insert to authenticated
with check (
  private.is_active_admin((select auth.uid()))
  or exists (
    select 1 from public.cruise_series series
    where series.id = cruise_series_id
      and series.operator_organization_id is not null
      and private.can_manage_organization(series.operator_organization_id, array['owner','manager']::public.organization_member_role[])
  )
);

drop policy if exists "Admins and operators can update cruise sailings" on public.cruise_sailings;
create policy "Admins and operators can update cruise sailings"
on public.cruise_sailings for update to authenticated
using (
  private.is_active_admin((select auth.uid()))
  or exists (
    select 1 from public.cruise_series series
    where series.id = cruise_series_id
      and series.operator_organization_id is not null
      and private.can_manage_organization(series.operator_organization_id)
  )
)
with check (
  private.is_active_admin((select auth.uid()))
  or exists (
    select 1 from public.cruise_series series
    where series.id = cruise_series_id
      and series.operator_organization_id is not null
      and private.can_manage_organization(series.operator_organization_id)
  )
);

drop policy if exists "Admins can delete cruise sailings" on public.cruise_sailings;
create policy "Admins can delete cruise sailings"
on public.cruise_sailings for delete to authenticated
using (private.is_active_admin((select auth.uid())));

-- Platform Status capability reporting --------------------------------------
create or replace function public.admin_platform_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_latest_migration text;
  v_profile_count bigint := 0;
  v_media_count bigint := 0;
  v_feedback_target_count bigint := 0;
  v_listing_count bigint := 0;
  v_organization_count bigint := 0;
  v_venue_count bigint := 0;
  v_event_series_count bigint := 0;
  v_club_brand_count bigint := 0;
  v_resort_count bigint := 0;
  v_cruise_series_count bigint := 0;
  v_cruise_sailing_count bigint := 0;
  v_listing_import_complete boolean := false;
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;

  select max(version)::text into v_latest_migration from supabase_migrations.schema_migrations;
  select count(*) into v_profile_count from public.profiles;
  select count(*) into v_media_count from public.media_assets;
  select
    (select count(*) from public.feedback_target_clubs)
    + (select count(*) from public.feedback_target_events)
    + (select count(*) from public.feedback_target_venues)
    into v_feedback_target_count;
  select count(*) into v_listing_count from public.listings where lifecycle_state = 'active';
  select count(*) into v_organization_count from public.organizations;
  select count(*) into v_venue_count from public.venues;
  select count(*) into v_event_series_count from public.event_series;
  select count(*) into v_club_brand_count from public.club_brands;
  select count(*) into v_resort_count from public.resorts;
  select count(*) into v_cruise_series_count from public.cruise_series;
  select count(*) into v_cruise_sailing_count from public.cruise_sailings;
  select coalesce(legacy_import_completed_at is not null, false)
    into v_listing_import_complete
    from public.listing_store_settings where singleton = true;

  return jsonb_build_object(
    'checkedAt', now(),
    'database', jsonb_build_object(
      'latestMigration', v_latest_migration,
      'serverVersion', current_setting('server_version')
    ),
    'counts', jsonb_build_object(
      'profiles', v_profile_count,
      'mediaAssets', v_media_count,
      'feedbackTargets', v_feedback_target_count,
      'listings', v_listing_count,
      'organizations', v_organization_count,
      'venues', v_venue_count,
      'eventSeries', v_event_series_count,
      'clubBrands', v_club_brand_count,
      'resorts', v_resort_count,
      'cruiseSeries', v_cruise_series_count,
      'cruiseSailings', v_cruise_sailing_count
    ),
    'capabilities', jsonb_build_object(
      'profiles', to_regclass('public.profiles') is not null,
      'mediaAssets', to_regclass('public.media_assets') is not null,
      'organizations', to_regclass('public.organizations') is not null,
      'organizationMembers', to_regclass('public.organization_members') is not null,
      'venues', to_regclass('public.venues') is not null,
      'organizationVenueRelationships', to_regclass('public.organization_venue_relationships') is not null,
      'eventSeries', to_regclass('public.event_series') is not null,
      'clubBrands', to_regclass('public.club_brands') is not null,
      'resorts', to_regclass('public.resorts') is not null,
      'cruiseSeries', to_regclass('public.cruise_series') is not null,
      'cruiseSailings', to_regclass('public.cruise_sailings') is not null,
      'feedbackTargets', to_regclass('public.feedback_target_events') is not null,
      'feedbackRegistration', to_regprocedure('public.feedback_register_target(text,text,text,text)') is not null,
      'adminUserProjection', to_regprocedure('public.admin_list_users()') is not null,
      'adminUserBadges', to_regprocedure('public.admin_get_user_badges(uuid)') is not null,
      'adminPrivateProfilePreview', to_regprocedure('public.admin_get_profile_by_handle(text)') is not null,
      'adminUserMutation', to_regprocedure('public.admin_update_user_account(uuid,text,text,text)') is not null,
      'profilePrivacy', to_regclass('public.profile_privacy_settings') is not null,
      'savedRelationships', to_regclass('public.profile_associations') is not null,
      'listingClaims', to_regclass('public.listing_claims') is not null,
      'outboundAnalytics', to_regclass('public.outbound_click_events') is not null,
      'badges', to_regclass('public.badges') is not null,
      'listingStore', to_regclass('public.listings') is not null,
      'listingModerationHistory', to_regclass('public.listing_moderation_actions') is not null,
      'listingLegacyImportComplete', v_listing_import_complete,
      'publicListingRead', to_regprocedure('public.list_public_listings()') is not null,
      'myListingRead', to_regprocedure('public.list_my_listings()') is not null,
      'adminListingRead', to_regprocedure('public.admin_list_listings()') is not null,
      'listingSubmit', to_regprocedure('public.submit_listing(jsonb)') is not null,
      'listingAdminSave', to_regprocedure('public.admin_save_listing(jsonb)') is not null,
      'listingModerate', to_regprocedure('public.admin_moderate_listing(text,text,text)') is not null,
      'generalAdminAudit', to_regclass('public.admin_audit_log') is not null,
      'adminNotifications', to_regclass('public.admin_notifications') is not null,
      'taxonomy', to_regclass('public.tags') is not null and to_regclass('public.tag_categories') is not null,
      'accountDeletion', to_regprocedure('public.delete_my_account()') is not null
    )
  );
end;
$$;

revoke all on function public.admin_platform_health() from public, anon, authenticated;
grant execute on function public.admin_platform_health() to authenticated;
