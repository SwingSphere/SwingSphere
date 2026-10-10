-- SwingSphere Analytics v3:
-- 1. Coarse, privacy-safe OS & browser family attribution (no raw user-agent strings).
-- 2. First-party page-view tracking to separate Landing Pages from Most Viewed Pages.
-- 3. Privacy-preserving daily visitor deduplication.
-- 4. Enriched Inbound & Outbound admin summary RPCs with KPI windows, period comparisons,
--    hourly/daily trend series, OS drill-down, and Listing -> Destination click rankings.

alter table public.inbound_visit_events
  add column if not exists os_family text not null default 'unknown'
    check (os_family in ('ios', 'ipados', 'android', 'windows', 'macos', 'chromeos', 'linux', 'other', 'unknown')),
  add column if not exists browser_family text not null default 'unknown'
    check (browser_family in ('safari', 'chrome', 'firefox', 'edge', 'other', 'unknown'));

alter table public.inbound_visit_daily_rollups
  add column if not exists os_family text not null default 'unknown',
  add column if not exists browser_family text not null default 'unknown',
  add column if not exists unique_visitors bigint not null default 0,
  add column if not exists views bigint not null default 0;

update public.inbound_visit_daily_rollups
set
  unique_visitors = greatest(unique_visitors, sessions),
  views = greatest(views, sessions)
where unique_visitors = 0 or views = 0;

create table if not exists public.inbound_daily_unique_visitors (
  day date not null,
  visitor_hash text not null,
  created_at timestamptz not null default now(),
  primary key (day, visitor_hash)
);

comment on table public.inbound_daily_unique_visitors is
  'Short-lived daily salted hash of first-party anonymous visitor IDs for aggregate unique-visitor counts.';

create table if not exists public.inbound_page_view_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  anonymous_session_id uuid not null,
  page_path text not null check (char_length(page_path) between 1 and 500),
  is_entry boolean not null default false,
  device_class text not null default 'unknown' check (device_class in ('mobile', 'tablet', 'desktop', 'unknown')),
  os_family text not null default 'unknown' check (os_family in ('ios', 'ipados', 'android', 'windows', 'macos', 'chromeos', 'linux', 'other', 'unknown')),
  browser_family text not null default 'unknown' check (browser_family in ('safari', 'chrome', 'firefox', 'edge', 'other', 'unknown'))
);

create index if not exists inbound_page_view_events_occurred_idx
  on public.inbound_page_view_events(occurred_at desc);
create index if not exists inbound_page_view_events_session_idx
  on public.inbound_page_view_events(anonymous_session_id, occurred_at desc);
create index if not exists inbound_page_view_events_path_idx
  on public.inbound_page_view_events(page_path, occurred_at desc);

create table if not exists public.inbound_page_view_daily_rollups (
  day date not null,
  page_path text not null,
  views bigint not null default 0,
  entry_sessions bigint not null default 0,
  unique_sessions bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, page_path)
);

create index if not exists inbound_page_view_daily_rollups_day_idx
  on public.inbound_page_view_daily_rollups(day desc);
create index if not exists inbound_page_view_daily_rollups_path_idx
  on public.inbound_page_view_daily_rollups(page_path, day desc);

create table if not exists public.inbound_page_view_daily_unique_sessions (
  day date not null,
  page_path text not null,
  session_hash text not null,
  created_at timestamptz not null default now(),
  primary key (day, page_path, session_hash)
);

alter table public.inbound_daily_unique_visitors enable row level security;
alter table public.inbound_page_view_events enable row level security;
alter table public.inbound_page_view_daily_rollups enable row level security;
alter table public.inbound_page_view_daily_unique_sessions enable row level security;

revoke all on public.inbound_daily_unique_visitors from anon, authenticated;
revoke all on public.inbound_page_view_events from anon, authenticated;
revoke all on public.inbound_page_view_daily_rollups from anon, authenticated;
revoke all on public.inbound_page_view_daily_unique_sessions from anon, authenticated;

-- Backfill factual landing page views from existing entry-session rollups so historical
-- sessions are represented accurately (1 landing view per recorded entry session).
insert into public.inbound_page_view_daily_rollups (
  day,
  page_path,
  views,
  entry_sessions,
  unique_sessions
)
select
  day,
  landing_path,
  sum(sessions)::bigint as views,
  sum(sessions)::bigint as entry_sessions,
  sum(sessions)::bigint as unique_sessions
from public.inbound_visit_daily_rollups
group by day, landing_path
on conflict (day, page_path) do nothing;

create or replace function public.record_inbound_visit_v3(
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
  p_os_family text default 'unknown',
  p_browser_family text default 'unknown',
  p_anonymous_visitor_id uuid default null,
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
  v_device_class text := lower(btrim(coalesce(p_device_class, 'unknown')));
  v_os_family text := lower(btrim(coalesce(p_os_family, 'unknown')));
  v_browser_family text := lower(btrim(coalesce(p_browser_family, 'unknown')));
  v_country_code text := upper(btrim(coalesce(p_country_code, '')));
  v_rollup_key text;
  v_inserted integer;
  v_new_visitor integer := 0;
  v_visitor_token text;
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

  if v_device_class not in ('mobile', 'tablet', 'desktop', 'unknown') then
    v_device_class := 'unknown';
  end if;

  if v_os_family not in ('ios', 'ipados', 'android', 'windows', 'macos', 'chromeos', 'linux', 'other', 'unknown') then
    v_os_family := 'unknown';
  end if;

  if v_browser_family not in ('safari', 'chrome', 'firefox', 'edge', 'other', 'unknown') then
    v_browser_family := 'unknown';
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
    os_family,
    browser_family,
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
    v_device_class,
    v_os_family,
    v_browser_family,
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

  v_visitor_token := coalesce(p_anonymous_visitor_id::text, p_anonymous_session_id::text);
  insert into public.inbound_daily_unique_visitors (day, visitor_hash)
  values (v_day, md5(v_visitor_token || '|' || v_day::text))
  on conflict do nothing;
  get diagnostics v_new_visitor = row_count;

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
    v_device_class,
    v_os_family,
    v_browser_family,
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
    os_family,
    browser_family,
    country_code,
    region_code,
    region_name,
    sessions,
    unique_visitors,
    views
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
    v_device_class,
    v_os_family,
    v_browser_family,
    v_country_code,
    btrim(coalesce(p_region_code, '')),
    btrim(coalesce(p_region_name, '')),
    1,
    case when v_new_visitor > 0 then 1 else 0 end,
    1
  )
  on conflict (rollup_key) do update set
    sessions = public.inbound_visit_daily_rollups.sessions + 1,
    unique_visitors = public.inbound_visit_daily_rollups.unique_visitors + case when v_new_visitor > 0 then 1 else 0 end,
    views = public.inbound_visit_daily_rollups.views + 1,
    updated_at = now();

  -- Also record the initial entry page view so Landing Pages and Most Viewed Pages stay consistent.
  insert into public.inbound_page_view_events (
    anonymous_session_id,
    page_path,
    is_entry,
    device_class,
    os_family,
    browser_family
  ) values (
    p_anonymous_session_id,
    v_landing_path,
    true,
    v_device_class,
    v_os_family,
    v_browser_family
  );

  insert into public.inbound_page_view_daily_unique_sessions (day, page_path, session_hash)
  values (v_day, v_landing_path, md5(p_anonymous_session_id::text || '|' || v_day::text))
  on conflict do nothing;

  insert into public.inbound_page_view_daily_rollups (
    day,
    page_path,
    views,
    entry_sessions,
    unique_sessions
  ) values (
    v_day,
    v_landing_path,
    1,
    1,
    1
  )
  on conflict (day, page_path) do update set
    views = public.inbound_page_view_daily_rollups.views + 1,
    entry_sessions = public.inbound_page_view_daily_rollups.entry_sessions + 1,
    unique_sessions = public.inbound_page_view_daily_rollups.unique_sessions + 1,
    updated_at = now();

  return v_id;
end;
$$;

revoke all on function public.record_inbound_visit_v3(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text, text
) from public;
grant execute on function public.record_inbound_visit_v3(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text, text
) to anon, authenticated;

create or replace function public.record_inbound_page_view(
  p_anonymous_session_id uuid,
  p_page_path text,
  p_device_class text default 'unknown',
  p_os_family text default 'unknown',
  p_browser_family text default 'unknown'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_page_path text := btrim(coalesce(p_page_path, '/'));
  v_device_class text := lower(btrim(coalesce(p_device_class, 'unknown')));
  v_os_family text := lower(btrim(coalesce(p_os_family, 'unknown')));
  v_browser_family text := lower(btrim(coalesce(p_browser_family, 'unknown')));
  v_recent_count integer := 0;
  v_new_page_session integer := 0;
begin
  if p_anonymous_session_id is null then
    return;
  end if;

  if char_length(v_page_path) not between 1 and 500 or left(v_page_path, 1) <> '/' then
    return;
  end if;

  if v_device_class not in ('mobile', 'tablet', 'desktop', 'unknown') then
    v_device_class := 'unknown';
  end if;
  if v_os_family not in ('ios', 'ipados', 'android', 'windows', 'macos', 'chromeos', 'linux', 'other', 'unknown') then
    v_os_family := 'unknown';
  end if;
  if v_browser_family not in ('safari', 'chrome', 'firefox', 'edge', 'other', 'unknown') then
    v_browser_family := 'unknown';
  end if;

  -- Ignore rapid duplicate views of the same path within 5 seconds in the same session.
  if exists (
    select 1
    from public.inbound_page_view_events recent
    where recent.anonymous_session_id = p_anonymous_session_id
      and recent.page_path = v_page_path
      and recent.occurred_at >= now() - interval '5 seconds'
  ) then
    return;
  end if;

  select count(*) into v_recent_count
  from public.inbound_page_view_events recent
  where recent.anonymous_session_id = p_anonymous_session_id
    and recent.occurred_at >= now() - interval '1 minute';

  if v_recent_count >= 90 then
    return;
  end if;

  insert into public.inbound_page_view_events (
    anonymous_session_id,
    page_path,
    is_entry,
    device_class,
    os_family,
    browser_family
  ) values (
    p_anonymous_session_id,
    v_page_path,
    false,
    v_device_class,
    v_os_family,
    v_browser_family
  );

  insert into public.inbound_page_view_daily_unique_sessions (day, page_path, session_hash)
  values (v_day, v_page_path, md5(p_anonymous_session_id::text || '|' || v_day::text))
  on conflict do nothing;
  get diagnostics v_new_page_session = row_count;

  insert into public.inbound_page_view_daily_rollups (
    day,
    page_path,
    views,
    entry_sessions,
    unique_sessions
  ) values (
    v_day,
    v_page_path,
    1,
    0,
    case when v_new_page_session > 0 then 1 else 0 end
  )
  on conflict (day, page_path) do update set
    views = public.inbound_page_view_daily_rollups.views + 1,
    unique_sessions = public.inbound_page_view_daily_rollups.unique_sessions + case when v_new_page_session > 0 then 1 else 0 end,
    updated_at = now();
end;
$$;

revoke all on function public.record_inbound_page_view(uuid, text, text, text, text) from public;
grant execute on function public.record_inbound_page_view(uuid, text, text, text, text) to anon, authenticated;

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
  v_today date := (now() at time zone 'UTC')::date;
  v_span integer;
  v_prev_from date;
  v_prev_to date;
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

  v_span := greatest(1, (p_to - p_from) + 1);
  v_prev_to := p_from - 1;
  v_prev_from := p_from - v_span;

  with filtered as (
    select * from public.inbound_visit_daily_rollups
    where day between p_from and p_to
  ),
  filtered_views as (
    select * from public.inbound_page_view_daily_rollups
    where day between p_from and p_to
  ),
  prev_rollups as (
    select * from public.inbound_visit_daily_rollups
    where day between v_prev_from and v_prev_to
  ),
  prev_views as (
    select * from public.inbound_page_view_daily_rollups
    where day between v_prev_from and v_prev_to
  ),
  totals as (
    select
      coalesce(sum(sessions), 0)::bigint as sessions,
      coalesce(sum(greatest(unique_visitors, 0)), 0)::bigint as visitors,
      coalesce(sum(sessions), 0)::bigint as fallback_views
    from filtered
  ),
  view_totals as (
    select coalesce(sum(views), 0)::bigint as views from filtered_views
  ),
  prev_totals as (
    select
      coalesce((select sum(sessions)::bigint from prev_rollups), 0)::bigint as prev_sessions,
      coalesce((select sum(greatest(unique_visitors, 0))::bigint from prev_rollups), 0)::bigint as prev_visitors,
      greatest(
        coalesce((select sum(views)::bigint from prev_views), 0)::bigint,
        coalesce((select sum(sessions)::bigint from prev_rollups), 0)::bigint
      ) as prev_views
  ),
  kpi_windows as (
    select
      coalesce((select sum(sessions)::bigint from public.inbound_visit_daily_rollups where day = v_today), 0)::bigint as sessions_today,
      greatest(
        coalesce((select sum(views)::bigint from public.inbound_page_view_daily_rollups where day = v_today), 0)::bigint,
        coalesce((select sum(sessions)::bigint from public.inbound_visit_daily_rollups where day = v_today), 0)::bigint
      ) as views_today,
      coalesce((select sum(sessions)::bigint from public.inbound_visit_daily_rollups where day = v_today - 1), 0)::bigint as sessions_yesterday,
      greatest(
        coalesce((select sum(views)::bigint from public.inbound_page_view_daily_rollups where day = v_today - 1), 0)::bigint,
        coalesce((select sum(sessions)::bigint from public.inbound_visit_daily_rollups where day = v_today - 1), 0)::bigint
      ) as views_yesterday,
      coalesce((select sum(sessions)::bigint from public.inbound_visit_daily_rollups where day between v_today - 6 and v_today), 0)::bigint as sessions_7d,
      greatest(
        coalesce((select sum(views)::bigint from public.inbound_page_view_daily_rollups where day between v_today - 6 and v_today), 0)::bigint,
        coalesce((select sum(sessions)::bigint from public.inbound_visit_daily_rollups where day between v_today - 6 and v_today), 0)::bigint
      ) as views_7d,
      coalesce((select sum(sessions)::bigint from public.inbound_visit_daily_rollups where day between v_today - 13 and v_today - 7), 0)::bigint as sessions_prev_7d,
      greatest(
        coalesce((select sum(views)::bigint from public.inbound_page_view_daily_rollups where day between v_today - 13 and v_today - 7), 0)::bigint,
        coalesce((select sum(sessions)::bigint from public.inbound_visit_daily_rollups where day between v_today - 13 and v_today - 7), 0)::bigint
      ) as views_prev_7d,
      coalesce((select sum(sessions)::bigint from public.inbound_visit_daily_rollups where day between v_today - 29 and v_today), 0)::bigint as sessions_30d,
      greatest(
        coalesce((select sum(views)::bigint from public.inbound_page_view_daily_rollups where day between v_today - 29 and v_today), 0)::bigint,
        coalesce((select sum(sessions)::bigint from public.inbound_visit_daily_rollups where day between v_today - 29 and v_today), 0)::bigint
      ) as views_30d,
      coalesce((select sum(sessions)::bigint from public.inbound_visit_daily_rollups where day between v_today - 59 and v_today - 30), 0)::bigint as sessions_prev_30d,
      greatest(
        coalesce((select sum(views)::bigint from public.inbound_page_view_daily_rollups where day between v_today - 59 and v_today - 30), 0)::bigint,
        coalesce((select sum(sessions)::bigint from public.inbound_visit_daily_rollups where day between v_today - 59 and v_today - 30), 0)::bigint
      ) as views_prev_30d,
      coalesce((select sum(sessions)::bigint from public.inbound_visit_daily_rollups), 0)::bigint as sessions_all_time,
      greatest(
        coalesce((select sum(views)::bigint from public.inbound_page_view_daily_rollups), 0)::bigint,
        coalesce((select sum(sessions)::bigint from public.inbound_visit_daily_rollups), 0)::bigint
      ) as views_all_time,
      coalesce((select sum(greatest(unique_visitors, sessions))::bigint from public.inbound_visit_daily_rollups), 0)::bigint as visitors_all_time,
      (select min(day) from public.inbound_visit_daily_rollups) as first_recorded_day
  ),
  sources as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'sourceCategory', source_category,
      'sourceName', source_name,
      'sessions', sessions,
      'visitors', visitors,
      'views', views
    ) order by sessions desc, source_name), '[]'::jsonb) as value
    from (
      select
        source_category,
        source_name,
        sum(sessions)::bigint as sessions,
        sum(greatest(unique_visitors, sessions))::bigint as visitors,
        sum(greatest(views, sessions))::bigint as views
      from filtered
      group by source_category, source_name
      order by sessions desc
      limit 50
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
      from filtered
      group by landing_path
      order by sessions desc
      limit 50
    ) grouped
  ),
  page_views as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'pagePath', page_path,
      'views', views,
      'entrySessions', entry_sessions,
      'uniqueSessions', unique_sessions
    ) order by views desc, entry_sessions desc, page_path), '[]'::jsonb) as value
    from (
      select
        coalesce(pv.page_path, l.landing_path) as page_path,
        greatest(coalesce(pv.views, 0), coalesce(l.sessions, 0))::bigint as views,
        greatest(coalesce(pv.entry_sessions, 0), coalesce(l.sessions, 0))::bigint as entry_sessions,
        greatest(coalesce(pv.unique_sessions, 0), coalesce(l.sessions, 0))::bigint as unique_sessions
      from (
        select page_path, sum(views)::bigint as views, sum(entry_sessions)::bigint as entry_sessions, sum(unique_sessions)::bigint as unique_sessions
        from filtered_views
        group by page_path
      ) pv
      full outer join (
        select landing_path, sum(sessions)::bigint as sessions
        from filtered
        group by landing_path
      ) l on l.landing_path = pv.page_path
      order by greatest(coalesce(pv.views, 0), coalesce(l.sessions, 0)) desc
      limit 50
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
  device_os as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'deviceClass', device_class,
      'osFamily', os_family,
      'sessions', sessions
    ) order by sessions desc, device_class, os_family), '[]'::jsonb) as value
    from (
      select device_class, coalesce(nullif(os_family, ''), 'unknown') as os_family, sum(sessions)::bigint as sessions
      from filtered
      group by device_class, coalesce(nullif(os_family, ''), 'unknown')
    ) grouped
  ),
  browsers as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'browserFamily', browser_family,
      'sessions', sessions
    ) order by sessions desc, browser_family), '[]'::jsonb) as value
    from (
      select coalesce(nullif(browser_family, ''), 'unknown') as browser_family, sum(sessions)::bigint as sessions
      from filtered
      group by coalesce(nullif(browser_family, ''), 'unknown')
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
      'sessions', sessions,
      'views', views,
      'visitors', visitors
    ) order by day), '[]'::jsonb) as value
    from (
      select
        coalesce(s.day, pv.day) as day,
        coalesce(s.sessions, 0)::bigint as sessions,
        greatest(coalesce(pv.views, 0), coalesce(s.sessions, 0))::bigint as views,
        coalesce(s.visitors, coalesce(s.sessions, 0))::bigint as visitors
      from (
        select day, sum(sessions)::bigint as sessions, sum(greatest(unique_visitors, sessions))::bigint as visitors
        from filtered
        group by day
      ) s
      full outer join (
        select day, sum(views)::bigint as views
        from filtered_views
        group by day
      ) pv on pv.day = s.day
      order by coalesce(s.day, pv.day)
    ) grouped
  ),
  prev_daily as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'day', day,
      'sessions', sessions,
      'views', views
    ) order by day), '[]'::jsonb) as value
    from (
      select
        coalesce(s.day, pv.day) as day,
        coalesce(s.sessions, 0)::bigint as sessions,
        greatest(coalesce(pv.views, 0), coalesce(s.sessions, 0))::bigint as views
      from (
        select day, sum(sessions)::bigint as sessions
        from prev_rollups
        group by day
      ) s
      full outer join (
        select day, sum(views)::bigint as views
        from prev_views
        group by day
      ) pv on pv.day = s.day
      order by coalesce(s.day, pv.day)
    ) grouped
  ),
  hourly as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'hour', to_char(hour_bucket, 'YYYY-MM-DD"T"HH24:00:00"Z"'),
      'sessions', sessions,
      'views', views
    ) order by hour_bucket), '[]'::jsonb) as value
    from (
      select
        coalesce(s.hour_bucket, pv.hour_bucket) as hour_bucket,
        coalesce(s.sessions, 0)::bigint as sessions,
        greatest(coalesce(pv.views, 0), coalesce(s.sessions, 0))::bigint as views
      from (
        select date_trunc('hour', occurred_at at time zone 'UTC') as hour_bucket, count(*)::bigint as sessions
        from public.inbound_visit_events
        where occurred_at >= now() - interval '48 hours'
        group by 1
      ) s
      full outer join (
        select date_trunc('hour', occurred_at at time zone 'UTC') as hour_bucket, count(*)::bigint as views
        from public.inbound_page_view_events
        where occurred_at >= now() - interval '48 hours'
        group by 1
      ) pv on pv.hour_bucket = s.hour_bucket
      order by coalesce(s.hour_bucket, pv.hour_bucket)
    ) grouped
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'totalSessions', totals.sessions,
    'totalViews', greatest(view_totals.views, totals.fallback_views),
    'totalUniqueVisitors', case when totals.visitors > 0 then totals.visitors else totals.sessions end,
    'previousPeriod', jsonb_build_object(
      'from', v_prev_from,
      'to', v_prev_to,
      'totalSessions', prev_totals.prev_sessions,
      'totalViews', prev_totals.prev_views,
      'totalUniqueVisitors', prev_totals.prev_visitors
    ),
    'kpis', jsonb_build_object(
      'viewsToday', kpi_windows.views_today,
      'sessionsToday', kpi_windows.sessions_today,
      'viewsYesterday', kpi_windows.views_yesterday,
      'sessionsYesterday', kpi_windows.sessions_yesterday,
      'views7d', kpi_windows.views_7d,
      'sessions7d', kpi_windows.sessions_7d,
      'viewsPrev7d', kpi_windows.views_prev_7d,
      'sessionsPrev7d', kpi_windows.sessions_prev_7d,
      'views30d', kpi_windows.views_30d,
      'sessions30d', kpi_windows.sessions_30d,
      'viewsPrev30d', kpi_windows.views_prev_30d,
      'sessionsPrev30d', kpi_windows.sessions_prev_30d,
      'viewsAllTime', kpi_windows.views_all_time,
      'sessionsAllTime', kpi_windows.sessions_all_time,
      'visitorsAllTime', kpi_windows.visitors_all_time,
      'firstRecordedDay', kpi_windows.first_recorded_day
    ),
    'bySource', sources.value,
    'byReferrer', referrers.value,
    'byLanding', landings.value,
    'byPageView', page_views.value,
    'byDevice', devices.value,
    'byDeviceOs', device_os.value,
    'byBrowser', browsers.value,
    'byCountry', countries.value,
    'byRegion', regions.value,
    'byCampaign', campaigns.value,
    'daily', daily.value,
    'previousDaily', prev_daily.value,
    'hourly', hourly.value
  ) into v_result
  from totals, view_totals, prev_totals, kpi_windows, sources, referrers, landings, page_views, devices, device_os, browsers, countries, regions, campaigns, daily, prev_daily, hourly;

  return v_result;
end;
$$;

revoke all on function public.inbound_admin_summary(date, date) from public;
grant execute on function public.inbound_admin_summary(date, date) to authenticated;

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
  v_today date := (now() at time zone 'UTC')::date;
  v_span integer;
  v_prev_from date;
  v_prev_to date;
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

  v_span := greatest(1, (p_to - p_from) + 1);
  v_prev_to := p_from - 1;
  v_prev_from := p_from - v_span;

  with base_scope as (
    select *
    from public.outbound_click_daily_rollups r
    where (p_entity_type is null or r.entity_type = p_entity_type)
      and (p_entity_id is null or r.entity_id = p_entity_id)
      and (p_organization_id is null or r.organization_id = p_organization_id)
      and (p_campaign_key is null or r.campaign_key = p_campaign_key)
  ),
  filtered as (
    select * from base_scope where day between p_from and p_to
  ),
  prev_filtered as (
    select * from base_scope where day between v_prev_from and v_prev_to
  ),
  totals as (
    select
      coalesce(sum(total_clicks), 0)::bigint as total_clicks,
      coalesce(sum(qualified_clicks), 0)::bigint as qualified_clicks,
      count(distinct destination_domain)::bigint as unique_domains,
      count(distinct (destination_domain || coalesce(destination_path, '')))::bigint as unique_destinations
    from filtered
  ),
  prev_totals as (
    select
      coalesce(sum(total_clicks), 0)::bigint as total_clicks,
      coalesce(sum(qualified_clicks), 0)::bigint as qualified_clicks
    from prev_filtered
  ),
  kpi_windows as (
    select
      coalesce((select sum(total_clicks)::bigint from base_scope where day = v_today), 0)::bigint as clicks_today,
      coalesce((select sum(qualified_clicks)::bigint from base_scope where day = v_today), 0)::bigint as qualified_today,
      coalesce((select sum(total_clicks)::bigint from base_scope where day = v_today - 1), 0)::bigint as clicks_yesterday,
      coalesce((select sum(qualified_clicks)::bigint from base_scope where day = v_today - 1), 0)::bigint as qualified_yesterday,
      coalesce((select sum(total_clicks)::bigint from base_scope where day between v_today - 6 and v_today), 0)::bigint as clicks_7d,
      coalesce((select sum(qualified_clicks)::bigint from base_scope where day between v_today - 6 and v_today), 0)::bigint as qualified_7d,
      coalesce((select sum(total_clicks)::bigint from base_scope where day between v_today - 13 and v_today - 7), 0)::bigint as clicks_prev_7d,
      coalesce((select sum(qualified_clicks)::bigint from base_scope where day between v_today - 13 and v_today - 7), 0)::bigint as qualified_prev_7d,
      coalesce((select sum(total_clicks)::bigint from base_scope where day between v_today - 29 and v_today), 0)::bigint as clicks_30d,
      coalesce((select sum(qualified_clicks)::bigint from base_scope where day between v_today - 29 and v_today), 0)::bigint as qualified_30d,
      coalesce((select sum(total_clicks)::bigint from base_scope where day between v_today - 59 and v_today - 30), 0)::bigint as clicks_prev_30d,
      coalesce((select sum(qualified_clicks)::bigint from base_scope where day between v_today - 59 and v_today - 30), 0)::bigint as qualified_prev_30d,
      coalesce((select sum(total_clicks)::bigint from base_scope), 0)::bigint as clicks_all_time,
      coalesce((select sum(qualified_clicks)::bigint from base_scope), 0)::bigint as qualified_all_time,
      (select min(day) from base_scope) as first_recorded_day
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
  ),
  entity_destinations as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'entityType', entity_type,
      'entityId', entity_id,
      'organizationId', organization_id,
      'destinationType', destination_type,
      'destinationDomain', destination_domain,
      'destinationPath', destination_path,
      'qualifiedClicks', qualified_clicks,
      'totalClicks', total_clicks
    ) order by qualified_clicks desc, total_clicks desc), '[]'::jsonb) as value
    from (
      select
        entity_type,
        entity_id,
        organization_id,
        destination_type,
        destination_domain,
        destination_path,
        sum(qualified_clicks)::bigint as qualified_clicks,
        sum(total_clicks)::bigint as total_clicks
      from filtered
      group by entity_type, entity_id, organization_id, destination_type, destination_domain, destination_path
      order by qualified_clicks desc, total_clicks desc
      limit 100
    ) grouped
  ),
  domains as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'destinationDomain', destination_domain,
      'destinationType', destination_type,
      'qualifiedClicks', qualified_clicks,
      'totalClicks', total_clicks,
      'entityCount', entity_count
    ) order by qualified_clicks desc, total_clicks desc), '[]'::jsonb) as value
    from (
      select
        destination_domain,
        (array_agg(destination_type order by qualified_clicks desc))[1] as destination_type,
        sum(qualified_clicks)::bigint as qualified_clicks,
        sum(total_clicks)::bigint as total_clicks,
        count(distinct (entity_type || ':' || entity_id))::bigint as entity_count
      from filtered
      group by destination_domain
      order by qualified_clicks desc, total_clicks desc
      limit 50
    ) grouped
  ),
  daily as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'day', day,
      'qualifiedClicks', qualified_clicks,
      'totalClicks', total_clicks
    ) order by day), '[]'::jsonb) as value
    from (
      select day, sum(qualified_clicks)::bigint as qualified_clicks, sum(total_clicks)::bigint as total_clicks
      from filtered
      group by day
      order by day
    ) grouped
  ),
  prev_daily as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'day', day,
      'qualifiedClicks', qualified_clicks,
      'totalClicks', total_clicks
    ) order by day), '[]'::jsonb) as value
    from (
      select day, sum(qualified_clicks)::bigint as qualified_clicks, sum(total_clicks)::bigint as total_clicks
      from prev_filtered
      group by day
      order by day
    ) grouped
  ),
  hourly as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'hour', to_char(hour_bucket, 'YYYY-MM-DD"T"HH24:00:00"Z"'),
      'qualifiedClicks', qualified_clicks,
      'totalClicks', total_clicks
    ) order by hour_bucket), '[]'::jsonb) as value
    from (
      select
        date_trunc('hour', occurred_at at time zone 'UTC') as hour_bucket,
        count(*) filter (where is_qualified)::bigint as qualified_clicks,
        count(*)::bigint as total_clicks
      from public.outbound_click_events e
      where e.occurred_at >= now() - interval '48 hours'
        and (p_entity_type is null or e.entity_type = p_entity_type)
        and (p_entity_id is null or e.entity_id = p_entity_id)
        and (p_organization_id is null or e.organization_id = p_organization_id)
        and (p_campaign_key is null or e.campaign_key = p_campaign_key)
      group by 1
      order by 1
    ) grouped
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'totalClicks', totals.total_clicks,
    'qualifiedClicks', totals.qualified_clicks,
    'uniqueDomains', totals.unique_domains,
    'uniqueDestinations', totals.unique_destinations,
    'dailyUniqueSessions', unique_sessions.daily_unique_sessions,
    'dailyUniqueUsers', unique_users.daily_unique_users,
    'uniqueCountsComplete', p_from >= (current_date - 120),
    'uniqueCountCoverageStart', greatest(p_from, current_date - 120),
    'previousPeriod', jsonb_build_object(
      'from', v_prev_from,
      'to', v_prev_to,
      'totalClicks', prev_totals.total_clicks,
      'qualifiedClicks', prev_totals.qualified_clicks
    ),
    'kpis', jsonb_build_object(
      'clicksToday', kpi_windows.clicks_today,
      'qualifiedToday', kpi_windows.qualified_today,
      'clicksYesterday', kpi_windows.clicks_yesterday,
      'qualifiedYesterday', kpi_windows.qualified_yesterday,
      'clicks7d', kpi_windows.clicks_7d,
      'qualified7d', kpi_windows.qualified_7d,
      'clicksPrev7d', kpi_windows.clicks_prev_7d,
      'qualifiedPrev7d', kpi_windows.qualified_prev_7d,
      'clicks30d', kpi_windows.clicks_30d,
      'qualified30d', kpi_windows.qualified_30d,
      'clicksPrev30d', kpi_windows.clicks_prev_30d,
      'qualifiedPrev30d', kpi_windows.qualified_prev_30d,
      'clicksAllTime', kpi_windows.clicks_all_time,
      'qualifiedAllTime', kpi_windows.qualified_all_time,
      'firstRecordedDay', kpi_windows.first_recorded_day
    ),
    'byDestination', destinations.value,
    'byPlacement', placements.value,
    'byLink', links.value,
    'byEntity', entities.value,
    'byEntityDestination', entity_destinations.value,
    'byDomain', domains.value,
    'daily', daily.value,
    'previousDaily', prev_daily.value,
    'hourly', hourly.value
  )
  into v_result
  from totals
  cross join prev_totals
  cross join kpi_windows
  cross join unique_sessions
  cross join unique_users
  cross join destinations
  cross join placements
  cross join links
  cross join entities
  cross join entity_destinations
  cross join domains
  cross join daily
  cross join prev_daily
  cross join hourly;

  return v_result;
end;
$$;

revoke all on function public.outbound_admin_summary(date, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.outbound_admin_summary(date, date, text, text, text, text) to authenticated;

create or replace function public.inbound_apply_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_sessions bigint := 0;
  v_deleted_page_views bigint := 0;
  v_deleted_visitor_hashes bigint := 0;
  v_deleted_page_hashes bigint := 0;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  ) then
    raise exception 'Administrator access required';
  end if;

  delete from public.inbound_visit_events
  where occurred_at < now() - interval '90 days';
  get diagnostics v_deleted_sessions = row_count;

  delete from public.inbound_page_view_events
  where occurred_at < now() - interval '90 days';
  get diagnostics v_deleted_page_views = row_count;

  delete from public.inbound_daily_unique_visitors
  where day < current_date - 120;
  get diagnostics v_deleted_visitor_hashes = row_count;

  delete from public.inbound_page_view_daily_unique_sessions
  where day < current_date - 120;
  get diagnostics v_deleted_page_hashes = row_count;

  return jsonb_build_object(
    'deletedRawSessions', v_deleted_sessions,
    'deletedRawPageViews', v_deleted_page_views,
    'deletedVisitorHashes', v_deleted_visitor_hashes,
    'deletedPageSessionHashes', v_deleted_page_hashes
  );
end;
$$;

revoke all on function public.inbound_apply_retention() from public;
grant execute on function public.inbound_apply_retention() to authenticated;

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
      'osFamily', coalesce(os_family, 'unknown'),
      'browserFamily', coalesce(browser_family, 'unknown'),
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
