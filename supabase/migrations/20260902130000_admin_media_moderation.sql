-- Admin-only media moderation mutation used by the Dev Image Library / Media QA workbench.
-- Keeps moderation writes behind a SECURITY DEFINER RPC and records every decision
-- in the existing append-only admin audit log.

-- Moderators need a complete queue, including pending/rejected assets uploaded by
-- other members. Keep that visibility inside normal RLS instead of using a service key.
drop policy if exists "Active admins can read all media assets" on public.media_assets;
create policy "Active admins can read all media assets"
on public.media_assets
for select
to authenticated
using (private.is_active_admin((select auth.uid())));

create or replace function public.admin_set_media_asset_status(
  p_asset_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.media_assets%rowtype;
  v_next_status text := lower(trim(coalesce(p_status, '')));
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

  if v_next_status not in ('pending_review', 'approved', 'rejected', 'archived') then
    raise exception 'Invalid media moderation status.' using errcode = '22023';
  end if;

  select *
  into v_asset
  from public.media_assets m
  where m.id = p_asset_id
  for update;

  if not found then
    raise exception 'Media asset no longer exists. Refresh the Image Library.' using errcode = 'P0002';
  end if;

  if v_asset.status = v_next_status then
    return jsonb_build_object(
      'updated', false,
      'assetId', v_asset.id,
      'status', v_asset.status,
      'previousStatus', v_asset.status
    );
  end if;

  update public.media_assets
  set status = v_next_status
  where id = v_asset.id;

  perform private.record_admin_audit_internal(
    auth.uid(),
    'MEDIA_ASSET_STATUS_CHANGED',
    'media_asset',
    v_asset.id::text,
    v_asset.owner_type || ':' || v_asset.owner_id::text,
    'Media moderation status changed from ' || v_asset.status || ' to ' || v_next_status || '.',
    jsonb_build_object('status', v_asset.status),
    jsonb_build_object('status', v_next_status),
    jsonb_build_object(
      'ownerType', v_asset.owner_type,
      'ownerId', v_asset.owner_id,
      'role', v_asset.role,
      'externalId', v_asset.external_id
    )
  );

  return jsonb_build_object(
    'updated', true,
    'assetId', v_asset.id,
    'status', v_next_status,
    'previousStatus', v_asset.status
  );
end;
$$;

revoke all on function public.admin_set_media_asset_status(uuid, text) from public, anon;
grant execute on function public.admin_set_media_asset_status(uuid, text) to authenticated;

comment on function public.admin_set_media_asset_status(uuid, text) is
  'Admin-only media moderation status update with append-only audit logging.';
