# SwingSphere — Project Overview

_Last updated: July 2026_

## Product

SwingSphere is a premium adult nightlife and lifestyle discovery platform for clubs, events, venues, promoters, hosts, and communities. Its core product experience is geographic discovery through an immersive globe and a detailed MapLibre view, supported by strong entity pages, moderation tools, and provenance-aware content.

SwingSphere is not intended to be a GIS application. Geographic systems exist to make discovery intuitive, cinematic, and useful.

## Current stack

- React 18 + TypeScript + Vite
- Three.js production globe
- MapLibre GL flat map and venue-arrival experience
- React Router
- Tailwind/PostCSS styling
- Supabase for authentication, database schema, organizations, media records, and future production persistence
- Cloudflare Pages for hosting
- Cloudflare Images for managed media delivery

## Primary product surfaces

| Surface | Purpose |
|---|---|
| `/` | Landing experience and featured discovery |
| `/globe` | Primary immersive discovery experience |
| `/map` and `/explore` | Flat-map discovery and listing exploration |
| `/clubs/:slug` | Club detail pages |
| `/events/:slug` | Event detail pages |
| `/venues/:slug` | Venue detail pages |
| `/hosts/:slug` | Promoter and host pages |
| `/account` | Member account and profile |
| `/host/dashboard` | Host and promoter management experience |
| `/admin` | Moderation, content, venue, organization, and user administration |
| `/admin/building-inspector` | Building selection and authored venue geometry |
| `/dev/*` | Development-only tools and visual test surfaces |

## Discovery architecture

The globe and flat map are two views of the same discovery system.

- Listings are adapted into shared discovery markers.
- Search, tags, listing type, and time filters are shared through explorer state.
- The globe emphasizes world and regional exploration.
- The flat map handles city-scale arrival, clusters, roads, and selected buildings.
- Detail panels and canonical entity pages resolve from the same entity model.

Automatic globe-to-map switching has been de-emphasized in favor of deliberate user control and predictable arrival behavior.

## Entity model

The current model distinguishes:

- clubs
- events
- venues
- organizations
- users
- organization memberships
- organization-to-venue relationships
- media assets
- authored building assets
- feedback and moderation targets

A venue is the canonical physical place. Clubs and events can reference a venue. Organizations represent promoters, hosts, operators, and brands. This separation is central to the modern architecture.

## Trust and provenance

SwingSphere is being designed to distinguish:

- community-submitted informational listings
- promoter- or owner-managed official listings
- verified organization and venue relationships
- public exact locations versus approximate or protected locations

Privacy, ownership, moderation, and auditability should be considered whenever a content feature is added.

## Media

Cloudflare Images is the intended image delivery layer. The application supports media records, upload workflows, crop handling, ownership metadata, and entity-specific image roles such as logos, hero images, flyers, galleries, and avatars.

## Data reality

The repository currently supports a transitional architecture:

- local JSON and mock data remain available for development and fallback behavior
- Supabase migrations and repository abstractions are present and increasingly define the production model
- local Vite middleware supports development-only listing, building asset, and media operations
- production data should ultimately come from Supabase rather than local JSON files

Do not treat mock data or local JSON persistence as the final production backend.

## Retired systems

The former Geo Tools and boundary-generation system has been retired. The city, district, county, ZIP, and drill-down boundary asset hierarchy is no longer part of the product direction.

The only retained static geographic asset under `public/geo` is the simplified global landmask used by the globe build. Current minimaps and venue maps use MapLibre, provider data, Overpass road support, and the Building Inspector rather than generated city-boundary files.

## Current priorities

1. responsive mobile discovery
2. performance on 2019 MacBook Pro-class hardware and midrange devices
3. polished club, event, venue, and host pages
4. Supabase-backed production persistence and permissions
5. submission, moderation, provenance, and ownership workflows
6. Cloudflare Images integration
7. consistent design-system behavior
8. release and deployment discipline through GitHub and Cloudflare

## Source of truth

- Current code is the implementation source of truth.
- `AGENTS.md` contains durable product and engineering guidance.
- Supabase migrations are the source of truth for schema evolution.
- Generated `dist` output is disposable and must not be edited directly.
