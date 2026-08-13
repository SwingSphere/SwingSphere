-- Canonical production persistence for SwingSphere club/event listings.
--
-- The existing frontend listing object remains intact in payload JSON while the
-- fields that define trust, moderation, ownership, and lifecycle are normalized.
-- Public reads go through a sanitizing RPC so private-address payload fields are
-- never exposed through direct table access.

create table public.listings (
  id text primary key,
  listing_type text not null check (listing_type in ('club', 'event')),
  name text not null,
  status text not null default 'pending_approval'
    check (status in ('pending_approval', 'approved', 'flagged')),
  lifecycle_state text not null default 'active'
    check (lifecycle_state in ('active', 'rejected', 'archived')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  submitted_by uuid references public.profiles(id) on delete set null,
  submitter_ref text,
  owner_organization_id text references public.organizations(id) on delete set null,
  provenance text not null default 'community'
    check (provenance in ('community', 'owner', 'promoter', 'admin', 'legacy')),
  submitted_at timestamptz not null default now(),
  published_at timestamptz,
  last_moderated_at timestamptz,
  last_moderated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_id_length check (char_length(id) between 1 and 160),
  constraint listings_name_length check (char_length(name) between 1 and 240),
  constraint listings_submitter_ref_length check (submitter_ref is null or char_length(submitter_ref) <= 160)
);

create index listings_discovery_idx
  on public.listings(lifecycle_state, status, listing_type, name);
create index listings_submitter_idx
  on public.listings(submitted_by, submitted_at desc)
  where submitted_by is not null;
create index listings_owner_organization_idx
  on public.listings(owner_organization_id, updated_at desc)
  where owner_organization_id is not null;
create index listings_moderation_queue_idx
  on public.listings(status, submitted_at asc)
  where lifecycle_state = 'active' and status <> 'approved';

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute procedure public.set_updated_at();

create table public.listing_moderation_actions (
  id bigint generated always as identity primary key,
  listing_id text not null references public.listings(id) on delete restrict,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null
    check (action in ('submit', 'update', 'approve', 'flag', 'reject', 'archive', 'restore', 'admin_save', 'legacy_import')),
  reason text,
  before_status text,
  after_status text,
  before_lifecycle_state text,
  after_lifecycle_state text,
  before_payload jsonb,
  after_payload jsonb,
  created_at timestamptz not null default now(),
  constraint listing_moderation_reason_length check (reason is null or char_length(reason) <= 1000)
);

create index listing_moderation_actions_listing_idx
  on public.listing_moderation_actions(listing_id, created_at desc);
create index listing_moderation_actions_actor_idx
  on public.listing_moderation_actions(actor_user_id, created_at desc)
  where actor_user_id is not null;

create table public.listing_store_settings (
  singleton boolean primary key default true check (singleton),
  legacy_import_completed_at timestamptz,
  legacy_import_count integer not null default 0 check (legacy_import_count >= 0),
  updated_at timestamptz not null default now()
);

insert into public.listing_store_settings(singleton) values (true)
on conflict (singleton) do nothing;

create trigger listing_store_settings_set_updated_at
  before update on public.listing_store_settings
  for each row execute procedure public.set_updated_at();

alter table public.listings enable row level security;
alter table public.listing_moderation_actions enable row level security;
alter table public.listing_store_settings enable row level security;

-- All browser access is intentionally RPC-only. This prevents a future broad
-- table grant from accidentally exposing raw private-address submission data.
revoke all on public.listings from public, anon, authenticated;
revoke all on public.listing_moderation_actions from public, anon, authenticated;
revoke all on public.listing_store_settings from public, anon, authenticated;

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

  if p_listing.owner_organization_id is not null and p_listing.listing_type = 'event' then
    v_payload := v_payload || jsonb_build_object('organizerOrganizationId', p_listing.owner_organization_id);
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

create or replace function public.listing_store_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'legacyImportComplete', settings.legacy_import_completed_at is not null,
    'legacyImportCompletedAt', settings.legacy_import_completed_at,
    'legacyImportCount', settings.legacy_import_count,
    'listingCount', (select count(*) from public.listings where lifecycle_state = 'active'),
    'approvedCount', (select count(*) from public.listings where lifecycle_state = 'active' and status = 'approved'),
    'pendingCount', (select count(*) from public.listings where lifecycle_state = 'active' and status = 'pending_approval')
  )
  from public.listing_store_settings settings
  where settings.singleton = true
$$;

create or replace function public.list_public_listings()
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.listing_payload(listing, true)
  from public.listings listing
  where listing.lifecycle_state = 'active'
    and listing.status = 'approved'
  order by listing.name, listing.id
$$;

create or replace function public.list_my_listings()
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  return query
  select private.listing_payload(listing, false)
  from public.listings listing
  where listing.submitted_by = auth.uid()
    and listing.lifecycle_state = 'active'
  order by listing.updated_at desc;
end;
$$;

create or replace function public.admin_list_listings()
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;

  return query
  select private.listing_payload(listing, false)
  from public.listings listing
  where listing.lifecycle_state = 'active'
  order by listing.updated_at desc;
end;
$$;

create or replace function public.list_accessible_listings()
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and private.is_active_admin(auth.uid()) then
    return query
    select private.listing_payload(listing, false)
    from public.listings listing
    where listing.lifecycle_state = 'active'
    order by listing.updated_at desc;
    return;
  end if;

  return query
  select private.listing_payload(listing, true)
  from public.listings listing
  where listing.lifecycle_state = 'active'
    and listing.status = 'approved'
  order by listing.name, listing.id;

  if auth.uid() is not null then
    return query
    select private.listing_payload(listing, false)
    from public.listings listing
    where listing.lifecycle_state = 'active'
      and listing.status <> 'approved'
      and listing.submitted_by = auth.uid()
    order by listing.updated_at desc;
  end if;
end;
$$;

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
  v_org text := nullif(trim(coalesce(p_payload ->> 'organizerOrganizationId', '')), '');
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
  v_payload jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required.';
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

  return v_payload;
end;
$$;

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
  v_org text := nullif(trim(coalesce(p_payload ->> 'organizerOrganizationId', '')), '');
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

create or replace function public.save_listing(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := trim(coalesce(p_payload ->> 'id', ''));
  v_existing public.listings;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if private.is_active_admin(auth.uid()) then
    return public.admin_save_listing(p_payload);
  end if;

  if v_id <> '' then
    select * into v_existing from public.listings where id = v_id;
    if v_existing.id is not null
       and v_existing.submitted_by = auth.uid()
       and v_existing.lifecycle_state = 'active'
       and v_existing.status = 'pending_approval' then
      return public.update_my_pending_listing(v_id, p_payload);
    end if;
  end if;

  return public.submit_listing(p_payload);
end;
$$;

create or replace function public.admin_moderate_listing(
  p_listing_id text,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_before public.listings;
  v_after public.listings;
  v_status text;
  v_lifecycle text;
begin
  if not private.is_active_admin(v_admin) then
    raise exception 'Administrator access required.';
  end if;
  if v_action not in ('approve', 'flag', 'reject', 'archive', 'restore') then
    raise exception 'Unsupported moderation action.';
  end if;

  select * into v_before from public.listings where id = p_listing_id for update;
  if v_before.id is null then raise exception 'Listing not found.'; end if;

  v_status := v_before.status;
  v_lifecycle := v_before.lifecycle_state;

  if v_action = 'approve' then
    v_status := 'approved';
    v_lifecycle := 'active';
  elsif v_action = 'flag' then
    v_status := 'flagged';
    v_lifecycle := 'active';
  elsif v_action = 'reject' then
    v_status := 'flagged';
    v_lifecycle := 'rejected';
  elsif v_action = 'archive' then
    v_lifecycle := 'archived';
  elsif v_action = 'restore' then
    v_lifecycle := 'active';
  end if;

  update public.listings
  set status = v_status,
      lifecycle_state = v_lifecycle,
      payload = payload || jsonb_build_object('status', v_status),
      published_at = case when v_action = 'approve' then coalesce(published_at, now()) else published_at end,
      last_moderated_at = now(),
      last_moderated_by = v_admin
  where id = p_listing_id
  returning * into v_after;

  insert into public.listing_moderation_actions (
    listing_id, actor_user_id, action, reason,
    before_status, after_status,
    before_lifecycle_state, after_lifecycle_state,
    before_payload, after_payload
  ) values (
    p_listing_id, v_admin, v_action, nullif(trim(p_reason), ''),
    v_before.status, v_after.status,
    v_before.lifecycle_state, v_after.lifecycle_state,
    v_before.payload, v_after.payload
  );

  if v_action = 'approve' then
    perform public.feedback_register_target(v_after.listing_type, v_after.id, v_after.name, 'active');
  end if;

  return private.listing_payload(v_after, false);
end;
$$;

create or replace function public.admin_import_legacy_listings(p_listings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_item jsonb;
  v_id text;
  v_type text;
  v_name text;
  v_status text;
  v_submitter_ref text;
  v_submitted_by uuid;
  v_org text;
  v_owner_org text;
  v_inserted integer := 0;
begin
  if not private.is_active_admin(v_admin) then
    raise exception 'Administrator access required.';
  end if;
  if jsonb_typeof(p_listings) <> 'array' then
    raise exception 'Legacy listing import requires a JSON array.';
  end if;

  for v_item in select value from jsonb_array_elements(p_listings)
  loop
    v_id := trim(coalesce(v_item ->> 'id', ''));
    v_type := lower(trim(coalesce(v_item ->> 'type', '')));
    v_name := trim(coalesce(v_item ->> 'name', ''));
    v_status := lower(trim(coalesce(v_item ->> 'status', 'approved')));
    v_submitter_ref := nullif(trim(coalesce(v_item ->> 'postedByUserId', '')), '');
    v_submitted_by := null;
    v_owner_org := null;
    v_org := nullif(trim(coalesce(v_item ->> 'organizerOrganizationId', '')), '');

    if v_id = '' or v_type not in ('club', 'event') or v_name = '' then
      continue;
    end if;
    if v_status not in ('pending_approval', 'approved', 'flagged') then v_status := 'approved'; end if;

    if v_submitter_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       and exists (select 1 from public.profiles where id = v_submitter_ref::uuid) then
      v_submitted_by := v_submitter_ref::uuid;
    end if;
    if v_org is not null and exists (select 1 from public.organizations where id = v_org) then
      v_owner_org := v_org;
    end if;

    insert into public.listings (
      id, listing_type, name, status, lifecycle_state, payload,
      submitted_by, submitter_ref, owner_organization_id, provenance,
      submitted_at, published_at, last_moderated_at, last_moderated_by
    ) values (
      v_id, v_type, v_name, v_status, 'active',
      v_item || jsonb_build_object('id', v_id, 'type', v_type, 'name', v_name, 'status', v_status),
      v_submitted_by, v_submitter_ref, v_owner_org, 'legacy',
      now(), case when v_status = 'approved' then now() else null end, now(), v_admin
    )
    on conflict (id) do nothing;

    if found then
      v_inserted := v_inserted + 1;
      insert into public.listing_moderation_actions (
        listing_id, actor_user_id, action, after_status, after_lifecycle_state, after_payload
      ) values (
        v_id, v_admin, 'legacy_import', v_status, 'active', v_item
      );
    end if;
  end loop;

  update public.listing_store_settings
  set legacy_import_completed_at = now(),
      legacy_import_count = (select count(*) from public.listings where provenance = 'legacy')
  where singleton = true;

  return jsonb_build_object(
    'inserted', v_inserted,
    'total', (select count(*) from public.listings),
    'legacyImportComplete', true
  );
end;
$$;

create or replace function public.admin_list_listing_moderation_actions(p_listing_id text default null)
returns table (
  id bigint,
  listing_id text,
  actor_user_id uuid,
  action text,
  reason text,
  before_status text,
  after_status text,
  before_lifecycle_state text,
  after_lifecycle_state text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;

  return query
  select
    log.id, log.listing_id, log.actor_user_id, log.action, log.reason,
    log.before_status, log.after_status,
    log.before_lifecycle_state, log.after_lifecycle_state,
    log.created_at
  from public.listing_moderation_actions log
  where p_listing_id is null or log.listing_id = p_listing_id
  order by log.created_at desc, log.id desc;
end;
$$;

revoke all on function private.listing_payload(public.listings, boolean) from public, anon, authenticated;

revoke all on function public.listing_store_state() from public;
grant execute on function public.listing_store_state() to anon, authenticated;

revoke all on function public.list_public_listings() from public;
grant execute on function public.list_public_listings() to anon, authenticated;

revoke all on function public.list_accessible_listings() from public;
grant execute on function public.list_accessible_listings() to anon, authenticated;

revoke all on function public.list_my_listings() from public, anon;
grant execute on function public.list_my_listings() to authenticated;

revoke all on function public.admin_list_listings() from public, anon, authenticated;
grant execute on function public.admin_list_listings() to authenticated;

revoke all on function public.submit_listing(jsonb) from public, anon;
grant execute on function public.submit_listing(jsonb) to authenticated;

revoke all on function public.update_my_pending_listing(text, jsonb) from public, anon;
grant execute on function public.update_my_pending_listing(text, jsonb) to authenticated;

revoke all on function public.admin_save_listing(jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_listing(jsonb) to authenticated;

revoke all on function public.save_listing(jsonb) from public, anon;
grant execute on function public.save_listing(jsonb) to authenticated;

revoke all on function public.admin_moderate_listing(text, text, text) from public, anon, authenticated;
grant execute on function public.admin_moderate_listing(text, text, text) to authenticated;

revoke all on function public.admin_import_legacy_listings(jsonb) from public, anon, authenticated;
grant execute on function public.admin_import_legacy_listings(jsonb) to authenticated;

revoke all on function public.admin_list_listing_moderation_actions(text) from public, anon, authenticated;
grant execute on function public.admin_list_listing_moderation_actions(text) to authenticated;

comment on table public.listings is
  'Canonical club/event listing persistence. Raw payloads are RPC-only because they may contain precise private-location data.';
comment on table public.listing_moderation_actions is
  'Append-only listing/submission moderation history. Raw before/after payloads remain admin-only.';
comment on function public.list_accessible_listings() is
  'Viewer-aware listing projection: admins receive active raw listings, members receive public listings plus their own pending/flagged submissions, anonymous visitors receive sanitized approved listings.';
