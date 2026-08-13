-- SwingSphere achievements, badges, founder numbering, and organization awards.
--
-- Product rules:
-- - member awards belong to people; organization awards belong to host/promoter profiles;
-- - trust markers such as verified organizer are NOT achievements;
-- - member awards are private by default and only leave the account through exact-handle RPCs;
-- - organization awards are public by default because organizations are public discovery entities;
-- - the Founding 100 program is installed disabled so test accounts cannot consume founder numbers.

create type public.badge_category as enum (
  'founder',
  'legacy',
  'contribution',
  'community',
  'host',
  'seasonal',
  'staff',
  'special'
);

create type public.badge_rarity as enum (
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'unique'
);

create type public.badge_audience as enum ('member', 'organization', 'both');
create type public.badge_award_mode as enum ('automatic', 'manual', 'campaign', 'future_automatic');
create type public.badge_award_source as enum ('automatic', 'admin', 'campaign', 'milestone', 'event', 'legacy');

alter table public.profiles
  add column if not exists founder_number integer unique,
  add column if not exists founder_awarded_at timestamptz;

comment on column public.profiles.founder_number is
  'Internal immutable Founding 100 serial. Public display is exposed only through an explicitly public badge award.';

create sequence if not exists public.founder_number_seq
  start with 1 increment by 1 minvalue 1;

create table public.badge_system_settings (
  singleton boolean primary key default true check (singleton),
  founder_program_enabled boolean not null default false,
  founder_limit integer not null default 100 check (founder_limit between 1 and 10000),
  updated_at timestamptz not null default now()
);

insert into public.badge_system_settings (singleton, founder_program_enabled, founder_limit)
values (true, false, 100)
on conflict (singleton) do nothing;

create trigger badge_system_settings_set_updated_at
  before update on public.badge_system_settings
  for each row execute procedure public.set_updated_at();

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  category public.badge_category not null,
  rarity public.badge_rarity not null default 'common',
  audience public.badge_audience not null default 'member',
  award_mode public.badge_award_mode not null default 'manual',
  icon_key text,
  asset_key text,
  criteria jsonb not null default '{}'::jsonb,
  visual_style jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_secret boolean not null default false,
  is_catalog_visible boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badges_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  constraint badges_name_length check (char_length(trim(name)) between 1 and 80),
  constraint badges_description_length check (char_length(trim(description)) between 1 and 500),
  constraint badges_icon_key_length check (icon_key is null or char_length(icon_key) <= 80),
  constraint badges_asset_key_length check (asset_key is null or char_length(asset_key) <= 180)
);

comment on column public.badges.asset_key is
  'Future badge-art asset key. Intentionally nullable until final PNG/SVG/WebP artwork is assigned.';
comment on column public.badges.criteria is
  'Machine-readable achievement criteria/progress metadata. future_automatic badges are cataloged before their source data is normalized.';

create trigger badges_set_updated_at
  before update on public.badges
  for each row execute procedure public.set_updated_at();

create table public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  awarded_by uuid references public.profiles(id) on delete set null,
  award_reason text,
  source public.badge_award_source not null default 'admin',
  metadata jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  is_featured boolean not null default false,
  featured_order smallint,
  unique (user_id, badge_id),
  constraint user_badges_reason_length check (award_reason is null or char_length(award_reason) <= 500),
  constraint user_badges_featured_order check (featured_order is null or featured_order between 1 and 3),
  constraint user_badges_featured_requires_public check (not is_featured or is_public),
  constraint user_badges_featured_has_order check ((is_featured and featured_order is not null) or (not is_featured and featured_order is null))
);

create unique index user_badges_featured_slot_idx
  on public.user_badges(user_id, featured_order)
  where is_featured;
create index user_badges_user_idx on public.user_badges(user_id, awarded_at desc);
create index user_badges_badge_idx on public.user_badges(badge_id, awarded_at desc);

create table public.organization_badges (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  awarded_by uuid references public.profiles(id) on delete set null,
  award_reason text,
  source public.badge_award_source not null default 'admin',
  metadata jsonb not null default '{}'::jsonb,
  is_public boolean not null default true,
  is_featured boolean not null default true,
  featured_order smallint,
  unique (organization_id, badge_id),
  constraint organization_badges_reason_length check (award_reason is null or char_length(award_reason) <= 500),
  constraint organization_badges_featured_order check (featured_order is null or featured_order between 1 and 4),
  constraint organization_badges_featured_requires_public check (not is_featured or is_public)
);

create unique index organization_badges_featured_slot_idx
  on public.organization_badges(organization_id, featured_order)
  where is_featured and featured_order is not null;
create index organization_badges_org_idx on public.organization_badges(organization_id, awarded_at desc);
create index organization_badges_badge_idx on public.organization_badges(badge_id, awarded_at desc);

-- Initial catalog ------------------------------------------------------------
-- Artwork is deliberately represented only by semantic icon keys for now.
-- Final asset keys can be attached later without changing award history.

insert into public.badges (
  slug, name, description, category, rarity, audience, award_mode,
  icon_key, criteria, visual_style, sort_order, is_secret, is_catalog_visible
)
values
  (
    'founding-member', 'Founding Member',
    'One of SwingSphere’s first 100 eligible confirmed members. Each award carries a permanent founder number.',
    'founder', 'legendary', 'member', 'automatic', 'founder-sphere',
    '{"program":"founder-100","limit":100,"numbered":true,"special_numbers":[1,10,50,100]}'::jsonb,
    '{"family":"founder","palette":"founder"}'::jsonb, 10, false, true
  ),
  (
    'beta-explorer', 'Beta Explorer',
    'Helped test and shape SwingSphere before its broader public launch.',
    'legacy', 'rare', 'member', 'campaign', 'beta-explorer',
    '{"campaign":"prelaunch-beta"}'::jsonb,
    '{"family":"legacy","palette":"violet"}'::jsonb, 20, false, true
  ),
  (
    'first-footprint', 'First Footprint',
    'Made a first approved contribution that improved SwingSphere discovery data.',
    'contribution', 'uncommon', 'member', 'future_automatic', 'footprint',
    '{"metric":"approved_contributions","threshold":1}'::jsonb,
    '{"family":"contribution","palette":"cyan"}'::jsonb, 100, false, true
  ),
  (
    'pathfinder', 'Pathfinder',
    'Added five approved new places, events, or discovery records to SwingSphere.',
    'contribution', 'rare', 'member', 'future_automatic', 'pathfinder',
    '{"metric":"approved_new_listings","threshold":5}'::jsonb,
    '{"family":"contribution","palette":"violet"}'::jsonb, 110, false, true
  ),
  (
    'cartographer', 'Cartographer',
    'Built out SwingSphere with twenty-five approved listings or substantial location contributions.',
    'contribution', 'epic', 'member', 'future_automatic', 'cartographer',
    '{"metric":"approved_listing_or_location_contributions","threshold":25}'::jsonb,
    '{"family":"contribution","palette":"blue"}'::jsonb, 120, false, true
  ),
  (
    'fine-tuner', 'Fine Tuner',
    'Had five meaningful corrections to existing SwingSphere information accepted.',
    'contribution', 'rare', 'member', 'future_automatic', 'fine-tuner',
    '{"metric":"accepted_corrections","threshold":5}'::jsonb,
    '{"family":"contribution","palette":"mint"}'::jsonb, 130, false, true
  ),
  (
    'archivist', 'Archivist',
    'Meaningfully helped preserve, recover, or update historical venue and event information.',
    'contribution', 'rare', 'member', 'manual', 'archivist',
    '{"review":"staff"}'::jsonb,
    '{"family":"contribution","palette":"amber"}'::jsonb, 140, false, true
  ),
  (
    'first-voice', 'First Voice',
    'Published a first approved written review on SwingSphere.',
    'contribution', 'uncommon', 'member', 'automatic', 'first-voice',
    '{"metric":"approved_written_reviews","threshold":1}'::jsonb,
    '{"family":"voice","palette":"magenta"}'::jsonb, 150, false, true
  ),
  (
    'trusted-voice', 'Trusted Voice',
    'Built a meaningful body of reviews that the SwingSphere community consistently found useful.',
    'community', 'epic', 'member', 'future_automatic', 'trusted-voice',
    '{"metric":"helpful_review_reputation","status":"awaiting_helpful_vote_model"}'::jsonb,
    '{"family":"voice","palette":"royal-blue"}'::jsonb, 160, false, true
  ),
  (
    'bug-hunter', 'Bug Hunter',
    'Reported an issue that was confirmed and helped make SwingSphere better.',
    'contribution', 'uncommon', 'member', 'manual', 'bug-hunter',
    '{"review":"staff"}'::jsonb,
    '{"family":"contribution","palette":"lime"}'::jsonb, 170, false, true
  ),
  (
    'friend-of-swingsphere', 'Friend of SwingSphere',
    'Recognized by the SwingSphere team for meaningful support of the project or community.',
    'community', 'rare', 'both', 'manual', 'friend',
    '{"review":"staff"}'::jsonb,
    '{"family":"community","palette":"rose"}'::jsonb, 200, false, true
  ),
  (
    'community-builder', 'Community Builder',
    'Recognized for sustained work that made the SwingSphere community more useful, welcoming, or connected.',
    'community', 'epic', 'both', 'manual', 'community-builder',
    '{"review":"staff"}'::jsonb,
    '{"family":"community","palette":"orange"}'::jsonb, 210, false, true
  ),
  (
    'trailblazer', 'Trailblazer',
    'Helped establish meaningful SwingSphere coverage or community presence in a new region.',
    'community', 'epic', 'both', 'manual', 'trailblazer',
    '{"review":"staff","regional":true}'::jsonb,
    '{"family":"community","palette":"fuchsia"}'::jsonb, 220, false, true
  ),
  (
    'early-supporter', 'Early Supporter',
    'Supported SwingSphere during its early launch period in a way the team chose to recognize.',
    'legacy', 'rare', 'member', 'campaign', 'early-supporter',
    '{"campaign":"early-support"}'::jsonb,
    '{"family":"legacy","palette":"gold"}'::jsonb, 230, false, true
  ),
  (
    'founding-organizer', 'Founding Organizer',
    'An early verified host or promoter organization that helped establish SwingSphere’s launch community.',
    'founder', 'legendary', 'organization', 'campaign', 'founding-organizer',
    '{"campaign":"founding-organizers"}'::jsonb,
    '{"family":"founder-host","palette":"founder"}'::jsonb, 300, false, true
  ),
  (
    'first-event', 'First Event',
    'Published a first approved event through this organizer profile.',
    'host', 'uncommon', 'organization', 'future_automatic', 'first-event',
    '{"metric":"approved_organization_events","threshold":1,"status":"awaiting_normalized_event_table"}'::jsonb,
    '{"family":"host","palette":"cyan"}'::jsonb, 310, false, true
  ),
  (
    'event-builder', 'Event Builder',
    'Published five approved events through this organizer profile.',
    'host', 'rare', 'organization', 'future_automatic', 'event-builder',
    '{"metric":"approved_organization_events","threshold":5,"status":"awaiting_normalized_event_table"}'::jsonb,
    '{"family":"host","palette":"violet"}'::jsonb, 320, false, true
  ),
  (
    'seasoned-host', 'Seasoned Host',
    'Published twenty-five approved events through this organizer profile.',
    'host', 'epic', 'organization', 'future_automatic', 'seasoned-host',
    '{"metric":"approved_organization_events","threshold":25,"status":"awaiting_normalized_event_table"}'::jsonb,
    '{"family":"host","palette":"ruby"}'::jsonb, 330, false, true
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  rarity = excluded.rarity,
  audience = excluded.audience,
  award_mode = excluded.award_mode,
  icon_key = excluded.icon_key,
  criteria = excluded.criteria,
  visual_style = excluded.visual_style,
  sort_order = excluded.sort_order,
  is_secret = excluded.is_secret,
  is_catalog_visible = excluded.is_catalog_visible,
  is_active = true;

-- Internal award helpers -----------------------------------------------------

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
    award_reason = coalesce(excluded.award_reason, public.user_badges.award_reason),
    metadata = public.user_badges.metadata || excluded.metadata
  returning * into v_award;

  return v_award;
end;
$$;

create or replace function private.award_organization_badge_internal(
  p_organization_id text,
  p_badge_slug text,
  p_source public.badge_award_source,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_awarded_by uuid default null
)
returns public.organization_badges
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_badge public.badges;
  v_award public.organization_badges;
begin
  select * into v_badge
  from public.badges
  where slug = p_badge_slug
    and is_active
    and audience in ('organization', 'both')
  limit 1;

  if v_badge.id is null then
    raise exception 'Organization badge % does not exist or is inactive.', p_badge_slug;
  end if;

  insert into public.organization_badges (
    organization_id, badge_id, source, award_reason, metadata, awarded_by
  ) values (
    p_organization_id,
    v_badge.id,
    p_source,
    p_reason,
    coalesce(p_metadata, '{}'::jsonb),
    p_awarded_by
  )
  on conflict (organization_id, badge_id) do update set
    award_reason = coalesce(excluded.award_reason, public.organization_badges.award_reason),
    metadata = public.organization_badges.metadata || excluded.metadata
  returning * into v_award;

  return v_award;
end;
$$;

-- Founder program ------------------------------------------------------------

create or replace function private.founder_variant_for(p_number integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_number = 1 then 'the-first'
    when p_number between 2 and 9 then 'first-circle'
    when p_number = 10 then 'member-10'
    when p_number between 11 and 49 then 'founding-fifty'
    when p_number = 50 then 'member-50'
    when p_number between 51 and 99 then 'founding-hundred'
    when p_number = 100 then 'member-100'
    else 'founding-member'
  end;
$$;

create or replace function private.assign_founder_number_internal(
  p_user_id uuid,
  p_ignore_program_gate boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_existing integer;
  v_next integer;
  v_limit integer;
  v_enabled boolean;
  v_role public.account_role;
  v_status public.account_status;
  v_verified timestamptz;
begin
  select founder_number, role, status, email_verified_at
  into v_existing, v_role, v_status, v_verified
  from public.profiles
  where id = p_user_id
  for update;

  if v_existing is not null then
    return v_existing;
  end if;

  select founder_program_enabled, founder_limit
  into v_enabled, v_limit
  from public.badge_system_settings
  where singleton = true;

  if not coalesce(v_enabled, false) and not p_ignore_program_gate then
    return null;
  end if;

  if v_verified is null or v_status <> 'active' or v_role = 'admin' then
    return null;
  end if;

  v_next := nextval('public.founder_number_seq');
  if v_next > v_limit then
    return null;
  end if;

  update public.profiles
  set founder_number = v_next,
      founder_awarded_at = now(),
      updated_at = now()
  where id = p_user_id
    and founder_number is null;

  perform private.award_user_badge_internal(
    p_user_id,
    'founding-member',
    case when v_next in (1, 10, 50, 100) then 'milestone' else 'automatic' end,
    'Founding 100 member',
    jsonb_build_object(
      'founder_number', v_next,
      'founder_limit', v_limit,
      'variant', private.founder_variant_for(v_next)
    ),
    null
  );

  return v_next;
end;
$$;

create or replace function private.assign_founder_after_profile_verification()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.email_verified_at is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform private.assign_founder_number_internal(new.id, false);
  elsif old.email_verified_at is null then
    perform private.assign_founder_number_internal(new.id, false);
  end if;

  return new;
end;
$$;

create trigger profiles_assign_founder_after_verification
  after insert or update of email_verified_at on public.profiles
  for each row
  execute procedure private.assign_founder_after_profile_verification();

create or replace function public.admin_set_founder_program_enabled(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;

  update public.badge_system_settings
  set founder_program_enabled = p_enabled,
      updated_at = now()
  where singleton = true;

  return p_enabled;
end;
$$;

create or replace function public.admin_assign_founder_number(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;
  return private.assign_founder_number_internal(p_user_id, true);
end;
$$;

-- Automatic review achievement ----------------------------------------------

create or replace function private.award_first_voice_after_approval()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user_id uuid;
begin
  if new.approved_text is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.approved_text is not null then
      return new;
    end if;
  end if;

  select author_user_id into v_user_id
  from public.feedback_submissions
  where id = new.feedback_submission_id;

  if v_user_id is not null then
    perform private.award_user_badge_internal(
      v_user_id,
      'first-voice',
      'automatic',
      'First approved written review',
      jsonb_build_object('feedback_submission_id', new.feedback_submission_id),
      null
    );
  end if;

  return new;
end;
$$;

create trigger feedback_written_experiences_award_first_voice
  after insert or update of approved_text on public.feedback_written_experiences
  for each row
  execute procedure private.award_first_voice_after_approval();

-- Backfill First Voice only. Founder numbers are deliberately NOT backfilled;
-- the founder counter remains disabled until an administrator opens the program.
insert into public.user_badges (user_id, badge_id, source, award_reason, metadata)
select distinct
  submission.author_user_id,
  badge.id,
  'legacy'::public.badge_award_source,
  'Approved written review predating badge-system deployment',
  jsonb_build_object('backfilled', true)
from public.feedback_submissions submission
join public.feedback_written_experiences written
  on written.feedback_submission_id = submission.id
join public.badges badge
  on badge.slug = 'first-voice'
where written.approved_text is not null
on conflict (user_id, badge_id) do nothing;

-- Admin award APIs -----------------------------------------------------------

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

  v_award := private.award_user_badge_internal(
    p_user_id, p_badge_slug, 'admin', p_reason, p_metadata, auth.uid()
  );
  return v_award.id;
end;
$$;

create or replace function public.admin_award_organization_badge(
  p_organization_id text,
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
  v_award public.organization_badges;
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;

  v_award := private.award_organization_badge_internal(
    p_organization_id, p_badge_slug, 'admin', p_reason, p_metadata, auth.uid()
  );
  return v_award.id;
end;
$$;

-- Read APIs -----------------------------------------------------------------

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
    and award.is_public
    and badge.is_active
  order by
    award.is_featured desc,
    award.featured_order asc nulls last,
    badge.sort_order asc,
    award.awarded_at desc;
$$;

create or replace function public.get_public_organization_badges(p_organization_id text)
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
  from public.organizations organization
  join public.organization_badges award on award.organization_id = organization.id
  join public.badges badge on badge.id = award.badge_id
  where organization.id = p_organization_id
    and organization.status in ('approved', 'active')
    and award.is_public
    and badge.is_active
  order by
    award.is_featured desc,
    award.featured_order asc nulls last,
    badge.sort_order asc,
    award.awarded_at desc;
$$;

-- RLS / grants ---------------------------------------------------------------

alter table public.badge_system_settings enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.organization_badges enable row level security;

revoke all on public.badge_system_settings from anon, authenticated;
revoke all on public.badges from anon, authenticated;
revoke all on public.user_badges from anon, authenticated;
revoke all on public.organization_badges from anon, authenticated;

grant select on public.badges to anon, authenticated;
grant select on public.user_badges to authenticated;
grant update (is_public, is_featured, featured_order) on public.user_badges to authenticated;
grant select on public.organization_badges to anon, authenticated;
grant update (is_public, is_featured, featured_order) on public.organization_badges to authenticated;

create policy "Public can read visible badge catalog"
on public.badges for select
to anon, authenticated
using (is_active and is_catalog_visible and not is_secret);

create policy "Admins can read all badge definitions"
on public.badges for select
to authenticated
using (private.is_active_admin(auth.uid()));

create policy "Members can read their own badge awards"
on public.user_badges for select
to authenticated
using (user_id = auth.uid() or private.is_active_admin(auth.uid()));

create policy "Members can manage their own badge presentation"
on public.user_badges for update
to authenticated
using (user_id = auth.uid() or private.is_active_admin(auth.uid()))
with check (user_id = auth.uid() or private.is_active_admin(auth.uid()));

create policy "Public can read public organization badge awards"
on public.organization_badges for select
to anon, authenticated
using (
  is_public
  and exists (
    select 1 from public.organizations organization
    where organization.id = organization_id
      and organization.status in ('approved', 'active')
  )
);

create policy "Organization managers can read their organization badge awards"
on public.organization_badges for select
to authenticated
using (
  private.is_active_admin(auth.uid())
  or private.can_manage_organization(organization_id)
);

create policy "Organization managers can manage badge presentation"
on public.organization_badges for update
to authenticated
using (
  private.is_active_admin(auth.uid())
  or private.can_manage_organization(organization_id)
)
with check (
  private.is_active_admin(auth.uid())
  or private.can_manage_organization(organization_id)
);

revoke all on function private.award_user_badge_internal(uuid, text, public.badge_award_source, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function private.award_organization_badge_internal(text, text, public.badge_award_source, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function private.founder_variant_for(integer) from public, anon, authenticated;
revoke all on function private.assign_founder_number_internal(uuid, boolean) from public, anon, authenticated;
revoke all on function private.assign_founder_after_profile_verification() from public, anon, authenticated;
revoke all on function private.award_first_voice_after_approval() from public, anon, authenticated;

revoke all on function public.admin_set_founder_program_enabled(boolean) from public, anon, authenticated;
revoke all on function public.admin_assign_founder_number(uuid) from public, anon, authenticated;
revoke all on function public.admin_award_user_badge(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.admin_award_organization_badge(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.get_my_badges() from public, anon, authenticated;
revoke all on function public.get_public_profile_badges_by_handle(text) from public, anon, authenticated;
revoke all on function public.get_public_organization_badges(text) from public, anon, authenticated;

grant execute on function public.admin_set_founder_program_enabled(boolean) to authenticated;
grant execute on function public.admin_assign_founder_number(uuid) to authenticated;
grant execute on function public.admin_award_user_badge(uuid, text, text, jsonb) to authenticated;
grant execute on function public.admin_award_organization_badge(text, text, text, jsonb) to authenticated;
grant execute on function public.get_my_badges() to authenticated;
grant execute on function public.get_public_profile_badges_by_handle(text) to anon, authenticated;
grant execute on function public.get_public_organization_badges(text) to anon, authenticated;
