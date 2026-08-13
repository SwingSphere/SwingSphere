-- Separate the fast public review from optional structured detail collection.
--
-- Launch product contract:
-- - a club/event review can be submitted with recommendation + written text only;
-- - club visit date is optional and is treated as private structured context;
-- - signal selections remain stored independently of organizer ownership so they
--   can later support aggregate insights and verified-organizer reporting;
-- - legacy mixed sentiment remains valid for historical rows, while the current
--   review UI creates only positive (recommend) or negative (wouldn't recommend).

alter table public.feedback_submissions
  drop constraint if exists feedback_submissions_check2;

comment on column public.feedback_submissions.visit_date is
  'Optional private structured context for club reviews. Not required to create the public review core and not exposed on an individual public review card.';

comment on table public.feedback_signal_selections is
  'Optional structured review details. Selections are not exposed on an individual public review card; they can support aggregate insights and future verified-organizer reporting.';

-- The original RPC required a club visit date to identify a member submission.
-- Reviews are now one member-facing lifecycle per target, with visit date as
-- optional private context, so exact visit-date matching is no longer required.
create or replace function public.feedback_get_user_submission(
  p_target_type public.feedback_target_type,
  p_target_id text,
  p_visit_date date default null::date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.feedback_submission_json(s.id)
  from public.feedback_submissions s
  where s.author_user_id = auth.uid()
    and (
      (p_target_type = 'event' and s.event_id = p_target_id)
      or (p_target_type = 'club' and s.club_id = p_target_id)
      or (p_target_type = 'organization' and s.organization_id = p_target_id)
    )
  order by
    case when s.structured_status = 'withdrawn' then 1 else 0 end,
    s.updated_at desc
  limit 1;
$$;

revoke all on function public.feedback_get_user_submission(
  public.feedback_target_type,
  text,
  date
) from public;
grant execute on function public.feedback_get_user_submission(
  public.feedback_target_type,
  text,
  date
) to authenticated, service_role;

-- Verified organizers receive aggregate patterns only. Individual signal choices
-- remain private to the member and SwingSphere moderation/admin pathways. Data for
-- an unclaimed target is retained; if that target is later attached to an
-- organization, its managers can immediately access the accumulated summary.
create or replace function public.feedback_private_signal_summary(
  p_target_type public.feedback_target_type,
  p_target_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organization_id text;
  v_response_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if p_target_type = 'club' then
    select target.organization_id
      into v_organization_id
      from public.feedback_target_clubs target
      where target.id = p_target_id;
  elsif p_target_type = 'event' then
    select coalesce(event_target.organization_id, club_target.organization_id)
      into v_organization_id
      from public.feedback_target_events event_target
      left join public.feedback_target_clubs club_target
        on club_target.id = event_target.club_id
      where event_target.id = p_target_id;
  elsif p_target_type = 'organization' then
    v_organization_id := p_target_id;
  end if;

  if not private.is_active_admin(auth.uid()) then
    if v_organization_id is null
       or not private.can_manage_organization(
         v_organization_id,
         array['owner','manager']::public.organization_member_role[]
       ) then
      raise exception 'Verified organizer access required.';
    end if;
  end if;

  select count(distinct submission.id)::integer
    into v_response_count
    from public.feedback_submissions submission
    join public.feedback_signal_selections selection
      on selection.feedback_submission_id = submission.id
    where submission.structured_status = 'eligible'
      and (
        (p_target_type = 'event' and submission.event_id = p_target_id)
        or (p_target_type = 'club' and submission.club_id = p_target_id)
        or (p_target_type = 'organization' and submission.organization_id = p_target_id)
      );

  return jsonb_build_object(
    'targetType', p_target_type,
    'targetId', p_target_id,
    'organizationId', v_organization_id,
    'structuredResponseCount', coalesce(v_response_count, 0),
    'positiveSignals', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'signalId', grouped.signal_id,
          'count', grouped.mention_count,
          'percentage', case
            when coalesce(v_response_count, 0) = 0 then 0
            else round((100.0 * grouped.mention_count / v_response_count)::numeric, 1)
          end
        )
        order by grouped.mention_count desc, grouped.signal_id
      )
      from (
        select selection.signal_id, count(distinct submission.id)::integer as mention_count
        from public.feedback_submissions submission
        join public.feedback_signal_selections selection
          on selection.feedback_submission_id = submission.id
        where submission.structured_status = 'eligible'
          and selection.polarity = 'positive'
          and (
            (p_target_type = 'event' and submission.event_id = p_target_id)
            or (p_target_type = 'club' and submission.club_id = p_target_id)
            or (p_target_type = 'organization' and submission.organization_id = p_target_id)
          )
        group by selection.signal_id
      ) grouped
    ), '[]'::jsonb),
    'improvementSignals', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'signalId', grouped.signal_id,
          'count', grouped.mention_count,
          'percentage', case
            when coalesce(v_response_count, 0) = 0 then 0
            else round((100.0 * grouped.mention_count / v_response_count)::numeric, 1)
          end
        )
        order by grouped.mention_count desc, grouped.signal_id
      )
      from (
        select selection.signal_id, count(distinct submission.id)::integer as mention_count
        from public.feedback_submissions submission
        join public.feedback_signal_selections selection
          on selection.feedback_submission_id = submission.id
        where submission.structured_status = 'eligible'
          and selection.polarity = 'improvement'
          and (
            (p_target_type = 'event' and submission.event_id = p_target_id)
            or (p_target_type = 'club' and submission.club_id = p_target_id)
            or (p_target_type = 'organization' and submission.organization_id = p_target_id)
          )
        group by selection.signal_id
      ) grouped
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.feedback_private_signal_summary(
  public.feedback_target_type,
  text
) from public;
grant execute on function public.feedback_private_signal_summary(
  public.feedback_target_type,
  text
) to authenticated, service_role;
