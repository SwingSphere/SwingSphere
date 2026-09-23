import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BORDER_DIR = path.join(ROOT, "public/assets/globe/borders/hybrid/v1");
const manifest = readJson(path.join(BORDER_DIR, "manifest.json"));
const physical = readJson(path.join(ROOT, "public/assets/globe/models/audit/hybrid/physical-coastlines-v1-dense.json"));
const physicalById = new Map((physical.paths ?? []).map((item) => [item.id, item]));
const SEGMENT_FRAME = "hybrid-segment-frames-v1";
const LAND_FRAME = "land-glb-visual-v1";
const WGS84_TO_LAND_LONGITUDE_DEGREES = 1.5;
const assets = Object.entries(manifest.countries ?? {}).map(([countryId, entry]) => ({
  countryId,
  entry,
  asset: readJson(path.join(ROOT, String(entry.url).replace(/^\//, "public/")))
}));

const report = auditHybridBorders({ assets, physicalById });
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--strict") && report.errorCount > 0) process.exitCode = 1;

export function auditHybridBorders({ assets, physicalById }) {
  const issues = [];
  const shared = new Map();
  const politicalEdges = [];
  const add = (severity, code, details) => issues.push({ severity, code, ...details });

  for (const { countryId, asset } of assets) {
    const hasPolitical = (asset.rings ?? []).some((ring) => ring.segments?.some((segment) => segment.kind === "political"));
    if (hasPolitical && ![LAND_FRAME, SEGMENT_FRAME].includes(asset.coordinateFrame)) {
      add("error", "mixed-coordinate-frame", { countryId, coordinateFrame: asset.coordinateFrame ?? null });
    }
    if (Number(asset.renderedSelfIntersectionCount ?? 0) > 0) {
      add("error", "rendered-self-intersection", { countryId, count: asset.renderedSelfIntersectionCount });
    }

    for (const ring of asset.rings ?? []) {
      const segments = ring.segments ?? [];
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        const next = segments[(index + 1) % segments.length];
        const segmentEnd = projectToLandFrame(segment.coordinates?.at(-1), segment.kind, asset.coordinateFrame);
        const nextStart = projectToLandFrame(next?.coordinates?.[0], next?.kind, asset.coordinateFrame);
        const gap = geoDistance(segmentEnd, nextStart);
        if (gap > 1e-6) add("error", "open-segment-junction", { countryId, ringId: ring.id, segmentIndex: index, gapDegrees: round(gap) });

        if (segment.kind === "coastline") {
          if (!segment.sourcePathId) {
            add("error", "coastline-without-physical-provenance", { countryId, ringId: ring.id, segmentIndex: index });
            continue;
          }
          const sourcePath = physicalById.get(segment.sourcePathId);
          if (!sourcePath) {
            add("error", "unknown-physical-coastline", { countryId, ringId: ring.id, segmentIndex: index, sourcePathId: segment.sourcePathId });
            continue;
          }
          const dense = sourcePath.denseCoordinates ?? sourcePath.simplifiedCoordinates ?? [];
          const maxControlDistance = Math.max(0, ...(segment.coordinates ?? []).map((control) => nearestPolylineDistance(control, dense)));
          if (maxControlDistance > 0.2) {
            add("error", "coastal-control-off-physical-path", { countryId, ringId: ring.id, segmentIndex: index, sourcePathId: segment.sourcePathId, distanceDegrees: round(maxControlDistance) });
          }
          const route = physicalRoute(sourcePath, segment);
          const routeLength = polylineLength(route);
          const directLength = Math.max(0.001, geoDistance(route[0], route.at(-1)));
          const fullClosedComponent = sourcePath.closed !== false && sameCoordinate(route[0], route.at(-1));
          if (!fullClosedComponent && routeLength > Math.max(12, directLength * 25)) {
            add("warning", "excessive-coast-path-detour", { countryId, ringId: ring.id, segmentIndex: index, sourcePathId: segment.sourcePathId, routeLengthDegrees: round(routeLength), directLengthDegrees: round(directLength) });
          }
          continue;
        }

        const coordinates = segment.coordinates ?? [];
        const boundaryIds = segment.sharedBoundaryIds ?? [];
        if (boundaryIds.length && boundaryIds.length !== coordinates.length - 1) {
          add("error", "shared-boundary-id-count", { countryId, ringId: ring.id, segmentIndex: index, edgeCount: coordinates.length - 1, idCount: boundaryIds.length });
        }
        for (let edgeIndex = 0; edgeIndex < coordinates.length - 1; edgeIndex += 1) {
          const a = coordinates[edgeIndex];
          const b = coordinates[edgeIndex + 1];
          const boundaryId = boundaryIds[edgeIndex] ?? null;
          const edge = { countryId, ringId: ring.id, segmentIndex: index, edgeIndex, boundaryId, a, b };
          politicalEdges.push(edge);
          if (geoDistance(a, b) > 12) add("error", "long-rendered-political-jump", { countryId, ringId: ring.id, segmentIndex: index, edgeIndex, distanceDegrees: round(geoDistance(a, b)) });
          if (boundaryId) {
            if (!shared.has(boundaryId)) shared.set(boundaryId, []);
            shared.get(boundaryId).push(edge);
          }
        }
      }
    }
  }

  for (const [boundaryId, edges] of shared) {
    const countries = [...new Set(edges.map((edge) => edge.countryId))];
    if (countries.length < 2) continue;
    const keys = new Set(edges.map((edge) => canonicalEdgeKey(edge.a, edge.b)));
    if (keys.size > 1) add("error", "mismatched-shared-boundary", { boundaryId, countries, variants: [...keys] });
  }

  for (let leftIndex = 0; leftIndex < politicalEdges.length; leftIndex += 1) {
    const left = politicalEdges[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < politicalEdges.length; rightIndex += 1) {
      const right = politicalEdges[rightIndex];
      if (left.countryId === right.countryId || (left.boundaryId && left.boundaryId === right.boundaryId)) continue;
      if (!boundsOverlap(edgeBounds(left), edgeBounds(right))) continue;
      if (segmentsCross(left.a, left.b, right.a, right.b)) {
        add("error", "cross-country-political-crossing", { countries: [left.countryId, right.countryId], left: [left.a, left.b], right: [right.a, right.b] });
      }
    }
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  return {
    assetCount: assets.length,
    sharedBoundaryCount: shared.size,
    errorCount,
    warningCount,
    issues
  };
}

function physicalRoute(pathEntry, segment) {
  const dense = pathEntry.denseCoordinates ?? pathEntry.simplifiedCoordinates ?? [];
  if (dense.length < 2) return segment.coordinates ?? [];
  const closed = pathEntry.closed !== false;
  const uniqueLength = closed && sameCoordinate(dense[0], dense.at(-1)) ? dense.length - 1 : dense.length;
  const direction = Number(segment.direction ?? 1) < 0 ? -1 : 1;
  let index = Number(segment.startIndex ?? 0) % uniqueLength;
  const end = Number(segment.endIndex ?? uniqueLength - 1) % uniqueLength;
  const result = [];
  while (result.length <= uniqueLength) {
    result.push(dense[index]);
    if (index === end) break;
    index = closed ? (index + direction + uniqueLength) % uniqueLength : index + direction;
    if (index < 0 || index >= uniqueLength) break;
  }
  if (result.length) {
    result[0] = segment.coordinates?.[0] ?? result[0];
    result[result.length - 1] = segment.coordinates?.at(-1) ?? result.at(-1);
  }
  return result;
}

function projectToLandFrame(coordinate, kind, coordinateFrame) {
  if (!coordinate) return coordinate;
  if (coordinateFrame !== SEGMENT_FRAME || kind !== "political") return coordinate;
  return [wrap(coordinate[0] + WGS84_TO_LAND_LONGITUDE_DEGREES), coordinate[1]];
}

function nearestPolylineDistance(point, coordinates) {
  let result = Infinity;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    result = Math.min(result, pointToSegmentDistance(point, coordinates[index], coordinates[index + 1]));
  }
  return result;
}
function pointToSegmentDistance(point, start, end) {
  const reference = point[0];
  const latitudeScale = Math.cos(point[1] * Math.PI / 180);
  const project = (coordinate) => [wrap(coordinate[0] - reference) * latitudeScale, coordinate[1] - point[1]];
  const [a, b] = [start, end].map(project);
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const denominator = dx * dx + dy * dy;
  const t = denominator > 0 ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / denominator)) : 0;
  return Math.hypot(a[0] + t * dx, a[1] + t * dy);
}
function polylineLength(coordinates) { let total = 0; for (let index = 1; index < coordinates.length; index += 1) total += geoDistance(coordinates[index - 1], coordinates[index]); return total; }
function geoDistance(a, b) { if (!a || !b) return Infinity; const lat = ((a[1] + b[1]) / 2) * Math.PI / 180; return Math.hypot(wrap(b[0] - a[0]) * Math.cos(lat), b[1] - a[1]); }
function wrap(value) { return ((((value + 180) % 360) + 360) % 360) - 180; }
function sameCoordinate(a, b) { return geoDistance(a, b) < 1e-7; }
function canonicalEdgeKey(a, b) { return [a, b].map((point) => point.map((value) => round(value, 5)).join(",")).sort().join("|"); }
function edgeBounds(edge) { return [Math.min(edge.a[0], edge.b[0]), Math.min(edge.a[1], edge.b[1]), Math.max(edge.a[0], edge.b[0]), Math.max(edge.a[1], edge.b[1])]; }
function boundsOverlap(a, b) { return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]; }
function segmentsCross(a, b, c, d) { const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b); return o1 * o2 < -1e-10 && o3 * o4 < -1e-10; }
function round(value, digits = 7) { const scale = 10 ** digits; return Math.round(value * scale) / scale; }
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
