# Event Dedupe and Canonical Identity

## 1) Feature Name
Canonical Identity Keys and Entity Index

## 2) Purpose
Create stable canonical keys/slugs for clubs/events/hosts and provide deterministic lookup maps for page routing and linking.

## 3) Where It Lives (files + folders)
- `lib/identityUtils.ts`
- `lib/entityIndex.ts`
- `lib/entityUtils.ts`
- `hooks/useEntityIndex.ts`
- `components/pages/ListingRedirectPage.tsx`

## 4) How It Works (technical flow)
- `identityUtils` normalizes identity strings and builds stable hashes (`clubKey`, `eventKey`, `hostSlug`).
- `buildEntityIndex` builds maps keyed by those hashes and relationships (events by venue key, events by host slug).
- Canonical URLs use `name--key` pattern (`getEventCanonicalPath`, `getClubCanonicalPath`).
- `/listing/:id` redirects to canonical URL when index resolves.

## 5) Data Dependencies
- Listing fields: club name + address + coords; event name + start time + venue key + host name.
- User list for host-profile inference.

## 6) UI Dependencies
- Event/club/host pages rely on canonical key lookup maps.
- Admin save flows navigate to canonical pages after create/update.

## 7) Known Edge Cases
- Hash collisions are possible (low probability) and not explicitly mitigated.
- `buildEntityIndex` keeps first item for duplicate keys (`if !map.has(key)`), so later duplicates are shadowed.

## 8) Future Expansion Hooks
- Add collision diagnostics and explicit duplicate reporting.
- Move from hash-only keys to durable backend IDs once real DB exists.

## 9) Risk Areas
- Key construction uses mutable content (name/time/location); edits can change canonical paths.
- Duplicate detection is implicit, not surfaced to moderators.


