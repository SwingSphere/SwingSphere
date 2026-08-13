# Feedback event visibility policy handoff

## Final product policy

Public aggregate visibility is target-specific.

- Event occurrence: visible from the first eligible structured response.
- Club listing: full public aggregate begins at 10 eligible structured responses.
- Organization/promoter: remains at 10 until its dedicated flow is designed.

The entity being reviewed controls the policy. An event hosted inside a permanent club still uses the event policy. Its feedback describes that occurrence; it does not automatically modify the club aggregate.

## Event presentation stages

### 0 eligible responses

Return a no-feedback/below-threshold response without metrics.

### 1 eligible response

Return the eligible count, sentiment data, and selected structured themes. The frontend presents this as one guest perspective, not a community rating.

Do not describe a single response as `100% positive` in the hero.

### 2–4 eligible responses

Return aggregate counts and structured themes. The frontend labels this `Early guest feedback` and uses mention counts rather than percentage-led theme claims.

### 5 or more eligible responses

Return the normal percentage-based event aggregate and ranked themes. The frontend may show the positive percentage in the hero badge.

## Club behavior

Club aggregate behavior remains unchanged:

- fewer than 10 eligible responses: privacy-safe below-threshold response with no count, sentiment breakdown, or themes
- 10 or more eligible responses: full aggregate response

## Required Supabase changes

Update `feedback_aggregate(p_target_type, p_target_id)` so it chooses its public threshold by target type:

- `event` => 1
- `club` => 10
- `organization` => 10

For events with at least one eligible response, the RPC must return enough data for graduated display:

- `targetType`
- `targetId`
- `threshold` (1 for event)
- `meetsThreshold`
- `submissionCount`
- sentiment counts or percentages
- signal IDs, polarity, and mention counts

Do not return author identity, submission IDs, written drafts, moderation metadata, or safety-report data.

For clubs and organizations below threshold, continue suppressing all cohort counts and metrics.

## Registry configuration

The existing registry-version aggregate threshold of 10 must no longer be treated as a universal threshold for every target type. Either:

1. store target-specific thresholds in a dedicated configuration table, or
2. keep the club/organization threshold in the registry and explicitly override event occurrences to 1 inside the trusted aggregate function.

The first option is preferable if target policies will expand later.

Suggested configuration:

| target_type | public_threshold | percentage_display_threshold |
|---|---:|---:|
| event | 1 | 5 |
| club | 10 | 10 |
| organization | 10 | 10 |

`percentage_display_threshold` is presentation metadata; public aggregate eligibility for events begins at 1.

## Required tests

1. Event with 0 eligible responses returns no metrics.
2. Event with 1 eligible response returns count, sentiment, and themes.
3. Event with 2–4 eligible responses returns early aggregate data.
4. Event with 5 eligible responses returns full percentage-ready data.
5. Club with 9 eligible responses returns no metrics.
6. Club with 10 eligible responses returns full aggregate data.
7. Organization with 9 eligible responses remains suppressed.
8. Withdrawn, excluded, safety, pending-only, and invalid records remain excluded.
9. Event feedback does not alter its host club aggregate unless a separate club submission exists.
10. No public response exposes author identity or private written lifecycle data.

## Frontend status

The local frontend now supports:

- first event response as an individual guest perspective
- 2–4 event responses as early feedback
- 5+ event responses as percentage-led feedback
- hero badge wording that avoids `100% positive` for a single response
- the existing club threshold of 10

Production event behavior will remain limited by the installed RPC until the backend change above is applied.
