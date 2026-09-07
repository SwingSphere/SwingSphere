-- Guarded admin cleanup for unused media assets.
-- The function performs the database-side reference check and removes only the
-- media_assets row. Cloudflare deletion happens server-side afterwards when no
-- sibling metadata rows still point at the same external image.

create or replace function public.admin_delete_unused_media_asset(
  p_asset_id uuid,
  p_expected_external_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.media_assets%rowtype;
  v_owner_json jsonb;
  v_is_referenced boolean := false;
  v_has_role_media boolean := false;
  v_sibling_count integer := 0;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.status = 'active'
  ) then
    raise exception 'Active administrator access is required.' using errcode = '42501';
  end if;

  select *
  into v_asset
  from public.media_assets m
  where m.id = p_asset_id
  for update;

  if not found then
    raise exception 'Media asset no longer exists. Refresh the Image Library.' using errcode = 'P0002';
  end if;

  if nullif(trim(coalesce(p_expected_external_id, '')), '') is not null
     and v_asset.external_id <> trim(p_expected_external_id) then
    raise exception 'Media asset changed since the Image Library was loaded. Refresh before deleting.' using errcode = '40001';
  end if;

  select count(*)::integer
  into v_sibling_count
  from public.media_assets m
  where m.external_id = v_asset.external_id
    and m.id <> v_asset.id;

  if v_asset.owner_type in ('club', 'event') then
    select l.payload
    into v_owner_json
    from public.listings l
    where l.id = v_asset.owner_id::text
    limit 1;

    if v_owner_json is not null then
      if jsonb_typeof(v_owner_json -> 'mediaAssets') = 'array' then
        select exists (
          select 1
          from jsonb_array_elements(v_owner_json -> 'mediaAssets') item
          where item ->> 'role' = v_asset.role
        ) into v_has_role_media;

        if v_has_role_media then
          select exists (
            select 1
            from jsonb_array_elements(v_owner_json -> 'mediaAssets') item
            where item ->> 'id' = v_asset.id::text
          ) into v_is_referenced;
        end if;
      end if;

      if not v_has_role_media and v_sibling_count = 0 then
        v_is_referenced := position(v_asset.external_id in v_owner_json::text) > 0;
      end if;
    end if;

  elsif v_asset.owner_type = 'user' then
    select to_jsonb(p)
    into v_owner_json
    from public.profiles p
    where p.id = v_asset.owner_id
    limit 1;

    if v_sibling_count = 0 and v_owner_json is not null then
      v_is_referenced := position(v_asset.external_id in v_owner_json::text) > 0;
    end if;

    if not v_is_referenced and v_asset.role in ('avatar', 'hero') then
      v_is_referenced := exists (
        select 1
        from public.media_assets current_asset
        where current_asset.owner_type = 'user'
          and current_asset.owner_id = v_asset.owner_id
          and current_asset.role = v_asset.role
          and current_asset.status = 'approved'
          and current_asset.id = v_asset.id
          and current_asset.id = (
            select newest.id
            from public.media_assets newest
            where newest.owner_type = 'user'
              and newest.owner_id = v_asset.owner_id
              and newest.role = v_asset.role
              and newest.status = 'approved'
            order by newest.created_at desc
            limit 1
          )
      );
    end if;

  elsif v_asset.owner_type = 'venue' then
    select to_jsonb(v) into v_owner_json from public.venues v where v.id = v_asset.owner_id::text limit 1;
  elsif v_asset.owner_type = 'organization' then
    select to_jsonb(o) into v_owner_json from public.organizations o where o.id = v_asset.owner_id::text limit 1;
  elsif v_asset.owner_type = 'event_series' then
    select to_jsonb(s) into v_owner_json from public.event_series s where s.id = v_asset.owner_id::text limit 1;
  elsif v_asset.owner_type = 'club_brand' then
    select to_jsonb(b) into v_owner_json from public.club_brands b where b.id = v_asset.owner_id::text limit 1;
  elsif v_asset.owner_type = 'resort' then
    select to_jsonb(r) into v_owner_json from public.resorts r where r.id = v_asset.owner_id::text limit 1;
  elsif v_asset.owner_type = 'cruise_series' then
    select to_jsonb(c) into v_owner_json from public.cruise_series c where c.id = v_asset.owner_id::text limit 1;
  elsif v_asset.owner_type = 'cruise_sailing' then
    select to_jsonb(s) into v_owner_json from public.cruise_sailings s where s.id = v_asset.owner_id::text limit 1;
  end if;

  if v_asset.owner_type not in ('club', 'event', 'user')
     and v_sibling_count = 0
     and v_owner_json is not null then
    v_is_referenced := position(v_asset.external_id in v_owner_json::text) > 0;
  end if;

  if v_is_referenced then
    raise exception 'This image is still referenced by its current owner and cannot be deleted from the Image Library.' using errcode = '55000';
  end if;

  delete from public.media_assets where id = v_asset.id;

  return jsonb_build_object(
    'deleted', true,
    'assetId', v_asset.id,
    'externalId', v_asset.external_id,
    'retainedCloudflareImage', v_sibling_count > 0,
    'remainingReferences', v_sibling_count
  );
end;
$$;

revoke all on function public.admin_delete_unused_media_asset(uuid, text) from public, anon;
grant execute on function public.admin_delete_unused_media_asset(uuid, text) to authenticated;

comment on function public.admin_delete_unused_media_asset(uuid, text) is
  'Admin-only guarded deletion of a media_assets row after checking current owner references. Returns whether Cloudflare should be retained because sibling metadata references remain.';
