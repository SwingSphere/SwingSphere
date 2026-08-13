# SwingSphere User Data, Outbound Attribution, and Listing Claims

Status: implemented foundation, August 1, 2026

## Product principles

- Measure what SwingSphere helps people do, not who they are offline.
- Attribute value to listings, organizations, placements, and campaigns.
- Never provide promoters or sponsors with identifiable browsing histories.
- Verify authority over a listing rather than collecting legal identity documents.
- Store a verification decision and audit trail, not the underlying document.

## Outbound attribution

### Tracked actions

The reusable `TrackedExternalLink` component records:

- ticket and RSVP links
- booking links
- official websites
- social profiles
- email/contact actions
- directions links
- Google Calendar opens
- ICS downloads

Each event records the entity, destination category, destination domain, placement, product surface, optional organization/series/campaign context, device class, and a rotating browser-session identifier. Full destination URLs are not stored in the analytics tables. Incoming `ss_campaign` or `utm_campaign` values are normalized and retained only for the current browser session so a sponsored discovery visit can be attributed to a later outbound action.

### Raw and aggregate data

`outbound_click_events` contains short-lived operational events. It is not readable by anonymous or ordinary authenticated clients.

`outbound_click_daily_rollups` contains long-lived daily aggregate counts. It has no names, emails, full URLs, or readable user histories.

A click is marked `is_qualified = false` when the same browser session repeatedly opens the same entity/destination/domain combination within 30 minutes. Raw totals remain available internally while sponsor-facing reporting should normally use qualified clicks.

Daily unique-session and unique-user counts are created through one-way daily hashes. The temporary hash rows can be removed after the daily counts are finalized.

### Reporting language

Use:

- outbound clicks
- qualified outbound clicks
- ticket-page visits generated
- referral traffic
- calendar saves
- direction requests

Do not call an outbound click a ticket sale, booking, purchase, conversion, or attendance unless SwingSphere later receives a separate verified conversion signal.

### Access model

- Raw click rows: service/backend only.
- Aggregate reports: currently admin-only through `outbound_admin_summary`.
- Future promoter dashboards must authorize against canonical entity ownership before exposing organization-specific aggregates.
- Sponsors receive aggregates only.

### Retention

`outbound_apply_retention` currently supports this baseline:

- remove authenticated user linkage from raw events older than 30 days
- delete raw events older than 90 days
- delete daily unique hash rows older than 120 days
- retain non-identifying daily aggregate counts

The function is intentionally explicit. Before production launch, schedule it through Supabase Cron or another trusted scheduled backend and monitor each run.

Example scheduled call after an admin/service wrapper is established:

```sql
select public.outbound_apply_retention();
```

Do not call the retention RPC directly from a public browser workflow.

## Listing claims

### Preferred verification ladder

1. Official-domain email.
2. A response through a contact method already published by the organization.
3. A temporary challenge through an established official social account.
4. Website or domain-control challenge.
5. Invitation from an already verified organization owner.
6. Manual telephone, voice, or video confirmation.
7. Redacted business documentation only when less-sensitive methods are insufficient.

Government IDs are not part of the standard workflow.

### Database records

`listing_claims` stores:

- claimant account
- entity and optional organization
- requested role
- claim status
- verification method
- concise verification summary
- decision and reviewer
- evidence receipt/deletion timestamps
- expiration or revocation timestamps

It does not contain an upload path, attachment ID, document image, ID number, extracted document text, or government-ID field.

`claim_verification_actions` provides an append-only decision trail. The admin panel now includes a **Listing Claims** queue for reviewing these records without accepting document uploads.

### Claim lifecycle

Open states:

- `pending`
- `information_requested`
- `under_review`

Successful or terminal states:

- `verified`
- `denied`
- `withdrawn`
- `revoked`
- `superseded`

The claimant creates or withdraws a claim through controlled RPCs. Review actions require an active administrator account.

Approval of a claim does not automatically create an organization membership yet. This is intentional until canonical listing-to-organization relationships are fully migrated into Supabase. The reviewer should assign the appropriate `owner`, `manager`, or `editor` membership after verifying the correct organization.

### Temporary evidence procedure

If exceptional documentation is received:

1. Ask the claimant to redact unrelated personal, financial, and identifying information.
2. Do not place the file in ordinary media, profile, or listing storage.
3. Record `evidence_received_at` without storing the document in the claim schema.
4. Complete the review.
5. Delete active copies promptly, generally within seven days after resolution.
6. Record `evidence_deleted_at` and the `evidence_deleted` audit action.
7. Check `claim_evidence_deletion_queue()` for overdue cleanup.

Email is not automatically safer than an upload. Copies may remain in inboxes, downloads, Trash, synchronized devices, or backups. Any email-based exception needs the same deletion procedure.

## Profile privacy boundary

The migration replaces broad table-level `SELECT` access on `profiles` with column-level grants limited to public-facing profile fields:

- ID
- display name
- handle
- role
- status
- avatar
- bio
- creation date

Operational fields such as `account_intent` and `email_verified_at` are no longer part of the public/selectable profile surface.

## Current implementation files

- `supabase/migrations/20260802024500_outbound_analytics_and_listing_claims.sql`
- `lib/analytics/outboundTracking.ts`
- `lib/analytics/outboundReports.ts`
- `components/analytics/TrackedExternalLink.tsx`
- `lib/claims/listingClaims.ts`
- `components/PrivacyPolicy.tsx`
- `components/admin/AdminListingClaims.tsx`
- `components/admin/AdminOutboundAnalytics.tsx`

## Before production deployment

- Apply the migration to a non-production Supabase environment first.
- Verify anonymous click insertion through the RPC while confirming direct table reads/writes remain denied.
- Verify signed-in clicks capture user linkage and retention later removes it.
- Confirm duplicate clicks are excluded from qualified counts.
- Verify admin report and retention RPCs reject non-admin accounts.
- Verify claimants can create/read/withdraw only their own claims.
- Verify administrators can review claims and ordinary users cannot.
- Configure and test the retention schedule.
- Validate that daily distinct-session counts deduplicate the same session across multiple destinations and placements.
- Add canonical destination/entity validation before relying on the counts for paid billing or guaranteed sponsor contracts.
- Have the published privacy policy reviewed before public launch.
