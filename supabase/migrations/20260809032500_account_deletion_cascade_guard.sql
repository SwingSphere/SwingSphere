-- Permit only the controlled profile-cascade deletes initiated by delete_my_account.
-- This keeps the general suspended/deleted write guard strict for normal browser RPCs.

alter table public.account_deletion_requests
  add column if not exists processing_user_id uuid;

create or replace function private.track_account_deletion_processing_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'processing' and old.status is distinct from 'processing' then
    new.processing_user_id := old.user_id;
  elsif new.status in ('completed','cancelled') then
    new.processing_user_id := null;
  end if;
  return new;
end;
$$;

create trigger account_deletion_track_processing_user
  before update of status on public.account_deletion_requests
  for each row execute procedure private.track_account_deletion_processing_user();

revoke all on function private.track_account_deletion_processing_user() from public, anon, authenticated;

create or replace function private.require_active_account_for_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or coalesce(auth.role(), '') = 'service_role' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- delete_my_account marks its receipt as processing before deleting auth.users.
  -- Profile-child cascades may execute after the profile row itself is no longer
  -- visible, so permit DELETE only while that exact user has a processing receipt.
  if tg_op = 'DELETE' and exists (
    select 1 from public.account_deletion_requests request
    where request.processing_user_id = v_user
      and request.status = 'processing'
  ) then
    return old;
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = v_user
      and profile.status = 'active'
  ) then
    raise exception 'An active SwingSphere account is required for this action.' using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.require_active_account_for_write() from public, anon, authenticated;
