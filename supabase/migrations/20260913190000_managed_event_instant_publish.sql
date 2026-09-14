-- Verified organization managers can publish new events immediately.
-- Community submissions continue through pending review. Authorization is
-- evaluated server-side; client-provided status is never trusted.

create or replace function public.submit_listing(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_type text := lower(trim(coalesce(p_payload ->> 'type', '')));
  v_name text := trim(coalesce(p_payload ->> 'name', ''));
  v_id text := trim(coalesce(p_payload ->> 'id', ''));
  v_org text;
  v_owner_org text;
  v_venue_id text;
  v_brand_id text;
  v_series_id text;
  v_provenance text := 'community';
  v_status text := 'pending_approval';
  v_payload jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not exists (select 1 from public.profiles where id = v_user and status = 'active') then
    raise exception 'An active SwingSphere account is required.';
  end if;
  if v_type not in ('club', 'event') then raise exception 'Listing type must be club or event.'; end if;
  if v_name = '' then raise exception 'Listing name is required.'; end if;
  if v_id = '' or exists (select 1 from public.listings where id = v_id) then
    v_id := v_type || '-' || gen_random_uuid()::text;
  end if;

  v_org := case when v_type = 'event'
    then nullif(trim(coalesce(p_payload ->> 'organizerOrganizationId', '')), '')
    else nullif(trim(coalesce(p_payload ->> 'ownerOrganizationId', '')), '') end;

  if v_org is not null
     and exists (select 1 from public.organizations where id = v_org)
     and private.can_manage_organization(
       v_org,
       array['owner','manager','editor']::public.organization_member_role[]
     ) then
    v_owner_org := v_org;
    v_provenance := 'promoter';

    -- Events created by a verified manager of the attached organization are
    -- trusted operational content and go live immediately. New clubs still use
    -- the normal review path unless handled through an existing managed listing.
    if v_type = 'event' then
      v_status := 'approved';
    end if;
  end if;

  select id into v_venue_id
  from public.venues
  where id = case when v_type = 'event'
    then nullif(trim(coalesce(p_payload ->> 'venueId', '')), '')
    else nullif(trim(coalesce(p_payload ->> 'primaryVenueId', '')), '') end;

  if v_type = 'club' then
    select id into v_brand_id
    from public.club_brands
    where id = nullif(trim(coalesce(p_payload ->> 'clubBrandId', '')), '');
  end if;

  if v_type = 'event' then
    select id into v_series_id
    from public.event_series
    where id = nullif(trim(coalesce(p_payload ->> 'eventSeriesId', '')), '');
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object(
      'id', v_id,
      'type', v_type,
      'name', v_name,
      'status', v_status,
      'postedByUserId', v_user::text
    );

  insert into public.listings (
    id, listing_type, name, status, lifecycle_state, payload,
    submitted_by, submitter_ref, owner_organization_id, venue_id,
    club_brand_id, event_series_id, provenance, published_at
  ) values (
    v_id, v_type, v_name, v_status, 'active', v_payload,
    v_user, v_user::text, v_owner_org, v_venue_id,
    v_brand_id, v_series_id, v_provenance,
    case when v_status = 'approved' then now() else null end
  );

  insert into public.listing_moderation_actions (
    listing_id, actor_user_id, action, after_status,
    after_lifecycle_state, after_payload
  ) values (
    v_id, v_user, 'submit', v_status, 'active', v_payload
  );

  if v_status = 'approved' then
    perform public.feedback_register_target(v_type, v_id, v_name, 'active');
  end if;

  select private.listing_payload(listing, false)
  into v_payload
  from public.listings listing
  where listing.id = v_id;

  return v_payload;
end;
$$;

revoke all on function public.submit_listing(jsonb) from public, anon;
grant execute on function public.submit_listing(jsonb) to authenticated;

comment on function public.submit_listing(jsonb) is
  'Creates community listings for review, but immediately publishes events submitted by an authenticated active manager of the attached organization.';
