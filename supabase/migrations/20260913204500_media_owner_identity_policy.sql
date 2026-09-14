-- Resolve deterministic media owner UUIDs back to their canonical SwingSphere entity ids
-- so approved managed-media inserts can be authorized without weakening RLS.

create or replace function private.media_hash32(
  p_value text,
  p_seed bigint
)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_hash bigint := p_seed;
  v_bytes bytea := convert_to(coalesce(p_value, ''), 'UTF8');
  v_index integer;
begin
  if octet_length(v_bytes) = 0 then
    return mod(v_hash, 4294967296::bigint);
  end if;

  for v_index in 0..octet_length(v_bytes) - 1 loop
    v_hash := (v_hash # get_byte(v_bytes, v_index)::bigint);
    v_hash := mod(v_hash * 16777619::bigint, 4294967296::bigint);
  end loop;

  return v_hash;
end;
$$;

create or replace function private.media_owner_uuid(
  p_owner_type text,
  p_entity_id text
)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_id text := btrim(coalesce(p_entity_id, ''));
  v_source text;
  v_hex text;
begin
  if v_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return v_id::uuid;
  end if;

  v_source := coalesce(p_owner_type, '') || ':' || v_id;
  v_hex :=
    lpad(to_hex(private.media_hash32(v_source, 2166136261)), 8, '0') ||
    lpad(to_hex(private.media_hash32(v_source, 2246822519)), 8, '0') ||
    lpad(to_hex(private.media_hash32(v_source, 3266489917)), 8, '0') ||
    lpad(to_hex(private.media_hash32(v_source, 668265263)), 8, '0');

  return (
    substr(v_hex, 1, 8) || '-' ||
    substr(v_hex, 9, 4) || '-' ||
    '4' || substr(v_hex, 14, 3) || '-' ||
    'a' || substr(v_hex, 18, 3) || '-' ||
    substr(v_hex, 21, 12)
  )::uuid;
end;
$$;

create or replace function public.can_publish_managed_media_owner(
  p_owner_type text,
  p_owner_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := lower(btrim(coalesce(p_owner_type, '')));
  v_entity_id text;
begin
  if auth.uid() is null or p_owner_id is null then
    return false;
  end if;

  if private.is_active_admin(auth.uid()) then
    return true;
  end if;

  if v_type = 'organization' then
    select organization.id
      into v_entity_id
    from public.organizations organization
    where private.media_owner_uuid('organization', organization.id) = p_owner_id
    limit 1;
  elsif v_type in ('club', 'event') then
    select listing.id
      into v_entity_id
    from public.listings listing
    where listing.listing_type = v_type
      and private.media_owner_uuid(v_type, listing.id) = p_owner_id
    limit 1;

    if v_entity_id is null then
      select claim.entity_id
        into v_entity_id
      from public.listing_claims claim
      where claim.entity_type = v_type
        and claim.claimant_user_id = auth.uid()
        and claim.status = 'verified'
        and private.media_owner_uuid(v_type, claim.entity_id) = p_owner_id
      limit 1;
    end if;
  else
    return false;
  end if;

  if v_entity_id is null then
    return false;
  end if;

  return public.can_publish_managed_media(v_type, v_entity_id);
end;
$$;

revoke all on function public.can_publish_managed_media_owner(text, uuid) from public, anon;
grant execute on function public.can_publish_managed_media_owner(text, uuid) to authenticated;

comment on function public.can_publish_managed_media_owner(text, uuid) is
  'Maps the media_assets synthetic owner UUID back to its canonical entity id before checking managed-media publish authority.';

alter table public.media_assets enable row level security;

drop policy if exists "Authenticated users can create permitted media assets" on public.media_assets;

create policy "Authenticated users can create permitted media assets"
on public.media_assets
for insert
to authenticated
with check (
  created_by = auth.uid()
  and (owner_type <> 'user' or owner_id = auth.uid())
  and (
    status = 'pending_review'
    or (
      status = 'approved'
      and public.can_publish_managed_media_owner(owner_type, owner_id)
    )
  )
);

comment on policy "Authenticated users can create permitted media assets" on public.media_assets is
  'Allows ordinary uploads as pending_review and approved managed uploads only after resolving the media owner UUID back to an authorized club, event, or organization.';
