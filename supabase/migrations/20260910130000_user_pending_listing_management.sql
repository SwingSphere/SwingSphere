-- Allow contributors to safely withdraw their own pending club/event submissions.

alter table public.listing_moderation_actions
  drop constraint if exists listing_moderation_actions_action_check;

alter table public.listing_moderation_actions
  add constraint listing_moderation_actions_action_check
  check (action in ('submit', 'update', 'withdraw', 'approve', 'flag', 'reject', 'archive', 'restore', 'admin_save', 'legacy_import'));

create or replace function public.withdraw_my_pending_listing(p_listing_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_before public.listings;
  v_after public.listings;
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

  update public.listings
  set lifecycle_state = 'archived',
      payload = payload || jsonb_build_object('lifecycleState', 'archived')
  where id = v_before.id
  returning * into v_after;

  insert into public.listing_moderation_actions (
    listing_id,
    actor_user_id,
    action,
    reason,
    before_status,
    after_status,
    before_lifecycle_state,
    after_lifecycle_state,
    before_payload,
    after_payload
  ) values (
    v_before.id,
    v_user,
    'withdraw',
    'Withdrawn by the submitting user before moderation was completed.',
    v_before.status,
    v_after.status,
    v_before.lifecycle_state,
    v_after.lifecycle_state,
    v_before.payload,
    v_after.payload
  );

  return jsonb_build_object(
    'id', v_after.id,
    'status', v_after.status,
    'lifecycleState', v_after.lifecycle_state
  );
end;
$$;

revoke all on function public.withdraw_my_pending_listing(text) from public, anon, authenticated;
grant execute on function public.withdraw_my_pending_listing(text) to authenticated;

comment on function public.withdraw_my_pending_listing(text) is
  'Allows an active account holder to archive only their own still-pending listing submission while preserving moderation history.';
