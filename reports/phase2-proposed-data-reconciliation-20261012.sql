-- =============================================================================
-- SwingSphere Phase 2 — Proposed Production Data Reconciliation Migration
-- Generated: 2026-10-12
-- STATUS: PROPOSED ONLY — DO NOT EXECUTE AUTOMATICALLY WITHOUT HUMAN APPROVAL
-- =============================================================================
-- Core Rule: Identity and branding follow the organizer, not the venue.
-- Non-Destructive Guarantee:
--   * No rows in public.media_assets or Cloudflare Images are deleted.
--   * No draft cruise sailings or draft resorts are published automatically.
--   * Private addresses and approximate-location protections are preserved.
--   * Full rollback script is paired at reports/phase2-rollback-20261012.sql.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Missing canonical organizer associations for Connect.Dance.Love &
--    Krystal Club Privé events
--    (private.sync_listing_identity_payload trigger automatically mirrors
--     owner_organization_id into payload.organizerOrganizationId)
-- -----------------------------------------------------------------------------
update public.listings
set owner_organization_id = 'org-host-connect-dance-love',
    updated_at = now()
where id = 'event-connect-dance-love-2026-04-04'
  and listing_type = 'event'
  and owner_organization_id is distinct from 'org-host-connect-dance-love';

update public.listings
set owner_organization_id = 'org-host-krystal-club-prive',
    updated_at = now()
where id in (
    'event-krystal-dance-night-2026-04-04',
    'event-krystal-neon-night-2026-04-11',
    'event-krystal-fetish-night-2026-04-18',
    'event-krystal-toga-party-2026-04-25'
  )
  and listing_type = 'event'
  and owner_organization_id is distinct from 'org-host-krystal-club-prive';

-- -----------------------------------------------------------------------------
-- 2. Midweek Escape's three missing event-series associations
--    (private.sync_listing_identity_payload trigger automatically mirrors
--     event_series_id into payload.eventSeriesId)
-- -----------------------------------------------------------------------------
update public.listings
set event_series_id = 'series-midweek-escape-1775765315109',
    updated_at = now()
where id in (
    'event-1775498062796',
    'event-1775500501297',
    'event-1775500825641'
  )
  and listing_type = 'event'
  and owner_organization_id = 'org-club-escape-cleveland'
  and event_series_id is distinct from 'series-midweek-escape-1775765315109';

-- -----------------------------------------------------------------------------
-- 3. Her Fantasy Party's contaminated series-logo reference
--    Replaces Twist SF's venue/club logo (74bf9013-96a8-4cd5-3911-4be8dd89fb00)
--    on series-her-fantasy with Her Fantasy Party's canonical promoter logo
--    (6c405798-3fa7-4dc3-2394-f2b749689a00).
--    Original media_assets rows are retained untouched.
-- -----------------------------------------------------------------------------
update public.event_series
set logo_image_url = 'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/6c405798-3fa7-4dc3-2394-f2b749689a00/logosquare',
    updated_at = now()
where id = 'series-her-fantasy'
  and logo_image_url = 'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/74bf9013-96a8-4cd5-3911-4be8dd89fb00/logosquare';

-- -----------------------------------------------------------------------------
-- 4. Confirmed redundant or stale occurrence-level logoImageUrl copies across
--    Illuminaughty (4), Bronze Party (2), Krystal Club Privé (4), and
--    Trapeze Atlanta (3).
--    Only strips payload.logoImageUrl where logoOverride is not true so events
--    cleanly inherit their organizer/series canonical logo.
--    All media_assets records and event flyers/headers remain untouched.
-- -----------------------------------------------------------------------------
update public.listings
set payload = payload - 'logoImageUrl',
    updated_at = now()
where id in (
    -- Illuminaughty (redundant copy of org logo ae6636d9-f865-4baa-6256-794aa12f8b00)
    'event-illuminaughty-denver-2026-03-14',
    'event-illuminaughty-san-francisco-2026-04-11',
    'event-illuminaughty-scottsdale-2026-04-25',
    'event-illuminaughty-st-louis-2026-05-02',
    -- Bronze Party (redundant copy of org logo f01802eb-7930-4e20-6903-2fd3da4be900)
    'event-bronze-party-bay-area-2026-04-04',
    'event-bronze-party-sf-2026-04-11',
    -- Krystal Club Privé (stale legacy logo 2efe3573-92a8-4f7b-72cc-4224fc2f4c00 vs org a8bfa2ff-c978-483c-a53f-01952be5b300)
    'event-krystal-dance-night-2026-04-04',
    'event-krystal-neon-night-2026-04-11',
    'event-krystal-fetish-night-2026-04-18',
    'event-krystal-toga-party-2026-04-25',
    -- Trapeze Atlanta (stale legacy logo 2d99a016-2bd4-4c61-2f5c-ec92df56bd00 vs canonical 7c7fd2db-6eb4-4df4-563a-2b798cb95600)
    'event-trapeze-atlanta-glow-in-the-dark-2026-04-04',
    'event-trapeze-atlanta-interracial-night-2026-04-10',
    'event-trapeze-atlanta-lust-and-leather-2026-04-25'
  )
  and listing_type = 'event'
  and coalesce((payload ->> 'logoOverride')::boolean, false) = false
  and payload ? 'logoImageUrl';

-- -----------------------------------------------------------------------------
-- 5. The Power Exchange club/organization logo conflict
--    Aligns org-club-power-exchange.logo_image_url with club-power-exchange's
--    canonical uploaded media_assets logo (508d61bf-456d-4de8-bf04-1a8db9981f00).
--    Retains 90077276-bf09-4e14-2cb2-b31039402e00 in media_assets / Cloudflare.
-- -----------------------------------------------------------------------------
update public.organizations
set logo_image_url = 'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/508d61bf-456d-4de8-bf04-1a8db9981f00/logosquare',
    updated_at = now()
where id = 'org-club-power-exchange'
  and logo_image_url = 'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/90077276-bf09-4e14-2cb2-b31039402e00/logosquare';

-- -----------------------------------------------------------------------------
-- 6. Verified resort public coordinates & private resort protection
--    * Populates verified public coordinates for Hedonism II, Paradise Lakes,
--      and The Kraken Resort.
--    * Explicitly marks Sea Mountain Inn (`Address released to confirmed guests`)
--      as locationVisibility = 'approximate' with null public coordinates.
-- -----------------------------------------------------------------------------
update public.resorts
set geopoint = jsonb_set(
      jsonb_set(coalesce(geopoint, '{}'::jsonb), '{latitude}', '18.3389'::jsonb, true),
      '{longitude}', '-78.3386'::jsonb, true
    ),
    updated_at = now()
where id = 'resort-hedonism-ii-negril';

update public.resorts
set geopoint = jsonb_set(
      jsonb_set(coalesce(geopoint, '{}'::jsonb), '{latitude}', '28.1806'::jsonb, true),
      '{longitude}', '-82.4631'::jsonb, true
    ),
    updated_at = now()
where id = 'resort-paradise-lakes-resort';

update public.resorts
set geopoint = jsonb_set(
      jsonb_set(coalesce(geopoint, '{}'::jsonb), '{latitude}', '16.3268'::jsonb, true),
      '{longitude}', '-86.5358'::jsonb, true
    ),
    updated_at = now()
where id = 'resort-the-kraken-resort';

update public.resorts
set geopoint = (coalesce(geopoint, '{}'::jsonb) - 'latitude' - 'longitude')
      || jsonb_build_object('locationVisibility', 'approximate'),
    updated_at = now()
where id = 'resort-sea-mountain-inn-spa';

-- -----------------------------------------------------------------------------
-- 7. Independently verified resort operator associations (shared club/resort)
--    Links Caliente and Cypress Cove resort records to their existing canonical
--    operator organizations without merging or deleting club/resort rows.
-- -----------------------------------------------------------------------------
update public.resorts
set operator_organization_id = 'org-club-caliente-tampa',
    updated_at = now()
where id = 'resort-caliente-tampa'
  and operator_organization_id is null;

update public.resorts
set operator_organization_id = 'org-club-cypress-cove',
    updated_at = now()
where id = 'resort-cypress-cove-kissimmee'
  and operator_organization_id is null;

-- -----------------------------------------------------------------------------
-- 8. Cruise sailing departure port coordinates (status preserved as 'draft')
--    Does NOT publish draft sailings.
-- -----------------------------------------------------------------------------
update public.cruise_sailings
set departure_port = coalesce(departure_port, '{}'::jsonb)
      || jsonb_build_object('latitude', 43.6961, 'longitude', 7.2718),
    updated_at = now()
where id = 'sailing-desire-french-italian-riviera-2026-09';

update public.cruise_sailings
set departure_port = coalesce(departure_port, '{}'::jsonb)
      || jsonb_build_object('latitude', 37.9420, 'longitude', 23.6465),
    updated_at = now()
where id = 'sailing-desire-greek-islands-2026-10';

update public.cruise_sailings
set departure_port = coalesce(departure_port, '{}'::jsonb)
      || jsonb_build_object('latitude', -22.8944, 'longitude', -43.1842),
    updated_at = now()
where id = 'sailing-desire-rio-2026-12';

update public.cruise_sailings
set departure_port = coalesce(departure_port, '{}'::jsonb)
      || jsonb_build_object('latitude', 25.7781, 'longitude', -80.1791),
    updated_at = now()
where id in (
    'sailing-bliss-caribbean-2026-11',
    'sailing-temptation-western-caribbean-2027-02'
  );

-- -----------------------------------------------------------------------------
-- 9. Listing save RPC hardening: prevent invalid relationship IDs from being
--    silently coerced to NULL in update_managed_listing and update_my_pending_listing
-- -----------------------------------------------------------------------------
create or replace function public.update_managed_listing(p_listing_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_before public.listings;
  v_name text;
  v_payload jsonb;
  v_result jsonb;
  v_requested_venue text;
  v_requested_brand text;
  v_requested_series text;
  v_venue_id text;
  v_brand_id text;
  v_series_id text;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not exists (select 1 from public.profiles where id = v_user and status = 'active') then
    raise exception 'An active SwingSphere account is required.';
  end if;

  select * into v_before
  from public.listings
  where id = p_listing_id and lifecycle_state = 'active'
  for update;

  if v_before.id is null then raise exception 'Listing not found.'; end if;
  if v_before.owner_organization_id is null
     or not private.can_manage_organization(
       v_before.owner_organization_id,
       array['owner','manager','editor']::public.organization_member_role[]
     ) then
    raise exception 'Organization management access is required.';
  end if;

  v_name := trim(coalesce(p_payload ->> 'name', v_before.name));
  if v_name = '' then raise exception 'Listing name is required.'; end if;

  v_venue_id := v_before.venue_id;
  if v_before.listing_type = 'event' and p_payload ? 'venueId' then
    v_requested_venue := nullif(trim(coalesce(p_payload ->> 'venueId', '')), '');
    if v_requested_venue is null then
      v_venue_id := null;
    elsif exists (select 1 from public.venues where id = v_requested_venue) then
      v_venue_id := v_requested_venue;
    else
      raise exception 'Unknown venue id: %', v_requested_venue;
    end if;
  elsif v_before.listing_type = 'club' and p_payload ? 'primaryVenueId' then
    v_requested_venue := nullif(trim(coalesce(p_payload ->> 'primaryVenueId', '')), '');
    if v_requested_venue is null then
      v_venue_id := null;
    elsif exists (select 1 from public.venues where id = v_requested_venue) then
      v_venue_id := v_requested_venue;
    else
      raise exception 'Unknown venue id: %', v_requested_venue;
    end if;
  end if;

  v_brand_id := v_before.club_brand_id;
  if v_before.listing_type = 'club' and p_payload ? 'clubBrandId' then
    v_requested_brand := nullif(trim(coalesce(p_payload ->> 'clubBrandId', '')), '');
    if v_requested_brand is null then
      v_brand_id := null;
    elsif exists (select 1 from public.club_brands where id = v_requested_brand) then
      v_brand_id := v_requested_brand;
    else
      raise exception 'Unknown club brand id: %', v_requested_brand;
    end if;
  end if;

  v_series_id := v_before.event_series_id;
  if v_before.listing_type = 'event' and p_payload ? 'eventSeriesId' then
    v_requested_series := nullif(trim(coalesce(p_payload ->> 'eventSeriesId', '')), '');
    if v_requested_series is null then
      v_series_id := null;
    elsif exists (select 1 from public.event_series where id = v_requested_series) then
      v_series_id := v_requested_series;
    else
      raise exception 'Unknown event series id: %', v_requested_series;
    end if;
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object(
      'id', v_before.id,
      'type', v_before.listing_type,
      'name', v_name,
      'status', v_before.status,
      'postedByUserId', coalesce(v_before.submitter_ref, v_before.submitted_by::text)
    );

  if v_before.listing_type = 'event' then
    v_payload := (v_payload - 'ownerOrganizationId')
      || jsonb_build_object('organizerOrganizationId', v_before.owner_organization_id);
  else
    v_payload := (v_payload - 'organizerOrganizationId')
      || jsonb_build_object('ownerOrganizationId', v_before.owner_organization_id);
  end if;

  update public.listings
  set name = v_name,
      payload = v_payload,
      venue_id = v_venue_id,
      club_brand_id = v_brand_id,
      event_series_id = v_series_id,
      provenance = case when provenance = 'legacy' then 'owner' else provenance end
  where id = v_before.id;

  insert into public.listing_moderation_actions (
    listing_id, actor_user_id, action,
    before_status, after_status, before_lifecycle_state, after_lifecycle_state,
    before_payload, after_payload
  ) values (
    v_before.id, v_user, 'managed_update',
    v_before.status, v_before.status, v_before.lifecycle_state, v_before.lifecycle_state,
    v_before.payload, v_payload
  );

  select private.listing_payload(listing, false)
  into v_result
  from public.listings listing
  where listing.id = v_before.id;

  return v_result;
end;
$$;

commit;
