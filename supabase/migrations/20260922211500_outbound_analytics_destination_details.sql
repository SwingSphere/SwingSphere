-- Add exact-but-sanitized outbound destination attribution.
-- Only HTTP(S) host/path are stored; query strings and fragments are stripped client-side.
-- mailto:, geo:, blob:, and other non-web destinations continue to use coarse domains only.

alter table public.outbound_click_events
  add column if not exists destination_path text
  check (destination_path is null or char_length(destination_path) between 1 and 500);

alter table public.outbound_click_daily_rollups
  add column if not exists destination_path text not null default '';

comment on column public.outbound_click_events.destination_path is
  'Optional HTTP(S) destination path clicked from SwingSphere. Query strings and fragments are stripped client-side.';
comment on column public.outbound_click_daily_rollups.destination_path is
  'Aggregate HTTP(S) destination path. Empty for legacy rows and non-web destinations.';

create index if not exists outbound_click_events_destination_idx
  on public.outbound_click_events(destination_domain, destination_path, occurred_at desc);

create index if not exists outbound_click_daily_rollups_destination_path_idx
  on public.outbound_click_daily_rollups(destination_domain, destination_path, day desc);

create or replace function public.record_outbound_click_v2(
  p_anonymous_session_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_destination_type text,
  p_destination_domain text,
  p_destination_path text,
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
  v_path text := btrim(coalesce(p_destination_path, ''));
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

  if v_path <> '' and (char_length(v_path) > 500 or left(v_path, 1) <> '/') then
    raise exception 'Invalid destination path';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(concat_ws('|',
    p_anonymous_session_id::text,
    p_entity_type,
    btrim(p_entity_id),
    p_destination_type,
    v_domain,
    v_path
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
      and coalesce(existing.destination_path, '') = v_path
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
    destination_path,
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
    nullif(v_path, ''),
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
    v_path,
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
    destination_path,
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
    v_path,
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

revoke all on function public.record_outbound_click_v2(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public;
grant execute on function public.record_outbound_click_v2(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to anon, authenticated;

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
    ) order by qualified_clicks desc, total_clicks desc), '[]'::jsonb) as value
    from (
      select destination_type, sum(qualified_clicks)::bigint as qualified_clicks, sum(total_clicks)::bigint as total_clicks
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
    ) order by qualified_clicks desc, total_clicks desc), '[]'::jsonb) as value
    from (
      select placement, surface, sum(qualified_clicks)::bigint as qualified_clicks, sum(total_clicks)::bigint as total_clicks
      from filtered
      group by placement, surface
    ) grouped
  ),
  links as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'destinationType', destination_type,
      'destinationDomain', destination_domain,
      'destinationPath', destination_path,
      'qualifiedClicks', qualified_clicks,
      'totalClicks', total_clicks
    ) order by qualified_clicks desc, total_clicks desc), '[]'::jsonb) as value
    from (
      select destination_type, destination_domain, destination_path,
             sum(qualified_clicks)::bigint as qualified_clicks,
             sum(total_clicks)::bigint as total_clicks
      from filtered
      group by destination_type, destination_domain, destination_path
      order by qualified_clicks desc, total_clicks desc
      limit 100
    ) grouped
  ),
  entities as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'entityType', entity_type,
      'entityId', entity_id,
      'organizationId', organization_id,
      'qualifiedClicks', qualified_clicks,
      'totalClicks', total_clicks
    ) order by qualified_clicks desc, total_clicks desc), '[]'::jsonb) as value
    from (
      select entity_type, entity_id, organization_id,
             sum(qualified_clicks)::bigint as qualified_clicks,
             sum(total_clicks)::bigint as total_clicks
      from filtered
      group by entity_type, entity_id, organization_id
      order by qualified_clicks desc, total_clicks desc
      limit 100
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
    'byPlacement', placements.value,
    'byLink', links.value,
    'byEntity', entities.value
  )
  into v_result
  from totals
  cross join unique_sessions
  cross join unique_users
  cross join destinations
  cross join placements
  cross join links
  cross join entities;

  return v_result;
end;
$$;

revoke all on function public.outbound_admin_summary(date, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.outbound_admin_summary(date, date, text, text, text, text) to authenticated;

create or replace function public.outbound_admin_detail(
  p_from date,
  p_to date,
  p_destination_type text default null,
  p_destination_domain text default null,
  p_destination_path text default null,
  p_placement text default null,
  p_surface text default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 250));
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
    from public.outbound_click_daily_rollups
    where day between p_from and p_to
      and (p_destination_type is null or destination_type = p_destination_type)
      and (p_destination_domain is null or destination_domain = p_destination_domain)
      and (p_destination_path is null or destination_path = p_destination_path)
      and (p_placement is null or placement = p_placement)
      and (p_surface is null or surface = p_surface)
      and (p_entity_type is null or entity_type = p_entity_type)
      and (p_entity_id is null or entity_id = p_entity_id)
  ),
  totals as (
    select coalesce(sum(total_clicks), 0)::bigint as total_clicks,
           coalesce(sum(qualified_clicks), 0)::bigint as qualified_clicks
    from filtered
  ),
  links as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'destinationType', destination_type,
      'destinationDomain', destination_domain,
      'destinationPath', destination_path,
      'qualifiedClicks', qualified_clicks,
      'totalClicks', total_clicks
    ) order by qualified_clicks desc, total_clicks desc), '[]'::jsonb) as value
    from (
      select destination_type, destination_domain, destination_path,
             sum(qualified_clicks)::bigint as qualified_clicks,
             sum(total_clicks)::bigint as total_clicks
      from filtered
      group by destination_type, destination_domain, destination_path
      order by qualified_clicks desc, total_clicks desc
      limit 50
    ) grouped
  ),
  entities as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'entityType', entity_type,
      'entityId', entity_id,
      'organizationId', organization_id,
      'qualifiedClicks', qualified_clicks,
      'totalClicks', total_clicks
    ) order by qualified_clicks desc, total_clicks desc), '[]'::jsonb) as value
    from (
      select entity_type, entity_id, organization_id,
             sum(qualified_clicks)::bigint as qualified_clicks,
             sum(total_clicks)::bigint as total_clicks
      from filtered
      group by entity_type, entity_id, organization_id
      order by qualified_clicks desc, total_clicks desc
      limit 50
    ) grouped
  ),
  recent as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'occurredAt', occurred_at,
      'entityType', entity_type,
      'entityId', entity_id,
      'organizationId', coalesce(organization_id, ''),
      'destinationType', destination_type,
      'destinationDomain', destination_domain,
      'destinationPath', coalesce(destination_path, ''),
      'placement', placement,
      'surface', surface,
      'campaignKey', coalesce(campaign_key, ''),
      'deviceClass', device_class,
      'interactionType', interaction_type,
      'qualified', is_qualified
    ) order by occurred_at desc), '[]'::jsonb) as value
    from (
      select *
      from public.outbound_click_events
      where (occurred_at at time zone 'UTC')::date between p_from and p_to
        and (p_destination_type is null or destination_type = p_destination_type)
        and (p_destination_domain is null or destination_domain = p_destination_domain)
        and (p_destination_path is null or coalesce(destination_path, '') = p_destination_path)
        and (p_placement is null or placement = p_placement)
        and (p_surface is null or surface = p_surface)
        and (p_entity_type is null or entity_type = p_entity_type)
        and (p_entity_id is null or entity_id = p_entity_id)
      order by occurred_at desc
      limit v_limit
    ) recent_rows
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'totalClicks', totals.total_clicks,
    'qualifiedClicks', totals.qualified_clicks,
    'byLink', links.value,
    'byEntity', entities.value,
    'recentClicks', recent.value,
    'rawRetentionDays', 90
  )
  into v_result
  from totals, links, entities, recent;

  return v_result;
end;
$$;

revoke all on function public.outbound_admin_detail(date, date, text, text, text, text, text, text, text, integer) from public;
grant execute on function public.outbound_admin_detail(date, date, text, text, text, text, text, text, text, integer) to authenticated;
