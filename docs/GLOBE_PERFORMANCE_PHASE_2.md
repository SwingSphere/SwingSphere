# Globe performance phase 2

This phase adds measured frame scheduling and adaptive quality without changing SwingSphere's pin-first interaction model or the P0 capability, MapLibre, reduced-motion, context-recovery, and list-first fallbacks.

## Development monitor

Run the Vite development server and open either the existing globe developer route or `/globe?perf=1`. The `perf=1` switch enables only the performance panel; it does not enable the other globe composition tools.

The collapsed panel shows FPS and the active quality tier. Expand it to inspect explorer mode, loop and MapLibre lifecycle, frame policy, DPR, graphics capability, frame timing, renderer calls and resources, pins, ripples, context losses, transition durations, round trips, and tracked listeners.

The panel and its console API are loaded through a development-only dynamic import. They do not produce a public production chunk. The renderer's low-frequency samples remain part of the runtime because the adaptive-quality controller consumes them.

The browser console API is:

```js
window.SwingSpherePerformance.getSnapshot()
window.SwingSpherePerformance.startBenchmark()
window.SwingSpherePerformance.stopBenchmark()
window.SwingSpherePerformance.copyBenchmarkReport()
window.SwingSpherePerformance.resetAutomaticQuality()
```

`copyBenchmarkReport()` copies formatted JSON. No sample or report is sent to a server.

The approximate 1% low is calculated as the reciprocal of the 99th-percentile rendered-frame duration over the rolling eight-second sample window. It is intentionally labeled approximate: rate-limited ambient and idle frames are included in the general display but are excluded from adaptive-quality decisions.

## Frame policy

The renderer retains one `requestAnimationFrame` scheduler and conditionally skips GPU renders:

| State | Target | Notes |
| --- | ---: | --- |
| Interaction, travel, hover/selection animation, transition | 60 FPS | Pointer, wheel, touch, keyboard, controls, resize, selection, and route travel restore this immediately. |
| Recent visible ambient motion | 30 FPS | Applies for about eight seconds after interaction when ambient motion is allowed. |
| Long idle | 12 FPS | Keeps a subtle visible globe alive at low cost. |
| Map established, hidden document, context loss, unmount, explicit stop | 0 FPS | The RAF is cancelled, not merely skipped. |

Reduced-motion mode never activates ambient animation to justify extra frames. It falls from interaction directly to the long-idle policy.

Summaries publish every 750 ms; React is not updated per animation frame.

## Adaptive quality

Capability defaults are high for hardware WebGL2 and low for degraded WebGL2. Unsupported WebGL remains list-first.

Tiers:

- High: DPR cap 1.5, bloom and full atmosphere/ripples, antialiasing when the renderer was created with it.
- Balanced: DPR cap 1.25, bloom strength reduced to 54% with restrained radius/threshold, slower and dimmer ripple motion.
- Low: DPR 1, bloom disabled, continuous nonessential ripple motion removed, outer/background atmosphere disabled. Pins, hit targets, labels, selection, travel, geography, and map transitions remain.

Only meaningful interactive samples are eligible. Hidden, suspended, transition, ambient, and long-idle samples are ignored. A downgrade requires an interactive rolling average below 44 FPS for six accumulated seconds and has a 20-second tier-change cooldown. Recovery requires at least 56 FPS for 90 accumulated interactive seconds and a 120-second tier-change cooldown. Samples between the thresholds clear recovery and drain poor-performance time, preventing oscillation.

The automatic tier is stored under `swingsphere.globe.autoQuality.v1`. Reset it from the panel or console API.

Antialiasing is a WebGL context-creation setting. Entering low tier during a live session applies every other low-tier reduction but does not recreate the renderer. If low was already stored when a later visit creates the renderer, antialiasing starts disabled. This avoids destabilizing context recovery, selection, and cached assets.

## Ten-round-trip benchmark

1. Open `/globe?perf=1` in development and expand Performance.
2. Select a destination and start the benchmark.
3. Enter Map mode and return to Globe mode ten times.
4. Stop the benchmark after the last globe has settled.
5. Use Copy JSON or `copyBenchmarkReport()`.

The report records the environment, starting/ending tier, interactive and transition FPS, both transition durations, peak renderer counts, context-loss delta, round-trip count, starting/ending resources, resource deltas, listener count, current loop/MapLibre state, and Chromium heap delta when available. Heap values are diagnostic only because garbage collection is nondeterministic; stable Three.js geometry and texture counts are the stronger leak signal.

Expected lifecycle at the endpoint: globe loop running, MapLibre unmounted. During fully established Map mode: globe loop stopped, MapLibre mounted.

## Pin and ripple assessment

Each normal listing pin creates four meshes: stem, tip, base glow, and an invisible hit target. A selected pin adds one ripple mesh; the saved state can also add a halo. Listing labels are DOM overlays, not sprite meshes.

Because those meshes use separate, per-pin material/geometry instances, the present theoretical contribution is four draw calls per visible base pin, plus one for the selected ripple and one for a visible saved halo. The exact total can vary with frustum culling and renderer state; the monitor's `drawCalls` value is the authoritative whole-scene measurement and `pinMeshCount` exposes the pin-side mesh population for comparison.

The current implementation creates geometry and material instances per pin rather than sharing them. Ripple scale/opacity is updated on the CPU once per rendered frame for the selected pin. Pin raycasting is already restricted to invisible hit targets, so decorative stem, tip, glow, ripple, and DOM label elements are not tested. Activity-region raycasting separately includes its deliberate hit target and label sprite.

Instancing would reduce draw calls and resource counts once many listing pins are simultaneously visible, but would require instance-to-listing hit mapping, per-instance selected/hover style handling, and preservation of DOM label projection and travel anchoring. With the current progressive disclosure and one animated selected ripple, the risk is larger than the demonstrated benefit.

Recommendation: defer full pin instancing until a physical baseline benchmark shows pin draw calls are the limiting factor. If the simultaneous visible-pin ceiling increases, share immutable pin geometry/material first, then consider base/stem instancing. Ripple-only instancing is not worthwhile while only one selected ripple normally animates. Bloom/postprocessing and DPR should be assessed before changing the selection architecture.

## Local validation record

- Production Vite build: successful (2,601 modules).
- Focused syntax checks: all modified globe JavaScript modules passed `node --check`.
- Focused TypeScript check: no errors in the new performance controller, monitor, or modified runtime contracts. Existing unrelated `ProductionGlobePage` and variant-page type debt remains.
- Production chunk inspection: no `GlobePerformancePanel` chunk emitted.
- Main app chunk after this phase: 205.69 kB raw / 53.17 kB gzip. The immediately preceding P0 build was 196.89 kB raw / 50.48 kB gzip, a 8.80 kB raw / 2.69 kB gzip increase for the scheduler, adaptive controller, and runtime measurements.
- Production globe page chunk: 262.38 kB raw / 81.57 kB gzip.
- MapLibre remains split at 1,055.19 kB raw / 285.08 kB gzip; `FlatWorldMap` remains split at 50.89 kB raw / 14.18 kB gzip.

Automated visual browser validation could not be completed in this environment because the in-app browser's content policy blocked the local SwingSphere page. A physical 2019 MacBook Pro pass is still required for interactive/transition FPS, hidden-tab pause/resume, reduced motion, context loss/restoration, and the ten-round-trip resource comparison. Do not treat desktop build results as evidence that the 45/30 FPS hardware targets have been met.
