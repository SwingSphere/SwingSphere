-- SwingSphere first-party outbound attribution and listing-claim verification foundation.
-- This migration deliberately stores no uploaded verification documents or government IDs.

-- Keep operational account fields out of the publicly readable profile surface.
-- Existing application queries already request only these public-facing columns.
revoke select on public.profiles from anon, authenticated;
grant select (
  id,
  display_name,
  handle,
  role,
  status,
  avatar_url,
  bio,
  created_at
) on public.profiles to anon, authenticated;

comment on column public.profiles.account_intent is
  'Private operational signup intent. Not included in public profile column grants.';
comment on column public.profiles.email_verified_at is
  'Private account-verification state. Not included in public profile column grants.';

create table public.outbound_click_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  user_id uuid references public.profiles(id) on delete set null,
  anonymous_session_id uuid not null,
  entity_type text not null check (entity_type in (
    'club', 'event', 'event_series', 'venue', 'organization',
    'resort', 'cruise_series', 'cruise_sailing', 'profile'
  )),
  entity_id text not null check (char_length(entity_id) between 1 and 200),
  organization_id text,
  event_series_id text,
  destination_type text not null check (destination_type in (
    'ticket', 'rsvp', 'approval_form', 'booking', 'website', 'social',
    'email', 'directions', 'calendar_google', 'calendar_ics', 'other'
  )),
  destination_domain text not null check (char_length(destination_domain) between 1 and 255),
  placement text not null check (char_length(placement) between 1 and 100),
  surface text not null check (surface in (
    'home', 'globe', 'map', 'search', 'details_panel', 'entity_page',
    'saved', 'recommendation', 'direct', 'unknown'
  )),
  campaign_key text check (campaign_key is null or char_length(campaign_key) <= 100),
  market_id text check (market_id is null or char_length(market_id) <= 100),
  device_class text not null default 'unknown' check (device_class in ('mobile', 'tablet', 'desktop', 'unknown')),
  interaction_type text not null default 'click' check (interaction_type in ('click', 'auxclick', 'keyboard')),
  app_version text check (app_version is null or char_length(app_version) <= 80),
  is_qualified boolean not null default true,
  is_suspected_bot boolean not null default false
);

comment on table public.outbound_click_events is
  'Short-lived first-party events proving that SwingSphere sent traffic to an external destination. Never expose row-level records to promoters or sponsors.';
comment on column public.outbound_click_events.user_id is
  'Optional authenticated user linkage. Retention tooling removes this linkage before raw click deletion.';
comment on column public.outbound_click_events.anonymous_session_id is
  'Rotating browser-session identifier used for deduplication and aggregate unique-session counts; it is not a cross-device identity.';

create index outbound_click_events_entity_idx
  on public.outbound_click_events(entity_type, entity_id, occurred_at desc);
create index outbound_click_events_organization_idx
  on public.outbound_click_events(organization_id, occurred_at desc)
  where organization_id is not null;
create index outbound_click_events_session_idx
  on public.outbound_click_events(anonymous_session_id, occurred_at desc);
create index outbound_click_events_retention_idx
  on public.outbound_click_events(occurred_at);

create table public.outbound_click_daily_rollups (
  rollup_key text primary key,
  day date not null,
  entity_type text not null,
  entity_id text not null,
  organization_id text not null default '',
  event_series_id text not null default '',
  destination_type text not null,
  destination_domain text not null,
  placement text not null,
  surface text not null,
  campaign_key text not null default '',
  total_clicks bigint not null default 0,
  qualified_clicks bigint not null default 0,
  unique_session_count bigint not null default 0,
  unique_user_count bigint not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.outbound_click_daily_rollups is
  'Long-lived aggregate outbound traffic metrics. Contains no names, emails, raw URLs, or user-level browsing histories.';

create index outbound_click_daily_rollups_entity_idx
  on public.outbound_click_daily_rollups(entity_type, entity_id, day desc);
create index outbound_click_daily_rollups_organization_idx
  on public.outbound_click_daily_rollups(organization_id, day desc)
  where organization_id <> '';
create index outbound_click_daily_rollups_campaign_idx
  on public.outbound_click_daily_rollups(campaign_key, day desc)
  where campaign_key <> '';

create table public.outbound_click_daily_unique_sessions (
  day date not null,
  rollup_key text not null references public.outbound_click_daily_rollups(rollup_key) on delete cascade,
  session_hash text not null,
  created_at timestamptz not null default now(),
  primary key (day, rollup_key, session_hash)
);

create table public.outbound_click_daily_unique_users (
  day date not null,
  rollup_key text not null references public.outbound_click_daily_rollups(rollup_key) on delete cascade,
  user_hash text not null,
  created_at timestamptz not null default now(),
  primary key (day, rollup_key, user_hash)
);

alter table public.outbound_click_events enable row level security;
alter table public.outbound_click_daily_rollups enable row level security;
alter table public.outbound_click_daily_unique_sessions enable row level security;
alter table public.outbound_click_daily_unique_users enable row level security;

revoke all on public.outbound_click_events from anon, authenticated;
revoke all on public.outbound_click_daily_rollups from anon, authenticated;
revoke all on public.outbound_click_daily_unique_sessions from anon, authenticated;
revoke all on public.outbound_click_daily_unique_users from anon, authenticated;

create or replace function public.record_outbound_click(
  p_anonymous_session_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_destination_type text,
  p_destination_domain text,
  p_placement text,
  p_surface text default 'unknown',
  p_organization_id text default null,
  p_event_series_id text default null,
  p_campaign_key text default null,
  p_market_id text default null,
  p_device_class text default 'unknown',
  p_interaction_type text default 'click',
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_click_id uuid;
  v_user_id uuid := auth.uid();
  v_domain text;
  v_day date := (now() at time zone 'UTC')::date;
  v_is_qualified boolean;
  v_is_suspected_bot boolean := false;
  v_recent_session_clicks integer := 0;
  v_rollup_key text;
  v_inserted integer;
begin
  if p_anonymous_session_id is null then
    raise exception 'Anonymous session ID is required';
  end if;

  if p_entity_type not in (
    'club', 'event', 'event_series', 'venue', 'organization',
    'resort', 'cruise_series', 'cruise_sailing', 'profile'
  ) then
    raise exception 'Unsupported outbound entity type';
  end if;

  if p_destination_type not in (
    'ticket', 'rsvp', 'approval_form', 'booking', 'website', 'social',
    'email', 'directions', 'calendar_google', 'calendar_ics', 'other'
  ) then
    raise exception 'Unsupported outbound destination type';
  end if;

  if p_surface not in (
    'home', 'globe', 'map', 'search', 'details_panel', 'entity_page',
    'saved', 'recommendation', 'direct', 'unknown'
  ) then
    raise exception 'Unsupported outbound surface';
  end if;

  if p_device_class not in ('mobile', 'tablet', 'desktop', 'unknown') then
    raise exception 'Unsupported device class';
  end if;

  if p_interaction_type not in ('click', 'auxclick', 'keyboard') then
    raise exception 'Unsupported interaction type';
  end if;

  if char_length(btrim(coalesce(p_entity_id, ''))) not between 1 and 200
     or char_length(btrim(coalesce(p_placement, ''))) not between 1 and 100 then
    raise exception 'Invalid outbound attribution metadata';
  end if;

  v_domain := lower(regexp_replace(btrim(coalesce(p_destination_domain, '')), '^www\.', ''));
  if char_length(v_domain) not between 1 and 255
     or v_domain !~ '^[a-z0-9.-]+(:[0-9]+)?$'
     or v_domain = 'unknown.local' then
    raise exception 'Invalid destination domain';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(concat_ws('|',
    p_anonymous_session_id::text,
    p_entity_type,
    btrim(p_entity_id),
    p_destination_type,
    v_domain
  ), 0));

  select count(*) into v_recent_session_clicks
  from public.outbound_click_events recent
  where recent.anonymous_session_id = p_anonymous_session_id
    and recent.occurred_at >= now() - interval '1 minute';

  v_is_suspected_bot := v_recent_session_clicks >= 20;

  select (not v_is_suspected_bot) and not exists (
    select 1
    from public.outbound_click_events existing
    where existing.anonymous_session_id = p_anonymous_session_id
      and existing.entity_type = p_entity_type
      and existing.entity_id = btrim(p_entity_id)
      and existing.destination_type = p_destination_type
      and existing.destination_domain = v_domain
      and existing.is_qualified
      and existing.occurred_at >= now() - interval '30 minutes'
  ) into v_is_qualified;

  insert into public.outbound_click_events (
    user_id,
    anonymous_session_id,
    entity_type,
    entity_id,
    organization_id,
    event_series_id,
    destination_type,
    destination_domain,
    placement,
    surface,
    campaign_key,
    market_id,
    device_class,
    interaction_type,
    app_version,
    is_qualified,
    is_suspected_bot
  ) values (
    v_user_id,
    p_anonymous_session_id,
    p_entity_type,
    btrim(p_entity_id),
    nullif(btrim(coalesce(p_organization_id, '')), ''),
    nullif(btrim(coalesce(p_event_series_id, '')), ''),
    p_destination_type,
    v_domain,
    btrim(p_placement),
    p_surface,
    nullif(btrim(coalesce(p_campaign_key, '')), ''),
    nullif(btrim(coalesce(p_market_id, '')), ''),
    p_device_class,
    p_interaction_type,
    nullif(btrim(coalesce(p_app_version, '')), ''),
    v_is_qualified,
    v_is_suspected_bot
  ) returning id into v_click_id;

  v_rollup_key := md5(concat_ws('|',
    v_day::text,
    p_entity_type,
    btrim(p_entity_id),
    coalesce(nullif(btrim(coalesce(p_organization_id, '')), ''), ''),
    coalesce(nullif(btrim(coalesce(p_event_series_id, '')), ''), ''),
    p_destination_type,
    v_domain,
    btrim(p_placement),
    p_surface,
    coalesce(nullif(btrim(coalesce(p_campaign_key, '')), ''), '')
  ));

  insert into public.outbound_click_daily_rollups (
    rollup_key,
    day,
    entity_type,
    entity_id,
    organization_id,
    event_series_id,
    destination_type,
    destination_domain,
    placement,
    surface,
    campaign_key,
    total_clicks,
    qualified_clicks
  ) values (
    v_rollup_key,
    v_day,
    p_entity_type,
    btrim(p_entity_id),
    coalesce(nullif(btrim(coalesce(p_organization_id, '')), ''), ''),
    coalesce(nullif(btrim(coalesce(p_event_series_id, '')), ''), ''),
    p_destination_type,
    v_domain,
    btrim(p_placement),
    p_surface,
    coalesce(nullif(btrim(coalesce(p_campaign_key, '')), ''), ''),
    1,
    case when v_is_qualified then 1 else 0 end
  )
  on conflict (rollup_key) do update set
    total_clicks = public.outbound_click_daily_rollups.total_clicks + 1,
    qualified_clicks = public.outbound_click_daily_rollups.qualified_clicks + case when v_is_qualified then 1 else 0 end,
    updated_at = now();

  if v_is_qualified then
    insert into public.outbound_click_daily_unique_sessions (day, rollup_key, session_hash)
    values (v_day, v_rollup_key, md5(p_anonymous_session_id::text || '|' || v_day::text))
    on conflict do nothing;
    get diagnostics v_inserted = row_count;

    if v_inserted > 0 then
      update public.outbound_click_daily_rollups
      set unique_session_count = unique_session_count + 1,
          updated_at = now()
      where rollup_key = v_rollup_key;
    end if;

    if v_user_id is not null then
      insert into public.outbound_click_daily_unique_users (day, rollup_key, user_hash)
      values (v_day, v_rollup_key, md5(v_user_id::text || '|' || v_day::text))
      on conflict do nothing;
      get diagnostics v_inserted = row_count;

      if v_inserted > 0 then
        update public.outbound_click_daily_rollups
        set unique_user_count = unique_user_count + 1,
            updated_at = now()
        where rollup_key = v_rollup_key;
      end if;
    end if;
  end if;

  return v_click_id;
end;
$$;

revoke all on function public.record_outbound_click(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.record_outbound_click(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

create or replace function public.outbound_admin_summary(
  p_from date default (current_date - 30),
  p_to date default current_date,
  p_entity_type text default null,
  p_entity_id text default null,
  p_organization_id text default null,
  p_campaign_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  ) then
    raise exception 'Administrator access required';
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid analytics date range';
  end if;

  with filtered as (
    select *
    from public.outbound_click_daily_rollups r
    where r.day between p_from and p_to
      and (p_entity_type is null or r.entity_type = p_entity_type)
      and (p_entity_id is null or r.entity_id = p_entity_id)
      and (p_organization_id is null or r.organization_id = p_organization_id)
      and (p_campaign_key is null or r.campaign_key = p_campaign_key)
  ),
  totals as (
    select
      coalesce(sum(total_clicks), 0) as total_clicks,
      coalesce(sum(qualified_clicks), 0) as qualified_clicks
    from filtered
  ),
  unique_sessions as (
    select count(distinct (u.day, u.session_hash))::bigint as daily_unique_sessions
    from public.outbound_click_daily_unique_sessions u
    join filtered f on f.rollup_key = u.rollup_key
    where u.day between p_from and p_to
  ),
  unique_users as (
    select count(distinct (u.day, u.user_hash))::bigint as daily_unique_users
    from public.outbound_click_daily_unique_users u
    join filtered f on f.rollup_key = u.rollup_key
    where u.day between p_from and p_to
  ),
  destinations as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'destinationType', destination_type,
      'qualifiedClicks', qualified_clicks,
      'totalClicks', total_clicks
    ) order by qualified_clicks desc), '[]'::jsonb) as value
    from (
      select destination_type, sum(qualified_clicks) as qualified_clicks, sum(total_clicks) as total_clicks
      from filtered
      group by destination_type
    ) grouped
  ),
  placements as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'placement', placement,
      'surface', surface,
      'qualifiedClicks', qualified_clicks,
      'totalClicks', total_clicks
    ) order by qualified_clicks desc), '[]'::jsonb) as value
    from (
      select placement, surface, sum(qualified_clicks) as qualified_clicks, sum(total_clicks) as total_clicks
      from filtered
      group by placement, surface
    ) grouped
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'totalClicks', totals.total_clicks,
    'qualifiedClicks', totals.qualified_clicks,
    'dailyUniqueSessions', unique_sessions.daily_unique_sessions,
    'dailyUniqueUsers', unique_users.daily_unique_users,
    'uniqueCountsComplete', p_from >= (current_date - 120),
    'uniqueCountCoverageStart', greatest(p_from, current_date - 120),
    'byDestination', destinations.value,
    'byPlacement', placements.value
  )
  into v_result
  from totals
  cross join unique_sessions
  cross join unique_users
  cross join destinations
  cross join placements;

  return v_result;
end;
$$;

revoke all on function public.outbound_admin_summary(date, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.outbound_admin_summary(date, date, text, text, text, text) to authenticated;

create or replace function public.outbound_apply_retention(
  p_anonymize_before timestamptz default (now() - interval '30 days'),
  p_delete_before timestamptz default (now() - interval '90 days'),
  p_unique_hash_delete_before date default (current_date - 120)
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anonymized bigint := 0;
  v_deleted bigint := 0;
  v_session_hashes_deleted bigint := 0;
  v_user_hashes_deleted bigint := 0;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  ) then
    raise exception 'Administrator access required';
  end if;

  if p_delete_before >= p_anonymize_before then
    raise exception 'Raw deletion cutoff must be older than anonymization cutoff';
  end if;

  update public.outbound_click_events
  set user_id = null
  where user_id is not null and occurred_at < p_anonymize_before;
  get diagnostics v_anonymized = row_count;

  delete from public.outbound_click_events
  where occurred_at < p_delete_before;
  get diagnostics v_deleted = row_count;

  delete from public.outbound_click_daily_unique_sessions
  where day < p_unique_hash_delete_before;
  get diagnostics v_session_hashes_deleted = row_count;

  delete from public.outbound_click_daily_unique_users
  where day < p_unique_hash_delete_before;
  get diagnostics v_user_hashes_deleted = row_count;

  return jsonb_build_object(
    'anonymizedRawClicks', v_anonymized,
    'deletedRawClicks', v_deleted,
    'deletedSessionHashes', v_session_hashes_deleted,
    'deletedUserHashes', v_user_hashes_deleted
  );
end;
$$;

revoke all on function public.outbound_apply_retention(timestamptz, timestamptz, date) from public, anon, authenticated;
grant execute on function public.outbound_apply_retention(timestamptz, timestamptz, date) to authenticated;

create table public.listing_claims (
  id uuid primary key default gen_random_uuid(),
  claimant_user_id uuid not null references public.profiles(id) on delete restrict,
  entity_type text not null check (entity_type in (
    'club', 'event', 'event_series', 'venue', 'organization',
    'resort', 'cruise_series', 'cruise_sailing'
  )),
  entity_id text not null check (char_length(entity_id) between 1 and 200),
  organization_id text,
  requested_role text not null default 'manager' check (requested_role in ('owner', 'manager', 'editor')),
  claimant_note text check (claimant_note is null or char_length(claimant_note) <= 2000),
  status text not null default 'pending' check (status in (
    'pending', 'information_requested', 'under_review', 'verified',
    'denied', 'withdrawn', 'revoked', 'superseded'
  )),
  verification_method text check (verification_method is null or verification_method in (
    'official_domain_email', 'official_public_email', 'public_phone_callback',
    'official_social_account', 'website_challenge', 'existing_owner_invitation',
    'live_call', 'business_document', 'combined_manual_review'
  )),
  verification_summary text check (verification_summary is null or char_length(verification_summary) <= 2000),
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 2000),
  evidence_received_at timestamptz,
  evidence_deleted_at timestamptz,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint listing_claims_evidence_dates check (
    evidence_deleted_at is null
    or (
      evidence_received_at is not null
      and evidence_deleted_at >= evidence_received_at
    )
  )
);

comment on table public.listing_claims is
  'Manual authority-verification record for claiming an existing listing. Stores the decision and method, never the underlying document or government ID.';

create unique index listing_claims_one_open_claim_idx
  on public.listing_claims(claimant_user_id, entity_type, entity_id)
  where status in ('pending', 'information_requested', 'under_review');
create index listing_claims_status_idx on public.listing_claims(status, submitted_at);
create index listing_claims_entity_idx on public.listing_claims(entity_type, entity_id, submitted_at desc);
create index listing_claims_evidence_cleanup_idx
  on public.listing_claims(evidence_received_at)
  where evidence_received_at is not null and evidence_deleted_at is null;

create trigger listing_claims_set_updated_at
  before update on public.listing_claims
  for each row execute procedure public.set_updated_at();

create table public.claim_verification_actions (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.listing_claims(id) on delete cascade,
  action text not null check (action in (
    'claim_created', 'information_requested', 'review_started',
    'verification_challenge_issued', 'verification_completed',
    'evidence_received', 'evidence_deleted', 'claim_verified',
    'claim_denied', 'claim_withdrawn', 'claim_revoked', 'claim_superseded'
  )),
  actor_user_id uuid references public.profiles(id) on delete set null,
  verification_method text,
  public_note text check (public_note is null or char_length(public_note) <= 1000),
  private_note text check (private_note is null or char_length(private_note) <= 2000),
  occurred_at timestamptz not null default now()
);

create index claim_verification_actions_claim_idx
  on public.claim_verification_actions(claim_id, occurred_at);

alter table public.listing_claims enable row level security;
alter table public.claim_verification_actions enable row level security;

revoke insert, update, delete on public.listing_claims from anon, authenticated;
revoke all on public.claim_verification_actions from anon, authenticated;
grant select on public.listing_claims to authenticated;
grant select on public.claim_verification_actions to authenticated;

create policy "Claimants can read their own listing claims"
on public.listing_claims
for select
to authenticated
using (
  claimant_user_id = auth.uid()
  or exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  )
);

create policy "Administrators can read claim verification actions"
on public.claim_verification_actions
for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  )
);

create or replace function public.create_listing_claim(
  p_entity_type text,
  p_entity_id text,
  p_organization_id text default null,
  p_requested_role text default 'manager',
  p_claimant_note text default null
)
returns public.listing_claims
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_claim public.listing_claims;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if p_entity_type not in (
    'club', 'event', 'event_series', 'venue', 'organization',
    'resort', 'cruise_series', 'cruise_sailing'
  ) then
    raise exception 'Unsupported claim entity type';
  end if;

  if p_requested_role not in ('owner', 'manager', 'editor') then
    raise exception 'Unsupported requested role';
  end if;

  if char_length(btrim(coalesce(p_entity_id, ''))) not between 1 and 200
     or char_length(coalesce(p_claimant_note, '')) > 2000 then
    raise exception 'Invalid claim details';
  end if;

  if (
    select count(*)
    from public.listing_claims recent
    where recent.claimant_user_id = v_user
      and recent.submitted_at >= now() - interval '24 hours'
  ) >= 5 then
    raise exception 'Too many listing claims submitted recently';
  end if;

  if (
    select count(*)
    from public.listing_claims open_claim
    where open_claim.claimant_user_id = v_user
      and open_claim.status in ('pending', 'information_requested', 'under_review')
  ) >= 10 then
    raise exception 'Too many open listing claims';
  end if;

  insert into public.listing_claims (
    claimant_user_id,
    entity_type,
    entity_id,
    organization_id,
    requested_role,
    claimant_note
  ) values (
    v_user,
    p_entity_type,
    btrim(p_entity_id),
    nullif(btrim(coalesce(p_organization_id, '')), ''),
    p_requested_role,
    nullif(btrim(coalesce(p_claimant_note, '')), '')
  ) returning * into v_claim;

  insert into public.claim_verification_actions (
    claim_id,
    action,
    actor_user_id,
    public_note
  ) values (
    v_claim.id,
    'claim_created',
    v_user,
    'Listing claim submitted for manual verification.'
  );

  return v_claim;
end;
$$;

revoke all on function public.create_listing_claim(text, text, text, text, text) from public, anon;
grant execute on function public.create_listing_claim(text, text, text, text, text) to authenticated;

create or replace function public.withdraw_listing_claim(p_claim_id uuid)
returns public.listing_claims
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.listing_claims;
begin
  update public.listing_claims
  set status = 'withdrawn'
  where id = p_claim_id
    and claimant_user_id = auth.uid()
    and status in ('pending', 'information_requested', 'under_review')
  returning * into v_claim;

  if v_claim.id is null then
    raise exception 'Open listing claim not found';
  end if;

  insert into public.claim_verification_actions (
    claim_id,
    action,
    actor_user_id,
    public_note
  ) values (
    v_claim.id,
    'claim_withdrawn',
    auth.uid(),
    'Claim withdrawn by the claimant.'
  );

  return v_claim;
end;
$$;

revoke all on function public.withdraw_listing_claim(uuid) from public, anon;
grant execute on function public.withdraw_listing_claim(uuid) to authenticated;

create or replace function public.admin_review_listing_claim(
  p_claim_id uuid,
  p_status text,
  p_verification_method text default null,
  p_verification_summary text default null,
  p_decision_reason text default null,
  p_public_note text default null,
  p_private_note text default null,
  p_evidence_received_at timestamptz default null,
  p_evidence_deleted_at timestamptz default null,
  p_expires_at timestamptz default null
)
returns public.listing_claims
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_before public.listing_claims;
  v_after public.listing_claims;
  v_action text;
begin
  if not exists (
    select 1 from public.profiles
    where id = v_admin and role = 'admin' and status = 'active'
  ) then
    raise exception 'Administrator access required';
  end if;

  if p_status not in ('information_requested', 'under_review', 'verified', 'denied', 'revoked', 'superseded') then
    raise exception 'Unsupported claim status';
  end if;

  select * into v_before
  from public.listing_claims
  where id = p_claim_id
  for update;

  if v_before.id is null then
    raise exception 'Listing claim not found';
  end if;

  if v_before.status = 'verified' and p_status not in ('revoked', 'superseded') then
    raise exception 'A verified claim can only be revoked or superseded';
  end if;

  if v_before.status in ('withdrawn', 'denied', 'revoked', 'superseded') then
    raise exception 'Claim is already in a terminal state';
  end if;

  if v_before.status in ('pending', 'information_requested', 'under_review') and p_status = 'revoked' then
    raise exception 'Only a verified claim can be revoked';
  end if;

  if p_status = 'verified' and (
    p_verification_method is null
    or char_length(btrim(coalesce(p_verification_summary, ''))) < 10
  ) then
    raise exception 'Verified claims require a method and verification summary';
  end if;

  if p_status in ('information_requested', 'denied', 'revoked')
     and char_length(btrim(coalesce(p_decision_reason, ''))) < 5 then
    raise exception 'This claim status requires a decision reason';
  end if;

  if p_evidence_deleted_at is not null
     and coalesce(p_evidence_received_at, v_before.evidence_received_at) is null then
    raise exception 'Evidence receipt must be recorded before deletion';
  end if;

  if p_evidence_deleted_at is not null
     and p_evidence_deleted_at < coalesce(p_evidence_received_at, v_before.evidence_received_at) then
    raise exception 'Evidence deletion cannot precede receipt';
  end if;

  update public.listing_claims
  set
    status = p_status,
    verification_method = coalesce(p_verification_method, verification_method),
    verification_summary = coalesce(nullif(btrim(coalesce(p_verification_summary, '')), ''), verification_summary),
    decision_reason = coalesce(nullif(btrim(coalesce(p_decision_reason, '')), ''), decision_reason),
    evidence_received_at = coalesce(p_evidence_received_at, evidence_received_at),
    evidence_deleted_at = coalesce(p_evidence_deleted_at, evidence_deleted_at),
    reviewed_at = case when p_status in ('verified', 'denied', 'revoked', 'superseded') then now() else reviewed_at end,
    reviewed_by = v_admin,
    expires_at = coalesce(p_expires_at, expires_at),
    revoked_at = case when p_status = 'revoked' then now() else revoked_at end
  where id = p_claim_id
  returning * into v_after;

  v_action := case p_status
    when 'information_requested' then 'information_requested'
    when 'under_review' then 'review_started'
    when 'verified' then 'claim_verified'
    when 'denied' then 'claim_denied'
    when 'revoked' then 'claim_revoked'
    else 'claim_superseded'
  end;

  insert into public.claim_verification_actions (
    claim_id,
    action,
    actor_user_id,
    verification_method,
    public_note,
    private_note
  ) values (
    p_claim_id,
    v_action,
    v_admin,
    p_verification_method,
    nullif(btrim(coalesce(p_public_note, '')), ''),
    nullif(btrim(coalesce(p_private_note, '')), '')
  );

  if p_evidence_received_at is not null and v_before.evidence_received_at is null then
    insert into public.claim_verification_actions (
      claim_id, action, actor_user_id, verification_method, private_note
    ) values (
      p_claim_id, 'evidence_received', v_admin, p_verification_method,
      'Temporary evidence receipt recorded. The underlying file is not stored in this schema.'
    );
  end if;

  if p_evidence_deleted_at is not null and v_before.evidence_deleted_at is null then
    insert into public.claim_verification_actions (
      claim_id, action, actor_user_id, verification_method, public_note
    ) values (
      p_claim_id, 'evidence_deleted', v_admin, p_verification_method,
      'Temporary verification evidence was deleted.'
    );
  end if;

  return v_after;
end;
$$;

revoke all on function public.admin_review_listing_claim(uuid, text, text, text, text, text, text, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_review_listing_claim(uuid, text, text, text, text, text, text, timestamptz, timestamptz, timestamptz) to authenticated;

create or replace function public.claim_evidence_deletion_queue(
  p_older_than interval default interval '7 days'
)
returns table (
  claim_id uuid,
  entity_type text,
  entity_id text,
  claimant_user_id uuid,
  evidence_received_at timestamptz,
  age interval
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  ) then
    raise exception 'Administrator access required';
  end if;

  return query
  select
    c.id,
    c.entity_type,
    c.entity_id,
    c.claimant_user_id,
    c.evidence_received_at,
    now() - c.evidence_received_at
  from public.listing_claims c
  where c.evidence_received_at is not null
    and c.evidence_deleted_at is null
    and c.evidence_received_at <= now() - p_older_than
  order by c.evidence_received_at;
end;
$$;

revoke all on function public.claim_evidence_deletion_queue(interval) from public, anon, authenticated;
grant execute on function public.claim_evidence_deletion_queue(interval) to authenticated;
