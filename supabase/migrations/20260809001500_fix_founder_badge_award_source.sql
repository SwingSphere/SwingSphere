-- Fix founder-number assignment after the badge award helper was tightened to
-- require public.badge_award_source. PL/pgSQL accepted the original function
-- body, but the text CASE expression could not resolve the enum overload at
-- runtime. Keep the helper private and make every ambiguous argument explicit.

create or replace function private.assign_founder_number_internal(
  p_user_id uuid,
  p_ignore_program_gate boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing integer;
  v_next integer;
  v_limit integer;
  v_enabled boolean;
  v_role public.account_role;
  v_status public.account_status;
  v_verified timestamptz;
begin
  select founder_number, role, status, email_verified_at
  into v_existing, v_role, v_status, v_verified
  from public.profiles
  where id = p_user_id
  for update;

  if v_existing is not null then
    return v_existing;
  end if;

  select founder_program_enabled, founder_limit
  into v_enabled, v_limit
  from public.badge_system_settings
  where singleton = true;

  if not coalesce(v_enabled, false) and not p_ignore_program_gate then
    return null;
  end if;

  if v_verified is null or v_status <> 'active' or v_role = 'admin' then
    return null;
  end if;

  v_next := nextval('public.founder_number_seq');
  if v_next > v_limit then
    return null;
  end if;

  update public.profiles
  set founder_number = v_next,
      founder_awarded_at = now(),
      updated_at = now()
  where id = p_user_id
    and founder_number is null;

  perform private.award_user_badge_internal(
    p_user_id,
    'founding-member'::text,
    (case when v_next in (1, 10, 50, 100) then 'milestone' else 'automatic' end)::public.badge_award_source,
    'Founding 100 member'::text,
    jsonb_build_object(
      'founder_number', v_next,
      'founder_limit', v_limit,
      'variant', private.founder_variant_for(v_next)
    ),
    null::uuid
  );

  return v_next;
end;
$$;

revoke all on function private.assign_founder_number_internal(uuid, boolean) from public, anon, authenticated;
