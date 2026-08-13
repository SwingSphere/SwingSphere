# Event / Club / Host Page Architecture

## 1) Feature Name
Entity Detail Page Architecture

## 2) Purpose
Provide canonical event, club, and host detail pages with shared identity index lookup and modular section-based layout.

## 3) Where It Lives (files + folders)
- `components/pages/EventPage.tsx`
- `components/pages/ClubPage.tsx`
- `components/pages/HostPage.tsx`
- `components/pages/EventsIndexPage.tsx`
- `components/pages/ListingRedirectPage.tsx`
- Supporting layouts under `components/event/`, `components/club/`, `components/host/`, `components/entity/`

## 4) How It Works (technical flow)
- Route slug is parsed (`parsePrettyKeyParam`) into canonical key.
- `useEntityIndex` loads listings/users and builds index maps.
- Page resolves entity from key map and composes sections/cards.
- Event page derives venue/host paths and map/calendar/trust modules.
- Host page derives cadence/themes/external links from host-linked events.

## 5) Data Dependencies
- `lib/entityIndex.ts` output maps.
- Listing/event/user data from mock API layer.

## 6) UI Dependencies
- Shared entity blocks (`DescriptionSection`, `CommentsSection`, `TrustSection`).
- Map cards (`EventMapCard`, `ClubMapCard`) and hero modules.

## 7) Known Edge Cases
- Missing index or lookup key yields "not found" view.
- Mock event route path exists (`dev-mock-event`) for template testing.

## 8) Future Expansion Hooks
- Add server-backed entity fetching while preserving canonical paths.
- Introduce SSR/loader routes for direct detail-page hydration.

## 9) Risk Areas
- Current fetch-on-mount index approach can be slow on large datasets.
- URL keys can drift when naming/time fields change.


