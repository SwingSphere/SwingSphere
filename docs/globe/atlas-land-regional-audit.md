# Atlas-Land Regional Audit

## Scope

This Phase One audit compares the 4096 x 2048 country ID and visual atlas textures against the stylized `land.glb` model used by the Language Explorer globe lab.

Source assets:

- `public/assets/globe/models/land.glb`
- `public/assets/globe/textures/countryIdTexture.png`
- `public/assets/globe/textures/visualCountryAtlas_v3.png`
- `public/assets/globe/data/countryLookup.json`

Phase One outputs:

- `public/assets/globe/textures/countryIdTexture_v4.png`
- `public/assets/globe/textures/visualCountryAtlas_v4.png`
- `scripts/globe/build-country-atlas-v4.py`

The land model contains one mesh (`earth_converted`) with 9,358 position vertices and 10,608 indexed elements. It is intentionally much simpler than the geographic atlas.

## Root cause

The v3 visual-atlas edges line up with the projected `land.glb` triangle edges at a canonical atlas longitude offset of 0 degrees. The lab was starting at -10 degrees (or restoring that value from its original saved-alignment key). That shifted sampling across mesh facets and created most of the apparent Alaska/Russia bleed, mainland border spill, Russia clipping, and Australia-tip omission.

Phase One changes the lab-only default to 0 degrees and advances the saved-alignment key so stale -10 degree lab settings are not silently restored. Production runtime alignment and production atlas defaults were not changed.

After correcting the lab alignment, a smaller set of real mask omissions and cross-country pixels remained. Those are repaired in v4 with bounded, deterministic ID-to-visual restoration. There is no global dilation, blur, resampling, or transform.

## v4 repair method

`build-country-atlas-v4.py` performs the following operations:

1. Verifies the SHA-256 hashes of the v3 ID atlas, v3 visual atlas, and country lookup.
2. Copies `countryIdTexture.png` byte-for-byte to `countryIdTexture_v4.png`. The geographic hit atlas was already correct, so changing it would reduce hit-test accuracy.
3. Starts `visualCountryAtlas_v4.png` as an RGBA copy of v3.
4. Inside four narrow audit bounds, restores only valid USA, Canada, Russia, or Australia pixels from the ID atlas when the v3 visual pixel is background or the paired country in that region.
5. Preserves all alpha values and validates that every RGB identity is either background or an existing `countryLookup.json` color.

The script requires Pillow but no GIS package. Run it with:

```powershell
python scripts/globe/build-country-atlas-v4.py
python scripts/globe/build-country-atlas-v4.py --check
```

## Exact regional corrections

Pixel bounds below are half-open (`x0, y0, x1, y1`) in the 4096 x 2048 equirectangular atlas.

| Region | Longitude / latitude bounds | Atlas bounds | Correction | Changed visual pixels |
| --- | --- | --- | --- | ---: |
| Alaska / Bering seam | -180..-150, 50..72 | `[0, 204, 342, 456]` | Restored USA and Russia source coverage at the left texture edge and corrected 14 direct USA/Russia identity conflicts. | 9,087 |
| Russia Far East | 145..180, 45..80 | `[3697, 113, 4096, 512]` | Restored missing Russian source coverage through Chukotka, the far-eastern coast, and the right texture edge. | 6,369 |
| Mainland U.S. / Canada | -125..-60, 40..58 | `[625, 364, 1366, 569]` | Replaced 504 USA-over-Canada pixels and 4,644 Canada-over-USA pixels, then restored background gaps for both countries. | 13,383 |
| Australia northeast | 135..154, -27..-8 | `[3584, 1115, 3801, 1332]` | Restored the missing northeast/Cape York source coverage without touching Papua New Guinea. | 1,093 |

Total changed pixels in the visual atlas: **29,932**. ID-atlas pixel changes: **0**.

By restored target identity: USA 15,577; Russia 8,129; Canada 5,133; Australia 1,093.

### Fragment decisions

- Alaska, supported Aleutian fragments, and the Russian seam fragments were retained. No existing v3 fragment was globally eroded or deleted.
- The 14 direct USA/Russia conflicts were reassigned from the existing lookup colors. Ambiguous ocean-only pixels retain the established low-poly facet assignment.
- Russia is repaired on both horizontal texture edges so the atlas remains continuous across +/-180 degrees.
- The mainland U.S./Canada repair is limited to the audited boundary band. Alaska/Canada and unrelated continental borders are not broadly rewritten.
- Australia's northeast tip is restored from the ID atlas. No Australia-to-Papua New Guinea conflict existed at canonical alignment, so no PNG pixels were removed or reassigned.
- Tasmania remains assigned to Australia and is unchanged.
- Hawaii, Japan, Indonesia, the Philippines, and New Zealand are unchanged.

## Programmatic verification

- Both v4 files are 4096 x 2048.
- `countryIdTexture_v4.png` is RGB and byte-identical to `countryIdTexture.png`.
- `visualCountryAtlas_v4.png` is RGBA and retains opaque alpha behavior.
- ID atlas: 178 RGB values; visual v3 and v4: 135 RGB values.
- Unknown or interpolated RGB values: 0.
- Alpha values in the v4 visual atlas: 255 only.
- The first and last eight visual-atlas columns contain 883 and 899 Russia pixels respectively (and zero USA pixels), confirming that Russia remains present on both sides of the seam without wrapping Alaska onto the opposite edge.
- v3 SHA-256 hashes remain:
  - ID atlas: `efb41c81ab9d72419ba0b54968f1bf9becff4be1325b42e8605978fdceb32300`
  - visual atlas: `bd18fbd90dd2da8d2792afc69fe75235622cc0e4a3c0348b7bfa43b0a1f9e5f7`
- v4 SHA-256 hashes:
  - ID atlas: `efb41c81ab9d72419ba0b54968f1bf9becff4be1325b42e8605978fdceb32300`
  - visual atlas: `910b186b904af4324962e15d9f6a31f1ad80165987dea022bcce5de98335a05e`
- `npm run build` passes.

## Lab comparison and visual verification

The lab help panel now includes a lab-only **Atlas version** selector. `Current v3` and `Corrected v4` remount the runtime with their paired hit and visual textures. The default remains v3. Existing regional presets continue to work, and `U.S. / Canada mainland` was added.

Browser verification was performed at 0 degree atlas alignment with GeoJSON disabled and the full-bright diagnostic enabled:

- United States / Alaska: Alaska remains selected and complete across the visible low-poly land; the Russian side is not selected.
- Russia Far East: Russia remains continuous through the upper/far-eastern coast and seam without selecting Alaska.
- Mainland U.S. / Canada: the obvious cross-country band is removed in the corrected texture while the low-poly silhouette remains stable.
- Australia / Tasmania: the northeast tip is restored; Tasmania remains Australian; no Papua New Guinea identity was introduced.
- The preset selection labels reported USA, Russia, USA, and Australia respectively. Pointer hover over Australia also reported Australia after the v4 remount.
- The atlas switch preserved the selected country and layer settings through a runtime remount. No new runtime error was logged during v3/v4 switching.

## Remaining limitations and readiness

`land.glb` cannot represent every island or detailed political boundary. Very small Aleutian, Arctic, and coastal fragments may still be absent when the model has no supporting triangle, and coarse shared facets can only approximate borders. Small coast notches visible in Russia are land-model silhouette gaps rather than unknown atlas colors.

v4 is ready for visual review in the lab. It is **not** approved as the production default in this phase; `GlobeRuntimeConfig.js` continues to use `countryIdTexture.png` and `visualCountryAtlas_v3.png` until the corrected pair receives visual approval.

## v5 facet-aware rebuild (rejected visual direction)

v5 replaced the regional pixel-patching approach with a full reconstruction of the visual layer from the actual `land.glb` topology. The experiment proved that facet ownership could be made deterministic, but it changed the atlas into a visibly triangular mosaic and reinterpreted broad country shapes that were already coherent in v4. That visual direction was rejected. v5 remains available in the lab for comparison only; it is not a promotion candidate and the production default is still v3.

Outputs:

- `public/assets/globe/textures/visualCountryAtlas_v5.png` — primary 8192 x 4096 RGBA atlas
- `public/assets/globe/textures/visualCountryAtlas_v5_preview_4096.png` — nearest-neighbor 4096 x 2048 review copy
- `scripts/globe/build-visual-country-atlas-v5.py` — deterministic builder and checker

The builder projects each of the model's 3,536 triangles through the same spherical mapping used by the runtime shader. It unwraps triangles that cross the +/-180 degree seam, samples `countryIdTexture.png` inside each projected triangle, and gives the entire triangle the most frequent valid country identity. Subpixel extrusion/side facets inherit an ID-derived owner from facets sharing the same projected model vertices. The v3/v4 visual pixels do not participate in v5 ownership.

This intentionally trades geographic boundary detail for visual agreement with the low-poly mesh. The geographic ID atlas remains unchanged and authoritative for pointer hit-testing and selection identity.

Run with the bundled or any Pillow-enabled Python runtime:

```powershell
python scripts/globe/build-visual-country-atlas-v5.py
python scripts/globe/build-visual-country-atlas-v5.py --check
```

### v5 deterministic audit

- Source geometry: 9,358 positions and 3,536 indexed triangles.
- Direct ID-majority assignments: 3,001 facets.
- Shared-vertex, ID-derived assignments: 493 subpixel facets.
- Unassigned isolated/subpixel facets: 42. Together they cover an estimated 14,729.737 projected 8K pixels (about 0.044 percent of the atlas); the largest is about 3,323.904 pixels. These have no valid ID coverage and are left as background rather than borrowing an unauthoritative visual-atlas identity.
- Ambiguous direct assignments (runner-up at least 45 percent): 58; all resolve deterministically to the most frequent ID color.
- Output palette: 123 RGB values, all present in `countryLookup.json` or background; no interpolated colors.
- Alpha: opaque (`255`) throughout.
- First and last 16 output columns contain 2,526 and 2,623 Russia pixels respectively and zero USA pixels, preventing Alaska from wrapping onto Russia-facing seam facets.
- Primary v5 SHA-256: `f7eec70d6d3b751ceeddf73ae128dc13e7820b162783191360c62cf009a13778`
- Preview SHA-256: `7336348d720265d97e7716e66f55840006e2d30c754e7541e88125632d8fb622`

The 8K atlas is rendered directly from vector-like projected facets; it is not an upscale of v3 or v4. This doubles edge sampling resolution while preserving exact country RGB identities. The 4K preview is deliberately nearest-neighbor so it also contains only valid lookup colors.

### Lab review path

The Language Explorer globe lab exposes `Current v3`, `Corrected v4`, and `Experimental v5 mosaic (8K)` in its atlas selector. Switching versions remounts the runtime while preserving the current pose, selected country, and diagnostic layer state. v5 pairs the new visual atlas with the unchanged authoritative `countryIdTexture.png`.

The regional preset list covers Alaska/Aleutians, Russia Far East, mainland U.S./Canada, Australia/Tasmania, Indonesia/Papua, Japan, the Philippines, New Zealand, Greenland/Arctic, Madagascar, and Hawaii. Final approval should be based on the rendered globe—not the flat atlas alone—because coarse shared facets are an intentional part of the visual system.

Browser verification at canonical 0 degree atlas alignment, with GeoJSON disabled, confirmed:

- All 11 regional presets selected their intended country identity under v5: USA, USA, Russia, USA, Japan, Australia, Indonesia, Philippines, New Zealand, Greenland, and Madagascar respectively.
- Alaska and Russia remained separated on their opposing seam-facing facets.
- The mainland U.S./Canada view retained whole-facet separation without a geographic pixel band painted through the low-poly polygons.
- Australia's mainland and Tasmania were present in the visual-atlas diagnostic; Papua New Guinea retained its own facet color.
- Indonesia/Papua, Japan, the Philippines, and New Zealand rendered as coherent model-supported facets. Small-island fidelity remains bounded by `land.glb` topology.
- Switching v3 -> v4 -> v5 succeeded and returned to v5 without losing the lab controls. No new runtime error was logged; only the repository's existing React Router v7 future-flag warnings were present.

The highlight shader now derives its edge-sampling texel size from the active mask texture. v3/v4 retain their 4096 x 2048 sampling, while v5/v6 visual-mask edges correctly use 8192 x 4096 texels. ID-mask mode continues to use the authoritative ID atlas dimensions.

## v6 v4-preserving cleanup

v6 returns to `visualCountryAtlas_v4.png` as the visual source of truth. It does not inspect `land.glb`, assign facet centers, reconstruct country polygons, or globally repaint countries.

Outputs:

- `public/assets/globe/textures/visualCountryAtlas_v6.png` — primary 8192 x 4096 RGBA atlas
- `public/assets/globe/textures/visualCountryAtlas_v6_preview_4096.png` — exact-color 4096 x 2048 review copy
- `scripts/globe/build-visual-country-atlas-v6.py` — deterministic builder and checker

### v6 method

1. Verify the SHA-256 hashes of v4, the unchanged ID atlas, and the country lookup.
2. Double v4 to 8192 x 4096 with the exact-color Scale2x algorithm. Scale2x refines diagonal raster corners using only neighboring source identities; it never blends colors or invents RGB values.
3. Inside four fixed regional bounds only, replace a source country color when the authoritative ID atlas explicitly identifies the pixel as the paired target country.
4. Downsample the review copy with nearest-neighbor sampling so it also contains only valid lookup colors.
5. Compare the result with a plain 8K nearest-neighbor upscale of v4 and fail if more than one percent changes.

The script requires Pillow and NumPy. Run it with:

```powershell
python scripts/globe/build-visual-country-atlas-v6.py
python scripts/globe/build-visual-country-atlas-v6.py --check
```

### Exact v6 regional repairs

| Region | 8K atlas bounds | Pairwise repair | Changed pixels |
| --- | --- | --- | ---: |
| Alaska / Russia seam | `[0, 409, 342, 911]` and `[7850, 409, 8192, 911]` | Audited both seam edges together. Three Scale2x corner pixels were restored from Russia to valid U.S. Alaska coverage. No U.S. pixels remain in the first or last 16 columns. | 3 |
| Mainland U.S. / Canada | `[1251, 728, 2731, 1138]` | Corrected only direct USA/Canada crossovers in the boundary band: 137 USA -> Canada and 153 Canada -> USA. The broad v4 border was retained. | 290 |
| Australia / Papua New Guinea / Indonesia | `[6781, 1865, 7851, 3141]` | Reassigned 347 PNG pixels to Indonesia where the ID atlas proves the crossover. No Australia mainland or Tasmania pixels were removed. | 347 |
| Malaysia / Singapore / Indonesia | `[6257, 1706, 6941, 2322]` | Reassigned 1,271 bright-pink Malaysia pixels to Indonesia where the ID atlas proves they are stray fragments. The lookup has no separate Singapore identity, so Singapore remains represented by the surrounding low-detail grouping. | 1,271 |

### v6 comparison metric

Relative to an 8192 x 4096 nearest-neighbor upscale of v4:

- Scale2x edge cleanup changed 31,015 pixels.
- The final atlas changed 32,303 pixels total.
- 33,522,129 pixels are unchanged.
- Changed fraction: 0.096270442 percent.
- Unchanged fraction: 99.903729558 percent.
- v6 and its preview contain 135 RGB values, all present in `countryLookup.json` or background.
- Unknown or blended RGB values: 0.
- Alpha values: opaque (`255`) only.
- First and last 16 atlas columns contain 3,530 and 3,596 Russia pixels respectively and zero USA pixels.
- Primary v6 SHA-256: `787764d9e632c9533d460cdde200e99f73cfaa1c5f97ff6117d5067284a0fc77`
- Preview SHA-256: `1768be49bab3a9b17d8b16352eb1c4e5c069d4c1e251e56e7c39262e105a777b`

The sparse diff is confined to exact-color diagonal edge refinement plus the named regional repair bounds. Africa, Europe, the rest of Asia, and South America retain v4's shapes; no new triangle or mosaic geometry is introduced.

### v6 limitations and readiness

v6 deliberately does not attempt a full geographic redraw. Coarse island groupings and the simplifications already present in v4 remain. Small islands may still be merged or omitted, and the visual atlas remains presentation-only; `countryIdTexture.png` is still authoritative for hit detection.

The lab selector labels v5 as experimental and adds `Cleaned v6 (8K)`. Production continues to use `visualCountryAtlas_v3.png`.

### v6 rendered verification

The lab now freezes ambient land rotation so repeated regional presets produce stable comparison poses. Atlas-version remounts also restore the visual/ID/highlight debug toggles and diagnostic state, preventing the selector UI from claiming that a debug layer is active when the remounted runtime has not applied it.

Browser comparison used the actual visual-atlas debug layer at 0 degree alignment with GeoJSON disabled. Paired v4/v6 captures were taken at the same frozen pose for:

- Alaska / Aleutians — selected United States of America
- Russia Far East — selected Russia
- U.S. / Canada mainland — selected United States of America
- Australia / Tasmania — selected Australia
- Indonesia / Papua — selected Indonesia
- Malaysia / Singapore — selected Malaysia

At rendered scale, v6 retains v4's continental silhouettes, island grouping, and color layout. Alaska and Russia remain separated across the seam; the mainland U.S./Canada repair is visually local; Australia and Tasmania remain intact; the PNG/Indonesia crossover and bright-pink Southeast Asia residue are reduced without introducing triangular facets. No new v5-style mosaic artifacts were observed.

v6 is ready for visual review in the lab. It is not approved as the production default by this work.
