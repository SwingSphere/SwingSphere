# SwingSphere globe performance — Phase 0 baseline

Date: 2026-08-01

Scope: deterministic development fixtures at 100, 500, 1,000, and 5,000 listings. This baseline measures current lifecycle behavior before Phase 1 changes world scope to construct zero individual pins.

## Test setup

- Route: `/globe?perf=1&perfFixture=<count>` for globe captures.
- Route: `/map?perf=1&perfFixture=<count>` for flat-map captures.
- Browser: Chrome 150 headless at 1440 × 900.
- Renderer: WebGL2, headless Chrome environment.
- Fixture data: fixed-seed synthetic listings distributed across ten metro areas.
- Production data was not modified.
- The normal 21+ gate was accepted in the isolated benchmark browser profile.

The headless browser is useful for deterministic object counts, build/disposal timing, long-task evidence, and context-loss detection. Its FPS values are not a substitute for profiling on the target 2019 MacBook Pro or representative mobile hardware.

## Globe results

| Listings | Constructed pins | Retained pin meshes | Retained label nodes | Estimated surface raycasts | Latest pin build | Latest disposal | Worst recent frame | Interactive average FPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 100 | 400 | 1,600 | 194 | 109.7 ms | 3.3 ms | 366.8 ms | 54.1 |
| 500 | 500 | 2,000 | 8,000 | 992 | 610.1 ms | 14.2 ms | 1,350.0 ms | 45.4 |
| 1,000 | 1,000 | 4,000 | 16,000 | 1,993 | 1,211.7 ms | 27.7 ms | 2,716.6 ms | 35.0 |
| 5,000 | 5,000 | 20,000 | 80,000 | 9,996 | 6,197.8 ms | 149.6 ms | 12,649.8 ms | unavailable after stall |

Additional observations:

- `visiblePinCount` remained zero at world scope for every fixture.
- The runtime nevertheless retained every listing marker, mesh, DOM label tree, and hit target.
- Pin construction scaled approximately linearly at about 1.1–1.25 ms per listing in this environment.
- The fixture triggered four pin rebuilds during startup/state synchronization. At 5,000 listings, cumulative disposed pins reached 10,000 before the final retained set stabilized.
- The activity-region layer remained bounded at ten region markers, 50 meshes, and approximately 8–10.5 ms to build.
- No WebGL context loss occurred during these captures.
- World draw calls stayed roughly constant because the retained listing group was hidden; this confirms that the primary world-scope costs are construction, memory, DOM retention, synchronization, and garbage collection rather than visible draws.

## Flat-map Three-pin results

| Listings | Constructed pin views | Retained pin meshes | Visible pins at world map | Projected hit-test pins |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 100 | 400 | 0 | 0 |
| 500 | 500 | 2,000 | 0 | 0 |
| 1,000 | 1,000 | 4,000 | 0 | 0 |
| 5,000 | 5,000 | 20,000 | 0 | 0 |

Additional observations:

- The custom MapLibre Three layer also constructs all listing views before `setVisibleListingIds()` hides clustered/non-visible pins.
- At the world map view, MapLibre clustering resulted in zero visible individual Three pins, but all views and meshes remained retained.
- The captured `listingSyncCount` ranged from 18 to 26 during map startup, showing repeated synchronization calls even when the listing set was stable.
- The final synchronization durations were small because those calls mostly updated existing records; they do not represent the initial geometry/material construction cost.
- The current counters did not observe detached-undisposed views in this fixed-data startup test. A separate mutation/removal fixture is still required to validate the suspected disposal leak.
- The map uses two pooled DOM labels rather than per-listing DOM label trees, so its dominant retained cost is Three.js object/geometry/material count.

## Findings

1. The audit prediction is confirmed: visibility is not lifecycle.
2. Globe world scope has zero visible pins but retains O(total listings) marker objects and DOM.
3. Flat-map world scope has zero visible individual pins but retains O(total listings) Three pin views.
4. The globe becomes visibly unsafe well before 1,000 listings because rebuilds create main-thread tasks above one second.
5. At 5,000 listings, the current globe startup/rebuild path is not production-credible.
6. Activity regions are currently bounded and inexpensive relative to listing markers.
7. Phase 1 should focus on render-object lifecycle, not land-mesh optimization.

## Phase 1 acceptance targets

For all 100/500/1,000/5,000 fixtures:

- Globe world scope: `constructedPinCount === 0`.
- Globe world scope: `retainedPinMeshCount === 0`.
- Globe world scope: `retainedLabelNodeCount === 0`.
- Globe world scope: no listing surface raycasts.
- Returning to world must not rebuild the total listing catalog.
- Flat-map world/cluster scope: custom Three pin views should be limited to visible unclustered listings plus the selected listing.
- Direct listing focus may construct one selected marker without constructing the global set.
- Catalog size must not produce an O(total listings) steady-state render-object rebuild when entering world scope.
- Repeated scope transitions must return geometry/material/texture counts to baseline.
- The benchmark suite must be rerun on the target 2019 MacBook Pro and representative mobile hardware before final performance claims.

## Known harness limitations and follow-up

- Header navigation from `/globe` to `/map` currently drops benchmark query parameters, so valid map captures use the direct `/map?perf=1&perfFixture=<count>` route.
- Headless FPS and GPU behavior are environment-specific.
- A removal/mutation fixture is needed to verify map disposal behavior.
- A country/region-local fixture is needed after Phase 1 to measure bounded local pin budgets.
- Browser visual quality was not evaluated in this baseline; this phase concerns lifecycle and performance measurements only.
