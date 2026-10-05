-- Expose Supabase Auth last_sign_in_at to the protected User Management projection.

drop function if exists public.admin_list_users();

create function public.admin_list_users()
returns table (
  id uuid,
  display_name text,
  handle text,
  email text,
  role public.account_role,
  status public.account_status,
  avatar_url text,
  created_at timestamptz,
  email_verified_at timestamptz,
  last_sign_in_at timestamptz,
  founder_number integer,
  profile_visibility public.profile_visibility,
  badge_count bigint,
  public_badge_count bigint,
  organization_count bigint,
  approved_review_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;

  return query
  select
    profile.id,
    profile.display_name,
    profile.handle,
    auth_user.email::text,
    profile.role,
    profile.status,
    profile.avatar_url,
    profile.created_at,
    profile.email_verified_at,
    auth_user.last_sign_in_at,
    profile.founder_number,
    coalesce(privacy.profile_visibility, 'private'::public.profile_visibility),
    (
      select count(*)
      from public.user_badges award
      where award.user_id = profile.id
        and award.revoked_at is null
    ) as badge_count,
    (
      select count(*)
      from public.user_badges award
      where award.user_id = profile.id
        and award.revoked_at is null
        and award.is_public
    ) as public_badge_count,
    (
      select count(*)
      from public.organization_members membership
      where membership.user_id = profile.id
        and membership.status = 'active'
    ) as organization_count,
    (
      select count(*)
      from public.feedback_submissions submission
      join public.feedback_written_experiences written
        on written.feedback_submission_id = submission.id
      where submission.author_user_id = profile.id
        and submission.structured_status <> 'withdrawn'
        and written.approved_text is not null
    ) as approved_review_count
  from public.profiles profile
  left join auth.users auth_user on auth_user.id = profile.id
  left join public.profile_privacy_settings privacy on privacy.user_id = profile.id
  order by profile.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

comment on function public.admin_list_users() is
  'Protected admin projection for User Management, including Auth email verification and last sign-in timestamps.';
