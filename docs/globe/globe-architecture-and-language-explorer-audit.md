# SwingSphere globe architecture and Language Explorer audit

Date: 2026-08-01  
Scope: production explorer, Language Explorer development prototype, geographic assets, and offline/Blender options  
Decision status: recommendation only; this audit does not change production behavior

## 1. Executive summary

The existing globe should be evolved, not rewritten. Its renderer, camera controller, land/ocean presentation, selection flow, details integration, and MapLibre companion are useful production foundations. The urgent architectural correction is to stop treating visibility as lifecycle: world mode currently hides listing pins but retains every listing marker, its four meshes, its materials/geometries, and two DOM label trees. That design scales with the total catalog even when no listing is visible.

The current source snapshot constructs approximately **66 pin views at world scope** with default filters and no browser overrides: 60 spatially deduplicated, active listing representatives and 6 eligible organization representatives. The exact number is date- and data-dependent. Each listing view creates four meshes and two label cards, so the current snapshot implies roughly 264 pin meshes and 924–1,056 label DOM nodes before activity-region markers. At 5,000 retained listings the same design implies about 20,000 mesh objects, 70,000–80,000 label DOM nodes, approximately 67 MB of marker typed-array geometry before GPU copies and object overhead, plus repeated per-frame CPU work. Hiding the group avoids visible pin draws and `PinManager.update()` in world mode, but not construction, image requests, DOM retention, rebuilds, memory, or garbage collection.

The desired disclosure hierarchy is sound if it is a rendering rule rather than merely a visual rule:

`World → active countries → selected country → regions/clusters → selected region → listing pins → listing focus`

At world distance, construct **zero individual listing or host pins**. Country activity should be a compact summary keyed by authoritative country metadata. A selected country should construct only country-scoped region markers. A selected region should construct only its listing pins. Search, deep links, and rail selections should create the target pin directly and focus it without requiring the user to traverse the hierarchy.

The Language Explorer vector prototype proves the desired visual vocabulary—crisp core, restrained glow, animated multicolor travel, selection emphasis—but its runtime conformance path should not become production infrastructure. The current land mesh does not expose a usable coastline graph. Its supposed shoreline extraction finds only 29 welded boundary edges in six tiny loops, which are holes/mesh defects rather than the visible coastline. The simplified GeoJSON also contains null geometry for 85 of 242 features. Selection can synchronously raycast hundreds to more than one thousand densified points, and the animation replaces color buffers at 24 Hz. These are correctness and maintenance problems, not merely tuning issues.

The recommended country system is a hybrid of **B + D**, with **C used as an authoring and QA tool**:

- authoritative listing country IDs for filtering, counts, privacy, and navigation;
- an offline pipeline that produces globe-native boundary geometry from the final land topology;
- compact per-face country IDs for land fill and hit testing;
- runtime shaders for selected/hover fills, glow, and the moving gradient;
- zero individual pins at world scope and on-demand construction at local scopes.

Do not use bitmap border atlases as the final outline renderer, do not continue runtime shoreline substitution, and do not split the land into a separately rendered mesh per country. The land GLB is already small—3,536 triangles and 246,920 bytes—so marker lifecycle and atlas removal are materially more valuable than aggressive land decimation.

## 2. Current production architecture

### Runtime and ownership

`components/ProductionGlobePage.tsx` is the integration owner. It fetches listings and organizations, applies explorer filters, removes past events, spatially consolidates event occurrences, adapts records to globe events, builds Supercluster-based activity regions, owns navigation/travel state, and sends complete arrays to `SwingSphereGlobe.updateEvents()` and `updateActivityRegions()`.

`SwingSphereGlobe` composes:

- `GlobeRenderer` for scene, camera, controls, post-processing, land/ocean, and frame policy;
- `CountrySelectionManager` for atlas-based country hit testing and activity fills;
- `ActivityRegionManager` for broad discovery markers;
- `PinManager` for listings and eligible organizations;
- `CameraFocusController` and `ExplorerNavigationController` for focus/navigation behavior;
- optional `CountryVectorBorderLayer` and `CountryGeoJsonBorderLayer` in the development presentation.

The globe’s disclosure is currently visual rather than resource-scoped. On mount, `SwingSphereGlobe.mount()` calls `updateEvents(this.events)`. With no active region, `#getActiveRegionEvents()` returns every event. `#updateProgressiveDisclosure()` then hides the pin group while world regions are shown. Returning to world in `#showWorld()` explicitly rebuilds every event and hides the group. Region activation does improve scope: `#activateActivityRegion()` replaces the views with the selected region’s events. However, world mode immediately restores the full retained set.

### Pin representation

`PinManager.updateEvents()` clears all views, runs `buildRegionalDisplayCoordinates()`, surface-anchors each point, constructs a `GlobeMarker`, and appends it. There is no keyed reconciliation, resource pool, instancing, or shared geometry/material path.

Each `GlobeMarker` creates:

- a stem cylinder mesh;
- an icosahedron tip mesh;
- a ring glow mesh;
- an invisible cylindrical hit target mesh;
- separate geometries and materials for the instance;
- a hovered label card and a selected label card in the DOM.

The label cards eagerly create image and text elements, including duplicate logo/flag presentation for hover and selection. Even inactive labels remain in the document and are style-mutated by the per-view update path when pins are active.

### Country selection and atlas path

Production country interaction uses a 4K country-ID atlas and a visual activity atlas. `CountrySelectionManager` raycasts the globe, samples the CPU-side ID canvas, and drives two land-sized highlight meshes/materials for transition blending. `GlobeAssetLoader` decodes the country-ID image for CPU sampling and also uploads it to the GPU; the visual atlas is a second GPU texture. A 4096 × 2048 RGBA texture is approximately 32 MB uncompressed, so the current two-atlas GPU baseline is approximately 64 MB, plus about 32 MB for the CPU sampler and transient decoded/canvas storage. The 8K visual atlas would be approximately 128 MB by itself and is not a suitable mobile baseline.

`CountrySelectionManager.updateEvents()` builds activity counts from event country fields. Its current `isoCount + idCount` lookup can double an event’s apparent contribution when the record carries both identifiers. This should be corrected before activity intensity is treated as authoritative.

### Flat map relationship

The map correctly uses a clustered GeoJSON source in MapLibre, but `MapLibreThreePinLayer.setListings()` independently constructs a Three marker view for every map listing. `setVisibleListingIds()` then hides groups rather than limiting construction. Removing obsolete listing/cluster views does not dispose their geometries/materials until the layer itself is removed, creating a leak during data changes.

`ExplorerProvider` shares search, tags, listing types, selected entity, surface mode, and camera intent. It does not own selected country, active activity region, or travel phase; those remain local to `ProductionGlobePage`. Consequently, globe and map share some intent but not one canonical spatial exploration state, and they independently derive/render broad and local marker sets.

## 3. Current prototype architecture

`components/dev/LanguageExplorerGlobeLabPage.tsx` configures an empty-event globe with country hover/selection and both experimental border paths enabled:

- `CountryGeoJsonBorderLayer` rasterizes country masks into large canvas textures and modifies the land shader for fills/outlines/glow.
- `CountryVectorBorderLayer` fetches simplified country GeoJSON, infers shared versus coastal edges, attempts to extract shoreline paths from `land.glb`, densifies selected boundaries, substitutes nearby shoreline arcs, raycasts points onto the land, smooths radial height, and creates paired `Line2` core/glow objects.

The lab’s visual defaults—narrow crisp core, larger subdued glow, slow moving gradient, and a small surface lift—are useful product tuning. The lab also sets `presentation.camera.fov`, while the presentation config expects `fieldOfView`; that control currently does not affect the camera.

### Mount work in `CountryVectorBorderLayer`

Mount performs the following:

1. Fetch and parse the simplified GeoJSON.
2. Build exact quantized edge multiplicities to classify shared and coastal segments.
3. Traverse the land buffer geometry, quantize positions, count topology edges, and construct paths from edges referenced by one triangle.
4. Build feature-key lookup structures.

The mount computation is acceptable for a small lab asset, but its premise is not valid for this GLB. The visible land is effectively closed after positional welding. Only 29 single-use welded edges remain, in six tiny loops, plus eight non-manifold edges. Those edges are defects/openings, not the stylized land/ocean silhouette.

### Selection work

Every selected or hovered country triggers a complete outline rebuild:

1. Dispose and remove the previous line objects.
2. Extract polygon and multipolygon rings.
3. Densify segments to the configured angular step.
4. Classify runs as coastal/shared from exact endpoint keys.
5. For each coastal run, scan inferred shoreline paths and choose a forward/backward arc.
6. Raycast nonsnapped samples onto the land mesh; sanitize and sometimes reraycast substituted samples.
7. Smooth radial heights.
8. Create `LineGeometry`, a core `Line2`, and a glow `Line2` for every retained chunk.

There is no Dijkstra or general graph pathfinder. `findBestShorelineArc()` linearly scans all path points for nearest endpoints and evaluates the two arcs of a closed path. With the current broken 29-point “shoreline” this is cheap but incorrect; with a real detailed coastline, repeated scans and vector allocations would become expensive.

Approximate surface raycast counts under the lab’s simplified source and 0.55° densification are 479 for the United States, 896 for Russia, 1,048 for Canada, 257 for Australia, 255 for Indonesia, 333 for China, 272 for Brazil, and 198 for India. These run synchronously on hover/selection and use a 3,536-triangle mesh without a BVH. A second or more detailed source increases the counts.

### Animation work

At 24 Hz, `CountryVectorBorderLayer.update()` rebuilds gradient colors for every line, allocates/interpolates `THREE.Color` objects, creates a JavaScript color array, and calls `LineGeometry.setColors()`. Three.js then creates new typed arrays and replaces instanced interleaved color attributes. This is recurring CPU, garbage collection, and GPU-buffer churn for an effect that should be a shader time uniform over a static cumulative-distance attribute.

The layer also reads `getBoundingClientRect()` and updates every `LineMaterial.resolution` on each frame. Resolution should change only on resize/device-pixel-ratio changes.

## 4. Performance findings

### Current marker count and lifecycle

For the checked-in data at the audit date, with default filters and no local overrides:

- 53 approved active clubs;
- 11 active event occurrences after community seeds are merged, reduced to 7 spatial representatives (2 from the public file and 5 community-seed locations);
- 6 eligible organization representatives because the host adapter emits only the first active region per organization;
- approximately **66 `GlobeMarker` views** constructed at world scope.

The count is a source snapshot, not a production telemetry claim. Local admin overrides, time, filters, and backend data can change it. The important finding is that the count is proportional to the entire eligible catalog, not the visible scope.

World mode does not call `PinManager.update()` while the pin group is hidden, so hidden pins avoid that active per-frame loop and visible pin draws. They are still fully constructed and retained, and label images can still be requested. Updates, filter changes, alignment/presentation changes, and world returns can destroy and rebuild the entire set.

Activity-region mode reconstructs only the selected region’s listings, which is the correct direction. It loses that benefit upon returning to world. Direct selection uses the containing region when found; its fallback constructs all events before revealing one.

### Cost per listing

A representative marker contains four geometries totaling approximately 192 triangles and 13,408 typed-array bytes, excluding material objects, Three.js object graphs, matrices, raycast state, DOM, decoded images, GPU copies, and allocator overhead. It also creates two label trees of roughly 7–8 nodes each.

| Eligible listings retained | Marker meshes / likely submissions | Marker triangles | Geometry typed arrays | Label DOM nodes |
| ---: | ---: | ---: | ---: | ---: |
| 100 | ~400 | ~19,200 | ~1.34 MB | ~1,400–1,600 |
| 500 | ~2,000 | ~96,000 | ~6.7 MB | ~7,000–8,000 |
| 1,000 | ~4,000 | ~192,000 | ~13.4 MB | ~14,000–16,000 |
| 5,000 | ~20,000 | ~960,000 | ~67 MB | ~70,000–80,000 |

These mesh counts are upper-bound draw submissions; frustum culling reduces visible draws. Three.js frustum culling is not globe occlusion culling, so back-side objects that remain in the camera frustum can still incur CPU traversal/submission. Bloom adds full-screen render cost. GPU geometry usually adds another resident copy, and the object/DOM/image overhead will exceed the raw geometry figures.

### CPU and garbage collection

When pins are active, each frame iterates every marker in `PinManager.update()`. `#updateView()` updates transforms, opacity, colors, camera distance, and label state. `#updateDomLabel()` performs world-matrix work and projection before it knows the label is inactive, then writes hidden styles. `SwingSphereGlobe` additionally calls `getPerformanceStats()` every active frame; that method filters the full set, reduces it, traverses marker groups to count meshes, and allocates temporary arrays. Instrumentation is itself part of the hot path.

`buildRegionalDisplayCoordinates()` can degrade toward O(N²) because it recomputes group centers with reductions while adding events. Initial/rebuild anchoring is O(N) raycasts and can perform a second raycast for displaced markers. `updateEvents()` discards every view and recreates it rather than reconciling stable IDs, so ordinary filter/config changes create allocation and GC spikes.

At 100 retained markers the current code is likely acceptable on desktop. Around 500, DOM/style and object traversal become material, particularly during rebuilds. At 1,000, frame stability and interaction hitches are likely on a 2019 MacBook Pro-class integrated/discrete mobile GPU configuration. At 5,000, the design is not credible for production: tens of thousands of Three objects and DOM nodes, thousands of raycasts on rebuild, buffer allocations, image work, and high draw submission pressure will cause long tasks, GC pauses, and mobile memory/context-loss risk. Midrange phones will reach unacceptable thermal/frame behavior earlier, especially at high device pixel ratio with bloom.

Adaptive renderer quality currently reduces pixel ratio and bloom and eventually targets 30/12 FPS for ambient/idle states. It does not reduce marker construction, marker-object traversal, DOM work, or rebuild cost, so it cannot solve the scaling problem.

### Other production render costs

- The country system keeps two land-sized transition meshes. When their shader enable value is zero they still appear render-visible, causing avoidable land submissions.
- `GlobeRenderer` adds the transparent `landHitMesh` to the rendered scene even though it is intended for raycasting. It can remain outside the render graph.
- `CountrySelectionManager.updateEvents()` can double activity counts when both ISO3 and internal country ID resolve.
- `ActivityRegionManager` uses the same four-mesh marker shape plus a canvas-texture sprite, clears/rebuilds wholesale, and is currently world-clustered rather than country-scoped.
- `MapLibreThreePinLayer` repeats the retain-all/hide-many pattern and does not dispose removed views during `setListings()`/cluster replacement.

## 5. Correctness and maintainability findings

### Vector prototype defects and fragile assumptions

1. **The inferred shoreline is not the coastline.** `buildLandShorelinePaths()` extracts single-use topology edges. Because the model uses duplicated face-corner vertices and is essentially closed after welding, the resulting 29 edges are small openings, not the land/ocean boundary. Shoreline substitution cannot produce exact coastline fusion from this data.
2. **`shorelineSnapStrength` is unused.** It is read during rebuild but never applied, so the lab control does not change output.
3. **The simplified GeoJSON is incomplete.** `publicgeocountries-simplified-35.json` is 902,957 bytes and has 242 features, but 85 have null geometry. Missing outlines include Denmark, Taiwan, Puerto Rico, Cyprus, Fiji, Singapore, Jamaica, Trinidad and Tobago, and many islands/territories. `countries.json` is 1,018,839 bytes and contains valid geometry for all 242 features.
4. **Exact edge identity is not robust topology.** Shared/coastal classification depends on quantized endpoint equality. Independently simplified neighboring rings can use different segmentation and be misclassified.
5. **Dateline segments are skipped.** This opens outlines for affected countries instead of splitting/wrapping them into correct render chunks.
6. **Multipolygons and islands are source-dependent.** Null geometry and aggressive simplification silently remove entire countries or secondary islands. Every ring/hole is treated as an outline without validating support on the land model.
7. **Nearby-coast selection is ambiguous.** Arc scoring uses nearest endpoints/midpoints without country ownership. It can select an adjacent mainland or island path.
8. **Branch traversal is arbitrary.** At non-manifold/branching vertices, choosing the first next edge can orphan or misroute paths.
9. **Radial smoothing is not true surface conformance.** The pass creates an upper, slope-limited envelope by raising low samples. It avoids clipping but can form broad floating arches and does not project the smoothed points back to the terrain.
10. **Animation rewrites geometry.** Replacing color attributes at 24 Hz is unnecessary and creates ongoing allocation/upload pressure.
11. **Camera control naming is inconsistent.** The lab uses `fov`; the presentation schema uses `fieldOfView`.

### Asset and data observations

The country lookup contains 177 entries while the GeoJSON contains 242 features. That mismatch may be intentional, but the supported-country set needs an explicit manifest so unsupported territories do not fail silently.

The existing atlas audit records that the facet-aware v5 visual atlas produced a triangular mosaic and was rejected; v6 preserved the v4 appearance, while production remained on v3. This supports separating hit/fill IDs from outline rendering. Face IDs can still be useful, but a dense bitmap border effect should not be revived as the final visual solution.

The six-field spatial hierarchy is not yet a single state machine. `ProductionGlobePage` owns country, region, selection, and timed travel transitions through many local state/ref/timer paths; `ExplorerNavigationController` is much smaller. Extending behavior in both the page and runtime without consolidating state will make globe/map divergence and stale transitions increasingly likely.

## 6. Blender/offline feasibility analysis

### Decision matrix

Ratings: 5 is best for production; preprocessing complexity is reversed, so 5 means simplest.

| Option | Fidelity | Runtime | Prep simplicity | Maintainability | Draw / memory | Interaction & fill | Islands / multipolygons | Production verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| A. Runtime GeoJSON conformance | 2 | 1 | 3 | 1 | 2 | 3 | 2 | Lab only; reject as final |
| B. Offline globe-native borders | 5 | 5 | 3 | 4 | 5 | 4 | 5 with validation | **Adopt** |
| C. Blender-authored cleanup/curves | 5 | 5 | 2 | 3 | 5 | 4 | 5 with scripted QA | Use for authoring/QA, not as sole pipeline |
| D. Face/vertex country IDs | 4 | 5 | 2 | 4 | 5 | 5 | 4, limited by land topology | **Adopt for fills/hits** |
| E. Country mesh/group split | 4 | 2 | 2 | 2 | 1–2 | 5 | 4 | Reject for normal rendering |

### A. Continue runtime GeoJSON conformance

This preserves animation flexibility and browser portability, but selection-time raycasts, topology inference, buffer rebuilding, edge ambiguity, and source omissions remain. A shader would fix the color-animation cost, not the invalid coastline source. It is useful for visual experimentation and comparing simplified inland-border styles, not as the production geometry pipeline.

### B. Offline preprocessing against `land.glb`

This is the best boundary solution. A deterministic build tool can load the final land mesh and authoritative country topology, associate political boundaries with countries, split dateline paths, snap coastline portions to an explicit authored land/ocean silhouette, project inland segments to the surface, validate islands, and export compact line strips with static attributes:

- country ID;
- path/ring ID and flags (coast, inland, disputed if supported);
- cumulative normalized path distance;
- position and optional radial normal/lift direction;
- optional level-of-detail or importance.

Runtime then loads one buffer, selects ranges by country, and animates a shader uniform. It avoids fetch/parse/classify/raycast/rebuild work in the browser. A small number of shared core/glow draw calls can cover one selected and one hovered country. Browser compatibility is standard WebGL buffer/shader behavior.

### C. Blender cleanup and authored curves

Blender is valuable for visually inspecting the low-poly silhouette, correcting pinches/non-manifold holes, preserving small islands, marking protected seam/coast edges, and validating generated curves directly against the shaded model. Geometry Nodes or a scripted import/export step can attach IDs and curve attributes, but manual country-by-country authoring would be difficult to reproduce and maintain.

Blender can bake geometry, topology, shoreline edge groups, simplified country curves, face/vertex integer IDs, cumulative path distance, normals/lift vectors, material slots, and LOD variants. It cannot bake interaction state, responsive line width, CSS, hover/selection logic, activity counts, moving time-based gradients, bloom policy, accessibility, camera behavior, or privacy/filter rules. Those remain runtime application/shader responsibilities.

### D. Embed face- or vertex-level country identifiers

Use a compact integer face ID as the authoritative rendered-land region identifier. Because vertices are already split heavily for flat normals, a per-vertex integer attribute can represent per-face IDs without forcing large additional splits. The land shader can look up country activity/hover/selection colors from a small data texture or uniform table. A land raycast can read the intersected triangle’s ID directly, eliminating the 4K CPU ID sampler and its coordinate-alignment failure mode.

IDs alone cannot create a high-quality border where the land mesh has no edge along an inland political boundary. They complement, rather than replace, the prepared border asset. IDs also require a documented policy for overlapping claims, water boundaries, tiny countries not represented by a land face, and territories.

### E. Split land into country meshes or groups

Separate country objects make selection and material assignment obvious but multiply draw calls, create seams/z-fighting, complicate shared coastlines and disputed areas, and retain many object/material instances. Logical export groups can be useful to the offline tool or QA, but production should render the land in one or a few batches with IDs rather than one draw per country.

## 7. Recommended progressive-disclosure UX architecture

### Canonical state

Introduce one renderer-neutral exploration state shared by the globe and map:

```text
scope: world | country | region | listing
selectedCountryId: string | null
selectedRegionId: string | null
selectedEntityId: string | null
hoveredCountryId: string | null
travel: idle | focusing-country | focusing-region | focusing-listing | arrived
origin: pointer | search | rail | deep-link | back
```

This can be a reducer added near `ExplorerProvider`, not a new global framework. Renderers consume derived snapshots and emit intent (`hoverCountry`, `selectCountry`, `selectRegion`, `selectListing`, `backToCountry`, `backToWorld`). Timers/camera callbacks dispatch transitions instead of independently mutating overlapping React state and runtime state.

### State transitions and construction rules

| State | Globe visual | Constructed discovery objects | Data rule |
| --- | --- | --- | --- |
| World | active-country fill/signal; optional very broad aggregate signal | 0 listing pins; 0 host pins; no listing DOM labels | counts grouped by authoritative public country ID |
| Country focus/travel | selected outline/fill; other countries subdued | only transition UI; country region objects may preload after camera midpoint | records with `countryId === selectedCountryId` |
| Country arrived | country outline/fill + its activity regions | country-scoped region markers only | country-filtered spatial index/cluster query |
| Region focus/arrived | selected region + local listings | listing/host markers for selected region only | stable region membership; cap/cluster if dense |
| Listing focus | existing selected hero pin and details panel | selected pin always; optionally nearby region set within budget | explicit selected ID bypasses normal scope |

World-to-country selection should begin the existing cinematic camera transition immediately. Region objects can be prepared asynchronously or during the second half of travel, but should fade in only after country arrival. Country hover should be low-noise: restrained fill/outline and a compact activity cue. Selected country should be materially stronger and retain the red/gradient signal hierarchy. Returning to world disposes listing and region marker views, cancels pending camera work, and retains only compact country summaries and caches.

### Direct listing bypass

Search, a deep link, a details rail, or an external navigation target should:

1. resolve the entity and public-safe display coordinate;
2. read its authoritative country and region membership from the shared spatial index;
3. dispatch a `listing` scope with bypass origin;
4. construct the selected pin immediately (one view), optionally followed by the bounded nearby set;
5. drive the current listing camera focus and details panel;
6. set back-navigation ancestry to region/country/world without forcing those intermediate animations.

If metadata is incomplete, the fallback should construct the target only and focus its coordinate—not rebuild the global event array. Private-event records must use their approved approximate public coordinate at every stage.

### Shared globe/map behavior

Share normalized records, authoritative country/region membership, filter results, selected IDs, and the reducer—not Three.js marker instances. MapLibre should keep its native clustered GeoJSON source and render native symbol/circle layers for broad scopes. Its custom Three pin layer should receive only the visible unclustered/local IDs and the selected entity, disposing removed views immediately. The globe should receive the equivalent derived scope but construct its own surface-anchored visuals.

One `SpatialDiscoveryIndex` should expose selectors such as `countrySummaries(filters)`, `regionsForCountry(countryId, filters)`, `entitiesForRegion(regionId, filters)`, and `ancestryForEntity(entityId)`. This avoids duplicated grouping logic while respecting that globe and flat-map render primitives are different.

## 8. Recommended geographic rendering architecture

Use four cooperating sources:

1. **Authoritative metadata index.** Every public discovery entity has a canonical ISO2/internal country ID, public-safe coordinate, stable region membership, provenance, and visibility classification. This drives filtering and counts; geometry never decides data ownership.
2. **Country-ID land attribute.** Each rendered land triangle carries a compact country ID. Raycast intersections return that ID directly; a small activity/state lookup drives land fill in one shader/material.
3. **Prepared boundary buffer.** Offline-generated, model-native paths contain selected/hoverable country outlines with coastlines matched to the exact approved silhouette and simplified inland borders. A manifest declares supported countries, islands, omissions, and asset/source hashes.
4. **Runtime boundary shader.** Static cumulative-distance attributes plus `time`, palette, selected/hover state, opacity, width, and glow uniforms produce the moving gradient. Geometry/color buffers do not change per frame.

For a selected country, render the boundary in at most two passes: crisp core and glow. Hover may share the same batched geometry/material with a second range or use a subdued pass. If `Line2` remains, prebuild country ranges and update only draw ranges/uniforms; alternatively use an extruded screen-space ribbon shader. Verify Safari/WebGL precision and line joins before choosing. The goal is no runtime GeoJSON parsing, no shoreline graph creation, no selection-time terrain raycast batch, and no per-frame buffer upload.

Retain from the prototype:

- the palette and speed/width/glow tuning language;
- core-versus-glow visual hierarchy;
- selected stronger than hover;
- small explicit surface-lift controls;
- the concept of a cumulative moving gradient;
- the lab as an asset/shader comparison route.

Move offline or rewrite:

- GeoJSON topology classification and dateline handling;
- coastline matching and land projection;
- island/multipolygon validation;
- country/ring geometry construction;
- cumulative path-distance generation;
- country hit IDs.

Discard from the production path:

- runtime extraction of single-use land edges as coastlines;
- brute-force shoreline arc substitution;
- selection-time batches of surface raycasts;
- CPU gradient-color reconstruction;
- rasterized GeoJSON borders/glow as the final outline;
- 4K CPU texture sampling after face IDs are validated.

`CountryGeoJsonBorderLayer` may remain lab-only as a diagnostic/reference overlay, clearly labeled as non-production.

## 9. Production migration phases

### Phase 0: instrumentation and baseline

- Add lab/dev counters for source entities, spatial representatives, constructed marker views, visible marker views, meshes, label nodes, geometry bytes, raycasts, build/dispose time, draw calls, frame CPU, and retained heap where supported.
- Use the existing 100/500/1,000/5,000 fixture support and add deterministic country/region distributions.
- Move `getPerformanceStats()` off the animation hot path; update cached counters on lifecycle events and sample renderer stats at low frequency.
- Record desktop and mobile baselines, including scope changes and 20 repeated world/country/region cycles.

Exit: reproducible trace/capture instructions and baseline numbers exist without changing production presentation.

### Phase 1: world mode constructs zero pins

- Separate the source event catalog from `PinManager`’s rendered views.
- In world scope pass an empty rendered set; do not call `updateEvents(all)` before hiding.
- Make direct selection create the target view without global fallback construction.
- Lazily create the selected/hovered label DOM, or use a small pooled overlay owned above individual markers.
- Cache/share marker geometry and immutable materials; reconcile by stable ID for local sets.
- Fix `MapLibreThreePinLayer` disposal and limit it to visible unclustered/local entities.
- Remove raycast-only land meshes from the render graph and disable unused transition meshes.

Exit: total catalog size does not affect world marker objects, label nodes, pin raycasts, or per-frame marker iteration.

### Phase 2: country activity summaries

- Normalize authoritative ISO2/internal IDs once and fix double counting.
- Add renderer-neutral country summaries from the shared spatial index.
- Drive restrained world activity fills/signals with a compact lookup, initially through the existing atlas if necessary.
- Formalize hover/selected/camera transition actions in the shared reducer.

Exit: every eligible public entity resolves to one supported country or an explicit review bucket; world remains zero-pin.

### Phase 3: country-to-region progressive reveal

- Make `createActivityRegions()` country-scoped with stable IDs and bounded membership queries.
- Construct country region markers only after/near arrival.
- Construct listing markers only for the selected region; dense regions retain clustering/viewport budgeting.
- Connect globe and map to the same reducer/selectors while retaining native renderer implementations.
- Preserve exact search/deep-link bypass and back-navigation ancestry.

Exit: hierarchy, direct bypass, map toggle, filter changes, cancellation, and privacy cases pass state-transition tests.

### Phase 4: offline country-border asset

- Add a deterministic script, for example `scripts/globe/build-country-geometry.mjs`, plus a Blender inspection/export profile if Blender contributes corrections.
- Produce a versioned boundary GLB/binary and manifest under `public/assets/globe/models/`.
- Generate cumulative distance, country/ring IDs, coast/inland flags, and supported-country coverage checks.
- Add country IDs to the final land asset and replace CPU atlas hit testing.
- Replace CPU color animation with the time-uniform shader.
- Keep the lab route as an A/B validator for asset versions and approved camera presets.

Exit: no runtime conformance/raycast batch, no animation buffer churn, and boundary visual tests pass for a representative country set.

### Phase 5: land cleanup and production port

- Correct only confirmed non-manifold/pinch/silhouette issues, protect marked edges/islands/IDs, and regenerate dependent assets from the final topology.
- Port the winning lab shader and prepared data into the production presentation config.
- Remove obsolete atlas/border code and assets only after production telemetry and a rollback period.
- Validate Chrome, Safari, Firefox, iOS Safari, and midrange Android; retest reduced motion and details/map transitions.

Exit: performance, correctness, visual, browser, and rollback gates below are met.

## 10. Risks and fallback options

- **Country-first is poor for known-item intent.** Search, deep links, saved items, and rails must bypass it. Keep an accessible list/details route independent of the globe.
- **Sparse countries may feel like dead ends.** Skip or compress the region step when a country has few entities; reveal a bounded local set directly after country arrival.
- **Cross-border metros do not fit political hierarchy.** Region membership can be a product-defined discovery area spanning countries, while country summaries remain an orientation entry point. Preserve a nearby/map viewport path.
- **Missing/ambiguous country data can hide content.** Route records to a moderation/review bucket; never infer private exact locations client-side.
- **Land topology may not support tiny countries.** The manifest can specify fallback anchor/outline-only countries. Hit targets for tiny islands can use prepared logical regions while visuals stay honest.
- **Integer attributes and shader variants need WebGL QA.** A compact normalized byte/ushort attribute and conservative shader path are broadly compatible; retain the existing atlas hit path behind a temporary feature flag until parity is measured.
- **Offline generation can become opaque.** Check in source hashes, tool versions, validation summaries, deterministic scripts, and asset manifests. Blender manual edits should be reproducible or captured as versioned source assets.
- **Glow can dominate fill rate on mobile.** Cap device pixel ratio, use reduced bloom/glow quality tiers, and keep the outline pass count bounded.
- **Large local regions can still overload pins.** Apply local clustering/viewport budgets and reserve individual markers for the visible, selected, and nearest relevant results.
- **Migration can destabilize navigation.** Deliver state/lifecycle changes behind a route/config flag, preserve current camera tuning, and maintain a one-release fallback to the current country atlas.

## 11. Specific files and functions that would change

| File | Targeted change |
| --- | --- |
| `components/ProductionGlobePage.tsx` | Replace local country/region/travel duplication with reducer intents and derived render snapshots; stop sending the full catalog to rendered pin managers at world scope. Preserve details and camera callbacks. |
| `components/explorer/ExplorerProvider.tsx` | Add the canonical spatial scope/reducer, or compose a focused `ExplorerSpatialProvider` beside it. |
| `lib/globeEntityAdapter.ts` | Require normalized authoritative country IDs and public-safe coordinates; expose entity ancestry without deriving ownership from render geometry. |
| `lib/hostGlobeAdapter.ts` | Decide whether every declared active host region is a discovery point; today only the first region is emitted. Normalize country IDs. |
| `lib/activityRegionProvider.ts` | Accept country/scope input, produce stable region IDs, avoid unbounded global `getLeaves`, and expose bounded membership selectors. |
| new `lib/spatialDiscoveryIndex.ts` | Centralize country summaries, country-scoped regions, region members, and entity ancestry for both globe and map. |
| `src/features/globe/runtime/SwingSphereGlobe.js` | Make exploration scope explicit; remove `updateEvents(all)` from world paths; construct a direct target without global fallback; cancel transitions deterministically. |
| `src/features/globe/runtime/PinManager.js` | Render only the supplied scoped set; keyed reconciliation; lifecycle counters; shared/pooled resources; no full-set hot-path statistics. |
| `src/features/globe/runtime/GlobeMarker.js` | Share immutable geometry where practical; lazy/pool labels; reserve rich overlay and animation for hovered/selected markers. |
| `src/features/globe/runtime/ActivityRegionManager.js` | Country-scoped keyed reconciliation and explicit resource disposal; lighter batched/instanced representation if region counts grow. |
| `src/features/globe/runtime/CountrySelectionManager.js` | Fix activity double counting; read country ID from intersected land faces; drive fill via compact state/activity lookup; remove CPU atlas sampling after parity. |
| `src/features/globe/runtime/GlobeAssetLoader.js` | Load the prepared boundary/ID assets and manifest; retire duplicate 4K CPU/GPU country-ID atlas use after migration. |
| `src/features/globe/runtime/GlobeRenderer.js` | Keep hit-only geometry out of render submissions; do not draw disabled highlight meshes; expose low-frequency instrumentation and resize events. |
| `src/features/globe/runtime/CountryVectorBorderLayer.js` | Replace runtime preprocessing with prepared geometry loading and shader-uniform animation, or supersede with a focused `CountryBoundaryLayer`. |
| `src/features/globe/runtime/CountryGeoJsonBorderLayer.js` | Keep lab-only as a diagnostic reference, then remove from production bundles/routes. |
| `src/features/globe/runtime/GlobeRuntimeConfig.js` / `GlobePresentationConfig.js` | Centralize scope thresholds, marker budgets, outline quality tiers, and corrected `fieldOfView` configuration. |
| `components/maps/FlatWorldMap.tsx` | Consume the same scope/selectors; keep MapLibre native clustering; send only visible unclustered/local entities to custom Three pins. |
| `components/maps/MapLibreThreePinLayer.ts` | Dispose views on removal, reconcile by stable ID, and avoid retain-all/hide-many behavior. |
| new `scripts/globe/build-country-geometry.mjs` | Deterministically generate land IDs, model-native boundaries, attributes, manifest, and validation reports. |
| `components/dev/LanguageExplorerGlobeLabPage.tsx` | Become the visual comparison/QA surface for prepared asset versions; remove misleading runtime conformance controls and fix the camera key. |

This is a phased, systemic change. Phase 1 does not require the offline country asset, and Phase 4 does not require rewriting the renderer or camera.

## 12. Measurable acceptance criteria

### Lifecycle and scale

- World scope reports `constructedListingMarkers === 0`, `constructedHostMarkers === 0`, and zero listing-label DOM nodes, regardless of 100/500/1,000/5,000 fixture size.
- Country scope constructs zero individual listings until the product rule explicitly skips a sparse region step.
- Region scope constructs only that region’s member set, subject to a documented local marker budget; direct listing scope can begin with exactly one marker.
- No per-frame loop in world or country scope is O(total listings). Catalog-size changes may affect index construction off the render loop, not steady-state frame work.
- Repeating world → country → region → world 20 times leaves Three geometry/material/texture counts at baseline ±2 objects per category and retained JS heap within 5 MB after forced/settled GC where tooling supports it.
- Scope/filter updates do not issue duplicate logo/flag requests for inactive labels.

### Performance budgets

- On the agreed 2019 MacBook Pro test profile at 1440 × 900, device pixel ratio capped by production policy: world camera interaction median ≥55 FPS and 1% low ≥45 FPS; country/region camera interaction median ≥50 FPS and 1% low ≥40 FPS with the 5,000-record fixture.
- On the agreed midrange mobile profile at 390 × 844: median ≥30 FPS and 1% low ≥24 FPS for world/country interaction; no WebGL context loss or browser tab reload.
- Warm country selection produces no main-thread task over 50 ms; p95 application CPU work for boundary/fill selection is under 8 ms, excluding the intentional camera animation.
- Returning to world disposes local marker resources within one settled transition and does not trigger an O(total listings) render-object rebuild.
- World country/border rendering stays within a documented small draw budget (target ≤40 renderer calls before post-processing); one selected country outline adds no more than two core/glow passes. Final budgets should be captured with the actual renderer and bloom pipeline.

### Geographic correctness and visual quality

- 100% of supported rendered land faces resolve to a valid manifest country ID or an explicit neutral/ambiguous ID; hit tests do not depend on color-resampled bitmap coordinates.
- Every activity-bearing entity resolves to exactly one authoritative country summary, or an explicit moderation-review bucket; records with ISO2 and ISO3 do not double count.
- The supported-country manifest covers all product-supported countries and lists intentional omissions/territories. Tests include Canada, Russia, Indonesia, the United States/Alaska, Chile, Norway, Japan, New Zealand, Fiji, Singapore, Cyprus, and dateline-crossing geometry.
- Prepared coast boundary samples coincide with the approved land silhouette within the asset tool’s numeric tolerance and appear within 1.5 screen pixels of the visual coast at approved world/country camera presets. Inland paths have no visible clipping, spikes, or broad floating arches.
- Selected borders use static geometry attributes. Animation changes uniforms only; profiling shows no per-frame `bufferData`/attribute replacement attributable to gradient travel.
- Country selection uses no runtime GeoJSON parse, shoreline construction, path substitution, or batch terrain raycasts.

### Asset and compatibility gates

- `land.glb` and the boundary/ID asset include source/tool hashes and pass automated checks for valid indices, NaNs, degenerate paths, open paths where unintentional, country coverage, dateline splits, and manifest consistency.
- The prepared boundary plus country-ID additions target less than 4 MB GPU buffer memory and less than 1 MB compressed transfer unless visual evidence justifies a documented exception.
- Removing the two 4K atlas residency paths saves approximately 64 MB of GPU texture allocation and about 32 MB of CPU sampler storage relative to the current path.
- Production build passes. Manual visual checks pass on Chrome, Safari, Firefox, iOS Safari, and midrange Android for world hover, selection, coastline fusion, islands, map toggle, direct deep link, cancellation/back navigation, reduced motion, and private-location handling.

### Land-model optimization recommendation

The audited `land.glb` is 246,920 bytes, one indexed primitive/material, 9,358 accessor vertices, 10,608 indices, and 3,536 triangles. It carries positions and normals only. There are 1,859 unique positions at 1e-6 precision, so 7,499 accessor vertices (80.1%) are positional duplicates. Those splits largely support the low-poly face normals and are not automatically removable. After welding there are 45 components, 29 boundary edges in six small loops, and eight non-manifold edges. No degenerate/tiny triangles were detected by the audit threshold; 673 triangles have a max/min edge ratio above 20 and should be visually inspected before assuming they are defects.

`ocean.glb` is 46,008 bytes, indexed, one closed component, 1,728 accessor vertices, 290 unique positions, and 576 triangles.

A further **5–10% land triangle reduction** is plausibly safe through selective interior dissolves/decimation with visual comparison. **15% may be possible only selectively**. A blanket **20% reduction is high risk and not justified**: it can move the coastline silhouette, erase small islands, alter pin surface anchoring, and invalidate country IDs/border assets for negligible performance gain compared with fixing marker lifecycle and atlas residency.

Protect coastline/silhouette loops, small islands and isolated components, high-curvature tips, confirmed political-boundary split edges, and all ID discontinuities. Recommended workflow:

1. Preserve the current GLB and establish approved camera screenshots/silhouette projections.
2. Repair only confirmed non-manifold holes/pinches; do not weld away intentional flat-normal splits indiscriminately.
3. Mark protected edges/components and apply constrained dissolve or a low-ratio planar-aware decimator only to safe interiors.
4. Recompute flat normals without changing the approved silhouette.
5. Compare silhouette and radial deviation at world/country presets; verify small-island coverage and surface anchors.
6. Generate/transfer face IDs only after topology is final, then rebuild the boundary asset from that same revision.
7. Run automated GLB topology/coverage checks and manual lab review.
8. Prefer meshopt/GLB delivery compression for transfer savings before sacrificing visible geometry.

Land optimization is a Phase 5 polish task. It should not block the zero-pin lifecycle work, shared exploration state, or offline boundary pipeline.

## Verification record and limitations

This audit used static code tracing, source-data counts, Three.js geometry construction measurements, direct GLB accessor/index/topology inspection, GeoJSON feature/ring/coordinate analysis, asset dimension/file-size inspection, and existing atlas audit documentation. No production behavior was modified.

The development server built the route, but `/dev/language-explorer-globe` redirected to the admin login in the available browser session. The audit did not bypass authentication. Therefore, current border appearance, line joins, glow balance, and browser frame timings were **not visually verified in this pass**. Compilation or static analysis should not be interpreted as visual success; Phase 0 must capture real runtime traces on the target hardware.
