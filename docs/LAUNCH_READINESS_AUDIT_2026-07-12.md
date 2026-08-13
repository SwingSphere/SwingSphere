# SwingSphere Launch Readiness Audit

Date: July 12, 2026

## Executive conclusion

SwingSphere has a strong discovery UI, a substantial listing editor, useful address validation, duplicate detection, moderation screens, and mature club/event page foundations. It is **not yet launch-ready as a public account-and-submission product** because the application still operates on mock/in-memory data, authentication is not persistent or secure, authorization is client-side, image uploads are placeholders, and user/promoter ownership workflows are not implemented end to end.

The correct next phase is not more discovery polish. It is a focused **backend and launch workflow phase**.

## Recommended account model

Do not create two completely separate account systems.

Use one Supabase Auth identity per person and model capabilities separately:

- `profiles`: one row per authenticated user.
- `roles` or a role field: `user`, `promoter`, `admin`.
- `organizations`: promoter/host brands or operating entities.
- `organization_members`: connects users to organizations with permissions such as owner, manager, or editor.
- `listing_claims`: lets a user request control of an existing club, event series, host, or organization.

A normal user can later become a promoter without creating a second login. The dashboard can switch context between **My Activity** and **Promoter Tools** only when the user has promoter capabilities. This is safer and more flexible than an unrestricted role toggle.

A user should not be able to grant themselves promoter authority simply by flipping a UI switch. They may request promoter access or create an organization, but ownership of existing entities should require verification or admin approval.

---

# P0 — Absolute launch blockers

## 1. Replace mock auth and data with Supabase

Current state:

- `lib/api.ts` hardcodes `USE_MOCK = true`.
- Login accepts role-specific shared passwords (`admin`, `host`, `user`).
- Signup only pushes a user into an in-memory array.
- Session state is held only in React state and disappears on reload.
- `supabase/` contains configuration only; there are no migrations or application client integration.

Required:

- Add `@supabase/supabase-js`.
- Create a Supabase client module.
- Implement signup, email confirmation, login, logout, password reset, and session restoration.
- Subscribe to auth state changes.
- Create a profile row automatically when a user is created.
- Remove shared mock-password behavior from production.
- Define a controlled development/mock mode rather than forcing mock data globally.

Acceptance criteria:

- A new user receives a confirmation email.
- Following confirmation creates or activates their profile.
- Reloading the site preserves the session.
- Logging out invalidates the session.
- Password reset works.
- Production cannot fall back to mock authentication.

## 2. Create the production database schema and migrations

Required core tables:

- `profiles`
- `organizations`
- `organization_members`
- `venues`
- `listings` or separate `clubs` and `events`
- `listing_images`
- `listing_submissions` or listing status/history fields
- `listing_claims`
- `tags`
- `listing_tags`
- `moderation_actions`
- `audit_log`

Recommended listing lifecycle:

- `draft`
- `pending_review`
- `changes_requested`
- `approved`
- `rejected`
- `archived`

Current `pending_approval | approved | flagged` is too narrow for a real moderation workflow.

Acceptance criteria:

- All public discovery data loads from Supabase.
- Submitted listings survive reloads, deployments, and different devices.
- Every listing has a stable UUID, creator, timestamps, status, and moderation history.
- Existing local JSON data has an explicit import path.

## 3. Implement backend authorization and Row Level Security

Current state:

- `/submission`, `/account`, and `/admin` are ordinary client routes.
- Public submission does not require an authenticated user.
- When no user exists, submissions can receive the fallback owner `user-submission`.
- Admin/host permissions are checked in React using `currentUser.role`.
- Several admin surfaces are still reachable before a view-level “Access Denied” response.

Required:

- Route guards for authenticated, promoter, and admin areas.
- Supabase RLS for every table.
- Server-enforced ownership rules.
- Admin privileges stored in protected profile/app metadata, not user-editable metadata.
- Remove all anonymous fallback ownership IDs.

Minimum policies:

- Anyone can read approved public listings.
- Authenticated users can create their own pending submissions.
- Users can read and edit their own drafts/submissions until moderation locks them.
- Promoters can manage listings owned by organizations they belong to.
- Only admins can approve, reject, alter roles, or view sensitive moderation data.
- Private exact addresses must not be selectable through public queries.

Acceptance criteria:

- Manually calling Supabase from the browser cannot bypass permissions.
- A normal user cannot load or mutate admin data.
- A promoter cannot modify another promoter’s listings.
- Public users cannot retrieve hidden exact addresses.

## 4. Implement real image upload and processing

Current state:

- File inputs exist in `ListingEditor`.
- Submitted files become fake URLs such as `https://firebasestorage.googleapis.com/.../filename`.
- No file is uploaded.
- Cloudflare Images credentials may exist locally, but no secure upload workflow is wired into the application.

Required:

- A server-side or edge endpoint that creates signed/direct Cloudflare upload URLs.
- Client upload progress and error states.
- Persist returned image IDs/URLs in `listing_images`.
- Validate MIME type, size, dimensions, and image count.
- Generate/use variants for logo, hero, card, thumbnail, and gallery.
- Delete replaced/orphaned images.
- Decide moderation policy for images before public display.

Acceptance criteria:

- Uploaded images remain available after reload.
- A failed upload cannot create a listing with broken placeholder URLs.
- Replacing/removing images updates Cloudflare and the database consistently.
- Public pages use correct variants instead of loading original full-size files.

## 5. Finish the complete submission-to-moderation workflow

Strong existing pieces:

- Club/event choice.
- Multi-step editor.
- Draft persistence in localStorage.
- Address validation and manual review state.
- Duplicate warnings.
- Pending status and admin submission queue UI.

Missing production behavior:

- Authenticated ownership.
- Database draft saving.
- Reliable final submission transaction.
- Submission receipt/status page.
- Changes-requested loop.
- Rejection reason.
- Notification emails.
- Admin action persistence.
- Safe handling of resubmission and concurrent edits.

Required user flow:

1. User signs in.
2. User starts a club or event draft.
3. Draft autosaves to Supabase.
4. Images upload and attach to the draft.
5. Address is validated or marked for manual review.
6. Duplicate warning is shown.
7. User submits for review.
8. User sees a submission detail/status page.
9. Admin approves, rejects, or requests changes.
10. User receives email/in-app status notification.
11. Approved content becomes public.

Acceptance criteria:

- Submission and image attachment succeed atomically or recover safely.
- Refreshing or switching devices does not lose a draft.
- Users can see every submission and its status.
- Admin actions are recorded and attributable.

## 6. Protect private location data

The UI supports approximate/public versus exact/private location behavior, which is a strong foundation. The backend must preserve the separation.

Required:

- Store exact location separately or expose it only through protected views/policies.
- Generate public display coordinates/address fields for approximate listings.
- Ensure map feeds cannot leak exact coordinates.
- Audit event and club detail adapters for direct use of `geopoint`.

Acceptance criteria:

- Network inspection by a public visitor reveals only the permitted public location.
- Admins can see the exact location for moderation.
- Promoters can see exact locations only for entities they own/manage.

## 7. Establish production quality gates

Current state:

- `npm run build` succeeds.
- `npx tsc --noEmit` reports 83 TypeScript errors.
- There is no test script, ESLint script, unit suite, or end-to-end suite.
- Vite reports a main bundle of roughly 3.36 MB minified / 928 KB gzip.

Required before public launch:

- Make `tsc --noEmit` pass.
- Exclude generated `dist` from TypeScript input.
- Add linting.
- Add unit tests for identity, slugging, duplicate detection, visibility, and location validation.
- Add Playwright or equivalent E2E tests for signup, login, submission, moderation, and public display.
- Add CI running typecheck, tests, and build.
- Code-split admin/dev/map-heavy surfaces.

Acceptance criteria:

- CI blocks merges/deployments on type, test, or build failure.
- Core launch workflow has automated E2E coverage.
- Dev-only routes/code are not shipped or publicly accessible in production.

---

# P1 — Necessary for a credible MVP launch

## 8. Build a real user dashboard

The current `/account` page only supports editing display name/email and deleting the account.

Minimum user dashboard:

- Profile summary and public profile link.
- Email verification status.
- My submissions grouped by draft, under review, changes requested, approved, rejected.
- Resume/edit draft.
- Submission status and moderator feedback.
- “Submit a club” and “Submit an event” actions.
- Account/security settings.

Optional after launch:

- Saved/favorite listings.
- Reactions/reviews.
- Badges and contribution stats.

## 9. Build promoter tools as a capability, not a separate login

Minimum promoter dashboard:

- Organization/host profile.
- Managed clubs, venues, and events.
- Create/edit event.
- Listing ownership/claim status.
- Team members and roles, or defer team members for first launch.
- Draft/pending/published status.

For the smallest MVP, support one owner per organization initially while preserving a future `organization_members` table.

## 10. Stable slugs and profile routes

Current signup asks for a screen name but does not create or persist a profile slug.

Required:

- Unique normalized profile slug.
- Reserved words list (`admin`, `login`, `signup`, `api`, etc.).
- Collision handling.
- Decide whether slugs can change and maintain redirects/history if they do.
- Add public profile route only when there is meaningful public profile content.

Recommended routes:

- `/users/:slug` for contributor profiles.
- `/hosts/:slug` or `/organizations/:slug` for promoter identities.

Do not make private email addresses public.

## 11. Email and notification flows

Required launch emails:

- Confirm email.
- Password reset.
- Submission received.
- Changes requested.
- Approved.
- Rejected.

Supabase handles auth email transport/templates, but listing workflow emails still require a server/edge function and an email provider or Supabase-supported integration.

## 12. Moderation operations

Required:

- Queue filters and counts from real data.
- Review exact versus public location.
- Review image rights/appropriateness.
- Duplicate merge/reject handling.
- Approve/reject/request changes with notes.
- Audit log.
- Ability to unpublish/archive a listing.

## 13. Error, loading, and recovery behavior

Required:

- Friendly 404 page.
- Auth callback/loading screen.
- Offline/network failure messaging.
- Retry for uploads and submissions.
- Session-expired handling.
- Error monitoring in production.
- Avoid exposing raw errors/stack-oriented information in the production error boundary.

## 14. Production deployment and security configuration

Required:

- Environment validation at startup/build time.
- No secrets in Vite client variables.
- Correct Supabase redirect URLs.
- CSP and security headers.
- Rate limiting/bot protection on signup and submissions.
- CAPTCHA or equivalent abuse control where needed.
- Database backups and recovery plan.
- Logging/monitoring.
- Custom domain, HTTPS, sitemap, robots policy, and social metadata.

---

# P2 — Valuable but not required to launch

Defer until the core workflow is reliable:

- Messaging between users.
- Reviews/comments if moderation capacity is not ready.
- Gamification and leaderboards.
- Complex badge systems beyond basic trust/source badges.
- Team-based promoter permissions beyond a single owner.
- Advanced analytics dashboards.
- Highly elaborate profile customization.
- More globe/map spectacle or dev tooling.
- Social following/activity feeds.

A simple “user-submitted” versus “official/promoter-managed” trust badge is valuable near launch, but only after ownership verification exists in the backend.

---

# Existing systems worth preserving

These should be integrated rather than rewritten:

- `components/listing-editor/ListingEditor.tsx`
  - Multi-step public/admin editor.
  - Local draft recovery.
  - Duplicate detection.
  - Location visibility controls.
- `lib/listingLocationValidation.ts`
  - Address normalization/validation foundation.
- `lib/listingDuplicateDetection.ts`
  - Duplicate warning foundation.
- Admin submissions/moderation/editor surfaces.
- Club, event, host, and venue entity model/page work.
- Public discovery, globe, and map experience.

The priority is replacing the data/auth boundary beneath these surfaces and tightening permissions, not redesigning every screen.

---

# Suggested implementation order

## Phase 1 — Backend foundation

1. Add Supabase client and environment validation.
2. Write schema migrations.
3. Create profile trigger/function.
4. Add RLS policies.
5. Replace mock auth with Supabase Auth.
6. Restore sessions and add route guards.

## Phase 2 — Listings and moderation persistence

1. Move approved discovery listings to Supabase reads.
2. Implement draft/pending listing writes.
3. Connect admin moderation actions.
4. Add status history and audit logs.
5. Import current local listing data.

## Phase 3 — Images and addresses

1. Implement signed Cloudflare upload flow.
2. Persist image records and variants.
3. Enforce private/public location separation in queries.
4. Test international and manually adjusted addresses.

## Phase 4 — Dashboards and promoter capability

1. User submission dashboard.
2. Submission status/detail page.
3. Organization/promoter model.
4. Claim/verification workflow.
5. Promoter dashboard/context switcher.

## Phase 5 — Launch hardening

1. Resolve all TypeScript errors.
2. Add tests and CI.
3. Add email workflow notifications.
4. Add monitoring, rate limits, security headers, and backups.
5. Run accessibility, mobile, privacy, and end-to-end launch QA.

---

# Immediate next checklist

- [ ] Freeze nonessential feature work.
- [ ] Decide the initial Supabase schema and listing lifecycle.
- [ ] Add Supabase client/auth/session restoration.
- [ ] Add protected route components.
- [ ] Remove anonymous fallback listing ownership.
- [ ] Add migrations and RLS.
- [ ] Connect discovery reads to Supabase.
- [ ] Connect draft/submission writes to Supabase.
- [ ] Implement Cloudflare signed uploads.
- [ ] Build My Submissions dashboard.
- [ ] Connect moderation decisions and notifications.
- [ ] Implement organization/promoter capability and claims.
- [ ] Make TypeScript clean and add CI/E2E tests.

## Launch definition

SwingSphere is ready for a limited public MVP when a brand-new visitor can browse safely, create and confirm an account, return with a persistent session, submit a listing with real images and a verified/private-safe location, track its status, receive moderation feedback, and see the approved listing published—while no user can access or mutate data outside their permissions.
