-- Send the member an in-app notification when moderation requests a written-review revision.
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
declare
  v_result jsonb;
  v_author uuid;
  v_target_name text;
  v_message text;
begin
  if auth.uid() is null or not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  if p_status not in ('approved','rejected','needs_revision') then
    raise exception 'Invalid moderation decision.';
  end if;

  select s.author_user_id,
         coalesce(l.name, o.name, 'your review')
    into v_author, v_target_name
  from public.feedback_written_revisions r
  join public.feedback_submissions s on s.id = r.feedback_submission_id
  left join public.listings l on l.id = coalesce(s.event_id, s.club_id)
  left join public.organizations o on o.id = s.organization_id
  where r.id = p_revision_id;

  v_result := public.feedback_moderate_written_revision(
    p_revision_id,
    p_status,
    nullif(trim(coalesce(p_reason_code, '')), ''),
    nullif(trim(coalesce(p_private_notes, '')), '')
  );

  if p_status = 'needs_revision' and v_author is not null then
    v_message := coalesce(
      nullif(trim(coalesce(p_private_notes, '')), ''),
      'Please update your written review before it can be published.'
    );
    perform private.emit_notification_internal(
      v_author,
      'listing_updates',
      'review_revision_requested',
      'Your review needs a revision',
      v_target_name || ': ' || v_message,
      '/account/contributions',
      jsonb_build_object('revisionId', p_revision_id, 'status', 'needs_revision'),
      'review-revision:' || p_revision_id::text,
      false
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.admin_moderate_written_review(uuid, public.feedback_written_moderation_status, text, text) from public, anon, authenticated;
grant execute on function public.admin_moderate_written_review(uuid, public.feedback_written_moderation_status, text, text) to authenticated;
