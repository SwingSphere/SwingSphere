-- Add privacy-conscious source-path attribution and admin drill-downs for inbound analytics.
-- Query strings and fragments are never sent by the client; this stores only the path
-- supplied by the browser/referrer when available.

alter table public.inbound_visit_events
  add column if not exists referrer_path text
  check (referrer_path is null or char_length(referrer_path) between 1 and 500);

alter table public.inbound_visit_daily_rollups
  add column if not exists referrer_path text not null default '';

comment on column public.inbound_visit_events.referrer_path is
  'Optional external referrer path supplied by the browser. Query strings and fragments are stripped client-side.';
comment on column public.inbound_visit_daily_rollups.referrer_path is
  'Aggregate external referrer path supplied by the browser. Empty when unavailable.';

create index if not exists inbound_visit_events_referrer_idx
  on public.inbound_visit_events(referrer_domain, occurred_at desc);

create index if not exists inbound_visit_daily_rollups_referrer_path_idx
  on public.inbound_visit_daily_rollups(referrer_domain, referrer_path, day desc)
  where referrer_domain <> '';

create or replace function public.record_inbound_visit_v2(
  p_anonymous_session_id uuid,
  p_source_category text,
  p_source_name text,
  p_referrer_domain text,
  p_referrer_path text,
  p_landing_path text,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_campaign_key text default null,
  p_device_class text default 'unknown',
  p_country_code text default null,
  p_region_code text default null,
  p_region_name text default null,
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_day date := (now() at time zone 'UTC')::date;
  v_source_category text := lower(btrim(coalesce(p_source_category, 'other')));
  v_source_name text := lower(btrim(coalesce(p_source_name, 'unknown')));
  v_referrer_domain text := lower(regexp_replace(btrim(coalesce(p_referrer_domain, '')), '^www\.', ''));
  v_referrer_path text := btrim(coalesce(p_referrer_path, ''));
  v_landing_path text := btrim(coalesce(p_landing_path, '/'));
  v_country_code text := upper(btrim(coalesce(p_country_code, '')));
  v_rollup_key text;
  v_inserted integer;
begin
  if p_anonymous_session_id is null then
    raise exception 'Anonymous session ID is required';
  end if;

  if v_source_category not in ('direct', 'search', 'social', 'referral', 'email', 'campaign', 'other') then
    raise exception 'Unsupported inbound source category';
  end if;

  if char_length(v_source_name) not between 1 and 120 then
    raise exception 'Invalid inbound source name';
  end if;

  if v_referrer_domain <> '' and (
    char_length(v_referrer_domain) > 255
    or v_referrer_domain !~ '^[a-z0-9.-]+(:[0-9]+)?$'
  ) then
    raise exception 'Invalid referrer domain';
  end if;

  if v_referrer_path <> '' and (
    char_length(v_referrer_path) > 500
    or left(v_referrer_path, 1) <> '/'
  ) then
    raise exception 'Invalid referrer path';
  end if;

  if char_length(v_landing_path) not between 1 and 500 or left(v_landing_path, 1) <> '/' then
    raise exception 'Invalid landing path';
  end if;

  if p_device_class not in ('mobile', 'tablet', 'desktop', 'unknown') then
    raise exception 'Unsupported device class';
  end if;

  if v_country_code <> '' and char_length(v_country_code) <> 2 then
    raise exception 'Invalid country code';
  end if;

  insert into public.inbound_visit_events (
    anonymous_session_id,
    source_category,
    source_name,
    referrer_domain,
    referrer_path,
    landing_path,
    utm_source,
    utm_medium,
    utm_campaign,
    campaign_key,
    device_class,
    country_code,
    region_code,
    region_name,
    app_version
  ) values (
    p_anonymous_session_id,
    v_source_category,
    v_source_name,
    nullif(v_referrer_domain, ''),
    nullif(v_referrer_path, ''),
    v_landing_path,
    nullif(lower(btrim(coalesce(p_utm_source, ''))), ''),
    nullif(lower(btrim(coalesce(p_utm_medium, ''))), ''),
    nullif(btrim(coalesce(p_utm_campaign, '')), ''),
    nullif(btrim(coalesce(p_campaign_key, '')), ''),
    p_device_class,
    nullif(v_country_code, ''),
    nullif(btrim(coalesce(p_region_code, '')), ''),
    nullif(btrim(coalesce(p_region_name, '')), ''),
    nullif(btrim(coalesce(p_app_version, '')), '')
  )
  on conflict (anonymous_session_id) do nothing
  returning id into v_id;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select id into v_id
    from public.inbound_visit_events
    where anonymous_session_id = p_anonymous_session_id;
    return v_id;
  end if;

  v_rollup_key := md5(concat_ws('|',
    v_day::text,
    v_source_category,
    v_source_name,
    v_referrer_domain,
    v_referrer_path,
    v_landing_path,
    lower(btrim(coalesce(p_utm_source, ''))),
    lower(btrim(coalesce(p_utm_medium, ''))),
    btrim(coalesce(p_utm_campaign, '')),
    btrim(coalesce(p_campaign_key, '')),
    p_device_class,
    v_country_code,
    btrim(coalesce(p_region_code, '')),
    btrim(coalesce(p_region_name, ''))
  ));

  insert into public.inbound_visit_daily_rollups (
    rollup_key,
    day,
    source_category,
    source_name,
    referrer_domain,
    referrer_path,
    landing_path,
    utm_source,
    utm_medium,
    utm_campaign,
    campaign_key,
    device_class,
    country_code,
    region_code,
    region_name,
    sessions
  ) values (
    v_rollup_key,
    v_day,
    v_source_category,
    v_source_name,
    v_referrer_domain,
    v_referrer_path,
    v_landing_path,
    lower(btrim(coalesce(p_utm_source, ''))),
    lower(btrim(coalesce(p_utm_medium, ''))),
    btrim(coalesce(p_utm_campaign, '')),
    btrim(coalesce(p_campaign_key, '')),
    p_device_class,
    v_country_code,
    btrim(coalesce(p_region_code, '')),
    btrim(coalesce(p_region_name, '')),
    1
  )
  on conflict (rollup_key) do update set
    sessions = public.inbound_visit_daily_rollups.sessions + 1,
    updated_at = now();

  return v_id;
end;
$$;

revoke all on function public.record_inbound_visit_v2(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public;
grant execute on function public.record_inbound_visit_v2(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to anon, authenticated;

create or replace function public.inbound_admin_source_detail(
  p_from date,
  p_to date,
  p_source_category text default null,
  p_source_name text default null,
  p_referrer_domain text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 250));
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  ) then
    raise exception 'Administrator access required';
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid analytics date range';
  end if;

  if p_to - p_from > 3660 then
    raise exception 'Analytics date range is too large';
  end if;

  with rollups as (
    select *
    from public.inbound_visit_daily_rollups
    where day between p_from and p_to
      and (p_source_category is null or source_category = p_source_category)
      and (p_source_name is null or source_name = p_source_name)
      and (p_referrer_domain is null or referrer_domain = p_referrer_domain)
  ),
  totals as (
    select coalesce(sum(sessions), 0)::bigint as sessions from rollups
  ),
  paths as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'referrerPath', referrer_path,
      'sessions', sessions
    ) order by sessions desc, referrer_path), '[]'::jsonb) as value
    from (
      select referrer_path, sum(sessions)::bigint as sessions
      from rollups
      where referrer_path <> ''
      group by referrer_path
      order by sessions desc
      limit 50
    ) grouped
  ),
  landings as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'landingPath', landing_path,
      'sessions', sessions
    ) order by sessions desc, landing_path), '[]'::jsonb) as value
    from (
      select landing_path, sum(sessions)::bigint as sessions
      from rollups
      group by landing_path
      order by sessions desc
      limit 50
    ) grouped
  ),
  campaigns as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'campaignKey', campaign_key,
      'utmSource', utm_source,
      'utmMedium', utm_medium,
      'utmCampaign', utm_campaign,
      'sessions', sessions
    ) order by sessions desc), '[]'::jsonb) as value
    from (
      select campaign_key, utm_source, utm_medium, utm_campaign, sum(sessions)::bigint as sessions
      from rollups
      where campaign_key <> '' or utm_source <> '' or utm_campaign <> ''
      group by campaign_key, utm_source, utm_medium, utm_campaign
      order by sessions desc
      limit 50
    ) grouped
  ),
  raw_sessions as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'occurredAt', occurred_at,
      'sourceCategory', source_category,
      'sourceName', source_name,
      'referrerDomain', coalesce(referrer_domain, ''),
      'referrerPath', coalesce(referrer_path, ''),
      'landingPath', landing_path,
      'utmSource', coalesce(utm_source, ''),
      'utmMedium', coalesce(utm_medium, ''),
      'utmCampaign', coalesce(utm_campaign, ''),
      'campaignKey', coalesce(campaign_key, ''),
      'deviceClass', device_class,
      'countryCode', coalesce(country_code, ''),
      'regionCode', coalesce(region_code, ''),
      'regionName', coalesce(region_name, '')
    ) order by occurred_at desc), '[]'::jsonb) as value
    from (
      select *
      from public.inbound_visit_events
      where (occurred_at at time zone 'UTC')::date between p_from and p_to
        and (p_source_category is null or source_category = p_source_category)
        and (p_source_name is null or source_name = p_source_name)
        and (p_referrer_domain is null or referrer_domain = p_referrer_domain)
      order by occurred_at desc
      limit v_limit
    ) recent
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'totalSessions', totals.sessions,
    'topReferrerPaths', paths.value,
    'topLandings', landings.value,
    'campaigns', campaigns.value,
    'recentSessions', raw_sessions.value,
    'rawRetentionDays', 90
  )
  into v_result
  from totals, paths, landings, campaigns, raw_sessions;

  return v_result;
end;
$$;

revoke all on function public.inbound_admin_source_detail(date, date, text, text, text, integer) from public;
grant execute on function public.inbound_admin_source_detail(date, date, text, text, text, integer) to authenticated;
