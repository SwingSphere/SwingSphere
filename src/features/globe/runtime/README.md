# SwingSphere Globe Runtime

Production extraction module for the locked SwingSphere Globe V1 prototype.

## Public API

```js
import { mount } from "./index.js";

const globe = mount(container, {
  events,
  onReady() {},
  onError(error) {},
  onCountryHover(country) {},
  onCountrySelect(country) {},
  onEventHover(event) {},
  onEventSelect(event) {}
});

globe.updateEvents(events);
globe.selectEvent(eventId);
globe.selectCountry(countryIdOrIso);
globe.clearSelection();
globe.resize();
globe.dispose();
```

`dispose()` is idempotent. Public methods are guarded before ready and after disposal.

## Runtime Assets

Production runtime assets:

- `land.glb`
- `ocean.glb`
- `countryIdTexture.png`
- `visualCountryAtlas_v3.png`
- `countryLookup.json`

Prototype-only assets remain outside the production dependency path:

- Natural Earth source data
- generation scripts
- preview textures
- lab-only `visualCountryAtlas_v4.png`, experimental `visualCountryAtlas_v5.png`, and cleaned `visualCountryAtlas_v6.png` candidates
- comparison screenshots
- marker comparison pages
- signal marker prototypes

## Notes

- Three.js is imported as a package dependency. No CDN/import-map dependency is used by the production modules.
- `countryIdTexture.png` and `visualCountryAtlas_v3.png` are 4096x2048 atlas-class textures. Each uploads to roughly 32 MB RGBA GPU memory.
- The current V1 marker path is mesh-based radial signal pins from the visible prototype behavior.
- Marker count should remain modest for V1. High-density event maps should move to shared materials/geometries, instancing, sprites, or GPU points.
