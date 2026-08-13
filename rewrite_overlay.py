import os
import re

file_path = "g:/sites/Swing2/swingsphere2/components/globe-scene/BoundaryOverlayLayer.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update BAND_OFFSET and replace constants
content = content.replace(
"""const BOUNDARY_BAND_RENDER_BASE: Record<BoundaryBand, number> = {
  context: 1000000,
  parent: 2000000,
  invite: 3000000,
  hero: 4000000,
  pins: 5000000,
};""",
"""const BOUNDARY_BAND_RENDER_BASE: Record<BoundaryBand, number> = {
  context: 1000000,
  parent: 2000000,
  invite: 3000000,
  hero: 4000000,
  pins: 5000000,
};
const BOUNDARY_RENDER_ORDER_ITEM_STRIDE = 100;
""")
content = content.replace("const BOUNDARY_RENDER_ORDER_ITEM_STRIDE = 512;", "") # Remove old stride

# 2. Add overlap check helper
overlap_helper = """
const BAND_ORDERED: BoundaryBand[] = ['context', 'parent', 'invite', 'hero', 'pins'];
const checkBandOverlapInvariant = (paths: OverlayPath[]) => {
  if (import.meta.env.PROD) return;
  const bandRanges: Record<string, { min: number, max: number, count: number }> = {};
  paths.forEach(p => {
    const r = p.baseRadius + p.appliedLift; // appliedLift is 0 during stable, but check any applied values
    if (!bandRanges[p.band]) bandRanges[p.band] = { min: r, max: r, count: 0 };
    bandRanges[p.band].min = Math.min(bandRanges[p.band].min, r);
    bandRanges[p.band].max = Math.max(bandRanges[p.band].max, r);
    bandRanges[p.band].count++;
  });

  for (let i = 0; i < BAND_ORDERED.length - 1; i++) {
    const lower = BAND_ORDERED[i];
    const upper = BAND_ORDERED[i+1];
    if (bandRanges[lower] && bandRanges[upper]) {
      if (bandRanges[lower].max >= bandRanges[upper].min) {
        console.error(`[BoundaryOverlayLayer Invariant Violation] Band '${lower}' (max ${bandRanges[lower].max.toFixed(5)}) overlaps '${upper}' (min ${bandRanges[upper].min.toFixed(5)})`);
      }
    }
  }
};
"""
content = content.replace("const BoundaryOverlayLayer: React.FC<Props> = ({", overlap_helper + "\nconst BoundaryOverlayLayer: React.FC<Props> = ({")

# 3. Lift gap cap calculation needs to strictly use the fixed band offset
new_gap_cap_calc = """  const selectionLiftGapCap = useMemo(() => {
    if (!selectedBand) return MAX_SELECTION_LIFT;
    const nextBand = getNextBoundaryBand(selectedBand);
    if (!nextBand) return MAX_SELECTION_LIFT;
    // Strictly clamp against the static gap to the next logical band, irrespective of item presence
    const gap = BOUNDARY_BAND_OFFSET[nextBand] - BOUNDARY_BAND_OFFSET[selectedBand];
    if (!Number.isFinite(gap) || gap <= MIN_SURFACE_EPSILON) return 0;
    return clampNumber((gap * 0.6) - 1e-6, 0, MAX_SELECTION_LIFT);
  }, [selectedBand]);"""
content = re.sub(r"const selectionLiftGapCap = useMemo\(\(\) => \{.+?\}, \[\n    items,\n    selectedBand,\n  \]\);", new_gap_cap_calc, content, flags=re.DOTALL)

# 4. Remove sorting logic leaking kind
old_sort_logic = """      const ids = Array.from(idToKind.entries())
        .map(([id, kind]) => ({ id, kind }))
        .sort((a, b) => {
          const kindDelta = BOUNDARY_KIND_RANK[a.kind] - BOUNDARY_KIND_RANK[b.kind];
          if (kindDelta !== 0) return kindDelta;
          return a.id.localeCompare(b.id);
        })
        .map((entry) => entry.id);"""
new_sort_logic = """      // Strictly deterministic inside band: kind:id sorting key
      const ids = Array.from(idToKind.entries())
        .map(([id, kind]) => ({ id, sortKey: `${kind}:${id}` }))
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .map((entry) => entry.id);"""
content = content.replace(old_sort_logic, new_sort_logic)

# 5. Replace `paths` inner generation logic
old_path_nudge = """    const getBandNudgeClamp = (band: BoundaryBand) => {
      const bandIndex = BOUNDARY_BAND_ORDER.indexOf(band);
      const prevBand = bandIndex > 0 ? BOUNDARY_BAND_ORDER[bandIndex - 1] : null;
      const nextBand = bandIndex >= 0 ? (BOUNDARY_BAND_ORDER[bandIndex + 1] ?? null) : null;
      const gapBelow = prevBand ? (BOUNDARY_BAND_OFFSET[band] - BOUNDARY_BAND_OFFSET[prevBand]) : Number.POSITIVE_INFINITY;
      const gapAbove = nextBand ? (BOUNDARY_BAND_OFFSET[nextBand] - BOUNDARY_BAND_OFFSET[band]) : Number.POSITIVE_INFINITY;
      return {
        down: Number.isFinite(gapBelow) ? Math.max(MIN_SURFACE_EPSILON, gapBelow * 0.35) : 0.02,
        up: Number.isFinite(gapAbove) ? Math.max(MIN_SURFACE_EPSILON, gapAbove * 0.35) : 0.02,
      };
    };"""

content = content.replace(old_path_nudge, "")

# the per-item loop mapping needs changing
path_creation_regex = r"const rawVisualNudge = layerConfig\.radiusMode === 'absolute'.+?const opacityMultiplier = clampNumber\(layerConfig\.opacity, 0, 1\);"
path_creation_new = """const opacityMultiplier = clampNumber(layerConfig.opacity, 0, 1);
      // Strictly deterministic base radius without active shifting/nudging
      const bandOffset = BOUNDARY_BAND_OFFSET[band];
      const baseRadius = resolvedBoundaryBaseRadius + bandOffset;
"""
content = re.sub(path_creation_regex, path_creation_new, content, flags=re.DOTALL)

geometry_render_order_regex = r"geometries\.forEach\(\(geometry, ringIndex\) => \{.*?const renderOrder =.*?BOUNDARY_BAND_RENDER_BASE\[band\].*?\+.*?ringIndex;.*?next\.push\(\{(.+?)\}\);\s+\}\);"
geometry_render_order_new = """geometries.forEach((geometry, ringIndex) => {
        if (ringIndex > 90) {
            console.warn(`[BoundaryOverlayLayer] Boundary ${item.id} has unusually high ring count: ${ringIndex}`);
        }
        const cappedRingIndex = Math.min(ringIndex, 90);
        // localLayerDelta is 0 for Plate, 1 for Stroke (assume Plate here = 0)
        const localLayerDelta = 0; 
        const renderOrder =
          BOUNDARY_BAND_RENDER_BASE[band] +
          (stableIndexWithinBand * BOUNDARY_RENDER_ORDER_ITEM_STRIDE) + 2 + localLayerDelta + cappedRingIndex;
        next.push({\\1});
      });"""
content = re.sub(geometry_render_order_regex, geometry_render_order_new, content, flags=re.DOTALL)


# 6. Apply invariant check at the end of useMemo
return_next_paths = r"return next;"
content = content.replace(return_next_paths, """
    // Add appliedLift to objects for debug invariant matching
    next.forEach((p) => { 
        const lift = p.itemId === selectedItemId ? effectiveTargetLift : 0;
        (p as any).appliedLift = lift; // used by invariant check
    });
    checkBandOverlapInvariant(next);
    return next;""", 1)


with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Rewrote file.")
