# SwingSphere Developer Onboarding

_Last updated: July 2026_

## Prerequisites

- Node.js compatible with the current Vite toolchain
- npm
- access to the private SwingSphere GitHub repository
- access to the appropriate Supabase and Cloudflare projects when working on connected services

Python is not required for normal development. The former Python Geo Tools workflow has been retired.

## Local setup

```bash
npm install
npm run dev
```

The Vite development server is configured in `vite.config.ts` and is available to other devices on the local network through `host: 0.0.0.0`.

Useful commands:

```bash
npm run build
npm run build:cloudflare
npm run preview
npm run preview:cloudflare
npm run verify:feedback
```

## Environment files

Use `.env.example` as the safe reference. Real environment files are ignored by Git.

Common local files include:

- `.env.local`
- `.env.development.local`
- `.env.cloudflare`

Never commit:

- Supabase service-role keys
- database passwords
- Cloudflare API tokens
- Cloudflare Images secrets
- private administrative credentials

Values prefixed with `VITE_` are exposed to browser code and must be treated as public.

## Read these files first

1. `AGENTS.md` — product and engineering rules
2. `PROJECT_OVERVIEW.md` — current product and system status
3. `ARCHITECTURE.md` — system boundaries and active subsystems
4. `DATA_FLOW.md` — entity and persistence flow
5. `types.ts` — core entity types
6. `index.tsx` — routes and providers
7. `store/appStore.ts` — shared application state
8. `components/ProductionGlobePage.tsx` — globe integration
9. `components/maps/FlatWorldMap.tsx` — current MapLibre experience
10. `components/dev/BuildingInspectorPage.tsx` — authored building workflow

## Product architecture to understand

SwingSphere separates:

- clubs and events from their physical venue
- promoters and hosts into organizations
- organization membership from ordinary user profiles
- public discovery coordinates from protected exact locations
- community-submitted information from official managed content
- media records from entity records
- provider building geometry from authored BuildingAssets

Preserve these distinctions when adding features.

## Development routes

Development tools live under `/dev/*` and are gated. Production `/globe` must not expose debug composers, diagnostics, or tuning controls.

The active administrative spatial tool is:

```text
/admin/building-inspector
```

The former `/admin/geo` route and generated boundary workflow have been retired.

## Data and Supabase

- Review existing migrations before changing schema.
- Add new migrations; do not rewrite deployed history casually.
- Preserve row-level security.
- Never expose service-role credentials in client code.
- Treat precise private-event locations and personal information as sensitive.
- Use repository abstractions where they exist instead of adding direct data access in UI components.

Local JSON files remain development fixtures and compatibility fallbacks. They are not the final production database.

## Cloudflare

Cloudflare Pages hosts the built application. Cloudflare Images is the intended managed image-delivery system.

Normal release flow:

```text
local branch
→ commit
→ push to GitHub
→ Cloudflare preview deployment
→ merge to main
→ production deployment
```

Do not edit `dist` or treat the deployed Cloudflare output as source code.

## Verification expectations

For meaningful changes:

1. inspect the relevant shared components and adapters
2. run the narrowest applicable verification
3. run `npm run build`
4. review the Git diff
5. test the affected route or interaction visually

A successful build does not prove a visual issue is fixed.

## Core smoke tests

### Discovery

- Load `/globe` and confirm pins, hover labels, selected labels, search, filters, and details panel behavior.
- Load `/map` and confirm clusters, marker selection, arrival framing, and building layers.
- Confirm globe and map resolve the same entities.

### Entity pages

- Open representative club, event, venue, and host routes.
- Test long names, variable tags, missing media, and international addresses.
- Confirm private location behavior does not reveal exact coordinates.

### Admin

- Open `/admin` and verify content lists and editors.
- Test organization and venue relationships.
- Open the Building Inspector and verify selected geometry can be loaded and saved in development.

### Media

- Validate file type, size, crop, and ownership behavior.
- Confirm delivery URLs use Cloudflare Images when configured.

### Responsive and performance

- Test desktop and mobile layouts.
- Include a 2019 MacBook Pro-class performance target.
- Confirm reduced-effects behavior on lower-capability devices.

## Retired Geo system

Do not restore the old generated GeoJSON drill-down hierarchy without a new product decision and architecture review. Current geographic functionality should use the globe landmask, MapLibre/provider data, privacy-safe points, roads where needed, and authored building assets.
