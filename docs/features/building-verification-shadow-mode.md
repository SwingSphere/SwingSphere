# Building verification shadow mode

Building verification remains in **shadow mode**. The decision engine can identify definitive matches, but the persistence planner returns no write while shadow mode is active. Existing manually authored assets are never replaced automatically, and private or intentionally approximate listings are always skipped.

## Decision flow

1. Resolve the physical Venue, canonical address, coordinate, visibility, and any inherited Venue asset.
2. Convert provider Polygon/MultiPolygon features into independent footprint candidates. Provider feature IDs are retained only as provenance.
3. Normalize and deduplicate footprints using a topology-aware, rotation/direction-invariant fingerprint.
4. Rank candidates using independent address, exact pin-intersection, minimum pin-to-footprint distance, location-quality, and provenance evidence. Centroid distance is secondary diagnostics only.
5. Compare the best candidate with the runner-up and emit a named outcome.
6. Create a persistence plan. In shadow mode, qualifying matches are reported but never saved.

## Definitive acceptance policy

The thresholds live in `BUILDING_AUTO_ACCEPT_POLICY`; they are not scattered through UI components.

An exact-address match requires all of:

- normalized house-number/range agreement;
- street similarity of at least `0.78`;
- at least two locality agreements among city, postal code, and country;
- pin intersection or no more than `6m` from the footprint;
- candidate score of at least `82`;
- at least an `18` point lead over the runner-up;
- no contradictory house-number or street evidence.

An authoritative-coordinate match may compensate for incomplete provider address tags, but requires all of:

- manual, official-site, official embedded-map, licensing/government, Google business/maps, or user-verified provenance;
- location confidence of at least `0.97`;
- coordinate inside the footprint (`0m` footprint distance, with a `1.5m` numeric tolerance);
- candidate score of at least `76`;
- at least a `24` point lead over the runner-up;
- no contradictory address evidence.

Nearest-footprint distance by itself never qualifies. A close runner-up, conflicting house number, stale pin, invalid geometry, or missing provider data creates a human queue item.

## Failure and exception states

- Automatic verification candidate
- Probable — quick review
- Address mismatch
- Pin / location review
- Ambiguous buildings
- No usable provider footprint
- Needs provider evaluation
- Private / approximate — skipped
- Has verified / shared asset

“Needs provider evaluation” is intentionally separate from “No usable provider footprint.” Absence of a saved asset is not evidence that the provider has no building data.

## Geometry safeguards

Geometry validation reports empty, malformed, unsupported, non-finite, out-of-range, too-short, and pathological inputs without terminating rendering. Workspace extraction is linear in provider polygons, deduplicates with a map, caps only the number of accepted footprints, and reports truncation explicitly. Different individual polygons remain separate even when they share a provider feature ID.

A pin inside a valid Polygon or MultiPolygon always has `0m` footprint distance. Large or irregular buildings are not flagged because their centroid is far away. Event records inheriting a physical Venue asset use the canonical owner/Venue coordinate instead of a stale event mirror.

## Reverse geocoding

The Inspector now calls the same-origin admin endpoint `/api/admin/building-address/reverse`. The development implementation caches by footprint fingerprint (or a five-decimal coordinate fallback), throttles Nominatim, retries transient `429`/`5xx`/timeout failures with backoff, and keeps `no_address` distinct from `provider_error`. It rejects private or approximate listing IDs before sending coordinates upstream. The provider adapter remains replaceable.

The development cache is stored under `.codex-temp` so cache writes do not trigger Vite reloads. Production should move the same contract to a durable server cache with authentication, observability, provider terms/rate-limit enforcement, and an appropriate retention policy.

## Reproducible evidence and review

Shadow evaluations are written to `data/building-verification-evidence.local.json`, never to the building asset or canonical location record. Each record includes the normalized address, canonical coordinate and provenance, provider snapshot/status, selected fingerprint and provider IDs, reverse address/components, exact geometry relationship, score, runner-up, margin, and acceptance/rejection reasons. Raw neighborhood geometry is not duplicated.

The Inspector exposes explicit review choices: accept the recommendation for selection, keep the existing building, move the pin, or mark the location for research. Accepting a recommendation does not silently write geometry; **Save Building** remains the explicit canonical asset write.

The first completed eight-listing live cohort produced zero definitive candidates. Automatic persistence therefore remains disabled.

## Enabling persistence

Do not enable automatic persistence until the shadow cohort has been reviewed across multiple providers and countries, false positives are acceptably close to zero, address resolution is cached server-side, provider outages have retry/backoff behavior, and newly added public-exact venues produce reproducible evidence. Enabling writes must still preserve manual assets, inherit physical Venue assets for events, retain provider provenance, and never move pins as a side effect.
