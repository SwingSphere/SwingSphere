# SwingSphere Feature Documentation

These notes describe active systems or durable implementation handoffs.

## Active product systems

- `interactive-globe.md`
- `hex-landmask.md`
- `cluster-and-pin-rendering.md`
- `mini-map-system.md`
- `mobile-globe-renderer-sizing.md` — Dev Mobile WebGL canvas sizing, right-side black-bar root cause, viewport-fit distinction, and regression checklist
- `street-view-phase-one.md` — desktop Phase One Street View architecture, UX intent, performance guardrails, occlusion atlas, landmark handling, and deferred work
- `street-view-building-overlap-resolution.md` — durable fix for venue-highlight z-fighting, coarse OpenFreeMap MultiPolygon IDs, and Building Inspector overlap masking
- `event-dedupe-and-canonical-identity.md`
- `event-club-host-page-architecture.md`
- `image-handling-pipeline.md`
- `data-store-auth-and-supabase-status.md`
- `admin-permissions-and-roles.md`
- `submission-moderation-flow.md`
- `badge-system.md`

## Current guidance

The old Geo Tools, Boundary Builder, Python boundary pipeline, and generated `public/geo/country/**` hierarchy were retired in July 2026. They are not active feature dependencies and should not be restored from old handoff documents.

For current system context, begin with the root-level `PROJECT_OVERVIEW.md`, `ARCHITECTURE.md`, and `DATA_FLOW.md`.
