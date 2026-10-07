-- Optional member-shared discovery activity. No historical account linkage is imported.
-- Private tables have no client grants; guarded private functions expose narrow RPCs.
create table private.member_activity_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  enabled_at timestamptz,
  updated_at timestamptz not null default now()
);
create table private.member_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('page_view','outbound','save','unsave')),
  path text not null default '' check (length(path) <= 500),
  entity_type text not null default '' check (length(entity_type) <= 40),
  entity_id text not null default '' check (length(entity_id) <= 200),
  destination text not null default '' check (length(destination) <= 500),
  occurred_at timestamptz not null default clock_timestamp()
);
create index member_activity_user_time_idx on private.member_activity_events(user_id, occurred_at desc);
create index member_activity_retention_idx on private.member_activity_events(occurred_at);
alter table private.member_activity_preferences enable row level security;
alter table private.member_activity_events enable row level security;
revoke all on private.member_activity_preferences, private.member_activity_events from public, anon, authenticated;

create function private.get_member_activity_sharing()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select enabled from private.member_activity_preferences where user_id = auth.uid()), false)
$$;

create function private.set_member_activity_sharing(p_enabled boolean)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not exists (select 1 from public.profiles where id = v_user and status = 'active') then
    raise exception 'Active account required.' using errcode = '42501';
  end if;
  insert into private.member_activity_preferences(user_id, enabled, enabled_at)
    values(v_user, coalesce(p_enabled, false), case when p_enabled then clock_timestamp() end)
    on conflict(user_id) do update set
      enabled = excluded.enabled,
      enabled_at = case when not excluded.enabled then null
        when not member_activity_preferences.enabled then excluded.enabled_at
        else member_activity_preferences.enabled_at end,
      updated_at = clock_timestamp();
  if not coalesce(p_enabled, false) then
    delete from private.member_activity_events where user_id = v_user;
  end if;
  return coalesce(p_enabled, false);
end;
$$;

create function private.record_member_activity(p_kind text, p_path text, p_entity_type text, p_entity_id text, p_destination text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_enabled boolean; v_path text; v_destination text;
begin
  if v_user is null or not exists(select 1 from public.profiles where id = v_user and status = 'active') then return; end if;
  -- Serialize recording with withdrawal, so a concurrent click cannot recreate history.
  select enabled into v_enabled from private.member_activity_preferences where user_id = v_user for update;
  if not coalesce(v_enabled, false) then return; end if;
  if p_kind is null or p_kind not in ('page_view','outbound','save','unsave') then raise exception 'Invalid activity kind.'; end if;
  v_path := split_part(split_part(coalesce(p_path, ''), '?', 1), '#', 1);
  -- Only public discovery routes; never account, auth, admin, or member-profile paths.
  if v_path !~ '^(/|/(discover|explore|map|globe)/?|/(clubs|events|venues|hosts|resorts|cruises)/[A-Za-z0-9_-]+|/(mobile|tablet)(/?|/(home|nearby|search)|/(clubs|events)/[A-Za-z0-9_-]+))$' then
    if p_kind = 'page_view' then return; else v_path := ''; end if;
  end if;
  v_destination := split_part(split_part(coalesce(p_destination, ''), '?', 1), '#', 1);
  if v_destination <> '' and v_destination !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?(/[^[:space:]]*)?$' then v_destination := ''; end if;
  delete from private.member_activity_events where user_id = v_user and occurred_at < now() - interval '30 days';
  -- Deduplicate route effects and bound event volume per account.
  if p_kind = 'page_view' and exists(select 1 from private.member_activity_events
    where user_id = v_user and kind = p_kind and path = v_path and occurred_at > clock_timestamp() - interval '10 seconds') then return; end if;
  if (select count(*) from private.member_activity_events where user_id = v_user and occurred_at > clock_timestamp() - interval '1 minute') >= 120 then return; end if;
  insert into private.member_activity_events(user_id, kind, path, entity_type, entity_id, destination)
    values(v_user, p_kind, left(v_path, 500), left(coalesce(p_entity_type,''),40), left(coalesce(p_entity_id,''),200), left(v_destination,500));
end;
$$;

create function private.admin_get_member_activity(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_enabled boolean; v_since timestamptz; v_result jsonb;
begin
  if auth.uid() is null or not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  select enabled, enabled_at into v_enabled, v_since from private.member_activity_preferences where user_id = p_user_id for share;
  if not coalesce(v_enabled, false) then return jsonb_build_object('sharingEnabled', false); end if;
  delete from private.member_activity_events where user_id = p_user_id and occurred_at < now() - interval '30 days';
  select jsonb_build_object(
    'sharingEnabled', true, 'since', v_since, 'retentionDays', 30,
    'pageViews', count(*) filter(where kind = 'page_view'),
    'outboundClicks', count(*) filter(where kind = 'outbound'),
    'saveActions', count(*) filter(where kind = 'save'),
    'lastActivityAt', max(occurred_at),
    'topPages', coalesce((select jsonb_agg(t) from (
      select path, count(*) as views, max(occurred_at) as "lastViewedAt"
      from private.member_activity_events where user_id = p_user_id and kind = 'page_view'
      group by path order by count(*) desc, max(occurred_at) desc limit 20
    ) t), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(t) from (
      select id, kind, path, entity_type as "entityType", entity_id as "entityId", destination, occurred_at as "occurredAt"
      from private.member_activity_events where user_id = p_user_id order by occurred_at desc limit 100
    ) t), '[]'::jsonb),
    'saved', coalesce((select jsonb_agg(t) from (
      select s.id, s.entity_type as "entityType", s.entity_id as "entityId", s.created_at as "savedAt",
        coalesce(l.name, o.name, v.name, r.name, cs.name, ca.name, s.entity_id) as name
      from public.saved_entities s
      left join public.listings l on s.entity_type in ('club','event') and l.id = s.entity_id
      left join public.organizations o on s.entity_type = 'organization' and o.id = s.entity_id
      left join public.venues v on s.entity_type = 'venue' and v.id = s.entity_id
      left join public.resorts r on s.entity_type = 'resort' and r.id = s.entity_id
      left join public.cruise_series cs on s.entity_type = 'cruise_series' and cs.id = s.entity_id
      left join public.cruise_sailings ca on s.entity_type = 'cruise_sailing' and ca.id = s.entity_id
      where s.user_id = p_user_id order by s.created_at desc limit 100
    ) t), '[]'::jsonb),
    'savedCount', (select count(*) from public.saved_entities where user_id = p_user_id)
  ) into v_result from private.member_activity_events where user_id = p_user_id;
  -- Do not expose private notes, collections, queries, identities, or historical outbound rows.
  return v_result;
end;
$$;

create function public.get_member_activity_sharing()
returns boolean language sql security invoker set search_path = ''
as $$ select private.get_member_activity_sharing() $$;
create function public.set_member_activity_sharing(p_enabled boolean)
returns boolean language sql security invoker set search_path = ''
as $$ select private.set_member_activity_sharing(p_enabled) $$;
create function public.record_member_activity(p_kind text, p_path text, p_entity_type text default '', p_entity_id text default '', p_destination text default '')
returns void language sql security invoker set search_path = ''
as $$ select private.record_member_activity(p_kind, p_path, p_entity_type, p_entity_id, p_destination) $$;
create function public.admin_get_member_activity(p_user_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.admin_get_member_activity(p_user_id) $$;
revoke all on function private.get_member_activity_sharing(), private.set_member_activity_sharing(boolean),
  private.record_member_activity(text,text,text,text,text), private.admin_get_member_activity(uuid) from public, anon;
revoke all on function public.get_member_activity_sharing(), public.set_member_activity_sharing(boolean),
  public.record_member_activity(text,text,text,text,text), public.admin_get_member_activity(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.get_member_activity_sharing(), private.set_member_activity_sharing(boolean),
  private.record_member_activity(text,text,text,text,text), private.admin_get_member_activity(uuid) to authenticated;
grant execute on function public.get_member_activity_sharing(), public.set_member_activity_sharing(boolean),
  public.record_member_activity(text,text,text,text,text), public.admin_get_member_activity(uuid) to authenticated;

-- Hourly deletion keeps expired account-linked activity out of storage even for idle accounts.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('member-activity-retention', '17 * * * *',
  $cron$delete from private.member_activity_events where occurred_at < now() - interval '30 days'$cron$);
