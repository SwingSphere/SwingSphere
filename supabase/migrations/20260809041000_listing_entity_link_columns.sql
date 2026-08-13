-- Promote remaining listing relationship keys out of JSON payloads into
-- FK-backed columns. These links power canonical navigation and brand-media
-- inheritance without relying on display-name matching.

alter table public.listings
  add column if not exists venue_id text references public.venues(id) on delete set null,
  add column if not exists club_brand_id text references public.club_brands(id) on delete set null,
  add column if not exists event_series_id text references public.event_series(id) on delete set null;

create index if not exists listings_venue_idx
  on public.listings(venue_id, updated_at desc)
  where venue_id is not null;
create index if not exists listings_club_brand_idx
  on public.listings(club_brand_id, updated_at desc)
  where club_brand_id is not null;
create index if not exists listings_event_series_idx
  on public.listings(event_series_id, updated_at desc)
  where event_series_id is not null;

-- Existing canonical venue payload links.
update public.listings listing
set venue_id = venue.id
from public.venues venue
where listing.venue_id is null
  and venue.id = case
    when listing.listing_type = 'club' then nullif(listing.payload ->> 'primaryVenueId', '')
    else nullif(listing.payload ->> 'venueId', '')
  end;

-- Existing canonical event-series payload links.
update public.listings listing
set event_series_id = series.id
from public.event_series series
where listing.listing_type = 'event'
  and listing.event_series_id is null
  and series.id = nullif(listing.payload ->> 'eventSeriesId', '');

-- Curated one-time replacement for the old runtime `name.startsWith(brand.name)`
-- grouping heuristic. These mappings are explicit production identities.
with brand_links(listing_id, brand_id) as (
  values
    ('club-ice-lounge-wichita', 'brand-ice-lounge'),
    ('club-ice-lounge-chicago', 'brand-ice-lounge'),
    ('club-ice-lounge-milwaukee', 'brand-ice-lounge'),
    ('club-ice-lounge-oklahoma-city', 'brand-ice-lounge'),
    ('club-eden-dfw', 'brand-club-eden'),
    ('club-eden-san-antonio', 'brand-club-eden'),
    ('club-eden-oklahoma-city', 'brand-club-eden'),
    ('club-colette-dallas', 'brand-colette'),
    ('club-colette-austin', 'brand-colette'),
    ('club-colette-houston', 'brand-colette'),
    ('club-colette-new-orleans', 'brand-colette'),
    ('club-colette-san-antonio', 'brand-colette'),
    ('club-kiwiklub-johannesburg', 'brand-kiwiklub'),
    ('club-kiwiklub-durban', 'brand-kiwiklub'),
    ('club-trapeze-atlanta', 'brand-trapeze'),
    ('club-trapeze-fort-lauderdale', 'brand-trapeze')
)
update public.listings listing
set club_brand_id = links.brand_id
from brand_links links
join public.club_brands brand on brand.id = links.brand_id
where listing.id = links.listing_id
  and listing.listing_type = 'club'
  and listing.club_brand_id is null;

-- If a valid explicit payload link already exists outside the curated legacy map,
-- normalize it too.
update public.listings listing
set club_brand_id = brand.id
from public.club_brands brand
where listing.listing_type = 'club'
  and listing.club_brand_id is null
  and brand.id = nullif(listing.payload ->> 'clubBrandId', '');

-- Keep normalized relationship columns authoritative and mirror them into the
-- compatibility JSON payload returned by existing listing APIs.
create or replace function private.sync_listing_identity_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.payload := coalesce(new.payload, '{}'::jsonb);

  if new.listing_type = 'event' then
    new.club_brand_id := null;
    new.payload := new.payload - 'ownerOrganizationId' - 'primaryVenueId' - 'clubBrandId';

    if new.owner_organization_id is null then
      new.payload := new.payload - 'organizerOrganizationId';
    else
      new.payload := new.payload || jsonb_build_object('organizerOrganizationId', new.owner_organization_id);
    end if;

    if new.venue_id is null then
      new.payload := new.payload - 'venueId';
    else
      new.payload := new.payload || jsonb_build_object('venueId', new.venue_id);
    end if;

    if new.event_series_id is null then
      new.payload := new.payload - 'eventSeriesId';
    else
      new.payload := new.payload || jsonb_build_object('eventSeriesId', new.event_series_id);
    end if;
  elsif new.listing_type = 'club' then
    new.event_series_id := null;
    new.payload := new.payload - 'organizerOrganizationId' - 'venueId' - 'eventSeriesId';

    if new.owner_organization_id is null then
      new.payload := new.payload - 'ownerOrganizationId';
    else
      new.payload := new.payload || jsonb_build_object('ownerOrganizationId', new.owner_organization_id);
    end if;

    if new.venue_id is null then
      new.payload := new.payload - 'primaryVenueId';
    else
      new.payload := new.payload || jsonb_build_object('primaryVenueId', new.venue_id);
    end if;

    if new.club_brand_id is null then
      new.payload := new.payload - 'clubBrandId';
    else
      new.payload := new.payload || jsonb_build_object('clubBrandId', new.club_brand_id);
    end if;
  end if;

  return new;
end;
$$;

-- Re-fire normalization for current rows now that the new columns exist.
update public.listings set payload = payload;

create or replace function private.listing_payload(
  p_listing public.listings,
  p_public boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_geo jsonb;
  v_address jsonb;
  v_public_address jsonb;
  v_public_location text;
  v_lat numeric;
  v_lon numeric;
begin
  v_payload := coalesce(p_listing.payload, '{}'::jsonb)
    || jsonb_build_object(
      'id', p_listing.id,
      'type', p_listing.listing_type,
      'name', p_listing.name,
      'status', p_listing.status
    );

  if p_listing.submitted_by is not null then
    v_payload := v_payload || jsonb_build_object('postedByUserId', p_listing.submitted_by::text);
  elsif p_listing.submitter_ref is not null then
    v_payload := v_payload || jsonb_build_object('postedByUserId', p_listing.submitter_ref);
  end if;

  if p_listing.listing_type = 'event' then
    v_payload := v_payload - 'ownerOrganizationId' - 'primaryVenueId' - 'clubBrandId';
    if p_listing.owner_organization_id is not null then
      v_payload := v_payload || jsonb_build_object('organizerOrganizationId', p_listing.owner_organization_id);
    end if;
    if p_listing.venue_id is not null then
      v_payload := v_payload || jsonb_build_object('venueId', p_listing.venue_id);
    end if;
    if p_listing.event_series_id is not null then
      v_payload := v_payload || jsonb_build_object('eventSeriesId', p_listing.event_series_id);
    end if;
  elsif p_listing.listing_type = 'club' then
    v_payload := v_payload - 'organizerOrganizationId' - 'venueId' - 'eventSeriesId';
    if p_listing.owner_organization_id is not null then
      v_payload := v_payload || jsonb_build_object('ownerOrganizationId', p_listing.owner_organization_id);
    end if;
    if p_listing.venue_id is not null then
      v_payload := v_payload || jsonb_build_object('primaryVenueId', p_listing.venue_id);
    end if;
    if p_listing.club_brand_id is not null then
      v_payload := v_payload || jsonb_build_object('clubBrandId', p_listing.club_brand_id);
    end if;
  end if;

  if not p_public then
    return v_payload;
  end if;

  if (v_payload ->> 'locationVisibility') = 'approximate_public'
     or lower(coalesce(v_payload ->> 'isAddressPrivate', 'false')) = 'true' then
    v_geo := coalesce(v_payload -> 'geopoint', '{}'::jsonb);
    v_address := coalesce(v_geo -> 'address', '{}'::jsonb);
    v_public_address := jsonb_strip_nulls(jsonb_build_object(
      'city', v_address ->> 'city',
      'region', v_address ->> 'region',
      'postalCode', v_address ->> 'postalCode',
      'country', v_address ->> 'country'
    ));

    v_public_location := concat_ws(', ',
      nullif(v_address ->> 'city', ''),
      nullif(v_address ->> 'region', ''),
      nullif(v_address ->> 'postalCode', ''),
      nullif(v_address ->> 'country', '')
    );

    if coalesce(v_geo ->> 'latitude', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then
      v_lat := round((v_geo ->> 'latitude')::numeric, 2);
    end if;
    if coalesce(v_geo ->> 'longitude', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then
      v_lon := round((v_geo ->> 'longitude')::numeric, 2);
    end if;

    v_payload := v_payload - 'locationMeta';
    v_payload := v_payload || jsonb_build_object(
      'location', v_public_location,
      'geopoint', jsonb_strip_nulls(jsonb_build_object(
        'latitude', v_lat,
        'longitude', v_lon,
        'address', v_public_address
      ))
    );
  end if;

  return v_payload;
end;
$$;

-- Replace admin save so all explicit identity relationships are validated against
-- canonical tables and persisted to FK-backed columns.
create or replace function public.admin_save_listing(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_type text := lower(trim(coalesce(p_payload ->> 'type', '')));
  v_name text := trim(coalesce(p_payload ->> 'name', ''));
  v_id text := trim(coalesce(p_payload ->> 'id', ''));
  v_status text := lower(trim(coalesce(p_payload ->> 'status', 'approved')));
  v_submitter_ref text := nullif(trim(coalesce(p_payload ->> 'postedByUserId', '')), '');
  v_submitted_by uuid;
  v_org text;
  v_venue text;
  v_brand text;
  v_series text;
  v_owner_org text;
  v_venue_id text;
  v_brand_id text;
  v_series_id text;
  v_org_supplied boolean;
  v_venue_supplied boolean;
  v_brand_supplied boolean;
  v_series_supplied boolean;
  v_before public.listings;
  v_payload jsonb;
  v_result jsonb;
begin
  if not private.is_active_admin(v_admin) then raise exception 'Administrator access required.'; end if;
  if v_type not in ('club', 'event') then raise exception 'Listing type must be club or event.'; end if;
  if v_name = '' then raise exception 'Listing name is required.'; end if;
  if v_status not in ('pending_approval', 'approved', 'flagged') then v_status := 'approved'; end if;
  if v_id = '' then v_id := v_type || '-' || gen_random_uuid()::text; end if;

  v_org := case when v_type = 'event'
    then nullif(trim(coalesce(p_payload ->> 'organizerOrganizationId', '')), '')
    else nullif(trim(coalesce(p_payload ->> 'ownerOrganizationId', '')), '') end;
  v_venue := case when v_type = 'event'
    then nullif(trim(coalesce(p_payload ->> 'venueId', '')), '')
    else nullif(trim(coalesce(p_payload ->> 'primaryVenueId', '')), '') end;
  v_brand := case when v_type = 'club' then nullif(trim(coalesce(p_payload ->> 'clubBrandId', '')), '') end;
  v_series := case when v_type = 'event' then nullif(trim(coalesce(p_payload ->> 'eventSeriesId', '')), '') end;
  v_org_supplied := case when v_type = 'event' then p_payload ? 'organizerOrganizationId' else p_payload ? 'ownerOrganizationId' end;
  v_venue_supplied := case when v_type = 'event' then p_payload ? 'venueId' else p_payload ? 'primaryVenueId' end;
  v_brand_supplied := v_type = 'club' and p_payload ? 'clubBrandId';
  v_series_supplied := v_type = 'event' and p_payload ? 'eventSeriesId';

  select * into v_before from public.listings where id = v_id for update;

  if v_before.id is not null then
    v_submitted_by := v_before.submitted_by;
    v_submitter_ref := coalesce(v_before.submitter_ref, v_submitter_ref);
  elsif v_submitter_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (select 1 from public.profiles where id = v_submitter_ref::uuid) then
    v_submitted_by := v_submitter_ref::uuid;
  end if;

  if v_org_supplied then
    if v_org is null then v_owner_org := null;
    elsif exists (select 1 from public.organizations where id = v_org) then v_owner_org := v_org;
    else raise exception 'Unknown organization id: %', v_org; end if;
  elsif v_before.id is not null then v_owner_org := v_before.owner_organization_id;
  end if;

  if v_venue_supplied then
    if v_venue is null then v_venue_id := null;
    elsif exists (select 1 from public.venues where id = v_venue) then v_venue_id := v_venue;
    else raise exception 'Unknown venue id: %', v_venue; end if;
  elsif v_before.id is not null then v_venue_id := v_before.venue_id;
  end if;

  if v_brand_supplied then
    if v_brand is null then v_brand_id := null;
    elsif exists (select 1 from public.club_brands where id = v_brand) then v_brand_id := v_brand;
    else raise exception 'Unknown club brand id: %', v_brand; end if;
  elsif v_before.id is not null and v_type = 'club' then v_brand_id := v_before.club_brand_id;
  end if;

  if v_series_supplied then
    if v_series is null then v_series_id := null;
    elsif exists (select 1 from public.event_series where id = v_series) then v_series_id := v_series;
    else raise exception 'Unknown event series id: %', v_series; end if;
  elsif v_before.id is not null and v_type = 'event' then v_series_id := v_before.event_series_id;
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object('id', v_id, 'type', v_type, 'name', v_name, 'status', v_status);

  insert into public.listings (
    id, listing_type, name, status, lifecycle_state, payload,
    submitted_by, submitter_ref, owner_organization_id, venue_id, club_brand_id, event_series_id,
    provenance, submitted_at, published_at, last_moderated_at, last_moderated_by
  ) values (
    v_id, v_type, v_name, v_status, 'active', v_payload,
    v_submitted_by, v_submitter_ref, v_owner_org, v_venue_id, v_brand_id, v_series_id,
    case when v_before.id is null then 'admin' else v_before.provenance end,
    coalesce(v_before.submitted_at, now()),
    case when v_status = 'approved' then coalesce(v_before.published_at, now()) else v_before.published_at end,
    now(), v_admin
  )
  on conflict (id) do update set
    listing_type = excluded.listing_type,
    name = excluded.name,
    status = excluded.status,
    lifecycle_state = 'active',
    payload = excluded.payload,
    submitted_by = coalesce(public.listings.submitted_by, excluded.submitted_by),
    submitter_ref = coalesce(public.listings.submitter_ref, excluded.submitter_ref),
    owner_organization_id = excluded.owner_organization_id,
    venue_id = excluded.venue_id,
    club_brand_id = excluded.club_brand_id,
    event_series_id = excluded.event_series_id,
    published_at = excluded.published_at,
    last_moderated_at = excluded.last_moderated_at,
    last_moderated_by = excluded.last_moderated_by;

  insert into public.listing_moderation_actions (
    listing_id, actor_user_id, action,
    before_status, after_status,
    before_lifecycle_state, after_lifecycle_state,
    before_payload, after_payload
  ) values (
    v_id, v_admin, 'admin_save',
    v_before.status, v_status,
    v_before.lifecycle_state, 'active',
    v_before.payload, v_payload
  );

  if v_status = 'approved' then perform public.feedback_register_target(v_type, v_id, v_name, 'active'); end if;

  select private.listing_payload(listing, false) into v_result
  from public.listings listing where listing.id = v_id;
  return v_result;
end;
$$;

-- Member submission/update paths validate the same relationship IDs. Organization
-- assignment additionally requires current management permission.
create or replace function public.submit_listing(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_type text := lower(trim(coalesce(p_payload ->> 'type', '')));
  v_name text := trim(coalesce(p_payload ->> 'name', ''));
  v_id text := trim(coalesce(p_payload ->> 'id', ''));
  v_org text;
  v_owner_org text;
  v_venue_id text;
  v_brand_id text;
  v_series_id text;
  v_provenance text := 'community';
  v_payload jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not exists (select 1 from public.profiles where id = v_user and status = 'active') then raise exception 'An active SwingSphere account is required.'; end if;
  if v_type not in ('club', 'event') then raise exception 'Listing type must be club or event.'; end if;
  if v_name = '' then raise exception 'Listing name is required.'; end if;
  if v_id = '' or exists (select 1 from public.listings where id = v_id) then v_id := v_type || '-' || gen_random_uuid()::text; end if;

  v_org := case when v_type = 'event'
    then nullif(trim(coalesce(p_payload ->> 'organizerOrganizationId', '')), '')
    else nullif(trim(coalesce(p_payload ->> 'ownerOrganizationId', '')), '') end;

  if v_org is not null
     and exists (select 1 from public.organizations where id = v_org)
     and private.can_manage_organization(v_org, array['owner','manager','editor']::public.organization_member_role[]) then
    v_owner_org := v_org;
    v_provenance := 'promoter';
  end if;

  select id into v_venue_id from public.venues where id = case when v_type = 'event'
    then nullif(trim(coalesce(p_payload ->> 'venueId', '')), '')
    else nullif(trim(coalesce(p_payload ->> 'primaryVenueId', '')), '') end;
  if v_type = 'club' then select id into v_brand_id from public.club_brands where id = nullif(trim(coalesce(p_payload ->> 'clubBrandId', '')), ''); end if;
  if v_type = 'event' then select id into v_series_id from public.event_series where id = nullif(trim(coalesce(p_payload ->> 'eventSeriesId', '')), ''); end if;

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object('id', v_id, 'type', v_type, 'name', v_name, 'status', 'pending_approval', 'postedByUserId', v_user::text);

  insert into public.listings (
    id, listing_type, name, status, lifecycle_state, payload,
    submitted_by, submitter_ref, owner_organization_id, venue_id, club_brand_id, event_series_id, provenance
  ) values (
    v_id, v_type, v_name, 'pending_approval', 'active', v_payload,
    v_user, v_user::text, v_owner_org, v_venue_id, v_brand_id, v_series_id, v_provenance
  );

  insert into public.listing_moderation_actions (
    listing_id, actor_user_id, action, after_status, after_lifecycle_state, after_payload
  ) values (v_id, v_user, 'submit', 'pending_approval', 'active', v_payload);

  select private.listing_payload(listing, false) into v_payload from public.listings listing where listing.id = v_id;
  return v_payload;
end;
$$;

create or replace function public.update_my_pending_listing(p_listing_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_before public.listings;
  v_name text;
  v_requested_org text;
  v_owner_org text;
  v_venue_id text;
  v_brand_id text;
  v_series_id text;
  v_payload jsonb;
  v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not exists (select 1 from public.profiles where id = v_user and status = 'active') then raise exception 'An active SwingSphere account is required.'; end if;

  select * into v_before from public.listings
  where id = p_listing_id and submitted_by = v_user and lifecycle_state = 'active' and status = 'pending_approval'
  for update;
  if v_before.id is null then raise exception 'Pending listing is unavailable.'; end if;

  v_name := trim(coalesce(p_payload ->> 'name', v_before.name));
  if v_name = '' then raise exception 'Listing name is required.'; end if;

  v_requested_org := case when v_before.listing_type = 'event'
    then nullif(trim(coalesce(p_payload ->> 'organizerOrganizationId', '')), '')
    else nullif(trim(coalesce(p_payload ->> 'ownerOrganizationId', '')), '') end;
  v_owner_org := v_before.owner_organization_id;
  if v_requested_org is null then
    v_owner_org := null;
  elsif exists (select 1 from public.organizations where id = v_requested_org)
    and private.can_manage_organization(v_requested_org, array['owner','manager','editor']::public.organization_member_role[]) then
    v_owner_org := v_requested_org;
  end if;

  v_venue_id := v_before.venue_id;
  if v_before.listing_type = 'event' then
    select id into v_venue_id from public.venues where id = nullif(trim(coalesce(p_payload ->> 'venueId', '')), '');
  else
    select id into v_venue_id from public.venues where id = nullif(trim(coalesce(p_payload ->> 'primaryVenueId', '')), '');
  end if;

  v_brand_id := v_before.club_brand_id;
  v_series_id := v_before.event_series_id;
  if v_before.listing_type = 'club' then
    select id into v_brand_id from public.club_brands where id = nullif(trim(coalesce(p_payload ->> 'clubBrandId', '')), '');
  else
    select id into v_series_id from public.event_series where id = nullif(trim(coalesce(p_payload ->> 'eventSeriesId', '')), '');
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object('id', v_before.id, 'type', v_before.listing_type, 'name', v_name, 'status', 'pending_approval', 'postedByUserId', v_user::text);

  update public.listings
  set name = v_name,
      payload = v_payload,
      owner_organization_id = v_owner_org,
      venue_id = v_venue_id,
      club_brand_id = v_brand_id,
      event_series_id = v_series_id,
      submitter_ref = v_user::text
  where id = v_before.id;

  insert into public.listing_moderation_actions (
    listing_id, actor_user_id, action,
    before_status, after_status, before_lifecycle_state, after_lifecycle_state,
    before_payload, after_payload
  ) values (
    v_before.id, v_user, 'update', v_before.status, 'pending_approval',
    v_before.lifecycle_state, 'active', v_before.payload, v_payload
  );

  select private.listing_payload(listing, false) into v_result from public.listings listing where listing.id = v_before.id;
  return v_result;
end;
$$;

revoke all on function public.admin_save_listing(jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_listing(jsonb) to authenticated;
revoke all on function public.submit_listing(jsonb) from public, anon, authenticated;
grant execute on function public.submit_listing(jsonb) to authenticated;
revoke all on function public.update_my_pending_listing(text, jsonb) from public, anon, authenticated;
grant execute on function public.update_my_pending_listing(text, jsonb) to authenticated;
