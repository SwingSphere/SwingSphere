# Globe Scale and Pin Proportion Calibration

## Outcome

The selected calibration is a hybrid presentation pass: enlarge the rendered globe group by 12%, narrow the camera FOV from 45° to 43°, and reduce the visible pin base scale to 70% of the previous value. Camera arrival distances, atmosphere placement, occlusion, hit targets, ripples, and label offsets now derive from one presentation config.

At an identical 1440×900 viewport and camera distance, the calculated projected globe diameter increases by about 18%. Visible pin footprint is about 17% smaller on screen, and roughly 30% smaller relative to the globe. The result preserves pin legibility while creating materially more apparent space between Bay Area fixtures.

## Scale audit

| Layer | Previous source | Previous value | Calibrated source | Recommended value |
| --- | --- | ---: | --- | ---: |
| Globe | GLB land mesh radius | ~2.55 units | `presentation.globe.scale` | 1.12× group scale |
| Camera FOV | renderer default | 45° | `presentation.camera.fov` | 43° |
| World camera | runtime config | 8.04 | `presentation.camera.defaultDistance` | 8.04 |
| Orbit limits | runtime config | 3.4–12 | `presentation.camera.min/maxDistance` | 3.65–12.5 |
| Region arrival | focus config | 4.8 | `presentation.camera.clusterDistance` | 5.15 |
| Listing arrival | focus config | 5.0 | `presentation.camera.listingDistance` | 5.4 |
| Visible pin base | marker wrapper scale | 1.0 | `presentation.pins.baseScale` | 0.70 |
| Hover / selected | marker wrapper scale | 1.18 / 1.34 | presentation config | 1.14 / 1.25 |
| Cluster / ripple | marker internals | 1.0 / 1.0 | presentation config | 0.88 / 0.76 |
| Hit target | marker geometry | 1.0 | independent hit-target scale | 0.90 |
| Labels | DOM offsets | 54 / 38 px | presentation config | 56 / 40 px |

Marker stem, tip, lift, surface offset, and hit geometry are expressed as globe-radius ratios in `GlobePresentationConfig.js`; they no longer need unrelated magic-number edits when the model scale changes.

## Approaches compared

1. **A — radius only:** a 1.12× globe group increased apparent size, but it also enlarged inherited markers and tightened the existing arrival framing.
2. **B — camera only:** 45° → 43° increased apparent size without changing pin-to-globe proportion, so regional crowding remained too prominent.
3. **C — hybrid (selected):** a 1.12× group, 43° FOV, 0.70× visible pins, restrained close-zoom compensation, and proportionally adjusted arrivals. This provided the strongest improvement with the fewest behavioral changes.

## Interaction and systems checks

- Visible pin geometry and raycast geometry scale independently. The calibrated hit mesh remains more forgiving than the visible pin.
- Hover stays restrained; selection remains the strongest state. Distance scaling is continuous and deliberately shallow rather than breakpoint-driven.
- Labels remain screen-space DOM. Marker anchor placement is world-space, and label offsets plus edge clamping prevent selected cards from leaving the viewport.
- Supercluster radius, extent, world zoom, activity-region semantics, `regionalSpread`, and marker aggregation logic are unchanged.
- MapLibre coordinates and canonical longitude/latitude handoff are unchanged. The in-canvas surface toggle now routes through `/globe` and `/map`, matching the header navigation path.
- Atmosphere, background glow, navigation sphere, and country occlusion use the effective presentation radius.

## Development calibration surface

`/dev/globe` exposes a development-only calibration panel with current-production, radius-only, camera-only, and recommended presets; live sliders; reset actions; fixture focus; and JSON/TypeScript copy output. The route remains protected by the existing admin gate.

Development fixtures include Bay Area, Miami/Fort Lauderdale, Atlanta, New York, Los Angeles, London, and Tokyo. Fixture IDs are prefixed `dev-scale:` and never enter production listing arrays.

## Responsive and performance observations

Checked at 1920×1080, 1440×900, 1366×768, 1280×800, 1024×768, and 390×844. At every size the globe canvas matched the viewport and document overflow stayed at zero. On the phone viewport the discovery/detail rails are hidden so the globe and controls remain usable.

The presentation change adds no textures, mesh segments, or persistent draw calls. Dev slider changes rebuild markers only while calibrating. The marker update path also reuses projection vectors instead of allocating three clones per visible DOM label per frame. In the instrumented in-app-browser run, both current and recommended Bay Area presets reported the same 25 FPS / high-quality tier; the browser-control capture overhead makes that number comparative rather than a production benchmark.

## Deferred follow-up

Clustering and `regionalSpread` should be re-evaluated only after this scale pass has been tested with production-density data. The narrow mobile header remains a separate site-shell concern. The repository-wide `tsc --noEmit` check still reports pre-existing type errors outside this calibration work; the production Vite build passes.
