-- Live platform-health projection for the SwingSphere admin panel.
-- The browser compares the remote migration version returned here with the
-- latest local migration discovered by Vite at build/dev-server startup.

create or replace function public.admin_platform_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_latest_migration text;
  v_profile_count bigint := 0;
  v_media_count bigint := 0;
  v_feedback_target_count bigint := 0;
  v_listing_count bigint := 0;
  v_listing_import_complete boolean := false;
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;

  select max(version)::text
    into v_latest_migration
    from supabase_migrations.schema_migrations;

  select count(*) into v_profile_count from public.profiles;
  select count(*) into v_media_count from public.media_assets;
  select
    (select count(*) from public.feedback_target_clubs)
    + (select count(*) from public.feedback_target_events)
    + (select count(*) from public.feedback_target_venues)
    into v_feedback_target_count;

  if to_regclass('public.listings') is not null then
    execute 'select count(*) from public.listings where lifecycle_state = ''active'''
      into v_listing_count;
  end if;
  if to_regclass('public.listing_store_settings') is not null then
    execute 'select coalesce(legacy_import_completed_at is not null, false) from public.listing_store_settings where singleton = true'
      into v_listing_import_complete;
  end if;

  return jsonb_build_object(
    'checkedAt', now(),
    'database', jsonb_build_object(
      'latestMigration', v_latest_migration,
      'serverVersion', current_setting('server_version')
    ),
    'counts', jsonb_build_object(
      'profiles', v_profile_count,
      'mediaAssets', v_media_count,
      'feedbackTargets', v_feedback_target_count,
      'listings', v_listing_count
    ),
    'capabilities', jsonb_build_object(
      'profiles', to_regclass('public.profiles') is not null,
      'mediaAssets', to_regclass('public.media_assets') is not null,
      'organizations', to_regclass('public.organizations') is not null,
      'organizationMembers', to_regclass('public.organization_members') is not null,
      'feedbackTargets', to_regclass('public.feedback_target_events') is not null,
      'feedbackRegistration', to_regprocedure('public.feedback_register_target(text,text,text,text)') is not null,
      'adminUserProjection', to_regprocedure('public.admin_list_users()') is not null,
      'adminUserBadges', to_regprocedure('public.admin_get_user_badges(uuid)') is not null,
      'adminPrivateProfilePreview', to_regprocedure('public.admin_get_profile_by_handle(text)') is not null,
      'adminUserMutation', to_regprocedure('public.admin_update_user_account(uuid,text,text,text)') is not null,
      'profilePrivacy', to_regclass('public.profile_privacy_settings') is not null,
      'savedRelationships', to_regclass('public.profile_associations') is not null,
      'listingClaims', to_regclass('public.listing_claims') is not null,
      'outboundAnalytics', to_regclass('public.outbound_click_events') is not null,
      'badges', to_regclass('public.badges') is not null,
      'listingStore', to_regclass('public.listings') is not null,
      'listingModerationHistory', to_regclass('public.listing_moderation_actions') is not null,
      'listingLegacyImportComplete', v_listing_import_complete,
      'publicListingRead', to_regprocedure('public.list_public_listings()') is not null,
      'myListingRead', to_regprocedure('public.list_my_listings()') is not null,
      'adminListingRead', to_regprocedure('public.admin_list_listings()') is not null,
      'listingSubmit', to_regprocedure('public.submit_listing(jsonb)') is not null,
      'listingAdminSave', to_regprocedure('public.admin_save_listing(jsonb)') is not null,
      'listingModerate', to_regprocedure('public.admin_moderate_listing(text,text,text)') is not null,
      'generalAdminAudit', to_regclass('public.admin_audit_log') is not null,
      'adminNotifications', to_regclass('public.admin_notifications') is not null,
      'taxonomy', to_regclass('public.tags') is not null and to_regclass('public.tag_categories') is not null,
      'accountDeletion', to_regprocedure('public.delete_my_account()') is not null
    )
  );
end;
$$;

revoke all on function public.admin_platform_health() from public, anon, authenticated;
grant execute on function public.admin_platform_health() to authenticated;

comment on function public.admin_platform_health() is
  'Admin-only runtime capability probe used by Platform Status. Returns no secrets or private row data.';
