-- Verified managers of existing club/event listings publish media immediately.
-- Community/unverified uploads continue to use the pending_review state.

create or replace function public.can_publish_managed_media(
  p_entity_type text,
  p_entity_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_type text := lower(btrim(coalesce(p_entity_type, '')));
  v_id text := btrim(coalesce(p_entity_id, ''));
  v_listing public.listings;
begin
  if v_user is null then return false; end if;
  if v_type not in ('club', 'event') or v_id = '' then return false; end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_user
      and status = 'active'
  ) then
    return false;
  end if;

  if private.is_active_admin(v_user) then
    return true;
  end if;

  select * into v_listing
  from public.listings
  where id = v_id
    and listing_type = v_type
    and lifecycle_state = 'active';

  if v_listing.id is not null
     and v_listing.owner_organization_id is not null
     and private.can_manage_organization(
       v_listing.owner_organization_id,
       array['owner','manager','editor']::public.organization_member_role[]
     ) then
    return true;
  end if;

  return exists (
    select 1
    from public.listing_claims claim
    where claim.claimant_user_id = v_user
      and claim.entity_type = v_type
      and claim.entity_id = v_id
      and claim.status = 'verified'
  );
end;
$$;

revoke all on function public.can_publish_managed_media(text, text) from public, anon;
grant execute on function public.can_publish_managed_media(text, text) to authenticated;

comment on function public.can_publish_managed_media(text, text) is
  'Returns whether the authenticated account can immediately publish media for an existing managed club/event. Used only for trusted managed-edit uploads; community uploads remain pending review.';
