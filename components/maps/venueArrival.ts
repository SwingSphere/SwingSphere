import type {
  FilterSpecification,
  FillExtrusionLayerSpecification,
  MapGeoJSONFeature,
  Map as MapLibreMap,
  SourceSpecification,
  VectorSourceSpecification,
} from 'maplibre-gl';
import type { Listing } from '../../types';
import { getListingDisplayCoords } from './listingGeoJson';

export const BUILDINGS_LAYER_ID = 'venue-buildings-3d';
export const SELECTED_BUILDING_LAYER_ID = 'venue-selected-building-3d';
export const INTERACTION_SELECTED_BUILDING_LAYER_ID = 'venue-interaction-selected-building-3d';

const STABLE_BEARING = -18;
const VENUE_RESOLVER_DIAGNOSTIC_LIMIT = 10000;

const venueResolverDiagnosticsEnabled = () =>
  typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);

const logVenueResolver = (label: string, details?: Record<string, unknown>) => {
  if (!venueResolverDiagnosticsEnabled()) return;
  console.info(`[VenueResolver] ${label}`, details ?? {});
};

const assertVenueResolverLoopLimit = (
  label: string,
  count: number,
  details: Record<string, unknown>,
) => {
  if (!venueResolverDiagnosticsEnabled()) return;
  if (count !== VENUE_RESOLVER_DIAGNOSTIC_LIMIT + 1) return;
  console.warn(`[VenueResolver] diagnostic volume exceeded: ${label}`, {
    count,
    limit: VENUE_RESOLVER_DIAGNOSTIC_LIMIT,
    ...details,
  });
};

export interface BuildingsSourceConfig {
  id: string;
  type: 'vector';
  url?: string;
  tiles?: string[];
  attribution?: string;
}

export type BuildingsIdentifierConfig =
  | { strategy: 'feature-id' }
  | { strategy: 'property'; property: string };

export interface BuildingsConfig {
  source: BuildingsSourceConfig;
  sourceLayer: string;
  identifier: BuildingsIdentifierConfig;
}

export interface SelectedBuildingConfig {
  enabled: boolean;
  color: string;
  opacity: number;
  heightBoost: number;
}

export interface LocalBuildingsConfig {
  enabled: boolean;
  radiusMeters: number;
  maxBuildings: number;
  minZoom: number;
  opacity: number;
  overlapToleranceMeters: number;
}

export interface VenueArrivalMotionConfig {
  enabled: boolean;
  zoom: number;
  pitch: number;
  durationMs: number;
  padding: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
}

export interface SelectedBuildingMatch {
  feature: MapGeoJSONFeature;
  buildingId: string;
  lngLat: { lng: number; lat: number };
  containsVenuePoint: boolean;
  edgeDistanceMeters: number;
  distanceMeters: number;
}

export interface VenueBuildingContext {
  selectedBuilding: SelectedBuildingMatch | null;
  contextBuildingIds: string[];
  radiusMeters: number;
  queriedFeatureCount: number;
  overlapStats: {
    candidateCountBeforeOverlapFilter: number;
    removedSelectedOverlapCount: number;
    removedContextOverlapCount: number;
  };
}

export interface VenueArrivalConfig {
  enable3DBuildings: boolean;
  enableVenueScopedBuildings: boolean;
  enableVenueContextBuildings: boolean;
  enableGlobalZoomBuildings: boolean;
  enableCameraPitch: boolean;
  enableCameraBearing: boolean;
  arrival: VenueArrivalMotionConfig;
  buildings: BuildingsConfig;
  buildingStartZoom: number;
  buildingFullZoom: number;
  buildingHeightScale: number;
  buildingFallbackHeight: number;
  localBuildings: LocalBuildingsConfig;
  pitchStartZoom: number;
  pitchFullZoom: number;
  maxPitch: number;
  defaultBearing: number;
  selectedBuilding: SelectedBuildingConfig;
}

export const buildingInteractionVisuals = {
  context: {
    color: '#161b22',
    opacity: 0.08,
    hoverColor: '#1f2631',
    hoverOpacityBoost: 0.045,
  },
  provider: {
    selectedColor: '#f45d73',
    selectedOpacity: 0.34,
    selectedHeightBoost: 1.025,
    selectedOutlineOpacity: 0.22,
  },
  authored: {
    selectedColor: '#ff6a7c',
    selectedOpacity: 0.46,
    selectedHeightBoost: 1.055,
    selectedOutlineOpacity: 0.28,
  },
  hover: {
    opacityBoost: 0.035,
    outlineOpacity: 0.18,
  },
} as const;

export const venueArrival: VenueArrivalConfig = {
  enable3DBuildings: true,
  enableVenueScopedBuildings: true,
  enableVenueContextBuildings: false,
  enableGlobalZoomBuildings: false,
  enableCameraPitch: true,
  enableCameraBearing: true,

  arrival: {
    enabled: true,
    zoom: 17.4,
    pitch: 60,
    durationMs: 1100,
    padding: {
      left: 360,
      right: 420,
      top: 96,
      bottom: 80,
    },
  },

  buildings: {
    source: {
      id: 'osm-buildings',
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '&copy; OpenStreetMap contributors',
    },
    sourceLayer: 'building',
    // OpenFreeMap exposes stable building ids as MapLibre feature ids, not as
    // an osm_id property. Future providers can switch this to property-based.
    identifier: { strategy: 'feature-id' },
  },

  buildingStartZoom: 15,
  buildingFullZoom: 17,
  buildingHeightScale: 1,
  buildingFallbackHeight: 6,

  localBuildings: {
    enabled: true,
    radiusMeters: 95,
    maxBuildings: 40,
    minZoom: 16.5,
    opacity: 0.22,
    overlapToleranceMeters: 0.5,
  },

  pitchStartZoom: 14,
  pitchFullZoom: 17,
  maxPitch: 60,
  defaultBearing: STABLE_BEARING,

  selectedBuilding: {
    enabled: true,
    color: '#ff5d73',
    opacity: 0.86,
    heightBoost: 1.08,
  },
};

export const getBuildingsSourceId = (config: VenueArrivalConfig = venueArrival): string =>
  config.buildings.source.id;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const smoothstep = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

export const venueProgress = (
  zoom: number,
  startZoom: number,
  fullZoom: number,
): number => smoothstep((zoom - startZoom) / (fullZoom - startZoom));

export const targetPitchForZoom = (
  zoom: number,
  config: VenueArrivalConfig = venueArrival,
): number => {
  if (!config.enableCameraPitch) return 0;
  return venueProgress(zoom, config.pitchStartZoom, config.pitchFullZoom) * config.maxPitch;
};

export const targetBearingForZoom = (
  zoom: number,
  config: VenueArrivalConfig = venueArrival,
): number | null => {
  if (!config.enableCameraBearing) return null;
  return zoom < config.pitchStartZoom ? null : config.defaultBearing;
};

export const targetBuildingOpacityForZoom = (
  zoom: number,
  config: VenueArrivalConfig = venueArrival,
): number => {
  if (!config.enable3DBuildings) return 0;
  return venueProgress(zoom, config.buildingStartZoom, config.buildingFullZoom);
};

export const buildBuildingsSource = (
  config: VenueArrivalConfig = venueArrival,
): SourceSpecification => {
  const { url, tiles, attribution } = config.buildings.source;
  const source: VectorSourceSpecification = { type: 'vector' };
  if (url) {
    source.url = url;
  } else if (tiles?.length) {
    source.tiles = tiles;
  }
  if (attribution) source.attribution = attribution;
  return source;
};

const buildingHeightExpression = (config: VenueArrivalConfig, heightBoost = 1) => [
  '*',
  config.buildingHeightScale * heightBoost,
  [
    'coalesce',
    ['get', 'render_height'],
    ['get', 'height'],
    config.buildingFallbackHeight,
  ],
];

const buildingBaseExpression = (config: VenueArrivalConfig) => [
  '*',
  config.buildingHeightScale,
  ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
];

export const buildBuildingsLayer = (
  config: VenueArrivalConfig = venueArrival,
): FillExtrusionLayerSpecification => ({
  id: BUILDINGS_LAYER_ID,
  type: 'fill-extrusion',
  source: getBuildingsSourceId(config),
  'source-layer': config.buildings.sourceLayer,
  layout: {
    visibility: 'none',
  },
  paint: {
    'fill-extrusion-color': '#161b22',
    'fill-extrusion-height': buildingHeightExpression(config),
    'fill-extrusion-base': buildingBaseExpression(config),
    'fill-extrusion-opacity': 0,
    'fill-extrusion-vertical-gradient': true,
    'fill-extrusion-opacity-transition': { duration: 160, delay: 0 },
    'fill-extrusion-color-transition': { duration: 160, delay: 0 },
    'fill-extrusion-height-transition': { duration: 180, delay: 0 },
  },
});

export const buildSelectedBuildingLayer = (
  config: VenueArrivalConfig = venueArrival,
): FillExtrusionLayerSpecification => ({
  id: SELECTED_BUILDING_LAYER_ID,
  type: 'fill-extrusion',
  source: getBuildingsSourceId(config),
  'source-layer': config.buildings.sourceLayer,
  layout: {
    visibility: 'none',
  },
  filter: buildSelectedBuildingFilter('__none__', config),
  paint: {
    'fill-extrusion-color': config.selectedBuilding.color,
    'fill-extrusion-height': buildingHeightExpression(config, config.selectedBuilding.heightBoost),
    'fill-extrusion-base': buildingBaseExpression(config),
    'fill-extrusion-opacity': 0,
    'fill-extrusion-vertical-gradient': true,
    'fill-extrusion-opacity-transition': { duration: 180, delay: 0 },
    'fill-extrusion-color-transition': { duration: 180, delay: 0 },
    'fill-extrusion-height-transition': { duration: 180, delay: 0 },
  },
});

export const buildInteractionSelectedBuildingLayer = (
  config: VenueArrivalConfig = venueArrival,
): FillExtrusionLayerSpecification => ({
  id: INTERACTION_SELECTED_BUILDING_LAYER_ID,
  type: 'fill-extrusion',
  source: getBuildingsSourceId(config),
  'source-layer': config.buildings.sourceLayer,
  layout: {
    visibility: 'none',
  },
  filter: buildSelectedBuildingFilter('__none__', config),
  paint: {
    'fill-extrusion-color': buildingInteractionVisuals.provider.selectedColor,
    'fill-extrusion-height': buildingHeightExpression(config, buildingInteractionVisuals.provider.selectedHeightBoost),
    'fill-extrusion-base': buildingBaseExpression(config),
    'fill-extrusion-opacity': buildingInteractionVisuals.provider.selectedOpacity,
    'fill-extrusion-vertical-gradient': true,
    'fill-extrusion-opacity-transition': { duration: 180, delay: 0 },
    'fill-extrusion-color-transition': { duration: 180, delay: 0 },
    'fill-extrusion-height-transition': { duration: 180, delay: 0 },
  },
});

const normalizeFeatureIdFilterValue = (buildingId: string): string | number => {
  const numericId = Number(buildingId);
  return Number.isFinite(numericId) && String(numericId) === buildingId ? numericId : buildingId;
};

const buildingIdExpression = (config: VenueArrivalConfig = venueArrival) => {
  const identifier = config.buildings.identifier;
  if (identifier.strategy === 'property') {
    return ['to-string', ['get', identifier.property]];
  }
  return ['to-string', ['id']];
};

export const buildSelectedBuildingFilter = (
  buildingId: string,
  config: VenueArrivalConfig = venueArrival,
): FilterSpecification => {
  if (config.buildings.identifier.strategy === 'feature-id') {
    return ['==', '$id', normalizeFeatureIdFilterValue(buildingId)] as FilterSpecification;
  }
  return ['==', buildingIdExpression(config), buildingId] as FilterSpecification;
};

export const buildVenueBuildingFilter = (
  buildingIds: string[],
  config: VenueArrivalConfig = venueArrival,
): FilterSpecification => {
  if (config.buildings.identifier.strategy === 'feature-id') {
    if (!buildingIds.length) {
      return ['==', '$id', '__none__'] as FilterSpecification;
    }
    return [
      'in',
      '$id',
      ...buildingIds.map(normalizeFeatureIdFilterValue),
    ] as FilterSpecification;
  }

  if (!buildingIds.length) {
    return ['==', buildingIdExpression(config), '__none__'] as FilterSpecification;
  }
  return ['in', buildingIdExpression(config), ['literal', buildingIds]] as FilterSpecification;
};

const getFeatureBuildingId = (
  feature: MapGeoJSONFeature,
  config: VenueArrivalConfig = venueArrival,
): string | null => {
  const identifier = config.buildings.identifier;
  if (identifier.strategy === 'feature-id') {
    return typeof feature.id === 'string' || typeof feature.id === 'number'
      ? String(feature.id)
      : null;
  }

  const properties = (feature.properties ?? {}) as Record<string, unknown>;
  const candidate = properties[identifier.property];
  return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : null;
};

const haversineMeters = (
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): number => {
  const earthRadiusMeters = 6371008.8;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(h)));
};

const metersPerDegreeAtLatitude = (latitude: number) => ({
  lng: 111320 * Math.cos((latitude * Math.PI) / 180),
  lat: 110540,
});

const toLocalMeters = (
  point: [number, number],
  origin: { lng: number; lat: number },
): { x: number; y: number } => {
  const metersPerDegree = metersPerDegreeAtLatitude(origin.lat);
  return {
    x: (point[0] - origin.lng) * metersPerDegree.lng,
    y: (point[1] - origin.lat) * metersPerDegree.lat,
  };
};

const distanceToSegmentMeters = (
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
};

const pointInRing = (point: [number, number], ring: number[][]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};

const pointInPolygonRings = (point: [number, number], rings: number[][][]): boolean => {
  if (!rings.length || !pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some((hole) => pointInRing(point, hole));
};

const getFeatureCenter = (feature: MapGeoJSONFeature): { lng: number; lat: number } | null => {
  const geometry = feature.geometry;
  if (!geometry || geometry.type === 'GeometryCollection') return null;

  const points: number[][] = [];
  const collect = (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      points.push(coords as number[]);
      return;
    }
    coords.forEach(collect);
  };

  collect(geometry.coordinates);
  if (!points.length) return null;

  const total = points.reduce(
    (acc, point) => ({ lng: acc.lng + point[0], lat: acc.lat + point[1] }),
    { lng: 0, lat: 0 },
  );
  return { lng: total.lng / points.length, lat: total.lat / points.length };
};

const getFeaturePolygons = (feature: MapGeoJSONFeature): number[][][][] => {
  const geometry = feature.geometry;
  if (!geometry || geometry.type === 'GeometryCollection') return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates as number[][][]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as number[][][][];
  return [];
};

const getPolygonFootprintDistance = (
  polygon: number[][][],
  venuePoint: { lng: number; lat: number },
): { containsVenuePoint: boolean; edgeDistanceMeters: number } | null => {
  const point: [number, number] = [venuePoint.lng, venuePoint.lat];
  const localPoint = { x: 0, y: 0 };
  let edgeDistanceMeters = Infinity;

  for (const ring of polygon) {
    if (ring.length < 2) continue;
    const localRing = ring.map((coordinate) =>
      toLocalMeters(coordinate as [number, number], venuePoint),
    );
    for (let i = 0; i < localRing.length; i += 1) {
      edgeDistanceMeters = Math.min(
        edgeDistanceMeters,
        distanceToSegmentMeters(localPoint, localRing[i], localRing[(i + 1) % localRing.length]),
      );
    }
  }

  if (!Number.isFinite(edgeDistanceMeters)) return null;
  return {
    containsVenuePoint: pointInPolygonRings(point, polygon),
    edgeDistanceMeters,
  };
};

const getVenueRelevantPolygons = (
  polygons: number[][][][],
  venuePoint: { lng: number; lat: number },
): number[][][][] => {
  const ranked = polygons
    .map((polygon) => ({ polygon, footprint: getPolygonFootprintDistance(polygon, venuePoint) }))
    .filter((item): item is { polygon: number[][][]; footprint: { containsVenuePoint: boolean; edgeDistanceMeters: number } } =>
      Boolean(item.footprint),
    )
    .sort((a, b) => {
      if (a.footprint.containsVenuePoint !== b.footprint.containsVenuePoint) {
        return a.footprint.containsVenuePoint ? -1 : 1;
      }
      return a.footprint.edgeDistanceMeters - b.footprint.edgeDistanceMeters;
    });

  return ranked[0] ? [ranked[0].polygon] : polygons;
};

const ringSegments = (ring: number[][]): Array<[number[], number[]]> => {
  const segments: Array<[number[], number[]]> = [];
  for (let i = 0; i < ring.length; i += 1) {
    const current = ring[i];
    const next = ring[(i + 1) % ring.length];
    if (current && next) segments.push([current, next]);
  }
  return segments;
};

const ringAreaMeters = (ring: number[][], origin: { lng: number; lat: number }): number => {
  if (ring.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const current = toLocalMeters(ring[i] as [number, number], origin);
    const next = toLocalMeters(ring[(i + 1) % ring.length] as [number, number], origin);
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
};

const featureFootprintAreaMeters = (
  polygons: number[][][][],
  origin: { lng: number; lat: number },
): number => polygons.reduce((total, polygon) => {
  if (!polygon.length) return total;
  const outerArea = ringAreaMeters(polygon[0], origin);
  const holeArea = polygon
    .slice(1)
    .reduce((holeTotal, ring) => holeTotal + ringAreaMeters(ring, origin), 0);
  return total + Math.max(0, outerArea - holeArea);
}, 0);

const orientation = (a: number[], b: number[], c: number[]): number => {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(value) < 1e-12) return 0;
  return value > 0 ? 1 : 2;
};

const pointOnSegment = (a: number[], b: number[], c: number[]): boolean =>
  b[0] <= Math.max(a[0], c[0]) &&
  b[0] >= Math.min(a[0], c[0]) &&
  b[1] <= Math.max(a[1], c[1]) &&
  b[1] >= Math.min(a[1], c[1]);

const segmentsIntersect = (
  a1: number[],
  a2: number[],
  b1: number[],
  b2: number[],
): boolean => {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && pointOnSegment(a1, b1, a2)) return true;
  if (o2 === 0 && pointOnSegment(a1, b2, a2)) return true;
  if (o3 === 0 && pointOnSegment(b1, a1, b2)) return true;
  if (o4 === 0 && pointOnSegment(b1, a2, b2)) return true;
  return false;
};

const polygonsIntersect = (a: number[][][][], b: number[][][][]): boolean => {
  let segmentComparisons = 0;
  for (const polygonA of a) {
    for (const polygonB of b) {
      for (const ringA of polygonA) {
        for (const ringB of polygonB) {
          for (const [a1, a2] of ringSegments(ringA)) {
            for (const [b1, b2] of ringSegments(ringB)) {
              segmentComparisons += 1;
              assertVenueResolverLoopLimit('polygonsIntersect.segmentComparisons', segmentComparisons, {
                polygonACount: a.length,
                polygonBCount: b.length,
                ringASize: ringA.length,
                ringBSize: ringB.length,
              });
              if (segmentsIntersect(a1, a2, b1, b2)) return true;
            }
          }
          if (ringA[0] && pointInPolygonRings(ringA[0] as [number, number], polygonB)) return true;
          if (ringB[0] && pointInPolygonRings(ringB[0] as [number, number], polygonA)) return true;
        }
      }
    }
  }
  return false;
};

const polygonDistanceMeters = (
  a: number[][][][],
  b: number[][][][],
  origin: { lng: number; lat: number },
): number => {
  logVenueResolver('polygonDistanceMeters:enter', {
    polygonACount: a.length,
    polygonBCount: b.length,
  });
  if (polygonsIntersect(a, b)) return 0;

  let minDistance = Infinity;
  let segmentPointChecks = 0;
  for (const polygonA of a) {
    for (const ringA of polygonA) {
      for (const [a1, a2] of ringSegments(ringA)) {
        const localA1 = toLocalMeters(a1 as [number, number], origin);
        const localA2 = toLocalMeters(a2 as [number, number], origin);
        for (const polygonB of b) {
          for (const ringB of polygonB) {
            for (const pointB of ringB) {
              segmentPointChecks += 1;
              assertVenueResolverLoopLimit('polygonDistanceMeters.firstPass', segmentPointChecks, {
                polygonACount: a.length,
                polygonBCount: b.length,
                ringASize: ringA.length,
                ringBSize: ringB.length,
              });
              minDistance = Math.min(
                minDistance,
                distanceToSegmentMeters(
                  toLocalMeters(pointB as [number, number], origin),
                  localA1,
                  localA2,
                ),
              );
            }
          }
        }
      }
    }
  }

  let reverseSegmentPointChecks = 0;
  for (const polygonB of b) {
    for (const ringB of polygonB) {
      for (const [b1, b2] of ringSegments(ringB)) {
        const localB1 = toLocalMeters(b1 as [number, number], origin);
        const localB2 = toLocalMeters(b2 as [number, number], origin);
        for (const polygonA of a) {
          for (const ringA of polygonA) {
            for (const pointA of ringA) {
              reverseSegmentPointChecks += 1;
              assertVenueResolverLoopLimit('polygonDistanceMeters.secondPass', reverseSegmentPointChecks, {
                polygonACount: a.length,
                polygonBCount: b.length,
                ringASize: ringA.length,
                ringBSize: ringB.length,
              });
              minDistance = Math.min(
                minDistance,
                distanceToSegmentMeters(
                  toLocalMeters(pointA as [number, number], origin),
                  localB1,
                  localB2,
                ),
              );
            }
          }
        }
      }
    }
  }

  const result = Number.isFinite(minDistance) ? minDistance : Infinity;
  logVenueResolver('polygonDistanceMeters:exit', {
    firstPassChecks: segmentPointChecks,
    secondPassChecks: reverseSegmentPointChecks,
    result,
  });
  return result;
};

const getFootprintDistance = (
  feature: MapGeoJSONFeature,
  venuePoint: { lng: number; lat: number },
): { containsVenuePoint: boolean; edgeDistanceMeters: number } | null => {
  const polygons = getFeaturePolygons(feature);
  if (!polygons.length) return null;

  const point: [number, number] = [venuePoint.lng, venuePoint.lat];
  const localPoint = { x: 0, y: 0 };
  let containsVenuePoint = false;
  let edgeDistanceMeters = Infinity;

  for (const polygon of polygons) {
    if (pointInPolygonRings(point, polygon)) {
      containsVenuePoint = true;
    }

    for (const ring of polygon) {
      if (ring.length < 2) continue;
      const localRing = ring.map((coordinate) =>
        toLocalMeters(coordinate as [number, number], venuePoint),
      );
      for (let i = 0; i < localRing.length; i += 1) {
        edgeDistanceMeters = Math.min(
          edgeDistanceMeters,
          distanceToSegmentMeters(localPoint, localRing[i], localRing[(i + 1) % localRing.length]),
        );
      }
    }
  }

  if (!Number.isFinite(edgeDistanceMeters)) return null;
  return { containsVenuePoint, edgeDistanceMeters };
};

const compareBuildingMatches = (
  a: SelectedBuildingMatch,
  b: SelectedBuildingMatch,
): number => {
  if (a.containsVenuePoint !== b.containsVenuePoint) {
    return a.containsVenuePoint ? -1 : 1;
  }
  if (a.edgeDistanceMeters !== b.edgeDistanceMeters) {
    return a.edgeDistanceMeters - b.edgeDistanceMeters;
  }
  return a.distanceMeters - b.distanceMeters;
};

type BuildingCandidate = SelectedBuildingMatch & {
  polygons: number[][][][];
  overlapPolygons: number[][][][];
  footprintAreaMeters: number;
};

const compareContextCandidates = (a: BuildingCandidate, b: BuildingCandidate): number => {
  if (a.edgeDistanceMeters !== b.edgeDistanceMeters) {
    return a.edgeDistanceMeters - b.edgeDistanceMeters;
  }
  return b.footprintAreaMeters - a.footprintAreaMeters;
};

export const findSelectedBuilding = (
  map: Pick<MapLibreMap, 'getZoom' | 'querySourceFeatures'>,
  listing: Listing,
  config: VenueArrivalConfig = venueArrival,
  coordsOverride?: { lng: number; lat: number } | null,
): SelectedBuildingMatch | null => {
  logVenueResolver('findSelectedBuilding:enter', {
    listingId: listing.id,
    listingName: listing.name,
    hasCoordsOverride: Boolean(coordsOverride),
  });
  const context = collectVenueBuildingContext(map, listing, config, coordsOverride);
  logVenueResolver('findSelectedBuilding:exit', {
    listingId: listing.id,
    selectedBuildingId: context.selectedBuilding?.buildingId ?? null,
    queriedFeatureCount: context.queriedFeatureCount,
    contextBuildingCount: context.contextBuildingIds.length,
  });
  return context.selectedBuilding;
};

export const collectLoadedBuildingFragments = (
  map: Pick<MapLibreMap, 'querySourceFeatures'>,
  featureId: string,
  config: VenueArrivalConfig = venueArrival,
): MapGeoJSONFeature[] => {
  const features = map.querySourceFeatures(getBuildingsSourceId(config), {
    sourceLayer: config.buildings.sourceLayer,
  });
  return features.filter((feature) => {
    if (feature.id === undefined || feature.id === null) return false;
    return String(feature.id) === featureId;
  });
};

export const collectVenueBuildingContext = (
  map: Pick<MapLibreMap, 'getZoom' | 'querySourceFeatures'>,
  listing: Listing,
  config: VenueArrivalConfig = venueArrival,
  coordsOverride?: { lng: number; lat: number } | null,
): VenueBuildingContext => {
  const startedAt = performance.now();
  logVenueResolver('collectVenueBuildingContext:enter', {
    listingId: listing.id,
    listingName: listing.name,
    zoom: map.getZoom(),
    recursionDepth: 0,
    hasCoordsOverride: Boolean(coordsOverride),
  });
  const empty = {
    selectedBuilding: null,
    contextBuildingIds: [],
    radiusMeters: config.localBuildings.radiusMeters,
    queriedFeatureCount: 0,
    overlapStats: {
      candidateCountBeforeOverlapFilter: 0,
      removedSelectedOverlapCount: 0,
      removedContextOverlapCount: 0,
    },
  };

  if (!config.enable3DBuildings || !config.enableVenueScopedBuildings || !config.localBuildings.enabled) {
    logVenueResolver('collectVenueBuildingContext:exit disabled', { listingId: listing.id });
    return empty;
  }
  if (map.getZoom() < config.localBuildings.minZoom) {
    logVenueResolver('collectVenueBuildingContext:exit below min zoom', {
      listingId: listing.id,
      zoom: map.getZoom(),
      minZoom: config.localBuildings.minZoom,
    });
    return empty;
  }

  const coords = coordsOverride ?? getListingDisplayCoords(listing);
  if (!coords) {
    logVenueResolver('collectVenueBuildingContext:exit missing coords', { listingId: listing.id });
    return empty;
  }

  logVenueResolver('querySourceFeatures:enter', {
    listingId: listing.id,
    sourceId: getBuildingsSourceId(config),
    sourceLayer: config.buildings.sourceLayer,
  });
  const features = map.querySourceFeatures(getBuildingsSourceId(config), {
    sourceLayer: config.buildings.sourceLayer,
  });
  logVenueResolver('querySourceFeatures:exit', {
    listingId: listing.id,
    featureCount: features.length,
  });
  const byId = new Map<string, BuildingCandidate>();

  let featureIterations = 0;
  for (const feature of features) {
    featureIterations += 1;
    assertVenueResolverLoopLimit('collectVenueBuildingContext.featureLoop', featureIterations, {
      listingId: listing.id,
      featureCount: features.length,
      candidateCount: byId.size,
    });
    const buildingId = getFeatureBuildingId(feature, config);
    const center = getFeatureCenter(feature);
    const footprint = getFootprintDistance(feature, coords);
    const polygons = getFeaturePolygons(feature);
    if (!buildingId || !center || !footprint || !polygons.length) continue;

    const distanceMeters = haversineMeters(coords, center);
    if (!footprint.containsVenuePoint && footprint.edgeDistanceMeters > config.localBuildings.radiusMeters) continue;

    const existing = byId.get(buildingId);
    const nextMatch = {
      feature,
      buildingId,
      lngLat: coords,
      containsVenuePoint: footprint.containsVenuePoint,
      edgeDistanceMeters: footprint.edgeDistanceMeters,
      distanceMeters,
      polygons,
      overlapPolygons: getVenueRelevantPolygons(polygons, coords),
      footprintAreaMeters: featureFootprintAreaMeters(polygons, coords),
    };
    if (!existing || compareBuildingMatches(nextMatch, existing) < 0) {
      byId.set(buildingId, nextMatch);
    }
  }

  logVenueResolver('candidate generation:exit', {
    listingId: listing.id,
    featureIterations,
    candidateCount: byId.size,
  });
  const matches = Array.from(byId.values()).sort(compareBuildingMatches);
  logVenueResolver('distance sorting:exit', {
    listingId: listing.id,
    sortedCandidateCount: matches.length,
  });
  const selectedBuilding = matches[0] ?? null;

  let removedSelectedOverlapCount = 0;
  let removedContextOverlapCount = 0;
  const contextMatches: BuildingCandidate[] = [];

  if (selectedBuilding) {
    const overlapToleranceMeters = config.localBuildings.overlapToleranceMeters;
    let selectedOverlapChecks = 0;
    const contextCandidates = matches
      .filter((match) => match.buildingId !== selectedBuilding.buildingId)
      .filter((match) => {
        selectedOverlapChecks += 1;
        assertVenueResolverLoopLimit('collectVenueBuildingContext.selectedOverlapChecks', selectedOverlapChecks, {
          listingId: listing.id,
          matchCount: matches.length,
          selectedBuildingId: selectedBuilding.buildingId,
          candidateBuildingId: match.buildingId,
        });
        const distance = polygonDistanceMeters(
          selectedBuilding.overlapPolygons,
          match.overlapPolygons,
          coords,
        );
        const overlapsSelected =
          polygonsIntersect(selectedBuilding.overlapPolygons, match.overlapPolygons) ||
          distance < overlapToleranceMeters;
        if (overlapsSelected) {
          removedSelectedOverlapCount += 1;
          return false;
        }
        return true;
      })
      .sort(compareContextCandidates);

    logVenueResolver('overlap scoring:selected filter exit', {
      listingId: listing.id,
      selectedOverlapChecks,
      contextCandidateCount: contextCandidates.length,
      removedSelectedOverlapCount,
    });
    let contextCandidateIterations = 0;
    for (const candidate of contextCandidates) {
      contextCandidateIterations += 1;
      assertVenueResolverLoopLimit('collectVenueBuildingContext.contextCandidateLoop', contextCandidateIterations, {
        listingId: listing.id,
        contextCandidateCount: contextCandidates.length,
        keptContextCount: contextMatches.length,
      });
      let keptOverlapChecks = 0;
      const overlapsKeptContext = contextMatches.some((kept) => {
        keptOverlapChecks += 1;
        assertVenueResolverLoopLimit('collectVenueBuildingContext.keptOverlapChecks', keptOverlapChecks, {
          listingId: listing.id,
          contextCandidateBuildingId: candidate.buildingId,
          keptContextCount: contextMatches.length,
        });
        const distance = polygonDistanceMeters(kept.overlapPolygons, candidate.overlapPolygons, coords);
        return (
          polygonsIntersect(kept.overlapPolygons, candidate.overlapPolygons) ||
          distance < overlapToleranceMeters
        );
      });
      if (overlapsKeptContext) {
        removedContextOverlapCount += 1;
        continue;
      }
      contextMatches.push(candidate);
      if (contextMatches.length >= Math.max(0, config.localBuildings.maxBuildings - 1)) break;
    }
    logVenueResolver('overlap scoring:context loop exit', {
      listingId: listing.id,
      contextCandidateIterations,
      keptContextCount: contextMatches.length,
      removedContextOverlapCount,
    });
  }

  const result = {
    selectedBuilding,
    contextBuildingIds: [
      ...(selectedBuilding ? [selectedBuilding.buildingId] : []),
      ...contextMatches.map((match) => match.buildingId),
    ],
    radiusMeters: config.localBuildings.radiusMeters,
    queriedFeatureCount: features.length,
    overlapStats: {
      candidateCountBeforeOverlapFilter: Math.max(0, matches.length - (selectedBuilding ? 1 : 0)),
      removedSelectedOverlapCount,
      removedContextOverlapCount,
    },
  };
  logVenueResolver('collectVenueBuildingContext:exit', {
    listingId: listing.id,
    selectedBuildingId: selectedBuilding?.buildingId ?? null,
    queriedFeatureCount: features.length,
    candidateCount: matches.length,
    contextBuildingCount: result.contextBuildingIds.length,
    elapsedMs: performance.now() - startedAt,
  });
  return result;
};
