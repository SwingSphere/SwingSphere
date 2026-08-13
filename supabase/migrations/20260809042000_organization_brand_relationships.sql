-- Model organizations/public-facing event brands as separate canonical entities.
-- This prevents sibling brands operated by the same producer from being collapsed
-- into one organizer identity (for example Bronze Party and Her Fantasy Party).

create table if not exists public.organization_relationships (
  id uuid primary key default gen_random_uuid(),
  source_organization_id text not null references public.organizations(id) on delete cascade,
  target_organization_id text not null references public.organizations(id) on delete cascade,
  relationship_type text not null check (relationship_type in (
    'operates',
    'produces',
    'owns',
    'parent_brand',
    'co_promotes',
    'ticketing_provider',
    'partner',
    'affiliate'
  )),
  label text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_relationships_distinct_orgs check (source_organization_id <> target_organization_id),
  constraint organization_relationships_label_length check (label is null or char_length(label) <= 160),
  constraint organization_relationships_notes_length check (notes is null or char_length(notes) <= 2000),
  unique (source_organization_id, target_organization_id, relationship_type)
);

create index if not exists organization_relationships_source_idx
  on public.organization_relationships(source_organization_id, relationship_type);
create index if not exists organization_relationships_target_idx
  on public.organization_relationships(target_organization_id, relationship_type);

create trigger organization_relationships_set_updated_at
  before update on public.organization_relationships
  for each row execute procedure public.set_updated_at();

alter table public.organization_relationships enable row level security;

grant select on public.organization_relationships to anon, authenticated;
revoke insert, update, delete on public.organization_relationships from anon, authenticated;

create policy "Public can read relationships between public organizations"
on public.organization_relationships
for select
to anon, authenticated
using (
  exists (
    select 1 from public.organizations source_org
    where source_org.id = source_organization_id
      and source_org.status in ('approved', 'active')
  )
  and exists (
    select 1 from public.organizations target_org
    where target_org.id = target_organization_id
      and target_org.status in ('approved', 'active')
  )
);

create policy "Administrators can read all organization relationships"
on public.organization_relationships
for select
to authenticated
using (private.is_active_admin(auth.uid()));

create or replace function public.admin_save_organization_relationship(p_payload jsonb)
returns public.organization_relationships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_id uuid;
  v_source text := nullif(trim(coalesce(p_payload ->> 'sourceOrganizationId', '')), '');
  v_target text := nullif(trim(coalesce(p_payload ->> 'targetOrganizationId', '')), '');
  v_type text := lower(trim(coalesce(p_payload ->> 'relationshipType', '')));
  v_label text := nullif(trim(coalesce(p_payload ->> 'label', '')), '');
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_is_primary boolean := coalesce((p_payload ->> 'isPrimary')::boolean, false);
  v_notes text := nullif(trim(coalesce(p_payload ->> 'notes', '')), '');
  v_before public.organization_relationships;
  v_after public.organization_relationships;
  v_source_name text;
  v_target_name text;
begin
  if not private.is_active_admin(v_admin) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  if v_source is null or v_target is null then
    raise exception 'Source and target organizations are required.';
  end if;
  if v_source = v_target then
    raise exception 'An organization cannot relate to itself.';
  end if;
  if v_type not in ('operates','produces','owns','parent_brand','co_promotes','ticketing_provider','partner','affiliate') then
    raise exception 'Unsupported organization relationship type: %', v_type;
  end if;

  select name into v_source_name from public.organizations where id = v_source;
  select name into v_target_name from public.organizations where id = v_target;
  if v_source_name is null then raise exception 'Unknown source organization: %', v_source; end if;
  if v_target_name is null then raise exception 'Unknown target organization: %', v_target; end if;

  if nullif(trim(coalesce(p_payload ->> 'startsAt', '')), '') is not null then
    v_starts_at := (p_payload ->> 'startsAt')::timestamptz;
  end if;
  if nullif(trim(coalesce(p_payload ->> 'endsAt', '')), '') is not null then
    v_ends_at := (p_payload ->> 'endsAt')::timestamptz;
  end if;
  if v_starts_at is not null and v_ends_at is not null and v_ends_at < v_starts_at then
    raise exception 'Relationship end date cannot precede start date.';
  end if;

  if nullif(trim(coalesce(p_payload ->> 'id', '')), '') is not null then
    begin
      v_id := (p_payload ->> 'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid organization relationship id.';
    end;
    select * into v_before from public.organization_relationships where id = v_id for update;
  else
    select * into v_before
    from public.organization_relationships
    where source_organization_id = v_source
      and target_organization_id = v_target
      and relationship_type = v_type
    for update;
    v_id := v_before.id;
  end if;

  if v_id is null then v_id := gen_random_uuid(); end if;

  insert into public.organization_relationships (
    id,
    source_organization_id,
    target_organization_id,
    relationship_type,
    label,
    starts_at,
    ends_at,
    is_primary,
    notes
  ) values (
    v_id,
    v_source,
    v_target,
    v_type,
    v_label,
    v_starts_at,
    v_ends_at,
    v_is_primary,
    v_notes
  )
  on conflict (source_organization_id, target_organization_id, relationship_type)
  do update set
    label = excluded.label,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    is_primary = excluded.is_primary,
    notes = excluded.notes
  returning * into v_after;

  perform private.record_admin_audit_internal(
    v_admin,
    case when v_before.id is null then 'organization.relationship_created' else 'organization.relationship_updated' end,
    'organization_relationship',
    v_after.id::text,
    v_source_name || ' → ' || v_target_name,
    null,
    case when v_before.id is null then '{}'::jsonb else to_jsonb(v_before) end,
    to_jsonb(v_after),
    jsonb_build_object('relationshipType', v_type)
  );

  return v_after;
end;
$$;

create or replace function public.admin_delete_organization_relationship(
  p_relationship_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_before public.organization_relationships;
  v_source_name text;
  v_target_name text;
begin
  if not private.is_active_admin(v_admin) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required to remove an organization relationship.';
  end if;

  select * into v_before
  from public.organization_relationships
  where id = p_relationship_id
  for update;
  if v_before.id is null then raise exception 'Organization relationship not found.'; end if;

  select name into v_source_name from public.organizations where id = v_before.source_organization_id;
  select name into v_target_name from public.organizations where id = v_before.target_organization_id;

  delete from public.organization_relationships where id = p_relationship_id;

  perform private.record_admin_audit_internal(
    v_admin,
    'organization.relationship_deleted',
    'organization_relationship',
    v_before.id::text,
    coalesce(v_source_name, v_before.source_organization_id) || ' → ' || coalesce(v_target_name, v_before.target_organization_id),
    trim(p_reason),
    to_jsonb(v_before),
    '{}'::jsonb,
    jsonb_build_object('relationshipType', v_before.relationship_type)
  );

  return true;
end;
$$;

revoke all on function public.admin_save_organization_relationship(jsonb) from public, anon;
revoke all on function public.admin_delete_organization_relationship(uuid, text) from public, anon;
grant execute on function public.admin_save_organization_relationship(jsonb) to authenticated;
grant execute on function public.admin_delete_organization_relationship(uuid, text) to authenticated;

comment on table public.organization_relationships is
  'Directional organization-to-organization relationships. Public brands remain distinct identities while operators, producers, co-promoters, ticketing providers, and other business relationships are modeled explicitly.';
comment on column public.organization_relationships.source_organization_id is
  'The organization performing the relationship action, e.g. Modern Lifestyle Events operates Bronze Party.';
comment on column public.organization_relationships.target_organization_id is
  'The organization receiving the relationship, e.g. Bronze Party is operated by Modern Lifestyle Events.';

-- Canonical production identities ------------------------------------------------
-- Keep the operator/company identity separate from attendee-facing event brands.
insert into public.organizations (
  id,
  name,
  slug,
  display_types,
  description_short,
  description_full,
  status
) values (
  'org-operator-modern-lifestyle-events',
  'Modern Lifestyle Events',
  'modern-lifestyle-events',
  array['producer']::text[],
  'Production organization behind multiple lifestyle event brands, including Bronze Party and Her Fantasy Party.',
  'Modern Lifestyle Events is modeled as an operator/producer identity rather than as an event brand. Its public-facing brands retain separate profiles, event histories, followers, media, and analytics.',
  'approved'
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  display_types = excluded.display_types,
  description_short = excluded.description_short,
  description_full = excluded.description_full,
  status = excluded.status;

insert into public.organizations (
  id,
  name,
  slug,
  display_types,
  description_short,
  description_full,
  operating_regions,
  globe_presence,
  status
) values (
  'org-promoter-her-fantasy-party',
  'Her Fantasy Party',
  'her-fantasy-party',
  array['event_brand','promoter','host']::text[],
  'A recurring lifestyle event brand at Twist SF with its own themed editions and audience format.',
  'Her Fantasy Party is a distinct public-facing event brand operated alongside Bronze Party rather than a sub-series of Bronze Party. Individual themed dates remain occurrences of the Her Fantasy Party series.',
  array['San Francisco Bay Area']::text[],
  jsonb_build_object(
    'visibility', 'visible',
    'regions', jsonb_build_array(jsonb_build_object(
      'id', 'san-francisco-bay-area',
      'label', 'San Francisco Bay Area',
      'city', 'San Francisco',
      'region', 'CA',
      'country', 'United States',
      'latitude', 37.7749,
      'longitude', -122.4194,
      'status', 'recurring'
    ))
  ),
  'approved'
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  display_types = excluded.display_types,
  description_short = excluded.description_short,
  description_full = excluded.description_full,
  operating_regions = excluded.operating_regions,
  globe_presence = excluded.globe_presence,
  status = excluded.status;

-- Bronze remains its own attendee-facing event brand.
update public.organizations
set display_types = (
      select array_agg(distinct item order by item)
      from unnest(display_types || array['event_brand']::text[]) item
    ),
    description_short = 'A Bay Area lifestyle event brand producing recurring screened parties, themed nights, private gatherings, and major holiday events at Twist SF and other venues.'
where id = 'org-promoter-bronze-party';

insert into public.organization_relationships (
  source_organization_id,
  target_organization_id,
  relationship_type,
  label,
  is_primary,
  notes
) values
  (
    'org-operator-modern-lifestyle-events',
    'org-promoter-bronze-party',
    'operates',
    'Operator',
    true,
    'Bronze Party remains a distinct public-facing brand.'
  ),
  (
    'org-operator-modern-lifestyle-events',
    'org-promoter-her-fantasy-party',
    'operates',
    'Operator',
    true,
    'Her Fantasy Party remains a distinct public-facing brand separate from Bronze Party.'
  )
on conflict (source_organization_id, target_organization_id, relationship_type)
do update set
  label = excluded.label,
  is_primary = excluded.is_primary,
  notes = excluded.notes;

-- Her Fantasy is its own public brand and its existing recurring series now points
-- to that identity. Keep the established series slug/id for route compatibility.
update public.event_series
set name = 'Her Fantasy Party',
    organizer_organization_id = 'org-promoter-her-fantasy-party',
    default_venue_id = 'venue-club-twist-sf'
where id = 'series-her-fantasy';

-- Normalize all current Her Fantasy occurrences to the new sibling brand. The
-- canonical listing trigger mirrors these columns back into compatibility JSON.
update public.listings
set owner_organization_id = 'org-promoter-her-fantasy-party',
    event_series_id = 'series-her-fantasy',
    venue_id = 'venue-club-twist-sf',
    payload = jsonb_set(
      coalesce(payload, '{}'::jsonb),
      '{hostName}',
      to_jsonb('her fantasy party'::text),
      true
    )
where listing_type = 'event'
  and (
    event_series_id = 'series-her-fantasy'
    or id in (
      'event-her-fantasy-back-to-school-twist-2026-08-16',
      'event-her-fantasy-kink-twist-2026-08-02',
      'event-her-fantasy-white-party-twist-2026-08-30'
    )
  );

-- This Bronze-branded occurrence was still missing its explicit series/venue link.
update public.listings
set event_series_id = 'series-bronze-party',
    venue_id = 'venue-club-twist-sf'
where id = 'event-bronze-very-little-black-dress-twist-2026-09-06'
  and listing_type = 'event';
