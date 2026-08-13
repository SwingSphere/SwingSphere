# SwingSphere — Current Data Flow

_Last updated: July 2026_

## Overview

SwingSphere is in transition from local prototype persistence to Supabase-backed production data. UI components should consume repository and adapter interfaces rather than assuming that local JSON, mock arrays, or direct Supabase calls are the permanent source of truth.

## Core entities

The primary data graph is:

```text
User
├── profile and role
└── organization membership

Organization
├── promoter / host / operator identity
├── organization team members
├── managed clubs and events
└── venue relationships

Venue
├── canonical address and coordinates
├── public-location policy
├── amenities
└── optional authored BuildingAsset

Club or Event
├── canonical identity and public route
├── organizer / host relationship
├── venue relationship
├── tags and access expectations
├── media
└── provenance, moderation, and feedback state
```

## Read flow

Public discovery and entity pages generally follow this pattern:

```text
repository layer
→ listings, venues, organizations, users, and relationships
→ entity index and compatibility adapters
→ explorer filters or canonical-route resolution
→ globe, map, sidebar, or entity page
```

Important modules include:

- `lib/api.ts`
- repository implementations under `src/features/data`
- `hooks/useEntityIndex.ts`
- `lib/entityIndex.ts`
- `lib/entityCompatibility.ts`
- `lib/entityUtils.ts`
- `lib/identityUtils.ts`

The entity index exists to keep discovery surfaces and detail pages consistent and to avoid repeated ad hoc relationship lookups.

## Explorer flow

```text
entity data
→ discovery point adapters
→ shared search, type, tag, and time filters
→ marker and cluster adapters
→ globe or MapLibre renderer
→ selected entity id
→ details panel and canonical page navigation
```

The globe and map should not maintain competing definitions of an entity. Renderer-specific marker models are adapters over the same source records.

## Globe flow

Approved, geographically eligible entities are adapted into globe events and activity regions. The globe runtime owns rendering and camera state, while React owns application selection and routing.

```text
listings and organizations
→ globe eligibility checks
→ globe marker adapter
→ activity-region clustering
→ Three.js runtime
→ selection callback
→ explorer state
```

Country normalization remains in use for marker metadata and orientation. Generated city and district boundary files are no longer part of this flow.

## Map flow

```text
filtered discovery entities
→ privacy-safe display coordinates
→ GeoJSON marker source
→ MapLibre clusters and markers
→ selected listing or region
→ arrival framing
→ provider and authored building layers
```

Exact private-event locations must not leak through public marker data, map framing, APIs, or embedded minimaps.

## Venue and Building Inspector flow

```text
venue or listing coordinates
→ MapLibre provider buildings
→ administrator selects or resolves building geometry
→ BuildingAsset record
→ venue/listing buildingAssetId
→ public map arrival and selected-building rendering
```

The Building Inspector is the active spatial-authoring workflow. It does not use the retired Geo Tools boundary files.

## Admin write flow

Admin editors currently operate across a transitional data layer:

```text
admin form
→ validation and relationship resolution
→ repository or local development API
→ updated entity record
→ local state refresh
→ canonical entity route or admin list
```

Local development middleware can write `data/listings.local.json` and `data/building-assets.local.json`. These files are development fixtures, not the final production database.

Supabase migrations define the evolving production schema. Schema changes must be added through new migrations rather than rewriting deployed migration history.

## Media flow

```text
user selects image
→ local validation and crop workflow
→ request authorized direct-upload URL
→ upload to Cloudflare Images
→ complete upload
→ save media ownership and entity role
→ render through Cloudflare delivery URL
```

Browser code must never contain Cloudflare API tokens or Supabase service-role credentials.

## Authentication and authorization

Supabase Auth is the intended identity provider. Authorization has two layers:

- client-side route and UI gating for user experience
- database policies and server-side authorization for actual protection

Client role checks alone are not a security boundary.

## Provenance and moderation

Content should carry enough metadata to distinguish:

- community-submitted informational content
- promoter- or owner-managed official content
- pending, approved, rejected, or hidden moderation states
- verified organization and venue relationships
- public exact, approximate, or protected location visibility

Feedback records should target stable entity identities so signals survive UI and route changes.

## Development fallback data

Mock arrays and local JSON remain useful for:

- visual development
- offline work
- deterministic test fixtures
- migration and compatibility work

They should not be assumed to represent production persistence or production authorization behavior.

## Retired flow

The former flow below has been removed from the product direction:

```text
Admin Geo Tool
→ Nominatim / Overpass boundary lookup
→ Python processing
→ generated public/geo/country hierarchy
→ geographic drill-down and boundary minimaps
```

Current maps rely on MapLibre, provider data, privacy-safe coordinates, Overpass road support where needed, and authored building assets.
