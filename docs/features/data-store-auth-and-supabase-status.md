# Data Store, Auth, and Supabase Status

## 1) Feature Name
Data Store and Authentication Model (Current State)

## 2) Purpose
Document what persistence and authentication are production-backed today, and clearly identify the remaining local/mock subsystems.

## 3) Primary implementation
- `store/appStore.ts` — Supabase Auth session restore, sign-in, sign-up, password reset, current-user profile loading.
- `lib/api.ts` — transitional facade; canonical listings and the durable entity catalog now delegate to Supabase.
- `lib/entityCatalogSupabase.ts` — Supabase adapters for organizations, venues, organization/venue relationships, event series, club brands, resorts, cruise series, and cruise sailings.
- `lib/admin/platformHealth.ts` — live admin Platform Status derivation.
- `lib/admin/userManagement.ts` — protected admin member reads, badge operations, and role/status mutation client.
- `lib/admin/auditLog.ts` — protected production audit-log reader.
- `components/admin/AdminSettings.tsx` — data-driven runtime health UI.
- `supabase/migrations/20260809002000_admin_platform_health.sql` — protected runtime capability/migration probe.
- `supabase/migrations/20260809002500_listings_submissions_supabase.sql` — canonical listing/submission persistence and moderation history.
- `supabase/migrations/20260809003500_listing_active_account_enforcement.sql` — active-account enforcement for member listing mutations.
- `supabase/migrations/20260809011000_unify_entity_catalog_supabase.sql` — canonical venue/relationship schema plus RLS-backed CRUD for the durable entity catalog.
- `supabase/migrations/20260809013500_fix_public_entity_rls_helpers.sql` — separates anonymous discovery policies from authenticated authorization helpers.
- `supabase/migrations/20260809014500_grant_rls_authorization_helpers.sql` — narrowly grants authenticated policy evaluation access to private boolean authorization helpers.
- `supabase/migrations/20260809020000_admin_user_mutations_and_audit.sql` — protected role/status mutations plus reusable append-only administrative audit history.
- `supabase/migrations/20260809021000_active_account_write_guards.sql` — shared active-account write guards for older member RPCs/direct data stores and suspension-aware organization membership.
- `data/listings.local.json` — legacy listing source retained for migration/recovery tooling, no longer the authoritative production listing store.

## 4) Authentication
Production authentication is Supabase-backed.

Implemented:
- email/password authentication
- persistent sessions and token refresh through Supabase JS
- sign-up and email verification flow
- password reset
- role/status reads from `public.profiles`
- suspended/deleted frontend route enforcement
- role/status revalidation when a tab regains focus and at a 60-second safety interval
- protected admin role/status mutations with mandatory reason and confirmation
- self-lockout protection for administrator mutations
- RLS/RPC checks for privileged database operations
- database-level active-account write guards across reviews/safety reports, saved entities, profile relationships, listing claims, media metadata, and badge state
- suspended/deleted organization members no longer retain organization or linked-venue management rights

Still planned:
- administrator MFA enrollment/recovery
- secure automated account deletion / privacy purge

## 5) Listings and submissions
`public.listings` is the canonical production listing store.

Design:
- the existing club/event object is preserved in `payload jsonb` for compatibility
- moderation-critical fields are normalized: type, status, lifecycle, submitter, organization ownership, provenance, timestamps
- raw table access is revoked from `anon` and `authenticated`
- public discovery uses sanitized RPC projections
- approximate/private-address listings have precise location metadata removed from public projections
- authenticated members can submit listings; non-admin writes are forced to `pending_approval`
- admins can save, approve, flag, reject, restore, and archive through protected RPCs
- `listing_moderation_actions` stores append-only before/after moderation history
- suspended/deleted accounts cannot mutate pending submissions directly through RPCs

The 62 real records from `data/listings.local.json` were backfilled to production Supabase. The separate `Community Host` example/Picsum fixture set remains development/demo content and was intentionally not promoted into the canonical production catalog.

## 6) Durable entity catalog
The following application CRUD is now canonical Supabase data rather than localStorage/in-memory overrides:
- `public.organizations`
- `public.organization_members`
- `public.venues`
- `public.organization_venue_relationships`
- `public.organization_relationships`
- `public.event_series`
- `public.club_brands`
- `public.resorts`
- `public.cruise_series`
- `public.cruise_sailings`

Authorization model:
- anonymous visitors can read only approved/public entities
- private/admin-only venues are not visible anonymously
- ordinary authenticated members do not gain catalog write access
- active admins can manage the complete catalog
- organization owners/managers/editors can manage rows tied to organizations according to role-specific policies
- organization-linked venue access is evaluated through a narrow private boolean RLS helper
- organization-to-organization relationships are publicly readable only between public organizations; mutation is admin-only and audited

Schema reconciliation performed during the transition:
- added the missing canonical `venues` table
- added durable organization/venue relationships
- added directional organization-to-organization relationships for operators, producers, ownership, parent brands, co-promoters, ticketing providers, partners, and affiliates
- expanded organizations to preserve Instagram, FetLife, operating regions, globe presence, and standards
- corrected `club_brands` IDs/operator IDs to the text identifier model used by the rest of SwingSphere
- added foreign keys from event series/club brands to canonical organizations and venues
- added authoritative `updated_at` triggers to older catalog tables
- organization deletion detaches denormalized listing organization references

Production backfill currently contains:
- 11 curated organizations/promoters/club organizations, including separate Modern Lifestyle Events, Bronze Party, and Her Fantasy Party identities
- 3 verified venues
- 3 organization/venue relationships
- 2 organization-to-organization operator relationships
- 3 recurring event series
- 5 club brands
- 1 approved resort (Hedonism II)
- 0 cruise series / sailings because the repository currently contains only explicit preview cruise fixtures

The fake Community Host, test clubs, Crimson Cove, and Sphere at Sea preview entities were intentionally not imported.

All live listing `organizerOrganizationId`, `eventSeriesId`, `clubBrandId`, and venue references were checked after backfill and currently resolve to canonical rows.

## 7) Migration drift / Platform Status
The Admin Platform Status page is no longer a hand-written status checklist.

At build/dev-server startup, Vite discovers the newest local migration filename and exposes it through `virtual:swingsphere-schema-version`.

Production Supabase exposes the newest applied migration and runtime capability checks through the admin-only `admin_platform_health()` RPC.

The UI compares the two heads directly:
- equal -> schema is synchronized
- local newer -> `Pending deploy`
- mismatch in the other direction -> `Degraded`

Platform Status also reports live durable-catalog capability flags and record counts, making a regression from Supabase back to a local-only path visible from the admin panel.

## 8) Other production-backed Supabase systems
Currently production-backed:
- profiles and account intent
- media ownership metadata / Cloudflare Images integration
- organizations, membership, venues, relationships, event series, club brands, and travel catalog
- feedback/reviews foundation and target registration
- profile privacy and saved relationships
- listing claims
- outbound click analytics
- badges, achievements, founder numbering, and admin badge management
- admin private-profile preview
- protected role/status account administration
- append-only general administrative audit history
- canonical taxonomy categories/tags, aliases, scopes, visibility, deprecation, and live usage counts
- durable in-app notification delivery, preferences, unread state, and workflow event fan-out
- controlled self-service account deletion, deletion receipts, identity anonymization, and retention-aware cleanup
- canonical listing relationship links and relationship-driven brand-media inheritance

## 9) Remaining transitional/local systems
Still local, partially local, or deployment-config dependent from the application perspective:
- transactional workflow email delivery is staged in the notification outbox but remains disabled until an email provider is configured
- accounts with Cloudflare-hosted profile media require server-side Supabase/Cloudflare deletion secrets before external-media cleanup can complete; zero-media accounts do not require that clearance dependency
- building-asset development persistence

`USE_MOCK` still exists in `lib/api.ts` for remaining transitional/dev areas. It no longer controls canonical listing/submission persistence or durable entity-catalog CRUD.

## 10) Legacy/development data and repeatable backfills
`data/listings.local.json` and selected TypeScript fixture modules remain in the repository for reproducible migration/recovery and development comparisons. They are not production write stores.

Repeatable operator commands:

`npm run supabase:backfill-listings`

`npm run supabase:backfill-entity-catalog`

The entity-catalog backfill has explicit production allowlists/count guards so preview/test fixtures cannot silently become production records if fixture files change.

## 11) Admin mutations and audit history
`public.admin_update_user_account(uuid, text, text, text)` is the trusted role/status mutation boundary.

Rules:
- caller must be an active administrator
- a written reason is mandatory
- administrators cannot mutate their own role/status from User Management
- changing another active administrator is allowed only while SwingSphere retains another active administrator
- ordinary authenticated users cannot execute a successful mutation
- every successful change writes before/after role/status state to `public.admin_audit_log`

`public.admin_audit_log` is append-only from the browser perspective: `anon` and `authenticated` have no direct SELECT/INSERT/UPDATE/DELETE access. Active administrators read it through `admin_list_audit_log()`.

Manual member badge awards, badge revocations, and founder-number assignment now write into the same audit trail, establishing a reusable pattern for additional privileged actions.

The `Deleted` account status is an authorization lock/soft-delete state. It does not erase the Auth identity or perform a privacy purge; permanent account deletion remains a separate workflow.

Suspension/deletion enforcement is not limited to React route guards. A shared database trigger rejects authenticated writes from non-active profiles on member-owned stores, including feedback submissions and safety reports, saved entities/collections, profile associations, listing claims, media metadata, and user badge state. Organization management helpers also require the member profile itself to be active. Service-role/migration work is explicitly exempt so trusted cleanup jobs remain possible.

## 12) Canonical taxonomy
`public.tag_categories` and `public.tags` are now the production source of truth for listing taxonomy.

The taxonomy stores:
- stable IDs/slugs and canonical stored values
- display labels and descriptions
- historical aliases such as `LGBT Friendly` -> `LGBTQ+ Friendly`
- entity scopes (`club`, `event`, and future travel surfaces)
- visibility and soft-deprecation state
- administrator creator/editor metadata
- deterministic sort order

Public browser clients cannot SELECT the raw tables. `taxonomy_list_categories()` and `taxonomy_list_tags()` expose sanitized public projections, while active admins use protected admin projections and mutation RPCs. Tag/category changes are recorded in the general admin audit log. Hard tag deletion is intentionally not exposed; deprecation preserves compatibility with older listing payloads.

The production event-tag audit currently has zero unresolved values. Club `generalAmenities` remains a separate descriptive feature array because it contains freeform venue facts such as dimensions, bar formats, dress details, and facility descriptions; the standardized club choices offered by the editor are sourced from canonical Supabase taxonomy instead of turning every descriptive amenity into a global tag.

`data/mockTags.ts` now contains TypeScript shapes only and no longer contains a runtime mock taxonomy catalog. The legacy constants in `lib/listingTaxonomy.ts` remain only as compatibility/failure fallbacks and for structured attendance/access normalization; successful editor loads use Supabase choices.

## 13) Notifications and account deletion
Notifications are stored in `public.notifications` with per-channel state in `public.notification_deliveries` and member-controlled settings in `public.notification_preferences`. Browser clients cannot read the raw tables; authenticated users access only their own feed and preferences through protected RPCs.

Current automatic notification producers include listing submission/moderation transitions, listing-claim transitions, member achievements, security/account events, and administrator submission/claim alerts. In-app delivery is active. Transactional workflow email has a durable delivery/outbox model but remains disabled until a production email provider is configured; Supabase Auth email such as password reset remains a separate channel.

Self-service deletion uses `public.account_deletion_requests` as a durable receipt/state machine. The flow requires recent password reauthentication, blocks administrator accounts and sole organization owners, removes private profile/saved/member data, detaches listing attribution, removes raw outbound account linkage, and anonymizes retained moderation/safety/claim history rather than deleting records SwingSphere may reasonably need for safety, fraud prevention, disputes, or legal compliance.

Cloudflare profile media is fail-closed: accounts with external user media cannot finalize deletion until a server-only action confirms the exact current Cloudflare image set has been removed. Accounts with no external profile media automatically pass the media-clearance phase. The final database transaction deletes the Supabase Auth identity and returns a non-identifying deletion receipt code.

## 14) Canonical identity links and brand-media inheritance
Club, venue, organization/host, event, and recurring-series records remain separate entities even when they represent different facets of the same real-world brand. Media ownership also remains entity-specific: uploading a logo to a club does not physically copy the Cloudflare asset into the related venue or organization.

Listings now persist the relationship keys used by that identity graph in FK-backed columns instead of relying only on JSON or display-name conventions:
- `owner_organization_id`
- `venue_id`
- `club_brand_id`
- `event_series_id`

Compatibility payload keys (`ownerOrganizationId`, `organizerOrganizationId`, `primaryVenueId`, `venueId`, `clubBrandId`, and `eventSeriesId`) are synchronized from those normalized columns for existing frontend consumers. The previous `org-${listing.id}` and club-brand `startsWith(name)` runtime shortcuts are no longer used by production admin flows. The 16 legacy Ice Lounge, Club Eden, Colette, KiwiKlub, and Trapeze locations were migrated to explicit club-brand links.

`lib/entityBrandMedia.ts` is the centralized presentation resolver. It walks only explicit canonical relationships and follows these rules:
- an entity's own non-placeholder logo always wins
- related brand/organization/club/venue/event-series/event logos may be inherited when no explicit logo exists
- placeholder fixture URLs such as Picsum are ignored
- only after real logos are exhausted may a related header image act as a final identity fallback
- inherited URLs are never copied into the target entity, so changing a source logo propagates automatically and uploading a target-specific logo immediately overrides inheritance

Admin catalog rows identify inherited media with an `Inherited from …` label. Public host and club presentation paths use the same resolver while their editing objects retain only explicitly owned media, preventing inherited URLs from being accidentally saved as duplicates.

Organization-to-organization relationships are intentionally **not** traversed by the brand-media resolver. A shared operator does not imply shared attendee-facing branding. For example, the production graph now models `Modern Lifestyle Events --operates--> Bronze Party` and `Modern Lifestyle Events --operates--> Her Fantasy Party`; Bronze Party and Her Fantasy Party remain sibling public brands with separate event histories, followers, media, and analytics. Her Fantasy occurrences point to `org-promoter-her-fantasy-party` and `series-her-fantasy`, while Bronze occurrences remain attached to Bronze Party. Public brand pages may display the operator relationship as informational provenance without inheriting the operator's logo.

The organization admin editor supports maintaining these directional relationships directly, and admin creates/updates/removals are recorded in the append-only audit log. Recovery fixtures (`data/eventSeries.ts`, `data/mockOrganizations.ts`, and `data/listings.local.json`) mirror the same separation so a future backfill cannot silently collapse Her Fantasy back under Bronze Party.

## 15) Security and performance advisor cleanup
The final database-hardening pass is represented by `20260809043000_security_performance_cleanup.sql` and the verification correction `20260809044000_fix_public_rls_role_separation.sql`.

The linked Supabase Performance Advisor baseline before this pass was:
- 45 unindexed foreign keys
- 19 RLS auth/init-plan warnings
- 14 multiple-permissive-policy warnings
- 41 unused-index informational findings

After the migrations:
- unindexed foreign keys: **0**
- RLS auth/init-plan warnings: **0**
- multiple-permissive-policy warnings: **0**
- one structurally redundant `feedback_written_revisions` index was removed
- exact structural duplicate-index audit: **0 duplicate groups**

The migration adds indexes for every referencing FK that lacked left-prefix coverage. The immediate `unused_index` count is intentionally not treated as a delete list: it is currently 85 because the newly created FK indexes have not yet accumulated production scans and many older indexes protect low-volume/prelaunch paths. Index removal should be revisited only after a meaningful workload/stats window. Zero scans alone are not evidence that a referential-integrity or future-query index is unnecessary.

RLS policies that repeatedly evaluated `auth.uid()` now use `(select auth.uid())` where the value is statement-invariant. Overlapping public/admin/team SELECT policies were consolidated without widening access. Verification caught and corrected an intermediate anonymous-read regression: public and authenticated reads now use non-overlapping role-specific policies whenever authenticated visibility needs private authorization helpers. Live rollback tests confirm:
- anonymous users cannot see draft organizations
- ordinary members cannot see draft organizations
- ordinary members can read their own profile but not another member/admin profile
- active administrators can read a draft organization
- ordinary members cannot create organization/venue relationships they do not manage
- active administrators can create the same relationship
- all verification rows are rolled back / absent afterward

Security Advisor exceptions are reviewed rather than suppressed:
- 14 `rls_enabled_no_policy` findings are deliberate RPC-only/raw tables. Browser roles have no direct SELECT/INSERT/UPDATE/DELETE privileges on those tables; access is through narrow RPCs.
- anonymous `SECURITY DEFINER` findings fell from 15 to 11 after removing four accidental anon grants from auth-only profile-association/private-feedback RPCs.
- the remaining 11 anonymous `SECURITY DEFINER` functions are intentional sanitized/public boundaries: public feedback aggregates/listing projections, public profile/badge projections, taxonomy projections, listing-store state, and outbound-click recording.
- authenticated `SECURITY DEFINER` warnings remain for intentional admin/member RPC boundaries over raw tables that are otherwise not browser-readable. Revoking these grants or converting them to invoker functions would either break required API behavior or require broader direct table privileges.
- every custom `public`/`private` function currently has an explicit `search_path`; sensitive internal trigger/helper functions are not callable by browser roles.
- `public.admin_notifications` is explicitly `security_invoker=true` and remains non-readable directly by anon/authenticated roles.

Supabase Auth leaked-password protection remains the one known external Security Advisor warning. A targeted Management API read confirmed `password_hibp_enabled=false`; a one-field PATCH to enable it was rejected by Supabase because the feature requires a Pro-or-higher hosted plan. No other Auth setting was changed. The hosted password minimum is already 8 characters. Enable leaked-password protection immediately if/when the project is upgraded to a plan that permits it.

## 16) Current backend priorities
1. Configure a production transactional email provider if workflow emails are desired at launch.
2. Verify/configure the production Cloudflare Pages server secrets used for deletion of accounts that have profile media.
3. Retire or isolate the remaining building-asset/dev-only local persistence paths.
4. Revisit `unused_index` telemetry after SwingSphere has a meaningful production workload; do not prune new FK indexes based on prelaunch zero-scan statistics.
