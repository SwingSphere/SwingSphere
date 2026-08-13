-- Correct the read-policy consolidation from 20260809043000.
--
-- Anonymous and authenticated readers must not share a policy that invokes
-- private authorization helpers: anon intentionally has no EXECUTE privilege on
-- those helpers. Keep one anon-only public visibility policy and one
-- authenticated-only combined visibility policy. The role sets do not overlap,
-- so Supabase's multiple-permissive-policy advisor stays satisfied.

-- Badges
alter policy "Public can read visible badge catalog"
  on public.badges
  to anon
  using (is_active and is_catalog_visible and not is_secret);

create policy "Authenticated can read permitted badge definitions"
  on public.badges
  for select
  to authenticated
  using (
    (is_active and is_catalog_visible and not is_secret)
    or private.is_active_admin((select auth.uid()))
  );

-- Club brands
alter policy "Public can read approved club brands"
  on public.club_brands
  to anon
  using (status = 'approved');

create policy "Authenticated can read permitted club brands"
  on public.club_brands
  for select
  to authenticated
  using (
    status = 'approved'
    or private.is_active_admin((select auth.uid()))
  );

-- Cruise sailings
alter policy "Approved cruise sailings are public"
  on public.cruise_sailings
  to anon
  using (status = 'approved');

create policy "Authenticated can read permitted cruise sailings"
  on public.cruise_sailings
  for select
  to authenticated
  using (
    status = 'approved'
    or private.is_active_admin((select auth.uid()))
    or exists (
      select 1
      from public.cruise_series series
      where series.id = cruise_sailings.cruise_series_id
        and series.operator_organization_id is not null
        and private.can_manage_organization(series.operator_organization_id)
    )
  );

-- Cruise series
alter policy "Approved cruise series are public"
  on public.cruise_series
  to anon
  using (status = 'approved');

create policy "Authenticated can read permitted cruise series"
  on public.cruise_series
  for select
  to authenticated
  using (
    status = 'approved'
    or private.is_active_admin((select auth.uid()))
    or (
      operator_organization_id is not null
      and private.can_manage_organization(operator_organization_id)
    )
  );

-- Event series
alter policy "Public can read approved event series"
  on public.event_series
  to anon
  using (status = any (array['approved'::text, 'active'::text]));

create policy "Authenticated can read permitted event series"
  on public.event_series
  for select
  to authenticated
  using (
    status = any (array['approved'::text, 'active'::text])
    or private.is_active_admin((select auth.uid()))
  );

-- Organization badges
alter policy "Public can read public organization badge awards"
  on public.organization_badges
  to anon
  using (
    is_public
    and exists (
      select 1
      from public.organizations organization
      where organization.id = organization_badges.organization_id
        and organization.status = any (array['approved'::text, 'active'::text])
    )
  );

create policy "Authenticated can read permitted organization badge awards"
  on public.organization_badges
  for select
  to authenticated
  using (
    (
      is_public
      and exists (
        select 1
        from public.organizations organization
        where organization.id = organization_badges.organization_id
          and organization.status = any (array['approved'::text, 'active'::text])
      )
    )
    or private.is_active_admin((select auth.uid()))
    or private.can_manage_organization(organization_id)
  );

-- Organization-to-organization relationships
alter policy "Public can read relationships between public organizations"
  on public.organization_relationships
  to anon
  using (
    exists (
      select 1
      from public.organizations source_org
      where source_org.id = organization_relationships.source_organization_id
        and source_org.status = any (array['approved'::text, 'active'::text])
    )
    and exists (
      select 1
      from public.organizations target_org
      where target_org.id = organization_relationships.target_organization_id
        and target_org.status = any (array['approved'::text, 'active'::text])
    )
  );

create policy "Authenticated can read permitted organization relationships"
  on public.organization_relationships
  for select
  to authenticated
  using (
    (
      exists (
        select 1
        from public.organizations source_org
        where source_org.id = organization_relationships.source_organization_id
          and source_org.status = any (array['approved'::text, 'active'::text])
      )
      and exists (
        select 1
        from public.organizations target_org
        where target_org.id = organization_relationships.target_organization_id
          and target_org.status = any (array['approved'::text, 'active'::text])
      )
    )
    or private.is_active_admin((select auth.uid()))
  );

-- Organization/venue relationships
alter policy "Public can read public organization venue relationships"
  on public.organization_venue_relationships
  to anon
  using (
    exists (
      select 1
      from public.organizations organization
      where organization.id = organization_venue_relationships.organization_id
        and organization.status = any (array['approved'::text, 'active'::text])
    )
    and exists (
      select 1
      from public.venues venue
      where venue.id = organization_venue_relationships.venue_id
        and venue.status = any (array['approved'::text, 'active'::text])
        and venue.visibility = any (array['public_exact'::text, 'public_approximate'::text])
    )
  );

create policy "Authenticated can read permitted organization venue relationships"
  on public.organization_venue_relationships
  for select
  to authenticated
  using (
    (
      exists (
        select 1
        from public.organizations organization
        where organization.id = organization_venue_relationships.organization_id
          and organization.status = any (array['approved'::text, 'active'::text])
      )
      and exists (
        select 1
        from public.venues venue
        where venue.id = organization_venue_relationships.venue_id
          and venue.status = any (array['approved'::text, 'active'::text])
          and venue.visibility = any (array['public_exact'::text, 'public_approximate'::text])
      )
    )
    or private.is_active_admin((select auth.uid()))
    or private.can_manage_organization(organization_id)
  );

-- Organizations
alter policy "Public can read active organizations"
  on public.organizations
  to anon
  using (status = any (array['approved'::text, 'active'::text]));

create policy "Authenticated can read permitted organizations"
  on public.organizations
  for select
  to authenticated
  using (
    status = any (array['approved'::text, 'active'::text])
    or private.can_manage_organization(id)
  );

-- Resorts
alter policy "Approved resorts are public"
  on public.resorts
  to anon
  using (status = 'approved');

create policy "Authenticated can read permitted resorts"
  on public.resorts
  for select
  to authenticated
  using (
    status = 'approved'
    or private.is_active_admin((select auth.uid()))
    or (
      operator_organization_id is not null
      and private.can_manage_organization(operator_organization_id)
    )
  );

-- Taxonomy categories
alter policy "Public can read active tag categories"
  on public.tag_categories
  to anon
  using (is_active);

create policy "Authenticated can read permitted tag categories"
  on public.tag_categories
  for select
  to authenticated
  using (
    is_active
    or private.is_active_admin((select auth.uid()))
  );

-- Tags
alter policy "Public can read visible active tags"
  on public.tags
  to anon
  using (is_visible and not is_deprecated);

create policy "Authenticated can read permitted tags"
  on public.tags
  for select
  to authenticated
  using (
    (is_visible and not is_deprecated)
    or private.is_active_admin((select auth.uid()))
  );

-- Venues
alter policy "Public can read discoverable venues"
  on public.venues
  to anon
  using (
    status = any (array['approved'::text, 'active'::text])
    and visibility = any (array['public_exact'::text, 'public_approximate'::text])
  );

create policy "Authenticated can read permitted venues"
  on public.venues
  for select
  to authenticated
  using (
    (
      status = any (array['approved'::text, 'active'::text])
      and visibility = any (array['public_exact'::text, 'public_approximate'::text])
    )
    or private.can_manage_venue(id)
  );
