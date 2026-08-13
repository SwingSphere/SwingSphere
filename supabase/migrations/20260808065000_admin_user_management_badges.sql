-- SwingSphere admin user-management + badge operations.
-- Requires the profile-privacy and badge-system migrations immediately before it.

-- Preserve badge-award history when an administrator removes an award.
alter table public.user_badges
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.profiles(id) on delete set null,
  add column if not exists revocation_reason text;

alter table public.user_badges
  drop constraint if exists user_badges_revocation_reason_length;
alter table public.user_badges
  add constraint user_badges_revocation_reason_length
  check (revocation_reason is null or char_length(revocation_reason) <= 500);

create index if not exists user_badges_active_user_idx
  on public.user_badges(user_id, awarded_at desc)
  where revoked_at is null;

-- Re-awarding a previously revoked achievement revives the existing historical row.
create or replace function private.award_user_badge_internal(
  p_user_id uuid,
  p_badge_slug text,
  p_source public.badge_award_source,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_awarded_by uuid default null
)
returns public.user_badges
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_badge public.badges;
  v_award public.user_badges;
begin
  select * into v_badge
  from public.badges
  where slug = p_badge_slug
    and is_active
    and audience in ('member', 'both')
  limit 1;

  if v_badge.id is null then
    raise exception 'Member badge % does not exist or is inactive.', p_badge_slug;
  end if;

  insert into public.user_badges (
    user_id, badge_id, source, award_reason, metadata, awarded_by
  ) values (
    p_user_id,
    v_badge.id,
    p_source,
    p_reason,
    coalesce(p_metadata, '{}'::jsonb),
    p_awarded_by
  )
  on conflict (user_id, badge_id) do update set
    awarded_at = now(),
    awarded_by = excluded.awarded_by,
    source = excluded.source,
    award_reason = coalesce(excluded.award_reason, public.user_badges.award_reason),
    metadata = public.user_badges.metadata || excluded.metadata,
    revoked_at = null,
    revoked_by = null,
    revocation_reason = null
  returning * into v_award;

  return v_award;
end;
$$;

-- Founding Member is special: the generic award path must never create an
-- unnumbered founder badge. Use admin_assign_founder_number instead.
create or replace function public.admin_award_user_badge(
  p_user_id uuid,
  p_badge_slug text,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_award public.user_badges;
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;

  if p_badge_slug = 'founding-member' then
    raise exception 'Use the founder-number action for Founding Member awards.';
  end if;

  v_award := private.award_user_badge_internal(
    p_user_id, p_badge_slug, 'admin', p_reason, p_metadata, auth.uid()
  );
  return v_award.id;
end;
$$;

create or replace function public.admin_revoke_user_badge(
  p_user_id uuid,
  p_badge_slug text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_updated integer;
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;

  if p_badge_slug = 'founding-member' then
    raise exception 'Founding Member numbers are permanent historical identifiers and cannot be revoked here.';
  end if;

  update public.user_badges award
  set revoked_at = now(),
      revoked_by = auth.uid(),
      revocation_reason = nullif(trim(p_reason), ''),
      is_public = false,
      is_featured = false,
      featured_order = null
  from public.badges badge
  where award.user_id = p_user_id
    and award.badge_id = badge.id
    and badge.slug = p_badge_slug
    and award.revoked_at is null;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- One intentionally privileged projection for the User Management screen.
-- Auth emails are exposed only after the function confirms the caller is an
-- active SwingSphere admin. This avoids weakening profile-table RLS.
create or replace function public.admin_list_users()
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

-- Returns the complete member-capable badge catalog plus the selected user's
-- current award state. This lets the admin UI show both "earned" and "available"
-- achievements without exposing badge ownership publicly.
create or replace function public.admin_get_user_badges(p_user_id uuid)
returns table (
  badge_id uuid,
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
  sort_order integer,
  award_id uuid,
  awarded_at timestamptz,
  awarded_by uuid,
  award_reason text,
  award_source public.badge_award_source,
  award_metadata jsonb,
  is_public boolean,
  is_featured boolean,
  featured_order smallint,
  is_awarded boolean
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
    badge.id,
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
    badge.sort_order,
    award.id,
    award.awarded_at,
    award.awarded_by,
    award.award_reason,
    award.source,
    award.metadata,
    coalesce(award.is_public, false),
    coalesce(award.is_featured, false),
    award.featured_order,
    (award.id is not null and award.revoked_at is null)
  from public.badges badge
  left join public.user_badges award
    on award.badge_id = badge.id
   and award.user_id = p_user_id
   and award.revoked_at is null
  where badge.is_active
    and badge.audience in ('member', 'both')
  order by badge.sort_order, badge.name;
end;
$$;

-- Keep revoked awards out of every member/public projection.
create or replace function public.get_my_badges()
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
language sql
stable
security definer
set search_path = ''
as $$
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
  from public.user_badges award
  join public.badges badge on badge.id = award.badge_id
  where award.user_id = auth.uid()
    and award.revoked_at is null
    and badge.is_active
  order by
    award.is_featured desc,
    award.featured_order asc nulls last,
    badge.sort_order asc,
    award.awarded_at desc;
$$;

create or replace function public.get_public_profile_badges_by_handle(p_handle text)
returns table (
  award_id uuid,
  badge_slug text,
  name text,
  description text,
  category public.badge_category,
  rarity public.badge_rarity,
  icon_key text,
  asset_key text,
  visual_style jsonb,
  awarded_at timestamptz,
  metadata jsonb,
  is_featured boolean,
  featured_order smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    award.id,
    badge.slug,
    badge.name,
    badge.description,
    badge.category,
    badge.rarity,
    badge.icon_key,
    badge.asset_key,
    badge.visual_style,
    award.awarded_at,
    award.metadata,
    award.is_featured,
    award.featured_order
  from public.profiles profile
  join public.profile_privacy_settings privacy on privacy.user_id = profile.id
  join public.user_badges award on award.user_id = profile.id
  join public.badges badge on badge.id = award.badge_id
  where lower(profile.handle) = lower(trim(p_handle))
    and profile.status = 'active'
    and privacy.profile_visibility = 'visible'
    and award.revoked_at is null
    and award.is_public
    and badge.is_active
  order by
    award.is_featured desc,
    award.featured_order asc nulls last,
    badge.sort_order asc,
    award.awarded_at desc;
$$;

revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_get_user_badges(uuid) from public, anon;
revoke all on function public.admin_revoke_user_badge(uuid, text, text) from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_get_user_badges(uuid) to authenticated;
grant execute on function public.admin_revoke_user_badge(uuid, text, text) to authenticated;
