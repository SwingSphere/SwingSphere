# SwingSphere canonical-logo audit — 2026-10-12

## Scope and baseline
Read-only Supabase overview of public.listings and public.media_assets plus code tracing of entityBrandMedia, media picker and host profile. Counts describe direct JSON payload fields; missing direct fields **do not** prove missing graph relationships, because venue and organization joins may supply inheritance.

- Clubs: 76; events: 92.
- Events with a direct logo URL: 45. Explicit event `logoOverride=true`: 0.
- Events missing direct `organizerOrganizationId`: 12; missing direct `venueId`: 45.
- Clubs missing direct `ownerOrganizationId`: 65.
- media_assets not deleted: 289 rows; 289 distinct external IDs. **This does not rule out visually identical uploaded images or duplicate URL references.**

## Verified Krystal mismatch
- Club `club-krystal-vicenza` logo CF ID: `a8bfa2ff-c978-483c-a53f-01952be5b300`.
- Club hero CF ID: `14280825-8e92-4b10-944a-6306920ac300` (media record pending_review).
- `org-host-krystal-club-prive` fallback had CF ID `d497f0cd-5534-4391-5839-df2385094800` for both logo and hero; now aligned to club URLs in `data/mockOrganizations.ts`.
- No separate Krystal row was returned from public.organizations in the initial query; verify actual runtime organization hydration before changes to production data.

## Safe local fixes
1. Render media picker in `document.body` portal to avoid clipping by parent editors; improve available dialog space.
2. Update Krystal mock promoter logo/hero URL references to the existing club URLs, without uploading or deleting assets.
3. In organization hydration, prefer an explicit usable organization's logo over inferred frequently recurring event logos (which otherwise can unexpectedly overwrite a canonical logo).

## Outstanding work (review before any mutation)
1. Extract exact Cloudflare image IDs and/or content hashes across all entities and their media-assets rows; group by brand and effective graph relationships, not by similar names only.
2. Verify ownership and venue-to-host edges, especially events with no direct organizer ID and clubs with no direct owner ID. Avoid guessed relationships.
3. Classify event logo differences as intentional brand overrides versus redundant copies. Only assign a single canonical asset after human review of ambiguous cases.
4. Move canonical relationships to durable database records and add DB/UI checks that forbid multiple authoritative logos for the same brand while allowing intentional event-specific overrides.
5. Recheck images on live host, event, club, resort and cruise pages after deployment; ensure flyers and event-specific heroes remain independent.
6. Review pending-review media status and any asset cleanup in a non-destructive preview before approving or deleting anything.

## Validation
`tests/mediaLibraryV2.test.ts`: 9 passed. `npm run build`: passed. Changes not deployed.
