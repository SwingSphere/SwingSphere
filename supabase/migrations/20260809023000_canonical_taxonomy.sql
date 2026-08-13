-- Canonical SwingSphere listing taxonomy.
-- Replaces the mock admin tag store and makes the club/event editor taxonomy
-- database-backed while preserving the existing string values stored in listing payloads.

create table public.tag_categories (
  id text primary key,
  slug text not null unique,
  name text not null,
  description text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tag_categories_id_length check (char_length(id) between 1 and 120),
  constraint tag_categories_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  constraint tag_categories_name_length check (char_length(name) between 1 and 120),
  constraint tag_categories_description_length check (description is null or char_length(description) <= 1000)
);

create trigger tag_categories_set_updated_at
  before update on public.tag_categories
  for each row execute procedure public.set_updated_at();

create table public.tags (
  id text primary key,
  category_id text not null references public.tag_categories(id) on delete restrict,
  slug text not null unique,
  value text not null unique,
  label text not null,
  description text,
  aliases text[] not null default '{}'::text[],
  applies_to text[] not null default array['club','event']::text[],
  is_visible boolean not null default true,
  is_deprecated boolean not null default false,
  sort_order integer not null default 100,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_id_length check (char_length(id) between 1 and 160),
  constraint tags_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,119}$'),
  constraint tags_value_length check (char_length(value) between 1 and 160),
  constraint tags_label_length check (char_length(label) between 1 and 160),
  constraint tags_description_length check (description is null or char_length(description) <= 1500),
  constraint tags_aliases_limit check (cardinality(aliases) <= 24),
  constraint tags_applies_to_valid check (
    applies_to <@ array['club','event','resort','cruise_series','cruise_sailing']::text[]
    and cardinality(applies_to) > 0
  )
);

create index tags_category_sort_idx on public.tags(category_id, sort_order, label);
create index tags_visible_idx on public.tags(is_visible, is_deprecated, category_id, sort_order);
create index tags_aliases_gin_idx on public.tags using gin(aliases);

create trigger tags_set_updated_at
  before update on public.tags
  for each row execute procedure public.set_updated_at();

alter table public.tag_categories enable row level security;
alter table public.tags enable row level security;

revoke all on public.tag_categories from public, anon, authenticated;
revoke all on public.tags from public, anon, authenticated;

grant select on public.tag_categories to anon, authenticated;
grant select on public.tags to anon, authenticated;

create policy "Public can read active tag categories"
on public.tag_categories
for select
to anon, authenticated
using (is_active);

create policy "Active admins can read all tag categories"
on public.tag_categories
for select
to authenticated
using (private.is_active_admin(auth.uid()));

create policy "Public can read visible active tags"
on public.tags
for select
to anon, authenticated
using (is_visible and not is_deprecated);

create policy "Active admins can read all tags"
on public.tags
for select
to authenticated
using (private.is_active_admin(auth.uid()));

-- Usage is calculated against the canonical listing payload instead of carrying
-- stale counters copied from old fixture data. A listing matches either the
-- canonical value or one of the tag aliases.
create or replace function private.taxonomy_tag_usage_count(
  p_value text,
  p_aliases text[] default '{}'::text[]
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::bigint
  from public.listings listing
  where listing.lifecycle_state = 'active'
    and exists (
      select 1
      from jsonb_array_elements_text(
        case
          when listing.listing_type = 'club' then coalesce(listing.payload -> 'generalAmenities', '[]'::jsonb)
          else coalesce(listing.payload -> 'tags', '[]'::jsonb)
        end
      ) selected(value)
      where lower(selected.value) = lower(p_value)
         or exists (
           select 1
           from unnest(coalesce(p_aliases, '{}'::text[])) alias(value)
           where lower(alias.value) = lower(selected.value)
         )
    );
$$;

revoke all on function private.taxonomy_tag_usage_count(text, text[]) from public, anon, authenticated;

create or replace function public.taxonomy_list_categories()
returns table (
  id text,
  slug text,
  name text,
  description text,
  sort_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select category.id, category.slug, category.name, category.description, category.sort_order
  from public.tag_categories category
  where category.is_active
    and exists (
      select 1
      from public.tags tag
      where tag.category_id = category.id
        and tag.is_visible
        and not tag.is_deprecated
    )
  order by category.sort_order, category.name;
$$;

create or replace function public.taxonomy_list_tags()
returns table (
  id text,
  category_id text,
  slug text,
  value text,
  label text,
  description text,
  aliases text[],
  applies_to text[],
  is_visible boolean,
  is_deprecated boolean,
  sort_order integer,
  usage_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    tag.id,
    tag.category_id,
    tag.slug,
    tag.value,
    tag.label,
    tag.description,
    tag.aliases,
    tag.applies_to,
    tag.is_visible,
    tag.is_deprecated,
    tag.sort_order,
    private.taxonomy_tag_usage_count(tag.value, tag.aliases)
  from public.tags tag
  join public.tag_categories category on category.id = tag.category_id
  where category.is_active
    and tag.is_visible
    and not tag.is_deprecated
  order by category.sort_order, tag.sort_order, tag.label;
$$;

create or replace function public.admin_taxonomy_list_categories()
returns table (
  id text,
  slug text,
  name text,
  description text,
  sort_order integer,
  is_active boolean
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
  select category.id, category.slug, category.name, category.description, category.sort_order, category.is_active
  from public.tag_categories category
  order by category.sort_order, category.name;
end;
$$;

create or replace function public.admin_taxonomy_list_tags()
returns table (
  id text,
  category_id text,
  slug text,
  value text,
  label text,
  description text,
  aliases text[],
  applies_to text[],
  is_visible boolean,
  is_deprecated boolean,
  sort_order integer,
  usage_count bigint
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
    tag.id,
    tag.category_id,
    tag.slug,
    tag.value,
    tag.label,
    tag.description,
    tag.aliases,
    tag.applies_to,
    tag.is_visible,
    tag.is_deprecated,
    tag.sort_order,
    private.taxonomy_tag_usage_count(tag.value, tag.aliases)
  from public.tags tag
  join public.tag_categories category on category.id = tag.category_id
  order by category.sort_order, tag.sort_order, tag.label;
end;
$$;

create or replace function public.admin_save_tag_category(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := nullif(trim(p_payload ->> 'id'), '');
  v_name text := nullif(trim(p_payload ->> 'name'), '');
  v_slug text := nullif(trim(p_payload ->> 'slug'), '');
  v_description text := nullif(trim(p_payload ->> 'description'), '');
  v_sort_order integer := coalesce((p_payload ->> 'sortOrder')::integer, 100);
  v_before jsonb;
  v_after jsonb;
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;
  if v_name is null then raise exception 'Category name is required.'; end if;
  if v_slug is null then v_slug := public.slugify_profile_handle(v_name); end if;
  if v_id is null then v_id := 'cat-' || v_slug; end if;

  select to_jsonb(category) into v_before from public.tag_categories category where category.id = v_id;

  insert into public.tag_categories as category(id, slug, name, description, sort_order, is_active)
  values(v_id, v_slug, v_name, v_description, v_sort_order, coalesce((p_payload ->> 'isActive')::boolean, true))
  on conflict(id) do update set
    slug = excluded.slug,
    name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active
  returning to_jsonb(category) into v_after;

  perform private.record_admin_audit_internal(
    auth.uid(),
    case when v_before is null then 'taxonomy.category_created' else 'taxonomy.category_updated' end,
    'tag_category', v_id, v_name, null,
    coalesce(v_before, '{}'::jsonb), v_after, '{}'::jsonb
  );

  return v_after;
end;
$$;

create or replace function public.admin_save_tag(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := nullif(trim(p_payload ->> 'id'), '');
  v_category_id text := nullif(trim(p_payload ->> 'categoryId'), '');
  v_label text := nullif(trim(p_payload ->> 'label'), '');
  v_value text := nullif(trim(p_payload ->> 'value'), '');
  v_slug text := nullif(trim(p_payload ->> 'slug'), '');
  v_description text := nullif(trim(p_payload ->> 'description'), '');
  v_aliases text[] := array(select distinct trim(value) from jsonb_array_elements_text(coalesce(p_payload -> 'aliases', '[]'::jsonb)) where trim(value) <> '');
  v_applies_to text[] := array(select distinct trim(value) from jsonb_array_elements_text(coalesce(p_payload -> 'appliesTo', '["club","event"]'::jsonb)) where trim(value) <> '');
  v_before jsonb;
  v_after jsonb;
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;
  if v_category_id is null or not exists(select 1 from public.tag_categories where id = v_category_id) then
    raise exception 'A valid tag category is required.';
  end if;
  if v_label is null then raise exception 'Tag label is required.'; end if;
  if v_value is null then v_value := v_label; end if;
  if v_slug is null then v_slug := public.slugify_profile_handle(v_value); end if;
  if v_id is null then v_id := 'tag-' || v_slug; end if;

  select to_jsonb(tag) into v_before from public.tags tag where tag.id = v_id;

  insert into public.tags as tag_row(
    id, category_id, slug, value, label, description, aliases, applies_to,
    is_visible, is_deprecated, sort_order, created_by, updated_by
  ) values (
    v_id, v_category_id, v_slug, v_value, v_label, v_description, v_aliases, v_applies_to,
    coalesce((p_payload ->> 'isVisible')::boolean, true),
    coalesce((p_payload ->> 'isDeprecated')::boolean, false),
    coalesce((p_payload ->> 'sortOrder')::integer, 100),
    auth.uid(), auth.uid()
  )
  on conflict(id) do update set
    category_id = excluded.category_id,
    slug = excluded.slug,
    value = excluded.value,
    label = excluded.label,
    description = excluded.description,
    aliases = excluded.aliases,
    applies_to = excluded.applies_to,
    is_visible = excluded.is_visible,
    is_deprecated = excluded.is_deprecated,
    sort_order = excluded.sort_order,
    updated_by = auth.uid()
  returning to_jsonb(tag_row) into v_after;

  perform private.record_admin_audit_internal(
    auth.uid(),
    case when v_before is null then 'taxonomy.tag_created' else 'taxonomy.tag_updated' end,
    'tag', v_id, v_label, null,
    coalesce(v_before, '{}'::jsonb), v_after, '{}'::jsonb
  );

  return v_after;
end;
$$;

create or replace function public.admin_deprecate_tag(p_tag_id text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_label text;
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 4 then
    raise exception 'A short deprecation reason is required.';
  end if;

  select to_jsonb(tag), tag.label into v_before, v_label
  from public.tags tag
  where tag.id = p_tag_id
  for update;

  if v_before is null then raise exception 'Tag not found.'; end if;

  update public.tags
  set is_deprecated = true,
      is_visible = false,
      updated_by = auth.uid()
  where id = p_tag_id
  returning to_jsonb(public.tags.*) into v_after;

  perform private.record_admin_audit_internal(
    auth.uid(), 'taxonomy.tag_deprecated', 'tag', p_tag_id, v_label, trim(p_reason),
    v_before, v_after, '{}'::jsonb
  );
  return true;
end;
$$;

revoke all on function public.taxonomy_list_categories() from public, anon, authenticated;
revoke all on function public.taxonomy_list_tags() from public, anon, authenticated;
revoke all on function public.admin_taxonomy_list_categories() from public, anon, authenticated;
revoke all on function public.admin_taxonomy_list_tags() from public, anon, authenticated;
revoke all on function public.admin_save_tag_category(jsonb) from public, anon, authenticated;
revoke all on function public.admin_save_tag(jsonb) from public, anon, authenticated;
revoke all on function public.admin_deprecate_tag(text, text) from public, anon, authenticated;

grant execute on function public.taxonomy_list_categories() to anon, authenticated;
grant execute on function public.taxonomy_list_tags() to anon, authenticated;
grant execute on function public.admin_taxonomy_list_categories() to authenticated;
grant execute on function public.admin_taxonomy_list_tags() to authenticated;
grant execute on function public.admin_save_tag_category(jsonb) to authenticated;
grant execute on function public.admin_save_tag(jsonb) to authenticated;
grant execute on function public.admin_deprecate_tag(text, text) to authenticated;

-- Categories used by the current editor plus a hidden legacy bucket for values
-- that still appear in canonical listing payloads but should not be offered for
-- new submissions.
insert into public.tag_categories(id, slug, name, description, sort_order, is_active) values
  ('cat-audience', 'audience-access', 'Audience & Access', 'Audience, attendance, screening, and entry descriptors. Structured attendance fields are preferred for new listings.', 10, true),
  ('cat-community', 'community-inclusion', 'Community & Inclusion', 'Community focus, inclusion, consent, and welcome descriptors.', 20, true),
  ('cat-vibe', 'vibe', 'Vibe', 'Atmosphere and venue or event style.', 30, true),
  ('cat-amenities', 'amenities', 'Amenities', 'Physical amenities and practical features.', 40, true),
  ('cat-theme', 'theme-dress', 'Theme & Dress', 'Event themes, dress expectations, and recurring theme concepts.', 50, true),
  ('cat-safety', 'safety-privacy', 'Safety & Privacy', 'Privacy, screening, orientation, consent, and safer-sex descriptors.', 60, true),
  ('cat-legacy', 'legacy-custom', 'Legacy / Custom', 'Historical or event-specific payload tags retained for compatibility but not offered as general filters.', 999, true)
on conflict(id) do nothing;

-- Canonical editor taxonomy.
insert into public.tags(id, category_id, slug, value, label, aliases, applies_to, is_visible, is_deprecated, sort_order) values
  ('tag-lgbtq-friendly','cat-community','lgbtq-friendly','LGBTQ+ Friendly','LGBTQ+ Friendly',array['LGBT Friendly'],array['club','event'],true,false,10),
  ('tag-trans-nonbinary-inclusive','cat-community','trans-non-binary-inclusive','Trans & Non-Binary Inclusive','Trans & Non-Binary Inclusive',array['Trans/NB Focused'],array['club','event'],true,false,20),
  ('tag-newbie-friendly','cat-community','newbie-friendly','Newbie Friendly','Newbie Friendly','{}',array['club','event'],true,false,30),
  ('tag-consent-focused','cat-community','consent-focused','Consent-Focused','Consent-Focused','{}',array['club','event'],true,false,40),
  ('tag-body-positive','cat-community','body-positive','Body Positive','Body Positive','{}',array['club','event'],true,false,50),
  ('tag-women-centered','cat-community','women-centered','Women-Centered','Women-Centered','{}',array['club','event'],true,false,60),
  ('tag-queer-centered','cat-community','queer-centered','Queer-Centered','Queer-Centered','{}',array['club','event'],true,false,70),
  ('tag-bipoc-friendly','cat-community','bipoc-friendly','BIPOC-Friendly','BIPOC-Friendly',array['POC Friendly'],array['club','event'],true,false,80),
  ('tag-ethical-non-monogamy','cat-community','ethical-non-monogamy','Ethical Non-Monogamy','Ethical Non-Monogamy','{}',array['club','event'],true,false,90),
  ('tag-swinger-community','cat-community','swinger-community','Swinger Community','Swinger Community','{}',array['club','event'],true,false,100),

  ('tag-upscale','cat-vibe','upscale','Upscale','Upscale','{}',array['club','event'],true,false,10),
  ('tag-casual','cat-vibe','casual','Casual','Casual','{}',array['club','event'],true,false,20),
  ('tag-dance-club','cat-vibe','dance-club','Dance Club','Dance Club','{}',array['club','event'],true,false,30),
  ('tag-lounge','cat-vibe','lounge','Lounge','Lounge','{}',array['club','event'],true,false,40),
  ('tag-kink-bdsm-friendly','cat-vibe','kink-bdsm-friendly','Kink / BDSM Friendly','Kink / BDSM Friendly',array['Dungeon / Kink','Kink / BDSM Space'],array['club','event'],true,false,50),
  ('tag-mansion-party','cat-vibe','mansion-party','Mansion Party','Mansion Party','{}',array['event'],true,false,60),
  ('tag-hotel-takeover','cat-vibe','hotel-takeover','Hotel Takeover','Hotel Takeover','{}',array['event'],true,false,70),
  ('tag-on-premise-play','cat-vibe','on-premise-play','On-Premise Play','On-Premise Play','{}',array['club','event'],true,false,80),

  ('tag-showers','cat-amenities','showers','Showers','Showers','{}',array['club','event'],true,false,10),
  ('tag-parking','cat-amenities','parking','Parking','Parking',array['On-Site Parking'],array['club','event'],true,false,20),
  ('tag-food-served','cat-amenities','food-served','Food Served','Food Served','{}',array['club','event'],true,false,30),
  ('tag-lockers','cat-amenities','lockers','Lockers','Lockers','{}',array['club','event'],true,false,40),
  ('tag-pool-hot-tub','cat-amenities','pool-hot-tub','Pool / Hot Tub','Pool / Hot Tub','{}',array['club','event'],true,false,50),
  ('tag-alcohol-available','cat-amenities','alcohol-available','Alcohol Available','Alcohol Available',array['Serves Alcohol'],array['club','event'],true,false,60),
  ('tag-byob','cat-amenities','byob','BYOB','BYOB',array['Bring Your Own Bottle'],array['club','event'],true,false,70),
  ('tag-safer-sex-supplies','cat-amenities','safer-sex-supplies','Safer Sex Supplies','Safer Sex Supplies','{}',array['club','event'],true,false,80),
  ('tag-massage-tables','cat-amenities','massage-tables','Massage Tables','Massage Tables','{}',array['club','event'],true,false,90),
  ('tag-private-play-areas','cat-amenities','private-play-areas','Private Play Areas','Private Play Areas','{}',array['club','event'],true,false,100),

  ('tag-lingerie-night','cat-theme','lingerie-night','Lingerie Night','Lingerie Night','{}',array['event'],true,false,10),
  ('tag-costume-party','cat-theme','costume-party','Costume Party','Costume Party','{}',array['event'],true,false,20),
  ('tag-formal-attire','cat-theme','formal-attire','Formal Attire','Formal Attire','{}',array['event'],true,false,30),
  ('tag-halloween','cat-theme','halloween','Halloween','Halloween','{}',array['event'],true,false,40),
  ('tag-white-party','cat-theme','white-party','White Party','White Party','{}',array['event'],true,false,50),
  ('tag-little-black-dress','cat-theme','little-black-dress','Little Black Dress','Little Black Dress','{}',array['event'],true,false,60),
  ('tag-kink-theme','cat-theme','kink-theme','Kink Theme','Kink Theme','{}',array['event'],true,false,70),
  ('tag-back-to-school-theme','cat-theme','back-to-school-theme','Back to School Theme','Back to School Theme','{}',array['event'],true,false,80),

  ('tag-privacy-focused','cat-safety','privacy-focused','Privacy-Focused','Privacy-Focused','{}',array['club','event'],true,false,10)
on conflict(id) do nothing;

-- Historical/access values retained so every live listing payload resolves to a
-- canonical record or alias. Most are hidden/deprecated because newer structured
-- attendance and entry fields carry the semantics for new submissions.
insert into public.tags(id, category_id, slug, value, label, aliases, applies_to, is_visible, is_deprecated, sort_order) values
  ('tag-couples-only','cat-audience','couples-only','Couples Only','Couples Only','{}',array['club','event'],false,true,10),
  ('tag-single-men-welcome','cat-audience','single-men-welcome','Single Men Welcome','Single Men Welcome','{}',array['club','event'],false,true,20),
  ('tag-single-women-welcome','cat-audience','single-women-welcome','Single Women Welcome','Single Women Welcome','{}',array['club','event'],false,true,30),
  ('tag-couples-welcome','cat-audience','couples-welcome','Couples Welcome','Couples Welcome','{}',array['event'],false,true,40),
  ('tag-couples-focused','cat-audience','couples-focused','Couples Focused','Couples Focused','{}',array['event'],false,true,50),
  ('tag-limited-single-men','cat-audience','limited-single-men','Limited Single Men','Limited Single Men','{}',array['event'],false,true,60),
  ('tag-no-single-men','cat-audience','no-single-men','No Single Men','No Single Men','{}',array['event'],false,true,70),
  ('tag-hotwives-welcome','cat-audience','hotwives-welcome','Hotwives Welcome','Hotwives Welcome','{}',array['event'],false,true,80),
  ('tag-non-binary-welcome','cat-audience','non-binary-welcome','Non-Binary Welcome','Non-Binary Welcome','{}',array['event'],false,true,90),
  ('tag-women-only','cat-audience','women-only','Women Only','Women Only',array['Female Only'],array['club','event'],false,true,100),
  ('tag-men-only','cat-audience','men-only','Men Only','Men Only','{}',array['club','event'],false,true,110),
  ('tag-40-plus-crowd','cat-audience','40-plus-crowd','40+ Crowd','40+ Crowd','{}',array['club','event'],false,true,120),
  ('tag-20s-30s-crowd','cat-audience','20s-30s-crowd','20s & 30s Crowd','20s & 30s Crowd','{}',array['club','event'],false,true,130),
  ('tag-members-only','cat-audience','members-only','Members Only','Members Only','{}',array['club','event'],false,true,140),
  ('tag-application-required','cat-audience','application-required','Application Required','Application Required','{}',array['event'],false,true,150),
  ('tag-advance-tickets','cat-audience','advance-tickets','Advance Tickets','Advance Tickets','{}',array['event'],false,true,160),

  ('tag-screened-event','cat-safety','screened-event','Screened Event','Screened Event','{}',array['event'],false,true,20),
  ('tag-mandatory-orientation','cat-safety','mandatory-orientation','Mandatory Orientation','Mandatory Orientation','{}',array['event'],false,true,30),
  ('tag-nudity-required','cat-theme','nudity-required','Nudity Required','Nudity Required','{}',array['club','event'],false,true,90),
  ('tag-outdoor-event','cat-theme','outdoor-event','Outdoor Event','Outdoor Event','{}',array['event'],false,false,100),

  ('tag-bronze-party','cat-legacy','bronze-party','Bronze Party','Bronze Party','{}',array['event'],false,true,10),
  ('tag-her-fantasy-party','cat-legacy','her-fantasy-party','Her Fantasy Party','Her Fantasy Party','{}',array['event'],false,true,20),
  ('tag-ls-rules','cat-legacy','ls-rules','LS Rules','LS Rules','{}',array['club','event'],false,true,30),
  ('tag-old-perk','cat-legacy','old-perk','Old Perk','Old Perk','{}',array['club','event'],false,true,40)
on conflict(id) do nothing;

comment on table public.tags is
  'Canonical listing taxonomy. Listing payloads retain string values for compatibility; aliases resolve historical labels without destructive rewrites.';
comment on function public.admin_deprecate_tag(text, text) is
  'Soft-deprecates a taxonomy tag. Tags are never hard-deleted through the application because legacy listing payloads may still reference them.';
