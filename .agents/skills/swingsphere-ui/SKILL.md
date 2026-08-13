# SwingSphere UI Skill

Use this skill for visible product UI: details panels, cards, tags, filters, forms, host pages, event pages, club pages, navigation, responsive behavior, and design-system consistency.

## Goals

- preserve SwingSphere's dark graphite and hybrid liquid-glass language
- keep interfaces premium, restrained, legible, and inclusive
- solve systemic layout problems rather than patching individual listings
- maintain consistent interaction hierarchy across related surfaces

## Workflow

1. Inspect the rendered component, its parent layout, shared primitives, and nearby variants.
2. Search for duplicate implementations before changing or adding a component.
3. Identify whether the issue comes from content, layout, overflow, responsive rules, or shared tokens.
4. Make the smallest systemic fix that handles variable content.
5. Verify representative content states, not only the reported example.
6. Run the production build for meaningful changes.

## SwingSphere UI Rules

- reserve red borders for active, selected, or exceptional signal states
- preserve liquid-glass treatment across product surfaces unless a deliberate contrast is required
- do not allow tags, controls, or text to be silently clipped
- keep tag collections on one row when the design calls for a compact summary; collapse overflow into a count or explicit expansion control
- avoid listing-specific width, height, or text exceptions
- tolerate long names, international text, missing media, and variable metadata
- selected states should be stronger than hover states
- prefer progressive disclosure over dense always-visible content
- reuse existing spacing, radius, typography, button, card, badge, and glass primitives
- avoid enterprise-dashboard aesthetics and excessive visual noise

## Responsive Verification

Check affected layouts at representative widths when practical:
- 1440 × 900
- 1280 × 720
- 1024 × 768
- 768 × 1024
- 390 × 844

Inspect:
- overflow and clipping
- long titles and labels
- wrapping and truncation
- empty, loading, and error states
- hover, selected, focus, disabled, and expanded states
- keyboard focus and readable contrast

## Completion Criteria

- the root cause is addressed across equivalent content
- no unrelated shared surface regressed
- responsive behavior was inspected or limitations were disclosed
- the production build passes for meaningful code changes
- visual correctness is not claimed solely from compilation
