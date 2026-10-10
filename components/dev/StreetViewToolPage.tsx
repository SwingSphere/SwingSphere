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
import buildingAssetsJson from 'virtual:swingsphere-public-street-view-building-assets';
import listingsJson from 'virtual:swingsphere-public-listings';
import { getListingHeroUrl, getListingLogoUrl } from '../../lib/listingImage';
import { getCountryFlagImageUrl } from '../../lib/formatting';
import { useEntityIndex } from '../../hooks/useEntityIndex';
import { adminFetch } from '../../lib/adminApi';
import { fetchSupplementalBuildingFootprints } from '../../lib/buildingFootprintSources';
import { fuseBuildingNeighborhood } from '../../lib/buildingNeighborhoodFusion';
import { swingMapStyle } from '../maps/mapStyle';
import {
  createPyramidalLandmarkLayer,
  createTieredLandmarkLayer,
  resolveCoitTower,
  resolveTransamericaPyramid,
  type StreetViewLandmarkLayer,
} from './streetViewLandmarks';

const DEFAULT_LISTING_ID = 'club-twist-sf';
const formatClockTime = (value?: string): string => {
  if (!value) return '';
  const [hourPart, minutePart = '00'] = value.split(':');
  const hour = Number(hourPart);
  if (!Number.isFinite(hour)) return value;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  const minutes = minutePart === '00' ? '' : `:${minutePart}`;
  return `${displayHour}${minutes} ${suffix}`;
};
const buildingAssets = buildingAssetsJson as unknown as Array<any>;
const listings = listingsJson as unknown as Array<any>;
const PUBLIC_STREET_VIEW_VENUES = listings
  .filter((listing) => (
    listing?.status === 'approved'
    && listing?.type === 'club'
    && listing?.isAddressPrivate !== true
    && listing?.locationVisibility !== 'approximate_public'
    && listing?.locationVisibility !== 'private'
    && listing?.locationVisibility !== 'hidden'
    && listing?.locationMeta?.status !== 'private'
    && Boolean(String(listing?.geopoint?.address?.addressLine1 ?? '').trim())
  ))
  .sort((a, b) => String(a?.name ?? '').localeCompare(String(b?.name ?? '')));
const requestedListingId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('listingId') : null;
const selectedListing = PUBLIC_STREET_VIEW_VENUES.find((listing) => listing?.id === requestedListingId)
  ?? PUBLIC_STREET_VIEW_VENUES.find((listing) => listing?.id === DEFAULT_LISTING_ID)
  ?? PUBLIC_STREET_VIEW_VENUES[0];
const LISTING_ID = String(selectedListing?.id ?? DEFAULT_LISTING_ID);
const LISTING_NAME = String(selectedListing?.name ?? 'Twist SF');
const LISTING_ADDRESS = String(selectedListing?.location ?? '387 Bay Street, San Francisco, California 94133, United States');
const LISTING_ADDRESS_LINE1 = String(selectedListing?.geopoint?.address?.addressLine1 ?? LISTING_ADDRESS);
const LISTING_LOCALITY = [
  selectedListing?.geopoint?.address?.city,
  selectedListing?.geopoint?.address?.region,
  selectedListing?.geopoint?.address?.postalCode,
].filter(Boolean).join(', ');
const LISTING_REGION_LABEL = [
  selectedListing?.geopoint?.address?.city,
  selectedListing?.geopoint?.address?.region,
].filter(Boolean).join(', ');
const LISTING_MAP_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(LISTING_ADDRESS)}`;
const LISTING_DESCRIPTION = String(selectedListing?.description_short ?? '').trim();
const LISTING_AMENITIES = Array.isArray(selectedListing?.generalAmenities)
  ? selectedListing.generalAmenities.filter(Boolean).slice(0, 3).map(String)
  : [];
const LISTING_SCHEDULE = Array.isArray(selectedListing?.schedule) ? selectedListing.schedule : [];
const LISTING_FIRST_OPEN_DAY = LISTING_SCHEDULE.find((day: any) => !day?.isClosed && day?.open && day?.close);
const LISTING_AVAILABILITY = LISTING_FIRST_OPEN_DAY
  ? `${LISTING_FIRST_OPEN_DAY.day} ${formatClockTime(LISTING_FIRST_OPEN_DAY.open)}–${formatClockTime(LISTING_FIRST_OPEN_DAY.close)}`
  : '';
const FALLBACK_CENTER: [number, number] = [
  Number(selectedListing?.geopoint?.longitude ?? -122.4132692),
  Number(selectedListing?.geopoint?.latitude ?? 37.8055766),
];
const CONTEXT_LAYER_ID = 'street-view-context-buildings';
const SUPPLEMENTAL_CONTEXT_SOURCE_ID = 'street-view-supplemental-buildings';
const SUPPLEMENTAL_CONTEXT_LAYER_ID = 'street-view-supplemental-context-buildings';
const SUPPLEMENTAL_CONTEXT_RADIUS_METERS = 220;
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
const NEAR_FIELD_ATLAS_RADIUS_METERS = 220;
const NEAR_FIELD_LAYER_ID = 'street-view-near-field-buildings';
const NEAR_FIELD_FADE_OUT_0_LAYER_ID = 'street-view-near-field-fade-out-0';
const NEAR_FIELD_FADE_OUT_1_LAYER_ID = 'street-view-near-field-fade-out-1';
const NEAR_FIELD_FADE_IN_0_LAYER_ID = 'street-view-near-field-fade-in-0';
const NEAR_FIELD_FADE_IN_1_LAYER_ID = 'street-view-near-field-fade-in-1';

const NEAR_FIELD_FADE_OUT_LAYER_IDS = [
  NEAR_FIELD_FADE_OUT_0_LAYER_ID,
  NEAR_FIELD_FADE_OUT_1_LAYER_ID,
] as const;

const NEAR_FIELD_FADE_IN_LAYER_IDS = [
  NEAR_FIELD_FADE_IN_0_LAYER_ID,
  NEAR_FIELD_FADE_IN_1_LAYER_ID,
] as const;

export const SCENE_POPULATION_CONFIG = {
  nearFieldRadiusMeters: 220,
  transitionZoneRadiusMeters: 800,
  transitionCellMeters: 140, // 140m grid cell for spatial sampling in transition zone
  transitionMinHeightAtNearEdge: 36, // minimum height at 220m
  transitionMinHeightAtFarEdge: 54,  // minimum height at 800m
  transitionProminentFootprintArea: 1800, // m²
  distantMinHeight: 65, // minimum height beyond 800m for skyline silhouette
  distantCellMeters: 220, // spatial sampling in distant skyline
  distantProminentFootprintArea: 3500, // m²
};
const NEIGHBORHOOD_PULSE_INTERVAL_MS = 6500;
const NEIGHBORHOOD_PULSE_WAVE_SPEED_MPS = 120;
const NEIGHBORHOOD_PULSE_ATTACK_MS = 240;
const NEIGHBORHOOD_PULSE_HOLD_MS = 180;
const NEIGHBORHOOD_PULSE_RELEASE_MS = 520;
const NEIGHBORHOOD_PULSE_COLOR_MIX = 0.22;
const ARRIVAL_HOLD_MS = 140;
const ARRIVAL_DURATION_MS = 1300;
const ARRIVAL_ZOOM_OFFSET = 0.55;
const ARRIVAL_PITCH_OFFSET = 3;
const ARRIVAL_SELECTED_OPACITY_SCALE = 0.84;
const ARRIVAL_BLOOM_SCALE = 0.35;

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
  zoom: 18,
  pitch: 75,
  bearing: 162,
};

const DEFAULT_VISUAL: VisualState = {
  // Baseline Street View palette authored on Twist SF. New venues inherit
  // this treatment unless they have their own saved visual profile.
  skyColor: '#22191f',
  horizonColor: '#ff0008',
  hazeStrength: 0.46,
  buildingColor: '#0d0d0d',
  buildingOpacity: 1,
  selectedColor: '#dc2538',
  selectedOpacity: 1,
  selectedGlowOpacity: 0,
  groundBrightness: 0.3,
  streetLabelOpacity: 0.72,
  streetLabelSize: 13.5,
  lightColor: '#ffffff',
  lightIntensity: 0.48,
  lightAzimuth: 225,
  lightPolar: 44,
  venueBloomStrength: 0.34,
  occlusionMode: 'hide',
  occluderOpacity: 0.12,
  occlusionSensitivity: 82,
  occlusionFadeMs: 200,
};

const currentBuildingAsset = buildingAssets.find((asset) => asset?.listingId === LISTING_ID) ?? null;

type ViewportPadding = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

const getUsableViewportPadding = (
  container: HTMLElement | null,
  contextPanel: HTMLElement | null,
  headerOverlay: HTMLElement | null,
  isMobile: boolean,
): ViewportPadding => {
  if (!isMobile || !container) {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }

  const containerRect = container.getBoundingClientRect();
  if (containerRect.height <= 0) {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }

  let bottomObstruction = 0;
  if (contextPanel) {
    const panelRect = contextPanel.getBoundingClientRect();
    bottomObstruction = Math.max(0, containerRect.bottom - panelRect.top);
  }

  let topObstruction = 0;
  if (headerOverlay) {
    const headerRect = headerOverlay.getBoundingClientRect();
    topObstruction = Math.max(0, headerRect.bottom - containerRect.top);
  }

  // Fallback defaults if measured before full layout pass (compact mobile panel ~165-185px)
  if (bottomObstruction === 0) {
    bottomObstruction = Math.min(containerRect.height * 0.25, 185);
  }
  if (topObstruction === 0) {
    topObstruction = Math.min(containerRect.height * 0.18, 140);
  }

  // Small breathing margin so building base does not sit directly against panel edge
  bottomObstruction += 12;
  topObstruction += 8;

  // Clamp total padding to leave at least 25% of viewport clear
  const maxTotalObstruction = containerRect.height * 0.75;
  if (bottomObstruction + topObstruction > maxTotalObstruction) {
    const scale = maxTotalObstruction / (bottomObstruction + topObstruction);
    bottomObstruction = Math.round(bottomObstruction * scale);
    topObstruction = Math.round(topObstruction * scale);
  } else {
    bottomObstruction = Math.round(bottomObstruction);
    topObstruction = Math.round(topObstruction);
  }

  return {
    top: topObstruction,
    bottom: bottomObstruction,
    left: 0,
    right: 0,
  };
};

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

function getTargetFeatureRadiusMeters(features: StreetFeature[]): number {
  const center = geometryCenter(features);
  if (!center) return 18;
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
  if (!coords.length) return 18;
  let maxDist = 0;
  const latMeters = 111320;
  const lngMeters = 111320 * Math.cos(center[1] * (Math.PI / 180));
  coords.forEach(([lng, lat]) => {
    const dx = (lng - center[0]) * lngMeters;
    const dy = (lat - center[1]) * latMeters;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist) maxDist = dist;
  });
  return Math.max(10, Math.min(60, maxDist || 18));
}

function calculateZoomBounds(features: StreetFeature[]): { minZoom: number; maxZoom: number } {
  const radius = getTargetFeatureRadiusMeters(features);
  // Standoff scales with target building size so the camera never penetrates the geometry
  const maxZoom = clamp(18.9 - (radius / 60) * 0.8, 17.9, 18.75);
  // Standoff of ~120m-140m keeps the venue prominently in focus without turning into district-level map view
  const minZoom = clamp(maxZoom - 1.85, 16.2, 17.0);
  return { minZoom, maxZoom };
}

function featuresFromCurrentAsset(): StreetFeature[] {
  const geometry = currentBuildingAsset?.geometry;
  if (!geometry) return [];
  const providerIds = Array.isArray(currentBuildingAsset?.provider?.featureIds)
    ? currentBuildingAsset.provider.featureIds.map(String)
    : [];
  const authoredHeight = clamp(Number(currentBuildingAsset?.renderHeightMeters) || 9, 3, 350);
  if (geometry.type === 'Polygon') {
    return [{
      type: 'Feature',
      id: 'asset:0',
      properties: {
        selectionId: 'asset:0',
        providerId: providerIds[0],
        height: authoredHeight,
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
        height: authoredHeight,
        source: 'asset' as const,
      },
      geometry: { type: 'Polygon', coordinates: clone(coordinates) },
    }));
  }
  return [];
}

const DEFAULT_SELECTION = featuresFromCurrentAsset();
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

// -----------------------------------------------------------------------------
// Centralized Viewing Wedge Occlusion Configuration
// -----------------------------------------------------------------------------
export const OCCLUSION_CONFIG = {
  // Lateral safety margin (meters) added to both sides of the target building footprint
  targetSideMarginMeters: 4.5,

  // Lateral width (meters) of the viewing corridor at the camera origin
  cameraSideWedgeWidthMeters: 3.0,

  // Maximum rear depth margin (meters) past the far edge of the target building
  // Buildings further than targetMinU - targetRearDepthMarginMeters will NOT be hidden
  targetRearDepthMarginMeters: 2.0,

  // Maximum distance (meters) along sightline from camera for occlusion consideration
  maxOcclusionDistanceMeters: 220,

  // Hysteresis boundary margin (meters): expands lateral corridor for currently hidden buildings
  // Prevents boundary chatter/flapping during subtle camera movements
  wedgeExitMarginMeters: 3.5,

  // Smooth temporary fade transitions for wedge entry and exit
  fadeTransitionEnabled: true,
  fadeOutDurationMs: 300,
  fadeInDurationMs: 280,

  // Retain legacy tokens for backward compatibility if referenced
  disappearanceFlashEnabled: false,
  disappearanceFlashDurationMs: 180,
  corridorPaddingPx: 16,
  corridorLateralToleranceMeters: 14,
  hiddenEnterOverlap: 0.22,
  hiddenExitOverlap: 0.12,
  closeDistanceMeters: 90,
  farDistanceMeters: 190,
} as const;

export type OcclusionState = 'normal' | 'ghosted' | 'hidden';

export type NearFieldFadeSlot = {
  layerId: string;
  activeIds: Set<string>;
  timeoutId: number | null;
  startTime: number;
};

export type ExtrudedScreenBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  groundMinY: number;
  groundMaxY: number;
  roofMinY: number;
};

export function projectedBBoxBounds(
  map: MapLibreMap,
  bbox: [number, number, number, number],
  heightMeters = 12,
): ExtrudedScreenBounds | null {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const p1 = map.project([minLng, minLat]);
  const p2 = map.project([maxLng, minLat]);
  const p3 = map.project([maxLng, maxLat]);
  const p4 = map.project([minLng, maxLat]);

  const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
  const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
  const groundMinY = Math.min(p1.y, p2.y, p3.y, p4.y);
  const groundMaxY = Math.max(p1.y, p2.y, p3.y, p4.y);

  if (![minX, groundMinY, maxX, groundMaxY].every(Number.isFinite)) return null;

  const pitchRad = (map.getPitch() * Math.PI) / 180;
  const zoom = map.getZoom();
  const centerLat = map.getCenter().lat;
  const metersPerPx = (40075016.686 * Math.cos((centerLat * Math.PI) / 180)) / (512 * 2 ** zoom);
  const heightPx = metersPerPx > 0 ? (heightMeters / metersPerPx) * Math.sin(pitchRad) : 0;
  const roofMinY = groundMinY - heightPx;

  return {
    minX,
    maxX,
    minY: roofMinY,
    maxY: groundMaxY,
    groundMinY,
    groundMaxY,
    roofMinY,
  };
}

export function projectedExtrusionBounds(
  map: MapLibreMap,
  geometry: any,
  heightMeters = 12,
): ExtrudedScreenBounds | null {
  const coords = geometryCoordinates(geometry);
  if (!coords.length) return null;
  let minX = Infinity;
  let groundMinY = Infinity;
  let maxX = -Infinity;
  let groundMaxY = -Infinity;
  coords.forEach((coordinate) => {
    const point = map.project(coordinate);
    minX = Math.min(minX, point.x);
    groundMinY = Math.min(groundMinY, point.y);
    maxX = Math.max(maxX, point.x);
    groundMaxY = Math.max(groundMaxY, point.y);
  });
  if (![minX, groundMinY, maxX, groundMaxY].every(Number.isFinite)) return null;

  const pitchRad = (map.getPitch() * Math.PI) / 180;
  const zoom = map.getZoom();
  const centerLat = map.getCenter().lat;
  const metersPerPx = (40075016.686 * Math.cos((centerLat * Math.PI) / 180)) / (512 * 2 ** zoom);
  const heightPx = metersPerPx > 0 ? (heightMeters / metersPerPx) * Math.sin(pitchRad) : 0;
  const roofMinY = groundMinY - heightPx;

  return {
    minX,
    maxX,
    minY: roofMinY,
    maxY: groundMaxY,
    groundMinY,
    groundMaxY,
    roofMinY,
  };
}

export function projectedTargetExtrusionBounds(
  map: MapLibreMap,
  features: StreetFeature[],
): ExtrudedScreenBounds | null {
  const allBounds: ExtrudedScreenBounds[] = [];
  features.forEach((feature) => {
    const height = Number(feature.properties?.height ?? 10);
    const b = projectedExtrusionBounds(map, feature.geometry, height);
    if (b) allBounds.push(b);
  });
  if (!allBounds.length) return null;
  const minX = Math.min(...allBounds.map((b) => b.minX));
  const maxX = Math.max(...allBounds.map((b) => b.maxX));
  const minY = Math.min(...allBounds.map((b) => b.minY));
  const maxY = Math.max(...allBounds.map((b) => b.maxY));
  const groundMinY = Math.min(...allBounds.map((b) => b.groundMinY));
  const groundMaxY = Math.max(...allBounds.map((b) => b.groundMaxY));
  const roofMinY = Math.min(...allBounds.map((b) => b.roofMinY));
  return { minX, maxX, minY, maxY, groundMinY, groundMaxY, roofMinY };
}

function estimateCameraDistanceMeters(map: MapLibreMap): number {
  const canvas = map.getCanvas();
  const height = canvas.clientHeight || canvas.height || 768;
  const zoom = map.getZoom();
  const pitchRad = Math.min(1.45, (map.getPitch() * Math.PI) / 180);
  const centerLat = map.getCenter().lat;
  const metersPerPx = (40075016.686 * Math.cos((centerLat * Math.PI) / 180)) / (512 * 2 ** zoom);
  const cosPitch = Math.max(0.18, Math.cos(pitchRad));
  return (1.5 * height * metersPerPx) / cosPitch;
}

function localMeters(point: [number, number], origin: [number, number]): [number, number] {
  const cosLat = Math.cos(((point[1] + origin[1]) * 0.5) * Math.PI / 180);
  return [
    (point[0] - origin[0]) * 111320 * Math.max(0.2, cosLat),
    (point[1] - origin[1]) * 110540,
  ];
}

function polygonRingAreaMeters(ring: Array<[number, number]>, origin: [number, number]): number {
  if (!ring || ring.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = localMeters(ring[i], origin);
    const [x2, y2] = localMeters(ring[i + 1], origin);
    area += (x1 * y2 - x2 * y1);
  }
  return Math.abs(area) * 0.5;
}

function polygonGeometryAreaMeters(geometry: any, origin: [number, number]): number {
  const parts = polygonParts(geometry);
  if (!parts.length) return 0;
  let totalArea = 0;
  for (const part of parts) {
    if (Array.isArray(part) && Array.isArray(part[0])) {
      totalArea += polygonRingAreaMeters(part[0] as Array<[number, number]>, origin);
    }
  }
  return totalArea;
}

export function segmentsIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number,
): boolean {
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (Math.abs(denom) < 1e-9) return false;
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}

export function pointInUVCoords(x: number, y: number, ptsX: number[], ptsY: number[]): boolean {
  let inside = false;
  for (let i = 0, j = ptsX.length - 1; i < ptsX.length; j = i++) {
    const xi = ptsX[i];
    const yi = ptsY[i];
    const xj = ptsX[j];
    const yj = ptsY[j];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonIntersectsWedge(
  geometry: any,
  venueCenter: [number, number],
  ux: number, uy: number,
  vx: number, vy: number,
  farDepthLimit: number,
  maxEffectiveDepth: number,
  targetMaxU: number,
  targetLeftV: number,
  targetRightV: number,
  camHalfWidth: number,
  exitMargin: number,
): boolean {
  const parts = polygonParts(geometry);
  if (!parts.length) return false;

  const backU = farDepthLimit;
  const backLeftV = targetLeftV - exitMargin;
  const backRightV = targetRightV + exitMargin;

  const transU = Math.min(targetMaxU, maxEffectiveDepth);
  const transLeftV = targetLeftV - exitMargin;
  const transRightV = targetRightV + exitMargin;

  const frontU = maxEffectiveDepth;
  const frontLeftV = -camHalfWidth - exitMargin;
  const frontRightV = camHalfWidth + exitMargin;

  for (const part of parts) {
    const ring = Array.isArray(part) && Array.isArray(part[0]) ? (part[0] as Array<[number, number]>) : (part as any);
    if (!ring || ring.length < 3) continue;

    const ptsU: number[] = new Array(ring.length);
    const ptsV: number[] = new Array(ring.length);

    for (let i = 0; i < ring.length; i++) {
      const [pdx, pdy] = localMeters(ring[i], venueCenter);
      const pu = pdx * ux + pdy * uy;
      const pv = pdx * vx + pdy * vy;
      ptsU[i] = pu;
      ptsV[i] = pv;

      if (pu >= farDepthLimit && pu <= maxEffectiveDepth) {
        let left: number;
        let right: number;
        if (pu <= targetMaxU) {
          left = targetLeftV;
          right = targetRightV;
        } else {
          const span = Math.max(5, maxEffectiveDepth - targetMaxU);
          const t = Math.min(1, Math.max(0, (pu - targetMaxU) / span));
          left = (1 - t) * targetLeftV + t * (-camHalfWidth);
          right = (1 - t) * targetRightV + t * camHalfWidth;
        }
        if (pv >= left - exitMargin && pv <= right + exitMargin) {
          return true;
        }
      }
    }

    for (let i = 0; i < ring.length - 1; i++) {
      const u1 = ptsU[i];
      const v1 = ptsV[i];
      const u2 = ptsU[i + 1];
      const v2 = ptsV[i + 1];

      const edgeMinU = Math.min(u1, u2);
      const edgeMaxU = Math.max(u1, u2);
      const edgeMinV = Math.min(v1, v2);
      const edgeMaxV = Math.max(v1, v2);

      if (edgeMaxU < backU || edgeMinU > frontU) continue;
      if (edgeMaxV < Math.min(backLeftV, frontLeftV) || edgeMinV > Math.max(backRightV, frontRightV)) continue;

      if (segmentsIntersect(u1, v1, u2, v2, backU, backLeftV, transU, transLeftV)) return true;
      if (segmentsIntersect(u1, v1, u2, v2, transU, transLeftV, frontU, frontLeftV)) return true;
      if (segmentsIntersect(u1, v1, u2, v2, backU, backRightV, transU, transRightV)) return true;
      if (segmentsIntersect(u1, v1, u2, v2, transU, transRightV, frontU, frontRightV)) return true;
      if (segmentsIntersect(u1, v1, u2, v2, backU, backLeftV, backU, backRightV)) return true;
      if (segmentsIntersect(u1, v1, u2, v2, frontU, frontLeftV, frontU, frontRightV)) return true;
    }

    const centerU = (Math.max(farDepthLimit, targetMaxU) + maxEffectiveDepth) * 0.5;
    if (pointInUVCoords(centerU, 0, ptsU, ptsV)) return true;
  }

  return false;
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
      visibleContextIds: [] as string[],
      culledContextIds: [] as string[],
      nearFeatures: [] as any[],
      overflowFeatures: [] as any[],
      zoneCounts: { nearField: 0, transition: 0, skyline: 0, culled: 0 },
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
    const [dx, dy] = part.center ? localMeters(part.center, venueCenter) : [0, 0];
    const coords = geometryCoordinates(part.geometry);
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    coords.forEach(([lng, lat]) => {
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    });
    const bbox: [number, number, number, number] = [minLng, minLat, maxLng, maxLat];
    const radiusMetersPart = part.center ? Math.max(...coords.map((point) => centerDistanceMeters(point, part.center!)), 0) : 0;
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
        distanceMeters: part.center ? centerDistanceMeters(part.center, venueCenter) : 0,
      },
      geometry: clone(part.geometry),
      meta: {
        center: part.center,
        dx,
        dy,
        radiusMeters: radiusMetersPart,
        bbox,
      },
    };
    features.push(feature);
    if (part.nearField) nearFeatures.push(feature);
  });

  const overflowFeatures: any[] = [];

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

  // ---------------------------------------------------------------------------
  // Intermediate Transition & Distant Skyline Classification (Zones 2 & 3)
  // ---------------------------------------------------------------------------
  const outsideFeatures = new Map<string, {
    providerId: string;
    properties: Record<string, unknown>;
    center: [number, number];
    distanceMeters: number;
    height: number;
    areaMeters: number;
  }>();

  providerFeatures.forEach((feature) => {
    if (feature.id == null || !feature.geometry) return;
    const providerId = String(feature.id);
    if (maskedProviderIds.has(providerId) || overlappingProviderIds.has(providerId)) return;

    const area = polygonGeometryAreaMeters(feature.geometry, venueCenter);
    const existing = outsideFeatures.get(providerId);
    if (existing) {
      existing.areaMeters += area;
      return;
    }

    const center = geometryCentroid(feature.geometry);
    if (!center) return;
    const distanceMeters = centerDistanceMeters(center, venueCenter);
    const height = featureHeight(feature);
    const properties = (feature.properties ?? {}) as Record<string, unknown>;

    outsideFeatures.set(providerId, {
      providerId,
      properties,
      center,
      distanceMeters,
      height,
      areaMeters: area,
    });
  });

  const transitionCellMap = new Map<string, { providerId: string; score: number }>();
  const skylineCellMap = new Map<string, { providerId: string; score: number }>();
  const visibleContextIdsSet = new Set<string>();
  const culledContextIdsSet = new Set<string>();

  outsideFeatures.forEach((feat) => {
    const d = feat.distanceMeters;
    const h = feat.height;
    const a = feat.areaMeters;
    const isNamed = Boolean(feat.properties.name || feat.properties['name:en']);

    if (d <= SCENE_POPULATION_CONFIG.transitionZoneRadiusMeters) {
      // Zone 2: Intermediate Transition Context (220m < d <= 800m)
      const fraction = (d - SCENE_POPULATION_CONFIG.nearFieldRadiusMeters) /
        (SCENE_POPULATION_CONFIG.transitionZoneRadiusMeters - SCENE_POPULATION_CONFIG.nearFieldRadiusMeters);
      const minHeight = SCENE_POPULATION_CONFIG.transitionMinHeightAtNearEdge +
        fraction * (SCENE_POPULATION_CONFIG.transitionMinHeightAtFarEdge - SCENE_POPULATION_CONFIG.transitionMinHeightAtNearEdge);

      const isProminentHeight = h >= minHeight;
      const isProminentFootprint = a >= SCENE_POPULATION_CONFIG.transitionProminentFootprintArea && h >= 22;
      const isNamedAnchor = isNamed && h >= 28;

      if (!isProminentHeight && !isProminentFootprint && !isNamedAnchor) {
        culledContextIdsSet.add(feat.providerId);
        return;
      }

      // Spatial sampling: at most 1 anchor per block cell (140m)
      const [dx, dy] = localMeters(feat.center, venueCenter);
      const cellX = Math.floor(dx / SCENE_POPULATION_CONFIG.transitionCellMeters);
      const cellY = Math.floor(dy / SCENE_POPULATION_CONFIG.transitionCellMeters);
      const cellKey = `${cellX}:${cellY}`;

      const score = (h * Math.sqrt(Math.max(100, a))) * (isNamedAnchor ? 1.5 : 1.0);
      const existing = transitionCellMap.get(cellKey);
      if (!existing || existing.score < score) {
        if (existing) {
          culledContextIdsSet.add(existing.providerId);
          visibleContextIdsSet.delete(existing.providerId);
        }
        transitionCellMap.set(cellKey, { providerId: feat.providerId, score });
        visibleContextIdsSet.add(feat.providerId);
      } else {
        culledContextIdsSet.add(feat.providerId);
      }
    } else {
      // Zone 3: Distant Skyline (d > 800m)
      const isSkylineHeight = h >= SCENE_POPULATION_CONFIG.distantMinHeight;
      const isSkylineFootprint = a >= SCENE_POPULATION_CONFIG.distantProminentFootprintArea && h >= 35;

      if (!isSkylineHeight && !isSkylineFootprint) {
        culledContextIdsSet.add(feat.providerId);
        return;
      }

      // Spatial sampling: at most 1 skyline anchor per distant cell (220m)
      const [dx, dy] = localMeters(feat.center, venueCenter);
      const cellX = Math.floor(dx / SCENE_POPULATION_CONFIG.distantCellMeters);
      const cellY = Math.floor(dy / SCENE_POPULATION_CONFIG.distantCellMeters);
      const cellKey = `${cellX}:${cellY}`;

      const score = h * 2 + Math.sqrt(a);
      const existing = skylineCellMap.get(cellKey);
      if (!existing || existing.score < score) {
        if (existing) {
          culledContextIdsSet.add(existing.providerId);
          visibleContextIdsSet.delete(existing.providerId);
        }
        skylineCellMap.set(cellKey, { providerId: feat.providerId, score });
        visibleContextIdsSet.add(feat.providerId);
      } else {
        culledContextIdsSet.add(feat.providerId);
      }
    }
  });

  const culledContextIds = Array.from(culledContextIdsSet).filter((id) => !visibleContextIdsSet.has(id));

  const sortIds = (ids: Set<string> | string[]) => Array.from(ids).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return {
    collection: { type: 'FeatureCollection', features } as any,
    overlappingProviderIds: sortIds(overlappingProviderIds),
    maskedProviderIds: sortIds(maskedProviderIds),
    visibleContextIds: sortIds(visibleContextIdsSet),
    culledContextIds: sortIds(culledContextIds),
    nearFeatures,
    overflowFeatures,
    zoneCounts: {
      nearField: maskedProviderIds.size - overlappingProviderIds.size,
      transition: transitionCellMap.size,
      skyline: skylineCellMap.size,
      culled: culledContextIds.length,
    },
  };
}

function providerFeatureStateId(providerId: string): string | number {
  const numeric = Number(providerId);
  return Number.isFinite(numeric) && String(numeric) === providerId ? numeric : providerId;
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
    ['any',
      ['boolean', ['feature-state', 'terrainPlateHidden'], false],
      ['boolean', ['feature-state', 'nearFieldMasked'], false],
      ['boolean', ['feature-state', 'landmarkMasked'], false],
      ['boolean', ['feature-state', 'contextCulled'], false],
      ['!', ['boolean', ['feature-state', 'contextVisible'], false]],
    ],
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

type StreetViewPresentationKind = 'desktop' | 'mobile' | 'tablet';

type StreetViewToolPageProps = {
  presentationOnly?: boolean;
  presentationKind?: StreetViewPresentationKind;
};

const StreetViewToolPage: React.FC<StreetViewToolPageProps> = ({ presentationOnly = false, presentationKind = 'desktop' }) => {
  const isMobilePresentation = presentationOnly && (presentationKind === 'mobile' || (presentationKind !== 'tablet' && typeof window !== 'undefined' && window.innerWidth < 768));
  const isTabletPresentation = presentationOnly && (presentationKind === 'tablet' || (!isMobilePresentation && typeof window !== 'undefined' && window.innerWidth < 1024));
  const { listings: liveListings } = useEntityIndex();
  const presentationListing = liveListings.find((listing) => listing.id === LISTING_ID) ?? selectedListing;
  const presentationLogoUrl = getListingLogoUrl(presentationListing);
  const presentationHeroUrl = getListingHeroUrl(presentationListing);
  const presentationName = String(presentationListing?.name ?? LISTING_NAME);
  const presentationDescription = String(presentationListing?.description_short ?? LISTING_DESCRIPTION).trim();
  const presentationCountry = String(presentationListing?.geopoint?.address?.country ?? selectedListing?.geopoint?.address?.country ?? '').trim();
  const presentationCountryFlagUrl = getCountryFlagImageUrl(presentationCountry);
  const presentationRegionLabel = [
    presentationListing?.geopoint?.address?.city ?? selectedListing?.geopoint?.address?.city,
    presentationListing?.geopoint?.address?.region ?? selectedListing?.geopoint?.address?.region,
  ].filter(Boolean).join(', ');
  const presentationAmenities = Array.isArray(presentationListing?.generalAmenities)
    ? presentationListing.generalAmenities.filter(Boolean).map(String)
    : LISTING_AMENITIES;
  const compactAmenityCount = isMobilePresentation ? 2 : 3;
  const presentationSchedule = Array.isArray(presentationListing?.schedule) ? presentationListing.schedule : LISTING_SCHEDULE;
  const presentationFirstOpenDay = presentationSchedule.find((day: any) => !day?.isClosed && day?.open && day?.close);
  const presentationAvailability = presentationFirstOpenDay
    ? `${presentationFirstOpenDay.day} ${formatClockTime(presentationFirstOpenDay.open)}–${formatClockTime(presentationFirstOpenDay.close)}`
    : LISTING_AVAILABILITY;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const contextPanelRef = useRef<HTMLDivElement>(null);
  const headerOverlayRef = useRef<HTMLDivElement>(null);
  const isMobilePresentationRef = useRef(isMobilePresentation);
  const resetMotionRef = useRef<(bearing: number, pitch: number, zoom: number) => void>(() => {});
  const selectedFeaturesRef = useRef<StreetFeature[]>(clone(DEFAULT_SELECTION));
  const cameraRef = useRef<CameraState>({ ...DEFAULT_CAMERA, center: [...DEFAULT_CENTER] as [number, number] });
  const visualRef = useRef<VisualState>({ ...DEFAULT_VISUAL });
  const revealRef = useRef(false);
  const prewarmStartedRef = useRef(false);
  const loadStartedAtRef = useRef(performance.now());
  const renderTimesRef = useRef<number[]>([]);
  const lastFpsPublishAtRef = useRef(0);
  const landmarkLayersRef = useRef<StreetViewLandmarkLayer[]>([]);
  const settledHiddenIdsRef = useRef<Set<string>>(new Set());
  const hiddenAtlasIdsRef = settledHiddenIdsRef;
  const fadeOutSlotsRef = useRef<NearFieldFadeSlot[]>([
    { layerId: NEAR_FIELD_FADE_OUT_0_LAYER_ID, activeIds: new Set(), timeoutId: null, startTime: 0 },
    { layerId: NEAR_FIELD_FADE_OUT_1_LAYER_ID, activeIds: new Set(), timeoutId: null, startTime: 0 },
  ]);
  const fadeInSlotsRef = useRef<NearFieldFadeSlot[]>([
    { layerId: NEAR_FIELD_FADE_IN_0_LAYER_ID, activeIds: new Set(), timeoutId: null, startTime: 0 },
    { layerId: NEAR_FIELD_FADE_IN_1_LAYER_ID, activeIds: new Set(), timeoutId: null, startTime: 0 },
  ]);
  const suppressClickRef = useRef(false);
  const refreshOcclusionRef = useRef<() => void>(() => {});
  const setTerrainProviderPlateVisibilityRef = useRef<(terrainEnabled: boolean) => void>(() => {});
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>(cameraRef.current);
  const [visualState, setVisualState] = useState<VisualState>(visualRef.current);
  const [selectedFeatures, setSelectedFeatures] = useState<StreetFeature[]>(clone(DEFAULT_SELECTION));
  const [overlappingProviderIds, setOverlappingProviderIds] = useState<string[]>([]);
  const [occludingPolygonCount, setOccludingPolygonCount] = useState(0);
  const [venueScreenPoint, setVenueScreenPoint] = useState<{ x: number; y: number } | null>(null);
  const [arrivalBloomScale, setArrivalBloomScale] = useState(1);
  const [loadProgress, setLoadProgress] = useState(4);
  const [loadStage, setLoadStage] = useState(`Preparing ${LISTING_NAME}`);
  const [sceneReady, setSceneReady] = useState(false);
  const [terrainEnabled, setTerrainEnabled] = useState(true);
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
  const [amenitiesExpanded, setAmenitiesExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      const fallback = createDefaultProfile();
      try {
        const response = await adminFetch(`/api/admin/street-view/profile?listingId=${encodeURIComponent(LISTING_ID)}`);
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
        setStatus(payload?.profile ? `Saved Street View profile loaded for ${LISTING_NAME}.` : `Using the authored ${LISTING_NAME} building asset as the prototype baseline.`);
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
        setStatus(`Saved profile unavailable; using the authored ${LISTING_NAME} building asset baseline.`);
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
    let attributionCollapsed = false;
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
    const initialPadding = getUsableViewportPadding(
      mapContainerRef.current,
      contextPanelRef.current,
      headerOverlayRef.current,
      isMobilePresentationRef.current,
    );
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
    map.setPadding(initialPadding);
    mapRef.current = map;
    if (typeof window !== 'undefined') {
      (window as any).__map = map;
      (window as any).__hiddenAtlasIds = hiddenAtlasIdsRef.current;
    }

    const updatePadding = () => {
      if (!mapRef.current) return;
      const nextPadding = getUsableViewportPadding(
        mapContainerRef.current,
        contextPanelRef.current,
        headerOverlayRef.current,
        isMobilePresentationRef.current,
      );
      mapRef.current.setPadding(nextPadding);
      const center = geometryCenter(selectedFeaturesRef.current.filter((feature) => feature.properties.source === 'asset')) ?? geometryCenter(selectedFeaturesRef.current);
      if (center) {
        const point = mapRef.current.project(center);
        setVenueScreenPoint({ x: point.x, y: point.y - 10 });
      }
    };

    const measureAndResize = () => {
      map.resize();
      updatePadding();
      const canvas = map.getCanvas();
      const rect = canvas.getBoundingClientRect();
      setCanvasLayout(`${Math.round(rect.width)}×${Math.round(rect.height)} css · ${canvas.width}×${canvas.height} px`);
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updatePadding();
      });
      if (mapContainerRef.current) resizeObserver.observe(mapContainerRef.current);
      if (contextPanelRef.current) resizeObserver.observe(contextPanelRef.current);
      if (headerOverlayRef.current) resizeObserver.observe(headerOverlayRef.current);
    }

    const handleViewportChange = () => {
      updatePadding();
    };
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.visualViewport?.addEventListener('scroll', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      measureAndResize();
      if (presentationOnly) {
        const attribution = mapContainerRef.current?.querySelector('.maplibregl-ctrl-attrib');
        attribution?.classList.remove('maplibregl-compact-show');
        attribution?.removeAttribute('open');
      }
    }));

    const providerFeatureCache = new Map<string, any>();
    const maskedProviderIds = new Set<string>();
    const culledProviderIds = new Set<string>();
    let supplementalContextAttempted = false;
    let nearFieldAtlas: ReturnType<typeof buildPersistentNearFieldAtlas> | null = null;
    const neighborhoodPulseTimeouts = new Set<number>();
    let neighborhoodPulseInterval = 0;
    let arrivalStartTimeout = 0;
    let arrivalFinishTimeout = 0;

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
      supplementalContextAttempted = true;
      try {
        const fusion = await fuseBuildingNeighborhood({
          mode: 'auto',
          listingId: LISTING_ID,
          country: selectedListing?.geopoint?.address?.country,
          center,
          radiusMeters: SUPPLEMENTAL_CONTEXT_RADIUS_METERS,
          primaryFeatures: primaryCoverageFeatures,
          minimumContextFootprints: SUPPLEMENTAL_CONTEXT_MIN_PRIMARY_FOOTPRINTS,
          minimumContextCells: 7,
          loadSupplemental: async (signal) => {
            const supplemental = await fetchSupplementalBuildingFootprints({
              listingId: LISTING_ID,
              center,
              radiusMeters: SUPPLEMENTAL_CONTEXT_RADIUS_METERS,
              maxFeatures: 1_000,
              signal,
            });
            return {
              features: supplemental.features,
              provider: supplemental.provider,
              truncated: supplemental.truncated,
            };
          },
        });
        if (disposed) return;
        const supplementalFeatures = fusion.features.slice(primaryCoverageFeatures.length);
        const source = map.getSource(SUPPLEMENTAL_CONTEXT_SOURCE_ID) as GeoJSONSource | undefined;
        source?.setData({
          type: 'FeatureCollection',
          features: supplementalFeatures.map((feature) => ({
            type: 'Feature',
            id: feature.id ?? undefined,
            properties: feature.properties ?? {},
            geometry: feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
          })),
        } as any);
        if (supplementalFeatures.length) {
          setStatus(
            `Street View filled ${supplementalFeatures.length} local building gap${supplementalFeatures.length === 1 ? '' : 's'} using the shared ${fusion.sourceLabel} coverage policy.`,
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
      culledProviderIds.forEach((providerId) => {
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
          contextVisible: false,
          terrainPlateHidden: Boolean(map.getTerrain()),
        });
      });
    };

    const setProviderContextState = (visibleContextIds: string[], culledContextIds: string[]) => {
      visibleContextIds.forEach((providerId) => {
        map.setFeatureState({
          source: BUILDING_SOURCE_ID,
          sourceLayer: BUILDING_SOURCE_LAYER,
          id: providerFeatureStateId(providerId),
        }, {
          contextVisible: true,
          contextCulled: false,
          terrainPlateHidden: false,
        });
      });
      culledContextIds.forEach((providerId) => {
        culledProviderIds.add(providerId);
        map.setFeatureState({
          source: BUILDING_SOURCE_ID,
          sourceLayer: BUILDING_SOURCE_LAYER,
          id: providerFeatureStateId(providerId),
        }, {
          contextVisible: false,
          contextCulled: true,
          terrainPlateHidden: Boolean(map.getTerrain()),
        });
      });
    };

    let transamericaAttempted = false;
    let coitTowerAttempted = false;

    const installTransamericaLandmark = () => {
      if (transamericaAttempted || map.getLayer(TRANSAMERICA_LANDMARK_LAYER_ID) || !map.getSource(BUILDING_SOURCE_ID)) return;
      if (centerDistanceMeters(DEFAULT_CENTER, [-122.40279, 37.79517]) > 1500) {
        transamericaAttempted = true;
        return;
      }
      transamericaAttempted = true;
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
      if (coitTowerAttempted || map.getLayer(COIT_TOWER_LANDMARK_LAYER_ID) || !map.getSource(BUILDING_SOURCE_ID)) return;
      if (centerDistanceMeters(DEFAULT_CENTER, [-122.40582, 37.80239]) > 1500) {
        coitTowerAttempted = true;
        return;
      }
      coitTowerAttempted = true;
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

    const applyOcclusionFilter = () => {
      if (disposed) return;
      const allExcluded = new Set<string>(settledHiddenIdsRef.current);
      fadeOutSlotsRef.current.forEach((slot) => {
        slot.activeIds.forEach((id) => allExcluded.add(id));
      });
      fadeInSlotsRef.current.forEach((slot) => {
        slot.activeIds.forEach((id) => allExcluded.add(id));
      });

      const effectiveHidden = Array.from(allExcluded).sort();

      const nearFilter = effectiveHidden.length
        ? ['all', ['==', ['get', 'role'], 'near'], ['!', ['in', ['get', 'atlasId'], ['literal', effectiveHidden]]]]
        : ['==', ['get', 'role'], 'near'];

      if (map.getLayer(NEAR_FIELD_LAYER_ID)) {
        map.setFilter(NEAR_FIELD_LAYER_ID, nearFilter as any);
      }

      const siblingFilter = effectiveHidden.length
        ? ['all', ['==', ['get', 'role'], 'sibling'], ['!', ['in', ['get', 'atlasId'], ['literal', effectiveHidden]]]]
        : ['==', ['get', 'role'], 'sibling'];

      if (map.getLayer(AUTHORED_CONTEXT_LAYER_ID)) {
        map.setFilter(AUTHORED_CONTEXT_LAYER_ID, siblingFilter as any);
      }

      if (!presentationOnly && !cameraMotion.raf) {
        let fadeOutCount = 0;
        fadeOutSlotsRef.current.forEach((s) => { fadeOutCount += s.activeIds.size; });
        setOccludingPolygonCount(settledHiddenIdsRef.current.size + fadeOutCount);
      }
    };

    const refreshNearFieldOcclusion = () => {
      if (disposed || !nearFieldAtlas) {
        if (!presentationOnly && !cameraMotion.raf) setOccludingPolygonCount(0);
        return;
      }
      const authored = selectedFeaturesRef.current.filter((feature) => feature.properties.source === 'asset');
      const activeVenueFeatures = authored.length ? authored : selectedFeaturesRef.current;
      const venueCenter = geometryCenter(activeVenueFeatures);
      if (!venueCenter) return;

      if (visualRef.current.occlusionMode === 'off') {
        let hadAny = settledHiddenIdsRef.current.size > 0;
        fadeOutSlotsRef.current.forEach((s) => {
          if (s.timeoutId) { window.clearTimeout(s.timeoutId); s.timeoutId = null; }
          if (s.activeIds.size > 0) hadAny = true;
          s.activeIds.clear();
          if (map.getLayer(s.layerId)) {
            map.setFilter(s.layerId, ['==', ['get', 'atlasId'], '__none__']);
          }
        });
        fadeInSlotsRef.current.forEach((s) => {
          if (s.timeoutId) { window.clearTimeout(s.timeoutId); s.timeoutId = null; }
          if (s.activeIds.size > 0) hadAny = true;
          s.activeIds.clear();
          if (map.getLayer(s.layerId)) {
            map.setFilter(s.layerId, ['==', ['get', 'atlasId'], '__none__']);
          }
        });
        if (hadAny) {
          settledHiddenIdsRef.current.clear();
          if (!presentationOnly && !cameraMotion.raf) setOccludingPolygonCount(0);
          if (map.getLayer(NEAR_FIELD_LAYER_ID)) {
            map.setFilter(NEAR_FIELD_LAYER_ID, ['==', ['get', 'role'], 'near']);
          }
          if (map.getLayer(AUTHORED_CONTEXT_LAYER_ID)) {
            map.setFilter(AUTHORED_CONTEXT_LAYER_ID, ['==', ['get', 'role'], 'sibling']);
          }
        }
        return;
      }

      const cameraBearing = map.getBearing();
      const cameraSideRadians = ((cameraBearing + 180) * Math.PI) / 180;
      const ux = Math.sin(cameraSideRadians);
      const uy = Math.cos(cameraSideRadians);
      const vx = Math.cos(cameraSideRadians);
      const vy = -Math.sin(cameraSideRadians);

      const cameraDistance = estimateCameraDistanceMeters(map);
      const maxEffectiveDepth = Math.min(cameraDistance, OCCLUSION_CONFIG.maxOcclusionDistanceMeters);

      // Compute target envelope in (u, v) space
      const targetCoords = activeVenueFeatures.flatMap((f) => geometryCoordinates(f.geometry));
      let targetMinU = Infinity;
      let targetMaxU = -Infinity;
      let targetMinV = Infinity;
      let targetMaxV = -Infinity;

      targetCoords.forEach((pt) => {
        const [dx, dy] = localMeters(pt, venueCenter);
        const u = dx * ux + dy * uy;
        const v = dx * vx + dy * vy;
        if (u < targetMinU) targetMinU = u;
        if (u > targetMaxU) targetMaxU = u;
        if (v < targetMinV) targetMinV = v;
        if (v > targetMaxV) targetMaxV = v;
      });

      if (!Number.isFinite(targetMinU)) {
        targetMinU = -15; targetMaxU = 15;
        targetMinV = -15; targetMaxV = 15;
      }

      const targetSideMargin = OCCLUSION_CONFIG.targetSideMarginMeters;
      const targetLeftV = targetMinV - targetSideMargin;
      const targetRightV = targetMaxV + targetSideMargin;
      const farDepthLimit = targetMinU - OCCLUSION_CONFIG.targetRearDepthMarginMeters;
      const camHalfWidth = OCCLUSION_CONFIG.cameraSideWedgeWidthMeters * 0.5;

      const nextHiddenIds: string[] = [];

      const evaluateCandidate = (feature: any) => {
        const atlasId = String(feature.properties?.atlasId ?? feature.id ?? '');
        if (!atlasId) return;

        // Target protection: Never hide selected venue or authored parts
        if (feature.properties?.selected || atlasId.startsWith('authored:')) {
          return;
        }

        const dx = Number(feature.meta?.dx ?? 0);
        const dy = Number(feature.meta?.dy ?? 0);
        const radiusMeters = Number(feature.meta?.radiusMeters ?? 10);

        // Stage 1: Coarse Depth Rejection
        const candCenterU = dx * ux + dy * uy;
        if (candCenterU + radiusMeters < farDepthLimit) {
          return; // Behind target
        }
        if (candCenterU - radiusMeters > maxEffectiveDepth) {
          return; // Behind camera or past max depth
        }

        // Stage 2: Coarse Lateral Rejection
        const candCenterV = dx * vx + dy * vy;
        const isCurrentlyOccluded = settledHiddenIdsRef.current.has(atlasId) ||
          fadeOutSlotsRef.current.some((s) => s.activeIds.has(atlasId));
        const exitMargin = isCurrentlyOccluded ? OCCLUSION_CONFIG.wedgeExitMarginMeters : 0;

        const globalWedgeMinV = targetLeftV - exitMargin;
        const globalWedgeMaxV = targetRightV + exitMargin;

        if (candCenterV - radiusMeters > globalWedgeMaxV || candCenterV + radiusMeters < globalWedgeMinV) {
          return; // Outside lateral span
        }

        const clampedCenterU = Math.max(farDepthLimit, Math.min(maxEffectiveDepth, candCenterU));
        let centerLeftV: number;
        let centerRightV: number;
        if (clampedCenterU <= targetMaxU) {
          centerLeftV = targetLeftV - exitMargin;
          centerRightV = targetRightV + exitMargin;
        } else {
          const span = Math.max(5, maxEffectiveDepth - targetMaxU);
          const t = Math.min(1, Math.max(0, (clampedCenterU - targetMaxU) / span));
          centerLeftV = (1 - t) * targetLeftV + t * (-camHalfWidth) - exitMargin;
          centerRightV = (1 - t) * targetRightV + t * camHalfWidth + exitMargin;
        }

        if (candCenterV - radiusMeters > centerRightV || candCenterV + radiusMeters < centerLeftV) {
          return;
        }

        if (candCenterV - radiusMeters >= centerLeftV && candCenterV + radiusMeters <= centerRightV) {
          nextHiddenIds.push(atlasId);
          return;
        }

        // Stage 3: Footprint Polygon vs Wedge Intersection
        if (
          polygonIntersectsWedge(
            feature.geometry,
            venueCenter,
            ux, uy, vx, vy,
            farDepthLimit,
            maxEffectiveDepth,
            targetMaxU,
            targetLeftV,
            targetRightV,
            camHalfWidth,
            exitMargin,
          )
        ) {
          nextHiddenIds.push(atlasId);
        }
      };

      nearFieldAtlas.nearFeatures.forEach(evaluateCandidate);
      nearFieldAtlas.overflowFeatures.forEach(evaluateCandidate);

      const nextSet = new Set(nextHiddenIds);
      let changed = false;

      // Identify newly entering wedge (target state: hidden)
      const newlyEntering: string[] = [];
      nextSet.forEach((id) => {
        const isSettledHidden = settledHiddenIdsRef.current.has(id);
        const isFadingOut = fadeOutSlotsRef.current.some((s) => s.activeIds.has(id));
        if (!isSettledHidden && !isFadingOut) {
          newlyEntering.push(id);
        }
      });

      // Identify newly exiting wedge (target state: visible)
      const newlyExiting: string[] = [];
      settledHiddenIdsRef.current.forEach((id) => {
        if (!nextSet.has(id)) {
          newlyExiting.push(id);
          settledHiddenIdsRef.current.delete(id);
        }
      });
      fadeOutSlotsRef.current.forEach((slot) => {
        const removedFromSlot: string[] = [];
        slot.activeIds.forEach((id) => {
          if (!nextSet.has(id)) {
            removedFromSlot.push(id);
          }
        });
        if (removedFromSlot.length > 0) {
          removedFromSlot.forEach((id) => {
            slot.activeIds.delete(id);
            newlyExiting.push(id);
          });
          if (slot.activeIds.size === 0) {
            if (slot.timeoutId) {
              window.clearTimeout(slot.timeoutId);
              slot.timeoutId = null;
            }
            if (map.getLayer(slot.layerId)) {
              map.setFilter(slot.layerId, ['==', ['get', 'atlasId'], '__none__']);
            }
          } else if (map.getLayer(slot.layerId)) {
            map.setFilter(slot.layerId, ['in', ['get', 'atlasId'], ['literal', Array.from(slot.activeIds)]]);
          }
        }
      });

      // If any newly entering buildings were currently fading in, cancel their fade in
      if (newlyEntering.length > 0) {
        newlyEntering.forEach((id) => {
          fadeInSlotsRef.current.forEach((slot) => {
            if (slot.activeIds.has(id)) {
              slot.activeIds.delete(id);
              if (slot.activeIds.size === 0) {
                if (slot.timeoutId) {
                  window.clearTimeout(slot.timeoutId);
                  slot.timeoutId = null;
                }
                if (map.getLayer(slot.layerId)) {
                  map.setFilter(slot.layerId, ['==', ['get', 'atlasId'], '__none__']);
                }
              } else if (map.getLayer(slot.layerId)) {
                map.setFilter(slot.layerId, ['in', ['get', 'atlasId'], ['literal', Array.from(slot.activeIds)]]);
              }
            }
          });
        });
      }

      if (newlyEntering.length > 0) {
        changed = true;
        if (OCCLUSION_CONFIG.fadeTransitionEnabled) {
          const slots = fadeOutSlotsRef.current;
          let targetSlot = slots.find((s) => s.activeIds.size === 0);
          const now = performance.now();
          if (!targetSlot) {
            targetSlot = slots[0];
            for (let i = 1; i < slots.length; i++) {
              if (slots[i].startTime < targetSlot.startTime) {
                targetSlot = slots[i];
              }
            }
            if (targetSlot.timeoutId) {
              window.clearTimeout(targetSlot.timeoutId);
              targetSlot.timeoutId = null;
            }
            targetSlot.activeIds.forEach((id) => settledHiddenIdsRef.current.add(id));
            targetSlot.activeIds.clear();
          }

          newlyEntering.forEach((id) => targetSlot!.activeIds.add(id));
          targetSlot.startTime = now;

          const layerId = targetSlot.layerId;
          if (map.getLayer(layerId)) {
            map.setPaintProperty(layerId, 'fill-extrusion-opacity-transition', { duration: 0, delay: 0 } as any);
            map.setPaintProperty(layerId, 'fill-extrusion-opacity', visualRef.current.buildingOpacity);
            map.setFilter(layerId, ['in', ['get', 'atlasId'], ['literal', Array.from(targetSlot.activeIds)]]);
            const durationMs = OCCLUSION_CONFIG.fadeOutDurationMs;
            map.setPaintProperty(layerId, 'fill-extrusion-opacity-transition', { duration: durationMs, delay: 0 } as any);
            map.setPaintProperty(layerId, 'fill-extrusion-opacity', 0.0);

            const slotRef = targetSlot;
            targetSlot.timeoutId = window.setTimeout(() => {
              if (disposed) return;
              slotRef.timeoutId = null;
              slotRef.activeIds.forEach((id) => settledHiddenIdsRef.current.add(id));
              slotRef.activeIds.clear();
              if (map.getLayer(slotRef.layerId)) {
                map.setFilter(slotRef.layerId, ['==', ['get', 'atlasId'], '__none__']);
              }
              applyOcclusionFilter();
            }, durationMs);
          }
        } else {
          newlyEntering.forEach((id) => settledHiddenIdsRef.current.add(id));
        }
      }

      if (newlyExiting.length > 0) {
        changed = true;
        if (OCCLUSION_CONFIG.fadeTransitionEnabled) {
          const slots = fadeInSlotsRef.current;
          let targetSlot = slots.find((s) => s.activeIds.size === 0);
          const now = performance.now();
          if (!targetSlot) {
            targetSlot = slots[0];
            for (let i = 1; i < slots.length; i++) {
              if (slots[i].startTime < targetSlot.startTime) {
                targetSlot = slots[i];
              }
            }
            if (targetSlot.timeoutId) {
              window.clearTimeout(targetSlot.timeoutId);
              targetSlot.timeoutId = null;
            }
            targetSlot.activeIds.clear();
          }

          newlyExiting.forEach((id) => targetSlot!.activeIds.add(id));
          targetSlot.startTime = now;

          const layerId = targetSlot.layerId;
          if (map.getLayer(layerId)) {
            map.setPaintProperty(layerId, 'fill-extrusion-opacity-transition', { duration: 0, delay: 0 } as any);
            map.setPaintProperty(layerId, 'fill-extrusion-opacity', 0.0);
            map.setFilter(layerId, ['in', ['get', 'atlasId'], ['literal', Array.from(targetSlot.activeIds)]]);
            const durationMs = OCCLUSION_CONFIG.fadeInDurationMs;
            map.setPaintProperty(layerId, 'fill-extrusion-opacity-transition', { duration: durationMs, delay: 0 } as any);
            map.setPaintProperty(layerId, 'fill-extrusion-opacity', visualRef.current.buildingOpacity);

            const slotRef = targetSlot;
            targetSlot.timeoutId = window.setTimeout(() => {
              if (disposed) return;
              slotRef.timeoutId = null;
              slotRef.activeIds.clear();
              if (map.getLayer(slotRef.layerId)) {
                map.setFilter(slotRef.layerId, ['==', ['get', 'atlasId'], '__none__']);
              }
              applyOcclusionFilter();
            }, durationMs);
          }
        }
      }

      if (changed) {
        applyOcclusionFilter();
      }
    };

    const updateNearFieldPulsePaint = () => {
      if (!map.getLayer(NEAR_FIELD_LAYER_ID)) return;
      const pulseColor = mixHexColors(
        visualRef.current.buildingColor,
        visualRef.current.selectedColor,
        NEIGHBORHOOD_PULSE_COLOR_MIX,
      );
      map.setPaintProperty(NEAR_FIELD_LAYER_ID, 'fill-extrusion-color', [
        'case',
        ['boolean', ['feature-state', 'neighborhoodPulse'], false],
        pulseColor,
        visualRef.current.buildingColor,
      ] as any);
    };

    const runNeighborhoodPulse = () => {
      if (disposed || !nearFieldAtlas || !map.getLayer(NEAR_FIELD_LAYER_ID)) return;
      updateNearFieldPulsePaint();
      nearFieldAtlas.nearFeatures.forEach((feature: any) => {
        const atlasId = String(feature.properties?.atlasId ?? feature.id ?? '');
        if (!atlasId) return;
        const distanceMeters = Number(feature.properties?.distanceMeters ?? 0);
        const waveDelay = Math.round((Math.max(0, distanceMeters) / NEIGHBORHOOD_PULSE_WAVE_SPEED_MPS) * 1000);
        scheduleNeighborhoodPulseTimeout(() => {
          if (disposed) return;
          map.setFeatureState({ source: AUTHORED_PARTS_SOURCE_ID, id: atlasId }, { neighborhoodPulse: true });
        }, waveDelay);
        scheduleNeighborhoodPulseTimeout(() => {
          if (disposed) return;
          map.setFeatureState({ source: AUTHORED_PARTS_SOURCE_ID, id: atlasId }, { neighborhoodPulse: false });
        }, waveDelay + NEIGHBORHOOD_PULSE_ATTACK_MS + NEIGHBORHOOD_PULSE_HOLD_MS + NEIGHBORHOOD_PULSE_RELEASE_MS);
      });
      map.triggerRepaint();
    };

    const triggerArrivalPulse = () => {
      if (disposed) return;
      scheduleNeighborhoodPulseTimeout(runNeighborhoodPulse, 850);
      if (!neighborhoodPulseInterval) {
        neighborhoodPulseInterval = window.setInterval(runNeighborhoodPulse, NEIGHBORHOOD_PULSE_INTERVAL_MS);
      }
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
      setProviderContextState(nearFieldAtlas.visibleContextIds, nearFieldAtlas.culledContextIds);
      refreshNearFieldOcclusion();
    };

    const updateSelectionSource = () => {
      const source = map.getSource(SELECTED_SOURCE_ID) as GeoJSONSource | undefined;
      source?.setData(renderSelectionCollection(selectedFeaturesRef.current, 0.16) as any);
      const glowSource = map.getSource(SELECTED_GLOW_SOURCE_ID) as GeoJSONSource | undefined;
      glowSource?.setData(renderSelectionGlowCollection(selectedFeaturesRef.current, 0.34) as any);
      refreshNearFieldOcclusion();
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
        map.setPaintProperty(SUPPLEMENTAL_CONTEXT_LAYER_ID, 'fill-extrusion-color', next.buildingColor);
        map.setPaintProperty(SUPPLEMENTAL_CONTEXT_LAYER_ID, 'fill-extrusion-opacity', next.buildingOpacity);
      }
      if (map.getLayer(AUTHORED_CONTEXT_LAYER_ID)) {
        map.setPaintProperty(AUTHORED_CONTEXT_LAYER_ID, 'fill-extrusion-color', next.buildingColor);
        map.setPaintProperty(AUTHORED_CONTEXT_LAYER_ID, 'fill-extrusion-opacity', next.buildingOpacity);
      }
      if (map.getLayer(NEAR_FIELD_LAYER_ID)) {
        const pulseColor = mixHexColors(next.buildingColor, next.selectedColor, NEIGHBORHOOD_PULSE_COLOR_MIX);
        map.setPaintProperty(NEAR_FIELD_LAYER_ID, 'fill-extrusion-color', [
          'case',
          ['boolean', ['feature-state', 'neighborhoodPulse'], false],
          pulseColor,
          next.buildingColor,
        ] as any);
        map.setPaintProperty(NEAR_FIELD_LAYER_ID, 'fill-extrusion-opacity', next.buildingOpacity);
      }
      NEAR_FIELD_FADE_OUT_LAYER_IDS.forEach((id) => {
        if (map.getLayer(id)) {
          map.setPaintProperty(id, 'fill-extrusion-color', next.buildingColor);
        }
      });
      NEAR_FIELD_FADE_IN_LAYER_IDS.forEach((id) => {
        if (map.getLayer(id)) {
          map.setPaintProperty(id, 'fill-extrusion-color', next.buildingColor);
        }
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

    const playArrivalAnimation = (authoredCamera: CameraState) => {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const restoreArrivalLayerTransitions = () => {
        if (map.getLayer(AUTHORED_SELECTED_LAYER_ID)) {
          map.setPaintProperty(AUTHORED_SELECTED_LAYER_ID, 'fill-extrusion-opacity-transition', { duration: 0, delay: 0 } as any);
        }
        if (map.getLayer(SELECTED_LAYER_ID)) {
          map.setPaintProperty(SELECTED_LAYER_ID, 'fill-extrusion-opacity-transition', { duration: 0, delay: 0 } as any);
        }
        if (map.getLayer(STREET_LABEL_LAYER_ID)) {
          map.setPaintProperty(STREET_LABEL_LAYER_ID, 'text-opacity-transition', { duration: 0, delay: 0 } as any);
        }
      };
      const applyFinalArrivalEmphasis = () => {
        if (map.getLayer(AUTHORED_SELECTED_LAYER_ID)) {
          map.setPaintProperty(AUTHORED_SELECTED_LAYER_ID, 'fill-extrusion-opacity', visualRef.current.selectedOpacity);
        }
        if (map.getLayer(SELECTED_LAYER_ID)) {
          map.setPaintProperty(SELECTED_LAYER_ID, 'fill-extrusion-opacity', visualRef.current.selectedOpacity);
        }
        if (map.getLayer(STREET_LABEL_LAYER_ID)) {
          map.setPaintProperty(STREET_LABEL_LAYER_ID, 'text-opacity', visualRef.current.streetLabelOpacity);
        }
        setArrivalBloomScale(1);
      };

      if (reducedMotion) {
        map.jumpTo(authoredCamera);
        applyFinalArrivalEmphasis();
        restoreArrivalLayerTransitions();
        refreshVenueScreenPoint();
        setSceneReady(true);
        setLoadDurationMs(performance.now() - loadStartedAtRef.current);
        triggerArrivalPulse();
        return;
      }

      const startCamera: CameraState = {
        ...authoredCamera,
        zoom: clamp(authoredCamera.zoom - ARRIVAL_ZOOM_OFFSET, 15.5, 19),
        pitch: clamp(authoredCamera.pitch - ARRIVAL_PITCH_OFFSET, 52, 85),
      };
      map.jumpTo(startCamera);
      refreshVenueScreenPoint();
      if (map.getLayer(AUTHORED_SELECTED_LAYER_ID)) {
        map.setPaintProperty(AUTHORED_SELECTED_LAYER_ID, 'fill-extrusion-opacity-transition', { duration: 0, delay: 0 } as any);
        map.setPaintProperty(AUTHORED_SELECTED_LAYER_ID, 'fill-extrusion-opacity', visualRef.current.selectedOpacity * ARRIVAL_SELECTED_OPACITY_SCALE);
      }
      if (map.getLayer(SELECTED_LAYER_ID)) {
        map.setPaintProperty(SELECTED_LAYER_ID, 'fill-extrusion-opacity-transition', { duration: 0, delay: 0 } as any);
        map.setPaintProperty(SELECTED_LAYER_ID, 'fill-extrusion-opacity', visualRef.current.selectedOpacity * ARRIVAL_SELECTED_OPACITY_SCALE);
      }
      if (map.getLayer(STREET_LABEL_LAYER_ID)) {
        map.setPaintProperty(STREET_LABEL_LAYER_ID, 'text-opacity-transition', { duration: 0, delay: 0 } as any);
        map.setPaintProperty(STREET_LABEL_LAYER_ID, 'text-opacity', 0);
      }
      setArrivalBloomScale(ARRIVAL_BLOOM_SCALE);
      setSceneReady(true);
      setLoadDurationMs(performance.now() - loadStartedAtRef.current);

      arrivalStartTimeout = window.setTimeout(() => {
        if (disposed) return;
        if (map.getLayer(AUTHORED_SELECTED_LAYER_ID)) {
          map.setPaintProperty(AUTHORED_SELECTED_LAYER_ID, 'fill-extrusion-opacity-transition', { duration: ARRIVAL_DURATION_MS, delay: 0 } as any);
        }
        if (map.getLayer(SELECTED_LAYER_ID)) {
          map.setPaintProperty(SELECTED_LAYER_ID, 'fill-extrusion-opacity-transition', { duration: ARRIVAL_DURATION_MS, delay: 0 } as any);
        }
        if (map.getLayer(STREET_LABEL_LAYER_ID)) {
          map.setPaintProperty(STREET_LABEL_LAYER_ID, 'text-opacity-transition', { duration: ARRIVAL_DURATION_MS, delay: 0 } as any);
        }
        applyFinalArrivalEmphasis();
        map.easeTo({
          ...authoredCamera,
          duration: ARRIVAL_DURATION_MS,
          easing: (t) => 1 - Math.pow(1 - t, 4),
        });
        const onArrivalMove = () => refreshVenueScreenPoint();
        map.on('move', onArrivalMove);
        arrivalFinishTimeout = window.setTimeout(() => {
          map.off('move', onArrivalMove);
          if (disposed) return;
          map.jumpTo(authoredCamera);
          refreshVenueScreenPoint();
          restoreArrivalLayerTransitions();
          triggerArrivalPulse();
        }, ARRIVAL_DURATION_MS + 40);
      }, ARRIVAL_HOLD_MS);
    };

    const finishRevealIfReady = async () => {
      if (disposed || revealRef.current || prewarmStartedRef.current || !map.isStyleLoaded() || !map.getSource(BUILDING_SOURCE_ID)) return;
      if (!map.isSourceLoaded(BUILDING_SOURCE_ID)) return;

      prewarmStartedRef.current = true;
      setSourceReady(true);
      const authoredCamera = clone(cameraRef.current);

      setLoadProgress(80);
      setLoadStage('Caching visible neighborhood');
      cacheVisibleProviderFeatures();
      installLandmarks();

      if (disposed) return;
      setLoadProgress(89);
      setLoadStage('Building persistent venue neighborhood');
      installNearFieldAtlas();
      await waitForMapIdle(map, 600);

      if (disposed) return;
      setLoadProgress(92);
      setLoadStage('Restoring authored arrival camera');
      map.jumpTo(authoredCamera);
      await waitForMapIdle(map, 600);
      if (disposed) return;

      // Reapply the authored atmosphere after tile/style prewarming so the
      // first visible frame always matches the saved Street View profile.
      applyVisuals(visualRef.current);
      updateSelectionSource();
      refreshLocalStreetLabels();
      refreshVenueScreenPoint();

      const countRenderedBuildings = () => {
        const contextCount = map.getLayer(CONTEXT_LAYER_ID)
          ? map.queryRenderedFeatures({ layers: [CONTEXT_LAYER_ID] }).filter((feature) => Boolean(feature.state?.contextVisible)).length
          : 0;
        const supplementalContextCount = map.getLayer(SUPPLEMENTAL_CONTEXT_LAYER_ID)
          ? map.queryRenderedFeatures({ layers: [SUPPLEMENTAL_CONTEXT_LAYER_ID] }).length
          : 0;
        const authoredContextCount = map.getLayer(AUTHORED_CONTEXT_LAYER_ID)
          ? map.queryRenderedFeatures({ layers: [AUTHORED_CONTEXT_LAYER_ID] }).length
          : 0;
        const nearFieldCount = map.getLayer(NEAR_FIELD_LAYER_ID)
          ? map.queryRenderedFeatures({ layers: [NEAR_FIELD_LAYER_ID] }).length
          : 0;
        const authoredSelectedCount = map.getLayer(AUTHORED_SELECTED_LAYER_ID)
          ? map.queryRenderedFeatures({ layers: [AUTHORED_SELECTED_LAYER_ID] }).length
          : 0;
        const selectedCount = map.getLayer(SELECTED_LAYER_ID)
          ? map.queryRenderedFeatures({ layers: [SELECTED_LAYER_ID] }).length
          : 0;
        const totalContext = contextCount + supplementalContextCount + authoredContextCount + nearFieldCount;
        const totalSelected = authoredSelectedCount + selectedCount;
        return { contextCount: totalContext, selectedCount: totalSelected, total: totalContext + totalSelected };
      };

      let renderHealth = countRenderedBuildings();
      if (!renderHealth.total && authoredCamera.pitch > 64) {
        setLoadProgress(94);
        setLoadStage('Validating foreground geometry');
        map.jumpTo({ ...authoredCamera, pitch: 60 });
        await waitForMapIdle(map, 500);
        renderHealth = countRenderedBuildings();
        map.jumpTo(authoredCamera);
        await waitForMapIdle(map, 400);
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
      setLoadProgress(98);
      setLoadStage('Composing street view');
      setRenderProbe('ready');
      setLoadProgress(100);
      setLoadStage('Arriving');
      playArrivalAnimation(authoredCamera);
      window.setTimeout(() => {
        if (!disposed) setLoadStage('Ready');
      }, ARRIVAL_HOLD_MS + ARRIVAL_DURATION_MS);
    };

    const onLoad = () => {
      measureAndResize();
      setLoadProgress(32);
      setLoadStage('Loading 3D buildings');
      map.addSource(TERRAIN_SOURCE_ID, {
        type: 'raster-dem',
        url: TERRAIN_SOURCE_URL,
      } as any);
      map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION });
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
          'fill-extrusion-color': visualRef.current.buildingColor,
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
              ['boolean', ['feature-state', 'contextCulled'], false],
            ],
            MASKED_PROVIDER_HEIGHT_METERS,
            ['case',
              ['boolean', ['feature-state', 'contextVisible'], false],
              ['*', 1, ['coalesce', ['get', 'render_height'], ['get', 'height'], 8]],
              MASKED_PROVIDER_HEIGHT_METERS,
            ],
          ],
          'fill-extrusion-base': [
            'case',
            ['any',
              ['boolean', ['feature-state', 'nearFieldMasked'], false],
              ['boolean', ['feature-state', 'landmarkMasked'], false],
              ['boolean', ['feature-state', 'contextCulled'], false],
            ],
            MASKED_PROVIDER_HEIGHT_METERS,
            ['case',
              ['boolean', ['feature-state', 'contextVisible'], false],
              ['*', 1, ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0]],
              MASKED_PROVIDER_HEIGHT_METERS,
            ],
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
        id: NEAR_FIELD_LAYER_ID,
        type: 'fill-extrusion',
        source: AUTHORED_PARTS_SOURCE_ID,
        filter: ['==', ['get', 'role'], 'near'],
        paint: {
          'fill-extrusion-color': visualRef.current.buildingColor,
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'minHeight'],
          'fill-extrusion-opacity': visualRef.current.buildingOpacity,
          'fill-extrusion-vertical-gradient': true,
        },
      } as any);
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
      NEAR_FIELD_FADE_OUT_LAYER_IDS.forEach((id) => {
        map.addLayer({
          id,
          type: 'fill-extrusion',
          source: AUTHORED_PARTS_SOURCE_ID,
          filter: ['==', ['get', 'atlasId'], '__none__'],
          paint: {
            'fill-extrusion-color': visualRef.current.buildingColor,
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'minHeight'],
            'fill-extrusion-opacity': 0.0,
            'fill-extrusion-vertical-gradient': true,
          },
        } as any);
      });
      NEAR_FIELD_FADE_IN_LAYER_IDS.forEach((id) => {
        map.addLayer({
          id,
          type: 'fill-extrusion',
          source: AUTHORED_PARTS_SOURCE_ID,
          filter: ['==', ['get', 'atlasId'], '__none__'],
          paint: {
            'fill-extrusion-color': visualRef.current.buildingColor,
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'minHeight'],
            'fill-extrusion-opacity': visualRef.current.buildingOpacity,
            'fill-extrusion-vertical-gradient': true,
          },
        } as any);
      });
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
      setLoadStage(`Resolving ${LISTING_NAME} footprint`);
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
      if (presentationOnly && !attributionCollapsed) {
        const attribution = mapContainerRef.current?.querySelector('.maplibregl-ctrl-attrib');
        if (attribution) {
          attribution.classList.remove('maplibregl-compact-show');
          attribution.removeAttribute('open');
          attributionCollapsed = true;
        }
      }
    };
    const onRender = () => {
      if (presentationOnly) return;
      const now = performance.now();
      const times = renderTimesRef.current;
      times.push(now);
      while (times.length && now - times[0] > 1000) times.shift();
      if (times.length > 1 && now - lastFpsPublishAtRef.current >= 500) {
        lastFpsPublishAtRef.current = now;
        setFps(Math.min(120, (times.length - 1) * 1000 / Math.max(1, times[times.length - 1] - times[0])));
      }
    };

    const canvas = map.getCanvasContainer();
    const activeVenueFeatures = selectedFeaturesRef.current.filter((f) => f.properties.source === 'asset').length
      ? selectedFeaturesRef.current.filter((f) => f.properties.source === 'asset')
      : selectedFeaturesRef.current;
    const zoomBounds = calculateZoomBounds(activeVenueFeatures);

    const cameraMotion = {
      raf: 0,
      lastTime: 0,
      targetBearing: camera.bearing,
      targetPitch: camera.pitch,
      targetZoom: clamp(camera.zoom, zoomBounds.minZoom, zoomBounds.maxZoom),
    };

    resetMotionRef.current = (bearing: number, pitch: number, zoom: number) => {
      if (cameraMotion.raf) {
        window.cancelAnimationFrame(cameraMotion.raf);
        cameraMotion.raf = 0;
      }
      cameraMotion.targetBearing = normalizeBearing(bearing);
      cameraMotion.targetPitch = clamp(pitch, 52, 85);
      cameraMotion.targetZoom = clamp(zoom, zoomBounds.minZoom, zoomBounds.maxZoom);
      cameraMotion.lastTime = 0;
    };

    // Apply strict non-scrollable touch actions to prevent iOS Safari gesture leakage
    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'none';
    canvas.style.overscrollBehavior = 'none';
    const canvasElement = map.getCanvas();
    if (canvasElement) {
      canvasElement.style.touchAction = 'none';
      canvasElement.style.overscrollBehavior = 'none';
    }

    const runCameraMotion = (time: number) => {
      cameraMotion.raf = 0;
      const dt = cameraMotion.lastTime ? Math.min(40, time - cameraMotion.lastTime) : 16;
      cameraMotion.lastTime = time;
      const currentBearing = map.getBearing();
      const currentPitch = map.getPitch();
      const currentZoom = map.getZoom();
      const bearingDelta = normalizeBearing(cameraMotion.targetBearing - currentBearing);
      const pitchDelta = cameraMotion.targetPitch - currentPitch;
      const zoomDelta = cameraMotion.targetZoom - currentZoom;
      const blend = 1 - Math.exp(-dt / 58);
      const nextBearing = normalizeBearing(currentBearing + bearingDelta * blend);
      const nextPitch = clamp(currentPitch + pitchDelta * blend, 52, 85);
      const nextZoom = clamp(currentZoom + zoomDelta * blend, zoomBounds.minZoom, zoomBounds.maxZoom);
      map.jumpTo({
        center: cameraRef.current.center,
        zoom: nextZoom,
        bearing: nextBearing,
        pitch: nextPitch,
      });
      cameraRef.current = { ...cameraRef.current, bearing: nextBearing, pitch: nextPitch, zoom: nextZoom };
      if (Math.abs(bearingDelta) > 0.035 || Math.abs(pitchDelta) > 0.035 || Math.abs(zoomDelta) > 0.005) {
        cameraMotion.raf = window.requestAnimationFrame(runCameraMotion);
      } else {
        const settled = {
          ...cameraRef.current,
          bearing: cameraMotion.targetBearing,
          pitch: cameraMotion.targetPitch,
          zoom: cameraMotion.targetZoom,
        };
        map.jumpTo(settled);
        cameraRef.current = settled;
        setCameraState(settled);
        updateSelectionSource();
        refreshLocalStreetLabels();
        refreshVenueScreenPoint();
        if (!presentationOnly) {
          setOccludingPolygonCount(hiddenAtlasIdsRef.current.size);
        }
        cameraMotion.lastTime = 0;
      }
    };

    const moveTowardCamera = (bearing: number, pitch: number, zoom = cameraMotion.targetZoom) => {
      cameraMotion.targetBearing = normalizeBearing(bearing);
      cameraMotion.targetPitch = clamp(pitch, 52, 85);
      cameraMotion.targetZoom = clamp(zoom, zoomBounds.minZoom, zoomBounds.maxZoom);
      if (!cameraMotion.raf) cameraMotion.raf = window.requestAnimationFrame(runCameraMotion);
    };

    const activePointers = new Map<number, { x: number; y: number }>();
    const pinchState = {
      active: false,
      initialDistance: 0,
      lastDistance: 0,
    };
    const drag = {
      active: false,
      primaryPointerId: -1,
      lastX: 0,
      lastY: 0,
      moved: false,
    };

    const endDrag = (event?: PointerEvent) => {
      if (event) {
        activePointers.delete(event.pointerId);
        if (canvas.hasPointerCapture?.(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
      } else {
        activePointers.clear();
      }

      if (activePointers.size === 1) {
        const [remainingId, pos] = activePointers.entries().next().value as [number, { x: number; y: number }];
        drag.active = true;
        drag.primaryPointerId = remainingId;
        drag.lastX = pos.x;
        drag.lastY = pos.y;
        pinchState.active = false;
        canvas.style.cursor = 'grabbing';
      } else if (activePointers.size === 0) {
        drag.active = false;
        pinchState.active = false;
        canvas.style.cursor = 'grab';
        if (drag.moved) {
          suppressClickRef.current = true;
          if (!presentationOnly) {
            setDirty(true);
            setStatus('Camera angle or distance changed. Save State to keep this arrival view.');
          }
        }
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!sceneReady && !revealRef.current) return;
      if (event.pointerType !== 'touch' && event.button !== 0) return;

      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture?.(event.pointerId);

      if (activePointers.size === 1) {
        drag.active = true;
        drag.primaryPointerId = event.pointerId;
        drag.lastX = event.clientX;
        drag.lastY = event.clientY;
        drag.moved = false;
        pinchState.active = false;
        canvas.style.cursor = 'grabbing';
      } else if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        pinchState.active = true;
        pinchState.initialDistance = dist;
        pinchState.lastDistance = dist;
        drag.moved = true;
      }
      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!activePointers.has(event.pointerId)) return;
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (activePointers.size >= 2) {
        const pts = Array.from(activePointers.values());
        const currentDistance = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (pinchState.lastDistance > 0 && Math.abs(currentDistance - pinchState.initialDistance) > 1.5) {
          pinchState.active = true;
          const zoomDelta = Math.log2(currentDistance / pinchState.lastDistance) * 1.5;
          const nextZoom = clamp(cameraMotion.targetZoom + zoomDelta, zoomBounds.minZoom, zoomBounds.maxZoom);
          pinchState.lastDistance = currentDistance;
          moveTowardCamera(cameraMotion.targetBearing, cameraMotion.targetPitch, nextZoom);
        }
      } else if (activePointers.size === 1 && !pinchState.active && drag.active) {
        const dx = event.clientX - drag.lastX;
        const dy = event.clientY - drag.lastY;
        if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
        if (drag.moved) {
          drag.lastX = event.clientX;
          drag.lastY = event.clientY;
          moveTowardCamera(
            cameraMotion.targetBearing - dx * 0.19,
            cameraMotion.targetPitch + dy * 0.125,
            cameraMotion.targetZoom,
          );
        }
      }
      event.preventDefault();
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const deltaMultiplier = event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? 400 : 1;
      const deltaY = event.deltaY * deltaMultiplier;
      const zoomDelta = -deltaY * 0.0016;
      const nextZoom = clamp(cameraMotion.targetZoom + zoomDelta, zoomBounds.minZoom, zoomBounds.maxZoom);
      moveTowardCamera(cameraMotion.targetBearing, cameraMotion.targetPitch, nextZoom);
      if (!presentationOnly) {
        setDirty(true);
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.cancelable) {
        event.preventDefault();
      }
    };

    const onGesture = (event: Event) => {
      event.preventDefault();
    };

    const onMapClick = (event: maplibregl.MapMouseEvent) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      const hitLayers = [CONTEXT_LAYER_ID, AUTHORED_CONTEXT_LAYER_ID, NEAR_FIELD_LAYER_ID]
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
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('gesturestart', onGesture, { passive: false });
    canvas.addEventListener('gesturechange', onGesture, { passive: false });
    let lastOcclusionTime = 0;
    let occlusionTimerId: any = 0;
    const onMapMove = () => {
      if (!revealRef.current) return;
      const now = performance.now();
      const elapsed = now - lastOcclusionTime;
      if (elapsed >= 80) {
        if (occlusionTimerId) {
          window.clearTimeout(occlusionTimerId);
          occlusionTimerId = 0;
        }
        lastOcclusionTime = now;
        refreshNearFieldOcclusion();
      } else if (!occlusionTimerId) {
        occlusionTimerId = window.setTimeout(() => {
          occlusionTimerId = 0;
          lastOcclusionTime = performance.now();
          refreshNearFieldOcclusion();
        }, 80 - elapsed);
      }
    };
    map.on('load', onLoad);
    map.on('move', onMapMove);
    map.on('sourcedata', onSourceData);
    map.on('idle', onIdle);
    map.on('render', onRender);
    if (!presentationOnly) map.on('click', onMapClick);

    return () => {
      disposed = true;
      resetMotionRef.current = () => {};
      refreshOcclusionRef.current = () => {};
      setTerrainProviderPlateVisibilityRef.current = () => {};
      if (cameraMotion.raf) window.cancelAnimationFrame(cameraMotion.raf);
      if (occlusionTimerId) window.clearTimeout(occlusionTimerId);
      if (arrivalStartTimeout) window.clearTimeout(arrivalStartTimeout);
      fadeOutSlotsRef.current.forEach((slot) => {
        if (slot.timeoutId) window.clearTimeout(slot.timeoutId);
        slot.timeoutId = null;
        slot.activeIds.clear();
      });
      fadeInSlotsRef.current.forEach((slot) => {
        if (slot.timeoutId) window.clearTimeout(slot.timeoutId);
        slot.timeoutId = null;
        slot.activeIds.clear();
      });
      settledHiddenIdsRef.current.clear();
      neighborhoodPulseTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
      neighborhoodPulseTimeouts.clear();
      if (neighborhoodPulseInterval) window.clearInterval(neighborhoodPulseInterval);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('gesturestart', onGesture);
      canvas.removeEventListener('gesturechange', onGesture);
      resizeObserver?.disconnect();
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      map.off('load', onLoad);
      map.off('move', onMapMove);
      map.off('sourcedata', onSourceData);
      map.off('idle', onIdle);
      map.off('render', onRender);
      if (!presentationOnly) map.off('click', onMapClick);
      map.remove();
      landmarkLayersRef.current = [];
      mapRef.current = null;
      if (typeof window !== 'undefined') {
        delete (window as any).__map;
        delete (window as any).__hiddenAtlasIds;
      }
    };
  }, [presentationOnly, profileLoaded]);

  useEffect(() => {
    isMobilePresentationRef.current = isMobilePresentation;
    if (mapRef.current) {
      const nextPadding = getUsableViewportPadding(
        mapContainerRef.current,
        contextPanelRef.current,
        headerOverlayRef.current,
        isMobilePresentation,
      );
      mapRef.current.setPadding(nextPadding);
      const center = geometryCenter(selectedFeaturesRef.current) ?? DEFAULT_CENTER;
      mapRef.current.jumpTo({ center });
    }
  }, [isMobilePresentation]);

  useEffect(() => {
    selectedFeaturesRef.current = selectedFeatures;
    const activeVenueFeatures = selectedFeatures.filter((f) => f.properties.source === 'asset').length
      ? selectedFeatures.filter((f) => f.properties.source === 'asset')
      : selectedFeatures;
    const bounds = calculateZoomBounds(activeVenueFeatures);
    if (cameraRef.current.zoom < bounds.minZoom || cameraRef.current.zoom > bounds.maxZoom) {
      const clampedZoom = clamp(cameraRef.current.zoom, bounds.minZoom, bounds.maxZoom);
      cameraRef.current = { ...cameraRef.current, zoom: clampedZoom };
      setCameraState(cameraRef.current);
      resetMotionRef.current(cameraRef.current.bearing, cameraRef.current.pitch, clampedZoom);
      mapRef.current?.jumpTo({ zoom: clampedZoom });
    }
    const map = mapRef.current;
    if (map?.getSource(AUTHORED_PARTS_SOURCE_ID)) {
      refreshOcclusionRef.current();
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
    resetMotionRef.current(next.bearing, next.pitch, next.zoom);
    const map = mapRef.current;
    map?.jumpTo(next);
    if (map?.getSource(STREET_LABEL_SOURCE_ID)) refreshLocalStreetLabelsForMap(map, DEFAULT_CENTER);
    if (map?.getSource(AUTHORED_PARTS_SOURCE_ID)) {
      refreshOcclusionRef.current();
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
      if (map.getLayer(NEAR_FIELD_LAYER_ID)) {
        map.setPaintProperty(NEAR_FIELD_LAYER_ID, 'fill-extrusion-color', next.buildingColor);
        map.setPaintProperty(NEAR_FIELD_LAYER_ID, 'fill-extrusion-opacity', next.buildingOpacity);
      }
      NEAR_FIELD_FADE_OUT_LAYER_IDS.forEach((id) => {
        if (map.getLayer(id)) {
          map.setPaintProperty(id, 'fill-extrusion-color', next.buildingColor);
        }
      });
      NEAR_FIELD_FADE_IN_LAYER_IDS.forEach((id) => {
        if (map.getLayer(id)) {
          map.setPaintProperty(id, 'fill-extrusion-color', next.buildingColor);
        }
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
        refreshOcclusionRef.current();
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
      refreshOcclusionRef.current();
      map.triggerRepaint();
    });
    setStatus(next
      ? 'Terrain experiment enabled. Buildings now follow DEM elevation; compare Telegraph Hill and Coit Tower.'
      : 'Terrain experiment disabled. Restored the flat Street View baseline.');
  };

  const applyConceptPreset = () => {
    applyVisual({ ...DEFAULT_VISUAL });
    setStatus('Applied the Twist SF Street View baseline palette with crimson horizon, dark context buildings, venue bloom, and occlusion assist.');
  };

  const resetSelection = () => {
    const features = clone(DEFAULT_SELECTION);
    selectedFeaturesRef.current = features;
    setSelectedFeatures(features);
    setDirty(true);
    setStatus(`Restored ${features.length} authored ${LISTING_NAME} footprint${features.length === 1 ? '' : 's'}.`);
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
    if (mapRef.current) {
      const nextPadding = getUsableViewportPadding(
        mapContainerRef.current,
        contextPanelRef.current,
        headerOverlayRef.current,
        isMobilePresentationRef.current,
      );
      mapRef.current.setPadding(nextPadding);
    }
    const center = geometryCenter(selectedFeaturesRef.current) ?? DEFAULT_CENTER;
    const defaultCam: CameraState = {
      ...DEFAULT_CAMERA,
      center,
    };
    resetMotionRef.current(defaultCam.bearing, defaultCam.pitch, defaultCam.zoom);
    applyCamera(defaultCam);
    setStatus(`Camera reset to the ${LISTING_NAME} prototype arrival.`);
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
      const response = await adminFetch('/api/admin/street-view/profile/save', {
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
      setStatus(`Saved ${selectedFeatures.length} highlighted footprint${selectedFeatures.length === 1 ? '' : 's'}, arrival camera, and sky ${savedSkyColor} for ${LISTING_NAME}.`);
    } catch (error) {
      console.error('Street View profile save failed', error);
      setStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const selectedProviderIds = providerIds(selectedFeatures);

  const selectVenue = (listingId: string) => {
    if (!listingId || listingId === LISTING_ID) return;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('listingId', listingId);
    window.location.assign(nextUrl.toString());
  };

  return (
    <div className={presentationOnly ? 'fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-[#050608] text-zinc-100' : 'h-full min-h-0 overflow-auto bg-[#050608] text-zinc-100 xl:overflow-hidden'}>
      <div className={presentationOnly ? 'h-full min-h-0 w-full' : 'mx-auto flex h-full min-h-0 w-full max-w-[1900px] flex-col gap-3 p-3 lg:p-4'}>
        {!presentationOnly ? <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.09] bg-[rgba(12,14,18,0.86)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-red-300"><Building2 size={14} /><span className="text-[9px] font-bold uppercase tracking-[0.2em]">Fixed-location 3D venue prototype</span></div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-lg font-semibold tracking-tight text-white">Street View Tool</h1>
              <p className="max-w-3xl text-[10px] text-zinc-500">{LISTING_NAME} · load the neighborhood first, then orbit from a constrained venue anchor.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-8 min-w-[280px] items-center gap-2 rounded-lg border border-white/10 bg-black/35 px-2.5 text-[9px] text-zinc-400">
              <span className="shrink-0 font-bold uppercase tracking-[0.12em] text-zinc-500">Venue</span>
              <select
                value={LISTING_ID}
                onChange={(event) => selectVenue(event.target.value)}
                className="min-w-0 flex-1 cursor-pointer bg-transparent text-[10px] text-zinc-100 outline-none"
                aria-label="Select confirmed public venue"
              >
                {PUBLIC_STREET_VIEW_VENUES.map((venue) => {
                  const locality = [venue?.geopoint?.address?.city, venue?.geopoint?.address?.country].filter(Boolean).join(', ');
                  return <option key={venue.id} value={venue.id} className="bg-zinc-950 text-zinc-100">{venue.name}{locality ? ` — ${locality}` : ''}</option>;
                })}
              </select>
              <span className="shrink-0 font-mono text-[8px] text-zinc-600">{PUBLIC_STREET_VIEW_VENUES.length}</span>
            </label>
            <button type="button" onClick={() => window.location.reload()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-black/35 px-2.5 text-[10px] text-zinc-300 hover:border-white/20 hover:text-white"><RefreshCw size={12} />Reload scene</button>
            <button type="button" onClick={resetCamera} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-black/35 px-2.5 text-[10px] text-zinc-300 hover:border-white/20 hover:text-white"><RotateCcw size={12} />Reset view</button>
            <button type="button" onClick={() => void saveState()} disabled={saving || !selectedFeatures.length} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-400/35 bg-red-500/12 px-2.5 text-[10px] font-semibold text-red-100 hover:border-red-300/55 disabled:cursor-not-allowed disabled:opacity-45"><Save size={12} />{saving ? 'Saving…' : dirty ? 'Save state*' : 'Save state'}</button>
          </div>
        </header> : null}

        <main className={presentationOnly ? 'h-full min-h-0' : 'grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.58fr)_minmax(360px,0.62fr)]'}>
          <section
            className={presentationOnly ? 'relative h-full min-h-[560px] overflow-hidden bg-[#020305]' : 'relative min-h-[560px] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#020305] shadow-[0_30px_90px_rgba(0,0,0,0.42)] xl:min-h-0'}
            style={{ touchAction: 'none', overscrollBehavior: 'none' }}
          >
            <div className="absolute inset-0 z-0">
              <div
                ref={mapContainerRef}
                className="h-full w-full select-none"
                style={{ touchAction: 'none', overscrollBehavior: 'none', WebkitUserSelect: 'none' }}
                aria-label={`${LISTING_NAME} Street View prototype`}
              />
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
                  opacity: visualState.venueBloomStrength * arrivalBloomScale,
                  transition: `opacity ${ARRIVAL_DURATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
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

            {presentationOnly ? (
              <>
                <button
                  type="button"
                  onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign(presentationKind === 'mobile' ? '/mobile' : presentationKind === 'tablet' ? '/tablet' : '/globe')}
                  className={`pointer-events-auto absolute z-30 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[rgba(10,11,15,0.78)] px-3 text-[11px] font-semibold text-zinc-200 shadow-[0_12px_35px_rgba(0,0,0,0.3)] backdrop-blur-xl hover:border-white/20 hover:text-white ${isMobilePresentation ? 'left-4 top-[max(16px,env(safe-area-inset-top))] h-11' : 'left-5 top-5 h-10'}`}
                >
                  <ChevronRight size={14} className="rotate-180" />Back
                </button>
                <div ref={headerOverlayRef} className={`pointer-events-none absolute z-30 flex items-center ${isMobilePresentation ? 'left-4 top-[72px] max-w-[calc(100%-32px)] gap-3' : isTabletPresentation ? 'left-5 top-[78px] gap-4' : 'left-5 top-[76px] gap-5'}`}>
                  <div className={`flex shrink-0 items-center justify-center overflow-hidden border border-white/[0.14] bg-black/65 shadow-[0_18px_48px_rgba(0,0,0,0.4)] backdrop-blur-xl ${isMobilePresentation ? 'h-[84px] w-[84px] rounded-[22px]' : isTabletPresentation ? 'h-[108px] w-[108px] rounded-[26px]' : 'h-[124px] w-[124px] rounded-[28px]'}`}>
                    <img src={presentationLogoUrl} alt={`${presentationName} logo`} className="h-full w-full object-contain" />
                  </div>
                  <div className={`min-w-0 drop-shadow-[0_5px_18px_rgba(0,0,0,0.85)] ${isMobilePresentation ? 'max-w-[240px]' : 'max-w-[520px]'}`}>
                    <p className={`${isMobilePresentation ? 'text-[8px]' : 'text-[10px]'} font-bold uppercase tracking-[0.24em] text-red-200`}>Venue</p>
                    <h1 className={`mt-1 font-semibold leading-none tracking-[-0.035em] text-white [overflow-wrap:anywhere] ${isMobilePresentation ? 'text-[28px]' : isTabletPresentation ? 'text-[36px]' : 'text-[42px]'}`}>{presentationName}</h1>
                    <p className={`mt-2 flex items-center gap-1.5 text-zinc-200 ${isMobilePresentation ? 'text-[11px]' : 'text-[13px]'}`}>
                      <span>{presentationRegionLabel || 'Confirmed public venue'}</span>
                      {presentationCountryFlagUrl ? <img src={presentationCountryFlagUrl} alt={`${presentationCountry} flag`} className="h-[0.95em] w-auto rounded-[2px] shadow-[0_1px_4px_rgba(0,0,0,0.35)]" /> : null}
                    </p>
                  </div>
                </div>
              </>
            ) : null}

            <div ref={contextPanelRef} className={`pointer-events-auto absolute z-30 overflow-hidden border border-white/10 bg-[rgba(10,12,16,0.88)] shadow-[0_22px_65px_rgba(0,0,0,0.38)] backdrop-blur-2xl ${presentationOnly ? (isMobilePresentation ? 'bottom-[max(12px,env(safe-area-inset-bottom))] left-3 right-3 rounded-[22px]' : isTabletPresentation ? 'bottom-5 left-5 w-[min(520px,calc(100%-40px))] rounded-[22px]' : 'bottom-5 left-5 w-[min(560px,calc(100%-40px))] rounded-[22px]') : 'left-3 top-3 w-[min(560px,calc(100%-40px))] rounded-[22px]'}`}>
              {presentationOnly ? (
                <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                  <img src={presentationHeroUrl} alt="" className="h-full w-full object-cover opacity-[0.5]" />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,10,13,0.88)_0%,rgba(8,10,13,0.72)_50%,rgba(8,10,13,0.58)_100%),linear-gradient(180deg,rgba(8,10,13,0.18)_0%,rgba(8,10,13,0.88)_100%)]" />
                </div>
              ) : null}
              <div className={`relative ${isMobilePresentation ? 'p-3.5' : 'p-5'}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-red-300">Venue context</span>
                <div className="flex items-center gap-2">
                  {presentationAvailability ? <span className="rounded-lg border border-white/[0.08] bg-black/35 px-2.5 py-1.5 text-[9px] text-zinc-200">Typical · {presentationAvailability}</span> : null}
                  <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-red-100">Public</span>
                </div>
              </div>
              {presentationOnly && !isMobilePresentation && presentationDescription ? <p className="mt-4 text-[11px] leading-5 text-zinc-200">{presentationDescription}</p> : null}
              {presentationOnly && presentationAmenities.length ? (
                amenitiesExpanded ? (
                  <div className={`${isMobilePresentation ? 'mt-2.5' : 'mt-3'} flex flex-wrap items-center gap-1.5`}>
                    {presentationAmenities.map((amenity) => <span key={amenity} className="rounded-full border border-white/[0.09] bg-black/30 px-2.5 py-1 text-[8px] font-medium text-zinc-100">{amenity}</span>)}
                    <button type="button" onClick={() => setAmenitiesExpanded(false)} className="rounded-full border border-white/[0.12] bg-black/45 px-2.5 py-1 text-[8px] font-semibold text-zinc-200 hover:text-white">Show less</button>
                  </div>
                ) : (
                  <div className={`${isMobilePresentation ? 'mt-2.5' : 'mt-3'} flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap`}>
                    {presentationAmenities.slice(0, compactAmenityCount).map((amenity) => <span key={amenity} className="shrink-0 rounded-full border border-white/[0.09] bg-black/30 px-2.5 py-1 text-[8px] font-medium text-zinc-100">{amenity}</span>)}
                    {presentationAmenities.length > compactAmenityCount ? <button type="button" onClick={() => setAmenitiesExpanded(true)} className={`shrink-0 rounded-full border border-white/[0.12] bg-black/45 px-2.5 py-1 text-[8px] font-semibold text-zinc-100 hover:text-white ${isMobilePresentation ? 'min-h-8' : ''}`}>+{presentationAmenities.length - compactAmenityCount}</button> : null}
                  </div>
                )
              ) : null}
              <div className={`${isMobilePresentation ? 'mt-2.5 pt-2' : 'mt-4 pt-3'} flex items-start gap-2 border-t border-white/[0.08]`}>
                <MapPin size={13} className="mt-0.5 shrink-0 text-zinc-500" />
                <div><p className="text-[10px] text-zinc-200">{LISTING_ADDRESS_LINE1}</p><p className="mt-0.5 text-[9px] text-zinc-500">{LISTING_LOCALITY || LISTING_ADDRESS}</p></div>
              </div>
              {!presentationOnly ? (
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  <div className="rounded-lg border border-white/[0.07] bg-black/25 px-2.5 py-2"><span className="block text-[7px] font-bold uppercase tracking-wider text-zinc-600">Footprints</span><span className="mt-1 block font-mono text-[11px] text-zinc-200">{selectedFeatures.length}</span></div>
                  <div className="rounded-lg border border-white/[0.07] bg-black/25 px-2.5 py-2"><span className="block text-[7px] font-bold uppercase tracking-wider text-zinc-600">Sightline</span><span className="mt-1 block text-[10px] text-zinc-200">{occludingPolygonCount ? `${occludingPolygonCount} hidden` : 'Clear'}</span></div>
                  <div className="rounded-lg border border-white/[0.07] bg-black/25 px-2.5 py-2"><span className="block text-[7px] font-bold uppercase tracking-wider text-zinc-600">View</span><span className="mt-1 block text-[10px] text-zinc-200">Fixed orbit</span></div>
                </div>
              ) : null}
              <div className={`${isMobilePresentation ? 'mt-2.5' : 'mt-3'} grid grid-cols-2 gap-2`}>
                <a href={LISTING_MAP_URL} target="_blank" rel="noreferrer" className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-300/35 bg-red-500/90 px-3 text-[9px] font-semibold text-white hover:bg-red-500 ${isMobilePresentation ? 'h-11' : 'h-9'}`}><ExternalLink size={11} />Directions</a>
                {presentationOnly ? (
                  <button type="button" onClick={resetCamera} className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-3 text-[9px] font-semibold text-zinc-300 hover:border-white/20 hover:text-white ${isMobilePresentation ? 'h-11' : 'h-9'}`}><RotateCcw size={11} />Recenter</button>
                ) : (
                  <a href="/globe" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-3 text-[9px] font-semibold text-zinc-300 hover:border-white/20 hover:text-white"><Navigation size={11} />Back to Globe</a>
                )}
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[8px] text-zinc-500"><MousePointer2 size={10} />{isMobilePresentation ? 'Drag to orbit · pinch to zoom · venue remains fixed target' : 'Drag gently to look around · scroll to zoom · the venue remains the visual anchor'}</p>
              </div>
            </div>

            <div className={`pointer-events-auto absolute right-3 top-3 z-30 w-[118px] rounded-2xl border border-white/10 bg-[rgba(10,11,15,0.78)] p-3 shadow-[0_16px_45px_rgba(0,0,0,0.28)] backdrop-blur-xl ${isMobilePresentation ? 'hidden' : 'hidden sm:block'}`}>
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

            {!presentationOnly ? <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-30 grid grid-cols-2 gap-1.5 sm:grid-cols-6">
              <Metric label="Selected" value={`${selectedFeatures.length} footprint${selectedFeatures.length === 1 ? '' : 's'}`} />
              <Metric label="Provider IDs" value={selectedProviderIds.length ? String(selectedProviderIds.length) : 'authored'} />
              <Metric label="Load" value={loadDurationMs != null ? `${Math.round(loadDurationMs)} ms` : '—'} />
              <Metric label="Render" value={fps != null ? `${fps.toFixed(0)} fps` : 'idle'} />
              <Metric label="Buildings" value={sourceReady ? `${renderedBuildingCount} rendered` : 'loading'} />
              <Metric label="Canvas" value={canvasLayout} />
              <Metric label="Canvas probe" value={renderProbe} />
            </div> : null}
          </section>

          {!presentationOnly ? <aside className="min-h-0 space-y-2 xl:overflow-y-auto xl:pr-1">
            <Panel title="Venue Building Selection" icon={<Crosshair size={14} />} open={openPanels.selection} onToggle={() => setOpenPanels((current) => ({ ...current, selection: !current.selection }))} summary={<span className="rounded-md border border-red-400/20 bg-red-500/[0.06] px-2 py-1 text-[9px] font-mono text-red-200">{selectedFeatures.length}</span>}>
              <p className="text-[9px] leading-4 text-zinc-500">Click any visible building to add/remove it. This venue starts from its authored building asset so saved footprints can be treated as one visual anchor.</p>
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
                <p className="mt-1.5 text-[8px] leading-3.5 text-zinc-600">Detected automatically from loaded provider polygons that physically overlap the saved venue footprint. These IDs are masked from the bulk white layer before the authored red geometry is drawn.</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" onClick={resetSelection} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-[8px] font-bold uppercase tracking-wider text-zinc-300 hover:text-white">Authored asset ×{DEFAULT_SELECTION.length}</button>
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
                <button type="button" onClick={applyConceptPreset} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-400/20 bg-red-500/[0.06] px-3 py-2 text-[8px] font-bold uppercase tracking-[0.12em] text-red-200 hover:border-red-300/35 hover:bg-red-500/[0.1]"><Sparkles size={11} />Apply Street View baseline</button>
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
                    <span className="font-mono text-[8px] text-zinc-400">{occludingPolygonCount} hidden</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {(['hide', 'off'] as const).map((mode) => (
                      <button key={mode} type="button" onClick={() => applyVisual({ occlusionMode: mode })} className={`rounded-md border px-2 py-1.5 text-[8px] font-bold uppercase tracking-wider ${visualState.occlusionMode === mode ? 'border-red-400/35 bg-red-500/10 text-red-100' : 'border-white/[0.08] bg-black/25 text-zinc-500 hover:text-zinc-300'}`}>{mode === 'hide' ? 'Active (binary hide)' : 'Off'}</button>
                    ))}
                  </div>
                  <p className="mt-2 text-[8px] leading-3.5 text-zinc-600">Buildings blocking the line of sight to the venue are hidden via GPU feature exclusion to ensure zero unnecessary draw calls.</p>
                </div>
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
          </aside> : null}
        </main>
      </div>
    </div>
  );
};

export const StreetViewPresentationPage: React.FC<{ kind?: StreetViewPresentationKind }> = ({ kind }) => {
  const [resolvedKind, setResolvedKind] = useState<StreetViewPresentationKind>(() => {
    if (kind) return kind;
    if (typeof window !== 'undefined') {
      if (window.innerWidth < 768) return 'mobile';
      if (window.innerWidth < 1024) return 'tablet';
    }
    return 'desktop';
  });

  useEffect(() => {
    if (kind) {
      setResolvedKind(kind);
      return;
    }
    const update = () => {
      const w = window.innerWidth;
      if (w < 768) setResolvedKind('mobile');
      else if (w < 1024) setResolvedKind('tablet');
      else setResolvedKind('desktop');
    };
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [kind]);

  return <StreetViewToolPage presentationOnly presentationKind={resolvedKind} />;
};

export default StreetViewToolPage;
