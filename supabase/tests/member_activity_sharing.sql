
-- Run against a database with one active administrator and one active member.
-- Everything written by this verification is rolled back.
begin;
select set_config('test.member_id', (select id::text from public.profiles where status='active' and role <> 'admin' order by created_at limit 1), true);
select set_config('test.admin_id', (select id::text from public.profiles where status='active' and role = 'admin' order by created_at limit 1), true);
do $$ begin
  if nullif(current_setting('test.member_id'), '') is null or nullif(current_setting('test.admin_id'), '') is null then raise exception 'Active test accounts required.'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.member_id'), true);
do $$ begin
  perform public.set_member_activity_sharing(false);
  if public.get_member_activity_sharing() then raise exception 'Default/withdrawn sharing must be off'; end if;
  perform public.record_member_activity('page_view','/clubs/activity-verification');
  begin
    perform public.admin_get_member_activity(current_setting('test.member_id')::uuid);
    raise exception 'Non-admin activity read was allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from private.member_activity_events;
    raise exception 'Direct private-table read was allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if exists(select 1 from private.member_activity_events where user_id=current_setting('test.member_id')::uuid) then raise exception 'Off-state recorded events'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.member_id'), true);
select public.set_member_activity_sharing(true);
select public.record_member_activity('page_view','/clubs/activity-verification?secret=query#fragment');
select public.record_member_activity('page_view','/clubs/activity-verification');
select public.record_member_activity('page_view','/account/settings');
select public.record_member_activity('outbound','/clubs/activity-verification','club','activity-verification','https://example.com/tickets?secret=query#fragment');
select public.record_member_activity('save','/account/saved','club','activity-verification');
reset role;
do $$ begin
  if (select count(*) from private.member_activity_events where user_id=current_setting('test.member_id')::uuid and kind='page_view') <> 1 then raise exception 'Page deduplication/excluded-route failure'; end if;
  if exists(select 1 from private.member_activity_events where user_id=current_setting('test.member_id')::uuid and (path like '%?%' or destination like '%?%' or path like '/account%')) then raise exception 'Sensitive path/query captured'; end if;
end $$;
insert into private.member_activity_events(user_id,kind,path,occurred_at) values(current_setting('test.member_id')::uuid,'page_view','/clubs/expired-verification',now()-interval '31 days');
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.admin_id'), true);
do $$ declare report jsonb; begin
  report := public.admin_get_member_activity(current_setting('test.member_id')::uuid);
  if not (report->>'sharingEnabled')::boolean or (report->>'pageViews')::integer <> 1
    or (report->>'outboundClicks')::integer <> 1 or (report->>'saveActions')::integer <> 1 then raise exception 'Admin totals/retention mismatch'; end if;
  if report::text like '%private_note%' then raise exception 'Private notes exposed'; end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.member_id'), true);
select public.set_member_activity_sharing(false);
select public.record_member_activity('outbound','/clubs/activity-verification');
select set_config('request.jwt.claim.sub', current_setting('test.admin_id'), true);
do $$ begin
  if public.admin_get_member_activity(current_setting('test.member_id')::uuid) <> '{"sharingEnabled":false}'::jsonb then raise exception 'Withdrawal failed to hide activity'; end if;
end $$;
reset role;
do $$ begin
  if exists(select 1 from private.member_activity_events where user_id=current_setting('test.member_id')::uuid) then raise exception 'Withdrawal failed to clear history'; end if;
  if has_function_privilege('anon','public.admin_get_member_activity(uuid)','execute') then raise exception 'Guest RPC access'; end if;
  if has_function_privilege('anon','public.set_member_activity_sharing(boolean)','execute') then raise exception 'Guest setting access'; end if;
end $$;
select 'passed: opt-in, non-admin denial, raw-table denial, deduplication, query stripping, excluded routes, retention, withdrawal' as verification;
rollback;
