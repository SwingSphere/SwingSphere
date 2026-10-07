
begin;
select set_config('test.admin_id',(select id::text from public.profiles where role='admin' and status='active' order by created_at limit 1),true);
select set_config('test.member_id',(select id::text from public.profiles where role <> 'admin' and status='active' order by created_at limit 1),true);
select set_config('test.session_id',gen_random_uuid()::text,true);
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('test.issue_id', public.submit_site_issue(current_setting('test.session_id')::uuid,'/clubs/report-verification?secret=removed#removed','Verification page','listing','The hours on this listing appear to be outdated.','')::text,true);
do $$ begin
  begin perform public.admin_list_site_issues('all',50,0); raise exception 'Guest read allowed'; exception when insufficient_privilege then null; end;
  begin perform 1 from private.site_issue_reports; raise exception 'Guest raw read allowed'; exception when insufficient_privilege then null; end;
  begin perform public.submit_site_issue(current_setting('test.session_id')::uuid,'//external.example','Invalid path','bug','A deliberately invalid external path.',''); raise exception 'External path allowed'; exception when invalid_parameter_value then null; end;
  begin perform public.submit_site_issue(current_setting('test.session_id')::uuid,'/','Honeypot','bug','A deliberately invalid bot submission.','spam'); raise exception 'Honeypot allowed'; exception when invalid_parameter_value then null; end;
  begin perform public.submit_site_issue(current_setting('test.session_id')::uuid,'/','Short','bug','short',''); raise exception 'Short report allowed'; exception when invalid_parameter_value then null; end;
end $$;
select public.submit_site_issue(current_setting('test.session_id')::uuid,'/','Second','bug','The page control does not work when I click.','');
select public.submit_site_issue(current_setting('test.session_id')::uuid,'/','Third','bug','The page control still does not work for me.','');
do $$ begin
  begin
    perform public.submit_site_issue(current_setting('test.session_id')::uuid,'/','Fourth','bug','This exceeds the session report rate limit.','');
    raise exception 'Session limit not enforced' using errcode='22023';
  exception when raise_exception then null; end;
end $$;
reset role;
do $$ begin
  if (select page_path from private.site_issue_reports where id=current_setting('test.issue_id')::uuid) <> '/clubs/report-verification' then raise exception 'Query/fragment not stripped'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.member_id'),true);
do $$ begin
  begin perform public.admin_list_site_issues('all',50,0); raise exception 'Member admin read allowed'; exception when insufficient_privilege then null; end;
  begin perform public.admin_update_site_issue(current_setting('test.issue_id')::uuid,'resolved','not authorized'); raise exception 'Member moderation allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.admin_id'),true);
select public.admin_update_site_issue(current_setting('test.issue_id')::uuid,'in_review','Checking the public listing information.');
do $$ declare v_report jsonb; begin
  select item into v_report from jsonb_array_elements(public.admin_list_site_issues('all',100,0)->'items') item where item->>'id'=current_setting('test.issue_id');
  if v_report->>'status' <> 'in_review' or jsonb_array_length(v_report->'actions') <> 1 then raise exception 'Status or review audit missing'; end if;
  if v_report ? 'anonymous_session_id' or v_report ? 'reporter_user_id' then raise exception 'Reporter identifiers exposed'; end if;
end $$;
select public.admin_update_site_issue(current_setting('test.issue_id')::uuid,'resolved','Verified and corrected.');
reset role;
do $$ begin
  if (select count(*) from private.site_issue_actions where report_id=current_setting('test.issue_id')::uuid) <> 2 then raise exception 'Audit count mismatch'; end if;
end $$;
select 'passed: guest submission, private inbox, input validation, query stripping, rate limits, admin authorization, moderation status, audit history' as verification;
rollback;
