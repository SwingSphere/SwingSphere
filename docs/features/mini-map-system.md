# Mini Map System

_Last updated: July 2026_

## Active implementation

Embedded maps use `components/maps/MiniMapHybrid.tsx`.

Current consumers include club pages, event pages, sidebars, and administrative test surfaces. The component uses the current map style and optional Overpass road support. It does not require generated city, district, county, or ZIP boundary files.

## Responsibilities

- show the venue or privacy-safe event location
- provide lightweight geographic context on entity pages
- respect exact versus approximate location visibility
- avoid loading the full explorer runtime when a small embedded map is sufficient
- remain visually consistent with the MapLibre discovery experience

## Data inputs

The minimap should receive canonical venue or listing coordinates through the entity and compatibility layers. Private or approximate event locations must use the public-safe coordinate path rather than raw protected coordinates.

## Retired implementation

The previous boundary-based minimap concept and generated `public/geo/country/**` assets were retired. Do not reintroduce those files as minimap dependencies.

## Related systems

- `components/maps/FlatWorldMap.tsx`
- `components/maps/MiniMapHybrid.tsx`
- `components/maps/overpassRoads.ts`
- `lib/publicLocation.ts`
- `components/maps/venueArrival.ts`
- Building Inspector and `BuildingAsset` records
