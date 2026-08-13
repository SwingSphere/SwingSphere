-- SwingSphere secure admin account mutations + reusable append-only audit trail.

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  target_name text,
  reason text,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_audit_log_action_length check (char_length(action) between 1 and 120),
  constraint admin_audit_log_target_type_length check (char_length(target_type) between 1 and 80),
  constraint admin_audit_log_target_id_length check (char_length(target_id) between 1 and 200),
  constraint admin_audit_log_target_name_length check (target_name is null or char_length(target_name) <= 240),
  constraint admin_audit_log_reason_length check (reason is null or char_length(reason) <= 1000)
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log(created_at desc);
create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log(actor_user_id, created_at desc)
  where actor_user_id is not null;
create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log(target_type, target_id, created_at desc);
create index if not exists admin_audit_log_action_idx
  on public.admin_audit_log(action, created_at desc);

alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from public, anon, authenticated;

create or replace function private.record_admin_audit_internal(
  p_actor_user_id uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_target_name text default null,
  p_reason text default null,
  p_before_state jsonb default '{}'::jsonb,
  p_after_state jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.admin_audit_log (
    actor_user_id,
    action,
    target_type,
    target_id,
    target_name,
    reason,
    before_state,
    after_state,
    metadata
  ) values (
    p_actor_user_id,
    trim(p_action),
    trim(p_target_type),
    trim(p_target_id),
    nullif(trim(p_target_name), ''),
    nullif(trim(p_reason), ''),
    coalesce(p_before_state, '{}'::jsonb),
    coalesce(p_after_state, '{}'::jsonb),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function private.record_admin_audit_internal(uuid, text, text, text, text, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

create or replace function public.admin_list_audit_log(
  p_limit integer default 500,
  p_offset integer default 0
)
returns table (
  id bigint,
  created_at timestamptz,
  actor_user_id uuid,
  actor_display_name text,
  action text,
  target_type text,
  target_id text,
  target_name text,
  reason text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb
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
    log.id,
    log.created_at,
    log.actor_user_id,
    coalesce(actor.display_name, 'Former administrator')::text,
    log.action,
    log.target_type,
    log.target_id,
    log.target_name,
    log.reason,
    log.before_state,
    log.after_state,
    log.metadata
  from public.admin_audit_log log
  left join public.profiles actor on actor.id = log.actor_user_id
  order by log.created_at desc, log.id desc
  limit greatest(1, least(coalesce(p_limit, 500), 1000))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_list_audit_log(integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_audit_log(integer, integer) to authenticated;

create or replace function public.admin_update_user_account(
  p_user_id uuid,
  p_role text default null,
  p_status text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.profiles%rowtype;
  v_after public.profiles%rowtype;
  v_next_role public.account_role;
  v_next_status public.account_status;
  v_reason text;
  v_other_active_admins integer;
  v_action text;
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A reason is required for account changes.';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'Reason must be 1000 characters or fewer.';
  end if;

  select * into v_before
  from public.profiles
  where id = p_user_id
  for update;

  if v_before.id is null then
    raise exception 'User account not found.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role or account status from User Management. Use another active administrator.';
  end if;

  if p_role is null or trim(p_role) = '' then
    v_next_role := v_before.role;
  else
    case lower(trim(p_role))
      when 'user' then v_next_role := 'user'::public.account_role;
      when 'promoter' then v_next_role := 'promoter'::public.account_role;
      when 'admin' then v_next_role := 'admin'::public.account_role;
      else raise exception 'Unsupported account role: %', p_role;
    end case;
  end if;

  if p_status is null or trim(p_status) = '' then
    v_next_status := v_before.status;
  else
    case lower(trim(p_status))
      when 'active' then v_next_status := 'active'::public.account_status;
      when 'suspended' then v_next_status := 'suspended'::public.account_status;
      when 'deleted' then v_next_status := 'deleted'::public.account_status;
      else raise exception 'Unsupported account status: %', p_status;
    end case;
  end if;

  if v_next_role = v_before.role and v_next_status = v_before.status then
    raise exception 'No account changes were requested.';
  end if;

  if v_before.role = 'admin' and v_before.status = 'active'
     and (v_next_role <> 'admin' or v_next_status <> 'active') then
    select count(*)::integer into v_other_active_admins
    from public.profiles
    where id <> p_user_id
      and role = 'admin'
      and status = 'active';

    if v_other_active_admins < 1 then
      raise exception 'SwingSphere must retain at least one other active administrator.';
    end if;
  end if;

  update public.profiles
  set role = v_next_role,
      status = v_next_status,
      updated_at = now()
  where id = p_user_id
  returning * into v_after;

  if v_before.role <> v_after.role and v_before.status = v_after.status then
    v_action := 'user.role_changed';
  elsif v_before.status <> v_after.status and v_before.role = v_after.role then
    v_action := case v_after.status
      when 'suspended' then 'user.suspended'
      when 'deleted' then 'user.marked_deleted'
      when 'active' then case v_before.status
        when 'deleted' then 'user.restored'
        else 'user.reactivated'
      end
    end;
  else
    v_action := 'user.account_updated';
  end if;

  perform private.record_admin_audit_internal(
    auth.uid(),
    v_action,
    'user',
    p_user_id::text,
    v_after.display_name,
    v_reason,
    jsonb_build_object('role', v_before.role, 'status', v_before.status),
    jsonb_build_object('role', v_after.role, 'status', v_after.status),
    jsonb_build_object('handle', v_after.handle, 'source', 'admin_user_management')
  );

  return jsonb_build_object(
    'id', v_after.id,
    'displayName', v_after.display_name,
    'handle', v_after.handle,
    'role', v_after.role,
    'status', v_after.status,
    'updatedAt', v_after.updated_at
  );
end;
$$;

revoke all on function public.admin_update_user_account(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_user_account(uuid, text, text, text) to authenticated;

-- Route existing manual user-badge operations into the same audit trail.
create or replace function public.admin_award_user_badge(
  p_user_id uuid,
  p_badge_slug text,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_award public.user_badges;
  v_target_name text;
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;

  if p_badge_slug = 'founding-member' then
    raise exception 'Use the founder-number action for Founding Member awards.';
  end if;

  select display_name into v_target_name from public.profiles where id = p_user_id;
  if v_target_name is null then
    raise exception 'User account not found.';
  end if;

  v_award := private.award_user_badge_internal(
    p_user_id,
    p_badge_slug,
    'admin'::public.badge_award_source,
    p_reason,
    coalesce(p_metadata, '{}'::jsonb),
    auth.uid()
  );

  perform private.record_admin_audit_internal(
    auth.uid(),
    'badge.user_awarded',
    'user',
    p_user_id::text,
    v_target_name,
    p_reason,
    '{}'::jsonb,
    jsonb_build_object('badgeSlug', p_badge_slug, 'awardId', v_award.id),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'admin_badge_manager')
  );

  return v_award.id;
end;
$$;

create or replace function public.admin_revoke_user_badge(
  p_user_id uuid,
  p_badge_slug text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
  v_target_name text;
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;

  if p_badge_slug = 'founding-member' then
    raise exception 'Founding Member numbers are permanent historical identifiers and cannot be revoked here.';
  end if;

  select display_name into v_target_name from public.profiles where id = p_user_id;
  if v_target_name is null then
    raise exception 'User account not found.';
  end if;

  update public.user_badges award
  set revoked_at = now(),
      revoked_by = auth.uid(),
      revocation_reason = nullif(trim(p_reason), ''),
      is_public = false,
      is_featured = false,
      featured_order = null
  from public.badges badge
  where award.user_id = p_user_id
    and award.badge_id = badge.id
    and badge.slug = p_badge_slug
    and award.revoked_at is null;

  get diagnostics v_updated = row_count;

  if v_updated > 0 then
    perform private.record_admin_audit_internal(
      auth.uid(),
      'badge.user_revoked',
      'user',
      p_user_id::text,
      v_target_name,
      p_reason,
      jsonb_build_object('badgeSlug', p_badge_slug, 'awarded', true),
      jsonb_build_object('badgeSlug', p_badge_slug, 'awarded', false),
      jsonb_build_object('source', 'admin_badge_manager')
    );
  end if;

  return v_updated > 0;
end;
$$;

create or replace function public.admin_assign_founder_number(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before integer;
  v_after integer;
  v_target_name text;
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;

  select founder_number, display_name
    into v_before, v_target_name
  from public.profiles
  where id = p_user_id;

  if v_target_name is null then
    raise exception 'User account not found.';
  end if;

  v_after := private.assign_founder_number_internal(p_user_id, true);

  if v_before is null and v_after is not null then
    perform private.record_admin_audit_internal(
      auth.uid(),
      'badge.founder_assigned',
      'user',
      p_user_id::text,
      v_target_name,
      null,
      jsonb_build_object('founderNumber', null),
      jsonb_build_object('founderNumber', v_after),
      jsonb_build_object('source', 'admin_badge_manager')
    );
  end if;

  return v_after;
end;
$$;

revoke all on function public.admin_award_user_badge(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.admin_revoke_user_badge(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_assign_founder_number(uuid) from public, anon, authenticated;
grant execute on function public.admin_award_user_badge(uuid, text, text, jsonb) to authenticated;
grant execute on function public.admin_revoke_user_badge(uuid, text, text) to authenticated;
grant execute on function public.admin_assign_founder_number(uuid) to authenticated;

comment on table public.admin_audit_log is
  'Append-only privileged-action history. Browser roles have no direct table access; admins read through admin_list_audit_log().';
comment on function public.admin_update_user_account(uuid, text, text, text) is
  'Admin-only role/status mutation with mandatory reason, self-lockout protection, last-active-admin protection, and audit history.';
