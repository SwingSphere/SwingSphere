-- Private issue inbox for bugs, listing corrections, broken links, and concerns.
create table private.site_issue_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid references public.profiles(id) on delete set null,
  anonymous_session_id uuid not null,
  page_path text not null check (length(page_path) between 1 and 500 and page_path like '/%' and page_path not like '//%'),
  page_title text not null default '' check (length(page_title) <= 160),
  category text not null check (category in ('listing','broken_link','bug','content_safety','other')),
  description text not null check (length(trim(description)) between 12 and 2000),
  status text not null default 'new' check (status in ('new','in_review','resolved','dismissed')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index site_issue_status_created_idx on private.site_issue_reports(status, created_at desc);
create index site_issue_reporter_created_idx on private.site_issue_reports(reporter_user_id, created_at desc);
create index site_issue_session_created_idx on private.site_issue_reports(anonymous_session_id, created_at desc);
create index site_issue_created_idx on private.site_issue_reports(created_at desc);
create table private.site_issue_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references private.site_issue_reports(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  previous_status text not null,
  next_status text not null,
  note text not null default '' check(length(note) <= 1000),
  created_at timestamptz not null default clock_timestamp()
);
create index site_issue_actions_report_idx on private.site_issue_actions(report_id, created_at desc);
alter table private.site_issue_reports enable row level security;
alter table private.site_issue_actions enable row level security;
revoke all on private.site_issue_reports, private.site_issue_actions from public, anon, authenticated;

create function private.submit_site_issue(p_session_id uuid, p_page_path text, p_page_title text, p_category text, p_description text, p_website text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_id uuid; v_path text;
begin
  if p_session_id is null then raise exception 'A browser session is required.' using errcode='22023'; end if;
  if coalesce(p_website, '') <> '' then raise exception 'Unable to submit this report.' using errcode='22023'; end if;
  if v_user is not null and not exists(select 1 from public.profiles where id=v_user and status='active') then
    raise exception 'An active account is required.' using errcode='42501';
  end if;
  if p_category is null or p_category not in ('listing','broken_link','bug','content_safety','other') then raise exception 'Choose a report category.' using errcode='22023'; end if;
  if p_description is null or length(trim(p_description)) not between 12 and 2000 then raise exception 'Please provide 12–2000 characters of detail.' using errcode='22023'; end if;
  v_path := split_part(split_part(coalesce(p_page_path,''), '?', 1), '#', 1);
  if length(v_path) not between 1 and 500 or v_path !~ '^/[^[:space:]]*$' or v_path like '//%' or v_path like '%\\%' then
    raise exception 'Invalid page path.' using errcode='22023';
  end if;
  -- Bound guest intake without retaining IP addresses. Session limits supplement
  -- an account limit and a global ceiling; this is not a CAPTCHA/identity check.
  perform pg_advisory_xact_lock(hashtext('swingsphere-site-issue-intake'));
  if (select count(*) from private.site_issue_reports where created_at > clock_timestamp()-interval '1 hour'
      and (anonymous_session_id=p_session_id or (v_user is not null and reporter_user_id=v_user))) >= 3 then
    raise exception 'Too many reports. Please try again in an hour.' using errcode='P0001';
  end if;
  if (select count(*) from private.site_issue_reports where created_at > clock_timestamp()-interval '1 hour') >= 100 then
    raise exception 'Reporting is busy. Please try again later.' using errcode='P0001';
  end if;
  insert into private.site_issue_reports(reporter_user_id,anonymous_session_id,page_path,page_title,category,description)
    values(v_user,p_session_id,v_path,left(coalesce(p_page_title,''),160),p_category,trim(p_description))
    returning id into v_id;
  return v_id;
end;
$$;

create function private.admin_list_site_issues(p_status text, p_limit integer, p_offset integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_admin(auth.uid()) then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_status is null or p_status not in ('open','all','new','in_review','resolved','dismissed') then raise exception 'Invalid status filter.'; end if;
  return jsonb_build_object(
    'total', (select count(*) from private.site_issue_reports where p_status='all' or (p_status='open' and status in ('new','in_review')) or status=p_status),
    'items', coalesce((select jsonb_agg(t) from (
      select r.id, r.page_path as "pagePath", r.page_title as "pageTitle", r.category, r.description, r.status,
        r.created_at as "createdAt", r.updated_at as "updatedAt", (r.reporter_user_id is not null) as "fromMember",
        coalesce((select jsonb_agg(a order by a."createdAt" desc) from (
          select previous_status as "previousStatus", next_status as "nextStatus", note, created_at as "createdAt"
          from private.site_issue_actions where report_id=r.id order by created_at desc limit 20
        ) a),'[]'::jsonb) as actions
      from private.site_issue_reports r
      where p_status='all' or (p_status='open' and r.status in ('new','in_review')) or r.status=p_status
      order by r.created_at desc limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,coalesce(p_offset,0))
    ) t),'[]'::jsonb));
end;
$$;

create function private.admin_update_site_issue(p_id uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_previous text;
begin
  if auth.uid() is null or not private.is_active_admin(auth.uid()) then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_status is null or p_status not in ('new','in_review','resolved','dismissed') then raise exception 'Invalid report status.'; end if;
  if length(coalesce(p_note,'')) > 1000 then raise exception 'Admin note is too long.'; end if;
  select status into v_previous from private.site_issue_reports where id=p_id for update;
  if not found then raise exception 'Report not found.'; end if;
  update private.site_issue_reports set status=p_status,updated_at=clock_timestamp() where id=p_id;
  insert into private.site_issue_actions(report_id,actor_user_id,previous_status,next_status,note)
    values(p_id,auth.uid(),v_previous,p_status,trim(coalesce(p_note,'')));
end;
$$;

create function public.submit_site_issue(p_session_id uuid, p_page_path text, p_page_title text, p_category text, p_description text, p_website text default '')
returns uuid language sql security invoker set search_path = ''
as $$ select private.submit_site_issue(p_session_id,p_page_path,p_page_title,p_category,p_description,p_website) $$;
create function public.admin_list_site_issues(p_status text default 'open', p_limit integer default 50, p_offset integer default 0)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.admin_list_site_issues(p_status,p_limit,p_offset) $$;
create function public.admin_update_site_issue(p_id uuid, p_status text, p_note text default '')
returns void language sql security invoker set search_path = ''
as $$ select private.admin_update_site_issue(p_id,p_status,p_note) $$;
revoke all on function private.submit_site_issue(uuid,text,text,text,text,text), private.admin_list_site_issues(text,integer,integer), private.admin_update_site_issue(uuid,text,text) from public,anon,authenticated;
revoke all on function public.submit_site_issue(uuid,text,text,text,text,text), public.admin_list_site_issues(text,integer,integer), public.admin_update_site_issue(uuid,text,text) from public,anon,authenticated;
grant usage on schema private to anon,authenticated;
grant execute on function private.submit_site_issue(uuid,text,text,text,text,text), public.submit_site_issue(uuid,text,text,text,text,text) to anon,authenticated;
grant execute on function private.admin_list_site_issues(text,integer,integer), private.admin_update_site_issue(uuid,text,text),
  public.admin_list_site_issues(text,integer,integer), public.admin_update_site_issue(uuid,text,text) to authenticated;
