-- Complete the listing-claim -> organization membership -> managed authoring workflow.

alter table public.organization_members
  add column if not exists granted_by_claim_id uuid references public.listing_claims(id) on delete set null;

create index if not exists organization_members_granted_by_claim_idx
  on public.organization_members(granted_by_claim_id)
  where granted_by_claim_id is not null;

alter table public.listing_moderation_actions
  drop constraint if exists listing_moderation_actions_action_check;

alter table public.listing_moderation_actions
  add constraint listing_moderation_actions_action_check
  check (action in (
    'submit', 'update', 'withdraw', 'approve', 'flag', 'reject', 'archive', 'restore',
    'admin_save', 'legacy_import', 'managed_update'
  ));

-- Admin-driven revocation must be able to remove the final claim-granted owner.
-- Ordinary owner/manager writes still retain the existing final-owner protection.
create or replace function private.protect_last_organization_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_owner_count integer;
begin
  if private.is_active_admin(auth.uid()) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

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

-- Verified organization members can edit approved club/event content directly.
-- Ownership links themselves stay fixed here; changing canonical ownership remains
-- an admin/relationship-management operation.
create or replace function public.update_managed_listing(p_listing_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_before public.listings;
  v_name text;
  v_payload jsonb;
  v_result jsonb;
  v_venue_id text;
  v_brand_id text;
  v_series_id text;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not exists (select 1 from public.profiles where id = v_user and status = 'active') then
    raise exception 'An active SwingSphere account is required.';
  end if;

  select * into v_before
  from public.listings
  where id = p_listing_id and lifecycle_state = 'active'
  for update;

  if v_before.id is null then raise exception 'Listing not found.'; end if;
  if v_before.owner_organization_id is null
     or not private.can_manage_organization(
       v_before.owner_organization_id,
       array['owner','manager','editor']::public.organization_member_role[]
     ) then
    raise exception 'Organization management access is required.';
  end if;

  v_name := trim(coalesce(p_payload ->> 'name', v_before.name));
  if v_name = '' then raise exception 'Listing name is required.'; end if;

  v_venue_id := v_before.venue_id;
  if v_before.listing_type = 'event' then
    if p_payload ? 'venueId' then
      select id into v_venue_id from public.venues
      where id = nullif(trim(coalesce(p_payload ->> 'venueId', '')), '');
    end if;
  else
    if p_payload ? 'primaryVenueId' then
      select id into v_venue_id from public.venues
      where id = nullif(trim(coalesce(p_payload ->> 'primaryVenueId', '')), '');
    end if;
  end if;

  v_brand_id := v_before.club_brand_id;
  if v_before.listing_type = 'club' and p_payload ? 'clubBrandId' then
    select id into v_brand_id from public.club_brands
    where id = nullif(trim(coalesce(p_payload ->> 'clubBrandId', '')), '');
  end if;

  v_series_id := v_before.event_series_id;
  if v_before.listing_type = 'event' and p_payload ? 'eventSeriesId' then
    select id into v_series_id from public.event_series
    where id = nullif(trim(coalesce(p_payload ->> 'eventSeriesId', '')), '');
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object(
      'id', v_before.id,
      'type', v_before.listing_type,
      'name', v_name,
      'status', v_before.status,
      'postedByUserId', coalesce(v_before.submitter_ref, v_before.submitted_by::text)
    );

  if v_before.listing_type = 'event' then
    v_payload := (v_payload - 'ownerOrganizationId')
      || jsonb_build_object('organizerOrganizationId', v_before.owner_organization_id);
  else
    v_payload := (v_payload - 'organizerOrganizationId')
      || jsonb_build_object('ownerOrganizationId', v_before.owner_organization_id);
  end if;

  update public.listings
  set name = v_name,
      payload = v_payload,
      venue_id = v_venue_id,
      club_brand_id = v_brand_id,
      event_series_id = v_series_id,
      provenance = case when provenance = 'legacy' then 'owner' else provenance end
  where id = v_before.id;

  insert into public.listing_moderation_actions (
    listing_id, actor_user_id, action,
    before_status, after_status, before_lifecycle_state, after_lifecycle_state,
    before_payload, after_payload
  ) values (
    v_before.id, v_user, 'managed_update',
    v_before.status, v_before.status, v_before.lifecycle_state, v_before.lifecycle_state,
    v_before.payload, v_payload
  );

  select private.listing_payload(listing, false)
  into v_result
  from public.listings listing
  where listing.id = v_before.id;

  return v_result;
end;
$$;

revoke all on function public.update_managed_listing(text, jsonb) from public, anon, authenticated;
grant execute on function public.update_managed_listing(text, jsonb) to authenticated;

create or replace function public.save_listing(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := trim(coalesce(p_payload ->> 'id', ''));
  v_existing public.listings;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;

  if private.is_active_admin(auth.uid()) then
    return public.admin_save_listing(p_payload);
  end if;

  if v_id <> '' then
    select * into v_existing from public.listings where id = v_id;

    if v_existing.id is not null
       and v_existing.submitted_by = auth.uid()
       and v_existing.lifecycle_state = 'active'
       and v_existing.status = 'pending_approval' then
      return public.update_my_pending_listing(v_id, p_payload);
    end if;

    if v_existing.id is not null
       and v_existing.lifecycle_state = 'active'
       and v_existing.owner_organization_id is not null
       and private.can_manage_organization(
         v_existing.owner_organization_id,
         array['owner','manager','editor']::public.organization_member_role[]
       ) then
      return public.update_managed_listing(v_id, p_payload);
    end if;
  end if;

  return public.submit_listing(p_payload);
end;
$$;

revoke all on function public.save_listing(jsonb) from public, anon;
grant execute on function public.save_listing(jsonb) to authenticated;

-- Verification now grants the approved organization role atomically. If a club
-- or event has never had a canonical organization, verification creates one and
-- links the listing so future events/media/editing share one authority source.
create or replace function public.admin_review_listing_claim(
  p_claim_id uuid,
  p_status text,
  p_verification_method text default null,
  p_verification_summary text default null,
  p_decision_reason text default null,
  p_public_note text default null,
  p_private_note text default null,
  p_evidence_received_at timestamptz default null,
  p_evidence_deleted_at timestamptz default null,
  p_expires_at timestamptz default null
)
returns public.listing_claims
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_before public.listing_claims;
  v_after public.listing_claims;
  v_action text;
  v_org_id text;
  v_entity_name text;
  v_slug text;
  v_existing_member public.organization_members;
  v_requested_role public.organization_member_role;
begin
  if not private.is_active_admin(v_admin) then
    raise exception 'Administrator access required';
  end if;

  if p_status not in ('information_requested', 'under_review', 'verified', 'denied', 'revoked', 'superseded') then
    raise exception 'Unsupported claim status';
  end if;

  select * into v_before from public.listing_claims where id = p_claim_id for update;
  if v_before.id is null then raise exception 'Listing claim not found'; end if;

  if v_before.status = 'verified' and p_status not in ('revoked', 'superseded') then
    raise exception 'A verified claim can only be revoked or superseded';
  end if;
  if v_before.status in ('withdrawn', 'denied', 'revoked', 'superseded') then
    raise exception 'Claim is already in a terminal state';
  end if;
  if v_before.status in ('pending', 'information_requested', 'under_review') and p_status = 'revoked' then
    raise exception 'Only a verified claim can be revoked';
  end if;
  if p_status = 'verified' and (
    p_verification_method is null
    or char_length(btrim(coalesce(p_verification_summary, ''))) < 10
  ) then
    raise exception 'Verified claims require a method and verification summary';
  end if;
  if p_status in ('information_requested', 'denied', 'revoked')
     and char_length(btrim(coalesce(p_decision_reason, ''))) < 5 then
    raise exception 'This claim status requires a decision reason';
  end if;
  if p_evidence_deleted_at is not null
     and coalesce(p_evidence_received_at, v_before.evidence_received_at) is null then
    raise exception 'Evidence receipt must be recorded before deletion';
  end if;
  if p_evidence_deleted_at is not null
     and p_evidence_deleted_at < coalesce(p_evidence_received_at, v_before.evidence_received_at) then
    raise exception 'Evidence deletion cannot precede receipt';
  end if;

  v_org_id := nullif(btrim(coalesce(v_before.organization_id, '')), '');
  if v_org_id is not null and not exists (select 1 from public.organizations where id = v_org_id) then
    v_org_id := null;
  end if;

  if p_status = 'verified' then
    if v_before.entity_type in ('club', 'event') then
      select l.owner_organization_id, l.name
      into v_org_id, v_entity_name
      from public.listings l
      where l.id = v_before.entity_id;
    elsif v_before.entity_type = 'organization' then
      select o.id, o.name into v_org_id, v_entity_name
      from public.organizations o where o.id = v_before.entity_id;
    elsif v_before.entity_type = 'event_series' then
      select s.organizer_organization_id, s.name into v_org_id, v_entity_name
      from public.event_series s where s.id = v_before.entity_id;
    elsif v_before.entity_type = 'resort' then
      select r.operator_organization_id, r.name into v_org_id, v_entity_name
      from public.resorts r where r.id = v_before.entity_id;
    elsif v_before.entity_type = 'cruise_series' then
      select c.operator_organization_id, c.name into v_org_id, v_entity_name
      from public.cruise_series c where c.id = v_before.entity_id;
    end if;

    v_org_id := coalesce(v_org_id, nullif(btrim(coalesce(v_before.organization_id, '')), ''));

    if v_org_id is null and v_before.entity_type in ('club', 'event') then
      if v_entity_name is null then
        select l.name into v_entity_name from public.listings l where l.id = v_before.entity_id;
      end if;
      if v_entity_name is null then raise exception 'Claimed listing no longer exists'; end if;

      v_org_id := 'org-claim-' || replace(p_claim_id::text, '-', '');
      v_slug := trim(both '-' from regexp_replace(lower(v_entity_name), '[^a-z0-9]+', '-', 'g'));
      if char_length(v_slug) < 2 then v_slug := 'organization'; end if;
      v_slug := left(v_slug, 66) || '-' || left(replace(p_claim_id::text, '-', ''), 8);

      insert into public.organizations(
        id, name, slug, display_types, status, created_by
      ) values (
        v_org_id,
        v_entity_name,
        v_slug,
        case when v_before.entity_type = 'club'
          then array['club','host']::text[]
          else array['host','promoter']::text[] end,
        'active',
        v_before.claimant_user_id
      );
    end if;

    if v_org_id is null or not exists (select 1 from public.organizations where id = v_org_id) then
      raise exception 'A canonical organization is required before this claim can be verified';
    end if;

    if v_before.entity_type in ('club', 'event') then
      update public.listings
      set owner_organization_id = v_org_id,
          provenance = case when provenance = 'legacy' then 'owner' else provenance end,
          payload = case when listing_type = 'event'
            then (payload - 'ownerOrganizationId') || jsonb_build_object('organizerOrganizationId', v_org_id)
            else (payload - 'organizerOrganizationId') || jsonb_build_object('ownerOrganizationId', v_org_id)
          end
      where id = v_before.entity_id;
    end if;

    v_requested_role := v_before.requested_role::public.organization_member_role;
    select * into v_existing_member
    from public.organization_members
    where organization_id = v_org_id and user_id = v_before.claimant_user_id
    for update;

    if v_existing_member.id is null then
      insert into public.organization_members(
        organization_id, user_id, role, status, invited_by, granted_by_claim_id
      ) values (
        v_org_id, v_before.claimant_user_id, v_requested_role, 'active', v_admin, p_claim_id
      );
    else
      update public.organization_members
      set status = 'active',
          role = case
            when v_existing_member.role = 'owner' then 'owner'::public.organization_member_role
            when v_requested_role = 'owner' then 'owner'::public.organization_member_role
            when v_existing_member.role = 'manager' then 'manager'::public.organization_member_role
            when v_requested_role = 'manager' then 'manager'::public.organization_member_role
            else 'editor'::public.organization_member_role
          end,
          invited_by = coalesce(v_existing_member.invited_by, v_admin),
          granted_by_claim_id = coalesce(v_existing_member.granted_by_claim_id, p_claim_id)
      where id = v_existing_member.id;
    end if;

    update public.profiles
    set role = 'promoter'::public.account_role
    where id = v_before.claimant_user_id
      and role = 'user'::public.account_role;
  end if;

  if p_status in ('revoked', 'superseded') and v_before.organization_id is not null then
    update public.organization_members
    set status = 'suspended'
    where organization_id = v_before.organization_id
      and user_id = v_before.claimant_user_id
      and granted_by_claim_id = p_claim_id;

    if not exists (
      select 1 from public.organization_members m
      where m.user_id = v_before.claimant_user_id and m.status = 'active'
    ) then
      update public.profiles
      set role = 'user'::public.account_role
      where id = v_before.claimant_user_id
        and role = 'promoter'::public.account_role;
    end if;
  end if;

  update public.listing_claims
  set status = p_status,
      organization_id = coalesce(v_org_id, organization_id),
      verification_method = coalesce(p_verification_method, verification_method),
      verification_summary = coalesce(nullif(btrim(coalesce(p_verification_summary, '')), ''), verification_summary),
      decision_reason = coalesce(nullif(btrim(coalesce(p_decision_reason, '')), ''), decision_reason),
      evidence_received_at = coalesce(p_evidence_received_at, evidence_received_at),
      evidence_deleted_at = coalesce(p_evidence_deleted_at, evidence_deleted_at),
      reviewed_at = case when p_status in ('verified', 'denied', 'revoked', 'superseded') then now() else reviewed_at end,
      reviewed_by = v_admin,
      expires_at = coalesce(p_expires_at, expires_at),
      revoked_at = case when p_status = 'revoked' then now() else revoked_at end
  where id = p_claim_id
  returning * into v_after;

  v_action := case p_status
    when 'information_requested' then 'information_requested'
    when 'under_review' then 'review_started'
    when 'verified' then 'claim_verified'
    when 'denied' then 'claim_denied'
    when 'revoked' then 'claim_revoked'
    else 'claim_superseded'
  end;

  insert into public.claim_verification_actions(
    claim_id, action, actor_user_id, verification_method, public_note, private_note
  ) values (
    p_claim_id, v_action, v_admin, p_verification_method,
    nullif(btrim(coalesce(p_public_note, '')), ''),
    nullif(btrim(coalesce(p_private_note, '')), '')
  );

  if p_evidence_received_at is not null and v_before.evidence_received_at is null then
    insert into public.claim_verification_actions(
      claim_id, action, actor_user_id, verification_method, private_note
    ) values (
      p_claim_id, 'evidence_received', v_admin, p_verification_method,
      'Temporary evidence receipt recorded. The underlying file is not stored in this schema.'
    );
  end if;

  if p_evidence_deleted_at is not null and v_before.evidence_deleted_at is null then
    insert into public.claim_verification_actions(
      claim_id, action, actor_user_id, verification_method, public_note
    ) values (
      p_claim_id, 'evidence_deleted', v_admin, p_verification_method,
      'Temporary verification evidence was deleted.'
    );
  end if;

  return v_after;
end;
$$;

revoke all on function public.admin_review_listing_claim(uuid, text, text, text, text, text, text, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_review_listing_claim(uuid, text, text, text, text, text, text, timestamptz, timestamptz, timestamptz) to authenticated;

drop policy if exists "Owners managers and admins can add members" on public.organization_members;
create policy "Owners managers and admins can add members"
on public.organization_members for insert
to authenticated
with check (
  private.is_active_admin(auth.uid())
  or private.can_manage_organization(organization_id, array['owner']::public.organization_member_role[])
  or (
    role = 'editor'::public.organization_member_role
    and private.can_manage_organization(organization_id, array['manager']::public.organization_member_role[])
  )
);

drop policy if exists "Owners managers and admins can update members" on public.organization_members;
create policy "Owners managers and admins can update members"
on public.organization_members for update
to authenticated
using (
  private.is_active_admin(auth.uid())
  or private.can_manage_organization(organization_id, array['owner']::public.organization_member_role[])
  or (
    role = 'editor'::public.organization_member_role
    and private.can_manage_organization(organization_id, array['manager']::public.organization_member_role[])
  )
)
with check (
  private.is_active_admin(auth.uid())
  or private.can_manage_organization(organization_id, array['owner']::public.organization_member_role[])
  or (
    role = 'editor'::public.organization_member_role
    and private.can_manage_organization(organization_id, array['manager']::public.organization_member_role[])
  )
);

drop policy if exists "Owners and admins can remove members" on public.organization_members;
create policy "Owners managers and admins can remove members"
on public.organization_members for delete
to authenticated
using (
  private.is_active_admin(auth.uid())
  or private.can_manage_organization(organization_id, array['owner']::public.organization_member_role[])
  or (
    role = 'editor'::public.organization_member_role
    and private.can_manage_organization(organization_id, array['manager']::public.organization_member_role[])
  )
);

create or replace function private.notify_listing_claim_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.claimant_user_id is not null then
      perform private.emit_notification_internal(
        new.claimant_user_id, 'claim_updates', 'claim.received',
        'Claim received',
        'Your listing claim was received and is waiting for verification.',
        null,
        jsonb_build_object('claimId',new.id,'entityType',new.entity_type,'entityId',new.entity_id,'status',new.status),
        'claim:' || new.id || ':received', true
      );
    end if;
    perform private.notify_active_admins_internal(
      'admin.claim_submitted', 'New listing claim',
      format('A new %s ownership/management claim is waiting for verification.', new.entity_type),
      '/admin', jsonb_build_object('claimId',new.id,'entityType',new.entity_type,'entityId',new.entity_id),
      'admin:claim:' || new.id || ':submitted'
    );
    return new;
  end if;

  if new.claimant_user_id is not null and old.status is distinct from new.status then
    perform private.emit_notification_internal(
      new.claimant_user_id, 'claim_updates', 'claim.' || new.status,
      case new.status
        when 'verified' then 'Listing access approved'
        when 'denied' then 'Claim not verified'
        when 'information_requested' then 'More information requested'
        when 'under_review' then 'Claim under review'
        when 'revoked' then 'Listing access revoked'
        when 'withdrawn' then 'Claim withdrawn'
        else 'Claim status updated'
      end,
      case new.status
        when 'verified' then 'Your listing claim has been verified and your approved management role is now active.'
        when 'denied' then 'Your listing claim could not be verified.'
        when 'information_requested' then 'SwingSphere needs more information to continue reviewing your listing claim.'
        when 'under_review' then 'Your listing claim is now under review.'
        when 'revoked' then 'Previously granted listing access has been revoked.'
        when 'withdrawn' then 'Your listing claim has been withdrawn.'
        else 'Your listing claim status changed.'
      end,
      case when new.status = 'verified' then '/host-dashboard' else null end,
      jsonb_build_object(
        'claimId',new.id,'entityType',new.entity_type,'entityId',new.entity_id,
        'organizationId',new.organization_id,'requestedRole',new.requested_role,'status',new.status
      ),
      'claim:' || new.id || ':' || new.status || ':' || new.updated_at::text,
      true
    );
  end if;
  return new;
end;
$$;
