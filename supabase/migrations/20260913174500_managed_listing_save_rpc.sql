-- Save an existing managed listing without ever falling through to community submission.
-- This RPC is used by owner/manager/editor edit surfaces so a failed lookup or
-- authorization check cannot accidentally create a duplicate pending listing.

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
  where id = v_id;

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

  if v_existing.id is null
     and v_type in ('club', 'event')
     and exists (
       select 1
       from public.listing_claims claim
       where claim.claimant_user_id = v_user
         and claim.entity_type = v_type
         and claim.entity_id = v_id
         and claim.status = 'verified'
     ) then
    return public.adopt_verified_claim_listing(p_payload);
  end if;

  raise exception 'This listing is not available for managed editing by this account.';
end;
$$;

revoke all on function public.save_managed_listing(jsonb) from public, anon;
grant execute on function public.save_managed_listing(jsonb) to authenticated;

comment on function public.save_managed_listing(jsonb) is
  'Updates an existing authorized listing or adopts a verified legacy claim. Never creates a new community submission.';
