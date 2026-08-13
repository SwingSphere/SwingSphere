# Globe Navigation and Regional Discovery

_Last updated: July 2026_

## Current direction

SwingSphere no longer uses a fixed GeoJSON drill-down hierarchy. Globe navigation is pin-first and dynamically framed around listings, clusters, and activity regions.

Current navigation behavior is based on:

- world-scale orientation
- country hover and selection support
- dynamic activity regions
- listing and cluster camera destinations
- explicit globe and map view controls
- shared explorer filters and selection

## Product principle

The globe is a premium discovery surface, not a GIS hierarchy. Users should not need to navigate through country, state, county, and city boundary levels before reaching relevant listings.

## Regional behavior

Regions are derived from available discovery content and clustering logic rather than repository boundary files. Camera framing should fit the actual relevant listings and avoid hard-coded geographic centers that place the user over empty water or oversized administrative areas.

## Transition to the flat map

MapLibre handles city-scale context, roads, detailed arrival, and buildings. Transitions should be deliberate and predictable rather than automatically triggered too early by zoom alone.

## Retired implementation

The former `public/geo/country/**` region files, lower-48/Alaska/Hawaii drill states, and multilevel geographic state machine were retired. They are not active dependencies and should not be restored without a new product review.
