import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Box,
  CornerDownRight,
  Crosshair,
  ExternalLink,
  GitMerge,
  Hand,
  MapPin,
  Maximize2,
  MousePointer2,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  Scissors,
  Trash2,
  Undo2,
  Waves,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

const VIEW_WIDTH = 1200;
const VIEW_HEIGHT = 760;
const EPSILON = 1e-8;

type Coord = [number, number];
type EdgeKind = 'coastline' | 'political';
type ToolMode = 'select' | 'add' | 'pan';
type SnapMode = 'none' | 'coastline' | 'neighbor';

type ManifestEntry = {
  aliases?: string[];
  url?: string;
  status?: string;
  ringCount?: number;
  semanticIssueCount?: number;
};

type BorderManifest = {
  countries?: Record<string, ManifestEntry>;
  skippedCountries?: Record<string, { reason?: string; status?: string }>;
};

type HybridSegment = {
  kind?: string;
  coordinates?: Coord[];
};

type HybridRing = {
  id: string;
  coordinates: Coord[];
  segments?: HybridSegment[];
  manualOverride?: boolean;
  presentation?: boolean;
};

type HybridAsset = {
  countryId?: string;
  countryName?: string;
  status?: string;
  rings?: HybridRing[];
};

type GeoFeature = {
  type: 'Feature';
  geometry?: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: any;
  } | null;
  properties?: Record<string, any>;
};

type GeoCollection = {
  type: 'FeatureCollection';
  features?: GeoFeature[];
};

type PhysicalPath = {
  id: string;
  simplifiedCoordinates?: Coord[];
};

type PhysicalCoastlines = {
  paths?: PhysicalPath[];
};

type OverrideStore = {
  countries?: Record<string, {
    rings?: Record<string, {
      coordinates?: Coord[];
      edgeKinds?: EdgeKind[];
      updatedAt?: string;
    }>;
  }>;
};

type EditorSnapshot = {
  nodes: Coord[];
  edgeKinds: EdgeKind[];
};

type Projection = {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
  lonSpan: number;
  latSpan: number;
};

type Intersection = {
  a: number;
  b: number;
  point: Coord;
};

type NeighborIntersection = {
  neighborId: string;
  neighborName: string;
  point: Coord;
};

type CrossingSummary = {
  count: number;
  neighborIds: string[];
};

type CountryOption = {
  id: string;
  name: string;
  status: string;
  editable: boolean;
  hasAsset: boolean;
  neighborIntersectionCount: number;
  neighborIntersectionCountryIds: string[];
};

type BorderSurfaceDiagnostics = {
  borderSource?: string;
  renderedPointCount?: number;
  anchorRaycastCount?: number;
  fallbackAnchorCount?: number;
  subdivisionCount?: number;
  unsafeSegmentSplitCount?: number;
  acceptedClearanceViolationCount?: number;
  maxTerrainDeviation?: number;
  maxClearanceDeficit?: number;
  linePathCount?: number;
};

type BorderSurfaceRuntime = {
  mount: () => Promise<BorderSurfaceRuntime>;
  dispose: () => void;
  selectCountry: (countryId: string) => unknown;
  setCountrySelectionEventOnly: (enabled: boolean) => void;
  setCountryLayerVisibility: (visibility: { atlasHighlight?: boolean; geoJsonBorders?: boolean }) => void;
  setCountryVectorBorderVisible: (visible: boolean) => void;
  setCountryVectorBorderRenderableCountries: (countries: string[]) => void;
  setCountryVectorBorderPreview: (preview: {
    countryId: string;
    ringId: string;
    coordinates: Coord[];
    edgeKinds: EdgeKind[];
  } | null) => void;
  setLandCoastlineAuditLayers: (layers: Record<string, boolean>) => void;
  projectBorderSurgeryControls: (coordinates: Coord[], width: number, height: number) => Array<{ index: number; x?: number; y?: number; depth?: number; visible?: boolean }>;
  borderSurgeryScreenPointToLandGeo: (x: number, y: number, width: number, height: number) => { lng: number; lat: number } | null;
  setBorderSurgeryOrbitEnabled: (enabled: boolean) => void;
  setNavigationPose: (pose: {
    lng: number;
    lat: number;
    distance?: number;
    zoomIntent?: number;
    followVisualLandRotation?: boolean;
  }) => unknown;
  getCountryVectorBorderDiagnostics: () => BorderSurfaceDiagnostics | null;
};

const copyCoord = (coord: Coord): Coord => [coord[0], coord[1]];
const coordEqual = (a?: Coord, b?: Coord) => Boolean(a && b && Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const edgeKey = (a: Coord, b: Coord) => `${a[0].toFixed(6)},${a[1].toFixed(6)}>${b[0].toFixed(6)},${b[1].toFixed(6)}`;

const featureIso3 = (feature?: GeoFeature | null) => {
  const properties = feature?.properties ?? {};
  const candidates = [
    properties.ISO_A3,
    properties.ISO_A3_EH,
    properties.ADM0_A3,
    properties.ADM0_ISO,
    properties.SOV_A3,
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(value)) return value;
  }
  return '';
};

const featureName = (feature?: GeoFeature | null) => String(
  feature?.properties?.NAME_EN
  ?? feature?.properties?.NAME
  ?? feature?.properties?.ADMIN
  ?? featureIso3(feature),
).trim();

const featureOuterRings = (feature?: GeoFeature | null): Coord[][] => {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates?.[0];
    return Array.isArray(ring) ? [ring as Coord[]] : [];
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates ?? [])
      .map((polygon: any) => polygon?.[0])
      .filter(Array.isArray) as Coord[][];
  }
  return [];
};

const openRing = (coordinates: Coord[] = []): Coord[] => {
  const nodes = coordinates
    .filter((coord) => Array.isArray(coord) && Number.isFinite(coord[0]) && Number.isFinite(coord[1]))
    .map(copyCoord);
  if (nodes.length > 1 && coordEqual(nodes[0], nodes[nodes.length - 1])) nodes.pop();
  return nodes;
};

const wrapLongitude = (longitude: number) => {
  const wrapped = ((longitude + 180) % 360 + 360) % 360 - 180;
  return Math.abs(wrapped + 180) < EPSILON && longitude > 0 ? 180 : wrapped;
};

const unwrapLongitudeNear = (longitude: number, referenceLongitude: number) => {
  let result = longitude;
  while (result - referenceLongitude > 180) result -= 360;
  while (result - referenceLongitude < -180) result += 360;
  return result;
};

const unwrapRing = (coordinates: Coord[] = [], referenceLongitude?: number): Coord[] => {
  const nodes = openRing(coordinates);
  if (!nodes.length) return [];
  const result: Coord[] = [copyCoord(nodes[0])];
  for (let index = 1; index < nodes.length; index += 1) {
    result.push([
      unwrapLongitudeNear(nodes[index][0], result[index - 1][0]),
      nodes[index][1],
    ]);
  }
  if (Number.isFinite(referenceLongitude)) {
    const center = result.reduce((sum, coord) => sum + coord[0], 0) / result.length;
    const turns = Math.round((Number(referenceLongitude) - center) / 360);
    if (turns) return result.map(([longitude, latitude]) => [longitude + turns * 360, latitude]);
  }
  return result;
};

const wrapRingForStorage = (nodes: Coord[]): Coord[] => {
  if (!nodes.length) return [];
  const wrapped = nodes.map(([longitude, latitude]) => [wrapLongitude(longitude), latitude] as Coord);
  return [...wrapped, copyCoord(wrapped[0])];
};

const closeRing = (nodes: Coord[]): Coord[] => nodes.length ? [...nodes.map(copyCoord), copyCoord(nodes[0])] : [];

const chooseDefaultRingId = (asset: HybridAsset | null | undefined): string => {
  const rings = asset?.rings ?? [];
  if (!rings.length) return 'mainland';
  const preferred = rings.find((ring) => ring.id === 'mainland')
    ?? rings.find((ring) => ring.id === 'main-island');
  if (preferred) return preferred.id;
  return [...rings].sort((a, b) => openRing(b.coordinates).length - openRing(a.coordinates).length)[0]?.id ?? 'mainland';
};

const ringEdgeKinds = (ring: HybridRing | null, nodeCount: number): EdgeKind[] => {
  if (!ring || nodeCount <= 0) return Array.from({ length: nodeCount }, () => 'political' as const);
  const kindsByEdge = new Map<string, EdgeKind>();
  for (const segment of ring.segments ?? []) {
    const kind: EdgeKind = segment.kind === 'coastline' ? 'coastline' : 'political';
    const coords = segment.coordinates ?? [];
    for (let index = 0; index < coords.length - 1; index += 1) {
      kindsByEdge.set(edgeKey(coords[index], coords[index + 1]), kind);
      kindsByEdge.set(edgeKey(coords[index + 1], coords[index]), kind);
    }
  }
  const nodes = openRing(ring.coordinates ?? []);
  return Array.from({ length: nodeCount }, (_, index) => {
    const a = nodes[index];
    const b = nodes[(index + 1) % nodeCount];
    return kindsByEdge.get(edgeKey(a, b)) ?? 'political';
  });
};

const featureBounds = (rings: Coord[][]): [number, number, number, number] | null => {
  const coords = rings.flat();
  if (!coords.length) return null;
  return [
    Math.min(...coords.map((coord) => coord[0])),
    Math.min(...coords.map((coord) => coord[1])),
    Math.max(...coords.map((coord) => coord[0])),
    Math.max(...coords.map((coord) => coord[1])),
  ];
};

const boundsOverlap = (a: [number, number, number, number], b: [number, number, number, number], padding = 0) => !(
  a[2] + padding < b[0]
  || a[0] - padding > b[2]
  || a[3] + padding < b[1]
  || a[1] - padding > b[3]
);

const buildProjection = (nodes: Coord[]): Projection => {
  if (!nodes.length) return { minLon: -10, maxLon: 10, minLat: -10, maxLat: 10, lonSpan: 20, latSpan: 20 };
  let minLon = Math.min(...nodes.map((coord) => coord[0]));
  let maxLon = Math.max(...nodes.map((coord) => coord[0]));
  let minLat = Math.min(...nodes.map((coord) => coord[1]));
  let maxLat = Math.max(...nodes.map((coord) => coord[1]));
  const baseLonSpan = Math.max(1.5, maxLon - minLon);
  const baseLatSpan = Math.max(1.5, maxLat - minLat);
  const padLon = baseLonSpan * 0.24;
  const padLat = baseLatSpan * 0.24;
  minLon -= padLon;
  maxLon += padLon;
  minLat -= padLat;
  maxLat += padLat;
  return {
    minLon,
    maxLon,
    minLat,
    maxLat,
    lonSpan: Math.max(0.001, maxLon - minLon),
    latSpan: Math.max(0.001, maxLat - minLat),
  };
};

const geoToScreen = (coord: Coord, projection: Projection): Coord => [
  ((coord[0] - projection.minLon) / projection.lonSpan) * VIEW_WIDTH,
  VIEW_HEIGHT - ((coord[1] - projection.minLat) / projection.latSpan) * VIEW_HEIGHT,
];

const screenToGeo = (point: Coord, projection: Projection): Coord => [
  projection.minLon + (point[0] / VIEW_WIDTH) * projection.lonSpan,
  projection.minLat + ((VIEW_HEIGHT - point[1]) / VIEW_HEIGHT) * projection.latSpan,
];

const pointSegmentProjection = (point: Coord, a: Coord, b: Coord): { point: Coord; distance: number; t: number } => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq > 0 ? clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq, 0, 1) : 0;
  const projected: Coord = [a[0] + dx * t, a[1] + dy * t];
  return { point: projected, distance: Math.hypot(point[0] - projected[0], point[1] - projected[1]), t };
};

const segmentIntersection = (a: Coord, b: Coord, c: Coord, d: Coord): Coord | null => {
  const r: Coord = [b[0] - a[0], b[1] - a[1]];
  const s: Coord = [d[0] - c[0], d[1] - c[1]];
  const denominator = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denominator) < 1e-10) return null;
  const ca: Coord = [c[0] - a[0], c[1] - a[1]];
  const t = (ca[0] * s[1] - ca[1] * s[0]) / denominator;
  const u = (ca[0] * r[1] - ca[1] * r[0]) / denominator;
  if (t <= EPSILON || t >= 1 - EPSILON || u <= EPSILON || u >= 1 - EPSILON) return null;
  return [a[0] + t * r[0], a[1] + t * r[1]];
};

const findIntersections = (nodes: Coord[]): Intersection[] => {
  const result: Intersection[] = [];
  const count = nodes.length;
  if (count < 4) return result;
  for (let a = 0; a < count; a += 1) {
    const aNext = (a + 1) % count;
    for (let b = a + 1; b < count; b += 1) {
      const bNext = (b + 1) % count;
      if (a === b || aNext === b || bNext === a) continue;
      if (a === 0 && bNext === 0) continue;
      const point = segmentIntersection(nodes[a], nodes[aNext], nodes[b], nodes[bNext]);
      if (point) result.push({ a, b, point });
    }
  }
  return result;
};

const findNeighborIntersections = (
  nodes: Coord[],
  neighbors: Array<{ id: string; name: string; ring: Coord[] }>,
): NeighborIntersection[] => {
  if (nodes.length < 2) return [];
  const dedupe = new Set<string>();
  const result: NeighborIntersection[] = [];
  for (const neighbor of neighbors) {
    const ring = openRing(neighbor.ring);
    if (ring.length < 2) continue;
    for (let first = 0; first < nodes.length; first += 1) {
      const a = nodes[first];
      const b = nodes[(first + 1) % nodes.length];
      for (let second = 0; second < ring.length; second += 1) {
        const point = segmentIntersection(a, b, ring[second], ring[(second + 1) % ring.length]);
        if (!point) continue;
        const key = `${neighbor.id}:${point[0].toFixed(5)}:${point[1].toFixed(5)}`;
        if (dedupe.has(key)) continue;
        dedupe.add(key);
        result.push({ neighborId: neighbor.id, neighborName: neighbor.name, point });
      }
    }
  }
  return result;
};

type CoastMatch = {
  pathId: string;
  pathIndex: number;
  segmentIndex: number;
  t: number;
  point: Coord;
  distance: number;
};

type RepairIssue = {
  edgeIndex: number;
  kind: 'rim-deviation' | 'transition';
  severity: 'warning' | 'error';
  message: string;
  point: Coord;
};

const nearestCoastMatch = (coord: Coord, coastlines?: PhysicalCoastlines | null, preferredPathId?: string): CoastMatch | null => {
  let best: CoastMatch | null = null;
  const paths = coastlines?.paths ?? [];
  for (let pathIndex = 0; pathIndex < paths.length; pathIndex += 1) {
    const path = paths[pathIndex];
    if (preferredPathId && path.id !== preferredPathId) continue;
    const coordinates = path.simplifiedCoordinates ?? [];
    for (let segmentIndex = 0; segmentIndex < coordinates.length - 1; segmentIndex += 1) {
      const rawA = coordinates[segmentIndex];
      const rawB = coordinates[segmentIndex + 1];
      const a: Coord = [unwrapLongitudeNear(rawA[0], coord[0]), rawA[1]];
      const b: Coord = [unwrapLongitudeNear(rawB[0], a[0]), rawB[1]];
      const candidate = pointSegmentProjection(coord, a, b);
      if (!best || candidate.distance < best.distance) {
        best = {
          pathId: path.id,
          pathIndex,
          segmentIndex,
          t: candidate.t,
          point: candidate.point,
          distance: candidate.distance,
        };
      }
    }
  }
  return best;
};

const solveContinuousCoastPath = (start: Coord, end: Coord, coastlines?: PhysicalCoastlines | null): Coord[] | null => {
  const paths = coastlines?.paths ?? [];
  let best: { score: number; coordinates: Coord[] } | null = null;
  for (let pathIndex = 0; pathIndex < paths.length; pathIndex += 1) {
    const path = paths[pathIndex];
    const coordinates = path.simplifiedCoordinates ?? [];
    if (coordinates.length < 2) continue;
    const startMatch = nearestCoastMatch(start, { paths: [path] });
    const endMatch = nearestCoastMatch(end, { paths: [path] });
    if (!startMatch || !endMatch) continue;
    const from = startMatch.segmentIndex;
    const to = endMatch.segmentIndex;
    const forward = from <= to;
    const intermediate = forward
      ? coordinates.slice(from + 1, to + 1)
      : coordinates.slice(to + 1, from + 1).reverse();
    const aligned: Coord[] = [copyCoord(startMatch.point)];
    let referenceLongitude = startMatch.point[0];
    for (const coordinate of intermediate) {
      const next: Coord = [unwrapLongitudeNear(coordinate[0], referenceLongitude), coordinate[1]];
      aligned.push(next);
      referenceLongitude = next[0];
    }
    aligned.push([
      unwrapLongitudeNear(endMatch.point[0], referenceLongitude),
      endMatch.point[1],
    ]);
    const deduped = aligned.filter((coordinate, index) => index === 0 || !coordEqual(coordinate, aligned[index - 1]));
    const endpointPenalty = startMatch.distance + endMatch.distance;
    const pathLength = deduped.slice(1).reduce((sum, coordinate, index) => sum + Math.hypot(
      coordinate[0] - deduped[index][0],
      coordinate[1] - deduped[index][1],
    ), 0);
    const directLength = Math.max(0.001, Math.hypot(end[0] - start[0], end[1] - start[1]));
    const detourPenalty = Math.max(0, pathLength - directLength * 5) * 0.2;
    const score = endpointPenalty + detourPenalty;
    if (!best || score < best.score) best = { score, coordinates: deduped };
  }
  if (!best || best.coordinates.length < 2) return null;
  const maxControls = 72;
  if (best.coordinates.length <= maxControls) return best.coordinates;
  const sampled: Coord[] = [];
  for (let index = 0; index < maxControls; index += 1) {
    const sourceIndex = Math.round((index / (maxControls - 1)) * (best.coordinates.length - 1));
    const coordinate = best.coordinates[sourceIndex];
    if (!sampled.length || !coordEqual(sampled[sampled.length - 1], coordinate)) sampled.push(copyCoord(coordinate));
  }
  return sampled;
};

const autoFixBoundary = (nodes: Coord[], edgeKinds: EdgeKind[], coastlines?: PhysicalCoastlines | null): EditorSnapshot => {
  if (nodes.length < 3) return { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
  const rebuiltNodes: Coord[] = [];
  const rebuiltKinds: EdgeKind[] = [];

  for (let edgeIndex = 0; edgeIndex < nodes.length; edgeIndex += 1) {
    const start = nodes[edgeIndex];
    const end = nodes[(edgeIndex + 1) % nodes.length];
    const midpoint: Coord = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    const startCoast = nearestCoastMatch(start, coastlines);
    const middleCoast = nearestCoastMatch(midpoint, coastlines);
    const endCoast = nearestCoastMatch(end, coastlines);
    const span = Math.max(0.001, Math.hypot(end[0] - start[0], end[1] - start[1]));
    const inferredCoast = Boolean(
      startCoast && middleCoast && endCoast
      && startCoast.pathId === middleCoast.pathId
      && middleCoast.pathId === endCoast.pathId
      && Math.max(startCoast.distance, middleCoast.distance, endCoast.distance) <= clamp(span * 0.18, 0.12, 0.7)
    );
    const shouldFollowCoast = edgeKinds[edgeIndex] === 'coastline' || inferredCoast;

    if (!rebuiltNodes.length) rebuiltNodes.push(copyCoord(start));
    if (shouldFollowCoast) {
      const solved = solveContinuousCoastPath(start, end, coastlines);
      if (solved && solved.length >= 2) {
        const directLength = span;
        const routeLength = solved.slice(1).reduce((sum, coordinate, index) => sum + Math.hypot(
          coordinate[0] - solved[index][0], coordinate[1] - solved[index][1],
        ), 0);
        if (routeLength <= Math.max(directLength * 8, directLength + 2.5)) {
          rebuiltNodes[rebuiltNodes.length - 1] = copyCoord(solved[0]);
          for (let index = 1; index < solved.length; index += 1) {
            rebuiltNodes.push(copyCoord(solved[index]));
            rebuiltKinds.push('coastline');
          }
          continue;
        }
      }
    }

    rebuiltNodes.push(copyCoord(end));
    rebuiltKinds.push('political');
  }

  if (rebuiltNodes.length > 1 && coordEqual(rebuiltNodes[0], rebuiltNodes[rebuiltNodes.length - 1])) rebuiltNodes.pop();
  while (rebuiltKinds.length > rebuiltNodes.length) rebuiltKinds.pop();
  while (rebuiltKinds.length < rebuiltNodes.length) rebuiltKinds.push('political');

  // Remove small inland zig-zags while preserving coast controls and meaningful corners.
  let simplifiedNodes = rebuiltNodes.map(copyCoord);
  let simplifiedKinds = [...rebuiltKinds];
  let changed = true;
  for (let pass = 0; pass < 3 && changed && simplifiedNodes.length > 3; pass += 1) {
    changed = false;
    for (let index = simplifiedNodes.length - 1; index >= 0; index -= 1) {
      if (simplifiedNodes.length <= 3) break;
      const previous = (index - 1 + simplifiedNodes.length) % simplifiedNodes.length;
      const next = (index + 1) % simplifiedNodes.length;
      if (simplifiedKinds[previous] === 'coastline' || simplifiedKinds[index] === 'coastline') continue;
      const a = simplifiedNodes[previous];
      const b = simplifiedNodes[index];
      const c = simplifiedNodes[next];
      const chord = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (chord < 0.001) continue;
      const deviation = pointSegmentProjection(b, a, c).distance;
      const incoming = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const outgoing = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const tinyDetour = incoming + outgoing <= chord * 1.12;
      if (deviation <= clamp(chord * 0.055, 0.025, 0.22) && tinyDetour) {
        simplifiedNodes.splice(index, 1);
        simplifiedKinds.splice(index, 1);
        simplifiedKinds[previous > index ? previous - 1 : previous] = 'political';
        changed = true;
      }
    }
  }

  return { nodes: simplifiedNodes, edgeKinds: simplifiedKinds };
};

const buildRepairIssues = (nodes: Coord[], edgeKinds: EdgeKind[], coastlines?: PhysicalCoastlines | null): RepairIssue[] => {
  const issues: RepairIssue[] = [];
  if (nodes.length < 2) return issues;
  for (let edgeIndex = 0; edgeIndex < nodes.length; edgeIndex += 1) {
    const start = nodes[edgeIndex];
    const end = nodes[(edgeIndex + 1) % nodes.length];
    const kind = edgeKinds[edgeIndex] ?? 'political';
    if (kind === 'coastline') {
      const samples: Coord[] = [
        start,
        [start[0] * 0.75 + end[0] * 0.25, start[1] * 0.75 + end[1] * 0.25],
        [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
        [start[0] * 0.25 + end[0] * 0.75, start[1] * 0.25 + end[1] * 0.75],
        end,
      ];
      const deviations = samples.map((sample) => nearestCoastMatch(sample, coastlines)?.distance ?? Number.POSITIVE_INFINITY);
      const maxDeviation = Math.max(...deviations);
      const span = Math.hypot(end[0] - start[0], end[1] - start[1]);
      const tolerance = clamp(span * 0.08, 0.06, 0.45);
      if (maxDeviation > tolerance) {
        issues.push({
          edgeIndex,
          kind: 'rim-deviation',
          severity: maxDeviation > tolerance * 2.5 ? 'error' : 'warning',
          message: `Coast edge departs from the physical rim by ${maxDeviation.toFixed(2)}° at its worst sample.`,
          point: samples[deviations.indexOf(maxDeviation)],
        });
      }
    }
    const previousKind = edgeKinds[(edgeIndex - 1 + edgeKinds.length) % edgeKinds.length] ?? 'political';
    if (previousKind !== kind) {
      const coastMatch = nearestCoastMatch(start, coastlines);
      if (coastMatch && coastMatch.distance > 0.12) {
        issues.push({
          edgeIndex,
          kind: 'transition',
          severity: coastMatch.distance > 0.4 ? 'error' : 'warning',
          message: `Coast/terrain transition is ${coastMatch.distance.toFixed(2)}° away from the physical rim.`,
          point: copyCoord(start),
        });
      }
    }
  }
  return issues;
};

const snapshotKey = (snapshot: EditorSnapshot) => JSON.stringify(snapshot);

const formatModelUnits = (value?: number) => Number.isFinite(value)
  ? Number(value).toFixed(4)
  : '—';

const BorderSurfacePreview: React.FC<{
  countryId: string;
  ringId: string;
  nodes: Coord[];
  edgeKinds: EdgeKind[];
  baselineNodes: Coord[];
  baselineEdgeKinds: EdgeKind[];
  selectedNode: number | null;
  selectedEdge: number | null;
  onSelectNode: (index: number) => void;
  onSelectEdge: (index: number) => void;
  onBeginNodeDrag: (index: number) => void;
  onMoveNodeDrag: (index: number, coordinate: Coord) => void;
  onEndNodeDrag: (index: number) => void;
  onAttachSelectedNodeToRim: () => void;
  onAttachSelectedEdgeToRim: () => void;
  onAttachSelectedEdgeToTerrain: () => void;
  onFixTransition: () => void;
  onAutoRepair: () => void;
  onAutoFixAll: () => void;
}> = ({
  countryId,
  ringId,
  nodes,
  edgeKinds,
  baselineNodes,
  baselineEdgeKinds,
  selectedNode,
  selectedEdge,
  onSelectNode,
  onSelectEdge,
  onBeginNodeDrag,
  onMoveNodeDrag,
  onEndNodeDrag,
  onAttachSelectedNodeToRim,
  onAttachSelectedEdgeToRim,
  onAttachSelectedEdgeToTerrain,
  onFixTransition,
  onAutoRepair,
  onAutoFixAll,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<BorderSurfaceRuntime | null>(null);
  const lastFramedSelectionRef = useRef('');
  const [readyRevision, setReadyRevision] = useState(0);
  const [diagnostics, setDiagnostics] = useState<BorderSurfaceDiagnostics | null>(null);
  const [showMeshRim, setShowMeshRim] = useState(true);
  const [showSavedVersion, setShowSavedVersion] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [controlHandles, setControlHandles] = useState<Array<{ index: number; x: number; y: number; visible: boolean }>>([]);
  const [draggingNode, setDraggingNode] = useState<number | null>(null);
  const previewNodes = showSavedVersion && baselineNodes.length >= 3 ? baselineNodes : nodes;
  const previewEdgeKinds = showSavedVersion && baselineNodes.length >= 3 ? baselineEdgeKinds : edgeKinds;

  const center = useMemo<Coord>(() => {
    if (!previewNodes.length) return [0, 0];
    return [
      previewNodes.reduce((sum, coordinate) => sum + coordinate[0], 0) / previewNodes.length,
      previewNodes.reduce((sum, coordinate) => sum + coordinate[1], 0) / previewNodes.length,
    ];
  }, [previewNodes]);

  const reframe = useCallback(() => {
    runtimeRef.current?.setNavigationPose({
      lng: center[0],
      lat: center[1],
      distance: 3.4,
      followVisualLandRotation: false,
    });
  }, [center]);

  useEffect(() => {
    let cancelled = false;
    let mountedRuntime: BorderSurfaceRuntime | null = null;

    const mount = async () => {
      try {
        const module = await import('../../src/features/globe/runtime/index.js');
        if (cancelled || !containerRef.current) return;
        const SwingSphereGlobe = module.SwingSphereGlobe as unknown as new (
          container: HTMLElement,
          options?: Record<string, unknown>,
        ) => BorderSurfaceRuntime;
        const runtime = new SwingSphereGlobe(containerRef.current, {
          events: [],
          activityRegions: [],
          config: {
            assets: {
              landModel: '/assets/globe/models/land.glb',
              oceanModel: '/assets/globe/models/ocean.glb',
              countryIdTexture: '/assets/globe/textures/countryIdTexture_v4.png',
              visualCountryAtlas: '/assets/globe/textures/visualCountryAtlas_v4.png',
              countryLookup: '/assets/globe/data/countryLookup.json',
            },
            alignment: {
              longitudeOffsetDeg: 1.5,
              latitudeOffsetDeg: 0,
              pinLongitudeOffsetDeg: 1.5,
              pinLatitudeOffsetDeg: 0,
            },
            renderer: {
              antialias: true,
              maxPixelRatio: 1.5,
              controlsMinDistance: 3.4,
              controlsMaxDistance: 8.04,
            },
            selection: {
              enabledEventOnly: false,
              highlightVisible: false,
              useSphereRaycast: true,
              highlightMaskSource: 'id',
            },
            idleMotion: { idleRotationSpeed: 0 },
            renderEffects: {
              bloom: false,
              innerAtmosphere: false,
              outerAtmosphere: false,
            },
            hybridCountryBorders: {
              enabled: true,
              manifestUrl: '/assets/globe/borders/hybrid/v1/manifest.json',
              sourceMode: 'hybrid',
            },
            countryVectorBorders: {
              enabled: true,
              url: '/geo/countries.json',
              coreWidth: 3,
              opacity: 1,
              glowWidth: 8,
              glowOpacity: 0.12,
              speed: 0,
              coreVisible: true,
              glowVisible: true,
              animationEnabled: false,
              hoverEnabled: false,
              palette: ['#ff465c', '#ff465c'],
              radiusScale: 1.009,
              conformToLand: true,
              shorelineSnap: true,
              shorelineSnapStrength: 1,
              maxSegmentDegrees: 0.55,
              experimentalPhysicalCoastlineSnap: true,
              physicalCoastlineUrl: '/assets/globe/coastlines/physical-coastlines-v1.json',
              maxShorelineSnapDegrees: 5,
              shorelineSnapExcludedCountryKeys: ['ISR'],
              preparedCacheSize: 2,
            },
            countryVectorActivity: { enabled: false },
            countryGeoJson: { enabled: false },
            landCoastlineAudit: {
              enabled: true,
              url: '/assets/globe/models/audit/land-coastline-diagnostics.json',
              layers: {
                terrainWallRim: true,
                radialSilhouette: false,
                openEdges: false,
                nonManifoldEdges: false,
                rejectedInternalEdges: false,
              },
            },
          },
          onReady: () => {
            if (!cancelled) setReadyRevision((revision) => revision + 1);
          },
          onError: (nextError: unknown) => {
            if (!cancelled) setRuntimeError(nextError instanceof Error ? nextError.message : String(nextError));
          },
        });
        runtimeRef.current = runtime;
        mountedRuntime = runtime;
        await runtime.mount();
      } catch (nextError) {
        if (!cancelled) setRuntimeError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    };

    void mount();
    return () => {
      cancelled = true;
      if (runtimeRef.current === mountedRuntime) runtimeRef.current = null;
      mountedRuntime?.dispose();
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !readyRevision || previewNodes.length < 3) return;
    runtime.setCountrySelectionEventOnly(false);
    runtime.setCountryLayerVisibility({ atlasHighlight: false, geoJsonBorders: false });
    runtime.setCountryVectorBorderVisible(true);
    runtime.setCountryVectorBorderRenderableCountries([countryId]);
    runtime.setCountryVectorBorderPreview({
      countryId,
      ringId,
      coordinates: closeRing(previewNodes),
      edgeKinds: previewEdgeKinds,
    });
    const frameKey = `${readyRevision}:${countryId}:${ringId}`;
    if (lastFramedSelectionRef.current !== frameKey) {
      lastFramedSelectionRef.current = frameKey;
      runtime.selectCountry(countryId);
      reframe();
    }
    const timer = window.setTimeout(() => {
      setDiagnostics(runtime.getCountryVectorBorderDiagnostics());
    }, 80);
    return () => window.clearTimeout(timer);
  }, [countryId, previewEdgeKinds, previewNodes, readyRevision, reframe, ringId]);

  useEffect(() => {
    runtimeRef.current?.setLandCoastlineAuditLayers({ terrainWallRim: showMeshRim });
  }, [readyRevision, showMeshRim]);

  useEffect(() => {
    if (!readyRevision) return;
    let cancelled = false;
    const refresh = () => {
      if (cancelled || !containerRef.current || !runtimeRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const projected = runtimeRef.current.projectBorderSurgeryControls(previewNodes, rect.width, rect.height)
        .filter((handle) => handle.visible && Number.isFinite(handle.x) && Number.isFinite(handle.y))
        .map((handle) => ({ index: handle.index, x: Number(handle.x), y: Number(handle.y), visible: true }));
      setControlHandles(projected);
    };
    refresh();
    const timer = window.setInterval(refresh, 80);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [previewNodes, readyRevision]);

  const moveSurfaceNode = (event: React.PointerEvent<HTMLButtonElement>, index: number) => {
    if (draggingNode !== index || showSavedVersion || !containerRef.current || !runtimeRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const hit = runtimeRef.current.borderSurgeryScreenPointToLandGeo(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height,
    );
    if (!hit) return;
    onMoveNodeDrag(index, [hit.lng, hit.lat]);
  };

  const endSurfaceNodeDrag = (event: React.PointerEvent<HTMLButtonElement>, index: number) => {
    if (draggingNode !== index) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    runtimeRef.current?.setBorderSurgeryOrbitEnabled(true);
    setDraggingNode(null);
    onEndNodeDrag(index);
  };

  const handleByIndex = new Map(controlHandles.map((handle) => [handle.index, handle]));
  const selectedEdgeKind = selectedEdge != null ? edgeKinds[selectedEdge] ?? 'political' : null;
  const previewSourceActive = diagnostics?.borderSource?.startsWith('border-surgery-preview:') ?? false;
  const hasHardSurfaceIssue = Boolean(
    diagnostics
    && (!previewSourceActive
      || (diagnostics.fallbackAnchorCount ?? 0) > 0
      || (diagnostics.unsafeSegmentSplitCount ?? 0) > 0
      || (diagnostics.acceptedClearanceViolationCount ?? 0) > 0),
  );

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#080b10] shadow-2xl shadow-black/30">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200/70">
            <Box className="h-4 w-4" />
            Primary surgery view
          </div>
          <h2 className="mt-1 text-lg font-black text-white">Edit directly on land.glb</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-gray-500">
            This is the final globe fit. Click a red control span to select it, or drag a control handle directly across the mesh. Orange is the physical terrain-to-wall rim.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowSavedVersion((value) => !value)} disabled={!baselineNodes.length} className={`inline-flex h-9 items-center rounded-lg border px-3 text-[10px] font-black uppercase tracking-[0.12em] transition ${showSavedVersion ? 'border-amber-300/25 bg-amber-500/10 text-amber-100' : 'border-white/10 bg-white/[0.035] text-gray-300 hover:bg-white/[0.07]'} disabled:opacity-35`}>
            {showSavedVersion ? 'Saved A' : 'Working B'}
          </button>
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-[10px] font-bold text-gray-300">
            <input type="checkbox" checked={showMeshRim} onChange={(event) => setShowMeshRim(event.target.checked)} className="h-4 w-4 accent-orange-400" />
            Mesh rim
          </label>
          <button type="button" onClick={reframe} disabled={!readyRevision} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-[10px] font-bold text-gray-300 hover:bg-white/[0.07] disabled:opacity-35">
            <RefreshCw className="h-3.5 w-3.5" /> Reframe
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] bg-black/25 px-4 py-3">
        <div className="mr-2 min-w-[190px] text-[10px] leading-4 text-gray-500">
          {selectedNode != null ? <><span className="font-black text-white">Point {selectedNode}</span> selected · drag the white handle to reposition it on the mesh.</> : selectedEdge != null ? <><span className="font-black text-white">Edge {selectedEdge}</span> selected · {selectedEdgeKind === 'coastline' ? 'coastline' : 'terrain'}.</> : <>Click a control edge or handle in the 3D view to begin.</>}
        </div>
        <button type="button" disabled={showSavedVersion || selectedNode == null} onClick={onAttachSelectedNodeToRim} className="rounded-lg border border-cyan-300/15 bg-cyan-500/[0.06] px-3 py-2 text-[10px] font-black text-cyan-100 hover:bg-cyan-500/[0.1] disabled:opacity-30">Attach Point to Rim</button>
        <button type="button" disabled={showSavedVersion || selectedEdge == null} onClick={onAttachSelectedEdgeToRim} className="rounded-lg border border-red-300/15 bg-red-500/[0.07] px-3 py-2 text-[10px] font-black text-red-100 hover:bg-red-500/[0.12] disabled:opacity-30">Attach Coast to Rim</button>
        <button type="button" disabled={showSavedVersion || selectedEdge == null} onClick={onAttachSelectedEdgeToTerrain} className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] font-black text-gray-200 hover:bg-white/[0.07] disabled:opacity-30">Attach to Terrain</button>
        <button type="button" disabled={showSavedVersion || selectedEdge == null} onClick={onFixTransition} className="rounded-lg border border-amber-300/15 bg-amber-500/[0.05] px-3 py-2 text-[10px] font-black text-amber-100 hover:bg-amber-500/[0.09] disabled:opacity-30">Fix Coast → Land</button>
        <button type="button" disabled={showSavedVersion || selectedEdge == null} onClick={onAutoRepair} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[10px] font-bold text-gray-500 hover:text-gray-300 disabled:opacity-30">Try Automatic Repair</button>
        <button type="button" disabled={showSavedVersion || nodes.length < 3} onClick={onAutoFixAll} className="rounded-lg border border-cyan-300/20 bg-cyan-500/[0.08] px-4 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-100 hover:bg-cyan-500/[0.14] disabled:opacity-30">Auto Fix Whole Border</button>
      </div>

      <div className="relative h-[680px] bg-[radial-gradient(circle_at_50%_45%,rgba(85,91,105,0.14),rgba(3,5,8,0.96)_66%)]">
        <div ref={containerRef} className="absolute inset-0" />
        {!showSavedVersion ? (
          <svg className="absolute inset-0 z-10 h-full w-full" viewBox={`0 0 ${Math.max(1, containerRef.current?.clientWidth ?? 1)} ${Math.max(1, containerRef.current?.clientHeight ?? 1)}`} preserveAspectRatio="none">
            {nodes.map((_, index) => {
              const a = handleByIndex.get(index);
              const b = handleByIndex.get((index + 1) % nodes.length);
              if (!a || !b) return null;
              const selected = selectedEdge === index;
              return (
                <line
                  key={`surface-edge-${index}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={selected ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.001)'}
                  strokeWidth={selected ? 5 : 18}
                  strokeLinecap="round"
                  className="cursor-pointer pointer-events-auto"
                  onPointerDown={(event) => { event.stopPropagation(); onSelectEdge(index); }}
                />
              );
            })}
          </svg>
        ) : null}
        {!showSavedVersion ? controlHandles.map((handle) => {
          const active = selectedNode === handle.index;
          return (
            <button
              key={`surface-control-${handle.index}`}
              type="button"
              title={`Control point ${handle.index}`}
              className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-lg ${active ? 'h-5 w-5 border-white bg-red-500 shadow-red-500/30' : 'h-3.5 w-3.5 border-red-200 bg-[#0b0d11] shadow-black/50'} cursor-grab active:cursor-grabbing`}
              style={{ left: handle.x, top: handle.y }}
              onClick={(event) => { event.stopPropagation(); onSelectNode(handle.index); }}
              onPointerDown={(event) => {
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                runtimeRef.current?.setBorderSurgeryOrbitEnabled(false);
                setDraggingNode(handle.index);
                onSelectNode(handle.index);
                onBeginNodeDrag(handle.index);
              }}
              onPointerMove={(event) => moveSurfaceNode(event, handle.index)}
              onPointerUp={(event) => endSurfaceNodeDrag(event, handle.index)}
              onPointerCancel={(event) => endSurfaceNodeDrag(event, handle.index)}
            />
          );
        }) : null}
        {!readyRevision && !runtimeError ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-xs font-bold uppercase tracking-[0.18em] text-gray-600">Loading production surface…</div>
        ) : null}
        {runtimeError ? (
          <div className="absolute inset-0 grid place-items-center p-8 text-center text-sm text-red-200/80">{runtimeError}</div>
        ) : null}
        <div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-white/10 bg-black/65 px-3 py-2 text-[10px] leading-5 text-gray-400 backdrop-blur-xl">
          <div><span className="text-red-300">Red</span> · working border</div>
          <div><span className="text-orange-300">Orange</span> · physical bevel rim</div>
          <div className="text-gray-600">Drag to orbit · wheel to inspect the bevel</div>
        </div>
        <div className={`pointer-events-none absolute right-4 top-4 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] backdrop-blur-xl ${hasHardSurfaceIssue ? 'border-red-300/25 bg-red-500/12 text-red-200' : 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200'}`}>
          {diagnostics && !previewSourceActive ? 'Preview not active' : hasHardSurfaceIssue ? 'Surface warning' : diagnostics ? 'Surface resolved' : 'Analyzing'}
        </div>
      </div>

      <div className="grid gap-px border-t border-white/[0.08] bg-white/[0.06] sm:grid-cols-2 xl:grid-cols-4">
        <SurfaceMetric label="Raycast anchors" value={diagnostics?.anchorRaycastCount ?? '—'} />
        <SurfaceMetric label="Fallback misses" value={diagnostics?.fallbackAnchorCount ?? '—'} alert={Boolean(diagnostics?.fallbackAnchorCount)} />
        <SurfaceMetric label="Unsafe splits" value={diagnostics?.unsafeSegmentSplitCount ?? '—'} alert={Boolean(diagnostics?.unsafeSegmentSplitCount)} />
        <SurfaceMetric label="Clearance violations" value={diagnostics?.acceptedClearanceViolationCount ?? '—'} alert={Boolean(diagnostics?.acceptedClearanceViolationCount)} />
        <SurfaceMetric label="Rendered points" value={diagnostics?.renderedPointCount ?? '—'} />
        <SurfaceMetric label="Terrain subdivisions" value={diagnostics?.subdivisionCount ?? '—'} />
        <SurfaceMetric label="Max terrain deviation" value={formatModelUnits(diagnostics?.maxTerrainDeviation)} />
        <SurfaceMetric label="Max clearance deficit" value={formatModelUnits(diagnostics?.maxClearanceDeficit)} />
      </div>
    </section>
  );
};

const BorderSurgeryPage: React.FC = () => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ index: number; before: EditorSnapshot } | null>(null);
  const surfaceDragRef = useRef<{ index: number; before: EditorSnapshot } | null>(null);
  const panRef = useRef<{ pointerId: number; start: Coord; center: Coord; lonSpan: number; latSpan: number } | null>(null);
  const [manifest, setManifest] = useState<BorderManifest | null>(null);
  const [geojson, setGeojson] = useState<GeoCollection | null>(null);
  const [coastlines, setCoastlines] = useState<PhysicalCoastlines | null>(null);
  const [overrides, setOverrides] = useState<OverrideStore>({ countries: {} });
  const [asset, setAsset] = useState<HybridAsset | null>(null);
  const [countryId, setCountryId] = useState('ITA');
  const [ringId, setRingId] = useState('mainland');
  const [nodes, setNodes] = useState<Coord[]>([]);
  const [edgeKinds, setEdgeKinds] = useState<EdgeKind[]>([]);
  const [baseline, setBaseline] = useState<EditorSnapshot>({ nodes: [], edgeKinds: [] });
  const [undoStack, setUndoStack] = useState<EditorSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<EditorSnapshot[]>([]);
  const [selectedNodes, setSelectedNodes] = useState<number[]>([]);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [spacePanning, setSpacePanning] = useState(false);
  const [viewZoom, setViewZoom] = useState(1);
  const [viewCenter, setViewCenter] = useState<Coord | null>(null);
  const [snapMode, setSnapMode] = useState<SnapMode>('none');
  const [showSource, setShowSource] = useState(true);
  const [showNeighbors, setShowNeighbors] = useState(true);
  const [showCoast, setShowCoast] = useState(true);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [crossingSummaries, setCrossingSummaries] = useState<Record<string, CrossingSummary>>({});
  const [hybridRingsByCountry, setHybridRingsByCountry] = useState<Record<string, Coord[][]>>({});
  const [crossingScanActive, setCrossingScanActive] = useState(false);
  const [issueCursor, setIssueCursor] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/assets/globe/borders/hybrid/v1/manifest.json').then((response) => response.json()),
      fetch('/geo/publicgeocountries-simplified-35.json').then((response) => response.json()),
      fetch('/assets/globe/coastlines/physical-coastlines-v1.json').then((response) => response.json()),
      fetch('/api/admin/globe/border-surgery/overrides').then((response) => response.json()),
    ]).then(([nextManifest, nextGeojson, nextCoastlines, nextOverrides]) => {
      if (cancelled) return;
      setManifest(nextManifest);
      setGeojson(nextGeojson);
      setCoastlines(nextCoastlines);
      setOverrides(nextOverrides);
      setLoading(false);
    }).catch((nextError) => {
      if (cancelled) return;
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const featuresById = useMemo(() => {
    const map = new Map<string, GeoFeature>();
    for (const feature of geojson?.features ?? []) {
      const id = featureIso3(feature);
      if (id && id !== '-99') map.set(id, feature);
    }
    return map;
  }, [geojson]);

  useEffect(() => {
    if (!manifest || !geojson) return;
    let cancelled = false;
    const assetEntries = Object.entries(manifest.countries ?? {}).filter(([, entry]) => Boolean(entry.url));
    const loaded: Array<{ id: string; name: string; rings: Coord[][] }> = [];
    let cursor = 0;
    setCrossingScanActive(true);
    const worker = async () => {
      while (!cancelled) {
        const index = cursor;
        cursor += 1;
        if (index >= assetEntries.length) return;
        const [id, entry] = assetEntries[index];
        try {
          const response = await fetch(`${entry.url}?borderCrossingScan=${Date.now()}`);
          if (!response.ok) continue;
          const nextAsset = await response.json() as HybridAsset;
          loaded.push({
            id,
            name: featureName(featuresById.get(id)),
            rings: (nextAsset.rings ?? []).filter((ring) => ring?.presentation !== false).map((ring) => unwrapRing(ring.coordinates ?? [])).filter((ring) => ring.length >= 2),
          });
        } catch {
          // A missing diagnostic asset should not prevent the rest of the dev scan.
        }
      }
    };
    const workerCount = Math.min(6, Math.max(1, assetEntries.length));
    Promise.all(Array.from({ length: workerCount }, () => worker())).then(() => {
      if (cancelled) return;
      const summaries: Record<string, CrossingSummary> = {};
      for (let first = 0; first < loaded.length; first += 1) {
        for (let second = first + 1; second < loaded.length; second += 1) {
          const a = loaded[first];
          const b = loaded[second];
          let pairCrossings = 0;
          for (const aRing of a.rings) {
            const aBounds = featureBounds([aRing]);
            if (!aBounds) continue;
            const centerLongitude = aRing.reduce((sum, coord) => sum + coord[0], 0) / aRing.length;
            for (const bRingSource of b.rings) {
              const bRing = unwrapRing(bRingSource, centerLongitude);
              const bBounds = featureBounds([bRing]);
              if (!bBounds || !boundsOverlap(aBounds, bBounds, 0.02)) continue;
              pairCrossings += findNeighborIntersections(aRing, [{ id: b.id, name: b.name, ring: bRing }]).length;
            }
          }
          // Two proper crossings mean one rendered border enters the other and exits again.
          // A single crossing is usually a shared-border junction or seam artifact.
          if (pairCrossings < 2) continue;
          for (const [country, neighbor] of [[a, b], [b, a]] as const) {
            const current = summaries[country.id] ?? { count: 0, neighborIds: [] };
            current.count += pairCrossings;
            if (!current.neighborIds.includes(neighbor.id)) current.neighborIds.push(neighbor.id);
            current.neighborIds.sort();
            summaries[country.id] = current;
          }
        }
      }
      setHybridRingsByCountry(Object.fromEntries(loaded.map((entry) => [entry.id, entry.rings])));
      setCrossingSummaries(summaries);
      setCrossingScanActive(false);
    });
    return () => {
      cancelled = true;
    };
  }, [featuresById, geojson, manifest]);

  const countryOptions = useMemo<CountryOption[]>(() => {
    return [...featuresById.entries()]
      .map(([id, feature]) => ({
        id,
        name: featureName(feature),
        status: manifest?.countries?.[id]?.status
          ?? (manifest?.skippedCountries?.[id] ? 'generator-skipped' : 'source-only'),
        editable: true,
        hasAsset: Boolean(manifest?.countries?.[id]?.url),
        neighborIntersectionCount: crossingSummaries[id]?.count ?? 0,
        neighborIntersectionCountryIds: crossingSummaries[id]?.neighborIds ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [crossingSummaries, featuresById, manifest]);

  const filteredCountries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return countryOptions;
    return countryOptions.filter((country) => `${country.name} ${country.id}`.toLowerCase().includes(query));
  }, [countryOptions, search]);

  const selectedFeature = featuresById.get(countryId) ?? null;
  const selectedCountryOption = countryOptions.find((country) => country.id === countryId) ?? null;
  const selectedManifestEntry = manifest?.countries?.[countryId] ?? null;
  const selectedOverride = overrides.countries?.[countryId]?.rings?.[ringId] ?? null;

  const loadCountry = useCallback(async (nextCountryId: string) => {
    setError(null);
    setMessage(null);
    setSelectedNodes([]);
    setSelectedEdge(null);
    setUndoStack([]);
    setRedoStack([]);
    const entry = manifest?.countries?.[nextCountryId];
    if (!entry?.url) {
      setAsset(null);
      setRingId('mainland');
      return;
    }
    try {
      const response = await fetch(`${entry.url}?borderSurgery=${Date.now()}`);
      if (!response.ok) throw new Error(`Unable to load ${nextCountryId} hybrid border (${response.status}).`);
      const nextAsset = await response.json();
      setAsset(nextAsset);
      setRingId(chooseDefaultRingId(nextAsset));
    } catch (nextError) {
      setAsset(null);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }, [manifest]);

  useEffect(() => {
    if (!manifest || !geojson) return;
    void loadCountry(countryId);
  }, [countryId, geojson, loadCountry, manifest]);

  const ringOptions = useMemo(() => {
    if (asset?.rings?.length) return asset.rings.map((ring) => ring.id);
    return ['mainland'];
  }, [asset]);

  useEffect(() => {
    const assetRing = asset?.rings?.find((ring) => ring.id === ringId) ?? null;
    let nextNodes: Coord[] = [];
    let nextKinds: EdgeKind[] = [];
    if (assetRing) {
      const rawNodes = openRing(assetRing.coordinates);
      nextKinds = ringEdgeKinds(assetRing, rawNodes.length);
      nextNodes = unwrapRing(rawNodes);
    } else {
      const sourceRings = featureOuterRings(selectedFeature)
        .sort((a, b) => b.length - a.length);
      nextNodes = unwrapRing(sourceRings[0] ?? []);
      nextKinds = Array.from({ length: nextNodes.length }, () => 'political' as const);
    }
    if (selectedOverride?.coordinates?.length) {
      nextNodes = unwrapRing(selectedOverride.coordinates);
      nextKinds = Array.from({ length: nextNodes.length }, (_, index) => selectedOverride.edgeKinds?.[index] === 'coastline' ? 'coastline' : 'political');
    }
    setNodes(nextNodes);
    setEdgeKinds(nextKinds);
    setBaseline({ nodes: nextNodes.map(copyCoord), edgeKinds: [...nextKinds] });
    setSelectedNodes([]);
    setSelectedEdge(null);
    setUndoStack([]);
    setRedoStack([]);
    setViewZoom(1);
    setViewCenter(null);
  }, [asset, ringId, selectedFeature, selectedOverride]);

  const fitProjection = useMemo(() => buildProjection(baseline.nodes.length ? baseline.nodes : nodes), [baseline, nodes]);
  const projection = useMemo(() => {
    const zoom = clamp(viewZoom, 0.25, 40);
    const lonSpan = fitProjection.lonSpan / zoom;
    const latSpan = fitProjection.latSpan / zoom;
    const fallbackCenter: Coord = [
      (fitProjection.minLon + fitProjection.maxLon) / 2,
      (fitProjection.minLat + fitProjection.maxLat) / 2,
    ];
    const center = viewCenter ?? fallbackCenter;
    return {
      minLon: center[0] - lonSpan / 2,
      maxLon: center[0] + lonSpan / 2,
      minLat: center[1] - latSpan / 2,
      maxLat: center[1] + latSpan / 2,
      lonSpan,
      latSpan,
    };
  }, [fitProjection, viewCenter, viewZoom]);
  const editorBounds = useMemo<[number, number, number, number]>(() => [projection.minLon, projection.minLat, projection.maxLon, projection.maxLat], [projection]);
  const editorCenterLongitude = (projection.minLon + projection.maxLon) / 2;
  const sourceRings = useMemo(
    () => featureOuterRings(selectedFeature).map((ring) => unwrapRing(ring, editorCenterLongitude)),
    [editorCenterLongitude, selectedFeature],
  );
  const allNeighborRings = useMemo(() => {
    const workingBounds = featureBounds([nodes]);
    if (!workingBounds) return [] as Array<{ id: string; name: string; ring: Coord[] }>;
    const workingCenterLongitude = nodes.length
      ? nodes.reduce((sum, coord) => sum + coord[0], 0) / nodes.length
      : editorCenterLongitude;
    return (geojson?.features ?? []).flatMap((feature) => {
      const id = featureIso3(feature);
      if (!id || id === countryId) return [];
      const preferredRings = hybridRingsByCountry[id]?.length
        ? hybridRingsByCountry[id]
        : featureOuterRings(feature);
      return preferredRings.flatMap((ring) => {
        const alignedRing = unwrapRing(ring, workingCenterLongitude);
        const bounds = featureBounds([alignedRing]);
        if (!bounds || !boundsOverlap(workingBounds, bounds, 0.75)) return [];
        return [{ id, name: featureName(feature), ring: alignedRing }];
      });
    });
  }, [countryId, editorCenterLongitude, geojson, hybridRingsByCountry, nodes]);
  const neighborRings = showNeighbors ? allNeighborRings.filter((neighbor) => {
    const bounds = featureBounds([neighbor.ring]);
    return Boolean(bounds && boundsOverlap(editorBounds, bounds, 0.75));
  }) : [];
  const rawNeighborIntersections = useMemo(() => findNeighborIntersections(nodes, allNeighborRings), [allNeighborRings, nodes]);
  const neighborIntersections = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of rawNeighborIntersections) counts.set(entry.neighborId, (counts.get(entry.neighborId) ?? 0) + 1);
    return rawNeighborIntersections.filter((entry) => (counts.get(entry.neighborId) ?? 0) >= 2);
  }, [rawNeighborIntersections]);
  const liveNeighborIds = useMemo(() => [...new Set(neighborIntersections.map((entry) => entry.neighborId))].sort(), [neighborIntersections]);

  const visibleCoastSegments = useMemo(() => {
    if (!showCoast) return [] as Array<{ pathId: string; a: Coord; b: Coord }>;
    const bounds: [number, number, number, number] = [
      editorBounds[0] - projection.lonSpan * 0.15,
      editorBounds[1] - projection.latSpan * 0.15,
      editorBounds[2] + projection.lonSpan * 0.15,
      editorBounds[3] + projection.latSpan * 0.15,
    ];
    return (coastlines?.paths ?? []).flatMap((path) => {
      const coords = path.simplifiedCoordinates ?? [];
      const result: Array<{ pathId: string; a: Coord; b: Coord }> = [];
      for (let index = 0; index < coords.length - 1; index += 1) {
        const rawA = coords[index];
        const rawB = coords[index + 1];
        const aLongitude = unwrapLongitudeNear(rawA[0], editorCenterLongitude);
        const a: Coord = [aLongitude, rawA[1]];
        const b: Coord = [unwrapLongitudeNear(rawB[0], aLongitude), rawB[1]];
        const segmentBounds: [number, number, number, number] = [
          Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]),
        ];
        if (boundsOverlap(bounds, segmentBounds)) result.push({ pathId: path.id, a, b });
      }
      return result;
    });
  }, [coastlines, editorBounds, editorCenterLongitude, projection.latSpan, projection.lonSpan, showCoast]);

  const intersections = useMemo(() => findIntersections(nodes), [nodes]);
  const repairIssues = useMemo(() => buildRepairIssues(nodes, edgeKinds, coastlines), [coastlines, edgeKinds, nodes]);
  const currentSnapshot = useMemo<EditorSnapshot>(() => ({ nodes, edgeKinds }), [edgeKinds, nodes]);
  const dirty = useMemo(() => snapshotKey(currentSnapshot) !== snapshotKey(baseline), [baseline, currentSnapshot]);

  const pushSnapshot = useCallback((before: EditorSnapshot, next: EditorSnapshot) => {
    if (snapshotKey(before) === snapshotKey(next)) return;
    setUndoStack((stack) => [...stack.slice(-79), { nodes: before.nodes.map(copyCoord), edgeKinds: [...before.edgeKinds] }]);
    setRedoStack([]);
    setNodes(next.nodes.map(copyCoord));
    setEdgeKinds([...next.edgeKinds]);
  }, []);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      const previous = stack[stack.length - 1];
      if (!previous) return stack;
      setRedoStack((redo) => [...redo.slice(-79), { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] }]);
      setNodes(previous.nodes.map(copyCoord));
      setEdgeKinds([...previous.edgeKinds]);
      setSelectedNodes([]);
      setSelectedEdge(null);
      return stack.slice(0, -1);
    });
  }, [edgeKinds, nodes]);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      const next = stack[stack.length - 1];
      if (!next) return stack;
      setUndoStack((undoHistory) => [...undoHistory.slice(-79), { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] }]);
      setNodes(next.nodes.map(copyCoord));
      setEdgeKinds([...next.edgeKinds]);
      setSelectedNodes([]);
      setSelectedEdge(null);
      return stack.slice(0, -1);
    });
  }, [edgeKinds, nodes]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.tagName === 'TEXTAREA') return;
      if (event.code === 'Space') {
        event.preventDefault();
        setSpacePanning(true);
        return;
      }
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelectedNodes();
      } else if (event.key.toLowerCase() === 'a') {
        setToolMode('add');
      } else if (event.key.toLowerCase() === 'v') {
        setToolMode('select');
      } else if (event.key.toLowerCase() === 'h') {
        setToolMode('pan');
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePanning(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  const clientPointToSvg = (clientX: number, clientY: number): Coord | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const local = point.matrixTransform(matrix.inverse());
    return [local.x, local.y];
  };

  const eventPoint = (event: { clientX: number; clientY: number }): Coord | null => clientPointToSvg(event.clientX, event.clientY);

  const resetView = useCallback(() => {
    setViewZoom(1);
    setViewCenter(null);
  }, []);

  const zoomAt = useCallback((screen: Coord, requestedZoom: number) => {
    const nextZoom = clamp(requestedZoom, 0.25, 40);
    const anchor = screenToGeo(screen, projection);
    const lonSpan = fitProjection.lonSpan / nextZoom;
    const latSpan = fitProjection.latSpan / nextZoom;
    const xFraction = screen[0] / VIEW_WIDTH;
    const yFraction = (VIEW_HEIGHT - screen[1]) / VIEW_HEIGHT;
    setViewZoom(nextZoom);
    setViewCenter([
      anchor[0] - (xFraction - 0.5) * lonSpan,
      anchor[1] - (yFraction - 0.5) * latSpan,
    ]);
  }, [fitProjection.latSpan, fitProjection.lonSpan, projection]);

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const screen = eventPoint(event);
    if (!screen) return;
    const factor = Math.exp(-event.deltaY * 0.0015);
    zoomAt(screen, viewZoom * factor);
  };

  const beginCanvasPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const shouldPan = toolMode === 'pan' || spacePanning || event.button === 1;
    if (!shouldPan) {
      setSelectedNodes([]);
      setSelectedEdge(null);
      return;
    }
    const start = eventPoint(event);
    if (!start) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      start,
      center: [(projection.minLon + projection.maxLon) / 2, (projection.minLat + projection.maxLat) / 2],
      lonSpan: projection.lonSpan,
      latSpan: projection.latSpan,
    };
  };

  const moveCanvasPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const point = eventPoint(event);
    if (!point) return;
    const dx = point[0] - pan.start[0];
    const dy = point[1] - pan.start[1];
    setViewCenter([
      pan.center[0] - (dx / VIEW_WIDTH) * pan.lonSpan,
      pan.center[1] + (dy / VIEW_HEIGHT) * pan.latSpan,
    ]);
  };

  const endCanvasPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    panRef.current = null;
  };

  const nearestSnap = useCallback((screenPoint: Coord, mode: SnapMode): Coord | null => {
    if (mode === 'none') return null;
    let best: { point: Coord; distance: number } | null = null;
    if (mode === 'coastline') {
      for (const segment of visibleCoastSegments) {
        const candidate = pointSegmentProjection(screenPoint, geoToScreen(segment.a, projection), geoToScreen(segment.b, projection));
        if (!best || candidate.distance < best.distance) best = { point: candidate.point, distance: candidate.distance };
      }
    } else {
      for (const neighbor of neighborRings) {
        const ring = openRing(neighbor.ring);
        for (let index = 0; index < ring.length; index += 1) {
          const a = geoToScreen(ring[index], projection);
          const b = geoToScreen(ring[(index + 1) % ring.length], projection);
          const candidate = pointSegmentProjection(screenPoint, a, b);
          if (!best || candidate.distance < best.distance) best = { point: candidate.point, distance: candidate.distance };
        }
      }
    }
    return best && best.distance <= 28 ? screenToGeo(best.point, projection) : null;
  }, [neighborRings, projection, visibleCoastSegments]);

  const beginNodeDrag = (event: React.PointerEvent<SVGCircleElement>, index: number) => {
    if (toolMode !== 'select' || spacePanning || event.button === 1) return;
    event.stopPropagation();
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    dragRef.current = { index, before };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedEdge(null);
    setSelectedNodes((current) => event.shiftKey
      ? current.includes(index) ? current.filter((item) => item !== index) : [...current, index]
      : [index]);
  };

  const moveNodeDrag = (event: React.PointerEvent<SVGCircleElement>, index: number) => {
    if (dragRef.current?.index !== index) return;
    const screen = eventPoint(event);
    if (!screen) return;
    const snapped = nearestSnap(screen, snapMode);
    const nextCoord = snapped ?? screenToGeo(screen, projection);
    setNodes((current) => current.map((coord, nodeIndex) => nodeIndex === index ? nextCoord : coord));
  };

  const endNodeDrag = (event: React.PointerEvent<SVGCircleElement>, index: number) => {
    if (dragRef.current?.index !== index) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const before = dragRef.current.before;
    dragRef.current = null;
    const after = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    if (snapshotKey(before) !== snapshotKey(after)) {
      setUndoStack((stack) => [...stack.slice(-79), before]);
      setRedoStack([]);
    }
  };

  const addPointOnEdge = (event: React.PointerEvent<SVGLineElement>, edgeIndex: number) => {
    if (toolMode === 'pan' || spacePanning || event.button === 1) return;
    event.stopPropagation();
    if (toolMode !== 'add' || nodes.length < 2) {
      setSelectedEdge(edgeIndex);
      setSelectedNodes([]);
      return;
    }
    const screen = eventPoint(event);
    if (!screen) return;
    const a = geoToScreen(nodes[edgeIndex], projection);
    const b = geoToScreen(nodes[(edgeIndex + 1) % nodes.length], projection);
    const projected = pointSegmentProjection(screen, a, b).point;
    const snapped = nearestSnap(projected, snapMode);
    const coord = snapped ?? screenToGeo(projected, projection);
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    const nextNodes = [...nodes];
    const insertIndex = edgeIndex + 1;
    nextNodes.splice(insertIndex, 0, coord);
    const nextKinds = [...edgeKinds];
    nextKinds.splice(insertIndex, 0, edgeKinds[edgeIndex] ?? 'political');
    pushSnapshot(before, { nodes: nextNodes, edgeKinds: nextKinds });
    setSelectedNodes([insertIndex]);
    setSelectedEdge(null);
    setToolMode('select');
  };

  function deleteSelectedNodes() {
    if (!selectedNodes.length || nodes.length - selectedNodes.length < 3) return;
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    let nextNodes = nodes.map(copyCoord);
    let nextKinds = [...edgeKinds];
    const sorted = [...new Set(selectedNodes)].sort((a, b) => b - a);
    for (const index of sorted) {
      if (nextNodes.length <= 3 || index < 0 || index >= nextNodes.length) continue;
      const previous = (index - 1 + nextNodes.length) % nextNodes.length;
      const incomingKind = nextKinds[previous] ?? 'political';
      const outgoingKind = nextKinds[index] ?? 'political';
      nextNodes.splice(index, 1);
      nextKinds.splice(index, 1);
      const adjustedPrevious = previous > index ? previous - 1 : previous;
      nextKinds[adjustedPrevious] = incomingKind === outgoingKind ? incomingKind : 'political';
    }
    pushSnapshot(before, { nodes: nextNodes, edgeKinds: nextKinds });
    setSelectedNodes([]);
    setSelectedEdge(null);
  }

  const straightenSelectedRun = () => {
    if (selectedNodes.length !== 2) return;
    const [start, end] = [...selectedNodes].sort((a, b) => a - b);
    if (end - start <= 1 || nodes.length - (end - start) <= 1) return;
    const directCount = end - start - 1;
    const wrapCount = nodes.length - (end - start) - 1;
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    if (directCount <= wrapCount) {
      const removedKinds = edgeKinds.slice(start, end);
      const nextNodes = nodes.filter((_, index) => index <= start || index >= end);
      const nextKinds = edgeKinds.filter((_, index) => index <= start || index >= end);
      nextKinds[start] = removedKinds.every((kind) => kind === 'coastline') ? 'coastline' : 'political';
      pushSnapshot(before, { nodes: nextNodes, edgeKinds: nextKinds });
      setSelectedNodes([start, start + 1]);
    } else {
      const keptNodes = nodes.slice(start, end + 1);
      const keptKinds = edgeKinds.slice(start, end);
      const wrapKinds = [...edgeKinds.slice(end), ...edgeKinds.slice(0, start)];
      keptKinds.push(wrapKinds.every((kind) => kind === 'coastline') ? 'coastline' : 'political');
      pushSnapshot(before, { nodes: keptNodes, edgeKinds: keptKinds });
      setSelectedNodes([0, keptNodes.length - 1]);
    }
    setSelectedEdge(null);
  };

  const snapSelectedNode = (mode: Exclude<SnapMode, 'none'>) => {
    if (selectedNodes.length !== 1) return;
    const index = selectedNodes[0];
    const screen = geoToScreen(nodes[index], projection);
    const snapped = nearestSnap(screen, mode);
    if (!snapped) {
      setMessage(`No ${mode === 'coastline' ? 'physical coastline' : 'neighbor border'} within the 28 px snap radius.`);
      return;
    }
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    const nextNodes = nodes.map((coord, nodeIndex) => nodeIndex === index ? snapped : copyCoord(coord));
    pushSnapshot(before, { nodes: nextNodes, edgeKinds: [...edgeKinds] });
    setMessage(mode === 'coastline' ? 'Node snapped to physical land.glb coastline.' : 'Node snapped to neighboring political edge.');
  };

  const attachSelectedNodeToMeshRim = () => {
    if (selectedNodes.length !== 1) return;
    const index = selectedNodes[0];
    const match = nearestCoastMatch(nodes[index], coastlines);
    if (!match) {
      setMessage('No physical mesh rim could be resolved for this control point.');
      return;
    }
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    const nextNodes = nodes.map((coord, nodeIndex) => nodeIndex === index ? copyCoord(match.point) : copyCoord(coord));
    pushSnapshot(before, { nodes: nextNodes, edgeKinds: [...edgeKinds] });
    setMessage(`Attached control point ${index} directly to the physical land.glb rim.`);
  };

  const beginSurfaceNodeDrag = (index: number) => {
    surfaceDragRef.current = {
      index,
      before: { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] },
    };
    setSelectedNodes([index]);
    setSelectedEdge(null);
  };

  const moveSurfaceNodeDrag = (index: number, coordinate: Coord) => {
    if (surfaceDragRef.current?.index !== index) return;
    setNodes((current) => current.map((coord, nodeIndex) => nodeIndex === index ? copyCoord(coordinate) : coord));
  };

  const endSurfaceNodeDrag = (index: number) => {
    const drag = surfaceDragRef.current;
    if (!drag || drag.index !== index) return;
    surfaceDragRef.current = null;
    const after = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    if (snapshotKey(drag.before) !== snapshotKey(after)) {
      setUndoStack((stack) => [...stack.slice(-79), drag.before]);
      setRedoStack([]);
      setMessage(`Moved control point ${index} directly on the land.glb surface.`);
    }
  };

  const selectSurfaceNode = (index: number) => {
    setSelectedNodes([index]);
    setSelectedEdge(null);
    setToolMode('select');
  };

  const selectSurfaceEdge = (index: number) => {
    setSelectedEdge(index);
    setSelectedNodes([]);
    setToolMode('select');
  };

  const setSelectedEdgeKind = (kind: EdgeKind) => {
    if (selectedEdge == null) return;
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    const nextKinds = edgeKinds.map((value, index) => index === selectedEdge ? kind : value);
    pushSnapshot(before, { nodes: nodes.map(copyCoord), edgeKinds: nextKinds });
  };

  const snapSelectedEdgeToMeshRim = () => {
    if (selectedEdge == null || nodes.length < 2) return;
    const startIndex = selectedEdge;
    const endIndex = (selectedEdge + 1) % nodes.length;
    const solved = solveContinuousCoastPath(nodes[startIndex], nodes[endIndex], coastlines);
    if (!solved || solved.length < 2) {
      setMessage('No continuous physical mesh-rim route could be resolved for this edge.');
      return;
    }
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    const interior = solved.slice(1, -1);
    const nextNodes = nodes.map(copyCoord);
    if (selectedEdge === nodes.length - 1) nextNodes.push(...interior.map(copyCoord));
    else nextNodes.splice(selectedEdge + 1, 0, ...interior.map(copyCoord));
    const replacementEdgeCount = interior.length + 1;
    const nextKinds = [...edgeKinds];
    nextKinds.splice(selectedEdge, 1, ...Array.from({ length: replacementEdgeCount }, () => 'coastline' as const));
    nextNodes[startIndex] = copyCoord(solved[0]);
    const adjustedEndIndex = selectedEdge === nodes.length - 1 ? 0 : selectedEdge + replacementEdgeCount;
    nextNodes[adjustedEndIndex] = copyCoord(solved[solved.length - 1]);
    pushSnapshot(before, { nodes: nextNodes, edgeKinds: nextKinds });
    setSelectedEdge(selectedEdge);
    setSelectedNodes([]);
    setMessage(`Rebuilt edge ${selectedEdge} along one continuous land.glb mesh-rim path with ${replacementEdgeCount} coastline segment${replacementEdgeCount === 1 ? '' : 's'}.`);
  };

  const drapeSelectedEdgeToTerrain = () => {
    if (selectedEdge == null) return;
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    const nextKinds = edgeKinds.map((kind, index) => index === selectedEdge ? 'political' as const : kind);
    pushSnapshot(before, { nodes: nodes.map(copyCoord), edgeKinds: nextKinds });
    setMessage(`Edge ${selectedEdge} is terrain-conforming. The live surface renderer will raycast and adaptively subdivide it over hills, peaks, and valleys.`);
  };

  const repairSelectedTransition = () => {
    if (selectedEdge == null || nodes.length < 3) return;
    const previousEdge = (selectedEdge - 1 + edgeKinds.length) % edgeKinds.length;
    const nextEdge = (selectedEdge + 1) % edgeKinds.length;
    const candidateNodeIndices = new Set<number>();
    if (edgeKinds[previousEdge] !== edgeKinds[selectedEdge]) candidateNodeIndices.add(selectedEdge);
    if (edgeKinds[nextEdge] !== edgeKinds[selectedEdge]) candidateNodeIndices.add((selectedEdge + 1) % nodes.length);
    if (!candidateNodeIndices.size) {
      setMessage('This edge does not currently contain a coast-to-terrain transition.');
      return;
    }
    const nextNodes = nodes.map(copyCoord);
    let repaired = 0;
    for (const nodeIndex of candidateNodeIndices) {
      const match = nearestCoastMatch(nextNodes[nodeIndex], coastlines);
      if (!match) continue;
      nextNodes[nodeIndex] = copyCoord(match.point);
      repaired += 1;
    }
    if (!repaired) {
      setMessage('No physical rim was found for this transition.');
      return;
    }
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    pushSnapshot(before, { nodes: nextNodes, edgeKinds: [...edgeKinds] });
    setMessage(`Repaired ${repaired} coast-to-terrain junction${repaired === 1 ? '' : 's'} by anchoring the shared node to the physical mesh rim.`);
  };

  const autoRepairSelectedEdge = () => {
    if (selectedEdge == null) return;
    if (edgeKinds[selectedEdge] === 'coastline') snapSelectedEdgeToMeshRim();
    else {
      const previousEdge = (selectedEdge - 1 + edgeKinds.length) % edgeKinds.length;
      const nextEdge = (selectedEdge + 1) % edgeKinds.length;
      if (edgeKinds[previousEdge] === 'coastline' || edgeKinds[nextEdge] === 'coastline') repairSelectedTransition();
      else drapeSelectedEdgeToTerrain();
    }
  };

  const autoFixWholeBorder = () => {
    if (nodes.length < 3) return;
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    const repaired = autoFixBoundary(nodes, edgeKinds, coastlines);
    if (snapshotKey(before) === snapshotKey(repaired)) {
      setMessage('Auto Fix inspected the whole border but did not find a safer shoreline or straightening change to apply.');
      return;
    }
    pushSnapshot(before, repaired);
    setSelectedNodes([]);
    setSelectedEdge(null);
    setMessage(`Auto Fix rebuilt shoreline spans against the physical mesh rim and simplified obvious inland zig-zags. Controls: ${nodes.length} → ${repaired.nodes.length}. Review Working B before saving.`);
  };

  const focusRepairIssue = (requestedIndex: number) => {
    if (!repairIssues.length) return;
    const index = ((requestedIndex % repairIssues.length) + repairIssues.length) % repairIssues.length;
    const issue = repairIssues[index];
    setIssueCursor(index);
    setSelectedEdge(issue.edgeIndex);
    setSelectedNodes([]);
    setToolMode('select');
    setViewCenter(copyCoord(issue.point));
    setViewZoom((zoom) => Math.max(zoom, 5));
    setMessage(issue.message);
  };

  const resetWorking = () => {
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    pushSnapshot(before, { nodes: baseline.nodes.map(copyCoord), edgeKinds: [...baseline.edgeKinds] });
    setSelectedNodes([]);
    setSelectedEdge(null);
  };

  const saveOverride = async () => {
    if (!selectedCountryOption?.editable || nodes.length < 3) return;
    setSaving(true);
    setError(null);
    setMessage('Saving override and regenerating globe borders…');
    try {
      const response = await fetch('/api/admin/globe/border-surgery/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryId,
          ringId,
          coordinates: wrapRingForStorage(nodes),
          edgeKinds,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      const [nextOverrides, nextManifest] = await Promise.all([
        fetch(`/api/admin/globe/border-surgery/overrides?t=${Date.now()}`).then((res) => res.json()),
        fetch(`/assets/globe/borders/hybrid/v1/manifest.json?borderSurgery=${Date.now()}`).then((res) => res.json()),
      ]);
      setOverrides(nextOverrides);
      setManifest(nextManifest);
      setBaseline({ nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] });
      setUndoStack([]);
      setRedoStack([]);
      setMessage(`Saved ${countryId}/${ringId}. Generator completed successfully.`);
      if (result.assetUrl) {
        const assetResponse = await fetch(`${result.assetUrl}?borderSurgery=${Date.now()}`);
        if (assetResponse.ok) setAsset(await assetResponse.json());
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setMessage(null);
    } finally {
      setSaving(false);
    }
  };

  const removeOverride = async () => {
    if (!selectedOverride || saving) return;
    setSaving(true);
    setError(null);
    setMessage('Removing manual override and regenerating…');
    try {
      const response = await fetch('/api/admin/globe/border-surgery/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryId, ringId }),
      });
      if (!response.ok) throw new Error(await response.text());
      const [nextOverrides, nextManifest] = await Promise.all([
        fetch(`/api/admin/globe/border-surgery/overrides?t=${Date.now()}`).then((res) => res.json()),
        fetch(`/assets/globe/borders/hybrid/v1/manifest.json?borderSurgery=${Date.now()}`).then((res) => res.json()),
      ]);
      setOverrides(nextOverrides);
      setManifest(nextManifest);
      const nextEntry = nextManifest?.countries?.[countryId];
      if (nextEntry?.url) {
        const assetResponse = await fetch(`${nextEntry.url}?borderSurgery=${Date.now()}`);
        setAsset(assetResponse.ok ? await assetResponse.json() : null);
      } else {
        setAsset(null);
        setRingId('mainland');
      }
      setMessage(`Removed manual override for ${countryId}/${ringId}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setMessage(null);
    } finally {
      setSaving(false);
    }
  };

  const sourcePath = (ring: Coord[]) => ring.map((coord, index) => `${index ? 'L' : 'M'} ${geoToScreen(coord, projection).join(' ')}`).join(' ');
  const workingPath = nodes.length ? `${nodes.map((coord, index) => `${index ? 'L' : 'M'} ${geoToScreen(coord, projection).join(' ')}`).join(' ')} Z` : '';

  if (loading) {
    return <div className="min-h-[70vh] bg-[#05070a] p-8 text-sm text-gray-400">Loading Border Surgery…</div>;
  }

  return (
    <div className="min-h-full bg-[#05070a] text-gray-100">
      <div className="mx-auto max-w-[1880px] px-5 py-5 xl:px-7">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/10 bg-[#090c11]/90 px-5 py-4 shadow-2xl shadow-black/30">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-red-300">
              <Scissors className="h-4 w-4" />
              Globe laboratory
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-white">Border Surgery</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-400">
              Make visual corrections to SwingSphere country borders without touching the source GeoJSON. Manual edits are stored as generator overrides and still terrain-conform on the production globe.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/dev/globe" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs font-bold text-gray-200 hover:bg-white/[0.08]">
              <ExternalLink className="h-4 w-4" /> Live globe
            </a>
            <button type="button" onClick={saveOverride} disabled={!dirty || saving || !selectedCountryOption?.editable || intersections.length > 0} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-300/25 bg-red-500/15 px-4 text-xs font-black text-red-100 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-35">
              <Save className="h-4 w-4" /> {saving ? 'Regenerating…' : 'Save & regenerate'}
            </button>
          </div>
        </header>

        <BorderSurfacePreview
          countryId={countryId}
          ringId={ringId}
          nodes={nodes}
          edgeKinds={edgeKinds}
          baselineNodes={baseline.nodes}
          baselineEdgeKinds={baseline.edgeKinds}
          selectedNode={selectedNodes.length === 1 ? selectedNodes[0] : null}
          selectedEdge={selectedEdge}
          onSelectNode={selectSurfaceNode}
          onSelectEdge={selectSurfaceEdge}
          onBeginNodeDrag={beginSurfaceNodeDrag}
          onMoveNodeDrag={moveSurfaceNodeDrag}
          onEndNodeDrag={endSurfaceNodeDrag}
          onAttachSelectedNodeToRim={attachSelectedNodeToMeshRim}
          onAttachSelectedEdgeToRim={snapSelectedEdgeToMeshRim}
          onAttachSelectedEdgeToTerrain={drapeSelectedEdgeToTerrain}
          onFixTransition={repairSelectedTransition}
          onAutoRepair={autoRepairSelectedEdge}
          onAutoFixAll={autoFixWholeBorder}
        />

        <div className="mb-3 mt-5 flex items-center justify-between gap-3 px-1">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Topology reference</div>
            <div className="mt-1 text-xs text-gray-600">Use the 2D editor for country topology, adding/removing controls, and neighbor-boundary checks. Selections stay synchronized with the 3D surgery view above.</div>
          </div>
        </div>

        <div className="grid min-h-[760px] grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_330px]">
          <aside className="rounded-2xl border border-white/10 bg-[#090c11]/90 p-4 shadow-xl shadow-black/20">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Country</div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search countries…" className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-red-300/35" />
            <div className="mt-3 max-h-[320px] space-y-1 overflow-y-auto pr-1">
              {filteredCountries.map((country) => {
                const crossingCount = country.id === countryId && dirty
                  ? neighborIntersections.length
                  : country.neighborIntersectionCount;
                return (
                  <button key={country.id} type="button" onClick={() => setCountryId(country.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition ${country.id === countryId ? 'bg-red-500/14 text-white' : 'text-gray-400 hover:bg-white/[0.045] hover:text-gray-200'}`}>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold">{country.name}</span>
                      <span className="mt-0.5 block text-[9px] uppercase tracking-[0.14em] text-gray-600">{country.id} · {country.status}{crossingCount ? ` · ${crossingCount} neighbor cross${crossingCount === 1 ? '' : 'es'}` : ''}</span>
                    </span>
                    <span title={crossingCount ? `Crosses ${country.id === countryId && dirty ? liveNeighborIds.join(', ') : country.neighborIntersectionCountryIds.join(', ')}` : country.hasAsset ? 'Hybrid asset exists' : 'Source/skipped'} className={`h-2 w-2 shrink-0 rounded-full ${crossingCount ? 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.65)]' : country.hasAsset ? 'bg-emerald-400/80' : country.editable ? 'bg-amber-400/80' : 'bg-gray-700'}`} />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2 text-[10px] leading-5 text-gray-500">
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.65)]" /><span><strong className="font-bold text-gray-300">Red</strong> · border crosses a neighboring country boundary</span></div>
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400/80" /><span><strong className="font-bold text-gray-300">Green</strong> · hybrid border asset exists</span></div>
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-400/80" /><span><strong className="font-bold text-gray-300">Yellow</strong> · source/skipped; first save creates or repairs it</span></div>
              {crossingScanActive ? <div className="mt-1 text-red-200/55">Scanning hybrid assets for neighbor crossings…</div> : null}
            </div>

            <div className="my-4 h-px bg-white/[0.07]" />
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Ring</div>
            <select value={ringId} onChange={(event) => setRingId(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-[#0b0e13] px-3 text-sm text-white outline-none">
              {ringOptions.map((id) => {
                const ring = asset?.rings?.find((candidate) => candidate.id === id);
                return <option key={id} value={id}>{id}{ring?.presentation === false ? ' · technical / hidden' : ''}</option>;
              })}
            </select>
            <div className="mt-3 rounded-xl border border-white/[0.08] bg-black/20 p-3 text-[11px] leading-5 text-gray-400">
              <div className="flex justify-between"><span>Status</span><strong className="text-gray-200">{selectedManifestEntry?.status ?? selectedCountryOption?.status ?? 'source'}</strong></div>
              <div className="flex justify-between"><span>Nodes</span><strong className="text-gray-200">{nodes.length}</strong></div>
              <div className="flex justify-between"><span>Self intersections</span><strong className={intersections.length ? 'text-red-300' : 'text-emerald-300'}>{intersections.length}</strong></div>
              <div className="flex justify-between"><span>Neighbor crossings</span><strong className={neighborIntersections.length ? 'text-red-300' : 'text-emerald-300'}>{neighborIntersections.length}</strong></div>
              {liveNeighborIds.length ? <div className="mt-1 text-[10px] text-red-200/65">Crosses: {liveNeighborIds.join(', ')}</div> : null}
              <div className="flex justify-between"><span>Manual override</span><strong className={selectedOverride ? 'text-amber-200' : 'text-gray-500'}>{selectedOverride ? 'yes' : 'no'}</strong></div>
              <div className="flex justify-between"><span>Presentation</span><strong className={asset?.rings?.find((candidate) => candidate.id === ringId)?.presentation === false ? 'text-amber-200' : 'text-gray-200'}>{asset?.rings?.find((candidate) => candidate.id === ringId)?.presentation === false ? 'technical / hidden' : 'visible'}</strong></div>
            </div>
            {selectedCountryOption?.status === 'source-only' ? (
              <div className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.05] p-3 text-[11px] leading-5 text-cyan-100/75">
                Source-only country. Your first saved surgery will create a manual hybrid target for this country automatically.
              </div>
            ) : null}
          </aside>

          <main className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#07090d] shadow-2xl shadow-black/35">
            <div className="absolute left-4 top-4 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/65 p-2 backdrop-blur-xl">
              <ToolButton active={toolMode === 'select'} icon={<MousePointer2 className="h-4 w-4" />} label="Select / move (V)" onClick={() => setToolMode('select')} />
              <ToolButton active={toolMode === 'add'} icon={<Plus className="h-4 w-4" />} label="Add point (A)" onClick={() => setToolMode('add')} />
              <ToolButton active={toolMode === 'pan'} icon={<Hand className="h-4 w-4" />} label="Pan (H or Space + drag)" onClick={() => setToolMode('pan')} />
              <div className="mx-1 h-7 w-px bg-white/10" />
              <ToolButton icon={<ZoomOut className="h-4 w-4" />} label="Zoom out" onClick={() => zoomAt([VIEW_WIDTH / 2, VIEW_HEIGHT / 2], viewZoom / 1.35)} />
              <ToolButton icon={<ZoomIn className="h-4 w-4" />} label="Zoom in" onClick={() => zoomAt([VIEW_WIDTH / 2, VIEW_HEIGHT / 2], viewZoom * 1.35)} />
              <ToolButton icon={<Maximize2 className="h-4 w-4" />} label="Fit border" onClick={resetView} />
              <span className="min-w-[46px] px-1 text-center text-[10px] font-bold tabular-nums text-gray-500">{Math.round(viewZoom * 100)}%</span>
              <div className="mx-1 h-7 w-px bg-white/10" />
              <ToolButton active={snapMode === 'coastline'} icon={<Waves className="h-4 w-4" />} label="Auto-snap coast" onClick={() => setSnapMode((mode) => mode === 'coastline' ? 'none' : 'coastline')} />
              <ToolButton active={snapMode === 'neighbor'} icon={<GitMerge className="h-4 w-4" />} label="Auto-snap neighbor" onClick={() => setSnapMode((mode) => mode === 'neighbor' ? 'none' : 'neighbor')} />
              <div className="mx-1 h-7 w-px bg-white/10" />
              <ToolButton disabled={!undoStack.length} icon={<Undo2 className="h-4 w-4" />} label="Undo" onClick={undo} />
              <ToolButton disabled={!redoStack.length} icon={<Redo2 className="h-4 w-4" />} label="Redo" onClick={redo} />
            </div>

            <svg
              ref={svgRef}
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
              className={`h-full min-h-[760px] w-full touch-none select-none ${toolMode === 'add' ? 'cursor-crosshair' : toolMode === 'pan' || spacePanning ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
              onWheel={handleWheel}
              onPointerDown={beginCanvasPointer}
              onPointerMove={moveCanvasPointer}
              onPointerUp={endCanvasPointer}
              onPointerCancel={endCanvasPointer}
            >
              <defs>
                <pattern id="border-surgery-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="1" />
                </pattern>
                <filter id="border-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="#07090d" />
              <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#border-surgery-grid)" />

              {showNeighbors ? neighborRings.map((neighbor, index) => (
                <path key={`${neighbor.id}-${index}`} d={`${sourcePath(neighbor.ring)} Z`} fill="rgba(111, 125, 145, 0.045)" stroke="rgba(147, 161, 181, 0.22)" strokeWidth="1.25" />
              )) : null}

              {showCoast ? visibleCoastSegments.map((segment, index) => {
                const a = geoToScreen(segment.a, projection);
                const b = geoToScreen(segment.b, projection);
                return <line key={`${segment.pathId}-${index}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="rgba(65, 215, 255, 0.45)" strokeWidth="2.2" strokeLinecap="round" />;
              }) : null}

              {showSource ? sourceRings.map((ring, index) => (
                <path key={`source-${index}`} d={`${sourcePath(ring)} Z`} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeDasharray="7 7" />
              )) : null}

              {workingPath ? <path d={workingPath} fill="rgba(255,70,92,0.055)" stroke="rgba(255,70,92,0.14)" strokeWidth="9" filter="url(#border-glow)" /> : null}

              {nodes.map((coord, index) => {
                const next = nodes[(index + 1) % nodes.length];
                const a = geoToScreen(coord, projection);
                const b = geoToScreen(next, projection);
                const selected = selectedEdge === index;
                const coast = edgeKinds[index] === 'coastline';
                return (
                  <line
                    key={`edge-${index}`}
                    x1={a[0]}
                    y1={a[1]}
                    x2={b[0]}
                    y2={b[1]}
                    stroke={selected ? '#ffffff' : coast ? '#ff5268' : '#f5dfe3'}
                    strokeWidth={selected ? 6 : 3}
                    strokeLinecap="round"
                    className={toolMode === 'add' ? 'cursor-crosshair' : 'cursor-pointer'}
                    onPointerDown={(event) => addPointOnEdge(event, index)}
                  />
                );
              })}

              {intersections.map((intersection, index) => {
                const point = geoToScreen(intersection.point, projection);
                return (
                  <g key={`intersection-${index}`} transform={`translate(${point[0]} ${point[1]})`}>
                    <circle r="11" fill="rgba(255,45,70,0.15)" stroke="#ff3854" strokeWidth="2" />
                    <path d="M -5 -5 L 5 5 M 5 -5 L -5 5" stroke="#ff6a7d" strokeWidth="2" />
                  </g>
                );
              })}

              {neighborIntersections.map((intersection, index) => {
                const point = geoToScreen(intersection.point, projection);
                return (
                  <g key={`neighbor-intersection-${intersection.neighborId}-${index}`} transform={`translate(${point[0]} ${point[1]})`} className="pointer-events-none">
                    <circle r="9" fill="rgba(255,38,62,0.22)" stroke="#ff263e" strokeWidth="2.5" />
                    <circle r="2.5" fill="#fff" />
                    <text x="12" y="4" fill="#ff9aa8" fontSize="10" fontWeight="800">{intersection.neighborId}</text>
                  </g>
                );
              })}

              {repairIssues.map((issue, index) => {
                const point = geoToScreen(issue.point, projection);
                const active = index === issueCursor;
                return (
                  <g key={`repair-issue-${issue.kind}-${issue.edgeIndex}-${index}`} transform={`translate(${point[0]} ${point[1]})`} className="pointer-events-none">
                    <circle r={active ? 11 : 8} fill={issue.severity === 'error' ? 'rgba(255,59,83,0.2)' : 'rgba(251,191,36,0.16)'} stroke={issue.severity === 'error' ? '#ff465c' : '#fbbf24'} strokeWidth={active ? 3 : 2} />
                    <circle r="2.5" fill="#fff" />
                  </g>
                );
              })}

              {nodes.map((coord, index) => {
                const point = geoToScreen(coord, projection);
                const selected = selectedNodes.includes(index);
                return (
                  <circle
                    key={`node-${index}`}
                    cx={point[0]}
                    cy={point[1]}
                    r={selected ? 8 : 5.5}
                    fill={selected ? '#ffffff' : '#0b0d11'}
                    stroke={selected ? '#ff465c' : '#ff9eaa'}
                    strokeWidth={selected ? 4 : 2.5}
                    className="cursor-grab active:cursor-grabbing"
                    onPointerDown={(event) => beginNodeDrag(event, index)}
                    onPointerMove={(event) => moveNodeDrag(event, index)}
                    onPointerUp={(event) => endNodeDrag(event, index)}
                  />
                );
              })}
            </svg>

            <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-[10px] leading-5 text-gray-500 backdrop-blur-xl">
              <div><span className="text-gray-300">Pink-red</span> = coast-preserving edge · <span className="text-gray-300">white</span> = political/terrain-conformed · <span className="text-cyan-300/70">cyan</span> = physical land.glb coast</div>
              <div className="mt-0.5 text-gray-600">Wheel = zoom at cursor · Space + drag / middle mouse = pan · H = hand tool · Fit returns to country</div>
            </div>
          </main>

          <aside className="rounded-2xl border border-white/10 bg-[#090c11]/90 p-4 shadow-xl shadow-black/20">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Precision actions</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ActionButton icon={<Trash2 className="h-4 w-4" />} label="Delete node" disabled={!selectedNodes.length || nodes.length - selectedNodes.length < 3} onClick={deleteSelectedNodes} />
              <ActionButton icon={<CornerDownRight className="h-4 w-4" />} label="Straighten run" disabled={selectedNodes.length !== 2} onClick={straightenSelectedRun} />
              <ActionButton icon={<Waves className="h-4 w-4" />} label="Snap to coast" disabled={selectedNodes.length !== 1} onClick={() => snapSelectedNode('coastline')} />
              <ActionButton icon={<GitMerge className="h-4 w-4" />} label="Snap neighbor" disabled={selectedNodes.length !== 1} onClick={() => snapSelectedNode('neighbor')} />
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-200"><Crosshair className="h-4 w-4 text-red-300" /> Selected edge</div>
              <p className="mt-1 text-[11px] leading-5 text-gray-500">Click a line in Select mode, then tell the runtime whether interpolation should preserve the physical coastline or climb the terrain.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={selectedEdge == null} onClick={() => setSelectedEdgeKind('coastline')} className={`rounded-lg border px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] ${selectedEdge != null && edgeKinds[selectedEdge] === 'coastline' ? 'border-red-300/35 bg-red-500/15 text-red-100' : 'border-white/10 bg-white/[0.03] text-gray-500'} disabled:opacity-30`}>Coastline</button>
                <button type="button" disabled={selectedEdge == null} onClick={() => setSelectedEdgeKind('political')} className={`rounded-lg border px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] ${selectedEdge != null && edgeKinds[selectedEdge] === 'political' ? 'border-white/25 bg-white/[0.07] text-white' : 'border-white/10 bg-white/[0.03] text-gray-500'} disabled:opacity-30`}>Terrain</button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ActionButton icon={<Waves className="h-4 w-4" />} label="Snap segment to mesh rim" disabled={selectedEdge == null} onClick={snapSelectedEdgeToMeshRim} />
                <ActionButton icon={<Activity className="h-4 w-4" />} label="Drape to terrain" disabled={selectedEdge == null} onClick={drapeSelectedEdgeToTerrain} />
                <ActionButton icon={<GitMerge className="h-4 w-4" />} label="Repair transition" disabled={selectedEdge == null} onClick={repairSelectedTransition} />
                <ActionButton icon={<Crosshair className="h-4 w-4" />} label="Auto repair edge" disabled={selectedEdge == null} onClick={autoRepairSelectedEdge} />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-gray-200">Conformance issues</div>
                  <div className="mt-1 text-[10px] text-gray-500">Rim departures and coast/terrain junctions that need review.</div>
                </div>
                <div className={`rounded-lg border px-2 py-1 font-mono text-[10px] ${repairIssues.length ? 'border-amber-300/20 bg-amber-500/[0.06] text-amber-200' : 'border-emerald-300/15 bg-emerald-500/[0.05] text-emerald-200'}`}>{repairIssues.length}</div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button type="button" disabled={!repairIssues.length} onClick={() => focusRepairIssue(issueCursor - 1)} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-[10px] font-bold text-gray-400 hover:bg-white/[0.07] disabled:opacity-30">Previous</button>
                <button type="button" disabled={!repairIssues.length} onClick={() => focusRepairIssue(issueCursor)} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-[10px] font-bold text-gray-300 hover:bg-white/[0.07] disabled:opacity-30">Fit issue</button>
                <button type="button" disabled={!repairIssues.length} onClick={() => focusRepairIssue(issueCursor + 1)} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-[10px] font-bold text-gray-400 hover:bg-white/[0.07] disabled:opacity-30">Next</button>
              </div>
              {repairIssues.length ? <div className="mt-2 text-[10px] leading-4 text-amber-100/65">{repairIssues[Math.min(issueCursor, repairIssues.length - 1)]?.message}</div> : <div className="mt-2 text-[10px] text-emerald-200/55">No 2D conformance warnings detected.</div>}
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 p-3">
              <div className="text-xs font-bold text-gray-200">Reference layers</div>
              <LayerToggle checked={showCoast} label="Physical land.glb coastline" accent="cyan" onChange={setShowCoast} />
              <LayerToggle checked={showSource} label="Original source GeoJSON" accent="white" onChange={setShowSource} />
              <LayerToggle checked={showNeighbors} label="Neighboring countries" accent="gray" onChange={setShowNeighbors} />
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 p-3 text-[11px] leading-5 text-gray-500">
              <div className="flex items-center gap-2 font-bold text-gray-200"><Activity className="h-4 w-4 text-red-300" /> Workflow</div>
              <ol className="mt-2 space-y-1.5">
                <li>1. Drag a bad node or press Delete to remove a divot.</li>
                <li>2. Use Add Point to split an edge exactly where needed.</li>
                <li>3. Select a coastal edge and use Snap segment to mesh rim to rebuild it along one continuous cyan shoreline path.</li>
                <li>4. Mark inland edges Terrain; the runtime raycasts and adaptively drapes them over peaks, slopes, and valleys.</li>
                <li>5. Repair coast/terrain transitions, step through conformance issues, then verify Working B against Saved A below.</li>
              </ol>
            </div>

            {intersections.length ? (
              <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/[0.08] p-3 text-[11px] leading-5 text-red-100/85">
                Save is blocked because the edited ring has {intersections.length} self-intersection{intersections.length === 1 ? '' : 's'}. Red × markers show where edges cross.
              </div>
            ) : null}

            {message ? <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-500/[0.06] p-3 text-[11px] leading-5 text-emerald-100/80">{message}</div> : null}
            {error ? <div className="mt-4 rounded-xl border border-red-300/20 bg-red-500/[0.08] p-3 text-[11px] leading-5 text-red-100/85">{error}</div> : null}

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={resetWorking} disabled={!dirty} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-xs font-bold text-gray-300 hover:bg-white/[0.07] disabled:opacity-30"><RotateCcw className="h-4 w-4" /> Reset edits</button>
              <button type="button" onClick={removeOverride} disabled={!selectedOverride || saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-300/15 bg-amber-500/[0.045] px-3 py-2.5 text-xs font-bold text-amber-100/80 hover:bg-amber-500/[0.08] disabled:opacity-30"><Trash2 className="h-4 w-4" /> Remove override</button>
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 p-3 font-mono text-[10px] leading-5 text-gray-500">
              <div className="flex justify-between"><span>country</span><span className="text-gray-300">{countryId}</span></div>
              <div className="flex justify-between"><span>ring</span><span className="text-gray-300">{ringId}</span></div>
              <div className="flex justify-between"><span>selected nodes</span><span className="text-gray-300">{selectedNodes.join(', ') || 'none'}</span></div>
              <div className="flex justify-between"><span>selected edge</span><span className="text-gray-300">{selectedEdge ?? 'none'}</span></div>
              <div className="flex justify-between"><span>dirty</span><span className={dirty ? 'text-amber-300' : 'text-gray-300'}>{String(dirty)}</span></div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

const SurfaceMetric: React.FC<{ label: string; value: React.ReactNode; alert?: boolean }> = ({ label, value, alert = false }) => (
  <div className="bg-[#090c11] px-4 py-3">
    <div className="text-[9px] font-black uppercase tracking-[0.16em] text-gray-600">{label}</div>
    <div className={`mt-1 font-mono text-sm font-bold ${alert ? 'text-red-300' : 'text-gray-200'}`}>{value}</div>
  </div>
);

const ToolButton: React.FC<{ icon: React.ReactNode; label: string; active?: boolean; disabled?: boolean; onClick: () => void }> = ({ icon, label, active = false, disabled = false, onClick }) => (
  <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${active ? 'border-red-300/30 bg-red-500/15 text-red-100' : 'border-white/10 bg-white/[0.035] text-gray-400 hover:bg-white/[0.075] hover:text-white'} disabled:opacity-30`}>
    {icon}
  </button>
);

const ActionButton: React.FC<{ icon: React.ReactNode; label: string; disabled?: boolean; onClick: () => void }> = ({ icon, label, disabled = false, onClick }) => (
  <button type="button" disabled={disabled} onClick={onClick} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-2 text-[11px] font-bold text-gray-300 transition hover:border-white/15 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-30">
    {icon}{label}
  </button>
);

const LayerToggle: React.FC<{ checked: boolean; label: string; accent: 'cyan' | 'white' | 'gray'; onChange: (checked: boolean) => void }> = ({ checked, label, accent, onChange }) => (
  <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-[11px] text-gray-400">
    <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${accent === 'cyan' ? 'bg-cyan-300/70' : accent === 'white' ? 'bg-white/65' : 'bg-gray-500'}`} />{label}</span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-red-500" />
  </label>
);

export default BorderSurgeryPage;
