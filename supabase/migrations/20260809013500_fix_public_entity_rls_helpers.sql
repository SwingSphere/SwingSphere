-- Public entity discovery policies must never invoke authenticated-only helper
-- functions. PostgreSQL does not guarantee OR-expression short-circuiting, so
-- a policy such as `status = 'approved' OR private.can_manage_organization(...)`
-- can raise permission denied for anonymous visitors even on approved rows.
-- Split public and privileged reads into separate policies.

-- Organizations --------------------------------------------------------------
drop policy if exists "Public can read active organizations" on public.organizations;
create policy "Public can read active organizations"
on public.organizations for select
to anon, authenticated
using (status in ('approved','active'));

drop policy if exists "Organization team can read organizations" on public.organizations;
create policy "Organization team can read organizations"
on public.organizations for select
to authenticated
using (private.can_manage_organization(id));

-- Venues ---------------------------------------------------------------------
drop policy if exists "Public can read discoverable venues" on public.venues;
create policy "Public can read discoverable venues"
on public.venues for select
to anon, authenticated
using (
  status in ('approved','active')
  and visibility in ('public_exact','public_approximate')
);

create or replace function private.can_manage_venue(
  check_venue_id text,
  allowed_roles public.organization_member_role[] default array['owner','manager','editor']::public.organization_member_role[],
  check_user uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_admin(check_user)
    or exists (
      select 1
      from public.organization_venue_relationships relationship
      join public.organization_members membership
        on membership.organization_id = relationship.organization_id
      where relationship.venue_id = check_venue_id
        and membership.user_id = check_user
        and membership.status = 'active'
        and membership.role = any(allowed_roles)
    );
$$;

revoke all on function private.can_manage_venue(text, public.organization_member_role[], uuid) from public, anon, authenticated;
grant execute on function private.can_manage_venue(text, public.organization_member_role[], uuid) to authenticated;

drop policy if exists "Admins can read all venues" on public.venues;
create policy "Admins can read all venues"
on public.venues for select
to authenticated
using (private.can_manage_venue(id));

drop policy if exists "Admins can update venues" on public.venues;
create policy "Admins can update venues"
on public.venues for update
to authenticated
using (private.can_manage_venue(id))
with check (private.can_manage_venue(id));

-- Organization/venue relationships ------------------------------------------
drop policy if exists "Public can read public organization venue relationships" on public.organization_venue_relationships;
create policy "Public can read public organization venue relationships"
on public.organization_venue_relationships for select
to anon, authenticated
using (
  exists (
    select 1
    from public.organizations organization
    where organization.id = organization_id
      and organization.status in ('approved','active')
  )
  and exists (
    select 1
    from public.venues venue
    where venue.id = venue_id
      and venue.status in ('approved','active')
      and venue.visibility in ('public_exact','public_approximate')
  )
);

drop policy if exists "Organization teams can read venue relationships" on public.organization_venue_relationships;
create policy "Organization teams can read venue relationships"
on public.organization_venue_relationships for select
to authenticated
using (
  private.is_active_admin((select auth.uid()))
  or private.can_manage_organization(organization_id)
);
