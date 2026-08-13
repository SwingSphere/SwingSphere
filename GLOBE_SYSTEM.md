# SwingSphere — Globe System

> Part of the 2026-06-23 architectural audit. The 3D globe is the headline
> product feature and the most engineered subsystem. This doc is detailed.

---

## 1. Purpose

The globe is an **immersive, cinematic discovery surface** — explicitly *not* a
GIS tool (per `AGENTS.md`). It provides:
- World-view exploration via **activity regions** (clusters of co-located listings).
- Progressive disclosure: zoom/focus into a region to reveal individual **pins**.
- **Country hover** as orientation support (subordinate to pins).
- Camera-focus transitions on selection (pin or country).
- A pinned-first, premium aesthetic (dark graphite + restrained crimson).

Two consumers:
1. **`/globe`** (`ProductionGlobePage`) — full interactive discovery with sidebar + rail.
2. **Landing hero** (`LandingHeroGlobe`) — decorative, pointer-events-none variant.

---

## 2. Architecture overview

The globe is a **vanilla JavaScript Three.js engine** that React mounts
**imperatively**. React Three Fiber, Drei, and React Spring are installed but
**not used** by the production globe.

```text
React (ProductionGlobePage / LandingHeroGlobe)
   │  container <div ref>
   │  dynamic import('../src/features/globe/runtime/index.js')
   ▼
SwingSphereGlobe (orchestrator class)
   │  .mount() async → loads assets, builds subsystems, starts render loop
   │  public methods called from React via ref
   ▼
GlobeRenderer          → scene, camera, OrbitControls, EffectComposer (bloom),
   │                       WebGLRenderer, render loop, idle rotation
   ├─ GlobeAssetLoader → GLTF (land/ocean), textures, countryId sampler, lookup json
   ├─ AtmosphereRenderer → inner/outer fresnel shells + crimson rim + background glow
   ├─ CameraFocusController → animated camera/target lerp (easeInOutCubic)
   ├─ PinManager (→ GlobeMarker) → listing pins + hover/select + regional spread
   ├─ ActivityRegionManager (→ DiscoveryMarker) → world-view cluster markers
   └─ CountrySelectionManager → country picking + highlight shader + transition fades
shaders/* : atmosphereShader, backgroundGlowShader, countryHighlightShader,
            graphiteFacetBoost
math/*    : geoProjection, objectPools, surfaceAnchoring
```

---

## 3. Entry points

### 3.1 React entry — `components/ProductionGlobePage.tsx`
**Purpose:** mounts the globe, bridges React state ↔ engine via callbacks,
renders the explorer rail + detail sidebar as overlays.

**Key state variables (React):**
- `runtimeState: 'loading' | 'ready' | 'error'` — gates all engine calls.
- `selectedCountry`, `focusedListingId`, `activeActivityRegionId` — selection.
- `atmosphereTool` (persisted to `localStorage` `swingsphere.globeV1.atmosphereTool`).
- `alignmentDebug` — transform overrides (panel hidden via `SHOW_GLOBE_ALIGNMENT_DEBUG_PANEL = false`).
- `pinHoverDebug`, `globeHoverDebug` — inspector samples for the debug panel.

**Mount sequence (`useEffect`):**
```text
import('../src/features/globe/runtime/index.js')
  → new SwingSphereGlobe(container, { events:[], activityRegions:[],
      config: globeAssetsConfig, onReady, onError,
      onCountrySelect/Hover, onEventSelect/Hover,
      onActivityRegionSelect, onDiscoveryModeChange })
  → globe.mount()
  → on ready: useEffect[globeRuntimeEvents] calls updateEvents + updateActivityRegions
```

**Cleanup:** `globeRef.current?.dispose()` (idempotent).

**Layouts:** three render branches — full-bleed (`FULL_BLEED_GLOBE_LAYOUT = true`,
the active one), a 3-column grid fallback, and a hero variant.

### 3.2 Engine entry — `src/features/globe/runtime/index.js`
Exports: `mount`, `SwingSphereGlobe`, `createGlobeRuntimeConfig`,
`DEFAULT_GLOBE_RUNTIME_CONFIG`, `GlobeAssetLoader`, `GlobeAssetError`.

> ⚠️ **Location risk:** the engine source lives under `public/` and is imported
> via a dynamic import path into `public/...`. `public/` is normally served
> verbatim; importing TS/JS from it is unusual and fragile. See TECHNICAL_DEBT.md.

---

## 4. Public API surface (`SwingSphereGlobe`)

| Method | Purpose |
|---|---|
| `mount()` | Async. Loads assets, builds all subsystems, starts render loop, emits `onReady`. |
| `updateEvents(events)` | Rebuilds pins (and active-region-filtered events). |
| `updateActivityRegions(regions)` | Rebuilds world-view cluster markers. |
| `updateAtmosphereConfig(cfg)` | Deep-merges into runtime config; updates atmosphere shells. |
| `updateAlignmentDebugConfig(cfg)` | Applies transform overrides (pin/land/atlas alignment) — dev tooling. |
| `updatePinAlignmentDebugConfig(cfg)` | Pin-specific alignment shortcut. |
| `updateDebugView(cfg)` | Country-selection debug view (textures/mask toggles). |
| `selectEvent(eventId)` | Selects a pin; activates its region if needed; focuses camera. |
| `selectCountry(idOrIso)` | Selects + highlights a country; focuses camera. |
| `clearSelection()` | Clears country + pin selection. |
| `returnToWorld()` | Exits region mode, returns to world view, refocuses. |
| `resize()` | Forwards to renderer. |
| `dispose()` | Idempotent teardown of all subsystems + listeners. |

**Constructor callbacks:** `onReady`, `onError`, `onCountryHover`,
`onCountrySelect`, `onEventHover`, `onEventSelect`, `onActivityRegionSelect`,
`onDiscoveryModeChange`, `onSurfaceDoubleClick`.

All public methods are guarded by `#canUseRuntime()` (`!disposed && ready && renderer`).

---

## 5. Subsystem deep-dive

### 5.1 GlobeRenderer (`GlobeRenderer.js`)
**Purpose:** scene/camera/controls/renderer/composer setup + the render loop.

**Key state:** `scene`, `camera` (PerspectiveCamera), `controls` (OrbitControls,
damped), `composer` (EffectComposer), `bloomPass` (UnrealBloomPass),
`globe` (Group), `oceanMesh`, `visibleLandMesh`, `landHitMesh` (invisible clone
for stationary raycasting), `clock`, `lights{}`, `frameListeners` (Set),
`visualIdleMotion`.

**Render loop (`#animate`):** `requestAnimationFrame` → compute delta/elapsed →
update zoom-aware rotation speed → `controls.update()` → update idle land/ocean
rotation (eased, pauses for `idleResumeDelaySeconds` after interaction) → notify
frame listeners → `composer.render()`.

**Materials:** ocean + land are `MeshStandardMaterial` with `flatShading: true`
(graphite sculptural look) and `applyGraphiteFacetBoost` shader injection
(`shaders/graphiteFacetBoost.js`) for rim emphasis.

**Zoom-aware rotation** (`#updateControlsRotationSpeed`): rotation speed scales
with camera distance (slow when zoomed in to a city, fast at world view) using a
smoothstep + power curve.

**Potential risks:**
- `UnrealBloomPass` is GPU-costly; combined with two 4K atlas textures this is
  the heaviest GPU workload in the app.
- Idle rotation mutates mesh rotation every frame even when idle.

### 5.2 GlobeAssetLoader (`GlobeAssetLoader.js`)
**Purpose:** load + validate all globe assets in parallel.

**Loads (via `Promise.all`):**
- `oceanModel`, `landModel` — GLTF (`GLTFLoader`)
- `countryIdTexture` — **twice**: once as an `idSampler` (CPU-readable
  `ImageData` via an offscreen canvas with `willReadFrequently: true`) and once
  as a GPU `Texture`
- `visualCountryAtlas` — GPU texture (the visible country colors)
- `countryLookup` — JSON (`fetch`), validated to contain `rgb: [r,g,b]` arrays

Returns `{ oceanMesh, landMesh, idSampler, countryLookup, countryByRgb (Map),
countryIdTexture, visualAtlasTexture, ... }`.

**Potential risks:**
- Atlas textures are 4096×2048 ≈ **32MB RGBA each on GPU** (per README) — two of them.
- CPU `idSampler` keeps a full `Uint8ClampedArray` of the texture in memory for picking.

### 5.3 CountrySelectionManager (`CountrySelectionManager.js`)
**Purpose:** country hover/select via **texture-based picking** + animated highlight.

**Picking algorithm (not geometry raycasting):**
1. Raycast against `visibleLandMesh` to get the world hit point.
2. Verify the point is on the **front hemisphere** (`clickFrontHemisphereDot`)
   and not occluded by the globe sphere (`clickOcclusionSurfacePadding`).
3. Convert hit point → mesh-local → **spherical UV** (`math/geoProjection.sphericalUv`).
4. Sample the `idSampler` `ImageData` at that UV → RGB tuple.
5. Look up `countryByRgb.get("r,g,b")` → country.
6. Only countries with `eventActive` (event count > 0) are selectable.

**Highlight rendering:** a separate `highlightMesh` shares the land geometry,
scaled slightly (1.004), using `countryHighlightShader` which masks by matching
the country's target RGB in the id texture. Supports fade in/out, a selection
**pulse**, a **breathe** cycle, and an **outgoing** mesh for cross-fade between
countries. Debug overlays exist for the id texture, visual atlas, and mask.

**Potential risks:**
- Picking is throttled by `raycastRotationThreshold` (0.0025 rad) to avoid
  per-frame raycasts while the globe rotates — but still raycasts on every
  pointer move above threshold.
- `enabledEventOnly = true` means empty countries are non-interactive — intended,
  but can confuse users expecting all countries to be clickable.

### 5.4 PinManager (`PinManager.js`) + GlobeMarker (`GlobeMarker.js`)
**Purpose:** listing pins with hover/select states, regional spread, labels.

**Marker composition (`GlobeMarker`):** a radial "signal pin" = stem (cylinder) +
tip (sphere) + glow (ring) + animated ripple ring + an HTML/sprite **label**
(title + subtitle, e.g. city + flag emoji). Hit target is an invisible larger
sphere (`hitRadius`). Extensive `DEFAULT_MARKER_STYLE` constants control every
proportion/opacity/scale.

**Regional spread (`buildRegionalDisplayCoordinates`):** co-located pins are
grouped by proximity (`proximityThresholdDeg`) and laid out in concentric rings
(`innerRadiusDeg`, `ringStepDeg`, `ringCapacity`) around the cluster centroid,
longitude-scaled by `cos(latitude)`. Pins interpolate between their **spread**
position (idle) and **true** position (selected) via `currentGeographicMix`
(slerp + lerp).

**Anchoring:** pins are placed via `resolveLandSurfaceAnchor`
(`math/surfaceAnchoring.js`) — raycasts from the sphere outward to find the
actual land surface point at that lat/lon, so pins sit on the mesh, not floating.

**State:** `markerViews[]`, `markerMap` (id→view), `hitTargets[]`,
`hoveredEvent`, `selectedEvent`, `dirty`.

**Potential risks:**
- Per `README.md`: *"Marker count should remain modest for V1. High-density
  event maps should move to shared materials/geometries, instancing, sprites, or
  GPU points."* Current mesh-per-pin approach will not scale.
- Each pin rebuild (`updateEvents`) disposes + recreates all markers.

### 5.5 ActivityRegionManager (`ActivityRegionManager.js`) + DiscoveryMarker
**Purpose:** world-view cluster markers (the default view before zooming in).

`ActivityRegion`s are produced in React (`createActivityRegions`, see DATA_FLOW)
from discovery points via Supercluster + h3. The manager creates a
`DiscoveryMarker` per region (larger, count-labeled), raycasts for hover/click.

**Progressive disclosure (`SwingSphereGlobe.#updateProgressiveDisclosure`):**
- No active region → activity regions visible, pins hidden.
- Active region → pins visible (filtered to that region), regions hidden.
- If camera pulls back beyond `worldEnterDistance` while focused → auto-return to world.

**Potential risks:** the world↔region transition is driven by camera distance
each frame — a deliberate, tuned behavior but a place where tuning drifts hurt UX.

### 5.6 CameraFocusController (`CameraFocusController.js`)
**Purpose:** animated camera + OrbitControls target transitions.

`focus(worldTarget, elapsed, overrides)`:
- Builds a focus direction from globe-center→target, offset by `offsetX`/`offsetY`
  (right/up tangent vectors), plus a `cameraYOffset`.
- Duration scales with angular distance (0.65–1.4s).
- Lerps both camera position and controls target with `easeInOutCubic`.
- Respects `minDistance`/`maxDistance` and an optional `focusDistance` override
  (cluster focus uses `progressiveDisclosure.clusterFocusDistance`).

`focusWorld(elapsed)` — returns to `worldDistance`.

**Potential risks:** focus is re-entrant (`focus()` calls `update()` first to
flush) — correct but easy to break if refactored.

### 5.7 AtmosphereRenderer (`AtmosphereRenderer.js`)
**Purpose:** the premium visual shell — inner + outer fresnel atmosphere
spheres, a crimson rim, and a camera-locked background glow/haze.

- Shaders: `atmosphereShader` (fresnel, crimson/graphite intensity, horizon
  falloff), `backgroundGlowShader` (camera-facing glow + haze).
- `update()` repositions the background glow behind the globe relative to the camera each frame.
- `updateConfig(cfg)` live-tunes shells/rim — this is what the in-app
  **Atmosphere Tool** panel drives (persisted to localStorage).

---

## 6. Runtime config — `GlobeRuntimeConfig.js`

A large, explicitly-tuned config object (`DEFAULT_GLOBE_RUNTIME_CONFIG`) with
sections: `assets`, `colors`, `coordinateBasis`, `alignment`, `renderer`,
`orbitControls` (incl. `zoomAwareRotation`), `progressiveDisclosure`,
`pinPlacement` (incl. `regionalSpread`), `cameraFocus`, `atmosphere`,
`crimsonRim`, `bloom`, `lights` (8 directional lights + ambient + hemisphere),
`materials`, `background`, `selection`, `idleMotion`.

`createGlobeRuntimeConfig(overrides)` deep-merges overrides onto a cloned default.

> The default asset paths now point directly to `/assets/globe/...`, so production
> pages and development tools share the same canonical runtime asset locations.

**This config is the single source of truth for the globe's "feel."** Per
`AGENTS.md`, successful pin proportions, selected/hover hierarchy, camera feel,
and explicit tuning knobs should be preserved when porting.

---

## 7. Asset inventory

Located at `public/assets/globe/`:

| Asset | Purpose | Size concern |
|---|---|---|
| `models/land.glb` | Landmass mesh (sculptural, flat-shaded) | GLTF geometry |
| `models/ocean.glb` | Ocean mesh | GLTF geometry |
| `textures/countryIdTexture.png` | 4K×2K RGB country ID map (picking) | ~32MB GPU + CPU sampler |
| `textures/visualCountryAtlas_v3.png` | 4K×2K visible country colors | ~32MB GPU |
| `data/countryLookup.json` | country metadata + `rgb` arrays | JSON |

---

## 8. Dependencies

**External (npm):** `three@0.165` (the only runtime 3D dep used).

**Three addons** (via `three/addons/`): `OrbitControls`, `EffectComposer`,
`RenderPass`, `UnrealBloomPass`, `GLTFLoader`.

**Cross-module (engine-internal):** see dependency graph in §2.

**From React:** `lib/globeEntityAdapter` (Listings→events),
`lib/discoveryPointAdapter` (Listings→points),
`lib/activityRegionProvider` (points→regions), `data/globeV1MockData` (types).

---

## 9. Important state variables (cross-cutting)

| Variable | Owner | Meaning |
|---|---|---|
| `SwingSphereGlobe.ready` / `disposed` / `mounting` | engine | lifecycle guards |
| `activeActivityRegion` | engine | current drilled-in region (null = world) |
| `renderer.visualIdleMotion.landSpeed/oceanSpeed` | renderer | eased idle spin |
| `countrySelection.transition` | country mgr | fade/pulse/outgoing animation state |
| `pinManager.hoveredEvent` / `selectedEvent` | pin mgr | interaction state |
| `pinManager.dirty` | pin mgr | hover re-raycast pending flag |
| `cameraFocus.animation` | camera mgr | active tween state |
| `debugState` / `debugBaseTransforms` | engine | alignment tooling |

---

## 10. Performance considerations

1. **Two 4K atlas textures** (~64MB GPU total) + bloom + 8 lights — the globe is
   the dominant GPU cost. Mobile/low-end devices are at risk.
2. **Per-frame work:** camera focus update, atmosphere repositioning, pin hover
   raycast (throttled), country hover raycast (rotation-throttled), pin per-view
   lerp/slerp.
3. **Per-marker meshes** (no instancing) — fine for tens of pins, bad for hundreds.
4. **CPU country picking** reads `getImageData` once at load (good) but samples
   per hover (acceptable, single pixel read).
5. **Pixel ratio capped** at `maxPixelRatio: 2`.
6. **Object pooling / disposal:** `math/objectPools.disposeObject3D` used in
   teardown; marker rebuilds dispose individual markers.

---

## 11. Potential risks (summary)

- **Engine lives in `public/`** — imported via dynamic import from a public path;
  not type-checked with the app, not bundled normally.
- **Double source of truth** between React selection state and engine state.
- **No lazy unmount of assets** — once loaded, atlas textures stay in GPU memory
  until `dispose()`.
- **Hardcoded mock events** fallback if adapters return empty.
- **Stale default asset paths** in `GlobeRuntimeConfig.js`.
- **Atmosphere/alignment tooling** ships in the page (hidden behind flags) —
  should be dev-only before production.
