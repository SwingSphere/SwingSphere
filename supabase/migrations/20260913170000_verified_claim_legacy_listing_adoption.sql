-- Allow a verified claimant to adopt a legacy/dev catalog listing into the
-- canonical Supabase listing store without creating a duplicate submission.
-- This is the bridge for listings that can be browsed/claimed before they have
-- a row in public.listings.

alter table public.listing_moderation_actions
  drop constraint if exists listing_moderation_actions_action_check;

alter table public.listing_moderation_actions
  add constraint listing_moderation_actions_action_check
  check (action in (
    'submit', 'update', 'withdraw', 'approve', 'flag', 'reject', 'archive', 'restore',
    'admin_save', 'legacy_import', 'managed_update', 'claim_adopt'
  ));

create or replace function public.adopt_verified_claim_listing(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id text := btrim(coalesce(p_payload ->> 'id', ''));
  v_type text := lower(btrim(coalesce(p_payload ->> 'type', '')));
  v_name text := btrim(coalesce(p_payload ->> 'name', ''));
  v_claim public.listing_claims;
  v_existing public.listings;
  v_org_id text;
  v_slug text;
  v_requested_role public.organization_member_role;
  v_existing_member public.organization_members;
  v_venue_id text;
  v_brand_id text;
  v_series_id text;
  v_payload jsonb;
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_user and status = 'active'
  ) then
    raise exception 'An active SwingSphere account is required.';
  end if;

  if v_id = '' then raise exception 'Listing ID is required.'; end if;
  if char_length(v_id) > 160 then raise exception 'Listing ID is invalid.'; end if;
  if v_type not in ('club', 'event') then raise exception 'Listing type must be club or event.'; end if;
  if v_name = '' then raise exception 'Listing name is required.'; end if;

  select * into v_existing
  from public.listings
  where id = v_id
  for update;

  if v_existing.id is not null then
    if v_existing.submitted_by = v_user
       and v_existing.lifecycle_state = 'active'
       and v_existing.status = 'pending_approval' then
      return public.update_my_pending_listing(v_id, p_payload);
    end if;

    if v_existing.lifecycle_state = 'active'
       and v_existing.owner_organization_id is not null
       and private.can_manage_organization(
         v_existing.owner_organization_id,
         array['owner','manager','editor']::public.organization_member_role[]
       ) then
      return public.update_managed_listing(v_id, p_payload);
    end if;

    raise exception 'This listing already exists but is not manageable by this account.';
  end if;

  select * into v_claim
  from public.listing_claims claim
  where claim.claimant_user_id = v_user
    and claim.entity_type = v_type
    and claim.entity_id = v_id
    and claim.status = 'verified'
  order by claim.reviewed_at desc nulls last, claim.submitted_at desc
  limit 1;

  if v_claim.id is null then
    raise exception 'A verified listing claim is required before this legacy listing can be managed.';
  end if;

  v_org_id := nullif(btrim(coalesce(v_claim.organization_id, '')), '');
  if v_org_id is not null and not exists (
    select 1 from public.organizations where id = v_org_id
  ) then
    v_org_id := null;
  end if;

  if v_org_id is null then
    v_org_id := 'org-claim-' || replace(v_claim.id::text, '-', '');

    if not exists (select 1 from public.organizations where id = v_org_id) then
      v_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
      if char_length(v_slug) < 2 then v_slug := 'organization'; end if;
      v_slug := left(v_slug, 66) || '-' || left(replace(v_claim.id::text, '-', ''), 8);

      insert into public.organizations(
        id, name, slug, display_types, status, created_by
      ) values (
        v_org_id,
        v_name,
        v_slug,
        case when v_type = 'club'
          then array['club','host']::text[]
          else array['host','promoter']::text[] end,
        'active',
        v_user
      );
    end if;
  end if;

  update public.listing_claims
  set organization_id = v_org_id
  where id = v_claim.id
    and organization_id is distinct from v_org_id;

  v_requested_role := v_claim.requested_role::public.organization_member_role;

  select * into v_existing_member
  from public.organization_members
  where organization_id = v_org_id
    and user_id = v_user
  for update;

  if v_existing_member.id is null then
    insert into public.organization_members(
      organization_id, user_id, role, status, invited_by, granted_by_claim_id
    ) values (
      v_org_id,
      v_user,
      v_requested_role,
      'active',
      v_claim.reviewed_by,
      v_claim.id
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
        invited_by = coalesce(v_existing_member.invited_by, v_claim.reviewed_by),
        granted_by_claim_id = coalesce(v_existing_member.granted_by_claim_id, v_claim.id)
    where id = v_existing_member.id;
  end if;

  update public.profiles
  set role = 'promoter'::public.account_role
  where id = v_user
    and role = 'user'::public.account_role;

  if v_type = 'club' then
    select venue.id into v_venue_id
    from public.venues venue
    where venue.id = nullif(btrim(coalesce(p_payload ->> 'primaryVenueId', '')), '');

    select brand.id into v_brand_id
    from public.club_brands brand
    where brand.id = nullif(btrim(coalesce(p_payload ->> 'clubBrandId', '')), '');
  else
    select venue.id into v_venue_id
    from public.venues venue
    where venue.id = nullif(btrim(coalesce(p_payload ->> 'venueId', '')), '');

    select series.id into v_series_id
    from public.event_series series
    where series.id = nullif(btrim(coalesce(p_payload ->> 'eventSeriesId', '')), '');
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object(
      'id', v_id,
      'type', v_type,
      'name', v_name,
      'status', 'approved',
      'postedByUserId', v_user::text
    );

  if v_type = 'club' then
    v_payload := (v_payload - 'organizerOrganizationId')
      || jsonb_build_object('ownerOrganizationId', v_org_id);
  else
    v_payload := (v_payload - 'ownerOrganizationId')
      || jsonb_build_object('organizerOrganizationId', v_org_id);
  end if;

  insert into public.listings(
    id, listing_type, name, status, lifecycle_state, payload,
    submitted_by, submitter_ref, owner_organization_id,
    venue_id, club_brand_id, event_series_id,
    provenance, submitted_at, published_at,
    last_moderated_at, last_moderated_by
  ) values (
    v_id, v_type, v_name, 'approved', 'active', v_payload,
    v_user, v_user::text, v_org_id,
    v_venue_id, v_brand_id, v_series_id,
    case when v_type = 'club' then 'owner' else 'promoter' end,
    coalesce(v_claim.submitted_at, now()),
    now(),
    coalesce(v_claim.reviewed_at, now()),
    v_claim.reviewed_by
  );

  insert into public.listing_moderation_actions(
    listing_id, actor_user_id, action,
    after_status, after_lifecycle_state, after_payload,
    reason
  ) values (
    v_id, v_user, 'claim_adopt',
    'approved', 'active', v_payload,
    'Verified claimant adopted an existing legacy catalog listing into canonical management.'
  );

  perform public.feedback_register_target(v_type, v_id, v_name, 'active');

  select private.listing_payload(listing, false)
  into v_result
  from public.listings listing
  where listing.id = v_id;

  return v_result;
end;
$$;

revoke all on function public.adopt_verified_claim_listing(jsonb) from public, anon;
grant execute on function public.adopt_verified_claim_listing(jsonb) to authenticated;

-- Once this migration is present, save_listing can safely adopt a verified
-- legacy listing instead of ever falling through to submit_listing for that ID.
create or replace function public.save_listing(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := btrim(coalesce(p_payload ->> 'id', ''));
  v_type text := lower(btrim(coalesce(p_payload ->> 'type', '')));
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

    if v_existing.id is null
       and v_type in ('club', 'event')
       and exists (
         select 1
         from public.listing_claims claim
         where claim.claimant_user_id = auth.uid()
           and claim.entity_type = v_type
           and claim.entity_id = v_id
           and claim.status = 'verified'
       ) then
      return public.adopt_verified_claim_listing(p_payload);
    end if;
  end if;

  return public.submit_listing(p_payload);
end;
$$;

revoke all on function public.save_listing(jsonb) from public, anon;
grant execute on function public.save_listing(jsonb) to authenticated;
