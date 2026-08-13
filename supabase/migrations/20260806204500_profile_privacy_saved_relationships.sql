-- SwingSphere member privacy, private discovery library, future account associations,
-- and authored-review attribution.
--
-- Product contract:
-- - ordinary member profiles are private by default;
-- - an authored public comment/review may still display the author's screen name
--   and handle, but that handle only opens a profile when the member has explicitly
--   selected visible-by-link access;
-- - SwingSphere does not provide member search, a member directory, nearby-member
--   discovery, or profile recommendations;
-- - saves, collections, and account associations are owner/participant-only data.

create type public.profile_visibility as enum ('private', 'visible');
create type public.profile_association_kind as enum ('relationship', 'friend', 'other');
create type public.profile_association_status as enum ('pending', 'accepted', 'declined', 'removed');

create table public.profile_privacy_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  profile_visibility public.profile_visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profile_privacy_settings is
  'Owner-only member-profile visibility settings. Profiles are private unless the member explicitly enables visible-by-link access.';
comment on column public.profile_privacy_settings.profile_visibility is
  'private: no visitor profile; visible: exact handle URL and authored-contribution links may open the member profile.';

insert into public.profile_privacy_settings (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create trigger profile_privacy_settings_set_updated_at
  before update on public.profile_privacy_settings
  for each row execute procedure public.set_updated_at();

create or replace function public.ensure_profile_privacy_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile_privacy_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger profiles_create_privacy_settings
  after insert on public.profiles
  for each row execute procedure public.ensure_profile_privacy_settings();

alter table public.profile_privacy_settings enable row level security;

grant select, insert, update on public.profile_privacy_settings to authenticated;

create policy "Members read their own profile privacy"
on public.profile_privacy_settings for select
to authenticated
using (user_id = auth.uid() or private.is_active_admin(auth.uid()));

create policy "Members create their own profile privacy"
on public.profile_privacy_settings for insert
to authenticated
with check (user_id = auth.uid());

create policy "Members update their own profile privacy"
on public.profile_privacy_settings for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Private profiles must not remain enumerable through direct table reads. Public
-- profile rendering uses the exact-handle RPC below; review attribution uses its
-- own deliberately narrow projection.
drop policy if exists "Public can read active profiles" on public.profiles;
drop policy if exists "Members can read their own profile" on public.profiles;
drop policy if exists "Admins can read profiles" on public.profiles;

revoke select on public.profiles from anon, authenticated;
grant select (
  id,
  display_name,
  handle,
  role,
  status,
  avatar_url,
  bio,
  created_at
) on public.profiles to authenticated;

create policy "Members can read their own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "Admins can read profiles"
on public.profiles for select
to authenticated
using (private.is_active_admin(auth.uid()));

create or replace function public.get_public_profile_by_handle(p_handle text)
returns table (
  id uuid,
  display_name text,
  handle text,
  bio text,
  avatar_url text,
  created_at timestamptz,
  profile_visibility public.profile_visibility
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.display_name,
    p.handle,
    p.bio,
    p.avatar_url,
    p.created_at,
    privacy.profile_visibility
  from public.profiles p
  join public.profile_privacy_settings privacy on privacy.user_id = p.id
  where lower(p.handle) = lower(trim(p_handle))
    and p.status = 'active'
    and privacy.profile_visibility = 'visible'
  limit 1;
$$;

comment on function public.get_public_profile_by_handle(text) is
  'Returns one deliberately limited public-profile projection by exact handle. Private profiles return no row.';

revoke all on function public.get_public_profile_by_handle(text) from public;
grant execute on function public.get_public_profile_by_handle(text) to anon, authenticated;

-- Private discovery library --------------------------------------------------

create table public.saved_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'club', 'event', 'venue', 'organization', 'resort', 'cruise_series', 'cruise_sailing'
  )),
  entity_id text not null check (char_length(entity_id) between 1 and 200),
  private_note text check (private_note is null or char_length(private_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);

create table public.saved_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  visibility public.profile_visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.saved_collection_items (
  collection_id uuid not null references public.saved_collections(id) on delete cascade,
  saved_entity_id uuid not null references public.saved_entities(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, saved_entity_id)
);

create index saved_entities_user_created_idx on public.saved_entities(user_id, created_at desc);
create index saved_collections_user_created_idx on public.saved_collections(user_id, created_at desc);

create trigger saved_entities_set_updated_at
  before update on public.saved_entities
  for each row execute procedure public.set_updated_at();
create trigger saved_collections_set_updated_at
  before update on public.saved_collections
  for each row execute procedure public.set_updated_at();

alter table public.saved_entities enable row level security;
alter table public.saved_collections enable row level security;
alter table public.saved_collection_items enable row level security;

grant select, insert, update, delete on public.saved_entities to authenticated;
grant select, insert, update, delete on public.saved_collections to authenticated;
grant select, insert, update, delete on public.saved_collection_items to authenticated;

create policy "Members manage their own saved entities"
on public.saved_entities for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Members manage their own saved collections"
on public.saved_collections for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Members manage items in their own collections"
on public.saved_collection_items for all
to authenticated
using (
  exists (
    select 1 from public.saved_collections collection
    where collection.id = saved_collection_items.collection_id
      and collection.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.saved_collections collection
    join public.saved_entities saved on saved.id = saved_collection_items.saved_entity_id
    where collection.id = saved_collection_items.collection_id
      and collection.user_id = auth.uid()
      and saved.user_id = auth.uid()
  )
);

-- Future account associations ----------------------------------------------
-- This is intentionally neutral infrastructure. It does not enable follower
-- counts, dating discovery, public friend lists, messaging, or shared login.

create table public.profile_associations (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  association_kind public.profile_association_kind not null,
  status public.profile_association_status not null default 'pending',
  public_label text check (public_label is null or char_length(public_label) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint profile_associations_no_self_link check (requester_user_id <> recipient_user_id)
);

create unique index profile_associations_unique_pair_idx
  on public.profile_associations (
    least(requester_user_id::text, recipient_user_id::text),
    greatest(requester_user_id::text, recipient_user_id::text)
  )
  where status in ('pending', 'accepted');

create index profile_associations_participant_idx
  on public.profile_associations(requester_user_id, recipient_user_id, status);

create trigger profile_associations_set_updated_at
  before update on public.profile_associations
  for each row execute procedure public.set_updated_at();

create or replace function public.protect_profile_association_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.requester_user_id <> old.requester_user_id
     or new.recipient_user_id <> old.recipient_user_id
     or new.association_kind <> old.association_kind then
    raise exception 'Association participants and kind cannot be changed.';
  end if;

  if new.status is distinct from old.status then
    new.responded_at := now();
  end if;

  return new;
end;
$$;

create trigger profile_associations_protect_identity
  before update on public.profile_associations
  for each row execute procedure public.protect_profile_association_identity();

alter table public.profile_associations enable row level security;
grant select on public.profile_associations to authenticated;

create policy "Association participants can read"
on public.profile_associations for select
to authenticated
using (auth.uid() in (requester_user_id, recipient_user_id));

create or replace function public.request_profile_association(
  p_recipient_handle text,
  p_kind public.profile_association_kind,
  p_public_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_id uuid := auth.uid();
  recipient_id uuid;
  existing_id uuid;
  created_id uuid;
begin
  if requester_id is null then
    raise exception 'Authentication required.';
  end if;

  select profile.id into recipient_id
  from public.profiles profile
  where lower(profile.handle) = lower(trim(p_recipient_handle))
    and profile.status = 'active'
  limit 1;

  if recipient_id is null or recipient_id = requester_id then
    raise exception 'Association request could not be created.';
  end if;

  select association.id into existing_id
  from public.profile_associations association
  where least(association.requester_user_id::text, association.recipient_user_id::text)
      = least(requester_id::text, recipient_id::text)
    and greatest(association.requester_user_id::text, association.recipient_user_id::text)
      = greatest(requester_id::text, recipient_id::text)
    and association.status in ('pending', 'accepted')
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  insert into public.profile_associations (
    requester_user_id,
    recipient_user_id,
    association_kind,
    public_label
  ) values (
    requester_id,
    recipient_id,
    p_kind,
    nullif(trim(p_public_label), '')
  )
  returning id into created_id;

  return created_id;
end;
$$;

create or replace function public.respond_profile_association(
  p_association_id uuid,
  p_status public.profile_association_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if p_status not in ('accepted', 'declined') then
    raise exception 'Invalid association response.';
  end if;

  update public.profile_associations
  set status = p_status
  where id = p_association_id
    and recipient_user_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'Association request is unavailable.';
  end if;
end;
$$;

create or replace function public.remove_profile_association(p_association_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  update public.profile_associations
  set status = 'removed'
  where id = p_association_id
    and auth.uid() in (requester_user_id, recipient_user_id)
    and status <> 'removed';

  if not found then
    raise exception 'Association is unavailable.';
  end if;
end;
$$;

revoke all on function public.request_profile_association(text, public.profile_association_kind, text) from public;
revoke all on function public.respond_profile_association(uuid, public.profile_association_status) from public;
revoke all on function public.remove_profile_association(uuid) from public;
grant execute on function public.request_profile_association(text, public.profile_association_kind, text) to authenticated;
grant execute on function public.respond_profile_association(uuid, public.profile_association_status) to authenticated;
grant execute on function public.remove_profile_association(uuid) to authenticated;

-- Approved written reviews are public authored actions. The author handle is
-- deliberately returned even when the destination profile is private. The
-- profile route itself remains protected by get_public_profile_by_handle().

drop function if exists public.feedback_list_approved_written(
  public.feedback_target_type,
  text,
  integer,
  integer
);

create function public.feedback_list_approved_written(
  p_target_type public.feedback_target_type,
  p_target_id text,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  feedback_submission_id uuid,
  approved_text text,
  approved_at timestamptz,
  overall_sentiment public.feedback_sentiment,
  experience_scope text,
  author_display_name text,
  author_handle text,
  author_avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    submission.id,
    written.approved_text,
    written.approved_at,
    submission.overall_sentiment,
    submission.experience_scope,
    case when author.status = 'active' then author.display_name else 'Former member' end,
    case when author.status = 'active' then author.handle else null end,
    case when author.status = 'active' then author.avatar_url else null end
  from public.feedback_submissions submission
  join public.feedback_written_experiences written
    on written.feedback_submission_id = submission.id
  left join public.profiles author
    on author.id = submission.author_user_id
  where submission.structured_status <> 'withdrawn'
    and written.approved_text is not null
    and (
      (p_target_type = 'event' and submission.event_id = p_target_id)
      or (p_target_type = 'club' and submission.club_id = p_target_id)
      or (p_target_type = 'organization' and submission.organization_id = p_target_id)
    )
  order by written.approved_at desc
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.feedback_list_approved_written(
  public.feedback_target_type,
  text,
  integer,
  integer
) from public;
grant execute on function public.feedback_list_approved_written(
  public.feedback_target_type,
  text,
  integer,
  integer
) to anon, authenticated, service_role;

revoke all on function public.ensure_profile_privacy_settings() from public, anon, authenticated;
