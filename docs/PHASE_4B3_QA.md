# Phase 4B-3 QA Guardrails

SwingSphere does not currently have a configured unit test runner. `package.json` only exposes `dev`, `build`, and `preview`, so this pass uses source-level review plus manual QA guardrails instead of adding a new test dependency.

## Public Access Display

- Cards, sidebars, detail pages, and event pages should use `ListingAccessSummary` or helpers from `lib/accessDisplay.ts`.
- Attendance labels should resolve through `ATTENDANCE_POLICY_OPTIONS` in `lib/listingTaxonomy.ts`.
- Entry requirement labels should resolve through `ENTRY_REQUIREMENT_OPTIONS`.
- Empty entry requirements should render as "None listed" or no primary badge, depending on the component variant.
- Legacy attendance values such as `open_to_approved_guests`, `all_genders_welcome`, `members_only`, `invite_only`, `application_required`, and `varies_by_event` should not leak raw underscored labels into public UI.

## Public Location Privacy

- `exact_public` clubs and all events should continue to expose their normal public listing location.
- `approximate_public` clubs should display a ZIP/city/region area label from `getPublicLocationLabel`.
- `approximate_public` clubs should not render exact map pins or selected building outlines.
- Approximate clubs should render only through `approximateListingsToGeoJson` as soft radius polygons.
- The approximate center should be rounded by `getApproximateLocationCenter`, currently to two decimal places.
- Approximate radius should remain centralized in `getApproximateRadiusMeters`.

## Map GeoJSON Contracts

- `listingsToGeoJson` must exclude listings where `isApproximateLocation(listing)` is true.
- `approximateListingsToGeoJson` must include only approximate listings with usable physical coordinates.
- All MapLibre point coordinates must remain `[longitude, latitude]`.
- Approximate polygon rings must also use `[longitude, latitude]`.
- Pin subtitle labels should continue to use physical city labels, not raw authored address strings.

## Entity Compatibility

- `getListingPhysicalGeopoint` should prefer real venue coordinates when a listing has an explicit venue.
- Synthetic fallback venues with ids like `venue-${listing.id}` should not override the listing's authored `geopoint`.
- This protects authored building geometry from stale fallback venue coordinates.

## Taxonomy Integrity

- Public submission and admin editing should use `lib/listingTaxonomy.ts` as the shared source for access, vibe, amenity, and inclusion options.
- Legacy tag aliases should remain selectable and display using canonical labels.
- Unknown saved tag values should be preserved and shown in the admin editor instead of being dropped.
- Public UI should avoid raw legacy strings when a canonical taxonomy label exists.

## Manual QA Checklist

1. Open the 2D map with Twist SF, The Power Exchange, and Connect Dance Love available.
2. Select each exact-location listing and confirm the visible pin aligns with the selected/authored building footprint.
3. Confirm exact-location listings still show an exact pin and selected building state.
4. Change or inspect an approximate club and confirm no exact pin or selected building appears.
5. Confirm the approximate club renders a soft radius area and uses ZIP/city/region area copy.
6. Open a result card, sidebar, club detail page, and event page and confirm audience/access copy is human-readable.
7. In public submission, toggle taxonomy values and confirm selected state persists with canonical labels.
8. In admin edit, confirm legacy saved tags display under "Saved Legacy Tags" and can be removed without losing canonical options.
9. Run `npm run build` before shipping this phase.
