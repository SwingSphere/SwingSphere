# Geo System Status

The former SwingSphere Geo Tools system was retired in July 2026.

Removed product concepts include:

- Admin Geo Tools and Boundary Builder
- generated country, state, county, city, district, and ZIP boundary trees
- Python-driven boundary generation
- repository GeoJSON drill-down navigation
- boundary-based event minimaps

Current geographic systems are:

- the simplified global landmask used by the Three.js globe
- country normalization used by discovery adapters
- MapLibre for flat-map exploration and venue arrival
- privacy-safe listing coordinates
- `MiniMapHybrid` for embedded entity maps
- provider building data and authored `BuildingAsset` geometry
- Building Inspector for spatial authoring

This file is retained only to prevent older references from being mistaken for an active system. New geographic work should be documented in `ARCHITECTURE.md`, `DATA_FLOW.md`, or the relevant globe/map feature document.
