-- Repair managed access when a verified claim exists for a canonical listing
-- whose organization/member link is missing or stale. This closes the legacy
-- transition deadlock without permitting arbitrary managed edits.

create or replace function public.save_managed_listing(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id text := btrim(coalesce(p_payload ->> 'id', ''));
  v_type text := lower(btrim(coalesce(p_payload ->> 'type', '')));
  v_existing public.listings;
  v_claim public.listing_claims;
  v_org_id text;
  v_slug text;
  v_requested_role public.organization_member_role;
  v_existing_member public.organization_members;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  if v_id = '' then
    raise exception 'Listing ID is required.';
  end if;

  if private.is_active_admin(v_user) then
    return public.admin_save_listing(p_payload);
  end if;

  select * into v_existing
  from public.listings
  where id = v_id
  for update;

  if v_existing.id is not null
     and v_existing.submitted_by = v_user
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

  if v_type in ('club', 'event') then
    select * into v_claim
    from public.listing_claims claim
    where claim.claimant_user_id = v_user
      and claim.entity_type = v_type
      and claim.entity_id = v_id
      and claim.status = 'verified'
    order by claim.reviewed_at desc nulls last, claim.submitted_at desc
    limit 1;
  end if;

  if v_existing.id is null and v_claim.id is not null then
    return public.adopt_verified_claim_listing(p_payload);
  end if;

  if v_existing.id is not null and v_claim.id is not null then
    v_org_id := nullif(btrim(coalesce(v_existing.owner_organization_id, v_claim.organization_id, '')), '');

    if v_org_id is not null and not exists (
      select 1 from public.organizations where id = v_org_id
    ) then
      v_org_id := null;
    end if;

    if v_org_id is null then
      v_org_id := 'org-claim-' || replace(v_claim.id::text, '-', '');

      if not exists (select 1 from public.organizations where id = v_org_id) then
        v_slug := trim(both '-' from regexp_replace(lower(v_existing.name), '[^a-z0-9]+', '-', 'g'));
        if char_length(v_slug) < 2 then v_slug := 'organization'; end if;
        v_slug := left(v_slug, 66) || '-' || left(replace(v_claim.id::text, '-', ''), 8);

        insert into public.organizations(
          id, name, slug, display_types, status, created_by
        ) values (
          v_org_id,
          v_existing.name,
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

    update public.listings
    set owner_organization_id = v_org_id,
        provenance = case
          when provenance in ('community','legacy') then case when v_type = 'club' then 'owner' else 'promoter' end
          else provenance
        end,
        payload = case when v_type = 'event'
          then (payload - 'ownerOrganizationId') || jsonb_build_object('organizerOrganizationId', v_org_id)
          else (payload - 'organizerOrganizationId') || jsonb_build_object('ownerOrganizationId', v_org_id)
        end
    where id = v_id;

    update public.profiles
    set role = 'promoter'::public.account_role
    where id = v_user
      and role = 'user'::public.account_role;

    return public.update_managed_listing(v_id, p_payload);
  end if;

  raise exception 'This listing is not available for managed editing by this account.';
end;
$$;

revoke all on function public.save_managed_listing(jsonb) from public, anon;
grant execute on function public.save_managed_listing(jsonb) to authenticated;

comment on function public.save_managed_listing(jsonb) is
  'Updates managed listings, adopts verified legacy listings, and repairs missing organization access for an exact verified claim. Never creates a new community submission.';
