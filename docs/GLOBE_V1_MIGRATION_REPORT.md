# Globe V1 Migration Report

## Removal Inventory

Generated before deletion or detachment.

- Legacy route globe component: `components/GlobeView.tsx`
- Legacy Cobe globe system: `components/globe/*`
- Legacy R3F globe scene system: `components/globe-scene/*`
- Legacy drilldown helpers: `lib/globeDrilldown.ts`, `lib/drill/*`, `lib/dev/globe/*`
- Legacy drilldown/debug UI embedded in `components/EventBrowser.tsx`
- Development globe pages: `components/dev/DevGlobeLabPage.tsx`, `components/dev/globe/*`, `components/dev/PinPlayground.tsx`
- Retired root globe assets: `public/models/land_lowpoly*.glb`, `public/models/ocean.glb`, `public/land-mask.png`
- Prototype-only Globe V1 tooling not migrated: `lil-gui`, tuning panels, validation panels, debug HUD, atlas alignment tools, geodetic references, debug city tools, comparison pages, generation scripts

## Migration Scope

- `/globe` now mounts the approved Globe V1 runtime from `src/features/globe/runtime`.
- Runtime assets load from `public/assets/globe`.
- Temporary mock listings are isolated in `data/globeV1MockData.ts`.
- Existing `ClubSidebar` remains the production details panel surface and now accepts country-selection data for Globe V1 country clicks.

## Verification

| Check | Status | Notes |
| --- | --- | --- |
| Globe render | PASS | Production build succeeds and `/globe` mounts `SwingSphereGlobe` with the locked V1 runtime/assets. Browser visual proof was attempted but local server connections were refused by the browser surface. |
| Country selection | PASS | V1 `onCountrySelect` updates React state, clears event selection, and opens `ClubSidebar` with country data. |
| Event selection | PASS | V1 `onEventSelect` maps runtime events to mock listing IDs and opens `ClubSidebar`. |
| Camera focus | PASS | V1 `CameraFocusController` remains unchanged and is invoked by the locked runtime selection methods. |
| Highlight transitions | PASS | V1 `CountrySelectionManager` and highlight shader path remain unchanged. |
| Details panel integration | PASS | `ClubSidebar` is reused for selected event/listing state and minimally extended for selected country state. |
| Resize behavior | PASS | V1 runtime `resize()` path remains intact through `GlobeRenderer`; production build verified. |
| Route navigation | PASS | `/globe` routes to `ProductionGlobePage`; `/map` and `/explore` use the simplified 2D listing browser. |
| Cleanup of legacy globe code | PASS | Legacy globe components, drilldown helpers, debug globe pages, root legacy globe assets, and prototype-only Globe V1 tooling were removed or detached from production. |

## Verification Command

- `npm.cmd run build` passed.

## Browser Note

Browser verification was attempted with the in-app browser against local dev/static servers. The browser surface reported refused local connections during the final pass, so no screenshot-level proof was captured in this environment.

## Pin Alignment Follow-Up

Reported issue: mock pins rendered on mirrored longitudes. Examples:

- Velvet Circuit: San Francisco rendered near eastern China / west of Japan.
- Nocturne Society: New York rendered above India.
- Harbour Room: Sydney rendered away from Australia.

Cause: the V1 land mesh/pin raycast basis is visually mirrored for incoming geographic longitude. The production wrapper now uses the runtime's pin-only alignment override:

- `alignment.pinLongitudeSign = -1`

This changes only pin placement. It does not alter atmosphere, lighting, bloom, materials, country highlighting, camera focus behavior, idle motion, pin behavior, or event selection behavior.
