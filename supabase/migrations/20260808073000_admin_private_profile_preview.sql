-- Admin-only profile preview access.
--
-- Public member privacy remains unchanged: visitors still use
-- get_public_profile_by_handle(), which returns only visible-by-link profiles.
-- These RPCs exist solely so an authenticated active SwingSphere admin can
-- inspect a member profile by exact handle without changing that member's
-- privacy setting or making private profiles enumerable to ordinary users.

create or replace function public.admin_get_profile_by_handle(p_handle text)
returns table (
  id uuid,
  display_name text,
  handle text,
  bio text,
  avatar_url text,
  created_at timestamptz,
  profile_visibility public.profile_visibility,
  role public.account_role,
  status public.account_status,
  founder_number integer
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
    profile.bio,
    profile.avatar_url,
    profile.created_at,
    coalesce(privacy.profile_visibility, 'private'::public.profile_visibility),
    profile.role,
    profile.status,
    profile.founder_number
  from public.profiles profile
  left join public.profile_privacy_settings privacy on privacy.user_id = profile.id
  where lower(profile.handle) = lower(trim(p_handle))
  limit 1;
end;
$$;

comment on function public.admin_get_profile_by_handle(text) is
  'Admin-only exact-handle profile preview. Ignores member public-profile visibility but does not expose unrelated private account activity.';

create or replace function public.admin_get_profile_badges_by_handle(p_handle text)
returns table (
  award_id uuid,
  badge_slug text,
  name text,
  description text,
  category public.badge_category,
  rarity public.badge_rarity,
  audience public.badge_audience,
  award_mode public.badge_award_mode,
  icon_key text,
  asset_key text,
  criteria jsonb,
  visual_style jsonb,
  awarded_at timestamptz,
  award_reason text,
  metadata jsonb,
  is_public boolean,
  is_featured boolean,
  featured_order smallint
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
    award.id,
    badge.slug,
    badge.name,
    badge.description,
    badge.category,
    badge.rarity,
    badge.audience,
    badge.award_mode,
    badge.icon_key,
    badge.asset_key,
    badge.criteria,
    badge.visual_style,
    award.awarded_at,
    award.award_reason,
    award.metadata,
    award.is_public,
    award.is_featured,
    award.featured_order
  from public.profiles profile
  join public.user_badges award on award.user_id = profile.id
  join public.badges badge on badge.id = award.badge_id
  where lower(profile.handle) = lower(trim(p_handle))
    and award.revoked_at is null
    and badge.is_active
  order by
    award.is_featured desc,
    award.featured_order asc nulls last,
    badge.sort_order asc,
    award.awarded_at desc;
end;
$$;

comment on function public.admin_get_profile_badges_by_handle(text) is
  'Admin-only achievement preview for an exact member handle, including awards that the member has not made public.';

revoke all on function public.admin_get_profile_by_handle(text) from public, anon, authenticated;
revoke all on function public.admin_get_profile_badges_by_handle(text) from public, anon, authenticated;
grant execute on function public.admin_get_profile_by_handle(text) to authenticated;
grant execute on function public.admin_get_profile_badges_by_handle(text) to authenticated;
