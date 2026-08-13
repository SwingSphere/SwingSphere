# SwingSphere Member Hub and Profile Privacy Foundation

## Launch contract

SwingSphere member accounts are private by default.

A member's display name and handle may be shown when they author an approved written review. Profile visibility has two states:

- `private`: the handle remains visible with the contribution, but displays a private-profile lock explanation instead of navigating;
- `visible`: the exact handle URL and contribution attribution can open the member profile.

SwingSphere does not provide a member directory, nearby-member discovery, profile recommendations, or partial-handle browsing. Private, missing, suspended, and otherwise unavailable URLs intentionally share one neutral fallback state when entered manually.

The following remain private regardless of member-profile publication state:

- saved entities and private collections;
- recent views;
- event attendance;
- precise location;
- email and authentication state;
- drafts and non-public moderation history;
- organization permissions;
- account associations.

## Frontend architecture

`/account/*` is the private Member Hub.

Current sections:

- `/account` — overview;
- `/account/saved` — private saved library and collections;
- `/account/contributions` — reviews, feedback, and available listing contribution states;
- `/account/achievements` — earned badges, public-display choices, and the visible achievement catalog;
- `/account/public-profile` — contribution identity and optional public details;
- `/account/privacy` — private or visible-by-link controls;
- `/account/settings` — email, password, session, and deletion request path.

The member route remains `/users/:handle`. Ordinary visitors read through `get_public_profile_by_handle`, which preserves the member's visibility choice. Authenticated active administrators use a separate exact-handle admin preview RPC so they can inspect private or suspended profile records without changing or weakening public visibility.

Organizer identity remains separate. Organization managers use `/host-dashboard`, while public organizer identity uses `/hosts/:slug`. Managing an organization does not require publishing a personal member profile.

## Achievements and badges

Migration:

`supabase/migrations/20260808053500_badges_achievements_founders.sql`

Member achievements and organizer achievements are intentionally separate award records:

- `user_badges` belongs to an individual member account;
- `organization_badges` belongs to the public host/promoter organization and survives owner or manager changes;
- verification and ownership markers remain trust signals, not collectible achievements.

Member awards are private by default. A member may mark an earned badge public and feature up to three badges, but public award data is returned only through `get_public_profile_badges_by_handle`, which applies the same exact-handle visible-profile requirement as the member profile itself. Direct public enumeration of `user_badges` is not allowed.

Public member profiles show an achievements strip between identity and About when the member has deliberately public awards. Host pages show public organization achievements beside the hero identity/stats area, with up to four featured organizer awards.

The initial catalog includes founder/legacy awards, contribution milestones, review/community recognition, and organizer milestones. Badges whose underlying contribution or event persistence is not normalized yet are stored as `future_automatic`; their criteria are recorded without pretending the current application can award them reliably.

The Founding 100 sequence is installed with `founder_program_enabled = false`. This prevents development and test accounts from consuming permanent founder numbers. An administrator must explicitly open the program before automatic founder numbering begins. Administrators can still deliberately assign a legitimate prelaunch member while the automatic program is closed, so early numbers can be curated without exposing the counter to test signups.

## Database foundation

Migration:

`supabase/migrations/20260806204500_profile_privacy_saved_relationships.sql`

It adds:

- `profile_privacy_settings`;
- `saved_entities`;
- `saved_collections`;
- `saved_collection_items`;
- `profile_associations`;
- an exact-handle visible-profile RPC;
- participant-safe association RPCs;
- authored approved-review attribution by screen name and handle.

Direct anonymous reads from `profiles` are removed. Authenticated members can read their own row; administrators retain administrative reads. Visitor profile data is returned only through the narrow public RPC.

## Account associations

`profile_associations` is intentionally neutral future infrastructure. It supports these private labels:

- `relationship`;
- `friend`;
- `other`.

It does not create or imply:

- followers;
- public friend counts;
- dating discovery;
- messaging;
- shared login credentials;
- access to another member's saves or activity.

Requests are created by exact handle through a trusted RPC. Only the invited recipient can accept or decline. Either participant can later remove an accepted association. No association is public in the launch implementation.

A later shared-profile feature should use a separate shared identity and membership model rather than converting an association into shared account access.

## Reviews and optional structured feedback

SwingSphere uses one public member contribution type on club and event pages: reviews.

The public review core is intentionally small:

- thumbs up / thumbs down overall reaction;
- written review text, up to 5,000 characters;
- author display name and handle after moderation;
- publication and edit timestamps;
- helpful up/down votes.

For launch, that is the entire active workflow. The richer visit-date and structured-signal experience remains implemented but disabled behind `VITE_ENABLE_ADVANCED_REVIEW_FLOW=true`. It can be re-enabled later when SwingSphere has enough active members to justify the additional friction. Any structured selections already stored remain attached to the feedback target and are preserved when a member updates the public review through the simple composer.

Verified organization owners and managers can consume those details only through aggregate summaries. The database RPC `feedback_private_signal_summary` returns counts and percentages by signal and never returns individual member selections or author identity. If an unclaimed target is later attached to an organization, the accumulated aggregate becomes available to that organization without moving the underlying member data.

Approved written review data returns only:

- approved text and publication metadata;
- overall reaction and scope;
- current author display name;
- current author handle.

It does not return the author UUID, email, private profile fields, private structured selections, moderation internals, drafts, or safety-report data.

The temporary admin demo uses the same review-only model and the same inline composer. Clubs and past events can receive reviews; pre-event discussion or Q&A is intentionally not part of the launch review system.

## Saved content

Club and event detail heroes now use the persistent private save service instead of a local-only interested state. The saved library is owner-only through RLS.

Collections can be created and deleted, and saved items can be assigned to or removed from multiple private collections. Public collection publication, organizer/travel save buttons, and richer entity hydration remain follow-up work.

## Deployment order

1. Review and apply the migration in a local or staging Supabase environment.
2. Verify the profile privacy backfill created one row per existing profile.
3. Confirm anonymous direct `profiles` reads fail.
4. Confirm private handles return no row from `get_public_profile_by_handle`.
5. Confirm visible handles work by exact URL and from authored contributions.
6. Confirm no member-search or directory RPC is exposed.
7. Confirm owner-only saved and association policies with two test accounts.
8. Deploy the frontend only after the migration is live.
9. Run authenticated desktop and mobile visual review of every `/account/*` route.

## Known integration gaps

- Detailed listing-submission persistence and moderation history are not yet unified into one member-facing RPC.
- Public-profile approved-contribution lists are still a placeholder.
- Shared couple profiles are not implemented; only neutral private association infrastructure exists.
- Automated account deletion is not wired; the UI routes users to a support request.
- The new migration has not been locally executed in the current workspace because the local Supabase Docker database was unavailable during implementation.
