import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import maplibregl, { type Map as MapLibreMap, type MapGeoJSONFeature, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ArrowLeft, CircleHelp, Copy, RefreshCw, RotateCcw, Search } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as api from '../../lib/api';
import { adminFetch, adminFetchJson } from '../../lib/adminApi';
import type { BuildingAssetHistoryEvent } from '../../lib/buildingAssetHistory';
import { BUILDING_PERSISTENCE_POLICY_VERSION, createBuildingAssetRevision, createBuildingVerificationInputSnapshot } from '../../lib/buildingPersistenceGuard';
import { isDevRouteEnabled } from '../../lib/devRoutes';
import {
  formatListingPhysicalAddress,
  getBuildingAssetForListing as getCompatibilityBuildingAssetForListing,
  getListingPhysicalAddress,
  getListingPhysicalCityLabel,
  getVenueForListing,
  type EntityCollections,
} from '../../lib/entityCompatibility';
import { getListingCanonicalCoords } from '../../lib/explorerMarkers';
import { isApproximateLocation } from '../../lib/publicLocation';
import {
  getBuildingVerificationForListing,
  evaluateBuildingVerification,
  listingHasExactBuildingAddress,
  scoreBuildingAddressCandidate,
  normalizeAddressText,
  type BuildingAddressCandidate,
  type BuildingVerificationOutcome,
} from '../../lib/buildingVerification';
import type {
  BuildingAsset,
  BuildingVerificationMeta,
  Listing,
  OrganizationData,
  OrganizationVenueRelationship,
  VenueData,
} from '../../types';
import { buildBuildingsSource, getBuildingsSourceId, venueArrival } from '../maps/venueArrival';
import { swingMapStyle } from '../maps/mapStyle';
import BuildingVerificationAuditPanel from './BuildingVerificationAuditPanel';
import { buildingAddressBelongsToFootprint, inspectorBuildingAddressResolver, type BuildingAddressResolution, type ResolvedBuildingAddress } from '../../lib/buildingAddressResolver';
import { geometryFingerprint, pointIntersectsBuildingGeometry, pointToBuildingDistanceMeters } from '../../lib/buildingGeometry';
import {
  fetchOsOpenMapLocalBuildingAtPoint,
  fetchSupplementalBuildingFootprints,
  MICROSOFT_BUILDING_ID_PREFIX,
  MICROSOFT_BUILDING_SOURCE,
  OS_OPENMAP_LOCAL_FEATURE_ID_PREFIX,
  OS_OPENMAP_LOCAL_SOURCE,
  OS_OPENMAP_LOCAL_ATTRIBUTION,
} from '../../lib/buildingFootprintSources';
import { fuseBuildingNeighborhood } from '../../lib/buildingNeighborhoodFusion';
import {
  createGeneratedBuildingCandidate,
  GENERATED_BUILDING_ID_PREFIX,
  GENERATED_BUILDING_SOURCE,
  isGeneratedBuildingFeatureId,
  type GeneratedBuildingCandidate,
} from '../../lib/buildingReconstruction';
import type { BuildingCandidateEvidence, BuildingReviewDisposition, BuildingVerificationEvidenceRecord } from '../../lib/buildingVerificationEvidence';

const DEFAULT_FEATURE_ID = '13581200';
const DEFAULT_TWIST_LAT = 37.8055766;
const DEFAULT_TWIST_LNG = -122.4132692;
const SOURCE_LAYER = 'building';
const VIEWBOX_SIZE = 1000;
const VIEWBOX_PADDING = 56;
const EXTRUDE_HEIGHT_METERS = 5;
const BUILDING_INSPECTOR_DIAGNOSTIC_LIMIT = 10000;
const MAX_CONNECTED_PIECE_DIAGNOSTIC_POLYGONS = 250;
const DEFAULT_NEIGHBORHOOD_RADIUS_METERS = 100;
const EXPANDED_NEIGHBORHOOD_RADII_METERS = [150, 250] as const;
const BUILDING_VERIFICATION_MODE: 'shadow' | 'enabled' = 'shadow';
type BuildingSourceMode = 'auto' | 'openfreemap' | 'microsoft';
const BUILDING_SOURCE_MODE_ORDER: BuildingSourceMode[] = ['auto', 'openfreemap', 'microsoft'];
const BUILDING_SOURCE_MODE_LABELS: Record<BuildingSourceMode, string> = {
  auto: 'Auto',
  openfreemap: 'OSM',
  microsoft: 'Microsoft',
};
const EMPTY_ORGANIZATIONS: OrganizationData[] = [];
const EMPTY_RELATIONSHIPS: OrganizationVenueRelationship[] = [];

const LANDMARK_TESTS: LandmarkTestRecord[] = [
  {
    id: 'salesforce-tower',
    name: 'Salesforce Tower',
    city: 'San Francisco',
    latitude: 37.78978,
    longitude: -122.39697,
    expectedHeightMeters: 326,
    expectedFootprint: 'Tall tower podium footprint near Mission St and Fremont St.',
  },
  {
    id: 'transamerica-pyramid',
    name: 'Transamerica Pyramid',
    city: 'San Francisco',
    latitude: 37.79518,
    longitude: -122.40278,
    expectedHeightMeters: 260,
    expectedFootprint: 'Triangular tower footprint in the Financial District.',
  },
  {
    id: 'empire-state-building',
    name: 'Empire State Building',
    city: 'New York',
    latitude: 40.74844,
    longitude: -73.98566,
    expectedHeightMeters: 381,
    expectedFootprint: 'Large stepped tower footprint on Fifth Avenue.',
  },
  {
    id: 'flatiron-building',
    name: 'Flatiron Building',
    city: 'New York',
    latitude: 40.74106,
    longitude: -73.98970,
    expectedHeightMeters: 87,
    expectedFootprint: 'Narrow triangular footprint at Broadway and Fifth Avenue.',
  },
  {
    id: 'ferry-building',
    name: 'Ferry Building',
    city: 'San Francisco',
    latitude: 37.79549,
    longitude: -122.39370,
    expectedHeightMeters: 75,
    expectedFootprint: 'Long waterfront market hall footprint with central tower.',
  },
  {
    id: 'one-world-trade-center',
    name: 'One World Trade Center',
    city: 'New York',
    latitude: 40.71274,
    longitude: -74.01338,
    expectedHeightMeters: 541,
    expectedFootprint: 'Large tower footprint at the World Trade Center site.',
  },
];

const buildingInspectorDiagnosticsEnabled = () =>
  typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);

const logBuildingInspector = (label: string, details?: Record<string, unknown>) => {
  if (!buildingInspectorDiagnosticsEnabled()) return;
  console.info(`[BuildingInspector] ${label}`, details ?? {});
};

const assertBuildingInspectorLoopLimit = (
  label: string,
  count: number,
  details: Record<string, unknown>,
) => {
  if (!buildingInspectorDiagnosticsEnabled()) return;
  if (count !== BUILDING_INSPECTOR_DIAGNOSTIC_LIMIT + 1) return;
  console.warn(`[BuildingInspector] diagnostic volume exceeded: ${label}`, {
    count,
    limit: BUILDING_INSPECTOR_DIAGNOSTIC_LIMIT,
    ...details,
  });
};

const getProviderFeatureLabel = (index: number): string => {
  let value = index;
  let label = '';
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return `Feature ${label}`;
};

const BLANK_STYLE: StyleSpecification = {
  version: 8,
  name: 'Building Inspector Blank',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#050608',
      },
    },
  ],
};

type Bounds = [number, number, number, number];
type StreetReferenceSnapshot = {
  dataUrl: string;
  bounds: Bounds;
};

const STREET_PLANE_CONTEXT_RADIUS_METERS = 500;
const STREET_PLANE_CAPTURE_SIZE_PX = 1024;

const getStreetPlaneBounds = (lng: number, lat: number, radiusMeters = STREET_PLANE_CONTEXT_RADIUS_METERS): Bounds => {
  const latitudeDegreesPerMeter = 1 / 111_320;
  const longitudeDegreesPerMeter = 1 / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const latDelta = radiusMeters * latitudeDegreesPerMeter;
  const lngDelta = radiusMeters * longitudeDegreesPerMeter;
  return [lng - lngDelta, lat - latDelta, lng + lngDelta, lat + latDelta];
};

const captureStreetPlaneNeighborhood = (
  lng: number,
  lat: number,
): Promise<StreetReferenceSnapshot> => new Promise((resolve, reject) => {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-12000px';
  container.style.top = '0';
  container.style.width = `${STREET_PLANE_CAPTURE_SIZE_PX}px`;
  container.style.height = `${STREET_PLANE_CAPTURE_SIZE_PX}px`;
  container.style.opacity = '0';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '-1';
  document.body.appendChild(container);

  const bounds = getStreetPlaneBounds(lng, lat);
  let settled = false;
  let captureMap: MapLibreMap | null = null;
  let timeoutId: number | null = null;

  const cleanup = () => {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    captureMap?.remove();
    captureMap = null;
    container.remove();
  };

  const fail = (error: unknown) => {
    if (settled) return;
    settled = true;
    cleanup();
    reject(error instanceof Error ? error : new Error('Street plane capture failed.'));
  };

  const capture = () => {
    if (settled || !captureMap) return;
    window.requestAnimationFrame(() => {
      if (settled || !captureMap) return;
      try {
        const renderedBounds = captureMap.getBounds();
        const dataUrl = captureMap.getCanvas().toDataURL('image/png');
        settled = true;
        const snapshot: StreetReferenceSnapshot = {
          dataUrl,
          bounds: [renderedBounds.getWest(), renderedBounds.getSouth(), renderedBounds.getEast(), renderedBounds.getNorth()],
        };
        cleanup();
        resolve(snapshot);
      } catch (error) {
        fail(error);
      }
    });
  };

  try {
    captureMap = new maplibregl.Map({
      container,
      style: JSON.parse(JSON.stringify(swingMapStyle)) as StyleSpecification,
      center: [lng, lat],
      zoom: 15,
      attributionControl: false,
      interactive: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    captureMap.on('load', () => {
      if (!captureMap || settled) return;
      captureMap.fitBounds(
        [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
        { padding: 36, duration: 0, maxZoom: 17 },
      );
      captureMap.once('idle', capture);
      captureMap.triggerRepaint();
      window.setTimeout(capture, 2500);
    });
    captureMap.on('error', (event) => {
      if (settled) return;
      console.warn('[BuildingInspector] street-plane capture map error', event.error ?? event);
    });
    timeoutId = window.setTimeout(() => fail(new Error('Street plane capture timed out.')), 8000);
  } catch (error) {
    fail(error);
  }
});
type SelectedBuildingAddressState = {
  status: 'idle' | 'loading' | 'resolved' | 'missing' | 'error' | 'multiple';
  primary: string | null;
  secondary: string | null;
};
type ReverseAddressResult = ResolvedBuildingAddress;
type BuildingAddressIntelligenceResolvedStatus = 'confirmed' | 'probable' | 'unconfirmed' | 'mismatch';
type BuildingAddressIntelligenceStatus = 'idle' | 'checking' | 'skipped' | BuildingAddressIntelligenceResolvedStatus;
type BuildingAddressIntelligenceCandidate = {
  buildingId: string;
  polygonIndices: number[];
  providerFeatureIds: string[];
  distanceMeters: number | null;
  pinIntersects: boolean;
  address: ReverseAddressResult | null;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  pinToCentroidMeters: number;
  score: number;
  confidence: number;
  reasons: string[];
  reverseAddressStatus: BuildingAddressResolution['status'];
  providerSource: string | null;
};
type BuildingAddressIntelligenceState = {
  status: BuildingAddressIntelligenceStatus;
  message: string;
  searchRadiusMeters: number | null;
  bestCandidate: BuildingAddressIntelligenceCandidate | null;
  checkedCandidateCount: number;
  outcome?: BuildingVerificationOutcome;
  scoreGap?: number | null;
  autoAccept?: boolean;
};
type DiagnosticMetric = number | null;

const selectedBuildingAddressCache = new Map<string, Omit<SelectedBuildingAddressState, 'status'>>();
const reverseGeocodeBuildingAddressDetailed = (
  lat: number,
  lng: number,
  context: { listingId: string; footprintFingerprint?: string; signal?: AbortSignal },
): Promise<BuildingAddressResolution> => inspectorBuildingAddressResolver.resolveDetailed(lat, lng, context);

type BuildingResolution = {
  featureId: string;
  source: string | null;
  sourceLayer: string | null;
  fragments: MapGeoJSONFeature[];
  duplicateGroups: DuplicateSummary[];
  primaryTile: string;
  rawGeoJSON: GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  bbox: Bounds | null;
  polygonCount: DiagnosticMetric;
  ringCount: DiagnosticMetric;
  vertexCount: DiagnosticMetric;
  fragmentCount: number;
  disconnectedPieces: DiagnosticMetric;
  metricsStatus: 'ready' | 'skipped';
};

type FragmentRecord = {
  featureId: string;
  tile: string;
  source: string | null;
  sourceLayer: string | null;
  geometryType: string;
  centroid: [number, number] | null;
  distanceFromTwistMeters: number | null;
  bbox: Bounds | null;
  areaMeters: number;
  polygonCount: DiagnosticMetric;
  ringCount: DiagnosticMetric;
  vertexCount: DiagnosticMetric;
  disconnectedPieces: DiagnosticMetric;
};

type PolygonRecord = {
  polygonIndex: number;
  geometry: GeoJSON.Polygon;
  areaMeters: number;
  bbox: Bounds | null;
  ringCount: number;
  vertexCount: number;
  renderHeightMeters: number | null;
  renderMinHeightMeters: number | null;
  providerFeatureId: string | null;
  localRings: Array<Array<[number, number]>>;
  geoJson: GeoJSON.Feature<GeoJSON.Polygon, Record<string, unknown>>;
};

type SelectionSummary = {
  count: number;
  indices: number[];
  areaMeters: number;
  bbox: Bounds | null;
  vertexCount: number;
  ringCount: number;
  maxRenderHeightMeters: number | null;
  avgRenderHeightMeters: number | null;
  geoJson: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>> | null;
};

type SceneMeshEntry = {
  record: PolygonRecord;
  mesh: THREE.Mesh;
  outline: THREE.LineSegments;
  edges: THREE.EdgesGeometry;
  material: THREE.MeshStandardMaterial;
  outlineMaterial: THREE.LineBasicMaterial;
};

type DuplicateSummary = {
  featureId: string;
  fragmentCount: number;
  disconnectedPieces: DiagnosticMetric;
  tileSet: string[];
};

type ForensicReport = {
  selectedFeatureId: string;
  returnedFeatureCount: number;
  selectedTileCount: number;
  selectedUniqueCentroids: number;
  loadedFeatureCount: number;
  loadedUniqueIdCount: number;
  duplicateIdEntries: Array<{ featureId: string; count: number }>;
  rawFeatureDumpLines: string[];
  fragmentLines: string[];
  unionSummaryLines: string[];
};

type RenderedPolygon = {
  d: string;
  fill: string;
  stroke: string;
};

type BuildingAssetFilter = 'all' | 'missing' | 'location' | 'has';
type BuildingLocationAuditState = 'ready' | 'review' | 'approximate';
type BuildingLocationAudit = {
  state: BuildingLocationAuditState;
  label: string;
  reason: string;
  venueListingDriftMeters: number | null;
};
type ResolverFailureStatus =
  | 'FEATURE_FOUND'
  | 'FEATURE_NOT_IN_TILE'
  | 'FEATURE_IN_ADJACENT_TILE'
  | 'EMPTY_GEOMETRY'
  | 'INVALID_GEOMETRY'
  | 'UNSUPPORTED_GEOMETRY'
  | 'NO_PROVIDER_FEATURE'
  | 'OUTSIDE_RADIUS'
  | 'PROVIDER_SYNC_MISMATCH'
  | 'PROVIDER_TIMEOUT'
  | 'WORKSPACE_LIMIT'
  | 'GEOMETRY_PROCESSING_ERROR'
  | 'RENDER_ERROR'
  | 'ADDRESS_LOOKUP_FAILED';

const RESOLVER_FAILURE_COPY: Record<ResolverFailureStatus, { title: string; action: string }> = {
  FEATURE_FOUND: { title: 'Building resolved', action: 'Review the selected footprint and evidence before saving.' },
  FEATURE_NOT_IN_TILE: { title: 'Provider feature is not in the loaded tile', action: 'Reload nearby tiles or use the coordinate-first neighborhood.' },
  FEATURE_IN_ADJACENT_TILE: { title: 'Building is split across an adjacent tile', action: 'The inspector will merge deduplicated footprint fragments.' },
  EMPTY_GEOMETRY: { title: 'Provider returned empty geometry', action: 'Try the expanded neighborhood or another provider.' },
  INVALID_GEOMETRY: { title: 'Provider geometry is malformed', action: 'Keep this case in geometry review; do not save it automatically.' },
  UNSUPPORTED_GEOMETRY: { title: 'Provider geometry type is unsupported', action: 'Use an individual Polygon or MultiPolygon footprint.' },
  NO_PROVIDER_FEATURE: { title: 'No usable provider footprint', action: 'Check the coordinate and provider coverage; this is not a silent failure.' },
  OUTSIDE_RADIUS: { title: 'Buildings exist, but not near the stored pin', action: 'Review the listing coordinate before choosing a footprint.' },
  PROVIDER_SYNC_MISMATCH: { title: 'Provider tiles are out of sync', action: 'Reload the neighborhood before making a decision.' },
  PROVIDER_TIMEOUT: { title: 'Provider tiles timed out', action: 'Retry later; do not treat this as no building data.' },
  WORKSPACE_LIMIT: { title: 'Neighborhood is exceptionally dense', action: 'The workspace was capped safely; narrow the radius for review.' },
  GEOMETRY_PROCESSING_ERROR: { title: 'Footprint processing failed', action: 'Open Diagnostics for the rejected geometry reason.' },
  RENDER_ERROR: { title: 'Footprints loaded but 3D rendering failed', action: 'Geometry remains available for diagnostics; reload the scene.' },
  ADDRESS_LOOKUP_FAILED: { title: 'Building address lookup failed', action: 'Geometry can still be reviewed, but it cannot auto-qualify.' },
};

type ResolverStepStatus = 'idle' | 'running' | 'success' | 'failed' | 'skipped';

type ResolverStep = {
  section: 'Venue' | 'Provider' | 'Neighborhood' | 'Geometry' | 'Asset';
  label: string;
  status: ResolverStepStatus;
  detail?: string;
};

type ResolverState = {
  failure: ResolverFailureStatus | null;
  suggestions: string[];
  providerTileFeatureCount: number;
  neighborhoodFeatureCount: number;
  radiusMeters: number;
  steps: ResolverStep[];
};

type ProviderCandidate = {
  featureId: string;
  feature: MapGeoJSONFeature;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  distanceMeters: number | null;
  polygonCount: number;
  source: string | null;
  sourceLayer: string | null;
};

type WorkspacePolygon = {
  id: string;
  geometry: GeoJSON.Polygon;
  bbox: Bounds | null;
  distanceMeters: number | null;
  renderHeightMeters: number | null;
  renderMinHeightMeters: number | null;
  providerFeatureId: string | null;
  source: string | null;
  sourceLayer: string | null;
};

type WorkspaceBuildingGroup = {
  id: string;
  label: string;
  polygonCount: number;
  polygonIndices: number[];
  providerFeatureIds: string[];
  distanceMeters: number | null;
  areaMeters: number;
  bbox: Bounds | null;
  center: [number, number] | null;
  maxRenderHeightMeters: number | null;
  avgRenderHeightMeters: number | null;
};

type WorkspaceGeometryResult = {
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  polygons: WorkspacePolygon[];
  buildings: WorkspaceBuildingGroup[];
  providerFeatureIds: string[];
  providerTileFeatureCount: number;
  radiusMeters: number;
};

type PolygonRecordMetadata = {
  renderHeightMeters?: number | null;
  renderMinHeightMeters?: number | null;
  providerFeatureId?: string | null;
};

type LandmarkTestRecord = {
  id: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  expectedHeightMeters: number;
  expectedFootprint: string;
};

type NeighborhoodCacheResult = {
  candidates: ProviderCandidate[];
  providerTileFeatureCount: number;
  radiusMeters: number;
};

type ListingWithBuildingAssetFields = Listing & {
  providerFeatureId?: unknown;
  buildingFeatureId?: unknown;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const formatNumber = (value: number | null | undefined, digits = 2): string => {
  if (!isFiniteNumber(value)) return 'n/a';
  return value.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: value >= 1000 || Number.isInteger(value) ? 0 : Math.min(2, digits),
  });
};

const formatBounds = (bounds: Bounds | null): string => {
  if (!bounds) return 'n/a';
  const [minLng, minLat, maxLng, maxLat] = bounds;
  return `${minLng.toFixed(6)}, ${minLat.toFixed(6)} | ${maxLng.toFixed(6)}, ${maxLat.toFixed(6)}`;
};

const formatMeters = (value: number | null | undefined): string => {
  if (!isFiniteNumber(value)) return 'n/a';
  if (Math.abs(value) >= 1000) return `${formatNumber(value / 1000, 2)} km`;
  return `${formatNumber(value, 1)} m`;
};

const parseProviderMeters = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const getProviderRenderHeight = (feature: MapGeoJSONFeature): number | null => {
  const properties = feature.properties ?? {};
  return parseProviderMeters(properties.render_height) ??
    parseProviderMeters(properties.height) ??
    parseProviderMeters(properties['building:height']);
};

const getProviderRenderMinHeight = (feature: MapGeoJSONFeature): number | null => {
  const properties = feature.properties ?? {};
  return parseProviderMeters(properties.render_min_height) ??
    parseProviderMeters(properties.min_height) ??
    parseProviderMeters(properties['building:min_height']);
};

const averageMetric = (values: Array<number | null | undefined>): number | null => {
  const finiteValues = values.filter(isFiniteNumber);
  if (!finiteValues.length) return null;
  return finiteValues.reduce((total, value) => total + value, 0) / finiteValues.length;
};

const maxMetric = (values: Array<number | null | undefined>): number | null => {
  const finiteValues = values.filter(isFiniteNumber);
  if (!finiteValues.length) return null;
  return Math.max(...finiteValues);
};

const minMetric = (values: Array<number | null | undefined>): number | null => {
  const finiteValues = values.filter(isFiniteNumber);
  if (!finiteValues.length) return null;
  return Math.min(...finiteValues);
};

const formatDiagnosticMetric = (value: DiagnosticMetric | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : 'Skipped';

const formatPolygonCountLabel = (value: DiagnosticMetric | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? `${value} polygon${value === 1 ? '' : 's'}` : 'metrics skipped';

const createResolverState = (
  overrides: Partial<ResolverState> = {},
): ResolverState => ({
  failure: null,
  suggestions: [],
  providerTileFeatureCount: 0,
  neighborhoodFeatureCount: 0,
  radiusMeters: DEFAULT_NEIGHBORHOOD_RADIUS_METERS,
  steps: [
    { section: 'Venue', label: 'Coordinates', status: 'idle' },
    { section: 'Venue', label: 'Address', status: 'idle' },
    { section: 'Provider', label: 'Tile loaded', status: 'idle' },
    { section: 'Provider', label: 'Feature found', status: 'idle' },
    { section: 'Provider', label: 'Adjacent tiles', status: 'idle' },
    { section: 'Neighborhood', label: 'Nearby features', status: 'idle' },
    { section: 'Neighborhood', label: 'Expanded radius', status: 'idle' },
    { section: 'Geometry', label: 'Polygon extracted', status: 'idle' },
    { section: 'Geometry', label: 'Editable mesh built', status: 'idle' },
    { section: 'Asset', label: 'Building asset', status: 'idle' },
  ],
  ...overrides,
});

const updateResolverStep = (
  state: ResolverState,
  section: ResolverStep['section'],
  label: string,
  status: ResolverStepStatus,
  detail?: string,
): ResolverState => ({
  ...state,
  steps: state.steps.map((step) =>
    step.section === section && step.label === label
      ? { ...step, status, detail }
      : step,
  ),
});

const resolverFailureSuggestions = (failure: ResolverFailureStatus | null): string[] => {
  switch (failure) {
    case 'FEATURE_NOT_IN_TILE':
      return ['Load Adjacent Tiles', 'Expand Radius', 'Manual Feature ID', 'Inspect OSM'];
    case 'FEATURE_IN_ADJACENT_TILE':
      return ['Load Adjacent Tiles', 'Manual Feature ID'];
    case 'EMPTY_GEOMETRY':
      return ['Provider may be out of sync with OpenStreetMap.', 'Manual Feature ID'];
    case 'INVALID_GEOMETRY':
    case 'UNSUPPORTED_GEOMETRY':
      return ['Manual Feature ID', 'Inspect OSM'];
    case 'NO_PROVIDER_FEATURE':
      return ['Manual Feature ID', 'Inspect OSM'];
    case 'OUTSIDE_RADIUS':
      return ['Expand Radius', 'Manual Feature ID'];
    case 'PROVIDER_SYNC_MISMATCH':
      return ['Provider may be out of sync with OpenStreetMap.', 'Inspect OSM'];
    default:
      return [];
  }
};

const createVenueResolverState = (
  listing: Listing,
  coords: { lng: number; lat: number },
  hasAsset: boolean,
  collections: EntityCollections = {},
): ResolverState => {
  let state = createResolverState();
  state = updateResolverStep(state, 'Venue', 'Coordinates', 'success', `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`);
  state = updateResolverStep(state, 'Venue', 'Address', 'success', formatListingAddress(listing, collections) || 'Available');
  state = updateResolverStep(state, 'Asset', 'Building asset', hasAsset ? 'success' : 'skipped', hasAsset ? 'Saved asset available' : 'Missing');
  return state;
};

const formatListingAddress = (
  listing: Listing,
  collections: EntityCollections = {},
): string => formatListingPhysicalAddress(listing, collections);

const getListingCityLabel = (
  listing: Listing,
  collections: EntityCollections = {},
): string => getListingPhysicalCityLabel(listing, collections);

const getListingProviderFeatureId = (listing: Listing): string | null => {
  const futureListing = listing as ListingWithBuildingAssetFields;
  const value = futureListing.providerFeatureId ?? futureListing.buildingFeatureId;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
};

const createLandmarkListing = (landmark: LandmarkTestRecord): Listing => ({
  id: `landmark-test-${landmark.id}`,
  type: 'club',
  name: landmark.name,
  description_short: `Developer landmark validation fixture for ${landmark.name}.`,
  location: `${landmark.name}, ${landmark.city}`,
  contactEmail: 'dev@swingsphere.local',
  geopoint: {
    latitude: landmark.latitude,
    longitude: landmark.longitude,
    address: {
      addressLine1: landmark.name,
      city: landmark.city,
      region: landmark.city === 'New York' ? 'NY' : 'CA',
      country: 'USA',
    },
  },
  schedule: [],
  generalAmenities: [],
  status: 'approved',
  postedByUserId: 'developer-landmark-tests',
});

const getBuildingAssetForListing = (
  listing: Listing | null,
  assets: BuildingAsset[],
  venues: VenueData[] = [],
  listings: Listing[] = [],
  organizations: OrganizationData[] = [],
  relationships: OrganizationVenueRelationship[] = [],
): BuildingAsset | null => {
  if (!listing) return null;
  if (venues.length || listings.length || organizations.length || relationships.length) {
    return getCompatibilityBuildingAssetForListing(listing, assets, { venues, listings, organizations, relationships });
  }
  const authoredAssetId = listing.buildingAssetId;
  if (authoredAssetId) {
    const exactMatch = assets.find((asset) => asset.id === authoredAssetId);
    if (exactMatch) return exactMatch;
  }
  return assets.find((asset) => asset.listingId === listing.id) ?? null;
};

const getGeometrySignature = (geometry: GeoJSON.Geometry | null | undefined): string =>
  geometry ? stringifyGeoJSON(geometry) : '';

const waitForMapIdle = (map: MapLibreMap, timeoutMs = 3000): Promise<'idle' | 'timeout'> => {
  const startedAt = performance.now();
  logBuildingInspector('waitForMapIdle:enter', { timeoutMs });
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = 0;
    const finish = (result: 'idle' | 'timeout') => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      map.off('idle', handleIdle);
      logBuildingInspector('waitForMapIdle:exit', {
        result,
        elapsedMs: performance.now() - startedAt,
      });
      resolve(result);
    };
    const handleIdle = () => finish('idle');
    map.once('idle', handleIdle);
    timeoutId = window.setTimeout(() => finish('timeout'), timeoutMs);
  });
};

const stringifyGeoJSON = (value: unknown): string =>
  JSON.stringify(
    value,
    (_key, current) => {
      if (typeof current === 'number') {
        return Number.isFinite(current) ? Number(current.toFixed(8)) : null;
      }
      return current;
    },
    2,
  );

const copyText = async (text: string): Promise<boolean> => {
  if (!navigator?.clipboard?.writeText) return false;
  await navigator.clipboard.writeText(text);
  return true;
};

const toRadians = (value: number): number => (value * Math.PI) / 180;

const toLocalMeters = (
  point: [number, number],
  origin: { lng: number; lat: number },
): { x: number; y: number } => {
  const metersPerDegreeLng = 111320 * Math.cos(toRadians(origin.lat));
  return {
    x: (point[0] - origin.lng) * metersPerDegreeLng,
    y: (point[1] - origin.lat) * 110540,
  };
};

const flattenCoords = (coords: unknown, points: number[][]): void => {
  if (!Array.isArray(coords)) return;
  if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    points.push(coords as number[]);
    return;
  }
  coords.forEach((child) => flattenCoords(child, points));
};

const collectCoordinatePoints = (geometry: GeoJSON.Geometry | null | undefined): number[][] => {
  if (!geometry || !('coordinates' in geometry)) return [];
  const points: number[][] = [];
  flattenCoords(geometry.coordinates, points);
  return points;
};

const getCoordinateSamples = (geometry: GeoJSON.Geometry | null | undefined, limit = 5): string[] => {
  const points = collectCoordinatePoints(geometry).slice(0, limit);
  return points.map((point) => JSON.stringify(point));
};

const getCoordinateCount = (geometry: GeoJSON.Geometry | null | undefined): number => collectCoordinatePoints(geometry).length;

const getMetadataMatches = (feature: MapGeoJSONFeature): string[] => {
  const propertyKeys = Object.keys(feature.properties ?? {});
  const allKeys = [...Object.keys(feature), ...propertyKeys];
  const normalizedKeys = new Set(allKeys);
  const matched = new Set<string>();
  const exactKeys = ['osm_id', 'building', 'building:part', 'relation', 'kind', 'class', 'type'];

  for (const key of exactKeys) {
    if (normalizedKeys.has(key)) matched.add(key);
  }

  for (const key of allKeys) {
    if (/osm|building|relation|kind|class|type/i.test(key)) {
      matched.add(key);
    }
  }

  return Array.from(matched).sort();
};

const buildPolygonRecords = (
  geometry: GeoJSON.Geometry | null | undefined,
  originOverride?: [number, number] | null,
  metadataByPolygon: PolygonRecordMetadata[] = [],
): PolygonRecord[] => {
  logBuildingInspector('buildPolygonRecords:enter', {
    geometryType: geometry?.type ?? null,
    coordinateCount: getCoordinateCount(geometry),
    hasOriginOverride: Boolean(originOverride),
  });
  const polygons = collectPolygons(geometry);
  const origin = originOverride ?? getGeometryCenter(geometry);
  if (!polygons.length || !origin) {
    logBuildingInspector('buildPolygonRecords:exit empty', {
      geometryType: geometry?.type ?? null,
      coordinateCount: getCoordinateCount(geometry),
      polygonCount: polygons.length,
      hasOrigin: Boolean(origin),
    });
    return [];
  }

  let polygonIterations = 0;
  const records: PolygonRecord[] = polygons.map((polygon, polygonIndex) => {
    polygonIterations += 1;
    assertBuildingInspectorLoopLimit('buildPolygonRecords.polygonLoop', polygonIterations, {
      polygonCount: polygons.length,
    });
    const geometryPolygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: polygon,
    };
    let ringIterations = 0;
    let coordinateIterations = 0;
    const localRings = polygon.map((ring) =>
      {
        ringIterations += 1;
        assertBuildingInspectorLoopLimit('buildPolygonRecords.ringLoop', ringIterations, {
          polygonIndex,
          ringCount: polygon.length,
        });
        return ring.map((coordinate) => {
          coordinateIterations += 1;
          assertBuildingInspectorLoopLimit('buildPolygonRecords.coordinateLoop', coordinateIterations, {
            polygonIndex,
            ringCount: polygon.length,
          });
          const local = toLocalMeters(coordinate as [number, number], { lng: origin[0], lat: origin[1] });
          return [local.x, local.y] as [number, number];
        })
        .filter((point, index, points) => {
          const previous = points[index - 1];
          return !previous || previous[0] !== point[0] || previous[1] !== point[1];
        });
      },
    );
    const ringCount = polygon.length;
    const vertexCount = polygon.reduce((total, ring) => total + ring.length, 0);
    const metadata = metadataByPolygon[polygonIndex] ?? {};
    return {
      polygonIndex,
      geometry: geometryPolygon,
      areaMeters: getFootprintAreaMeters(geometryPolygon),
      bbox: getGeometryBBox(geometryPolygon),
      ringCount,
      vertexCount,
      renderHeightMeters: metadata.renderHeightMeters ?? null,
      renderMinHeightMeters: metadata.renderMinHeightMeters ?? null,
      providerFeatureId: metadata.providerFeatureId ?? null,
      localRings,
      geoJson: {
        type: 'Feature',
        id: polygonIndex,
        properties: {
          polygon_index: polygonIndex,
          area_meters: getFootprintAreaMeters(geometryPolygon),
          ring_count: ringCount,
          vertex_count: vertexCount,
          render_height: metadata.renderHeightMeters ?? null,
          render_min_height: metadata.renderMinHeightMeters ?? null,
          provider_feature_id: metadata.providerFeatureId ?? null,
        },
        geometry: geometryPolygon,
      },
    };
  });
  logBuildingInspector('buildPolygonRecords:exit', {
    geometryType: geometry?.type ?? null,
    coordinateCount: getCoordinateCount(geometry),
    polygonCount: polygons.length,
    polygonIterations,
    recordCount: records.length,
  });
  return records;
};

const buildReferencePolygonRecords = (
  features: MapGeoJSONFeature[],
  editableFeatureId: string,
  origin: [number, number] | null,
): PolygonRecord[] => {
  logBuildingInspector('buildReferencePolygonRecords:enter', {
    featureCount: features.length,
    editableFeatureId,
    hasOrigin: Boolean(origin),
  });
  if (!origin) {
    logBuildingInspector('buildReferencePolygonRecords:exit missing origin', {
      featureCount: features.length,
      editableFeatureId,
    });
    return [];
  }
  let featureIterations = 0;
  const referencePolygons = features
    .filter((feature) => {
      featureIterations += 1;
      assertBuildingInspectorLoopLimit('buildReferencePolygonRecords.featureLoop', featureIterations, {
        featureCount: features.length,
        editableFeatureId,
      });
      if (feature.id === undefined || feature.id === null) return true;
      return String(feature.id) !== editableFeatureId;
    })
    .flatMap((feature) => collectPolygons(feature.geometry))
    .slice(0, 180);

  if (!referencePolygons.length) {
    logBuildingInspector('buildReferencePolygonRecords:exit empty', {
      featureIterations,
      referencePolygonCount: 0,
    });
    return [];
  }
  const geometry: GeoJSON.MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: referencePolygons,
  };
  const records = buildPolygonRecords(geometry, origin);
  logBuildingInspector('buildReferencePolygonRecords:exit', {
    featureIterations,
    referencePolygonCount: referencePolygons.length,
    recordCount: records.length,
  });
  return records;
};

const getFeatureIdString = (feature: MapGeoJSONFeature): string | null => {
  if (feature.id === undefined || feature.id === null) return null;
  return String(feature.id);
};

const buildScopedNeighborhoodCache = (
  features: MapGeoJSONFeature[],
  editableGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
  editableFeatureId: string,
  radiusMeters = DEFAULT_NEIGHBORHOOD_RADIUS_METERS,
): NeighborhoodCacheResult => {
  const editableCenter = getGeometryCenter(editableGeometry);
  const editablePoint = editableCenter ? { lng: editableCenter[0], lat: editableCenter[1] } : null;
  logBuildingInspector('scopedNeighborhoodCache:enter', {
    featureCount: features.length,
    editableFeatureId,
    hasEditablePoint: Boolean(editablePoint),
    radiusMeters,
  });
  const byId = new Map<string, ProviderCandidate>();
  let iterations = 0;
  for (const feature of features) {
    iterations += 1;
    assertBuildingInspectorLoopLimit('groupProviderFeatures.featureLoop', iterations, {
      featureCount: features.length,
      candidateCount: byId.size,
    });
    const featureId = getFeatureIdString(feature);
    const geometry = feature.geometry;
    if (!featureId || !geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) continue;
    const center = getGeometryCenter(geometry);
    const distanceMeters = editablePoint && center
      ? haversineMeters(editablePoint, { lng: center[0], lat: center[1] })
      : null;
    const boundsDistanceMeters = editablePoint ? getBoundsDistanceMeters(getGeometryBBox(geometry), editablePoint) : null;
    const isEditable = featureId === editableFeatureId;
    const isWithinRadius = isEditable || (
      boundsDistanceMeters !== null
        ? boundsDistanceMeters <= radiusMeters
        : distanceMeters !== null && distanceMeters <= radiusMeters
    );
    if (!isWithinRadius) continue;
    const metrics = getBaseFeatureMetrics(geometry);
    const candidate: ProviderCandidate = {
      featureId,
      feature,
      geometry,
      distanceMeters,
      polygonCount: metrics.polygonCount,
      source: feature.source ?? null,
      sourceLayer: feature.sourceLayer ?? null,
    };
    const existing = byId.get(featureId);
    if (!existing || (candidate.distanceMeters ?? Number.POSITIVE_INFINITY) < (existing.distanceMeters ?? Number.POSITIVE_INFINITY)) {
      byId.set(featureId, candidate);
    }
  }
  const candidates = Array.from(byId.values()).sort((a, b) =>
    (a.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.distanceMeters ?? Number.POSITIVE_INFINITY)
    || a.featureId.localeCompare(b.featureId),
  );
  logBuildingInspector('groupProviderFeatures:exit', {
    iterations,
    featureCount: features.length,
    candidateCount: candidates.length,
    radiusMeters,
  });
  return {
    candidates,
    providerTileFeatureCount: features.length,
    radiusMeters,
  };
};

const getBoundsCenter = (bounds: Bounds | null): [number, number] | null => {
  if (!bounds) return null;
  return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
};

const getWorkspacePolygonFingerprint = (coordinates: number[][][]): string => {
  return geometryFingerprint({ type: 'Polygon', coordinates });
};

const buildWorkspaceGeometryFromFeatures = (
  features: MapGeoJSONFeature[],
  center: { lng: number; lat: number },
  radiusMeters = DEFAULT_NEIGHBORHOOD_RADIUS_METERS,
): WorkspaceGeometryResult => {
  logBuildingInspector('workspaceGeometry:enter', {
    featureCount: features.length,
    center,
    radiusMeters,
  });

  const polygons: WorkspacePolygon[] = [];
  const polygonIndexByFingerprint = new Map<string, number>();
  let featureIterations = 0;
  let polygonIterations = 0;

  for (const feature of features) {
    featureIterations += 1;

    const providerFeatureId = getFeatureIdString(feature);
    const renderHeightMeters = getProviderRenderHeight(feature);
    const renderMinHeightMeters = getProviderRenderMinHeight(feature);
    const featurePolygons = collectPolygons(feature.geometry);
    featurePolygons.forEach((coordinates) => {
      polygonIterations += 1;
      const geometry: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates,
      };
      const bbox = getGeometryBBox(geometry);
      const distanceMeters = getBoundsDistanceMeters(bbox, center);
      if (distanceMeters === null || distanceMeters > radiusMeters) return;
      const fingerprint = getWorkspacePolygonFingerprint(coordinates);
      const duplicateIndex = polygonIndexByFingerprint.get(fingerprint);
      if (duplicateIndex !== undefined) {
        const duplicate = polygons[duplicateIndex];
        if (!duplicate.providerFeatureId && providerFeatureId) duplicate.providerFeatureId = providerFeatureId;
        return;
      }
      polygonIndexByFingerprint.set(fingerprint, polygons.length);
      polygons.push({
        id: fingerprint,
        geometry,
        bbox,
        distanceMeters,
        renderHeightMeters,
        renderMinHeightMeters,
        providerFeatureId,
        source: feature.source ?? null,
        sourceLayer: feature.sourceLayer ?? null,
      });
    });
  }

  polygons.sort((a, b) =>
    (a.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.distanceMeters ?? Number.POSITIVE_INFINITY)
    || a.id.localeCompare(b.id),
  );
  // A provider MultiPolygon is not a reliable real-world building grouping. Keep
  // each deduplicated footprint independent; an administrator can deliberately
  // multi-select genuinely related pieces when authoring the canonical asset.
  const buildings = polygons.map((polygon, index): WorkspaceBuildingGroup => ({
    id: polygon.id,
    label: `Building ${index + 1}`,
    polygonCount: 1,
    polygonIndices: [index],
    providerFeatureIds: polygon.providerFeatureId ? [polygon.providerFeatureId] : [],
    distanceMeters: polygon.distanceMeters,
    areaMeters: getFootprintAreaMeters(polygon.geometry),
    bbox: polygon.bbox,
    center: getBoundsCenter(polygon.bbox),
    maxRenderHeightMeters: polygon.renderHeightMeters,
    avgRenderHeightMeters: polygon.renderHeightMeters,
  }));

  const coordinates = polygons.map((polygon) => polygon.geometry.coordinates);
  const geometry = coordinates.length === 1
    ? {
        type: 'Polygon' as const,
        coordinates: coordinates[0],
      }
    : coordinates.length > 1
      ? {
          type: 'MultiPolygon' as const,
          coordinates,
        }
      : null;

  const providerFeatureIds = Array.from(new Set(polygons
    .map((polygon) => polygon.providerFeatureId)
    .filter((value): value is string => Boolean(value))));

  logBuildingInspector('workspaceGeometry:exit', {
    featureIterations,
    polygonIterations,
    workspacePolygonCount: polygons.length,
    buildingCount: buildings.length,
    providerFeatureIdCount: providerFeatureIds.length,
    duplicatePolygonCount: Math.max(0, polygonIterations - polygons.length),
    radiusMeters,
  });

  return {
    geometry,
    polygons,
    buildings,
    providerFeatureIds,
    providerTileFeatureCount: features.length,
    radiusMeters,
  };
};

const buildWorkspaceProviderCandidates = (
  features: MapGeoJSONFeature[],
  workspace: WorkspaceGeometryResult,
  center: { lng: number; lat: number },
): ProviderCandidate[] => {
  const providerIds = new Set(workspace.providerFeatureIds);
  const candidates: ProviderCandidate[] = [];
  const seen = new Set<string>();
  let iterations = 0;

  for (const feature of features) {
    iterations += 1;
    assertBuildingInspectorLoopLimit('workspaceProviderCandidates.featureLoop', iterations, {
      featureCount: features.length,
      candidateCount: candidates.length,
    });
    const featureId = getFeatureIdString(feature);
    if (!featureId || !providerIds.has(featureId) || seen.has(featureId)) continue;
    const geometry = feature.geometry;
    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) continue;
    const metrics = getBaseFeatureMetrics(geometry);
    const featureCenter = getGeometryCenter(geometry);
    candidates.push({
      featureId,
      feature,
      geometry,
      distanceMeters: featureCenter ? haversineMeters(center, { lng: featureCenter[0], lat: featureCenter[1] }) : null,
      polygonCount: metrics.polygonCount,
      source: feature.source ?? null,
      sourceLayer: feature.sourceLayer ?? null,
    });
    seen.add(featureId);
  }

  return candidates.sort((a, b) =>
    (a.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.distanceMeters ?? Number.POSITIVE_INFINITY)
    || a.featureId.localeCompare(b.featureId),
  );
};

const buildRawFeatureDump = (feature: MapGeoJSONFeature, index: number): string[] => {
  const geometry = feature.geometry;
  const propertyKeys = Object.keys(feature.properties ?? {});
  const rawKeys = Object.keys(feature);
  const coordinateCount = getCoordinateCount(geometry);
  const coordinateSamples = getCoordinateSamples(geometry);
  const geometryType = geometry?.type ?? 'n/a';
  const isPolygon = geometryType === 'Polygon';
  const isMultiPolygon = geometryType === 'MultiPolygon';
  const metadataMatches = getMetadataMatches(feature);

  return [
    `Feature ${index}`,
    `feature.id: ${feature.id === undefined || feature.id === null ? 'n/a' : String(feature.id)}`,
    `feature.type: ${feature.type ?? 'n/a'}`,
    `feature.geometry.type: ${geometryType}`,
    `raw object keys: ${rawKeys.length ? rawKeys.join(', ') : 'n/a'}`,
    `property keys: ${propertyKeys.length ? propertyKeys.join(', ') : 'n/a'}`,
    'feature.properties:',
    stringifyGeoJSON(feature.properties ?? {}),
    'raw feature object:',
    stringifyGeoJSON(feature),
    `first five coordinate arrays: ${coordinateSamples.length ? coordinateSamples.join(' | ') : 'n/a'}`,
    `total coordinate count: ${coordinateCount}`,
    `polygon or multipolygon: ${isPolygon ? 'Polygon' : isMultiPolygon ? 'MultiPolygon' : 'neither'}`,
    `has osm_id / building / building:part / relation / kind / class / type metadata: ${metadataMatches.length ? 'yes' : 'no'}`,
    `matched metadata keys: ${metadataMatches.length ? metadataMatches.join(', ') : 'n/a'}`,
  ];
};

const getGeometryBBox = (geometry: GeoJSON.Geometry | null | undefined): Bounds | null => {
  if (!geometry || !('coordinates' in geometry)) return null;
  const points: number[][] = [];
  flattenCoords(geometry.coordinates, points);
  if (!points.length) return null;
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  points.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  });
  return [minLng, minLat, maxLng, maxLat];
};

const getGeometryCenter = (geometry: GeoJSON.Geometry | null | undefined): [number, number] | null => {
  const bounds = getGeometryBBox(geometry);
  if (!bounds) return null;
  return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
};

const getGeometrySpanMeters = (bounds: Bounds | null): { widthMeters: number; heightMeters: number } | null => {
  if (!bounds) return null;
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const centerLat = (minLat + maxLat) / 2;
  const origin = { lng: (minLng + maxLng) / 2, lat: centerLat };
  const widthMeters = Math.abs(toLocalMeters([maxLng, centerLat], origin).x - toLocalMeters([minLng, centerLat], origin).x);
  const heightMeters = Math.abs(toLocalMeters([origin.lng, maxLat], origin).y - toLocalMeters([origin.lng, minLat], origin).y);
  return { widthMeters, heightMeters };
};

const getBoundsDistanceMeters = (
  bounds: Bounds | null,
  point: { lng: number; lat: number },
): number | null => {
  if (!bounds) return null;
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const closestLng = Math.min(maxLng, Math.max(minLng, point.lng));
  const closestLat = Math.min(maxLat, Math.max(minLat, point.lat));
  return haversineMeters(point, { lng: closestLng, lat: closestLat });
};

const collectPolygons = (geometry: GeoJSON.Geometry | null | undefined): number[][][][] => {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates as number[][][]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as number[][][][];
  return [];
};

const haversineMeters = (a: { lng: number; lat: number }, b: { lng: number; lat: number }): number => {
  const earthRadiusMeters = 6371008.8;
  const toRadiansLocal = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadiansLocal(b.lat - a.lat);
  const dLng = toRadiansLocal(b.lng - a.lng);
  const lat1 = toRadiansLocal(a.lat);
  const lat2 = toRadiansLocal(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(h)));
};

const BUILDING_LOCATION_APPROXIMATE_WARNING_PATTERN = /approximate-location|exact-address-not-published|exact-address-not-public|private-venue-city-level-location|map-pin-is-approximate|coordinate-represents-|event-location-may-vary|event-locations-vary|exact-location-provided|location-disclosed|published-road-area/i;
const BUILDING_LOCATION_REVIEW_WARNING_PATTERN = /coordinates?-need-final-verification|street-level-geocode|address-number-not-resolved|map-coordinate-resolved-(?:at|near)-street-segment|coordinate-resolved-to-(?:nearby-)?road-segment|venue-name-confirmed-address-number-not-published|low-geocode-confidence|postal-code-source-mismatch/i;

const coordinateDecimalPlaces = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const decimal = String(Math.abs(value)).split('.')[1];
  return decimal?.length ?? 0;
};

const getBuildingLocationAudit = (
  listing: Listing,
  collections: EntityCollections = {},
): BuildingLocationAudit => {
  const venue = getVenueForListing(listing, collections);
  const physicalAddress = getListingPhysicalAddress(listing, collections);
  const canonicalCoords = getListingCanonicalCoords(listing, collections);
  const persistedVenue = venue && collections.venues?.some((candidate) => candidate.id === venue.id)
    ? venue
    : null;
  const metadata = persistedVenue?.locationMeta ?? listing.locationMeta;
  const warnings = Array.from(new Set([
    ...(listing.locationMeta?.warnings ?? []),
    ...(persistedVenue?.locationMeta?.warnings ?? []),
  ]));
  const warningText = warnings.join(' ');
  const streetAddress = physicalAddress.addressLine1?.trim() ?? '';
  const metadataStatus = String(metadata?.status ?? '').trim().toLowerCase();
  const isApproximate =
    isApproximateLocation(listing) ||
    persistedVenue?.visibility === 'public_approximate' ||
    persistedVenue?.visibility === 'private' ||
    metadataStatus === 'approximate' ||
    BUILDING_LOCATION_APPROXIMATE_WARNING_PATTERN.test(warningText);

  if (!streetAddress) {
    return {
      state: 'approximate',
      label: 'No exact address',
      reason: 'This listing does not have a street-level address, so selecting a specific building would be guesswork.',
      venueListingDriftMeters: null,
    };
  }

  if (isApproximate) {
    return {
      state: 'approximate',
      label: 'Approximate pin',
      reason: 'This location is intentionally approximate, private, or otherwise not precise enough for building authoring.',
      venueListingDriftMeters: null,
    };
  }

  let venueListingDriftMeters: number | null = null;
  if (
    listing.type === 'club' &&
    persistedVenue &&
    Number.isFinite(listing.geopoint.latitude) &&
    Number.isFinite(listing.geopoint.longitude)
  ) {
    venueListingDriftMeters = haversineMeters(
      { lat: listing.geopoint.latitude, lng: listing.geopoint.longitude },
      { lat: persistedVenue.latitude, lng: persistedVenue.longitude },
    );
    if (venueListingDriftMeters > 35) {
      return {
        state: 'review',
        label: 'Venue/listing drift',
        reason: `The Venue pin and listing pin differ by about ${Math.round(venueListingDriftMeters)} m. Resolve that drift before choosing a building.`,
        venueListingDriftMeters,
      };
    }
  }

  const buildingVerification = metadata?.buildingVerification;
  if (buildingVerification?.status === 'mismatch' || buildingVerification?.status === 'unconfirmed') {
    return {
      state: 'review',
      label: 'Building address flag',
      reason: buildingVerification.candidateAddress
        ? `The last automated building check could not reconcile the listing with ${buildingVerification.candidateAddress}.`
        : 'The last automated building check could not confirm a nearby footprint against the listing address.',
      venueListingDriftMeters,
    };
  }

  if (metadataStatus && metadataStatus !== 'validated') {
    return {
      state: 'review',
      label: 'Pin review',
      reason: `Location metadata is marked ${metadataStatus.replace(/_/g, ' ')} rather than validated.`,
      venueListingDriftMeters,
    };
  }

  if (BUILDING_LOCATION_REVIEW_WARNING_PATTERN.test(warningText)) {
    return {
      state: 'review',
      label: 'Pin review',
      reason: warnings[0] ? `Location warning: ${warnings[0].replace(/-/g, ' ')}.` : 'The stored coordinate needs street-level verification.',
      venueListingDriftMeters,
    };
  }

  if (typeof metadata?.confidence === 'number' && metadata.confidence < 0.9) {
    return {
      state: 'review',
      label: 'Pin review',
      reason: `Location confidence is ${(metadata.confidence * 100).toFixed(0)}%, below the building-authoring threshold.`,
      venueListingDriftMeters,
    };
  }

  if (
    canonicalCoords &&
    Math.min(coordinateDecimalPlaces(canonicalCoords.lat), coordinateDecimalPlaces(canonicalCoords.lng)) < 4
  ) {
    return {
      state: 'review',
      label: 'Low-precision pin',
      reason: 'The stored coordinate is too coarsely rounded for reliable building-level selection.',
      venueListingDriftMeters,
    };
  }

  return {
    state: 'ready',
    label: 'Pin ready',
    reason: 'The listing has a street address and no known precision warnings.',
    venueListingDriftMeters,
  };
};

const getFeatureTile = (feature: MapGeoJSONFeature): string => {
  const anyFeature = feature as MapGeoJSONFeature & { _z?: number; _x?: number; _y?: number };
  if (
    typeof anyFeature._z === 'number' &&
    typeof anyFeature._x === 'number' &&
    typeof anyFeature._y === 'number'
  ) {
    return `${anyFeature._z}/${anyFeature._x}/${anyFeature._y}`;
  }
  return 'n/a';
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

const pointInRing = (point: [number, number], ring: number[][]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i]?.[0];
    const yi = ring[i]?.[1];
    const xj = ring[j]?.[0];
    const yj = ring[j]?.[1];
    if (!isFiniteNumber(xi) || !isFiniteNumber(yi) || !isFiniteNumber(xj) || !isFiniteNumber(yj)) {
      continue;
    }
    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};

const pointInPolygon = (point: [number, number], polygon: number[][][]): boolean => {
  if (!polygon.length || !pointInRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(point, hole));
};

const getWorkspaceBuildingGeometry = (
  workspace: WorkspaceGeometryResult,
  building: WorkspaceBuildingGroup,
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null => {
  const coordinates = building.polygonIndices
    .map((index) => workspace.polygons[index]?.geometry.coordinates)
    .filter((value): value is number[][][] => Boolean(value));
  if (!coordinates.length) return null;
  return coordinates.length === 1
    ? { type: 'Polygon', coordinates: coordinates[0] }
    : { type: 'MultiPolygon', coordinates };
};

const workspaceBuildingContainsPoint = (
  workspace: WorkspaceGeometryResult,
  building: WorkspaceBuildingGroup,
  point: { lng: number; lat: number },
): boolean => {
  const geometry = getWorkspaceBuildingGeometry(workspace, building);
  if (!geometry) return false;
  return collectPolygons(geometry).some((polygon) => pointInPolygon([point.lng, point.lat], polygon));
};

const rankWorkspaceAddressCandidates = async (
  listing: Listing,
  workspace: WorkspaceGeometryResult,
  point: { lng: number; lat: number },
  collections: EntityCollections,
  maxCandidates = 7,
  signal?: AbortSignal,
): Promise<BuildingAddressIntelligenceCandidate[]> => {
  const listingAddress = getListingPhysicalAddress(listing, collections);
  const candidates: BuildingAddressIntelligenceCandidate[] = [];
  const buildings = workspace.buildings
    .filter((building) => (
      building.center
      && building.polygonIndices.length
      && !building.providerFeatureIds.some((featureId) => isGeneratedBuildingFeatureId(featureId))
    ))
    .slice(0, maxCandidates);

  for (const building of buildings) {
    const center = building.center;
    if (!center) continue;
    if (signal?.aborted) break;
    const addressResolution = await reverseGeocodeBuildingAddressDetailed(center[1], center[0], {
      listingId: listing.id,
      footprintFingerprint: building.id,
      signal,
    });
    const address = addressResolution.status === 'resolved' ? addressResolution.address : null;
    const geometry = getWorkspaceBuildingGeometry(workspace, building);
    if (!geometry) continue;
    const minimumPinToFootprintMeters = pointToBuildingDistanceMeters(point, geometry);
    const pinIntersects = pointIntersectsBuildingGeometry(point, geometry);
    const pinToCentroidMeters = haversineMeters(point, { lng: center[0], lat: center[1] });
    const scored = scoreBuildingAddressCandidate(
      listingAddress,
      address?.candidate ?? {},
      { distanceMeters: minimumPinToFootprintMeters, pinIntersects },
    );
    candidates.push({
      buildingId: building.id,
      polygonIndices: building.polygonIndices,
      providerFeatureIds: building.providerFeatureIds,
      distanceMeters: minimumPinToFootprintMeters,
      pinIntersects,
      address,
      geometry,
      pinToCentroidMeters,
      score: scored.score,
      confidence: scored.confidence,
      reasons: scored.reasons,
      reverseAddressStatus: addressResolution.status,
      providerSource: workspace.polygons[building.polygonIndices[0]]?.source ?? 'OpenFreeMap',
    });
  }

  return candidates.sort((a, b) =>
    b.score - a.score
    || b.confidence - a.confidence
    || (a.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.distanceMeters ?? Number.POSITIVE_INFINITY),
  );
};

const classifyBuildingAddressCandidates = (
  candidates: BuildingAddressIntelligenceCandidate[],
  listing: Listing,
  collections: EntityCollections,
): { status: BuildingAddressIntelligenceResolvedStatus; message: string; bestCandidate: BuildingAddressIntelligenceCandidate | null; outcome: BuildingVerificationOutcome; scoreGap: number | null; autoAccept: boolean; autoAcceptMethod: 'exact_address_and_pin' | 'authoritative_unique_pin' | null; decision: ReturnType<typeof evaluateBuildingVerification> } => {
  const venue = getVenueForListing(listing, collections);
  const locationMeta = venue?.locationMeta ?? listing.locationMeta;
  const decision = evaluateBuildingVerification(candidates.map((candidate) => ({
    fingerprint: candidate.buildingId,
    geometry: candidate.geometry,
    providerFeatureIds: candidate.providerFeatureIds,
    source: candidate.providerSource,
    pinIntersects: candidate.pinIntersects,
    pinToFootprintMeters: candidate.distanceMeters ?? Number.POSITIVE_INFINITY,
    pinToCentroidMeters: candidate.pinToCentroidMeters,
    address: candidate.address?.candidate ?? null,
    addressScope: candidate.address && !buildingAddressBelongsToFootprint(candidate.address, candidate.geometry) ? 'nearby_object' as const : 'footprint' as const,
    addressLabel: candidate.address?.displayName ?? candidate.address?.primary ?? null,
  })), {
    listingAddress: getListingPhysicalAddress(listing, collections),
    locationConfidence: locationMeta?.confidence,
    geocoderSource: locationMeta?.geocoderSource ?? locationMeta?.source,
    manuallyAdjusted: locationMeta?.manualAdjustment,
  });
  const bestCandidate = decision.candidate
    ? candidates.find((candidate) => candidate.buildingId === decision.candidate?.fingerprint) ?? candidates[0] ?? null
    : null;
  const status: BuildingAddressIntelligenceResolvedStatus = decision.outcome === 'verified'
    ? 'confirmed'
    : decision.outcome === 'probable'
      ? 'probable'
      : decision.outcome === 'address_mismatch' || decision.outcome === 'pin_mismatch'
        ? 'mismatch'
        : 'unconfirmed';
  const message = decision.outcome === 'verified'
    ? `Definitive shadow candidate: ${bestCandidate?.address?.primary ?? 'the recommended footprint'}. No asset was written.`
    : decision.outcome === 'probable'
      ? `Best candidate is ${bestCandidate?.address?.primary ?? 'a nearby footprint'}, but it needs a quick visual review.`
      : decision.outcome === 'ambiguous'
        ? 'Two or more nearby buildings have materially similar evidence.'
        : decision.reasons.join(' ') || 'No nearby building could be address-checked.';
  return { status, message, bestCandidate, outcome: decision.outcome, scoreGap: decision.scoreGap, autoAccept: decision.autoAccept, autoAcceptMethod: decision.autoAcceptMethod, decision };
};

const polygonsIntersect = (a: number[][][][], b: number[][][][]): boolean => {
  for (const polygonA of a) {
    for (const polygonB of b) {
      for (const ringA of polygonA) {
        for (const ringB of polygonB) {
          for (const [a1, a2] of ringSegments(ringA)) {
            for (const [b1, b2] of ringSegments(ringB)) {
              if (segmentsIntersect(a1, a2, b1, b2)) return true;
            }
          }
          if (ringA[0] && pointInPolygon(ringA[0] as [number, number], polygonB)) return true;
          if (ringB[0] && pointInPolygon(ringB[0] as [number, number], polygonA)) return true;
        }
      }
    }
  }
  return false;
};

const countConnectedPieces = (polygons: number[][][][]): number => {
  logBuildingInspector('countConnectedPieces:enter', { polygonCount: polygons.length });
  if (!polygons.length) return 0;
  const visited = new Set<number>();
  let pieces = 0;
  let comparisons = 0;

  for (let i = 0; i < polygons.length; i += 1) {
    assertBuildingInspectorLoopLimit('countConnectedPieces.outerLoop', i + 1, {
      polygonCount: polygons.length,
      pieces,
    });
    if (visited.has(i)) continue;
    pieces += 1;
    const stack = [i];
    visited.add(i);

    while (stack.length) {
      const current = stack.pop();
      if (current === undefined) continue;
      for (let j = 0; j < polygons.length; j += 1) {
        comparisons += 1;
        assertBuildingInspectorLoopLimit('countConnectedPieces.comparisons', comparisons, {
          polygonCount: polygons.length,
          pieces,
          current,
          j,
        });
        if (visited.has(j)) continue;
        if (polygonsIntersect([polygons[current]], [polygons[j]])) {
          visited.add(j);
          stack.push(j);
        }
      }
    }
  }

  logBuildingInspector('countConnectedPieces:exit', {
    polygonCount: polygons.length,
    pieces,
    comparisons,
  });
  return pieces;
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

const getFootprintAreaMeters = (geometry: GeoJSON.Geometry | null | undefined): number => {
  const polygons = collectPolygons(geometry);
  const center = getGeometryCenter(geometry);
  if (!polygons.length || !center) return 0;
  const origin = { lng: center[0], lat: center[1] };
  return polygons.reduce((total, polygon) => {
    if (!polygon.length) return total;
    const outerArea = ringAreaMeters(polygon[0], origin);
    const holeArea = polygon.slice(1).reduce((holeTotal, ring) => holeTotal + ringAreaMeters(ring, origin), 0);
    return total + Math.max(0, outerArea - holeArea);
  }, 0);
};

const buildAggregateBounds = (items: Array<{ bbox: Bounds | null }>): Bounds | null => {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const item of items) {
    const bounds = item.bbox;
    if (!bounds) continue;
    minLng = Math.min(minLng, bounds[0]);
    minLat = Math.min(minLat, bounds[1]);
    maxLng = Math.max(maxLng, bounds[2]);
    maxLat = Math.max(maxLat, bounds[3]);
  }

  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
  return [minLng, minLat, maxLng, maxLat];
};

const countUniqueCentroids = (items: Array<{ centroid: [number, number] | null }>): number => {
  const centroids = new Set<string>();
  for (const item of items) {
    if (!item.centroid) continue;
    centroids.add(`${item.centroid[0].toFixed(6)},${item.centroid[1].toFixed(6)}`);
  }
  return centroids.size;
};

const countUniqueIds = (features: MapGeoJSONFeature[]): number => {
  const ids = new Set<string>();
  for (const feature of features) {
    if (feature.id === undefined || feature.id === null) continue;
    ids.add(String(feature.id));
  }
  return ids.size;
};

const buildForensicReport = (
  selectedFeatureId: string,
  allFeatures: MapGeoJSONFeature[],
  fragmentRecords: FragmentRecord[],
  duplicateSummaries: DuplicateSummary[],
  resolution: BuildingResolution | null,
): ForensicReport => {
  const selectedTiles = new Set(fragmentRecords.map((fragment) => fragment.tile).filter((tile) => tile !== 'n/a'));
  const centroidEntries = fragmentRecords.filter((fragment) => fragment.centroid);
  const aggregateBounds = buildAggregateBounds(fragmentRecords);
  const span = getGeometrySpanMeters(aggregateBounds);
  const maxSeparationMeters = centroidEntries.reduce((maxDistance, current, index) => {
    if (!current.centroid) return maxDistance;
    for (let i = index + 1; i < centroidEntries.length; i += 1) {
      const other = centroidEntries[i];
      if (!other.centroid) continue;
      maxDistance = Math.max(
        maxDistance,
        haversineMeters(
          { lng: current.centroid[0], lat: current.centroid[1] },
          { lng: other.centroid[0], lat: other.centroid[1] },
        ),
      );
    }
    return maxDistance;
  }, 0);

  const fragmentLines = fragmentRecords.length
    ? fragmentRecords.map((fragment, index) => {
        const distance = fragment.distanceFromTwistMeters ? formatMeters(fragment.distanceFromTwistMeters) : 'n/a';
        const centroid = fragment.centroid ? `${fragment.centroid[1].toFixed(6)}, ${fragment.centroid[0].toFixed(6)}` : 'n/a';
        return [
          `Fragment ${index + 1}`,
          `Tile: ${fragment.tile}`,
          `BBox: ${formatBounds(fragment.bbox)}`,
          `Centroid: ${centroid}`,
          `Area: ${formatNumber(fragment.areaMeters, 0)} m²`,
          `Polygon count: ${formatDiagnosticMetric(fragment.polygonCount)}`,
          `Disconnected pieces: ${formatDiagnosticMetric(fragment.disconnectedPieces)}`,
          `Distance from focus: ${distance}`,
        ].join('\n');
      })
    : ['No fragments returned for this feature id.'];

  const unionSummaryLines = [
    `Total fragments: ${fragmentRecords.length}`,
    `Unique tiles: ${selectedTiles.size}`,
    `Total polygons: ${formatDiagnosticMetric(resolution?.polygonCount)}`,
    `Disconnected polygons: ${formatDiagnosticMetric(resolution?.disconnectedPieces)}`,
    `Union bounding box: ${formatBounds(aggregateBounds)}`,
    `Width: ${span ? formatMeters(span.widthMeters) : 'n/a'}`,
    `Height: ${span ? formatMeters(span.heightMeters) : 'n/a'}`,
    `Maximum fragment separation: ${maxSeparationMeters ? formatMeters(maxSeparationMeters) : 'n/a'}`,
  ];

  const duplicateIdEntries = duplicateSummaries.map((entry) => ({
    featureId: entry.featureId,
    count: entry.fragmentCount,
  }));
  const matchingRawFeatures = allFeatures.filter((feature) => {
    if (feature.id === undefined || feature.id === null) return false;
    return String(feature.id) === selectedFeatureId;
  });
  const rawFeatureDumpLines = matchingRawFeatures.length
    ? matchingRawFeatures.flatMap((feature, index) => [
        ...buildRawFeatureDump(feature, index + 1),
        '',
      ])
    : ['No raw features matched this feature id in the loaded source window.'];

  return {
    selectedFeatureId,
    returnedFeatureCount: fragmentRecords.length,
    selectedTileCount: selectedTiles.size,
    selectedUniqueCentroids: countUniqueCentroids(fragmentRecords),
    loadedFeatureCount: allFeatures.length,
    loadedUniqueIdCount: countUniqueIds(allFeatures),
    duplicateIdEntries,
    rawFeatureDumpLines,
    fragmentLines,
    unionSummaryLines,
  };
};

type FeatureMetrics = {
  polygonCount: number;
  ringCount: number;
  vertexCount: number;
  geometryType: string;
  disconnectedPieces: DiagnosticMetric;
  metricsStatus: 'ready' | 'skipped';
};

const getBaseFeatureMetrics = (geometry: GeoJSON.Geometry | null | undefined): Omit<FeatureMetrics, 'disconnectedPieces' | 'metricsStatus'> => {
  const polygons = collectPolygons(geometry);
  const polygonCount = polygons.length;
  const ringCount = polygons.reduce((total, polygon) => total + polygon.length, 0);
  const vertexCount = polygons.reduce(
    (total, polygon) => total + polygon.reduce((polygonTotal, ring) => polygonTotal + ring.length, 0),
    0,
  );
  const geometryType =
    geometry?.type === 'Polygon'
      ? 'Polygon'
      : geometry?.type === 'MultiPolygon'
        ? 'MultiPolygon'
        : 'Unknown';

  return {
    polygonCount,
    ringCount,
    vertexCount,
    geometryType,
  };
};

const getFeatureMetrics = (geometry: GeoJSON.Geometry | null | undefined): FeatureMetrics => {
  const baseMetrics = getBaseFeatureMetrics(geometry);
  const polygons = collectPolygons(geometry);
  let disconnectedPieces: DiagnosticMetric = null;
  let metricsStatus: FeatureMetrics['metricsStatus'] = 'ready';
  if (polygons.length > MAX_CONNECTED_PIECE_DIAGNOSTIC_POLYGONS) {
    metricsStatus = 'skipped';
    logBuildingInspector('getFeatureMetrics:diagnostic skipped for aggregate geometry', {
      ...baseMetrics,
      maxPolygonCount: MAX_CONNECTED_PIECE_DIAGNOSTIC_POLYGONS,
    });
  } else {
    try {
      disconnectedPieces = countConnectedPieces(polygons);
    } catch (error) {
      metricsStatus = 'skipped';
      logBuildingInspector('getFeatureMetrics:diagnostic skipped', {
        ...baseMetrics,
        error,
      });
    }
  }

  return {
    ...baseMetrics,
    disconnectedPieces,
    metricsStatus,
  };
};

const getFragmentRecord = (feature: MapGeoJSONFeature): FragmentRecord | null => {
  if (!feature.geometry) return null;
  const metrics = getFeatureMetrics(feature.geometry);
  const centroid = getGeometryCenter(feature.geometry);
  return {
    featureId: feature.id === undefined || feature.id === null ? 'unknown' : String(feature.id),
    tile: getFeatureTile(feature),
    source: feature.source ?? null,
    sourceLayer: feature.sourceLayer ?? null,
    geometryType: feature.geometry.type,
    centroid,
    distanceFromTwistMeters: centroid
      ? haversineMeters({ lng: DEFAULT_TWIST_LNG, lat: DEFAULT_TWIST_LAT }, { lng: centroid[0], lat: centroid[1] })
      : null,
    bbox: getGeometryBBox(feature.geometry),
    areaMeters: getFootprintAreaMeters(feature.geometry),
    polygonCount: metrics.polygonCount,
    ringCount: metrics.ringCount,
    vertexCount: metrics.vertexCount,
    disconnectedPieces: metrics.disconnectedPieces,
  };
};

const buildDuplicateSummaries = (features: MapGeoJSONFeature[]): DuplicateSummary[] => {
  logBuildingInspector('buildDuplicateSummaries:enter', { featureCount: features.length });
  const grouped = new Map<string, MapGeoJSONFeature[]>();
  let iterations = 0;
  for (const feature of features) {
    iterations += 1;
    assertBuildingInspectorLoopLimit('buildDuplicateSummaries.featureLoop', iterations, {
      featureCount: features.length,
      groupedCount: grouped.size,
    });
    if (feature.id === undefined || feature.id === null) continue;
    const key = String(feature.id);
    const current = grouped.get(key) ?? [];
    current.push(feature);
    grouped.set(key, current);
  }

  const summaries = Array.from(grouped.entries())
    .filter(([, fragments]) => fragments.length > 1)
    .map(([featureId, fragments]) => {
      const geometry = buildMergedGeometry(fragments);
      const metrics = getFeatureMetrics(geometry);
      return {
        featureId,
        fragmentCount: fragments.length,
        disconnectedPieces: metrics.disconnectedPieces,
        tileSet: Array.from(new Set(fragments.map((fragment) => getFeatureTile(fragment)))).sort(),
      };
    })
    .sort((a, b) => b.fragmentCount - a.fragmentCount || a.featureId.localeCompare(b.featureId));
  logBuildingInspector('buildDuplicateSummaries:exit', {
    iterations,
    groupedCount: grouped.size,
    duplicateCount: summaries.length,
  });
  return summaries;
};

const scoreFragment = (fragment: MapGeoJSONFeature, focusPoint: { lng: number; lat: number }): number => {
  const geometry = fragment.geometry;
  if (!geometry) return Number.POSITIVE_INFINITY;
  const polygons = collectPolygons(geometry);
  const point: [number, number] = [focusPoint.lng, focusPoint.lat];
  for (const polygon of polygons) {
    if (pointInPolygon(point, polygon)) return 0;
  }
  const center = getGeometryCenter(geometry);
  if (!center) return Number.POSITIVE_INFINITY;
  return haversineMeters(focusPoint, { lng: center[0], lat: center[1] });
};

const choosePrimaryFragment = (
  fragments: MapGeoJSONFeature[],
  focusPoint: { lng: number; lat: number },
): MapGeoJSONFeature | null => {
  if (!fragments.length) return null;
  return [...fragments].sort((a, b) => {
    const scoreA = scoreFragment(a, focusPoint);
    const scoreB = scoreFragment(b, focusPoint);
    if (scoreA !== scoreB) return scoreA - scoreB;
    const areaA = getFootprintAreaMeters(a.geometry);
    const areaB = getFootprintAreaMeters(b.geometry);
    return areaB - areaA;
  })[0] ?? null;
};

const buildMergedGeometry = (
  fragments: MapGeoJSONFeature[],
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null => {
  const polygons: number[][][][] = [];
  for (const fragment of fragments) {
    polygons.push(...collectPolygons(fragment.geometry));
  }
  if (!polygons.length) return null;
  if (polygons.length === 1) {
    return {
      type: 'Polygon',
      coordinates: polygons[0],
    };
  }
  return {
    type: 'MultiPolygon',
    coordinates: polygons,
  };
};

const buildRawGeoJSON = (
  fragments: MapGeoJSONFeature[],
): GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>> => ({
  type: 'FeatureCollection',
  features: fragments
    .filter((fragment) => Boolean(fragment.geometry))
    .map((fragment) => ({
      type: 'Feature',
      id: fragment.id,
      properties: {
        ...(fragment.properties ?? {}),
        source: fragment.source ?? null,
        sourceLayer: fragment.sourceLayer ?? null,
      },
      geometry: fragment.geometry as GeoJSON.Geometry,
    })),
});

const buildResolution = (
  featureId: string,
  fragments: MapGeoJSONFeature[],
  focusPoint?: { lng: number; lat: number } | null,
): BuildingResolution | null => {
  logBuildingInspector('buildResolution:enter', {
    featureId,
    fragmentCount: fragments.length,
  });
  if (!fragments.length) {
    logBuildingInspector('buildResolution:exit empty fragments', { featureId });
    return null;
  }
  const fallbackCenter = getGeometryCenter(fragments[0]?.geometry);
  const primaryFragment = choosePrimaryFragment(
    fragments,
    focusPoint ?? (fallbackCenter
      ? { lng: fallbackCenter[0], lat: fallbackCenter[1] }
      : { lng: DEFAULT_TWIST_LNG, lat: DEFAULT_TWIST_LAT }),
  );
  if (!primaryFragment?.geometry) {
    logBuildingInspector('buildResolution:exit missing primary geometry', {
      featureId,
      fragmentCount: fragments.length,
      fragmentGeometryTypes: fragments.map((fragment) => fragment.geometry?.type ?? 'missing'),
    });
    return null;
  }
  logBuildingInspector('buildResolution:primary fragment', {
    featureId,
    primaryTile: getFeatureTile(primaryFragment),
    geometryType: primaryFragment.geometry.type,
    coordinateCount: getCoordinateCount(primaryFragment.geometry),
    source: primaryFragment.source ?? null,
    sourceLayer: primaryFragment.sourceLayer ?? null,
  });
  const geometry = primaryFragment.geometry.type === 'Polygon' || primaryFragment.geometry.type === 'MultiPolygon'
    ? primaryFragment.geometry
    : null;
  if (!geometry) {
    logBuildingInspector('buildResolution:exit unsupported geometry', {
      featureId,
      geometryType: primaryFragment.geometry.type,
    });
    return null;
  }
  const metrics = getBaseFeatureMetrics(geometry);
  const extractedPolygons = collectPolygons(geometry);
  logBuildingInspector('buildResolution:geometry extraction', {
    featureId,
    geometryType: geometry.type,
    coordinateCount: getCoordinateCount(geometry),
    extractedPolygonCount: extractedPolygons.length,
    polygonCount: metrics.polygonCount,
    ringCount: metrics.ringCount,
    vertexCount: metrics.vertexCount,
    disconnectedPieces: 'skipped before render',
  });
  const result = {
    featureId,
    source: primaryFragment.source ?? null,
    sourceLayer: primaryFragment.sourceLayer ?? null,
    fragments: [primaryFragment],
    duplicateGroups: [],
    primaryTile: getFeatureTile(primaryFragment),
    rawGeoJSON: buildRawGeoJSON([primaryFragment]),
    geometry,
    bbox: getGeometryBBox(geometry),
    polygonCount: metrics.polygonCount,
    ringCount: metrics.ringCount,
    vertexCount: metrics.vertexCount,
    fragmentCount: fragments.length,
    disconnectedPieces: null,
    metricsStatus: 'skipped' as const,
  };
  logBuildingInspector('buildResolution:exit', {
    featureId,
    fragmentCount: fragments.length,
    geometryType: geometry.type,
    polygonCount: metrics.polygonCount,
    ringCount: metrics.ringCount,
    vertexCount: metrics.vertexCount,
    disconnectedPieces: null,
    metricsStatus: 'skipped',
  });
  return result;
};

const buildResolutionFromWorkspace = (
  seedFeatureId: string,
  workspace: WorkspaceGeometryResult,
  fragments: MapGeoJSONFeature[],
): BuildingResolution | null => {
  if (!workspace.geometry) return null;
  const metrics = getBaseFeatureMetrics(workspace.geometry);
  const includesOsOpenMapLocal = workspace.providerFeatureIds.some((providerFeatureId) =>
    providerFeatureId.startsWith(OS_OPENMAP_LOCAL_FEATURE_ID_PREFIX)
  );
  return {
    featureId: `workspace:${seedFeatureId}`,
    source: includesOsOpenMapLocal ? OS_OPENMAP_LOCAL_SOURCE : 'OpenFreeMap',
    sourceLayer: SOURCE_LAYER,
    fragments,
    duplicateGroups: [],
    primaryTile: fragments[0] ? getFeatureTile(fragments[0]) : 'workspace',
    rawGeoJSON: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        id: `workspace:${seedFeatureId}`,
        properties: {
          seedProviderFeatureId: seedFeatureId,
          providerFeatureIds: workspace.providerFeatureIds,
          radiusMeters: workspace.radiusMeters,
          workspacePolygonCount: workspace.polygons.length,
          workspaceBuildingCount: workspace.buildings.length,
        },
        geometry: workspace.geometry,
      }],
    },
    geometry: workspace.geometry,
    bbox: getGeometryBBox(workspace.geometry),
    polygonCount: metrics.polygonCount,
    ringCount: metrics.ringCount,
    vertexCount: metrics.vertexCount,
    fragmentCount: workspace.polygons.length,
    disconnectedPieces: null,
    metricsStatus: 'skipped',
  };
};

const buildResolutionFromAsset = (asset: BuildingAsset): BuildingResolution => {
  const metrics = getBaseFeatureMetrics(asset.geometry);
  return {
    featureId: asset.id,
    source: 'SwingSphere Building Asset',
    sourceLayer: null,
    fragments: [],
    duplicateGroups: [],
    primaryTile: 'saved asset',
    rawGeoJSON: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        id: asset.id,
        properties: {
          listingId: asset.listingId,
          providerSource: asset.provider.source,
          providerFeatureIds: asset.provider.featureIds,
          createdAt: asset.capture.createdAt,
          updatedAt: asset.capture.updatedAt,
          version: asset.version,
        },
        geometry: asset.geometry,
      }],
    },
    geometry: asset.geometry,
    bbox: getGeometryBBox(asset.geometry),
    polygonCount: metrics.polygonCount,
    ringCount: metrics.ringCount,
    vertexCount: metrics.vertexCount,
    fragmentCount: 1,
    disconnectedPieces: null,
    metricsStatus: 'skipped',
  };
};

const buildGeometryRender = (geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null): RenderedPolygon[] => {
  if (!geometry) return [];
  const polygons = collectPolygons(geometry);
  if (!polygons.length) return [];

  const bounds = getGeometryBBox(geometry);
  if (!bounds) return [];

  const [minLng, minLat, maxLng, maxLat] = bounds;
  const width = Math.max(maxLng - minLng, 1e-9);
  const height = Math.max(maxLat - minLat, 1e-9);
  const scale = Math.min(
    (VIEWBOX_SIZE - VIEWBOX_PADDING * 2) / width,
    (VIEWBOX_SIZE - VIEWBOX_PADDING * 2) / height,
  );
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  const offsetX = (VIEWBOX_SIZE - drawnWidth) / 2;
  const offsetY = (VIEWBOX_SIZE - drawnHeight) / 2;
  const project = (coordinate: [number, number]) => [
    offsetX + (coordinate[0] - minLng) * scale,
    VIEWBOX_SIZE - offsetY - (coordinate[1] - minLat) * scale,
  ];

  const palette = ['#ff4b4b', '#ff9c4a', '#58d7ff', '#9c7cff', '#55d6a9', '#ffd166'];

  return polygons.map((polygon, index) => {
    const path = polygon
      .filter((ring) => ring.length >= 2)
      .map((ring) => {
        const coords = ring
          .map((coordinate, coordinateIndex) => {
            const [x, y] = project([coordinate[0], coordinate[1]]);
            return `${coordinateIndex === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
          })
          .join(' ');
        return `${coords} Z`;
      })
      .join(' ');

    const color = palette[index % palette.length];
    return {
      d: path,
      fill: color,
      stroke: color,
    };
  });
};

const stripClosingPoint = (ring: Array<[number, number]>): Array<[number, number]> => {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    return ring.slice(0, -1);
  }
  return ring;
};

const ringToShapePoints = (ring: Array<[number, number]>): THREE.Vector2[] =>
  stripClosingPoint(ring)
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]))
    .map((point) => new THREE.Vector2(point[0], point[1]));

const buildExtrudedPolygonGeometry = (record: PolygonRecord): THREE.ExtrudeGeometry | null => {
  const [outerRing, ...holes] = record.localRings;
  if (!outerRing || outerRing.length < 3) {
    logBuildingInspector('buildExtrudedPolygonGeometry:exit invalid outer ring', {
      polygonIndex: record.polygonIndex,
      localRingCount: record.localRings.length,
      outerRingLength: outerRing?.length ?? 0,
      ringCount: record.ringCount,
      vertexCount: record.vertexCount,
    });
    return null;
  }

  let contour = ringToShapePoints(outerRing);
  if (contour.length < 3) {
    logBuildingInspector('buildExtrudedPolygonGeometry:exit invalid contour', {
      polygonIndex: record.polygonIndex,
      outerRingLength: outerRing.length,
      contourLength: contour.length,
      ringCount: record.ringCount,
      vertexCount: record.vertexCount,
    });
    return null;
  }
  if (!THREE.ShapeUtils.isClockWise(contour)) {
    contour = [...contour].reverse();
  }

  const shape = new THREE.Shape(contour);
  for (const hole of holes) {
    let holePoints = ringToShapePoints(hole);
    if (holePoints.length < 3) continue;
    if (THREE.ShapeUtils.isClockWise(holePoints)) {
      holePoints = [...holePoints].reverse();
    }
    shape.holes.push(new THREE.Path(holePoints));
  }

  const extrusionHeight = record.renderHeightMeters && record.renderHeightMeters > 0
    ? record.renderHeightMeters
    : EXTRUDE_HEIGHT_METERS;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: extrusionHeight,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
  return geometry;
};

const buildPolygonSceneBounds = (records: PolygonRecord[]): THREE.Box3 | null => {
  const bounds = new THREE.Box3();
  let hasPoint = false;
  for (const record of records) {
    for (const ring of record.localRings) {
      for (const [x, z] of stripClosingPoint(ring)) {
        bounds.expandByPoint(new THREE.Vector3(x, record.renderHeightMeters ?? EXTRUDE_HEIGHT_METERS, -z));
        bounds.expandByPoint(new THREE.Vector3(x, 0, -z));
        hasPoint = true;
      }
    }
  }
  return hasPoint ? bounds : null;
};

const buildSelectionSummary = (records: PolygonRecord[]): SelectionSummary => {
  const indices = records.map((record) => record.polygonIndex).sort((a, b) => a - b);
  const displayIndices = indices.map((index) => index + 1);
  const areaMeters = records.reduce((total, record) => total + record.areaMeters, 0);
  const vertexCount = records.reduce((total, record) => total + record.vertexCount, 0);
  const ringCount = records.reduce((total, record) => total + record.ringCount, 0);
  const bbox = buildAggregateBounds(records);
  const renderHeights = records.map((record) => record.renderHeightMeters);
  const maxRenderHeightMeters = maxMetric(renderHeights);
  const avgRenderHeightMeters = averageMetric(renderHeights);
  const geoJson = records.length
    ? {
        type: 'Feature' as const,
        id: records.length === 1 ? displayIndices[0] : `selection-${displayIndices.join('-')}`,
        properties: {
          selected_polygon_count: records.length,
          polygon_indices: displayIndices,
          polygon_indices_zero_based: indices,
          area_meters: areaMeters,
          ring_count: ringCount,
          vertex_count: vertexCount,
          max_render_height: maxRenderHeightMeters,
          avg_render_height: avgRenderHeightMeters,
        },
        geometry: records.length === 1
          ? records[0].geometry
          : {
              type: 'MultiPolygon' as const,
              coordinates: records.map((record) => record.geometry.coordinates),
            },
      }
    : null;

  return {
    count: records.length,
    indices,
    areaMeters,
    bbox,
    vertexCount,
    ringCount,
    maxRenderHeightMeters,
    avgRenderHeightMeters,
    geoJson,
  };
};

const exportGeoJSONFeature = (feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>>, fileName: string): void => {
  const blob = new Blob([stringifyGeoJSON(feature)], { type: 'application/geo+json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const disposeSceneMeshEntries = (entries: SceneMeshEntry[]): void => {
  for (const entry of entries) {
    entry.edges.dispose();
    entry.material.dispose();
    entry.outlineMaterial.dispose();
    entry.mesh.geometry.dispose();
  }
};

const disposeSceneGroup = (group: THREE.Group | null): void => {
  if (!group) return;
  group.removeFromParent();
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    const disposeMaterial = (item: THREE.Material) => {
      const mapped = item as THREE.MeshBasicMaterial;
      mapped.map?.dispose?.();
      item.dispose();
    };
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else if (material) disposeMaterial(material);
  });
};

const applySceneMeshStyles = (
  entries: SceneMeshEntry[],
  hoveredPolygonIndex: number | null,
  selectedPolygonIndices: Set<number>,
  suggestedPolygonIndices: Set<number>,
  isolateSelected: boolean,
): void => {
  for (const entry of entries) {
    const hasSelection = selectedPolygonIndices.size > 0;
    const isSelected = selectedPolygonIndices.has(entry.record.polygonIndex);
    const isHovered = entry.record.polygonIndex === hoveredPolygonIndex;
    const isSuggested = suggestedPolygonIndices.has(entry.record.polygonIndex);
    const isGenerated = isGeneratedBuildingFeatureId(entry.record.providerFeatureId);
    const isDimmed = isolateSelected && hasSelection && !isSelected;
    const baseColor = new THREE.Color(
      isSelected
        ? '#37d97a'
        : (isHovered || isSuggested) && !isDimmed
          ? '#f1c35a'
          : isGenerated
            ? '#35d6f4'
            : ['#5cc8ff', '#8b7dff', '#55d6a9', '#ff8c4a', '#ff5f6d', '#9ee493'][entry.record.polygonIndex % 6],
    );
    entry.material.color.copy(baseColor);
    entry.material.emissive.set(isSelected ? '#10301c' : (isHovered || isSuggested) && !isDimmed ? '#231c08' : '#000000');
    entry.material.opacity = isDimmed ? 0.08 : isSelected ? 0.95 : isHovered ? 0.9 : isSuggested ? 0.88 : 0.82;
    entry.mesh.visible = !isolateSelected || !hasSelection || isSelected;
    entry.material.needsUpdate = true;

    entry.outline.visible = !isDimmed && (isHovered || isSelected || isSuggested);
    entry.outlineMaterial.color.set(isSelected ? '#7dff99' : isSuggested ? '#f1c35a' : '#ffffff');
    entry.outlineMaterial.opacity = isSelected ? 0.95 : isSuggested ? 0.8 : 0.45;
    entry.outlineMaterial.needsUpdate = true;
  }
};

const frameSceneBounds = (
  bounds: THREE.Box3,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
): void => {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 1);
  const distance = maxDimension * 1.8;
  controls.target.copy(center);
  camera.position.set(center.x + distance, center.y + distance * 0.8, center.z + distance);
  camera.near = Math.max(0.1, maxDimension / 100);
  camera.far = Math.max(1000, maxDimension * 20);
  camera.updateProjectionMatrix();
  controls.minDistance = Math.max(2, maxDimension * 0.2);
  controls.maxDistance = Math.max(50, maxDimension * 12);
  controls.update();
};

const buildMeshEntriesBounds = (entries: SceneMeshEntry[]): THREE.Box3 | null => {
  const bounds = new THREE.Box3();
  let hasMesh = false;
  for (const entry of entries) {
    bounds.expandByObject(entry.mesh);
    hasMesh = true;
  }
  return hasMesh ? bounds : null;
};

type BuildingInspectorPageProps = {
  embedded?: boolean;
  listings?: Listing[];
  venues?: VenueData[];
  organizations?: OrganizationData[];
  relationships?: OrganizationVenueRelationship[];
  buildingAssets?: BuildingAsset[];
  onBuildingAssetSaved?: (asset: BuildingAsset, listing: Listing | null) => void;
  onListingLocationSaved?: (listing: Listing) => void;
  onVenueLocationSaved?: (venue: VenueData) => void;
};

const BuildingInspectorPage: React.FC<BuildingInspectorPageProps> = ({
  embedded = false,
  listings: listingsProp,
  venues: venuesProp,
  organizations: organizationsProp,
  relationships: relationshipsProp,
  buildingAssets: buildingAssetsProp,
  onBuildingAssetSaved,
  onListingLocationSaved,
  onVenueLocationSaved,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const sceneContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapReferenceMarkerRef = useRef<maplibregl.Marker | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const referenceGroupRef = useRef<THREE.Group | null>(null);
  const venueMarkerGroupRef = useRef<THREE.Group | null>(null);
  const streetFloorGroupRef = useRef<THREE.Group | null>(null);
  const compassNeedleRef = useRef<HTMLSpanElement | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const meshEntriesRef = useRef<SceneMeshEntry[]>([]);
  const referenceMeshEntriesRef = useRef<SceneMeshEntry[]>([]);
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pendingSelectAllRef = useRef(false);
  const addressIntelligenceRunRef = useRef(0);
  const venueLoadAbortRef = useRef<AbortController | null>(null);
  const featureIdInputRef = useRef(DEFAULT_FEATURE_ID);
  const [featureIdInput, setFeatureIdInput] = useState(DEFAULT_FEATURE_ID);
  const [resolution, setResolution] = useState<BuildingResolution | null>(null);
  const venueLoadRunRef = useRef(0);
  const [showAdvancedSidebar, setShowAdvancedSidebar] = useState(false);
  useEffect(() => () => {
    venueLoadRunRef.current += 1;
    addressIntelligenceRunRef.current += 1;
    venueLoadAbortRef.current?.abort(new Error('Building Inspector unmounted.'));
  }, []);
  const [fragmentRecords, setFragmentRecords] = useState<FragmentRecord[]>([]);
  const [duplicateSummaries, setDuplicateSummaries] = useState<DuplicateSummary[]>([]);
  const [loadedFeatureCount, setLoadedFeatureCount] = useState(0);
  const [loadedUniqueIdCount, setLoadedUniqueIdCount] = useState(0);
  const [forensicReport, setForensicReport] = useState<ForensicReport | null>(null);
  const [status, setStatus] = useState('Ready. Load geometry to inspect the selected feature id.');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<string | null>(null);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [hoveredPolygonIndex, setHoveredPolygonIndex] = useState<number | null>(null);
  const [selectedPolygonIndices, setSelectedPolygonIndices] = useState<number[]>([]);
  const [suggestedPolygonIndices, setSuggestedPolygonIndices] = useState<number[]>([]);
  const [isolateSelected, setIsolateSelected] = useState(false);
  const [showVenueMarker, setShowVenueMarker] = useState(true);
  const [showNearbyBuildings, setShowNearbyBuildings] = useState(true);
  const [showStreetFloor, setShowStreetFloor] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [buildingSourceMode, setBuildingSourceMode] = useState<BuildingSourceMode>('auto');
  const [loadedBuildingSourceLabel, setLoadedBuildingSourceLabel] = useState('Not loaded');
  const [generatedBuildingCandidate, setGeneratedBuildingCandidate] = useState<GeneratedBuildingCandidate | null>(null);
  const [streetReferenceSnapshot, setStreetReferenceSnapshot] = useState<StreetReferenceSnapshot | null>(null);
  const [streetReferenceStatus, setStreetReferenceStatus] = useState('Map ready');
  const [selectedBuildingAddress, setSelectedBuildingAddress] = useState<SelectedBuildingAddressState>({
    status: 'idle',
    primary: null,
    secondary: null,
  });
  const [addressIntelligence, setAddressIntelligence] = useState<BuildingAddressIntelligenceState>({
    status: 'idle',
    message: 'Address intelligence has not run yet.',
    searchRadiusMeters: null,
    bestCandidate: null,
    checkedCandidateCount: 0,
  });
  const [showFullProviderTileCache, setShowFullProviderTileCache] = useState(false);
  const [referencePolygonRecords, setReferencePolygonRecords] = useState<PolygonRecord[]>([]);
  const [providerCandidates, setProviderCandidates] = useState<ProviderCandidate[]>([]);
  const [fullProviderTileCandidates, setFullProviderTileCandidates] = useState<ProviderCandidate[]>([]);
  const [workspaceBuildings, setWorkspaceBuildings] = useState<WorkspaceBuildingGroup[]>([]);
  const [workspaceProviderFeatureIds, setWorkspaceProviderFeatureIds] = useState<string[]>([]);
  const [workspacePolygonMetadata, setWorkspacePolygonMetadata] = useState<PolygonRecordMetadata[]>([]);
  const [selectedLandmarkId, setSelectedLandmarkId] = useState(LANDMARK_TESTS[0]?.id ?? '');
  const [landmarkValidation, setLandmarkValidation] = useState<LandmarkTestRecord | null>(null);
  const [landmarkListing, setLandmarkListing] = useState<Listing | null>(null);
  const [showRawProviderGeometry, setShowRawProviderGeometry] = useState(false);
  const [resolverState, setResolverState] = useState<ResolverState>(() => createResolverState());
  const [hoveredCandidateId, setHoveredCandidateId] = useState<string | null>(null);
  const [pendingCandidateId, setPendingCandidateId] = useState<string | null>(null);
  const [hiddenProviderFeatureIds, setHiddenProviderFeatureIds] = useState<string[]>([]);
  const [soloProviderFeatureId, setSoloProviderFeatureId] = useState<string | null>(null);
  const [providerWasManuallyCorrected, setProviderWasManuallyCorrected] = useState(false);
  const [venueSearch, setVenueSearch] = useState('');
  const [assetFilter, setAssetFilter] = useState<BuildingAssetFilter>('missing');
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [resolvedVenueFeatureId, setResolvedVenueFeatureId] = useState<string | null>(null);
  const [savedGeometrySignature, setSavedGeometrySignature] = useState('');
  const [assetStatusMessage, setAssetStatusMessage] = useState<string | null>(null);
  const [localListings, setLocalListings] = useState<Listing[]>([]);
  const [localVenues, setLocalVenues] = useState<VenueData[]>([]);
  const [localBuildingAssets, setLocalBuildingAssets] = useState<BuildingAsset[]>([]);
  const [buildingEvidenceRecords, setBuildingEvidenceRecords] = useState<BuildingVerificationEvidenceRecord[]>([]);
  const [buildingAssetHistory, setBuildingAssetHistory] = useState<BuildingAssetHistoryEvent[]>([]);
  const listings = listingsProp ?? localListings;
  const venues = venuesProp ?? localVenues;
  const organizations = organizationsProp ?? EMPTY_ORGANIZATIONS;
  const relationships = relationshipsProp ?? EMPTY_RELATIONSHIPS;
  const buildingAssets = buildingAssetsProp ?? localBuildingAssets;
  const semv2Collections = useMemo(
    () => ({ listings, venues, organizations, relationships }),
    [listings, organizations, relationships, venues],
  );

  const selectedVenue = useMemo(
    () => listings.find((listing) => listing.id === selectedVenueId) ??
      (landmarkListing?.id === selectedVenueId ? landmarkListing : null),
    [landmarkListing, listings, selectedVenueId],
  );
  const selectedVenueAsset = useMemo(
    () => getBuildingAssetForListing(selectedVenue, buildingAssets, venues, listings, organizations, relationships),
    [buildingAssets, listings, organizations, relationships, selectedVenue, venues],
  );
  const selectedVenueAssetOwnerListing = useMemo(
    () => selectedVenueAsset
      ? listings.find((listing) => listing.id === selectedVenueAsset.listingId) ?? null
      : null,
    [listings, selectedVenueAsset],
  );
  const selectedVenueAssetIsShared = Boolean(
    selectedVenue &&
    selectedVenueAsset &&
    selectedVenueAsset.listingId !== selectedVenue.id,
  );
  const selectedVenueCoords = useMemo(
    () => selectedVenue ? getListingCanonicalCoords(selectedVenue, semv2Collections) : null,
    [selectedVenue, semv2Collections],
  );
  const selectedVenueLat = selectedVenueCoords?.lat ?? null;
  const selectedVenueLng = selectedVenueCoords?.lng ?? null;
  const selectedStoredBuildingVerification = useMemo(
    () => selectedVenue ? getBuildingVerificationForListing(selectedVenue, semv2Collections) : undefined,
    [selectedVenue, semv2Collections],
  );
  const selectedBuildingEvidence = useMemo(() => selectedVenue
    ? buildingEvidenceRecords
      .filter((record) => {
        if (record.listingId !== selectedVenue.id) return false;
        if (!selectedVenueCoords) return true;
        return haversineMeters(
          selectedVenueCoords,
          { lat: record.canonicalCoordinate.lat, lng: record.canonicalCoordinate.lng },
        ) <= 5;
      })
      .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt))[0] ?? null
    : null,
  [buildingEvidenceRecords, selectedVenue, selectedVenueCoords]);
  const listingLocationAudits = useMemo(
    () => new Map(listings.map((listing) => [listing.id, getBuildingLocationAudit(listing, semv2Collections)])),
    [listings, semv2Collections],
  );
  const selectedVenueLocationAudit = selectedVenue
    ? listingLocationAudits.get(selectedVenue.id) ?? getBuildingLocationAudit(selectedVenue, semv2Collections)
    : null;
  const selectedVenueAssetPinDriftMeters = useMemo(() => {
    if (!selectedVenueAsset || !selectedVenueCoords) return null;
    return pointToBuildingDistanceMeters(
      { lat: selectedVenueCoords.lat, lng: selectedVenueCoords.lng },
      selectedVenueAsset.geometry,
    );
  }, [selectedVenueAsset, selectedVenueCoords]);
  const selectedVenueAssetCentroidDistanceMeters = useMemo(() => {
    if (!selectedVenueAsset || !selectedVenueCoords) return null;
    const center = getGeometryCenter(selectedVenueAsset.geometry);
    return center ? haversineMeters(selectedVenueCoords, { lat: center[1], lng: center[0] }) : null;
  }, [selectedVenueAsset, selectedVenueCoords]);
  const filteredVenues = useMemo(() => {
    const query = venueSearch.trim().toLowerCase();
    return listings
      .filter((listing) => {
        const hasAsset = Boolean(getBuildingAssetForListing(listing, buildingAssets, venues, listings, organizations, relationships));
        const locationAudit = listingLocationAudits.get(listing.id) ?? getBuildingLocationAudit(listing, semv2Collections);
        if (assetFilter === 'missing' && (hasAsset || locationAudit.state !== 'ready')) return false;
        if (assetFilter === 'location' && (hasAsset || locationAudit.state === 'ready')) return false;
        if (assetFilter === 'has' && !hasAsset) return false;
        if (!query) return true;
        const haystack = [
          listing.name,
          listing.type,
          listing.location,
          getListingCityLabel(listing, semv2Collections),
          getListingPhysicalAddress(listing, semv2Collections).addressLine1,
          getListingPhysicalAddress(listing, semv2Collections).postalCode,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assetFilter, buildingAssets, listingLocationAudits, listings, organizations, relationships, semv2Collections, venueSearch, venues]);
  const venueStats = useMemo(() => {
    let withAssets = 0;
    let missing = 0;
    let locationReview = 0;
    listings.forEach((listing) => {
      const hasAsset = Boolean(getBuildingAssetForListing(listing, buildingAssets, venues, listings, organizations, relationships));
      if (hasAsset) {
        withAssets += 1;
        return;
      }
      const audit = listingLocationAudits.get(listing.id) ?? getBuildingLocationAudit(listing, semv2Collections);
      if (audit.state === 'ready') missing += 1;
      else locationReview += 1;
    });
    return {
      total: listings.length,
      missing,
      locationReview,
      withAssets,
    };
  }, [buildingAssets, listingLocationAudits, listings, organizations, relationships, semv2Collections, venues]);

  const polygonRecords = useMemo(() => {
    const geometry = resolution?.geometry ?? null;
    const records = buildPolygonRecords(geometry, getGeometryCenter(geometry), workspacePolygonMetadata);
    logBuildingInspector('polygonRecords:memo exit', {
      hasResolution: Boolean(resolution),
      featureId: resolution?.featureId ?? null,
      geometryType: geometry?.type ?? null,
      coordinateCount: getCoordinateCount(geometry),
      recordCount: records.length,
    });
    return records;
  }, [resolution, workspacePolygonMetadata]);
  const sceneOrigin = useMemo(
    () => getGeometryCenter(resolution?.geometry ?? null),
    [resolution?.geometry],
  );
  const rawGeoJSONText = useMemo(
    () => (resolution ? stringifyGeoJSON(resolution.rawGeoJSON) : ''),
    [resolution],
  );
  const selectedPolygonIndexSet = useMemo(
    () => new Set(selectedPolygonIndices),
    [selectedPolygonIndices],
  );
  const suggestedPolygonIndexSet = useMemo(
    () => new Set(suggestedPolygonIndices),
    [suggestedPolygonIndices],
  );
  const selectedPolygonRecords = useMemo(
    () => selectedPolygonIndices.map((index) => polygonRecords[index]).filter((record): record is PolygonRecord => Boolean(record)),
    [polygonRecords, selectedPolygonIndices],
  );
  const generatedPolygonIndices = useMemo(
    () => polygonRecords
      .filter((record) => isGeneratedBuildingFeatureId(record.providerFeatureId))
      .map((record) => record.polygonIndex),
    [polygonRecords],
  );
  const selectedSummary = useMemo(
    () => buildSelectionSummary(selectedPolygonRecords),
    [selectedPolygonRecords],
  );
  const selectedPolygonGeoJSONText = useMemo(
    () => (selectedSummary.geoJson ? stringifyGeoJSON(selectedSummary.geoJson) : ''),
    [selectedSummary.geoJson],
  );
  const selectedGeometrySignature = useMemo(
    () => getGeometrySignature(selectedSummary.geoJson?.geometry),
    [selectedSummary.geoJson?.geometry],
  );

  useEffect(() => {
    if (!selectedPolygonRecords.length) {
      setSelectedBuildingAddress({ status: 'idle', primary: null, secondary: null });
      return;
    }
    if (selectedPolygonRecords.length > 1) {
      setSelectedBuildingAddress({
        status: 'multiple',
        primary: `${selectedPolygonRecords.length} footprints selected`,
        secondary: 'Select one building footprint to look up its individual street address.',
      });
      return;
    }

    const center = getGeometryCenter(selectedPolygonRecords[0].geometry);
    if (!center) {
      setSelectedBuildingAddress({ status: 'missing', primary: 'Address unavailable', secondary: 'The selected footprint has no usable geographic center.' });
      return;
    }

    const [lng, lat] = center;
    const cacheKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    const cached = selectedBuildingAddressCache.get(cacheKey);
    if (cached) {
      setSelectedBuildingAddress({ status: 'resolved', ...cached });
      return;
    }

    let cancelled = false;
    setSelectedBuildingAddress({ status: 'loading', primary: 'Looking up address…', secondary: null });

    const timer = window.setTimeout(async () => {
      if (!selectedVenue) return;
      const addressResolution = await reverseGeocodeBuildingAddressDetailed(lat, lng, {
        listingId: selectedVenue.id,
        footprintFingerprint: geometryFingerprint(selectedPolygonRecords[0].geometry),
      });
      if (cancelled) return;
      if (addressResolution.status === 'provider_error') {
        setSelectedBuildingAddress({
          status: 'error',
          primary: 'Address provider unavailable',
          secondary: addressResolution.errorCode === 'timeout' ? 'The lookup timed out. Retry later.' : 'The footprint remains available for review.',
        });
        return;
      }
      const formatted = addressResolution.status === 'resolved' ? addressResolution.address : null;
      if (!formatted?.primary && !formatted?.secondary) {
        setSelectedBuildingAddress({
          status: 'missing',
          primary: 'No mapped street address',
          secondary: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        });
        return;
      }
      const display = { primary: formatted.primary, secondary: formatted.secondary };
      selectedBuildingAddressCache.set(cacheKey, display);
      setSelectedBuildingAddress({ status: 'resolved', ...display });
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedGeometrySignature, selectedPolygonRecords, selectedVenue]);

  const saveStateLabel = useMemo(() => {
    if (selectedSummary.count > 0) {
      return selectedGeometrySignature && selectedGeometrySignature === savedGeometrySignature ? 'Saved' : 'Unsaved Changes';
    }
    return selectedVenueAsset ? 'Saved asset available' : 'Never Saved';
  }, [savedGeometrySignature, selectedGeometrySignature, selectedSummary.count, selectedVenueAsset]);
  const selectedMetrics = useMemo(
    () => getBaseFeatureMetrics(resolution?.geometry ?? null),
    [resolution?.geometry],
  );
  const currentEditableFeatureId = resolution?.source === 'SwingSphere Building Asset'
    ? resolvedVenueFeatureId ?? selectedVenueAsset?.provider.featureIds[0] ?? resolution?.featureId ?? null
    : resolution?.featureId ?? null;
  const hiddenProviderFeatureIdSet = useMemo(
    () => new Set(hiddenProviderFeatureIds),
    [hiddenProviderFeatureIds],
  );
  const displayedProviderCandidates = showFullProviderTileCache ? fullProviderTileCandidates : providerCandidates;
  const focusedProviderFeature = useMemo(
    () => displayedProviderCandidates.find((candidate) => candidate.featureId === pendingCandidateId) ?? null,
    [displayedProviderCandidates, pendingCandidateId],
  );
  const promotedCandidate = useMemo(
    () => focusedProviderFeature && focusedProviderFeature.featureId !== currentEditableFeatureId ? focusedProviderFeature : null,
    [currentEditableFeatureId, focusedProviderFeature],
  );
  const providerNeighborhoodRows = useMemo(
    () => displayedProviderCandidates.map((candidate, index) => {
      const isEditable = candidate.featureId === currentEditableFeatureId;
      const isHidden = hiddenProviderFeatureIdSet.has(candidate.featureId);
      const isSolo = soloProviderFeatureId === candidate.featureId;
      const isVisible = soloProviderFeatureId ? isSolo : !isHidden;
      return {
        candidate,
        label: getProviderFeatureLabel(index),
        isEditable,
        isHidden,
        isSolo,
        isVisible,
      };
    }),
    [currentEditableFeatureId, displayedProviderCandidates, hiddenProviderFeatureIdSet, soloProviderFeatureId],
  );
  const providerNeighborhoodSummary = useMemo(() => {
    const visible = providerNeighborhoodRows.filter((row) => row.isVisible).length;
    const editable = providerNeighborhoodRows.find((row) => row.isEditable);
    return {
      providerTile: resolverState.providerTileFeatureCount || fullProviderTileCandidates.length,
      neighborhoodCache: providerCandidates.length,
      loaded: providerNeighborhoodRows.length,
      visible,
      hidden: providerNeighborhoodRows.length - visible,
      editableLabel: editable?.label ?? 'n/a',
    };
  }, [fullProviderTileCandidates.length, providerCandidates.length, providerNeighborhoodRows, resolverState.providerTileFeatureCount]);
  const workspaceSummary = useMemo(() => ({
    radiusMeters: resolverState.radiusMeters || DEFAULT_NEIGHBORHOOD_RADIUS_METERS,
    providerTile: resolverState.providerTileFeatureCount || loadedFeatureCount,
    buildings: workspaceBuildings.length,
    polygons: polygonRecords.length,
    visible: isolateSelected && selectedSummary.count ? selectedSummary.count : polygonRecords.length,
    selected: selectedSummary.count,
    providerFeatureIds: workspaceProviderFeatureIds,
  }), [
    isolateSelected,
    loadedFeatureCount,
    polygonRecords.length,
    resolverState.providerTileFeatureCount,
    resolverState.radiusMeters,
    selectedSummary.count,
    workspaceBuildings.length,
    workspaceProviderFeatureIds,
  ]);
  const fragmentSummary = useMemo(() => {
    const bounds = buildAggregateBounds(fragmentRecords);
    const span = getGeometrySpanMeters(bounds);
    return {
      bounds,
      span,
      uniqueTiles: new Set(fragmentRecords.map((fragment) => fragment.tile).filter((tile) => tile !== 'n/a')).size,
      uniqueCentroids: countUniqueCentroids(fragmentRecords),
    };
  }, [fragmentRecords]);

  useEffect(() => {
    featureIdInputRef.current = featureIdInput;
  }, [featureIdInput]);

  useEffect(() => {
    let cancelled = false;
    const evidencePromise = adminFetchJson<BuildingVerificationEvidenceRecord[]>('/api/admin/building-verification/evidence', { cache: 'no-store' })
      .catch(() => []);
    if (embedded || listingsProp || buildingAssetsProp) {
      evidencePromise.then((nextEvidence) => {
        if (!cancelled) setBuildingEvidenceRecords(Array.isArray(nextEvidence) ? nextEvidence : []);
      });
      return () => { cancelled = true; };
    }
    Promise.all([
      api.getListings(),
      api.getVenues(),
      api.getAdminBuildingAssets(),
      evidencePromise,
    ])
      .then(([nextListings, nextVenues, nextAssets, nextEvidence]) => {
        if (cancelled) return;
        setLocalListings(nextListings);
        setLocalVenues(nextVenues);
        setLocalBuildingAssets(nextAssets);
        setBuildingEvidenceRecords(Array.isArray(nextEvidence) ? nextEvidence : []);
      })
      .catch(() => {
        if (cancelled) return;
        setLocalListings([]);
        setLocalVenues([]);
        setLocalBuildingAssets([]);
        setBuildingEvidenceRecords([]);
      });
    return () => { cancelled = true; };
  }, [buildingAssetsProp, embedded, listingsProp]);

  useEffect(() => {
    const ownerListingId = selectedVenueAsset?.listingId ?? selectedVenue?.id ?? null;
    if (!ownerListingId || ownerListingId.startsWith('landmark-test-')) {
      setBuildingAssetHistory([]);
      return;
    }
    let cancelled = false;
    api.getBuildingAssetHistory(ownerListingId)
      .then((events) => { if (!cancelled) setBuildingAssetHistory(events); })
      .catch(() => { if (!cancelled) setBuildingAssetHistory([]); });
    return () => { cancelled = true; };
  }, [selectedVenue?.id, selectedVenueAsset?.listingId, selectedVenueAsset?.capture.updatedAt]);

  useEffect(() => {
    const candidateIds = new Set(providerCandidates.map((candidate) => candidate.featureId));
    setHiddenProviderFeatureIds((current) => current.filter((featureId) => candidateIds.has(featureId)));
    setSoloProviderFeatureId((current) => (current && candidateIds.has(current) ? current : null));
    setPendingCandidateId((current) => (current && candidateIds.has(current) ? current : null));
  }, [providerCandidates]);

  useEffect(() => {
    if (!showFullProviderTileCache || fullProviderTileCandidates.length || !resolution?.geometry) return;
    const map = mapRef.current;
    if (!map) return;
    const allFeatures = map.querySourceFeatures(getBuildingsSourceId(), {
      sourceLayer: SOURCE_LAYER,
    }) as MapGeoJSONFeature[];
    const fullCache = buildScopedNeighborhoodCache(
      allFeatures,
      resolution.geometry,
      resolution.featureId,
      Number.POSITIVE_INFINITY,
    );
    setFullProviderTileCandidates(fullCache.candidates);
    setResolverState((current) => ({
      ...current,
      providerTileFeatureCount: fullCache.providerTileFeatureCount,
    }));
  }, [fullProviderTileCandidates.length, resolution?.featureId, resolution?.geometry, showFullProviderTileCache]);

  const frameSelected = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || !selectedPolygonRecords.length) return;
    const selectedEntries = meshEntriesRef.current.filter((entry) => selectedPolygonIndexSet.has(entry.record.polygonIndex));
    const bounds = buildMeshEntriesBounds(selectedEntries);
    if (!bounds) return;
    frameSceneBounds(bounds, camera, controls);
  };

  const frameVenue = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || !selectedVenueCoords || !sceneOrigin) return;
    const local = toLocalMeters(
      [selectedVenueCoords.lng, selectedVenueCoords.lat],
      { lng: sceneOrigin[0], lat: sceneOrigin[1] },
    );
    const target = new THREE.Vector3(local.x, 0, -local.y);
    controls.target.copy(target);
    camera.position.set(target.x + 70, target.y + 60, target.z + 70);
    camera.near = 0.1;
    camera.far = 3000;
    camera.updateProjectionMatrix();
    controls.update();
  };

  const frameProviderFeature = (candidate: ProviderCandidate) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || !sceneOrigin) return;
    const records = buildPolygonRecords(candidate.geometry, sceneOrigin);
    const bounds = buildPolygonSceneBounds(records);
    if (!bounds) return;
    frameSceneBounds(bounds, camera, controls);
    setPendingCandidateId(candidate.featureId);
    setHoveredCandidateId(candidate.featureId);
  };

  const toggleProviderFeatureVisibility = (featureId: string) => {
    setHiddenProviderFeatureIds((current) => {
      if (current.includes(featureId)) return current.filter((item) => item !== featureId);
      return [...current, featureId];
    });
  };

  const toggleProviderFeatureSolo = (featureId: string) => {
    setSoloProviderFeatureId((current) => (current === featureId ? null : featureId));
    setPendingCandidateId(featureId);
    setHoveredCandidateId(featureId);
  };

  useEffect(() => {
    const container = sceneContainerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050608');

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
    camera.position.set(28, 24, 28);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth || 1, container.clientHeight || 1, false);
    renderer.setClearColor(0x050608, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 1.9);
    directional.position.set(24, 42, 18);
    scene.add(directional);

    const fillLight = new THREE.DirectionalLight(0x8ca2ff, 0.55);
    fillLight.position.set(-22, 16, -18);
    scene.add(fillLight);

    const grid = new THREE.GridHelper(1600, 80, 0x4a4d55, 0x23262d);
    grid.position.y = 0;
    scene.add(grid);
    gridRef.current = grid;

    const axes = new THREE.AxesHelper(14);
    scene.add(axes);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.7;
    controls.panSpeed = 0.7;
    controls.zoomSpeed = 0.85;
    controls.target.set(0, 0, 0);

    const resize = () => {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const onPointerMove = (event: PointerEvent) => {
      const entries = meshEntriesRef.current;
      const candidateEntries = referenceMeshEntriesRef.current;
      if (!entries.length && !candidateEntries.length) {
        setHoveredPolygonIndex(null);
        setHoveredCandidateId(null);
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const intersections = raycasterRef.current.intersectObjects(entries.map((entry) => entry.mesh), false);
      const nextHovered = intersections.length
        ? (intersections[0]?.object.userData?.polygonIndex as number | undefined) ?? null
        : null;
      setHoveredPolygonIndex((current) => (current === nextHovered ? current : nextHovered));
      if (nextHovered !== null) {
        setHoveredCandidateId(null);
        return;
      }
      const candidateIntersections = raycasterRef.current.intersectObjects(candidateEntries.map((entry) => entry.mesh), false);
      const nextCandidate = candidateIntersections.length
        ? (candidateIntersections[0]?.object.userData?.providerFeatureId as string | undefined) ?? null
        : null;
      setHoveredCandidateId((current) => (current === nextCandidate ? current : nextCandidate));
    };

    const onPointerLeave = () => {
      setHoveredPolygonIndex(null);
      setHoveredCandidateId(null);
    };

    const onClick = (event: MouseEvent) => {
      const entries = meshEntriesRef.current;
      const candidateEntries = referenceMeshEntriesRef.current;
      if (!entries.length && !candidateEntries.length) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const intersections = raycasterRef.current.intersectObjects(entries.map((entry) => entry.mesh), false);
      const polygonIndex = intersections[0]?.object.userData?.polygonIndex;
      if (typeof polygonIndex === 'number') {
        const shouldToggle = event.shiftKey || event.ctrlKey || event.metaKey;
        setSuggestedPolygonIndices([]);
        setSelectedPolygonIndices((current) => {
          if (!shouldToggle) return [polygonIndex];
          if (current.includes(polygonIndex)) {
            return current.filter((index) => index !== polygonIndex);
          }
          return [...current, polygonIndex].sort((a, b) => a - b);
        });
        setHoveredPolygonIndex(polygonIndex);
        setPendingCandidateId(null);
        return;
      }

      const candidateIntersections = raycasterRef.current.intersectObjects(candidateEntries.map((entry) => entry.mesh), false);
      const providerFeatureId = candidateIntersections[0]?.object.userData?.providerFeatureId;
      if (typeof providerFeatureId === 'string') {
        setPendingCandidateId(providerFeatureId);
        setHoveredCandidateId(providerFeatureId);
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('click', onClick);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const animate = () => {
      animationFrameRef.current = window.requestAnimationFrame(animate);
      controls.update();
      const compassNeedle = compassNeedleRef.current;
      if (compassNeedle) {
        const targetProjected = controls.target.clone().project(camera);
        const northProjected = controls.target.clone().add(new THREE.Vector3(0, 0, -100)).project(camera);
        const dx = northProjected.x - targetProjected.x;
        const dy = northProjected.y - targetProjected.y;
        if (Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) > 1e-6) {
          const angleDegrees = THREE.MathUtils.radToDeg(Math.atan2(dx, dy));
          compassNeedle.style.transform = `rotate(${angleDegrees.toFixed(1)}deg)`;
        }
      }
      const marker = venueMarkerGroupRef.current;
      if (marker?.visible) {
        const pulse = marker.getObjectByName('venue-pulse-ring') as THREE.Mesh | undefined;
        const pulseMaterial = pulse?.material as THREE.MeshBasicMaterial | undefined;
        if (pulse && pulseMaterial) {
          const phase = (Math.sin(performance.now() * 0.003) + 1) / 2;
          const scale = 1 + phase * 1.15;
          pulse.scale.set(scale, scale, scale);
          pulseMaterial.opacity = 0.18 + (1 - phase) * 0.52;
        }
      }
      renderer.render(scene, camera);
    };
    animate();

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    resizeObserverRef.current = resizeObserver;

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      disposeSceneMeshEntries(meshEntriesRef.current);
      disposeSceneMeshEntries(referenceMeshEntriesRef.current);
      meshEntriesRef.current = [];
      referenceMeshEntriesRef.current = [];
      modelGroupRef.current?.removeFromParent();
      referenceGroupRef.current?.removeFromParent();
      venueMarkerGroupRef.current?.removeFromParent();
      disposeSceneGroup(streetFloorGroupRef.current);
      modelGroupRef.current = null;
      referenceGroupRef.current = null;
      venueMarkerGroupRef.current = null;
      streetFloorGroupRef.current = null;
      gridRef.current = null;
      renderer.dispose();
      container.removeChild(renderer.domElement);
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      resizeObserverRef.current = null;
    };
  }, []);

  useEffect(() => {
    logBuildingInspector('renderEditableGeometry:enter', {
      polygonRecordCount: polygonRecords.length,
      selectedPolygonCount: selectedPolygonIndices.length,
    });
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const renderer = rendererRef.current;
    if (!scene || !camera || !controls || !renderer) {
      logBuildingInspector('renderEditableGeometry:exit missing scene refs');
      return;
    }

    disposeSceneMeshEntries(meshEntriesRef.current);
    meshEntriesRef.current = [];
    if (modelGroupRef.current) {
      scene.remove(modelGroupRef.current);
      modelGroupRef.current = null;
    }

    if (!polygonRecords.length) {
      controls.target.set(0, 0, 0);
      camera.position.set(28, 24, 28);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      setSelectedPolygonIndices([]);
      setHoveredPolygonIndex(null);
      if (resolution) {
        setResolverState((current) => ({
          ...updateResolverStep(current, 'Geometry', 'Editable mesh built', 'failed', 'No polygon records available'),
          failure: 'EMPTY_GEOMETRY',
          suggestions: resolverFailureSuggestions('EMPTY_GEOMETRY'),
        }));
      }
      logBuildingInspector('renderEditableGeometry:exit empty');
      return;
    }

    const group = new THREE.Group();
    const entries: SceneMeshEntry[] = [];
    let renderIterations = 0;
    let skippedMeshCount = 0;

    polygonRecords.forEach((record) => {
      renderIterations += 1;
      assertBuildingInspectorLoopLimit('renderEditableGeometry.recordLoop', renderIterations, {
        polygonRecordCount: polygonRecords.length,
      });
      const geometry = buildExtrudedPolygonGeometry(record);
      if (!geometry) {
        skippedMeshCount += 1;
        logBuildingInspector('renderEditableGeometry:mesh skipped', {
          polygonIndex: record.polygonIndex,
          ringCount: record.ringCount,
          vertexCount: record.vertexCount,
          localRingCount: record.localRings.length,
          localVertexCount: record.localRings.reduce((total, ring) => total + ring.length, 0),
        });
        return;
      }

      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#5cc8ff'),
        roughness: 0.7,
        metalness: 0.05,
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
      });
      const outlineMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.45,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.userData = {
        polygonIndex: record.polygonIndex,
        record,
      };

      const edges = new THREE.EdgesGeometry(geometry, 18);
      const outline = new THREE.LineSegments(edges, outlineMaterial);
      outline.visible = false;
      outline.renderOrder = 2;
      mesh.add(outline);

      entries.push({ record, mesh, outline, edges, material, outlineMaterial });
      group.add(mesh);
    });

    scene.add(group);
    modelGroupRef.current = group;
    meshEntriesRef.current = entries;
    group.visible = currentEditableFeatureId
      ? soloProviderFeatureId
        ? soloProviderFeatureId === currentEditableFeatureId
        : !hiddenProviderFeatureIdSet.has(currentEditableFeatureId)
      : true;
    applySceneMeshStyles(entries, hoveredPolygonIndex, selectedPolygonIndexSet, suggestedPolygonIndexSet, isolateSelected);

    const bounds = buildMeshEntriesBounds(entries);
    if (bounds) {
      frameSceneBounds(bounds, camera, controls);
    } else {
      controls.target.set(0, 0, 0);
    }

    renderer.render(scene, camera);
    setSelectedPolygonIndices([]);
    setHoveredPolygonIndex(null);
    logBuildingInspector('renderEditableGeometry:exit', {
      polygonRecordCount: polygonRecords.length,
      meshEntryCount: entries.length,
      renderIterations,
      skippedMeshCount,
      groupVisible: group.visible,
      currentEditableFeatureId,
      soloProviderFeatureId,
      hiddenProviderFeatureCount: hiddenProviderFeatureIdSet.size,
    });
    setResolverState((current) => ({
      ...updateResolverStep(
        current,
        'Geometry',
        'Editable mesh built',
        entries.length ? 'success' : 'failed',
        entries.length ? `${entries.length} editable mesh${entries.length === 1 ? '' : 'es'}` : 'No editable meshes created',
      ),
      failure: entries.length ? current.failure : 'INVALID_GEOMETRY',
      suggestions: entries.length ? current.suggestions : resolverFailureSuggestions('INVALID_GEOMETRY'),
    }));
  }, [polygonRecords]);

  useEffect(() => {
    applySceneMeshStyles(meshEntriesRef.current, hoveredPolygonIndex, selectedPolygonIndexSet, suggestedPolygonIndexSet, isolateSelected);
  }, [hoveredPolygonIndex, selectedPolygonIndexSet, suggestedPolygonIndexSet, isolateSelected]);

  useEffect(() => {
    if (!modelGroupRef.current || !currentEditableFeatureId) return;
    modelGroupRef.current.visible = soloProviderFeatureId
      ? soloProviderFeatureId === currentEditableFeatureId
      : !hiddenProviderFeatureIdSet.has(currentEditableFeatureId);
  }, [currentEditableFeatureId, hiddenProviderFeatureIdSet, soloProviderFeatureId]);

  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.visible = showGrid;
    }
  }, [showGrid]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const previousGroup = streetFloorGroupRef.current;
    if (previousGroup) {
      disposeSceneGroup(previousGroup);
      streetFloorGroupRef.current = null;
    }

    if (!showStreetFloor || !streetReferenceSnapshot || !sceneOrigin) return;

    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(
      streetReferenceSnapshot.dataUrl,
      (texture) => {
        if (cancelled) {
          texture.dispose();
          return;
        }

        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, rendererRef.current?.capabilities.getMaxAnisotropy() ?? 1);
        texture.needsUpdate = true;

        const [west, south, east, north] = streetReferenceSnapshot.bounds;
        const origin = { lng: sceneOrigin[0], lat: sceneOrigin[1] };
        const southWest = toLocalMeters([west, south], origin);
        const northEast = toLocalMeters([east, north], origin);
        const center = toLocalMeters([(west + east) / 2, (south + north) / 2], origin);
        const widthMeters = Math.max(1, Math.abs(northEast.x - southWest.x));
        const depthMeters = Math.max(1, Math.abs(northEast.y - southWest.y));

        const geometry = new THREE.PlaneGeometry(widthMeters, depthMeters);
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        });
        const plane = new THREE.Mesh(geometry, material);
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(center.x, -0.12, -center.y);
        plane.renderOrder = -10;

        const outline = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.28 }),
        );
        outline.rotation.x = -Math.PI / 2;
        outline.position.set(center.x, -0.1, -center.y);
        outline.renderOrder = -9;

        const group = new THREE.Group();
        group.name = 'building-inspector-street-plane';
        group.add(plane, outline);
        scene.add(group);
        streetFloorGroupRef.current = group;
        setStreetReferenceStatus('Ready');
      },
      undefined,
      () => {
        if (!cancelled) setStreetReferenceStatus('Map only');
      },
    );

    return () => {
      cancelled = true;
      const currentGroup = streetFloorGroupRef.current;
      if (!currentGroup) return;
      disposeSceneGroup(currentGroup);
      streetFloorGroupRef.current = null;
    };
  }, [sceneOrigin, showStreetFloor, streetReferenceSnapshot]);

  useEffect(() => {
    logBuildingInspector('renderReferenceGeometry:enter', {
      providerCandidateCount: displayedProviderCandidates.length,
      currentEditableFeatureId,
    });
    const scene = sceneRef.current;
    if (!scene) {
      logBuildingInspector('renderReferenceGeometry:exit missing scene');
      return;
    }

    disposeSceneMeshEntries(referenceMeshEntriesRef.current);
    referenceMeshEntriesRef.current = [];
    if (referenceGroupRef.current) {
      scene.remove(referenceGroupRef.current);
      referenceGroupRef.current = null;
    }
    const renderCandidates = showRawProviderGeometry ? displayedProviderCandidates.filter((candidate) => {
      if (candidate.featureId === currentEditableFeatureId) return false;
      if (soloProviderFeatureId) return candidate.featureId === soloProviderFeatureId;
      return !hiddenProviderFeatureIdSet.has(candidate.featureId);
    }) : [];
    if (!renderCandidates.length || !sceneOrigin) {
      logBuildingInspector('renderReferenceGeometry:exit empty', {
        renderCandidateCount: renderCandidates.length,
        hasSceneOrigin: Boolean(sceneOrigin),
      });
      return;
    }

    const group = new THREE.Group();
    const entries: SceneMeshEntry[] = [];
    let candidateIterations = 0;
    let polygonIterations = 0;
    renderCandidates.forEach((candidate) => {
      candidateIterations += 1;
      assertBuildingInspectorLoopLimit('renderReferenceGeometry.candidateLoop', candidateIterations, {
        renderCandidateCount: renderCandidates.length,
      });
      const candidatePolygonCount = collectPolygons(candidate.geometry).length;
      const records = buildPolygonRecords(
        candidate.geometry,
        sceneOrigin,
        Array.from({ length: candidatePolygonCount }, () => ({
          renderHeightMeters: getProviderRenderHeight(candidate.feature),
          renderMinHeightMeters: getProviderRenderMinHeight(candidate.feature),
          providerFeatureId: candidate.featureId,
        })),
      );
      records.forEach((record) => {
        polygonIterations += 1;
        assertBuildingInspectorLoopLimit('renderReferenceGeometry.polygonLoop', polygonIterations, {
          renderCandidateCount: renderCandidates.length,
          candidateIterations,
        });
        const geometry = buildExtrudedPolygonGeometry(record);
        if (!geometry) return;
        const isHovered = hoveredCandidateId === candidate.featureId;
        const isPending = pendingCandidateId === candidate.featureId;
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(isPending ? '#f1c35a' : isHovered ? '#c7d0dc' : '#8b929c'),
        roughness: 0.9,
        metalness: 0,
        transparent: true,
        opacity: isPending ? 0.42 : isHovered ? 0.28 : 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const outlineMaterial = new THREE.LineBasicMaterial({
        color: isPending ? 0xf1c35a : isHovered ? 0xffffff : 0x9aa1aa,
        transparent: true,
        opacity: isPending ? 0.82 : isHovered ? 0.55 : 0.28,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.userData = { referenceOnly: true, providerFeatureId: candidate.featureId };

      const edges = new THREE.EdgesGeometry(geometry, 18);
      const outline = new THREE.LineSegments(edges, outlineMaterial);
      outline.visible = true;
      mesh.add(outline);
      entries.push({ record, mesh, outline, edges, material, outlineMaterial });
      group.add(mesh);
      });
    });

    group.visible = showNearbyBuildings && showRawProviderGeometry;
    scene.add(group);
    referenceGroupRef.current = group;
    referenceMeshEntriesRef.current = entries;
    logBuildingInspector('renderReferenceGeometry:exit', {
      renderCandidateCount: renderCandidates.length,
      candidateIterations,
      polygonIterations,
      meshEntryCount: entries.length,
    });
  }, [
    currentEditableFeatureId,
    hiddenProviderFeatureIdSet,
    hoveredCandidateId,
    pendingCandidateId,
    displayedProviderCandidates,
    sceneOrigin,
    showRawProviderGeometry,
    soloProviderFeatureId,
  ]);

  useEffect(() => {
    if (referenceGroupRef.current) {
      referenceGroupRef.current.visible = showNearbyBuildings && showRawProviderGeometry;
    }
  }, [showNearbyBuildings, showRawProviderGeometry]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (venueMarkerGroupRef.current) {
      scene.remove(venueMarkerGroupRef.current);
      venueMarkerGroupRef.current.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose?.();
      });
      venueMarkerGroupRef.current = null;
    }
    if (selectedVenueLat === null || selectedVenueLng === null || !sceneOrigin) return;

    const local = toLocalMeters(
      [selectedVenueLng, selectedVenueLat],
      { lng: sceneOrigin[0], lat: sceneOrigin[1] },
    );
    const group = new THREE.Group();
    group.position.set(local.x, 0.18, -local.y);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(28, 0.65, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xff4d5e, transparent: true, opacity: 0.95 }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const pulseRing = new THREE.Mesh(
      new THREE.TorusGeometry(38, 0.45, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0xff4d5e, transparent: true, opacity: 0.65, depthWrite: false }),
    );
    pulseRing.name = 'venue-pulse-ring';
    pulseRing.rotation.x = Math.PI / 2;
    group.add(pulseRing);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 90, 12),
      new THREE.MeshBasicMaterial({ color: 0xff4d5e, transparent: true, opacity: 0.72, depthWrite: false }),
    );
    beacon.position.y = 45;
    group.add(beacon);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(4.5, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.98, depthWrite: false }),
    );
    cap.position.y = 92;
    group.add(cap);

    group.visible = showVenueMarker;
    scene.add(group);
    venueMarkerGroupRef.current = group;
  }, [sceneOrigin, selectedVenueLat, selectedVenueLng]);

  useEffect(() => {
    if (venueMarkerGroupRef.current) {
      venueMarkerGroupRef.current.visible = showVenueMarker;
    }
  }, [showVenueMarker]);

  useEffect(() => {
    if (!pendingSelectAllRef.current || !polygonRecords.length) return;
    pendingSelectAllRef.current = false;
    setSelectedPolygonIndices(polygonRecords.map((record) => record.polygonIndex));
  }, [polygonRecords]);

  const persistBuildingVerification = async (
    listing: Listing,
    verification: BuildingVerificationMeta,
  ): Promise<void> => {
    if (BUILDING_VERIFICATION_MODE === 'shadow') {
      logBuildingInspector('building verification shadow result', {
        listingId: listing.id,
        outcome: verification.outcome ?? verification.status,
        confidence: verification.confidence,
        footprintFingerprint: verification.footprintFingerprint ?? null,
      });
      return;
    }
    const resolvedVenue = getVenueForListing(listing, semv2Collections);
    if (
      listing.id.startsWith('landmark-test-') ||
      isApproximateLocation(listing) ||
      resolvedVenue?.visibility === 'private' ||
      resolvedVenue?.visibility === 'public_approximate'
    ) return;
    const persistedVenue = resolvedVenue
      ? venues.find((candidate) => candidate.id === resolvedVenue.id) ?? null
      : null;

    try {
      if (persistedVenue) {
        const savedVenue = await api.saveVenue({
          ...persistedVenue,
          locationMeta: {
            status: persistedVenue.locationMeta?.status ?? 'manual',
            ...persistedVenue.locationMeta,
            buildingVerification: verification,
          },
        });
        setLocalVenues((current) => current.map((item) => (item.id === savedVenue.id ? savedVenue : item)));
        onVenueLocationSaved?.(savedVenue);
        return;
      }

      const savedListing = await api.saveListing({
        ...listing,
        locationMeta: {
          status: listing.locationMeta?.status ?? 'manual',
          ...listing.locationMeta,
          buildingVerification: verification,
        },
      });
      setLocalListings((current) => current.map((item) => (item.id === savedListing.id ? savedListing : item)));
      onListingLocationSaved?.(savedListing);
    } catch (error) {
      setAssetStatusMessage(`Address intelligence ran, but its admin review status could not be saved: ${(error as Error).message || 'unknown error'}`);
    }
  };

  const persistShadowEvidence = async (args: {
    listing: Listing;
    classification: ReturnType<typeof classifyBuildingAddressCandidates>;
    candidates: BuildingAddressIntelligenceCandidate[];
    workspace: WorkspaceGeometryResult;
    center: { lng: number; lat: number };
  }): Promise<void> => {
    const { listing, classification, candidates, workspace, center } = args;
    const resolvedVenue = getVenueForListing(listing, semv2Collections);
    const locationMeta = resolvedVenue?.locationMeta ?? listing.locationMeta;
    const addressStatuses = candidates.map((candidate) => candidate.reverseAddressStatus);
    const providerStatus = !workspace.buildings.length
      ? 'no_building_footprints'
      : addressStatuses.length > 0 && addressStatuses.every((status) => status === 'provider_error')
        ? 'provider_unavailable'
        : addressStatuses.length > 0 && addressStatuses.every((status) => status === 'no_address')
          ? 'footprints_address_unresolved'
          : 'completed';
    const toEvidenceCandidate = (
      ranked: ReturnType<typeof evaluateBuildingVerification>['candidate'],
    ): BuildingCandidateEvidence | null => {
      if (!ranked) return null;
      const raw = candidates.find((candidate) => candidate.buildingId === ranked.fingerprint);
      return {
        footprintFingerprint: ranked.fingerprint,
        providerFeatureIds: ranked.providerFeatureIds,
        providerSource: ranked.source ?? raw?.providerSource ?? 'OpenFreeMap',
        reverseAddressStatus: raw?.reverseAddressStatus === 'provider_error'
          ? 'provider_error'
          : raw?.reverseAddressStatus === 'resolved' ? 'resolved' : 'no_address',
        candidateAddress: ranked.addressLabel ?? null,
        addressComponents: ranked.address ?? null,
        pinIntersects: ranked.pinIntersects,
        minimumPinToFootprintMeters: ranked.pinToFootprintMeters,
        pinToCentroidMeters: ranked.pinToCentroidMeters,
        score: ranked.score,
        confidence: ranked.confidence,
        reasons: ranked.reasons,
      };
    };
    const providerOutcome = providerStatus === 'provider_unavailable'
      ? 'provider_unavailable'
      : providerStatus === 'footprints_address_unresolved'
        ? 'footprints_address_unresolved'
        : classification.outcome;
    const inputSnapshot = createBuildingVerificationInputSnapshot(listing, semv2Collections);
    const evaluatedAt = new Date().toISOString();
    const evidence: BuildingVerificationEvidenceRecord = {
      version: 1,
      listingId: listing.id,
      venueId: resolvedVenue?.id ?? null,
      inputSnapshotHash: inputSnapshot?.hash,
      verificationEngineVersion: BUILDING_PERSISTENCE_POLICY_VERSION,
      runId: `${listing.id}:${evaluatedAt}`,
      listingName: listing.name,
      normalizedAddress: inputSnapshot?.normalizedAddress ?? normalizeAddressText(formatListingAddress(listing, semv2Collections)),
      canonicalCoordinate: center,
      coordinateProvenance: locationMeta?.geocoderSource ?? locationMeta?.source ?? (locationMeta?.manualAdjustment ? 'manual-adjustment' : null),
      coordinateConfidence: locationMeta?.confidence ?? null,
      evaluatedAt,
      providerSnapshot: {
        source: loadedBuildingSourceLabel || 'OpenFreeMap',
        status: providerStatus,
        searchRadiusMeters: workspace.radiusMeters,
        tileFeatureCount: workspace.providerTileFeatureCount,
        individualFootprintCount: workspace.buildings.length,
      },
      outcome: providerOutcome,
      autoAccept: providerStatus === 'completed' && classification.autoAccept,
      autoAcceptMethod: providerStatus === 'completed' ? classification.autoAcceptMethod : null,
      bestCandidate: toEvidenceCandidate(classification.decision.candidate),
      runnerUp: toEvidenceCandidate(classification.decision.runnerUp),
      scoreMargin: classification.scoreGap,
      acceptanceReasons: classification.autoAccept ? classification.decision.reasons : [],
      rejectionReasons: classification.autoAccept ? [] : classification.decision.reasons,
    };
    try {
      await adminFetchJson('/api/admin/building-verification/evidence/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidence }),
      });
      setBuildingEvidenceRecords((current) => [
        ...current.filter((record) => record.listingId !== evidence.listingId),
        evidence,
      ]);
    } catch (error) {
      setAssetStatusMessage(`Shadow evidence could not be recorded: ${(error as Error).message || 'unknown error'}`);
    }
  };

  const runAddressIntelligence = async (args: {
    listing: Listing;
    seedFeatureId: string;
    allFeatures: MapGeoJSONFeature[];
    initialWorkspace: WorkspaceGeometryResult;
    fragments: MapGeoJSONFeature[];
    center: { lng: number; lat: number };
    signal?: AbortSignal;
  }): Promise<void> => {
    const { listing, seedFeatureId, allFeatures, initialWorkspace, fragments, center, signal } = args;
    const runId = ++addressIntelligenceRunRef.current;
    const resolvedVenue = getVenueForListing(listing, semv2Collections);
    const isApproximateOrPrivate = isApproximateLocation(listing)
      || resolvedVenue?.visibility === 'private'
      || resolvedVenue?.visibility === 'public_approximate';
    const skipReason = isApproximateOrPrivate
      ? 'Approximate/private locations are intentionally excluded from building-address automation.'
      : !listingHasExactBuildingAddress(listing, semv2Collections)
        ? 'No exact street number is available, so the tool will not pretend it can confirm a building.'
        : null;

    if (skipReason) {
      if (runId !== addressIntelligenceRunRef.current) return;
      setAddressIntelligence({
        status: 'skipped',
        message: skipReason,
        searchRadiusMeters: null,
        bestCandidate: null,
        checkedCandidateCount: 0,
      });
      return;
    }

    let finalWorkspace = initialWorkspace;
    let finalCandidates: BuildingAddressIntelligenceCandidate[] = [];
    let classification = classifyBuildingAddressCandidates([], listing, semv2Collections);
    const radii = [
      initialWorkspace.radiusMeters,
      ...EXPANDED_NEIGHBORHOOD_RADII_METERS.filter((radius) => radius > initialWorkspace.radiusMeters),
    ];

    setAddressIntelligence({
      status: 'checking',
      message: `Checking nearby building addresses within ${initialWorkspace.radiusMeters}m…`,
      searchRadiusMeters: initialWorkspace.radiusMeters,
      bestCandidate: null,
      checkedCandidateCount: 0,
    });

    for (let radiusIndex = 0; radiusIndex < radii.length; radiusIndex += 1) {
      const radius = radii[radiusIndex];
      const workspace = radius === initialWorkspace.radiusMeters
        ? initialWorkspace
        : buildWorkspaceGeometryFromFeatures(allFeatures, center, radius);
      if (!workspace.geometry || !workspace.buildings.length) continue;
      finalWorkspace = workspace;
      if (runId !== addressIntelligenceRunRef.current) return;
      setAddressIntelligence((current) => ({
        ...current,
        status: 'checking',
        message: radius === initialWorkspace.radiusMeters
          ? `Comparing the listing address with nearby footprints within ${radius}m…`
          : `No confirmed match yet. Expanding the building search to ${radius}m…`,
        searchRadiusMeters: radius,
      }));

      const maxCandidates = radiusIndex === 0 ? 5 : radius <= 150 ? 8 : 12;
      finalCandidates = await rankWorkspaceAddressCandidates(
        listing,
        workspace,
        center,
        semv2Collections,
        maxCandidates,
        signal,
      );
      if (runId !== addressIntelligenceRunRef.current) return;
      classification = classifyBuildingAddressCandidates(finalCandidates, listing, semv2Collections);
      setAddressIntelligence({
        ...classification,
        searchRadiusMeters: radius,
        checkedCandidateCount: finalCandidates.length,
      });
      if (classification.status === 'confirmed') break;
    }

    if (runId !== addressIntelligenceRunRef.current) return;
    const workspaceWasExpanded = finalWorkspace.radiusMeters > initialWorkspace.radiusMeters;
    if (workspaceWasExpanded && finalWorkspace.geometry) {
      const expandedResolution = buildResolutionFromWorkspace(seedFeatureId, finalWorkspace, fragments);
      if (expandedResolution) setResolution(expandedResolution);
      setWorkspaceBuildings(finalWorkspace.buildings);
      setWorkspaceProviderFeatureIds(finalWorkspace.providerFeatureIds);
      setWorkspacePolygonMetadata(finalWorkspace.polygons.map((polygon) => ({
        renderHeightMeters: polygon.renderHeightMeters,
        renderMinHeightMeters: polygon.renderMinHeightMeters,
        providerFeatureId: polygon.providerFeatureId,
      })));
      setProviderCandidates(buildWorkspaceProviderCandidates(allFeatures, finalWorkspace, center));
      setResolverState((current) => ({
        ...updateResolverStep(current, 'Neighborhood', 'Expanded radius', 'success', `Address intelligence expanded the workspace to ${finalWorkspace.radiusMeters}m`),
        neighborhoodFeatureCount: finalWorkspace.polygons.length,
        radiusMeters: finalWorkspace.radiusMeters,
      }));
    }

    const bestCandidate = classification.bestCandidate;
    if (bestCandidate && classification.status === 'confirmed') {
      pendingSelectAllRef.current = false;
      setSuggestedPolygonIndices([]);
      setSelectedPolygonIndices(bestCandidate.polygonIndices);
      const bestFeatureId = bestCandidate.providerFeatureIds[0] ?? seedFeatureId;
      setResolvedVenueFeatureId(bestFeatureId);
      setFeatureIdInput(bestFeatureId);
      featureIdInputRef.current = bestFeatureId;
      setStatus(
        `Shadow verification selected ${bestCandidate.address?.primary ?? 'the matching building'} as a definitive candidate. No asset was written.`,
      );
    } else if (bestCandidate && classification.status === 'probable') {
      pendingSelectAllRef.current = false;
      setSelectedPolygonIndices([]);
      setSuggestedPolygonIndices(bestCandidate.polygonIndices);
      const bestFeatureId = bestCandidate.providerFeatureIds[0] ?? seedFeatureId;
      setResolvedVenueFeatureId(bestFeatureId);
      setFeatureIdInput(bestFeatureId);
      featureIdInputRef.current = bestFeatureId;
      setStatus(`Address intelligence highlighted the best nearby candidate in gold for review: ${bestCandidate.address?.primary ?? bestCandidate.buildingId}.`);
    } else if (classification.status === 'mismatch' || classification.status === 'unconfirmed') {
      const generatedPolygonIndices = finalWorkspace.polygons
        .map((polygon, index) => isGeneratedBuildingFeatureId(polygon.providerFeatureId) ? index : -1)
        .filter((index) => index >= 0);
      setSelectedPolygonIndices([]);
      setSuggestedPolygonIndices(generatedPolygonIndices);
      setStatus(generatedPolygonIndices.length
        ? `${classification.message} A SwingSphere-generated footprint estimate is highlighted in gold for visual review; it will never be auto-saved.`
        : `${classification.message} The record has been marked for building-location review in admin.`);
    }

    const verification: BuildingVerificationMeta = {
      status: classification.status,
      checkedAt: new Date().toISOString(),
      confidence: bestCandidate?.confidence ?? 0,
      listingAddress: formatListingAddress(listing, semv2Collections),
      candidateAddress: bestCandidate?.address?.primary ?? undefined,
      candidateSecondary: bestCandidate?.address?.secondary ?? undefined,
      distanceMeters: bestCandidate?.distanceMeters ?? undefined,
      pinIntersects: bestCandidate?.pinIntersects,
      searchRadiusMeters: finalWorkspace.radiusMeters,
      providerFeatureIds: bestCandidate?.providerFeatureIds,
      footprintFingerprint: bestCandidate?.buildingId,
      method: classification.autoAcceptMethod ?? 'human_review',
      outcome: classification.outcome,
      scoreGap: classification.scoreGap ?? undefined,
      notes: [
        ...(bestCandidate?.reasons ?? []),
        `checked ${finalCandidates.length} nearby building candidate${finalCandidates.length === 1 ? '' : 's'}`,
        workspaceWasExpanded ? `search expanded to ${finalWorkspace.radiusMeters}m` : `search stayed within ${finalWorkspace.radiusMeters}m`,
      ],
    };
    await persistBuildingVerification(listing, verification);
    await persistShadowEvidence({ listing, classification, candidates: finalCandidates, workspace: finalWorkspace, center });
  };

  const resolveFeature = async (
    featureIdOverride?: string,
    options: {
      useWorkspace?: boolean;
      workspaceCenter?: { lng: number; lat: number };
      intelligenceListing?: Listing;
      buildingSourceMode?: BuildingSourceMode;
      signal?: AbortSignal;
    } = {},
  ) => {
    const ownerRun = venueLoadRunRef.current;
    const isCurrentRun = () => ownerRun === venueLoadRunRef.current && !options.signal?.aborted;
    const startedAt = performance.now();
    const requestedBuildingSourceMode = options.buildingSourceMode ?? buildingSourceMode;
    const map = mapRef.current;
    const featureId = (featureIdOverride ?? featureIdInputRef.current).trim();
    logBuildingInspector('resolveFeature:enter', {
      featureId,
      hasMap: Boolean(map),
      hasOverride: Boolean(featureIdOverride),
    });
    if (!map) {
      setStatus('Map is not ready yet.');
      logBuildingInspector('resolveFeature:exit missing map', { featureId });
      return;
    }
    if (!featureId) {
      setStatus('Enter a feature id first.');
      logBuildingInspector('resolveFeature:exit missing feature id');
      return;
    }

    setIsLoading(true);
    setLoadingPhase(`Loading feature ${featureId}`);
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      if (!isCurrentRun()) return;
      const deadline = Date.now() + 8000;
      let allFeatures: MapGeoJSONFeature[] = [];
      let fragments: MapGeoJSONFeature[] = [];
      let workspace: WorkspaceGeometryResult | null = null;
      let scanIterations = 0;
      let neighborhoodFusionAttempted = false;
      let fusedFeatureCache: MapGeoJSONFeature[] | null = null;
      let neighborhoodSourceLabel = 'OSM · OpenFreeMap';
      let usedOsOpenMapLocalFallback = false;
      let usedSupplementalFallback = false;
      let supplementalAcceptedCount = 0;
      let neighborhoodFusionWarnings: string[] = [];
      let generatedCandidateForRun: GeneratedBuildingCandidate | null = null;

      while (Date.now() < deadline) {
        scanIterations += 1;
        assertBuildingInspectorLoopLimit('resolveFeature.scanLoop', scanIterations, {
          featureId,
          loadedFeatureCount: allFeatures.length,
          fragmentCount: fragments.length,
        });
        setLoadingPhase('Scanning source features');
        logBuildingInspector('querySourceFeatures:enter', {
          featureId,
          scanIterations,
          sourceId: getBuildingsSourceId(),
          sourceLayer: SOURCE_LAYER,
        });
        const openFreeMapFeatures = map.querySourceFeatures(getBuildingsSourceId(), {
          sourceLayer: SOURCE_LAYER,
        }) as MapGeoJSONFeature[];
        allFeatures = openFreeMapFeatures;
        const canUseNeighborhoodFusion = Boolean(
          options.useWorkspace &&
          options.workspaceCenter &&
          options.intelligenceListing &&
          listingHasExactBuildingAddress(options.intelligenceListing, semv2Collections) &&
          !isApproximateLocation(options.intelligenceListing)
        );
        const sourceReadyForFusion = requestedBuildingSourceMode === 'microsoft'
          || openFreeMapFeatures.length > 0
          || map.isSourceLoaded(getBuildingsSourceId())
          || scanIterations >= 3;
        if (canUseNeighborhoodFusion && requestedBuildingSourceMode !== 'openfreemap') {
          if (fusedFeatureCache) {
            allFeatures = fusedFeatureCache;
          } else if (sourceReadyForFusion && !neighborhoodFusionAttempted) {
            neighborhoodFusionAttempted = true;
            const fusionRadiusMeters = EXPANDED_NEIGHBORHOOD_RADII_METERS[EXPANDED_NEIGHBORHOOD_RADII_METERS.length - 1];
            setLoadingPhase(requestedBuildingSourceMode === 'microsoft'
              ? 'Loading Microsoft building footprints'
              : 'Checking fused building coverage');
            try {
              const fusion = await fuseBuildingNeighborhood({
                mode: requestedBuildingSourceMode,
                listingId: options.intelligenceListing.id,
                country: getListingPhysicalAddress(options.intelligenceListing, semv2Collections).country,
                center: options.workspaceCenter,
                radiusMeters: fusionRadiusMeters,
                primaryFeatures: openFreeMapFeatures,
                signal: options.signal,
                minimumContextFootprints: 6,
                loadOsAtPoint: (point, signal) => fetchOsOpenMapLocalBuildingAtPoint(point, {
                  renderHeightMeters: EXTRUDE_HEIGHT_METERS,
                  signal,
                }),
                loadSupplemental: async (signal) => {
                  const supplemental = await fetchSupplementalBuildingFootprints({
                    listingId: options.intelligenceListing!.id,
                    center: options.workspaceCenter!,
                    radiusMeters: fusionRadiusMeters,
                    maxFeatures: 900,
                    signal,
                  });
                  return {
                    features: supplemental.features,
                    provider: supplemental.provider,
                    truncated: supplemental.truncated,
                  };
                },
              });
              if (!isCurrentRun()) return;
              fusedFeatureCache = fusion.features.map((providerFeature) => ({
                ...providerFeature,
                state: {},
              } as unknown as MapGeoJSONFeature));
              allFeatures = fusedFeatureCache;
              neighborhoodSourceLabel = fusion.sourceLabel;
              usedOsOpenMapLocalFallback = fusion.usedOsOpenMapLocal;
              usedSupplementalFallback = fusion.usedSupplemental;
              supplementalAcceptedCount = fusion.supplementalStats?.accepted
                ?? (requestedBuildingSourceMode === 'microsoft' ? fusion.features.length : 0);
              neighborhoodFusionWarnings = fusion.warnings;
            } catch (error) {
              if (options.signal?.aborted) return;
              neighborhoodFusionWarnings = [error instanceof Error ? error.message : String(error)];
              allFeatures = requestedBuildingSourceMode === 'microsoft' ? [] : openFreeMapFeatures;
              neighborhoodSourceLabel = requestedBuildingSourceMode === 'microsoft'
                ? 'Microsoft ML · unavailable'
                : 'OSM · OpenFreeMap';
              logBuildingInspector('buildingNeighborhoodFusion:failed', { featureId, error });
            }
          } else if (!sourceReadyForFusion) {
            allFeatures = [];
          }
        } else if (requestedBuildingSourceMode === 'microsoft') {
          allFeatures = [];
          neighborhoodSourceLabel = 'Microsoft ML · unavailable for this listing';
        }

        if (
          requestedBuildingSourceMode === 'auto'
          && canUseNeighborhoodFusion
          && sourceReadyForFusion
          && neighborhoodFusionAttempted
          && options.intelligenceListing
          && options.workspaceCenter
          && !generatedCandidateForRun
        ) {
          const resolvedVenue = getVenueForListing(options.intelligenceListing, semv2Collections);
          const locationMeta = resolvedVenue?.locationMeta ?? options.intelligenceListing.locationMeta;
          const generated = createGeneratedBuildingCandidate({
            listingId: options.intelligenceListing.id,
            center: options.workspaceCenter,
            primaryFeatures: allFeatures,
            locationConfidence: locationMeta?.confidence,
            geocoderSource: locationMeta?.geocoderSource ?? locationMeta?.source,
            manuallyAdjusted: locationMeta?.manualAdjustment,
          });
          if (generated) {
            generatedCandidateForRun = generated;
            const generatedFeature = {
              ...generated.feature,
              state: {},
            } as unknown as MapGeoJSONFeature;
            allFeatures = [...allFeatures, generatedFeature];
            fusedFeatureCache = allFeatures;
            neighborhoodSourceLabel = `${neighborhoodSourceLabel} + SwingSphere estimate`;
            setGeneratedBuildingCandidate(generated);
            neighborhoodFusionWarnings = [
              ...neighborhoodFusionWarnings,
              'No sourced footprint intersected the authoritative venue pin; a SwingSphere reconstruction candidate was added for human review.',
            ];
          }
        }
        logBuildingInspector('querySourceFeatures:exit', {
          featureId,
          scanIterations,
          featureCount: allFeatures.length,
          openFreeMapFeatureCount: openFreeMapFeatures.length,
          requestedBuildingSourceMode,
        });
        let fragmentFilterIterations = 0;
        fragments = allFeatures.filter((feature) => {
          fragmentFilterIterations += 1;
          assertBuildingInspectorLoopLimit('resolveFeature.fragmentFilterLoop', fragmentFilterIterations, {
            featureId,
            featureCount: allFeatures.length,
          });
          if (feature.id === undefined || feature.id === null) return false;
          return String(feature.id) === featureId;
        });
        if (options.useWorkspace && options.workspaceCenter) {
          for (const radius of [DEFAULT_NEIGHBORHOOD_RADIUS_METERS, ...EXPANDED_NEIGHBORHOOD_RADII_METERS]) {
            const candidateWorkspace = buildWorkspaceGeometryFromFeatures(allFeatures, options.workspaceCenter, radius);
            if (candidateWorkspace.geometry) {
              workspace = candidateWorkspace;
              break;
            }
          }
        }
        logBuildingInspector('resolveFeature:fragment filter exit', {
          featureId,
          scanIterations,
          fragmentFilterIterations,
          fragmentCount: fragments.length,
          fragmentGeometryTypes: Array.from(new Set(fragments.map((fragment) => fragment.geometry?.type ?? 'missing'))),
          fragmentCoordinateCounts: fragments.map((fragment) => getCoordinateCount(fragment.geometry)),
          fragmentTiles: fragments.map((fragment) => getFeatureTile(fragment)),
        });
        if (fragments.length || workspace?.geometry) break;

        setLoadingPhase('Waiting for source tiles');
        await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
        if (!isCurrentRun()) return;
      }
      if (!isCurrentRun()) return;

      setLoadedBuildingSourceLabel(neighborhoodSourceLabel);
      if (neighborhoodFusionWarnings.length) {
        logBuildingInspector('buildingNeighborhoodFusion:warnings', {
          featureId,
          warnings: neighborhoodFusionWarnings,
        });
      }
      setLoadingPhase(`Filtering feature ${featureId}`);
      logBuildingInspector('resolveFeature:located feature summary', {
        featureId,
        located: fragments.length > 0,
        fragmentCount: fragments.length,
        fragmentGeometryTypes: Array.from(new Set(fragments.map((fragment) => fragment.geometry?.type ?? 'missing'))),
        fragmentMetrics: fragments.map((fragment, index) => {
          const metrics = getBaseFeatureMetrics(fragment.geometry);
          return {
            index,
            id: fragment.id === undefined || fragment.id === null ? null : String(fragment.id),
            tile: getFeatureTile(fragment),
            geometryType: fragment.geometry?.type ?? null,
            coordinateCount: getCoordinateCount(fragment.geometry),
            polygonCount: metrics.polygonCount,
            ringCount: metrics.ringCount,
            vertexCount: metrics.vertexCount,
          };
        }),
      });
      setLoadingPhase('Building geometry');
      const next = options.useWorkspace ? null : buildResolution(featureId, fragments, options.workspaceCenter);
      const editableResolution = workspace?.geometry
        ? buildResolutionFromWorkspace(featureId, workspace, fragments)
        : next;
      setLoadedFeatureCount(allFeatures.length);
      setLoadedUniqueIdCount(countUniqueIds(allFeatures));
      setProviderCandidates([]);
      setFullProviderTileCandidates([]);
      setWorkspaceBuildings([]);
      setWorkspaceProviderFeatureIds([]);
      setWorkspacePolygonMetadata([]);
      setResolverState((current) => ({
        ...updateResolverStep(current, 'Provider', 'Tile loaded', allFeatures.length ? 'success' : 'failed', `${allFeatures.length} provider tile features`),
        providerTileFeatureCount: allFeatures.length,
      }));
      setHiddenProviderFeatureIds([]);
      setSoloProviderFeatureId(null);
      if (!editableResolution) {
        setResolution(null);
        setReferencePolygonRecords([]);
        setWorkspaceBuildings([]);
        setWorkspaceProviderFeatureIds([]);
        setWorkspacePolygonMetadata([]);
        setFragmentRecords([]);
        setDuplicateSummaries([]);
        setForensicReport(null);
        const failure: ResolverFailureStatus = options.useWorkspace
          ? 'NO_PROVIDER_FEATURE'
          : fragments.length ? 'UNSUPPORTED_GEOMETRY' : 'FEATURE_NOT_IN_TILE';
        setResolverState((current) => ({
          ...updateResolverStep(
            updateResolverStep(
              updateResolverStep(current, 'Provider', 'Feature found', fragments.length ? 'success' : 'failed', fragments.length ? `Feature ${featureId}` : 'Feature not in loaded provider tile'),
              'Provider',
              'Adjacent tiles',
              fragments.length ? 'skipped' : 'failed',
              fragments.length ? 'Not needed' : 'Adjacent tile loading unavailable in current source window',
            ),
              'Geometry',
              'Polygon extracted',
              'failed',
              options.useWorkspace
                ? `No individual building footprint found within ${EXPANDED_NEIGHBORHOOD_RADII_METERS[EXPANDED_NEIGHBORHOOD_RADII_METERS.length - 1]}m`
                : fragments.length ? 'Unsupported or empty provider geometry' : 'No provider feature geometry',
          ),
          failure,
          suggestions: resolverFailureSuggestions(failure),
          providerTileFeatureCount: allFeatures.length,
          neighborhoodFeatureCount: 0,
        }));
        if (options.intelligenceListing) {
          const listing = options.intelligenceListing;
          const noFeatureVenue = getVenueForListing(listing, semv2Collections);
          const shouldSkip = isApproximateLocation(listing)
            || noFeatureVenue?.visibility === 'private'
            || noFeatureVenue?.visibility === 'public_approximate';
          const searchRadiusMeters = EXPANDED_NEIGHBORHOOD_RADII_METERS[EXPANDED_NEIGHBORHOOD_RADII_METERS.length - 1];
          setAddressIntelligence({
            status: shouldSkip ? 'skipped' : 'unconfirmed',
            message: shouldSkip
              ? 'Approximate/private locations are intentionally excluded from building verification.'
              : `No provider building was available within ${searchRadiusMeters}m of the stored pin.`,
            searchRadiusMeters,
            bestCandidate: null,
            checkedCandidateCount: 0,
          });
          if (!shouldSkip && listingHasExactBuildingAddress(listing, semv2Collections)) {
            await persistBuildingVerification(listing, {
              status: 'unconfirmed',
              checkedAt: new Date().toISOString(),
              confidence: 0,
              listingAddress: formatListingAddress(listing, semv2Collections),
              searchRadiusMeters,
              notes: ['no provider building found inside expanded search radius'],
            });
          }
          setStatus(`No provider building was found within ${searchRadiusMeters}m of ${listing.name}. The location is flagged for admin review.`);
        } else {
          setStatus(`Feature id ${featureId} was not returned by the OpenFreeMap building source before the wait window expired.`);
        }
        return;
      }

      setWorkspaceBuildings(workspace?.buildings ?? []);
      setWorkspaceProviderFeatureIds(workspace?.providerFeatureIds ?? []);
      setWorkspacePolygonMetadata(workspace?.polygons.map((polygon) => ({
        renderHeightMeters: polygon.renderHeightMeters,
        renderMinHeightMeters: polygon.renderMinHeightMeters,
        providerFeatureId: polygon.providerFeatureId,
      })) ?? []);
      const workspaceProvenanceFeatureId = workspace?.polygons.find((polygon) => polygon.providerFeatureId)?.providerFeatureId ?? null;
      if (workspaceProvenanceFeatureId) {
        setResolvedVenueFeatureId(workspaceProvenanceFeatureId);
        setFeatureIdInput(workspaceProvenanceFeatureId);
        featureIdInputRef.current = workspaceProvenanceFeatureId;
      }
      setResolution(editableResolution);
      logBuildingInspector('resolveFeature:setResolution', {
        featureId,
        useWorkspace: Boolean(workspace?.geometry),
        geometryType: editableResolution.geometry?.type ?? null,
        polygonCount: editableResolution.polygonCount,
        ringCount: editableResolution.ringCount,
        vertexCount: editableResolution.vertexCount,
        fragmentCount: editableResolution.fragmentCount,
        workspaceBuildingCount: workspace?.buildings.length ?? 0,
        metricsStatus: editableResolution.metricsStatus,
      });
      setReferencePolygonRecords([]);
      setPendingCandidateId(null);
      setHoveredCandidateId(null);
      setFragmentRecords([]);
      setDuplicateSummaries([]);
      setForensicReport(null);
      setResolverState((current) =>
        updateResolverStep(
          updateResolverStep(
            updateResolverStep(
              current,
              'Provider',
              'Feature found',
              workspaceProvenanceFeatureId || !options.useWorkspace ? 'success' : 'skipped',
              workspaceProvenanceFeatureId
                ? `Provenance feature ${workspaceProvenanceFeatureId}`
                : options.useWorkspace ? 'Footprints loaded without a stable provider feature ID' : `Feature ${featureId}`,
            ),
            'Provider',
            'Adjacent tiles',
            'skipped',
            'Not needed',
          ),
          'Geometry',
          'Polygon extracted',
          editableResolution.polygonCount ? 'success' : 'failed',
          editableResolution.polygonCount ? `${formatPolygonCountLabel(editableResolution.polygonCount)}` : 'Provider returned empty geometry',
        ),
      );
      setStatus(
        workspace?.geometry
          ? `Loaded ${workspace.buildings.length} building group(s) and ${workspace.polygons.length} editable polygon(s) inside the ${workspace.radiusMeters}m workspace${usedOsOpenMapLocalFallback ? `, including the ${OS_OPENMAP_LOCAL_SOURCE} footprint at the pin` : ''}${usedSupplementalFallback ? `, with ${supplementalAcceptedCount} gap-filling footprint(s) from ${MICROSOFT_BUILDING_SOURCE}` : ''}.`
          : `Resolved feature id ${featureId}: ${editableResolution.fragmentCount} candidate fragment(s), rendered ${editableResolution.primaryTile}. Geometry: ${formatPolygonCountLabel(editableResolution.polygonCount)}. Diagnostics pending.`,
      );
      window.setTimeout(async () => {
        if (!isCurrentRun()) return;
        logBuildingInspector('resolveFeature:deferred diagnostics enter', {
          featureId,
          featureCount: allFeatures.length,
          fragmentCount: fragments.length,
        });
        try {
          // Verification must not depend on optional forensic metrics succeeding.
          if (workspace?.geometry && options.intelligenceListing && options.workspaceCenter) {
            setLoadingPhase('Checking building addresses');
            await runAddressIntelligence({
              listing: options.intelligenceListing,
              seedFeatureId: featureId,
              allFeatures,
              initialWorkspace: workspace,
              fragments,
              center: options.workspaceCenter,
              signal: options.signal,
            });
            if (!isCurrentRun()) return;
          }
          setLoadingPhase('Computing optional diagnostics');
          const nextFragmentRecords = fragments
            .map(getFragmentRecord)
            .filter((entry): entry is FragmentRecord => Boolean(entry));
          if (workspace?.geometry) {
            const nextDuplicateSummaries = buildDuplicateSummaries(fragments);
            const rawProviderCandidates = options.workspaceCenter
              ? buildWorkspaceProviderCandidates(allFeatures, workspace, options.workspaceCenter)
              : [];
            setReferencePolygonRecords([]);
            setFragmentRecords(nextFragmentRecords);
            setDuplicateSummaries(nextDuplicateSummaries);
            setProviderCandidates(rawProviderCandidates);
            setFullProviderTileCandidates([]);
            setForensicReport(buildForensicReport(featureId, fragments, nextFragmentRecords, nextDuplicateSummaries, editableResolution));
            setResolverState((current) => ({
              ...updateResolverStep(
                updateResolverStep(current, 'Neighborhood', 'Nearby features', 'success', `${workspace.buildings.length} building group(s), ${workspace.polygons.length} editable polygon(s) within ${workspace.radiusMeters}m`),
                'Neighborhood',
                'Expanded radius',
                'skipped',
                `${workspace.radiusMeters}m workspace loaded`,
              ),
              providerTileFeatureCount: workspace.providerTileFeatureCount,
              neighborhoodFeatureCount: workspace.polygons.length,
              radiusMeters: workspace.radiusMeters,
              failure: null,
              suggestions: [],
            }));
            setStatus(
              `Loaded ${workspace.buildings.length} building group(s) and ${workspace.polygons.length} editable polygon(s) inside the ${workspace.radiusMeters}m workspace${usedOsOpenMapLocalFallback ? `, including the ${OS_OPENMAP_LOCAL_SOURCE} footprint at the pin` : ''}${usedSupplementalFallback ? `, with ${supplementalAcceptedCount} gap-filling footprint(s) from ${MICROSOFT_BUILDING_SOURCE}` : ''}.`,
            );
            logBuildingInspector('resolveFeature:workspace diagnostics exit', {
              featureId,
              fragmentRecordCount: nextFragmentRecords.length,
              workspaceBuildingCount: workspace.buildings.length,
              workspacePolygonCount: workspace.polygons.length,
            });
            return;
          }
          let scopedCache = buildScopedNeighborhoodCache(
            allFeatures,
            editableResolution.geometry,
            featureId,
            DEFAULT_NEIGHBORHOOD_RADIUS_METERS,
          );
          for (const expandedRadius of EXPANDED_NEIGHBORHOOD_RADII_METERS) {
            const nonEditableCount = scopedCache.candidates.filter((candidate) => candidate.featureId !== featureId).length;
            if (nonEditableCount > 0) break;
            scopedCache = buildScopedNeighborhoodCache(allFeatures, editableResolution.geometry, featureId, expandedRadius);
          }
          const fullTileCache = showFullProviderTileCache
            ? buildScopedNeighborhoodCache(allFeatures, editableResolution.geometry, featureId, Number.POSITIVE_INFINITY).candidates
            : [];
          const scopedFeatures = scopedCache.candidates.map((candidate) => candidate.feature);
          const nextDuplicateSummaries = buildDuplicateSummaries(scopedFeatures);
          setReferencePolygonRecords(buildReferencePolygonRecords(scopedFeatures, featureId, getGeometryCenter(editableResolution.geometry)));
          setFragmentRecords(nextFragmentRecords);
          setDuplicateSummaries(nextDuplicateSummaries);
          setProviderCandidates(scopedCache.candidates);
          setFullProviderTileCandidates(fullTileCache);
          setForensicReport(buildForensicReport(featureId, scopedFeatures, nextFragmentRecords, nextDuplicateSummaries, next));
          setResolverState((current) => ({
            ...updateResolverStep(
              updateResolverStep(current, 'Neighborhood', 'Nearby features', 'success', `${scopedCache.candidates.length} nearby features within ${scopedCache.radiusMeters}m`),
              'Neighborhood',
              'Expanded radius',
              scopedCache.radiusMeters > DEFAULT_NEIGHBORHOOD_RADIUS_METERS ? 'success' : 'skipped',
              scopedCache.radiusMeters > DEFAULT_NEIGHBORHOOD_RADIUS_METERS ? `Expanded to ${scopedCache.radiusMeters}m` : `${DEFAULT_NEIGHBORHOOD_RADIUS_METERS}m was sufficient`,
            ),
            providerTileFeatureCount: scopedCache.providerTileFeatureCount,
            neighborhoodFeatureCount: scopedCache.candidates.length,
            radiusMeters: scopedCache.radiusMeters,
            failure: null,
            suggestions: [],
          }));
          setStatus(
            `Resolved feature id ${featureId}: ${editableResolution.fragmentCount} candidate fragment(s), rendered ${editableResolution.primaryTile}. Geometry: ${formatPolygonCountLabel(editableResolution.polygonCount)}, disconnected pieces ${formatDiagnosticMetric(editableResolution.disconnectedPieces)}.`,
          );
          logBuildingInspector('resolveFeature:deferred diagnostics exit', {
            featureId,
            fragmentRecordCount: nextFragmentRecords.length,
            duplicateSummaryCount: nextDuplicateSummaries.length,
            providerCandidateCount: scopedCache.candidates.length,
          });
        } catch (error) {
          if (!isCurrentRun()) return;
          logBuildingInspector('resolveFeature:deferred diagnostics skipped', {
            featureId,
            error,
          });
          setStatus(
            `Resolved feature id ${featureId}: ${editableResolution.fragmentCount} candidate fragment(s), rendered ${editableResolution.primaryTile}. Geometry: ${formatPolygonCountLabel(editableResolution.polygonCount)}. Optional metrics skipped.`,
          );
          setResolverState((current) => ({
            ...updateResolverStep(current, 'Neighborhood', 'Nearby features', 'skipped', 'Optional diagnostics skipped'),
            suggestions: ['Manual Feature ID'],
          }));
        } finally {
          if (isCurrentRun()) setLoadingPhase(null);
        }
      }, 0);
      logBuildingInspector('resolveFeature:exit', {
        featureId,
        scanIterations,
        loadedFeatureCount: allFeatures.length,
        fragmentCount: fragments.length,
        elapsedMs: performance.now() - startedAt,
      });
    } catch (error) {
      if (!isCurrentRun()) return;
      logBuildingInspector('resolveFeature:error', {
        featureId,
        error,
        elapsedMs: performance.now() - startedAt,
      });
      throw error;
    } finally {
      if (isCurrentRun()) {
        setLoadingPhase(null);
        setIsLoading(false);
      }
    }
  };

  const loadVenueGeometry = async (
    listing: Listing,
    options: { forceProvider?: boolean; buildingSourceMode?: BuildingSourceMode } = {},
  ) => {
    if (saveStateLabel === 'Unsaved Changes' && !window.confirm('Replace the current unsaved building selection?')) {
      logBuildingInspector('loadVenueGeometry:exit cancelled unsaved changes', { listingId: listing.id });
      return;
    }
    venueLoadAbortRef.current?.abort(new Error('A newer venue lookup started.'));
    const controller = new AbortController();
    venueLoadAbortRef.current = controller;
    const signal = controller.signal;
    const ownerRun = ++venueLoadRunRef.current;
    addressIntelligenceRunRef.current += 1;
    const isCurrentRun = () => ownerRun === venueLoadRunRef.current && !signal.aborted;
    const physicalVenue = getVenueForListing(listing, semv2Collections);
    if (isApproximateLocation(listing) || (physicalVenue && physicalVenue.visibility !== 'public_exact')) {
      setResolution(null);
      setIsLoading(false);
      setLoadingPhase(null);
      setStatus('Precise building lookup is disabled for private, hidden, or approximate locations.');
      return;
    }
    const startedAt = performance.now();
    const requestedBuildingSourceMode = options.buildingSourceMode ?? buildingSourceMode;
    logBuildingInspector('loadVenueGeometry:enter', {
      listingId: listing.id,
      listingName: listing.name,
      saveStateLabel,
    });
    const map = mapRef.current;
    if (!map) {
      setStatus('Map is not ready yet. Try again after the building source loads.');
      logBuildingInspector('loadVenueGeometry:exit missing map', { listingId: listing.id });
      return;
    }

    const coords = getListingCanonicalCoords(listing, semv2Collections);
    const savedAsset = getBuildingAssetForListing(
      listing,
      buildingAssets,
      venues,
      listings,
      organizations,
      relationships,
    );
    if (!coords) {
      setStatus(`Cannot resolve ${listing.name}: listing coordinates are missing.`);
      logBuildingInspector('loadVenueGeometry:exit missing canonical coords', { listingId: listing.id });
      return;
    }
    logBuildingInspector('loadVenueGeometry:canonical coords', {
      listingId: listing.id,
      lng: coords.lng,
      lat: coords.lat,
    });

    if (!listing.id.startsWith('landmark-test-')) {
      setLandmarkValidation(null);
      setLandmarkListing(null);
    }
    setSelectedVenueId(listing.id);
    addressIntelligenceRunRef.current += 1;
    setAddressIntelligence({
      status: 'idle',
      message: 'Address intelligence will run after the nearby building workspace loads.',
      searchRadiusMeters: null,
      bestCandidate: null,
      checkedCandidateCount: 0,
    });
    setResolvedVenueFeatureId(null);
    setSavedGeometrySignature(getGeometrySignature(savedAsset?.geometry));
    setAssetStatusMessage(null);
    setGeneratedBuildingCandidate(null);
    setResolution(null);
    setReferencePolygonRecords([]);
    setProviderCandidates([]);
    setFullProviderTileCandidates([]);
    setWorkspaceBuildings([]);
    setWorkspaceProviderFeatureIds([]);
    setWorkspacePolygonMetadata([]);
    setResolverState(createVenueResolverState(
      listing,
      coords,
      Boolean(savedAsset),
      semv2Collections,
    ));
    setHiddenProviderFeatureIds([]);
    setSoloProviderFeatureId(null);
    setPendingCandidateId(null);
    setHoveredCandidateId(null);
    setProviderWasManuallyCorrected(false);
    setFragmentRecords([]);
    setDuplicateSummaries([]);
    setForensicReport(null);
    pendingSelectAllRef.current = false;
    setSelectedPolygonIndices([]);
    setSuggestedPolygonIndices([]);
    setHoveredPolygonIndex(null);
    setIsLoading(true);
    setLoadedBuildingSourceLabel('Loading…');
    setLoadingPhase(`Loading venue ${listing.name}`);

    try {
      logBuildingInspector('loadVenueGeometry:jumpTo enter', {
        listingId: listing.id,
        lng: coords.lng,
        lat: coords.lat,
        zoom: 18.2,
      });
      map.jumpTo({
        center: [coords.lng, coords.lat],
        zoom: 18.2,
      });
      logBuildingInspector('loadVenueGeometry:jumpTo exit', { listingId: listing.id });
      setLoadingPhase('Waiting for venue building tiles');
      const idleResult = await waitForMapIdle(map);
      if (!isCurrentRun()) return;
      setResolverState((current) =>
        updateResolverStep(
          current,
          'Provider',
          'Tile loaded',
          idleResult === 'idle' ? 'success' : 'skipped',
          idleResult === 'idle' ? 'Provider tile idle' : 'Timed out; continuing',
        ),
      );
      if (idleResult === 'timeout') {
        setStatus(`Map tiles did not become idle for ${listing.name}; continuing with provider lookup.`);
      }
      if (savedAsset && !options.forceProvider) {
        loadSavedBuildingAsset(savedAsset, listing.name);
        setResolverState((current) => ({
          ...updateResolverStep(current, 'Asset', 'Saved asset loaded', 'success', `${savedAsset.capture.polygonCount} polygon(s)`),
          failure: null,
          suggestions: [],
        }));
        logBuildingInspector('loadVenueGeometry:exit saved asset', {
          listingId: listing.id,
          assetId: savedAsset.id,
          polygonCount: savedAsset.capture.polygonCount,
          elapsedMs: performance.now() - startedAt,
        });
        return;
      }

      setLoadingPhase('Loading neighborhood building footprints');
      setResolverState((current) => updateResolverStep(current, 'Provider', 'Feature found', 'skipped', 'Neighborhood scan does not require a provider feature ID'));
      setStatus(`Loading individual building footprints around ${listing.name}.`);
      await resolveFeature(`neighborhood:${listing.id}`, {
        useWorkspace: true,
        workspaceCenter: coords,
        intelligenceListing: listing,
        buildingSourceMode: requestedBuildingSourceMode,
        signal,
      });
      logBuildingInspector('loadVenueGeometry:exit', {
        listingId: listing.id,
        neighborhoodScan: true,
        elapsedMs: performance.now() - startedAt,
      });
    } catch (error) {
      if (!isCurrentRun()) return;
      logBuildingInspector('loadVenueGeometry:error', {
        listingId: listing.id,
        error,
        elapsedMs: performance.now() - startedAt,
      });
      setStatus(`Could not load ${listing.name}: ${(error as Error).message || 'provider or geometry failure'}. Retry the venue lookup.`);
    } finally {
      if (isCurrentRun()) {
        setLoadingPhase(null);
        setIsLoading(false);
      }
      if (venueLoadAbortRef.current === controller) venueLoadAbortRef.current = null;
    }
  };

  const loadLandmarkTest = async () => {
    const landmark = LANDMARK_TESTS.find((item) => item.id === selectedLandmarkId) ?? LANDMARK_TESTS[0];
    if (!landmark) return;
    const listing = createLandmarkListing(landmark);
    setLandmarkListing(listing);
    setLandmarkValidation(landmark);
    await loadVenueGeometry(listing);
  };

  const loadSavedBuildingAsset = (
    asset: BuildingAsset | null = selectedVenueAsset,
    venueName: string = selectedVenue?.name ?? 'selected venue',
  ) => {
    if (!asset) {
      setAssetStatusMessage('No saved building asset exists for this venue yet.');
      return;
    }
    if (saveStateLabel === 'Unsaved Changes' && !window.confirm('Replace the current unsaved building selection with the saved asset?')) {
      return;
    }

    setResolution(buildResolutionFromAsset(asset));
    setReferencePolygonRecords([]);
    setProviderCandidates([]);
    setFullProviderTileCandidates([]);
    setWorkspaceBuildings([]);
    setWorkspaceProviderFeatureIds(asset.provider.featureIds);
    setWorkspacePolygonMetadata([]);
    setHiddenProviderFeatureIds([]);
    setSoloProviderFeatureId(null);
    setPendingCandidateId(null);
    setHoveredCandidateId(null);
    setFragmentRecords([]);
    setDuplicateSummaries([]);
    setForensicReport(null);
    setResolvedVenueFeatureId(asset.provider.featureIds[0] ?? null);
    setFeatureIdInput(asset.provider.featureIds[0] ?? featureIdInput);
    featureIdInputRef.current = asset.provider.featureIds[0] ?? featureIdInputRef.current;
    setSavedGeometrySignature(getGeometrySignature(asset.geometry));
    setLoadedBuildingSourceLabel(`Saved · ${asset.provider.source || 'unknown source'}`);
    setAssetStatusMessage(`Loaded saved building asset updated ${new Date(asset.capture.updatedAt).toLocaleString()}.`);
    setStatus(`Loaded saved building asset for ${venueName}: ${asset.capture.polygonCount} polygon(s).`);
    setSuggestedPolygonIndices([]);
    pendingSelectAllRef.current = true;
  };

  const reloadBuildingSource = async (mode: BuildingSourceMode = buildingSourceMode) => {
    if (!selectedVenue || isLoading) return;
    await loadVenueGeometry(selectedVenue, { forceProvider: true, buildingSourceMode: mode });
  };

  const cycleBuildingSource = async () => {
    const currentIndex = BUILDING_SOURCE_MODE_ORDER.indexOf(buildingSourceMode);
    const nextMode = BUILDING_SOURCE_MODE_ORDER[(currentIndex + 1) % BUILDING_SOURCE_MODE_ORDER.length];
    setBuildingSourceMode(nextMode);
    if (selectedVenue && !isLoading) {
      await loadVenueGeometry(selectedVenue, { forceProvider: true, buildingSourceMode: nextMode });
    }
  };

  const promoteCandidateToEditable = (candidate: ProviderCandidate | null = promotedCandidate) => {
    if (!candidate) return;
    if (saveStateLabel === 'Unsaved Changes' && !window.confirm('Replace the current unsaved building selection with this provider candidate?')) {
      return;
    }
    const next = buildResolution(candidate.featureId, [candidate.feature], selectedVenueCoords);
    if (!next) {
      setAssetStatusMessage(`Candidate ${candidate.featureId} could not be converted into editable geometry.`);
      return;
    }
    setResolution(next);
    setResolvedVenueFeatureId(candidate.featureId);
    setFeatureIdInput(candidate.featureId);
    featureIdInputRef.current = candidate.featureId;
    setSelectedPolygonIndices([]);
    setSuggestedPolygonIndices([]);
    setHoveredPolygonIndex(null);
    setPendingCandidateId(null);
    setHoveredCandidateId(null);
    setProviderWasManuallyCorrected(true);
    setWorkspaceBuildings([]);
    setWorkspaceProviderFeatureIds([candidate.featureId]);
    setWorkspacePolygonMetadata([]);
    setReferencePolygonRecords(
      buildReferencePolygonRecords(
        displayedProviderCandidates.map((item) => item.feature),
        candidate.featureId,
        getGeometryCenter(next.geometry),
      ),
    );
    setFragmentRecords([getFragmentRecord(candidate.feature)].filter((entry): entry is FragmentRecord => Boolean(entry)));
    setForensicReport(null);
    setStatus(`Promoted nearby provider candidate ${candidate.featureId} to editable geometry.`);
  };

  const saveSelectedBuildingAsset = async () => {
    if (!selectedVenue) {
      setAssetStatusMessage('Select a venue before saving a building asset.');
      return;
    }
    if (!selectedSummary.geoJson?.geometry) {
      setAssetStatusMessage('Select one or more footprints before saving.');
      return;
    }

    const now = new Date().toISOString();
    const selectedProviderFeatureIds = Array.from(new Set(
      selectedPolygonRecords
        .map((record) => record.providerFeatureId)
        .filter((value): value is string => Boolean(value)),
    ));
    const providerFeatureIds = Array.from(new Set((selectedProviderFeatureIds.length
      ? selectedProviderFeatureIds
      : [resolvedVenueFeatureId, resolution?.featureId, ...fragmentRecords.map((fragment) => fragment.featureId)]
    ).filter((value): value is string => Boolean(
      value &&
      !value.startsWith('building-asset-') &&
      !value.startsWith('workspace:'),
    ))));
    const selectedIncludesGenerated = providerFeatureIds.some((providerFeatureId) =>
      isGeneratedBuildingFeatureId(providerFeatureId)
    );
    const selectedProviderSource = selectedIncludesGenerated
      ? GENERATED_BUILDING_SOURCE
      : providerFeatureIds.some((providerFeatureId) => providerFeatureId.startsWith(OS_OPENMAP_LOCAL_FEATURE_ID_PREFIX))
        ? OS_OPENMAP_LOCAL_SOURCE
        : providerFeatureIds.some((providerFeatureId) => providerFeatureId.startsWith(MICROSOFT_BUILDING_ID_PREFIX))
          ? MICROSOFT_BUILDING_SOURCE
          : resolution?.source ?? 'OpenFreeMap';
    const renderHeightMeters = selectedSummary.maxRenderHeightMeters ??
      venueArrival.buildingFallbackHeight * venueArrival.selectedBuilding.heightBoost;
    const renderMinHeightMeters = minMetric(selectedPolygonRecords.map((record) => record.renderMinHeightMeters)) ?? 0;
    const existingAsset = selectedVenueAsset;
    const resolvedVenueId = getVenueForListing(selectedVenue, { listings, venues, organizations, relationships })?.id;
    const canonicalVenueListing = resolvedVenueId
      ? listings.find((listing) => (
          listing.type === 'club' &&
          getVenueForListing(listing, { listings, venues, organizations, relationships })?.id === resolvedVenueId
        )) ?? null
      : null;
    const assetOwnerListingId = existingAsset?.listingId ?? canonicalVenueListing?.id ?? selectedVenue.id;
    const asset: BuildingAsset = {
      id: existingAsset?.id ?? `building-asset-${assetOwnerListingId}`,
      listingId: assetOwnerListingId,
      venueId: existingAsset?.venueId ?? resolvedVenueId,
      version: 1,
      provider: {
        source: providerWasManuallyCorrected
          ? `${selectedProviderSource} (manually corrected)`
          : selectedProviderSource,
        featureIds: providerFeatureIds,
        origin: selectedIncludesGenerated ? 'generated' : 'provider',
        generationMethod: selectedIncludesGenerated ? generatedBuildingCandidate?.method : undefined,
        generationConfidence: selectedIncludesGenerated ? generatedBuildingCandidate?.confidence : undefined,
        provenanceNote: selectedIncludesGenerated ? generatedBuildingCandidate?.sourceDetail : undefined,
      },
      geometry: selectedSummary.geoJson.geometry,
      renderHeightMeters,
      renderMinHeightMeters,
      capture: {
        createdAt: existingAsset?.capture.createdAt ?? now,
        updatedAt: now,
        polygonCount: selectedSummary.count,
        ringCount: selectedSummary.ringCount,
        vertexCount: selectedSummary.vertexCount,
      },
    };

    const assetOwnerListing = listings.find((listing) => listing.id === assetOwnerListingId) ?? selectedVenue;
    const expectedSnapshot = createBuildingVerificationInputSnapshot(assetOwnerListing, { listings });
    if (!expectedSnapshot) {
      setAssetStatusMessage('Save blocked: the canonical asset owner has no valid location snapshot.');
      return;
    }
    const matchingEvidence = selectedBuildingEvidence?.listingId === assetOwnerListingId
      && selectedBuildingEvidence.inputSnapshotHash === expectedSnapshot.hash
      ? selectedBuildingEvidence
      : null;

    setIsLoading(true);
    setLoadingPhase('Saving building asset');
    setAssetStatusMessage(null);
    try {
      const saved = await api.saveBuildingAsset(assetOwnerListingId, asset, {
        expectedSnapshot,
        evidence: matchingEvidence,
        mode: 'manual',
        allowReplaceExisting: Boolean(existingAsset),
        expectedExistingAsset: createBuildingAssetRevision(existingAsset),
      });
      setSavedGeometrySignature(getGeometrySignature(saved.asset.geometry));
      setAssetStatusMessage(`Saved building asset at ${new Date(saved.asset.capture.updatedAt).toLocaleString()}.`);
      setStatus(`Saved building asset for ${selectedVenue.name}: ${saved.asset.capture.polygonCount} polygon(s).`);
      setLocalBuildingAssets((current) => {
        const index = current.findIndex((item) => item.id === saved.asset.id);
        if (index < 0) return [...current, saved.asset];
        const next = [...current];
        next[index] = saved.asset;
        return next;
      });
      if (saved.listing) {
        setLocalListings((current) => current.map((item) => (item.id === saved.listing?.id ? saved.listing : item)));
      }
      onBuildingAssetSaved?.(saved.asset, saved.listing);
      api.getBuildingAssetHistory(assetOwnerListingId)
        .then(setBuildingAssetHistory)
        .catch(() => undefined);
    } catch (error) {
      setAssetStatusMessage((error as Error).message || 'Failed to save building asset.');
    } finally {
      setLoadingPhase(null);
      setIsLoading(false);
    }
  };

  const rollbackLastBuildingSave = async () => {
    if (!selectedVenue) return;
    const ownerListingId = selectedVenueAsset?.listingId ?? selectedVenue.id;
    const ownerListing = listings.find((listing) => listing.id === ownerListingId) ?? selectedVenue;
    const expectedSnapshot = createBuildingVerificationInputSnapshot(ownerListing, { listings });
    const expectedExistingAsset = createBuildingAssetRevision(selectedVenueAsset);
    const restorable = buildingAssetHistory.find((event) => event.action === 'replace' && event.previousAsset);
    if (!expectedSnapshot || !expectedExistingAsset || !restorable) {
      setAssetStatusMessage('No previous BuildingAsset revision is available to restore.');
      return;
    }
    setIsLoading(true);
    setLoadingPhase('Restoring previous building asset');
    setAssetStatusMessage(null);
    try {
      const saved = await api.rollbackBuildingAsset(ownerListingId, expectedSnapshot, expectedExistingAsset, restorable.id);
      setLocalBuildingAssets((current) => {
        const index = current.findIndex((item) => item.id === saved.asset.id || item.listingId === ownerListingId);
        if (index < 0) return [...current, saved.asset];
        const next = [...current];
        next[index] = saved.asset;
        return next;
      });
      if (saved.listing) {
        setLocalListings((current) => current.map((item) => item.id === saved.listing?.id ? saved.listing : item));
      }
      setSavedGeometrySignature(getGeometrySignature(saved.asset.geometry));
      setBuildingAssetHistory(await api.getBuildingAssetHistory(ownerListingId));
      onBuildingAssetSaved?.(saved.asset, saved.listing);
      setAssetStatusMessage(`Restored the previous BuildingAsset revision from ${new Date(restorable.occurredAt).toLocaleString()}. Reload the saved asset to inspect it.`);
      setStatus(`Restored the previous building geometry for ${ownerListing.name}.`);
    } catch (error) {
      setAssetStatusMessage((error as Error).message || 'Failed to restore the previous BuildingAsset.');
    } finally {
      setLoadingPhase(null);
      setIsLoading(false);
    }
  };

  const movePinToSelectedBuilding = async () => {
    if (!selectedVenue) {
      setAssetStatusMessage('Select a venue before moving its pin.');
      return;
    }
    const geometry = selectedSummary.geoJson?.geometry ?? selectedVenueAsset?.geometry;
    const center = getGeometryCenter(geometry ?? null);
    if (!center) {
      setAssetStatusMessage('Select or load a saved building before moving the pin.');
      return;
    }

    const [longitude, latitude] = center;
    const resolvedVenue = getVenueForListing(selectedVenue, { listings, venues, organizations, relationships });
    const persistedVenue = resolvedVenue && venues.some((venue) => venue.id === resolvedVenue.id)
      ? resolvedVenue
      : null;
    const updatedListing: Listing = {
      ...selectedVenue,
      geopoint: {
        ...selectedVenue.geopoint,
        latitude,
        longitude,
      },
    };

    setIsLoading(true);
    setLoadingPhase('Moving venue pin');
    setAssetStatusMessage(null);
    try {
      if (persistedVenue) {
        const savedVenue = await api.saveVenue({
          ...persistedVenue,
          latitude,
          longitude,
        });
        setLocalVenues((current) => current.map((venue) => (venue.id === savedVenue.id ? savedVenue : venue)));
        onVenueLocationSaved?.(savedVenue);

        let listingMirrorUpdated = true;
        if (selectedVenue.type === 'club') {
          try {
            const savedListing = await api.saveListing(updatedListing);
            setLocalListings((current) => current.map((item) => (item.id === savedListing.id ? savedListing : item)));
            onListingLocationSaved?.(savedListing);
          } catch (error) {
            listingMirrorUpdated = false;
            console.warn('[BuildingInspector] Venue pin moved, but the legacy club listing coordinate could not be mirrored.', error);
          }
        }

        setAssetStatusMessage(
          listingMirrorUpdated
            ? `Moved shared venue pin to ${latitude.toFixed(6)}, ${longitude.toFixed(6)}. Address text was preserved.`
            : `Moved the canonical Venue pin to ${latitude.toFixed(6)}, ${longitude.toFixed(6)}, but the legacy club listing coordinate still needs to be synchronized.`,
        );
        setStatus(`Moved ${persistedVenue.name}'s canonical venue pin to the center of the selected building.`);
      } else {
        const savedListing = await api.saveListing(updatedListing);
        setLocalListings((current) => current.map((item) => (item.id === savedListing.id ? savedListing : item)));
        onListingLocationSaved?.(savedListing);
        setAssetStatusMessage(`Moved venue pin to ${latitude.toFixed(6)}, ${longitude.toFixed(6)}. Address text was preserved.`);
        setStatus(`Moved ${savedListing.name}'s display pin to the center of the selected building.`);
      }
    } catch (error) {
      setAssetStatusMessage((error as Error).message || 'Failed to move the venue pin.');
    } finally {
      setLoadingPhase(null);
      setIsLoading(false);
    }
  };

  const recordBuildingReview = async (disposition: BuildingReviewDisposition, note?: string) => {
    if (!selectedVenue || !selectedBuildingEvidence) {
      setAssetStatusMessage('Run the live provider comparison before recording a building review.');
      return;
    }
    try {
      await adminFetchJson('/api/admin/building-verification/evidence/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: selectedVenue.id, disposition, note }),
      });
      setAssetStatusMessage('Building review decision recorded as an append-only audit event. Canonical changes remain explicit.');
    } catch (error) {
      setAssetStatusMessage(`Building review was not recorded: ${(error as Error).message || 'unknown error'}`);
    }
  };

  const acceptRecommendedBuildingForReview = async () => {
    const candidate = addressIntelligence.bestCandidate;
    if (!candidate) {
      setAssetStatusMessage('No live provider recommendation is loaded. Use Compare live first.');
      return;
    }
    setSelectedPolygonIndices(candidate.polygonIndices);
    setSuggestedPolygonIndices([]);
    await recordBuildingReview('accept_recommended_building', 'Recommended footprint selected; Save Building remains an explicit canonical write.');
    setStatus('Recommended footprint selected. Review it against the street plane, then use Save Building for the explicit asset change.');
  };

  const handleCopy = async (label: string, value: string) => {
    try {
      const ok = await copyText(value);
      setCopiedLabel(ok ? label : `${label} unavailable`);
    } catch {
      setCopiedLabel(`Copy failed: ${label}`);
    }
    window.setTimeout(() => setCopiedLabel(null), 1800);
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: swingMapStyle,
      center: [DEFAULT_TWIST_LNG, DEFAULT_TWIST_LAT],
      zoom: 18.2,
      minZoom: 3,
      maxZoom: 20,
      attributionControl: false,
      interactive: true,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    mapRef.current = map;

    map.on('load', () => {
      map.setPaintProperty('dark-basemap', 'raster-brightness-max', 0.9);
      map.setPaintProperty('dark-basemap-labels', 'raster-opacity', 1);
      map.setPaintProperty('dark-basemap-labels', 'raster-brightness-max', 1);
      map.addSource(getBuildingsSourceId(), buildBuildingsSource());
      map.addLayer({
        id: 'building-inspector-loader',
        type: 'fill',
        source: getBuildingsSourceId(),
        'source-layer': SOURCE_LAYER,
        paint: {
          'fill-color': '#ffffff',
          'fill-opacity': 0,
        },
      });
      map.once('idle', () => {
        setStatus('Building source ready. Select a venue to resolve its provider geometry.');
      });
    });

    return () => {
      mapReferenceMarkerRef.current?.remove();
      mapReferenceMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedVenueLat === null || selectedVenueLng === null) return;

    let cancelled = false;
    const lngLat: [number, number] = [selectedVenueLng, selectedVenueLat];
    setStreetReferenceSnapshot(null);
    setStreetReferenceStatus('Loading streets');
    // Keep the compact top-right reference map readable at a close neighborhood
    // scale. The projected street plane is captured separately at high resolution
    // across a fixed ±500m area so it contains roughly a four-block-radius context
    // instead of stretching this small reference-map canvas.
    map.jumpTo({ center: lngLat, zoom: 18.2 });

    if (!mapReferenceMarkerRef.current) {
      const markerElement = document.createElement('div');
      markerElement.className = 'h-4 w-4 rounded-full border-2 border-white bg-red-500 shadow-[0_0_0_5px_rgba(239,68,68,0.22)]';
      mapReferenceMarkerRef.current = new maplibregl.Marker({ element: markerElement, anchor: 'center' })
        .setLngLat(lngLat)
        .addTo(map);
    } else {
      mapReferenceMarkerRef.current.setLngLat(lngLat);
    }

    captureStreetPlaneNeighborhood(selectedVenueLng, selectedVenueLat)
      .then((snapshot) => {
        if (cancelled) return;
        setStreetReferenceSnapshot(snapshot);
        setStreetReferenceStatus('Ready');
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('[BuildingInspector] street plane neighborhood capture unavailable', error);
        setStreetReferenceSnapshot(null);
        setStreetReferenceStatus('Map only');
      });

    return () => {
      cancelled = true;
    };
  }, [selectedVenueLat, selectedVenueLng]);

  if (!embedded && !isDevRouteEnabled()) {
    return <Navigate to="/" replace />;
  }

  const shellClassName = embedded
    ? 'relative h-[calc(100vh-4rem)] min-h-[42rem] overflow-hidden rounded-2xl border border-gray-200 bg-[#050608] text-zinc-100 shadow-lg'
    : 'relative h-screen min-h-[44rem] overflow-hidden bg-[#050608] text-zinc-100';
  const sidebarClassName = embedded
    ? 'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0b0f]/94 shadow-2xl shadow-black/40 backdrop-blur-xl'
    : 'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0b0f]/94 shadow-2xl shadow-black/40 backdrop-blur-xl';
  const resolverStatusPanel = (
    <details className="rounded-2xl border border-white/10 bg-[#08090d]/92 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl" open>
      <summary className="cursor-pointer select-none">
        <div className="inline-flex w-[calc(100%-1rem)] items-center justify-between gap-3 align-middle">
          <div>
            <h2 className="text-sm font-semibold text-zinc-50">Resolver Status</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {resolverState.failure ?? 'Resolution pipeline ready'}
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-zinc-400">
            {resolverState.neighborhoodFeatureCount} nearby
          </span>
        </div>
      </summary>
      <div className="mt-3 space-y-3">
        {(['Venue', 'Provider', 'Neighborhood', 'Geometry', 'Asset'] as ResolverStep['section'][]).map((section) => (
          <div key={section} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{section}</div>
            <div className="mt-2 space-y-1.5">
              {resolverState.steps.filter((step) => step.section === section).map((step) => {
                const marker =
                  step.status === 'success' ? 'OK'
                    : step.status === 'failed' ? 'X'
                      : step.status === 'running' ? '..'
                        : step.status === 'skipped' ? '-'
                          : 'o';
                const colorClass =
                  step.status === 'success' ? 'text-emerald-200'
                    : step.status === 'failed' ? 'text-red-200'
                      : step.status === 'running' ? 'text-amber-200'
                        : 'text-zinc-500';
                return (
                  <div key={`${step.section}-${step.label}`} className={`flex items-start gap-2 text-[11px] ${colorClass}`}>
                    <span className="mt-px w-3 shrink-0">{marker}</span>
                    <span className="min-w-0">
                      <span className="text-zinc-200">{step.label}</span>
                      {step.detail ? <span className="block truncate text-zinc-500">{step.detail}</span> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {resolverState.failure ? (
        <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2">
          <div className="text-[11px] font-semibold text-red-100">{resolverState.failure}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {resolverState.suggestions.map((suggestion) => (
              <span key={suggestion} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-zinc-200">
                {suggestion}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </details>
  );
  const providerNeighborhoodManager = (
    <details className="rounded-2xl border border-white/10 bg-[#08090d]/92 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl" open>
      <summary className="cursor-pointer select-none">
        <div className="inline-flex w-[calc(100%-1rem)] items-center justify-between gap-3 align-middle">
        <div>
          <h2 className="text-sm font-semibold text-zinc-50">Workspace</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Local building geometry inside the authoring radius.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-zinc-400">
          {workspaceSummary.selected} selected
        </span>
        </div>
      </summary>
      <div className="mt-3 grid grid-cols-4 gap-2 text-[11px] text-zinc-400">
        <MiniStat label="Radius" value={`${workspaceSummary.radiusMeters}m`} />
        <MiniStat label="Buildings" value={String(workspaceSummary.buildings)} />
        <MiniStat label="Polygons" value={String(workspaceSummary.polygons)} />
        <MiniStat label="Selected" value={String(workspaceSummary.selected)} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
        <MiniStat label="Provider Tile" value={String(workspaceSummary.providerTile)} />
        <MiniStat label="Visible" value={String(workspaceSummary.visible)} />
      </div>
      <div className="mt-3 max-h-[min(34rem,calc(100vh-18rem))] space-y-2 overflow-y-auto pr-1">
        {workspaceBuildings.length ? workspaceBuildings.map((building) => {
          return (
            <div
              key={building.id}
              className="rounded-xl border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-zinc-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-zinc-100">{building.label}</div>
                  <div className="mt-0.5 text-zinc-500">
                    {building.polygonCount} polygon{building.polygonCount === 1 ? '' : 's'} | {formatMeters(building.distanceMeters)}
                  </div>
                </div>
                <div className="shrink-0 text-right text-zinc-500">
                  {formatNumber(building.areaMeters, 0)} m²
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <MiniStat label="Max height" value={formatMeters(building.maxRenderHeightMeters)} />
                <MiniStat label="Avg height" value={formatMeters(building.avgRenderHeightMeters)} />
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer select-none text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Developer provenance
                </summary>
                <div className="mt-1 break-words text-[10px] leading-4 text-zinc-500">
                  Provider feature IDs: {building.providerFeatureIds.length ? building.providerFeatureIds.join(', ') : 'n/a'}
                </div>
                <div className="mt-1 text-[10px] text-zinc-600">
                  BBox: {formatBounds(building.bbox)}
                </div>
                {building.providerFeatureIds.some((providerFeatureId) => providerFeatureId.startsWith(OS_OPENMAP_LOCAL_FEATURE_ID_PREFIX)) ? (
                  <div className="mt-1 text-[10px] leading-4 text-zinc-600">
                    {OS_OPENMAP_LOCAL_ATTRIBUTION}
                  </div>
                ) : null}
              </details>
            </div>
          );
        }) : (
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-[11px] text-zinc-500">
            Load a venue to build the local authoring workspace.
          </div>
        )}
      </div>
      <details className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
        <summary className="cursor-pointer select-none text-[11px] font-semibold text-zinc-300">
          Developer Diagnostics
        </summary>
        <div className="mt-2 space-y-2 text-[11px] text-zinc-500">
          <Row label="Provider tile features" value={String(providerNeighborhoodSummary.providerTile)} />
          <Row label="Scoped provider candidates" value={String(providerNeighborhoodSummary.neighborhoodCache)} />
          <Row label="Provider feature IDs" value={workspaceSummary.providerFeatureIds.length ? workspaceSummary.providerFeatureIds.join(', ') : 'n/a'} />
          <label className="inline-flex items-center gap-2 rounded-md border border-white/5 bg-white/5 px-2 py-2 text-zinc-300">
            <input
              type="checkbox"
              checked={showFullProviderTileCache}
              onChange={(event) => setShowFullProviderTileCache(event.target.checked)}
              className="h-3.5 w-3.5 accent-zinc-300"
            />
            Show full provider tile cache
          </label>
          <label className="inline-flex items-center gap-2 rounded-md border border-white/5 bg-white/5 px-2 py-2 text-zinc-300">
            <input
              type="checkbox"
              checked={showRawProviderGeometry}
              onChange={(event) => setShowRawProviderGeometry(event.target.checked)}
              className="h-3.5 w-3.5 accent-amber-300"
            />
            Show Raw Provider Geometry
          </label>
        </div>
      </details>
    </details>
  );
  const selectionWorkspacePanel = (
    <details
      className="rounded-2xl border border-white/10 bg-[#08090d]/92 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl"
      open
    >
      <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-50">
        Selection & Asset
      </summary>
      <p className="mt-2 text-[11px] leading-5 text-zinc-500">
        Green is the current building selection. Click a footprint to replace it; Shift-click or Ctrl-click to add or remove pieces.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
        <MiniStat label="Selected" value={String(selectedSummary.count)} help="How many footprint pieces are currently selected for this building asset." />
        <MiniStat label="Editable" value={String(polygonRecords.length)} help="All footprint pieces currently loaded into the 3D workspace." />
        <MiniStat label="Area" value={selectedSummary.count ? `${formatNumber(selectedSummary.areaMeters, 0)} m²` : 'n/a'} help="Combined ground area of the selected footprints." />
        <MiniStat label="Vertices" value={String(selectedSummary.vertexCount)} help="Technical point count for the selected footprint geometry." />
        <MiniStat label="Max height" value={formatMeters(selectedSummary.maxRenderHeightMeters)} help="Tallest provider-reported render height among the selected footprint pieces." />
        <MiniStat label="Avg height" value={formatMeters(selectedSummary.avgRenderHeightMeters)} help="Average provider-reported render height among the selected footprint pieces." />
      </div>
      <div className="mt-3 space-y-2 text-xs text-zinc-300">
        <Row
          label="Footprints"
          value={selectedSummary.indices.length ? selectedSummary.indices.map((index) => `#${index + 1}`).join(', ') : 'None'}
          help="These are internal footprint numbers inside the current workspace. They are not provider IDs or street addresses."
        />
        <Row label="Asset state" value={saveStateLabel} help="Saved means the current selection matches the stored building asset. Unsaved Changes means it has not been written yet." />
      </div>
      <details className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
        <summary className="cursor-pointer select-none text-[11px] font-semibold text-zinc-400">Technical geometry</summary>
        <div className="mt-2 space-y-2 text-xs text-zinc-300">
          <Row label="Geometry type" value={selectedMetrics.geometryType} help="GeoJSON geometry type for the currently loaded workspace." />
          <Row label="Bounding box (BBox)" value={selectedSummary.count ? formatBounds(selectedSummary.bbox) : 'n/a'} help="BBox means bounding box: the smallest latitude/longitude rectangle that contains the selected geometry." />
        </div>
      </details>
      {assetStatusMessage ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-zinc-300">
          {assetStatusMessage}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-zinc-200 transition-colors hover:bg-white/10" title="Hide unselected footprints so you can inspect only the current building selection.">
          <input
            type="checkbox"
            checked={isolateSelected}
            onChange={(event) => setIsolateSelected(event.target.checked)}
            className="h-3.5 w-3.5 accent-emerald-400"
          />
          Isolate
        </label>
        <button
          type="button"
          disabled={!selectedSummary.count}
          onClick={frameSelected}
          title="Move the 3D camera so the current selection fills the viewport."
          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Frame
        </button>
        <button
          type="button"
          disabled={!selectedVenue || !selectedSummary.geoJson || isLoading}
          onClick={() => void saveSelectedBuildingAsset()}
          title="Save the selected footprint geometry as this venue's building asset."
          className="rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-100 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save Building
        </button>
        <button
          type="button"
          disabled={!selectedVenue || (!selectedSummary.geoJson && !selectedVenueAsset) || isLoading}
          onClick={() => void movePinToSelectedBuilding()}
          title="Move the venue's map pin to the center of the selected building without changing its address text."
          className="rounded-lg border border-sky-500/35 bg-sky-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-sky-100 transition-colors hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Move Pin to Building
        </button>
        <button
          type="button"
          disabled={!selectedVenueAsset || isLoading}
          onClick={() => loadSavedBuildingAsset()}
          title="Discard the current selection and reload the last saved building asset."
          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reload
        </button>
      </div>
    </details>
  );
  const venueSummaryPanel = selectedVenue ? (
    <details
      className="rounded-2xl border border-white/10 bg-[#08090d]/92 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl"
      open
    >
      <summary className="cursor-pointer select-none">
        <div className="inline-flex w-[calc(100%-1rem)] items-start justify-between gap-3 align-middle">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-50">Venue Summary</h2>
            <p className="mt-0.5 truncate text-[11px] text-zinc-500">{selectedVenue.name}</p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {selectedVenueAsset && (
              <button
                type="button"
                disabled={isLoading}
                onClick={(event) => {
                  event.preventDefault();
                  void loadVenueGeometry(selectedVenue, { forceProvider: true });
                }}
                title="Load current provider footprints without replacing the saved asset."
                className="rounded-lg border border-sky-300/30 bg-sky-300/10 px-2.5 py-1.5 text-[11px] font-semibold text-sky-100 transition-colors hover:bg-sky-300/20 disabled:opacity-60"
              >
                Compare live
              </button>
            )}
            <button
              type="button"
              disabled={isLoading}
              onClick={(event) => {
                event.preventDefault();
                void loadVenueGeometry(selectedVenue);
              }}
              title="Load the preserved asset, or current provider footprints when no asset exists."
              className="rounded-lg border border-red-500/40 bg-red-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-red-100 transition-colors hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Load geometry
            </button>
          </div>
        </div>
      </summary>
      <div className="mt-3 space-y-2 text-xs text-zinc-300">
        <Row label="Listing type" value={selectedVenue.type} />
        <Row
          label="Address"
          value={formatListingAddress(selectedVenue, semv2Collections)}
          help="The venue address used as your real-world reference while choosing a building footprint."
          action={(
            <button
              type="button"
              onClick={() => void handleCopy('Venue address', formatListingAddress(selectedVenue, semv2Collections))}
              title="Copy venue address"
              aria-label="Copy venue address"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-400 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-zinc-100"
            >
              <Copy size={13} aria-hidden="true" />
            </button>
          )}
        />
        <Row
          label="Coordinates"
          value={selectedVenueCoords ? `${selectedVenueCoords.lat.toFixed(6)}, ${selectedVenueCoords.lng.toFixed(6)}` : 'Not resolved'}
          action={selectedVenueCoords ? (
            <button
              type="button"
              onClick={() => void handleCopy('Venue coordinates', `${selectedVenueCoords.lat.toFixed(6)}, ${selectedVenueCoords.lng.toFixed(6)}`)}
              title="Copy venue coordinates"
              aria-label="Copy venue coordinates"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-400 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-zinc-100"
            >
              <Copy size={13} aria-hidden="true" />
            </button>
          ) : undefined}
        />
        {selectedVenueLocationAudit && (
          <Row
            label="Pin audit"
            value={(
              <span className={selectedVenueLocationAudit.state === 'ready' ? 'text-emerald-300' : 'text-amber-200'}>
                {selectedVenueLocationAudit.label}
              </span>
            )}
            help={selectedVenueLocationAudit.reason}
          />
        )}
        <Row
          label="Address intelligence"
          value={(() => {
            const statusValue = addressIntelligence.status === 'idle' && selectedStoredBuildingVerification
              ? selectedStoredBuildingVerification.status
              : addressIntelligence.status;
            const label = statusValue === 'checking' ? 'Checking nearby buildings…'
              : statusValue === 'confirmed' ? 'Confirmed — auto-selected'
                : statusValue === 'probable' ? 'Probable match — review'
                  : statusValue === 'mismatch' ? 'Address mismatch — flagged'
                    : statusValue === 'unconfirmed' ? 'Could not confirm — flagged'
                      : statusValue === 'skipped' ? 'Skipped'
                        : 'Not checked yet';
            const className = statusValue === 'confirmed' ? 'text-emerald-300'
              : statusValue === 'checking' ? 'text-sky-300'
                : statusValue === 'probable' ? 'text-amber-200'
                  : statusValue === 'mismatch' || statusValue === 'unconfirmed' ? 'text-red-300'
                    : 'text-zinc-400';
            return <span className={className}>{label}</span>;
          })()}
          help={addressIntelligence.status === 'idle' && selectedStoredBuildingVerification
            ? `Last checked ${new Date(selectedStoredBuildingVerification.checkedAt).toLocaleString()}. ${selectedStoredBuildingVerification.notes?.join(' · ') ?? ''}`
            : addressIntelligence.message}
        />
        {(addressIntelligence.bestCandidate || selectedStoredBuildingVerification?.candidateAddress) && (
          <Row
            label="Best building match"
            value={addressIntelligence.bestCandidate?.address?.primary
              ?? selectedStoredBuildingVerification?.candidateAddress
              ?? 'Address unavailable'}
            help={addressIntelligence.bestCandidate
              ? `${Math.round(addressIntelligence.bestCandidate.confidence * 100)}% confidence · ${formatMeters(addressIntelligence.bestCandidate.distanceMeters)} from pin · ${addressIntelligence.bestCandidate.pinIntersects ? 'pin intersects footprint' : 'pin does not intersect footprint'} · searched ${addressIntelligence.searchRadiusMeters ?? DEFAULT_NEIGHBORHOOD_RADIUS_METERS}m`
              : selectedStoredBuildingVerification
                ? `${Math.round(selectedStoredBuildingVerification.confidence * 100)}% confidence · ${formatMeters(selectedStoredBuildingVerification.distanceMeters)} from pin · searched ${selectedStoredBuildingVerification.searchRadiusMeters ?? DEFAULT_NEIGHBORHOOD_RADIUS_METERS}m`
                : undefined}
          />
        )}
        {selectedVenueAssetPinDriftMeters !== null && selectedVenueAssetPinDriftMeters > 25 && (
          <Row
            label="Pin ↔ asset"
            value={<span className="text-amber-200">{Math.round(selectedVenueAssetPinDriftMeters)} m apart</span>}
            help={`Minimum distance from the canonical pin to the saved footprint. Centroid distance is secondary${selectedVenueAssetCentroidDistanceMeters === null ? '' : ` (${Math.round(selectedVenueAssetCentroidDistanceMeters)} m)`}. A pin inside the footprint is never flagged.`}
          />
        )}
        <Row
          label="Provider feature ID"
          value={resolvedVenueFeatureId ?? workspaceProviderFeatureIds[0] ?? getListingProviderFeatureId(selectedVenue) ?? 'Not resolved yet'}
          help="An internal building ID from the map-tile provider. It is useful for provenance, but it is not the venue ID and does not by itself prove this is the correct building."
        />
        <Row
          label="Building asset"
          value={selectedVenueAsset
            ? selectedVenueAssetIsShared
              ? `Shared via ${selectedVenueAssetOwnerListing?.name ?? 'venue'}`
              : 'Has asset'
            : 'Missing asset'}
          help="Building geometry belongs to the physical venue. Events at a venue automatically reuse its verified asset instead of requiring a second building selection."
        />
        {generatedBuildingCandidate && generatedPolygonIndices.length > 0 && (
          <div className="mt-3 rounded-xl border border-cyan-300/25 bg-cyan-300/[0.06] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-100">Generated footprint estimate</div>
                <p className="mt-1 text-[10px] leading-4 text-zinc-400">No sourced building footprint intersected the verified venue pin, so SwingSphere created a reviewable geometry candidate instead of leaving the venue blank.</p>
              </div>
              <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[9px] font-semibold text-cyan-100">Human review</span>
            </div>
            <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px] leading-4">
              <span className="text-zinc-600">Source</span><span className="text-zinc-300">{generatedBuildingCandidate.sourceLabel}</span>
              <span className="text-zinc-600">Inputs</span><span className="text-zinc-300">Verified venue pin + nearby open building geometry</span>
              <span className="text-zinc-600">Method</span><span className="text-zinc-300">{generatedBuildingCandidate.method === 'nearby-orientation-estimate' ? 'Nearby-building orientation and size estimate' : 'Conservative rectangle centered on verified pin'}</span>
              <span className="text-zinc-600">Estimate</span><span className="text-zinc-300">{generatedBuildingCandidate.widthMeters.toFixed(0)} × {generatedBuildingCandidate.depthMeters.toFixed(0)} m · {generatedBuildingCandidate.heightMeters.toFixed(1)} m tall</span>
              <span className="text-zinc-600">Confidence</span><span className="text-zinc-300">{Math.round(generatedBuildingCandidate.confidence * 100)}% geometry estimate</span>
            </div>
            <p className="mt-2 text-[9px] leading-3.5 text-zinc-500">{generatedBuildingCandidate.sourceDetail} This geometry is never automatically accepted or saved.</p>
            <button
              type="button"
              onClick={() => {
                setSuggestedPolygonIndices([]);
                setSelectedPolygonIndices(generatedPolygonIndices);
                setAssetStatusMessage('Generated footprint selected for review. Save Building remains an explicit manual confirmation.');
                setStatus('Generated SwingSphere footprint selected. Compare it with the street plane before saving.');
              }}
              className="mt-3 w-full rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-left text-[10px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/20"
            >
              Select generated footprint
            </button>
          </div>
        )}
        {selectedVenueAsset && (
          <Row
            label="Asset updated"
            value={new Date(selectedVenueAsset.capture.updatedAt).toLocaleString()}
          />
        )}
        {selectedVenueAsset && (
          <Row
            label="Asset polygons"
            value={String(selectedVenueAsset.capture.polygonCount)}
          />
        )}
        <Row
          label="Editor state"
          value={saveStateLabel}
          help="Shows whether the current footprint selection matches the saved building asset or still needs to be saved."
        />
        {selectedBuildingEvidence && (
          <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-100">Human building review</div>
            <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px] leading-4">
              <span className="text-zinc-600">Listing address</span><span className="text-zinc-300">{formatListingAddress(selectedVenue, semv2Collections)}</span>
              <span className="text-zinc-600">Stored pin</span><span className="text-zinc-300">{selectedVenueCoords ? `${selectedVenueCoords.lat.toFixed(6)}, ${selectedVenueCoords.lng.toFixed(6)}` : 'Unavailable'}</span>
              <span className="text-zinc-600">Recommended</span><span className="text-zinc-300">{selectedBuildingEvidence.bestCandidate?.candidateAddress ?? 'Address unresolved'}</span>
              <span className="text-zinc-600">Relationship</span><span className="text-zinc-300">{selectedBuildingEvidence.bestCandidate?.pinIntersects ? 'Pin is inside footprint' : `${selectedBuildingEvidence.bestCandidate?.minimumPinToFootprintMeters.toFixed(1) ?? 'n/a'} m minimum distance`}</span>
              <span className="text-zinc-600">Evidence</span><span className="text-zinc-300">{selectedBuildingEvidence.outcome} · score {selectedBuildingEvidence.bestCandidate?.score ?? 'n/a'} · margin {selectedBuildingEvidence.scoreMargin ?? 'n/a'}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => void acceptRecommendedBuildingForReview()} className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2 py-1.5 text-[10px] font-semibold text-emerald-100 hover:bg-emerald-400/20">Accept recommended</button>
              <button type="button" disabled={!selectedVenueAsset} onClick={() => { loadSavedBuildingAsset(); void recordBuildingReview('keep_existing_building'); }} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] font-semibold text-zinc-200 hover:bg-white/10 disabled:opacity-40">Keep existing</button>
              <button type="button" onClick={async () => { await movePinToSelectedBuilding(); await recordBuildingReview('move_pin_to_recommended_building'); }} className="rounded-lg border border-sky-300/25 bg-sky-300/10 px-2 py-1.5 text-[10px] font-semibold text-sky-100 hover:bg-sky-300/20">Move pin</button>
              <button type="button" onClick={() => void recordBuildingReview('mark_location_for_research')} className="rounded-lg border border-rose-300/25 bg-rose-300/10 px-2 py-1.5 text-[10px] font-semibold text-rose-100 hover:bg-rose-300/20">Mark for research</button>
            </div>
            <p className="mt-2 text-[9px] leading-3.5 text-zinc-500">Accept selects the footprint for inspection; Save Building remains the explicit asset write. Move pin is an explicit canonical coordinate change.</p>
          </div>
        )}
      </div>
    </details>
  ) : null;

  const menuPanelClassName = 'absolute left-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(42rem,calc(100vh-7rem))] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-white/10 bg-[#08090d]/98 p-3 shadow-2xl shadow-black/60 backdrop-blur-xl';
  const menuSummaryClassName = 'cursor-pointer list-none rounded-lg px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white [&::-webkit-details-marker]:hidden';

  return (
    <main className={shellClassName}>
      <style>{`
        @keyframes loading-bar {
          0% { transform: translateX(-140%); }
          100% { transform: translateX(240%); }
        }
        .building-inspector-sidebar:not(.show-advanced-controls) > :nth-child(n+3):not(.building-inspector-venue-picker) { display: none; }
      `}</style>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,76,76,0.08),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.04),_transparent_30%)]" />

      <div className="relative z-10 flex h-full min-h-0 flex-col gap-3 p-3">
        <header className="relative z-40 flex min-h-12 shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-[#0a0b0f]/96 px-2 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="mr-3 flex min-w-0 items-center gap-2 px-2">
            <div className="h-2.5 w-2.5 rounded-full bg-red-400 shadow-[0_0_14px_rgba(248,113,113,0.7)]" />
            <span className="truncate text-sm font-semibold text-zinc-100">Building Inspector</span>
          </div>

          <details className="group relative">
            <summary className={menuSummaryClassName}>File</summary>
            <div className={menuPanelClassName}>
              <div className="space-y-2">
                <button type="button" disabled={!selectedVenue || !selectedSummary.geoJson || isLoading} onClick={() => void saveSelectedBuildingAsset()} className="w-full rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-3 py-2 text-left text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50">Save Building</button>
                <button type="button" disabled={!selectedVenueAsset || isLoading} onClick={() => loadSavedBuildingAsset()} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-50">Reload Saved Building</button>
                <Link to={embedded ? '/dev/building-inspector' : '/map'} className="block rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10">{embedded ? 'Open full studio' : 'Back to map'}</Link>
              </div>
            </div>
          </details>

          <details className="group relative">
            <summary className={menuSummaryClassName} title="Control the 3D scene reference layers and camera.">View</summary>
            <div className={menuPanelClassName}>
              <div className="space-y-2 text-xs text-zinc-200">
                <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2" title="Red beacon showing the venue's stored latitude/longitude."><input type="checkbox" checked={showVenueMarker} onChange={(event) => setShowVenueMarker(event.target.checked)} className="accent-red-400" />Venue marker</label>
                <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2" title="Project the live street-reference map onto the 3D ground plane so buildings can be matched to real streets."><input type="checkbox" checked={showStreetFloor} onChange={(event) => setShowStreetFloor(event.target.checked)} className="accent-sky-300" />Street plane</label>
                <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2" title="Show nearby provider buildings when raw provider geometry is enabled."><input type="checkbox" checked={showNearbyBuildings} onChange={(event) => setShowNearbyBuildings(event.target.checked)} />Nearby buildings</label>
                <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2" title="Show the metric orientation grid above the street plane."><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />Metric grid</label>
                <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2" title="Hide everything except the current green selection."><input type="checkbox" checked={isolateSelected} onChange={(event) => setIsolateSelected(event.target.checked)} className="accent-emerald-400" />Isolate selected</label>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button type="button" disabled={!selectedSummary.count} onClick={frameSelected} title="Move the camera to the selected building footprint." className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10 disabled:opacity-50">Frame selection</button>
                  <button type="button" disabled={!selectedVenue || !sceneOrigin} onClick={frameVenue} title="Move the camera to the venue's stored pin coordinate." className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10 disabled:opacity-50">Frame venue</button>
                </div>
              </div>
            </div>
          </details>

          <details className="group relative">
            <summary className={menuSummaryClassName} title="Venue address, coordinates, provider match, and saved-asset state.">Venue</summary>
            <div className={menuPanelClassName}>{venueSummaryPanel ?? <p className="p-2 text-xs text-zinc-500">Select a venue from the left panel.</p>}</div>
          </details>

          <details className="group relative">
            <summary className={menuSummaryClassName} title="Inspect the current green footprint selection and save it as the venue building.">Selection</summary>
            <div className={menuPanelClassName}>{selectionWorkspacePanel}</div>
          </details>

          <details className="group relative">
            <summary className={menuSummaryClassName} title="Inspect nearby building geometry and provider provenance.">Workspace</summary>
            <div className={menuPanelClassName}>{providerNeighborhoodManager}</div>
          </details>

          <details className="group relative">
            <summary className={menuSummaryClassName} title="Technical resolver status and failure details.">Diagnostics</summary>
            <div className={menuPanelClassName}>
              {resolverStatusPanel}
              <button type="button" onClick={() => setShowAdvancedSidebar((value) => !value)} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-200">{showAdvancedSidebar ? 'Hide advanced controls' : 'Show advanced controls'}</button>
              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs font-semibold text-zinc-100">Current status</div>
                <p className="mt-2 text-[11px] leading-5 text-zinc-400">{status}</p>
              </div>
            </div>
          </details>

          <div className="ml-auto hidden min-w-0 items-center gap-3 px-3 text-[11px] text-zinc-500 md:flex">
            <span className="max-w-64 truncate">{selectedVenue?.name ?? 'No venue selected'}</span>
            <span className={saveStateLabel === 'Saved' ? 'text-emerald-300' : 'text-amber-200'}>{saveStateLabel}</span>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] gap-3">
      <aside className={`building-inspector-sidebar ${showAdvancedSidebar ? 'show-advanced-controls' : ''} ${sidebarClassName}`}>
        <div className="border-b border-white/10 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-red-300/80">
                {embedded ? 'Admin tool' : 'Internal tool'}
              </p>
              <h1 className="mt-1 text-lg font-semibold text-zinc-50">Building Inspector</h1>
            </div>
            {!embedded && (
              <Link
                to="/map"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/10"
              >
                <ArrowLeft size={14} />
                Back to map
              </Link>
            )}
            {embedded && (
              <Link
                to="/dev/building-inspector"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/10"
              >
                Open Studio
              </Link>
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-400">
            Match a venue to the correct real-world building, verify it against the street plane, then save the selected footprint.
          </p>
          <p className="mt-2 text-[11px] leading-5 text-zinc-500">
            The provider match is only a starting guess. Use the red venue beacon, street labels, and green selection to confirm the building before saving.
          </p>
        </div>

        <BuildingVerificationAuditPanel
          listings={listings}
          venues={venues}
          organizations={organizations}
          relationships={relationships}
          buildingAssets={buildingAssets}
          evidenceRecords={buildingEvidenceRecords}
          onSelectListing={(listingId) => {
            const listing = listings.find((candidate) => candidate.id === listingId);
            if (listing) void loadVenueGeometry(listing);
          }}
        />

        {(
          <section className="building-inspector-venue-picker border-b border-white/10 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-50">Select venue</h2>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                  Choose an existing club or event. The inspector resolves provider geometry behind the scenes.
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-right text-[11px] text-zinc-400">
                <div className="text-zinc-500">Ready / pin review</div>
                <div className="font-semibold text-zinc-100">{venueStats.missing} / <span className="text-amber-200">{venueStats.locationReview}</span></div>
              </div>
            </div>

            <label className="mt-3 block space-y-1">
              <span className="text-[11px] uppercase tracking-wide text-zinc-500">Search venue</span>
              <input
                value={venueSearch}
                onChange={(event) => setVenueSearch(event.target.value)}
                className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-red-400/60"
                placeholder="Search by name, city, address, or type"
              />
            </label>

            <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
              {([
                ['all', `All ${venueStats.total}`],
                ['missing', `Ready ${venueStats.missing}`],
                ['location', `Pin review ${venueStats.locationReview}`],
                ['has', `Has asset ${venueStats.withAssets}`],
              ] as Array<[BuildingAssetFilter, string]>).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAssetFilter(value)}
                  className={`rounded-lg border px-2 py-2 text-[11px] font-semibold transition-colors ${
                    assetFilter === value
                      ? 'border-red-400/50 bg-red-500/20 text-red-100'
                      : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
              {filteredVenues.length ? filteredVenues.slice(0, 80).map((listing) => {
                const isSelected = selectedVenueId === listing.id;
                const asset = getBuildingAssetForListing(listing, buildingAssets, venues, listings, organizations, relationships);
                const locationAudit = listingLocationAudits.get(listing.id) ?? getBuildingLocationAudit(listing, semv2Collections);
                const assetLabel = asset
                  ? (asset.listingId === listing.id ? 'Has asset' : 'Shared asset')
                  : locationAudit.state === 'ready'
                    ? 'Ready for asset'
                    : locationAudit.label;
                const assetLabelClass = asset
                  ? 'text-emerald-300'
                  : locationAudit.state === 'ready'
                    ? 'text-red-200'
                    : 'text-amber-200';
                return (
                  <button
                    key={listing.id}
                    type="button"
                    onClick={() => void loadVenueGeometry(listing)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      isSelected
                        ? 'border-red-400/50 bg-red-500/15'
                        : 'border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-zinc-100">{listing.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                        listing.type === 'club' ? 'bg-sky-500/15 text-sky-200' : 'bg-amber-500/15 text-amber-200'
                      }`}>
                        {listing.type}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-zinc-500">{getListingCityLabel(listing, semv2Collections)}</div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-[11px]">
                      <span className="truncate text-zinc-400">{formatListingAddress(listing, semv2Collections)}</span>
                      <span className={assetLabelClass} title={!asset ? locationAudit.reason : undefined}>
                        {assetLabel}
                      </span>
                    </div>
                  </button>
                );
              }) : (
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-4 text-xs text-zinc-500">
                  No venues match the current filters.
                </div>
              )}
            </div>
          </section>
        )}

        <details className="border-b border-white/10" open={!embedded}>
          <summary className="cursor-pointer select-none px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 transition-colors hover:text-zinc-200">
            Landmark Tests
          </summary>
          <div className="px-4 pb-4">
            <p className="text-[11px] leading-5 text-zinc-500">
              Developer validation fixtures. Loading a landmark uses the same venue resolver and workspace pipeline as ordinary venues.
            </p>
            <div className="mt-3 space-y-2">
              {LANDMARK_TESTS.map((landmark) => (
                <label
                  key={landmark.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                    selectedLandmarkId === landmark.id
                      ? 'border-amber-300/45 bg-amber-400/12 text-amber-100'
                      : 'border-white/10 bg-black/20 text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  <input
                    type="radio"
                    name="building-inspector-landmark"
                    checked={selectedLandmarkId === landmark.id}
                    onChange={() => setSelectedLandmarkId(landmark.id)}
                    className="mt-0.5 h-3.5 w-3.5 accent-amber-300"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-zinc-100">{landmark.name}</span>
                    <span className="mt-0.5 block text-[11px] text-zinc-500">
                      {landmark.city} | expected {formatMeters(landmark.expectedHeightMeters)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={isLoading || !selectedLandmarkId}
              onClick={() => void loadLandmarkTest()}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300/35 bg-amber-400/15 px-3 py-2 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Search size={14} className={isLoading ? 'animate-spin' : ''} />
              {isLoading ? 'Loading landmark' : 'Load Landmark'}
            </button>
            {landmarkValidation ? (
              <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-[11px] text-zinc-400">
                <Row label="Expected footprint" value={landmarkValidation.expectedFootprint} />
                <Row label="Expected height" value={formatMeters(landmarkValidation.expectedHeightMeters)} />
                <Row label="Rendered max height" value={formatMeters(workspaceBuildings.length ? maxMetric(workspaceBuildings.map((building) => building.maxRenderHeightMeters)) : selectedSummary.maxRenderHeightMeters)} />
                <Row label="Selected max height" value={formatMeters(selectedSummary.maxRenderHeightMeters)} />
                <Row label="Provider polygons loaded" value={String(providerCandidates.reduce((total, candidate) => total + candidate.polygonCount, 0))} />
                <Row label="Workspace polygons" value={String(workspaceSummary.polygons)} />
                <Row label="Building groups" value={String(workspaceSummary.buildings)} />
                <Row label="Selected building" value={selectedSummary.indices.length ? selectedSummary.indices.map((index) => index + 1).join(', ') : 'None'} />
                <Row label="Bounding box" value={selectedSummary.count ? formatBounds(selectedSummary.bbox) : formatBounds(resolution?.bbox ?? null)} />
                <Row label="Polygon count" value={String(selectedSummary.count || polygonRecords.length)} />
                <Row label="Area" value={selectedSummary.count ? `${formatNumber(selectedSummary.areaMeters, 0)} m²` : 'Select polygons to measure'} />
              </div>
            ) : null}
          </div>
        </details>

        <details className="border-b border-white/10" open={!embedded}>
          <summary className="cursor-pointer select-none px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 transition-colors hover:text-zinc-200">
            Advanced provider feature lookup
          </summary>
          <form
            className="px-4 pb-4"
            onSubmit={(event) => {
              event.preventDefault();
              void resolveFeature();
            }}
          >
            <label className="space-y-1">
              <span className="text-[11px] uppercase tracking-wide text-zinc-500">Feature id</span>
              <div className="flex gap-2">
                <input
                  value={featureIdInput}
                  onChange={(event) => setFeatureIdInput(event.target.value)}
                  className="h-10 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-red-400/60"
                  placeholder="13581200"
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/20 px-3 text-sm text-red-100 transition-colors hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Search size={14} className={isLoading ? 'animate-spin' : ''} />
                  {isLoading ? 'Loading' : 'Load'}
                </button>
              </div>
            </label>
            <p className="mt-2 text-[11px] leading-5 text-zinc-500">
              Manual feature ID lookup is an advanced provider workflow. This view does not load basemaps, roads, labels, or nearby buildings.
            </p>
            {isLoading && (
              <div className="mt-3 space-y-2 rounded-lg border border-red-500/25 bg-black/25 px-3 py-3">
                <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-400">
                  <span>{loadingPhase ?? 'Loading feature'}</span>
                  <span className="text-red-200">working</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-red-400 to-transparent"
                    style={{ animation: 'loading-bar 1.1s ease-in-out infinite' }}
                  />
                </div>
              </div>
            )}
            <div className="mt-3 border-t border-white/10 pt-3">
              <button
                type="button"
                disabled={!selectedSummary.geoJson}
                onClick={() => {
                  if (!selectedSummary.geoJson) return;
                  const suffix = selectedSummary.count === 1
                    ? `polygon-${selectedSummary.indices[0] + 1}`
                    : `multipolygon-${selectedSummary.indices.map((index) => index + 1).join('-')}`;
                  exportGeoJSONFeature(
                    selectedSummary.geoJson,
                    `building-${resolution?.featureId ?? featureIdInput}-${suffix}.geojson`,
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-zinc-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export selected GeoJSON
              </button>
              <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                GeoJSON export is retained for development checks. The primary workflow is Save Building.
              </p>
            </div>
          </form>
        </details>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <section className="rounded-xl border border-red-500/20 bg-red-500/8 p-3">
            <div className="text-sm font-semibold text-red-100">Status</div>
            <p className="mt-2 text-xs leading-5 text-zinc-300">{status}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
              <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-2">
                <div className="text-zinc-500">Feature id</div>
                <div className="mt-1 text-zinc-100">{resolution?.featureId ?? featureIdInput}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-2">
                <div className="text-zinc-500">Loaded source</div>
                <div className="mt-1 text-zinc-100">{resolution?.source ?? 'n/a'}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-2">
                <div className="text-zinc-500">Source-layer</div>
                <div className="mt-1 text-zinc-100">{resolution?.sourceLayer ?? SOURCE_LAYER}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-2">
                <div className="text-zinc-500">Primary tile</div>
                <div className="mt-1 text-zinc-100">{resolution?.primaryTile ?? 'n/a'}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-2">
                <div className="text-zinc-500">Returned features</div>
                <div className="mt-1 text-zinc-100">{forensicReport?.returnedFeatureCount ?? 0}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-2">
                <div className="text-zinc-500">Model polygons</div>
                <div className="mt-1 text-zinc-100">{polygonRecords.length}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-2">
                <div className="text-zinc-500">Provider tile</div>
                <div className="mt-1 text-zinc-100">{loadedFeatureCount}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-2">
                <div className="text-zinc-500">Unique loaded ids</div>
                <div className="mt-1 text-zinc-100">{loadedUniqueIdCount}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-2">
                <div className="text-zinc-500">Reference polygons</div>
                <div className="mt-1 text-zinc-100">{referencePolygonRecords.length}</div>
              </div>
            </div>
          </section>

          <section className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-50">Workspace</h2>
              <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-zinc-400">
                {workspaceSummary.radiusMeters}m
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
              <MiniStat label="Buildings" value={String(workspaceSummary.buildings)} />
              <MiniStat label="Editable polygons" value={String(workspaceSummary.polygons)} />
              <MiniStat label="Selected polygons" value={String(workspaceSummary.selected)} />
              <MiniStat label="Provider tile" value={String(workspaceSummary.providerTile)} />
            </div>
            <p className="mt-3 text-[11px] leading-5 text-zinc-500">
              The authoring workspace is built from flattened provider polygons near the venue. Provider IDs are provenance only.
            </p>
          </section>

          <details className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3" open>
            <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-50">Selection Inspector</summary>
            <div className="mt-3 space-y-2 text-xs text-zinc-300">
              <Row label="Geometry type" value={selectedMetrics.geometryType} />
              <Row label="Selected count" value={String(selectedSummary.count)} />
              <Row label="Selected indices" value={selectedSummary.indices.length ? selectedSummary.indices.map((index) => index + 1).join(', ') : 'n/a'} />
              <Row label="Combined area" value={selectedSummary.count ? `${formatNumber(selectedSummary.areaMeters, 0)} m²` : 'n/a'} />
              <Row label="Combined bbox" value={selectedSummary.count ? formatBounds(selectedSummary.bbox) : 'n/a'} />
              <Row label="Max render height" value={formatMeters(selectedSummary.maxRenderHeightMeters)} />
              <Row label="Avg render height" value={formatMeters(selectedSummary.avgRenderHeightMeters)} />
              <Row label="Ring count" value={String(selectedSummary.ringCount)} />
              <Row label="Total vertices" value={String(selectedSummary.vertexCount)} />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-zinc-200 transition-colors hover:bg-white/10">
                <input
                  type="checkbox"
                  checked={isolateSelected}
                  onChange={(event) => setIsolateSelected(event.target.checked)}
                  className="h-3.5 w-3.5 accent-emerald-400"
                />
                Isolate selected
              </label>
              <button
                type="button"
                disabled={!selectedSummary.count}
                onClick={frameSelected}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-zinc-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Frame selected
              </button>
              <button
                type="button"
                disabled={!selectedVenue || !sceneOrigin}
                onClick={frameVenue}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-zinc-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Frame Venue
              </button>
              <button
                type="button"
                disabled={!selectedVenue || !selectedSummary.geoJson || isLoading}
                onClick={() => void saveSelectedBuildingAsset()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] text-emerald-100 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save Building
              </button>
              <button
                type="button"
                disabled={!selectedVenueAsset || isLoading}
                onClick={() => loadSavedBuildingAsset()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-zinc-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reload Saved Building
              </button>
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-zinc-400">
              Asset state: <span className="font-semibold text-zinc-100">{saveStateLabel}</span>
              {assetStatusMessage ? <div className="mt-1 text-zinc-300">{assetStatusMessage}</div> : null}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <label className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-zinc-200 transition-colors hover:bg-white/10">
                <input
                  type="checkbox"
                  checked={showVenueMarker}
                  onChange={(event) => setShowVenueMarker(event.target.checked)}
                  className="h-3.5 w-3.5 accent-red-400"
                />
                Venue Marker
              </label>
              <label className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-zinc-200 transition-colors hover:bg-white/10">
                <input
                  type="checkbox"
                  checked={showNearbyBuildings}
                  onChange={(event) => setShowNearbyBuildings(event.target.checked)}
                  className="h-3.5 w-3.5 accent-zinc-300"
                />
                Nearby Buildings
              </label>
              <label className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-zinc-200 transition-colors hover:bg-white/10">
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={(event) => setShowGrid(event.target.checked)}
                  className="h-3.5 w-3.5 accent-zinc-300"
                />
                Grid
              </label>
            </div>

            <p className="mt-3 text-[11px] leading-5 text-zinc-500">
              Hover to preview. Click to replace selection. Shift-click or Ctrl-click to add or remove footprints.
            </p>
          </details>

          <details className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
            <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-50">Selected polygon GeoJSON</summary>
            <pre className="mt-3 max-h-[30rem] overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] leading-5 text-zinc-300 whitespace-pre-wrap">
              {selectedPolygonGeoJSONText || 'Click a footprint to preview its GeoJSON here.'}
            </pre>
          </details>

          <details className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
            <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-50">Developer Diagnostics</summary>
            <div className="mt-3 space-y-3">
          <details className="rounded-xl border border-white/10 bg-black/15 p-3">
            <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-50">Raw querySourceFeatures() dump</summary>
            <pre className="mt-3 max-h-[24rem] overflow-auto rounded-lg border border-white/10 bg-black/25 p-3 text-[11px] leading-5 text-zinc-300 whitespace-pre-wrap">
{forensicReport
  ? [
      `Feature ID: ${forensicReport.selectedFeatureId}`,
      `Returned features: ${forensicReport.returnedFeatureCount}`,
      `Unique tiles: ${forensicReport.selectedTileCount}`,
      `Unique centroids: ${forensicReport.selectedUniqueCentroids}`,
      `Loaded features: ${forensicReport.loadedFeatureCount}`,
      `Unique loaded ids: ${forensicReport.loadedUniqueIdCount}`,
      '',
      ...forensicReport.rawFeatureDumpLines,
    ].join('\n')
  : 'Load a feature id to print the raw source objects here.'}
            </pre>
          </details>

          <details className="rounded-xl border border-white/10 bg-black/15 p-3">
            <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-50">Fragments</summary>
            <div className="mt-3 space-y-2">
              {fragmentRecords.length ? fragmentRecords.map((fragment, index) => (
                <div
                  key={`${fragment.featureId}-${fragment.tile}-${index}`}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    resolution?.primaryTile === fragment.tile && resolution.featureId === fragment.featureId
                      ? 'border-red-400/40 bg-red-500/10 text-zinc-200'
                      : 'border-white/10 bg-black/20 text-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-zinc-100">
                      Fragment {index + 1}{' '}
                      {resolution?.primaryTile === fragment.tile && resolution.featureId === fragment.featureId ? '(rendered)' : ''}
                    </div>
                    <div className="text-zinc-500">{fragment.tile}</div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
                    <MiniStat label="Geometry" value={fragment.geometryType} />
                    <MiniStat label="Polygon count" value={formatDiagnosticMetric(fragment.polygonCount)} />
                    <MiniStat label="Ring count" value={formatDiagnosticMetric(fragment.ringCount)} />
                    <MiniStat label="Vertices" value={formatDiagnosticMetric(fragment.vertexCount)} />
                    <MiniStat label="Area" value={`${formatNumber(fragment.areaMeters, 0)} m²`} />
                    <MiniStat label="Centroid" value={fragment.centroid ? `${fragment.centroid[1].toFixed(6)}, ${fragment.centroid[0].toFixed(6)}` : 'n/a'} />
                    <MiniStat label="Distance from Twist" value={fragment.distanceFromTwistMeters ? formatMeters(fragment.distanceFromTwistMeters) : 'n/a'} />
                    <MiniStat label="BBox" value={formatBounds(fragment.bbox)} />
                    <MiniStat label="Disconnected pieces" value={formatDiagnosticMetric(fragment.disconnectedPieces)} />
                  </div>
                </div>
              )) : (
                <p className="text-xs text-zinc-500">Load a feature id to see its returned fragments.</p>
              )}
            </div>
          </details>

          <details className="rounded-xl border border-white/10 bg-black/15 p-3">
            <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-50">Raw GeoJSON</summary>
            <pre className="mt-3 max-h-[32rem] overflow-auto rounded-lg border border-white/10 bg-black/25 p-3 text-[11px] leading-5 text-zinc-300">
              {rawGeoJSONText || 'Load a feature id to print the loaded raw GeoJSON fragments here.'}
            </pre>
          </details>

          <details className="rounded-xl border border-white/10 bg-black/15 p-3">
            <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-50">Duplicate ids in view</summary>
            <div className="mt-3 space-y-2">
              {duplicateSummaries.length ? duplicateSummaries.slice(0, 25).map((item) => (
                <div key={item.featureId} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-zinc-100">{item.featureId}</div>
                    <div className="text-zinc-500">{item.fragmentCount} fragments</div>
                  </div>
                  <div className="mt-1 text-zinc-500">
                    Connected pieces: {formatDiagnosticMetric(item.disconnectedPieces)}
                  </div>
                  <div className="mt-1 break-words text-zinc-400">
                    Tiles: {item.tileSet.join(', ')}
                  </div>
                </div>
              )) : (
                <p className="text-xs text-zinc-500">No duplicate feature ids were returned by the current source window.</p>
              )}
            </div>
          </details>
            </div>
          </details>
        </div>
      </aside>

      <section className="relative min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-2xl shadow-black/30">
        <div ref={sceneContainerRef} className="h-full w-full" />
        {isLoading ? (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/35 backdrop-blur-[2px]" aria-live="polite" aria-busy="true">
            <div className="w-[min(34rem,calc(100%-3rem))] overflow-hidden rounded-2xl border border-white/15 bg-[#08090d]/96 shadow-2xl shadow-black/70 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-4 px-4 pb-3 pt-4">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-300">Building Inspector</div>
                  <div className="mt-1 truncate text-sm font-semibold text-zinc-100">
                    {loadingPhase === 'Saving building asset'
                      ? 'Saving building asset'
                      : loadingPhase === 'Moving venue pin'
                        ? 'Updating venue location'
                        : selectedVenue
                          ? `Loading ${selectedVenue.name}`
                          : 'Loading building data'}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-400">{loadingPhase ?? 'Preparing venue geometry'}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.65)]" />
                  Working
                </div>
              </div>
              <div className="h-1.5 overflow-hidden bg-white/10">
                <div
                  className="h-full w-1/3 bg-gradient-to-r from-transparent via-red-400 to-transparent"
                  style={{ animation: 'loading-bar 1.05s ease-in-out infinite' }}
                />
              </div>
            </div>
          </div>
        ) : null}
        {selectedVenue && resolverState.failure && resolverState.failure !== 'FEATURE_FOUND' ? (
          <div className="pointer-events-none absolute left-4 top-4 z-20 w-[min(24rem,calc(100%-2rem))] rounded-xl border border-rose-400/25 bg-[#12090d]/94 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-rose-200">Action required</div>
              <div className="rounded-full border border-rose-400/20 bg-rose-400/10 px-2 py-0.5 text-[9px] text-rose-200">{resolverState.failure}</div>
            </div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">{RESOLVER_FAILURE_COPY[resolverState.failure].title}</div>
            <div className="mt-1 text-[11px] leading-4 text-zinc-400">{RESOLVER_FAILURE_COPY[resolverState.failure].action}</div>
          </div>
        ) : null}
        {selectedVenue && (!resolverState.failure || resolverState.failure === 'FEATURE_FOUND') && ['checking', 'unconfirmed', 'mismatch', 'skipped'].includes(addressIntelligence.status) ? (
          <div className={`pointer-events-none absolute left-4 top-4 z-20 w-[min(24rem,calc(100%-2rem))] rounded-xl border p-3 shadow-2xl shadow-black/50 backdrop-blur-xl ${addressIntelligence.status === 'checking' ? 'border-sky-300/25 bg-[#080d14]/94' : addressIntelligence.status === 'skipped' ? 'border-violet-300/20 bg-[#0d0914]/94' : 'border-amber-300/25 bg-[#120f08]/94'}`}>
            <div className="flex items-center justify-between gap-3">
              <div className={`text-[10px] font-bold uppercase tracking-[0.14em] ${addressIntelligence.status === 'checking' ? 'text-sky-200' : addressIntelligence.status === 'skipped' ? 'text-violet-200' : 'text-amber-200'}`}>
                {addressIntelligence.status === 'checking' ? 'Shadow verification running' : addressIntelligence.status === 'skipped' ? 'Verification skipped' : 'Human review required'}
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-zinc-300">No automatic writes</div>
            </div>
            <div className="mt-1 text-[11px] leading-4 text-zinc-300">{addressIntelligence.message}</div>
          </div>
        ) : null}
        <div className="absolute bottom-20 left-4 z-20 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 text-[10px]">
          <div className="pointer-events-none flex items-center gap-2 rounded-xl border border-white/10 bg-[#08090d]/88 px-2.5 py-2 text-zinc-400 shadow-xl shadow-black/40 backdrop-blur-md">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/30 text-[9px] font-bold text-zinc-200">
              N
              <span
                ref={compassNeedleRef}
                className="absolute inset-0 flex origin-center items-start justify-center pt-0.5 text-sm leading-none text-sky-300"
                style={{ transform: 'rotate(0deg)' }}
                aria-hidden="true"
              >
                ↑
              </span>
            </span>
            <span>North in 3D</span>
          </div>
          <button
            type="button"
            aria-pressed={showStreetFloor}
            onClick={() => setShowStreetFloor((current) => !current)}
            title="Toggle the street-aligned ground plane beneath the 3D buildings."
            className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-3 py-2.5 font-semibold shadow-xl shadow-black/40 backdrop-blur-md transition-colors ${showStreetFloor ? 'border-sky-300/30 bg-sky-300/15 text-sky-100 hover:bg-sky-300/20' : 'border-white/10 bg-[#08090d]/88 text-zinc-400 hover:bg-white/10'}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${showStreetFloor && streetReferenceStatus === 'Ready' ? 'bg-emerald-300' : showStreetFloor ? 'bg-amber-300' : 'bg-zinc-600'}`} />
            Street plane · {showStreetFloor ? streetReferenceStatus : 'Off'}
          </button>
          <button
            type="button"
            aria-pressed={showGrid}
            onClick={() => setShowGrid((current) => !current)}
            title="Overlay the metric measurement grid on the street plane."
            className={`pointer-events-auto rounded-xl border px-3 py-2.5 font-semibold shadow-xl shadow-black/40 backdrop-blur-md transition-colors ${showGrid ? 'border-white/25 bg-white/15 text-zinc-100 hover:bg-white/20' : 'border-white/10 bg-[#08090d]/88 text-zinc-400 hover:bg-white/10'}`}
          >
            Metric grid
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void cycleBuildingSource()}
            title="Cycle the building source: Auto prefers OpenStreetMap/OpenFreeMap and fills missing coverage with Microsoft ML footprints; OSM uses OpenFreeMap only; Microsoft uses Microsoft footprints only."
            className="pointer-events-auto flex items-center gap-2 rounded-xl border border-violet-300/25 bg-[#08090d]/88 px-3 py-2.5 font-semibold text-violet-100 shadow-xl shadow-black/40 backdrop-blur-md transition-colors hover:bg-violet-300/10 disabled:cursor-wait disabled:opacity-60"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${loadedBuildingSourceLabel.includes('Microsoft') || loadedBuildingSourceLabel.includes('Hybrid') ? 'bg-violet-300' : loadedBuildingSourceLabel.includes('OSM') || loadedBuildingSourceLabel.includes('OpenFreeMap') ? 'bg-emerald-300' : 'bg-zinc-500'}`} />
            <span>Buildings · {BUILDING_SOURCE_MODE_LABELS[buildingSourceMode]}</span>
            <span className="max-w-40 truncate text-[9px] font-medium text-zinc-500">{loadedBuildingSourceLabel}</span>
          </button>
          <button
            type="button"
            disabled={!selectedVenue || isLoading}
            onClick={() => void reloadBuildingSource()}
            title={loadedBuildingSourceLabel.startsWith('Saved ·')
              ? `Load the live ${BUILDING_SOURCE_MODE_LABELS[buildingSourceMode]} neighborhood around ${selectedVenue?.name ?? 'the selected venue'} so the saved asset can be compared or re-authored in context.`
              : `Reload ${selectedVenue?.name ?? 'the selected venue'} using ${BUILDING_SOURCE_MODE_LABELS[buildingSourceMode]} building coverage.`}
            aria-label={loadedBuildingSourceLabel.startsWith('Saved ·') ? 'Load live neighborhood' : 'Reload building source'}
            className={`pointer-events-auto flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-[#08090d]/88 text-zinc-400 shadow-xl shadow-black/40 backdrop-blur-md transition-colors hover:bg-white/10 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 ${loadedBuildingSourceLabel.startsWith('Saved ·') ? 'px-3' : 'w-9'}`}
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            {loadedBuildingSourceLabel.startsWith('Saved ·') && <span className="text-[10px] font-semibold">Live neighborhood</span>}
          </button>
        </div>
        <div className="absolute right-4 top-4 z-30 w-[min(24rem,calc(100%-2rem))] overflow-hidden rounded-xl border border-white/15 bg-[#08090d]/95 shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-100">
                Street reference
                <InfoTip text="This compact map is aligned to the venue pin. The Street plane is generated separately from a high-resolution ±500m neighborhood capture so the 3D grid includes roughly four blocks of streets and intersections in every direction." />
              </div>
              <div className="text-[10px] text-zinc-500">North is up · same venue coordinate as the red beacon</div>
            </div>
            <span
              className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-200"
              title={showStreetFloor ? `Street plane: ${streetReferenceStatus}` : 'Street plane hidden'}
            >
              N ↑
            </span>
          </div>
          <div ref={mapContainerRef} className="h-64 w-full bg-[#050608]" />
          <div className="border-t border-white/10 bg-[#0a0b0f]/98 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Selected building address
                  <InfoTip text="Reverse-geocoded from the center of the selected building footprint. This is the nearest address mapped in OpenStreetMap and should be verified before changing the venue listing." />
                </div>
                {selectedBuildingAddress.status === 'idle' ? (
                  <div className="mt-1.5 text-[11px] text-zinc-500">Select a building to identify its street address.</div>
                ) : (
                  <>
                    <div className={`mt-1.5 text-sm font-semibold ${selectedBuildingAddress.status === 'error' || selectedBuildingAddress.status === 'missing' ? 'text-amber-200' : 'text-zinc-100'}`}>
                      {selectedBuildingAddress.primary}
                    </div>
                    {selectedBuildingAddress.secondary ? (
                      <div className="mt-0.5 text-[11px] leading-4 text-zinc-400">{selectedBuildingAddress.secondary}</div>
                    ) : null}
                    {selectedBuildingAddress.status === 'resolved' ? (
                      <div className="mt-1 text-[9px] uppercase tracking-wide text-zinc-600">Nearest mapped address · OpenStreetMap</div>
                    ) : null}
                  </>
                )}
              </div>
              {selectedPolygonRecords.length === 1 ? (
                <span className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-semibold text-zinc-400">
                  #{selectedPolygonRecords[0].polygonIndex + 1}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {!resolution?.geometry && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="max-w-md rounded-2xl border border-white/10 bg-black/30 px-6 py-5 text-center text-sm text-zinc-400 backdrop-blur-md">
              Select a venue to load provider geometry, or use Advanced tools for manual provider lookup.
            </div>
          </div>
        )}
        {focusedProviderFeature ? (
          <div className="pointer-events-none absolute bottom-24 left-1/2 z-30 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2">
            <div className="pointer-events-auto rounded-2xl border border-amber-300/35 bg-[#08090d]/95 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">
                    Provider building
                  </div>
                  <div className="mt-1 break-all font-mono text-sm font-semibold text-zinc-50">
                    {focusedProviderFeature.featureId}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    {focusedProviderFeature.polygonCount} polygon{focusedProviderFeature.polygonCount === 1 ? '' : 's'} · {formatMeters(focusedProviderFeature.distanceMeters)} from the venue pin
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPendingCandidateId(null);
                    setHoveredCandidateId(null);
                  }}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
                >
                  Close
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => frameProviderFeature(focusedProviderFeature)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-white/10"
                >
                  Frame building
                </button>
                <button
                  type="button"
                  onClick={() => promoteCandidateToEditable(focusedProviderFeature)}
                  className="rounded-lg border border-amber-300/40 bg-amber-400/15 px-3 py-2 text-[11px] font-semibold text-amber-100 transition-colors hover:bg-amber-400/25"
                >
                  Edit this building
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopy('Provider feature ID', focusedProviderFeature.featureId)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-white/10"
                >
                  {copiedLabel === 'Provider feature ID' ? 'Copied ID' : 'Copy ID'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <div className="pointer-events-none absolute inset-x-4 bottom-4">
          <div className="pointer-events-auto rounded-2xl border border-white/10 bg-[#08090d]/90 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-zinc-100">
                  {selectedVenue?.name ?? 'No venue selected'}
                </div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  {saveStateLabel} · Green = selected · Gold = suggested / hover · Red beacon = venue pin · Street plane = real-world context
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!selectedSummary.count}
                  onClick={frameSelected}
                  title="Move the camera to the selected building footprint."
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Frame Selection
                </button>
                <button
                  type="button"
                  disabled={!selectedVenue || !sceneOrigin}
                  onClick={frameVenue}
                  title="Move the camera to the venue's stored pin coordinate."
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Frame Venue
                </button>
                <button
                  type="button"
                  disabled={!selectedVenue || !selectedSummary.geoJson || isLoading}
                  onClick={() => void saveSelectedBuildingAsset()}
                  title="Save the current green footprint selection as this venue's building asset."
                  className="rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-3 py-2 text-[11px] font-semibold text-emerald-100 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading && loadingPhase === 'Saving building asset' ? 'Saving...' : saveStateLabel === 'Saved' ? 'Saved' : 'Save Building'}
                </button>
                <button
                  type="button"
                  disabled={!selectedVenue || (!selectedSummary.geoJson && !selectedVenueAsset) || isLoading}
                  onClick={() => void movePinToSelectedBuilding()}
                  title="Move the venue pin to the center of the selected building while preserving the address text."
                  className="rounded-lg border border-sky-500/35 bg-sky-500/15 px-3 py-2 text-[11px] font-semibold text-sky-100 transition-colors hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading && loadingPhase === 'Moving venue pin' ? 'Moving Pin...' : 'Move Pin to Building'}
                </button>
                <button
                  type="button"
                  disabled={!selectedVenueAsset || !buildingAssetHistory.some((event) => event.action === 'replace' && event.previousAsset) || isLoading}
                  onClick={() => void rollbackLastBuildingSave()}
                  title="Restore the previous authored BuildingAsset revision. This creates a new audit event instead of deleting history."
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-100 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {isLoading && loadingPhase === 'Restoring previous building asset' ? 'Restoring...' : 'Restore Previous'}
                </button>
                <button
                  type="button"
                  disabled={!selectedVenueAsset || isLoading}
                  onClick={() => loadSavedBuildingAsset()}
                  title="Discard the current selection and reload the last saved building asset."
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reload
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
        </div>
      </div>
    </main>
  );
};

const buildOutlinePath = (geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): string => {
  const bounds = getGeometryBBox(geometry);
  if (!bounds) return '';
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const width = Math.max(maxLng - minLng, 1e-9);
  const height = Math.max(maxLat - minLat, 1e-9);
  const scale = Math.min(
    (VIEWBOX_SIZE - VIEWBOX_PADDING * 2) / width,
    (VIEWBOX_SIZE - VIEWBOX_PADDING * 2) / height,
  );
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  const offsetX = (VIEWBOX_SIZE - drawnWidth) / 2;
  const offsetY = (VIEWBOX_SIZE - drawnHeight) / 2;
  const project = (coordinate: [number, number]) => [
    offsetX + (coordinate[0] - minLng) * scale,
    VIEWBOX_SIZE - offsetY - (coordinate[1] - minLat) * scale,
  ];

  return collectPolygons(geometry)
    .map((polygon) =>
      polygon
        .filter((ring) => ring.length >= 2)
        .map((ring) => {
          const coords = ring
            .map((coordinate, coordinateIndex) => {
              const [x, y] = project([coordinate[0], coordinate[1]]);
              return `${coordinateIndex === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
            })
            .join(' ');
          return `${coords} Z`;
        })
        .join(' '),
    )
    .join(' ');
};

const InfoTip: React.FC<{ text: string }> = ({ text }) => (
  <span
    className="inline-flex cursor-help items-center text-zinc-600 transition-colors hover:text-zinc-300"
    title={text}
    aria-label={text}
    tabIndex={0}
  >
    <CircleHelp size={12} aria-hidden="true" />
  </span>
);

const Row: React.FC<{ label: string; value: React.ReactNode; help?: string; action?: React.ReactNode }> = ({ label, value, help, action }) => (
  <div className="flex items-start justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2" title={help}>
    <span className="flex items-center gap-1.5 text-zinc-500">
      {label}
      {help ? <InfoTip text={help} /> : null}
    </span>
    <span className="flex max-w-[68%] items-start justify-end gap-2 text-right text-zinc-100">
      <span>{value}</span>
      {action}
    </span>
  </div>
);

const MiniStat: React.FC<{ label: string; value: React.ReactNode; help?: string }> = ({ label, value, help }) => (
  <div className="rounded-md border border-white/5 bg-white/5 px-2 py-2" title={help}>
    <div className="flex items-center gap-1.5 text-zinc-500">
      {label}
      {help ? <InfoTip text={help} /> : null}
    </div>
    <div className="mt-0.5 text-zinc-100">{value}</div>
  </div>
);

export default BuildingInspectorPage;
