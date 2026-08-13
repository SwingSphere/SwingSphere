-- SwingSphere security/performance cleanup.
--
-- This migration addresses current Supabase advisor findings without weakening
-- authorization boundaries or exposing raw RPC-only tables. It intentionally
-- leaves SECURITY DEFINER warnings for public/admin/member RPCs whose purpose is
-- to provide a narrow trusted boundary over otherwise non-readable tables.

-- ---------------------------------------------------------------------------
-- 1. Foreign-key coverage
-- ---------------------------------------------------------------------------
-- PostgreSQL does not automatically index referencing FK columns. These indexes
-- protect parent UPDATE/DELETE paths and support relationship joins as data grows.

create index if not exists claim_verification_actions_actor_user_id_idx on public.claim_verification_actions (actor_user_id);
create index if not exists club_brands_created_by_idx on public.club_brands (created_by);
create index if not exists club_brands_operator_organization_id_idx on public.club_brands (operator_organization_id);
create index if not exists cruise_sailings_created_by_idx on public.cruise_sailings (created_by);
create index if not exists cruise_series_created_by_idx on public.cruise_series (created_by);
create index if not exists cruise_series_operator_organization_id_idx on public.cruise_series (operator_organization_id);
create index if not exists event_occurrences_posted_by_user_id_idx on public.event_occurrences (posted_by_user_id);
create index if not exists event_series_default_venue_id_idx on public.event_series (default_venue_id);
create index if not exists event_series_posted_by_user_id_idx on public.event_series (posted_by_user_id);
create index if not exists feedback_moderation_actions_actor_user_id_idx on public.feedback_moderation_actions (actor_user_id);
create index if not exists feedback_moderation_actions_feedback_submission_id_idx on public.feedback_moderation_actions (feedback_submission_id);
create index if not exists feedback_safety_reports_assigned_to_idx on public.feedback_safety_reports (assigned_to);
create index if not exists feedback_safety_reports_club_id_idx on public.feedback_safety_reports (club_id);
create index if not exists feedback_safety_reports_event_id_idx on public.feedback_safety_reports (event_id);
create index if not exists feedback_safety_reports_organization_id_idx on public.feedback_safety_reports (organization_id);
create index if not exists feedback_safety_reports_related_event_id_idx on public.feedback_safety_reports (related_event_id);
create index if not exists feedback_safety_reports_related_venue_id_idx on public.feedback_safety_reports (related_venue_id);
create index if not exists feedback_submissions_related_event_id_idx on public.feedback_submissions (related_event_id);
create index if not exists feedback_submissions_related_venue_id_idx on public.feedback_submissions (related_venue_id);
create index if not exists feedback_submissions_signal_registry_version_idx on public.feedback_submissions (signal_registry_version);
create index if not exists feedback_target_clubs_organization_id_idx on public.feedback_target_clubs (organization_id);
create index if not exists feedback_target_clubs_primary_venue_id_idx on public.feedback_target_clubs (primary_venue_id);
create index if not exists feedback_target_events_club_id_idx on public.feedback_target_events (club_id);
create index if not exists feedback_target_events_organization_id_idx on public.feedback_target_events (organization_id);
create index if not exists feedback_target_events_venue_id_idx on public.feedback_target_events (venue_id);
create index if not exists feedback_written_experiences_approved_revision_id_idx on public.feedback_written_experiences (approved_revision_id);
create index if not exists feedback_written_experiences_current_revision_id_idx on public.feedback_written_experiences (current_revision_id);
create index if not exists feedback_written_experiences_moderated_by_idx on public.feedback_written_experiences (moderated_by);
create index if not exists feedback_written_revisions_moderated_by_idx on public.feedback_written_revisions (moderated_by);
create index if not exists feedback_written_revisions_submitted_by_idx on public.feedback_written_revisions (submitted_by);
create index if not exists listing_claims_reviewed_by_idx on public.listing_claims (reviewed_by);
create index if not exists listings_last_moderated_by_idx on public.listings (last_moderated_by);
create index if not exists organization_badges_awarded_by_idx on public.organization_badges (awarded_by);
create index if not exists outbound_click_daily_unique_sessions_rollup_key_idx on public.outbound_click_daily_unique_sessions (rollup_key);
create index if not exists outbound_click_daily_unique_users_rollup_key_idx on public.outbound_click_daily_unique_users (rollup_key);
create index if not exists outbound_click_events_user_id_idx on public.outbound_click_events (user_id);
create index if not exists profile_associations_recipient_user_id_idx on public.profile_associations (recipient_user_id);
create index if not exists resorts_created_by_idx on public.resorts (created_by);
create index if not exists resorts_operator_organization_id_idx on public.resorts (operator_organization_id);
create index if not exists saved_collection_items_saved_entity_id_idx on public.saved_collection_items (saved_entity_id);
create index if not exists tags_created_by_idx on public.tags (created_by);
create index if not exists tags_updated_by_idx on public.tags (updated_by);
create index if not exists user_badges_awarded_by_idx on public.user_badges (awarded_by);
create index if not exists user_badges_revoked_by_idx on public.user_badges (revoked_by);
create index if not exists venues_created_by_idx on public.venues (created_by);

-- The unique constraint on (feedback_submission_id, revision_number) can satisfy
-- equality lookups and reverse revision ordering with a backward index scan.
-- Keep the constraint-backed index and remove the redundant DESC copy.
drop index if exists public.feedback_written_revisions_idx;

-- ---------------------------------------------------------------------------
-- 2. RLS init-plan fixes
-- ---------------------------------------------------------------------------
-- Wrap row-invariant auth.uid() calls in SELECT so PostgreSQL can initialize the
-- value once per statement rather than recalculating it for every candidate row.

alter policy "Members create their own profile privacy"
  on public.profile_privacy_settings
  with check (user_id = (select auth.uid()));

alter policy "Members read their own profile privacy"
  on public.profile_privacy_settings
  using (
    user_id = (select auth.uid())
    or private.is_active_admin((select auth.uid()))
  );

alter policy "Members update their own profile privacy"
  on public.profile_privacy_settings
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "Members manage their own saved entities"
  on public.saved_entities
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "Members manage their own saved collections"
  on public.saved_collections
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "Members manage items in their own collections"
  on public.saved_collection_items
  using (
    exists (
      select 1
      from public.saved_collections collection
      where collection.id = saved_collection_items.collection_id
        and collection.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.saved_collections collection
      join public.saved_entities saved
        on saved.id = saved_collection_items.saved_entity_id
      where collection.id = saved_collection_items.collection_id
        and collection.user_id = (select auth.uid())
        and saved.user_id = (select auth.uid())
    )
  );

alter policy "Association participants can read"
  on public.profile_associations
  using (
    requester_user_id = (select auth.uid())
    or recipient_user_id = (select auth.uid())
  );

alter policy "Administrators can read claim verification actions"
  on public.claim_verification_actions
  using (private.is_active_admin((select auth.uid())));

alter policy "Claimants can read their own listing claims"
  on public.listing_claims
  using (
    claimant_user_id = (select auth.uid())
    or private.is_active_admin((select auth.uid()))
  );

alter policy "Members can read their own badge awards"
  on public.user_badges
  using (
    user_id = (select auth.uid())
    or private.is_active_admin((select auth.uid()))
  );

alter policy "Members can manage their own badge presentation"
  on public.user_badges
  using (
    user_id = (select auth.uid())
    or private.is_active_admin((select auth.uid()))
  )
  with check (
    user_id = (select auth.uid())
    or private.is_active_admin((select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 3. Consolidate overlapping permissive SELECT policies
-- ---------------------------------------------------------------------------
-- Public visibility and privileged visibility remain OR-equivalent to the old
-- pair of permissive policies, but PostgreSQL evaluates one policy per SELECT.

-- Badges
drop policy if exists "Admins can read all badge definitions" on public.badges;
alter policy "Public can read visible badge catalog"
  on public.badges
  to anon, authenticated
  using (
    (is_active and is_catalog_visible and not is_secret)
    or private.is_active_admin((select auth.uid()))
  );

-- Club brands
drop policy if exists "Admins can read all club brands" on public.club_brands;
alter policy "Public can read approved club brands"
  on public.club_brands
  to anon, authenticated
  using (
    status = 'approved'
    or private.is_active_admin((select auth.uid()))
  );

-- Cruise sailings
drop policy if exists "Admins can read all cruise sailings" on public.cruise_sailings;
alter policy "Approved cruise sailings are public"
  on public.cruise_sailings
  to anon, authenticated
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
drop policy if exists "Admins can read all cruise series" on public.cruise_series;
alter policy "Approved cruise series are public"
  on public.cruise_series
  to anon, authenticated
  using (
    status = 'approved'
    or private.is_active_admin((select auth.uid()))
    or (
      operator_organization_id is not null
      and private.can_manage_organization(operator_organization_id)
    )
  );

-- Event series
drop policy if exists "Admins can read all event series" on public.event_series;
alter policy "Public can read approved event series"
  on public.event_series
  to anon, authenticated
  using (
    status = any (array['approved'::text, 'active'::text])
    or private.is_active_admin((select auth.uid()))
  );

-- Organization badges
drop policy if exists "Organization managers can read their organization badge awards" on public.organization_badges;
alter policy "Public can read public organization badge awards"
  on public.organization_badges
  to anon, authenticated
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

alter policy "Organization managers can manage badge presentation"
  on public.organization_badges
  using (
    private.is_active_admin((select auth.uid()))
    or private.can_manage_organization(organization_id)
  )
  with check (
    private.is_active_admin((select auth.uid()))
    or private.can_manage_organization(organization_id)
  );

-- Organization-to-organization relationships
drop policy if exists "Administrators can read all organization relationships" on public.organization_relationships;
alter policy "Public can read relationships between public organizations"
  on public.organization_relationships
  to anon, authenticated
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

-- Organization/venue relationships. The old ALL policy also participated in
-- SELECT and generated an extra permissive path. Split writes by command.
drop policy if exists "Organization teams can read venue relationships" on public.organization_venue_relationships;
drop policy if exists "Organization teams manage venue relationships" on public.organization_venue_relationships;

alter policy "Public can read public organization venue relationships"
  on public.organization_venue_relationships
  to anon, authenticated
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

create policy "Organization teams create venue relationships"
  on public.organization_venue_relationships
  for insert
  to authenticated
  with check (
    private.is_active_admin((select auth.uid()))
    or private.can_manage_organization(
      organization_id,
      array['owner','manager']::public.organization_member_role[]
    )
  );

create policy "Organization teams update venue relationships"
  on public.organization_venue_relationships
  for update
  to authenticated
  using (
    private.is_active_admin((select auth.uid()))
    or private.can_manage_organization(
      organization_id,
      array['owner','manager']::public.organization_member_role[]
    )
  )
  with check (
    private.is_active_admin((select auth.uid()))
    or private.can_manage_organization(
      organization_id,
      array['owner','manager']::public.organization_member_role[]
    )
  );

create policy "Organization teams delete venue relationships"
  on public.organization_venue_relationships
  for delete
  to authenticated
  using (
    private.is_active_admin((select auth.uid()))
    or private.can_manage_organization(
      organization_id,
      array['owner','manager']::public.organization_member_role[]
    )
  );

-- Organizations
drop policy if exists "Organization team can read organizations" on public.organizations;
alter policy "Public can read active organizations"
  on public.organizations
  to anon, authenticated
  using (
    status = any (array['approved'::text, 'active'::text])
    or private.can_manage_organization(id)
  );

-- Profiles
drop policy if exists "Admins can read profiles" on public.profiles;
drop policy if exists "Members can read their own profile" on public.profiles;
create policy "Members and admins can read profiles"
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or private.is_active_admin((select auth.uid()))
  );

-- Resorts
drop policy if exists "Admins can read all resorts" on public.resorts;
alter policy "Approved resorts are public"
  on public.resorts
  to anon, authenticated
  using (
    status = 'approved'
    or private.is_active_admin((select auth.uid()))
    or (
      operator_organization_id is not null
      and private.can_manage_organization(operator_organization_id)
    )
  );

-- Taxonomy
drop policy if exists "Active admins can read all tag categories" on public.tag_categories;
alter policy "Public can read active tag categories"
  on public.tag_categories
  to anon, authenticated
  using (
    is_active
    or private.is_active_admin((select auth.uid()))
  );

drop policy if exists "Active admins can read all tags" on public.tags;
alter policy "Public can read visible active tags"
  on public.tags
  to anon, authenticated
  using (
    (is_visible and not is_deprecated)
    or private.is_active_admin((select auth.uid()))
  );

-- Venues
drop policy if exists "Admins can read all venues" on public.venues;
alter policy "Public can read discoverable venues"
  on public.venues
  to anon, authenticated
  using (
    (
      status = any (array['approved'::text, 'active'::text])
      and visibility = any (array['public_exact'::text, 'public_approximate'::text])
    )
    or private.can_manage_venue(id)
  );

-- ---------------------------------------------------------------------------
-- 4. SECURITY DEFINER exposure review
-- ---------------------------------------------------------------------------
-- These four RPCs require an authenticated caller by design. A later grant had
-- re-added anon EXECUTE, which needlessly exposed endpoints that immediately
-- reject anonymous calls. Keep authenticated/service_role only.

revoke execute on function public.feedback_private_signal_summary(public.feedback_target_type, text) from anon;
revoke execute on function public.request_profile_association(text, public.profile_association_kind, text) from anon;
revoke execute on function public.respond_profile_association(uuid, public.profile_association_status) from anon;
revoke execute on function public.remove_profile_association(uuid) from anon;

-- Trigger functions are not API endpoints. PostgreSQL trigger execution does not
-- require browser roles to hold EXECUTE, so remove inherited/default grants.
revoke all on function private.notify_listing_change() from public, anon, authenticated;
revoke all on function private.notify_listing_claim_change() from public, anon, authenticated;
revoke all on function private.notify_user_badge_change() from public, anon, authenticated;

-- This compatibility view is not browser-readable, but make its execution model
-- explicit so a future grant cannot accidentally bypass underlying RLS.
alter view public.admin_notifications set (security_invoker = true);
