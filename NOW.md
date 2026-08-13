# SwingSphere NOW

## Current Phase

SwingSphere is in MVP execution mode.

Primary objective:
ship a visually premium, technically stable first launch.

Current work is focused on:

1. finalizing the globe visual experience
2. wiring real backend infrastructure

Everything else is secondary.

---

## Priority 1: Globe Finalization

The globe is SwingSphere’s signature visual element.

Launch requirement:

It must feel premium, polished, intentional, and production quality.

Benchmark quality target:

GitHub Globe polish.

Not necessarily identical design.
But equivalent perceived quality.

That means:

- smooth animation
- premium lighting
- excellent composition
- intentional motion
- clean marker systems
- strong visual hierarchy
- zero “prototype” feel
- zero clunky interaction
- stable performance

The question is always:

"Does this feel like a premium product centerpiece?"

If not:
keep refining.

---

## Globe Product Role

The globe is NOT a GIS tool.

The globe IS:

- brand statement
- discovery surface
- interactive hero experience
- geographic filtering interface

Launch expectations:

Users should be able to:

- rotate globe
- hover regions/countries
- click relevant geography
- discover clubs/events visually
- interact with markers
- open listings/details

No drilldown hierarchy for MVP.

No world → country → city navigation ladder.

No complex geographic state machine.

---

## Active Globe Problems

Current focus:

- final visual polish
- lighting refinement
- atmosphere / shell quality
- marker readability
- hover interaction quality
- geography highlighting
- raycasting reliability
- camera composition
- animation smoothness
- clustering behavior
- performance optimization

Benchmark:

GitHub-quality polish.

---

## Technical Reality

Active codebases:

Primary:
G:\sites\Swing2\swingsphere2

Reference prototypes:
G:\sites\GoogleGlobe\prototype-github-style
G:\sites\lowpoly-globe-sandbox
G:\sites\OpenClawPrototype

Important:

Multiple globe architectures exist.

Do not assume implementation parity.

Inspect actual implementation before recommending rewrites.

---

## Priority 2: Backend Foundation

After globe visual direction is stable:

wire real backend infrastructure.

Likely stack:

- Supabase
- PostgreSQL
- auth
- object storage
- admin tooling
- moderation workflows

Goal:

practical production MVP backend.

Not overengineered architecture.

---

## MVP Scope

Launch needs:

Users:
- browse clubs
- browse events
- search/filter geographically
- view details
- submit listings

Admins:
- approve/reject submissions
- edit listings
- moderate content
- manage metadata
- manage users

Future complexity can wait.

---

## Engineering Rules

Right now:

- move quickly
- prefer practical shipping decisions
- avoid complexity creep
- preserve momentum
- build production-safe foundations

When choosing between elegant and shippable:

prefer shippable.

---

## Explicit Anti-Patterns

Do NOT:

- reintroduce drilldown architecture
- recommend enterprise GIS stacks
- casually rewrite stable systems
- optimize for speculative scale
- introduce dependency sprawl
- accept "good enough" visual polish for the globe
