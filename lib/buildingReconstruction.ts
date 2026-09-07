import {
  extractIndividualBuildingFootprints,
  getBuildingGeometryCenter,
  type LngLat,
  type ProviderFootprintFeature,
} from './buildingGeometry';
import { isAuthoritativeLocationSource } from './buildingVerification';

export const GENERATED_BUILDING_ID_PREFIX = 'swingsphere-generated:';
export const GENERATED_BUILDING_SOURCE = 'SwingSphere reconstructed estimate';

export type GeneratedBuildingCandidate = {
  feature: ProviderFootprintFeature;
  method: 'nearby-orientation-estimate' | 'default-rectangle-estimate';
  confidence: number;
  widthMeters: number;
  depthMeters: number;
  heightMeters: number;
  bearingDegrees: number;
  sourceLabel: string;
  sourceDetail: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const median = (values: number[]): number | null => {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return null;
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2 ? finite[middle] : (finite[middle - 1] + finite[middle]) / 2;
};

const toLocalMeters = (coordinate: number[], origin: LngLat): [number, number] => {
  const lngScale = Math.max(1, 111_320 * Math.cos((origin.lat * Math.PI) / 180));
  const latScale = 110_540;
  return [(Number(coordinate[0]) - origin.lng) * lngScale, (Number(coordinate[1]) - origin.lat) * latScale];
};

const toLngLat = (point: [number, number], origin: LngLat): [number, number] => {
  const lngScale = Math.max(1, 111_320 * Math.cos((origin.lat * Math.PI) / 180));
  const latScale = 110_540;
  return [origin.lng + point[0] / lngScale, origin.lat + point[1] / latScale];
};

const footprintDimensions = (geometry: GeoJSON.Polygon, origin: LngLat) => {
  const ring = geometry.coordinates[0] ?? [];
  if (ring.length < 4) return null;
  const local = ring.map((coordinate) => toLocalMeters(coordinate, origin));
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let longestEdge = 0;
  let bearingRadians = 0;
  for (let index = 0; index < local.length; index += 1) {
    const [x, y] = local[index];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    const next = local[(index + 1) % local.length];
    const dx = next[0] - x;
    const dy = next[1] - y;
    const length = Math.hypot(dx, dy);
    if (length > longestEdge) {
      longestEdge = length;
      bearingRadians = Math.atan2(dy, dx);
    }
  }
  const width = Math.max(1, maxX - minX);
  const depth = Math.max(1, maxY - minY);
  return {
    widthMeters: Math.max(width, depth),
    depthMeters: Math.min(width, depth),
    bearingRadians,
  };
};

const rectangleGeometry = (
  center: LngLat,
  widthMeters: number,
  depthMeters: number,
  bearingRadians: number,
): GeoJSON.Polygon => {
  const halfW = widthMeters / 2;
  const halfD = depthMeters / 2;
  const cos = Math.cos(bearingRadians);
  const sin = Math.sin(bearingRadians);
  const corners: Array<[number, number]> = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ];
  const ring = corners.map(([x, y]) => {
    const rotated: [number, number] = [x * cos - y * sin, x * sin + y * cos];
    return toLngLat(rotated, center);
  });
  ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
};

export const createGeneratedBuildingCandidate = (args: {
  listingId: string;
  center: LngLat;
  primaryFeatures: ProviderFootprintFeature[];
  locationConfidence?: number | null;
  geocoderSource?: string | null;
  manuallyAdjusted?: boolean;
}): GeneratedBuildingCandidate | null => {
  const authoritative = isAuthoritativeLocationSource(args.geocoderSource, args.manuallyAdjusted);
  if (!authoritative || (args.locationConfidence ?? 0) < 0.97) return null;

  const workspace = extractIndividualBuildingFootprints(args.primaryFeatures, args.center, {
    radiusMeters: 120,
    maxFootprints: 80,
  });
  if (workspace.footprints.some((footprint) => footprint.pinIntersects)) return null;

  const nearby = workspace.footprints
    .filter((footprint) => footprint.pinToFootprintMeters <= 80)
    .sort((a, b) => a.pinToFootprintMeters - b.pinToFootprintMeters)
    .slice(0, 12);
  const metrics = nearby
    .map((footprint) => footprintDimensions(footprint.geometry, args.center))
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  const widthMeters = clamp(median(metrics.map((metric) => metric.widthMeters)) ?? 20, 10, 36);
  const depthMeters = clamp(median(metrics.map((metric) => metric.depthMeters)) ?? 14, 8, 28);
  const nearestMetric = metrics[0] ?? null;
  const bearingRadians = nearestMetric?.bearingRadians ?? 0;
  const method: GeneratedBuildingCandidate['method'] = nearestMetric
    ? 'nearby-orientation-estimate'
    : 'default-rectangle-estimate';
  const confidence = nearestMetric ? 0.62 : 0.45;
  const heightMeters = 7.5;
  const geometry = rectangleGeometry(args.center, widthMeters, depthMeters, bearingRadians);
  const sourceDetail = nearestMetric
    ? `No sourced footprint intersected the verified venue pin. SwingSphere estimated a ${widthMeters.toFixed(0)}×${depthMeters.toFixed(0)}m footprint using the orientation and typical size of nearby mapped buildings.`
    : `No sourced footprint intersected the verified venue pin and nearby geometry was insufficient for orientation inference. SwingSphere created a conservative ${widthMeters.toFixed(0)}×${depthMeters.toFixed(0)}m rectangular estimate centered on the verified pin.`;

  return {
    method,
    confidence,
    widthMeters,
    depthMeters,
    heightMeters,
    bearingDegrees: ((bearingRadians * 180) / Math.PI + 360) % 360,
    sourceLabel: GENERATED_BUILDING_SOURCE,
    sourceDetail,
    feature: {
      id: `${GENERATED_BUILDING_ID_PREFIX}${args.listingId}`,
      geometry,
      properties: {
        render_height: heightMeters,
        render_min_height: 0,
        swingsphere_generated: true,
        generation_method: method,
        generation_confidence: confidence,
      },
      source: GENERATED_BUILDING_SOURCE,
      sourceLayer: 'generated-building',
    },
  };
};

export const isGeneratedBuildingFeatureId = (featureId: string | null | undefined): boolean =>
  Boolean(featureId?.startsWith(GENERATED_BUILDING_ID_PREFIX));

export const generatedBuildingCenter = (candidate: GeneratedBuildingCandidate): [number, number] =>
  getBuildingGeometryCenter(candidate.feature.geometry as GeoJSON.Polygon);
