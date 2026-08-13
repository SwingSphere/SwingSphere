# Cluster and Pin Rendering System

## 1) Feature Name
Pin/Cluster Rendering and Interaction System

## 2) Purpose
Render clubs/events as semantic pin shapes and compress dense views via cluster columns.

## 3) Where It Lives (files + folders)
- `components/globe/CobeGlobe.tsx`
- `components/globe-scene/LocationPins.tsx`
- `components/globe-scene/pins/*`
- `components/dev/PinPlayground.tsx`
- `docs/pin-language-v1.md`
- `docs/pin-modifier-logic.md`

## 4) How It Works (technical flow)
- `buildPinStacks` creates club/event stacks with ring modifiers for third-party hosted club events.
- `LocationPins` performs screen-space clustering and emits `density` stacks with `clusterMemberIds`.
- Pin click payloads propagate through `CobeGlobe` to `EventBrowser` for cluster list or focus zoom.
- Shape/layer behavior follows documented pin language (cube club, plumbob event, hex ring modifier, hex column density).

## 5) Data Dependencies
- Event fields: `venueKey`, `hostName`, `time`.
- Club fields: venue identity/name.
- Time-lens state for active-window ring logic.

## 6) UI Dependencies
- Drill level gating in `EventBrowser` controls whether pins or clusters render.
- Debug UI in `CobeGlobe` controls cluster radius/scaling and click behavior.

## 7) Known Edge Cases
- Host-vs-club name heuristics can misclassify third-party hosted events.
- Non-projectable/offscreen points bypass cluster projection path.

## 8) Future Expansion Hooks
- Add explicit host ownership fields to remove heuristic fallback dependence.
- Move cluster algorithm tuning into central config.

## 9) Risk Areas
- Complex visual/debug state makes regressions likely without rendering tests.
- Cluster member propagation contract must remain stable across multiple components.


