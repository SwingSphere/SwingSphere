-- Consolidate canonical entity identity links used by media inheritance.
--
-- Logos remain owned by the entity they were uploaded for. SwingSphere resolves
-- inherited brand media through explicit entity relationships instead of copying
-- URLs or matching display names. This migration normalizes the relationship IDs
-- on listing rows so all clients have stable graph edges to follow.

-- Keep the normalized owner column and listing payload representation in sync.
create or replace function private.sync_listing_identity_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.payload := coalesce(new.payload, '{}'::jsonb);

  if new.listing_type = 'event' then
    new.payload := new.payload - 'ownerOrganizationId';
    if new.owner_organization_id is null then
      new.payload := new.payload - 'organizerOrganizationId';
    else
      new.payload := new.payload || jsonb_build_object('organizerOrganizationId', new.owner_organization_id);
    end if;
  elsif new.listing_type = 'club' then
    new.payload := new.payload - 'organizerOrganizationId';
    if new.owner_organization_id is null then
      new.payload := new.payload - 'ownerOrganizationId';
    else
      new.payload := new.payload || jsonb_build_object('ownerOrganizationId', new.owner_organization_id);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_listing_identity_payload() from public, anon, authenticated;

drop trigger if exists listings_sync_identity_payload on public.listings;
create trigger listings_sync_identity_payload
  before insert or update of listing_type, owner_organization_id, payload on public.listings
  for each row execute procedure private.sync_listing_identity_payload();

-- Every legacy club that already has a canonical venue gets that venue explicitly
-- authored into the listing payload. This replaces `venue-${listing.id}` runtime
-- guessing for the current production catalog without forcing all future clubs to
-- have a venue.
update public.listings listing
set payload = listing.payload || jsonb_build_object('primaryVenueId', venue.id)
from public.venues venue
where listing.listing_type = 'club'
  and listing.lifecycle_state = 'active'
  and coalesce(nullif(listing.payload ->> 'primaryVenueId', ''), '') = ''
  and venue.id = 'venue-' || listing.id;

-- When a club's primary venue has an explicit primary owner/operator relationship,
-- persist that organization on the normalized listing row. No name matching is
-- involved. The trigger above mirrors it to payload.ownerOrganizationId.
with club_identity as (
  select distinct on (listing.id)
    listing.id as listing_id,
    relationship.organization_id
  from public.listings listing
  join public.organization_venue_relationships relationship
    on relationship.venue_id = listing.payload ->> 'primaryVenueId'
  where listing.listing_type = 'club'
    and listing.lifecycle_state = 'active'
    and listing.owner_organization_id is null
    and relationship.relationship_type in ('owner_operator', 'primary_home')
  order by
    listing.id,
    case when relationship.relationship_type = 'owner_operator' then 0 else 1 end,
    case when relationship.is_primary then 0 else 1 end,
    relationship.confidence desc nulls last,
    relationship.id
)
update public.listings listing
set owner_organization_id = identity.organization_id
from club_identity identity
where listing.id = identity.listing_id;

-- Prefer event-series ownership when it exists. This turns series membership into
-- a stable organizer edge for occurrences whose old payload omitted it.
update public.listings listing
set owner_organization_id = series.organizer_organization_id
from public.event_series series
where listing.listing_type = 'event'
  and listing.lifecycle_state = 'active'
  and listing.owner_organization_id is null
  and series.id = listing.payload ->> 'eventSeriesId'
  and series.organizer_organization_id is not null;

-- A small number of pre-series production events predate canonical organization
-- links. Normalize those known records once; runtime media resolution never falls
-- back to these names.
update public.listings
set owner_organization_id = 'org-promoter-bronze-party'
where listing_type = 'event'
  and owner_organization_id is null
  and lower(trim(coalesce(payload ->> 'hostName', ''))) = 'bronze party'
  and exists (select 1 from public.organizations where id = 'org-promoter-bronze-party');

update public.listings
set owner_organization_id = 'org-promoter-illuminaughty'
where listing_type = 'event'
  and owner_organization_id is null
  and lower(trim(coalesce(payload ->> 'hostName', ''))) = 'illuminaughty'
  and exists (select 1 from public.organizations where id = 'org-promoter-illuminaughty');

-- Public/private listing serialization exposes the canonical relationship key for
-- both entity kinds. Private-address sanitization remains unchanged.
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

  if p_listing.owner_organization_id is not null then
    if p_listing.listing_type = 'event' then
      v_payload := (v_payload - 'ownerOrganizationId')
        || jsonb_build_object('organizerOrganizationId', p_listing.owner_organization_id);
    elsif p_listing.listing_type = 'club' then
      v_payload := (v_payload - 'organizerOrganizationId')
        || jsonb_build_object('ownerOrganizationId', p_listing.owner_organization_id);
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

-- Admin saves accept the canonical organization key for either listing kind.
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
  v_owner_org text;
  v_before public.listings;
  v_payload jsonb;
  v_result jsonb;
begin
  if not private.is_active_admin(v_admin) then
    raise exception 'Administrator access required.';
  end if;
  if v_type not in ('club', 'event') then raise exception 'Listing type must be club or event.'; end if;
  if v_name = '' then raise exception 'Listing name is required.'; end if;
  if v_status not in ('pending_approval', 'approved', 'flagged') then v_status := 'approved'; end if;
  if v_id = '' then v_id := v_type || '-' || gen_random_uuid()::text; end if;

  v_org := case
    when v_type = 'event' then nullif(trim(coalesce(p_payload ->> 'organizerOrganizationId', '')), '')
    else nullif(trim(coalesce(p_payload ->> 'ownerOrganizationId', '')), '')
  end;

  select * into v_before from public.listings where id = v_id for update;

  if v_before.id is not null then
    v_submitted_by := v_before.submitted_by;
    v_submitter_ref := coalesce(v_before.submitter_ref, v_submitter_ref);
  elsif v_submitter_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (select 1 from public.profiles where id = v_submitter_ref::uuid) then
    v_submitted_by := v_submitter_ref::uuid;
  end if;

  if v_org is not null and exists (select 1 from public.organizations where id = v_org) then
    v_owner_org := v_org;
  elsif v_before.id is not null then
    v_owner_org := v_before.owner_organization_id;
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object('id', v_id, 'type', v_type, 'name', v_name, 'status', v_status);

  insert into public.listings (
    id, listing_type, name, status, lifecycle_state, payload,
    submitted_by, submitter_ref, owner_organization_id, provenance,
    submitted_at, published_at, last_moderated_at, last_moderated_by
  ) values (
    v_id, v_type, v_name, v_status, 'active', v_payload,
    v_submitted_by, v_submitter_ref, v_owner_org,
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

  if v_status = 'approved' then
    perform public.feedback_register_target(v_type, v_id, v_name, 'active');
  end if;

  select private.listing_payload(listing, false) into v_result
  from public.listings listing where listing.id = v_id;
  return v_result;
end;
$$;

-- A public submission may connect itself to an organization only when the
-- submitter already has management rights there. This supports both club owners
-- and event organizers without introducing a privilege escalation.
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
  v_provenance text := 'community';
  v_payload jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;
  if not exists (select 1 from public.profiles where id = v_user and status = 'active') then
    raise exception 'An active SwingSphere account is required.';
  end if;
  if v_type not in ('club', 'event') then
    raise exception 'Listing type must be club or event.';
  end if;
  if v_name = '' then
    raise exception 'Listing name is required.';
  end if;

  if v_id = '' or exists (select 1 from public.listings where id = v_id) then
    v_id := v_type || '-' || gen_random_uuid()::text;
  end if;

  v_org := case
    when v_type = 'event' then nullif(trim(coalesce(p_payload ->> 'organizerOrganizationId', '')), '')
    else nullif(trim(coalesce(p_payload ->> 'ownerOrganizationId', '')), '')
  end;

  if v_org is not null
     and exists (select 1 from public.organizations where id = v_org)
     and private.can_manage_organization(
       v_org,
       array['owner','manager','editor']::public.organization_member_role[]
     ) then
    v_owner_org := v_org;
    v_provenance := 'promoter';
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object(
      'id', v_id,
      'type', v_type,
      'name', v_name,
      'status', 'pending_approval',
      'postedByUserId', v_user::text
    );

  insert into public.listings (
    id, listing_type, name, status, lifecycle_state, payload,
    submitted_by, submitter_ref, owner_organization_id, provenance
  ) values (
    v_id, v_type, v_name, 'pending_approval', 'active', v_payload,
    v_user, v_user::text, v_owner_org, v_provenance
  );

  insert into public.listing_moderation_actions (
    listing_id, actor_user_id, action, after_status, after_lifecycle_state, after_payload
  ) values (
    v_id, v_user, 'submit', 'pending_approval', 'active', v_payload
  );

  select private.listing_payload(listing, false) into v_payload
  from public.listings listing where listing.id = v_id;
  return v_payload;
end;
$$;

-- Existing pending submissions can update an organization link only if the
-- member currently manages that organization; otherwise the prior link is kept.
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
  v_payload jsonb;
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;
  if not exists (
    select 1 from public.profiles where id = v_user and status = 'active'
  ) then
    raise exception 'An active SwingSphere account is required.';
  end if;

  select * into v_before
  from public.listings
  where id = p_listing_id
    and submitted_by = v_user
    and lifecycle_state = 'active'
    and status = 'pending_approval'
  for update;

  if v_before.id is null then
    raise exception 'Pending listing is unavailable.';
  end if;

  v_name := trim(coalesce(p_payload ->> 'name', v_before.name));
  if v_name = '' then raise exception 'Listing name is required.'; end if;

  v_requested_org := case
    when v_before.listing_type = 'event' then nullif(trim(coalesce(p_payload ->> 'organizerOrganizationId', '')), '')
    else nullif(trim(coalesce(p_payload ->> 'ownerOrganizationId', '')), '')
  end;
  v_owner_org := v_before.owner_organization_id;

  if v_requested_org is null then
    v_owner_org := null;
  elsif exists (select 1 from public.organizations where id = v_requested_org)
    and private.can_manage_organization(
      v_requested_org,
      array['owner','manager','editor']::public.organization_member_role[]
    ) then
    v_owner_org := v_requested_org;
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object(
      'id', v_before.id,
      'type', v_before.listing_type,
      'name', v_name,
      'status', 'pending_approval',
      'postedByUserId', v_user::text
    );

  update public.listings
  set name = v_name,
      payload = v_payload,
      owner_organization_id = v_owner_org,
      submitter_ref = v_user::text
  where id = v_before.id;

  insert into public.listing_moderation_actions (
    listing_id, actor_user_id, action,
    before_status, after_status,
    before_lifecycle_state, after_lifecycle_state,
    before_payload, after_payload
  ) values (
    v_before.id, v_user, 'update',
    v_before.status, 'pending_approval',
    v_before.lifecycle_state, 'active',
    v_before.payload, v_payload
  );

  select private.listing_payload(listing, false) into v_result
  from public.listings listing where listing.id = v_before.id;
  return v_result;
end;
$$;

-- Preserve the existing RPC privilege boundary after function replacement.
revoke all on function public.admin_save_listing(jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_listing(jsonb) to authenticated;
revoke all on function public.submit_listing(jsonb) from public, anon, authenticated;
grant execute on function public.submit_listing(jsonb) to authenticated;
revoke all on function public.update_my_pending_listing(text, jsonb) from public, anon, authenticated;
grant execute on function public.update_my_pending_listing(text, jsonb) to authenticated;

comment on function private.sync_listing_identity_payload() is
  'Keeps listing payload organization identity keys synchronized with normalized owner_organization_id so media/entity inheritance never depends on names.';
