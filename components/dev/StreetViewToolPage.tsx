import React, { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Building2,
  Camera,
  ChevronDown,
  ChevronRight,
  Crosshair,
  ExternalLink,
  Gauge,
  LoaderCircle,
  MapPin,
  MousePointer2,
  Navigation,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import buildingAssetsJson from '../../data/building-assets.local.json';
import {
  fetchSupplementalBuildingFootprints,
  filterSupplementalBuildingFeatures,
  primaryCoverageNeedsSupplement,
} from '../../lib/buildingFootprintSources';
import { swingMapStyle } from '../maps/mapStyle';
import {
  createPyramidalLandmarkLayer,
  createTieredLandmarkLayer,
  resolveCoitTower,
  resolveTransamericaPyramid,
  type StreetViewLandmarkLayer,
} from './streetViewLandmarks';

const LISTING_ID = 'club-twist-sf';
const LISTING_NAME = 'Twist SF';
const LISTING_ADDRESS = '387 Bay Street, San Francisco, CA 94133';
const FALLBACK_CENTER: [number, number] = [-122.4132692, 37.8055766];
const CONTEXT_LAYER_ID = 'street-view-context-buildings';
const SUPPLEMENTAL_CONTEXT_SOURCE_ID = 'street-view-supplemental-buildings';
const SUPPLEMENTAL_CONTEXT_LAYER_ID = 'street-view-supplemental-context-buildings';
const SUPPLEMENTAL_CONTEXT_RADIUS_METERS = 320;
const SUPPLEMENTAL_CONTEXT_MIN_PRIMARY_FOOTPRINTS = 18;
const AUTHORED_PARTS_SOURCE_ID = 'street-view-authored-provider-parts';
const AUTHORED_CONTEXT_LAYER_ID = 'street-view-authored-provider-context';
const AUTHORED_SELECTED_LAYER_ID = 'street-view-authored-selected-buildings';
const SELECTED_SOURCE_ID = 'street-view-selected-buildings';
const SELECTED_LAYER_ID = 'street-view-selected-extrusion';
const SELECTED_GLOW_LAYER_ID = 'street-view-selected-glow';
const BUILDING_SOURCE_ID = 'street-view-osm-buildings';
const BUILDING_SOURCE_LAYER = 'building';
const STREET_LABEL_SOURCE_ID = 'street-view-local-road-labels';
const STREET_LABEL_LAYER_ID = 'street-view-road-labels';
const STREET_LABEL_RADIUS_METERS = 230;
const STREET_LABEL_BLOCK_METERS = 92;
const SELECTED_GLOW_SOURCE_ID = 'street-view-selected-glow-buildings';
const TRANSAMERICA_LANDMARK_LAYER_ID = 'street-view-landmark-transamerica-pyramid';
const COIT_TOWER_LANDMARK_LAYER_ID = 'street-view-landmark-coit-tower';
const TERRAIN_SOURCE_ID = 'street-view-terrain-dem';
const TERRAIN_SOURCE_URL = 'https://tiles.mapterhorn.com/tilejson.json';
const TERRAIN_EXAGGERATION = 1;
const MASKED_PROVIDER_HEIGHT_METERS = 0.001;
const TERRAIN_OCCLUDER_BASE_METERS = 0.001;
const TERRAIN_MASKED_PROVIDER_COLOR = '#050608';
const NEAR_FIELD_ATLAS_RADIUS_METERS = 210;
const NEAR_FIELD_MAX_INDIVIDUAL_LAYERS = 96;
const NEAR_FIELD_LAYER_PREFIX = 'street-view-near-field-building-';
const NEIGHBORHOOD_PULSE_INTERVAL_MS = 6500;
const NEIGHBORHOOD_PULSE_WAVE_SPEED_MPS = 120;
const NEIGHBORHOOD_PULSE_ATTACK_MS = 240;
const NEIGHBORHOOD_PULSE_HOLD_MS = 180;
const NEIGHBORHOOD_PULSE_RELEASE_MS = 520;
const NEIGHBORHOOD_PULSE_COLOR_MIX = 0.22;

type CameraState = {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
};

type VisualState = {
  skyColor: string;
  horizonColor: string;
  hazeStrength: number;
  buildingColor: string;
  buildingOpacity: number;
  selectedColor: string;
  selectedOpacity: number;
  selectedGlowOpacity: number;
  groundBrightness: number;
  streetLabelOpacity: number;
  streetLabelSize: number;
  lightColor: string;
  lightIntensity: number;
  lightAzimuth: number;
  lightPolar: number;
  venueBloomStrength: number;
  occlusionMode: 'off' | 'fade' | 'hide';
  occluderOpacity: number;
  occlusionSensitivity: number;
  occlusionFadeMs: number;
};

type StreetFeature = {
  type: 'Feature';
  id?: string | number;
  properties: {
    selectionId: string;
    providerId?: string;
    height: number;
    source: 'asset' | 'provider';
  };
  geometry: any;
};

type StreetFeatureCollection = {
  type: 'FeatureCollection';
  features: StreetFeature[];
};

type StreetViewProfile = {
  id: string;
  version: number;
  listingId: string;
  venueName: string;
  address: string;
  camera: CameraState;
  visual: VisualState;
  interaction: {
    mode: 'fixed-orbit';
    allowTravel: false;
    allowPublicZoom: false;
    minPitch: number;
    maxPitch: number;
  };
  buildingSelection: {
    providerFeatureIds: string[];
    geometry: StreetFeatureCollection;
  };
  updatedAt?: string;
};

const DEFAULT_CAMERA: CameraState = {
  center: FALLBACK_CENTER,
  zoom: 17.25,
  pitch: 60,
  bearing: 162,
};

const DEFAULT_VISUAL: VisualState = {
  skyColor: '#22191f',
  horizonColor: '#d86e72',
  hazeStrength: 0.46,
  buildingColor: '#b8b0ae',
  buildingOpacity: 1,
  selectedColor: '#dc2538',
  selectedOpacity: 1,
  selectedGlowOpacity: 0,
  groundBrightness: 0.3,
  streetLabelOpacity: 0.72,
  streetLabelSize: 13.5,
  lightColor: '#f2e7e2',
  lightIntensity: 0.48,
  lightAzimuth: 225,
  lightPolar: 44,
  venueBloomStrength: 0.34,
  occlusionMode: 'fade',
  occluderOpacity: 0.12,
  occlusionSensitivity: 82,
  occlusionFadeMs: 1000,
};

const buildingAssets = buildingAssetsJson as unknown as Array<any>;
const twistBuildingAsset = buildingAssets.find((asset) => asset?.listingId === LISTING_ID) ?? null;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const mixHexColors = (from: string, to: string, amount: number) => {
  const parse = (value: string) => {
    const normalized = value.trim().replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
    return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
  };
  const first = parse(from);
  const second = parse(to);
  if (!first || !second) return from;
  const mix = clamp(amount, 0, 1);
  return `#${first.map((channel, index) => Math.round(channel + (second[index] - channel) * mix).toString(16).padStart(2, '0')).join('')}`;
};
const normalizeBearing = (value: number) => ((value + 540) % 360) - 180;
const bearingLabel = (bearing: number) => {
  const normalized = (bearing + 360) % 360;
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return `${Math.round(normalized)}° ${directions[Math.round(normalized / 45) % directions.length]}`;
};

function waitForMapIdle(map: MapLibreMap, timeoutMs = 1400): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      map.off('idle', finish);
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    map.once('idle', finish);
  });
}

function geometryCenter(features: StreetFeature[]): [number, number] | null {
  const coords: Array<[number, number]> = [];
  const collect = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      coords.push([Number(value[0]), Number(value[1])]);
      return;
    }
    value.forEach(collect);
  };
  features.forEach((feature) => collect(feature.geometry?.coordinates));
  if (!coords.length) return null;
  const total = coords.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]] as [number, number], [0, 0]);
  return [total[0] / coords.length, total[1] / coords.length];
}

function featuresFromTwistAsset(): StreetFeature[] {
  const geometry = twistBuildingAsset?.geometry;
  if (!geometry) return [];
  const providerIds = Array.isArray(twistBuildingAsset?.provider?.featureIds)
    ? twistBuildingAsset.provider.featureIds.map(String)
    : [];
  if (geometry.type === 'Polygon') {
    return [{
      type: 'Feature',
      id: 'asset:0',
      properties: {
        selectionId: 'asset:0',
        providerId: providerIds[0],
        height: 9,
        source: 'asset',
      },
      geometry: clone(geometry),
    }];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((coordinates: any, index: number) => ({
      type: 'Feature' as const,
      id: `asset:${index}`,
      properties: {
        selectionId: `asset:${index}`,
        providerId: providerIds[index] ?? providerIds[0],
        height: 9,
        source: 'asset' as const,
      },
      geometry: { type: 'Polygon', coordinates: clone(coordinates) },
    }));
  }
  return [];
}

const DEFAULT_SELECTION = featuresFromTwistAsset();
const DEFAULT_CENTER = geometryCenter(DEFAULT_SELECTION) ?? FALLBACK_CENTER;

function createDefaultProfile(): StreetViewProfile {
  return {
    id: `street-view-${LISTING_ID}`,
    version: 1,
    listingId: LISTING_ID,
    venueName: LISTING_NAME,
    address: LISTING_ADDRESS,
    camera: { ...DEFAULT_CAMERA, center: [...DEFAULT_CENTER] as [number, number] },
    visual: { ...DEFAULT_VISUAL },
    interaction: {
      mode: 'fixed-orbit',
      allowTravel: false,
      allowPublicZoom: false,
      minPitch: 52,
      maxPitch: 85,
    },
    buildingSelection: {
      providerFeatureIds: Array.from(new Set(DEFAULT_SELECTION.map((feature) => feature.properties.providerId).filter(Boolean) as string[])),
      geometry: { type: 'FeatureCollection', features: clone(DEFAULT_SELECTION) },
    },
  };
}

function featureHeight(feature: { properties?: Record<string, unknown> | null }): number {
  const properties = (feature.properties ?? {}) as Record<string, unknown>;
  const candidates = [properties.render_height, properties.height, properties.levels && Number(properties.levels) * 3.2];
  const value = candidates.map(Number).find((candidate) => Number.isFinite(candidate) && candidate > 0);
  return clamp(value ?? 8, 3, 350);
}

function geometryCoordinates(geometry: any): Array<[number, number]> {
  const coords: Array<[number, number]> = [];
  const collect = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      coords.push([Number(value[0]), Number(value[1])]);
      return;
    }
    value.forEach(collect);
  };
  collect(geometry?.coordinates);
  return coords;
}

function geometryCentroid(geometry: any): [number, number] | null {
  const coords = geometryCoordinates(geometry);
  if (!coords.length) return null;
  const total = coords.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]] as [number, number], [0, 0]);
  return [total[0] / coords.length, total[1] / coords.length];
}

function geometryBoundsKey(geometry: any): string {
  const coords = geometryCoordinates(geometry);
  if (!coords.length) return 'empty';
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  coords.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });
  return [minX, minY, maxX, maxY].map((value) => value.toFixed(5)).join(':');
}

function selectionGeometryKey(feature: Pick<StreetFeature, 'geometry' | 'properties'>): string {
  return `${feature.properties.providerId ?? 'geometry'}:${geometryBoundsKey(feature.geometry)}`;
}

function pointInRing(point: [number, number], ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = ((yi > point[1]) !== (yj > point[1]))
      && point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || 1e-12) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function polygonAtPoint(geometry: any, point: [number, number]): any | null {
  if (geometry?.type === 'Polygon') return geometry;
  if (geometry?.type !== 'MultiPolygon' || !Array.isArray(geometry.coordinates)) return null;
  const polygons = geometry.coordinates.map((coordinates: any) => ({ type: 'Polygon', coordinates }));
  const containing = polygons.find((polygon: any) => Array.isArray(polygon.coordinates?.[0]) && pointInRing(point, polygon.coordinates[0]));
  if (containing) return containing;
  return polygons
    .map((polygon: any) => ({ polygon, center: geometryCentroid(polygon) }))
    .filter((entry: any) => entry.center)
    .sort((a: any, b: any) => {
      const da = Math.hypot(a.center[0] - point[0], a.center[1] - point[1]);
      const db = Math.hypot(b.center[0] - point[0], b.center[1] - point[1]);
      return da - db;
    })[0]?.polygon ?? null;
}

function providerFeatureToStreetFeature(feature: MapGeoJSONFeature, clickedPoint?: [number, number]): StreetFeature | null {
  if (feature.id == null || !feature.geometry || feature.geometry.type === 'GeometryCollection') return null;
  if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') return null;
  const providerId = String((feature.properties as Record<string, unknown> | null)?.providerId ?? feature.id);
  const geometry = clickedPoint ? polygonAtPoint(feature.geometry, clickedPoint) : clone(feature.geometry);
  if (!geometry) return null;
  const center = geometryCentroid(geometry);
  const selectionId = `provider:${providerId}:${center ? `${center[0].toFixed(6)}:${center[1].toFixed(6)}` : geometryBoundsKey(geometry)}`;
  return {
    type: 'Feature',
    id: selectionId,
    properties: {
      selectionId,
      providerId,
      height: featureHeight(feature),
      source: 'provider',
    },
    geometry: clone(geometry),
  };
}

function expandPolygonGeometry(geometry: any, meters: number): any {
  if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) return clone(geometry);
  const expandRing = (ring: Array<[number, number]>, direction: number) => {
    if (!ring?.length) return ring;
    const unique = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
    const center = unique.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]] as [number, number], [0, 0]);
    center[0] /= Math.max(1, unique.length);
    center[1] /= Math.max(1, unique.length);
    const cosLat = Math.cos(center[1] * Math.PI / 180);
    const expanded = unique.map(([lon, lat]) => {
      const dx = (lon - center[0]) * 111320 * Math.max(0.2, cosLat);
      const dy = (lat - center[1]) * 110540;
      const length = Math.max(0.001, Math.hypot(dx, dy));
      const push = meters * direction;
      return [
        lon + (dx / length) * push / (111320 * Math.max(0.2, cosLat)),
        lat + (dy / length) * push / 110540,
      ] as [number, number];
    });
    if (expanded.length) expanded.push([...expanded[0]] as [number, number]);
    return expanded;
  };
  const expandPolygon = (coordinates: any[]) => coordinates.map((ring, index) => expandRing(ring, index === 0 ? 1 : -1));
  return geometry.type === 'Polygon'
    ? { type: 'Polygon', coordinates: expandPolygon(geometry.coordinates) }
    : { type: 'MultiPolygon', coordinates: geometry.coordinates.map(expandPolygon) };
}

function renderSelectionCollection(features: StreetFeature[], expansionMeters: number): StreetFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features
      .filter((feature) => feature.properties.source !== 'asset')
      .map((feature) => ({ ...clone(feature), geometry: expandPolygonGeometry(feature.geometry, expansionMeters) })),
  };
}

function renderSelectionGlowCollection(features: StreetFeature[], expansionMeters: number): StreetFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features
      .filter((feature) => feature.properties.source !== 'asset')
      .map((feature) => ({ ...clone(feature), geometry: expandPolygonGeometry(feature.geometry, expansionMeters) })),
  };
}

function polygonParts(geometry: any): any[][] {
  if (geometry?.type === 'Polygon' && Array.isArray(geometry.coordinates)) return [geometry.coordinates];
  if (geometry?.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) return geometry.coordinates;
  return [];
}

function lineSegmentsIntersect(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
): boolean {
  const cross = (p: [number, number], q: [number, number], r: [number, number]) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const onSegment = (p: [number, number], q: [number, number], r: [number, number]) => {
    const epsilon = 1e-10;
    return Math.abs(cross(p, q, r)) <= epsilon
      && r[0] >= Math.min(p[0], q[0]) - epsilon
      && r[0] <= Math.max(p[0], q[0]) + epsilon
      && r[1] >= Math.min(p[1], q[1]) - epsilon
      && r[1] <= Math.max(p[1], q[1]) + epsilon;
  };

  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true;
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

function polygonGeometriesOverlap(first: any, second: any): boolean {
  const firstRing = first?.type === 'Polygon' ? first.coordinates?.[0] : null;
  const secondRing = second?.type === 'Polygon' ? second.coordinates?.[0] : null;
  if (!Array.isArray(firstRing) || !Array.isArray(secondRing) || !firstRing.length || !secondRing.length) return false;

  const bounds = (ring: Array<[number, number]>) => ring.reduce(
    (result, [x, y]) => ({
      minX: Math.min(result.minX, x),
      minY: Math.min(result.minY, y),
      maxX: Math.max(result.maxX, x),
      maxY: Math.max(result.maxY, y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const firstBounds = bounds(firstRing);
  const secondBounds = bounds(secondRing);
  const overlapX = Math.min(firstBounds.maxX, secondBounds.maxX) - Math.max(firstBounds.minX, secondBounds.minX);
  const overlapY = Math.min(firstBounds.maxY, secondBounds.maxY) - Math.max(firstBounds.minY, secondBounds.minY);
  // A shared wall/edge is not an overlap. Require a small positive 2D area so
  // adjacent buildings are not accidentally treated as stacked venue geometry.
  if (overlapX <= 1e-7 || overlapY <= 1e-7) return false;

  if (firstRing.some((point: [number, number]) => pointInRing(point, secondRing))) return true;
  if (secondRing.some((point: [number, number]) => pointInRing(point, firstRing))) return true;
  for (let firstIndex = 1; firstIndex < firstRing.length; firstIndex += 1) {
    for (let secondIndex = 1; secondIndex < secondRing.length; secondIndex += 1) {
      if (lineSegmentsIntersect(firstRing[firstIndex - 1], firstRing[firstIndex], secondRing[secondIndex - 1], secondRing[secondIndex])) {
        return true;
      }
    }
  }
  return false;
}

type ScreenBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
};

function projectedGeometryBounds(map: MapLibreMap, geometry: any): ScreenBounds | null {
  const coords = geometryCoordinates(geometry);
  if (!coords.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  coords.forEach((coordinate) => {
    const point = map.project(coordinate);
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    centerX: (minX + maxX) * 0.5,
    centerY: (minY + maxY) * 0.5,
  };
}

function projectedFeatureBounds(map: MapLibreMap, features: StreetFeature[]): ScreenBounds | null {
  const bounds = features.map((feature) => projectedGeometryBounds(map, feature.geometry)).filter(Boolean) as ScreenBounds[];
  if (!bounds.length) return null;
  const minX = Math.min(...bounds.map((entry) => entry.minX));
  const minY = Math.min(...bounds.map((entry) => entry.minY));
  const maxX = Math.max(...bounds.map((entry) => entry.maxX));
  const maxY = Math.max(...bounds.map((entry) => entry.maxY));
  return { minX, minY, maxX, maxY, centerX: (minX + maxX) * 0.5, centerY: (minY + maxY) * 0.5 };
}

function centerDistanceMeters(first: [number, number], second: [number, number]): number {
  const [dx, dy] = localMeters(first, second);
  return Math.hypot(dx, dy);
}

function polygonOccludesVenue(
  map: MapLibreMap,
  geometry: any,
  venueBounds: ScreenBounds | null,
  venueCenter: [number, number] | null,
  sensitivityPx: number,
): boolean {
  if (!venueBounds || !venueCenter) return false;
  const candidateBounds = projectedGeometryBounds(map, geometry);
  const candidateCenter = geometryCentroid(geometry);
  if (!candidateBounds || !candidateCenter) return false;
  if (centerDistanceMeters(candidateCenter, venueCenter) > 180) return false;

  // A true occluder must be on the camera-facing side of the venue. MapLibre's
  // bearing tells us which direction points toward the top of the viewport; the
  // camera sits on the opposite side of the fixed venue anchor.
  const [dx, dy] = localMeters(candidateCenter, venueCenter);
  const cameraSideRadians = (map.getBearing() + 180) * Math.PI / 180;
  const cameraSideX = Math.sin(cameraSideRadians);
  const cameraSideY = Math.cos(cameraSideRadians);
  const towardCameraMeters = dx * cameraSideX + dy * cameraSideY;
  if (towardCameraMeters <= 1.5) return false;

  // Reject source fragments that project behind the viewer or far outside the
  // active viewport. querySourceFeatures() can include cached 360° preload tiles.
  const canvas = map.getCanvas();
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  const viewportMargin = Math.max(24, sensitivityPx * 0.45);
  if (candidateBounds.maxX < -viewportMargin || candidateBounds.minX > width + viewportMargin
    || candidateBounds.maxY < -viewportMargin || candidateBounds.minY > height + viewportMargin) return false;

  // Perspective projection is the final gate. Foreground ground footprints sit
  // lower on screen than Twist; buildings behind Twist project above it.
  const horizontalOverlap = candidateBounds.maxX >= venueBounds.minX - sensitivityPx
    && candidateBounds.minX <= venueBounds.maxX + sensitivityPx;
  const inFrontOnScreen = candidateBounds.centerY >= venueBounds.centerY + Math.max(2, sensitivityPx * 0.035);
  const nearSightline = candidateBounds.minY <= venueBounds.maxY + sensitivityPx
    && candidateBounds.maxY >= venueBounds.minY - sensitivityPx * 0.25;
  return horizontalOverlap && inFrontOnScreen && nearSightline;
}

function buildPersistentNearFieldAtlas(
  providerFeatures: Array<{ id?: string | number; properties?: Record<string, unknown> | null; geometry?: any }>,
  selectedFeatures: StreetFeature[],
  radiusMeters = NEAR_FIELD_ATLAS_RADIUS_METERS,
) {
  const authored = selectedFeatures.filter((feature) => feature.properties.source === 'asset');
  const venueCenter = geometryCenter(authored);
  if (!authored.length || !venueCenter) {
    return {
      collection: { type: 'FeatureCollection', features: [] } as any,
      overlappingProviderIds: [] as string[],
      maskedProviderIds: [] as string[],
      nearFeatures: [] as any[],
    };
  }

  const uniqueParts = new Map<string, {
    providerId: string;
    geometry: any;
    height: number;
    minHeight: number;
    center: [number, number] | null;
    overlapsVenue: boolean;
    nearField: boolean;
  }>();
  const maskedProviderIds = new Set<string>();
  const overlappingProviderIds = new Set<string>();

  providerFeatures.forEach((feature) => {
    if (feature.id == null || !feature.geometry) return;
    const providerId = String(feature.id);
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    const minHeightValue = Number(properties.render_min_height ?? properties.min_height ?? 0);
    const minHeight = Number.isFinite(minHeightValue) && minHeightValue >= 0 ? minHeightValue : 0;

    polygonParts(feature.geometry).forEach((coordinates, polygonIndex) => {
      const geometry = { type: 'Polygon', coordinates: clone(coordinates) };
      const center = geometryCentroid(geometry);
      const overlapsVenue = authored.some((entry) => polygonGeometriesOverlap(geometry, entry.geometry));
      const nearField = Boolean(center && centerDistanceMeters(center, venueCenter) <= radiusMeters);
      if (overlapsVenue) {
        overlappingProviderIds.add(providerId);
        maskedProviderIds.add(providerId);
      } else if (nearField) {
        maskedProviderIds.add(providerId);
      }
      const key = `${providerId}:${geometryBoundsKey(geometry)}:${center ? `${center[0].toFixed(6)}:${center[1].toFixed(6)}` : polygonIndex}`;
      if (!uniqueParts.has(key)) {
        uniqueParts.set(key, {
          providerId,
          geometry,
          height: featureHeight(feature),
          minHeight,
          center,
          overlapsVenue,
          nearField,
        });
      }
    });
  });

  const features: any[] = [];
  const nearFeatures: any[] = [];
  let nearIndex = 0;
  let siblingIndex = 0;

  uniqueParts.forEach((part) => {
    if (!maskedProviderIds.has(part.providerId) || part.overlapsVenue) return;
    const atlasId = part.nearField ? `near:${nearIndex++}` : `sibling:${siblingIndex++}`;
    const feature = {
      type: 'Feature',
      id: atlasId,
      properties: {
        atlasId,
        providerId: part.providerId,
        selected: false,
        role: part.nearField ? 'near' : 'sibling',
        height: part.height,
        minHeight: part.minHeight,
      },
      geometry: clone(part.geometry),
    };
    features.push(feature);
    if (part.nearField) nearFeatures.push(feature);
  });

  // A per-building layer is what gives MapLibre a true native opacity transition,
  // but style-layer count can become expensive in exceptionally dense cities.
  // Keep the closest buildings individually animated and downgrade any overflow
  // to the shared sibling layer so geometry remains visible without unbounded
  // draw/style overhead.
  if (nearFeatures.length > NEAR_FIELD_MAX_INDIVIDUAL_LAYERS) {
    const animatedIds = new Set(
      [...nearFeatures]
        .sort((a, b) => {
          const aCenter = geometryCentroid(a.geometry);
          const bCenter = geometryCentroid(b.geometry);
          const aDistance = aCenter ? centerDistanceMeters(aCenter, venueCenter) : Number.POSITIVE_INFINITY;
          const bDistance = bCenter ? centerDistanceMeters(bCenter, venueCenter) : Number.POSITIVE_INFINITY;
          return aDistance - bDistance;
        })
        .slice(0, NEAR_FIELD_MAX_INDIVIDUAL_LAYERS)
        .map((feature) => String(feature.properties.atlasId)),
    );
    nearFeatures.length = 0;
    features.forEach((feature) => {
      if (feature.properties?.role !== 'near') return;
      if (animatedIds.has(String(feature.properties.atlasId))) nearFeatures.push(feature);
      else feature.properties.role = 'sibling';
    });
  }

  authored.forEach((feature) => {
    features.push({
      type: 'Feature',
      id: `authored:${feature.properties.selectionId}`,
      properties: {
        atlasId: `authored:${feature.properties.selectionId}`,
        providerId: String(feature.properties.providerId ?? 'authored'),
        selected: true,
        role: 'selected',
        height: feature.properties.height,
        minHeight: 0,
      },
      geometry: clone(feature.geometry),
    });
  });

  const sortIds = (ids: Set<string>) => Array.from(ids).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return {
    collection: { type: 'FeatureCollection', features } as any,
    overlappingProviderIds: sortIds(overlappingProviderIds),
    maskedProviderIds: sortIds(maskedProviderIds),
    nearFeatures,
  };
}

function providerFeatureStateId(providerId: string): string | number {
  const numeric = Number(providerId);
  return Number.isFinite(numeric) && String(numeric) === providerId ? numeric : providerId;
}

function localMeters(point: [number, number], origin: [number, number]): [number, number] {
  const cosLat = Math.cos(((point[1] + origin[1]) * 0.5) * Math.PI / 180);
  return [
    (point[0] - origin[0]) * 111320 * Math.max(0.2, cosLat),
    (point[1] - origin[1]) * 110540,
  ];
}

function normalizeReadableScreenRotation(rotation: number): number {
  // map.project() already includes bearing, pitch and perspective. Normalize only
  // for text readability so labels never render upside-down.
  while (rotation >= 90) rotation -= 180;
  while (rotation < -90) rotation += 180;
  if (Math.abs(rotation) < 2.5) return 0;
  if (Math.abs(Math.abs(rotation) - 90) < 2.5) return -90;
  return rotation;
}

function buildLocalStreetLabels(
  features: Array<{ properties?: Record<string, unknown> | null; geometry?: any }>,
  origin: [number, number],
  map: MapLibreMap,
) {
  type Candidate = { name: string; point: [number, number]; rotation: number; length: number; distance: number; key: string };
  const candidates: Candidate[] = [];
  const addLine = (name: string, line: Array<[number, number]>) => {
    for (let index = 1; index < line.length; index += 1) {
      const start = line[index - 1];
      const end = line[index];
      const midpoint: [number, number] = [(start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5];
      const [mx, my] = localMeters(midpoint, origin);
      const distance = Math.hypot(mx, my);
      if (distance > STREET_LABEL_RADIUS_METERS) continue;
      const [sx, sy] = localMeters(start, origin);
      const [ex, ey] = localMeters(end, origin);
      const dx = ex - sx;
      const dy = ey - sy;
      const length = Math.hypot(dx, dy);
      if (length < 12) continue;
      const projectedStart = map.project(start);
      const projectedEnd = map.project(end);
      const screenDx = projectedEnd.x - projectedStart.x;
      const screenDy = projectedEnd.y - projectedStart.y;
      const rotation = normalizeReadableScreenRotation(Math.atan2(screenDy, screenDx) * 180 / Math.PI);
      const cellX = Math.round(mx / STREET_LABEL_BLOCK_METERS);
      const cellY = Math.round(my / STREET_LABEL_BLOCK_METERS);
      candidates.push({ name, point: midpoint, rotation, length, distance, key: `${name.toLowerCase()}|${cellX}|${cellY}` });
    }
  };
  features.forEach((feature) => {
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    const name = String(properties.name_en ?? properties.name ?? '').trim();
    if (!name || !feature.geometry) return;
    if (feature.geometry.type === 'LineString') addLine(name, feature.geometry.coordinates as Array<[number, number]>);
    if (feature.geometry.type === 'MultiLineString') (feature.geometry.coordinates as Array<Array<[number, number]>>).forEach((line) => addLine(name, line));
  });
  const bestByBlock = new Map<string, Candidate>();
  candidates.forEach((candidate) => {
    const existing = bestByBlock.get(candidate.key);
    if (!existing || candidate.length > existing.length || (candidate.length === existing.length && candidate.distance < existing.distance)) {
      bestByBlock.set(candidate.key, candidate);
    }
  });
  const byName = new Map<string, Candidate[]>();
  Array.from(bestByBlock.values()).sort((a, b) => a.distance - b.distance).forEach((candidate) => {
    const bucket = byName.get(candidate.name.toLowerCase()) ?? [];
    if (bucket.some((existing) => Math.hypot(...localMeters(candidate.point, existing.point)) < 72)) return;
    bucket.push(candidate);
    byName.set(candidate.name.toLowerCase(), bucket);
  });
  const selected = Array.from(byName.values()).flat().sort((a, b) => a.distance - b.distance).slice(0, 18);
  return {
    type: 'FeatureCollection',
    features: selected.map((candidate, index) => ({
      type: 'Feature',
      id: `street-label-${index}`,
      properties: { name: candidate.name, rotation: candidate.rotation },
      geometry: { type: 'Point', coordinates: candidate.point },
    })),
  } as any;
}

function refreshLocalStreetLabelsForMap(map: MapLibreMap, origin: [number, number]) {
  const source = map.getSource(STREET_LABEL_SOURCE_ID) as GeoJSONSource | undefined;
  if (!source || !map.getSource(BUILDING_SOURCE_ID)) return;
  const roadFeatures = map.querySourceFeatures(BUILDING_SOURCE_ID, { sourceLayer: 'transportation_name' });
  source.setData(buildLocalStreetLabels(roadFeatures, origin, map));
}

function providerIds(features: StreetFeature[]): string[] {
  return Array.from(new Set(features.map((feature) => feature.properties.providerId).filter(Boolean) as string[]));
}

function providerContextColor(buildingColor: string) {
  return [
    'case',
    ['boolean', ['feature-state', 'terrainPlateHidden'], false],
    TERRAIN_MASKED_PROVIDER_COLOR,
    buildingColor,
  ] as any;
}

function createStreetStyle(visual: VisualState) {
  const style = clone(swingMapStyle) as any;
  style.glyphs = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
  const background = style.layers.find((layer: any) => layer.id === 'background');
  if (background) background.paint['background-color'] = '#050608';
  const base = style.layers.find((layer: any) => layer.id === 'dark-basemap');
  if (base) {
    base.paint['raster-opacity'] = 0.82;
    base.paint['raster-saturation'] = -0.82;
    base.paint['raster-contrast'] = -0.12;
    base.paint['raster-brightness-min'] = 0.02;
    base.paint['raster-brightness-max'] = visual.groundBrightness;
  }
  const labels = style.layers.find((layer: any) => layer.id === 'dark-basemap-labels');
  if (labels) labels.layout = { ...(labels.layout ?? {}), visibility: 'none' };
  return style;
}

const Panel: React.FC<{
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  summary?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon, open, onToggle, summary, children }) => (
  <section className="overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.025]">
    <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-white/[0.025]">
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="text-red-300">{icon}</span>
        <span className="text-xs font-semibold text-white">{title}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {summary}
        {open ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
      </span>
    </button>
    {open ? <div className="border-t border-white/[0.07] p-3">{children}</div> : null}
  </section>
);

const RangeControl: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step, suffix = '', onChange }) => (
  <label className="block rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-2">
    <span className="flex items-center justify-between gap-3 text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">
      <span>{label}</span>
      <span className="font-mono font-normal normal-case tracking-normal text-zinc-300">{value.toFixed(step < 0.1 ? 2 : 1)}{suffix}</span>
    </span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1.5 w-full accent-red-500" />
  </label>
);

const ColorControl: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => (
  <label className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-2">
    <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</span>
    <span className="flex items-center gap-2 font-mono text-[9px] text-zinc-400">
      {value}
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent" />
    </span>
  </label>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-xl">
    <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
    <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-200">{value}</p>
  </div>
);

const StreetViewToolPage: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectedFeaturesRef = useRef<StreetFeature[]>(clone(DEFAULT_SELECTION));
  const cameraRef = useRef<CameraState>({ ...DEFAULT_CAMERA, center: [...DEFAULT_CENTER] as [number, number] });
  const visualRef = useRef<VisualState>({ ...DEFAULT_VISUAL });
  const revealRef = useRef(false);
  const prewarmStartedRef = useRef(false);
  const loadStartedAtRef = useRef(performance.now());
  const renderTimesRef = useRef<number[]>([]);
  const lastFpsPublishAtRef = useRef(0);
  const landmarkLayersRef = useRef<StreetViewLandmarkLayer[]>([]);
  const nearFieldLayerIdsRef = useRef<string[]>([]);
  const suppressClickRef = useRef(false);
  const refreshOcclusionRef = useRef<(animate?: boolean) => void>(() => {});
  const setTerrainProviderPlateVisibilityRef = useRef<(terrainEnabled: boolean) => void>(() => {});
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>(cameraRef.current);
  const [visualState, setVisualState] = useState<VisualState>(visualRef.current);
  const [selectedFeatures, setSelectedFeatures] = useState<StreetFeature[]>(clone(DEFAULT_SELECTION));
  const [overlappingProviderIds, setOverlappingProviderIds] = useState<string[]>([]);
  const [occludingPolygonCount, setOccludingPolygonCount] = useState(0);
  const [venueScreenPoint, setVenueScreenPoint] = useState<{ x: number; y: number } | null>(null);
  const [loadProgress, setLoadProgress] = useState(4);
  const [loadStage, setLoadStage] = useState('Preparing Twist SF');
  const [sceneReady, setSceneReady] = useState(false);
  const [terrainEnabled, setTerrainEnabled] = useState(false);
  const [loadDurationMs, setLoadDurationMs] = useState<number | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [sourceReady, setSourceReady] = useState(false);
  const [renderedBuildingCount, setRenderedBuildingCount] = useState(0);
  const [renderProbe, setRenderProbe] = useState('pending');
  const [canvasLayout, setCanvasLayout] = useState('pending');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('Loading saved Street View profile…');
  const [openPanels, setOpenPanels] = useState({ selection: true, camera: true, visual: false, performance: false });

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      const fallback = createDefaultProfile();
      try {
        const response = await fetch(`/api/admin/street-view/profile?listingId=${encodeURIComponent(LISTING_ID)}`);
        if (!response.ok) throw new Error(await response.text());
        const payload = await response.json();
        const profile = (payload?.profile ?? fallback) as StreetViewProfile;
        if (cancelled) return;
        const nextFeatures = Array.isArray(profile?.buildingSelection?.geometry?.features) && profile.buildingSelection.geometry.features.length
          ? clone(profile.buildingSelection.geometry.features)
          : clone(fallback.buildingSelection.geometry.features);
        const nextCamera = profile?.camera ? { ...fallback.camera, ...profile.camera, center: [...profile.camera.center] as [number, number] } : fallback.camera;
        const nextVisual = profile?.visual ? { ...fallback.visual, ...profile.visual } : fallback.visual;
        selectedFeaturesRef.current = nextFeatures;
        cameraRef.current = nextCamera;
        visualRef.current = nextVisual;
        setSelectedFeatures(nextFeatures);
        setCameraState(nextCamera);
        setVisualState(nextVisual);
        setStatus(payload?.profile ? 'Saved Street View profile loaded.' : 'Using Twist SF building asset as the prototype baseline.');
      } catch (error) {
        if (cancelled) return;
        console.warn('Street View profile load failed; using defaults.', error);
        const center = geometryCenter(DEFAULT_SELECTION) ?? FALLBACK_CENTER;
        const fallbackCamera = { ...DEFAULT_CAMERA, center };
        selectedFeaturesRef.current = clone(DEFAULT_SELECTION);
        cameraRef.current = fallbackCamera;
        visualRef.current = { ...DEFAULT_VISUAL };
        setSelectedFeatures(clone(DEFAULT_SELECTION));
        setCameraState(fallbackCamera);
        setVisualState({ ...DEFAULT_VISUAL });
        setStatus('Saved profile unavailable; using the Twist SF building asset baseline.');
      } finally {
        if (!cancelled) setProfileLoaded(true);
      }
    };
    void loadProfile();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!profileLoaded || !mapContainerRef.current || mapRef.current) return;
    revealRef.current = false;
    prewarmStartedRef.current = false;
    let disposed = false;
    loadStartedAtRef.current = performance.now();
    setSceneReady(false);
    setLoadDurationMs(null);
    setFps(null);
    setRenderedBuildingCount(0);
    setRenderProbe('pending');
    setLoadProgress(8);
    setLoadStage('Loading neighborhood style');

    const camera = cameraRef.current;
    const visual = visualRef.current;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: createStreetStyle(visual),
      center: camera.center,
      zoom: camera.zoom,
      pitch: camera.pitch,
      bearing: camera.bearing,
      minZoom: 15.5,
      maxZoom: 19,
      minPitch: 45,
      maxPitch: 85,
      attributionControl: { compact: true },
      maplibreLogo: false,
      interactive: true,
      dragPan: false,
      dragRotate: false,
      scrollZoom: false,
      boxZoom: false,
      doubleClickZoom: false,
      keyboard: false,
      touchZoomRotate: false,
      fadeDuration: 0,
      maxTileCacheSize: 42,
      canvasContextAttributes: {
        antialias: (window.devicePixelRatio || 1) <= 1.25,
        powerPreference: 'high-performance',
      },
    });
    mapRef.current = map;

    const measureAndResize = () => {
      map.resize();
      const canvas = map.getCanvas();
      const rect = canvas.getBoundingClientRect();
      setCanvasLayout(`${Math.round(rect.width)}×${Math.round(rect.height)} css · ${canvas.width}×${canvas.height} px`);
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(measureAndResize));

    const providerFeatureCache = new Map<string, any>();
    const maskedProviderIds = new Set<string>();
    let supplementalContextAttempted = false;
    let nearFieldAtlas: ReturnType<typeof buildPersistentNearFieldAtlas> | null = null;
    const nearFieldLayers = new Map<string, { layerId: string; targetOpacity: number; targetBase: number; distanceMeters: number }>();
    const neighborhoodPulseTimeouts = new Set<number>();
    let neighborhoodPulseInterval = 0;

    const scheduleNeighborhoodPulseTimeout = (callback: () => void, delayMs: number) => {
      const timeoutId = window.setTimeout(() => {
        neighborhoodPulseTimeouts.delete(timeoutId);
        callback();
      }, Math.max(0, delayMs));
      neighborhoodPulseTimeouts.add(timeoutId);
      return timeoutId;
    };

    const cacheVisibleProviderFeatures = () => {
      if (!map.getSource(BUILDING_SOURCE_ID)) return;
      const sourceFeatures = map.querySourceFeatures(BUILDING_SOURCE_ID, { sourceLayer: BUILDING_SOURCE_LAYER });
      sourceFeatures.forEach((feature) => {
        if (feature.id == null || !feature.geometry) return;
        const key = `${String(feature.id)}:${geometryBoundsKey(feature.geometry)}`;
        if (providerFeatureCache.has(key)) return;
        providerFeatureCache.set(key, {
          id: feature.id,
          properties: clone(feature.properties ?? {}),
          geometry: clone(feature.geometry),
        });
      });
    };

    const loadSupplementalContextIfNeeded = async () => {
      if (
        disposed ||
        supplementalContextAttempted ||
        !map.getSource(BUILDING_SOURCE_ID) ||
        !map.isSourceLoaded(BUILDING_SOURCE_ID)
      ) return;

      cacheVisibleProviderFeatures();
      const center = { lng: cameraRef.current.center[0], lat: cameraRef.current.center[1] };
      const authoredCoverage = selectedFeaturesRef.current.map((feature) => ({
        id: feature.id,
        geometry: feature.geometry,
        properties: feature.properties,
        source: 'street-view-selected-asset',
        sourceLayer: 'building',
      }));
      const primaryCoverageFeatures = [...providerFeatureCache.values(), ...authoredCoverage];
      const coverage = primaryCoverageNeedsSupplement(primaryCoverageFeatures, center, {
        radiusMeters: SUPPLEMENTAL_CONTEXT_RADIUS_METERS,
        minimumContextFootprints: SUPPLEMENTAL_CONTEXT_MIN_PRIMARY_FOOTPRINTS,
        minimumContextCells: 7,
        contextGridSize: 4,
      });
      if (!coverage.needed) {
        supplementalContextAttempted = true;
        return;
      }

      supplementalContextAttempted = true;
      try {
        const supplemental = await fetchSupplementalBuildingFootprints({
          listingId: LISTING_ID,
          center,
          radiusMeters: SUPPLEMENTAL_CONTEXT_RADIUS_METERS,
          maxFeatures: 1_000,
        });
        if (disposed) return;
        const fused = filterSupplementalBuildingFeatures(
          primaryCoverageFeatures,
          supplemental.features,
          center,
          SUPPLEMENTAL_CONTEXT_RADIUS_METERS,
        );
        const source = map.getSource(SUPPLEMENTAL_CONTEXT_SOURCE_ID) as GeoJSONSource | undefined;
        source?.setData({
          type: 'FeatureCollection',
          features: fused.features.map((feature) => ({
            type: 'Feature',
            id: feature.id ?? undefined,
            properties: feature.properties ?? {},
            geometry: feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
          })),
        } as any);
        if (fused.features.length) {
          setStatus(
            `Street View filled ${fused.features.length} local building gap${fused.features.length === 1 ? '' : 's'} with supplemental Microsoft footprints; OpenFreeMap remains primary where coverage overlaps.`,
          );
        }
      } catch (error) {
        console.warn('Street View supplemental building coverage unavailable.', error);
      }
    };

    const setTerrainProviderPlateVisibility = (terrainEnabled: boolean) => {
      maskedProviderIds.forEach((providerId) => {
        map.setFeatureState({
          source: BUILDING_SOURCE_ID,
          sourceLayer: BUILDING_SOURCE_LAYER,
          id: providerFeatureStateId(providerId),
        }, { terrainPlateHidden: terrainEnabled });
      });
      map.triggerRepaint();
    };
    setTerrainProviderPlateVisibilityRef.current = setTerrainProviderPlateVisibility;

    const setProviderMaskState = (providerIds: string[], stateKey: 'nearFieldMasked' | 'landmarkMasked') => {
      providerIds.forEach((providerId) => {
        maskedProviderIds.add(providerId);
        map.setFeatureState({
          source: BUILDING_SOURCE_ID,
          sourceLayer: BUILDING_SOURCE_LAYER,
          id: providerFeatureStateId(providerId),
        }, {
          [stateKey]: true,
          terrainPlateHidden: Boolean(map.getTerrain()),
        });
      });
    };

    const installTransamericaLandmark = () => {
      if (map.getLayer(TRANSAMERICA_LANDMARK_LAYER_ID) || !map.getSource(BUILDING_SOURCE_ID)) return;
      const sourceFeatures = map.querySourceFeatures(BUILDING_SOURCE_ID, { sourceLayer: BUILDING_SOURCE_LAYER });
      const landmark = resolveTransamericaPyramid(sourceFeatures);
      if (!landmark) return;

      const layer = createPyramidalLandmarkLayer({
        id: TRANSAMERICA_LANDMARK_LAYER_ID,
        map,
        center: landmark.center,
        footprint: landmark.footprint,
        minHeight: landmark.minHeight,
        height: landmark.height,
        color: visualRef.current.buildingColor,
      });
      map.addLayer(layer as any, map.getLayer(STREET_LABEL_LAYER_ID) ? STREET_LABEL_LAYER_ID : undefined);
      landmarkLayersRef.current.push(layer);
      setProviderMaskState(landmark.providerIds, 'landmarkMasked');
    };

    const installCoitTowerLandmark = () => {
      if (map.getLayer(COIT_TOWER_LANDMARK_LAYER_ID) || !map.getSource(BUILDING_SOURCE_ID)) return;
      const sourceFeatures = map.querySourceFeatures(BUILDING_SOURCE_ID, { sourceLayer: BUILDING_SOURCE_LAYER });
      const landmark = resolveCoitTower(sourceFeatures);
      if (!landmark) return;

      const layer = createTieredLandmarkLayer({
        id: COIT_TOWER_LANDMARK_LAYER_ID,
        map,
        center: landmark.center,
        components: landmark.components,
        color: visualRef.current.buildingColor,
      });
      map.addLayer(layer as any, map.getLayer(STREET_LABEL_LAYER_ID) ? STREET_LABEL_LAYER_ID : undefined);
      landmarkLayersRef.current.push(layer);
      setProviderMaskState(landmark.providerIds, 'landmarkMasked');
    };

    const installLandmarks = () => {
      installTransamericaLandmark();
      installCoitTowerLandmark();
    };

    const refreshNearFieldOcclusion = (animate = revealRef.current) => {
      if (!nearFieldAtlas) {
        setOccludingPolygonCount(0);
        return;
      }
      const authored = selectedFeaturesRef.current.filter((feature) => feature.properties.source === 'asset');
      const venueBounds = projectedFeatureBounds(map, authored);
      const venueCenter = geometryCenter(authored);
      if (!venueBounds || !venueCenter) return;

      let occluderCount = 0;
      nearFieldAtlas.nearFeatures.forEach((feature: any) => {
        const atlasId = String(feature.properties?.atlasId ?? feature.id ?? '');
        const entry = nearFieldLayers.get(atlasId);
        if (!entry) return;
        const isOccluder = visualRef.current.occlusionMode !== 'off'
          && polygonOccludesVenue(map, feature.geometry, venueBounds, venueCenter, visualRef.current.occlusionSensitivity);
        if (isOccluder) occluderCount += 1;
        const targetOpacity = isOccluder
          ? (visualRef.current.occlusionMode === 'hide' ? 0.015 : visualRef.current.occluderOpacity)
          : visualRef.current.buildingOpacity;
        const minHeightValue = Number(feature.properties?.minHeight ?? 0);
        const minHeight = Number.isFinite(minHeightValue) && minHeightValue >= 0 ? minHeightValue : 0;
        const targetBase = map.getTerrain() && isOccluder && minHeight <= TERRAIN_OCCLUDER_BASE_METERS
          ? TERRAIN_OCCLUDER_BASE_METERS
          : minHeight;
        if (Math.abs(entry.targetBase - targetBase) >= 0.0005) {
          map.setPaintProperty(entry.layerId, 'fill-extrusion-base', targetBase);
          entry.targetBase = targetBase;
        }
        if (Math.abs(entry.targetOpacity - targetOpacity) >= 0.002) {
          map.setPaintProperty(entry.layerId, 'fill-extrusion-opacity-transition', {
            duration: animate ? Math.max(0, visualRef.current.occlusionFadeMs) : 0,
            delay: 0,
          } as any);
          map.setPaintProperty(entry.layerId, 'fill-extrusion-opacity', targetOpacity);
          entry.targetOpacity = targetOpacity;
        }
      });
      setOccludingPolygonCount(occluderCount);
      map.triggerRepaint();
    };

    const runNeighborhoodPulse = () => {
      if (disposed || !nearFieldAtlas || !nearFieldLayers.size) return;
      const pulseColor = mixHexColors(
        visualRef.current.buildingColor,
        visualRef.current.selectedColor,
        NEIGHBORHOOD_PULSE_COLOR_MIX,
      );

      nearFieldLayers.forEach((entry) => {
        const waveDelay = Math.round((entry.distanceMeters / NEIGHBORHOOD_PULSE_WAVE_SPEED_MPS) * 1000);
        scheduleNeighborhoodPulseTimeout(() => {
          if (disposed || !map.getLayer(entry.layerId)) return;
          map.setPaintProperty(entry.layerId, 'fill-extrusion-color-transition', {
            duration: NEIGHBORHOOD_PULSE_ATTACK_MS,
            delay: 0,
          } as any);
          map.setPaintProperty(entry.layerId, 'fill-extrusion-color', pulseColor);
        }, waveDelay);
        scheduleNeighborhoodPulseTimeout(() => {
          if (disposed || !map.getLayer(entry.layerId)) return;
          map.setPaintProperty(entry.layerId, 'fill-extrusion-color-transition', {
            duration: NEIGHBORHOOD_PULSE_RELEASE_MS,
            delay: 0,
          } as any);
          map.setPaintProperty(entry.layerId, 'fill-extrusion-color', visualRef.current.buildingColor);
        }, waveDelay + NEIGHBORHOOD_PULSE_ATTACK_MS + NEIGHBORHOOD_PULSE_HOLD_MS);
      });
      map.triggerRepaint();
    };

    const startNeighborhoodPulseLoop = () => {
      if (neighborhoodPulseInterval || disposed) return;
      scheduleNeighborhoodPulseTimeout(runNeighborhoodPulse, 850);
      neighborhoodPulseInterval = window.setInterval(runNeighborhoodPulse, NEIGHBORHOOD_PULSE_INTERVAL_MS);
    };

    const installNearFieldAtlas = () => {
      if (nearFieldAtlas) return;
      const atlasSource = map.getSource(AUTHORED_PARTS_SOURCE_ID) as GeoJSONSource | undefined;
      if (!atlasSource || !providerFeatureCache.size) return;

      nearFieldAtlas = buildPersistentNearFieldAtlas(
        Array.from(providerFeatureCache.values()),
        selectedFeaturesRef.current,
        NEAR_FIELD_ATLAS_RADIUS_METERS,
      );
      atlasSource.setData(nearFieldAtlas.collection);
      setOverlappingProviderIds(nearFieldAtlas.overlappingProviderIds);
      setProviderMaskState(nearFieldAtlas.maskedProviderIds, 'nearFieldMasked');
      const venueCenter = geometryCenter(selectedFeaturesRef.current.filter((feature) => feature.properties.source === 'asset'))
        ?? DEFAULT_CENTER;

      nearFieldAtlas.nearFeatures.forEach((feature: any, index: number) => {
        const atlasId = String(feature.properties?.atlasId ?? feature.id ?? `near:${index}`);
        const layerId = `${NEAR_FIELD_LAYER_PREFIX}${index}`;
        map.addLayer({
          id: layerId,
          type: 'fill-extrusion',
          source: AUTHORED_PARTS_SOURCE_ID,
          filter: ['==', ['get', 'atlasId'], atlasId],
          paint: {
            'fill-extrusion-color': visualRef.current.buildingColor,
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'minHeight'],
            'fill-extrusion-opacity': visualRef.current.buildingOpacity,
            'fill-extrusion-opacity-transition': { duration: visualRef.current.occlusionFadeMs, delay: 0 },
            'fill-extrusion-vertical-gradient': true,
          },
        } as any, map.getLayer(STREET_LABEL_LAYER_ID) ? STREET_LABEL_LAYER_ID : undefined);
        const featureCenter = geometryCentroid(feature.geometry);
        const distanceMeters = featureCenter ? centerDistanceMeters(featureCenter, venueCenter) : NEAR_FIELD_ATLAS_RADIUS_METERS;
        const minHeightValue = Number(feature.properties?.minHeight ?? 0);
        const minHeight = Number.isFinite(minHeightValue) && minHeightValue >= 0 ? minHeightValue : 0;
        nearFieldLayers.set(atlasId, {
          layerId,
          targetOpacity: visualRef.current.buildingOpacity,
          targetBase: minHeight,
          distanceMeters,
        });
        nearFieldLayerIdsRef.current.push(layerId);
      });
      refreshNearFieldOcclusion(false);
    };

    const updateSelectionSource = (animateOcclusion = revealRef.current) => {
      const source = map.getSource(SELECTED_SOURCE_ID) as GeoJSONSource | undefined;
      source?.setData(renderSelectionCollection(selectedFeaturesRef.current, 0.16) as any);
      const glowSource = map.getSource(SELECTED_GLOW_SOURCE_ID) as GeoJSONSource | undefined;
      glowSource?.setData(renderSelectionGlowCollection(selectedFeaturesRef.current, 0.34) as any);
      refreshNearFieldOcclusion(animateOcclusion);
    };
    refreshOcclusionRef.current = updateSelectionSource;

    const refreshLocalStreetLabels = () => refreshLocalStreetLabelsForMap(map, DEFAULT_CENTER);
    const refreshVenueScreenPoint = () => {
      const center = geometryCenter(selectedFeaturesRef.current.filter((feature) => feature.properties.source === 'asset'))
        ?? geometryCenter(selectedFeaturesRef.current);
      if (!center) {
        setVenueScreenPoint(null);
        return;
      }
      const point = map.project(center);
      setVenueScreenPoint({ x: point.x, y: point.y - 10 });
    };

    const applyVisuals = (next = visualRef.current) => {
      if (!map.isStyleLoaded()) return;
      landmarkLayersRef.current.forEach((layer) => layer.setColor(next.buildingColor));
      map.setSky({
        'sky-color': next.skyColor,
        'horizon-color': next.horizonColor,
        'fog-color': next.horizonColor,
        'fog-ground-blend': next.hazeStrength,
        'horizon-fog-blend': clamp(next.hazeStrength * 0.82, 0, 1),
        'sky-horizon-blend': 0.56,
        'atmosphere-blend': 0.16,
      } as any);
      if (map.getLayer('background')) map.setPaintProperty('background', 'background-color', '#050608');
      if (map.getLayer('dark-basemap')) map.setPaintProperty('dark-basemap', 'raster-brightness-max', next.groundBrightness);
      if (map.getLayer(CONTEXT_LAYER_ID)) {
        map.setPaintProperty(CONTEXT_LAYER_ID, 'fill-extrusion-color', providerContextColor(next.buildingColor));
        map.setPaintProperty(CONTEXT_LAYER_ID, 'fill-extrusion-opacity', next.buildingOpacity);
      }
      if (map.getLayer(SUPPLEMENTAL_CONTEXT_LAYER_ID)) {
        map.setPaintProperty(SUPPLEMENTAL_CONTEXT_LAYER_ID, 'fill-extrusion-color', providerContextColor(next.buildingColor));
        map.setPaintProperty(SUPPLEMENTAL_CONTEXT_LAYER_ID, 'fill-extrusion-opacity', next.buildingOpacity);
      }
      if (map.getLayer(AUTHORED_CONTEXT_LAYER_ID)) {
        map.setPaintProperty(AUTHORED_CONTEXT_LAYER_ID, 'fill-extrusion-color', next.buildingColor);
        map.setPaintProperty(AUTHORED_CONTEXT_LAYER_ID, 'fill-extrusion-opacity', next.buildingOpacity);
      }
      nearFieldLayers.forEach((entry) => {
        if (!map.getLayer(entry.layerId)) return;
        map.setPaintProperty(entry.layerId, 'fill-extrusion-color', next.buildingColor);
        map.setPaintProperty(entry.layerId, 'fill-extrusion-opacity-transition', { duration: next.occlusionFadeMs, delay: 0 } as any);
      });
      if (map.getLayer(AUTHORED_SELECTED_LAYER_ID)) {
        map.setPaintProperty(AUTHORED_SELECTED_LAYER_ID, 'fill-extrusion-color', next.selectedColor);
        map.setPaintProperty(AUTHORED_SELECTED_LAYER_ID, 'fill-extrusion-opacity', next.selectedOpacity);
      }
      if (map.getLayer(SELECTED_LAYER_ID)) {
        map.setPaintProperty(SELECTED_LAYER_ID, 'fill-extrusion-color', next.selectedColor);
        map.setPaintProperty(SELECTED_LAYER_ID, 'fill-extrusion-opacity', next.selectedOpacity);
      }
      if (map.getLayer(SELECTED_GLOW_LAYER_ID)) {
        map.setPaintProperty(SELECTED_GLOW_LAYER_ID, 'fill-extrusion-color', next.selectedColor);
        map.setPaintProperty(SELECTED_GLOW_LAYER_ID, 'fill-extrusion-opacity', next.selectedGlowOpacity);
        map.setLayoutProperty(SELECTED_GLOW_LAYER_ID, 'visibility', next.selectedGlowOpacity > 0.001 ? 'visible' : 'none');
      }
      if (map.getLayer(STREET_LABEL_LAYER_ID)) {
        map.setLayoutProperty(STREET_LABEL_LAYER_ID, 'text-size', next.streetLabelSize);
        map.setPaintProperty(STREET_LABEL_LAYER_ID, 'text-opacity', next.streetLabelOpacity);
      }
      map.setLight({
        anchor: 'viewport',
        color: next.lightColor,
        intensity: next.lightIntensity,
        position: [1.15, next.lightAzimuth, next.lightPolar],
      });
    };

    const finishRevealIfReady = async () => {
      if (disposed || revealRef.current || prewarmStartedRef.current || !map.isStyleLoaded() || !map.getSource(BUILDING_SOURCE_ID)) return;
      if (!map.isSourceLoaded(BUILDING_SOURCE_ID)) return;

      prewarmStartedRef.current = true;
      setSourceReady(true);
      const authoredCamera = clone(cameraRef.current);
      const warmBearings = [0, 90, 180, 270].map((offset) => normalizeBearing(authoredCamera.bearing + offset));

      for (let index = 0; index < warmBearings.length; index += 1) {
        if (disposed) return;
        setLoadProgress(72 + index * 4);
        setLoadStage(`Caching 360° neighborhood · ${index + 1}/${warmBearings.length}`);
        map.jumpTo({ ...authoredCamera, bearing: warmBearings[index] });
        await waitForMapIdle(map, 1500);
        cacheVisibleProviderFeatures();
        installLandmarks();
      }

      if (disposed) return;
      setLoadProgress(89);
      setLoadStage('Building persistent venue neighborhood');
      installNearFieldAtlas();
      await waitForMapIdle(map, 900);

      if (disposed) return;
      setLoadProgress(90);
      setLoadStage('Restoring authored arrival camera');
      map.jumpTo(authoredCamera);
      await waitForMapIdle(map, 1200);
      if (disposed) return;
      // Reapply the authored atmosphere after tile/style prewarming so the
      // first visible frame always matches the saved Street View profile.
      applyVisuals(visualRef.current);
      updateSelectionSource();
      refreshLocalStreetLabels();
      refreshVenueScreenPoint();

      const countRenderedBuildings = () => {
        const contextCount = map.getLayer(CONTEXT_LAYER_ID)
          ? map.queryRenderedFeatures({ layers: [CONTEXT_LAYER_ID] }).length
          : 0;
        const supplementalContextCount = map.getLayer(SUPPLEMENTAL_CONTEXT_LAYER_ID)
          ? map.queryRenderedFeatures({ layers: [SUPPLEMENTAL_CONTEXT_LAYER_ID] }).length
          : 0;
        const authoredContextCount = map.getLayer(AUTHORED_CONTEXT_LAYER_ID)
          ? map.queryRenderedFeatures({ layers: [AUTHORED_CONTEXT_LAYER_ID] }).length
          : 0;
        const authoredSelectedCount = map.getLayer(AUTHORED_SELECTED_LAYER_ID)
          ? map.queryRenderedFeatures({ layers: [AUTHORED_SELECTED_LAYER_ID] }).length
          : 0;
        const selectedCount = map.getLayer(SELECTED_LAYER_ID)
          ? map.queryRenderedFeatures({ layers: [SELECTED_LAYER_ID] }).length
          : 0;
        const totalContext = contextCount + supplementalContextCount + authoredContextCount;
        const totalSelected = authoredSelectedCount + selectedCount;
        return { contextCount: totalContext, selectedCount: totalSelected, total: totalContext + totalSelected };
      };

      let renderHealth = countRenderedBuildings();
      if (!renderHealth.total && authoredCamera.pitch > 64) {
        setLoadProgress(92);
        setLoadStage('Validating foreground geometry');
        map.jumpTo({ ...authoredCamera, pitch: 60 });
        await waitForMapIdle(map, 1000);
        renderHealth = countRenderedBuildings();
        map.jumpTo(authoredCamera);
        await waitForMapIdle(map, 700);
      }

      if (disposed) return;
      setRenderedBuildingCount(renderHealth.total);
      if (!renderHealth.total) {
        prewarmStartedRef.current = false;
        setLoadProgress(68);
        setLoadStage('Building render unavailable');
        setStatus('The building tiles loaded, but no extrusion geometry rendered. Check the MapLibre layer error before revealing the scene.');
        return;
      }

      revealRef.current = true;
      setLoadProgress(96);
      setLoadStage('Composing street view');
      window.setTimeout(() => {
        if (disposed) return;
        const canvas = map.getCanvas();
        try {
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          if (gl) {
            const sampleSize = 48;
            const pixels = new Uint8Array(sampleSize * sampleSize * 4);
            gl.readPixels(
              Math.max(0, Math.floor((canvas.width - sampleSize) / 2)),
              Math.max(0, Math.floor((canvas.height - sampleSize) / 2)),
              sampleSize,
              sampleSize,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              pixels,
            );
            let brightPixels = 0;
            for (let index = 0; index < pixels.length; index += 4) {
              if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 36) brightPixels += 1;
            }
            setRenderProbe(`${brightPixels}/${sampleSize * sampleSize} lit`);
          } else {
            setRenderProbe('no WebGL context');
          }
        } catch (error) {
          setRenderProbe('probe failed');
          console.warn('Street View render probe failed.', error);
        }
        setLoadProgress(100);
        setLoadStage('Ready');
        setSceneReady(true);
        startNeighborhoodPulseLoop();
        setLoadDurationMs(performance.now() - loadStartedAtRef.current);
      }, 180);
    };

    const onLoad = () => {
      measureAndResize();
      setLoadProgress(32);
      setLoadStage('Loading 3D buildings');
      map.addSource(TERRAIN_SOURCE_ID, {
        type: 'raster-dem',
        url: TERRAIN_SOURCE_URL,
      } as any);
      map.addSource(BUILDING_SOURCE_ID, {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution: '&copy; OpenStreetMap contributors',
      });
      map.addSource(SUPPLEMENTAL_CONTEXT_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        attribution: 'Microsoft Global ML Building Footprints',
      });
      map.addLayer({
        id: SUPPLEMENTAL_CONTEXT_LAYER_ID,
        type: 'fill-extrusion',
        source: SUPPLEMENTAL_CONTEXT_SOURCE_ID,
        minzoom: 14.5,
        paint: {
          'fill-extrusion-color': providerContextColor(visualRef.current.buildingColor),
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 6],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': visualRef.current.buildingOpacity,
          'fill-extrusion-vertical-gradient': true,
        },
      } as any);
      map.addLayer({
        id: CONTEXT_LAYER_ID,
        type: 'fill-extrusion',
        source: BUILDING_SOURCE_ID,
        'source-layer': BUILDING_SOURCE_LAYER,
        minzoom: 14.5,
        paint: {
          'fill-extrusion-color': providerContextColor(visualRef.current.buildingColor),
          'fill-extrusion-height': [
            'case',
            ['any',
              ['boolean', ['feature-state', 'nearFieldMasked'], false],
              ['boolean', ['feature-state', 'landmarkMasked'], false],
            ],
            MASKED_PROVIDER_HEIGHT_METERS,
            ['*', 1, ['coalesce', ['get', 'render_height'], ['get', 'height'], 8]],
          ],
          'fill-extrusion-base': [
            'case',
            ['any',
              ['boolean', ['feature-state', 'nearFieldMasked'], false],
              ['boolean', ['feature-state', 'landmarkMasked'], false],
            ],
            MASKED_PROVIDER_HEIGHT_METERS,
            ['*', 1, ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0]],
          ],
          'fill-extrusion-opacity': visualRef.current.buildingOpacity,
          'fill-extrusion-vertical-gradient': true,
        },
      } as any);
      map.addSource(AUTHORED_PARTS_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: AUTHORED_CONTEXT_LAYER_ID,
        type: 'fill-extrusion',
        source: AUTHORED_PARTS_SOURCE_ID,
        filter: ['==', ['get', 'role'], 'sibling'],
        paint: {
          'fill-extrusion-color': visualRef.current.buildingColor,
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'minHeight'],
          'fill-extrusion-opacity': visualRef.current.buildingOpacity,
          'fill-extrusion-vertical-gradient': true,
        },
      } as any);
      map.addLayer({
        id: AUTHORED_SELECTED_LAYER_ID,
        type: 'fill-extrusion',
        source: AUTHORED_PARTS_SOURCE_ID,
        filter: ['==', ['get', 'selected'], true],
        paint: {
          'fill-extrusion-color': visualRef.current.selectedColor,
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'minHeight'],
          'fill-extrusion-opacity': visualRef.current.selectedOpacity,
          'fill-extrusion-vertical-gradient': false,
        },
      } as any);
      map.addSource(SELECTED_SOURCE_ID, {
        type: 'geojson',
        data: renderSelectionCollection(selectedFeaturesRef.current, 0.16) as any,
      });
      map.addSource(SELECTED_GLOW_SOURCE_ID, {
        type: 'geojson',
        data: renderSelectionGlowCollection(selectedFeaturesRef.current, 0.34) as any,
      });
      map.addLayer({
        id: SELECTED_GLOW_LAYER_ID,
        type: 'fill-extrusion',
        source: SELECTED_GLOW_SOURCE_ID,
        layout: {
          visibility: visualRef.current.selectedGlowOpacity > 0.001 ? 'visible' : 'none',
        },
        paint: {
          'fill-extrusion-color': visualRef.current.selectedColor,
          'fill-extrusion-height': ['+', ['*', 1, ['get', 'height']], 0.1],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': visualRef.current.selectedGlowOpacity,
          'fill-extrusion-vertical-gradient': false,
        },
      } as any);
      map.addLayer({
        id: SELECTED_LAYER_ID,
        type: 'fill-extrusion',
        source: SELECTED_SOURCE_ID,
        paint: {
          'fill-extrusion-color': visualRef.current.selectedColor,
          'fill-extrusion-height': ['+', ['*', 1, ['get', 'height']], 0.28],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': visualRef.current.selectedOpacity,
          'fill-extrusion-vertical-gradient': false,
        },
      } as any);
      map.addSource(STREET_LABEL_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: STREET_LABEL_LAYER_ID,
        type: 'symbol',
        source: STREET_LABEL_SOURCE_ID,
        minzoom: 15,
        layout: {
          'symbol-placement': 'point',
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': visualRef.current.streetLabelSize,
          'text-rotate': ['get', 'rotation'],
          'text-pitch-alignment': 'viewport',
          'text-rotation-alignment': 'viewport',
          'text-keep-upright': true,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'text-padding': 8,
          'text-letter-spacing': 0.025,
        },
        paint: {
          'text-color': '#ebe7e8',
          'text-opacity': visualRef.current.streetLabelOpacity,
          'text-halo-color': '#09090c',
          'text-halo-width': 1.35,
          'text-halo-blur': 0.55,
        },
      } as any);
      applyVisuals();
      setLoadProgress(55);
      setLoadStage('Resolving Twist SF footprint');
      updateSelectionSource();
      map.jumpTo(cameraRef.current);
      setLoadProgress(68);
    };

    const onSourceData = (event: maplibregl.MapSourceDataEvent) => {
      if (event.sourceId !== BUILDING_SOURCE_ID) return;
      if (map.isSourceLoaded(BUILDING_SOURCE_ID)) {
        installLandmarks();
        void loadSupplementalContextIfNeeded();
        setSourceReady(true);
        setLoadProgress((current) => Math.max(current, 78));
        setLoadStage('Finishing nearby building tiles');
        finishRevealIfReady();
      }
    };

    const onIdle = () => {
      installLandmarks();
      void loadSupplementalContextIfNeeded();
      finishRevealIfReady();
    };
    const onRender = () => {
      const now = performance.now();
      const times = renderTimesRef.current;
      times.push(now);
      while (times.length && now - times[0] > 1000) times.shift();
      if (times.length > 1 && now - lastFpsPublishAtRef.current >= 250) {
        lastFpsPublishAtRef.current = now;
        setFps(Math.min(120, (times.length - 1) * 1000 / Math.max(1, times[times.length - 1] - times[0])));
      }
    };

    const canvas = map.getCanvasContainer();
    const drag = { active: false, pointerId: -1, x: 0, y: 0, bearing: camera.bearing, pitch: camera.pitch, moved: false };
    const cameraMotion = {
      raf: 0,
      lastTime: 0,
      targetBearing: camera.bearing,
      targetPitch: camera.pitch,
    };
    canvas.style.cursor = 'grab';

    const runCameraMotion = (time: number) => {
      cameraMotion.raf = 0;
      const dt = cameraMotion.lastTime ? Math.min(40, time - cameraMotion.lastTime) : 16;
      cameraMotion.lastTime = time;
      const currentBearing = map.getBearing();
      const currentPitch = map.getPitch();
      const bearingDelta = normalizeBearing(cameraMotion.targetBearing - currentBearing);
      const pitchDelta = cameraMotion.targetPitch - currentPitch;
      const blend = 1 - Math.exp(-dt / 58);
      const nextBearing = normalizeBearing(currentBearing + bearingDelta * blend);
      const nextPitch = clamp(currentPitch + pitchDelta * blend, 52, 85);
      map.jumpTo({
        center: cameraRef.current.center,
        zoom: cameraRef.current.zoom,
        bearing: nextBearing,
        pitch: nextPitch,
      });
      cameraRef.current = { ...cameraRef.current, bearing: nextBearing, pitch: nextPitch };
      if (Math.abs(bearingDelta) > 0.035 || Math.abs(pitchDelta) > 0.035) {
        cameraMotion.raf = window.requestAnimationFrame(runCameraMotion);
      } else {
        const settled = { ...cameraRef.current, bearing: cameraMotion.targetBearing, pitch: cameraMotion.targetPitch };
        map.jumpTo(settled);
        cameraRef.current = settled;
        setCameraState(settled);
        updateSelectionSource();
        refreshLocalStreetLabels();
        refreshVenueScreenPoint();
        cameraMotion.lastTime = 0;
      }
    };

    const moveTowardCamera = (bearing: number, pitch: number) => {
      cameraMotion.targetBearing = normalizeBearing(bearing);
      cameraMotion.targetPitch = clamp(pitch, 52, 85);
      if (!cameraMotion.raf) cameraMotion.raf = window.requestAnimationFrame(runCameraMotion);
    };

    const endDrag = (event?: PointerEvent) => {
      if (!drag.active || (event && event.pointerId !== drag.pointerId)) return;
      if (event && canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      drag.active = false;
      canvas.style.cursor = 'grab';
      if (drag.moved) {
        suppressClickRef.current = true;
        setDirty(true);
        setStatus('Camera angle changed. Save State to keep this arrival view.');
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!sceneReady && !revealRef.current) return;
      if (event.button !== 0) return;
      drag.active = true;
      drag.pointerId = event.pointerId;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.bearing = cameraMotion.targetBearing = map.getBearing();
      drag.pitch = cameraMotion.targetPitch = map.getPitch();
      drag.moved = false;
      canvas.setPointerCapture?.(event.pointerId);
      canvas.style.cursor = 'grabbing';
      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (!drag.moved) return;
      moveTowardCamera(drag.bearing - dx * 0.19, drag.pitch + dy * 0.125);
      event.preventDefault();
    };

    const onMapClick = (event: maplibregl.MapMouseEvent) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      const hitLayers = [CONTEXT_LAYER_ID, AUTHORED_CONTEXT_LAYER_ID, ...nearFieldLayerIdsRef.current]
        .filter((layerId) => Boolean(map.getLayer(layerId)));
      const hit = map.queryRenderedFeatures(event.point, { layers: hitLayers })[0];
      if (!hit) {
        setStatus('No building footprint under that point. Click a visible building extrusion to toggle it.');
        return;
      }
      const candidate = providerFeatureToStreetFeature(hit, [event.lngLat.lng, event.lngLat.lat]);
      if (!candidate) return;
      const providerId = candidate.properties.providerId!;
      const candidateKey = selectionGeometryKey(candidate);
      const alreadySelected = selectedFeaturesRef.current.some((feature) => selectionGeometryKey(feature) === candidateKey);
      const next = alreadySelected
        ? selectedFeaturesRef.current.filter((feature) => selectionGeometryKey(feature) !== candidateKey)
        : [...selectedFeaturesRef.current, candidate];
      selectedFeaturesRef.current = next;
      setSelectedFeatures(next);
      updateSelectionSource();
      setDirty(true);
      setStatus(alreadySelected ? `Removed this building footprint from provider ${providerId}.` : `Added only this building footprint from provider ${providerId}.`);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    map.on('load', onLoad);
    map.on('sourcedata', onSourceData);
    map.on('idle', onIdle);
    map.on('render', onRender);
    map.on('click', onMapClick);

    return () => {
      disposed = true;
      refreshOcclusionRef.current = () => {};
      setTerrainProviderPlateVisibilityRef.current = () => {};
      if (cameraMotion.raf) window.cancelAnimationFrame(cameraMotion.raf);
      if (neighborhoodPulseInterval) window.clearInterval(neighborhoodPulseInterval);
      neighborhoodPulseTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
      neighborhoodPulseTimeouts.clear();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      map.off('load', onLoad);
      map.off('sourcedata', onSourceData);
      map.off('idle', onIdle);
      map.off('render', onRender);
      map.off('click', onMapClick);
      map.remove();
      landmarkLayersRef.current = [];
      nearFieldLayerIdsRef.current = [];
      mapRef.current = null;
    };
  }, [profileLoaded]);

  useEffect(() => {
    selectedFeaturesRef.current = selectedFeatures;
    const map = mapRef.current;
    if (map?.getSource(AUTHORED_PARTS_SOURCE_ID)) {
      refreshOcclusionRef.current(revealRef.current);
      const center = geometryCenter(selectedFeatures.filter((feature) => feature.properties.source === 'asset')) ?? geometryCenter(selectedFeatures);
      if (center) {
        const point = map.project(center);
        setVenueScreenPoint({ x: point.x, y: point.y - 10 });
      } else {
        setVenueScreenPoint(null);
      }
    }
  }, [selectedFeatures]);

  const applyCamera = (patch: Partial<CameraState>, markDirty = true) => {
    const next = { ...cameraRef.current, ...patch };
    next.pitch = clamp(next.pitch, 52, 85);
    next.zoom = clamp(next.zoom, 15.5, 19);
    cameraRef.current = next;
    setCameraState(next);
    const map = mapRef.current;
    map?.jumpTo(next);
    if (map?.getSource(STREET_LABEL_SOURCE_ID)) refreshLocalStreetLabelsForMap(map, DEFAULT_CENTER);
    if (map?.getSource(AUTHORED_PARTS_SOURCE_ID)) {
      refreshOcclusionRef.current(revealRef.current);
      const center = geometryCenter(selectedFeaturesRef.current.filter((feature) => feature.properties.source === 'asset')) ?? geometryCenter(selectedFeaturesRef.current);
      if (center) {
        const point = map.project(center);
        setVenueScreenPoint({ x: point.x, y: point.y - 10 });
      }
    }
    if (markDirty) setDirty(true);
  };

  const applyVisual = (patch: Partial<VisualState>, markDirty = true) => {
    const next = { ...visualRef.current, ...patch };
    visualRef.current = next;
    setVisualState(next);
    const map = mapRef.current;
    if (map?.isStyleLoaded()) {
      landmarkLayersRef.current.forEach((layer) => layer.setColor(next.buildingColor));
      map.setSky({
        'sky-color': next.skyColor,
        'horizon-color': next.horizonColor,
        'fog-color': next.horizonColor,
        'fog-ground-blend': next.hazeStrength,
        'horizon-fog-blend': clamp(next.hazeStrength * 0.82, 0, 1),
        'sky-horizon-blend': 0.56,
        'atmosphere-blend': 0.16,
      } as any);
      if (map.getLayer('background')) map.setPaintProperty('background', 'background-color', '#050608');
      if (map.getLayer('dark-basemap')) map.setPaintProperty('dark-basemap', 'raster-brightness-max', next.groundBrightness);
      if (map.getLayer(CONTEXT_LAYER_ID)) {
        map.setPaintProperty(CONTEXT_LAYER_ID, 'fill-extrusion-color', providerContextColor(next.buildingColor));
        map.setPaintProperty(CONTEXT_LAYER_ID, 'fill-extrusion-opacity', next.buildingOpacity);
      }
      if (map.getLayer(SUPPLEMENTAL_CONTEXT_LAYER_ID)) {
        map.setPaintProperty(SUPPLEMENTAL_CONTEXT_LAYER_ID, 'fill-extrusion-color', providerContextColor(next.buildingColor));
        map.setPaintProperty(SUPPLEMENTAL_CONTEXT_LAYER_ID, 'fill-extrusion-opacity', next.buildingOpacity);
      }
      if (map.getLayer(AUTHORED_CONTEXT_LAYER_ID)) {
        map.setPaintProperty(AUTHORED_CONTEXT_LAYER_ID, 'fill-extrusion-color', next.buildingColor);
        map.setPaintProperty(AUTHORED_CONTEXT_LAYER_ID, 'fill-extrusion-opacity', next.buildingOpacity);
      }
      nearFieldLayerIdsRef.current.forEach((layerId) => {
        if (!map.getLayer(layerId)) return;
        map.setPaintProperty(layerId, 'fill-extrusion-color', next.buildingColor);
        map.setPaintProperty(layerId, 'fill-extrusion-opacity-transition', { duration: next.occlusionFadeMs, delay: 0 } as any);
      });
      if (map.getLayer(AUTHORED_SELECTED_LAYER_ID)) {
        map.setPaintProperty(AUTHORED_SELECTED_LAYER_ID, 'fill-extrusion-color', next.selectedColor);
        map.setPaintProperty(AUTHORED_SELECTED_LAYER_ID, 'fill-extrusion-opacity', next.selectedOpacity);
      }
      if (map.getLayer(SELECTED_LAYER_ID)) {
        map.setPaintProperty(SELECTED_LAYER_ID, 'fill-extrusion-color', next.selectedColor);
        map.setPaintProperty(SELECTED_LAYER_ID, 'fill-extrusion-opacity', next.selectedOpacity);
      }
      if (map.getLayer(SELECTED_GLOW_LAYER_ID)) {
        map.setPaintProperty(SELECTED_GLOW_LAYER_ID, 'fill-extrusion-color', next.selectedColor);
        map.setPaintProperty(SELECTED_GLOW_LAYER_ID, 'fill-extrusion-opacity', next.selectedGlowOpacity);
        map.setLayoutProperty(SELECTED_GLOW_LAYER_ID, 'visibility', next.selectedGlowOpacity > 0.001 ? 'visible' : 'none');
      }
      if (map.getLayer(STREET_LABEL_LAYER_ID)) {
        map.setLayoutProperty(STREET_LABEL_LAYER_ID, 'text-size', next.streetLabelSize);
        map.setPaintProperty(STREET_LABEL_LAYER_ID, 'text-opacity', next.streetLabelOpacity);
      }
      if ('buildingOpacity' in patch || 'occlusionMode' in patch || 'occluderOpacity' in patch || 'occlusionSensitivity' in patch || 'occlusionFadeMs' in patch) {
        refreshOcclusionRef.current(revealRef.current);
      }
      map.setLight({ anchor: 'viewport', color: next.lightColor, intensity: next.lightIntensity, position: [1.15, next.lightAzimuth, next.lightPolar] });
      map.triggerRepaint();
    }
    if (markDirty) setDirty(true);
  };

  const toggleTerrain = () => {
    const map = mapRef.current;
    if (!map?.getSource(TERRAIN_SOURCE_ID)) {
      setStatus('Terrain DEM source is not ready yet.');
      return;
    }
    const next = !terrainEnabled;
    map.setTerrain(next ? { source: TERRAIN_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION } : null);
    setTerrainEnabled(next);
    setTerrainProviderPlateVisibilityRef.current(next);
    window.requestAnimationFrame(() => {
      refreshOcclusionRef.current(false);
      map.triggerRepaint();
    });
    setStatus(next
      ? 'Terrain experiment enabled. Buildings now follow DEM elevation; compare Telegraph Hill and Coit Tower.'
      : 'Terrain experiment disabled. Restored the flat Street View baseline.');
  };

  const applyConceptPreset = () => {
    applyVisual({ ...DEFAULT_VISUAL });
    setStatus('Applied the soft Street View concept preset with horizon haze, venue bloom, and occlusion assist.');
  };

  const resetSelection = () => {
    const features = clone(DEFAULT_SELECTION);
    selectedFeaturesRef.current = features;
    setSelectedFeatures(features);
    setDirty(true);
    setStatus('Restored the two authored Twist SF footprint polygons.');
  };

  const clearSelection = () => {
    selectedFeaturesRef.current = [];
    setSelectedFeatures([]);
    setDirty(true);
    setStatus('Highlight selection cleared. Click one or more buildings in the scene.');
  };

  const removeSelection = (selectionId: string) => {
    const next = selectedFeaturesRef.current.filter((feature) => feature.properties.selectionId !== selectionId);
    selectedFeaturesRef.current = next;
    setSelectedFeatures(next);
    setDirty(true);
  };

  const centerOnSelection = () => {
    const center = geometryCenter(selectedFeaturesRef.current);
    if (!center) return;
    applyCamera({ center });
    setStatus('Camera target centered on the current merged building selection.');
  };

  const resetCamera = () => {
    const center = geometryCenter(selectedFeaturesRef.current) ?? DEFAULT_CENTER;
    applyCamera({ ...DEFAULT_CAMERA, center });
    setStatus('Camera reset to the Twist SF prototype arrival.');
  };

  const saveState = async () => {
    if (!selectedFeatures.length || saving) {
      if (!selectedFeatures.length) setStatus('Select at least one building footprint before saving.');
      return;
    }
    setSaving(true);
    setStatus('Saving Street View building selection, camera, and visual state…');
    const profile: StreetViewProfile = {
      id: `street-view-${LISTING_ID}`,
      version: 1,
      listingId: LISTING_ID,
      venueName: LISTING_NAME,
      address: LISTING_ADDRESS,
      camera: clone(cameraRef.current),
      visual: clone(visualRef.current),
      interaction: {
        mode: 'fixed-orbit',
        allowTravel: false,
        allowPublicZoom: false,
        minPitch: 52,
        maxPitch: 85,
      },
      buildingSelection: {
        providerFeatureIds: providerIds(selectedFeaturesRef.current),
        geometry: { type: 'FeatureCollection', features: clone(selectedFeaturesRef.current) },
      },
    };
    try {
      const response = await fetch('/api/admin/street-view/profile/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      if (!response.ok) throw new Error(await response.text());
      const payload = await response.json();
      const savedSkyColor = String(payload?.profile?.visual?.skyColor ?? '');
      if (savedSkyColor.toLowerCase() !== profile.visual.skyColor.toLowerCase()) {
        throw new Error(`Sky color round-trip mismatch: expected ${profile.visual.skyColor}, received ${savedSkyColor || 'missing'}.`);
      }
      setDirty(false);
      setStatus(`Saved ${selectedFeatures.length} highlighted footprint${selectedFeatures.length === 1 ? '' : 's'}, arrival camera, and sky ${savedSkyColor} for Twist SF.`);
    } catch (error) {
      console.error('Street View profile save failed', error);
      setStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const selectedProviderIds = providerIds(selectedFeatures);

  return (
    <div className="h-full min-h-0 overflow-auto bg-[#050608] text-zinc-100 xl:overflow-hidden">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1900px] flex-col gap-3 p-3 lg:p-4">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.09] bg-[rgba(12,14,18,0.86)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-red-300"><Building2 size={14} /><span className="text-[9px] font-bold uppercase tracking-[0.2em]">Fixed-location 3D venue prototype</span></div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-lg font-semibold tracking-tight text-white">Street View Tool</h1>
              <p className="max-w-3xl text-[10px] text-zinc-500">Twist SF · load the neighborhood first, then orbit from a constrained venue anchor.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => window.location.reload()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-black/35 px-2.5 text-[10px] text-zinc-300 hover:border-white/20 hover:text-white"><RefreshCw size={12} />Reload scene</button>
            <button type="button" onClick={resetCamera} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-black/35 px-2.5 text-[10px] text-zinc-300 hover:border-white/20 hover:text-white"><RotateCcw size={12} />Reset view</button>
            <button type="button" onClick={() => void saveState()} disabled={saving || !selectedFeatures.length} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-400/35 bg-red-500/12 px-2.5 text-[10px] font-semibold text-red-100 hover:border-red-300/55 disabled:cursor-not-allowed disabled:opacity-45"><Save size={12} />{saving ? 'Saving…' : dirty ? 'Save state*' : 'Save state'}</button>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.58fr)_minmax(360px,0.62fr)]">
          <section className="relative min-h-[560px] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#020305] shadow-[0_30px_90px_rgba(0,0,0,0.42)] xl:min-h-0">
            <div className="absolute inset-0 z-0">
              <div ref={mapContainerRef} className="h-full w-full" aria-label="Twist SF Street View prototype" />
            </div>
            <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),transparent_50%,rgba(0,0,0,0.2))]" />
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[48%]"
              style={{
                background: `linear-gradient(180deg, ${visualState.horizonColor} 0%, transparent 78%)`,
                opacity: 0.16 + visualState.hazeStrength * 0.16,
                mixBlendMode: 'screen',
              }}
            />
            {sceneReady && venueScreenPoint && visualState.venueBloomStrength > 0.001 ? (
              <div
                className="pointer-events-none absolute z-20 h-[150px] w-[230px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: venueScreenPoint.x,
                  top: venueScreenPoint.y,
                  background: `radial-gradient(ellipse at center, ${visualState.selectedColor} 0%, transparent 67%)`,
                  filter: 'blur(20px)',
                  opacity: visualState.venueBloomStrength,
                  mixBlendMode: 'screen',
                }}
              />
            ) : null}

            {!sceneReady ? (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#07080b]">
                <div className="flex flex-col items-center text-center">
                  <div className="relative flex h-24 w-24 items-center justify-center rounded-full" style={{ background: `conic-gradient(#c51d34 ${loadProgress * 3.6}deg, rgba(255,255,255,0.08) 0deg)` }}>
                    <div className="absolute inset-[5px] rounded-full bg-[#090a0e]" />
                    <span className="relative z-10 font-mono text-lg font-semibold text-white">{Math.round(loadProgress)}%</span>
                  </div>
                  <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.22em] text-red-200">{loadStage}</p>
                  <p className="mt-2 max-w-[300px] text-[10px] leading-4 text-zinc-600">Street mode stays hidden until the foreground building source and selected venue geometry are ready.</p>
                </div>
              </div>
            ) : null}

            <div className="pointer-events-auto absolute left-3 top-3 z-30 w-[min(360px,calc(100%-24px))] rounded-2xl border border-white/10 bg-[rgba(12,13,17,0.82)] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.32)] backdrop-blur-2xl">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-red-300">Venue</span>
                <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-red-100">Public</span>
              </div>
              <h2 className="mt-3 text-[24px] font-semibold tracking-tight text-white">Twist SF</h2>
              <p className="mt-1 text-[10px] text-zinc-300">Club <span className="mx-1.5 text-zinc-600">•</span><span className="text-red-300">North Beach / Fisherman’s Wharf</span></p>
              <div className="mt-4 flex items-start gap-2 border-t border-white/[0.08] pt-3">
                <MapPin size={13} className="mt-0.5 shrink-0 text-zinc-500" />
                <div><p className="text-[10px] text-zinc-200">387 Bay Street</p><p className="mt-0.5 text-[9px] text-zinc-500">San Francisco, CA 94133</p></div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                <div className="rounded-lg border border-white/[0.07] bg-black/25 px-2.5 py-2"><span className="block text-[7px] font-bold uppercase tracking-wider text-zinc-600">Footprints</span><span className="mt-1 block font-mono text-[11px] text-zinc-200">{selectedFeatures.length}</span></div>
                <div className="rounded-lg border border-white/[0.07] bg-black/25 px-2.5 py-2"><span className="block text-[7px] font-bold uppercase tracking-wider text-zinc-600">Sightline</span><span className="mt-1 block text-[10px] text-zinc-200">{occludingPolygonCount ? `${occludingPolygonCount} faded` : 'Clear'}</span></div>
                <div className="rounded-lg border border-white/[0.07] bg-black/25 px-2.5 py-2"><span className="block text-[7px] font-bold uppercase tracking-wider text-zinc-600">View</span><span className="mt-1 block text-[10px] text-zinc-200">Fixed orbit</span></div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a href="https://www.google.com/maps/search/?api=1&query=387%20Bay%20Street%2C%20San%20Francisco%2C%20CA%2094133" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-300/35 bg-red-500/90 px-3 text-[9px] font-semibold text-white hover:bg-red-500"><ExternalLink size={11} />Open in Maps</a>
                <a href="/globe" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-3 text-[9px] font-semibold text-zinc-300 hover:border-white/20 hover:text-white"><Navigation size={11} />Back to Globe</a>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[8px] text-zinc-500"><MousePointer2 size={10} />Drag to look around · selected venue remains the visual anchor</p>
            </div>

            <div className="pointer-events-auto absolute right-3 top-3 z-30 hidden w-[118px] rounded-2xl border border-white/10 bg-[rgba(10,11,15,0.78)] p-3 shadow-[0_16px_45px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:block">
              <div className="flex items-center justify-center text-[8px] font-bold uppercase tracking-[0.18em] text-zinc-500">N</div>
              <div className="relative mx-auto mt-2 flex h-[70px] w-[70px] items-center justify-center rounded-full border border-white/10 bg-black/20">
                <div className="absolute inset-[8px] rounded-full border border-white/[0.06]" />
                <div className="absolute h-[48px] w-px bg-white/[0.08]" />
                <div className="absolute h-px w-[48px] bg-white/[0.08]" />
                <Navigation size={28} className="text-red-300 drop-shadow-[0_0_9px_rgba(239,68,68,0.45)]" style={{ transform: `rotate(${cameraState.bearing}deg)` }} />
              </div>
              <div className="mt-2 text-center font-mono text-[8px] text-zinc-400">{bearingLabel(cameraState.bearing)}</div>
              <button type="button" onClick={resetCamera} className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-white/[0.08] bg-black/25 px-2 py-1.5 text-[8px] text-zinc-400 hover:text-white"><RotateCcw size={10} />Reset</button>
            </div>

            <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-30 grid grid-cols-2 gap-1.5 sm:grid-cols-6">
              <Metric label="Selected" value={`${selectedFeatures.length} footprint${selectedFeatures.length === 1 ? '' : 's'}`} />
              <Metric label="Provider IDs" value={selectedProviderIds.length ? String(selectedProviderIds.length) : 'authored'} />
              <Metric label="Load" value={loadDurationMs != null ? `${Math.round(loadDurationMs)} ms` : '—'} />
              <Metric label="Render" value={fps != null ? `${fps.toFixed(0)} fps` : 'idle'} />
              <Metric label="Buildings" value={sourceReady ? `${renderedBuildingCount} rendered` : 'loading'} />
              <Metric label="Canvas" value={canvasLayout} />
              <Metric label="Canvas probe" value={renderProbe} />
            </div>
          </section>

          <aside className="min-h-0 space-y-2 xl:overflow-y-auto xl:pr-1">
            <Panel title="Venue Building Selection" icon={<Crosshair size={14} />} open={openPanels.selection} onToggle={() => setOpenPanels((current) => ({ ...current, selection: !current.selection }))} summary={<span className="rounded-md border border-red-400/20 bg-red-500/[0.06] px-2 py-1 text-[9px] font-mono text-red-200">{selectedFeatures.length}</span>}>
              <p className="text-[9px] leading-4 text-zinc-500">Click any visible building to add/remove it. Twist starts from the existing authored asset, which contains two polygons so both connected building footprints can be treated as one venue.</p>
              <div className="mt-2 rounded-lg border border-amber-300/10 bg-amber-300/[0.025] p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[8px] font-bold uppercase tracking-[0.14em] text-amber-200/80">Overlap provider audit</span>
                  <span className="font-mono text-[8px] text-zinc-500">{overlappingProviderIds.length} detected</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {overlappingProviderIds.length ? overlappingProviderIds.map((providerId) => (
                    <span key={providerId} className="rounded border border-white/[0.08] bg-black/30 px-1.5 py-0.5 font-mono text-[8px] text-zinc-300">{providerId}</span>
                  )) : <span className="text-[8px] text-zinc-600">Waiting for overlapping building tiles…</span>}
                </div>
                <p className="mt-1.5 text-[8px] leading-3.5 text-zinc-600">Detected automatically from every loaded provider polygon that physically overlaps either saved Twist footprint. These IDs are masked from the bulk white layer before the authored red geometry is drawn.</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" onClick={resetSelection} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-[8px] font-bold uppercase tracking-wider text-zinc-300 hover:text-white">Twist asset ×2</button>
                <button type="button" onClick={centerOnSelection} disabled={!selectedFeatures.length} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-[8px] font-bold uppercase tracking-wider text-zinc-300 hover:text-white disabled:opacity-40">Center selection</button>
                <button type="button" onClick={clearSelection} className="rounded-md border border-red-400/20 bg-red-500/[0.05] px-2 py-1.5 text-[8px] font-bold uppercase tracking-wider text-red-200"><Trash2 size={10} className="mr-1 inline" />Clear</button>
              </div>
              <div className="mt-2 space-y-1">
                {selectedFeatures.length ? selectedFeatures.map((feature, index) => (
                  <div key={feature.properties.selectionId} className="flex items-center justify-between gap-2 rounded-md border border-white/[0.07] bg-black/20 px-2 py-1.5">
                    <span className="min-w-0 truncate font-mono text-[8px] text-zinc-400">#{index + 1} · {feature.properties.providerId ? `provider ${feature.properties.providerId}` : feature.properties.selectionId} · {feature.properties.height.toFixed(1)}m</span>
                    <button type="button" onClick={() => removeSelection(feature.properties.selectionId)} className="shrink-0 text-zinc-600 hover:text-red-200" aria-label={`Remove footprint ${index + 1}`}><Trash2 size={11} /></button>
                  </div>
                )) : <div className="rounded-md border border-dashed border-white/10 px-3 py-3 text-center text-[9px] text-zinc-600">No highlighted building. Click a building in the viewport.</div>}
              </div>
            </Panel>

            <Panel title="Arrival Camera" icon={<Camera size={14} />} open={openPanels.camera} onToggle={() => setOpenPanels((current) => ({ ...current, camera: !current.camera }))} summary={<span className="text-[8px] font-mono text-zinc-500">{cameraState.bearing.toFixed(0)}° / {cameraState.pitch.toFixed(0)}°</span>}>
              <div className="space-y-1.5">
                <RangeControl label="Bearing / facade angle" value={cameraState.bearing} min={-180} max={180} step={1} suffix="°" onChange={(bearing) => applyCamera({ bearing })} />
                <RangeControl label="Street pitch" value={cameraState.pitch} min={52} max={85} step={1} suffix="°" onChange={(pitch) => applyCamera({ pitch })} />
                <RangeControl label="Authoring distance" value={cameraState.zoom} min={16.4} max={18.4} step={0.05} onChange={(zoom) => applyCamera({ zoom })} />
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" onClick={centerOnSelection} className="rounded-md border border-white/10 bg-black/25 px-2 py-2 text-[8px] font-bold uppercase tracking-wider text-zinc-400 hover:text-white">Face selection</button>
                  <button type="button" onClick={resetCamera} className="rounded-md border border-white/10 bg-black/25 px-2 py-2 text-[8px] font-bold uppercase tracking-wider text-zinc-400 hover:text-white">Reset camera</button>
                </div>
                <p className="text-[8px] leading-3.5 text-zinc-600">The public version will use this authored zoom as its fixed stand-off distance. Dragging only changes bearing/pitch around this anchor.</p>
              </div>
            </Panel>

            <Panel title="Street Materials & Light" icon={<Sparkles size={14} />} open={openPanels.visual} onToggle={() => setOpenPanels((current) => ({ ...current, visual: !current.visual }))} summary={<span className="text-[8px] uppercase tracking-wider text-zinc-600">concept polish</span>}>
              <div className="space-y-1.5">
                <button type="button" onClick={applyConceptPreset} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-400/20 bg-red-500/[0.06] px-3 py-2 text-[8px] font-bold uppercase tracking-[0.12em] text-red-200 hover:border-red-300/35 hover:bg-red-500/[0.1]"><Sparkles size={11} />Apply concept preset</button>
                <button type="button" onClick={toggleTerrain} className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[8px] font-bold uppercase tracking-[0.12em] ${terrainEnabled ? 'border-amber-300/35 bg-amber-400/10 text-amber-100' : 'border-white/10 bg-black/20 text-zinc-400 hover:text-white'}`}><Navigation size={11} />Terrain experiment · {terrainEnabled ? 'on' : 'off'}</button>
                <p className="text-[8px] leading-3.5 text-zinc-600">Dev-only DEM comparison. Terrain is not saved to the venue profile yet.</p>
                <ColorControl label="Sky" value={visualState.skyColor} onChange={(skyColor) => applyVisual({ skyColor })} />
                <ColorControl label="Horizon haze" value={visualState.horizonColor} onChange={(horizonColor) => applyVisual({ horizonColor })} />
                <RangeControl label="Atmosphere softness" value={visualState.hazeStrength} min={0} max={0.75} step={0.01} onChange={(hazeStrength) => applyVisual({ hazeStrength })} />
                <ColorControl label="Context buildings" value={visualState.buildingColor} onChange={(buildingColor) => applyVisual({ buildingColor })} />
                <ColorControl label="Selected building" value={visualState.selectedColor} onChange={(selectedColor) => applyVisual({ selectedColor })} />
                <ColorControl label="Soft light" value={visualState.lightColor} onChange={(lightColor) => applyVisual({ lightColor })} />
                <RangeControl label="Building opacity" value={visualState.buildingOpacity} min={0.35} max={1} step={0.01} onChange={(buildingOpacity) => applyVisual({ buildingOpacity })} />
                <RangeControl label="Selected opacity" value={visualState.selectedOpacity} min={0.45} max={1} step={0.01} onChange={(selectedOpacity) => applyVisual({ selectedOpacity })} />
                <RangeControl label="Venue bloom" value={visualState.venueBloomStrength} min={0} max={0.8} step={0.01} onChange={(venueBloomStrength) => applyVisual({ venueBloomStrength })} />
                <div className="rounded-lg border border-white/[0.07] bg-black/20 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">Occlusion assist</span>
                    <span className="font-mono text-[8px] text-zinc-400">{occludingPolygonCount} active</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    {(['off', 'fade', 'hide'] as const).map((mode) => (
                      <button key={mode} type="button" onClick={() => applyVisual({ occlusionMode: mode })} className={`rounded-md border px-2 py-1.5 text-[8px] font-bold uppercase tracking-wider ${visualState.occlusionMode === mode ? 'border-red-400/35 bg-red-500/10 text-red-100' : 'border-white/[0.08] bg-black/25 text-zinc-500 hover:text-zinc-300'}`}>{mode}</button>
                    ))}
                  </div>
                  <p className="mt-2 text-[8px] leading-3.5 text-zinc-600">Only physical polygons in the current camera-to-venue sightline are split from their provider bucket. Sibling buildings stay solid.</p>
                </div>
                {visualState.occlusionMode === 'fade' ? <RangeControl label="Occluder opacity" value={visualState.occluderOpacity} min={0.02} max={0.5} step={0.01} onChange={(occluderOpacity) => applyVisual({ occluderOpacity })} /> : null}
                {visualState.occlusionMode !== 'off' ? <RangeControl label="Occlusion fade" value={visualState.occlusionFadeMs} min={400} max={5000} step={100} suffix="ms" onChange={(occlusionFadeMs) => applyVisual({ occlusionFadeMs })} /> : null}
                {visualState.occlusionMode !== 'off' ? <RangeControl label="Occlusion sensitivity" value={visualState.occlusionSensitivity} min={20} max={150} step={2} suffix="px" onChange={(occlusionSensitivity) => applyVisual({ occlusionSensitivity })} /> : null}
                <RangeControl label="Crimson geometry halo" value={visualState.selectedGlowOpacity} min={0} max={0.5} step={0.01} onChange={(selectedGlowOpacity) => applyVisual({ selectedGlowOpacity })} />
                <RangeControl label="Ground brightness" value={visualState.groundBrightness} min={0.12} max={0.75} step={0.01} onChange={(groundBrightness) => applyVisual({ groundBrightness })} />
                <RangeControl label="Street-name opacity" value={visualState.streetLabelOpacity} min={0.15} max={1} step={0.01} onChange={(streetLabelOpacity) => applyVisual({ streetLabelOpacity })} />
                <RangeControl label="Street-name size" value={visualState.streetLabelSize} min={10} max={20} step={0.5} suffix="px" onChange={(streetLabelSize) => applyVisual({ streetLabelSize })} />
                <RangeControl label="Soft-light intensity" value={visualState.lightIntensity} min={0} max={1} step={0.01} onChange={(lightIntensity) => applyVisual({ lightIntensity })} />
                <RangeControl label="Light azimuth" value={visualState.lightAzimuth} min={0} max={360} step={1} suffix="°" onChange={(lightAzimuth) => applyVisual({ lightAzimuth })} />
                <RangeControl label="Light height" value={visualState.lightPolar} min={5} max={85} step={1} suffix="°" onChange={(lightPolar) => applyVisual({ lightPolar })} />
                <p className="text-[8px] leading-3.5 text-zinc-600">The soft city treatment stays intentionally cheap: MapLibre extrusion gradients, broad viewport lighting, native horizon fog, a DOM bloom centered on the venue, and polygon-level occlusion fading after camera settle.</p>
              </div>
            </Panel>

            <Panel title="Performance & Loading" icon={<Gauge size={14} />} open={openPanels.performance} onToggle={() => setOpenPanels((current) => ({ ...current, performance: !current.performance }))} summary={<span className="text-[8px] font-mono text-zinc-500">{loadDurationMs != null ? `${Math.round(loadDurationMs)}ms` : 'loading'}</span>}>
              <div className="grid grid-cols-2 gap-1.5">
                <Metric label="First reveal" value={loadDurationMs != null ? `${Math.round(loadDurationMs)} ms` : '—'} />
                <Metric label="Source" value={sourceReady ? 'loaded' : 'pending'} />
                <Metric label="Geometry" value={renderedBuildingCount ? `${renderedBuildingCount} rendered` : 'none'} />
                <Metric label="Motion render" value={fps != null ? `${fps.toFixed(0)} fps` : 'idle'} />
                <Metric label="MSAA" value={(window.devicePixelRatio || 1) <= 1.25 ? 'on' : 'off'} />
              </div>
              <div className="mt-2 rounded-lg border border-white/[0.07] bg-black/20 p-2.5 text-[9px] leading-4 text-zinc-500">
                <LoaderCircle size={12} className="mr-1.5 inline text-red-300" />The scene intentionally waits for the visible building source before reveal. Travel, scroll zoom, keyboard navigation and free panning are disabled so the public viewer can stay focused and predictable.
              </div>
            </Panel>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default StreetViewToolPage;
