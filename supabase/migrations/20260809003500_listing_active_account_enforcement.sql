-- Tighten member listing mutations after the canonical listing-store rollout.
-- Suspended/deleted accounts may retain an Auth session, but cannot mutate a
-- pending submission through the RPC directly.

alter table public.listings
  add constraint listings_payload_size
  check (octet_length(payload::text) <= 524288) not valid;

alter table public.listings
  validate constraint listings_payload_size;

create or replace function public.update_my_pending_listing(p_listing_id text, p_payload jsonb)
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
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;
  if not exists (
    select 1
    from public.profiles
    where id = v_user
      and status = 'active'
  ) then
    raise exception 'An active SwingSphere account is required.';
  end if;

  select * into v_before
  from public.listings
  where id = p_listing_id
    and submitted_by = v_user
    and lifecycle_state = 'active'
    and status = 'pending_approval'
  for update;

  if v_before.id is null then
    raise exception 'Pending listing is unavailable.';
  end if;

  v_name := trim(coalesce(p_payload ->> 'name', v_before.name));
  if v_name = '' then raise exception 'Listing name is required.'; end if;

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object(
      'id', v_before.id,
      'type', v_before.listing_type,
      'name', v_name,
      'status', 'pending_approval',
      'postedByUserId', v_user::text
    );

  update public.listings
  set name = v_name,
      payload = v_payload,
      submitter_ref = v_user::text
  where id = v_before.id;

  insert into public.listing_moderation_actions (
    listing_id, actor_user_id, action,
    before_status, after_status,
    before_lifecycle_state, after_lifecycle_state,
    before_payload, after_payload
  ) values (
    v_before.id, v_user, 'update',
    v_before.status, 'pending_approval',
    v_before.lifecycle_state, 'active',
    v_before.payload, v_payload
  );

  return v_payload;
end;
$$;

revoke all on function public.update_my_pending_listing(text, jsonb) from public, anon;
grant execute on function public.update_my_pending_listing(text, jsonb) to authenticated;
