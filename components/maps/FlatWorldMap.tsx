import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type MapGeoJSONFeature,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { BuildingAsset, Listing } from '../../types';
import { getBuildingAssetForListing as getCompatibilityBuildingAssetForListing } from '../../lib/entityCompatibility';
import { DEFAULT_MAP_CAMERA, WORLD_PITCH, poseKey, type ExplorerCameraPose } from '../../lib/explorerCamera';
import {
  buildListingMapFraming,
  explorerMapFramingKey,
  type ExplorerMapFraming,
  type ExplorerMapPadding,
} from '../../lib/explorerDestinationFraming';
import {
  EXPLORER_CLUSTER_PIN_IMAGE_ID,
  EXPLORER_CLUSTER_SELECTED_IMAGE_ID,
  EXPLORER_PIN_IMAGE_ID,
  EXPLORER_PIN_SELECTED_IMAGE_ID,
  createExplorerPinImage,
} from '../../lib/explorerPinStyle';
import { approximateListingsToGeoJson, listingsToGeoJson, getListingDisplayCoords } from './listingGeoJson';
import { LISTING_INTERACTION_LAYER_ID, LISTINGS_SOURCE_ID, listingLayers } from './mapLayers';
import { swingMapStyle } from './mapStyle';
import { MapLibreThreePinLayer, THREE_PIN_LAYER_ID, type MapHostPin } from './MapLibreThreePinLayer';
import { estimateMapMotionDurationMs } from '../../lib/mapMotion';
import {
  getApproximateLocationCenter,
  isApproximateLocation,
} from '../../lib/publicLocation';
import {
  BUILDINGS_LAYER_ID,
  INTERACTION_SELECTED_BUILDING_LAYER_ID,
  SELECTED_BUILDING_LAYER_ID,
  buildBuildingsLayer,
  buildBuildingsSource,
  buildInteractionSelectedBuildingLayer,
  buildSelectedBuildingFilter,
  buildSelectedBuildingLayer,
  buildVenueBuildingFilter,
  collectVenueBuildingContext,
  getBuildingsSourceId,
  buildingInteractionVisuals,
  venueArrival,
} from './venueArrival';
import type { MapViewportDiscoverySnapshot } from '../../lib/mapViewportDiscovery';
import type { ActivityRegion } from '../../lib/activityRegionProvider';
import { countryCodeToEmoji } from '../../lib/formatting';
import {
  MAP_DEBUG_CONTROLS_EVENT,
  MAP_DEBUG_STATE_EVENT,
  defaultMapDebugControls,
  type MapDebugControls,
  type MapDebugEventLogEntry,
  type MapDebugFeatureInspection,
  type MapDebugSelectedGeometrySource,
} from './mapDebugTypes';

type FlatWorldMapProps = {
  listings: Listing[];
  resolutionListings?: Listing[];
  hostPins?: MapHostPin[];
  buildingAssets?: BuildingAsset[];
  activityRegions?: ActivityRegion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReset?: () => void;
  camera?: ExplorerCameraPose;
  destinationFraming?: ExplorerMapFraming | null;
  onNavigationChange?: (
    camera: ExplorerCameraPose,
    meta: {
      zoomDirection: 'in' | 'out' | 'none';
      isUserZoomingOut: boolean;
      isProgrammatic: boolean;
    },
  ) => void;
  onViewportChange?: (viewport: MapViewportDiscoverySnapshot) => void;
  onViewportChangeState?: (state: { isPending: boolean; reason: MapViewportDiscoverySnapshot['reason'] }) => void;
  onVenueArrivalComplete?: (listingId: string) => void;
  onReady?: () => void;
  className?: string;
  mode?: 'explore' | 'capture';
  onVenueBuildingCapture?: (capture: VenueBuildingCaptureState) => void;
  onVenueBuildingCaptureStatus?: (status: VenueBuildingCaptureStatus) => void;
};

type VenueBuildingCaptureState = {
  selectedFeature: MapGeoJSONFeature | null;
  selectedBuildingId: string | null;
  contextBuildingIds: string[];
  queriedFeatureCount: number;
  sourceId: string;
  sourceLayer: string;
  source: 'venue-arrival' | 'manual-click' | 'cleared';
};

type VenueBuildingCaptureStatus = {
  arrivalComplete: boolean;
  idleReached: boolean;
  buildingSourceLoaded: boolean;
  sourceFeatureCount: number;
  resolveAttempts: number;
  message: string | null;
};

type BuildingInteractionKind = 'venue-selected' | 'authored-venue' | 'context' | 'provider-only';

type BuildingInteractionState = {
  featureId: string;
  layerId: string;
  kind: BuildingInteractionKind;
  listingId: string | null;
  assetId: string | null;
  providerFeatureId: string | null;
  sourceLayer: string | null;
};

type BuildingHoverState = BuildingInteractionState | null;

const emptyVenueBuildingCaptureStatus: VenueBuildingCaptureStatus = {
  arrivalComplete: false,
  idleReached: false,
  buildingSourceLoaded: false,
  sourceFeatureCount: 0,
  resolveAttempts: 0,
  message: null,
};

const CAPTURE_SOURCE_READY_MAX_ATTEMPTS = 16;

type MapRuntimeDiagnostics = {
  mounted: boolean;
  loaded: boolean;
  styleLoaded: boolean;
  containerWidth: number;
  containerHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  layerCount: number;
  sourceCount: number;
  centerLng: number;
  centerLat: number;
  zoom: number;
};

const emptyMapDiagnostics: MapRuntimeDiagnostics = {
  mounted: false,
  loaded: false,
  styleLoaded: false,
  containerWidth: 0,
  containerHeight: 0,
  canvasWidth: 0,
  canvasHeight: 0,
  layerCount: 0,
  sourceCount: 0,
  centerLng: 0,
  centerLat: 0,
  zoom: 0,
};

const DEBUG_RADIUS_SOURCE_ID = 'venue-debug-radius';
const DEBUG_BUILDING_IDS_SOURCE_ID = 'venue-debug-building-ids';
const DEBUG_BUILDING_IDS_LAYER_ID = 'venue-debug-building-ids';
const APPROXIMATE_LISTINGS_SOURCE_ID = 'swing-approximate-listings';
const APPROXIMATE_AREA_FILL_LAYER_ID = 'approximate-listing-area-fill';
const APPROXIMATE_AREA_GLOW_LAYER_ID = 'approximate-listing-area-glow';
const APPROXIMATE_AREA_LINE_LAYER_ID = 'approximate-listing-area-line';
const SELECTED_APPROXIMATE_AREA_FILL_LAYER_ID = 'selected-approximate-listing-area-fill';
const SELECTED_APPROXIMATE_AREA_LINE_LAYER_ID = 'selected-approximate-listing-area-line';
const SELECTED_BUILDING_ASSET_SOURCE_ID = 'venue-selected-building-asset';
const SELECTED_BUILDING_ASSET_LAYER_ID = 'venue-selected-building-asset-3d';
const AUTHORED_BUILDINGS_SOURCE_ID = 'venue-authored-buildings';
const AUTHORED_BUILDINGS_LAYER_ID = 'venue-authored-buildings-3d';
const EMPTY_BUILDING_ASSETS: BuildingAsset[] = [];
const AUTHORED_BUILDING_MIN_ZOOM = 9.5;
const SELECTED_ASSET_MIN_ZOOM = AUTHORED_BUILDING_MIN_ZOOM;
const AUTHORED_BUILDING_FULL_DETAIL_ZOOM = 14.5;

type ResolverDebugSnapshot = {
  selectedBuildingId: string | null;
  totalBuildingCandidates: number;
  candidatesAfterRadiusFilter: number;
  candidatesAfterOverlapFilter: number;
  candidatesAfterDuplicateRemoval: number;
  finalContextBuildingCount: number;
  executionTimeMs: number | null;
};

const emptyResolverDebug: ResolverDebugSnapshot = {
  selectedBuildingId: null,
  totalBuildingCandidates: 0,
  candidatesAfterRadiusFilter: 0,
  candidatesAfterOverlapFilter: 0,
  candidatesAfterDuplicateRemoval: 0,
  finalContextBuildingCount: 0,
  executionTimeMs: null,
};

const makeCirclePolygon = (
  center: { lng: number; lat: number },
  radiusMeters: number,
  steps = 96,
): GeoJSON.Feature<GeoJSON.Polygon> => {
  const earthRadiusMeters = 6371008.8;
  const lat = (center.lat * Math.PI) / 180;
  const lng = (center.lng * Math.PI) / 180;
  const angularDistance = radiusMeters / earthRadiusMeters;
  const coordinates: number[][] = [];

  for (let i = 0; i <= steps; i += 1) {
    const bearing = (2 * Math.PI * i) / steps;
    const pointLat = Math.asin(
      Math.sin(lat) * Math.cos(angularDistance) +
        Math.cos(lat) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const pointLng =
      lng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat),
        Math.cos(angularDistance) - Math.sin(lat) * Math.sin(pointLat),
      );
    coordinates.push([(pointLng * 180) / Math.PI, (pointLat * 180) / Math.PI]);
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
  };
};

const getPolygonCount = (geometry: GeoJSON.Geometry | null | undefined): number => {
  if (!geometry) return 0;
  if (geometry.type === 'Polygon') return 1;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.length;
  return 0;
};

const isBuildingAssetGeometry = (
  geometry: BuildingAsset['geometry'] | null | undefined,
): geometry is BuildingAsset['geometry'] =>
  Boolean(
    geometry &&
      (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') &&
      Array.isArray(geometry.coordinates) &&
      geometry.coordinates.length > 0,
  );

const getBuildingAssetForListing = (
  listing: Listing | null,
  assets: BuildingAsset[],
  listings: Listing[] = [],
): BuildingAsset | null => {
  if (isApproximateLocation(listing)) return null;
  const compatibilityMatch = getCompatibilityBuildingAssetForListing(listing, assets, { listings });
  if (compatibilityMatch || !listing || listing.type !== 'event') return compatibilityMatch;

  // Legacy event records may point directly at a club listing through venueId
  // even when that club is not present in the currently filtered map dataset.
  return assets.find((asset) => asset.listingId === listing.venueId) ?? null;
};

const getBuildingAssetCenter = (
  listing: Listing,
  assets: BuildingAsset[],
  listings: Listing[] = [],
): { lng: number; lat: number } | null => {
  const asset = getBuildingAssetForListing(listing, assets, listings);
  if (!asset || !isBuildingAssetGeometry(asset.geometry)) return null;
  const points = asset.geometry.type === 'Polygon'
    ? asset.geometry.coordinates.flat(1)
    : asset.geometry.coordinates.flat(2);
  if (!points.length) return null;
  const bounds = points.reduce(
    (current, [lng, lat]) => ({
      minLng: Math.min(current.minLng, lng),
      maxLng: Math.max(current.maxLng, lng),
      minLat: Math.min(current.minLat, lat),
      maxLat: Math.max(current.maxLat, lat),
    }),
    { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity },
  );
  return {
    lng: (bounds.minLng + bounds.maxLng) / 2,
    lat: (bounds.minLat + bounds.maxLat) / 2,
  };
};

const getPublicMapCoords = (
  listing: Listing,
  assets: BuildingAsset[] = [],
  listings: Listing[] = [],
): { lng: number; lat: number } | null => {
  if (isApproximateLocation(listing)) {
    const center = getApproximateLocationCenter(listing);
    return center ? { lng: center.longitude, lat: center.latitude } : null;
  }
  return getBuildingAssetCenter(listing, assets, listings) ?? getListingDisplayCoords(listing);
};

const buildAssetFeature = (
  asset: BuildingAsset,
  options: { selected?: boolean } = {},
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>> => ({
  type: 'Feature',
  id: asset.id,
  properties: {
    asset_id: asset.id,
    listing_id: asset.listingId,
    venue_id: asset.venueId ?? null,
    provider_feature_id: asset.provider.featureIds[0] ?? null,
    geometry_source: 'building-asset',
    selected: options.selected === true,
    render_height: asset.renderHeightMeters ?? SELECTED_ASSET_EXTRUSION_HEIGHT,
    render_min_height: asset.renderMinHeightMeters ?? 0,
  },
  geometry: asset.geometry,
});

const buildSelectedAssetFeatureCollection = (
  asset: BuildingAsset | null,
): GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>> => ({
  type: 'FeatureCollection',
  features: asset && isBuildingAssetGeometry(asset.geometry)
    ? [buildAssetFeature(asset, { selected: true })]
    : [],
});

const SELECTED_ASSET_EXTRUSION_HEIGHT =
  venueArrival.buildingFallbackHeight * venueArrival.selectedBuilding.heightBoost;

const getFeatureId = (feature: MapGeoJSONFeature | null): string => {
  if (!feature || feature.id === undefined || feature.id === null) return 'n/a';
  return String(feature.id);
};

const getFeatureCenter = (feature: maplibregl.MapGeoJSONFeature): [number, number] | null => {
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
  const total = points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]);
  return [total[0] / points.length, total[1] / points.length];
};

const isBuildingLayerId = (layerId: string) =>
  layerId === BUILDINGS_LAYER_ID ||
  layerId === SELECTED_BUILDING_LAYER_ID ||
  layerId === INTERACTION_SELECTED_BUILDING_LAYER_ID ||
  layerId === AUTHORED_BUILDINGS_LAYER_ID ||
  layerId === SELECTED_BUILDING_ASSET_LAYER_ID;

const FlatWorldMap: React.FC<FlatWorldMapProps> = ({
  listings,
  resolutionListings = listings,
  hostPins = [],
  buildingAssets = EMPTY_BUILDING_ASSETS,
  activityRegions = [],
  selectedId,
  onSelect,
  onReset,
  camera = DEFAULT_MAP_CAMERA,
  destinationFraming = null,
  onNavigationChange,
  onViewportChange,
  onViewportChangeState,
  onVenueArrivalComplete,
  onReady,
  className,
  mode = 'explore',
  onVenueBuildingCapture,
  onVenueBuildingCaptureStatus,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const onNavigationChangeRef = useRef(onNavigationChange);
  const onViewportChangeRef = useRef(onViewportChange);
  const onViewportChangeStateRef = useRef(onViewportChangeState);
  const onVenueArrivalCompleteRef = useRef(onVenueArrivalComplete);
  const onReadyRef = useRef(onReady);
  const selectedIdRef = useRef(selectedId);
  const listingsRef = useRef(listings);
  const resolutionListingsRef = useRef(resolutionListings);
  const buildingAssetsRef = useRef(buildingAssets);
  const activityRegionsRef = useRef(activityRegions);
  activityRegionsRef.current = activityRegions;
  const cameraRef = useRef(camera);
  const appliedExplorerCameraKeyRef = useRef('');
  const appliedDestinationFramingKeyRef = useRef('');
  const recentMapZoomOutAtRef = useRef(0);
  const programmaticMapMotionUntilRef = useRef(0);
  const lastMapNavigationSyncAtRef = useRef(0);
  const lastViewportSyncAtRef = useRef(0);
  const lastMapZoomRef = useRef(camera.zoom);
  const viewportSyncTimerRef = useRef<number | null>(null);
  const lastViewportSnapshotKeyRef = useRef('');
  const pinPulseIntervalRef = useRef<number | null>(null);
  const threePinLayerRef = useRef<MapLibreThreePinLayer | null>(null);
  const prefersReducedMotionRef = useRef(false);
  const mapListings = useMemo(() => listings.map((listing) => {
    if (isApproximateLocation(listing)) return listing;
    const center = getBuildingAssetCenter(listing, buildingAssets, listings);
    if (!center) return listing;
    return {
      ...listing,
      geopoint: {
        ...listing.geopoint,
        latitude: center.lat,
        longitude: center.lng,
      },
    };
  }), [listings, buildingAssets]);
  const authoredBuildingListingIds = useMemo(
    () => new Set(
      listings
        .filter((listing) => Boolean(
          getBuildingAssetForListing(listing, buildingAssets, listings),
        ))
        .map((listing) => listing.id),
    ),
    [buildingAssets, listings],
  );
  const geoJson = useMemo(() => listingsToGeoJson(mapListings), [mapListings]);
  const approximateGeoJson = useMemo(() => approximateListingsToGeoJson(listings), [listings]);
  const geoJsonRef = useRef(geoJson);
  const approximateGeoJsonRef = useRef(approximateGeoJson);
  const venueContextKeyRef = useRef('');
  const venueBuildingStatsRef = useRef({ renderedCount: 0, queriedFeatureCount: 0 });
  const venueResolveRequestRef = useRef(0);
  const captureReadinessRequestRef = useRef(0);
  const currentContextBuildingIdsRef = useRef<string[]>([]);
  const residentAuthoredAssetIdsRef = useRef<Set<string>>(new Set());
  const hoveredListingFeatureIdRef = useRef<string | number | null>(null);
  const hoveredClusterFeatureIdRef = useRef<string | number | null>(null);
  const hoveredBuildingRef = useRef<BuildingHoverState>(null);
  const selectedBuildingRef = useRef<BuildingInteractionState | null>(null);
  const debugControlsRef = useRef<MapDebugControls>(defaultMapDebugControls);
  const resolverDebugRef = useRef<ResolverDebugSnapshot>(emptyResolverDebug);
  const eventLogRef = useRef<MapDebugEventLogEntry[]>([]);
  const eventLogIdRef = useRef(0);
  const lastRenderCompletedLogRef = useRef(0);
  const featureInspectionRef = useRef<MapDebugFeatureInspection>(null);
  const selectedGeometrySourceRef = useRef<MapDebugSelectedGeometrySource>({
    source: 'none',
    reason: 'No selected venue',
    assetId: null,
    providerFeatureId: null,
    geometryType: null,
    polygonCount: 0,
  });
  const [mapDiagnostics, setMapDiagnostics] = useState<MapRuntimeDiagnostics>(emptyMapDiagnostics);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingInteractionState | null>(null);
  const isCaptureMode = mode === 'capture';
  const usesVenueArrival = mode === 'explore' || isCaptureMode;

  const pushDebugEvent = (label: string, details?: string) => {
    eventLogIdRef.current += 1;
    eventLogRef.current = [
      ...eventLogRef.current.slice(-79),
      {
        id: eventLogIdRef.current,
        timestamp: new Date().toLocaleTimeString(),
        label,
        details,
      },
    ];
  };

  const updateMapDiagnostics = (overrides: Partial<MapRuntimeDiagnostics> = {}) => {
    const map = mapRef.current;
    const container = containerRef.current;
    const rect = container?.getBoundingClientRect();
    const canvas = map?.getCanvas() ?? null;
    const canvasRect = canvas?.getBoundingClientRect();
    const style = map?.getStyle();
    const center = map?.getCenter();
    setMapDiagnostics({
      mounted: !!map,
      loaded: !!map && map.loaded(),
      styleLoaded: !!map && map.isStyleLoaded(),
      containerWidth: rect ? Math.round(rect.width) : 0,
      containerHeight: rect ? Math.round(rect.height) : 0,
      canvasWidth: canvasRect ? Math.round(canvasRect.width) : canvas?.width ?? 0,
      canvasHeight: canvasRect ? Math.round(canvasRect.height) : canvas?.height ?? 0,
      layerCount: style?.layers?.length ?? 0,
      sourceCount: style ? Object.keys(style.sources ?? {}).length : 0,
      centerLng: center?.lng ?? 0,
      centerLat: center?.lat ?? 0,
      zoom: map?.getZoom() ?? 0,
      ...overrides,
    });
  };

  const registerExplorerPinImages = (map: MapLibreMap) => {
    const images = [
      {
        id: EXPLORER_PIN_IMAGE_ID,
        image: createExplorerPinImage(),
      },
      {
        id: EXPLORER_PIN_SELECTED_IMAGE_ID,
        image: createExplorerPinImage({ selected: true }),
      },
      {
        id: EXPLORER_CLUSTER_PIN_IMAGE_ID,
        image: createExplorerPinImage({ cluster: true }),
      },
      {
        id: EXPLORER_CLUSTER_SELECTED_IMAGE_ID,
        image: createExplorerPinImage({ cluster: true, selected: true }),
      },
    ];

    images.forEach(({ id, image }) => {
      if (!map.hasImage(id)) {
        map.addImage(id, image, { pixelRatio: Math.max(1, Math.min(window.devicePixelRatio || 1, 2)) });
      }
    });
  };

  const emitCaptureStatus = (status: Partial<VenueBuildingCaptureStatus>) => {
    if (!isCaptureMode) return;
    onVenueBuildingCaptureStatus?.({
      ...emptyVenueBuildingCaptureStatus,
      ...status,
    });
  };

  const getResidentBuildingSourceFeatureCount = (): number => {
    const map = mapRef.current;
    if (!map?.getSource(getBuildingsSourceId())) return 0;
    try {
      return map.querySourceFeatures(getBuildingsSourceId(), {
        sourceLayer: venueArrival.buildings.sourceLayer,
      }).length;
    } catch {
      return 0;
    }
  };

  const isBuildingSourceLoaded = (): boolean => {
    const map = mapRef.current;
    return !!map?.getSource(getBuildingsSourceId()) && map.isSourceLoaded(getBuildingsSourceId());
  };

  const updateSelectedAssetLod = () => {
    const map = mapRef.current;
    if (!map) return;
    refreshResidentAuthoredBuildings();
    if (map.getLayer(SELECTED_BUILDING_ASSET_LAYER_ID)) {
      map.setPaintProperty(SELECTED_BUILDING_ASSET_LAYER_ID, 'fill-extrusion-opacity', 0);
      map.setLayoutProperty(SELECTED_BUILDING_ASSET_LAYER_ID, 'visibility', 'none');
    }
  };

  const primeCaptureBuildingSourceSurface = () => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !isCaptureMode) return;
    if (map.getLayer(BUILDINGS_LAYER_ID)) {
      map.setLayoutProperty(BUILDINGS_LAYER_ID, 'visibility', 'visible');
      map.setFilter(BUILDINGS_LAYER_ID, null);
      applyContextBuildingStyle(buildingInteractionVisuals.context.opacity);
    }
    if (map.getLayer(SELECTED_BUILDING_LAYER_ID)) {
      map.setLayoutProperty(SELECTED_BUILDING_LAYER_ID, 'visibility', 'visible');
      map.setFilter(SELECTED_BUILDING_LAYER_ID, buildSelectedBuildingFilter('__none__'));
      map.setPaintProperty(SELECTED_BUILDING_LAYER_ID, 'fill-extrusion-opacity', 0);
    }
    map.triggerRepaint();
  };

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onNavigationChangeRef.current = onNavigationChange;
  }, [onNavigationChange]);

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    onViewportChangeStateRef.current = onViewportChangeState;
  }, [onViewportChangeState]);

  useEffect(() => {
    onVenueArrivalCompleteRef.current = onVenueArrivalComplete;
  }, [onVenueArrivalComplete]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    listingsRef.current = listings;
  }, [listings]);

  useEffect(() => {
    resolutionListingsRef.current = resolutionListings;
  }, [resolutionListings]);

  useEffect(() => {
    buildingAssetsRef.current = buildingAssets;
    residentAuthoredAssetIdsRef.current = new Set(
      buildingAssets
        .filter((asset) => isBuildingAssetGeometry(asset.geometry))
        .map((asset) => asset.id),
    );
    ensureBuildingRenderingLayers();
    refreshResidentAuthoredBuildings();
    syncVenueBuildings();
  }, [buildingAssets]);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    geoJsonRef.current = geoJson;
  }, [geoJson]);

  useEffect(() => {
    approximateGeoJsonRef.current = approximateGeoJson;
  }, [approximateGeoJson]);

  useEffect(() => {
    selectedBuildingRef.current = selectedBuilding;
  }, [selectedBuilding]);

  useEffect(() => {
    applySelectedBuildingInteraction(selectedBuilding);
    applyDebugControls();
    publishDebugState();
  }, [selectedBuilding]);

  const clearVenueBuildings = () => {
    const map = mapRef.current;
    venueContextKeyRef.current = '';
    currentContextBuildingIdsRef.current = [];
    venueResolveRequestRef.current += 1;
    selectedGeometrySourceRef.current = {
      source: 'none',
      reason: 'No selected venue',
      assetId: null,
      providerFeatureId: null,
      geometryType: null,
      polygonCount: 0,
    };
    if (!map) return;
    if (map.getLayer(BUILDINGS_LAYER_ID)) {
      map.setFilter(BUILDINGS_LAYER_ID, buildVenueBuildingFilter([]));
      map.setPaintProperty(BUILDINGS_LAYER_ID, 'fill-extrusion-opacity', 0);
      map.setLayoutProperty(BUILDINGS_LAYER_ID, 'visibility', 'none');
    }
    if (map.getLayer(SELECTED_BUILDING_LAYER_ID)) {
      map.setFilter(SELECTED_BUILDING_LAYER_ID, buildSelectedBuildingFilter('__none__'));
      map.setPaintProperty(SELECTED_BUILDING_LAYER_ID, 'fill-extrusion-opacity', 0);
      map.setLayoutProperty(SELECTED_BUILDING_LAYER_ID, 'visibility', 'none');
    }
    if (map.getSource(SELECTED_BUILDING_ASSET_SOURCE_ID)) {
      (map.getSource(SELECTED_BUILDING_ASSET_SOURCE_ID) as GeoJSONSource).setData(buildSelectedAssetFeatureCollection(null));
    }
    if (map.getLayer(SELECTED_BUILDING_ASSET_LAYER_ID)) {
      map.setPaintProperty(SELECTED_BUILDING_ASSET_LAYER_ID, 'fill-extrusion-opacity', 0);
      map.setLayoutProperty(SELECTED_BUILDING_ASSET_LAYER_ID, 'visibility', 'none');
    }
    refreshResidentAuthoredBuildings();
  };

  const buildResidentAuthoredFeatureCollection = (): GeoJSON.FeatureCollection<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    Record<string, unknown>
  > => {
    const selectedListing = selectedIdRef.current
      ? resolutionListingsRef.current.find((candidate) => candidate.id === selectedIdRef.current) ?? null
      : null;
    const selectedListingAsset = getBuildingAssetForListing(
      selectedListing,
      buildingAssetsRef.current,
      resolutionListingsRef.current,
    );
    const selectedAssetId = selectedListingAsset?.id ?? selectedGeometrySourceRef.current.assetId ?? null;
    const residentAssetIds = residentAuthoredAssetIdsRef.current;
    const features = buildingAssetsRef.current
      .filter((asset) => residentAssetIds.has(asset.id) && isBuildingAssetGeometry(asset.geometry))
      .filter((asset) => {
        const linkedListing = resolutionListingsRef.current.find((listing) =>
          getCompatibilityBuildingAssetForListing(listing, [asset], {
            listings: resolutionListingsRef.current,
          })?.id === asset.id,
        );
        return !isApproximateLocation(linkedListing);
      })
      .map((asset) => buildAssetFeature(asset, { selected: asset.id === selectedAssetId }));
    return {
      type: 'FeatureCollection',
      features,
    };
  };

  const refreshResidentAuthoredBuildings = () => {
    const map = mapRef.current;
    const source = map?.getSource(AUTHORED_BUILDINGS_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    const selectedListing = selectedIdRef.current
      ? resolutionListingsRef.current.find((candidate) => candidate.id === selectedIdRef.current) ?? null
      : null;
    const selectedListingAsset = getBuildingAssetForListing(
      selectedListing,
      buildingAssetsRef.current,
      resolutionListingsRef.current,
    );
    if (
      selectedListingAsset &&
      isBuildingAssetGeometry(selectedListingAsset.geometry) &&
      (
        selectedGeometrySourceRef.current.source !== 'building-asset' ||
        selectedGeometrySourceRef.current.assetId !== selectedListingAsset.id
      )
    ) {
      selectedGeometrySourceRef.current = {
        source: 'building-asset',
        reason: 'Resident Building Asset found for selected venue',
        assetId: selectedListingAsset.id,
        providerFeatureId: selectedListingAsset.provider.featureIds[0] ?? null,
        geometryType: selectedListingAsset.geometry.type,
        polygonCount: getPolygonCount(selectedListingAsset.geometry),
      };
    }
    source.setData(buildResidentAuthoredFeatureCollection());
    updateAuthoredBuildingLod();
  };

  const addResidentAuthoredAsset = (asset: BuildingAsset) => {
    if (!isBuildingAssetGeometry(asset.geometry)) return;
    residentAuthoredAssetIdsRef.current.add(asset.id);
    refreshResidentAuthoredBuildings();
  };

  const getResidentAuthoredProviderFeatureIds = () => {
    const residentAssetIds = residentAuthoredAssetIdsRef.current;
    return new Set(
      buildingAssetsRef.current
        .filter((asset) => residentAssetIds.has(asset.id))
        .flatMap((asset) => asset.provider.featureIds),
    );
  };

  const updateAuthoredBuildingLod = () => {
    const map = mapRef.current;
    if (!map?.getLayer(AUTHORED_BUILDINGS_LAYER_ID)) return;
    const selectedListing = selectedIdRef.current
      ? resolutionListingsRef.current.find((candidate) => candidate.id === selectedIdRef.current) ?? null
      : null;
    const selectedAsset = getBuildingAssetForListing(
      selectedListing,
      buildingAssetsRef.current,
      resolutionListingsRef.current,
    );
    const showAllAuthoredBuildings = isCaptureMode || debugControlsRef.current.showAllExtrusions;
    map.setFilter(
      AUTHORED_BUILDINGS_LAYER_ID,
      showAllAuthoredBuildings
        ? null
        : ['==', ['get', 'asset_id'], selectedAsset?.id ?? '__none__'],
    );
    map.setLayoutProperty(
      AUTHORED_BUILDINGS_LAYER_ID,
      'visibility',
      showAllAuthoredBuildings || Boolean(selectedAsset) ? 'visible' : 'none',
    );
    map.setPaintProperty(AUTHORED_BUILDINGS_LAYER_ID, 'fill-extrusion-opacity', [
      'interpolate',
      ['linear'],
      ['zoom'],
      AUTHORED_BUILDING_MIN_ZOOM - 0.25,
      0,
      AUTHORED_BUILDING_MIN_ZOOM,
      0.16,
      12,
      0.38,
      AUTHORED_BUILDING_FULL_DETAIL_ZOOM,
      0.78,
    ]);
    map.setPaintProperty(AUTHORED_BUILDINGS_LAYER_ID, 'fill-extrusion-height', [
      'interpolate',
      ['linear'],
      ['zoom'],
      AUTHORED_BUILDING_MIN_ZOOM,
      [
        '*',
        ['coalesce', ['get', 'render_height'], SELECTED_ASSET_EXTRUSION_HEIGHT],
        ['case', ['boolean', ['get', 'selected'], false], venueArrival.selectedBuilding.heightBoost * 0.22, 0.22],
      ],
      12,
      [
        '*',
        ['coalesce', ['get', 'render_height'], SELECTED_ASSET_EXTRUSION_HEIGHT],
        ['case', ['boolean', ['get', 'selected'], false], venueArrival.selectedBuilding.heightBoost * 0.58, 0.58],
      ],
      AUTHORED_BUILDING_FULL_DETAIL_ZOOM,
      [
        '*',
        ['coalesce', ['get', 'render_height'], SELECTED_ASSET_EXTRUSION_HEIGHT],
        ['case', ['boolean', ['get', 'selected'], false], venueArrival.selectedBuilding.heightBoost, 1],
      ],
    ]);
    map.setPaintProperty(AUTHORED_BUILDINGS_LAYER_ID, 'fill-extrusion-color', [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
      buildingInteractionVisuals.authored.selectedColor,
      ['boolean', ['get', 'selected'], false],
      venueArrival.selectedBuilding.color,
      buildingInteractionVisuals.context.color,
    ]);
  };

  const markProgrammaticMapMotion = (durationMs = 900) => {
    programmaticMapMotionUntilRef.current = Math.max(
      programmaticMapMotionUntilRef.current,
      performance.now() + durationMs,
    );
  };

  const emitMapNavigationChange = (zoomDirection: 'in' | 'out' | 'none') => {
    const map = mapRef.current;
    const callback = onNavigationChangeRef.current;
    if (!map || !callback) return;
    const now = performance.now();
    if (now - lastMapNavigationSyncAtRef.current < 100 && zoomDirection === 'none') return;
    lastMapNavigationSyncAtRef.current = now;
    const center = map.getCenter();
    callback({
      surface: 'map',
      lng: center.lng,
      lat: center.lat,
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    }, {
      zoomDirection,
      isUserZoomingOut: now - recentMapZoomOutAtRef.current <= 900,
      isProgrammatic: now < programmaticMapMotionUntilRef.current,
    });
  };

  const emitViewportChange = (reason: MapViewportDiscoverySnapshot['reason']) => {
    const map = mapRef.current;
    const callback = onViewportChangeRef.current;
    if (!map || !callback) return;
    const now = performance.now();
    if (now - lastViewportSyncAtRef.current < 80 && reason === 'move') return;
    lastViewportSyncAtRef.current = now;
    const center = map.getCenter();
    const bounds = map.getBounds();
    const snapshot: MapViewportDiscoverySnapshot = {
      center: { lng: center.lng, lat: center.lat },
      bounds: {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      },
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
      updatedAt: now,
      reason,
    };
    const snapshotKey = [
      snapshot.bounds.west.toFixed(4),
      snapshot.bounds.south.toFixed(4),
      snapshot.bounds.east.toFixed(4),
      snapshot.bounds.north.toFixed(4),
      snapshot.zoom.toFixed(2),
    ].join(':');
    if (snapshotKey === lastViewportSnapshotKeyRef.current && reason !== 'idle') return;
    lastViewportSnapshotKeyRef.current = snapshotKey;
    callback(snapshot);
    onViewportChangeStateRef.current?.({ isPending: false, reason });
  };

  const scheduleViewportChange = (reason: MapViewportDiscoverySnapshot['reason']) => {
    onViewportChangeStateRef.current?.({ isPending: true, reason });
    if (viewportSyncTimerRef.current !== null) {
      window.clearTimeout(viewportSyncTimerRef.current);
    }
    viewportSyncTimerRef.current = window.setTimeout(() => {
      viewportSyncTimerRef.current = null;
      emitViewportChange(reason);
    }, 160);
  };

  const flushViewportChange = (reason: MapViewportDiscoverySnapshot['reason']) => {
    if (viewportSyncTimerRef.current !== null) {
      window.clearTimeout(viewportSyncTimerRef.current);
      viewportSyncTimerRef.current = null;
    }
    emitViewportChange(reason);
  };

  const updatePinPulseState = (phase: number) => {
    const map = mapRef.current;
    if (!map || prefersReducedMotionRef.current) return;
    const pulseLayers = ['listing-pins', 'selected-listing'].filter((layerId) => map.getLayer(layerId));
    if (!pulseLayers.length || !map.getSource(LISTINGS_SOURCE_ID)) return;
    const pulse = (Math.sin(phase * Math.PI * 2) + 1) / 2;
    const listingIds = new Set(
      map
        .queryRenderedFeatures(undefined, { layers: pulseLayers })
        .map((feature) => getFeatureId(feature as MapGeoJSONFeature))
        .filter((featureId) => Boolean(featureId)),
    );
    listingIds.forEach((featureId) => {
      try {
        map.setFeatureState(
          {
            source: LISTINGS_SOURCE_ID,
            id: featureId,
          },
          { pulse },
        );
      } catch {
        // Ignore transient source reloads.
      }
    });
  };

  const startPinPulseAnimation = () => {
    if (pinPulseIntervalRef.current !== null || prefersReducedMotionRef.current) return;
    const startAt = performance.now();
    pinPulseIntervalRef.current = window.setInterval(() => {
      const phase = ((performance.now() - startAt) % 3200) / 3200;
      updatePinPulseState(phase);
    }, 180);
  };

  const stopPinPulseAnimation = () => {
    if (pinPulseIntervalRef.current === null) return;
    window.clearInterval(pinPulseIntervalRef.current);
    pinPulseIntervalRef.current = null;
  };

  const findAssetForFeatureId = (featureId: string): BuildingAsset | null => (
    buildingAssetsRef.current.find((asset) =>
      asset.id === featureId || asset.provider.featureIds.includes(featureId),
    ) ?? null
  );

  const classifyBuildingFeature = (
    feature: MapGeoJSONFeature,
  ): BuildingInteractionState => {
    const featureId = getFeatureId(feature);
    const layerId = feature.layer?.id ?? 'unknown';
    const asset = findAssetForFeatureId(featureId);
    const providerFeatureId = asset?.provider.featureIds[0] ?? (layerId === AUTHORED_BUILDINGS_LAYER_ID ? null : featureId);
    const selectedVenueFeatureId = resolverDebugRef.current.selectedBuildingId;
    const isVenueSelected = Boolean(
      selectedVenueFeatureId && featureId === selectedVenueFeatureId,
    );
    const isAuthoredVenue =
      layerId === AUTHORED_BUILDINGS_LAYER_ID ||
      layerId === SELECTED_BUILDING_ASSET_LAYER_ID ||
      Boolean(asset);

    return {
      featureId,
      layerId,
      kind: isVenueSelected
        ? 'venue-selected'
        : isAuthoredVenue && asset?.listingId
        ? 'authored-venue'
        : currentContextBuildingIdsRef.current.includes(featureId)
        ? 'context'
        : 'provider-only',
      listingId: asset?.listingId ?? null,
      assetId: asset?.id ?? (layerId === AUTHORED_BUILDINGS_LAYER_ID ? featureId : null),
      providerFeatureId,
      sourceLayer: feature.sourceLayer ?? null,
    };
  };

  const setBuildingFeatureHover = (feature: MapGeoJSONFeature | null, hover: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    const nextHover = hover && feature ? classifyBuildingFeature(feature) : null;
    const previous = hoveredBuildingRef.current;

    const clearState = (target: BuildingHoverState) => {
      if (!target) return;
      try {
        const sourceId =
          target.layerId === AUTHORED_BUILDINGS_LAYER_ID
            ? AUTHORED_BUILDINGS_SOURCE_ID
            : target.layerId === SELECTED_BUILDING_ASSET_LAYER_ID
            ? SELECTED_BUILDING_ASSET_SOURCE_ID
            : getBuildingsSourceId();
        map.setFeatureState(
          {
            source: sourceId,
            id: target.featureId,
          },
          { hover: false },
        );
      } catch {
        // Ignore transient source reloads.
      }
    };

    if (!hover && previous) {
      clearState(previous);
      hoveredBuildingRef.current = null;
      publishDebugState();
      return;
    }

    if (previous && nextHover && previous.featureId === nextHover.featureId && previous.layerId === nextHover.layerId) return;
    if (previous) clearState(previous);

    if (!nextHover) {
      hoveredBuildingRef.current = null;
      publishDebugState();
      return;
    }

    try {
      const sourceId =
        nextHover.layerId === AUTHORED_BUILDINGS_LAYER_ID
          ? AUTHORED_BUILDINGS_SOURCE_ID
          : nextHover.layerId === SELECTED_BUILDING_ASSET_LAYER_ID
          ? SELECTED_BUILDING_ASSET_SOURCE_ID
          : getBuildingsSourceId();
      map.setFeatureState(
        {
          source: sourceId,
          id: nextHover.featureId,
        },
        { hover: true },
      );
      hoveredBuildingRef.current = nextHover;
      publishDebugState();
    } catch {
      hoveredBuildingRef.current = null;
      publishDebugState();
    }
  };

  const applySelectedBuildingInteraction = (nextSelection: BuildingInteractionState | null) => {
    const map = mapRef.current;
    if (!map) return;
    const venueSelectedFeatureId = resolverDebugRef.current.selectedBuildingId ?? selectedGeometrySourceRef.current.providerFeatureId;
    const shouldHideOverlay =
      !nextSelection ||
      nextSelection.kind === 'venue-selected' ||
      (venueSelectedFeatureId !== null && nextSelection.featureId === venueSelectedFeatureId);
    if (!map.getLayer(INTERACTION_SELECTED_BUILDING_LAYER_ID)) return;
    if (shouldHideOverlay) {
      map.setFilter(INTERACTION_SELECTED_BUILDING_LAYER_ID, buildSelectedBuildingFilter('__none__'));
      map.setLayoutProperty(INTERACTION_SELECTED_BUILDING_LAYER_ID, 'visibility', 'none');
      return;
    }
    const selectionVisuals =
      nextSelection.kind === 'authored-venue'
        ? buildingInteractionVisuals.authored
        : buildingInteractionVisuals.provider;
    const selectedOpacity = Math.min(
      0.62,
      selectionVisuals.selectedOpacity + selectionVisuals.selectedOutlineOpacity * 0.12,
    );
    map.setFilter(
      INTERACTION_SELECTED_BUILDING_LAYER_ID,
      buildSelectedBuildingFilter(nextSelection.featureId),
    );
    map.setPaintProperty(
      INTERACTION_SELECTED_BUILDING_LAYER_ID,
      'fill-extrusion-color',
      selectionVisuals.selectedColor,
    );
    map.setPaintProperty(
      INTERACTION_SELECTED_BUILDING_LAYER_ID,
      'fill-extrusion-opacity',
      selectedOpacity,
    );
    map.setPaintProperty(
      INTERACTION_SELECTED_BUILDING_LAYER_ID,
      'fill-extrusion-height',
      ['*', ['coalesce', ['get', 'render_height'], SELECTED_ASSET_EXTRUSION_HEIGHT], selectionVisuals.selectedHeightBoost],
    );
    map.setLayoutProperty(INTERACTION_SELECTED_BUILDING_LAYER_ID, 'visibility', 'visible');
  };

  const applyContextBuildingStyle = (opacity: number) => {
    const map = mapRef.current;
    if (!map?.getLayer(BUILDINGS_LAYER_ID)) return;
    const hoverState = ['boolean', ['feature-state', 'hover'], false] as const;
    map.setPaintProperty(BUILDINGS_LAYER_ID, 'fill-extrusion-color', [
      'case',
      hoverState,
      buildingInteractionVisuals.context.hoverColor,
      buildingInteractionVisuals.context.color,
    ]);
    map.setPaintProperty(BUILDINGS_LAYER_ID, 'fill-extrusion-opacity', [
      'case',
      hoverState,
      Math.min(1, opacity + buildingInteractionVisuals.context.hoverOpacityBoost),
      opacity,
    ]);
  };

  const applyDebugControls = () => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const controls = debugControlsRef.current;
    const venueSelectedFeatureId = resolverDebugRef.current.selectedBuildingId ?? selectedGeometrySourceRef.current.providerFeatureId;
    const showInteractionSelectedLayer = Boolean(
      selectedBuildingRef.current &&
        selectedBuildingRef.current.featureId &&
        selectedBuildingRef.current.featureId !== venueSelectedFeatureId,
    );
    const setLayerVisibility = (layerId: string, visible: boolean) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    };

    setLayerVisibility(
      INTERACTION_SELECTED_BUILDING_LAYER_ID,
      controls.showAllExtrusions && controls.showSelectedBuilding && showInteractionSelectedLayer,
    );
    setLayerVisibility(
      SELECTED_BUILDING_LAYER_ID,
      controls.showAllExtrusions && controls.showSelectedBuilding,
    );
    setLayerVisibility(
      SELECTED_BUILDING_ASSET_LAYER_ID,
      false,
    );
    setLayerVisibility(
      AUTHORED_BUILDINGS_LAYER_ID,
      controls.showAllExtrusions,
    );
    updateSelectedAssetLod();
    setLayerVisibility(
      BUILDINGS_LAYER_ID,
      controls.showAllExtrusions && controls.showContextBuildings && venueArrival.enableVenueContextBuildings,
    );

    listingLayers.forEach((layer) => setLayerVisibility(layer.id, mode === 'explore' ? controls.showPins : false));
    setLayerVisibility('dark-basemap', controls.showRoads);
    setLayerVisibility('dark-basemap-labels', controls.showLabels);
    setLayerVisibility(DEBUG_BUILDING_IDS_LAYER_ID, controls.showBuildingIds);
    if (isCaptureMode) {
      setLayerVisibility(BUILDINGS_LAYER_ID, true);
      setLayerVisibility(SELECTED_BUILDING_LAYER_ID, true);
    }
  };

  const emitVenueBuildingCapture = (
    capture: Omit<VenueBuildingCaptureState, 'sourceId' | 'sourceLayer'>,
  ) => {
    if (!isCaptureMode) return;
    onVenueBuildingCapture?.({
      ...capture,
      sourceId: getBuildingsSourceId(),
      sourceLayer: venueArrival.buildings.sourceLayer,
    });
  };

  const selectCapturedBuildingFeature = (
    feature: MapGeoJSONFeature,
    source: VenueBuildingCaptureState['source'],
  ) => {
    const map = mapRef.current;
    const buildingId = getFeatureId(feature);
    if (!map || buildingId === 'n/a') return;

    if (map.getLayer(SELECTED_BUILDING_LAYER_ID)) {
      map.setLayoutProperty(SELECTED_BUILDING_LAYER_ID, 'visibility', 'visible');
      map.setFilter(SELECTED_BUILDING_LAYER_ID, buildSelectedBuildingFilter(buildingId));
      map.setPaintProperty(SELECTED_BUILDING_LAYER_ID, 'fill-extrusion-opacity', venueArrival.selectedBuilding.opacity);
    }
    if (map.getLayer(BUILDINGS_LAYER_ID)) {
      map.setFilter(
        BUILDINGS_LAYER_ID,
        buildVenueBuildingFilter(currentContextBuildingIdsRef.current.filter((id) => id !== buildingId)),
      );
    }

    emitVenueBuildingCapture({
      selectedFeature: feature,
      selectedBuildingId: buildingId,
      contextBuildingIds: currentContextBuildingIdsRef.current,
      queriedFeatureCount: venueBuildingStatsRef.current.queriedFeatureCount,
      source,
    });
  };

  const addLayerSafely = (layer: maplibregl.AnyLayer, beforeId?: string) => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(layer.id)) return;
    try {
      if (beforeId && map.getLayer(beforeId)) {
        map.addLayer(layer, beforeId);
      } else {
        map.addLayer(layer);
      }
    } catch (error) {
      pushDebugEvent('layer add failed', `${layer.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const ensureApproximateLocationLayers = () => {
    const map = mapRef.current;
    if (!map || !map.getStyle()) return;
    if (!map.getSource(APPROXIMATE_LISTINGS_SOURCE_ID)) {
      map.addSource(APPROXIMATE_LISTINGS_SOURCE_ID, {
        type: 'geojson',
        data: approximateGeoJsonRef.current,
        generateId: true,
      });
    }

    addLayerSafely({
      id: APPROXIMATE_AREA_GLOW_LAYER_ID,
      type: 'fill',
      source: APPROXIMATE_LISTINGS_SOURCE_ID,
      paint: {
        'fill-color': '#ff4d5e',
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          0.12,
          0.055,
        ],
      },
    }, 'listing-pin-ripple');
    addLayerSafely({
      id: APPROXIMATE_AREA_FILL_LAYER_ID,
      type: 'fill',
      source: APPROXIMATE_LISTINGS_SOURCE_ID,
      paint: {
        'fill-color': '#8f1828',
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          0.2,
          0.11,
        ],
      },
    }, 'listing-pin-ripple');
    addLayerSafely({
      id: APPROXIMATE_AREA_LINE_LAYER_ID,
      type: 'line',
      source: APPROXIMATE_LISTINGS_SOURCE_ID,
      paint: {
        'line-color': '#ff7585',
        'line-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          0.82,
          0.52,
        ],
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          2.2,
          1.35,
        ],
        'line-dasharray': [1.5, 1.25],
      },
    }, 'listing-pin-ripple');
    addLayerSafely({
      id: SELECTED_APPROXIMATE_AREA_FILL_LAYER_ID,
      type: 'fill',
      source: APPROXIMATE_LISTINGS_SOURCE_ID,
      filter: ['==', ['get', 'listingId'], ''],
      paint: {
        'fill-color': '#ff4d5e',
        'fill-opacity': 0.24,
      },
    }, 'listing-pin-ripple');
    addLayerSafely({
      id: SELECTED_APPROXIMATE_AREA_LINE_LAYER_ID,
      type: 'line',
      source: APPROXIMATE_LISTINGS_SOURCE_ID,
      filter: ['==', ['get', 'listingId'], ''],
      paint: {
        'line-color': '#ff8a97',
        'line-opacity': 0.72,
        'line-width': 2.2,
      },
    }, 'listing-pin-ripple');
  };

  const ensureBuildingRenderingLayers = () => {
    const map = mapRef.current;
    if (!map || !venueArrival.enable3DBuildings) return;
    if (!map.getStyle()) return;

    if (!map.getSource(getBuildingsSourceId())) {
      map.addSource(getBuildingsSourceId(), buildBuildingsSource());
    }
    if (!map.getSource(AUTHORED_BUILDINGS_SOURCE_ID)) {
      map.addSource(AUTHORED_BUILDINGS_SOURCE_ID, {
        type: 'geojson',
        data: buildResidentAuthoredFeatureCollection(),
      });
    }
    addLayerSafely({
      id: AUTHORED_BUILDINGS_LAYER_ID,
      type: 'fill-extrusion',
      source: AUTHORED_BUILDINGS_SOURCE_ID,
      minzoom: AUTHORED_BUILDING_MIN_ZOOM - 0.5,
      paint: {
        'fill-extrusion-color': [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          buildingInteractionVisuals.authored.selectedColor,
          ['boolean', ['get', 'selected'], false],
          venueArrival.selectedBuilding.color,
          buildingInteractionVisuals.context.color,
        ],
        'fill-extrusion-height': [
          'interpolate',
          ['linear'],
          ['zoom'],
          AUTHORED_BUILDING_MIN_ZOOM,
          [
            '*',
            ['coalesce', ['get', 'render_height'], SELECTED_ASSET_EXTRUSION_HEIGHT],
            ['case', ['boolean', ['get', 'selected'], false], venueArrival.selectedBuilding.heightBoost * 0.22, 0.22],
          ],
          12,
          [
            '*',
            ['coalesce', ['get', 'render_height'], SELECTED_ASSET_EXTRUSION_HEIGHT],
            ['case', ['boolean', ['get', 'selected'], false], venueArrival.selectedBuilding.heightBoost * 0.58, 0.58],
          ],
          AUTHORED_BUILDING_FULL_DETAIL_ZOOM,
          [
            '*',
            ['coalesce', ['get', 'render_height'], SELECTED_ASSET_EXTRUSION_HEIGHT],
            ['case', ['boolean', ['get', 'selected'], false], venueArrival.selectedBuilding.heightBoost, 1],
          ],
        ],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          AUTHORED_BUILDING_MIN_ZOOM - 0.25,
          0,
          AUTHORED_BUILDING_MIN_ZOOM,
          0.16,
          12,
          0.38,
          AUTHORED_BUILDING_FULL_DETAIL_ZOOM,
          0.78,
        ],
        'fill-extrusion-vertical-gradient': true,
      },
    }, 'listing-pin-glow');
    updateAuthoredBuildingLod();

    if (venueArrival.enableVenueScopedBuildings) {
      addLayerSafely(buildBuildingsLayer(venueArrival), 'listing-pin-glow');
      addLayerSafely(buildInteractionSelectedBuildingLayer(venueArrival), 'listing-pin-glow');
      if (venueArrival.selectedBuilding.enabled) {
        addLayerSafely(buildSelectedBuildingLayer(venueArrival), 'listing-pin-glow');
      }
    }
  };

  const ensureDebugLayers = () => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;

    if (!map.getSource(DEBUG_RADIUS_SOURCE_ID)) {
      map.addSource(DEBUG_RADIUS_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }

    if (!map.getSource(DEBUG_BUILDING_IDS_SOURCE_ID)) {
      map.addSource(DEBUG_BUILDING_IDS_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!map.getLayer(DEBUG_BUILDING_IDS_LAYER_ID)) {
      map.addLayer({
        id: DEBUG_BUILDING_IDS_LAYER_ID,
        type: 'symbol',
        source: DEBUG_BUILDING_IDS_SOURCE_ID,
        layout: {
          visibility: debugControlsRef.current.showBuildingIds ? 'visible' : 'none',
          'text-field': ['get', 'id'],
          'text-size': 11,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 1.5,
        },
      });
    }
  };

  const publishDebugState = () => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    ensureDebugLayers();

    const selectedListing = selectedIdRef.current
      ? resolutionListingsRef.current.find((candidate) => candidate.id === selectedIdRef.current) ?? null
      : null;
    const coords = selectedListing ? getPublicMapCoords(selectedListing, buildingAssetsRef.current, resolutionListingsRef.current) : null;

    const rect = map.getContainer().getBoundingClientRect();
    const bbox: [[number, number], [number, number]] = [[0, 0], [rect.width, rect.height]];
    const knownBuildingLayerIds = [
      BUILDINGS_LAYER_ID,
      INTERACTION_SELECTED_BUILDING_LAYER_ID,
      SELECTED_BUILDING_LAYER_ID,
      SELECTED_BUILDING_ASSET_LAYER_ID,
      AUTHORED_BUILDINGS_LAYER_ID,
    ];
    const fillExtrusionLayersById = new Map(
      map.getStyle().layers
        .filter((layer) => layer.type === 'fill-extrusion')
        .map((layer) => [layer.id, layer]),
    );
    knownBuildingLayerIds.forEach((layerId) => {
      const layer = map.getLayer(layerId);
      if (layer && layer.type === 'fill-extrusion' && !fillExtrusionLayersById.has(layerId)) {
        fillExtrusionLayersById.set(layerId, layer);
      }
    });
    const fillExtrusionLayers = Array.from(fillExtrusionLayersById.values());
    const selectedLayerIds = [
      INTERACTION_SELECTED_BUILDING_LAYER_ID,
      SELECTED_BUILDING_LAYER_ID,
      SELECTED_BUILDING_ASSET_LAYER_ID,
    ]
      .filter((layerId) => map.getLayer(layerId));
    const selectedFeatures = selectedLayerIds.length
      ? map.queryRenderedFeatures(bbox, { layers: selectedLayerIds })
      : [];
    const contextFeatures = map.getLayer(BUILDINGS_LAYER_ID)
      ? map.queryRenderedFeatures(bbox, { layers: [BUILDINGS_LAYER_ID] })
      : [];
    const layerFeatureCounts = fillExtrusionLayers.map((layer) => ({
      layer,
      features: map.queryRenderedFeatures(bbox, { layers: [layer.id] }),
    }));
    const allRenderedFeatureIds = new Set<string>();
    layerFeatureCounts.forEach(({ features }) => {
      features.forEach((feature) => {
        if (feature.id !== undefined) allRenderedFeatureIds.add(String(feature.id));
      });
    });

    const radiusFeatureCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: coords ? [makeCirclePolygon(coords, venueArrival.localBuildings.radiusMeters)] : [],
    };
    (map.getSource(DEBUG_RADIUS_SOURCE_ID) as GeoJSONSource | undefined)?.setData(radiusFeatureCollection);

    const idFeatures: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features: layerFeatureCounts.flatMap(({ layer, features }) =>
        features.flatMap((feature) => {
          const center = getFeatureCenter(feature);
          if (!center || feature.id === undefined) return [];
          return [{
            type: 'Feature' as const,
            properties: { id: String(feature.id), layer: layer.id },
            geometry: { type: 'Point' as const, coordinates: center },
          }];
        }),
      ),
    };
    (map.getSource(DEBUG_BUILDING_IDS_SOURCE_ID) as GeoJSONSource | undefined)?.setData(idFeatures);

    const resolver = resolverDebugRef.current;
    window.dispatchEvent(new CustomEvent(MAP_DEBUG_STATE_EVENT, {
      detail: {
        kind: 'map-venue-arrival',
        controls: debugControlsRef.current,
        venue: {
          selectedListingName: selectedListing?.name ?? null,
          selectedListingId: selectedListing?.id ?? null,
          selectedBuildingId: resolver.selectedBuildingId,
          venueLatitude: coords?.lat ?? null,
          venueLongitude: coords?.lng ?? null,
        },
        resolver,
        rendering: {
          totalFillExtrusionLayers: fillExtrusionLayers.length,
          selectedLayerRenderedFeatureCount: selectedFeatures.length,
          contextLayerRenderedFeatureCount: contextFeatures.length,
          totalRenderedBuildingFeatures: allRenderedFeatureIds.size,
          currentSearchRadius: venueArrival.localBuildings.radiusMeters,
          cameraZoom: map.getZoom(),
          cameraPitch: map.getPitch(),
          cameraBearing: map.getBearing(),
        },
        layerAudit: layerFeatureCounts.map(({ layer, features }) => ({
          id: layer.id,
          source: layer.source ?? null,
          sourceLayer: layer['source-layer'] ?? null,
          visibility: layer.layout?.visibility ?? 'visible',
          opacity: map.getPaintProperty(layer.id, 'fill-extrusion-opacity'),
          renderedFeatureCount: features.length,
        })),
        selectedGeometrySource: selectedGeometrySourceRef.current,
        interaction: {
          selectedListingId: selectedIdRef.current,
          hoveredListingId: hoveredListingFeatureIdRef.current ? String(hoveredListingFeatureIdRef.current) : null,
          selectedBuildingId: selectedBuildingRef.current?.featureId ?? null,
          selectedBuildingKind: selectedBuildingRef.current?.kind ?? null,
          hoveredBuildingId: hoveredBuildingRef.current?.featureId ?? null,
          hoveredBuildingKind: hoveredBuildingRef.current?.kind ?? null,
        },
        counters: {
          resolverSelectedCount: resolver.selectedBuildingId ? 1 : 0,
          resolverContextCount: resolver.finalContextBuildingCount,
          rendererSelectedCount: selectedFeatures.length,
          rendererContextCount: contextFeatures.length,
          rendererAllExtrusionsCount: allRenderedFeatureIds.size,
        },
        featureInspection: featureInspectionRef.current,
        eventLog: eventLogRef.current,
      },
    }));
  };

  const prepareVenueBuildingSurface = () => {
    const map = mapRef.current;
    if (!map) return;

    if (map.getLayer(BUILDINGS_LAYER_ID)) {
      map.setLayoutProperty(BUILDINGS_LAYER_ID, 'visibility', 'visible');
      map.setPaintProperty(BUILDINGS_LAYER_ID, 'fill-extrusion-opacity', 0);
      map.setFilter(
        BUILDINGS_LAYER_ID,
        venueArrival.enableVenueContextBuildings ? null : buildVenueBuildingFilter([]),
      );
    }
    if (venueArrival.selectedBuilding.enabled && map.getLayer(SELECTED_BUILDING_LAYER_ID)) {
      map.setLayoutProperty(SELECTED_BUILDING_LAYER_ID, 'visibility', 'visible');
      map.setPaintProperty(SELECTED_BUILDING_LAYER_ID, 'fill-extrusion-opacity', 0);
      map.setFilter(SELECTED_BUILDING_LAYER_ID, buildSelectedBuildingFilter('__none__'));
    }
    if (map.getLayer(SELECTED_BUILDING_ASSET_LAYER_ID)) {
      map.setLayoutProperty(SELECTED_BUILDING_ASSET_LAYER_ID, 'visibility', 'visible');
      map.setPaintProperty(SELECTED_BUILDING_ASSET_LAYER_ID, 'fill-extrusion-opacity', 0);
    }
  };

  const renderVenueBuildings = (
    context: ReturnType<typeof collectVenueBuildingContext>,
  ) => {
    const map = mapRef.current;
    if (!map) return;

    const selectedBuilding = context.selectedBuilding;
    if (!selectedBuilding) {
      clearVenueBuildings();
      emitVenueBuildingCapture({
        selectedFeature: null,
        selectedBuildingId: null,
        contextBuildingIds: [],
        queriedFeatureCount: context.queriedFeatureCount,
        source: 'cleared',
      });
      return;
    }

    const authoredProviderFeatureIds = getResidentAuthoredProviderFeatureIds();
    const contextBuildingIds = isCaptureMode
      ? context.contextBuildingIds.filter((id) => id !== selectedBuilding.buildingId)
      : venueArrival.enableVenueContextBuildings
      ? context.contextBuildingIds.filter((id) => id !== selectedBuilding.buildingId && !authoredProviderFeatureIds.has(id))
      : [];
    currentContextBuildingIdsRef.current = [
      selectedBuilding.buildingId,
      ...contextBuildingIds,
    ];
    const contextKey = [
      selectedBuilding.buildingId,
      ...contextBuildingIds,
      context.radiusMeters,
    ].join('|');

    if (venueContextKeyRef.current !== contextKey) {
      venueContextKeyRef.current = contextKey;
      venueBuildingStatsRef.current = {
        renderedCount: context.contextBuildingIds.length,
        queriedFeatureCount: context.queriedFeatureCount,
      };
    }
    if (map.getLayer(SELECTED_BUILDING_LAYER_ID)) {
      map.setFilter(
        SELECTED_BUILDING_LAYER_ID,
        buildSelectedBuildingFilter(selectedBuilding.buildingId),
      );
    }
    if (map.getSource(SELECTED_BUILDING_ASSET_SOURCE_ID)) {
      (map.getSource(SELECTED_BUILDING_ASSET_SOURCE_ID) as GeoJSONSource).setData(buildSelectedAssetFeatureCollection(null));
    }
    if (map.getLayer(SELECTED_BUILDING_ASSET_LAYER_ID)) {
      map.setPaintProperty(SELECTED_BUILDING_ASSET_LAYER_ID, 'fill-extrusion-opacity', 0);
      map.setLayoutProperty(SELECTED_BUILDING_ASSET_LAYER_ID, 'visibility', 'none');
    }
    if (map.getLayer(BUILDINGS_LAYER_ID)) {
      map.setFilter(BUILDINGS_LAYER_ID, buildVenueBuildingFilter(contextBuildingIds));
    }

    if (map.getLayer(BUILDINGS_LAYER_ID)) {
      map.setLayoutProperty(
        BUILDINGS_LAYER_ID,
        'visibility',
        venueArrival.enableVenueContextBuildings || isCaptureMode ? 'visible' : 'none',
      );
      applyContextBuildingStyle(venueArrival.enableVenueContextBuildings || isCaptureMode ? venueArrival.localBuildings.opacity : 0);
    }
    if (venueArrival.selectedBuilding.enabled && map.getLayer(SELECTED_BUILDING_LAYER_ID)) {
      map.setLayoutProperty(SELECTED_BUILDING_LAYER_ID, 'visibility', 'visible');
      map.setPaintProperty(
        SELECTED_BUILDING_LAYER_ID,
        'fill-extrusion-color',
        venueArrival.selectedBuilding.color,
      );
      map.setPaintProperty(
        SELECTED_BUILDING_LAYER_ID,
        'fill-extrusion-opacity',
        venueArrival.selectedBuilding.opacity,
      );
    }
    pushDebugEvent(
      'context applied',
      `selected=${selectedBuilding.buildingId} context=${contextBuildingIds.length}`,
    );
    selectedGeometrySourceRef.current = {
      source: 'runtime-provider',
      reason: 'Runtime provider resolver selected the venue building',
      assetId: null,
      providerFeatureId: selectedBuilding.buildingId,
      geometryType: selectedBuilding.feature.geometry?.type ?? null,
      polygonCount: getPolygonCount(selectedBuilding.feature.geometry),
    };
    const venueSelectedBuilding = {
      featureId: selectedBuilding.buildingId,
      layerId: BUILDINGS_LAYER_ID,
      kind: 'venue-selected',
      listingId: selectedIdRef.current,
      assetId: null,
      providerFeatureId: selectedBuilding.buildingId,
      sourceLayer: selectedBuilding.feature.sourceLayer ?? venueArrival.buildings.sourceLayer,
    };
    selectedBuildingRef.current = venueSelectedBuilding;
    setSelectedBuilding(venueSelectedBuilding);
    refreshResidentAuthoredBuildings();
    applyDebugControls();
    publishDebugState();
    emitVenueBuildingCapture({
      selectedFeature: selectedBuilding.feature,
      selectedBuildingId: selectedBuilding.buildingId,
      contextBuildingIds: currentContextBuildingIdsRef.current,
      queriedFeatureCount: context.queriedFeatureCount,
      source: 'venue-arrival',
    });
  };

  const renderVenueBuildingAsset = (
    asset: BuildingAsset,
    context: ReturnType<typeof collectVenueBuildingContext> | null,
    reason: string,
  ) => {
    const map = mapRef.current;
    if (!map) return;

    const providerFeatureIds = getResidentAuthoredProviderFeatureIds();
    asset.provider.featureIds.forEach((id) => providerFeatureIds.add(id));
    const contextBuildingIds = context
      ? context.contextBuildingIds.filter((buildingId) => !providerFeatureIds.has(buildingId))
      : [];
    currentContextBuildingIdsRef.current = [...asset.provider.featureIds, ...contextBuildingIds];
    venueContextKeyRef.current = [
      asset.id,
      ...contextBuildingIds,
      context?.radiusMeters ?? venueArrival.localBuildings.radiusMeters,
    ].join('|');
    venueBuildingStatsRef.current = {
      renderedCount: contextBuildingIds.length,
      queriedFeatureCount: context?.queriedFeatureCount ?? 0,
    };

    addResidentAuthoredAsset(asset);
    if (map.getSource(SELECTED_BUILDING_ASSET_SOURCE_ID)) {
      (map.getSource(SELECTED_BUILDING_ASSET_SOURCE_ID) as GeoJSONSource).setData(buildSelectedAssetFeatureCollection(null));
    }
    if (map.getLayer(SELECTED_BUILDING_LAYER_ID)) {
      map.setFilter(SELECTED_BUILDING_LAYER_ID, buildSelectedBuildingFilter('__none__'));
      map.setPaintProperty(SELECTED_BUILDING_LAYER_ID, 'fill-extrusion-opacity', 0);
      map.setLayoutProperty(SELECTED_BUILDING_LAYER_ID, 'visibility', 'none');
    }
    if (map.getLayer(SELECTED_BUILDING_ASSET_LAYER_ID)) {
      map.setLayoutProperty(SELECTED_BUILDING_ASSET_LAYER_ID, 'visibility', 'none');
      map.setPaintProperty(SELECTED_BUILDING_ASSET_LAYER_ID, 'fill-extrusion-opacity', 0);
    }
    if (map.getLayer(BUILDINGS_LAYER_ID)) {
      map.setFilter(BUILDINGS_LAYER_ID, buildVenueBuildingFilter(contextBuildingIds));
      map.setLayoutProperty(
        BUILDINGS_LAYER_ID,
        'visibility',
        venueArrival.enableVenueContextBuildings || isCaptureMode ? 'visible' : 'none',
      );
      applyContextBuildingStyle(venueArrival.enableVenueContextBuildings || isCaptureMode ? venueArrival.localBuildings.opacity : 0);
    }

    selectedGeometrySourceRef.current = {
      source: 'building-asset',
      reason,
      assetId: asset.id,
      providerFeatureId: asset.provider.featureIds[0] ?? null,
      geometryType: asset.geometry.type,
      polygonCount: getPolygonCount(asset.geometry),
    };
    const venueSelectedAssetBuilding = {
      featureId: asset.id,
      layerId: AUTHORED_BUILDINGS_LAYER_ID,
      kind: 'venue-selected',
      listingId: asset.listingId,
      assetId: asset.id,
      providerFeatureId: asset.provider.featureIds[0] ?? null,
      sourceLayer: venueArrival.buildings.sourceLayer,
    };
    selectedBuildingRef.current = venueSelectedAssetBuilding;
    setSelectedBuilding(venueSelectedAssetBuilding);
    resolverDebugRef.current = {
      selectedBuildingId: asset.provider.featureIds[0] ?? asset.id,
      totalBuildingCandidates: context?.queriedFeatureCount ?? 0,
      candidatesAfterRadiusFilter: context
        ? context.overlapStats.candidateCountBeforeOverlapFilter + (context.selectedBuilding ? 1 : 0)
        : 0,
      candidatesAfterOverlapFilter: context
        ? context.overlapStats.candidateCountBeforeOverlapFilter + (context.selectedBuilding ? 1 : 0) - context.overlapStats.removedSelectedOverlapCount
        : 0,
      candidatesAfterDuplicateRemoval: contextBuildingIds.length + 1,
      finalContextBuildingCount: contextBuildingIds.length,
      executionTimeMs: null,
    };
    pushDebugEvent('building asset loaded', `${asset.id} context=${contextBuildingIds.length}`);
    applyDebugControls();
    refreshResidentAuthoredBuildings();
    publishDebugState();
  };

  const resolveVenueBuildings = (requestId: number, attempt = 0) => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) {
      emitCaptureStatus({
        arrivalComplete: true,
        idleReached: true,
        buildingSourceLoaded: false,
        sourceFeatureCount: 0,
        resolveAttempts: attempt,
        message: 'Waiting for style before Venue Arrival resolve',
      });
      map.once('idle', () => resolveVenueBuildings(requestId, attempt));
      return;
    }
    if (requestId !== venueResolveRequestRef.current) return;
    if (!venueArrival.enable3DBuildings || !venueArrival.enableVenueScopedBuildings) {
      emitCaptureStatus({
        arrivalComplete: true,
        idleReached: true,
        buildingSourceLoaded: isBuildingSourceLoaded(),
        sourceFeatureCount: getResidentBuildingSourceFeatureCount(),
        resolveAttempts: attempt,
        message: 'Venue Arrival buildings disabled',
      });
      clearVenueBuildings();
      return;
    }

    const selectedId = selectedIdRef.current;
    const selectedListing = selectedId
      ? resolutionListingsRef.current.find((candidate) => candidate.id === selectedId) ?? null
      : null;

    if (!selectedId || !selectedListing) {
      emitCaptureStatus({
        arrivalComplete: true,
        idleReached: true,
        buildingSourceLoaded: isBuildingSourceLoaded(),
        sourceFeatureCount: getResidentBuildingSourceFeatureCount(),
        resolveAttempts: attempt,
        message: 'No selected listing available for Venue Arrival resolve',
      });
      clearVenueBuildings();
      return;
    }

    if (!isCaptureMode && isApproximateLocation(selectedListing)) {
      emitCaptureStatus({
        arrivalComplete: true,
        idleReached: true,
        buildingSourceLoaded: isBuildingSourceLoaded(),
        sourceFeatureCount: getResidentBuildingSourceFeatureCount(),
        resolveAttempts: attempt,
        message: 'Approximate public location; venue building rendering suppressed',
      });
      clearVenueBuildings();
      return;
    }

    const geometrySourceMode = debugControlsRef.current.geometrySourceMode;
    const selectedAsset = !isCaptureMode && geometrySourceMode !== 'runtime'
      ? getBuildingAssetForListing(selectedListing, buildingAssetsRef.current, listingsRef.current)
      : null;
    const hasValidSelectedAsset = Boolean(selectedAsset && isBuildingAssetGeometry(selectedAsset.geometry));
    const zoom = map.getZoom();
    if (hasValidSelectedAsset && selectedAsset && zoom >= SELECTED_ASSET_MIN_ZOOM) {
      prepareVenueBuildingSurface();
      const context = zoom >= venueArrival.localBuildings.minZoom && map.getSource(getBuildingsSourceId())
        ? collectVenueBuildingContext(map, selectedListing, venueArrival)
        : null;
      renderVenueBuildingAsset(
        selectedAsset,
        context,
        geometrySourceMode === 'asset'
          ? 'Developer forced Building Asset source'
          : 'Building Asset found for selected venue',
      );
      emitCaptureStatus({
        arrivalComplete: true,
        idleReached: true,
        buildingSourceLoaded: isBuildingSourceLoaded(),
        sourceFeatureCount: context?.queriedFeatureCount ?? getResidentBuildingSourceFeatureCount(),
        resolveAttempts: attempt + 1,
        message: 'Loaded Building Asset',
      });
      return;
    }

    if (zoom < venueArrival.localBuildings.minZoom) {
      emitCaptureStatus({
        arrivalComplete: true,
        idleReached: true,
        buildingSourceLoaded: isBuildingSourceLoaded(),
        sourceFeatureCount: getResidentBuildingSourceFeatureCount(),
        resolveAttempts: attempt,
        message: hasValidSelectedAsset
          ? `Zoom ${zoom.toFixed(2)} is below selected asset threshold`
          : `Zoom ${zoom.toFixed(2)} is below building resolve threshold`,
      });
      clearVenueBuildings();
      if (Math.abs(map.getPitch()) > 0.05 || Math.abs(map.getBearing()) > 0.05) {
        map.easeTo({
          pitch: WORLD_PITCH,
          bearing: 0,
          duration: prefersReducedMotionRef.current ? 0 : 400,
          essential: false,
        });
      }
      return;
    }

    if (selectedAsset && !isBuildingAssetGeometry(selectedAsset.geometry)) {
      pushDebugEvent('building asset invalid', selectedAsset.id);
    }

    const buildingSourceId = getBuildingsSourceId();
    if (!map.getSource(buildingSourceId)) {
      emitCaptureStatus({
        arrivalComplete: true,
        idleReached: true,
        buildingSourceLoaded: false,
        sourceFeatureCount: 0,
        resolveAttempts: attempt,
        message: `Building source ${buildingSourceId} is missing`,
      });
      return;
    }

    prepareVenueBuildingSurface();

    pushDebugEvent(
      'resolver started',
      selectedAsset && !isBuildingAssetGeometry(selectedAsset.geometry)
        ? `request=${requestId} attempt=${attempt} invalid asset fallback`
        : geometrySourceMode === 'runtime'
          ? `request=${requestId} attempt=${attempt} forced runtime`
          : `request=${requestId} attempt=${attempt} no asset fallback`,
    );
    const resolveStartedAt = performance.now();
    const context = collectVenueBuildingContext(map, selectedListing, venueArrival);
    const executionTimeMs = performance.now() - resolveStartedAt;
    const selectedCount = context.selectedBuilding ? 1 : 0;
    const candidatesAfterRadiusFilter =
      context.overlapStats.candidateCountBeforeOverlapFilter + selectedCount;
    const candidatesAfterOverlapFilter =
      candidatesAfterRadiusFilter - context.overlapStats.removedSelectedOverlapCount;
    const finalContextBuildingCount = Math.max(
      0,
      context.contextBuildingIds.filter(
        (buildingId) => buildingId !== context.selectedBuilding?.buildingId,
      ).length,
    );
    resolverDebugRef.current = {
      selectedBuildingId: context.selectedBuilding?.buildingId ?? null,
      totalBuildingCandidates: context.queriedFeatureCount,
      candidatesAfterRadiusFilter,
      candidatesAfterOverlapFilter,
      candidatesAfterDuplicateRemoval: finalContextBuildingCount + selectedCount,
      finalContextBuildingCount,
      executionTimeMs,
    };
    pushDebugEvent(
      'resolver finished',
      `selected=${context.selectedBuilding?.buildingId ?? 'none'} context=${finalContextBuildingCount} ${executionTimeMs.toFixed(1)}ms`,
    );
    emitCaptureStatus({
      arrivalComplete: true,
      idleReached: true,
      buildingSourceLoaded: isBuildingSourceLoaded(),
      sourceFeatureCount: context.queriedFeatureCount,
      resolveAttempts: attempt + 1,
      message: context.selectedBuilding
        ? (geometrySourceMode === 'runtime' ? 'Using Runtime Provider' : 'No Building Asset. Using Runtime Provider')
        : `Venue Arrival found ${context.queriedFeatureCount} source features but no selected building`,
    });
    if (!context.selectedBuilding && attempt < 3) {
      map.once('idle', () => resolveVenueBuildings(requestId, attempt + 1));
      return;
    }
    renderVenueBuildings(context);
  };

  const syncVenueBuildings = () => {
    ensureBuildingRenderingLayers();
    const requestId = venueResolveRequestRef.current + 1;
    venueResolveRequestRef.current = requestId;
    resolveVenueBuildings(requestId);
  };

  const waitForCaptureArrivalReadiness = (
    requestId: number,
    attempt = 0,
    idleReached = false,
  ) => {
    const map = mapRef.current;
    if (!map || requestId !== captureReadinessRequestRef.current) return;
    primeCaptureBuildingSourceSurface();

    if (!idleReached) {
      emitCaptureStatus({
        arrivalComplete: true,
        idleReached: false,
        buildingSourceLoaded: isBuildingSourceLoaded(),
        sourceFeatureCount: getResidentBuildingSourceFeatureCount(),
        resolveAttempts: attempt,
        message: 'Arrival complete; priming building source',
      });
      map.once('idle', () => waitForCaptureArrivalReadiness(requestId, attempt, true));
      return;
    }

    const sourceFeatureCount = getResidentBuildingSourceFeatureCount();
    const buildingSourceLoaded = isBuildingSourceLoaded();
    emitCaptureStatus({
      arrivalComplete: true,
      idleReached: true,
      buildingSourceLoaded,
      sourceFeatureCount,
      resolveAttempts: attempt,
      message: sourceFeatureCount > 0 ? 'Building source features resident' : 'Waiting for building source features',
    });

    if (sourceFeatureCount > 0) {
      const venueRequestId = venueResolveRequestRef.current + 1;
      venueResolveRequestRef.current = venueRequestId;
      emitCaptureStatus({
        arrivalComplete: true,
        idleReached: true,
        buildingSourceLoaded,
        sourceFeatureCount,
        resolveAttempts: attempt + 1,
        message: 'Resolving with Venue Arrival',
      });
      resolveVenueBuildings(venueRequestId);
      return;
    }

    if (attempt >= CAPTURE_SOURCE_READY_MAX_ATTEMPTS) {
      emitVenueBuildingCapture({
        selectedFeature: null,
        selectedBuildingId: null,
        contextBuildingIds: [],
        queriedFeatureCount: 0,
        source: 'cleared',
      });
      emitCaptureStatus({
        arrivalComplete: true,
        idleReached: true,
        buildingSourceLoaded,
        sourceFeatureCount,
        resolveAttempts: attempt,
        message: 'No building source features resident yet',
      });
      return;
    }

    let settled = false;
    let timeoutId = 0;
    const retry = () => {
      if (settled || requestId !== captureReadinessRequestRef.current) return;
      settled = true;
      window.clearTimeout(timeoutId);
      map.off('idle', retry);
      map.off('sourcedata', handleSourceData);
      waitForCaptureArrivalReadiness(requestId, attempt + 1, true);
    };
    const handleSourceData = (event: maplibregl.MapSourceDataEvent) => {
      if (event.sourceId === getBuildingsSourceId()) retry();
    };

    map.on('idle', retry);
    map.on('sourcedata', handleSourceData);
    timeoutId = window.setTimeout(retry, 450);
  };

  const handleVenueZoomEnd = () => {
    const map = mapRef.current;
    if (!map || !selectedIdRef.current) return;
    updateSelectedAssetLod();
    const selectedListing = resolutionListingsRef.current.find((candidate) => candidate.id === selectedIdRef.current) ?? null;
    const selectedAsset = getBuildingAssetForListing(
      selectedListing,
      buildingAssetsRef.current,
      listingsRef.current,
    );
    if (
      selectedAsset &&
      debugControlsRef.current.geometrySourceMode !== 'runtime' &&
      selectedGeometrySourceRef.current.source === 'none' &&
      map.getZoom() >= SELECTED_ASSET_MIN_ZOOM
    ) {
      syncVenueBuildings();
      return;
    }
    if (
      selectedGeometrySourceRef.current.source === 'building-asset' &&
      map.getZoom() >= SELECTED_ASSET_MIN_ZOOM &&
      map.getZoom() < venueArrival.localBuildings.minZoom
    ) {
      if (map.getLayer(BUILDINGS_LAYER_ID)) {
        map.setFilter(BUILDINGS_LAYER_ID, buildVenueBuildingFilter([]));
        map.setPaintProperty(BUILDINGS_LAYER_ID, 'fill-extrusion-opacity', 0);
        map.setLayoutProperty(BUILDINGS_LAYER_ID, 'visibility', 'none');
      }
      publishDebugState();
      return;
    }
    if (map.getZoom() >= venueArrival.localBuildings.minZoom) return;

    clearVenueBuildings();
    if (Math.abs(map.getPitch()) > 0.05 || Math.abs(map.getBearing()) > 0.05) {
      map.easeTo({
        pitch: WORLD_PITCH,
        bearing: 0,
        duration: prefersReducedMotionRef.current ? 0 : 400,
        essential: false,
      });
    }
  };

  const resolveResponsivePadding = (padding: ExplorerMapPadding): ExplorerMapPadding => {
    const width = mapRef.current?.getContainer().clientWidth ?? 0;
    if (width >= 768) return padding;
    return {
      top: Math.min(padding.top, 72),
      bottom: Math.min(padding.bottom, 72),
      left: Math.min(padding.left, 48),
      right: Math.min(padding.right, 48),
    };
  };

  const applyDestinationFraming = (framing: ExplorerMapFraming) => {
    const map = mapRef.current;
    if (!map) return;

    map.stop();
    const duration = prefersReducedMotionRef.current ? 0 : framing.durationMs;
    markProgrammaticMapMotion(duration + 250);
    const padding = resolveResponsivePadding(framing.padding);

    if (framing.kind === 'bounds') {
      const bounds = new maplibregl.LngLatBounds(framing.bounds[0], framing.bounds[1]);
      map.fitBounds(bounds, {
        padding,
        maxZoom: framing.maxZoom,
        pitch: framing.pitch,
        bearing: framing.bearing,
        duration,
        essential: false,
      });
      return;
    }

    map.flyTo({
      center: [framing.center.lng, framing.center.lat],
      zoom: framing.zoom,
      pitch: framing.pitch,
      bearing: framing.bearing,
      duration,
      padding,
      essential: false,
    });
  };

  const flyToSelectedVenue = (
    listing: Listing,
    coords: { lng: number; lat: number },
  ) => {
    const map = mapRef.current;
    if (!map) return;

    const isApproximate = isApproximateLocation(listing);
    const selectedAsset = isApproximate
      ? null
      : getBuildingAssetForListing(listing, buildingAssetsRef.current, listingsRef.current);
    const framing = (!isApproximate ? buildListingMapFraming(listing, selectedAsset) : null) ?? {
      kind: 'camera' as const,
      profile: 'listing' as const,
      center: coords,
      zoom: isApproximate ? 14.2 : venueArrival.arrival.zoom,
      pitch: isApproximate ? WORLD_PITCH : venueArrival.arrival.pitch,
      bearing: venueArrival.defaultBearing,
      durationMs: venueArrival.arrival.durationMs,
      padding: venueArrival.arrival.padding,
      source: 'fallback' as const,
    };
    const currentCenter = map.getCenter();
    const motionDuration = estimateMapMotionDurationMs(
      { lng: currentCenter.lng, lat: currentCenter.lat, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() },
      { lng: framing.center.lng, lat: framing.center.lat, zoom: framing.zoom, pitch: framing.pitch, bearing: framing.bearing },
      framing.durationMs,
    );

    pushDebugEvent('venue selected', `${selectedIdRef.current ?? 'none'}`);
    if (isCaptureMode) {
      const requestId = captureReadinessRequestRef.current + 1;
      captureReadinessRequestRef.current = requestId;
      emitCaptureStatus({
        arrivalComplete: false,
        idleReached: false,
        buildingSourceLoaded: isBuildingSourceLoaded(),
        sourceFeatureCount: getResidentBuildingSourceFeatureCount(),
        resolveAttempts: 0,
        message: 'Flying to venue',
      });
      map.once('moveend', () => waitForCaptureArrivalReadiness(requestId));
    } else {
      map.once('moveend', () => {
        if (isApproximate) {
          clearVenueBuildings();
        } else {
          syncVenueBuildings();
        }
        if (selectedIdRef.current) onVenueArrivalCompleteRef.current?.(selectedIdRef.current);
      });
    }
    applyDestinationFraming({
      ...framing,
      durationMs: motionDuration,
    });
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: swingMapStyle,
      center: [cameraRef.current.lng, cameraRef.current.lat],
      zoom: cameraRef.current.zoom,
      pitch: cameraRef.current.pitch,
      bearing: cameraRef.current.bearing,
      minZoom: 2,
      maxZoom: 20,
      // Allow the map to pitch for the venue-arrival angle. The default cap of
      // 60° matches venueArrival.maxPitch; raising the cap does not pitch the
      // map on its own — pitch is driven only during venue arrival and reset.
      maxPitch: venueArrival.maxPitch,
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
    });
    mapRef.current = map;
    const discoveryPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 34,
      className: 'swingsphere-discovery-popup',
    });
    let hoveredThreePinId: string | null = null;
    let hoverReleaseTimer: number | null = null;
    const cancelHoverRelease = () => {
      if (hoverReleaseTimer === null) return;
      window.clearTimeout(hoverReleaseTimer);
      hoverReleaseTimer = null;
    };
    const releaseThreePinHover = (delayMs = 240) => {
      cancelHoverRelease();
      hoverReleaseTimer = window.setTimeout(() => {
        hoveredThreePinId = null;
        threePinLayerRef.current?.setHovered(null);
        hoverReleaseTimer = null;
      }, delayMs);
    };
    updateMapDiagnostics({ mounted: true, loaded: false, styleLoaded: false });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            map.resize();
            updateMapDiagnostics();
          })
        : null;
    if (resizeObserver) {
      resizeObserver.observe(containerRef.current);
    }
    window.requestAnimationFrame(() => {
      map.resize();
      updateMapDiagnostics();
    });

    const setPointerCursor = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const clearPointerCursor = () => {
      map.getCanvas().style.cursor = '';
    };

    const setListingHoverState = (featureId: string | number | null, hover: boolean) => {
      if (featureId === null) return;
      try {
        map.setFeatureState({ source: LISTINGS_SOURCE_ID, id: featureId }, { hover });
      } catch {
        // Clustered source features can be recycled while the map is moving.
      }
    };

    const clearListingHover = () => {
      setListingHoverState(hoveredListingFeatureIdRef.current, false);
      hoveredListingFeatureIdRef.current = null;
      threePinLayerRef.current?.setHovered(null);
    };

    const setApproximateListingHoverState = (featureId: string | number | null, hover: boolean) => {
      if (featureId === null) return;
      try {
        map.setFeatureState({ source: APPROXIMATE_LISTINGS_SOURCE_ID, id: featureId }, { hover });
      } catch {
        // Approximate area features can be regenerated while the map is moving.
      }
    };

    const clearApproximateListingHover = () => {
      setApproximateListingHoverState(hoveredListingFeatureIdRef.current, false);
      hoveredListingFeatureIdRef.current = null;
    };

    const handleListingHover = (event: maplibregl.MapLayerMouseEvent) => {
      setPointerCursor();
      const feature = event.features?.[0];
      const featureId = feature?.id ?? feature?.properties?.listingId;
      if (typeof featureId !== 'string' && typeof featureId !== 'number') return;
      if (hoveredListingFeatureIdRef.current === featureId) return;
      clearApproximateListingHover();
      clearListingHover();
      hoveredListingFeatureIdRef.current = featureId;
      setListingHoverState(featureId, true);
      threePinLayerRef.current?.setHovered(String(feature?.properties?.listingId ?? featureId));
    };

    const handleApproximateListingHover = (event: maplibregl.MapLayerMouseEvent) => {
      setPointerCursor();
      const feature = event.features?.[0];
      const featureId = feature?.id ?? feature?.properties?.listingId;
      if (typeof featureId !== 'string' && typeof featureId !== 'number') return;
      if (hoveredListingFeatureIdRef.current === featureId) return;
      clearListingHover();
      clearApproximateListingHover();
      hoveredListingFeatureIdRef.current = featureId;
      setApproximateListingHoverState(featureId, true);
    };

    const showDiscoveryPopup = (coordinates: [number, number], pointCount: number) => {
      const nearestRegion = activityRegionsRef.current
        .map((region) => ({
          region,
          distance: Math.hypot(region.longitude - coordinates[0], region.latitude - coordinates[1]),
        }))
        .sort((a, b) => a.distance - b.distance)[0]?.region;
      if (!nearestRegion) return;
      const content = document.createElement('div');
      Object.assign(content.style, {
        minWidth: '190px',
        maxWidth: '280px',
        padding: '10px 13px',
        border: '1px solid rgba(197,29,52,.72)',
        borderRadius: '14px',
        background: 'rgba(15,17,21,.95)',
        color: '#f5f5f5',
        boxShadow: '0 12px 30px rgba(0,0,0,.4)',
        backdropFilter: 'blur(12px)',
      });
      const title = document.createElement('div');
      title.textContent = nearestRegion.name;
      Object.assign(title.style, { fontSize: '14px', fontWeight: '750', lineHeight: '1.2' });
      const subtitle = document.createElement('div');
      const flag = nearestRegion.countryIso2 ? countryCodeToEmoji(nearestRegion.countryIso2) : '';
      subtitle.textContent = `${pointCount} listing${pointCount === 1 ? '' : 's'}${flag ? ` ${flag}` : ''}`;
      Object.assign(subtitle.style, { marginTop: '4px', fontSize: '11px', color: '#aeb7c3' });
      content.append(title, subtitle);
      discoveryPopup.setLngLat(coordinates).setDOMContent(content).addTo(map);
      const popupElement = discoveryPopup.getElement();
      const popupContent = popupElement?.querySelector<HTMLElement>('.maplibregl-popup-content');
      const popupTip = popupElement?.querySelector<HTMLElement>('.maplibregl-popup-tip');
      if (popupContent) {
        Object.assign(popupContent.style, {
          padding: '0',
          border: '0',
          borderRadius: '14px',
          background: 'transparent',
          boxShadow: 'none',
        });
      }
      if (popupTip) popupTip.style.display = 'none';
    };

    const setClusterHoverState = (featureId: string | number | null, hover: boolean) => {
      if (featureId === null) return;
      try {
        map.setFeatureState({ source: LISTINGS_SOURCE_ID, id: featureId }, { hover });
      } catch {
        // Some clustered features do not expose stable generated ids across tiles.
      }
    };

    const clearClusterHover = () => {
      setClusterHoverState(hoveredClusterFeatureIdRef.current, false);
      hoveredClusterFeatureIdRef.current = null;
      discoveryPopup.remove();
    };

    const handleClusterHover = (event: maplibregl.MapLayerMouseEvent) => {
      setPointerCursor();
      const feature = event.features?.[0];
      const clusterId = feature?.id ?? feature?.properties?.cluster_id;
      if (typeof clusterId !== 'string' && typeof clusterId !== 'number') return;
      if (hoveredClusterFeatureIdRef.current === clusterId) return;
      clearClusterHover();
      hoveredClusterFeatureIdRef.current = clusterId;
      setClusterHoverState(clusterId, true);
      if (feature?.geometry.type === 'Point') {
        showDiscoveryPopup(
          feature.geometry.coordinates as [number, number],
          Math.max(1, Number(feature.properties?.point_count) || 1),
        );
      }
    };

    const handleClusterClick = async (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const clusterId = Number(feature?.properties?.cluster_id);
      if (!feature || !Number.isFinite(clusterId) || feature.geometry.type !== 'Point') return;
      const source = map.getSource(LISTINGS_SOURCE_ID) as GeoJSONSource | undefined;
      if (!source) return;
      const coordinates = feature.geometry.coordinates as [number, number];
      const pointCount = Math.max(1, Number(feature.properties?.point_count) || 1);
      showDiscoveryPopup(coordinates, pointCount);
      const [expansionZoom, leaves] = await Promise.all([
        source.getClusterExpansionZoom(clusterId),
        source.getClusterLeaves(clusterId, pointCount, 0),
      ]);

      const bounds = new maplibregl.LngLatBounds();
      leaves.forEach((leaf) => {
        if (leaf.geometry.type === 'Point') {
          bounds.extend(leaf.geometry.coordinates as [number, number]);
        }
      });

      const northEast = bounds.getNorthEast();
      const southWest = bounds.getSouthWest();
      const hasArea =
        northEast.lng !== southWest.lng || northEast.lat !== southWest.lat;

      if (hasArea) {
        const isWideLayout = map.getContainer().clientWidth >= 768;
        markProgrammaticMapMotion(900);
        map.fitBounds(bounds, {
          padding: {
            top: 84,
            bottom: 84,
            left: isWideLayout ? 360 : 56,
            right: 56,
          },
          maxZoom: Math.min(expansionZoom + 2, 16),
          duration: prefersReducedMotionRef.current ? 0 : 700,
        });
        return;
      }

      markProgrammaticMapMotion(900);
      map.easeTo({
        center: coordinates,
        zoom: Math.min(expansionZoom + 2, 16),
        duration: prefersReducedMotionRef.current ? 0 : 700,
      });
    };

    const handleListingClick = (event: maplibregl.MapLayerMouseEvent) => {
      const listingId = event.features?.[0]?.properties?.listingId;
      if (typeof listingId === 'string') onSelectRef.current(listingId);
    };

    const handleApproximateListingClick = (event: maplibregl.MapLayerMouseEvent) => {
      const listingId = event.features?.[0]?.properties?.listingId;
      if (typeof listingId === 'string') onSelectRef.current(listingId);
    };

    const inspectBuildingFeature = (feature: MapGeoJSONFeature) => {
      const selectedId = resolverDebugRef.current.selectedBuildingId;
      const contextIds = new Set(currentContextBuildingIdsRef.current);
      const featureId = feature.id === undefined ? 'unknown' : String(feature.id);
      const isSelectedAsset = feature.layer.id === SELECTED_BUILDING_ASSET_LAYER_ID;
      const isAuthoredAsset = feature.layer.id === AUTHORED_BUILDINGS_LAYER_ID;
      featureInspectionRef.current = {
        featureId,
        sourceLayer: feature.sourceLayer ?? null,
        geometryType: feature.geometry?.type ?? 'unknown',
        renderHeight: feature.properties?.render_height ?? feature.properties?.height ?? null,
        renderMinHeight: feature.properties?.render_min_height ?? feature.properties?.min_height ?? null,
        polygonCount: getPolygonCount(feature.geometry),
        isSelected:
          isSelectedAsset ||
          (isAuthoredAsset && feature.properties?.selected === true) ||
          featureId === selectedId ||
          selectedBuildingRef.current?.featureId === featureId,
        isContext: contextIds.has(featureId),
        renderedByLayer: feature.layer.id,
      };
      pushDebugEvent('building inspected', `${feature.layer.id}:${featureId}`);
      publishDebugState();
    };

    const getInteractivePinHit = (point: maplibregl.PointLike) => {
      const pinLayers = [
        'selected-listing',
        LISTING_INTERACTION_LAYER_ID,
        'listing-clusters',
      ].filter((layerId) => map.getLayer(layerId));
      if (!pinLayers.length) return null;
      return map.queryRenderedFeatures(point, { layers: pinLayers })[0] ?? null;
    };

    const getInteractiveBuildingHit = (point: maplibregl.PointLike) => {
      const buildingLayers = map
        .getStyle()
        .layers
        .filter((layer) => layer.type === 'fill-extrusion' && isBuildingLayerId(layer.id))
        .map((layer) => layer.id);
      if (!buildingLayers.length) return null;
      return map.queryRenderedFeatures(point, { layers: buildingLayers })[0] ?? null;
    };

    const handleMapPointerMove = (event: maplibregl.MapMouseEvent) => {
      // Use a generous screen-space target and hold hover briefly after the
      // pointer leaves it. That avoids pixel-perfect aiming and prevents the
      // lift animation from rapidly toggling at the edge of the hit area.
      const threePinHit = threePinLayerRef.current?.hitTest(event.point, 40) ?? null;
      if (threePinHit) {
        cancelHoverRelease();
        hoveredThreePinId = threePinHit.id;
        threePinLayerRef.current?.setHovered(threePinHit.id);
        setPointerCursor();
        setBuildingFeatureHover(null, false);
        return;
      }
      if (hoveredThreePinId) releaseThreePinHover();

      const pinHit = getInteractivePinHit(event.point);
      if (pinHit) {
        setBuildingFeatureHover(null, false);
        return;
      }

      const buildingHit = getInteractiveBuildingHit(event.point);
      if (!buildingHit) {
        setBuildingFeatureHover(null, false);
        clearPointerCursor();
        return;
      }

      setPointerCursor();
      setBuildingFeatureHover(buildingHit, true);
    };

    const handleMapPointerLeave = () => {
      releaseThreePinHover(180);
      setBuildingFeatureHover(null, false);
      clearPointerCursor();
    };

    const handleBuildingClick = (event: maplibregl.MapMouseEvent) => {
      if (isCaptureMode) {
        const captureLayerIds = [SELECTED_BUILDING_LAYER_ID, BUILDINGS_LAYER_ID]
          .filter((layerId) => map.getLayer(layerId));
        const feature = captureLayerIds.length
          ? (map.queryRenderedFeatures(event.point, { layers: captureLayerIds })[0] as MapGeoJSONFeature | undefined)
          : undefined;
        if (feature) {
          inspectBuildingFeature(feature);
          selectCapturedBuildingFeature(feature, 'manual-click');
        }
        return;
      }

      const threePinHit = threePinLayerRef.current?.hitTest(event.point, 40) ?? null;
      if (threePinHit) {
        if (threePinHit.type !== 'promoter') onSelectRef.current(threePinHit.id);
        return;
      }

      const pinHit = getInteractivePinHit(event.point);
      if (pinHit) return;

      const buildingHit = getInteractiveBuildingHit(event.point);
      if (!buildingHit) return;

      const interaction = classifyBuildingFeature(buildingHit);
      selectedBuildingRef.current = interaction;
      setSelectedBuilding(interaction);
      inspectBuildingFeature(buildingHit);
      applySelectedBuildingInteraction(interaction);

      if (interaction.kind === 'authored-venue' && interaction.listingId) {
        onSelectRef.current(interaction.listingId);
      }
    };

    const resetMapToDefault = () => {
      cancelHoverRelease();
      hoveredThreePinId = null;
      threePinLayerRef.current?.setHovered(null);
      onReset?.();
      markProgrammaticMapMotion(900);
      map.easeTo({
        center: [DEFAULT_MAP_CAMERA.lng, DEFAULT_MAP_CAMERA.lat],
        zoom: DEFAULT_MAP_CAMERA.zoom,
        pitch: DEFAULT_MAP_CAMERA.pitch,
        bearing: DEFAULT_MAP_CAMERA.bearing,
        duration: prefersReducedMotionRef.current ? 0 : 700,
        essential: false,
      });
    };

    const handleMapDoubleClick = (event: maplibregl.MapMouseEvent) => {
      const threePinHit = threePinLayerRef.current?.hitTest(event.point, 40) ?? null;
      const mapPinHit = getInteractivePinHit(event.point);
      if (threePinHit || mapPinHit) return;
      event.originalEvent.preventDefault();
      resetMapToDefault();
    };

    const handleDebugControls = (event: Event) => {
      const previousGeometrySourceMode = debugControlsRef.current.geometrySourceMode;
      debugControlsRef.current = {
        ...debugControlsRef.current,
        ...(event as CustomEvent<Partial<MapDebugControls>>).detail,
      };
      pushDebugEvent('layer updated', 'debug controls changed');
      if (previousGeometrySourceMode !== debugControlsRef.current.geometrySourceMode) {
        syncVenueBuildings();
        return;
      }
      applyDebugControls();
      publishDebugState();
    };

    map.on('load', () => {
      updateMapDiagnostics({ loaded: true, styleLoaded: true });
      prefersReducedMotionRef.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      if (mode === 'explore') {
        registerExplorerPinImages(map);
        map.addSource(LISTINGS_SOURCE_ID, {
          type: 'geojson',
          data: geoJsonRef.current,
          cluster: true,
          clusterRadius: 60,
          clusterMaxZoom: 16,
          generateId: true,
        });
        listingLayers.forEach((layer) => map.addLayer(layer));
        try {
          const threePinLayer = new MapLibreThreePinLayer([...mapListings, ...hostPins]);
          map.addLayer(threePinLayer);
          threePinLayerRef.current = threePinLayer;
          if (import.meta.env.DEV) {
            (window as Window & { SwingSphereMapPinPerformance?: { getSnapshot: () => ReturnType<MapLibreThreePinLayer['getPerformanceStats']> } }).SwingSphereMapPinPerformance = {
              getSnapshot: () => threePinLayer.getPerformanceStats(),
            };
          }
          threePinLayer.setAuthoredBuildingListingIds(authoredBuildingListingIds);
          threePinLayer.setSelected(selectedIdRef.current);
          [
            'listing-cluster-ripple',
            'listing-cluster-glow',
            'listing-pin-ripple',
            'listing-pin-glow',
            'listing-pins',
            'listing-labels-nearby',
            'listing-labels-hover',
            'selected-listing-ripple',
            'selected-listing-glow',
            'selected-listing',
            'selected-listing-label',
          ].forEach((layerId) => {
            if (!map.getLayer(layerId)) return;
            if (layerId.includes('label')) {
              map.setLayoutProperty(layerId, 'visibility', 'none');
            } else if (layerId === 'listing-pins' || layerId === 'selected-listing') {
              map.setPaintProperty(layerId, 'icon-opacity', 0);
            } else {
              map.setPaintProperty(layerId, 'circle-opacity', 0);
            }
          });
          const syncVisibleThreePins = () => {
            if (!map.getLayer(LISTING_INTERACTION_LAYER_ID)) return;
            const individualFeatures = map.queryRenderedFeatures({ layers: [LISTING_INTERACTION_LAYER_ID] });
            const visibleIds = new Set(
              individualFeatures
                .map((feature) => String(feature.properties?.listingId ?? ''))
                .filter(Boolean),
            );
            listingsRef.current.forEach((listing) => {
              if (isApproximateLocation(listing)) visibleIds.add(listing.id);
            });
            threePinLayer.setVisibleListingIds(visibleIds);
            threePinLayer.setClusters([]);
          };
          map.on('moveend', syncVisibleThreePins);
          map.on('zoomend', syncVisibleThreePins);
          map.on('idle', syncVisibleThreePins);
          window.requestAnimationFrame(syncVisibleThreePins);
        } catch (error) {
          console.warn('SwingSphere 3D map pins could not initialize; retaining MapLibre symbol pins.', error);
          threePinLayerRef.current = null;
        }
        ensureApproximateLocationLayers();
        startPinPulseAnimation();
      }

      // --- Venue Arrival (Phase 1): 3D buildings + cinematic camera -------
      // A vector building source is required because the CARTO raster basemap
      // carries no geometry to extrude. The provider is fully configurable in
      // venueArrival.buildings.source; the renderer reads only the id here.
      // Authored venue assets are resident landmarks; provider/context layers
      // stay hidden until a venue-scoped selection is active.
      ensureBuildingRenderingLayers();
      if (!map.getSource(SELECTED_BUILDING_ASSET_SOURCE_ID)) {
        map.addSource(SELECTED_BUILDING_ASSET_SOURCE_ID, {
          type: 'geojson',
          data: buildSelectedAssetFeatureCollection(null),
        });
      }
      if (!map.getLayer(SELECTED_BUILDING_ASSET_LAYER_ID)) {
        addLayerSafely({
          id: SELECTED_BUILDING_ASSET_LAYER_ID,
          type: 'fill-extrusion',
          source: SELECTED_BUILDING_ASSET_SOURCE_ID,
          layout: {
            visibility: 'none',
          },
          paint: {
            'fill-extrusion-color': venueArrival.selectedBuilding.color,
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], SELECTED_ASSET_EXTRUSION_HEIGHT],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0,
            'fill-extrusion-vertical-gradient': true,
          },
        }, 'listing-pin-glow');
      }
      ensureDebugLayers();
      applyDebugControls();
      updateMapDiagnostics();

      const handleMapZoom = () => {
        updateSelectedAssetLod();
        const zoom = map.getZoom();
        const zoomDirection = zoom < lastMapZoomRef.current ? 'out' : zoom > lastMapZoomRef.current ? 'in' : 'none';
        lastMapZoomRef.current = zoom;
        emitMapNavigationChange(zoomDirection);
        scheduleViewportChange('zoom');
      };

      /**
       * Recompute the venue view from the current zoom. Purely a function of
       * zoom — there is no animation here; MapLibre's own pan/zoom already
       * provides the motion. This just keeps pitch / bearing / building
       * opacity tracking the zoom level smoothly.
       *
       * Guards: the layer may be disabled at runtime, so we check existence
       * before mutating paint properties.
       */
      // Drive the venue view only after movement settles.
      map.on('zoom', handleMapZoom);
      map.on('zoomend', handleVenueZoomEnd);
      map.on('move', () => scheduleViewportChange('move'));
      map.on('moveend', () => flushViewportChange('moveend'));
      map.on('zoomend', () => flushViewportChange('zoomend'));
      map.on('idle', () => flushViewportChange('idle'));
      map.on('resize', () => scheduleViewportChange('resize'));

      if (mode === 'explore') {
        const initialSelectedId = selectedIdRef.current;
        if (initialSelectedId) {
          if (
            map.getLayer('selected-listing-ripple') &&
            map.getLayer('selected-listing-glow') &&
            map.getLayer('selected-listing') &&
            map.getLayer('selected-listing-label')
          ) {
            const filter: maplibregl.FilterSpecification = [
              '==',
              ['get', 'listingId'],
              initialSelectedId,
            ];
            map.setFilter('selected-listing-ripple', filter);
            map.setFilter('selected-listing-glow', filter);
            map.setFilter('selected-listing', filter);
            map.setFilter('selected-listing-label', filter);
          }
          if (
            map.getLayer(SELECTED_APPROXIMATE_AREA_FILL_LAYER_ID) &&
            map.getLayer(SELECTED_APPROXIMATE_AREA_LINE_LAYER_ID)
          ) {
            const filter: maplibregl.FilterSpecification = [
              '==',
              ['get', 'listingId'],
              initialSelectedId,
            ];
            map.setFilter(SELECTED_APPROXIMATE_AREA_FILL_LAYER_ID, filter);
            map.setFilter(SELECTED_APPROXIMATE_AREA_LINE_LAYER_ID, filter);
          }
          const initialListing = resolutionListingsRef.current.find((candidate) => candidate.id === initialSelectedId);
          const initialCoords = initialListing ? getPublicMapCoords(initialListing, buildingAssetsRef.current) : null;
          if (initialListing && initialCoords) {
            flyToSelectedVenue(initialListing, initialCoords);
          }
        } else {
          clearVenueBuildings();
        }
      } else if (isCaptureMode) {
        const initialSelectedId = selectedIdRef.current;
        const initialListing = initialSelectedId
          ? resolutionListingsRef.current.find((candidate) => candidate.id === initialSelectedId)
          : null;
        const initialCoords = initialListing ? getPublicMapCoords(initialListing, buildingAssetsRef.current) : null;
        if (initialListing && initialCoords) {
          flyToSelectedVenue(initialListing, initialCoords);
        } else {
          clearVenueBuildings();
        }
      }
      let initialReadyNotified = false;
      const notifyInitialReady = () => {
        if (initialReadyNotified) return;
        initialReadyNotified = true;
        onReadyRef.current?.();
      };
      map.once('moveend', notifyInitialReady);
      map.once('idle', notifyInitialReady);
      flushViewportChange('load');
    });

    if (mode === 'explore') {
      map.on('click', 'listing-clusters', handleClusterClick);
      map.on('click', LISTING_INTERACTION_LAYER_ID, handleListingClick);
      map.on('mousemove', 'listing-clusters', handleClusterHover);
      map.on('mouseleave', 'listing-clusters', () => {
        clearClusterHover();
        clearPointerCursor();
      });
      map.on('mousemove', LISTING_INTERACTION_LAYER_ID, handleListingHover);
      map.on('mouseleave', LISTING_INTERACTION_LAYER_ID, () => {
        clearListingHover();
        clearPointerCursor();
      });
    }
    map.on('mousemove', handleMapPointerMove);
    map.on('mouseleave', handleMapPointerLeave);
    if (mode === 'explore') {
      map.doubleClickZoom.disable();
      map.on('dblclick', handleMapDoubleClick);
    }
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY > 0) {
        recentMapZoomOutAtRef.current = performance.now();
      }
    };
    map.getCanvas().addEventListener('wheel', handleWheel, { passive: true });
    if (isCaptureMode) {
      map.on('mouseenter', BUILDINGS_LAYER_ID, setPointerCursor);
      map.on('mouseleave', BUILDINGS_LAYER_ID, clearPointerCursor);
      map.on('mouseenter', SELECTED_BUILDING_LAYER_ID, setPointerCursor);
      map.on('mouseleave', SELECTED_BUILDING_LAYER_ID, clearPointerCursor);
    }
    map.on('click', handleBuildingClick);
    map.on('idle', () => {
      const now = performance.now();
      if (now - lastRenderCompletedLogRef.current > 1500) {
        lastRenderCompletedLogRef.current = now;
        pushDebugEvent('render completed');
      }
      updateMapDiagnostics();
      publishDebugState();
    });
    map.on('styledata', () => {
      ensureApproximateLocationLayers();
      ensureBuildingRenderingLayers();
      refreshResidentAuthoredBuildings();
      applyDebugControls();
      updateMapDiagnostics();
    });
    map.on('error', (event) => {
      const errorMessage =
        (event as maplibregl.ErrorEvent & { error?: { message?: string } }).error?.message ??
        'unknown map error';
      pushDebugEvent('map error', errorMessage);
      updateMapDiagnostics();
    });
    window.addEventListener(MAP_DEBUG_CONTROLS_EVENT, handleDebugControls);

    let frameId = 0;
    let frameCounter = 0;
    const tickDebugState = () => {
      frameCounter += 1;
      if (frameCounter % 10 === 0) {
        publishDebugState();
      }
      frameId = window.requestAnimationFrame(tickDebugState);
    };
    frameId = window.requestAnimationFrame(tickDebugState);

    return () => {
      window.cancelAnimationFrame(frameId);
      cancelHoverRelease();
      stopPinPulseAnimation();
      window.removeEventListener(MAP_DEBUG_CONTROLS_EVENT, handleDebugControls);
      resizeObserver?.disconnect();
      if (viewportSyncTimerRef.current !== null) {
        window.clearTimeout(viewportSyncTimerRef.current);
      }
      map.getCanvas().removeEventListener('wheel', handleWheel);
      discoveryPopup.remove();
      if (map.getLayer(THREE_PIN_LAYER_ID)) map.removeLayer(THREE_PIN_LAYER_ID);
      if (import.meta.env.DEV) {
        delete (window as Window & { SwingSphereMapPinPerformance?: unknown }).SwingSphereMapPinPerformance;
      }
      threePinLayerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedId || camera.surface !== 'map') return;
    if (destinationFraming) {
      const framingKey = explorerMapFramingKey(destinationFraming);
      if (appliedDestinationFramingKeyRef.current === framingKey) return;
      appliedDestinationFramingKeyRef.current = framingKey;
      appliedExplorerCameraKeyRef.current = '';
      applyDestinationFraming(destinationFraming);
      return;
    }
    appliedDestinationFramingKeyRef.current = '';
    const key = poseKey(camera);
    if (appliedExplorerCameraKeyRef.current === key) return;
    appliedExplorerCameraKeyRef.current = key;
    const center = map.getCenter();
    const alreadyAtCamera =
      Math.abs(center.lng - camera.lng) < 0.0001 &&
      Math.abs(center.lat - camera.lat) < 0.0001 &&
      Math.abs(map.getZoom() - camera.zoom) < 0.01 &&
      Math.abs(map.getPitch() - camera.pitch) < 0.1 &&
      Math.abs(map.getBearing() - camera.bearing) < 0.1;
    if (alreadyAtCamera) return;
    const duration = prefersReducedMotionRef.current ? 0 : estimateMapMotionDurationMs(
      { lng: center.lng, lat: center.lat, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() },
      camera,
      destinationFraming?.durationMs ?? 650,
    );
    markProgrammaticMapMotion(duration + 250);
    map.stop();
    map.flyTo({
      center: [camera.lng, camera.lat],
      zoom: Math.max(3.5, camera.zoom),
      pitch: camera.pitch,
      bearing: camera.bearing,
      duration,
      essential: false,
    });
  }, [camera, destinationFraming, selectedId]);

  useEffect(() => {
    const source = mapRef.current?.getSource(LISTINGS_SOURCE_ID) as GeoJSONSource | undefined;
    const approximateSource = mapRef.current?.getSource(APPROXIMATE_LISTINGS_SOURCE_ID) as GeoJSONSource | undefined;
    if (mode === 'explore') {
      source?.setData(geoJson);
      approximateSource?.setData(approximateGeoJson);
      threePinLayerRef.current?.setListings([...mapListings, ...hostPins]);
      threePinLayerRef.current?.setAuthoredBuildingListingIds(authoredBuildingListingIds);
      syncVenueBuildings();
    }
  }, [geoJson, approximateGeoJson, hostPins, mapListings, authoredBuildingListingIds, mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!usesVenueArrival || !map) return;
    if (
      mode === 'explore' &&
      map.getLayer('selected-listing-ripple') &&
      map.getLayer('selected-listing-glow') &&
      map.getLayer('selected-listing') &&
      map.getLayer('selected-listing-label')
    ) {
      const filter: maplibregl.FilterSpecification = [
        '==',
        ['get', 'listingId'],
        selectedId ?? '',
      ];
      map.setFilter('selected-listing-ripple', filter);
      map.setFilter('selected-listing-glow', filter);
      map.setFilter('selected-listing', filter);
      map.setFilter('selected-listing-label', filter);
    }
    if (
      mode === 'explore' &&
      map.getLayer(SELECTED_APPROXIMATE_AREA_FILL_LAYER_ID) &&
      map.getLayer(SELECTED_APPROXIMATE_AREA_LINE_LAYER_ID)
    ) {
      const filter: maplibregl.FilterSpecification = [
        '==',
        ['get', 'listingId'],
        selectedId ?? '',
      ];
      map.setFilter(SELECTED_APPROXIMATE_AREA_FILL_LAYER_ID, filter);
      map.setFilter(SELECTED_APPROXIMATE_AREA_LINE_LAYER_ID, filter);
    }

    threePinLayerRef.current?.setSelected(selectedId);

    if (selectedId) {
      const listing = resolutionListingsRef.current.find((candidate) => candidate.id === selectedId);
      const coords = listing ? getPublicMapCoords(listing, buildingAssetsRef.current) : null;
      if (listing && coords) {
        flyToSelectedVenue(listing, coords);
      } else {
        map.stop();
        clearVenueBuildings();
      }
    } else {
      map.stop();
      clearVenueBuildings();
      markProgrammaticMapMotion(650);
      map.easeTo({
        pitch: WORLD_PITCH,
        bearing: 0,
        duration: prefersReducedMotionRef.current ? 0 : 450,
        essential: false,
      });
    }
  }, [selectedId, mode, usesVenueArrival]);

  return (
    <div className={['flatworld-map', className].filter(Boolean).join(' ')}>
      <div ref={containerRef} className="flatworld-map__container" aria-label="SwingSphere listing map" />
      <div className="flatworld-map__tint" aria-hidden="true" />
    </div>
  );
};

export default FlatWorldMap;
/*
        <div className="pointer-events-none absolute right-4 bottom-4 z-30 w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-white/10 bg-black/70 p-3 text-[11px] leading-5 text-zinc-200 shadow-2xl shadow-black/40 backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between gap-3 border-b border-white/10 pb-2">
            <span className="text-[10px] uppercase tracking-[0.24em] text-sky-300/80">Map diagnostics</span>
            <span className={mapDiagnostics.loaded ? 'text-emerald-300' : 'text-amber-300'}>
              {mapDiagnostics.loaded ? 'loaded' : 'loading'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <DiagItem label="mounted" value={mapDiagnostics.mounted ? 'yes' : 'no'} />
            <DiagItem label="style" value={mapDiagnostics.styleLoaded ? 'loaded' : 'pending'} />
            <DiagItem label="container" value={`${mapDiagnostics.containerWidth} × ${mapDiagnostics.containerHeight}`} />
            <DiagItem label="canvas" value={`${mapDiagnostics.canvasWidth} × ${mapDiagnostics.canvasHeight}`} />
            <DiagItem label="layers" value={String(mapDiagnostics.layerCount)} />
            <DiagItem label="sources" value={String(mapDiagnostics.sourceCount)} />
            <DiagItem label="center" value={`${mapDiagnostics.centerLng.toFixed(4)}, ${mapDiagnostics.centerLat.toFixed(4)}`} />
            <DiagItem label="zoom" value={mapDiagnostics.zoom.toFixed(2)} />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default FlatWorldMap;

const DiagItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-md border border-white/5 bg-white/5 px-2 py-1">
    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</div>
    <div className="font-mono text-[11px] text-zinc-100">{value}</div>
  </div>
);
*/
