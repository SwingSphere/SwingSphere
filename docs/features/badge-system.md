# Badge and Achievement System

## Purpose

SwingSphere achievements recognize meaningful member and organizer contributions without turning trust/verification markers into game mechanics. Member achievement visibility remains private by default and never overrides member-profile privacy.

## Database foundation

Primary migrations:

- `supabase/migrations/20260808053500_badges_achievements_founders.sql`
- `supabase/migrations/20260808065000_admin_user_management_badges.sql`

Core tables:

- `badges` — achievement catalog, audience, rarity, award mode, criteria, future art asset key;
- `user_badges` — member awards, presentation choices, award provenance, and revocation history;
- `organization_badges` — host/promoter organization awards;
- `badge_system_settings` — Founding 100 program gate and limit.

The Founding 100 counter is disabled by default so development/test accounts cannot consume founder numbers. Admins may deliberately assign an eligible verified member a founder number before the automatic program is opened.

## Award modes

- `automatic` — currently wired to a reliable source event;
- `future_automatic` — criteria are defined, but the normalized source metric is not ready yet;
- `manual` — staff judgment/recognition;
- `campaign` — limited launch/beta/community campaigns.

`First Voice` is currently automatic when a written review becomes approved. Other contribution thresholds remain `future_automatic` until their authoritative source data is normalized.

## Member presentation

Private member cabinet:

- `/account/achievements`
- `components/account/AchievementsPage.tsx`

Public member presentation:

- `/users/:handle`
- `components/badges/BadgeShelf.tsx`

Members choose which earned badges are public and may feature up to three. A private profile does not become discoverable because a badge is public.

## Host / organizer presentation

Host achievements belong to the organization, not to an individual manager. They render on host profiles through `HostHero` / `BadgeShelf`.

Trust markers such as verified organizer status remain separate from achievements.

## Admin management

`Admin > User Management` now uses a protected admin projection and a dedicated achievement manager:

- `components/admin/AdminUserManagement.tsx`
- `components/admin/AdminUserBadgeManager.tsx`
- `lib/admin/userManagement.ts`

Admins can:

- search by display name, handle, email, or user ID;
- filter by role/status and sort by age/name/badge count/founder number;
- see verification, founder number, badge count, organization count, approved-review count, and profile visibility;
- assign any non-founder member-capable badge regardless of its normal automatic/manual source;
- remove an incorrectly assigned badge while retaining revocation history;
- assign an eligible permanent founder number through the dedicated founder action.

Generic badge assignment intentionally cannot create an unnumbered `Founding Member` award.

## Artwork

Final achievement artwork is intentionally decoupled from award history. Each badge currently stores semantic `icon_key`, `visual_style`, and nullable `asset_key` fields. Bold final PNG/SVG/WebP assets can be attached later without migrating member awards.

## Legacy scaffolding

`data/mockUsers.ts`, `AdminUserActionsModal.tsx`, and the old `Star User` string array are legacy prototype scaffolding and are no longer the production achievement path. They should not be extended for new achievement work.
