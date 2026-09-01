export type LngLat = { lng: number; lat: number };

export type BuildingGeometryFailureCode =
  | 'empty_geometry'
  | 'unsupported_geometry'
  | 'malformed_coordinates'
  | 'non_finite_coordinate'
  | 'coordinate_out_of_range'
  | 'ring_too_short'
  | 'pathological_vertex_count';

export type BuildingGeometryAudit = {
  valid: boolean;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  fingerprint: string | null;
  failures: BuildingGeometryFailureCode[];
  polygonCount: number;
  ringCount: number;
  vertexCount: number;
};

export type ProviderFootprintFeature = {
  id?: string | number | null;
  geometry?: GeoJSON.Geometry | null;
  properties?: Record<string, unknown> | null;
  source?: string | null;
  sourceLayer?: string | null;
};

export type IndividualBuildingFootprint = {
  id: string;
  fingerprint: string;
  geometry: GeoJSON.Polygon;
  providerFeatureIds: string[];
  source: string | null;
  sourceLayer: string | null;
  pinIntersects: boolean;
  pinToFootprintMeters: number;
  pinToCentroidMeters: number;
  vertexCount: number;
};

export type FootprintWorkspaceFailureCode =
  | 'no_provider_features'
  | 'no_usable_footprints'
  | 'all_footprints_outside_radius'
  | 'workspace_limit_reached'
  | BuildingGeometryFailureCode;

export type IndividualFootprintWorkspace = {
  footprints: IndividualBuildingFootprint[];
  failures: Array<{ code: FootprintWorkspaceFailureCode; count: number }>;
  diagnostics: {
    providerFeatureCount: number;
    extractedPolygonCount: number;
    duplicatePolygonCount: number;
    unsupportedFeatureCount: number;
    malformedFeatureCount: number;
    omittedOutsideRadiusCount: number;
    truncated: boolean;
  };
};

export const BUILDING_GEOMETRY_LIMITS = Object.freeze({
  maxVerticesPerFootprint: 20_000,
  maxWorkspaceFootprints: 600,
  defaultRadiusMeters: 100,
});

const roundCoordinate = (value: number): string => Number(value).toFixed(7);

const sameCoordinate = (a: number[], b: number[]): boolean =>
  Number(a[0]) === Number(b[0]) && Number(a[1]) === Number(b[1]);

const canonicalRotation = (tokens: string[]): string => {
  if (!tokens.length) return '';
  let best = '';
  for (let index = 0; index < tokens.length; index += 1) {
    const candidate = [...tokens.slice(index), ...tokens.slice(0, index)].join(';');
    if (!best || candidate < best) best = candidate;
  }
  return best;
};

const canonicalRing = (ring: number[][]): string => {
  const open = ring.length > 1 && sameCoordinate(ring[0], ring[ring.length - 1])
    ? ring.slice(0, -1)
    : ring.slice();
  const tokens = open.map((coordinate) => `${roundCoordinate(coordinate[0])},${roundCoordinate(coordinate[1])}`);
  const forward = canonicalRotation(tokens);
  const reverse = canonicalRotation([...tokens].reverse());
  return forward < reverse ? forward : reverse;
};

const canonicalPolygon = (polygon: number[][][]): string => {
  if (!polygon.length) return '';
  const outer = canonicalRing(polygon[0]);
  const holes = polygon.slice(1).map(canonicalRing).sort();
  return [outer, ...holes].join('|');
};

const fnv1a = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const geometryFingerprint = (
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): string => {
  const polygons = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates)
    .map((polygon) => canonicalPolygon(polygon as number[][][]))
    .sort();
  const vertexCount = polygons.reduce((total, polygon) => total + polygon.split(';').length, 0);
  return `footprint-v2-${fnv1a(polygons.join('||'))}-${polygons.length}-${vertexCount}`;
};

const addFailure = (
  failures: BuildingGeometryFailureCode[],
  failure: BuildingGeometryFailureCode,
) => {
  if (!failures.includes(failure)) failures.push(failure);
};

const normalizeRing = (
  input: unknown,
  failures: BuildingGeometryFailureCode[],
): number[][] | null => {
  if (!Array.isArray(input)) {
    addFailure(failures, 'malformed_coordinates');
    return null;
  }
  const ring: number[][] = [];
  for (const coordinate of input) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      addFailure(failures, 'malformed_coordinates');
      return null;
    }
    const lng = Number(coordinate[0]);
    const lat = Number(coordinate[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      addFailure(failures, 'non_finite_coordinate');
      return null;
    }
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      addFailure(failures, 'coordinate_out_of_range');
      return null;
    }
    const next = [lng, lat];
    if (!ring.length || !sameCoordinate(ring[ring.length - 1], next)) ring.push(next);
  }
  if (ring.length > 1 && !sameCoordinate(ring[0], ring[ring.length - 1])) ring.push([...ring[0]]);
  if (ring.length < 4) {
    addFailure(failures, 'ring_too_short');
    return null;
  }
  return ring;
};

const normalizePolygon = (
  input: unknown,
  failures: BuildingGeometryFailureCode[],
): number[][][] | null => {
  if (!Array.isArray(input) || !input.length) {
    addFailure(failures, 'empty_geometry');
    return null;
  }
  const rings = input
    .map((ring) => normalizeRing(ring, failures))
    .filter((ring): ring is number[][] => Boolean(ring));
  return rings.length === input.length && rings.length ? rings : null;
};

export const auditBuildingGeometry = (geometry: GeoJSON.Geometry | null | undefined): BuildingGeometryAudit => {
  const failures: BuildingGeometryFailureCode[] = [];
  if (!geometry) {
    return { valid: false, geometry: null, fingerprint: null, failures: ['empty_geometry'], polygonCount: 0, ringCount: 0, vertexCount: 0 };
  }
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
    return { valid: false, geometry: null, fingerprint: null, failures: ['unsupported_geometry'], polygonCount: 0, ringCount: 0, vertexCount: 0 };
  }

  const rawPolygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const polygons = rawPolygons
    .map((polygon) => normalizePolygon(polygon, failures))
    .filter((polygon): polygon is number[][][] => Boolean(polygon));
  const ringCount = polygons.reduce((total, polygon) => total + polygon.length, 0);
  const vertexCount = polygons.reduce(
    (total, polygon) => total + polygon.reduce((ringTotal, ring) => ringTotal + ring.length, 0),
    0,
  );
  if (vertexCount > BUILDING_GEOMETRY_LIMITS.maxVerticesPerFootprint) {
    addFailure(failures, 'pathological_vertex_count');
  }
  if (!polygons.length && !failures.length) addFailure(failures, 'empty_geometry');
  const normalized = polygons.length === 1
    ? { type: 'Polygon' as const, coordinates: polygons[0] }
    : polygons.length > 1
      ? { type: 'MultiPolygon' as const, coordinates: polygons }
      : null;
  const valid = Boolean(normalized) && failures.length === 0;
  return {
    valid,
    geometry: valid ? normalized : null,
    fingerprint: valid && normalized ? geometryFingerprint(normalized) : null,
    failures,
    polygonCount: polygons.length,
    ringCount,
    vertexCount,
  };
};

const metersPerDegree = (latitude: number) => ({
  lng: Math.max(1, 111_320 * Math.cos((latitude * Math.PI) / 180)),
  lat: 110_540,
});

const toLocalMeters = (coordinate: number[], origin: LngLat) => {
  const scale = metersPerDegree(origin.lat);
  return { x: (coordinate[0] - origin.lng) * scale.lng, y: (coordinate[1] - origin.lat) * scale.lat };
};

const pointInRing = (point: [number, number], ring: number[][]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const pointInPolygon = (point: [number, number], polygon: number[][][]): boolean =>
  Boolean(polygon[0] && pointInRing(point, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(point, hole)));

export const pointIntersectsBuildingGeometry = (point: LngLat, geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): boolean => {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => pointInPolygon([point.lng, point.lat], polygon as number[][][]));
};

const distanceToSegment = (
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator)) : 0;
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
};

export const pointToBuildingDistanceMeters = (point: LngLat, geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): number => {
  if (pointIntersectsBuildingGeometry(point, geometry)) return 0;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let minimum = Number.POSITIVE_INFINITY;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let index = 0; index < ring.length - 1; index += 1) {
        minimum = Math.min(minimum, distanceToSegment(
          { x: 0, y: 0 },
          toLocalMeters(ring[index], point),
          toLocalMeters(ring[index + 1], point),
        ));
      }
    }
  }
  return minimum;
};

export const getBuildingGeometryCenter = (geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): [number, number] => {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const polygon of polygons) for (const ring of polygon) for (const coordinate of ring) {
    minLng = Math.min(minLng, coordinate[0]);
    minLat = Math.min(minLat, coordinate[1]);
    maxLng = Math.max(maxLng, coordinate[0]);
    maxLat = Math.max(maxLat, coordinate[1]);
  }
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
};

export const haversineMeters = (a: LngLat, b: LngLat): number => {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
};

const incrementFailure = (counts: Map<FootprintWorkspaceFailureCode, number>, code: FootprintWorkspaceFailureCode) => {
  counts.set(code, (counts.get(code) ?? 0) + 1);
};

export const extractIndividualBuildingFootprints = (
  features: ProviderFootprintFeature[],
  center: LngLat,
  options: { radiusMeters?: number; maxFootprints?: number } = {},
): IndividualFootprintWorkspace => {
  const radiusMeters = options.radiusMeters ?? BUILDING_GEOMETRY_LIMITS.defaultRadiusMeters;
  const maxFootprints = options.maxFootprints ?? BUILDING_GEOMETRY_LIMITS.maxWorkspaceFootprints;
  const byFingerprint = new Map<string, IndividualBuildingFootprint>();
  const failureCounts = new Map<FootprintWorkspaceFailureCode, number>();
  let extractedPolygonCount = 0;
  let duplicatePolygonCount = 0;
  let unsupportedFeatureCount = 0;
  let malformedFeatureCount = 0;
  let omittedOutsideRadiusCount = 0;
  let truncated = false;

  if (!features.length) incrementFailure(failureCounts, 'no_provider_features');
  outer: for (const feature of features) {
    const audit = auditBuildingGeometry(feature.geometry);
    if (!audit.valid || !audit.geometry) {
      if (audit.failures.includes('unsupported_geometry')) unsupportedFeatureCount += 1;
      else malformedFeatureCount += 1;
      audit.failures.forEach((failure) => incrementFailure(failureCounts, failure));
      continue;
    }
    const polygons = audit.geometry.type === 'Polygon' ? [audit.geometry.coordinates] : audit.geometry.coordinates;
    for (const coordinates of polygons) {
      extractedPolygonCount += 1;
      const geometry: GeoJSON.Polygon = { type: 'Polygon', coordinates };
      const pinToFootprintMeters = pointToBuildingDistanceMeters(center, geometry);
      if (pinToFootprintMeters > radiusMeters) {
        omittedOutsideRadiusCount += 1;
        continue;
      }
      const fingerprint = geometryFingerprint(geometry);
      const featureId = feature.id === undefined || feature.id === null ? null : String(feature.id);
      const existing = byFingerprint.get(fingerprint);
      if (existing) {
        duplicatePolygonCount += 1;
        if (featureId && !existing.providerFeatureIds.includes(featureId)) existing.providerFeatureIds.push(featureId);
        continue;
      }
      if (byFingerprint.size >= maxFootprints) {
        truncated = true;
        incrementFailure(failureCounts, 'workspace_limit_reached');
        break outer;
      }
      const footprintAudit = auditBuildingGeometry(geometry);
      const [centroidLng, centroidLat] = getBuildingGeometryCenter(geometry);
      byFingerprint.set(fingerprint, {
        id: fingerprint,
        fingerprint,
        geometry,
        providerFeatureIds: featureId ? [featureId] : [],
        source: feature.source ?? null,
        sourceLayer: feature.sourceLayer ?? null,
        pinIntersects: pinToFootprintMeters === 0,
        pinToFootprintMeters,
        pinToCentroidMeters: haversineMeters(center, { lng: centroidLng, lat: centroidLat }),
        vertexCount: footprintAudit.vertexCount,
      });
    }
  }

  if (features.length && !byFingerprint.size) {
    incrementFailure(failureCounts, omittedOutsideRadiusCount ? 'all_footprints_outside_radius' : 'no_usable_footprints');
  }
  const footprints = Array.from(byFingerprint.values()).sort((a, b) =>
    a.pinToFootprintMeters - b.pinToFootprintMeters
    || a.pinToCentroidMeters - b.pinToCentroidMeters
    || a.fingerprint.localeCompare(b.fingerprint));
  return {
    footprints,
    failures: Array.from(failureCounts, ([code, count]) => ({ code, count })),
    diagnostics: {
      providerFeatureCount: features.length,
      extractedPolygonCount,
      duplicatePolygonCount,
      unsupportedFeatureCount,
      malformedFeatureCount,
      omittedOutsideRadiusCount,
      truncated,
    },
  };
};
