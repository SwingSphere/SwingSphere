# SwingSphere Repository Map

_Last updated: July 2026_

## Root

- `index.tsx` — routing, providers, protected routes, and development routes
- `App.tsx` — shared application shell
- `types.ts` — core domain types
- `vite.config.ts` — build configuration and local development middleware
- `PROJECT_OVERVIEW.md` — product and system summary
- `ARCHITECTURE.md` — current system architecture
- `DATA_FLOW.md` — current data and persistence flow
- `GLOBE_SYSTEM.md` — globe-specific architecture
- `AGENTS.md` — durable product and engineering rules

## Primary application folders

### `components/`

Public pages, shared UI, authentication, entity layouts, explorer surfaces, maps, admin tools, and development-only test pages.

Important subfolders:

- `components/explorer/` — shared globe/map discovery experience
- `components/maps/` — MapLibre, minimaps, markers, roads, and venue arrival
- `components/entity/` — reusable entity-page composition
- `components/club/`, `event/`, `host/` — entity-specific presentation
- `components/admin/` — moderation, management, organizations, venues, and Building Inspector entry points
- `components/dev/` — gated visual and runtime tools
- `components/media/` — upload, crop, and image rendering
- `components/feedback/` — feedback and signal UI

### `src/features/`

Feature-oriented runtime and repository implementations. The custom production globe runtime lives under `src/features/globe/runtime`.

### `lib/`

Shared adapters, identity helpers, explorer behavior, data compatibility, map/globe utilities, media services, privacy logic, and repository support.

### `hooks/`

Reusable data and explorer hooks.

### `store/`

Shared application state.

### `data/`

Development fixtures, local JSON stores, mock records, country aliases, and calibration data.

### `supabase/`

Supabase configuration, migrations, pending migration work, email templates, and schema snapshots. Deployed migration history must not be rewritten casually.

### `public/`

Static production assets, including globe models and textures, favicons, headers, redirects, robots configuration, and the retained simplified landmask.

The old generated `public/geo/country/**` and `_archive/**` hierarchies were retired.

### `pages/api/`

Cloudflare-compatible API entry points currently used for selected media and configuration operations.

### `scripts/`

Verification, maintenance, and setup scripts. Obsolete Geo boundary audit scripts should not be included in the long-term repository.

## Active spatial systems

- `components/ProductionGlobePage.tsx`
- `src/features/globe/runtime/`
- `components/maps/FlatWorldMap.tsx`
- `components/maps/MiniMapHybrid.tsx`
- `components/maps/venueArrival.ts`
- `components/dev/BuildingInspectorPage.tsx`
- `components/admin/AdminBuildingInspector.tsx`

## Retired spatial system

The Admin Geo Tool, Boundary Builder, Python boundary generator, and static geographic drill-down tree are no longer active. References to those systems in old commits or external notes should be treated as historical only.
