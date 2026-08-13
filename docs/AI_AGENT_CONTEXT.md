# AI Agent Context

## Core Product Vision (Evidence-Based)
Observed product intent from code/content:
- Discover nightlife/community listings (clubs + events) with map-first exploration.
- Emphasis on trust/safety cues, moderation, and role-based admin operations.
- Encourage community-contributed listings and canonical entity pages.

Evidence:
- Landing and routing flow in `components/LandingPage.tsx` and `index.tsx`.
- Trust/moderation modules in `components/admin/*` and `components/entity/TrustSection.tsx`.

Unclear behavior:
- Revenue/business model and production deployment target are not defined in repo.

## Current UI Philosophy
- Dark, high-contrast visual language dominates global shell (`App.tsx`, `index.css`).
- Exploration UX is spatial-first:
  - Globe/map are primary discovery surfaces (`components/EventBrowser.tsx`).
  - Drill gating intentionally delays pin detail to reduce clutter.
- Entity pages are modular, section-composed, and canonical-route driven.

## Design Tokens / UI Constants
Primary tokenized values present:
- `lib/uiTokens.ts`:
  - Hero heights (`defaultHeight`, `clubHeight`)
  - Thumbnail sizes/gaps
  - Surface radii
- `components/globe/globeConstants.ts`:
  - Camera/zoom constraints
  - HUD geometry constants
  - Cluster constants and pin alignment offsets
- Minimap style config:
  - `public/config/minimap-style.json`
  - editable via admin style endpoint (`pages/api/admin/ui-style/minimap.ts`)

## Map Behavior Philosophy
- Scope-first, then detail:
  - World/country/admin1 emphasize boundaries + clustered density.
  - Local unlocks pins and direct selection.
- US treated as composite regions for camera quality (lower-48 default).
- Spatial containment and boundary fallback prioritize resilient display over hard failure.

Key files:
- `components/EventBrowser.tsx`
- `lib/globeDrilldown.ts`
- `components/maps/geoResolver.ts`

## Why Current Tradeoffs Exist (Inferred From Code)
- Mock-first architecture (`lib/api.ts`, `USE_MOCK = true`) suggests iteration speed and UI/system prototyping were prioritized over backend integration.
- Dev middleware in `vite.config.ts` centralizes geo tooling to keep operator workflow inside the same app.
- Multiple map/globe implementations indicate transition history from prototype surfaces to current `EventBrowser` path.

Unclear behavior:
- No explicit ADRs explain when legacy map/globe paths should be deleted.

## Constraints Future Agents Must Respect
- Canonical identity keys power routing and cross-linking; avoid breaking `identityUtils`/`entityIndex` contracts.
- Drilldown and cluster member propagation contracts are tightly coupled (`LocationPins` -> `CobeGlobe` -> `EventBrowser`).
- Geo path normalization (`country/admin1/city`) is shared across TS/Python; changes require cross-runtime alignment.

## Roadmap Direction (Repo-Grounded)
Likely near-term directions supported by existing code:
- Replace mock API/auth with real backend adapters while preserving current UI contracts.
- Consolidate map/globe implementations and retire legacy prototypes.
- Improve geo pipeline determinism and reduce runtime Overpass dependency.
- Expand validation/diagnostics around duplicate identity keys and boundary health.

Unclear behavior:
- Supabase-specific roadmap is not represented in code; any Supabase adoption path must be newly defined.


