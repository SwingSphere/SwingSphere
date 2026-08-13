# SwingSphere Architecture Notes

The current architecture is documented in the root-level files:

- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE.md`
- `DATA_FLOW.md`
- `GLOBE_SYSTEM.md`
- `AGENTS.md`

These documents were refreshed in July 2026 to reflect the unified globe/map explorer, modern entity model, Supabase transition, Cloudflare deployment, organization and venue relationships, Building Inspector, media pipeline, and retired Geo Tools workflow.

## Current architectural anchors

- React + Vite single-page application
- custom Three.js globe
- MapLibre flat map and venue-arrival system
- canonical club, event, venue, and host pages
- organizations and team access
- Supabase migrations and row-level security
- Cloudflare Pages and Cloudflare Images
- Building Inspector for authored venue geometry
- repository and adapter boundaries between UI and persistence

## Retired architecture

The former Admin Geo Tool, Boundary Builder, Python boundary-generation pipeline, and `public/geo/country/**` drill-down hierarchy are no longer active product systems.

Do not use older documentation or generated boundary files as implementation guidance. The only retained static geographic asset is the simplified global landmask used by the globe build.
