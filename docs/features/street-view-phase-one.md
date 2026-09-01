# Street View Phase One

**Status:** Desktop prototype baseline / Phase One  
**Date:** 2026-08-15  
**Prototype route:** `/dev/street-view`  
**Primary implementation:** `components/dev/StreetViewToolPage.tsx`  
**Landmark helper:** `components/dev/streetViewLandmarks.ts`  
**Building authoring dependency:** Building Inspector / `components/dev/BuildingInspectorPage.tsx`

## Product intent

Street View is a fixed-location presentation mode for a public venue or event address. It is not intended to replace a navigation/map application.

The planned public interaction is:

1. Select a venue/event pin on the globe.
2. If the same pin is already selected, a second activation can enter Street View.
3. Street View opens at an authored camera bearing/pitch/distance centered on the selected public location.
4. The user can orbit the fixed camera anchor but does not freely travel through the city.
5. The venue stays visually dominant through solid crimson highlighting and cinematic occlusion assistance.

The production UI direction is a minimal venue detail card, compass/reset control, local street names, and the 3D neighborhood. Dev authoring controls remain dev/admin-only.

## Phase One renderer architecture

Street View uses MapLibre as the primary city renderer.

### Distant city

OpenFreeMap vector buildings remain in the normal `fill-extrusion` context layer.

### Venue geometry

When Building Inspector geometry exists, it is authoritative for the selected venue. Do not assume one OpenFreeMap feature ID equals one physical building.

See `street-view-building-overlap-resolution.md` for the full z-fighting/provider-ID failure history.

### 360-degree preload

Before reveal, the prototype visits four bearings around the authored camera and waits for the building source to settle. Visible provider geometry is cached during this pass.

The finished atlas/masking state is established before the final public-facing arrival frame. Camera rotation after reveal must not mutate the OpenFreeMap building filter.

### Persistent near-field atlas

The immediate venue presentation zone is extracted once into a shared GeoJSON source.

Current desktop constants:

- radius: **210 m**
- maximum individually animated building layers: **96**
- Twist SF measurement against the 2026-08-02 OpenFreeMap tile snapshot: approximately **53 physical building polygons within 210 m**

Each near-field physical building that remains under the 96-layer ceiling receives its own lightweight `fill-extrusion` style layer. This is intentional: MapLibre's `fill-extrusion-opacity` is layer-level in the version used by SwingSphere, so individual layers are what allow true native per-building opacity transitions.

If a future dense location exceeds 96 eligible near-field polygons, the closest 96 retain cinematic dissolve behavior. Overflow polygons remain visible through the shared static sibling layer. Do not allow an unbounded number of per-building layers.

### Provider masking

Do **not** call `setFilter()` on the OpenFreeMap building layer during Street View orbit.

Dynamic vector-layer filters caused two major problems during development:

- MapLibre rebuilt vector-tile render buckets.
- MapLibre reset/unloaded its out-of-view tile cache, undermining the 360-degree preload and causing buildings to take several seconds to return.

Instead, provider buckets handed to SwingSphere are masked through MapLibre `feature-state` applied to data-driven `fill-extrusion-height` and `fill-extrusion-base`. Masked provider geometry collapses to a microscopic **0.001 m** height while the local atlas supplies the visible physical polygons. Do not change this back to literal zero if terrain is enabled: MapLibre's terrain extrusion shader gives ground-level buildings a small basement to avoid slope gaps. The microscopic extrusion still has a planar top cap, so terrain mode additionally marks masked provider features with `terrainPlateHidden`; the provider context color expression renders only those caps in the dark ground color while terrain is active.

The same technique is used to hide generic provider geometry underneath selective custom landmarks such as the Transamerica Pyramid and Coit Tower.

## Occlusion assist

Occlusion is calculated only against the persistent near-field polygons.

A building must be on the camera-facing side of the venue and project into the venue sightline before it is treated as an occluder. The calculation runs when camera motion settles, not every render frame.

Current saved Twist SF baseline:

- mode: `fade`
- occluder opacity: **0.12**
- sensitivity: **82 px**
- dissolve duration: **1000 ms**

The opacity change is performed by MapLibre's native `fill-extrusion-opacity-transition` on the individual building layer. Do not replace this with repeated `GeoJSONSource.setData()` calls or `feature-state` opacity; both were tested and were unsuitable for this renderer path.

## Selected venue rendering

The venue itself is rendered from exact Building Inspector geometry in the selected crimson layer.

Rules:

- render the authoritative venue footprint once
- do not stack a second red extrusion over a white provider extrusion
- do not recolor an entire coarse provider ID
- automatically identify every provider polygon that overlaps the authored venue
- preserve unrelated sibling polygons from coarse provider IDs through the atlas context layer

These rules are required to avoid z-fighting and accidental neighborhood-wide selection.

## Selective landmark fixes

### Transamerica Pyramid

OpenStreetMap contains a correct pyramidal building part for the Transamerica Pyramid, but OpenFreeMap's generic building tile path does not expose the roof-shape semantics required by a standard `fill-extrusion`.

Phase One resolves the live OpenFreeMap pyramid footprint/height and replaces the generic box with a tiny Three.js custom layer containing a tapered pyramid mesh. It shares MapLibre's depth buffer and does not require a GLTF/model download.

### Coit Tower

With terrain enabled, Telegraph Hill reads correctly but the generic Coit Tower extrusion still does not communicate the landmark strongly enough. The current OpenFreeMap building tile contains several useful Coit components around the same center, including mapped heights near **5 m, 8 m, 10 m, 12 m, 50 m, and 64 m**.

The custom Coit landmark resolves those live features by location/height rather than hardcoded provider IDs. It masks the generic provider copies and reconstructs a lightweight stepped silhouette from four mapped tiers: the broad 5 m base, 12 m inner base, 50 m body, and 64 m upper shaft. The small 8 m/10 m provider pieces are masked with the rest of the generic tower geometry rather than creating overlapping duplicate surfaces.

Both custom landmark transforms sample `map.queryTerrainElevation()` so they remain anchored to the ground when the terrain experiment is enabled. Coit uses a single elevation sample at the tower center so the structure stays rigid and vertical instead of deforming to the hillside.

These are targeted landmark treatments, not a general landmark engine. Continue using normal MapLibre extrusions for the city unless a recognizable skyline landmark is visibly wrong or loses its identity in the generic renderer.

## Local labels

Street names are intentionally local rather than city-wide.

Current behavior:

- source: OpenFreeMap `transportation_name`
- approximate radius: **230 m**
- labels are deduplicated by local block-sized cells
- screen rotation is derived from projected road-segment endpoints so text follows perspective correctly
- labels reorient after camera motion settles

Do not restore automatic repeated line labels across the full city.

## Experimental neighborhood heartbeat

The dev prototype now includes a lightweight radial "heartbeat" through the persistent near-field atlas.

Current test values:

- repeat interval: **6500 ms**
- wave speed: **120 m/s**
- building color mix: **22% toward the selected crimson**
- attack: **240 ms**
- hold: **180 ms**
- release: **520 ms**

The pulse does not add geometry, textures, shaders, or a per-frame animation loop. Distance from the authored venue is calculated once for each resident near-field building. Each heartbeat schedules a pair of native MapLibre `fill-extrusion-color` transitions for those already-rendered layers. This should remain a restrained ambient cue rather than a constant nightclub-style effect.

## Experimental terrain comparison

MapLibre GL JS supports real 3D terrain from a separate `raster-dem` source. OpenFreeMap supplies the vector basemap/buildings but not the DEM used by this experiment.

The dev tool currently registers the DEM source used by MapLibre's public terrain example (`https://tiles.mapterhorn.com/tilejson.json`) and exposes a **Terrain experiment** toggle in the Street Materials & Light panel. Terrain is **off by default and is not saved in the venue profile**.

Important constraints:

- treat the current DEM endpoint as a development/prototyping dependency, not an approved production terrain provider
- terrain adds raster DEM tile downloads plus terrain mesh/render work, so it is meaningfully more expensive than the heartbeat effect
- native MapLibre `fill-extrusion` buildings are terrain-aware in the current renderer
- MapLibre gives ground-level terrain extrusions an internal ~10 m basement to prevent floating on slopes; faded atlas buildings use a microscopic positive base (`0.001 m`) while terrain is active so that basement is not exposed
- a separate terrain artifact comes from the permanently collapsed provider copy beneath the atlas: its zero-thickness top cap remains planar at the provider feature's terrain elevation, so a slope can slice it into irregular visible islands
- terrain mode therefore sets `terrainPlateHidden` on masked provider IDs and renders those provider caps in the dark ground color; flat mode keeps the normal building color so the existing flat foundation cue is unchanged
- custom Three.js landmarks must explicitly sample terrain elevation; both Transamerica and Coit do this
- validate occlusion, provider masking, camera framing, and FPS visually before considering terrain part of the production baseline
- Coit Tower is now the second selective landmark test specifically because its identity depends heavily on Telegraph Hill elevation

## Performance audit — Phase One

Audit completed 2026-08-15 after the persistent-atlas implementation.

### Verified

- no runtime `setFilter()` calls remain in `StreetViewToolPage.tsx`
- no per-frame GeoJSON rewrite loop is used for occlusion
- near-field atlas is built once per Street View session
- occlusion scans only resident near-field polygons and runs after camera settling
- later OpenFreeMap `sourcedata` events no longer rewrite the selected-building sources or unnecessarily rescan occlusion
- individually animated near-field layers are capped at 96
- Transamerica and Coit custom geometry/material resources dispose on layer removal
- current saved dissolve timing is 1000 ms
- neighborhood heartbeat uses scheduled paint transitions only; no per-frame pulse loop
- terrain remains an opt-in dev experiment rather than Phase One baseline runtime
- isolated TypeScript check passes
- production Vite build passes
- `git diff --check` passes

The current Twist source tile contains about 53 physical polygons inside the 210 m atlas radius, comfortably below the desktop guardrail. User-side testing of the current prototype has shown smooth interaction around the target desktop setup; treat this as product testing, not a formal cross-device benchmark.

### Expected cost

The atlas adds startup CPU work, a shared GeoJSON copy of the nearby neighborhood, and a modest number of additional MapLibre style layers/draw calls. The trade is intentional because it eliminates repeated vector-tile bucket rebuilds and cache churn during orbit.

For the current desktop scope, this is preferable to dynamically mutating the OpenFreeMap source/layer structure while the user rotates.

### Dev-only overhead

The `/dev/street-view` tool publishes FPS/render diagnostics into React state and contains authoring/inspection UI. These diagnostics should not be treated as required production runtime work. The eventual public Street View surface should omit or disable them.

## Known limitations / deferred work

- **Desktop only for Phase One.** Mobile behavior and memory budgets have not been designed or tested.
- Public Globe → Street View integration is not implemented yet.
- Per-venue authoring still needs to be generalized beyond the Twist SF prototype profile.
- Dense-city locations above the 96-layer guardrail will have some near-field buildings that remain solid rather than participating in cinematic dissolve.
- OpenFreeMap/OSM provider IDs and geometry can change over time; polygon-level overlap remains the authority, not hardcoded IDs.
- Selective custom landmark geometry is currently limited to the Transamerica Pyramid and Coit Tower; do not expand this into building-by-building downtown authoring without a clear visual need.
- Terrain is experimental, off by default, and currently uses a dev DEM source that has not been approved for production.
- The viewer is fixed-orbit by design; public free travel/zoom is intentionally out of scope for Phase One.

## Do not regress these decisions

Future agents working on Street View should preserve these invariants unless there is a measured replacement:

1. Building Inspector geometry is authoritative for authored venues.
2. Do not equate provider feature IDs with physical buildings.
3. Do not use dynamic `setFilter()` changes for cinematic occlusion.
4. Do not animate per-building extrusion opacity via repeated `setData()`.
5. Do not use `feature-state` with `fill-extrusion-opacity`; it is data-constant in the current MapLibre style spec.
6. Keep the near-field atlas bounded.
7. Run occlusion classification after camera settling, not every frame.
8. Preserve the 360-degree preload/cache rather than invalidating it during orbit.
9. Avoid duplicate selected/provider geometry at the same footprint.
10. Treat mobile as a separate optimization phase.

## Phase Two candidates

When this work resumes, the likely next steps are:

- integrate selected-pin second activation from the production globe
- move the clean venue card/compass/reset surface into the public experience
- make Street View profiles a generalized per-listing authoring/data model
- test additional venues in low-rise, dense high-rise, suburban, and multi-building environments
- define mobile capability tiers only after desktop behavior is stable
