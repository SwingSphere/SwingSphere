-- SwingSphere privacy-forward self-service account deletion lifecycle.
-- External Cloudflare Images are deleted by the server endpoint before the
-- authenticated user is allowed to finalize this transaction.

-- Retained moderation/safety/history records must survive account deletion
-- without retaining a profile foreign key.
alter table public.feedback_moderation_actions alter column actor_user_id drop not null;
alter table public.feedback_safety_reports alter column reporter_user_id drop not null;
alter table public.feedback_submissions alter column author_user_id drop not null;
alter table public.feedback_written_revisions alter column submitted_by drop not null;
alter table public.listing_claims alter column claimant_user_id drop not null;

alter table public.feedback_moderation_actions drop constraint if exists feedback_moderation_actions_actor_user_id_fkey;
alter table public.feedback_moderation_actions add constraint feedback_moderation_actions_actor_user_id_fkey foreign key(actor_user_id) references public.profiles(id) on delete set null;
alter table public.feedback_safety_reports drop constraint if exists feedback_safety_reports_reporter_user_id_fkey;
alter table public.feedback_safety_reports add constraint feedback_safety_reports_reporter_user_id_fkey foreign key(reporter_user_id) references public.profiles(id) on delete set null;
alter table public.feedback_submissions drop constraint if exists feedback_submissions_author_user_id_fkey;
alter table public.feedback_submissions add constraint feedback_submissions_author_user_id_fkey foreign key(author_user_id) references public.profiles(id) on delete set null;
alter table public.feedback_written_experiences drop constraint if exists feedback_written_experiences_moderated_by_fkey;
alter table public.feedback_written_experiences add constraint feedback_written_experiences_moderated_by_fkey foreign key(moderated_by) references public.profiles(id) on delete set null;
alter table public.feedback_written_revisions drop constraint if exists feedback_written_revisions_moderated_by_fkey;
alter table public.feedback_written_revisions add constraint feedback_written_revisions_moderated_by_fkey foreign key(moderated_by) references public.profiles(id) on delete set null;
alter table public.feedback_written_revisions drop constraint if exists feedback_written_revisions_submitted_by_fkey;
alter table public.feedback_written_revisions add constraint feedback_written_revisions_submitted_by_fkey foreign key(submitted_by) references public.profiles(id) on delete set null;
alter table public.listing_claims drop constraint if exists listing_claims_claimant_user_id_fkey;
alter table public.listing_claims add constraint listing_claims_claimant_user_id_fkey foreign key(claimant_user_id) references public.profiles(id) on delete set null;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'requested' check (status in ('requested','media_cleared','processing','completed','failed','cancelled')),
  receipt_code text not null unique default ('DEL-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  requested_at timestamptz not null default now(),
  media_cleared_at timestamptz,
  processing_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  media_count integer not null default 0 check (media_count >= 0),
  failure_code text,
  failure_detail text check (failure_detail is null or char_length(failure_detail) <= 1200),
  retained_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_deletion_one_open_request_idx
  on public.account_deletion_requests(user_id)
  where user_id is not null and status in ('requested','media_cleared','processing','failed');
create index if not exists account_deletion_status_idx
  on public.account_deletion_requests(status, requested_at);

create trigger account_deletion_requests_set_updated_at
  before update on public.account_deletion_requests
  for each row execute procedure public.set_updated_at();

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public, anon, authenticated;

create or replace function private.account_deletion_recent_auth()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_iat bigint;
begin
  if auth.uid() is null then return false; end if;
  begin
    v_iat := nullif(auth.jwt() ->> 'iat','')::bigint;
  exception when others then
    return false;
  end;
  return v_iat is not null and to_timestamp(v_iat) >= now() - interval '10 minutes';
end;
$$;

create or replace function private.account_deletion_blockers(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select role, status from public.profiles where id = p_user_id
  ), sole_owned as (
    select m.organization_id, o.name
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = p_user_id
      and m.status = 'active'
      and m.role = 'owner'
      and not exists (
        select 1 from public.organization_members other
        where other.organization_id = m.organization_id
          and other.user_id <> p_user_id
          and other.status = 'active'
          and other.role = 'owner'
      )
  )
  select coalesce(jsonb_agg(item),'[]'::jsonb)
  from (
    select jsonb_build_object('code','admin_account','message','Administrator accounts must be transferred or demoted by another administrator before deletion.') item
    from me where role = 'admin'
    union all
    select jsonb_build_object('code','sole_organization_owner','message',format('Transfer ownership of “%s” before deleting this account.',name),'organizationId',organization_id)
    from sole_owned
  ) blockers;
$$;

create or replace function public.account_deletion_preview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_blockers jsonb;
  v_media jsonb;
  v_request jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  v_blockers := private.account_deletion_blockers(v_user);
  select coalesce(jsonb_agg(jsonb_build_object('externalId',m.external_id,'role',m.role,'status',m.status) order by m.created_at),'[]'::jsonb)
    into v_media
  from public.media_assets m
  where m.owner_type='user' and m.owner_id=v_user;

  select to_jsonb(r) - 'user_id' into v_request
  from public.account_deletion_requests r
  where r.user_id=v_user and r.status in ('requested','media_cleared','processing','failed')
  order by r.requested_at desc limit 1;

  return jsonb_build_object(
    'canDelete', jsonb_array_length(v_blockers)=0,
    'recentAuthentication', private.account_deletion_recent_auth(),
    'blockers', v_blockers,
    'media', v_media,
    'mediaCount', jsonb_array_length(v_media),
    'request', v_request
  );
end;
$$;

create or replace function public.begin_my_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_blockers jsonb;
  v_media_count integer;
  v_request public.account_deletion_requests;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not private.account_deletion_recent_auth() then
    raise exception 'Please sign in again before deleting your account.';
  end if;
  if not exists(select 1 from public.profiles p where p.id=v_user and p.status in ('active','suspended')) then
    raise exception 'Account is unavailable.';
  end if;

  v_blockers := private.account_deletion_blockers(v_user);
  if jsonb_array_length(v_blockers) > 0 then
    raise exception 'Account deletion is blocked until required ownership or administrator transfers are complete.' using detail=v_blockers::text;
  end if;

  select count(*)::integer into v_media_count
  from public.media_assets m where m.owner_type='user' and m.owner_id=v_user;

  select * into v_request
  from public.account_deletion_requests r
  where r.user_id=v_user and r.status in ('requested','media_cleared','processing','failed')
  order by r.requested_at desc limit 1;

  if v_request.id is null then
    insert into public.account_deletion_requests(user_id,status,media_count)
    values(v_user,'requested',v_media_count)
    returning * into v_request;
  else
    update public.account_deletion_requests
    set status='requested', media_count=v_media_count, failed_at=null, failure_code=null, failure_detail=null,
        requested_at=now(), media_cleared_at=null, processing_at=null
    where id=v_request.id
    returning * into v_request;
  end if;

  perform private.emit_notification_internal(
    v_user,'security','account.deletion_requested','Account deletion requested',
    'A fresh account-deletion request was created. Deletion will only finish after external profile media is removed.',
    '/account/settings',jsonb_build_object('requestId',v_request.id,'receiptCode',v_request.receipt_code),
    'account-deletion:'||v_request.id||':requested',false
  );

  return jsonb_build_object('requestId',v_request.id,'receiptCode',v_request.receipt_code,'mediaCount',v_request.media_count,'status',v_request.status);
end;
$$;

create or replace function public.cancel_my_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.account_deletion_requests
  set status='cancelled', cancelled_at=now()
  where user_id=auth.uid() and status in ('requested','failed');
  return found;
end;
$$;

create or replace function public.admin_mark_account_deletion_media_cleared(
  p_request_id uuid,
  p_external_ids text[] default '{}'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.account_deletion_requests;
  v_expected text[];
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.'; end if;
  select * into v_request from public.account_deletion_requests where id=p_request_id for update;
  if v_request.id is null or v_request.user_id is null or v_request.status not in ('requested','failed') then
    raise exception 'Deletion request is unavailable.';
  end if;

  select coalesce(array_agg(m.external_id order by m.external_id),'{}'::text[]) into v_expected
  from public.media_assets m where m.owner_type='user' and m.owner_id=v_request.user_id;

  if v_expected is distinct from (
    select coalesce(array_agg(x order by x),'{}'::text[]) from unnest(coalesce(p_external_ids,'{}'::text[])) x
  ) then
    raise exception 'Media cleanup confirmation does not match the current user media set.';
  end if;

  update public.account_deletion_requests
  set status='media_cleared', media_cleared_at=now(), media_count=cardinality(v_expected), failed_at=null, failure_code=null, failure_detail=null
  where id=p_request_id;
  return true;
end;
$$;

create or replace function public.admin_fail_account_deletion(
  p_request_id uuid,
  p_failure_code text,
  p_failure_detail text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.'; end if;
  update public.account_deletion_requests
  set status='failed', failed_at=now(), failure_code=left(nullif(trim(p_failure_code),''),120), failure_detail=left(nullif(trim(p_failure_detail),''),1200)
  where id=p_request_id and status in ('requested','media_cleared','processing','failed');
  return found;
end;
$$;

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_request public.account_deletion_requests;
  v_blockers jsonb;
  v_receipt text;
  v_feedback_count integer := 0;
  v_safety_count integer := 0;
  v_claim_count integer := 0;
  v_listing_count integer := 0;
  v_click_count integer := 0;
  v_media_count integer := 0;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not private.account_deletion_recent_auth() then raise exception 'Please sign in again before deleting your account.'; end if;

  v_blockers := private.account_deletion_blockers(v_user);
  if jsonb_array_length(v_blockers) > 0 then
    raise exception 'Account deletion is blocked.' using detail=v_blockers::text;
  end if;

  select * into v_request
  from public.account_deletion_requests r
  where r.user_id=v_user and r.status='media_cleared'
  order by r.requested_at desc limit 1
  for update;
  if v_request.id is null then raise exception 'Server-confirmed media cleanup is required before account deletion.'; end if;

  update public.account_deletion_requests set status='processing',processing_at=now() where id=v_request.id;

  -- Keep published/structured moderation history, but remove account linkage and
  -- unpublished draft material. Approved review text remains anonymous.
  update public.feedback_written_experiences w
  set current_draft_text=w.approved_text,
      current_revision_id=w.approved_revision_id,
      moderated_by=case when w.moderated_by=v_user then null else w.moderated_by end
  where exists(select 1 from public.feedback_submissions s where s.id=w.feedback_submission_id and s.author_user_id=v_user);

  delete from public.feedback_written_revisions r
  using public.feedback_submissions s, public.feedback_written_experiences w
  where s.id=r.feedback_submission_id
    and w.feedback_submission_id=s.id
    and s.author_user_id=v_user
    and (w.approved_revision_id is null or r.id<>w.approved_revision_id);

  update public.feedback_written_revisions r
  set submitted_by=null,
      moderated_by=case when r.moderated_by=v_user then null else r.moderated_by end,
      private_notes=null
  where r.submitted_by=v_user or r.moderated_by=v_user;

  update public.feedback_submissions set author_user_id=null where author_user_id=v_user;
  get diagnostics v_feedback_count=row_count;
  update public.feedback_safety_reports set reporter_user_id=null where reporter_user_id=v_user;
  get diagnostics v_safety_count=row_count;
  update public.feedback_moderation_actions set actor_user_id=null where actor_user_id=v_user;
  update public.feedback_written_experiences set moderated_by=null where moderated_by=v_user;

  update public.listing_claims
  set claimant_user_id=null, claimant_note=null
  where claimant_user_id=v_user;
  get diagnostics v_claim_count=row_count;

  -- Remove contributor attribution embedded in listing payloads before the FK
  -- sets submitted_by to null during profile deletion.
  update public.listings
  set payload=payload-'postedByUserId', submitter_ref=null
  where submitted_by=v_user;
  get diagnostics v_listing_count=row_count;

  update public.outbound_click_events set user_id=null where user_id=v_user;
  get diagnostics v_click_count=row_count;

  with removed as (
    delete from public.outbound_click_daily_unique_users u
    where u.user_hash=md5(v_user::text||'|'||u.day::text)
    returning rollup_key
  ), grouped as (
    select rollup_key,count(*)::bigint c from removed group by rollup_key
  )
  update public.outbound_click_daily_rollups r
  set unique_user_count=greatest(0,r.unique_user_count-g.c),updated_at=now()
  from grouped g where g.rollup_key=r.rollup_key;

  select count(*)::integer into v_media_count
  from public.media_assets m where m.owner_type='user' and m.owner_id=v_user;
  if v_media_count <> v_request.media_count then
    raise exception 'User media changed after cleanup confirmation. Please retry account deletion.';
  end if;
  delete from public.media_assets where owner_type='user' and owner_id=v_user;

  -- User-owned saves, privacy settings, associations, membership rows, badges,
  -- notifications, and profile data are removed through existing profile FKs.
  v_receipt:=v_request.receipt_code;
  update public.account_deletion_requests
  set retained_summary=jsonb_build_object(
    'anonymousFeedbackRecords',v_feedback_count,
    'anonymousSafetyRecords',v_safety_count,
    'anonymousClaimRecords',v_claim_count,
    'detachedListingAttribution',v_listing_count,
    'anonymizedRawClicks',v_click_count,
    'deletedProfileMedia',v_media_count
  )
  where id=v_request.id;

  -- Supabase supports deleting Auth users directly. The profile row cascades from
  -- auth.users, after the retained-history FKs above have been made nullable.
  delete from auth.users where id=v_user;
  if not found then raise exception 'Auth identity could not be deleted.'; end if;

  update public.account_deletion_requests
  set status='completed',completed_at=now(),user_id=null
  where id=v_request.id;

  return jsonb_build_object('deleted',true,'receiptCode',v_receipt,'requestId',v_request.id);
end;
$$;

revoke all on function private.account_deletion_recent_auth() from public, anon, authenticated;
revoke all on function private.account_deletion_blockers(uuid) from public, anon, authenticated;
revoke all on function public.account_deletion_preview() from public, anon, authenticated;
revoke all on function public.begin_my_account_deletion() from public, anon, authenticated;
revoke all on function public.cancel_my_account_deletion() from public, anon, authenticated;
revoke all on function public.admin_mark_account_deletion_media_cleared(uuid,text[]) from public, anon, authenticated;
revoke all on function public.admin_fail_account_deletion(uuid,text,text) from public, anon, authenticated;
revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.account_deletion_preview() to authenticated;
grant execute on function public.begin_my_account_deletion() to authenticated;
grant execute on function public.cancel_my_account_deletion() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.admin_mark_account_deletion_media_cleared(uuid,text[]) to service_role;
grant execute on function public.admin_fail_account_deletion(uuid,text,text) to service_role;
