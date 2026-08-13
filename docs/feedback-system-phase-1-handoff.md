# Feedback System Phase 1.1 — Supabase handoff

> Phase 1.2 now implements the installed RPC adapter and Winter Masquerade integration. See `docs/feedback-system-phase-1-2-integration.md` for the authoritative transport signatures and live-integration behavior. This document remains the domain and backend-design reference.

## Phase boundary

Phase 1.1 is frontend/domain hardening only. It adds no Supabase migration, policy, RPC, Edge Function, or generated database type. Browser persistence is a versioned prototype adapter under `swingsphere:feedback:v2`.

The canonical contract is `FeedbackSubmission` in `lib/feedback/types.ts`. Normal feedback, written moderation, and safety reporting are intentionally different concerns:

- structured feedback can become aggregate-eligible independently of optional written text;
- written text has a published value plus a separately moderated current draft;
- withdrawal hides text and removes structured contribution without deleting the record;
- safety reports are distinct private records and never enter the normal submission collection.

## Canonical lifecycle

### Structured feedback

`structuredStatus` is `eligible | excluded | withdrawn`.

- The browser may submit sentiment, structured signal IDs, context, and a client-supported attendance claim.
- The browser must not choose `structuredStatus`.
- `eligible` contributes to aggregates even when written text is pending or rejected.
- `excluded` never contributes.
- `withdrawn` never contributes and requires `withdrawnAt`.
- Phase 1.1 does not support restoration or resubmission after withdrawal.

### Written experience

`writtenExperience` contains `currentDraftText`, `approvedText`, and `moderationStatus`.

- A first text submission is `pending` and has no public text.
- Approval copies the moderated revision to `approvedText`.
- A later revision changes `currentDraftText` and returns to `pending` while the prior `approvedText` stays public.
- Rejection or `needs_revision` does not erase a prior `approvedText`.
- Withdrawal suppresses both public and draft presentation without destroying moderation history.

The frontend helpers `getPublicWrittenText` and `hasPendingWrittenRevision` are the public-display contract.

### Attendance and target context

`attendanceVerification` is `self_reported | linked_event | platform_confirmed`.

- Clients may request only `self_reported` or `linked_event`.
- `platform_confirmed` is server-controlled and must be derived from trusted attendance evidence.
- Event feedback targets an event occurrence and repeats it as `relatedEventId`.
- Club feedback targets the club listing. `relatedVenueId` and `relatedEventId` are optional context only; they do not retarget the submission.
- Organization feedback targets the organization and uses explicit experience scope.

Every submission stores `signalRegistryVersion`. Phase 1.1 accepts version `1`; production must validate the version and signal applicability at the trusted boundary.

## Recommended tables

### `feedback_submissions`

One durable row for the structured feedback lifecycle:

- identity/ownership: `id`, `author_user_id`
- exactly one typed target FK: `event_id`, `club_id`, or `organization_id`, plus a target-type constraint
- optional context FKs: `related_event_id`, `related_venue_id`
- `overall_sentiment`, experience scope, visit date, attendance count range
- `attendance_verification`
- `structured_status`, `withdrawn_at`
- `signal_registry_version`
- `created_at`, `updated_at`

Use typed FKs rather than an unconstrained polymorphic `target_id`. The adapter may still return the normalized TypeScript `targetType + targetId` shape.

### `feedback_signal_selections`

One row per structured signal selection:

- `feedback_submission_id`
- `signal_id`
- `polarity` (`positive | improvement`)
- unique `(feedback_submission_id, signal_id, polarity)`

The trusted write path must validate registry version, target applicability, polarity, duplicates, and the cross-polarity rule.

### `feedback_written_experiences`

One 1:1 moderation projection per normal submission:

- `feedback_submission_id` primary/foreign key
- `current_draft_text`
- `approved_text`
- `moderation_status`
- `submitted_at`, `approved_at`, `updated_at`
- server-only moderation reason/actor fields as needed

For a durable audit trail, prefer immutable `feedback_written_revisions` rows plus a pointer/projection for the current and published revisions. Never overwrite the only approved copy when a user submits a replacement.

### `feedback_safety_reports`

A physically and logically separate private case table:

- reporter and typed target FKs, optional event/venue context
- private category, narrative/evidence fields
- case status, assignment, escalation, and immutable audit fields
- timestamps

Do not join this table into public feedback reads, aggregate views, owner dashboards, or normal feedback uniqueness rules.

### `feedback_moderation_actions`

Use immutable audit rows for text and safety decisions:

- subject type and subject/revision ID
- action, actor, trusted reason code, and private notes
- before/after state snapshots or references
- `created_at`

This table is moderator-only. It is not a public explanation surface and must not leak through organization ownership.

## Authority matrix

Client-supplied input:

- sentiment and structured signal selections
- current written revision text
- experience scope, self-reported visit date/count, optional context IDs
- `self_reported` or `linked_event` attendance claim
- withdrawal request

Server-controlled output:

- authenticated author identity, IDs, timestamps
- structured eligibility/exclusion and withdrawal transition
- `platform_confirmed` attendance
- approved text, moderation status/reason/actor/timestamps
- aggregate threshold and inclusion decision
- safety case status, visibility, assignment, and resolution
- registry-version acceptance and all target/ownership/uniqueness checks

Client validation is UX only. The database or trusted server boundary must repeat every invariant.

## Uniqueness and transitions

- Event: one lifecycle record per `(author_user_id, event_id)`.
- Club: one lifecycle record per `(author_user_id, club_id, visit_date)`.
- Organization: one lifecycle record per `(author_user_id, organization_id)`.
- Updating structured fields must not reset written moderation or remove the prior approved text.
- Submitting a written revision must not remove aggregate eligibility.
- Withdrawing must atomically set `structured_status = withdrawn` and `withdrawn_at`.
- Phase 1.1 treats withdrawn rows as terminal. Decide restoration/resubmission semantics before choosing a partial unique index.

## RLS and Data API contract

Enable RLS on every exposed table and configure explicit least-privilege grants; PostgreSQL grants and RLS policies are separate controls.

- Authenticated users insert only through a trusted path that derives `author_user_id = auth.uid()`.
- Owners can read their full normal submission and revision state.
- Owner updates require both `USING` and `WITH CHECK` ownership protection and a restricted column/operation surface.
- Anonymous/public clients read only threshold-safe aggregate RPC/view output and approved written projections, never raw submissions.
- Club/organization owners receive neither author identity nor pending/rejected text, moderation notes, or safety cases through ordinary ownership.
- Moderator authorization comes from trusted app metadata or a membership table, not user-editable metadata.
- Safety access is limited to the reporter where policy permits and designated safety staff.
- Index columns used by policies and target filters.

References: [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api), and [explicit Data API grants change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

## Public aggregate contract

The production query/RPC equivalent of `aggregateFeedback` must:

1. include only valid `structured_status = eligible` normal submissions;
2. exclude withdrawn, excluded, invalid-registry, and safety records;
3. return no percentages or rankings below the threshold (currently 10);
4. at threshold, return sentiment percentages and structured signal counts/rankings;
5. keep target filters exact and prevent small-cohort row/text leakage;
6. ignore written moderation status when deciding structured aggregate eligibility.

Written publication is a separate query that returns only approved text for non-withdrawn submissions.

## Repository adapter contract

The Supabase adapter implements:

- `listForTarget`
- `getSubmissionById`
- `getUserSubmission`
- `createSubmission`
- `updateSubmission` (structured fields only)
- `submitWrittenRevision`
- `withdrawSubmission`
- `createSafetyReport`

The browser mock uses a v2 envelope `{ schemaVersion: 2, submissions, safetyReports }`. It explicitly migrates compatible v1 arrays. Corrupt or incompatible v2 data resets to deterministic seed data instead of being silently interpreted as the current schema.

## Still mocked or intentionally unresolved

- eligibility is locally simulated after validation; there is no trusted attendance or moderation service;
- safety records remain browser-only and notify nobody;
- approved/rejected seed states are fictional lifecycle fixtures;
- no public written-review list is rendered yet;
- no club or organization feedback entry UI is enabled in this phase.

## Legacy compatibility

Legacy `ReviewList`, `ReviewModal`, and related review data remain intact. Community Notes and Community Signals are not restored. Club pages are not migrated to the new dialog, and the Community Host page remains placeholder-only. A later product phase should migrate one entry surface at a time after the Supabase adapter, moderation flow, and canonical club/venue relationships are live.

## Open questions before backend implementation

- What canonical tables own club listings versus physical venues?
- Which product evidence can support `linked_event` and `platform_confirmed` without adding friction?
- Can a withdrawn submission be restored, or may a new lifecycle record replace it?
- Does structured editing require an immutable audit history or temporary aggregate exclusion?
- Should every registry version remain executable for historical validation, or should selections snapshot their resolved meaning?
- What moderation SLA, appeal path, retention policy, and escalation process apply to written revisions and safety cases?
- Which aggregate dimensions remain safe against re-identification at the chosen threshold?
