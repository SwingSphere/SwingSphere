# SwingSphere Venue & Event Model
## Hex Ring Modifier Logic (v1)

## Purpose
SwingSphere uses 3D pins to communicate what a location is and what is happening there without clutter. This document defines the logic for when a Hex Ring modifier appears around a Club pin.

## Definitions
### Club (Sexy Space)
A Club is a persistent, lifestyle-capable venue:
- Has a stable listing and location
- Exists independent of any specific event
- Represents a dedicated "sexy space" where events can be hosted

Pin: Cube

### Event
An Event is time-bound and may occur:
- At a Club (linked via `venueKey` / `clubId`)
- At a non-club location (hotel, home, mansion, nightclub, community center, rented space, etc.)

Pin: Plumbob  
(especially important for non-club locations)

### "Special Event at a Club" (Takeover / Third-party hosted)
A special event at a club is one where a third party (promoter/host/series) is effectively "taking over" or hosting at the club.

Visual: Hexagon Ring modifier around the Club cube

## Visual Meaning
Hex Ring = "This club is hosting a special third-party event in the current time window."

The ring does not mean:
- "This club has any events"
- "This club is open"
- "This club is popular"
- "There are multiple events"

It means specifically:
- A third-party hosted takeover/special event is happening at this persistent sexy space (within the active time filter).

## Inputs & Required Fields (v1)
### Club fields
- `clubKey` (or `venueKey` / `id`)
- `name`

### Event fields
- `venueKey` (links to club if hosted at a club)
- `title`
- `startAt`, `endAt` (or equivalent)
- Host identity fields (choose a supported method below)

## Determining Third-Party Hosted vs Club Hosted
Choose the strongest available method your data supports. In code, implement in this priority order.

### Method A (Best: explicit)
Event includes a host type or ownership identity:
- `event.hostType ∈ {"club","third_party"}`  
OR
- `event.hostOrgId != club.orgId`

Rule: third-party if `hostType == "third_party"` OR `hostOrgId != club.orgId`.

### Method B (Good: name-based heuristic)
Event includes `hostName` and club includes `name`.

Rule: third-party if `hostName` exists and is not "equivalent" to club name.

Equivalence guidelines:
- Case-insensitive compare
- Ignore punctuation and extra whitespace
- Allow a small alias list (e.g., "Twist" vs "Twist SF")

This should be treated as a fallback until explicit host typing exists.

### Method C (Fallback: promoter/series identity)
Event includes a `promoterId` or `seriesId`.

Rule: third-party if `promoterId` is present and differs from the club's own `orgId` / `ownerId`, or is not in an allowlist of "club-run series".

## Ring Display Decision Logic
A club pin gets the hex ring modifier if all conditions are true:
- The pin represents a Club
- There exists at least one event in the active time window such that:
  - `event.venueKey == club.clubKey`
  - That event is determined to be third-party hosted using Methods A/B/C

Notes:
- If multiple events match, show one ring only.
- The ring is a binary state indicator (active vs not).

## Time Window Rule
Ring evaluation should respect whatever the user is currently viewing (filters):
- Default window (e.g., "This weekend" / "Next 30 days")
- User-selected date range
- Any global "time lens" filters

Rule: only consider events that pass the current time filter.

## Display Priority (when multiple states exist)
- Club cube always renders
- Hex ring renders if ring logic is true
- Event plumbobs:
  - Render as their own pins for non-club locations
  - For club-linked events, plumbobs may render only if the UI supports it (optional); the ring is the primary signal for "special at club"
- Panels handle detail lists

## Pseudocode (reference)
```ts
function shouldShowHexRing(club, events, activeTimeWindow) {
  const clubEvents = events
    .filter(e => e.venueKey === club.clubKey)
    .filter(e => intersects(e, activeTimeWindow));

  for (const e of clubEvents) {
    if (isThirdPartyHosted(e, club)) return true;
  }
  return false;
}
```

## Edge Cases (v1 policy)
### Club's own theme nights / recurring nights
Should not trigger ring by default, or the ring becomes meaningless.

### Alternating promoters at same club
Ring should appear on weeks/dates where a third-party event is present in the active window.

### Unknown host type
If host identity cannot be determined:
- Default to no ring (avoid false positives)
- Consider adding a "confidence" flag later if needed

## Future Enhancements (non-blocking)
- Explicit host typing in data model (preferred)
- Club alias table for `hostName` equivalence
- Confidence scoring for heuristics
- Multiple modifier styles (only if required)
