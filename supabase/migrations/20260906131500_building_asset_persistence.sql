-- Durable, auditable Building Inspector persistence.
--
-- This migration deliberately keeps unattended automatic persistence disabled.
-- The automatic path can only commit after an explicit settings change and a
-- definitive verification-evidence record. Browser roles have no direct table
-- access; all privileged changes are RPC-only and run inside one transaction.

create table if not exists public.building_assets (
  id text primary key,
  listing_id text not null references public.listings(id) on delete restrict,
  venue_id text references public.venues(id) on delete restrict,
  version integer not null default 1 check (version = 1),
  provider jsonb not null default '{}'::jsonb check (jsonb_typeof(provider) = 'object'),
  geometry jsonb not null check (jsonb_typeof(geometry) = 'object'),
  render_height_meters double precision check (render_height_meters is null or render_height_meters between 0 and 1000),
  render_min_height_meters double precision check (render_min_height_meters is null or render_min_height_meters between 0 and 1000),
  capture jsonb not null default '{}'::jsonb check (jsonb_typeof(capture) = 'object'),
  persistence_method text not null default 'manual' check (persistence_method in ('manual','automatic','rollback')),
  protected_manual boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint building_assets_id_length check (char_length(id) between 1 and 220),
  constraint building_assets_height_order check (
    render_height_meters is null
    or render_min_height_meters is null
    or render_min_height_meters <= render_height_meters
  ),
  constraint building_assets_geometry_type check ((geometry ->> 'type') in ('Polygon','MultiPolygon')),
  constraint building_assets_geometry_size check (octet_length(geometry::text) <= 2000000)
);

-- A physical Venue owns one canonical building. Listings without a normalized
-- Venue may own one compatibility asset until they are promoted to a Venue.
create unique index if not exists building_assets_venue_unique_idx
  on public.building_assets(venue_id)
  where venue_id is not null;
create unique index if not exists building_assets_unvenued_listing_unique_idx
  on public.building_assets(listing_id)
  where venue_id is null;
create index if not exists building_assets_listing_idx on public.building_assets(listing_id);

create table if not exists public.building_verification_evidence (
  id bigint generated always as identity primary key,
  listing_id text not null references public.listings(id) on delete restrict,
  venue_id text references public.venues(id) on delete restrict,
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  footprint_fingerprint text,
  outcome text not null,
  auto_accept boolean not null default false,
  auto_accept_method text,
  provider_status text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint building_verification_fingerprint_length check (footprint_fingerprint is null or char_length(footprint_fingerprint) <= 240),
  constraint building_verification_method_check check (
    auto_accept_method is null or auto_accept_method in ('exact_address_and_pin','authoritative_unique_pin')
  )
);
create index if not exists building_verification_listing_idx
  on public.building_verification_evidence(listing_id, created_at desc);
create index if not exists building_verification_venue_idx
  on public.building_verification_evidence(venue_id, created_at desc)
  where venue_id is not null;

create table if not exists public.building_asset_history (
  id bigint generated always as identity primary key,
  asset_id text not null,
  listing_id text not null,
  venue_id text,
  action text not null check (action in ('create','replace','rollback')),
  persistence_method text not null check (persistence_method in ('manual','automatic','rollback')),
  policy_version text not null,
  input_snapshot jsonb,
  evidence_id bigint references public.building_verification_evidence(id) on delete set null,
  previous_asset jsonb,
  next_asset jsonb,
  actor_user_id uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  constraint building_asset_history_note_length check (note is null or char_length(note) <= 1000)
);
create index if not exists building_asset_history_listing_idx
  on public.building_asset_history(listing_id, created_at desc);
create index if not exists building_asset_history_asset_idx
  on public.building_asset_history(asset_id, created_at desc);

create table if not exists public.building_persistence_settings (
  singleton boolean primary key default true check (singleton),
  automatic_enabled boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.building_persistence_settings(singleton, automatic_enabled)
values (true, false)
on conflict (singleton) do nothing;

alter table public.building_assets enable row level security;
alter table public.building_verification_evidence enable row level security;
alter table public.building_asset_history enable row level security;
alter table public.building_persistence_settings enable row level security;

revoke all on public.building_assets from public, anon, authenticated;
revoke all on public.building_verification_evidence from public, anon, authenticated;
revoke all on public.building_asset_history from public, anon, authenticated;
revoke all on public.building_persistence_settings from public, anon, authenticated;

create or replace function private.building_persistence_staff(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.role() = 'service_role', false)
    or private.is_active_admin(check_user)
$$;

create or replace function private.building_asset_json(p_asset public.building_assets)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_asset.id is null then null else jsonb_build_object(
    'id', p_asset.id,
    'listingId', p_asset.listing_id,
    'venueId', p_asset.venue_id,
    'version', p_asset.version,
    'provider', p_asset.provider,
    'geometry', p_asset.geometry,
    'renderHeightMeters', p_asset.render_height_meters,
    'renderMinHeightMeters', p_asset.render_min_height_meters,
    'capture', coalesce(p_asset.capture, '{}'::jsonb) || jsonb_build_object(
      'createdAt', p_asset.created_at,
      'updatedAt', p_asset.updated_at
    )
  ) end
$$;

create or replace function private.building_location_json(
  p_listing public.listings,
  p_venue public.venues
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_visibility text;
begin
  if p_venue.id is not null then
    v_visibility := case when p_venue.visibility = 'public_exact' then 'public_exact' else 'not_public_exact' end;
    return jsonb_build_object(
      'listingId', p_listing.id,
      'venueId', p_venue.id,
      'address', coalesce(p_venue.address, '{}'::jsonb),
      'latitude', p_venue.latitude,
      'longitude', p_venue.longitude,
      'visibility', v_visibility,
      'locationMeta', coalesce(p_venue.location_meta, '{}'::jsonb)
    );
  end if;

  v_visibility := case
    when coalesce((p_listing.payload ->> 'isAddressPrivate')::boolean, false) then 'not_public_exact'
    when coalesce(p_listing.payload ->> 'locationVisibility', 'exact_public') in ('approximate_public','private') then 'not_public_exact'
    when coalesce(p_listing.payload #>> '{locationMeta,status}', '') = 'private' then 'not_public_exact'
    else 'public_exact'
  end;
  return jsonb_build_object(
    'listingId', p_listing.id,
    'venueId', null,
    'address', coalesce(p_listing.payload #> '{geopoint,address}', '{}'::jsonb),
    'latitude', nullif(p_listing.payload #>> '{geopoint,latitude}', '')::double precision,
    'longitude', nullif(p_listing.payload #>> '{geopoint,longitude}', '')::double precision,
    'visibility', v_visibility,
    'locationMeta', coalesce(p_listing.payload -> 'locationMeta', '{}'::jsonb)
  );
end;
$$;

create or replace function private.building_location_revision(
  p_listing public.listings,
  p_venue public.venues
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5(
    private.building_location_json(p_listing, p_venue)::text
    || '|listing:' || coalesce(p_listing.updated_at::text, '')
    || '|venue:' || coalesce(p_venue.updated_at::text, '')
  )
$$;

create or replace function private.reject_building_append_only_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Building verification/history records are append-only.' using errcode = '42501';
end;
$$;

drop trigger if exists building_verification_evidence_append_only on public.building_verification_evidence;
create trigger building_verification_evidence_append_only
  before update or delete on public.building_verification_evidence
  for each row execute procedure private.reject_building_append_only_mutation();

drop trigger if exists building_asset_history_append_only on public.building_asset_history;
create trigger building_asset_history_append_only
  before update or delete on public.building_asset_history
  for each row execute procedure private.reject_building_append_only_mutation();

create or replace function public.admin_get_building_persistence_context(p_listing_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listings%rowtype;
  v_venue public.venues%rowtype;
  v_asset public.building_assets%rowtype;
  v_location jsonb;
  v_asset_json jsonb;
  v_asset_revision text;
begin
  if not private.building_persistence_staff(auth.uid()) then
    raise exception 'Active administrator access is required.' using errcode = '42501';
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if not found then raise exception 'Listing not found.' using errcode = 'P0002'; end if;

  if v_listing.venue_id is not null then
    select * into v_venue from public.venues where id = v_listing.venue_id;
  end if;

  if v_venue.id is not null then
    select * into v_asset from public.building_assets where venue_id = v_venue.id limit 1;
  else
    select * into v_asset from public.building_assets where listing_id = v_listing.id and venue_id is null limit 1;
  end if;

  v_location := private.building_location_json(v_listing, v_venue);
  v_asset_json := private.building_asset_json(v_asset);
  v_asset_revision := case when v_asset_json is null then null else md5(v_asset_json::text) end;

  return jsonb_build_object(
    'location', v_location,
    'revisionToken', private.building_location_revision(v_listing, v_venue),
    'asset', v_asset_json,
    'assetRevisionToken', v_asset_revision,
    'automaticEnabled', coalesce((select automatic_enabled from public.building_persistence_settings where singleton), false)
  );
end;
$$;

create or replace function public.admin_list_building_assets()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.building_persistence_staff(auth.uid()) then
    raise exception 'Active administrator access is required.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(private.building_asset_json(asset) order by asset.updated_at desc)
    from public.building_assets asset
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_record_building_verification_evidence(
  p_listing_id text,
  p_input_snapshot jsonb,
  p_evidence jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listings%rowtype;
  v_venue public.venues%rowtype;
  v_location jsonb;
  v_id bigint;
  v_fingerprint text;
  v_outcome text;
  v_auto_accept boolean;
  v_method text;
  v_provider_status text;
begin
  if not private.building_persistence_staff(auth.uid()) then
    raise exception 'Active administrator or trusted service access is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_input_snapshot) <> 'object' or jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'Building verification evidence must be JSON objects.' using errcode = '22023';
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if not found then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  if v_listing.venue_id is not null then select * into v_venue from public.venues where id = v_listing.venue_id; end if;
  v_location := private.building_location_json(v_listing, v_venue);
  if v_location ->> 'visibility' <> 'public_exact' then
    raise exception 'Precise building verification is disabled for private or approximate locations.' using errcode = '42501';
  end if;

  if coalesce(p_input_snapshot ->> 'listingId', '') <> v_listing.id
     or coalesce(p_input_snapshot ->> 'venueId', '') <> coalesce(v_venue.id, '')
     or abs(coalesce((p_input_snapshot ->> 'latitude')::double precision, 999) - coalesce((v_location ->> 'latitude')::double precision, -999)) > 0.00002
     or abs(coalesce((p_input_snapshot ->> 'longitude')::double precision, 999) - coalesce((v_location ->> 'longitude')::double precision, -999)) > 0.00002 then
    raise exception 'Verification evidence is stale relative to the canonical location.' using errcode = '40001';
  end if;

  v_fingerprint := nullif(p_evidence #>> '{bestCandidate,footprintFingerprint}', '');
  v_outcome := coalesce(p_evidence ->> 'outcome', 'unconfirmed');
  v_auto_accept := coalesce((p_evidence ->> 'autoAccept')::boolean, false);
  v_method := nullif(p_evidence ->> 'autoAcceptMethod', '');
  v_provider_status := nullif(p_evidence #>> '{providerSnapshot,status}', '');

  insert into public.building_verification_evidence(
    listing_id, venue_id, input_snapshot, evidence, footprint_fingerprint,
    outcome, auto_accept, auto_accept_method, provider_status, created_by
  ) values (
    v_listing.id, v_venue.id, p_input_snapshot, p_evidence, v_fingerprint,
    v_outcome, v_auto_accept, v_method, v_provider_status, auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.admin_commit_building_asset(
  p_listing_id text,
  p_asset jsonb,
  p_expected_revision_token text,
  p_input_snapshot jsonb,
  p_expected_asset_revision_token text default null,
  p_persistence_method text default 'manual',
  p_geometry_fingerprint text default null,
  p_evidence_id bigint default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listings%rowtype;
  v_venue public.venues%rowtype;
  v_existing public.building_assets%rowtype;
  v_saved public.building_assets%rowtype;
  v_evidence public.building_verification_evidence%rowtype;
  v_location jsonb;
  v_current_revision text;
  v_existing_json jsonb;
  v_existing_revision text;
  v_asset_id text;
  v_provider jsonb;
  v_geometry jsonb;
  v_capture jsonb;
  v_method text := lower(coalesce(p_persistence_method, 'manual'));
  v_action text;
  v_auto_enabled boolean;
  v_history_id bigint;
  v_listing_payload jsonb;
begin
  if not private.building_persistence_staff(auth.uid()) then
    raise exception 'Active administrator or trusted service access is required.' using errcode = '42501';
  end if;
  if v_method not in ('manual','automatic') then
    raise exception 'Unsupported BuildingAsset persistence method.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_asset) <> 'object' then raise exception 'Missing BuildingAsset payload.' using errcode = '22023'; end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  if v_listing.venue_id is not null then
    select * into v_venue from public.venues where id = v_listing.venue_id for update;
  end if;

  v_location := private.building_location_json(v_listing, v_venue);
  if v_location ->> 'visibility' <> 'public_exact' then
    raise exception 'Precise building persistence is disabled for private or approximate locations.' using errcode = '42501';
  end if;
  v_current_revision := private.building_location_revision(v_listing, v_venue);
  if nullif(p_expected_revision_token, '') is null or p_expected_revision_token <> v_current_revision then
    raise exception 'Canonical listing/Venue location changed before BuildingAsset persistence.' using errcode = '40001';
  end if;
  if jsonb_typeof(p_input_snapshot) <> 'object'
     or coalesce(p_input_snapshot ->> 'listingId', '') <> v_listing.id
     or coalesce(p_input_snapshot ->> 'venueId', '') <> coalesce(v_venue.id, '')
     or abs(coalesce((p_input_snapshot ->> 'latitude')::double precision, 999) - coalesce((v_location ->> 'latitude')::double precision, -999)) > 0.00002
     or abs(coalesce((p_input_snapshot ->> 'longitude')::double precision, 999) - coalesce((v_location ->> 'longitude')::double precision, -999)) > 0.00002
     or coalesce(p_input_snapshot ->> 'visibility', '') <> coalesce(v_location ->> 'visibility', '') then
    raise exception 'Building persistence input snapshot is stale.' using errcode = '40001';
  end if;

  if v_venue.id is not null then
    select * into v_existing from public.building_assets where venue_id = v_venue.id for update;
  else
    select * into v_existing from public.building_assets where listing_id = v_listing.id and venue_id is null for update;
  end if;
  v_existing_json := private.building_asset_json(v_existing);
  v_existing_revision := case when v_existing_json is null then null else md5(v_existing_json::text) end;
  if coalesce(p_expected_asset_revision_token, '') <> coalesce(v_existing_revision, '') then
    raise exception 'BuildingAsset changed before persistence.' using errcode = '40001';
  end if;

  v_geometry := p_asset -> 'geometry';
  v_provider := coalesce(p_asset -> 'provider', '{}'::jsonb);
  v_capture := coalesce(p_asset -> 'capture', '{}'::jsonb);
  if jsonb_typeof(v_geometry) <> 'object' or (v_geometry ->> 'type') not in ('Polygon','MultiPolygon') then
    raise exception 'Invalid BuildingAsset geometry.' using errcode = '22023';
  end if;
  if octet_length(v_geometry::text) > 2000000 then raise exception 'BuildingAsset geometry exceeds the server size limit.' using errcode = '22023'; end if;

  if v_method = 'automatic' then
    select automatic_enabled into v_auto_enabled from public.building_persistence_settings where singleton;
    if not coalesce(v_auto_enabled, false) then
      raise exception 'Automatic BuildingAsset persistence is disabled.' using errcode = '42501';
    end if;
    if v_existing.id is not null and v_existing.protected_manual then
      raise exception 'Automatic persistence cannot replace a manually protected BuildingAsset.' using errcode = '42501';
    end if;
    if p_evidence_id is null then raise exception 'Automatic persistence requires verification evidence.' using errcode = '22023'; end if;
    select * into v_evidence from public.building_verification_evidence where id = p_evidence_id and listing_id = v_listing.id;
    if not found then raise exception 'Verification evidence not found for this listing.' using errcode = 'P0002'; end if;
    if not v_evidence.auto_accept or v_evidence.outcome <> 'verified'
       or v_evidence.auto_accept_method not in ('exact_address_and_pin','authoritative_unique_pin')
       or v_evidence.provider_status <> 'completed' then
      raise exception 'Verification evidence is not in the definitive automatic tier.' using errcode = '42501';
    end if;
    if nullif(v_evidence.footprint_fingerprint, '') is null
       or nullif(p_geometry_fingerprint, '') is null
       or v_evidence.footprint_fingerprint <> p_geometry_fingerprint then
      raise exception 'Submitted geometry no longer matches the verified footprint.' using errcode = '40001';
    end if;
    if coalesce(v_evidence.input_snapshot ->> 'listingId', '') <> v_listing.id
       or coalesce(v_evidence.input_snapshot ->> 'venueId', '') <> coalesce(v_venue.id, '')
       or abs(coalesce((v_evidence.input_snapshot ->> 'latitude')::double precision, 999) - coalesce((v_location ->> 'latitude')::double precision, -999)) > 0.00002
       or abs(coalesce((v_evidence.input_snapshot ->> 'longitude')::double precision, 999) - coalesce((v_location ->> 'longitude')::double precision, -999)) > 0.00002 then
      raise exception 'Verification evidence location is stale.' using errcode = '40001';
    end if;
  end if;

  v_asset_id := coalesce(nullif(v_existing.id, ''), nullif(p_asset ->> 'id', ''), 'building-asset-' || v_listing.id);
  v_action := case when v_existing.id is null then 'create' else 'replace' end;

  insert into public.building_assets(
    id, listing_id, venue_id, version, provider, geometry,
    render_height_meters, render_min_height_meters, capture,
    persistence_method, protected_manual, created_by, updated_by
  ) values (
    v_asset_id,
    v_listing.id,
    v_venue.id,
    1,
    v_provider,
    v_geometry,
    nullif(p_asset ->> 'renderHeightMeters', '')::double precision,
    nullif(p_asset ->> 'renderMinHeightMeters', '')::double precision,
    v_capture,
    v_method,
    v_method = 'manual',
    auth.uid(),
    auth.uid()
  )
  on conflict (id) do update set
    listing_id = excluded.listing_id,
    venue_id = excluded.venue_id,
    provider = excluded.provider,
    geometry = excluded.geometry,
    render_height_meters = excluded.render_height_meters,
    render_min_height_meters = excluded.render_min_height_meters,
    capture = excluded.capture,
    persistence_method = excluded.persistence_method,
    protected_manual = public.building_assets.protected_manual or excluded.protected_manual,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into v_saved;

  if v_venue.id is not null then
    update public.venues set building_asset_id = v_saved.id where id = v_venue.id;
  else
    update public.listings
    set payload = jsonb_set(payload, '{buildingAssetId}', to_jsonb(v_saved.id), true)
    where id = v_listing.id
    returning payload into v_listing_payload;
  end if;

  insert into public.building_asset_history(
    asset_id, listing_id, venue_id, action, persistence_method, policy_version,
    input_snapshot, evidence_id, previous_asset, next_asset, actor_user_id, note
  ) values (
    v_saved.id, v_listing.id, v_venue.id, v_action, v_method, 'building-persistence-v1',
    p_input_snapshot, p_evidence_id, v_existing_json, private.building_asset_json(v_saved), auth.uid(), nullif(trim(p_note), '')
  ) returning id into v_history_id;

  if to_regclass('public.admin_audit_log') is not null then
    perform private.record_admin_audit_internal(
      auth.uid(),
      'building_asset_' || v_action,
      'building_asset',
      v_saved.id,
      v_listing.name,
      nullif(trim(p_note), ''),
      coalesce(v_existing_json, '{}'::jsonb),
      private.building_asset_json(v_saved),
      jsonb_build_object('listingId', v_listing.id, 'venueId', v_venue.id, 'persistenceMethod', v_method)
    );
  end if;

  return jsonb_build_object(
    'asset', private.building_asset_json(v_saved),
    'historyEventId', v_history_id,
    'revisionToken', private.building_location_revision(v_listing, v_venue),
    'assetRevisionToken', md5(private.building_asset_json(v_saved)::text)
  );
end;
$$;

create or replace function public.admin_rollback_building_asset(
  p_listing_id text,
  p_history_id bigint,
  p_expected_revision_token text,
  p_input_snapshot jsonb,
  p_expected_asset_revision_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listings%rowtype;
  v_venue public.venues%rowtype;
  v_existing public.building_assets%rowtype;
  v_saved public.building_assets%rowtype;
  v_history public.building_asset_history%rowtype;
  v_location jsonb;
  v_existing_json jsonb;
  v_existing_revision text;
  v_previous jsonb;
  v_history_id bigint;
begin
  if not private.building_persistence_staff(auth.uid()) then
    raise exception 'Active administrator access is required.' using errcode = '42501';
  end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  if v_listing.venue_id is not null then
    select * into v_venue from public.venues where id = v_listing.venue_id for update;
  end if;
  v_location := private.building_location_json(v_listing, v_venue);
  if v_location ->> 'visibility' <> 'public_exact' then
    raise exception 'Precise building persistence is disabled for private or approximate locations.' using errcode = '42501';
  end if;
  if nullif(p_expected_revision_token, '') is null
     or p_expected_revision_token <> private.building_location_revision(v_listing, v_venue) then
    raise exception 'Canonical listing/Venue location changed before rollback.' using errcode = '40001';
  end if;
  if jsonb_typeof(p_input_snapshot) <> 'object'
     or coalesce(p_input_snapshot ->> 'listingId', '') <> v_listing.id
     or coalesce(p_input_snapshot ->> 'venueId', '') <> coalesce(v_venue.id, '')
     or abs(coalesce((p_input_snapshot ->> 'latitude')::double precision, 999) - coalesce((v_location ->> 'latitude')::double precision, -999)) > 0.00002
     or abs(coalesce((p_input_snapshot ->> 'longitude')::double precision, 999) - coalesce((v_location ->> 'longitude')::double precision, -999)) > 0.00002 then
    raise exception 'Rollback input snapshot is stale.' using errcode = '40001';
  end if;

  if v_venue.id is not null then
    select * into v_existing from public.building_assets where venue_id = v_venue.id for update;
  else
    select * into v_existing from public.building_assets where listing_id = v_listing.id and venue_id is null for update;
  end if;
  if v_existing.id is null then raise exception 'No current BuildingAsset exists to roll back.' using errcode = 'P0002'; end if;
  v_existing_json := private.building_asset_json(v_existing);
  v_existing_revision := md5(v_existing_json::text);
  if coalesce(p_expected_asset_revision_token, '') <> v_existing_revision then
    raise exception 'BuildingAsset changed before rollback.' using errcode = '40001';
  end if;

  select * into v_history
  from public.building_asset_history
  where id = p_history_id and listing_id = v_listing.id and previous_asset is not null;
  if not found then raise exception 'The requested BuildingAsset history revision is not restorable.' using errcode = 'P0002'; end if;
  v_previous := v_history.previous_asset;
  if (v_previous ->> 'id') <> v_existing.id then
    raise exception 'History revision belongs to a different BuildingAsset.' using errcode = '40001';
  end if;
  if jsonb_typeof(v_previous -> 'geometry') <> 'object'
     or (v_previous #>> '{geometry,type}') not in ('Polygon','MultiPolygon') then
    raise exception 'Historical BuildingAsset geometry is invalid.' using errcode = '22023';
  end if;

  update public.building_assets set
    provider = coalesce(v_previous -> 'provider', '{}'::jsonb),
    geometry = v_previous -> 'geometry',
    render_height_meters = nullif(v_previous ->> 'renderHeightMeters', '')::double precision,
    render_min_height_meters = nullif(v_previous ->> 'renderMinHeightMeters', '')::double precision,
    capture = coalesce(v_previous -> 'capture', '{}'::jsonb),
    persistence_method = 'rollback',
    protected_manual = true,
    updated_by = auth.uid(),
    updated_at = now()
  where id = v_existing.id
  returning * into v_saved;

  if v_venue.id is not null then
    update public.venues set building_asset_id = v_saved.id where id = v_venue.id;
  else
    update public.listings
    set payload = jsonb_set(payload, '{buildingAssetId}', to_jsonb(v_saved.id), true)
    where id = v_listing.id;
  end if;

  insert into public.building_asset_history(
    asset_id, listing_id, venue_id, action, persistence_method, policy_version,
    input_snapshot, previous_asset, next_asset, actor_user_id, note
  ) values (
    v_saved.id, v_listing.id, v_venue.id, 'rollback', 'rollback', 'building-persistence-v1',
    p_input_snapshot, v_existing_json, private.building_asset_json(v_saved), auth.uid(),
    'Restored history event ' || p_history_id::text
  ) returning id into v_history_id;

  if to_regclass('public.admin_audit_log') is not null then
    perform private.record_admin_audit_internal(
      auth.uid(), 'building_asset_rollback', 'building_asset', v_saved.id, v_listing.name,
      'Restored history event ' || p_history_id::text,
      v_existing_json, private.building_asset_json(v_saved),
      jsonb_build_object('listingId', v_listing.id, 'venueId', v_venue.id, 'restoredHistoryId', p_history_id)
    );
  end if;

  return jsonb_build_object(
    'asset', private.building_asset_json(v_saved),
    'historyEventId', v_history_id,
    'revisionToken', private.building_location_revision(v_listing, v_venue),
    'assetRevisionToken', md5(private.building_asset_json(v_saved)::text)
  );
end;
$$;

create or replace function public.admin_list_building_asset_history(p_listing_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.building_persistence_staff(auth.uid()) then
    raise exception 'Active administrator access is required.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'version', 1,
      'id', history.id::text,
      'listingId', history.listing_id,
      'venueId', history.venue_id,
      'action', history.action,
      'occurredAt', history.created_at,
      'actorUserId', history.actor_user_id,
      'persistenceMode', history.persistence_method,
      'policyVersion', history.policy_version,
      'inputSnapshot', history.input_snapshot,
      'evidenceId', history.evidence_id,
      'previousAsset', history.previous_asset,
      'nextAsset', history.next_asset,
      'note', history.note
    ) order by history.created_at desc)
    from public.building_asset_history history
    where history.listing_id = p_listing_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_set_building_automatic_persistence(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Active administrator access is required.' using errcode = '42501';
  end if;
  update public.building_persistence_settings
  set automatic_enabled = p_enabled, updated_by = auth.uid(), updated_at = now()
  where singleton;
  if to_regclass('public.admin_audit_log') is not null then
    perform private.record_admin_audit_internal(
      auth.uid(), 'building_automatic_persistence_setting', 'building_persistence_settings', 'singleton',
      'Building automatic persistence', null, '{}'::jsonb,
      jsonb_build_object('automaticEnabled', p_enabled), '{}'::jsonb
    );
  end if;
  return jsonb_build_object('automaticEnabled', p_enabled);
end;
$$;

revoke all on function private.building_persistence_staff(uuid) from public, anon;
revoke all on function private.building_asset_json(public.building_assets) from public, anon, authenticated;
revoke all on function private.building_location_json(public.listings, public.venues) from public, anon, authenticated;
revoke all on function private.building_location_revision(public.listings, public.venues) from public, anon, authenticated;
revoke all on function private.reject_building_append_only_mutation() from public, anon, authenticated;

grant execute on function public.admin_get_building_persistence_context(text) to authenticated;
grant execute on function public.admin_list_building_assets() to authenticated;
grant execute on function public.admin_record_building_verification_evidence(text, jsonb, jsonb) to authenticated;
grant execute on function public.admin_commit_building_asset(text, jsonb, text, jsonb, text, text, text, bigint, text) to authenticated;
grant execute on function public.admin_rollback_building_asset(text, bigint, text, jsonb, text) to authenticated;
grant execute on function public.admin_list_building_asset_history(text) to authenticated;
grant execute on function public.admin_set_building_automatic_persistence(boolean) to authenticated;

comment on table public.building_assets is
  'Canonical Venue/listing BuildingAssets. Direct browser table access is disabled; writes are guarded by transactional RPCs.';
comment on table public.building_verification_evidence is
  'Append-only evidence used to prove or refuse automatic BuildingAsset persistence.';
comment on table public.building_asset_history is
  'Append-only BuildingAsset revision history used for audit and rollback tooling.';
comment on table public.building_persistence_settings is
  'Kill switch for unattended automatic BuildingAsset persistence. Defaults disabled.';
