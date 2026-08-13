-- SwingSphere organizations and secure organization membership.

create type public.organization_member_role as enum ('owner', 'manager', 'editor');
create type public.organization_member_status as enum ('invited', 'active', 'suspended');

create table public.organizations (
  id text primary key,
  name text not null,
  slug text not null unique,
  display_types text[] not null default array['host']::text[],
  description_short text,
  description_full text,
  website text,
  contact_email text,
  logo_image_url text,
  header_image_url text,
  gallery_image_urls text[] not null default '{}',
  status text not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_length check (char_length(trim(name)) between 1 and 120),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$')
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.organization_member_role not null default 'editor',
  status public.organization_member_status not null default 'active',
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_idx on public.organization_members(user_id, status);
create index organization_members_organization_idx on public.organization_members(organization_id, status);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute procedure public.set_updated_at();

create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute procedure public.set_updated_at();

create or replace function public.is_active_admin(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = check_user and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.organization_member_role_for(
  check_organization_id text,
  check_user uuid default auth.uid()
)
returns public.organization_member_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.organization_members
  where organization_id = check_organization_id
    and user_id = check_user
    and status = 'active'
  limit 1;
$$;

create or replace function public.can_manage_organization(
  check_organization_id text,
  allowed_roles public.organization_member_role[] default array['owner','manager','editor']::public.organization_member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_admin(auth.uid())
    or coalesce(public.organization_member_role_for(check_organization_id, auth.uid()) = any(allowed_roles), false);
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

grant select on public.organizations to anon, authenticated;
grant insert, update on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;

create policy "Public can read active organizations"
on public.organizations for select
to anon, authenticated
using (status in ('approved', 'active') or public.can_manage_organization(id));

create policy "Admins can create organizations"
on public.organizations for insert
to authenticated
with check (public.is_active_admin(auth.uid()));

create policy "Organization team can update organizations"
on public.organizations for update
to authenticated
using (public.can_manage_organization(id))
with check (public.can_manage_organization(id));

create policy "Members can read their memberships"
on public.organization_members for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_active_admin(auth.uid())
  or public.can_manage_organization(organization_id, array['owner','manager']::public.organization_member_role[])
);

create policy "Owners managers and admins can add members"
on public.organization_members for insert
to authenticated
with check (
  public.is_active_admin(auth.uid())
  or public.can_manage_organization(organization_id, array['owner','manager']::public.organization_member_role[])
);

create policy "Owners managers and admins can update members"
on public.organization_members for update
to authenticated
using (
  public.is_active_admin(auth.uid())
  or public.can_manage_organization(organization_id, array['owner','manager']::public.organization_member_role[])
)
with check (
  public.is_active_admin(auth.uid())
  or public.can_manage_organization(organization_id, array['owner','manager']::public.organization_member_role[])
);

create policy "Owners and admins can remove members"
on public.organization_members for delete
to authenticated
using (
  public.is_active_admin(auth.uid())
  or public.can_manage_organization(organization_id, array['owner']::public.organization_member_role[])
);

-- Prevent deleting or demoting the final active owner through ordinary client writes.
create or replace function public.protect_last_organization_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_owner_count integer;
begin
  if old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active') then
    select count(*) into active_owner_count
    from public.organization_members
    where organization_id = old.organization_id
      and role = 'owner'
      and status = 'active'
      and id <> old.id;

    if active_owner_count = 0 then
      raise exception 'An organization must retain at least one active owner.';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger organization_members_protect_last_owner
  before update or delete on public.organization_members
  for each row execute procedure public.protect_last_organization_owner();

revoke all on function public.is_active_admin(uuid) from public, anon;
revoke all on function public.organization_member_role_for(text, uuid) from public, anon;
revoke all on function public.can_manage_organization(text, public.organization_member_role[]) from public, anon;
grant execute on function public.is_active_admin(uuid) to authenticated;
grant execute on function public.organization_member_role_for(text, uuid) to authenticated;
grant execute on function public.can_manage_organization(text, public.organization_member_role[]) to authenticated;
