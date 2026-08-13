-- Generic feedback-target registration for approved SwingSphere listings.
-- This keeps the bridge registries thin while canonical club/event tables are not yet installed.

create or replace function public.feedback_register_target(
  p_target_type text,
  p_source_ref text,
  p_name text,
  p_status text default 'active'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_row jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Administrator access required';
  end if;

  if nullif(btrim(p_source_ref), '') is null then
    raise exception using errcode = '22023', message = 'Source reference is required';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception using errcode = '22023', message = 'Target name is required';
  end if;

  if p_status <> 'active' then
    raise exception using errcode = '22023', message = 'Only active feedback targets may be registered through this function';
  end if;

  if p_target_type = 'event' then
    insert into public.feedback_target_events (id, source_ref, name, status)
    values (p_source_ref, p_source_ref, btrim(p_name), 'active')
    on conflict (id) do update
      set source_ref = excluded.source_ref,
          name = excluded.name,
          status = excluded.status
    returning jsonb_build_object(
      'id', id,
      'sourceRef', source_ref,
      'name', name,
      'status', status,
      'targetType', 'event'
    ) into result_row;
  elsif p_target_type = 'club' then
    insert into public.feedback_target_clubs (id, source_ref, name, status)
    values (p_source_ref, p_source_ref, btrim(p_name), 'active')
    on conflict (id) do update
      set source_ref = excluded.source_ref,
          name = excluded.name,
          status = excluded.status
    returning jsonb_build_object(
      'id', id,
      'sourceRef', source_ref,
      'name', name,
      'status', status,
      'targetType', 'club'
    ) into result_row;
  else
    raise exception using errcode = '22023', message = 'Unsupported feedback target type';
  end if;

  return result_row;
end;
$$;

revoke all on function public.feedback_register_target(text, text, text, text) from public, anon;
grant execute on function public.feedback_register_target(text, text, text, text) to authenticated;

comment on function public.feedback_register_target(text, text, text, text) is
  'Admin-only trusted upsert for thin event/club feedback bridge targets when a listing becomes approved.';
