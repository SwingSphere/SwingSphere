# Hex Landmask System

## 1) Feature Name
Hex Landmask / Hex Surface Prototypes

## 2) Purpose
Provide land-constrained hex visual layers for globe/map aesthetics and density signaling experiments.

## 3) Where It Lives (files + folders)
- `components/globe/useHexGrid.ts`
- `components/globe/CustomGlobe.tsx`
- `lib/mapHexLayer.ts`
- `public/land-mask.png`

## 4) How It Works (technical flow)
- `useHexGrid` samples `public/land-mask.png` against spherical sample points and keeps only land pixels.
- `CustomGlobe` consumes sampled points and renders instanced hex geometry (legacy/alternate globe component).
- `mapHexLayer.ts` builds a Mapbox custom layer using H3 cells and cylinder meshes.

## 5) Data Dependencies
- `land-mask.png` raster mask.
- H3 cell APIs from `h3-js` (Mapbox custom-layer path).

## 6) UI Dependencies
- `CustomGlobe` (not wired into router entry routes).
- `components/maps/Globe3D.tsx` uses `createHexCustomLayer` in the Mapbox stack.

## 7) Known Edge Cases
- If `land-mask.png` fails to load, fallback sample path creates non-land-filtered points.
- Mapbox custom layer depends on Mapbox runtime globals and style lifecycle.

## 8) Future Expansion Hooks
- Replace image-mask sampling with vector landmask intersection.
- Integrate active drill state into hex opacity/visibility.

## 9) Risk Areas
- This subsystem appears partially legacy; risk of divergence from active `CobeGlobe` pipeline.
- Additional draw cost if enabled alongside dense pins/boundaries.


