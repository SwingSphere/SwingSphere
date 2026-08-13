# SwingSphere Technical Debt

_Last updated: July 2026_

## Highest priority

### 1. Complete the production data transition

The repository still mixes local JSON, mock fixtures, development middleware, and Supabase-oriented repositories. Production reads, writes, permissions, and invalidation should converge on a consistent service-backed architecture.

### 2. Decompose `vite.config.ts`

The Vite configuration contains substantial local API and historical compatibility logic. Move development APIs into focused modules and remove the dormant Geo Tools endpoint implementation left behind after the feature retirement.

### 3. Establish release discipline

The project needs a clean Git history, private GitHub remote, automated Cloudflare previews, production branch protection, and a repeatable release-verification checklist.

### 4. Improve responsive and device capability behavior

The globe and map must remain usable on mobile and on 2019 MacBook Pro-class hardware. Continue device-aware effects, reduced rendering profiles, interaction fallbacks, and mobile-specific layout work.

### 5. Reduce large JavaScript chunks

Current builds report chunks above 500 kB. MapLibre, admin, Three.js controls, and other heavy surfaces should be loaded only where needed. Preserve route-level lazy loading and consider additional manual chunk boundaries where they improve real loading behavior.

## Data and permissions

- finish Supabase repository coverage
- enforce ownership and administrative permissions through RLS and server-side checks
- separate public-safe location data from protected exact locations
- formalize provenance for informational versus official content
- add reliable cache invalidation or refetch behavior after admin changes
- keep schema changes in additive migrations

## UI and architecture

- continue consolidating shared entity-page components
- remove unused competing map and prototype implementations after verifying no current dependencies
- centralize visual tokens and glass-surface behavior
- maintain long-title, international-text, and variable-tag resilience
- keep production routes free from debug and composer UI

## Testing and verification

- add focused automated tests for identity, privacy-safe coordinates, repository behavior, and migrations
- add route smoke tests for globe, map, entity pages, account, host dashboard, and admin
- add visual regression coverage for selected labels, details panels, cards, and responsive layouts
- keep performance verification tied to representative hardware targets

## Media

- complete Cloudflare Images production authorization and ownership flow
- verify crop and contain behavior for logos, banners, flyers, and galleries
- prevent redundant storage and orphaned media records
- document operational recovery for failed direct uploads

## Retired Geo system cleanup

The Geo Tools UI, generated boundary assets, and supporting scripts were retired in July 2026. Remaining cleanup consists of:

- removing dormant compatibility code from `vite.config.ts`
- removing obsolete Geo audit scripts and caches
- ensuring no active documentation suggests restoring the boundary hierarchy

The active spatial-authoring system is the Building Inspector.

## Lower-priority cleanup

- update Browserslist data
- review duplicate favicon and brand assets
- remove stale compiler-output files and historical scratch artifacts
- verify all `.agents/skills/*/SKILL.md` metadata so skills load without warnings
- review dependencies that are installed but no longer used
