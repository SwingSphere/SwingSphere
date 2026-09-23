# SwingSphere Globe Border Baseline

## Purpose

This document records the known-good production globe border state after the September 2026 border regression.

Use this as the recovery contract before changing country geometry, coastline snapping, longitude calibration, hybrid border generation, or Border Surgery behavior.

The visual target is the production SwingSphere globe as restored on 2026-09-19: countries read as intentional low-poly plates fitted to `land.glb`, inland borders cross land cleanly, and coastal portions visually follow the physical land rim.

## Golden baseline

Git baseline:

- Branch: `main`
- Remote: `origin/main`
- Known-good commit family: `ec32374` -> `69e21d5` -> `16bd5cc`
- These commits share the same production border presentation configuration and hybrid manifest.

If a future experiment breaks the globe, compare the current implementation against `origin/main` before attempting to regenerate borders.

Do **not** blindly restore the whole repository if unrelated work is in progress. Restore only border/runtime/configuration files after reviewing the diff.

## Visual contract

SwingSphere is not trying to reproduce GIS-perfect country geometry.

The globe is intentionally low-poly. Country borders should look like fitted armor on the simplified land mesh.

### Inland / political borders

- May be simplified.
- Prefer clean, mostly straight low-poly segments.
- Must sit on the land surface.
- Neighboring countries must not visibly cross or overlap each other.
- Shared boundaries should visually agree.

### Coastal borders

- The physical `land.glb` rim is the visual authority.
- Country boundaries that reach a coast must visually terminate into and follow that rim.
- They must not:
  - dive through the globe,
  - create Cartesian chords through the interior,
  - float away from the coastline,
  - jump across bays or water,
  - create large arches away from the rim.

### Islands / dense geography

- Simplification is allowed and expected.
- Visual coherence is more important than retaining tiny GIS details.
- Do not introduce micro-geometry that fights the low-poly aesthetic.

## Coordinate-frame contract

These values are deliberately separate. Do not make every layer share one offset simply because they appear related.

### Country vector / GeoJSON borders

- Longitude offset: **0.0°**
- Coordinate space: WGS84
- This is the known-good border placement.

### Country atlas / ID-highlight mask

- Longitude offset: **+1.5°**
- The atlas is calibrated independently from WGS84 vector geometry.

### Listing / venue pins

- Longitude offset: **0.0°**
- Historical note: pins previously used **+1.5°** and were observed approximately **1.5° too far east/right**.
- The correct repair was to subtract 1.5° from that existing value, producing 0.0°.
- Do **not** interpret the phrase "move pins 1.5° left" as "set offset to -1.5°". That would apply the correction twice.

Latitude offsets remain 0° unless deliberately recalibrated.

## Production configuration

Primary page:

- `components/ProductionGlobePage.tsx`

Important production constants:

- `PIN_LONGITUDE_OFFSET_DEG = 0`
- `GEOJSON_LONGITUDE_OFFSET_DEG = 0`
- `COUNTRY_ATLAS_LONGITUDE_OFFSET_DEG = 1.5`

Normal production rendering must use these committed constants.

Experimental alignment values stored in browser localStorage must never override ordinary production mode. Calibration controls belong only in explicit dev/hybrid tooling.

## Canonical border assets

Production presentation currently uses:

- `public/assets/globe/borders/hybrid/v1/manifest.json`
- country assets under `public/assets/globe/borders/hybrid/v1/`
- fallback source: `/geo/countries.json`
- physical land: `public/assets/globe/models/land.glb`

Before regenerating assets, confirm the runtime/configuration is actually wrong. During the 2026 regression, several attempts regenerated or rewrote geometry when the safer answer was to restore the known-good production pipeline.

## Runtime files that should be treated as sensitive

- `src/features/globe/runtime/CountryVectorBorderLayer.js`
- `src/features/globe/runtime/CountryVectorActivityLayer.js`
- `src/features/globe/runtime/SwingSphereGlobe.js`
- `src/features/globe/runtime/math/geoProjection.js`
- `components/ProductionGlobePage.tsx`
- `scripts/globe/build-land-coastlines.mjs`
- `scripts/globe/manual-border-overrides.json`
- `public/assets/globe/borders/hybrid/v1/manifest.json`

## Regression lessons

### 1. Never interpolate distant shoreline anchors with a Cartesian 3D lerp

A straight segment between two surface points cuts through the globe.

Coastline interpolation must remain surface-following / shoreline-following.

### 2. Do not solve visual regressions by regenerating the world first

First compare against the last known-good committed production state.

Check:

1. coordinate offsets,
2. runtime source mode,
3. manifest/asset identity,
4. selected/idle/hover geometry provider,
5. localStorage/dev calibration leakage,
6. only then generator output.

### 3. Border Surgery is an exception tool

Border Surgery should fix genuine local exceptions.

It should not become the mechanism required to repair half of the planet after a systemic regression.

### 4. Production and dev calibration must remain isolated

A dev alignment slider or persisted localStorage value must never silently change the normal production globe.

## Recovery procedure

If borders break again:

1. **Do not commit or deploy the broken state.**
2. Capture screenshots of:
   - North America,
   - Italy / Mediterranean,
   - central Europe,
   - Australia,
   - one island-heavy region.
3. Compare runtime/configuration files against `origin/main`.
4. Confirm the production constants:
   - pins 0°,
   - GeoJSON/vector borders 0°,
   - atlas +1.5°.
5. Check whether hybrid assets used by the affected countries differ from `origin/main`.
6. Check whether browser calibration/localStorage is leaking into normal production mode.
7. Restore known-good runtime/configuration behavior before regenerating country geometry.
8. Run the production build.
9. Visually verify coastlines from both above and below the globe.
10. Only then use Border Surgery for remaining localized defects.

## Visual smoke-test countries

Use these after any border-system change:

- USA / Canada / Mexico: shared political borders + long coastlines
- Italy: narrow peninsula and coastline transitions
- France / Germany / Benelux: dense shared political boundaries
- Turkey / Balkans: complicated neighbor topology
- Australia: strong reference for clean island-continent silhouette
- Indonesia or another island-heavy region: fragmented coastline handling

## Success criteria

A border-system change is not considered safe merely because tests or the build pass.

It is safe when:

- the production build passes,
- representative countries remain visually coherent,
- coastal borders stay attached to the physical rim,
- neighboring countries do not visibly overlap,
- no border dives through the globe,
- no production calibration controls are leaking into the normal route,
- and the globe still looks intentionally low-poly rather than GIS-noisy.

When in doubt, preserve the known-good production geometry and fall back rather than shipping a mathematically valid but visually ugly border.
