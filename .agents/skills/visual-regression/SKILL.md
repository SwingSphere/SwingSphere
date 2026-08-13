# Visual Regression Skill

Use this skill whenever a task changes visible UI or fixes a presentation bug.

## Goal

Verify that a visual change works across representative content, viewport sizes, and interaction states without creating regressions elsewhere.

## Workflow

1. Identify the affected route, component, shared primitive, and equivalent surfaces.
2. Capture or inspect the current behavior before changing it when practical.
3. Include at least one difficult content case: long title, many tags, missing image, international text, or dense metadata.
4. Apply the smallest systemic fix.
5. Compare before and after at relevant viewport sizes.
6. Inspect nearby surfaces that reuse the changed component or token.
7. Run the production build.

## Representative Viewports

Use these when applicable:
- 1440 × 900
- 1280 × 720
- 1024 × 768
- 768 × 1024
- 390 × 844

Add a project-specific viewport when the reported defect depends on a particular device or panel size.

## Required States

Inspect relevant combinations of:
- default
- hover
- selected or active
- focus-visible
- disabled
- expanded or collapsed
- loading
- empty
- error
- long and short content

## Regression Checklist

- no clipping or inaccessible overflow
- no unintended wrapping or height jumps
- no overlap with fixed navigation, rails, or details panels
- consistent padding, radius, type scale, and glass treatment
- readable contrast and visible keyboard focus
- selected state remains stronger than hover state
- tags and badges follow their intended single-row or wrapping behavior
- mobile controls remain reachable and tappable
- international text and variable metadata do not break layout

## Evidence

When screenshot tooling or a local browser is available:
- capture comparable before and after views
- keep camera, viewport, content, and route consistent
- include selected or expanded states when they are part of the change

When direct rendering is unavailable, disclose that verification was code-level only.

## Completion Criteria

- representative viewport and content cases were checked
- shared-component regressions were considered
- visual correctness is supported by rendering evidence when available
- any unverified states are explicitly disclosed
