-- Admin RPCs for the written-review moderation queue.
-- Direct table reads are intentionally avoided in the browser UI so the queue
-- remains behind an explicit active-admin authorization boundary.

create or replace function public.admin_list_pending_written_reviews(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(item order by item."submittedAt" desc)
    from (
      select
        r.id as "revisionId",
        r.feedback_submission_id as "submissionId",
        r.text_content as "text",
        r.submitted_at as "submittedAt",
        case
          when s.event_id is not null then 'event'
          when s.club_id is not null then 'club'
          else 'organization'
        end as "targetType",
        coalesce(s.event_id, s.club_id, s.organization_id) as "targetId",
        coalesce(l.name, o.name, coalesce(s.event_id, s.club_id, s.organization_id)) as "targetName",
        coalesce(l.lifecycle_state, o.status) as "targetState"
      from public.feedback_written_revisions r
      join public.feedback_submissions s on s.id = r.feedback_submission_id
      left join public.listings l on l.id = coalesce(s.event_id, s.club_id)
      left join public.organizations o on o.id = s.organization_id
      where r.moderation_status = 'pending'
        and s.structured_status <> 'withdrawn'
      order by r.submitted_at desc
      limit greatest(1, least(coalesce(p_limit, 100), 200))
    ) item
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_moderate_written_review(
  p_revision_id uuid,
  p_status public.feedback_written_moderation_status,
  p_reason_code text default null,
  p_private_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return public.feedback_moderate_written_revision(
    p_revision_id,
    p_status,
    nullif(trim(coalesce(p_reason_code, '')), ''),
    nullif(trim(coalesce(p_private_notes, '')), '')
  );
end;
$$;

revoke all on function public.admin_list_pending_written_reviews(integer) from public, anon, authenticated;
revoke all on function public.admin_moderate_written_review(uuid, public.feedback_written_moderation_status, text, text) from public, anon, authenticated;
grant execute on function public.admin_list_pending_written_reviews(integer) to authenticated;
grant execute on function public.admin_moderate_written_review(uuid, public.feedback_written_moderation_status, text, text) to authenticated;
