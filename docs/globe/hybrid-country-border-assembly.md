# GLB Coastline Replacement and Hybrid Country-Border Assembly

## Executive conclusion

The first production-quality hybrid-border prototype is implemented for Australia, Madagascar, the contiguous United States, and Brazil.

`land.glb` remains immutable and is authoritative for every ocean-facing segment in these assets. The current Natural Earth GeoJSON remains authoritative for inland political sections. Offline generation replaces entire classified coastal spans; it does not snap individual GeoJSON coastal vertices.

All emitted rings are closed, contain no consecutive duplicate points, and have no planar self-intersections. The assembled junction gap is zero for every ring. The existing adaptive terrain-conformance, shader-gradient, and prepared-geometry systems are reused without duplication.

The prototype is ready to extend to another small activity-country set after product review of these four countries. It should not yet be expanded indiscriminately to every country.

## Architecture

```text
land.glb
  -> offline 4096x2048 radial mask
  -> stitched and normalized physical coastline paths
  -> geometric-error simplification
  -> physical-coastlines-v1.json

physical coastline + ID atlas ownership + current country GeoJSON
  -> edge classification
  -> coastline subpath selection
  -> political/coastline junction scoring
  -> closed hybrid country assets

country selection
  -> allowlist check
  -> compact country asset lazy fetch, when supported
  -> existing terrain-conformance and prepared cache
  -> existing Line2 core/glow shader renderer

unsupported or unavailable asset
  -> current GeoJSON fallback
```

The runtime loads only the 721-byte manifest eagerly when hybrid borders are enabled. A supported country JSON is fetched only after an eligible selected country needs it. Hover does not trigger hybrid downloads. An explicit empty activity-country allowlist still renders no vector border.

## Coastline builder

The deterministic builder is `scripts/globe/build-land-coastlines.mjs`.

Default invocation:

```powershell
node scripts/globe/build-land-coastlines.mjs
```

Determinism/current-output check:

```powershell
node scripts/globe/build-land-coastlines.mjs --check
```

Optional 8K comparison for the isolated validation components:

```powershell
node scripts/globe/build-land-coastlines.mjs --8k
```

The builder:

1. parses the GLB and applies its node transforms;
2. classifies outward-facing triangles by radial face-normal score;
3. rasterizes their farthest positive radial intersection into an equirectangular mask;
4. traces land-to-empty transitions;
5. joins longitude-seam vertices before path chaining;
6. normalizes closure and winding;
7. assigns stable path IDs from deterministically sorted bounds, area, and coordinate fingerprints;
8. simplifies in 3D model space with a `0.0075` maximum-error tolerance;
9. writes dense review data separately from compact runtime data.

The 4K build produced 69 physical paths with 55,501 dense points and 829 simplified points. The production physical asset is 39,340 bytes. Dense global review data is 1,407,028 bytes and is never loaded by the normal runtime.

The 8K comparison produced 74 paths with 115,460 dense points and 826 simplified points. Australia retained 24 mainland plus 5 Tasmania controls at both resolutions. Madagascar used 10 controls at 4K and 9 at 8K. This supports using 4K for the version-one runtime assets.

## Country assignment

Country assignment is deterministic and deliberately separates physical location from ownership:

- physical coordinates always come from the `land.glb` radial mask;
- component bounds and GeoJSON ring similarity select isolated land components;
- the country-ID atlas supplies an ownership score sampled around candidate coastline points;
- GeoJSON containment/ring identity supplies target-country context;
- continental coastlines are assigned per span, not per land component.

The ID atlas can influence ownership scoring but never moves coastline coordinates.

## Coastal-span classification

Every GeoJSON ring edge receives one of three initial classes:

- `political` when the exact quantized edge is shared by another country;
- `coastline` when an otherwise unshared edge lies within 3.5 geographic degrees of a physical coastline;
- `ambiguous` otherwise.

Ambiguous edges are resolved from adjacent run continuity. Adjacent equal classes are grouped cyclically. A coastal group is replaced in full by a GLB path arc. The original GeoJSON points in that group are retained only in the diagnostic asset as the rejected coastline.

The 3.5-degree classification window accommodates the intentionally coarse relationship between the approved low-poly silhouette and the simplified political source. It does not become a snapping tolerance.

## Junction matching

For each coastal span, candidate start and end samples are gathered near the GeoJSON transition points. Both directions around a closed physical path are evaluated.

The score includes:

- start and end distance;
- source-to-arc and arc-to-source proximity;
- local endpoint tangent agreement;
- country-ID atlas ownership;
- deterministic path identity as the final tie-breaker.

After arc selection, every combination of physical-canonical and GeoJSON-canonical transition endpoints is evaluated. Any combination producing a self-intersection is rejected. Among valid combinations, physical coastline endpoints are preferred because `land.glb` is authoritative. Political segment interiors are unchanged; only their junction endpoints may move.

Diagnostics record both the pre-stitch source separation and the final assembled gap. All final gaps are zero.

## Results

| Country/ring | Source GeoJSON controls | Final coast controls | Political controls | Final junction gap | Pre-stitch maximum | Coast deviation |
|---|---:|---:|---:|---:|---:|---:|
| Australia mainland | 44 | 24 | 0 | 0° | 0° | 0.0073153 |
| Tasmania | 5 | 5 | 0 | 0° | 0° | 0.0038027 |
| Madagascar | 12 | 10 | 0 | 0° | 0° | 0.0072925 |
| United States lower 48 | 49 | 25 | 25 | 0° | 2.4274602° | 0.0070931 |
| Brazil | 63 | 14 | 38 | 0° | 0.5442549° | 0.0071824 |

The deviation values are maximum 3D model-space distances from dense GLB coastline samples to the simplified control polyline. They are below the selected `0.0075` tolerance.

### Australia

- The 44-point GeoJSON mainland ring is completely replaced by the 4K GLB component.
- Tasmania is a separate five-control GLB ring.
- No external territories or unrelated nearby islands are included.
- Front and oblique browser review showed both lines attached to the approved land silhouette without doubled coastlines or clipping.

### Madagascar

- The complete 12-point GeoJSON exterior is replaced by the dominant Madagascar GLB component.
- The simplified result uses ten controls and preserves the recognizable low-poly island silhouette.
- Front and near-limb browser review showed no gap, duplicate outline, or terrain clipping.

### United States lower 48

The emitted ring contains exactly four ordered segments:

1. GLB Pacific coastline;
2. unchanged-interior GeoJSON Mexico border;
3. GLB Gulf and Atlantic coastline;
4. unchanged-interior GeoJSON Canada border.

Alaska, Hawaii, Puerto Rico, other territories, Canadian/Mexican coastline, and Great Lakes coastlines are absent from the vector asset. The atlas selection can still fill Alaska and Hawaii because the ID atlas remains authoritative for country highlighting; this is independent of the lower-48 vector prototype.

The largest pre-stitch separation is 2.4274602 degrees at the low-poly Pacific/Canada transition. This is not an open gap: the political endpoint is deterministically stitched to the physical GLB endpoint, giving a zero final gap. Political interiors have zero deviation; endpoint-only deviation is reported separately.

Front and oblique browser review showed continuous Pacific, Atlantic, and Gulf attachment and no accidental Canadian or Mexican coastal traversal.

### Brazil

- One GLB Atlantic arc replaces the full classified coastal run.
- One continuous GeoJSON inland run retains all neighboring-country borders.
- Political interiors have zero deviation. The maximum endpoint-only stitch is 0.5442549 degrees.
- Front and oblique review showed the cyan Atlantic diagnostic on the model rim and the yellow inland segment retaining its original route.

## Asset formats and sizes

Runtime assets:

| Asset | Bytes |
|---|---:|
| `physical-coastlines-v1.json` | 39,340 |
| `manifest.json` | 721 |
| `aus.json` | 3,881 |
| `mdg.json` | 1,603 |
| `usa.json` | 6,829 |
| `bra.json` | 7,807 |

Each country asset retains segment provenance (`kind`, physical path ID and indices, direction, coordinates, and neighbor where unambiguous), a flattened runtime ring, separate coastline and political paths, and numerical diagnostics.

Dense physical paths and country review layers live under `public/assets/globe/models/audit/hybrid/`. They are lab-only and not referenced by normal runtime assets.

## Runtime fallback and cache behavior

The source hierarchy is:

```text
loaded prepared hybrid asset -> hybrid controls
otherwise                   -> current GeoJSON controls
```

The lab adds `geojson`, `coastline`, and `hybrid` source modes. Production callers normally use `hybrid` and retain the transparent fallback while a country asset is loading or when no asset exists.

Prepared cache identity now includes:

- feature identity;
- GeoJSON/hybrid/coastline source mode;
- hybrid asset version;
- physical coastline version;
- radius, densification, terrain, clearance, and subdivision settings.

A live Australia cold terrain build rendered 2,113 points across three Line2 paths, used 4,492 anchor raycasts and 1,845 subdivisions, and took 733.6 ms in the development browser. Cached re-selection took approximately 0.5 ms and zero switch raycasts. With glow disabled there were three draw calls; normal core-plus-glow mode produces two draws per rendered Line2 path. Per-frame updates remained uniform-only with zero color allocation and zero color-buffer uploads.

Local development HTTP asset-load observations ranged from approximately 156 ms to 909 ms while dense lab diagnostics were also loading and terrain anchoring. Production does not load those dense diagnostics.

The offline 4K build took about 0.9 seconds for mask extraction and 3.3–3.6 seconds total, using approximately 177 MB additional observed RSS. The optional 8K comparison took about 3.4 seconds for extraction and 6.5 seconds total, with approximately 195 MB additional observed RSS.

## Lab validation

The Language Explorer route now provides:

- GeoJSON-only, GLB-coastline-only, and hybrid runtime modes;
- raw dense and simplified physical coastline layers;
- retained political segments;
- rejected GeoJSON coastal spans;
- final assembled controls;
- junction points;
- source-color toggle;
- direct navigation to all four prototype countries.

Diagnostic paths use the same land-surface anchoring helper as the final renderer, avoiding perspective displacement from a reference sphere.

Browser review was completed for all four countries from front and oblique angles. No new console errors were introduced by the hybrid system. Existing React Router future warnings remain unrelated.

## Known limitations and risks

- Junction endpoint shifts reflect a real disagreement between simplified GeoJSON and the approved low-poly silhouette. The U.S. Pacific/Canada transition is the largest case and should receive focused product review.
- The 4K radial mask is a sampling of the approved silhouette. It is not a replacement mesh and should not be treated as arbitrary GIS truth.
- The physical global asset includes small land components that are not yet assigned to countries. Runtime country assets remain intentionally limited to four prototypes.
- Great Lakes are deliberately excluded from the ocean-facing coastline definition.
- The current GeoJSON political edges are not yet canonical shared paths, so neighboring countries can still carry independently encoded copies.
- Dense lab diagnostics are intentionally expensive and must remain out of production routes.

## Validation commands

```powershell
node --check scripts/globe/build-land-coastlines.mjs
node --check src/features/globe/runtime/CountryVectorBorderLayer.js
node --check src/features/globe/runtime/HybridCountryBorderAuditLayer.js
node --check src/features/globe/runtime/SwingSphereGlobe.js
node scripts/globe/build-land-coastlines.mjs
node scripts/globe/build-land-coastlines.mjs --check
node scripts/globe/build-land-coastlines.mjs --8k
npm.cmd run build
```

The builder was run normally and then checked twice against identical generation output. Production `land.glb` and `ocean.glb` hashes remain unchanged.

## Recommended next phase

Build canonical shared political-border assets before simplifying inland borders:

1. identify each country-pair boundary once;
2. normalize its traversal and stable ID;
3. preserve exact endpoint contracts with the version-one physical coastline junctions;
4. simplify by geometric error, not percentage;
5. have both neighboring country assets reference the same canonical path in opposite directions;
6. validate topology, terrain clearance, and cache versioning on the U.S.–Canada, U.S.–Mexico, and Brazil-neighbor sets first.

Do not expand hybrid generation globally until the four version-one prototypes receive visual product approval.
