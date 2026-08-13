# SwingSphere — Current Architecture

_Last updated: July 2026_

## System shape

SwingSphere is a React single-page application built with Vite and deployed to Cloudflare Pages. It combines an immersive Three.js globe, a MapLibre city-scale map, canonical entity pages, an administrative workspace, and a transitional data layer moving from local development data toward Supabase-backed production services.

```text
Browser
├── React Router and application shell
├── Landing and account surfaces
├── Unified explorer
│   ├── Three.js globe
│   ├── MapLibre flat map
│   ├── discovery rail
│   └── listing details panel
├── Entity pages
│   ├── clubs
│   ├── events
│   ├── venues
│   └── hosts / promoters
├── Host dashboard
└── Admin
    ├── moderation and submissions
    ├── clubs, events, venues, and organizations
    ├── users, tags, settings, and audit data
    └── Building Inspector

Services and persistence
├── Supabase Auth and database schema
├── Supabase row-level security and migrations
├── Cloudflare Images
├── Cloudflare Pages
└── local development middleware and JSON fallback data
```

## Entry points

- `index.html` is the HTML shell.
- `index.tsx` mounts providers, routing, protected routes, and development routes.
- `App.tsx` owns the shared shell, age gate, header, backgrounds, toast layer, and route outlet.
- `vite.config.ts` owns the Vite build plus local development middleware.

## Routing

The main route groups are:

- public landing and informational pages
- authentication and account pages
- unified discovery routes
- canonical club, event, venue, and host pages
- host dashboard routes
- admin routes
- gated `/dev/*` routes

Production and development tooling are intentionally separated. Debug controls and composers must remain behind development gates.

## State and data access

SwingSphere uses several focused state layers rather than a single global store:

- `store/appStore.ts` for account, tags, toasts, and shared application state
- `ExplorerProvider` for discovery selection, filters, and view coordination
- entity indexes and repository abstractions for resolving related data
- local state inside complex map, globe, editor, and admin surfaces

The current repository contains both local/mock repositories and Supabase-oriented repositories. New production work should preserve the repository boundary rather than binding UI components directly to Supabase calls.

## Entity architecture

The modern entity model separates content from physical place and ownership:

- `ClubData` describes a recurring club or operator-facing listing.
- `EventData` describes a time-bounded event.
- `VenueData` is the canonical physical location.
- `OrganizationData` represents promoters, hosts, operators, and brands.
- relationship records connect organizations, venues, users, and listings.
- `BuildingAsset` stores authored geometry associated with a venue or listing.
- media and feedback records are separate service-backed entities.

Canonical URLs and identity helpers keep discovery results, detail pages, and relationships stable across surfaces.

## Globe

The production globe is a custom Three.js runtime under `src/features/globe/runtime`.

Responsibilities include:

- globe rendering and camera behavior
- pin and cluster presentation
- hover and selected label hierarchy
- activity-region framing
- country orientation support
- performance profiles and device-aware effects

The globe is a discovery experience, not a geographic authoring system.

## Flat map and venue arrival

The current flat map is MapLibre-based. It supports:

- clusters and listing markers
- shared explorer selection
- city and listing arrival
- provider building extrusions
- authored building assets
- venue-scoped context buildings
- selected-building emphasis

`MiniMapHybrid` is used for embedded maps on entity pages and details panels. It does not depend on the retired boundary-generation system.

## Building Inspector

The Building Inspector is the active spatial authoring tool. It allows an administrator to:

- locate a venue
- inspect provider building geometry
- resolve fragmented building features
- choose or author the correct building footprint
- save a reusable building asset
- connect that asset back to venue and listing data

It is independent from the retired Geo Tools system.

## Admin and moderation

`AdminPanel` coordinates content and moderation workflows for:

- submissions
- flagged content
- clubs and events
- venues
- organizations and team access
- users
- tags and filters
- settings and audit data
- Building Inspector access

Admin surfaces currently combine local-development persistence with Supabase-oriented models. Permission-sensitive production operations must be enforced server-side and through Supabase RLS, not only through client route guards.

## Media

Media handling is organized around:

- upload authorization
- Cloudflare Images direct uploads
- completion and media-record persistence
- crop and aspect-ratio workflows
- ownership metadata
- entity-specific media roles

Never expose Cloudflare API credentials or Supabase service-role credentials in browser code.

## Local middleware

Vite middleware currently supports local development operations such as:

- reading and saving local listings
- reading and saving building assets
- local globe configuration tools
- Cloudflare Images development upload actions

This middleware is a development convenience, not the final production API.

The legacy Geo Tools endpoints remain dormant compatibility code inside the oversized Vite config and should be removed in a dedicated config decomposition pass. The public route, UI, generated assets, scripts, and active middleware registration for that feature have been retired.

## Retired Geo system

The following architecture is no longer supported:

- generated country, state, county, city, district, or ZIP boundary hierarchies
- geographic drill-down based on repository GeoJSON trees
- Admin Geo Tools and Boundary Builder
- Python-driven boundary generation as a product workflow

Retained geographic utilities are limited to what current features use, including country normalization and the simplified globe landmask.

## Deployment architecture

The intended release flow is:

```text
local development
→ Git commit
→ private GitHub repository
→ Cloudflare Pages build
→ preview or production deployment
```

`main` should represent production-ready code. Cloudflare output is generated and should never be treated as the editable source of truth.
