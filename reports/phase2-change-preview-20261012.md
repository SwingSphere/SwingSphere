# SwingSphere Phase 2 — Production Data Reconciliation Change Preview

**Date:** October 12, 2026  
**Status:** **PROPOSED ONLY — NOT EXECUTED**  
**Forward Migration:** [`reports/phase2-proposed-data-reconciliation-20261012.sql`](file:///g:/sites/Swing2/swingsphere2/reports/phase2-proposed-data-reconciliation-20261012.sql)  
**Reversible Rollback:** [`reports/phase2-rollback-20261012.sql`](file:///g:/sites/Swing2/swingsphere2/reports/phase2-rollback-20261012.sql)

---

## Safety & Non-Destructive Guarantees

1. **Zero Asset Deletion:** No records in `public.media_assets` and no Cloudflare Images (`imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/*`) are deleted or modified. All historical asset IDs remain intact for rollback and auditability.
2. **No Automatic Publishing:** Draft cruise sailings (`5` rows) and draft resorts (`4` rows) remain in `status = 'draft'`.
3. **Privacy & RLS Protection:** No Row-Level Security (RLS) policies are loosened. Private event addresses (`isAddressPrivate: true`) and private/approximate resort locations (`resort-sea-mountain-inn-spa` — *"Address released to confirmed guests"*) remain protected from public coordinate exposure.

---

## Record-Level Before / After Preview

### 1. Missing Canonical Event Organizer Links (`public.listings`)

| Listing ID | Event Name | Field | Before | After | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `event-connect-dance-love-2026-04-04` | Connect.Dance.Love | `owner_organization_id` / `payload.organizerOrganizationId` | `NULL` | `'org-host-connect-dance-love'` | `event_series_id = 'series-connect-dance-love'`, which is owned by `org-host-connect-dance-love`. |
| `event-krystal-dance-night-2026-04-04` | Krystal Dance Night | `owner_organization_id` / `payload.organizerOrganizationId` | `NULL` | `'org-host-krystal-club-prive'` | `payload.hostName = 'krystal club prive'`; canonical organization `org-host-krystal-club-prive` exists in `public.organizations`. |
| `event-krystal-neon-night-2026-04-11` | Krystal Neon Night | `owner_organization_id` / `payload.organizerOrganizationId` | `NULL` | `'org-host-krystal-club-prive'` | `payload.hostName = 'krystal club prive'`; canonical organization `org-host-krystal-club-prive` exists in `public.organizations`. |
| `event-krystal-fetish-night-2026-04-18` | Krystal Fetish Night | `owner_organization_id` / `payload.organizerOrganizationId` | `NULL` | `'org-host-krystal-club-prive'` | `payload.hostName = 'krystal club prive'`; canonical organization `org-host-krystal-club-prive` exists in `public.organizations`. |
| `event-krystal-toga-party-2026-04-25` | Krystal Toga Party | `owner_organization_id` / `payload.organizerOrganizationId` | `NULL` | `'org-host-krystal-club-prive'` | `payload.hostName = 'krystal club prive'`; canonical organization `org-host-krystal-club-prive` exists in `public.organizations`. |

---

### 2. Midweek Escape Missing Event Series Links (`public.listings`)

| Listing ID | Event Date (UTC) | Field | Before | After | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `event-1775498062796` | `2026-04-09T23:00:00Z` | `event_series_id` / `payload.eventSeriesId` | `NULL` | `'series-midweek-escape-1775765315109'` | Weekly Thursday recurring series at Club Escape (`org-club-escape-cleveland`, `venue-club-escape-cleveland`). |
| `event-1775500501297` | `2026-04-16T23:00:00Z` | `event_series_id` / `payload.eventSeriesId` | `NULL` | `'series-midweek-escape-1775765315109'` | Weekly Thursday recurring series at Club Escape (`org-club-escape-cleveland`, `venue-club-escape-cleveland`). |
| `event-1775500825641` | `2026-04-23T23:00:00Z` | `event_series_id` / `payload.eventSeriesId` | `NULL` | `'series-midweek-escape-1775765315109'` | Weekly Thursday recurring series at Club Escape (`org-club-escape-cleveland`, `venue-club-escape-cleveland`). |

*(Note: Occurrence `event-1775501342632` on `2026-04-30` is already linked to `series-midweek-escape-1775765315109`.)*

---

### 3. Her Fantasy Party Contaminated Series Logo (`public.event_series`)

| Series ID | Organizer | Field | Before (Twist SF Venue Logo) | After (Her Fantasy Party Canonical Logo) |
| :--- | :--- | :--- | :--- | :--- |
| `series-her-fantasy` | `org-promoter-her-fantasy-party` | `logo_image_url` | `.../74bf9013-96a8-4cd5-3911-4be8dd89fb00/logosquare` | `.../6c405798-3fa7-4dc3-2394-f2b749689a00/logosquare` |

---

### 4. Redundant or Stale Occurrence-Level `payload.logoImageUrl` Copies (`public.listings`)

All 13 events below have `logoOverride` unset (`false`) and an organizer with an authoritative canonical logo. Removing the copied/stale `payload.logoImageUrl` field allows clean inheritance from the canonical organizer/series logo.

| Listing ID | Organizer ID | Before (`payload.logoImageUrl`) | After (`payload.logoImageUrl`) | Effective Inherited Logo |
| :--- | :--- | :--- | :--- | :--- |
| `event-illuminaughty-denver-2026-03-14` | `org-promoter-illuminaughty` | `.../ae6636d9-f865-4baa-6256-794aa12f8b00/logosquare` (redundant copy) | *(removed)* | `.../ae6636d9-f865-4baa-6256-794aa12f8b00/logosquare` |
| `event-illuminaughty-san-francisco-2026-04-11` | `org-promoter-illuminaughty` | `.../ae6636d9-f865-4baa-6256-794aa12f8b00/logosquare` (redundant copy) | *(removed)* | `.../ae6636d9-f865-4baa-6256-794aa12f8b00/logosquare` |
| `event-illuminaughty-scottsdale-2026-04-25` | `org-promoter-illuminaughty` | `.../ae6636d9-f865-4baa-6256-794aa12f8b00/logosquare` (redundant copy) | *(removed)* | `.../ae6636d9-f865-4baa-6256-794aa12f8b00/logosquare` |
| `event-illuminaughty-st-louis-2026-05-02` | `org-promoter-illuminaughty` | `.../ae6636d9-f865-4baa-6256-794aa12f8b00/logosquare` (redundant copy) | *(removed)* | `.../ae6636d9-f865-4baa-6256-794aa12f8b00/logosquare` |
| `event-bronze-party-bay-area-2026-04-04` | `org-promoter-bronze-party` | `.../f01802eb-7930-4e20-6903-2fd3da4be900/logosquare` (redundant copy) | *(removed)* | `.../f01802eb-7930-4e20-6903-2fd3da4be900/logosquare` |
| `event-bronze-party-sf-2026-04-11` | `org-promoter-bronze-party` | `.../f01802eb-7930-4e20-6903-2fd3da4be900/logosquare` (redundant copy) | *(removed)* | `.../f01802eb-7930-4e20-6903-2fd3da4be900/logosquare` |
| `event-krystal-dance-night-2026-04-04` | `org-host-krystal-club-prive` | `.../2efe3573-92a8-4f7b-72cc-4224fc2f4c00/logosquare` (stale copy) | *(removed)* | `.../a8bfa2ff-c978-483c-a53f-01952be5b300/logosquare` |
| `event-krystal-neon-night-2026-04-11` | `org-host-krystal-club-prive` | `.../2efe3573-92a8-4f7b-72cc-4224fc2f4c00/logosquare` (stale copy) | *(removed)* | `.../a8bfa2ff-c978-483c-a53f-01952be5b300/logosquare` |
| `event-krystal-fetish-night-2026-04-18` | `org-host-krystal-club-prive` | `.../2efe3573-92a8-4f7b-72cc-4224fc2f4c00/logosquare` (stale copy) | *(removed)* | `.../a8bfa2ff-c978-483c-a53f-01952be5b300/logosquare` |
| `event-krystal-toga-party-2026-04-25` | `org-host-krystal-club-prive` | `.../2efe3573-92a8-4f7b-72cc-4224fc2f4c00/logosquare` (stale copy) | *(removed)* | `.../a8bfa2ff-c978-483c-a53f-01952be5b300/logosquare` |
| `event-trapeze-atlanta-glow-in-the-dark-2026-04-04` | `org-club-trapeze-atlanta` | `.../2d99a016-2bd4-4c61-2f5c-ec92df56bd00/logosquare` (stale copy) | *(removed)* | `.../7c7fd2db-6eb4-4df4-563a-2b798cb95600/logosquare` |
| `event-trapeze-atlanta-interracial-night-2026-04-10` | `org-club-trapeze-atlanta` | `.../2d99a016-2bd4-4c61-2f5c-ec92df56bd00/logosquare` (stale copy) | *(removed)* | `.../7c7fd2db-6eb4-4df4-563a-2b798cb95600/logosquare` |
| `event-trapeze-atlanta-lust-and-leather-2026-04-25` | `org-club-trapeze-atlanta` | `.../2d99a016-2bd4-4c61-2f5c-ec92df56bd00/logosquare` (stale copy) | *(removed)* | `.../7c7fd2db-6eb4-4df4-563a-2b798cb95600/logosquare` |

---

### 5. The Power Exchange Club / Organization Logo Conflict (`public.organizations`)

| Organization ID | Paired Club ID | Field | Before (Legacy Seed Logo) | After (Uploaded Club Media Asset Logo) |
| :--- | :--- | :--- | :--- | :--- |
| `org-club-power-exchange` | `club-power-exchange` | `logo_image_url` | `.../90077276-bf09-4e14-2cb2-b31039402e00/logosquare` | `.../508d61bf-456d-4de8-bf04-1a8db9981f00/logosquare` |

---

### 6. Resort Public Coordinates & Privacy Protection (`public.resorts`)

| Resort ID | Name | Status | Before (`geopoint.latitude, longitude`) | After (`geopoint.latitude, longitude`) | Visibility / Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `resort-hedonism-ii-negril` | Hedonism II | `approved` | `null, null` | `18.3389, -78.3386` | Public resort address: Norman Manley Blvd, Negril, Jamaica |
| `resort-paradise-lakes-resort` | Paradise Lakes Resort | `approved` | `null, null` | `28.1806, -82.4631` | Public resort address: 2001 Paradise Lakes Blvd, Lutz, FL |
| `resort-the-kraken-resort` | The Kraken Resort | `approved` | `null, null` | `16.3268, -86.5358` | Public resort address: Brick Bay, Roatán, Honduras |
| `resort-sea-mountain-inn-spa` | Sea Mountain Inn | `approved` | `null, null` | `null, null` (`locationVisibility: 'approximate'`) | Protected private address (`"Address released to confirmed guests"`). Excluded from exact public map pins. |

---

### 7. Resort / Club Shared Operator Associations (`public.resorts`)

| Resort ID | Paired Club Listing | Field | Before | After | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `resort-caliente-tampa` | `club-caliente-tampa` | `operator_organization_id` | `NULL` | `'org-club-caliente-tampa'` | Links resort destination record and club listing to the same canonical operator organization without deleting either entity. |
| `resort-cypress-cove-kissimmee` | `club-cypress-cove-kissimmee` | `operator_organization_id` | `NULL` | `'org-club-cypress-cove'` | Links draft resort record to existing Cypress Cove operator organization (`status = 'draft'` preserved). |

*(Note: Remaining resorts `resort-hedonism-ii-negril`, `resort-paradise-lakes-resort`, `resort-sea-mountain-inn-spa`, `resort-the-kraken-resort`, `resort-desire-riviera-maya`, `resort-desire-pearl-riviera-maya`, `resort-temptation-cancun` and cruise series `cruise-series-bliss`, `cruise-series-desire`, `cruise-series-temptation` do not yet have corresponding rows in `public.organizations` and are flagged for manual operator-organization creation rather than guessing.)*

---

### 8. Cruise Sailing Departure Port Coordinates (`public.cruise_sailings`)

| Sailing ID | Port | Status (Preserved) | Before (`departure_port.latitude, longitude`) | After (`departure_port.latitude, longitude`) |
| :--- | :--- | :--- | :--- | :--- |
| `sailing-desire-french-italian-riviera-2026-09` | Nice, France | `draft` | `null, null` | `43.6961, 7.2718` |
| `sailing-desire-greek-islands-2026-10` | Athens (Piraeus), Greece | `draft` | `null, null` | `37.9420, 23.6465` |
| `sailing-desire-rio-2026-12` | Rio de Janeiro, Brazil | `draft` | `null, null` | `-22.8944, -43.1842` |
| `sailing-bliss-caribbean-2026-11` | Miami, FL, USA | `draft` | `null, null` | `25.7781, -80.1791` |
| `sailing-temptation-western-caribbean-2027-02` | Miami, FL, USA | `draft` | `null, null` | `25.7781, -80.1791` |
