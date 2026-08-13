# `land.glb` coastline audit

## Executive conclusion

`land.glb` is healthy for its approved visual purpose, terrain raycasting, and pin anchoring. It is not a conventional shared-vertex terrain sheet with a single open coastline boundary. It is one indexed primitive containing 46 disconnected low-poly land solids. Most components are positionally closed; six tiny open loops and eight non-manifold edges remain, but they do not explain the global coastline.

The visible coastline is the **radial silhouette of those land solids above `ocean.glb`**. Near-vertical and inward-facing closure faces exist, but there is no stable, separately authored top/side-wall vertex layer whose shared edges can be chained into the world coastline. A normal-threshold edge extractor therefore produces fragmented paths and internal false positives.

The existing production GLB does not need repair. The recommended classification is **Outcome B: derived helper asset needed**:

```text
immutable land.glb
→ offline radial-intersection land mask
→ traced and error-simplified physical coastline paths
→ country-specific coastline helper asset
→ GeoJSON political-border splicing
→ existing terrain anchoring and shader border renderer
```

No Blender work is required. Codex can implement the full extraction and country-border correction with deterministic Node.js and Three.js scripts. Manual vertex editing would add risk without improving the approved silhouette.

## Immutable inputs and generated diagnostics

- Source land: `public/assets/globe/models/land.glb` (246,920 bytes).
- Source ocean: `public/assets/globe/models/ocean.glb` (46,008 bytes).
- Neither source GLB was modified or overwritten.
- Reproducible audit: `scripts/globe/audit-land-glb-coastline.mjs`.
- Machine-readable results: `.codex-temp/globe-model-audit/land-glb-audit.json`.
- Lab-only line asset: `public/assets/globe/models/audit/land-coastline-diagnostics.json`.

## Model hierarchy and geometry

### Land

| Property | Result |
| --- | ---: |
| Scenes / default scene | 1 / 0 |
| Nodes | 1 (`earth_converted`) |
| Meshes | 1 (`earth_converted`) |
| Primitives | 1 triangle primitive |
| Materials | 1, double-sided |
| Position records before welding | 9,358 |
| Exact unique positions | 1,859 |
| Duplicate-position records | 7,499 |
| Indices | 10,608 unsigned 16-bit indices |
| Triangles | 3,536 |
| Indexed / non-indexed primitives | 1 / 0 |
| Zero-area triangles | 0 |

The GLB node has an identity translation, rotation, scale, and matrix. Transforms are baked into its vertex positions. It has no child nodes, animation, skinning, morph targets, compression extensions, or country metadata.

Local-space bounds:

- AABB minimum: `[-2.652352, -2.593993, -2.454510]`.
- AABB maximum: `[2.558207, 2.595690, 2.583578]`.
- AABB center: `[-0.047073, 0.000849, 0.064534]`.
- AABB size: `[5.210559, 5.189683, 5.038088]`.
- Vertex bounding-sphere center: the AABB center above.
- Maximum vertex distance from that center: approximately `2.743456`.
- Minimum vertex distance from that center: approximately `2.476680`.

The source generator identifies itself as `SwingSphere land.glb with Hawaii appended`. This matches the localized Hawaii topology anomalies found below.

### Ocean

`ocean.glb` also contains one identity-transformed node, mesh, primitive, and material. It has 1,728 position records and 576 triangles. Its vertex radii are approximately `2.436050–2.477331`, while land reaches approximately `2.743456`. The visible land is therefore materially raised above the ocean; the coastline is not created by the ocean merely hiding a complete submerged land sphere.

### Runtime transforms and orientation

`GlobeAssetLoader` selects the first mesh from each GLB. `GlobeRenderer` places both under a shared `globe` group, translates that parent by the negated combined land/ocean AABB center, and copies the visible land mesh transform to `landHitMesh`. The lab presentation then applies a uniform `1.04` scale to the shared globe group. The land and hit mesh therefore retain the same local geometry and parent transform.

The runtime geographic basis is:

```text
local longitude zero = +90°
pin/geographic longitude sign = -1
```

The audit uses the matching inverse transform. `+Y` is north. No additional GLB node rotation is present. Lab idle land rotation is disabled, although production can rotate the visible land at runtime as presentation motion.

## Topology findings

### Why raw indexed topology is misleading

The primitive contains extensive per-corner vertex duplication, consistent with flat-shaded/facet-split normals:

- Raw indices appear to contain 9,358 one-triangle edges and 2,911 triangle islands.
- Exact positional welding collapses 9,358 position records to 1,859 geometric vertices.
- After welding, 5,273 edges have exactly two incident triangles, only 29 have one, and eight have more than two.
- The welded mesh contains 46 connected triangle components.

An extractor must therefore weld **positions**, not rely on original index identity. The earlier result of approximately 29 edges and six loops was real for the welded mesh—it was not the world coastline.

### Welding tolerance audit

| Tolerance | Vertices | 1-face edges | 2-face edges | >2-face edges | Triangle components |
| ---: | ---: | ---: | ---: | ---: | ---: |
| Exact through `0.001` | 1,859 | 29 | 5,273 | 8 | 46 |
| `0.005` | 1,858 | 29 | 5,271 | 9 | 45 |
| `0.01` | 1,049 | 29 | 1,378 | 1,760 | 44 |

Exact equality and every conservative tolerance through `0.001` produce identical topology. This proves the duplicate positions are genuinely coincident rather than near-miss seams. `0.005` already merges an intentional neighboring vertex/component. `0.01` is destructive and creates 1,760 apparent non-manifold edges. Production extraction should use exact coordinates or a tolerance no larger than `0.001`; `1e-5` is the selected audit tolerance.

There are no isolated vertices and no degenerates at the selected tolerance.

### Open and non-manifold features

The 29 single-use edges form six closed micro-loops:

- four Hawaii-area loops between approximately `154–159°W`, `19–22°N`;
- two equatorial Indonesian loops around `124–127°E`, `1–3°N`.

These are tiny component defects/open caps, not continental coastline loops.

The eight non-manifold edges chain into three tiny groups near:

- `3.5–6°W`, `49–50°N`;
- `33–38°E`, `63–65°N`.

They are localized and do not prevent radial-mask extraction. The lab's green and magenta diagnostic layers make these anomalies inspectable without altering the GLB.

### Open, closed, or mixed?

The correct classification is **mixed but overwhelmingly closed**. Most of the model consists of closed component solids. Six small components/patches expose open loops, and eight welded edges are non-manifold. It is not an open terrain skin and not a continuous world shell.

## Normal and orientation findings

For every triangle:

```text
radialDirection = normalize(face centroid relative to globe center)
orientationScore = dot(face normal, radialDirection)
```

| Orientation score | Triangle count |
| --- | ---: |
| `0.75` to `1.00` | 928 |
| `0.25` to `0.75` | 303 |
| `-0.25` to `0.25` | 450 |
| `-0.75` to `-0.25` | 515 |
| `-1.00` to `-0.75` | 1,340 |

This is a meaningful outward/near-tangent/inward distribution, but not a reliable authored-layer boundary. Near-tangent faces include side-like closure faces and highly sloped facets. Outward and inward faces also have overlapping centroid radii, areas, and edge lengths; no single score or radial threshold cleanly separates an explicit terrain sheet from a wall strip.

Stored vertex normals agree with calculated face winding on all but one triangle; only 47 faces have agreement below `0.99`. The large inward-facing count is therefore structural, not widespread accidentally flipped winding. Recalculating all normals would change the approved flat-facet appearance and is not justified.

An attempted inner/outer radial-layer pairing found 1,859 unique direction groups for 1,859 welded vertices—zero paired directions. This conclusively rejects the simple “outer top ring connected to a radial inner ring” hypothesis. Side-oriented faces exist, but they are not a separately recoverable wall layer.

## Coastline-rim hypothesis results

Several shared-edge threshold combinations were tested. Representative outcomes:

| Terrain / neighbor classification | Candidate edges | Chained paths | Closed | Open | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| outward `>0` / non-outward `≤0` | 1,118 | 142 | 141 | 1 | Broad coverage, heavily branched |
| `≥0.75` / `≤0.25` | 582 | 159 | 45 | 114 | Fragmented and incomplete |
| `≥0.60` / `≤0.25` | 704 | 152 | 66 | 86 | Still fragmented |
| `≥0.35` / `≤0.15` | 840 | 145 | 79 | 66 | Adds internal false positives |
| `≥0.75` / `≤-0.25` | 371 | 163 | 25 | 138 | Far too sparse |

Visual browser inspection confirmed the numerical failure mode:

- Australia often receives a mostly correct orange rim, but with gaps and extra fragments.
- Madagascar receives partial coastline coverage while the same layer introduces an obvious internal line across Africa.
- Threshold changes trade missing steep coast facets for internal terrain ridges; no tested normal cutoff provides a stable topology loop.

Ordinary boundary-edge extraction fails because the actual components are closed. Normal-transition extraction fails because the coastline is a **view/radial silhouette**, not a consistently tagged top-to-wall edge set.

## Radial silhouette extraction

The successful offline method uses a 2,048×1,024 longitude/latitude grid:

1. Classify outward-facing candidate triangles.
2. For each covered angular cell, cast an exact ray from the model center through that longitude/latitude direction.
3. Retain the farthest positive ray/triangle intersection as the visible land surface.
4. Build a binary land-presence mask.
5. Trace land-to-empty cell transitions.
6. Convert transitions back to globe-local paths.

Results:

- 637,403 land pixels, or `30.3937%` of the spherical grid.
- 82 traced paths.
- 78 closed paths and four dateline/seam-split paths.
- Australia mainland, Tasmania, Madagascar, Greenland, Japan, Africa, North America, and South America all appear.
- Small islands represented by the GLB appear subject to the grid resolution; sub-pixel features can be intentionally omitted or extracted at a higher offline resolution.

The cyan diagnostic layer was visually compared against the actual rendered land at Australia/Tasmania, Madagascar, Greenland, Japan, the lower 48 United States, and Brazil. It follows the visible low-poly silhouette, including oblique limbs of the globe. The orange normal-threshold layer visibly diverges in the same views.

The diagnostic uses a small fixed outer radius so it remains visible for comparison. A production helper would store angular coastline paths, then pass them through the already-correct terrain anchoring stage rather than use that diagnostic radius.

Multi-view offscreen rendering is not needed because the radial mask directly represents the footprint relevant to the spherical border system. It is also deterministic and camera-independent.

## Australia and Madagascar

### Australia

- Mainland: one dominant closed radial silhouette, 997 dense mask points.
- Tasmania: a distinct 99-point closed loop.
- Remote territories remain independent paths and can be excluded during country assignment.
- The silhouette follows the approved angular coastline; the topology-threshold alternative is less reliable.

### Madagascar

- One dominant 285-point closed loop.
- It remains visually distinct from mainland Africa.
- The `0.01` geometric-error simplification produces nine control points with a measured maximum deviation of `0.009999` model units.

## Visual-error simplification

Ramer–Douglas–Peucker-style simplification was applied in 3D model space, using maximum geometric error—not a global percentage.

At a `0.01` model-unit tolerance:

| Validation region | Dense points | Simplified points | Maximum deviation | Path type |
| --- | ---: | ---: | ---: | --- |
| Australia mainland | 997 | 29 | `0.009900` | closed |
| Tasmania | 99 | 5 | `0.007945` | closed |
| Madagascar | 285 | 9 | `0.009999` | closed |
| Greenland | 885 | 11 | `0.007974` | closed |
| Japan validation segment | 175 | 6 | `0.007613` | clipped/open |
| South Africa coast segment | 204 | 7 | `0.009455` | clipped/open |
| Lower 48 ocean coast segments | 455 | 23 | `0.009879` | clipped/open |
| Brazil ocean coast segment | 499 | 20 | `0.009915` | clipped/open |

These results meet the expected control-point ranges for Australia, Madagascar, Greenland, and the lower 48 while retaining an explicit error guarantee. Country production assets should simplify each contiguous ocean-facing segment separately so island groups and capes cannot be joined accidentally.

## Country-assignment limitation

`land.glb` contains physical landmass geometry only. It has no political IDs, country attributes, material groups, atlas colors, or borders.

For the United States, the final outline must be assembled from two sources:

- GLB-derived Pacific and Atlantic/Gulf physical coastline segments;
- GeoJSON-derived political borders with Canada and Mexico.

The splice operation needs stable junctions near the international-border/coast intersections. Alaska, Hawaii, and detached islands require separate component assignment. The same rule applies to Brazil, South Africa, and any country sharing a continental landmass.

The country ID atlas can help classify samples, but it must not replace the GLB as the physical coastline source or the GeoJSON as the political-border source.

## Does the model need repair?

No repair is required for the intended coastline pipeline. The minor open/non-manifold anomalies are real, but a radial intersection mask is insensitive to their edge-manifold status as long as the approved visible surface remains ray-intersectable.

Repairing the production model would create avoidable risks:

- changing the approved silhouette;
- altering flat-shaded facet normals;
- changing land-hit intersections and pin placement;
- merging intentionally close small islands;
- changing bounds, globe framing, or runtime scale;
- invalidating existing visual regression evidence.

If a cleaned derivative were ever required, it could be scripted: exact-position weld, selective removal of degenerates, localized manifold repair, preserved face normals/material, and side-by-side silhouette comparison. It should never replace the production GLB without explicit approval.

## Automation and Blender feasibility

The completed audit and successful mask extraction use Node.js and the repository's existing Three.js dependency. No new package is required.

Current environment findings:

- Node.js and Three.js: available and sufficient.
- Python: available, but NumPy, trimesh, SciPy, and pygltflib are not installed.
- glTF Transform: not installed.
- Blender: not installed.

Blender is therefore neither available nor necessary. If future derivative mesh cleanup required Blender-specific import/export behavior, Codex could author a deterministic `blender --background --python repair_land_model.py` workflow. Manual selection or movement of thousands of vertices would still not be necessary. For the recommended helper-asset path, Blender adds no value.

## Cost and runtime direction

- GLB parse, weld, topology audit, 2K radial mask, contouring, and simplification are one-time offline operations.
- The current audit completes in roughly one second on this workstation.
- The 2K global lab diagnostic JSON is approximately 0.9 MB and intentionally development-only.
- Production should emit compact, simplified assets only for activity countries.
- Runtime work should be lazy asset loading plus the existing terrain anchoring and shader-driven border rendering.
- Heavy topology or mask analysis must not run in the browser.

## Risks

1. A 2K mask can omit land features smaller than one angular pixel; the production generator should use a higher configurable resolution and feature-size policy.
2. Dateline-crossing paths require explicit seam stitching.
3. Country assignment can be ambiguous on shared continental components and requires atlas/GeoJSON assistance.
4. Coast/political-border junctions need deterministic snapping rules and validation fixtures.
5. Simplification must operate per coastline segment with a model-space error bound; percentage simplification is unsafe.
6. The production helper should store directions or longitude/latitude, not the diagnostic layer's fixed radius.

## Recommended next task

Implement a production-grade offline coastline asset builder, beginning with Australia and Madagascar:

1. Generalize `audit-land-glb-coastline.mjs` into `build-land-coastline-assets.mjs` with configurable 4K/8K radial resolution.
2. Stitch dateline paths and remove sub-threshold mask artifacts deterministically.
3. Assign physical paths/segments to countries using the ID atlas plus GeoJSON junctions.
4. Simplify each segment with an explicit maximum model-space error.
5. Emit a compact versioned JSON asset containing directions, component IDs, closed/open state, and source/audit metadata.
6. In a separate integration task, splice GLB coastline segments with GeoJSON political borders and pass the combined paths through the existing terrain-conformance generator.
7. Add visual fixtures for Australia, Madagascar, Greenland, Japan, lower 48 U.S., Brazil, and South Africa before expanding to other activity countries.

This path preserves the approved model and turns its actual visible silhouette into authoritative, reusable coastline data.
