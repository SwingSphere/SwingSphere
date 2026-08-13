# Geographic Drill-Down Status

The repository-based GeoJSON drill-down system was retired in July 2026.

SwingSphere no longer navigates through a fixed hierarchy of country, state, county, city, district, or ZIP boundary files. The product direction favors pin-first discovery, dynamic clusters, activity regions, explicit globe/map controls, and MapLibre arrival behavior.

Current orientation and navigation are provided by:

- globe country hover and visual orientation
- dynamic activity regions and listing clusters
- city and listing camera framing
- manual globe/map view selection
- shared explorer search and filters

The removed `public/geo/country/**` hierarchy is not an active runtime dependency. Any future geographic hierarchy should begin with a new product and performance review rather than restoring this implementation.
