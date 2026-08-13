-- SwingSphere Phase One: account profiles, roles, handles, and baseline RLS.
-- Apply with `supabase db push` after linking the local CLI to the hosted project.

create type public.account_role as enum ('user', 'promoter', 'admin');
create type public.account_status as enum ('active', 'suspended', 'deleted');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  handle text not null unique,
  role public.account_role not null default 'user',
  status public.account_status not null default 'active',
  avatar_url text,
  bio text,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 80),
  constraint profiles_handle_format check (handle ~ '^[a-z0-9][a-z0-9-]{2,39}$')
);

comment on table public.profiles is
  'Public-facing account profile paired one-to-one with auth.users. Authorization remains enforced by RLS.';
comment on column public.profiles.role is
  'Account capability tier. Promoter status should be granted through a verified workflow, not a client-side toggle.';

create index profiles_role_idx on public.profiles(role);
create index profiles_status_idx on public.profiles(status);

create or replace function public.slugify_profile_handle(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(value, 'user')), '[^a-z0-9]+', '-', 'g'));
$$;

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
  suffix text;
begin
  base_handle := public.slugify_profile_handle(preferred_name);
  if char_length(base_handle) < 3 then
    base_handle := 'user';
  end if;

  base_handle := left(base_handle, 30);
  candidate := base_handle;

  if not exists (select 1 from public.profiles where handle = candidate) then
    return candidate;
  end if;

  suffix := left(replace(user_id::text, '-', ''), 8);
  candidate := left(base_handle, 30) || '-' || suffix;

  if not exists (select 1 from public.profiles where handle = candidate) then
    return candidate;
  end if;

  return left(base_handle, 24) || '-' || suffix || '-' || substr(md5(random()::text), 1, 5);
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_display_name text;
  generated_handle text;
begin
  requested_display_name := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
  requested_display_name := coalesce(requested_display_name, split_part(new.email, '@', 1), 'SwingSphere User');
  generated_handle := public.generate_unique_profile_handle(requested_display_name, new.id);

  insert into public.profiles (
    id,
    display_name,
    handle,
    role,
    status,
    email_verified_at
  ) values (
    new.id,
    requested_display_name,
    generated_handle,
    'user',
    'active',
    new.email_confirmed_at
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

create or replace function public.sync_profile_email_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    email_verified_at = new.email_confirmed_at,
    updated_at = now()
  where id = new.id;

  return new;
end;
$$;

create trigger on_auth_user_email_verification_changed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is distinct from new.email_confirmed_at)
  execute procedure public.sync_profile_email_verification();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;

grant select on public.profiles to anon, authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (display_name, handle, avatar_url, bio) on public.profiles to authenticated;

create policy "Public can read active profiles"
on public.profiles
for select
to anon, authenticated
using (status = 'active');

create policy "Users can update their own safe profile fields"
on public.profiles
for update
to authenticated
using (auth.uid() = id and status = 'active')
with check (
  auth.uid() = id
  and status = 'active'
  and role = (select existing.role from public.profiles as existing where existing.id = auth.uid())
);

-- Prevent clients from inserting/deleting profiles directly. The auth trigger creates them,
-- and account deletion should go through a controlled server-side workflow.

revoke all on function public.generate_unique_profile_handle(text, uuid) from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.sync_profile_email_verification() from public, anon, authenticated;
