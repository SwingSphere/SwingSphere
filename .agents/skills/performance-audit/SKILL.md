# Performance Audit Skill

Use this skill for runtime performance, browser compatibility, bundle analysis, globe and map cost, mobile degradation, and the 2019 MacBook Pro-class hardware target.

## Principles

- measure before optimizing when measurement is available
- distinguish observed measurements from estimates and hypotheses
- prioritize user-visible bottlenecks over theoretical micro-optimizations
- preserve premium behavior while providing sensible reduced-cost paths

## Audit Workflow

1. Run a production build and inspect warnings, output sizes, and large assets.
2. Identify expensive initial-load code, duplicated libraries, and avoidable eager imports.
3. Inspect continuous render loops, React re-renders, layout thrashing, and event frequency.
4. Inspect WebGL draw calls, textures, geometry, shadows, postprocessing, and DOM overlays.
5. Inspect MapLibre sources, layers, markers, clustering, and listener lifecycle.
6. Inspect image dimensions, formats, delivery variants, and lazy-loading behavior.
7. Check cleanup for listeners, timers, observers, animation frames, workers, and GPU resources.
8. Identify device-aware or reduced-effects behavior where necessary.
9. Rebuild and report measured improvements or remaining risks.

## Compatibility Targets

Consider at minimum:
- current Chrome, Edge, Firefox, and Safari behavior
- macOS Safari/WebKit differences
- high-DPI screens
- integrated or older discrete GPUs
- 2019 MacBook Pro-class CPU, GPU, memory, and thermal constraints
- mobile memory and thermal pressure
- reduced-motion preferences

## Common SwingSphere Risks

- oversized globe textures or geographic assets
- unnecessary always-on React Three Fiber rendering
- excessive transparent layers and postprocessing
- too many DOM labels or MapLibre markers
- unbounded event listeners or observers
- large hero, flyer, gallery, or logo images without appropriate variants
- loading development tools in production
- simultaneous full-cost globe and map runtimes during transitions

## Reporting

Separate findings into:
- confirmed measurements
- code-supported risks
- device or browser assumptions requiring real hardware testing
- recommended fixes ordered by impact and effort

## Completion Criteria

- the production build was inspected
- major runtime systems were considered
- measurements and estimates are clearly distinguished
- recommended changes include expected tradeoffs
- unsupported device claims are not presented as verified facts
