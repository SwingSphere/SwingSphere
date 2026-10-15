-- Content Curator Admin Dashboard & Synchronization Bridge
-- Provides narrowly scoped, admin-only tables and RPCs connecting the local OpenClaw
-- Content Curator agent (authoritative operational SQLite state) with the SwingSphere
-- admin panel (authoritative published production catalog).
--
-- Security invariants:
-- 1. All tables enforce RLS with active-admin-only policies (`private.is_active_admin((select auth.uid()))`).
-- 2. Zero public/anon read or write access; unpublished candidates and staged artwork are never exposed publicly.
-- 3. Administrative commands are allow-listed, deduplicated by idempotency_key, explicitly acknowledged,
--    and recorded in the append-only admin audit log (`private.record_admin_audit_internal`).
-- 4. Event publication approval still uses the existing authorized `save_listing` + `admin_moderate_listing` workflow.

create table if not exists public.curator_sync_state (
  agent_id text primary key,
  display_name text not null default 'SwingSphere Content Curator',
  connection_status text not null default 'connected'
    check (connection_status in ('connected', 'degraded', 'offline')),
  bridge_mode text not null default 'narrow_scoped_sanitized_bridge',
  last_synced_at timestamptz not null default timezone('utc', now()),
  catalog_synced_at timestamptz,
  direct_publishing_enabled boolean not null default false
    check (direct_publishing_enabled = false),
  summary jsonb not null default '{}'::jsonb,
  creative_catalog jsonb not null default '{}'::jsonb,
  integrity jsonb not null default '{}'::jsonb,
  alerts jsonb not null default '[]'::jsonb,
  recent_operations jsonb not null default '[]'::jsonb,
  last_delta_hash text,
  sync_schedule jsonb not null default '{"intervalMinutes":15,"cronExpression":"*/15 * * * *","deltaMetadataPushOnly":true,"triggersWebsiteScans":false,"triggersEventExtraction":false,"triggersImageGeneration":false}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.curator_staged_candidates (
  id text primary key,
  club_id text,
  club_name text not null,
  host_id text,
  host_name text,
  title text not null,
  event_date text,
  candidate_type text not null default 'event',
  reconciliation_state text not null default 'new',
  review_state text not null default 'pending_review'
    check (review_state in (
      'pending_review',
      'approved',
      'staged_in_submissions',
      'rejected',
      'changes_requested',
      'possible_duplicate',
      'not_for_publication',
      'historical_not_for_publication',
      'excluded_closure_notice',
      'excluded_duplicate_translation'
    )),
  public_change_authorized boolean not null default false
    check (public_change_authorized = false),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists curator_staged_candidates_review_state_idx
  on public.curator_staged_candidates (review_state, event_date);

create table if not exists public.curator_staged_media (
  id text primary key,
  candidate_id text,
  club_id text,
  club_name text,
  event_title text not null,
  style_family text,
  sensuality_mode text,
  status text not null default 'pending_review'
    check (status in (
      'brief_ready',
      'generating',
      'pending_review',
      'needs_visual_review',
      'official_artwork_review',
      'existing_pair_preserved',
      'regeneration_requested',
      'approved',
      'rejected',
      'blocked_missing_facts',
      'failed'
    )),
  selected_version_id text,
  has_generated_pair boolean not null default false,
  validation_only boolean not null default false,
  public_publishing_authorized boolean not null default false
    check (public_publishing_authorized = false),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists curator_staged_media_status_idx
  on public.curator_staged_media (status, has_generated_pair);

create table if not exists public.curator_monitored_sources (
  id text primary key,
  name text not null,
  entity_type text not null default 'club'
    check (entity_type in ('club', 'promoter')),
  monitoring_tier text not null default 'normal'
    check (monitoring_tier in ('high', 'moderate', 'normal', 'low', 'static')),
  current_interval_days integer not null default 14
    check (current_interval_days between 1 and 365),
  extraction_status text not null default 'unattempted',
  last_successful_scan timestamptz,
  last_attempted_scan timestamptz,
  next_scan_at timestamptz,
  discovered_events_count integer not null default 0,
  paused boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists curator_monitored_sources_tier_idx
  on public.curator_monitored_sources (monitoring_tier, next_scan_at);

create table if not exists public.curator_job_summaries (
  id text primary key,
  name text not null,
  command text not null,
  schedule_expr text not null,
  schedule_tz text not null default 'America/Los_Angeles',
  enabled boolean not null default true,
  scheduler_status text not null default 'ok',
  extraction_outcome text not null default 'ok',
  last_run_at timestamptz,
  next_run_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.curator_command_queue (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  command_type text not null
    check (command_type in (
      'candidate_approve',
      'candidate_stage_submission',
      'candidate_reject',
      'candidate_request_changes',
      'artwork_approve',
      'artwork_reject',
      'artwork_regenerate',
      'artwork_select_version',
      'source_update_schedule',
      'source_request_scan',
      'agent_sync_bridge',
      'job_pause_all',
      'job_resume_all'
    )),
  target_id text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'acknowledged', 'failed')),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  acknowledged_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists curator_command_queue_status_idx
  on public.curator_command_queue (status, created_at desc);

-- Enable and force Row Level Security on all Content Curator bridge tables
alter table public.curator_sync_state enable row level security;
alter table public.curator_sync_state force row level security;

alter table public.curator_staged_candidates enable row level security;
alter table public.curator_staged_candidates force row level security;

alter table public.curator_staged_media enable row level security;
alter table public.curator_staged_media force row level security;

alter table public.curator_monitored_sources enable row level security;
alter table public.curator_monitored_sources force row level security;

alter table public.curator_job_summaries enable row level security;
alter table public.curator_job_summaries force row level security;

alter table public.curator_command_queue enable row level security;
alter table public.curator_command_queue force row level security;

-- Revoke public and anonymous access completely
revoke all on table public.curator_sync_state from public, anon;
revoke all on table public.curator_staged_candidates from public, anon;
revoke all on table public.curator_staged_media from public, anon;
revoke all on table public.curator_monitored_sources from public, anon;
revoke all on table public.curator_job_summaries from public, anon;
revoke all on table public.curator_command_queue from public, anon;

grant select on table public.curator_sync_state to authenticated;
grant select on table public.curator_staged_candidates to authenticated;
grant select on table public.curator_staged_media to authenticated;
grant select on table public.curator_monitored_sources to authenticated;
grant select on table public.curator_job_summaries to authenticated;
grant select on table public.curator_command_queue to authenticated;

-- Admin-only SELECT policies
drop policy if exists "Active admins can read curator sync state" on public.curator_sync_state;
create policy "Active admins can read curator sync state"
on public.curator_sync_state
for select
to authenticated
using (private.is_active_admin((select auth.uid())));

drop policy if exists "Active admins can read curator staged candidates" on public.curator_staged_candidates;
create policy "Active admins can read curator staged candidates"
on public.curator_staged_candidates
for select
to authenticated
using (private.is_active_admin((select auth.uid())));

drop policy if exists "Active admins can read curator staged media" on public.curator_staged_media;
create policy "Active admins can read curator staged media"
on public.curator_staged_media
for select
to authenticated
using (private.is_active_admin((select auth.uid())));

drop policy if exists "Active admins can read curator monitored sources" on public.curator_monitored_sources;
create policy "Active admins can read curator monitored sources"
on public.curator_monitored_sources
for select
to authenticated
using (private.is_active_admin((select auth.uid())));

drop policy if exists "Active admins can read curator job summaries" on public.curator_job_summaries;
create policy "Active admins can read curator job summaries"
on public.curator_job_summaries
for select
to authenticated
using (private.is_active_admin((select auth.uid())));

drop policy if exists "Active admins can read curator command queue" on public.curator_command_queue;
create policy "Active admins can read curator command queue"
on public.curator_command_queue
for select
to authenticated
using (private.is_active_admin((select auth.uid())));

-- Narrowly scoped, revocable machine credentials for unattended 15-minute OpenClaw bridge synchronization.
-- Stored in the unexposed `private` schema as SHA-256 digests only (plaintext tokens are never persisted).
-- Machine tokens can ONLY synchronize staging tables (`curator_*`) and drain/acknowledge queued curator commands.
-- They cannot read the admin dashboard, enqueue commands, or mutate any production catalog tables (`listings`, `venues`, `organizations`).
create schema if not exists private;

create table if not exists private.curator_bridge_machine_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  label text not null default 'openclaw-curator-bridge-15m',
  agent_id text not null default 'swingsphere-content-curator',
  scopes text[] not null default array['bridge:sync', 'commands:drain', 'commands:ack'],
  issued_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default (timezone('utc', now()) + interval '90 days'),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  last_used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

revoke all on table private.curator_bridge_machine_tokens from public, anon, authenticated;

create or replace function private.authorize_curator_bridge_sync(
  p_machine_token text default null,
  p_required_scope text default 'bridge:sync'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_clean_token text := trim(coalesce(p_machine_token, ''));
  v_hash text;
  v_token_row private.curator_bridge_machine_tokens%rowtype;
begin
  if v_uid is not null and private.is_active_admin(v_uid) then
    return true;
  end if;

  if v_clean_token = '' or char_length(v_clean_token) < 24 then
    return false;
  end if;

  v_hash := encode(extensions.digest(v_clean_token, 'sha256'), 'hex');

  select *
  into v_token_row
  from private.curator_bridge_machine_tokens t
  where t.token_hash = v_hash
    and t.revoked_at is null
    and t.expires_at > timezone('utc', now())
    and (p_required_scope is null or p_required_scope = any(t.scopes))
  limit 1;

  if not found then
    return false;
  end if;

  update private.curator_bridge_machine_tokens
  set last_used_at = timezone('utc', now())
  where id = v_token_row.id;

  return true;
end;
$$;

revoke all on function private.authorize_curator_bridge_sync(text, text) from public, anon, authenticated;

-- RPC 1: Read complete Curator dashboard snapshot for active administrators
create or replace function public.admin_get_curator_dashboard_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sync public.curator_sync_state%rowtype;
  v_active_tokens integer := 0;
  v_last_token_used timestamptz;
begin
  if auth.uid() is null or not private.is_active_admin(auth.uid()) then
    raise exception 'Active administrator access is required.' using errcode = '42501';
  end if;

  select *
  into v_sync
  from public.curator_sync_state
  order by updated_at desc
  limit 1;

  select count(*)::integer, max(last_used_at)
  into v_active_tokens, v_last_token_used
  from private.curator_bridge_machine_tokens
  where revoked_at is null
    and expires_at > timezone('utc', now());

  return jsonb_build_object(
    'connection', jsonb_build_object(
      'agentId', coalesce(v_sync.agent_id, 'swingsphere-content-curator'),
      'displayName', coalesce(v_sync.display_name, 'SwingSphere Content Curator'),
      'status', coalesce(v_sync.connection_status, 'offline'),
      'bridgeMode', coalesce(v_sync.bridge_mode, 'supabase_mirror_snapshot'),
      'authoritativeOperationalStore', 'OpenClaw SQLite (state/curator.sqlite)',
      'authoritativePublishedStore', 'SwingSphere Production Catalog (Supabase)',
      'lastSynchronizedAt', v_sync.last_synced_at,
      'catalogSyncedAt', v_sync.catalog_synced_at,
      'lastDeltaHash', v_sync.last_delta_hash,
      'bridgeSyncSchedule', coalesce(
        v_sync.sync_schedule,
        jsonb_build_object(
          'intervalMinutes', 15,
          'cronExpression', '*/15 * * * *',
          'deltaMetadataPushOnly', true,
          'triggersWebsiteScans', false,
          'triggersEventExtraction', false,
          'triggersImageGeneration', false
        )
      ),
      'machineCredentialStatus', jsonb_build_object(
        'activeTokenCount', v_active_tokens,
        'lastUsedAt', v_last_token_used
      ),
      'directPublishingEnabled', false
    ),
    'summary', coalesce(v_sync.summary, '{}'::jsonb),
    'creativeCatalog', coalesce(v_sync.creative_catalog, '{}'::jsonb),
    'candidates', coalesce((
      select jsonb_agg(c.payload order by c.event_date asc nulls last, c.id asc)
      from public.curator_staged_candidates c
    ), '[]'::jsonb),
    'mediaItems', coalesce((
      select jsonb_agg(m.payload order by m.has_generated_pair desc, m.id asc)
      from public.curator_staged_media m
    ), '[]'::jsonb),
    'monitoredSources', coalesce((
      select jsonb_agg(s.payload order by s.name asc)
      from public.curator_monitored_sources s
    ), '[]'::jsonb),
    'agentAndJobs', jsonb_build_object(
      'cronJobs', coalesce((
        select jsonb_agg(j.payload order by j.name asc)
        from public.curator_job_summaries j
      ), '[]'::jsonb),
      'alerts', coalesce(v_sync.alerts, '[]'::jsonb),
      'integrity', coalesce(v_sync.integrity, jsonb_build_object('checkedAt', null, 'warnings', '[]'::jsonb)),
      'recentOperations', coalesce(v_sync.recent_operations, '[]'::jsonb),
      'commandQueue', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'idempotencyKey', q.idempotency_key,
            'commandType', q.command_type,
            'targetId', q.target_id,
            'status', q.status,
            'actor', coalesce(q.actor_email, q.actor_id::text, 'admin'),
            'payload', q.payload,
            'result', q.result,
            'error', q.error_message,
            'createdAt', q.created_at,
            'updatedAt', q.updated_at
          )
          order by q.created_at desc
        )
        from (
          select *
          from public.curator_command_queue
          order by created_at desc
          limit 50
        ) q
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.admin_get_curator_dashboard_snapshot() from public, anon;
grant execute on function public.admin_get_curator_dashboard_snapshot() to authenticated;

-- RPC 2: Enqueue and deduplicate an allow-listed administrative curator command
create or replace function public.admin_enqueue_curator_command(
  p_idempotency_key text,
  p_command_type text,
  p_target_id text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_email text;
  v_clean_type text := trim(coalesce(p_command_type, ''));
  v_clean_target text := trim(coalesce(p_target_id, ''));
  v_clean_key text := trim(coalesce(p_idempotency_key, ''));
  v_existing public.curator_command_queue%rowtype;
  v_inserted public.curator_command_queue%rowtype;
begin
  if v_actor_id is null or not private.is_active_admin(v_actor_id) then
    raise exception 'Active administrator access is required.' using errcode = '42501';
  end if;

  if v_clean_type not in (
    'candidate_approve',
    'candidate_stage_submission',
    'candidate_reject',
    'candidate_request_changes',
    'artwork_approve',
    'artwork_reject',
    'artwork_regenerate',
    'artwork_select_version',
    'source_update_schedule',
    'source_request_scan',
    'agent_sync_bridge',
    'job_pause_all',
    'job_resume_all'
  ) then
    raise exception 'Command type is outside the authorized Content Curator allow-list.' using errcode = '22023';
  end if;

  if v_clean_target = '' then
    raise exception 'Command target_id is required.' using errcode = '22023';
  end if;

  if v_clean_key = '' then
    v_clean_key := encode(extensions.digest(v_clean_type || ':' || v_clean_target || ':' || coalesce(p_payload::text, '{}'), 'sha256'), 'hex');
  end if;

  select *
  into v_existing
  from public.curator_command_queue q
  where q.idempotency_key = v_clean_key
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'acknowledged', v_existing.status = 'acknowledged',
      'command', jsonb_build_object(
        'id', v_existing.id,
        'idempotencyKey', v_existing.idempotency_key,
        'commandType', v_existing.command_type,
        'targetId', v_existing.target_id,
        'status', v_existing.status,
        'createdAt', v_existing.created_at,
        'updatedAt', v_existing.updated_at,
        'result', v_existing.result
      )
    );
  end if;

  select coalesce(nullif(auth.jwt() ->> 'email', ''), p.display_name, p.handle, v_actor_id::text)
  into v_actor_email
  from public.profiles p
  where p.id = v_actor_id;

  insert into public.curator_command_queue (
    idempotency_key,
    command_type,
    target_id,
    status,
    actor_id,
    actor_email,
    payload
  )
  values (
    v_clean_key,
    v_clean_type,
    v_clean_target,
    'queued',
    v_actor_id,
    v_actor_email,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning * into v_inserted;

  perform private.record_admin_audit_internal(
    v_actor_id,
    'CURATOR_COMMAND_ENQUEUED',
    'curator_command',
    v_inserted.id::text,
    v_clean_type || ':' || v_clean_target,
    'Content Curator command ' || v_clean_type || ' enqueued for ' || v_clean_target || '.',
    null,
    jsonb_build_object(
      'commandType', v_clean_type,
      'targetId', v_clean_target,
      'idempotencyKey', v_clean_key,
      'status', v_inserted.status
    ),
    coalesce(p_payload, '{}'::jsonb)
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'acknowledged', false,
    'command', jsonb_build_object(
      'id', v_inserted.id,
      'idempotencyKey', v_inserted.idempotency_key,
      'commandType', v_inserted.command_type,
      'targetId', v_inserted.target_id,
      'status', v_inserted.status,
      'createdAt', v_inserted.created_at,
      'updatedAt', v_inserted.updated_at,
      'result', v_inserted.result
    )
  );
end;
$$;

revoke all on function public.admin_enqueue_curator_command(text, text, text, jsonb) from public, anon;
grant execute on function public.admin_enqueue_curator_command(text, text, text, jsonb) to authenticated;

-- RPC 3: Explicitly acknowledge a queued command after local OpenClaw execution
-- Supports either an active administrator JWT or a valid revocable machine token ('commands:ack' scope).
create or replace function public.admin_acknowledge_curator_command(
  p_command_id uuid,
  p_status text,
  p_result jsonb default '{}'::jsonb,
  p_error text default null,
  p_machine_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_cmd public.curator_command_queue%rowtype;
  v_next_status text := lower(trim(coalesce(p_status, 'acknowledged')));
begin
  if not private.authorize_curator_bridge_sync(p_machine_token, 'commands:ack') then
    raise exception 'Active administrator or valid curator machine credential is required.' using errcode = '42501';
  end if;

  if v_next_status not in ('processing', 'acknowledged', 'failed') then
    raise exception 'Invalid command acknowledgment status.' using errcode = '22023';
  end if;

  select *
  into v_cmd
  from public.curator_command_queue q
  where q.id = p_command_id
  for update;

  if not found then
    raise exception 'Curator command not found.' using errcode = 'P0002';
  end if;

  update public.curator_command_queue
  set status = v_next_status,
      result = coalesce(p_result, result),
      error_message = p_error,
      acknowledged_at = case when v_next_status = 'acknowledged' then timezone('utc', now()) else acknowledged_at end,
      updated_at = timezone('utc', now())
  where id = v_cmd.id
  returning * into v_cmd;

  perform private.record_admin_audit_internal(
    coalesce(v_actor_id, v_cmd.actor_id),
    'CURATOR_COMMAND_ACKNOWLEDGED',
    'curator_command',
    v_cmd.id::text,
    v_cmd.command_type || ':' || v_cmd.target_id,
    'Content Curator command ' || v_cmd.command_type || ' marked ' || v_next_status || '.',
    jsonb_build_object('status', 'queued'),
    jsonb_build_object('status', v_next_status, 'result', v_cmd.result),
    jsonb_build_object(
      'idempotencyKey', v_cmd.idempotency_key,
      'authMode', case when v_actor_id is not null then 'admin_jwt' else 'machine_token' end
    )
  );

  return jsonb_build_object(
    'ok', true,
    'commandId', v_cmd.id,
    'status', v_cmd.status,
    'acknowledgedAt', v_cmd.acknowledged_at
  );
end;
$$;

revoke all on function public.admin_acknowledge_curator_command(uuid, text, jsonb, text, text) from public;
grant execute on function public.admin_acknowledge_curator_command(uuid, text, jsonb, text, text) to anon, authenticated;

-- RPC 4: Synchronize sanitized OpenClaw bridge snapshot (full or delta-changed records) into admin-only staging tables
-- Supports either an active administrator JWT or a valid revocable machine token ('bridge:sync' scope).
create or replace function public.admin_sync_curator_bridge(
  p_snapshot jsonb,
  p_machine_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent_id text := coalesce(p_snapshot #>> '{connection,agentId}', 'swingsphere-content-curator');
  v_cand jsonb;
  v_media jsonb;
  v_source jsonb;
  v_job jsonb;
  v_cand_count integer := 0;
  v_media_count integer := 0;
  v_source_count integer := 0;
  v_job_count integer := 0;
begin
  if not private.authorize_curator_bridge_sync(p_machine_token, 'bridge:sync') then
    raise exception 'Active administrator or valid curator machine credential is required.' using errcode = '42501';
  end if;

  insert into public.curator_sync_state (
    agent_id,
    display_name,
    connection_status,
    bridge_mode,
    last_synced_at,
    catalog_synced_at,
    direct_publishing_enabled,
    summary,
    creative_catalog,
    integrity,
    alerts,
    recent_operations,
    last_delta_hash,
    sync_schedule,
    updated_at
  )
  values (
    v_agent_id,
    coalesce(p_snapshot #>> '{connection,displayName}', 'SwingSphere Content Curator'),
    coalesce(p_snapshot #>> '{connection,status}', 'connected'),
    coalesce(p_snapshot #>> '{connection,bridgeMode}', 'narrow_scoped_sanitized_bridge'),
    timezone('utc', now()),
    nullif(p_snapshot #>> '{connection,catalogSyncedAt}', '')::timestamptz,
    false,
    coalesce(p_snapshot -> 'summary', '{}'::jsonb),
    coalesce(p_snapshot -> 'creativeCatalog', '{}'::jsonb),
    coalesce(p_snapshot #> '{agentAndJobs,integrity}', '{}'::jsonb),
    coalesce(p_snapshot #> '{agentAndJobs,alerts}', '[]'::jsonb),
    coalesce(p_snapshot #> '{agentAndJobs,recentOperations}', '[]'::jsonb),
    nullif(p_snapshot #>> '{connection,lastDeltaHash}', ''),
    coalesce(
      p_snapshot #> '{connection,bridgeSyncSchedule}',
      jsonb_build_object(
        'intervalMinutes', 15,
        'cronExpression', '*/15 * * * *',
        'deltaMetadataPushOnly', true,
        'triggersWebsiteScans', false,
        'triggersEventExtraction', false,
        'triggersImageGeneration', false
      )
    ),
    timezone('utc', now())
  )
  on conflict (agent_id) do update
  set display_name = excluded.display_name,
      connection_status = excluded.connection_status,
      bridge_mode = excluded.bridge_mode,
      last_synced_at = excluded.last_synced_at,
      catalog_synced_at = coalesce(excluded.catalog_synced_at, public.curator_sync_state.catalog_synced_at),
      summary = case when excluded.summary = '{}'::jsonb then public.curator_sync_state.summary else excluded.summary end,
      creative_catalog = case when excluded.creative_catalog = '{}'::jsonb then public.curator_sync_state.creative_catalog else excluded.creative_catalog end,
      integrity = case when excluded.integrity = '{}'::jsonb then public.curator_sync_state.integrity else excluded.integrity end,
      alerts = excluded.alerts,
      recent_operations = excluded.recent_operations,
      last_delta_hash = coalesce(excluded.last_delta_hash, public.curator_sync_state.last_delta_hash),
      sync_schedule = coalesce(excluded.sync_schedule, public.curator_sync_state.sync_schedule),
      updated_at = excluded.updated_at;

  for v_cand in select * from jsonb_array_elements(coalesce(p_snapshot -> 'candidates', '[]'::jsonb))
  loop
    insert into public.curator_staged_candidates (
      id,
      club_id,
      club_name,
      host_id,
      host_name,
      title,
      event_date,
      candidate_type,
      reconciliation_state,
      review_state,
      public_change_authorized,
      payload,
      updated_at
    )
    values (
      v_cand ->> 'id',
      v_cand ->> 'clubId',
      coalesce(v_cand ->> 'clubName', 'Unknown Club'),
      v_cand ->> 'hostId',
      v_cand ->> 'hostName',
      coalesce(v_cand ->> 'title', 'Untitled Event'),
      v_cand ->> 'date',
      coalesce(v_cand ->> 'candidateType', 'event'),
      coalesce(v_cand ->> 'reconciliationState', 'new'),
      coalesce(v_cand ->> 'reviewState', 'pending_review'),
      false,
      v_cand,
      timezone('utc', now())
    )
    on conflict (id) do update
    set club_id = excluded.club_id,
        club_name = excluded.club_name,
        host_id = excluded.host_id,
        host_name = excluded.host_name,
        title = excluded.title,
        event_date = excluded.event_date,
        candidate_type = excluded.candidate_type,
        reconciliation_state = excluded.reconciliation_state,
        review_state = excluded.review_state,
        public_change_authorized = false,
        payload = excluded.payload,
        updated_at = excluded.updated_at;
    v_cand_count := v_cand_count + 1;
  end loop;

  for v_media in select * from jsonb_array_elements(coalesce(p_snapshot -> 'mediaItems', '[]'::jsonb))
  loop
    insert into public.curator_staged_media (
      id,
      candidate_id,
      club_id,
      club_name,
      event_title,
      style_family,
      sensuality_mode,
      status,
      selected_version_id,
      has_generated_pair,
      validation_only,
      public_publishing_authorized,
      payload,
      updated_at
    )
    values (
      v_media ->> 'id',
      v_media ->> 'candidateId',
      v_media ->> 'clubId',
      v_media ->> 'clubName',
      coalesce(v_media ->> 'eventTitle', v_media ->> 'id'),
      v_media ->> 'styleFamily',
      v_media #>> '{sensualityDirection,mode}',
      coalesce(v_media ->> 'status', 'pending_review'),
      v_media ->> 'selectedVersionId',
      coalesce((v_media ->> 'hasGeneratedPair')::boolean, false),
      coalesce((v_media ->> 'validationOnly')::boolean, false),
      false,
      v_media,
      timezone('utc', now())
    )
    on conflict (id) do update
    set candidate_id = excluded.candidate_id,
        club_id = excluded.club_id,
        club_name = excluded.club_name,
        event_title = excluded.event_title,
        style_family = excluded.style_family,
        sensuality_mode = excluded.sensuality_mode,
        status = excluded.status,
        selected_version_id = excluded.selected_version_id,
        has_generated_pair = excluded.has_generated_pair,
        validation_only = excluded.validation_only,
        public_publishing_authorized = false,
        payload = excluded.payload,
        updated_at = excluded.updated_at;
    v_media_count := v_media_count + 1;
  end loop;

  for v_source in select * from jsonb_array_elements(coalesce(p_snapshot -> 'monitoredSources', '[]'::jsonb))
  loop
    insert into public.curator_monitored_sources (
      id,
      name,
      entity_type,
      monitoring_tier,
      current_interval_days,
      extraction_status,
      last_successful_scan,
      last_attempted_scan,
      next_scan_at,
      discovered_events_count,
      paused,
      payload,
      updated_at
    )
    values (
      v_source ->> 'id',
      coalesce(v_source ->> 'name', v_source ->> 'id'),
      coalesce(v_source ->> 'entityType', 'club'),
      coalesce(v_source ->> 'monitoringTier', 'normal'),
      coalesce((v_source ->> 'currentIntervalDays')::integer, 14),
      coalesce(v_source ->> 'extractionStatus', 'unattempted'),
      nullif(v_source ->> 'lastSuccessfulScan', '')::timestamptz,
      nullif(v_source ->> 'lastAttemptedScan', '')::timestamptz,
      nullif(v_source ->> 'nextScanAt', '')::timestamptz,
      coalesce((v_source ->> 'discoveredEventsCount')::integer, 0),
      coalesce((v_source ->> 'paused')::boolean, false),
      v_source,
      timezone('utc', now())
    )
    on conflict (id) do update
    set name = excluded.name,
        entity_type = excluded.entity_type,
        monitoring_tier = excluded.monitoring_tier,
        current_interval_days = excluded.current_interval_days,
        extraction_status = excluded.extraction_status,
        last_successful_scan = excluded.last_successful_scan,
        last_attempted_scan = excluded.last_attempted_scan,
        next_scan_at = excluded.next_scan_at,
        discovered_events_count = excluded.discovered_events_count,
        paused = excluded.paused,
        payload = excluded.payload,
        updated_at = excluded.updated_at;
    v_source_count := v_source_count + 1;
  end loop;

  for v_job in select * from jsonb_array_elements(coalesce(p_snapshot #> '{agentAndJobs,cronJobs}', '[]'::jsonb))
  loop
    insert into public.curator_job_summaries (
      id,
      name,
      command,
      schedule_expr,
      schedule_tz,
      enabled,
      scheduler_status,
      extraction_outcome,
      last_run_at,
      next_run_at,
      payload,
      updated_at
    )
    values (
      coalesce(v_job ->> 'id', v_job ->> 'name'),
      coalesce(v_job ->> 'name', 'curator-job'),
      coalesce(v_job ->> 'command', 'scan'),
      coalesce(v_job #>> '{schedule,expr}', ''),
      coalesce(v_job #>> '{schedule,tz}', 'America/Los_Angeles'),
      coalesce((v_job ->> 'enabled')::boolean, true),
      coalesce(v_job #>> '{schedulerOutcome,lastStatus}', 'ok'),
      coalesce(v_job #>> '{extractionOutcome,status}', 'ok'),
      nullif(v_job #>> '{schedulerOutcome,lastRunAt}', '')::timestamptz,
      nullif(v_job #>> '{schedulerOutcome,nextRunAt}', '')::timestamptz,
      v_job,
      timezone('utc', now())
    )
    on conflict (id) do update
    set name = excluded.name,
        command = excluded.command,
        schedule_expr = excluded.schedule_expr,
        schedule_tz = excluded.schedule_tz,
        enabled = excluded.enabled,
        scheduler_status = excluded.scheduler_status,
        extraction_outcome = excluded.extraction_outcome,
        last_run_at = excluded.last_run_at,
        next_run_at = excluded.next_run_at,
        payload = excluded.payload,
        updated_at = excluded.updated_at;
    v_job_count := v_job_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'syncedAt', timezone('utc', now()),
    'counts', jsonb_build_object(
      'candidates', v_cand_count,
      'mediaItems', v_media_count,
      'monitoredSources', v_source_count,
      'cronJobs', v_job_count
    )
  );
end;
$$;

revoke all on function public.admin_sync_curator_bridge(jsonb, text) from public;
grant execute on function public.admin_sync_curator_bridge(jsonb, text) to anon, authenticated;

-- RPC 5: List pending ('queued') curator commands for local OpenClaw reconciliation
-- Supports either an active administrator JWT or a valid revocable machine token ('commands:drain' scope).
create or replace function public.admin_list_pending_curator_commands(
  p_limit integer default 25,
  p_machine_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_safe_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  if not private.authorize_curator_bridge_sync(p_machine_token, 'commands:drain') then
    raise exception 'Active administrator or valid curator machine credential is required.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'idempotencyKey', q.idempotency_key,
        'commandType', q.command_type,
        'targetId', q.target_id,
        'status', q.status,
        'actor', coalesce(q.actor_email, q.actor_id::text, 'admin'),
        'payload', q.payload,
        'createdAt', q.created_at,
        'updatedAt', q.updated_at
      )
      order by q.created_at asc
    )
    from (
      select *
      from public.curator_command_queue
      where status = 'queued'
      order by created_at asc
      limit v_safe_limit
    ) q
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_list_pending_curator_commands(integer, text) from public;
grant execute on function public.admin_list_pending_curator_commands(integer, text) to anon, authenticated;

-- RPC 6: Issue a narrowly scoped, revocable machine token for unattended OpenClaw bridge synchronization (Active Admin only)
create or replace function public.admin_issue_curator_machine_token(
  p_label text default 'openclaw-curator-bridge-15m',
  p_expires_in_days integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_clean_label text := coalesce(nullif(trim(p_label), ''), 'openclaw-curator-bridge-15m');
  v_safe_days integer := least(greatest(coalesce(p_expires_in_days, 90), 1), 365);
  v_raw_token text;
  v_hash text;
  v_inserted private.curator_bridge_machine_tokens%rowtype;
begin
  if v_actor_id is null or not private.is_active_admin(v_actor_id) then
    raise exception 'Active administrator access is required to issue a machine credential.' using errcode = '42501';
  end if;

  v_raw_token := 'cur_mch_' || encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');

  insert into private.curator_bridge_machine_tokens (
    token_hash,
    label,
    agent_id,
    scopes,
    issued_by,
    expires_at
  )
  values (
    v_hash,
    v_clean_label,
    'swingsphere-content-curator',
    array['bridge:sync', 'commands:drain', 'commands:ack'],
    v_actor_id,
    timezone('utc', now()) + make_interval(days => v_safe_days)
  )
  returning * into v_inserted;

  perform private.record_admin_audit_internal(
    v_actor_id,
    'CURATOR_MACHINE_TOKEN_ISSUED',
    'curator_machine_token',
    v_inserted.id::text,
    v_clean_label,
    'Issued narrowly scoped revocable machine token for unattended OpenClaw bridge synchronization.',
    '{}'::jsonb,
    jsonb_build_object(
      'label', v_inserted.label,
      'scopes', v_inserted.scopes,
      'expiresAt', v_inserted.expires_at
    ),
    '{}'::jsonb
  );

  return jsonb_build_object(
    'ok', true,
    'tokenId', v_inserted.id,
    'label', v_inserted.label,
    'machineToken', v_raw_token,
    'scopes', v_inserted.scopes,
    'expiresAt', v_inserted.expires_at
  );
end;
$$;

revoke all on function public.admin_issue_curator_machine_token(text, integer) from public, anon;
grant execute on function public.admin_issue_curator_machine_token(text, integer) to authenticated;

-- RPC 7: Revoke a Content Curator bridge machine token immediately (Active Admin only)
create or replace function public.admin_revoke_curator_machine_token(
  p_token_id uuid,
  p_reason text default 'Revoked by administrator'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_row private.curator_bridge_machine_tokens%rowtype;
begin
  if v_actor_id is null or not private.is_active_admin(v_actor_id) then
    raise exception 'Active administrator access is required to revoke a machine credential.' using errcode = '42501';
  end if;

  update private.curator_bridge_machine_tokens
  set revoked_at = timezone('utc', now()),
      revoked_by = v_actor_id
  where id = p_token_id
    and revoked_at is null
  returning * into v_row;

  if not found then
    raise exception 'Active curator machine token not found.' using errcode = 'P0002';
  end if;

  perform private.record_admin_audit_internal(
    v_actor_id,
    'CURATOR_MACHINE_TOKEN_REVOKED',
    'curator_machine_token',
    v_row.id::text,
    v_row.label,
    coalesce(nullif(trim(p_reason), ''), 'Revoked by administrator'),
    jsonb_build_object('revokedAt', null),
    jsonb_build_object('revokedAt', v_row.revoked_at),
    '{}'::jsonb
  );

  return jsonb_build_object(
    'ok', true,
    'tokenId', v_row.id,
    'revokedAt', v_row.revoked_at
  );
end;
$$;

revoke all on function public.admin_revoke_curator_machine_token(uuid, text) from public, anon;
grant execute on function public.admin_revoke_curator_machine_token(uuid, text) to authenticated;

-- RPC 8: List Content Curator machine token metadata without hashes or secrets (Active Admin only)
create or replace function public.admin_list_curator_machine_tokens()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_admin(auth.uid()) then
    raise exception 'Active administrator access is required.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'label', t.label,
        'agentId', t.agent_id,
        'scopes', t.scopes,
        'expiresAt', t.expires_at,
        'revokedAt', t.revoked_at,
        'lastUsedAt', t.last_used_at,
        'createdAt', t.created_at
      )
      order by t.created_at desc
    )
    from private.curator_bridge_machine_tokens t
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_list_curator_machine_tokens() from public, anon;
grant execute on function public.admin_list_curator_machine_tokens() to authenticated;


