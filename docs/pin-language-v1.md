# SwingSphere Pin Language — Agent Instructions (v1 LOCK)

Use this verbatim (or nearly verbatim) as a system / task preamble for any agent touching globe pins.

## 1️⃣ Purpose (non-negotiable)

Pins are semantic geometry, not decoration.

They must:

- Read clearly at distance
- Encode meaning by shape first
- Avoid clutter
- Scale to dense cities

No new pin types may be invented without revising this spec.

## 2️⃣ Allowed Shapes (ONLY THESE)

### A) Club (Sexy Space / Permanent Venue)

- Shape: Cube
- Meaning: Permanent lifestyle-capable venue
- Behavior: Static (no animation)
- Modifiers: May receive a hex ring
- Never replaced or removed by events

### B) Event (Time-Bound / May Not Be Sexy Space)

- Shape: Plumbob
- Definition: A SINGLE continuous solid
  - Vertically stretched octahedron OR
  - True bipyramid (merged mesh)
- Must NOT include:
  - Cubes
  - Bases
  - Stacked primitives
- Behavior: Subtle motion allowed (very minimal)

### C) Special Event Modifier (State Overlay)

- Shape: Hexagon Ring
- Meaning: A special event is happening at a club
- Rules:
  - Modifier only (never standalone)
  - Attaches only to Club cubes
  - May animate subtly (slow rotation or emissive pulse)
  - Does NOT replace club identity

### D) Density / Clustering (Compression Only)

- Shape: Hexagonal Column (hex prism)
- Meaning: Multiple listings collapsed
- Rules:
  - Abstract only (not a venue or event)
  - No labels
  - No plumbobs
  - No hex rings
  - Height encodes count
  - Click resolves into list / expansion

## 3️⃣ Forbidden Geometry

The agent must NOT introduce:

- Cylinders (round)
- Spheres
- Cones
- Dodecahedrons
- Icons / emojis
- Mixed primitive stacks unless explicitly defined above

No exceptions.

## 4️⃣ Shape Combinations (ONLY THESE)

| Combination | Meaning |
| --- | --- |
| Cube | Club |
| Plumbob | Event |
| Cube + Hex Ring | Special Event at Club |
| Cube + Hex Ring + Plumbob | Specific Event at a Club |
| Hex Column | Density only |

No other combinations are valid.

## 5️⃣ Animation Discipline

Only one animated element per pin stack

Priority:

1. Hex ring
2. Plumbob
3. Nothing else animates

Clubs (cube) never animate

## 6️⃣ Color Rules

Color is secondary

Shape must read in grayscale

Use one color family (reds)

Emissive only for emphasis, never neon

## 7️⃣ Labels (when implemented later)

Labels are NOT part of the pin identity

Labels attach to:

- Selected
- Hovered
- Featured

Max visible labels capped (handled separately)

## 8️⃣ Scope Discipline

When working on pins:

- Do NOT redesign globe
- Do NOT touch mobile
- Do NOT refactor data
- Do NOT optimize prematurely

Pins are a visual language layer only.

## 9️⃣ If Something New Is Needed

If a new concept arises:

Express it using:

- Position
- Scale
- Motion
- Emissive intensity

NOT new geometry

If geometry seems required -> stop and revise this spec first.

## 10️⃣ Success Criteria

A correct implementation allows a user to understand:

- "That’s a club"
- "That’s an event"
- "Something special is happening there"
- "That area is dense"

...without a legend.
