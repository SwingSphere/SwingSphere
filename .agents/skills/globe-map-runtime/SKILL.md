# Globe and Map Runtime Skill

Use this skill for Three.js, React Three Fiber, globe rendering, pins, labels, country geometry, MapLibre, clustering, camera behavior, globe-to-map transitions, and spatial performance.

## Workflow

1. Inspect the current custom globe and map architecture before proposing replacements.
2. Trace the relevant render path, state ownership, event handlers, camera state, and cleanup.
3. Confirm which library owns the behavior; do not assume Globe.gl or another abstraction.
4. Separate visual tuning issues from geometry, state, lifecycle, and performance issues.
5. Make incremental changes with explicit tuning values.
6. Verify globe and map behavior together when state or navigation is shared.

## Product Rules

- the globe is an immersive discovery surface, not a GIS application
- favor pin-first exploration
- use country and region behavior primarily for orientation
- selected states must be more expressive than hover states
- preserve cinematic camera feel without delaying access to useful information
- keep debug overlays, composers, and experimental controls under development routes
- avoid spatial complexity that does not materially improve discovery

## Runtime Rules

- avoid unnecessary React state updates inside animation frames
- inspect draw calls, texture memory, geometry density, DOM overlays, and continuous rendering
- clean up listeners, timers, animation frames, controls, textures, materials, and geometries
- avoid creating objects repeatedly in hot render paths
- centralize meaningful camera, distance, scale, and transition tuning values
- preserve manual globe/map controls unless an automatic transition is explicitly desired
- inspect MapLibre source/layer lifecycle before adding duplicate layers or listeners
- test clusters, individual listings, selected entities, and empty regions

## Compatibility

Consider:
- WebGL and GPU limitations on 2019 MacBook Pro-class hardware
- high-DPI display cost
- reduced-effects or degraded rendering paths
- browser differences in pointer events, resize behavior, and WebGL resource limits
- mobile thermal and memory constraints

## Completion Criteria

- behavior is traced to the actual implementation
- no incompatible abstraction was assumed
- lifecycle and cleanup were considered
- production and development routes remain properly separated
- the production build passes
- any untested device or browser claims are disclosed
