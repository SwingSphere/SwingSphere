-- SwingSphere durable in-app notifications + delivery state.

create table if not exists public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('listing_updates','claim_updates','achievements','security','admin_alerts')),
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('listing_updates','claim_updates','achievements','security','admin_alerts')),
  event_key text not null check (char_length(event_key) between 1 and 120),
  title text not null check (char_length(title) between 1 and 180),
  body text not null check (char_length(body) between 1 and 1200),
  action_url text check (action_url is null or char_length(action_url) <= 500),
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 240),
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists notifications_recipient_dedupe_idx
  on public.notifications(recipient_user_id, dedupe_key)
  where dedupe_key is not null;
create index if not exists notifications_recipient_created_idx
  on public.notifications(recipient_user_id, created_at desc);
create index if not exists notifications_recipient_unread_idx
  on public.notifications(recipient_user_id, created_at desc)
  where read_at is null and archived_at is null;

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null check (channel in ('in_app','email')),
  status text not null check (status in ('pending','delivered','blocked','failed','skipped')),
  provider text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text check (last_error is null or char_length(last_error) <= 1200),
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (notification_id, channel)
);

create index if not exists notification_deliveries_pending_idx
  on public.notification_deliveries(channel, status, created_at)
  where status in ('pending','failed');

create table if not exists public.notification_delivery_settings (
  singleton boolean primary key default true check (singleton),
  email_provider_enabled boolean not null default false,
  email_provider text,
  from_address text,
  updated_at timestamptz not null default now()
);

insert into public.notification_delivery_settings(singleton)
values (true)
on conflict(singleton) do nothing;

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute procedure public.set_updated_at();
create trigger notification_delivery_settings_set_updated_at
  before update on public.notification_delivery_settings
  for each row execute procedure public.set_updated_at();

alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_delivery_settings enable row level security;
revoke all on public.notification_preferences from public, anon, authenticated;
revoke all on public.notifications from public, anon, authenticated;
revoke all on public.notification_deliveries from public, anon, authenticated;
revoke all on public.notification_delivery_settings from public, anon, authenticated;

create or replace function private.notification_preference_enabled(
  p_user_id uuid,
  p_category text,
  p_channel text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_channel
    when 'in_app' then coalesce((
      select pref.in_app_enabled
      from public.notification_preferences pref
      where pref.user_id = p_user_id and pref.category = p_category
    ), true)
    when 'email' then coalesce((
      select pref.email_enabled
      from public.notification_preferences pref
      where pref.user_id = p_user_id and pref.category = p_category
    ), false)
    else false
  end;
$$;

create or replace function private.emit_notification_internal(
  p_recipient_user_id uuid,
  p_category text,
  p_event_key text,
  p_title text,
  p_body text,
  p_action_url text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_email_eligible boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_in_app boolean;
  v_email boolean;
  v_email_provider_enabled boolean;
  v_email_provider text;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_recipient_user_id and p.status = 'active'
  ) then
    return null;
  end if;

  v_in_app := private.notification_preference_enabled(p_recipient_user_id, p_category, 'in_app');
  v_email := p_email_eligible and private.notification_preference_enabled(p_recipient_user_id, p_category, 'email');

  if not v_in_app and not v_email then
    return null;
  end if;

  insert into public.notifications(
    recipient_user_id, category, event_key, title, body, action_url, metadata, dedupe_key
  ) values (
    p_recipient_user_id, p_category, p_event_key, p_title, p_body,
    nullif(trim(coalesce(p_action_url,'')), ''), coalesce(p_metadata,'{}'::jsonb),
    nullif(trim(coalesce(p_dedupe_key,'')), '')
  )
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select n.id into v_id
    from public.notifications n
    where n.recipient_user_id = p_recipient_user_id
      and n.dedupe_key = p_dedupe_key
    limit 1;
    return v_id;
  end if;

  insert into public.notification_deliveries(notification_id, channel, status, provider, delivered_at)
  values (
    v_id,
    'in_app',
    case when v_in_app then 'delivered' else 'skipped' end,
    'swingsphere',
    case when v_in_app then now() else null end
  );

  if v_email then
    select email_provider_enabled, email_provider
    into v_email_provider_enabled, v_email_provider
    from public.notification_delivery_settings
    where singleton = true;

    insert into public.notification_deliveries(
      notification_id, channel, status, provider, last_error
    ) values (
      v_id,
      'email',
      case when coalesce(v_email_provider_enabled,false) then 'pending' else 'blocked' end,
      v_email_provider,
      case when coalesce(v_email_provider_enabled,false) then null else 'Transactional email provider is not configured.' end
    );
  end if;

  return v_id;
end;
$$;

create or replace function private.notify_active_admins_internal(
  p_event_key text,
  p_title text,
  p_body text,
  p_action_url text default '/admin',
  p_metadata jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin record;
  v_count integer := 0;
begin
  for v_admin in
    select p.id from public.profiles p
    where p.role = 'admin' and p.status = 'active'
  loop
    if private.emit_notification_internal(
      v_admin.id, 'admin_alerts', p_event_key, p_title, p_body,
      p_action_url, p_metadata,
      case when p_dedupe_key is null then null else p_dedupe_key || ':' || v_admin.id::text end,
      true
    ) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.notification_preference_enabled(uuid,text,text) from public, anon, authenticated;
revoke all on function private.emit_notification_internal(uuid,text,text,text,text,text,jsonb,text,boolean) from public, anon, authenticated;
revoke all on function private.notify_active_admins_internal(text,text,text,text,jsonb,text) from public, anon, authenticated;

create or replace function public.list_my_notifications(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  category text,
  event_key text,
  title text,
  body text,
  action_url text,
  metadata jsonb,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.category, n.event_key, n.title, n.body, n.action_url, n.metadata, n.read_at, n.created_at
  from public.notifications n
  join public.notification_deliveries d
    on d.notification_id = n.id and d.channel = 'in_app' and d.status = 'delivered'
  where n.recipient_user_id = auth.uid()
    and n.archived_at is null
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit,50),100))
  offset greatest(coalesce(p_offset,0),0);
$$;

create or replace function public.notification_unread_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.notifications n
  join public.notification_deliveries d
    on d.notification_id = n.id and d.channel = 'in_app' and d.status = 'delivered'
  where n.recipient_user_id = auth.uid()
    and n.archived_at is null
    and n.read_at is null;
$$;

create or replace function public.mark_my_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id and recipient_user_id = auth.uid();
  return found;
end;
$$;

create or replace function public.mark_all_my_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  update public.notifications
  set read_at = now()
  where recipient_user_id = auth.uid() and read_at is null and archived_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.get_my_notification_preferences()
returns table (
  category text,
  in_app_enabled boolean,
  email_enabled boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with categories(category, sort_order) as (
    values
      ('listing_updates'::text, 10),
      ('claim_updates'::text, 20),
      ('achievements'::text, 30),
      ('security'::text, 40),
      ('admin_alerts'::text, 50)
  )
  select c.category,
         coalesce(p.in_app_enabled,true),
         coalesce(p.email_enabled,false)
  from categories c
  left join public.notification_preferences p
    on p.user_id = auth.uid() and p.category = c.category
  where c.category <> 'admin_alerts'
     or exists (select 1 from public.profiles me where me.id=auth.uid() and me.role='admin' and me.status='active')
  order by c.sort_order;
$$;

create or replace function public.save_my_notification_preference(
  p_category text,
  p_in_app_enabled boolean,
  p_email_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if p_category not in ('listing_updates','claim_updates','achievements','security','admin_alerts') then
    raise exception 'Unsupported notification category.';
  end if;
  if p_category = 'security' and not p_in_app_enabled then
    raise exception 'Security notifications cannot be disabled in-app.';
  end if;
  if p_category = 'admin_alerts' and not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;

  insert into public.notification_preferences(user_id, category, in_app_enabled, email_enabled)
  values(auth.uid(), p_category, p_in_app_enabled, p_email_enabled)
  on conflict(user_id, category) do update set
    in_app_enabled = excluded.in_app_enabled,
    email_enabled = excluded.email_enabled,
    updated_at = now();
  return true;
end;
$$;

create or replace function public.notification_delivery_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'inAppEnabled', true,
    'emailProviderEnabled', coalesce(s.email_provider_enabled,false),
    'emailProvider', s.email_provider,
    'fromAddress', s.from_address
  )
  from public.notification_delivery_settings s
  where s.singleton = true;
$$;

revoke all on function public.list_my_notifications(integer,integer) from public, anon, authenticated;
revoke all on function public.notification_unread_count() from public, anon, authenticated;
revoke all on function public.mark_my_notification_read(uuid) from public, anon, authenticated;
revoke all on function public.mark_all_my_notifications_read() from public, anon, authenticated;
revoke all on function public.get_my_notification_preferences() from public, anon, authenticated;
revoke all on function public.save_my_notification_preference(text,boolean,boolean) from public, anon, authenticated;
revoke all on function public.notification_delivery_status() from public, anon, authenticated;
grant execute on function public.list_my_notifications(integer,integer) to authenticated;
grant execute on function public.notification_unread_count() to authenticated;
grant execute on function public.mark_my_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_my_notifications_read() to authenticated;
grant execute on function public.get_my_notification_preferences() to authenticated;
grant execute on function public.save_my_notification_preference(text,boolean,boolean) to authenticated;
grant execute on function public.notification_delivery_status() to authenticated;

create or replace function private.notify_listing_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.submitted_by is not null and new.status = 'pending_approval' and new.provenance <> 'legacy' then
      perform private.emit_notification_internal(
        new.submitted_by, 'listing_updates', 'listing.received',
        'Submission received',
        format('Your %s “%s” was received and is waiting for review.', new.listing_type, new.name),
        '/account/contributions',
        jsonb_build_object('listingId',new.id,'listingType',new.listing_type,'status',new.status),
        'listing:' || new.id || ':received', true
      );
      perform private.notify_active_admins_internal(
        'admin.listing_submitted', 'New listing submission',
        format('A new %s submission, “%s”, is waiting for review.', new.listing_type, new.name),
        '/admin', jsonb_build_object('listingId',new.id,'listingType',new.listing_type),
        'admin:listing:' || new.id || ':submitted'
      );
    end if;
    return new;
  end if;

  if new.submitted_by is not null and (
    old.status is distinct from new.status or old.lifecycle_state is distinct from new.lifecycle_state
  ) then
    if new.lifecycle_state = 'rejected' and old.lifecycle_state is distinct from 'rejected' then
      perform private.emit_notification_internal(
        new.submitted_by, 'listing_updates', 'listing.rejected',
        'Submission not approved',
        format('Your submission “%s” was not approved. Open Contributions for its current status.', new.name),
        '/account/contributions', jsonb_build_object('listingId',new.id,'status',new.status,'lifecycleState',new.lifecycle_state),
        'listing:' || new.id || ':rejected:' || coalesce(new.last_moderated_at::text,new.updated_at::text), true
      );
    elsif new.status = 'approved' and new.lifecycle_state = 'active' and old.status is distinct from 'approved' then
      perform private.emit_notification_internal(
        new.submitted_by, 'listing_updates', 'listing.approved',
        'Submission approved',
        format('“%s” is now approved on SwingSphere.', new.name),
        '/account/contributions', jsonb_build_object('listingId',new.id,'status',new.status),
        'listing:' || new.id || ':approved:' || coalesce(new.published_at::text,new.updated_at::text), true
      );
    elsif new.status = 'flagged' and old.status is distinct from 'flagged' then
      perform private.emit_notification_internal(
        new.submitted_by, 'listing_updates', 'listing.review_needed',
        'Submission needs review',
        format('“%s” needs additional review before it can be published.', new.name),
        '/account/contributions', jsonb_build_object('listingId',new.id,'status',new.status),
        'listing:' || new.id || ':flagged:' || new.updated_at::text, true
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger listings_notification_delivery
  after insert or update of status, lifecycle_state on public.listings
  for each row execute procedure private.notify_listing_change();

create or replace function private.notify_listing_claim_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.claimant_user_id is not null then
      perform private.emit_notification_internal(
        new.claimant_user_id, 'claim_updates', 'claim.received',
        'Claim received',
        'Your listing claim was received and is waiting for verification.',
        null, jsonb_build_object('claimId',new.id,'entityType',new.entity_type,'entityId',new.entity_id,'status',new.status),
        'claim:' || new.id || ':received', true
      );
    end if;
    perform private.notify_active_admins_internal(
      'admin.claim_submitted', 'New listing claim',
      format('A new %s ownership/management claim is waiting for verification.', new.entity_type),
      '/admin', jsonb_build_object('claimId',new.id,'entityType',new.entity_type,'entityId',new.entity_id),
      'admin:claim:' || new.id || ':submitted'
    );
    return new;
  end if;

  if new.claimant_user_id is not null and old.status is distinct from new.status then
    perform private.emit_notification_internal(
      new.claimant_user_id, 'claim_updates', 'claim.' || new.status,
      case new.status
        when 'verified' then 'Claim verified'
        when 'denied' then 'Claim not verified'
        when 'information_requested' then 'More information requested'
        when 'under_review' then 'Claim under review'
        when 'revoked' then 'Claim access revoked'
        when 'withdrawn' then 'Claim withdrawn'
        else 'Claim status updated'
      end,
      case new.status
        when 'verified' then 'Your listing claim has been verified.'
        when 'denied' then 'Your listing claim could not be verified.'
        when 'information_requested' then 'SwingSphere needs more information to continue reviewing your listing claim.'
        when 'under_review' then 'Your listing claim is now under review.'
        when 'revoked' then 'Previously granted claim access has been revoked.'
        when 'withdrawn' then 'Your listing claim has been withdrawn.'
        else 'Your listing claim status changed.'
      end,
      null, jsonb_build_object('claimId',new.id,'entityType',new.entity_type,'entityId',new.entity_id,'status',new.status),
      'claim:' || new.id || ':' || new.status || ':' || new.updated_at::text, true
    );
  end if;
  return new;
end;
$$;

create trigger listing_claims_notification_delivery
  after insert or update of status on public.listing_claims
  for each row execute procedure private.notify_listing_claim_change();

create or replace function private.notify_user_badge_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_badge_name text;
begin
  select b.name into v_badge_name from public.badges b where b.id = new.badge_id;
  if tg_op = 'INSERT' or (old.revoked_at is not null and new.revoked_at is null) then
    perform private.emit_notification_internal(
      new.user_id, 'achievements', 'badge.awarded',
      'New achievement', format('You earned the “%s” achievement.', coalesce(v_badge_name,'SwingSphere badge')),
      '/account/achievements', jsonb_build_object('badgeId',new.badge_id,'awardId',new.id),
      'badge:' || new.id || ':awarded:' || new.awarded_at::text, true
    );
  end if;
  return new;
end;
$$;

create trigger user_badges_notification_delivery
  after insert or update of revoked_at on public.user_badges
  for each row execute procedure private.notify_user_badge_change();

-- Compatibility relation for the existing Platform Status capability probe.
create or replace view public.admin_notifications as
select n.*
from public.notifications n
where n.category = 'admin_alerts';
revoke all on public.admin_notifications from public, anon, authenticated;
