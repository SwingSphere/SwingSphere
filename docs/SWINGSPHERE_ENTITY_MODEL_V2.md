# SwingSphere Entity Model v2

Status: Draft architecture source of truth  
Audience: product, engineering, Codex, future contributors  
Purpose: define the next-generation entity model for SwingSphere before the venue / club / host / event refactor.

---

## 1. Why Entity Model v2 Exists

SwingSphere has evolved from a visual map prototype into a discovery platform for lifestyle clubs, events, venues, promoters, and communities. The original data model was intentionally simple: listings were either clubs or events. That worked for early map discovery, but the product now needs to represent real-world relationships more accurately.

The current model strains when handling examples like:

- a club that permanently operates at a physical location
- a promoter that hosts events at many different venues
- a community space used by many unrelated organizers
- a hotel ballroom used for occasional lifestyle events
- a private house party with location privacy
- a venue that may later have building geometry, floor plans, or virtual walkthroughs

Entity Model v2 introduces a cleaner separation between physical places, public-facing organizations, promoters, and event occurrences.

The goal is not to make the product feel more complex to users. The goal is to keep user-facing language simple while giving the backend a stable structure that can scale.

---

## 2. Core Design Principles

### 2.1 Public language should stay human

Users understand terms like:

- Club
- Event
- Venue
- Host
- Promoter

The interface should continue using these public-facing terms. Do not expose sterile backend language like `Organization` unless there is a very specific reason.

### 2.2 Backend entities should model the real world

The backend should reflect what things actually are:

- a venue is a physical place
- an organization is a public identity or operating group
- a host/promoter is an organization role or presentation mode
- an event is a specific occurrence
- a building asset belongs to a venue

### 2.3 Venues are containers, not owners

A venue is the brick-and-mortar container where things happen. Clubs, promoters, and events can occupy or use a venue, but the venue should exist independently from any one club or event.

### 2.4 Relationships should be explicit

Avoid assuming one club equals one venue or one venue equals one club. The model should allow:

- one organization using one venue
- one organization using many venues
- many organizations using one venue
- events at known venues
- events at private or temporary venues
- former, resident, recurring, and guest relationships

### 2.5 Building and spatial data belong to venues

Building footprints, 3D geometry, entrances, interior spaces, future walkthroughs, and floor plans describe a physical place. These should belong to Venue, not Club, Host, Promoter, or Event.

### 2.6 Preserve history

Venues, organizations, and events should not disappear just because they close, move, end, or become inactive. Historical relationships and past events should remain meaningful.

---

## 3. Public Concepts vs Internal Concepts

| Public Concept | Internal Concept | Notes |
| --- | --- | --- |
| Club | Organization with club presentation | Users commonly describe Power Exchange, Twist SF, and Club Joy as clubs. Keep this language in discovery and public pages. |
| Host / Promoter | Organization with host/promoter presentation | Bronze Party, Illuminaughty, and similar groups may host at many venues. |
| Venue | Venue | A physical place: club building, hotel ballroom, community center, private house, warehouse, studio, etc. |
| Event | Event | A specific scheduled occurrence at a venue, usually organized by an organization. |

Important: `Organization` is a backend abstraction. It should not replace the public label `Club` where users expect to see club language.

---

## 4. Core Entities

## 4.1 Venue

A Venue is a physical place where clubs and events happen.

A venue may be:

- a dedicated lifestyle club facility
- a hotel ballroom
- a community center
- a warehouse
- a dance studio
- a private residence
- a rented event space
- a convention center
- a retreat property
- a temporary location

A venue exists even if there are no upcoming events.

### Venue owns

- name
- address
- normalized address
- latitude / longitude
- privacy-safe display coordinates
- location visibility
- parking information
- accessibility information
- venue amenities
- exterior photos
- interior photos when appropriate
- building asset ID
- building geometry
- future floor plan data
- future virtual walkthrough data
- future interior spaces / rooms
- venue status

### Venue does not own

- club membership policies unless they are venue-wide house rules
- event date/time
- tickets or RSVP links
- promoter identity
- organization branding, unless the venue and organization intentionally share media
- event-specific dress codes
- event-specific attendance policies

### Venue status examples

- `draft`
- `pending_review`
- `active`
- `private`
- `inactive`
- `closed`
- `archived`

### Venue visibility examples

- `public_exact` — public address and exact map pin may be shown
- `public_approximate` — city/region and approximate map pin may be shown
- `private` — exact location hidden from public users
- `admin_only` — location exists only for moderation/admin workflows

---

## 4.2 Organization

An Organization is a public identity that creates, operates, hosts, or presents experiences.

Publicly, organizations may appear as:

- clubs
- hosts
- promoters
- event producers
- community groups
- recurring event brands

Examples:

- Twist SF as a club/operator
- The Power Exchange as a club/operator
- Bronze Party as a promoter
- Illuminaughty as a traveling promoter
- Connect Dance Love as a recurring event/community brand

### Organization owns

- name
- slug
- public display type
- description
- logo
- hero image when identity-specific
- gallery images when identity-specific
- website
- contact email
- social links
- owner/admin users
- public profile content
- membership model if applicable
- organization-level house rules
- organization-level audience expectations
- trust/moderation status

### Organization does not own

- physical building geometry
- venue address
- venue parking
- venue accessibility
- event date/time
- event ticket link unless it is an organization-wide ticketing page

### Organization public display types

A single backend Organization may be presented publicly as one or more of:

- `club`
- `host`
- `promoter`
- `community`
- `producer`

For MVP, the most important public labels are Club and Host/Promoter.

---

## 4.3 Club

Club is primarily a public-facing product category, not necessarily a separate backend entity.

Users expect to search for and browse clubs. Therefore the frontend should continue to use `Club` for organizations that operate like clubs.

Internally, a club is best represented as:

```text
Organization
  publicDisplayType: club
```

A club may have:

- one permanent venue
- multiple venues
- a historical venue
- recurring events
- a weekly schedule
- membership requirements
- house rules
- amenities inherited from its primary venue

Important: do not force every Club to own its physical location directly. It should relate to Venue through an explicit relationship.

---

## 4.4 Host / Promoter

Host and Promoter are public-facing labels for organizations that create events, often without owning or permanently operating a venue.

Examples:

- Bronze Party
- Illuminaughty
- traveling play-party producers
- local recurring party hosts
- community event organizers

Internally:

```text
Organization
  publicDisplayType: host | promoter
```

A host/promoter may:

- host events at many venues
- use private residences
- use temporary venues
- have recurring series
- have no permanent venue
- have strong brand identity independent of venue

Host/Promoter does not own venue building data.

---

## 4.5 Event

An Event is a specific scheduled occurrence.

An event happens at one venue, even if that venue is private, temporary, or approximate.

An event is usually organized by one primary organization, but the model should eventually allow co-hosts.

### Event owns

- name
- description
- start time
- end time
- timezone
- venue ID
- organizer / host organization ID
- co-host organization IDs, future
- ticket link
- RSVP link
- event-specific contact email
- event-specific images
- event-specific tags
- event-specific admission policies
- event-specific dress code
- event-specific privacy rules
- moderation status

### Event does not own

- venue building geometry
- venue parking
- venue accessibility
- permanent organization branding
- venue-wide amenities unless copied as a snapshot for historical display

---

## 4.6 Future Entity: Event Series

Event Series is not required for the first migration, but the model should avoid blocking it.

An Event Series represents a recurring concept or branded program. Each scheduled date is still an Event.

Examples:

- Connect Dance Love
- Illuminaughty Prism
- Bronze monthly party
- a recurring workshop night

Potential future structure:

```text
Organization
  -> EventSeries
      -> Event occurrence
      -> Event occurrence
      -> Event occurrence
```

Do not implement Event Series unless needed, but avoid designing Event in a way that makes this difficult later.

---

## 4.7 Future Entity: Venue Space

Venue Space is not required for MVP, but it is important for virtual walkthroughs and indoor navigation.

A Venue may eventually contain spaces such as:

- main hall
- lounge
- bar
- dance floor
- dungeon
- upstairs loft
- patio
- play room
- locker room
- entrance
- bathroom
- parking area

Potential future structure:

```text
Venue
  -> VenueSpace
  -> VenueSpace
  -> VenueSpace
```

Venue Spaces may later connect to floor plans, indoor navigation, walkthroughs, and event-specific activity zones.

---

## 5. Relationship Model

## 5.1 OrganizationVenueRelationship

This is the key relationship that prevents the model from confusing clubs, promoters, and venues.

Conceptually:

```text
Organization
  -> OrganizationVenueRelationship
      -> Venue
```

This relationship describes how an organization uses or occupies a venue.

### Relationship type examples

- `owner_operator`
- `primary_home`
- `resident`
- `recurring_guest`
- `monthly_guest`
- `annual_guest`
- `one_time_guest`
- `former_home`
- `historical`
- `unknown`

These do not all need to be user-facing. They are primarily structural/admin metadata.

### Relationship owns

- organization ID
- venue ID
- relationship type
- display label
- start date
- end date
- active/inactive status
- confidence score
- admin notes

### Examples

Twist SF:

```text
Organization: Twist SF
Venue: Twist SF
Relationship: owner_operator / primary_home
```

Bronze Party at Twist:

```text
Organization: Bronze Party
Venue: Twist SF
Relationship: recurring_guest or monthly_guest
```

Connect Dance Love at East Bay Community Space:

```text
Organization: Connect Dance Love
Venue: East Bay Community Space
Relationship: recurring_guest
```

Illuminaughty:

```text
Organization: Illuminaughty
Venue: Multiple venues
Relationship: event-by-event or recurring_guest depending on history
```

---

## 5.2 EventVenueRelationship

For MVP, Event can have a direct `venueId` field. A separate relationship table is not necessary unless future requirements demand multi-venue events.

Recommended MVP:

```text
Event.venueId -> Venue.id
```

Future possible structure:

```text
Event
  -> EventVenueRelationship
      -> Venue
```

This would support festivals, multi-room conventions across multiple buildings, or multi-location event series.

---

## 5.3 EventOrganizationRelationship

For MVP, Event can have a direct primary host/organizer field.

Recommended MVP:

```text
Event.organizerOrganizationId -> Organization.id
```

Future co-host support:

```text
Event
  -> EventOrganizationRelationship
      -> Organization
```

Potential relationship roles:

- primary host
- co-host
- promoter
- venue operator
- sponsor
- instructor
- DJ / performer

---

## 6. Field Ownership Matrix

| Field / Concept | Owner | Notes |
| --- | --- | --- |
| Name | Depends | Venue name, organization name, and event name are separate. They may coincidentally match. |
| Address | Venue | Physical address belongs to the place. |
| Coordinates | Venue | Events inherit display coordinates from venue unless overridden for privacy. |
| Privacy-safe map point | Venue/Event display layer | Private events may use approximate display coordinates. |
| Building asset | Venue | Building geometry belongs to the physical place. |
| Building height | Venue / BuildingAsset | Spatial rendering property. |
| Building min height | Venue / BuildingAsset | Spatial rendering property. |
| Parking | Venue | Physical-place attribute. |
| Accessibility | Venue | Physical-place attribute. |
| Bathrooms / lockers / showers | Venue | Venue amenities. |
| Bar / dance floor / pool / patio | Venue | Venue amenities or future VenueSpace records. |
| House rules | Organization or Venue | If rules are operator-specific, Organization. If building-wide, Venue. |
| Membership | Organization | Membership belongs to the club/operator. |
| Weekly club schedule | Organization | A club operating schedule is organization-level. |
| Event start/end time | Event | Event occurrence only. |
| Event recurrence | Event Series, future | MVP can keep recurrence text on Event if needed. |
| Ticket link | Event | Event-specific unless using a global org ticketing page. |
| RSVP link | Event | Event-specific. |
| Event dress code | Event | May inherit from org, but event owns final display. |
| Attendance policy | Event | Couples-only, single-men-welcome, women-focused, RSVP-required, etc. are policies, not amenities. |
| Organization logo | Organization | Public identity. |
| Venue exterior image | Venue | Physical place image. |
| Event hero image | Event | Event-specific marketing. |
| Host/promoter profile | Organization | Display mode can be Host/Promoter. |
| Reviews | Depends | Venue reviews, organization reviews, and event notes should be separate long term. |
| Community notes | Depends | Should attach to the entity being discussed. |
| Moderation status | Each entity | Venue, Organization, and Event each need independent moderation states. |

---

## 7. Taxonomy Notes

The current tag system should eventually distinguish between different tag families. Do not treat all tags as interchangeable.

Recommended future taxonomy groups:

### Venue amenities

Physical features of a place:

- parking
- lockers
- showers
- pool / hot tub
- bar
- dance floor
- outdoor space
- dungeon / kink room
- wheelchair access

### Event themes

What an event is about:

- dance
- social
- play party
- BDSM / kink
- educational
- mixer
- retreat
- hotel takeover

### Admission / attendance policies

Who may attend or what approval is required:

- RSVP required
- members only
- invite only
- couples-focused
- single men welcome
- single women welcome
- women-centered
- men-centered
- LGBTQ+ focused
- newcomer friendly

Note: Terms like `couples only`, `female-focused`, and `male-focused` should be revisited carefully before launch. They are policy/audience descriptors, not venue amenities.

### Dress / conduct expectations

- dress code
- costume encouraged
- consent briefing required
- orientation required
- no phones
- alcohol policy

Do not resolve the full taxonomy during the Entity Model v2 migration. The important part is to avoid placing policy tags on Venue amenities by accident.

---

## 8. Public URLs and Pages

Recommended public URL structure:

```text
/clubs/:slug
/hosts/:slug
/events/:slug
/venues/:slug
```

### Club pages

A Club page presents an organization as a club.

It should answer:

- Who is this club?
- What is the vibe?
- What do they host regularly?
- Where do they usually operate?
- What should a visitor expect?

### Host / Promoter pages

A Host/Promoter page presents an organization as a producer or community organizer.

It should answer:

- Who organizes these events?
- What kind of events do they produce?
- Where do they host?
- What upcoming events are attached to them?

### Event pages

An Event page presents one scheduled occurrence.

It should answer:

- What is happening?
- When is it happening?
- Who is hosting it?
- Where is it happening?
- How do I attend?

### Venue pages

Venue pages may be minimally exposed at first but should be wired structurally.

Eventually, a Venue page may host:

- venue details
- building information
- amenities
- parking
- accessibility
- virtual walkthrough
- floor plan
- interior spaces
- upcoming events
- resident clubs
- visiting promoters

Even if public venue pages are not heavily promoted at launch, the route and entity should exist so future venue content has a natural home.

---

## 9. Map and Spatial Model

## 9.1 Map pins

The map can display different pin types depending on filters and context:

- Venue pins
- Event pins
- Club/organization pins via their primary venue

For MVP, existing listing pin behavior can remain, but underlying coordinate ownership should move toward Venue.

## 9.2 Private locations

Private events should not expose exact coordinates publicly.

Recommended behavior:

- exact venue coordinates available to admin only
- public display uses approximate point
- sidebar says `Private location` or `Disclosed after RSVP`
- external map links should not leak exact coordinates for private events

Existing privacy-safe coordinate behavior should be preserved and eventually moved into a venue/event display policy layer.

## 9.3 Building assets

Building assets belong to venues.

Current conceptual migration:

```text
Before:
BuildingAsset.listingId -> Club/Event listing

After:
BuildingAsset.venueId -> Venue
```

During migration, support compatibility fields as needed.

## 9.4 Building Inspector

The Building Inspector should be understood as a Venue Spatial Data tool.

Its mission:

> Capture, validate, and save spatial geometry for a physical venue.

It should not be tied to a club or promoter long-term.

Recommended future workflow:

```text
Admin Venue Editor
  -> Building / Spatial tab
      -> Launch Building Inspector
          -> Save BuildingAsset to Venue
```

## 9.5 Future virtual walkthroughs

Venue is the correct owner for:

- exterior 3D geometry
- interior 3D geometry
- floor plans
- walkthrough media
- entrance points
- room graph
- AR/spatial anchors
- navigation graph

Do not attach virtual walkthrough data to Club, Host, Promoter, or Event unless it is event-specific staging.

---

## 10. Submission Workflow Implications

Venue creation should be implicit for most users.

Users should not feel like they are creating a venue record. They should feel like they are submitting a club or event and entering where it happens.

### Club submission flow

User-facing mental model:

```text
I am submitting a club.
```

Backend interpretation:

```text
Create or update Organization(publicDisplayType=club)
Create or match Venue
Create OrganizationVenueRelationship
```

### Event submission flow

User-facing mental model:

```text
I am submitting an event.
```

Backend interpretation:

```text
Create Event
Match or create Venue
Match or create Organization host/promoter if needed
Link Event to Venue
Link Event to Organization
```

### Venue matching states

When a user enters a location, the system should classify it as:

- Known venue: exact or high-confidence match
- Possible match: ask user/admin to confirm
- New venue: create draft venue in background
- Private venue: create venue with restricted visibility

### Admin review

Admin should be able to:

- merge duplicate venues
- link an event to an existing venue
- create a new venue from a submitted address
- mark location visibility
- assign building assets
- attach organizations to venues

---

## 11. Admin Model

Entity Model v2 should move admin toward separate entity editors.

Recommended eventual admin sections:

- Venue Editor
- Organization Editor
- Event Editor
- Host/Promoter view of Organization Editor
- Relationship Editor
- Building / Spatial Editor

### Venue Editor responsibilities

- address
- coordinates
- location validation
- location visibility
- venue amenities
- parking
- accessibility
- building asset
- photos of the physical place
- spatial/walkthrough data
- linked organizations
- linked events

### Organization Editor responsibilities

- public label: club, host, promoter, community
- name
- description
- logo
- website
- contact info
- owner/admin users
- organization-level rules
- membership info
- linked venues
- linked events

### Event Editor responsibilities

- name
- description
- date/time
- venue
- organizer
- co-hosts, future
- tickets/RSVP
- event tags/themes
- attendance policies
- event-specific images
- privacy
- moderation status

---

## 12. Real-World Mapping Examples

## 12.1 Twist SF

Publicly:

```text
Club: Twist SF
Venue: Twist SF
Events: Twist events, Bronze events, other hosted events
```

Internally:

```text
Organization: Twist SF
  publicDisplayType: club

Venue: Twist SF
  owns address, coordinates, building asset, venue amenities

OrganizationVenueRelationship:
  organization: Twist SF
  venue: Twist SF
  type: owner_operator / primary_home
```

Bronze event at Twist:

```text
Organization: Bronze Party
  publicDisplayType: promoter

Event: Bronze Party at Twist
  organizerOrganizationId: Bronze Party
  venueId: Twist SF
```

## 12.2 The Power Exchange

Publicly:

```text
Club: The Power Exchange
Venue: Power Exchange building
```

Internally:

```text
Organization: The Power Exchange
  publicDisplayType: club

Venue: The Power Exchange
  owns address, coordinates, building asset

Relationship:
  type: owner_operator / primary_home
```

## 12.3 East Bay Community Space

Publicly:

```text
Venue: East Bay Community Space
Event: Connect Dance Love
Other events by other organizers
```

Internally:

```text
Venue: East Bay Community Space
  owns address, coordinates, venue amenities, future walkthrough

Organization: Connect Dance Love
  publicDisplayType: host/community/promoter depending on UI decision

Event: Connect Dance Love quarterly event
  organizerOrganizationId: Connect Dance Love
  venueId: East Bay Community Space
```

Other promoters can host separate events at the same venue without duplicating the venue record.

## 12.4 Bronze Party

Publicly:

```text
Host / Promoter: Bronze Party
Events at Twist and other venues
```

Internally:

```text
Organization: Bronze Party
  publicDisplayType: promoter

Events:
  each event has its own venueId
```

Bronze does not own Twist's building asset.

## 12.5 Illuminaughty

Publicly:

```text
Host / Promoter: Illuminaughty
Traveling event producer
```

Internally:

```text
Organization: Illuminaughty
  publicDisplayType: promoter

Events:
  event-by-event venue relationships across multiple cities
```

Do not force Illuminaughty to have one primary venue.

## 12.6 Hotel Ballroom

Publicly:

```text
Venue: Hotel ballroom or hotel event space
Event: lifestyle party / takeover / convention event
```

Internally:

```text
Venue: Hotel Nikko Ballroom
  venueType: hotel_ballroom

Organization: Event promoter

Event:
  venueId: Hotel Nikko Ballroom
  organizerOrganizationId: promoter
```

## 12.7 Private House Party

Publicly:

```text
Event: Private house party
Location: Private location in Oakland / disclosed after RSVP
```

Internally:

```text
Venue: Private residence
  visibility: private
  exact address: admin only
  public display: approximate

Event:
  venueId: private venue
  isAddressPrivate: true or equivalent display policy
```

---

## 13. Initial Type Direction

This is conceptual TypeScript guidance, not final implementation.

```ts
type EntityStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'flagged'
  | 'inactive'
  | 'archived';

type VenueVisibility =
  | 'public_exact'
  | 'public_approximate'
  | 'private'
  | 'admin_only';

type OrganizationDisplayType =
  | 'club'
  | 'host'
  | 'promoter'
  | 'community'
  | 'producer';

type OrganizationVenueRelationshipType =
  | 'owner_operator'
  | 'primary_home'
  | 'resident'
  | 'recurring_guest'
  | 'monthly_guest'
  | 'annual_guest'
  | 'one_time_guest'
  | 'former_home'
  | 'historical'
  | 'unknown';
```

Suggested conceptual entities:

```ts
interface Venue {
  id: string;
  type: 'venue';
  name: string;
  slug: string;
  description?: string;
  address: Geopoint['address'];
  latitude: number;
  longitude: number;
  locationMeta?: ListingLocationMeta;
  visibility: VenueVisibility;
  status: EntityStatus;
  amenities: string[];
  parkingNotes?: string;
  accessibilityNotes?: string;
  logoImageUrl?: string;
  headerImageUrl?: string;
  galleryImageUrls?: string[];
  buildingAssetId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Organization {
  id: string;
  type: 'organization';
  name: string;
  slug: string;
  displayTypes: OrganizationDisplayType[];
  descriptionShort?: string;
  descriptionFull?: string;
  website?: string;
  contactEmail?: string;
  logoImageUrl?: string;
  headerImageUrl?: string;
  galleryImageUrls?: string[];
  status: EntityStatus;
  postedByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface OrganizationVenueRelationship {
  id: string;
  organizationId: string;
  venueId: string;
  relationshipType: OrganizationVenueRelationshipType;
  label?: string;
  startsAt?: string;
  endsAt?: string;
  isPrimary?: boolean;
  confidence?: number;
  notes?: string;
}

interface Event {
  id: string;
  type: 'event';
  name: string;
  slug: string;
  organizerOrganizationId: string;
  venueId: string;
  descriptionFull: string;
  time: {
    start: string;
    end: string;
    timezone?: string;
  };
  website?: string;
  ticketUrl?: string;
  rsvpUrl?: string;
  contactEmail?: string;
  isAddressPrivate?: boolean;
  tags: string[];
  attendancePolicies?: string[];
  dressCode?: string;
  logoImageUrl?: string;
  headerImageUrl?: string;
  galleryImageUrls?: string[];
  status: EntityStatus;
  postedByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
}
```

Important: the real implementation may keep compatibility with `ClubData`, `EventData`, and `Listing` during migration. Do not attempt to replace every type in one pass unless the migration plan explicitly calls for it.

---

## 14. Migration Strategy

Do not perform a hard rewrite of the whole app at once.

Recommended migration order:

### Phase 1: Add new types and mock data

- Add Venue type
- Add Organization type
- Add relationship type
- Create mock venues from existing club/event locations
- Preserve current Listing model during transition

### Phase 2: Add compatibility helpers

Create helper functions that can answer:

- get venue for event
- get primary venue for organization/club
- get organization for event
- get display coordinates for event/venue
- get public club path from organization

These helpers let the UI migrate gradually.

### Phase 3: Move BuildingAsset ownership

- Add `venueId` to BuildingAsset
- Keep `listingId` temporarily for compatibility
- Update Building Inspector to prefer venue selection
- Update map rendering to resolve building assets through venue

### Phase 4: Update Event model

- Add `venueId`
- Add `organizerOrganizationId`
- Keep `venueKey` and `hostName` temporarily
- Update entity index to support both old and new relationships

### Phase 5: Update Admin

- Add Venue admin list/editor
- Add relationship editor controls
- Update existing club/event editor to show linked venue/organization
- Allow admin to merge duplicate venues

### Phase 6: Update Explorer and public pages

- Preserve public Club/Event/Host pages
- Add initial Venue page route
- Map pins should resolve coordinates through Venue when available
- Private location behavior must remain intact

### Phase 7: Clean up old assumptions

Only after the new model is stable:

- remove `venueKey` as club surrogate
- stop treating club address as authoritative venue address
- stop attaching building assets to listing IDs
- migrate remaining fields to the correct owner

---

## 15. Backward Compatibility Rules

During migration:

- Existing ClubData and EventData must continue rendering.
- Existing `/clubs/:slug`, `/events/:slug`, `/hosts/:slug`, and `/listing/:id` routes must continue working.
- Existing BuildingAsset records with `listingId` must still render until migrated.
- Existing private event location behavior must not regress.
- Existing admin create/edit flows must continue saving even before the new venue editor is complete.
- Existing mock data should be migrated incrementally, not deleted prematurely.

---

## 16. Launch Scope Recommendation

For first public launch, Entity Model v2 does not need every future feature.

Recommended launch-critical SEMv2 pieces:

- Venue exists as first-class entity
- Events can point to Venue
- Organizations can point to Venue through relationships
- Building assets can belong to Venue
- Admin can inspect/edit venue linkage
- Public UI can continue saying Club, Host/Promoter, and Event
- Existing discovery flow remains stable

Recommended post-launch pieces:

- rich public venue pages
- virtual walkthroughs
- indoor floor plans
- venue spaces
- event series
- sophisticated taxonomy rewrite
- reviews by entity type
- social/messaging features

---

## 17. Implementation Guardrails for Codex

When implementing SEMv2:

1. Prefer incremental patches over sweeping rewrites.
2. Preserve working explorer/map/admin behavior.
3. Do not rename public `Club` language to `Organization` in the UI unless explicitly requested.
4. Move physical/spatial data toward Venue.
5. Keep private location protections intact.
6. Keep route compatibility.
7. Add compatibility helpers before changing many components.
8. Avoid changing visual polish during the structural migration.
9. Run the build after each major phase.
10. Document any temporary compatibility fields clearly.

---

## 18. Summary

SwingSphere Entity Model v2 is built around one simple idea:

> Places host experiences. Organizations create experiences. Events are the scheduled occurrences. Clubs are the public language users understand.

This model gives SwingSphere room to support dedicated clubs, traveling promoters, community spaces, hotels, private parties, future virtual walkthroughs, indoor navigation, and expansion into adjacent event communities without requiring another major backend rethink.

The UI should remain simple and familiar. The backend should become precise and durable.
