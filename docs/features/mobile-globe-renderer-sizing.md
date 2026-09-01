# Mobile Globe Renderer Sizing and Black-Bar Regression

## 1) Problem

Dev Mobile previously showed a persistent vertical black strip on the right side of the phone viewport. The globe could also appear horizontally clipped even after camera-distance and field-of-view tuning.

The important distinction is that this symptom can come from two different systems:

- **camera framing** — the globe is too large for the camera frustum
- **renderer/container sizing** — the WebGL canvas itself is narrower than the mobile surface

The right-side black strip was the second case.

## 2) Confirmed Symptom

In `/dev/mobile`, the mobile shell and overlays extended to the full simulated iPhone width, but the Three.js-rendered globe/background stopped before the right edge, leaving a straight vertical black band.

A straight, persistent vertical edge is a strong indication that the render surface is undersized. Do not try to solve that symptom only by moving the camera, increasing world distance, or changing globe scale.

## 3) Root Cause

`GlobeRenderer` sized its WebGL renderer from the globe container, but it only reacted reliably to `window.resize`.

The Dev Mobile experience runs inside the `/dev/mobile` workbench iframe. The iframe and nested mobile layout can settle or change dimensions without producing the browser-window resize event that Three.js was relying on. This allowed the WebGL canvas to retain stale CSS/render dimensions that were narrower than the actual 390px mobile surface.

The canvas also did not explicitly declare that it must fill all four edges of its container.

## 4) Durable Fix

The fix lives in:

- `src/features/globe/runtime/GlobeRenderer.js`

The renderer now:

1. Explicitly styles the WebGL canvas to fill its parent:
   - `display: block`
   - `position: absolute`
   - `inset: 0`
   - `width: 100%`
   - `height: 100%`
2. Observes the actual globe container with `ResizeObserver`.
3. Calls `resize()` whenever the container dimensions change, rather than relying only on `window.resize`.
4. Disconnects the observer during renderer disposal.

The existing `resize()` path remains responsible for synchronizing:

- camera aspect ratio
- renderer dimensions
- EffectComposer dimensions
- bloom render-target dimensions
- resize listeners

## 5) Camera Framing Is Separate

Dev Mobile also uses viewport-aware world framing. That solves a different problem: ensuring the entire globe fits comfortably within a portrait camera frustum.

Relevant logic is also in `GlobeRenderer.js`:

- `fitWorldToViewport`
- `worldViewportFill`
- `#resolveViewportFitDistance()`

That calculation uses the rendered globe bounds plus the camera's horizontal/vertical field of view to derive a safe world distance.

If the globe is fully rendered to the viewport edges but is visually too large or clipped, investigate camera framing. If the rendered scene itself stops at a straight vertical or horizontal boundary, investigate renderer/container sizing first.

## 6) Regression Checklist

If the black bar returns:

1. Open `/dev/mobile`, not only `/dev/mobile-preview`.
2. Confirm whether UI overlays reach the right edge while the Three.js scene does not.
3. Inspect the globe container `clientWidth` and `clientHeight`.
4. Inspect the WebGL canvas CSS dimensions and `getBoundingClientRect()`.
5. Confirm the `ResizeObserver` on the globe container is still active.
6. Confirm `renderer.setSize(width, height, false)` and `composer.setSize(width, height)` run after the container reaches its final dimensions.
7. Do not compensate with globe scale, camera offsets, or arbitrary CSS width expansion unless the canvas itself already matches the container.
8. Verify both initial load and a workbench reset/iframe reload.

## 7) Expected Mobile Result

At the 390 × 844 Dev Mobile baseline:

- the Three.js scene fills the complete mobile viewport
- no persistent black strip appears on either side
- the globe remains centered after reset
- the entire globe can fit with deliberate breathing room
- overlays and renderer share the same viewport boundaries

## 8) Why This Is Documented Separately

This failure looked like a globe-camera problem and led to several reasonable but ineffective framing adjustments before the actual renderer-width issue was isolated. Keeping this note prevents future work from repeating that diagnostic path.
