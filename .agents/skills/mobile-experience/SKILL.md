---
name: mobile-experience
description: Build, refine, or test SwingSphere's isolated Dev Mobile experience at /dev/mobile, including touch-first explorer, mobile routing, navigation, bottom sheets, filters, and mobile club or event pages.
---

# SwingSphere Mobile Experience

Use this skill for work on SwingSphere Dev Mobile. Treat Dev Mobile as a proving ground for a future production-mobile experience, not as permission to modify production presentation.

## Scope Boundary

- Keep experimental presentation and behavior inside `/dev/mobile` and its explicitly associated preview or detail routes.
- Reuse production data, authentication, entity resolution, canonical routing, and globe infrastructure where practical.
- Gate any necessary shared implementation so desktop and production-mobile behavior remain unchanged.
- Do not port Dev Mobile work into production without explicit approval.
- Do not modify production data.
- Preserve unrelated working changes in the repository.

If a requested change cannot be isolated safely, stop and explain the coupling before changing production behavior.

## Product Standard

Dev Mobile should feel like a deliberately designed mobile product, not a desktop page compressed into a phone.

Preserve SwingSphere's:

- dark graphite foundation
- restrained crimson signal color
- liquid-glass surfaces
- immersive geographic discovery
- selected-first interaction hierarchy
- premium, calm motion

Favor progressive disclosure, clear hierarchy, and a small number of strong actions. Avoid dense desktop navigation, hover-dependent behavior, tiny controls, dashboard styling, and decorative UI that competes with the globe or listing content.

## Baseline Device

Use an iPhone 12 Pro viewport as the primary design target:

- 390 × 844 CSS pixels
- safe-area-aware top and bottom placement
- approximately 44 × 44 CSS pixel minimum touch targets
- no horizontal page overflow

Also tolerate nearby modern phone widths without listing-specific exceptions.

The Dev Mobile workbench may scale the complete device frame to fit a desktop browser, but the embedded viewport must remain 390 × 844.

## Dev Mobile Routing

Keep navigation inside the Dev Mobile experience.

- Marker labels and destination cards for the same entity must resolve to the same valid destination.
- Use the current entity index and canonical path utilities.
- Avoid long-lived callbacks that capture empty initial listing or entity-index state. Use current refs, event-carried entities, or another reliable current-state mechanism.
- Browser Back should restore an appropriate mobile context.
- Direct Dev Mobile detail URLs should load without first visiting the explorer.
- Do not allow navigation to fall through to a desktop shell inside the phone frame.

Verify representative club and event routes, including Our Secret Spot and Coliseum Club when those records are available.

## Mobile Application Shell

Use a reusable mobile shell rather than shrinking the desktop header.

The mobile header should expose only current-context actions such as:

- Home or Back
- concise page identity
- account avatar
- Save or Share when relevant

Keep desktop-only controls out of the mobile header:

- Dev Tools
- Admin Panel
- Host Dashboard
- Add Listing
- globe/map toggle
- username text
- desktop navigation groups

Place Add Listing and other primary destinations in intentional mobile navigation.

## Explorer Behavior

Keep the globe as the primary visual and emotional surface.

### Known renderer sizing regression

If Dev Mobile shows a straight vertical black strip beside the Three.js scene while mobile overlays still reach the edge of the phone, treat it as a **renderer/container sizing defect first**, not a camera-framing defect.

The durable fix is documented in `docs/features/mobile-globe-renderer-sizing.md`. `GlobeRenderer` must keep the WebGL canvas absolutely filling its container and must observe the actual globe container with `ResizeObserver`, because the `/dev/mobile` workbench iframe can settle to a new size without a useful `window.resize` event. Do not compensate for this symptom by only changing camera distance, FOV, globe scale, or arbitrary width offsets.

- Fill the viewport with the renderer; change camera framing rather than shrinking the canvas.
- Show the entire globe at the default world view.
- Support one-finger rotation and pinch zoom.
- A country tap focuses the country and reveals relevant direct pins or clusters.
- Do not use a discovery cluster for a lone listing.
- A marker tap selects the listing and performs the spatial fly-in.
- For a single club or event, the mobile arrival flow continues to that listing's dedicated destination page after the short arrival beat; do not force MapLibre as an intermediate screen.
- The selected marker label is the fast path to the same destination page and may skip the remaining arrival delay.
- A multi-listing discovery marker is an intermediate globe state: fly into the region, reveal its member clubs/events, and remain on the globe until the user explicitly selects one. Do not auto-handoff discovery regions to MapLibre on a timer.
- Exact-public destination pages may expose an explicit `View on map` action that opens MapLibre focused on that listing. Private/approximate locations must not expose a precise map action and should explain that the exact location is withheld.
- Increase touch hit areas without visually inflating markers.
- Prevent bottom sheets and overlays from passing gestures through to the globe.
- Preserve globe gestures outside active overlays.

Do not depend on hover for required information or navigation. Dev Mobile should not render the desktop cursor-following country-name hover label, even when tested with a mouse inside the desktop workbench.

## Search, Filters, and Entity Types

Primary Dev Mobile discovery covers clubs and events.

Use clear options such as:

- Clubs & events
- Events
- Clubs

Do not call the combined option “Everything” when hosts or promoters could be implied. Do not introduce hosts and promoters into the primary mobile discovery interface until their mobile role is intentionally designed.

Visible filters must function and provide selected, loading, empty, and disabled states where relevant.

## Destination Bottom Sheet

Use a contextual bottom sheet instead of a desktop nearby panel.

Collapsed state should provide:

- current destination or “Explore the world”
- a concise result summary
- access to mobile navigation

Expanded state may provide:

- up to two immediately visible nearby cards
- horizontal scrolling when useful
- a working “View all nearby” action
- clear selected-listing presentation

Omit zero-value categories:

- show “1 club,” not “0 events · 1 club”
- show “2 events,” not “2 events · 0 clubs”
- use a useful empty state instead of “0 events · 0 clubs”

Once a listing is selected, prioritize its identity and action over repeated geographic summary information.

## Mobile Club and Event Pages

Create dedicated mobile compositions rather than rendering desktop pages unchanged.

For club pages, prioritize:

- Back navigation
- hero media
- name and location
- Save and Share
- status, verification, or provenance
- concise summary
- who can attend
- entry requirements
- schedule
- amenities
- upcoming events
- contact and official links
- relevant privacy and safety information

For event pages, prioritize:

- Back navigation
- hero media
- event name
- date and time
- location
- host
- attendance rules
- pricing or ticket information
- essential description
- venue information
- relevant trust and safety information

Use progressive disclosure for secondary detail. Never hide essential attendance, timing, location, pricing, or safety information.

Do not invent booking, purchasing, messaging, or other actions that the product does not support.

## Mobile Navigation

A reasonable initial bottom navigation model is:

- Explore
- Events
- Add
- Saved
- Account

Every visible destination must work or communicate an honest intentional state. Do not leave dead controls.

Avoid unexpectedly opening an untreated desktop form or page inside the mobile shell.

## Workflow

Before editing:

1. Read `AGENTS.md` and relevant project skills.
2. Inspect the Dev Mobile route, embedded preview, affected shared logic, and current mobile composition.
3. Trace whether a defect comes from routing, stale state, responsive layout, overflow, pointer ownership, or globe runtime behavior.
4. Identify how the change remains isolated from production.

While editing:

- reuse current data and domain utilities
- prefer mobile-specific presentation components when desktop conditionals would become tangled
- keep tuning values explicit
- preserve touch and keyboard accessibility
- handle loading, empty, error, and long-content states
- avoid unnecessary dependencies

After editing:

1. Review the focused diff.
2. Exercise the affected interaction in the 390 × 844 workbench.
3. Check that the embedded experience remains inside the mobile shell.
4. Run the narrowest relevant checks and the production build.
5. Report what was visually tested, what was interaction-tested, and what remains unverified.

Do not claim a visual or touch defect is fixed solely because the code compiles.

## Representative Verification

When relevant to the change, exercise:

- initial world view and camera framing
- drag rotation and zoom
- Australia and Our Secret Spot selection
- Mexico and Coliseum Club selection
- marker selection versus label navigation
- destination-card navigation
- collapsed and expanded bottom sheets
- View All Nearby
- clubs-and-events, events-only, and clubs-only filters
- mobile club and event pages
- Back, Account, Add, Saved, and Events navigation
- loading, empty, error, and long-title states

Keep verification proportional to the requested change; a narrow fix does not require re-auditing every screen.
