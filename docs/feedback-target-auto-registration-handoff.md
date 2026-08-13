# Feedback Target Auto-Registration Handoff

## Purpose

Remove the Winter Masquerade / Twist SF hard-coded allowlist and make every approved event or club reviewable without manually editing frontend code.

## Local implementation

- `lib/feedback/feedbackTargetResolver.ts`
  - Resolves event and club feedback targets generically by `source_ref`.
  - The backend target ID may differ from the frontend listing ID.
  - Mock mode remains deterministic and maps a source ID to itself.
- `lib/feedback/feedbackTargetRegistration.ts`
  - Calls the trusted `feedback_register_target` RPC for approved events and clubs.
  - Provides a backfill helper for all approved listings.
- `lib/api.ts`
  - Approval and approved listing-save paths register the feedback target before completing the local publish operation.
- `components/admin/AdminSettings.tsx`
  - Adds **Sync approved listings** for a one-time backfill or later reconciliation.

## Migration to apply

`supabase/migrations/20260724213000_feedback_target_auto_registration.sql`

The migration installs:

```text
feedback_register_target(
  p_target_type text,
  p_source_ref text,
  p_name text,
  p_status text default 'active'
) -> jsonb
```

Security behavior:

- authenticated session required;
- caller must have an active `profiles.role = 'admin'` record;
- only `event` and `club` targets are accepted;
- only active bridge records can be registered through this RPC;
- the browser still has no direct write grant on feedback target tables;
- repeated calls update the same ID and do not create duplicates.

## Required deployment sequence

1. Apply the migration to the production Supabase project.
2. Deploy the frontend.
3. Sign in with an active admin profile.
4. Open **Admin Panel → Platform Status**.
5. Click **Sync approved listings** once.
6. Confirm existing approved event and club counts appear in:
   - `feedback_target_events`
   - `feedback_target_clubs`
7. Create or approve a new test event and confirm its bridge record is added automatically.
8. Visit the event page and confirm the feedback invitation resolves without a manual registration.

## Current architecture limitation

SwingSphere listings are still primarily maintained in the current local/development listing system rather than canonical Supabase event and club tables. Auto-registration therefore runs from the trusted admin publish UI. When canonical listing tables are installed, registration should move into a database trigger or server-side publish transaction so listing publication and feedback registration become atomic.

## Failure behavior

If feedback-target registration fails during an approved save or approval:

- the operation throws a controlled error;
- the UI should report the publish failure;
- it does not silently publish a listing that cannot receive feedback.

Pending and rejected listings are never registered.
