-- Friendly member handles across email and OAuth signup.
-- Goals:
-- - allow short two-character handles such as @aj and @ak;
-- - never expose UUID fragments in generated handles;
-- - use readable numeric suffixes only when a handle is already taken;
-- - reserve system/brand handles from member use;
-- - give Google onboarding a server-side identity setter that uses the same rules.

create or replace function public.is_reserved_profile_handle(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(trim(coalesce(value, ''))) = any (array[
    'admin',
    'administrator',
    'api',
    'help',
    'moderator',
    'official',
    'root',
    'security',
    'staff',
    'support',
    'swingsphere',
    'system',
    'user',
    'www'
  ]::text[]);
$$;

alter table public.profiles
  drop constraint if exists profiles_handle_format;

alter table public.profiles
  add constraint profiles_handle_format
  check (handle ~ '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$');

alter table public.profiles
  drop constraint if exists profiles_handle_not_reserved;

alter table public.profiles
  add constraint profiles_handle_not_reserved
  check (role = 'admin' or not public.is_reserved_profile_handle(handle)) not valid;

create or replace function public.generate_unique_profile_handle(
  preferred_name text,
  user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base_handle text;
  candidate text;
  numeric_suffix integer := 2;
  suffix text;
begin
  base_handle := public.slugify_profile_handle(preferred_name);

  if char_length(base_handle) < 2 or public.is_reserved_profile_handle(base_handle) then
    base_handle := 'member';
  end if;

  base_handle := left(base_handle, 40);

  -- Serialize competing signups for the same preferred handle so two users do
  -- not receive the same friendly suffix in concurrent transactions.
  perform pg_advisory_xact_lock(hashtext('profile-handle:' || base_handle));

  candidate := base_handle;
  if not exists (
    select 1
    from public.profiles
    where handle = candidate
      and id <> user_id
  ) then
    return candidate;
  end if;

  loop
    suffix := '-' || numeric_suffix::text;
    candidate := left(base_handle, 40 - char_length(suffix)) || suffix;

    if not exists (
      select 1
      from public.profiles
      where handle = candidate
        and id <> user_id
    ) then
      return candidate;
    end if;

    numeric_suffix := numeric_suffix + 1;
    if numeric_suffix > 1000000 then
      raise exception 'Unable to generate an available profile handle';
    end if;
  end loop;
end;
$$;

-- Move legacy generated handles such as @user and @user-129d4277 to the new
-- friendly naming rules. This only touches the known old fallback pattern.
do $$
declare
  profile_row record;
  next_handle text;
begin
  for profile_row in
    select id, display_name
    from public.profiles
    where handle = 'user'
       or handle ~ '^user-[0-9a-f]{8}$'
    order by created_at, id
  loop
    next_handle := public.generate_unique_profile_handle(profile_row.display_name, profile_row.id);

    update public.profiles
    set handle = next_handle
    where id = profile_row.id;
  end loop;
end;
$$;

alter table public.profiles
  validate constraint profiles_handle_not_reserved;

create or replace function public.set_my_profile_identity(
  p_display_name text,
  p_account_intent text default 'explore'
)
returns table (
  display_name text,
  handle text,
  account_intent text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_display_name text;
  v_handle text;
  v_account_intent text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_user_id
      and status = 'active'
  ) then
    raise exception 'An active SwingSphere profile is required.';
  end if;

  v_display_name := nullif(trim(p_display_name), '');
  if v_display_name is null then
    raise exception 'Display name is required.';
  end if;

  if char_length(v_display_name) > 80 then
    raise exception 'Display name must be 80 characters or fewer.';
  end if;

  v_account_intent := case
    when p_account_intent = 'promote' then 'promote'
    else 'explore'
  end;

  v_handle := public.generate_unique_profile_handle(v_display_name, v_user_id);

  update public.profiles
  set display_name = v_display_name,
      handle = v_handle,
      account_intent = v_account_intent
  where id = v_user_id;

  return query
  select v_display_name, v_handle, v_account_intent;
end;
$$;

revoke all on function public.generate_unique_profile_handle(text, uuid) from public, anon, authenticated;
revoke all on function public.set_my_profile_identity(text, text) from public, anon, authenticated;

grant execute on function public.set_my_profile_identity(text, text) to authenticated;

comment on function public.generate_unique_profile_handle(text, uuid) is
  'Generates a friendly unique 2-40 character member handle. Collisions use numeric suffixes; UUID fragments are never exposed.';

comment on function public.set_my_profile_identity(text, text) is
  'Authenticated onboarding helper that sets the member display name, friendly generated handle, and signup intent using server-side handle rules.';
