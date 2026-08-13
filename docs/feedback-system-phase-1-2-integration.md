# Feedback System Phase 1.2 — Supabase integration contract

## Scope

Phase 1.2 connects the completed Winter Masquerade event feedback UI to the installed Supabase RPC contract. It adds no migration and does not enable club, organization, moderation, notification, owner-analytics, or bulk bridge UI.

Frontend source identity and feedback identity remain distinct even though the current values match:

- `sourceEventId`: `event-community-winter-masquerade`
- `feedbackTargetId`: `event-community-winter-masquerade`
- target type/status: `event` / `active`

`feedbackTargetResolver.ts` is the only Phase 1.2 bridge registry. It never fabricates a target and verifies the public `feedback_target_events` row in Supabase mode.

## Installed RPC signatures

These signatures were read from `pg_proc` in the SwingSphere project on 2026-07-23. Parameter names, defaults, and returns below are authoritative for this adapter.

| RPC | Installed arguments | Return |
| --- | --- | --- |
| `feedback_list_for_target` | `p_target_type feedback_target_type, p_target_id text` | `SETOF jsonb` |
| `feedback_get_submission_by_id` | `p_submission_id uuid` | `jsonb` |
| `feedback_get_user_submission` | `p_target_type feedback_target_type, p_target_id text, p_visit_date date default null` | `jsonb` |
| `feedback_create_submission` | `p_target_type, p_target_id, p_overall_sentiment, p_experience_scope, p_visit_date default null, p_attendance_count_range default null, p_attendance_verification default self_reported, p_related_event_id default null, p_related_venue_id default null, p_signal_registry_version default 1, p_signals default []` | `jsonb` |
| `feedback_update_submission` | `p_submission_id, p_overall_sentiment, p_experience_scope, p_visit_date default null, p_attendance_count_range default null, p_attendance_verification default self_reported, p_related_event_id default null, p_related_venue_id default null, p_signals default []` | `jsonb` |
| `feedback_submit_written_revision` | `p_submission_id uuid, p_text text` | `jsonb` |
| `feedback_withdraw_submission` | `p_submission_id uuid` | `jsonb` |
| `feedback_create_safety_report` | `p_target_type, p_target_id, p_category, p_narrative, p_related_event_id default null, p_related_venue_id default null, p_evidence default []` | `uuid` |
| `feedback_aggregate` | `p_target_type feedback_target_type, p_target_id text` | `jsonb` |
| `feedback_list_approved_written` | `p_target_type, p_target_id, p_limit default 20, p_offset default 0` | table of submission ID, approved text/time, sentiment, scope, author screen name, and author handle |

The browser adapter does not call server-only lifecycle RPCs.

## Submission JSON mapping

The private helper currently returns camelCase JSON containing identity, target/context, sentiment, attendance, structured status, registry version, signals, written lifecycle, withdrawal time, and timestamps. `supabaseFeedbackMappers.ts` also accepts equivalent snake_case fields so the frontend domain does not depend on raw transport casing.

Signals arrive as `{ signalId, polarity }` and are separated into canonical positive/improvement ID arrays. A missing written row maps to `not_submitted`. Approved text and current draft remain separate.

Raw authorship and account UUIDs remain private to owner/staff pathways. The public approved-written projection deliberately includes only the author's current screen name and handle so an approved review can be credited. The destination profile may still be private; the handle opens a profile only when that member explicitly selected visible-by-link access.

## Create and update sequencing

`feedback_create_submission` has no written-text parameter. Therefore a new submission with optional text uses two trusted calls:

1. create structured feedback;
2. submit the text through `feedback_submit_written_revision`.

Structured updates call `feedback_update_submission` on the same lifecycle row. If text changed, the service follows with `feedback_submit_written_revision`. Approved text is never optimistically overwritten; authoritative state is reloaded after mutations.

The adapter never sends an author parameter. It checks the current Supabase user before private operations, while each installed RPC derives ownership from `auth.uid()`.

## Aggregate and approved-written reads

Supabase mode calls `feedback_aggregate` directly and never downloads raw submissions for browser aggregation.

Below threshold, the response contains only target identity, threshold, and `meetsThreshold: false`. The mapped `eligibleResponseCount`, sentiment fields, and signal fields are `null`; the UI does not invent or expose a count.

At threshold, the adapter maps the returned submission count, sentiment percentages, and ranked signal counts. Signal percentages are deterministically derived from the returned count and cohort size.

`feedback_list_approved_written` is a separate public pathway. It maps submission ID, approved text/time, sentiment, scope, author screen name, and author handle. Pending/rejected drafts, author UUIDs, moderator data, lifecycle internals, and safety data are absent. A clickable handle is not proof that the member has published a profile; private profiles resolve to the same unavailable state as missing profiles.

## Repository selection and environment

Set:

```text
VITE_FEEDBACK_REPOSITORY=supabase
```

Behavior:

- explicit `supabase` uses only RPC-backed records;
- explicit `mock` is development-only and uses only the v2 localStorage envelope;
- when the flag is omitted but both Supabase browser credentials exist, Supabase is selected;
- missing/invalid configuration fails closed;
- production rejects mock mode;
- network, permission, or RPC failures become an unavailable/error state and never fall back to localStorage;
- localStorage data is never uploaded or merged into Supabase.

## Session and concurrency behavior

`useEventFeedback` owns target resolution, aggregate loading, private user loading, and mutations.

- Logged-out sessions do not call private user-submission RPCs.
- User ID/event changes immediately clear private state and invalidate older requests.
- Account switch/sign-out cannot display the previous user’s feedback.
- Mutations are single-flight and expose distinct create/update/withdraw/safety states.
- Successful mutations refresh public and private authoritative state.
- The event page remains usable while the feedback section loads or fails.

## Safety reports

The installed safety RPC requires a category and narrative and returns only its UUID. The frontend therefore returns a minimal receipt instead of fabricating timestamps, case status, or reporter fields.

Production safety narrative is sent only to `feedback_create_safety_report`. It is never placed in signal arrays, public reads, or localStorage. Explicit mock mode intentionally stores only the non-sensitive category fixture and does not pretend to notify anyone.

## Stable frontend errors

Raw Postgres, PostgREST, RLS, RPC, and policy messages never reach the UI. `errors.ts` maps them to:

- `not_authenticated`
- `target_not_registered`
- `submission_not_found`
- `duplicate_submission`
- `withdrawn_terminal`
- `invalid_signal`
- `unsupported_registry_version`
- `permission_denied`
- `network_error`
- `server_error`

Development logging retains the original structured Supabase error for diagnosis. Program logic primarily branches on stable codes such as `42501`, `23505`, and `28000`, consistent with current Supabase error-handling guidance.

## Live verification status

Completed read-only against the connected SwingSphere project:

- installed signatures and function bodies inspected from PostgreSQL metadata;
- Winter Masquerade bridge row exists with matching `source_ref` and `active` status;
- aggregate returns the protected below-threshold shape with threshold 10 and no hidden metrics;
- approved-written RPC currently returns no rows;
- target table has explicit `SELECT` grants for both `anon` and `authenticated`.

Not executed:

- authenticated create/update/written/withdraw/safety lifecycle;
- duplicate prevention through a real signed-in browser session;
- sign-out state clearing in a browser;
- post-withdraw aggregate change.

Those checks require a real user session and would mutate the empty canonical Winter Masquerade dataset. They must not be claimed from service-role metadata inspection.

## Remaining entity dependency

Phase 1.2 has no remaining dependency for Winter Masquerade. Future club/organization expansion still depends on canonical club-versus-venue ownership, explicit bridge registration, and product approval for those entry surfaces. Do not bulk-register source entities or infer backend IDs.
