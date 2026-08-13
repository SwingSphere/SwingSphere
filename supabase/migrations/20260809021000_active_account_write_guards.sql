-- Make suspended/deleted account state a database write boundary, not just a UI state.
-- Trusted service-role / migration work remains possible; authenticated browser
-- writes require an active profile even when they enter through SECURITY DEFINER RPCs.

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

-- Organization membership only grants management rights while the member's
-- SwingSphere profile itself is active. This flows through can_manage_organization
-- and can_manage_venue without duplicating status checks in every catalog policy.
create or replace function private.organization_member_role_for(
  check_organization_id text,
  check_user uuid default auth.uid()
)
returns public.organization_member_role
language sql
stable
security definer
set search_path = ''
as $$
  select membership.role
  from public.organization_members membership
  join public.profiles profile on profile.id = membership.user_id
  where membership.organization_id = check_organization_id
    and membership.user_id = check_user
    and membership.status = 'active'
    and profile.status = 'active'
  limit 1;
$$;

revoke all on function private.organization_member_role_for(text, uuid) from public, anon, authenticated;
grant execute on function private.organization_member_role_for(text, uuid) to authenticated;

-- Direct/user-owned data stores. These guards also fire when older
-- SECURITY DEFINER RPCs write the tables, so an already-issued JWT cannot
-- bypass suspension simply by calling PostgREST directly.
drop trigger if exists active_account_write_guard_profile_privacy_settings on public.profile_privacy_settings;
create trigger active_account_write_guard_profile_privacy_settings
  before insert or update or delete on public.profile_privacy_settings
  for each row execute procedure private.require_active_account_for_write();

drop trigger if exists active_account_write_guard_saved_entities on public.saved_entities;
create trigger active_account_write_guard_saved_entities
  before insert or update or delete on public.saved_entities
  for each row execute procedure private.require_active_account_for_write();

drop trigger if exists active_account_write_guard_saved_collections on public.saved_collections;
create trigger active_account_write_guard_saved_collections
  before insert or update or delete on public.saved_collections
  for each row execute procedure private.require_active_account_for_write();

drop trigger if exists active_account_write_guard_saved_collection_items on public.saved_collection_items;
create trigger active_account_write_guard_saved_collection_items
  before insert or update or delete on public.saved_collection_items
  for each row execute procedure private.require_active_account_for_write();

drop trigger if exists active_account_write_guard_profile_associations on public.profile_associations;
create trigger active_account_write_guard_profile_associations
  before insert or update or delete on public.profile_associations
  for each row execute procedure private.require_active_account_for_write();

drop trigger if exists active_account_write_guard_feedback_submissions on public.feedback_submissions;
create trigger active_account_write_guard_feedback_submissions
  before insert or update or delete on public.feedback_submissions
  for each row execute procedure private.require_active_account_for_write();

drop trigger if exists active_account_write_guard_feedback_safety_reports on public.feedback_safety_reports;
create trigger active_account_write_guard_feedback_safety_reports
  before insert or update or delete on public.feedback_safety_reports
  for each row execute procedure private.require_active_account_for_write();

drop trigger if exists active_account_write_guard_feedback_written_revisions on public.feedback_written_revisions;
create trigger active_account_write_guard_feedback_written_revisions
  before insert or update or delete on public.feedback_written_revisions
  for each row execute procedure private.require_active_account_for_write();

drop trigger if exists active_account_write_guard_listing_claims on public.listing_claims;
create trigger active_account_write_guard_listing_claims
  before insert or update or delete on public.listing_claims
  for each row execute procedure private.require_active_account_for_write();

drop trigger if exists active_account_write_guard_media_assets on public.media_assets;
create trigger active_account_write_guard_media_assets
  before insert or update or delete on public.media_assets
  for each row execute procedure private.require_active_account_for_write();

drop trigger if exists active_account_write_guard_user_badges on public.user_badges;
create trigger active_account_write_guard_user_badges
  before insert or update or delete on public.user_badges
  for each row execute procedure private.require_active_account_for_write();

comment on function private.require_active_account_for_write() is
  'Shared trigger guard preventing suspended/deleted authenticated users from mutating member-owned production data, including through older SECURITY DEFINER RPCs.';
