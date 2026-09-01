# Street View Building Overlap / Z-Fighting Resolution

**Status:** Active implementation guidance  
**Added:** 2026-08-15  
**Prototype:** `/dev/street-view`  
**Primary implementation:** `components/dev/StreetViewToolPage.tsx`  
**Related authoring tool:** Building Inspector / `components/dev/BuildingInspectorPage.tsx`

## Why this document exists

Street View venue highlighting can fail in a non-obvious way when OpenFreeMap / OpenStreetMap building features contain multiple disconnected polygons or stacked building geometries. The failure first appeared while highlighting **Twist SF**, whose venue footprint is represented by two Building Inspector-authored polygons.

The important lesson is:

> **Do not treat an OpenFreeMap provider feature ID as synonymous with one physical building.**

For venue highlighting, the saved Building Inspector geometry is the source of truth. Provider IDs are useful for finding candidate geometry, but polygon-level overlap must determine what is masked or highlighted.

## Symptoms we saw

Several attempted implementations produced different versions of the same underlying problem:

- White and crimson walls flickered or showed alternating stripes.
- Roofs looked solid red while side walls showed white/red interference.
- Selecting a provider ID turned unrelated buildings elsewhere in the neighborhood red.
- A manually clicked building rendered perfectly solid red, while the authored Twist selection z-fought.
- Reconstructing provider geometry could still fight with the authored geometry because vector-tile copies may be clipped differently between cached or overscaled tiles.

These symptoms are classic **coplanar geometry / z-fighting**, but the root cause was not just a bad height offset. Multiple building geometries were occupying the same physical footprint.

## Root cause

OpenFreeMap's `building` source can expose a single feature ID as a **MultiPolygon containing many disconnected physical building pieces**.

For the Twist SF test case, provider feature `13581200` was not just “the Twist building.” It contained multiple polygon parts, including unrelated pieces.

There was also a second provider feature physically stacked under part of the authored Twist footprint.

Tile-level inspection on 2026-08-15 found the following relevant geometry:

| Provider ID | Polygon part | Approx. height | Relationship to Twist asset |
| --- | ---: | ---: | --- |
| `13581200` | 89 | 5 m | overlaps authored Twist geometry |
| `13581200` | 119 | 5 m | overlaps authored Twist geometry |
| `13581200` | 120 | 5 m | overlaps authored Twist geometry |
| `585241200` | 24 | 4 m | overlaps the second authored Twist footprint |

A manually discovered provider ID, `13618630`, did **not** intersect either saved Twist polygon in the current tile data and appeared to be adjacent rather than the geometry causing the fighting.

The exact provider IDs are diagnostic evidence only. **Do not hardcode them as the generalized fix.** Provider data can change.

## Approaches that did NOT work reliably

### 1. Render a crimson copy over the normal white building

This creates coplanar or nearly coplanar surfaces. Tiny height offsets can reduce roof fighting but do not reliably solve side-wall collisions.

### 2. Color the entire provider feature ID crimson

This is unsafe because one provider feature may contain many disconnected physical buildings. For Twist, this turned unrelated buildings red.

### 3. Hide one provider ID and redraw its pieces

Better, but incomplete when a second provider ID also overlaps the venue footprint.

### 4. Match provider pieces by centroid only

Vector tiles can clip the same source geometry differently. A clipped copy can have a different centroid or bounds and evade the match.

### 5. Expand the authored polygon slightly

This can hide some z-fighting, but irregular polygons can become malformed and it still leaves duplicate geometry underneath.

## Winning approach

The solution that produced a clean solid-red Twist building is:

### 1. Treat Building Inspector geometry as authoritative

The two polygons saved for Twist are the exact venue geometry to render in crimson.

Do not derive the selected venue shape from a provider feature ID at runtime when a Building Inspector asset exists.

### 2. Audit every loaded provider polygon for overlap

After the building source is loaded/prewarmed:

1. Query the OpenFreeMap building source.
2. Split every `Polygon` / `MultiPolygon` feature into individual polygon parts.
3. Compare those physical polygon parts against the saved venue polygons using polygon intersection/containment, not just feature ID or centroid.
4. Collect every provider ID that contains at least one polygon overlapping the venue.

The Street View tool exposes this as the **Overlap Provider Audit**.

### 3. Mask overlapping provider buckets without changing the vector-layer filter

The normal white/graphite city extrusion layer keeps its source and filter stable. Provider IDs detected by the overlap audit are marked with MapLibre feature state, and the bulk layer's `fill-extrusion-height` / `fill-extrusion-base` expressions collapse those provider buckets to zero height.

Do **not** use `setFilter()` for this handoff. In MapLibre, changing a vector-layer filter marks the source for reload and clears the out-of-view tile cache. That undermines Street View's 360° prewarm and can cause buildings to take several seconds to return when the camera rotates back.

The height-mask intentionally removes too much geometry because a coarse provider ID may also contain unrelated buildings, so those safe pieces still need reconstruction.

### 4. Reconstruct only the safe non-overlapping pieces

For each excluded coarse provider feature:

1. Split it into individual polygon parts.
2. Discard any part that overlaps the Building Inspector venue geometry.
3. Deduplicate remaining parts as needed.
4. Re-render only those non-overlapping pieces in the normal context-building color.

This restores unrelated buildings that shared the coarse provider ID without putting geometry back underneath the selected venue.

### 5. Render the authored venue polygons exactly once

Render the saved Building Inspector polygons in the selected crimson layer.

There should be no white provider copy and no second red provider copy occupying the same footprint.

The desired conceptual result is:

```text
OpenFreeMap bulk context
  -> keep filter stable
  -> feature-state height-mask every provider ID that overlaps the authored venue

Excluded provider feature(s)
  -> split into physical polygon pieces
  -> overlapping piece: discard
  -> unrelated piece: reconstruct as context building

Building Inspector asset
  -> venue polygon A: crimson
  -> venue polygon B: crimson
```

## Why this works

It separates responsibilities cleanly:

- **OpenFreeMap** supplies the surrounding city and provider candidate geometry.
- **Building Inspector** decides which exact physical polygons belong to the venue.
- **Overlap detection** finds stacked/duplicate provider geometry that must be removed.
- **Reconstruction** preserves unrelated buildings that happen to share coarse provider IDs.

The selected venue therefore occupies its footprint exactly once, eliminating the source of z-fighting instead of trying to visually cover it.

## Implementation notes

In `components/dev/StreetViewToolPage.tsx`, look for the helpers around:

- `polygonParts(...)`
- `polygonGeometriesOverlap(...)`
- `buildPersistentNearFieldAtlas(...)`
- `providerFeatureStateId(...)`
- `overlappingProviderIds`
- `AUTHORED_PARTS_SOURCE_ID`
- `AUTHORED_CONTEXT_LAYER_ID`
- `AUTHORED_SELECTED_LAYER_ID`
- `NEAR_FIELD_LAYER_PREFIX`

The current implementation collects provider geometry during the initial four-bearing prewarm, builds the local atlas once, masks the handed-off provider buckets with feature state, and then keeps the atlas resident for the rest of the fixed-orbit session. Avoid rebuilding or refiltering the OpenFreeMap vector source during normal camera rotation.

## Debugging checklist for another venue

If a selected venue flickers, stripes, or appears partly white:

1. Confirm the venue has a Building Inspector asset and inspect its saved polygon count.
2. Check the **Overlap Provider Audit** rather than assuming one provider ID equals one building.
3. Inspect each overlapping provider feature at polygon-part level.
4. Verify every provider ID that physically overlaps the authored venue is masked/collapsed in the bulk context layer through feature-state height/base, not dynamically filtered during orbit.
5. Verify overlapping provider polygon parts are **not** reconstructed in the context replacement layer.
6. Verify the authored venue polygon itself is rendered only once.
7. Check for stacked lower-height building parts from a second provider ID.
8. Avoid solving the issue with arbitrary height offsets until duplicate geometry has been ruled out.

## Twist SF reference result

The clean result was achieved after the automatic overlap logic identified both `13581200` and `585241200` as geometry intersecting the two authored Twist polygons. Once those overlapping provider geometries were masked and the exact Building Inspector polygons were rendered once in crimson, the visible z-fighting disappeared.

This is the pattern to reuse for future Street View venue highlighting problems.

## Persistent near-field atlas for cinematic occlusion

The occlusion dissolve uses the same polygon-level lesson, but with an additional performance constraint.

`fill-extrusion-opacity` is a **data-constant** property in the MapLibre version used by SwingSphere. It can transition one layer's opacity, but it cannot use `feature-state` to assign a different opacity to every building in a shared extrusion layer. Earlier attempts to animate per-building opacity through feature state therefore snapped instead of dissolving.

The durable desktop prototype architecture is:

1. During the initial 360° preload, collect the nearby OpenFreeMap building polygons.
2. Build a persistent near-field atlas for roughly the local 2–3 block presentation zone.
3. Hand the relevant coarse provider buckets from the bulk vector layer to the atlas with the feature-state height mask described above.
4. Reconstruct unrelated siblings from those coarse provider IDs in a static atlas context layer.
5. Give each near-field physical building polygon its own lightweight `fill-extrusion` layer referencing the shared atlas GeoJSON source.
6. Keep those layers resident for the entire Street View session.
7. When a polygon enters or leaves the camera-to-venue sightline, change only that layer's `fill-extrusion-opacity` and let MapLibre's native paint transition perform the dissolve.

Current Phase One desktop guardrails are a **210 m atlas radius**, a maximum of **96 individually animated near-field layers**, and a saved Twist SF dissolve duration of **1000 ms**. At the 2026-08-02 OpenFreeMap tile snapshot, Twist SF has roughly **53 physical building polygons inside 210 m**, comfortably below that ceiling. If a denser venue exceeds the ceiling, the closest 96 buildings remain individually animated and overflow geometry falls back to the shared static sibling layer.

This intentionally trades a modest number of extra local layers and some startup memory for stable interaction. The important runtime property is that **camera rotation no longer changes the OpenFreeMap source filter or reparses the neighborhood tile buckets**.

For the complete Phase One renderer/performance handoff, see `street-view-phase-one.md`. Mobile should be treated separately later, with a smaller atlas or reduced/disabled cinematic occlusion on lower-end devices.
