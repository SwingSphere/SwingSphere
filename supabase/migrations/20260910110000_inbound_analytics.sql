-- SwingSphere first-party inbound traffic analytics.
-- Stores coarse attribution only: no IP addresses, full referrer URLs, user agents,
-- precise coordinates, or cross-site identifiers.

create table public.inbound_visit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  anonymous_session_id uuid not null unique,
  source_category text not null check (source_category in ('direct', 'search', 'social', 'referral', 'email', 'campaign', 'other')),
  source_name text not null check (char_length(source_name) between 1 and 120),
  referrer_domain text check (referrer_domain is null or char_length(referrer_domain) between 1 and 255),
  landing_path text not null check (char_length(landing_path) between 1 and 500),
  utm_source text check (utm_source is null or char_length(utm_source) <= 120),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 120),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 160),
  campaign_key text check (campaign_key is null or char_length(campaign_key) <= 100),
  device_class text not null default 'unknown' check (device_class in ('mobile', 'tablet', 'desktop', 'unknown')),
  country_code text check (country_code is null or char_length(country_code) = 2),
  region_code text check (region_code is null or char_length(region_code) <= 40),
  region_name text check (region_name is null or char_length(region_name) <= 120),
  app_version text check (app_version is null or char_length(app_version) <= 80)
);

comment on table public.inbound_visit_events is
  'Short-lived first-party entry-session records used to measure where SwingSphere traffic originates. Stores no IP address, full referrer URL, or user-agent string.';
comment on column public.inbound_visit_events.anonymous_session_id is
  'Rotating browser-session identifier shared with outbound attribution so aggregate inbound-to-outbound funnels can be measured without a cross-device identity.';

create index inbound_visit_events_occurred_idx on public.inbound_visit_events(occurred_at desc);
create index inbound_visit_events_source_idx on public.inbound_visit_events(source_name, occurred_at desc);
create index inbound_visit_events_landing_idx on public.inbound_visit_events(landing_path, occurred_at desc);

create table public.inbound_visit_daily_rollups (
  rollup_key text primary key,
  day date not null,
  source_category text not null,
  source_name text not null,
  referrer_domain text not null default '',
  landing_path text not null,
  utm_source text not null default '',
  utm_medium text not null default '',
  utm_campaign text not null default '',
  campaign_key text not null default '',
  device_class text not null,
  country_code text not null default '',
  region_code text not null default '',
  region_name text not null default '',
  sessions bigint not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.inbound_visit_daily_rollups is
  'Long-lived aggregate inbound session metrics. Contains no user identity, IP address, raw referrer URL, or user-agent string.';

create index inbound_visit_daily_rollups_day_idx on public.inbound_visit_daily_rollups(day desc);
create index inbound_visit_daily_rollups_source_idx on public.inbound_visit_daily_rollups(source_name, day desc);
create index inbound_visit_daily_rollups_country_idx on public.inbound_visit_daily_rollups(country_code, day desc) where country_code <> '';
create index inbound_visit_daily_rollups_campaign_idx on public.inbound_visit_daily_rollups(campaign_key, day desc) where campaign_key <> '';

alter table public.inbound_visit_events enable row level security;
alter table public.inbound_visit_daily_rollups enable row level security;
revoke all on public.inbound_visit_events from anon, authenticated;
revoke all on public.inbound_visit_daily_rollups from anon, authenticated;

create or replace function public.record_inbound_visit(
  p_anonymous_session_id uuid,
  p_source_category text,
  p_source_name text,
  p_referrer_domain text,
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

revoke all on function public.record_inbound_visit(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.record_inbound_visit(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

create or replace function public.inbound_admin_summary(
  p_from date default (current_date - 29),
  p_to date default current_date
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

  if p_to - p_from > 3660 then
    raise exception 'Analytics date range is too large';
  end if;

  with filtered as (
    select * from public.inbound_visit_daily_rollups
    where day between p_from and p_to
  ),
  totals as (
    select coalesce(sum(sessions), 0)::bigint as sessions from filtered
  ),
  sources as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'sourceCategory', source_category,
      'sourceName', source_name,
      'sessions', sessions
    ) order by sessions desc, source_name), '[]'::jsonb) as value
    from (
      select source_category, source_name, sum(sessions)::bigint as sessions
      from filtered
      group by source_category, source_name
      order by sessions desc
      limit 25
    ) grouped
  ),
  referrers as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'referrerDomain', referrer_domain,
      'sessions', sessions
    ) order by sessions desc, referrer_domain), '[]'::jsonb) as value
    from (
      select referrer_domain, sum(sessions)::bigint as sessions
      from filtered
      where referrer_domain <> ''
      group by referrer_domain
      order by sessions desc
      limit 25
    ) grouped
  ),
  landings as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'landingPath', landing_path,
      'sessions', sessions
    ) order by sessions desc, landing_path), '[]'::jsonb) as value
    from (
      select landing_path, sum(sessions)::bigint as sessions
      from filtered
      group by landing_path
      order by sessions desc
      limit 25
    ) grouped
  ),
  devices as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'deviceClass', device_class,
      'sessions', sessions
    ) order by sessions desc, device_class), '[]'::jsonb) as value
    from (
      select device_class, sum(sessions)::bigint as sessions
      from filtered
      group by device_class
    ) grouped
  ),
  countries as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'countryCode', country_code,
      'sessions', sessions
    ) order by sessions desc, country_code), '[]'::jsonb) as value
    from (
      select country_code, sum(sessions)::bigint as sessions
      from filtered
      where country_code <> ''
      group by country_code
      order by sessions desc
      limit 50
    ) grouped
  ),
  regions as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'countryCode', country_code,
      'regionCode', region_code,
      'regionName', region_name,
      'sessions', sessions
    ) order by sessions desc, region_name), '[]'::jsonb) as value
    from (
      select country_code, region_code, region_name, sum(sessions)::bigint as sessions
      from filtered
      where region_name <> '' or region_code <> ''
      group by country_code, region_code, region_name
      order by sessions desc
      limit 75
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
      from filtered
      where campaign_key <> '' or utm_source <> '' or utm_campaign <> ''
      group by campaign_key, utm_source, utm_medium, utm_campaign
      order by sessions desc
      limit 50
    ) grouped
  ),
  daily as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'day', day,
      'sessions', sessions
    ) order by day), '[]'::jsonb) as value
    from (
      select day, sum(sessions)::bigint as sessions
      from filtered
      group by day
      order by day
    ) grouped
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'totalSessions', totals.sessions,
    'bySource', sources.value,
    'byReferrer', referrers.value,
    'byLanding', landings.value,
    'byDevice', devices.value,
    'byCountry', countries.value,
    'byRegion', regions.value,
    'byCampaign', campaigns.value,
    'daily', daily.value
  ) into v_result
  from totals, sources, referrers, landings, devices, countries, regions, campaigns, daily;

  return v_result;
end;
$$;

revoke all on function public.inbound_admin_summary(date, date) from public;
grant execute on function public.inbound_admin_summary(date, date) to authenticated;

create or replace function public.inbound_apply_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint := 0;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  ) then
    raise exception 'Administrator access required';
  end if;

  delete from public.inbound_visit_events
  where occurred_at < now() - interval '90 days';
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('deletedRawSessions', v_deleted);
end;
$$;

revoke all on function public.inbound_apply_retention() from public;
grant execute on function public.inbound_apply_retention() to authenticated;
