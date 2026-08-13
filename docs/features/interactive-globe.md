# Interactive Globe (React Three Fiber)

## 1) Feature Name
Interactive Globe (R3F scene + drill-aware overlays)

## 2) Purpose
Render a 3D globe exploration surface for listings/events with boundary overlays, clustering, drill gating, and click-to-focus behavior.

## 3) Where It Lives (files + folders)
- `components/EventBrowser.tsx`
- `components/globe/CobeGlobe.tsx`
- `components/globe-scene/GlobeScene.tsx`
- `components/globe-scene/LocationPins.tsx`
- `components/globe-scene/BoundaryOverlayLayer.tsx`
- `components/globe-scene/LandModel.tsx`
- `components/globe-scene/OceanModel.tsx`

## 4) How It Works (technical flow)
- `EventBrowser` chooses view mode (`/globe` or `/map`), computes scoped listings by drill level, and builds `boundaryOverlays` + `focusTarget`.
- `CobeGlobe` transforms scoped listings into `GlobePinStack[]`, applies time-lens filtering, and forwards props into `GlobeScene`.
- `LocationPins` handles cluster compression (screen-space) and emits click payloads with `clusterMemberIds`.
- `CobeGlobe` handles cluster click behavior (`zoom_first` or list-open path) and animates camera focus with `requestAnimationFrame`.
- `BoundaryOverlayLayer` extracts polygon rings from GeoJSON and renders line loops on globe radius layers.

## 5) Data Dependencies
- `Listing` objects from `api.getListings()`.
- Time-lens state from `useAppStore()`.
- GeoJSON boundaries from `public/geo/**` (loaded via `lib/globeDrilldown.ts`).

## 6) UI Dependencies
- Shared explorer rail (`components/explorer/ExplorerDiscoveryRail.tsx`).
- Sidebar detail panel (`components/sidebar/ClubSidebar.tsx`).
- Nearby/scope list panel in `EventBrowser`.
- Time controls (`components/time-lens/TimeLensBar.tsx`).

## 7) Known Edge Cases
- Boundary load failures silently drop specific overlays.
- Non-finite lat/lon listings are skipped from pin stacks.
- Cluster clicks can produce list mode or focus zoom depending on debug setting.

## 8) Future Expansion Hooks
- Add new boundary kinds in `BoundaryOverlayLayer`/`BoundarySource.kind`.
- Extend focus heuristics in `EventBrowser` (currently centroid/bbox based).
- Move debug controls into dedicated admin/debug state if needed.

## 9) Risk Areas
- Large GeoJSON overlays and many pins can increase frame cost.
- Multiple globe implementations exist in repo (active and legacy), increasing confusion risk.


