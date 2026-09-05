import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  Clock3,
  Crosshair,
  Globe2,
  LockKeyhole,
  MapPin,
  Minus,
  Plus,
  Sparkles,
} from 'lucide-react';
import ExplorerDetailsPanel from './sidebar/ExplorerDetailsPanel';
import ExplorerDiscoveryRail from './explorer/ExplorerDiscoveryRail';
import ExplorerFilterPanel from './explorer/ExplorerFilterPanel';
import ExplorerNearbyCarousel from './explorer/ExplorerNearbyCarousel';
import MobileExplorerPrototype from './explorer/MobileExplorerPrototype';
import { useExplorerState } from '../hooks/useExplorerState';
import { useViewportDiscovery } from '../hooks/useViewportDiscovery';
import { useExplorerContext } from './explorer/ExplorerProvider';
import { useAppStore } from '../store/appStore';
import { useEntityIndex } from '../hooks/useEntityIndex';
import * as api from '../lib/api';
import { adaptListingsToGlobeEvents, isGlobeEligibleListing, resolveCountryIsoCodes } from '../lib/globeEntityAdapter';
import { aggregateEventsForSpatialDisplay } from '../lib/spatialEventAggregation';
import { shouldShowDevTools } from '../lib/devTools';
import { adaptListingsToDiscoveryPoints } from '../lib/discoveryPointAdapter';
import { adaptOrganizationsToDiscoveryPoints, adaptOrganizationsToGlobeEvents } from '../lib/hostGlobeAdapter';
import { getListingDisplayCoords } from '../lib/explorerMarkers';
import { isApproximateLocation } from '../lib/publicLocation';
import { applyDevMobileListingSafetyToAll } from '../lib/devMobileListingSafety';
import { canScheduleMobileListingHandoff } from '../lib/mobileListingHandoff';
import type { MapViewportDiscoverySnapshot } from '../lib/mapViewportDiscovery';
import { createActivityRegions, type ActivityRegion } from '../lib/activityRegionProvider';
import {
  buildListingDistributionFraming,
  buildListingMapFraming,
  type ExplorerMapFraming,
} from '../lib/explorerDestinationFraming';
import {
  DEFAULT_MAP_CAMERA,
  GLOBE_MAP_MIN_ARRIVAL_ZOOM,
  WORLD_BEARING,
  WORLD_PITCH,
  zoomIntentToMapZoom,
  type ExplorerCameraPose,
} from '../lib/explorerCamera';
import { ExplorerTransitionController } from '../lib/explorerTransition';
import type { BuildingAsset, Listing } from '../types';
import { getBuildingAssetForListing, getListingPhysicalAddress } from '../lib/entityCompatibility';
import { getListingCanonicalPath } from '../lib/entityUtils';
import {
  createGlobePerformanceConfig,
  getGraphicsCapability,
  type GraphicsCapability,
} from '../lib/graphicsCapability';
import {
  GlobeQualityController,
  type ExplorerPerformanceMode,
  type ExplorerPerformanceSnapshot,
  type GlobePerformanceSnapshot,
  type GlobeQualityTier,
} from '../lib/globePerformance';
import {
  type GlobeV1CountrySelection,
  type GlobeV1RuntimeEvent,
} from '../data/globeV1MockData';
import {
  buildGlobeScaleFixtureDiscoveryPoints,
  buildGlobeScaleFixtureEvents,
  getGlobeScaleFixture,
} from '../data/globeScaleCalibrationFixtures';
import {
  buildGlobePerformanceFixtureListings,
  parseGlobePerformanceFixtureCount,
} from '../data/globePerformanceFixtures';
import type { GlobePresentationConfig } from './dev/GlobeScaleCalibrationPanel';
import { GLOBE_PRESENTATION_PRESETS } from '../src/features/globe/runtime/GlobePresentationConfig.js';
import {
  defaultHeroArrivalProfile,
  formatHeroArrivalSnippet,
  HERO_COMPOSER_CUSTOM_PRESET_STORAGE_KEY,
  HERO_COMPOSER_ENABLED_STORAGE_KEY,
  HERO_COMPOSER_PROFILE_STORAGE_KEY,
  mergeHeroArrivalProfile,
  readHeroArrivalProfile,
  type HeroArrivalProfile,
  type HeroArrivalProfileInput,
  type HeroComposerSnapshot,
} from '../lib/heroArrivalProfile';

const FlatWorldMap = React.lazy(() => import('./maps/FlatWorldMap'));

const HYBRID_DEFAULT_GLOBE_TO_MAP_INTENT = 0.78;
const HYBRID_DEFAULT_MAP_ENTRY_ZOOM = 5.2;
const HYBRID_DEFAULT_MAP_TO_GLOBE_ZOOM = 2.15;
const HYBRID_RETURN_GLOBE_INTENT = 0.5;
const HYBRID_HANDOFF_COOLDOWN_MS = 1100;
const HYBRID_GLOBE_WHEEL_WINDOW_MS = 520;
const HYBRID_DEFAULT_DISCOVERY_CLUSTER_RADIUS = 58;
const MOBILE_DEFAULT_WORLD_DISTANCE = 17;
const MOBILE_MAX_WORLD_DISTANCE = 20;
const MOBILE_WORLD_FIELD_OF_VIEW = 50;
const MOBILE_GLOBE_ARRIVAL_BEAT_MS = 10_000;
const MOBILE_INTRO_DURATION_MS = 3_450;
const MOBILE_INTRO_CLOSE_DISTANCE = 5.25;
const MOBILE_INTRO_FAR_DISTANCE = MOBILE_MAX_WORLD_DISTANCE;
const MOBILE_INTRO_OVERSHOOT_DISTANCE = 14.65;
const MOBILE_INTRO_IDLE_SPEED_MULTIPLIER = 60;
const resolveHybridDiscoveryClusterZoom = (zoomIntent: number) => {
  if (zoomIntent < 0.28) return 2;
  if (zoomIntent < 0.52) return 3;
  if (zoomIntent < 0.68) return 4;
  return 5;
};
const GlobePerformancePanel = import.meta.env.DEV
  ? React.lazy(() => import('./dev/GlobePerformancePanel'))
  : null;
const GlobeScaleCalibrationPanel = import.meta.env.DEV
  ? React.lazy(() => import('./dev/GlobeScaleCalibrationPanel'))
  : null;

type GlobeRuntime = {
  mount: () => Promise<GlobeRuntime> | GlobeRuntime;
  updateEvents: (events: GlobeV1RuntimeEvent[]) => void;
  updateVisibleEvents: (events: GlobeV1RuntimeEvent[]) => void;
  updateActivityRegions: (regions: ActivityRegion[]) => void;
  setCountryActivityCountries: (countries: string[]) => void;
  setCountryActivityEvents: (events: GlobeV1RuntimeEvent[]) => void;
  setDirectPinsVisible: (visible: boolean) => void;
  setCountryDiscoveryEmphasis: (enabled: boolean) => void;
  setAdministrativeBoundaryIds: (ids: string[]) => void;
  setGeospatialCalibrationState: (state: {
    visible?: boolean;
    longitudeOffsetDeg?: number;
    latitudeOffsetDeg?: number;
    pinLongitudeOffsetDeg?: number;
    pinLatitudeOffsetDeg?: number;
    geoJsonLongitudeOffsetDeg?: number;
    geoJsonLatitudeOffsetDeg?: number;
    countryAtlasLongitudeOffsetDeg?: number;
    countryAtlasLatitudeOffsetDeg?: number;
    showCountryIdTexture?: boolean;
    showVisualCountryAtlas?: boolean;
    showCountryHighlightMask?: boolean;
    showAuthoritativeBorders?: boolean;
  }) => void;
  updateAtmosphereConfig: (config: AtmospherePatch) => void;
  updatePresentationConfig: (config: GlobePresentationConfig, options?: { frameWorld?: boolean }) => GlobePresentationConfig | null;
  getPresentationConfig: () => GlobePresentationConfig;
  updateAlignmentDebugConfig: (config: AlignmentDebugState) => void;
  updatePinAlignmentDebugConfig: (config: AlignmentDebugRuntimePatch) => void;
  updateDebugView: (config: AlignmentDebugViewPatch) => void;
  setIdleMotionSuppressed: (suppressed: boolean) => void;
  setIdleMotionSpeedMultiplier: (multiplier: number) => void;
  start: () => void;
  stop: () => void;
  setTransitionActive: (active: boolean) => void;
  setQualityTier: (tier: GlobeQualityTier) => void;
  getPerformanceSnapshot: () => GlobePerformanceSnapshot | null;
  selectEvent: (eventId: string) => GlobeV1RuntimeEvent | null;
  selectActivityRegion: (regionId: string) => ActivityRegion | null;
  selectCountry: (countryIdOrIso: string | number) => GlobeV1CountrySelection | null;
  clearSelection: () => void;
  clearEventSelection: () => void;
  getNavigationSnapshot: () => GlobeNavigationSnapshot | null;
  updateHeroArrivalProfile: (profile: HeroArrivalProfile) => HeroComposerSnapshot | null;
  previewHeroArrivalProfile: (profile: HeroArrivalProfile) => HeroComposerSnapshot | null;
  animateHeroArrivalPreview: (profile: HeroArrivalProfile) => HeroComposerSnapshot | null;
  captureHeroArrivalProfile: () => HeroArrivalProfile | null;
  getHeroArrivalComposerSnapshot: () => HeroComposerSnapshot | null;
  setNavigationPose: (pose: { lng: number; lat: number; zoomIntent: number; distance?: number; followVisualLandRotation?: boolean }) => GlobeNavigationSnapshot | null;
  returnToWorld: () => void;
  resize: () => void;
  dispose: () => void;
};

type GlobeNavigationSnapshot = {
  lng: number;
  lat: number;
  targetSource: GlobeNavigationTargetSource;
  cameraDirectionLng?: number;
  cameraDirectionLat?: number;
  distance: number;
  zoomIntent: number;
  minDistance: number;
  maxDistance: number;
  activeActivityRegionId: string | null;
  selectedEventId: string | null;
};

type GlobeNavigationTargetSource =
  | 'screen-center-ray'
  | 'camera-direction-fallback'
  | 'controls-target-fallback'
  | 'selected-listing';

type GlobeConstructor = new (
  container: HTMLElement,
  options: {
    events: GlobeV1RuntimeEvent[];
    activityRegions: ActivityRegion[];
    config: Record<string, unknown>;
    onReady: () => void;
    onError: (error: unknown) => void;
    onCountrySelect: (country: GlobeV1CountrySelection | null) => void;
    onCountryHover: (country: GlobeV1CountrySelection | null, sample?: GlobeHoverSample | null) => void;
    onEventHover: (event: GlobeV1RuntimeEvent | null) => void;
    onEventSelect: (event: GlobeV1RuntimeEvent) => false | void;
    onEventLabelActivate: (event: GlobeV1RuntimeEvent) => void;
    onActivityRegionSelect: (region: ActivityRegion) => void;
    onDiscoveryModeChange: (region: ActivityRegion | null) => void;
    onNavigationChange: (snapshot: GlobeNavigationSnapshot) => void;
    onFocusArrival: (arrival: { selectedEventId: string | null; activeActivityRegionId: string | null }) => void;
    onSurfaceDoubleClick: () => void;
    onContextLost: () => void;
    onContextRestored: () => void;
    onPerformanceSnapshot: (snapshot: GlobePerformanceSnapshot) => void;
    onInteractionEnd: () => void;
  },
) => GlobeRuntime;

const globeAssetsConfig = {
  assets: {
    landModel: '/assets/globe/models/land.glb',
    oceanModel: '/assets/globe/models/ocean.glb',
    countryIdTexture: '/assets/globe/textures/countryIdTexture_v4.png',
    visualCountryAtlas: '/assets/globe/textures/visualCountryAtlas_v4.png',
    countryLookup: '/assets/globe/data/countryLookup.json',
  },
};

const productionCountryPresentationConfig = {
  selection: {
    enabledEventOnly: true,
    highlightVisible: false,
    useSphereRaycast: true,
    highlightMaskSource: 'id',
    activeHitPaddingPixels: 5,
    focusDurationMs: 1150,
  },
  hybridCountryBorders: {
    enabled: true,
    manifestUrl: '/assets/globe/borders/hybrid/v1/manifest.json',
    sourceMode: 'hybrid',
  },
  countryVectorActivity: {
    enabled: true,
    manifestUrl: '/assets/globe/borders/hybrid/v1/manifest.json',
    fallbackGeoJsonUrl: '/geo/countries.json',
    radiusScale: 1.009,
    hoverTransitionSeconds: 0.22,
    selectedTransitionSeconds: 0.3,
    idle: {
      coreColor: '#d9dde2',
      glowColor: '#ff465c',
      coreWidth: 2,
      coreOpacity: 0.52,
      glowWidth: 5.5,
      glowOpacity: 0.045,
      coreVisible: true,
      glowVisible: true,
      pulseEnabled: true,
      pulseSpeed: 0.64,
    },
    hover: {
      coreColor: '#f4f5f7',
      glowColor: '#ff465c',
      sweepColor: '#ffffff',
      coreWidth: 1.25,
      coreOpacity: 0.82,
      glowWidth: 8,
      glowOpacity: 0.12,
      coreVisible: true,
      glowVisible: true,
      sweepEnabled: true,
      sweepWidth: 0.22,
      sweepStrength: 0.9,
      sweepSpeed: 0.7,
      sweepRepeat: true,
    },
  },
  countryVectorBorders: {
    enabled: true,
    url: '/geo/countries.json',
    coreWidth: 2,
    opacity: 0.96,
    glowWidth: 5.5,
    glowOpacity: 0.04,
    speed: 0.5,
    coreVisible: false,
    glowVisible: true,
    animationEnabled: true,
    hoverEnabled: false,
    selectedTransitionSeconds: 0.34,
    palette: ['#17181d', '#17181d', '#17181d', '#17181d', '#17181d', '#17181d', '#ff465c', '#ff465c'],
    radiusScale: 1.009,
    conformToLand: true,
    shorelineSnap: true,
    shorelineSnapStrength: 1,
    maxSegmentDegrees: 0.55,
    preparedCacheSize: 8,
  },
  countryGeoJson: {
    enabled: true,
    url: '/geo/countries.json',
    meshScale: 1.003,
    staticTextureWidth: 1024,
    staticTextureHeight: 512,
    dynamicTextureWidth: 2048,
    dynamicTextureHeight: 1024,
    simplifyStepDeg: 0.32,
    quantizeStepDeg: 0.18,
    minIslandAreaDeg2: 0.035,
    maxIslandPolygonsPerCountry: 12,
    baseRasterWidth: 1,
    hoverRasterWidth: 1.25,
    selectedRasterWidth: 1.75,
    baseOpacity: 0,
    hoverBorderOpacity: 0,
    selectedBorderOpacity: 0,
    hoverFillOpacity: 0.12,
    selectedFillOpacity: 0.28,
    activityColor: '#e4e8ed',
    activityRasterWidth: 2,
    activityBorderOpacity: 0,
    activityFillOpacity: 0.035,
    hoverTransitionSeconds: 0.22,
    selectedTransitionSeconds: 0.34,
    glowEnabled: false,
  },
} as const;

type AtmosphereShell = {
  radius: number;
  opacity: number;
  crimsonIntensity: number;
  graphiteIntensity: number;
  fresnelPower: number;
  horizonFalloff: number;
};

type AtmospherePatch = {
  atmosphere: {
    inner: AtmosphereShell;
    outer: AtmosphereShell;
  };
  crimsonRim: {
    radius: number;
  };
};

type AlignmentDebugState = {
  land: LayerAlignmentState;
  countryAtlas: LayerAlignmentState;
  pins: PinAlignmentState;
  cameraTargets: CameraTargetAlignmentState;
  toggles: AlignmentDebugToggles;
  opacity: AlignmentDebugOpacity;
};

type LayerAlignmentState = {
  longitudeSign: 1 | -1;
  longitudeOffsetDeg: number;
  latitudeOffsetDeg: number;
  flipU: boolean;
  flipV: boolean;
};

type PinAlignmentState = {
  longitudeSign: 1 | -1;
  longitudeOffsetDeg: number;
  latitudeOffsetDeg: number;
  latitudeSign: 1 | -1;
};

type CameraTargetAlignmentState = {
  longitudeOffsetDeg: number;
  latitudeOffsetDeg: number;
};

type AlignmentDebugToggles = {
  showLandMesh: boolean;
  showOceanMesh: boolean;
  showCountryIdTexture: boolean;
  showVisualCountryAtlas: boolean;
  showCountryHighlightMask: boolean;
  showPinAnchors: boolean;
  showEventLabels: boolean;
  showCameraTarget: boolean;
};

type AlignmentDebugOpacity = {
  countryIdTexture: number;
  visualAtlas: number;
  highlightMask: number;
};

type GlobeHoverSample = {
  uv?: { u: number; v: number };
  sample?: { r: number; g: number; b: number; x: number; y: number };
  country?: GlobeV1CountrySelection | null;
};

type PinHoverDebug = {
  name: string;
  lat: number;
  lon: number;
  countryIso3: string;
  worldPosition?: number[] | null;
};

type GlobeHoverDebug = {
  uv?: { u: number; v: number };
  rgb?: [number, number, number];
  country?: GlobeV1CountrySelection | null;
};

type SpatialDebugSnapshot = {
  canonicalLng: number | null;
  canonicalLat: number | null;
  globeLng: number | null;
  globeLat: number | null;
  globeCameraDirectionLng: number | null;
  globeCameraDirectionLat: number | null;
  mapLng: number | null;
  mapLat: number | null;
  targetSource: GlobeNavigationTargetSource | 'map-center' | null;
  deltaMeters: number | null;
  surfaceMode: 'globe' | 'map';
  transitionProgress: number;
};

type HeroArrivalPreset = {
  id: string;
  name: string;
  description: string;
  profile: HeroArrivalProfile;
};

type ExplorerTravelPhase =
  | 'idle'
  | 'planning'
  | 'globe-travel'
  | 'globe-arrived'
  | 'preparing-map'
  | 'traveling'
  | 'blending'
  | 'arriving'
  | 'local-explore'
  | 'venue-explore';

type ExplorerDestination =
  | {
      type: 'listing';
      listingId: string;
      lat: number;
      lng: number;
      framing: ExplorerMapFraming;
    }
  | {
      type: 'cluster' | 'region' | 'country';
      id: string;
      lat: number;
      lng: number;
      listingIds?: string[];
      framing: ExplorerMapFraming;
    };

type AlignmentDebugRuntimePatch = {
  alignment: {
    pinLongitudeSign: 1 | -1;
    pinLongitudeOffsetDeg: number;
    pinLatitudeOffsetDeg: number;
    pinLatitudeSign: 1 | -1;
  };
  pinPlacement: {
    showPinAnchors: boolean;
  };
};

type AlignmentDebugViewPatch = {
  showCountryHighlightMask: boolean;
  showCountryIdTexture: boolean;
  showVisualCountryAtlas: boolean;
  countryAtlas: LayerAlignmentState;
  countryIdTextureOpacity: number;
  visualAtlasOpacity: number;
  highlightMaskOpacity: number;
};

const ATMOSPHERE_TOOL_STORAGE_KEY = 'swingsphere.globeV1.atmosphereTool';
const DETAIL_PANEL_SETTLE_MS = 360;
const SPATIAL_DEBUG_STORAGE_KEY = 'swingsphere.spatialDebug';
const GEOSPATIAL_CALIBRATION_STORAGE_KEY = 'swingsphere.deepGlobe.geospatialCalibration.v1';
const GEOSPATIAL_BASELINE_LONGITUDE_OFFSET_DEG = 1.5;
const GLOBE_TRAVEL_ARRIVAL_PAUSE_MS = 420;
const COUNTRY_PIN_REVEAL_DELAY_MS = 1050;

const isSpatialDebugEnabled = () =>
  typeof window !== 'undefined' && window.localStorage.getItem(SPATIAL_DEBUG_STORAGE_KEY) === 'true';

type GeospatialLayerCalibration = {
  longitudeOffsetDeg: number;
  latitudeOffsetDeg: number;
};

type GeospatialCalibrationState = {
  pins: GeospatialLayerCalibration;
  countryGeoJson: GeospatialLayerCalibration;
  countryAtlas: GeospatialLayerCalibration;
};

type LegacyGeospatialCalibrationState = Partial<GeospatialCalibrationState> & {
  longitudeOffsetDeg?: number;
  latitudeOffsetDeg?: number;
};

const createGeospatialLayerCalibration = (
  value: Partial<GeospatialLayerCalibration> | undefined,
  fallback: GeospatialLayerCalibration,
): GeospatialLayerCalibration => ({
  longitudeOffsetDeg: Number.isFinite(value?.longitudeOffsetDeg)
    ? Number(value?.longitudeOffsetDeg)
    : fallback.longitudeOffsetDeg,
  latitudeOffsetDeg: Number.isFinite(value?.latitudeOffsetDeg)
    ? Number(value?.latitudeOffsetDeg)
    : fallback.latitudeOffsetDeg,
});

const defaultGeospatialCalibrationState: GeospatialCalibrationState = {
  // Verified against the physical land GLB: pins and the country atlas require
  // the +1.5° correction, while authoritative GeoJSON remains at WGS84 zero.
  pins: { longitudeOffsetDeg: GEOSPATIAL_BASELINE_LONGITUDE_OFFSET_DEG, latitudeOffsetDeg: 0 },
  countryGeoJson: { longitudeOffsetDeg: 0, latitudeOffsetDeg: 0 },
  countryAtlas: { longitudeOffsetDeg: GEOSPATIAL_BASELINE_LONGITUDE_OFFSET_DEG, latitudeOffsetDeg: 0 },
};

const readGeospatialCalibrationState = (): GeospatialCalibrationState => {
  if (typeof window === 'undefined') return defaultGeospatialCalibrationState;
  try {
    const raw = window.localStorage.getItem(GEOSPATIAL_CALIBRATION_STORAGE_KEY);
    if (!raw) return defaultGeospatialCalibrationState;
    const parsed = JSON.parse(raw) as LegacyGeospatialCalibrationState;
    const legacy = {
      longitudeOffsetDeg: Number.isFinite(parsed.longitudeOffsetDeg)
        ? Number(parsed.longitudeOffsetDeg)
        : GEOSPATIAL_BASELINE_LONGITUDE_OFFSET_DEG,
      latitudeOffsetDeg: Number.isFinite(parsed.latitudeOffsetDeg) ? Number(parsed.latitudeOffsetDeg) : 0,
    };
    return {
      pins: createGeospatialLayerCalibration(parsed.pins, legacy),
      countryGeoJson: createGeospatialLayerCalibration(parsed.countryGeoJson, defaultGeospatialCalibrationState.countryGeoJson),
      countryAtlas: createGeospatialLayerCalibration(parsed.countryAtlas, defaultGeospatialCalibrationState.countryAtlas),
    };
  } catch {
    return defaultGeospatialCalibrationState;
  }
};

const distanceMetersBetween = (
  a: { lng: number; lat: number } | null,
  b: { lng: number; lat: number } | null,
): number | null => {
  if (!a || !b) return null;
  const earthRadiusMeters = 6371008.8;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const deltaLat = ((b.lat - a.lat) * Math.PI) / 180;
  const deltaLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(h)));
};

const formatApproxDistance = (distanceMeters: number): string => {
  if (!Number.isFinite(distanceMeters)) return 'Nearby';
  if (distanceMeters < 30) return 'Here';
  if (distanceMeters < 305) return `${Math.max(50, Math.round((distanceMeters * 3.28084) / 50) * 50)} ft`;
  const miles = distanceMeters / 1609.344;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
};

const estimateGlobeTravelDurationMs = (
  from: { lng: number; lat: number } | null,
  to: { lng: number; lat: number },
): number => {
  const distanceMeters = distanceMetersBetween(from, to) ?? 0;
  const distanceKm = distanceMeters / 1000;
  if (distanceKm < 80) return 1250;
  if (distanceKm < 750) return 1700;
  if (distanceKm < 2800) return 2250;
  if (distanceKm < 7000) return 2850;
  return 3350;
};

const defaultAtmosphereToolState: AtmospherePatch = {
  atmosphere: {
    inner: {
      radius: 0.976,
      opacity: 0.145,
      crimsonIntensity: 0.971,
      graphiteIntensity: 1.441,
      fresnelPower: 6,
      horizonFalloff: 1.465,
    },
    outer: {
      radius: 0.97,
      opacity: 0.056,
      crimsonIntensity: 1.235,
      graphiteIntensity: 1.059,
      fresnelPower: 1.55,
      horizonFalloff: 2.943,
    },
  },
  crimsonRim: {
    radius: 0.979,
  },
};

const createHeroPresetProfile = (profile: HeroArrivalProfileInput): HeroArrivalProfile =>
  ({
    ...defaultHeroArrivalProfile,
    ...profile,
    heroComposition: {
      ...defaultHeroArrivalProfile.heroComposition,
      ...profile.heroComposition,
    },
    heroStage: {
      ...defaultHeroArrivalProfile.heroStage,
      ...profile.heroStage,
    },
    ease: profile.ease ?? defaultHeroArrivalProfile.ease,
    mode: profile.mode ?? 'legacy',
  });

const builtInHeroArrivalPresets: HeroArrivalPreset[] = [
  {
    id: 'destination-tilt',
    name: 'Destination Tilt',
    description: 'Destination-relative cinematic shot with the Earth framed low.',
    profile: createHeroPresetProfile({
      mode: 'destinationTilt',
      fov: 31.25,
      durationMs: 2875,
      heroStage: {
        distance: 6.79,
        tiltDegrees: 18,
        headingDegrees: -8,
        globeScreenX: 0.5,
        globeScreenY: 0.62,
        labelAnchorX: 0.5,
        labelAnchorY: 0.44,
      },
      heroComposition: {
        maxCorrectionDegrees: 3,
      },
    }),
  },
  {
    id: 'classic-globe',
    name: 'Classic Globe',
    description: 'Premium original-feel globe shot with the Earth as the subject.',
    profile: createHeroPresetProfile({
      centerDistance: 6.9,
      tangentOffset: -0.35,
      sideOffset: -0.08,
      horizontalOffset: -0.03,
      verticalOffset: -0.42,
      lookAtOffset: 0.08,
      horizonBias: 0.24,
      destinationScreenX: 0.62,
      destinationScreenY: 0.64,
      fov: 34,
      durationMs: 2600,
    }),
  },
  {
    id: 'cinematic-horizon',
    name: 'Cinematic Horizon',
    description: 'Lower dramatic composition with more curvature and breathing room.',
    profile: createHeroPresetProfile({
      centerDistance: 7.15,
      tangentOffset: -0.62,
      sideOffset: -0.14,
      horizontalOffset: -0.08,
      verticalOffset: -0.52,
      lookAtOffset: 0.16,
      horizonBias: 0.48,
      destinationScreenX: 0.7,
      destinationScreenY: 0.72,
      fov: 31,
      durationMs: 3000,
    }),
  },
  {
    id: 'venue-hero',
    name: 'Venue Hero',
    description: 'Pin-forward listing arrival while remaining unmistakably globe-scale.',
    profile: createHeroPresetProfile({
      centerDistance: 6.45,
      tangentOffset: -0.48,
      sideOffset: -0.18,
      horizontalOffset: -0.05,
      verticalOffset: -0.44,
      lookAtOffset: 0.12,
      horizonBias: 0.34,
      destinationScreenX: 0.72,
      destinationScreenY: 0.68,
      fov: 30.5,
      durationMs: 2750,
    }),
  },
  {
    id: 'wide-explorer',
    name: 'Wide Explorer',
    description: 'Wider geography-first shot for clusters and orientation.',
    profile: createHeroPresetProfile({
      centerDistance: 8.05,
      tangentOffset: -0.28,
      sideOffset: -0.06,
      horizontalOffset: -0.02,
      verticalOffset: -0.38,
      lookAtOffset: 0.06,
      horizonBias: 0.2,
      destinationScreenX: 0.6,
      destinationScreenY: 0.61,
      fov: 37.5,
      durationMs: 2800,
    }),
  },
  {
    id: 'regional-approach',
    name: 'Regional Approach',
    description: 'Balanced mid-altitude frame for activity regions and city groups.',
    profile: createHeroPresetProfile({
      centerDistance: 7.35,
      tangentOffset: -0.42,
      sideOffset: -0.11,
      horizontalOffset: -0.04,
      verticalOffset: -0.43,
      lookAtOffset: 0.1,
      horizonBias: 0.3,
      destinationScreenX: 0.66,
      destinationScreenY: 0.66,
      fov: 35,
      durationMs: 2850,
    }),
  },
  {
    id: 'low-angle',
    name: 'Low Angle',
    description: 'Strong upward-looking feel with pronounced horizon and atmosphere.',
    profile: createHeroPresetProfile({
      centerDistance: 7.05,
      tangentOffset: -0.82,
      sideOffset: -0.2,
      horizontalOffset: -0.09,
      verticalOffset: -0.62,
      lookAtOffset: 0.22,
      horizonBias: 0.62,
      destinationScreenX: 0.74,
      destinationScreenY: 0.76,
      fov: 30,
      durationMs: 3150,
    }),
  },
  {
    id: 'building-setup',
    name: 'Building Setup',
    description: 'Closer last-globe frame before local detail or map reveal.',
    profile: createHeroPresetProfile({
      centerDistance: 5.85,
      tangentOffset: -0.5,
      sideOffset: -0.18,
      horizontalOffset: -0.06,
      verticalOffset: -0.45,
      lookAtOffset: 0.14,
      horizonBias: 0.34,
      destinationScreenX: 0.74,
      destinationScreenY: 0.7,
      fov: 29,
      durationMs: 2450,
    }),
  },
  {
    id: 'minimal-neutral',
    name: 'Minimal / Neutral',
    description: 'Clean fallback with the destination close to center.',
    profile: createHeroPresetProfile({
      centerDistance: 6.9,
      tangentOffset: -0.12,
      sideOffset: 0,
      horizontalOffset: 0,
      verticalOffset: -0.34,
      lookAtOffset: 0,
      horizonBias: 0.08,
      destinationScreenX: 0.5,
      destinationScreenY: 0.56,
      fov: 36,
      durationMs: 2200,
    }),
  },
];

const defaultAlignmentDebugState: AlignmentDebugState = {
  land: {
    longitudeSign: 1,
    longitudeOffsetDeg: 0,
    latitudeOffsetDeg: 0,
    flipU: false,
    flipV: false,
  },
  countryAtlas: {
    longitudeSign: -1,
    longitudeOffsetDeg: 0,
    latitudeOffsetDeg: 0,
    flipU: false,
    flipV: false,
  },
  pins: {
    longitudeSign: -1,
    longitudeOffsetDeg: 0,
    latitudeOffsetDeg: 0,
    latitudeSign: 1,
  },
  cameraTargets: {
    longitudeOffsetDeg: 0,
    latitudeOffsetDeg: 0,
  },
  toggles: {
    showLandMesh: true,
    showOceanMesh: true,
    showCountryIdTexture: false,
    showVisualCountryAtlas: false,
    showCountryHighlightMask: false,
    showPinAnchors: false,
    showEventLabels: false,
    showCameraTarget: false,
  },
  opacity: {
    countryIdTexture: 0.86,
    visualAtlas: 0.86,
    highlightMask: 1,
  },
};

const toAlignmentRuntimePatch = (state: AlignmentDebugState): AlignmentDebugRuntimePatch => ({
  alignment: {
    pinLongitudeSign: state.pins.longitudeSign,
    pinLongitudeOffsetDeg: state.pins.longitudeOffsetDeg,
    pinLatitudeOffsetDeg: state.pins.latitudeOffsetDeg,
    pinLatitudeSign: state.pins.latitudeSign,
  },
  pinPlacement: {
    showPinAnchors: state.toggles.showPinAnchors,
  },
});

const toAlignmentViewPatch = (state: AlignmentDebugState): AlignmentDebugViewPatch => ({
  showCountryHighlightMask: state.toggles.showCountryHighlightMask,
  showCountryIdTexture: state.toggles.showCountryIdTexture,
  showVisualCountryAtlas: state.toggles.showVisualCountryAtlas,
  countryAtlas: state.countryAtlas,
  countryIdTextureOpacity: state.opacity.countryIdTexture,
  visualAtlasOpacity: state.opacity.visualAtlas,
  highlightMaskOpacity: state.opacity.highlightMask,
});

const formatAlignmentSnippet = (state: AlignmentDebugState) => JSON.stringify(state, null, 2);

type ProductionGlobePageProps = {
  variant?: 'page' | 'hero' | 'surface';
  showDevTools?: boolean;
  hybridPrototype?: boolean;
  mobilePrototype?: boolean;
};

const readAtmosphereToolState = (): AtmospherePatch => {
  if (typeof window === 'undefined') return defaultAtmosphereToolState;
  try {
    const raw = window.localStorage.getItem(ATMOSPHERE_TOOL_STORAGE_KEY);
    if (!raw) return defaultAtmosphereToolState;
    return mergeAtmosphereState(defaultAtmosphereToolState, JSON.parse(raw));
  } catch {
    return defaultAtmosphereToolState;
  }
};

const mergeAtmosphereState = (base: AtmospherePatch, override: Partial<AtmospherePatch>): AtmospherePatch => ({
  atmosphere: {
    inner: { ...base.atmosphere.inner, ...override.atmosphere?.inner },
    outer: { ...base.atmosphere.outer, ...override.atmosphere?.outer },
  },
  crimsonRim: { ...base.crimsonRim, ...override.crimsonRim },
});

const formatAtmosphereSnippet = (state: AtmospherePatch) => JSON.stringify(state, null, 2);

const readHeroComposerEnabled = () =>
  typeof window !== 'undefined' && window.localStorage.getItem(HERO_COMPOSER_ENABLED_STORAGE_KEY) === 'true';

const readCustomHeroArrivalPreset = (): HeroArrivalPreset | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(HERO_COMPOSER_CUSTOM_PRESET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      id: 'custom',
      name: 'Custom',
      description: 'Saved local custom hero shot.',
      profile: mergeHeroArrivalProfile(defaultHeroArrivalProfile, parsed.profile ?? parsed),
    };
  } catch {
    return null;
  }
};

const getHeroArrivalPresets = (customPreset: HeroArrivalPreset | null): HeroArrivalPreset[] => [
  ...builtInHeroArrivalPresets,
  customPreset ?? {
    id: 'custom',
    name: 'Custom',
    description: 'Current manually edited values.',
    profile: readHeroArrivalProfile(),
  },
];

const ProductionGlobePage: React.FC<ProductionGlobePageProps> = ({ variant = 'page', showDevTools = false, hybridPrototype = false, mobilePrototype = false }) => {
  const devToolsEnabled = shouldShowDevTools(showDevTools);
  const captureParams = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
  const captureFixtureId = captureParams?.get('scaleFixture');
  const capturePresetId = captureParams?.get('scalePreset') as keyof typeof GLOBE_PRESENTATION_PRESETS | null;
  const captureDistance = Number(captureParams?.get('scaleDistance'));
  const performanceFixtureCount = import.meta.env.DEV
    ? parseGlobePerformanceFixtureCount(captureParams?.get('perfFixture'))
    : null;
  const performanceFixtureEnabled = performanceFixtureCount !== null;
  const fixtureModeEnabled = import.meta.env.DEV && Boolean(devToolsEnabled || captureFixtureId || performanceFixtureEnabled);
  const performanceToolsEnabled = import.meta.env.DEV
    && (devToolsEnabled || new URLSearchParams(window.location.search).get('perf') === '1');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const countryHoverLabelRef = useRef<HTMLDivElement | null>(null);
  const countryPointerRef = useRef({ x: 0, y: 0 });
  const globeRef = useRef<GlobeRuntime | null>(null);
  const [graphicsCapability] = useState<GraphicsCapability>(() => getGraphicsCapability());
  const qualityControllerRef = useRef<GlobeQualityController | null>(null);
  if (!qualityControllerRef.current) qualityControllerRef.current = new GlobeQualityController(graphicsCapability);
  const [qualityTier, setQualityTier] = useState<GlobeQualityTier>(() => qualityControllerRef.current?.tier ?? 'high');
  const [devPerformanceSnapshot, setDevPerformanceSnapshot] = useState<ExplorerPerformanceSnapshot | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [hoveredCountry, setHoveredCountry] = useState<GlobeV1CountrySelection | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<GlobeV1CountrySelection | null>(null);
  const [countryDiscoveryScope, setCountryDiscoveryScope] = useState<{ iso3: string; name: string } | null>(null);
  const [revealedCountryIso3, setRevealedCountryIso3] = useState<string | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [activeActivityRegionId, setActiveActivityRegionId] = useState<string | null>(null);
  const [runtimeState, setRuntimeState] = useState<'loading' | 'ready' | 'recovering' | 'error'>('loading');
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [atmosphereTool, setAtmosphereTool] = useState<AtmospherePatch>(() => devToolsEnabled ? readAtmosphereToolState() : defaultAtmosphereToolState);
  const [heroComposerEnabled, setHeroComposerEnabled] = useState(() => devToolsEnabled && (readHeroComposerEnabled() || showDevTools));
  const [heroArrivalProfile, setHeroArrivalProfile] = useState<HeroArrivalProfile>(() => devToolsEnabled ? readHeroArrivalProfile() : defaultHeroArrivalProfile);
  const [previousHeroArrivalProfile, setPreviousHeroArrivalProfile] = useState<HeroArrivalProfile | null>(null);
  const [customHeroArrivalPreset, setCustomHeroArrivalPreset] = useState<HeroArrivalPreset | null>(() => devToolsEnabled ? readCustomHeroArrivalPreset() : null);
  const [selectedHeroPresetId, setSelectedHeroPresetId] = useState('custom');
  const [heroComposerSnapshot, setHeroComposerSnapshot] = useState<HeroComposerSnapshot | null>(null);
  const [heroComposerMessage, setHeroComposerMessage] = useState<string | null>(null);
  const [showHeroGuides, setShowHeroGuides] = useState(true);
  const [alignmentDebug, setAlignmentDebug] = useState<AlignmentDebugState>(defaultAlignmentDebugState);
  const [isAtmospherePanelOpen, setIsAtmospherePanelOpen] = useState(true);
  const [isScaleCalibrationPanelOpen, setIsScaleCalibrationPanelOpen] = useState(true);
  const [hybridAutoHandoffEnabled, setHybridAutoHandoffEnabled] = useState(false);
  const [hybridGlobeToMapIntent, setHybridGlobeToMapIntent] = useState(HYBRID_DEFAULT_GLOBE_TO_MAP_INTENT);
  const [hybridMapEntryZoom, setHybridMapEntryZoom] = useState(HYBRID_DEFAULT_MAP_ENTRY_ZOOM);
  const [hybridMapToGlobeZoom, setHybridMapToGlobeZoom] = useState(HYBRID_DEFAULT_MAP_TO_GLOBE_ZOOM);
  const [hybridDiscoveryClusterZoom, setHybridDiscoveryClusterZoom] = useState(2);
  const [hybridDiscoveryClusterRadius, setHybridDiscoveryClusterRadius] = useState(HYBRID_DEFAULT_DISCOVERY_CLUSTER_RADIUS);
  const [hybridGeospatialAuditEnabled, setHybridGeospatialAuditEnabled] = useState(false);
  const [hybridGeospatialCalibration, setHybridGeospatialCalibration] = useState<GeospatialCalibrationState>(() => readGeospatialCalibrationState());
  const [hybridAtlasAuditLayers, setHybridAtlasAuditLayers] = useState({
    showCountryIdTexture: false,
    showVisualCountryAtlas: false,
    showCountryHighlightMask: false,
  });
  const [hybridGeospatialSaveNotice, setHybridGeospatialSaveNotice] = useState('');
  const initialHybridGeospatialCalibrationRef = useRef(hybridGeospatialCalibration);
  const hybridHandoffCooldownUntilRef = useRef(0);
  const hybridLastGlobeZoomInWheelAtRef = useRef(0);
  const hybridInitializedRef = useRef(false);
  const [scaleFixtureId, setScaleFixtureId] = useState(captureFixtureId ?? 'bay-area');
  const [globePresentation, setGlobePresentation] = useState<GlobePresentationConfig>(() => {
    const preset = capturePresetId && GLOBE_PRESENTATION_PRESETS[capturePresetId]
      ? GLOBE_PRESENTATION_PRESETS[capturePresetId]
      : GLOBE_PRESENTATION_PRESETS.recommended;
    return JSON.parse(JSON.stringify(preset));
  });
  const initialGlobePresentationRef = useRef(globePresentation);
  const [buildingAssets, setBuildingAssets] = useState<BuildingAsset[]>([]);
  const [travelPhase, setTravelPhase] = useState<ExplorerTravelPhase>('idle');
  const [travelDestination, setTravelDestination] = useState<ExplorerDestination | null>(null);
  const [spatialDebugEnabled] = useState(() => devToolsEnabled && isSpatialDebugEnabled());
  const [spatialDebug, setSpatialDebug] = useState<SpatialDebugSnapshot>({
    canonicalLng: null,
    canonicalLat: null,
    globeLng: null,
    globeLat: null,
    globeCameraDirectionLng: null,
    globeCameraDirectionLat: null,
    mapLng: null,
    mapLat: null,
    targetSource: null,
    deltaMeters: null,
    surfaceMode: 'globe',
    transitionProgress: 0,
  });
  const {
    surfaceMode,
    setSurfaceMode,
    camera,
    setCamera,
    listingTypes: activeListingTypes,
  } = useExplorerContext();
  const transitionControllerRef = useRef<ExplorerTransitionController | null>(null);
  const transitionDirectionRef = useRef<'globe-to-map' | 'map-to-globe' | null>(null);
  const transitionStartedAtRef = useRef(0);
  const transitionMetricsRef = useRef({
    lastGlobeToMapDurationMs: null as number | null,
    lastMapToGlobeDurationMs: null as number | null,
    roundTrips: 0,
  });
  const performanceContextRef = useRef({
    explorerMode: 'globe' as ExplorerPerformanceMode,
    mapMounted: false,
  });
  const plannedTravelTimerRef = useRef<number | null>(null);
  const mobileMapHandoffTimerRef = useRef<number | null>(null);
  const mobileMapPreparingRef = useRef(false);
  const mobileIntroStartedRef = useRef(false);
  const mobileMapRequestHandledRef = useRef<string | null>(null);
  const countryPinRevealTimerRef = useRef<number | null>(null);
  const beginListingTravelRef = useRef<(listingId: string) => void>(() => undefined);
  const beginAreaTravelRef = useRef<(region: ActivityRegion) => void>(() => undefined);
  const enterLocalViewForListingRef = useRef<(listingId: string) => void>(() => undefined);
  const suppressNextGlobeSelectTravelRef = useRef<'allow-focus' | 'prevent-focus' | null>(null);
  const globeEventSelectInProgressRef = useRef(false);
  const navigationStateRef = useRef<{
    selectedListingId: string | null;
    travelPhase: ExplorerTravelPhase;
    travelDestination: ExplorerDestination | null;
  }>({
    selectedListingId: null,
    travelPhase: 'idle',
    travelDestination: null,
  });
  const globeListingsRef = useRef<Listing[]>([]);
  const lastNavigationCameraSyncAtRef = useRef(0);
  const detailPanelSettlesAtRef = useRef(0);
  const surfaceModeRef = useRef(surfaceMode);
  const suppressNextHeroPreviewEffectRef = useRef(false);
  const [transitionFrame, setTransitionFrame] = useState(() => ({
    progress: 0,
    globeOpacity: 1,
    globeScale: 1,
    globeBlurPx: 0,
    mapOpacity: 0,
    mapScale: 0.988,
    mapBlurPx: 0,
    veilOpacity: 0.08,
  }));
  const [mapViewportDiscovery, setMapViewportDiscovery] = useState<MapViewportDiscoverySnapshot | null>(null);
  const [isMapViewportDiscoveryPending, setIsMapViewportDiscoveryPending] = useState(false);
  const [mobileMapPreparing, setMobileMapPreparing] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const navigateInCurrentExperience = (path: string) => {
    if (!mobilePrototype) {
      navigate(path);
      return;
    }
    if (!path || path === '/') {
      navigate('/mobile');
      return;
    }
    navigate(path.startsWith('/mobile') ? path : `/mobile${path.startsWith('/') ? path : `/${path}`}`);
  };
  const { setDebugInfo } = useAppStore();
  const { listings, organizations, index: entityIndex } = useEntityIndex();
  const mobileSafeListings = useMemo(
    () => mobilePrototype ? applyDevMobileListingSafetyToAll(listings) : listings,
    [listings, mobilePrototype],
  );
  const listingsRef = useRef(mobileSafeListings);
  const entityIndexRef = useRef(entityIndex);
  listingsRef.current = mobileSafeListings;
  entityIndexRef.current = entityIndex;
  const isHero = variant === 'hero';
  const isSurface = variant === 'surface';
  const shouldMountMap =
    graphicsCapability !== 'unsupported' &&
    (surfaceMode === 'map' || transitionFrame.progress > 0.001 || (mobilePrototype && mobileMapPreparing));
  const explorerPerformanceMode: ExplorerPerformanceMode = transitionDirectionRef.current
    ?? (surfaceMode === 'map' ? 'map' : 'globe');
  performanceContextRef.current = {
    explorerMode: explorerPerformanceMode,
    mapMounted: shouldMountMap,
  };
  const globeRuntimeConfig = useMemo(() => {
    const performanceConfig = createGlobePerformanceConfig(
      graphicsCapability,
      prefersReducedMotion,
      qualityControllerRef.current?.tier,
    );
    return {
      ...globeAssetsConfig,
      ...performanceConfig,
      ...productionCountryPresentationConfig,
      selection: {
        ...productionCountryPresentationConfig.selection,
        ...((performanceConfig.selection as Record<string, unknown> | undefined) ?? {}),
      },
      presentation: hybridPrototype
        ? {
            ...initialGlobePresentationRef.current,
            camera: {
              ...initialGlobePresentationRef.current.camera,
              minDistanceWorld: 3.04,
              clusterArrivalDistanceWorld: 4.35,
              listingArrivalDistanceWorld: 3.28,
            },
          }
        : mobilePrototype
          ? {
              ...initialGlobePresentationRef.current,
              camera: {
                ...initialGlobePresentationRef.current.camera,
                fieldOfView: MOBILE_WORLD_FIELD_OF_VIEW,
                defaultDistanceWorld: MOBILE_DEFAULT_WORLD_DISTANCE,
                maxDistanceWorld: MOBILE_MAX_WORLD_DISTANCE,
              },
            }
          : initialGlobePresentationRef.current,
      renderer: {
        ...(performanceConfig.renderer as Record<string, unknown>),
        ...(mobilePrototype ? {
          clearViewOffsetOnInteraction: false,
          fitWorldToViewport: true,
          worldViewportFill: 0.82,
        } : {}),
      },
      progressiveDisclosure: {
        ...((performanceConfig.progressiveDisclosure as Record<string, unknown> | undefined) ?? {}),
        ...(mobilePrototype ? {
          adaptiveCountryClustering: {
            enabled: true,
            enterDistancePx: 48,
            exitDistancePx: 64,
            distanceRecheckThreshold: 0.35,
            orientationRecheckDegrees: 3,
          },
        } : {}),
      },
      pinPlacement: {
        ...((performanceConfig.pinPlacement as Record<string, unknown> | undefined) ?? {}),
        flatIdleMarkerExperiment: {
          // Production country discovery uses compact vector markers at rest.
          // Hover/click reveals the existing stemmed pin and label.
          enabled: !isHero,
          sizeScale: 3.6,
        },
      },
      alignment: {
        // Verified production calibration against the physical land GLB.
        // Atlas/pins use +1.5°; the authoritative GeoJSON raster remains at 0°.
        longitudeOffsetDeg: hybridPrototype
          ? initialHybridGeospatialCalibrationRef.current.countryAtlas.longitudeOffsetDeg
          : GEOSPATIAL_BASELINE_LONGITUDE_OFFSET_DEG,
        latitudeOffsetDeg: hybridPrototype
          ? initialHybridGeospatialCalibrationRef.current.countryAtlas.latitudeOffsetDeg
          : 0,
        pinLongitudeOffsetDeg: hybridPrototype
          ? initialHybridGeospatialCalibrationRef.current.pins.longitudeOffsetDeg
          : GEOSPATIAL_BASELINE_LONGITUDE_OFFSET_DEG,
        pinLatitudeOffsetDeg: hybridPrototype
          ? initialHybridGeospatialCalibrationRef.current.pins.latitudeOffsetDeg
          : 0,
      },
      countryGeoJson: {
        ...productionCountryPresentationConfig.countryGeoJson,
        ...(hybridPrototype ? { baseColor: '#67e8f9' } : {}),
        longitudeOffsetDeg: hybridPrototype
          ? initialHybridGeospatialCalibrationRef.current.countryGeoJson.longitudeOffsetDeg
          : 0,
        latitudeOffsetDeg: hybridPrototype
          ? initialHybridGeospatialCalibrationRef.current.countryGeoJson.latitudeOffsetDeg
          : 0,
      },
      ...(hybridPrototype ? {
        countryVectorBorders: {
          ...productionCountryPresentationConfig.countryVectorBorders,
          experimentalPhysicalCoastlineSnap: true,
          physicalCoastlineUrl: '/assets/globe/coastlines/physical-coastlines-v1.json',
          maxShorelineSnapDegrees: 5,
          shorelineSnapExcludedCountryKeys: ['ISR'],
        },
        countryVectorActivity: {
          ...productionCountryPresentationConfig.countryVectorActivity,
          experimentalPhysicalCoastlineSnap: true,
          physicalCoastlineUrl: '/assets/globe/coastlines/physical-coastlines-v1.json',
          maxShorelineSnapDegrees: 5,
          shorelineSnapExcludedCountryKeys: ['ISR'],
        },
        geospatialCalibration: {
          enabled: true,
          visible: false,
        },
      } : {}),
      administrativeBoundaries: hybridPrototype
        ? {
            enabled: true,
            deemphasizeCountryHighlight: true,
            features: [
              {
                id: 'us-ca',
                kind: 'state',
                url: '/geo/admin/us/ca/state.geojson',
                color: '#e2e6eb',
                glowColor: '#ff465c',
                coreWidth: 1.45,
                glowWidth: 4.2,
                opacity: 0.54,
                glowOpacity: 0.07,
                revealDistance: 5.35,
                fullOpacityDistance: 4.55,
                maxSegmentDegrees: 0.11,
                conformToTerrain: true,
                largestPolygonOnly: true,
                terrainSmoothingWindow: 3,
                maxTerrainRadiusDeviation: 0.022,
              },
              {
                id: 'us-ca-san-francisco',
                kind: 'city',
                url: '/geo/admin/us/ca/san-francisco-city.geojson',
                color: '#ffffff',
                glowColor: '#ff465c',
                coreWidth: 2,
                glowWidth: 5.4,
                opacity: 0.82,
                glowOpacity: 0.12,
                revealDistance: 3.72,
                fullOpacityDistance: 3.28,
                maxSegmentDegrees: 0.018,
                conformToTerrain: true,
                largestPolygonOnly: true,
                terrainSmoothingWindow: 4,
                maxTerrainRadiusDeviation: 0.018,
              },
            ],
          }
        : { enabled: false },
    };
  }, [graphicsCapability, hybridPrototype, isHero, mobilePrototype, prefersReducedMotion]);

  const performanceFixtureListings = useMemo(
    () => performanceFixtureCount ? buildGlobePerformanceFixtureListings(performanceFixtureCount) : null,
    [performanceFixtureCount],
  );
  const globeListings = useMemo(
    () => (performanceFixtureListings ?? mobileSafeListings).filter((listing) =>
      isGlobeEligibleListing(listing)
      && (!activeListingTypes.length || activeListingTypes.includes(listing.type))),
    [activeListingTypes, mobileSafeListings, performanceFixtureListings],
  );
  const spatialEventAggregation = useMemo(
    () => aggregateEventsForSpatialDisplay(globeListings),
    [globeListings],
  );
  const spatialGlobeListings = spatialEventAggregation.listings;
  const resolveSpatialListingId = (listingId: string | null | undefined) =>
    listingId ? spatialEventAggregation.representativeByListingId.get(listingId) ?? listingId : null;
  const showHostMarkers = !performanceFixtureEnabled
    && (!activeListingTypes.length || activeListingTypes.includes('promoter'));
  const hostRuntimeEvents = useMemo(
    () => showHostMarkers ? adaptOrganizationsToGlobeEvents(organizations) : [],
    [organizations, showHostMarkers],
  );
  const hostDiscoveryPoints = useMemo(
    () => showHostMarkers ? adaptOrganizationsToDiscoveryPoints(organizations) : [],
    [organizations, showHostMarkers],
  );
  const hostMapPins = useMemo(() => hostRuntimeEvents.flatMap((event) => {
    const organization = event.organization;
    if (!organization) return [];
    const region = organization.globePresence?.regions.find((candidate) =>
      candidate.status !== 'inactive'
      && candidate.latitude === event.lat
      && candidate.longitude === event.lon,
    );
    if (!region) return [];
    return [{
      id: event.id,
      type: 'promoter' as const,
      name: organization.name,
      location: [region.city, region.region, region.country].filter(Boolean).join(', '),
      logoImageUrl: organization.logoImageUrl,
      geopoint: {
        latitude: event.lat,
        longitude: event.lon,
        address: {
          city: region.city,
          region: region.region,
          country: region.country,
        },
      },
    }];
  }), [hostRuntimeEvents]);
  const globeRuntimeEvents = useMemo(
    () => performanceFixtureEnabled
      ? adaptListingsToGlobeEvents(spatialGlobeListings)
      : fixtureModeEnabled
        ? buildGlobeScaleFixtureEvents(scaleFixtureId)
        : [...adaptListingsToGlobeEvents(spatialGlobeListings), ...hostRuntimeEvents],
    [fixtureModeEnabled, hostRuntimeEvents, performanceFixtureEnabled, scaleFixtureId, spatialGlobeListings],
  );
  const activeCountryIso3s = useMemo(
    () => [...new Set(globeRuntimeEvents
      .map((event) => String(event.countryIso3 ?? '').trim().toUpperCase())
      .filter((iso3) => /^[A-Z]{3}$/.test(iso3)))],
    [globeRuntimeEvents],
  );
  const visibleCountryRuntimeEvents = useMemo(() => {
    const countryIso3 = countryDiscoveryScope?.iso3 ?? '';
    if (!countryIso3) return [];
    return globeRuntimeEvents.filter((event) => String(event.countryIso3 ?? '').trim().toUpperCase() === countryIso3);
  }, [countryDiscoveryScope?.iso3, globeRuntimeEvents]);
  const discoveryPoints = useMemo(
    () => performanceFixtureEnabled
      ? adaptListingsToDiscoveryPoints(globeListings)
      : fixtureModeEnabled
        ? buildGlobeScaleFixtureDiscoveryPoints(scaleFixtureId)
        : [...adaptListingsToDiscoveryPoints(globeListings), ...hostDiscoveryPoints],
    [fixtureModeEnabled, globeListings, hostDiscoveryPoints, performanceFixtureEnabled, scaleFixtureId],
  );
  const activityRegionOptions = hybridPrototype
    ? { worldZoom: hybridDiscoveryClusterZoom, radius: hybridDiscoveryClusterRadius }
    : undefined;
  const activityRegions = useMemo(
    () => createActivityRegions(discoveryPoints, activityRegionOptions),
    [activityRegionOptions?.radius, activityRegionOptions?.worldZoom, discoveryPoints],
  );
  const visibleCountryDiscoveryPoints = useMemo(() => {
    if (!revealedCountryIso3) return [];
    return discoveryPoints.filter((point) =>
      resolveCountryIsoCodes(point.country).iso3 === revealedCountryIso3);
  }, [discoveryPoints, revealedCountryIso3]);
  const visibleCountryActivityRegions = useMemo(
    () => createActivityRegions(visibleCountryDiscoveryPoints, activityRegionOptions),
    [activityRegionOptions?.radius, activityRegionOptions?.worldZoom, visibleCountryDiscoveryPoints],
  );
  const globeStats = useMemo(() => {
    const cityKeys = new Set(discoveryPoints.flatMap((point) => {
      const city = String(point.city ?? '').trim();
      if (!city) return [];
      return [[city, point.region, point.country]
        .map((value) => String(value ?? '').trim().toLowerCase())
        .join('|')];
    }));
    return {
      countryCount: activeCountryIso3s.length,
      cityCount: cityKeys.size,
      eventCount: globeListings.filter((listing) => listing.type === 'event').length,
    };
  }, [activeCountryIso3s.length, discoveryPoints, globeListings]);
  const activeActivityRegion = useMemo(
    () => visibleCountryActivityRegions.find((region) => region.id === activeActivityRegionId)
      ?? activityRegions.find((region) => region.id === activeActivityRegionId)
      ?? null,
    [activityRegions, activeActivityRegionId, visibleCountryActivityRegions],
  );
  const heroArrivalPresets = useMemo(
    () => devToolsEnabled ? getHeroArrivalPresets(customHeroArrivalPreset) : builtInHeroArrivalPresets,
    [customHeroArrivalPreset, devToolsEnabled],
  );
  const countryDiscoveryScopeIso3 = countryDiscoveryScope?.iso3 ?? '';
  const regionDiscoveryRailListings = useMemo(() => {
    if (activeActivityRegion) {
      const memberIds = new Set(activeActivityRegion.listingIds);
      return globeListings.filter((listing) => memberIds.has(listing.id));
    }
    if (countryDiscoveryScopeIso3) {
      return globeListings.filter((listing) =>
        resolveCountryIsoCodes(getListingPhysicalAddress(listing).country).iso3 === countryDiscoveryScopeIso3);
    }
    return [];
  }, [activeActivityRegion, countryDiscoveryScopeIso3, globeListings]);
  const {
    selectedListingId,
    setSelectedListingId,
    searchText,
    setSearchText,
    listingTypes,
    setListingTypes,
    selectedTags,
    setSelectedTags,
    filteredListings: filteredDiscoveryRailListings,
  } = useExplorerState(regionDiscoveryRailListings, {
    idleLimit: activeActivityRegion ? undefined : 6,
  });
  useEffect(() => {
    if (!mobilePrototype || activeListingTypes.length) return;
    setListingTypes(['club', 'event']);
  }, [activeListingTypes.length, mobilePrototype, setListingTypes]);
  const { filteredListings: filteredMapListings } = useExplorerState(globeListings);
  const spatialMapListings = useMemo(
    () => aggregateEventsForSpatialDisplay(filteredMapListings).listings,
    [filteredMapListings],
  );
  const renderedSpatialMapListings = useMemo(
    () => mobilePrototype
      ? spatialMapListings.filter((listing) => !isApproximateLocation(listing))
      : spatialMapListings,
    [mobilePrototype, spatialMapListings],
  );
  const mapViewportListings = useViewportDiscovery(filteredMapListings, mapViewportDiscovery, {
    paddingRatio: 0.18,
  });
  const globeHeroSelectedListingId =
    travelDestination?.type === 'listing' && ['planning', 'globe-travel', 'globe-arrived'].includes(travelPhase)
      ? travelDestination.listingId
      : null;
  const detailListingId =
    travelDestination?.type === 'listing'
      ? travelDestination.listingId
      : selectedListingId;
  const displaySelectedListingId = detailListingId ?? globeHeroSelectedListingId;
  const discoveryRailSelectedListingId = displaySelectedListingId;
  const selectedPrivateMapListing = useMemo(
    () => surfaceMode === 'map' && displaySelectedListingId
      ? filteredMapListings.find((listing) =>
          listing.id === displaySelectedListingId && isApproximateLocation(listing),
        ) ?? null
      : null,
    [displaySelectedListingId, filteredMapListings, surfaceMode],
  );
  const mapNearbyRail = useMemo(() => {
    const selectedListing = displaySelectedListingId
      ? filteredMapListings.find((listing) => listing.id === displaySelectedListingId) ?? null
      : null;
    const selectedCoords = selectedListing ? getListingDisplayCoords(selectedListing) : null;
    const center = selectedCoords ?? mapViewportDiscovery?.center ?? {
      lng: camera.lng,
      lat: camera.lat,
    };
    const ranked = filteredMapListings
      .map((listing, index) => {
        const coords = getListingDisplayCoords(listing);
        const distanceMeters = coords ? distanceMetersBetween(center, coords) : null;
        return {
          listing,
          index,
          distanceMeters: distanceMeters ?? Number.POSITIVE_INFINITY,
        };
      })
      .sort((a, b) => {
        const distanceDelta = a.distanceMeters - b.distanceMeters;
        if (Math.abs(distanceDelta) > 1) return distanceDelta;
        return a.index - b.index;
      })
      .slice(0, 6);

    return {
      listings: ranked.map((item) => item.listing),
      distanceLabels: Object.fromEntries(
        ranked.map((item) => [
          item.listing.id,
          Number.isFinite(item.distanceMeters) ? formatApproxDistance(item.distanceMeters) : 'Nearby',
        ]),
      ) as Record<string, string>,
    };
  }, [camera.lat, camera.lng, displaySelectedListingId, filteredMapListings, mapViewportDiscovery?.center]);
  const discoveryRailListings = surfaceMode === 'map'
    ? mapNearbyRail.listings
    : filteredDiscoveryRailListings;
  const discoveryRailDistanceLabels = surfaceMode === 'map' ? mapNearbyRail.distanceLabels : {};
  const discoveryRailRegionName = surfaceMode === 'map'
    ? null
    : activeActivityRegion?.name ?? countryDiscoveryScope?.name ?? null;
  const discoveryRailTitle = surfaceMode === 'globe' && !activeActivityRegion && !countryDiscoveryScope
    ? 'Choose a country'
    : undefined;
  const discoveryRailEmptyMessage = surfaceMode === 'globe' && !activeActivityRegion && !countryDiscoveryScope
    ? 'Select a highlighted country to reveal its activity.'
    : 'No nearby listings match the current filters.';
  const discoveryRailIsUpdating = surfaceMode === 'map' && isMapViewportDiscoveryPending;
  const hasExplorerDetails = Boolean(detailListingId || selectedOrganizationId);
  const selectedListingIsGlobeEligible = useMemo(
    () => Boolean(selectedListingId && globeListings.some((listing) => listing.id === selectedListingId)),
    [globeListings, selectedListingId],
  );
  const showLocalViewHint =
    !mobilePrototype &&
    surfaceMode === 'globe' &&
    travelPhase === 'globe-arrived' &&
    travelDestination?.type === 'listing' &&
    Boolean(detailListingId);

  useEffect(() => {
    navigationStateRef.current = {
      selectedListingId,
      travelPhase,
      travelDestination,
    };
  }, [selectedListingId, travelDestination, travelPhase]);

  useEffect(() => {
    globeListingsRef.current = globeListings;
  }, [globeListings]);

  useEffect(() => () => {
    if (plannedTravelTimerRef.current !== null) window.clearTimeout(plannedTravelTimerRef.current);
    if (mobileMapHandoffTimerRef.current !== null) window.clearTimeout(mobileMapHandoffTimerRef.current);
    if (countryPinRevealTimerRef.current !== null) window.clearTimeout(countryPinRevealTimerRef.current);
  }, []);

  if (!transitionControllerRef.current) {
    transitionControllerRef.current = new ExplorerTransitionController(
      surfaceMode,
      prefersReducedMotion ? 0 : 800,
    );
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    mediaQuery.addEventListener?.('change', handleChange);
    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, []);

  useEffect(() => {
    if (hybridPrototype || mobilePrototype) {
      if (hybridInitializedRef.current) return;
      hybridInitializedRef.current = true;
      setSurfaceMode('globe');
      setCamera({ surface: 'globe' });
      return;
    }
    const nextSurface = location.pathname === '/map' ? 'map' : 'globe';
    setSurfaceMode(nextSurface);
    setCamera(
      nextSurface === 'map' && camera.surface !== 'map'
        ? DEFAULT_MAP_CAMERA
        : { surface: nextSurface },
    );
  }, [camera.surface, hybridPrototype, location.pathname, mobilePrototype, setCamera, setSurfaceMode]);

  useEffect(() => {
    surfaceModeRef.current = surfaceMode;
    if (surfaceMode !== 'globe') setHoveredCountry(null);
    if (spatialDebugEnabled) {
      setSpatialDebug((current) => ({
        ...current,
        surfaceMode,
      }));
    }
  }, [spatialDebugEnabled, surfaceMode]);

  useEffect(() => {
    if (!spatialDebugEnabled) return;
    setSpatialDebug((current) => ({
      ...current,
      transitionProgress: transitionFrame.progress,
    }));
  }, [spatialDebugEnabled, transitionFrame.progress]);

  useEffect(() => {
    detailPanelSettlesAtRef.current = performance.now() + DETAIL_PANEL_SETTLE_MS;
  }, [detailListingId, selectedCountry, selectedListingId]);

  useEffect(() => {
    const controller = transitionControllerRef.current;
    if (!controller) return;

    const startedAt = performance.now();
    const previousTarget = controller.getTarget();
    controller.setTarget(surfaceMode, startedAt);
    const direction = previousTarget === surfaceMode
      ? null
      : surfaceMode === 'map'
        ? 'globe-to-map' as const
        : 'map-to-globe' as const;
    transitionDirectionRef.current = direction;
    transitionStartedAtRef.current = startedAt;
    if (direction) globeRef.current?.setTransitionActive(true);
    let frameId = 0;
    let mounted = true;

    const tick = (now: number) => {
      if (!mounted) return;
      const nextFrame = controller.update(now);
      setTransitionFrame(nextFrame);
      if (controller.isAnimating()) {
        frameId = window.requestAnimationFrame(tick);
      } else if (direction) {
        const durationMs = now - transitionStartedAtRef.current;
        if (direction === 'globe-to-map') {
          transitionMetricsRef.current.lastGlobeToMapDurationMs = durationMs;
        } else {
          transitionMetricsRef.current.lastMapToGlobeDurationMs = durationMs;
          transitionMetricsRef.current.roundTrips += 1;
        }
        transitionDirectionRef.current = null;
        globeRef.current?.setTransitionActive(false);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => {
      mounted = false;
      window.cancelAnimationFrame(frameId);
      if (direction) globeRef.current?.setTransitionActive(false);
    };
  }, [surfaceMode]);

  useEffect(() => {
    if (isHero) return;
    setDebugInfo({ label: 'Globe V1' });
  }, [isHero, setDebugInfo]);

  useEffect(() => {
    if (isHero || runtimeState !== 'ready') return;
    globeRef.current?.updateAtmosphereConfig(atmosphereTool);
    if (!devToolsEnabled) return;
    window.localStorage.setItem(ATMOSPHERE_TOOL_STORAGE_KEY, JSON.stringify(atmosphereTool));
  }, [atmosphereTool, devToolsEnabled, isHero, runtimeState]);

  useEffect(() => {
    if (!hybridPrototype || runtimeState !== 'ready') return;
    globeRef.current?.setGeospatialCalibrationState({
      visible: hybridGeospatialAuditEnabled,
      pinLongitudeOffsetDeg: hybridGeospatialCalibration.pins.longitudeOffsetDeg,
      pinLatitudeOffsetDeg: hybridGeospatialCalibration.pins.latitudeOffsetDeg,
      geoJsonLongitudeOffsetDeg: hybridGeospatialCalibration.countryGeoJson.longitudeOffsetDeg,
      geoJsonLatitudeOffsetDeg: hybridGeospatialCalibration.countryGeoJson.latitudeOffsetDeg,
      countryAtlasLongitudeOffsetDeg: hybridGeospatialCalibration.countryAtlas.longitudeOffsetDeg,
      countryAtlasLatitudeOffsetDeg: hybridGeospatialCalibration.countryAtlas.latitudeOffsetDeg,
      showCountryIdTexture: hybridAtlasAuditLayers.showCountryIdTexture,
      showVisualCountryAtlas: hybridAtlasAuditLayers.showVisualCountryAtlas,
      showCountryHighlightMask: hybridAtlasAuditLayers.showCountryHighlightMask,
      showAuthoritativeBorders: hybridGeospatialAuditEnabled,
    });
  }, [
    hybridAtlasAuditLayers.showCountryHighlightMask,
    hybridAtlasAuditLayers.showCountryIdTexture,
    hybridAtlasAuditLayers.showVisualCountryAtlas,
    hybridGeospatialAuditEnabled,
    hybridGeospatialCalibration,
    hybridPrototype,
    runtimeState,
  ]);

  useEffect(() => {
    if (!devToolsEnabled || typeof window === 'undefined') return;
    window.localStorage.setItem(HERO_COMPOSER_ENABLED_STORAGE_KEY, String(heroComposerEnabled));
  }, [devToolsEnabled, heroComposerEnabled]);

  useEffect(() => {
    if (!devToolsEnabled || typeof window === 'undefined') return;
    window.localStorage.setItem(HERO_COMPOSER_PROFILE_STORAGE_KEY, JSON.stringify(heroArrivalProfile));
  }, [devToolsEnabled, heroArrivalProfile]);

  useEffect(() => {
    if (!devToolsEnabled || typeof window === 'undefined') return;
    if (customHeroArrivalPreset) {
      window.localStorage.setItem(HERO_COMPOSER_CUSTOM_PRESET_STORAGE_KEY, JSON.stringify(customHeroArrivalPreset));
    }
  }, [customHeroArrivalPreset, devToolsEnabled]);

  useEffect(() => {
    if (isHero || !devToolsEnabled || !heroComposerEnabled || runtimeState !== 'ready') return;
    if (suppressNextHeroPreviewEffectRef.current) {
      suppressNextHeroPreviewEffectRef.current = false;
      return;
    }
    const snapshot = globeRef.current?.previewHeroArrivalProfile(heroArrivalProfile) ?? null;
    setHeroComposerSnapshot(snapshot);
  // Profile editing may preview the current shot, but venue selection/travel must
  // remain owned by the navigation controller. Do not retrigger this effect when
  // travelDestination changes or the dev preview will teleport the camera before
  // the production focus animation begins.
  }, [devToolsEnabled, heroArrivalProfile, heroComposerEnabled, isHero, runtimeState]);

  useEffect(() => {
    if (isHero || !devToolsEnabled || runtimeState !== 'ready') return;
    globeRef.current?.updateAlignmentDebugConfig(alignmentDebug);
  }, [alignmentDebug, devToolsEnabled, isHero, runtimeState]);

  useEffect(() => {
    if (runtimeState !== 'ready') return;
    if (fixtureModeEnabled || performanceFixtureEnabled) {
      globeRef.current?.updateEvents(globeRuntimeEvents);
      globeRef.current?.updateActivityRegions(activityRegions);
    } else {
      globeRef.current?.setCountryActivityEvents(globeRuntimeEvents);
      globeRef.current?.updateVisibleEvents(visibleCountryRuntimeEvents);
      globeRef.current?.updateActivityRegions(visibleCountryActivityRegions);
      // The Three.js runtime owns cluster -> direct-pin disclosure once a
      // discovery marker is clicked. React only owns which country's data is
      // available; it must not overwrite that runtime mode during navigation.
    }
    globeRef.current?.setCountryActivityCountries(activeCountryIso3s);
  }, [
    activeCountryIso3s,
    activityRegions,
    fixtureModeEnabled,
    globeRuntimeEvents,
    performanceFixtureEnabled,
    runtimeState,
    visibleCountryActivityRegions,
    visibleCountryRuntimeEvents,
  ]);

  useEffect(() => {
    if (runtimeState !== 'ready') return;
    globeRef.current?.setCountryDiscoveryEmphasis(Boolean(
      revealedCountryIso3 &&
      !activeActivityRegionId &&
      !detailListingId &&
      !selectedOrganizationId
    ));
  }, [
    activeActivityRegionId,
    detailListingId,
    revealedCountryIso3,
    runtimeState,
    selectedOrganizationId,
  ]);

  useEffect(() => {
    if (runtimeState !== 'ready' || !fixtureModeEnabled) return;
    globeRef.current?.updatePresentationConfig(globePresentation, { frameWorld: true });
  }, [fixtureModeEnabled, globePresentation, runtimeState]);

  useEffect(() => {
    if (runtimeState !== 'ready' || !mobilePrototype) return;
    const currentPresentation = globeRef.current?.getPresentationConfig();
    if (!currentPresentation) return;
    globeRef.current?.updatePresentationConfig({
      ...currentPresentation,
      camera: {
        ...currentPresentation.camera,
        defaultDistanceWorld: MOBILE_DEFAULT_WORLD_DISTANCE,
        maxDistanceWorld: Math.max(currentPresentation.camera.maxDistanceWorld, MOBILE_MAX_WORLD_DISTANCE),
      },
    }, { frameWorld: true });
  }, [mobilePrototype, runtimeState]);

  useEffect(() => {
    if (
      runtimeState !== 'ready' ||
      !mobilePrototype ||
      mobileIntroStartedRef.current ||
      prefersReducedMotion ||
      new URLSearchParams(location.search).has('mapListing')
    ) return;
    const globe = globeRef.current;
    const container = containerRef.current;
    const snapshot = globe?.getNavigationSnapshot();
    if (!globe || !container || !snapshot) return;

    mobileIntroStartedRef.current = true;
    const baseLng = Number.isFinite(snapshot.cameraDirectionLng) ? snapshot.cameraDirectionLng : snapshot.lng;
    const baseLat = Number.isFinite(snapshot.cameraDirectionLat) ? snapshot.cameraDirectionLat : snapshot.lat;
    const startedAt = performance.now();
    let frameId = 0;
    let cancelled = false;

    const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
    const smoothstep = (value: number) => {
      const t = clamp01(value);
      return t * t * (3 - 2 * t);
    };
    const easeOutCubic = (value: number) => 1 - Math.pow(1 - clamp01(value), 3);
    const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

    const settleAtCurrentPose = () => {
      if (cancelled) return;
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      globe.setIdleMotionSpeedMultiplier(1);
    };
    container.addEventListener('pointerdown', settleAtCurrentPose, { once: true });
    container.addEventListener('touchstart', settleAtCurrentPose, { once: true, passive: true });

    const tick = (now: number) => {
      if (cancelled) return;
      const progress = clamp01((now - startedAt) / MOBILE_INTRO_DURATION_MS);
      let distance = MOBILE_DEFAULT_WORLD_DISTANCE;

      if (progress < 0.42) {
        const phase = easeOutCubic(progress / 0.42);
        distance = lerp(MOBILE_INTRO_CLOSE_DISTANCE, MOBILE_INTRO_FAR_DISTANCE, phase);
      } else if (progress < 0.78) {
        const phase = smoothstep((progress - 0.42) / 0.36);
        distance = lerp(MOBILE_INTRO_FAR_DISTANCE, MOBILE_INTRO_OVERSHOOT_DISTANCE, phase);
      } else {
        const phase = smoothstep((progress - 0.78) / 0.22);
        const dampedSettle = Math.sin(phase * Math.PI * 2) * (1 - phase) * 0.28;
        distance = lerp(MOBILE_INTRO_OVERSHOOT_DISTANCE, MOBILE_DEFAULT_WORLD_DISTANCE, phase) + dampedSettle;
      }

      const settleSpinProgress = progress < 0.78
        ? 0
        : smoothstep((progress - 0.78) / 0.22);
      globe.setIdleMotionSpeedMultiplier(
        lerp(MOBILE_INTRO_IDLE_SPEED_MULTIPLIER, 1, settleSpinProgress),
      );
      globe.setNavigationPose({
        lng: baseLng,
        lat: baseLat,
        zoomIntent: 0.5,
        distance,
        followVisualLandRotation: false,
      });

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
        return;
      }
      globe.setIdleMotionSpeedMultiplier(1);
      globe.setNavigationPose({
        lng: baseLng,
        lat: baseLat,
        zoomIntent: 0.5,
        distance: MOBILE_DEFAULT_WORLD_DISTANCE,
        followVisualLandRotation: false,
      });
      cancelled = true;
    };

    globe.setIdleMotionSpeedMultiplier(MOBILE_INTRO_IDLE_SPEED_MULTIPLIER);
    globe.setNavigationPose({
      lng: baseLng,
      lat: baseLat,
      zoomIntent: 0.5,
      distance: MOBILE_INTRO_CLOSE_DISTANCE,
      followVisualLandRotation: false,
    });
    frameId = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      globe.setIdleMotionSpeedMultiplier(1);
      container.removeEventListener('pointerdown', settleAtCurrentPose);
      container.removeEventListener('touchstart', settleAtCurrentPose);
    };
  }, [location.search, mobilePrototype, prefersReducedMotion, runtimeState]);

  useEffect(() => {
    if (runtimeState !== 'ready' || !fixtureModeEnabled || !captureFixtureId || !activityRegions[0]) return;
    const timer = window.setTimeout(() => {
      globeRef.current?.selectActivityRegion(activityRegions[0].id);
      if (Number.isFinite(captureDistance)) {
        const fixture = getGlobeScaleFixture(scaleFixtureId);
        globeRef.current?.setNavigationPose({
          lng: fixture.center.longitude,
          lat: fixture.center.latitude,
          zoomIntent: 0.7,
          distance: captureDistance,
        });
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [activityRegions, captureDistance, captureFixtureId, fixtureModeEnabled, globePresentation, runtimeState, scaleFixtureId]);

  useEffect(() => {
    if (runtimeState !== 'ready') return;
    const shouldRenderGlobe = surfaceMode === 'globe' || transitionFrame.progress < 0.999;
    if (shouldRenderGlobe) {
      globeRef.current?.start();
    } else {
      globeRef.current?.stop();
    }
  }, [runtimeState, surfaceMode, transitionFrame.progress]);

  useEffect(() => {
    if (runtimeState !== 'ready') return;
    const shouldSuppressIdleMotion =
      surfaceMode === 'globe' &&
      (
        travelPhase !== 'idle' ||
        Boolean(detailListingId || selectedListingId || selectedCountry || activeActivityRegionId)
      );
    globeRef.current?.setIdleMotionSuppressed(shouldSuppressIdleMotion);
  }, [
    activeActivityRegionId,
    detailListingId,
    runtimeState,
    selectedCountry,
    selectedListingId,
    surfaceMode,
    travelPhase,
  ]);

  useEffect(() => {
    let cancelled = false;
    api.getBuildingAssets()
      .then((assets) => {
        if (!cancelled) setBuildingAssets(assets);
      })
      .catch(() => {
        if (!cancelled) setBuildingAssets([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      isHero ||
      runtimeState !== 'ready' ||
      surfaceMode !== 'globe' ||
      !selectedListingIsGlobeEligible ||
      !selectedListingId
    ) {
      return;
    }
    const destination = navigationStateRef.current.travelDestination;
    if (
      destination?.type === 'listing' &&
      destination.listingId === selectedListingId &&
      ['globe-travel', 'globe-arrived', 'preparing-map'].includes(navigationStateRef.current.travelPhase)
    ) {
      return;
    }
    suppressNextGlobeSelectTravelRef.current = 'prevent-focus';
    globeRef.current?.selectEvent(resolveSpatialListingId(selectedListingId) ?? selectedListingId);
  }, [isHero, runtimeState, selectedListingId, selectedListingIsGlobeEligible]);

  const clearPlannedTravelTimers = () => {
    if (plannedTravelTimerRef.current !== null) {
      window.clearTimeout(plannedTravelTimerRef.current);
      plannedTravelTimerRef.current = null;
    }
    if (mobileMapHandoffTimerRef.current !== null) {
      window.clearTimeout(mobileMapHandoffTimerRef.current);
      mobileMapHandoffTimerRef.current = null;
    }
    if (mobileMapPreparingRef.current) {
      mobileMapPreparingRef.current = false;
      setMobileMapPreparing(false);
      setCamera({ surface: 'globe' });
    }
  };

  const clearCountryPinReveal = () => {
    if (countryPinRevealTimerRef.current !== null) {
      window.clearTimeout(countryPinRevealTimerRef.current);
      countryPinRevealTimerRef.current = null;
    }
    setCountryDiscoveryScope(null);
    setRevealedCountryIso3(null);
  };

  const isPlannedTravelActive = () =>
    ['planning', 'globe-travel', 'preparing-map', 'traveling', 'blending', 'arriving'].includes(navigationStateRef.current.travelPhase);

  const prepareMobileMapForDestination = (destination: ExplorerDestination) => {
    if (destination.type !== 'listing' && destination.listingIds?.length) {
      const exactListingIds = new Set(
        globeListingsRef.current
          .filter((listing) => destination.listingIds?.includes(listing.id) && !isApproximateLocation(listing))
          .map((listing) => listing.id),
      );
      if (exactListingIds.size === 0) {
        navigationStateRef.current = {
          ...navigationStateRef.current,
          travelDestination: destination,
          travelPhase: 'globe-arrived',
        };
        setTravelPhase('globe-arrived');
        return;
      }
    }
    const framing = destination.framing;
    navigationStateRef.current = {
      selectedListingId: destination.type === 'listing' ? destination.listingId : navigationStateRef.current.selectedListingId,
      travelDestination: destination,
      travelPhase: 'preparing-map',
    };
    setTravelPhase('preparing-map');
    setCamera({
      surface: 'map',
      lng: framing.center.lng,
      lat: framing.center.lat,
      zoom: framing.kind === 'camera' ? framing.zoom : GLOBE_MAP_MIN_ARRIVAL_ZOOM,
      pitch: framing.pitch,
      bearing: framing.bearing,
    });
    mobileMapPreparingRef.current = true;
    setMobileMapPreparing(true);
  };

  const handleMobilePreparedMapReady = () => {
    if (!mobilePrototype || !mobileMapPreparingRef.current) return;
    const destination = navigationStateRef.current.travelDestination;
    if (!destination) return;
    mobileMapPreparingRef.current = false;
    setMobileMapPreparing(false);
    const nextPhase: ExplorerTravelPhase = destination.type === 'listing' ? 'venue-explore' : 'local-explore';
    navigationStateRef.current = {
      ...navigationStateRef.current,
      travelDestination: destination,
      travelPhase: nextPhase,
    };
    setTravelPhase(nextPhase);
    surfaceModeRef.current = 'map';
    setSurfaceMode('map');
  };

  const scheduleMobileListingHandoff = (listingId: string) => {
    if (!mobilePrototype) return;
    if (mobileMapHandoffTimerRef.current !== null) {
      window.clearTimeout(mobileMapHandoffTimerRef.current);
      mobileMapHandoffTimerRef.current = null;
    }
    mobileMapHandoffTimerRef.current = window.setTimeout(() => {
      mobileMapHandoffTimerRef.current = null;
      const state = navigationStateRef.current;
      const destination = state.travelDestination;
      if (!canScheduleMobileListingHandoff(state, listingId)) return;
      const listing = globeListingsRef.current.find((candidate) => candidate.id === listingId) ?? null;
      if (!listing) return;
      const canonicalPath = getListingCanonicalPath(listing, entityIndexRef.current ?? undefined);
      navigateInCurrentExperience(canonicalPath);
    }, MOBILE_GLOBE_ARRIVAL_BEAT_MS);
  };

  const completeGlobeHeroArrival = () => {
    const { travelDestination: destination, travelPhase: currentTravelPhase } = navigationStateRef.current;
    if (!destination || !['planning', 'globe-travel'].includes(currentTravelPhase)) return;
    clearPlannedTravelTimers();
    const selectedId = destination.type === 'listing' ? destination.listingId : navigationStateRef.current.selectedListingId;
    navigationStateRef.current = {
      selectedListingId: selectedId,
      travelDestination: destination,
      travelPhase: 'globe-arrived',
    };
    if (destination.type === 'listing') {
      setSelectedListingId(destination.listingId);
    }
    setTravelPhase('globe-arrived');
    if (mobilePrototype && destination.type === 'listing') {
      scheduleMobileListingHandoff(destination.listingId);
    }
  };

  const getHybridAdministrativeBoundaryIdsForListing = (listingId: string): string[] => {
    if (!hybridPrototype) return [];
    const listing = globeListingsRef.current.find((candidate) => candidate.id === listingId) ?? null;
    const address = listing?.geopoint?.address;
    if (!address) return [];
    const country = String(address.country ?? '').trim().toLowerCase();
    const region = String(address.region ?? '').trim().toLowerCase();
    const city = String(address.city ?? '').trim().toLowerCase();
    const isUnitedStates = ['united states', 'united states of america', 'usa', 'us'].includes(country);
    const isCalifornia = ['california', 'ca'].includes(region);
    if (!isUnitedStates || !isCalifornia) return [];
    return city === 'san francisco'
      ? ['us-ca', 'us-ca-san-francisco']
      : ['us-ca'];
  };

  const getHybridAdministrativeBoundaryIdsForRegion = (region: ActivityRegion): string[] => {
    if (!hybridPrototype) return [];
    const ids = new Set<string>();
    for (const listingId of region.listingIds ?? []) {
      for (const boundaryId of getHybridAdministrativeBoundaryIdsForListing(String(listingId))) {
        if (boundaryId === 'us-ca') ids.add(boundaryId);
      }
    }
    return [...ids];
  };

  const buildListingDestination = (listingId: string): ExplorerDestination | null => {
    const listing = globeListingsRef.current.find((candidate) => candidate.id === listingId) ?? null;
    const coords = listing ? getListingDisplayCoords(listing) : null;
    if (!listing || !coords) return null;
    const authoredAsset = mobilePrototype && isApproximateLocation(listing)
      ? null
      : getBuildingAssetForListing(listing, buildingAssets);
    const framing = buildListingMapFraming(listing, authoredAsset);
    if (!framing) return null;
    return {
      type: 'listing',
      listingId,
      lat: coords.lat,
      lng: coords.lng,
      framing,
    };
  };

  const navigateToMobileListingPage = (listingId: string) => {
    const listing = globeListingsRef.current.find((candidate) => candidate.id === listingId) ?? null;
    if (!listing) return;
    clearPlannedTravelTimers();
    const canonicalPath = getListingCanonicalPath(listing, entityIndexRef.current ?? undefined);
    navigateInCurrentExperience(canonicalPath);
  };

  const enterLocalViewForListing = (listingId: string) => {
    if (isHero) return;
    const listing = globeListingsRef.current.find((candidate) => candidate.id === listingId) ?? null;
    if (mobilePrototype && listing && isApproximateLocation(listing)) {
      navigateToMobileListingPage(listingId);
      return;
    }
    const currentDestination = navigationStateRef.current.travelDestination;
    const destination = currentDestination?.type === 'listing' && currentDestination.listingId === listingId
      ? currentDestination
      : buildListingDestination(listingId);
    if (!destination || destination.type !== 'listing') return;
    clearPlannedTravelTimers();
    if (hybridPrototype) {
      if (listingId === 'club-twist-sf') {
        navigate(`/dev/street-view?listingId=${encodeURIComponent(listingId)}`);
      }
      return;
    }
    navigationStateRef.current = {
      selectedListingId: listingId,
      travelDestination: destination,
      travelPhase: 'traveling',
    };
    setTravelDestination(destination);
    setSelectedCountry(null);
    setSelectedListingId(listingId);
    setCamera({
      surface: 'map',
      lng: destination.lng,
      lat: destination.lat,
      zoom: destination.framing.zoom,
      pitch: destination.framing.pitch,
      bearing: destination.framing.bearing,
    });
    setTravelPhase('traveling');
    surfaceModeRef.current = 'map';
    setSurfaceMode('map');
    if (!mobilePrototype) navigate('/map', { replace: true });
  };

  const shouldEnterLocalViewOnListingClick = (listingId: string) =>
    surfaceModeRef.current === 'globe' &&
    navigationStateRef.current.selectedListingId === listingId &&
    (
      navigationStateRef.current.travelDestination?.type === 'listing' &&
      navigationStateRef.current.travelDestination.listingId === listingId &&
      ['globe-arrived', 'venue-explore'].includes(navigationStateRef.current.travelPhase)
    );

  const shouldRefocusWithinCurrentGlobeView = (listingId: string) =>
    !mobilePrototype &&
    surfaceModeRef.current === 'globe' &&
    navigationStateRef.current.selectedListingId !== listingId &&
    ['globe-arrived', 'venue-explore'].includes(navigationStateRef.current.travelPhase);

  const refocusWithinCurrentGlobeView = (listingId: string) => {
    const destination = buildListingDestination(listingId);
    if (!destination || destination.type !== 'listing') return;
    clearPlannedTravelTimers();
    navigationStateRef.current = {
      selectedListingId: listingId,
      travelDestination: destination,
      travelPhase: 'globe-arrived',
    };
    setTravelDestination(destination);
    setTravelPhase('globe-arrived');
    setSelectedOrganizationId(null);
    setSelectedListingId(listingId);
    if (runtimeState === 'ready' && !globeEventSelectInProgressRef.current) {
      suppressNextGlobeSelectTravelRef.current = 'prevent-focus';
      const selectedEvent = globeRef.current?.selectEvent(resolveSpatialListingId(listingId) ?? listingId);
      if (!selectedEvent) suppressNextGlobeSelectTravelRef.current = null;
    }
  };

  const beginListingTravel = (listingId: string) => {
    if (isHero) return;
    const currentNavigation = navigationStateRef.current;
    const isSameListingTravelActive =
      currentNavigation.travelDestination?.type === 'listing' &&
      currentNavigation.travelDestination.listingId === listingId &&
      ['planning', 'globe-travel'].includes(currentNavigation.travelPhase);
    if (isSameListingTravelActive) return;
    if (shouldEnterLocalViewOnListingClick(listingId)) {
      if (mobilePrototype) navigateToMobileListingPage(listingId);
      else enterLocalViewForListing(listingId);
      return;
    }
    if (shouldRefocusWithinCurrentGlobeView(listingId)) {
      refocusWithinCurrentGlobeView(listingId);
      return;
    }
    const destination = buildListingDestination(listingId);
    if (!destination || destination.type !== 'listing') return;

    clearPlannedTravelTimers();
    globeRef.current?.setAdministrativeBoundaryIds(
      getHybridAdministrativeBoundaryIdsForListing(listingId),
    );
    navigationStateRef.current = {
      selectedListingId: listingId,
      travelDestination: destination,
      travelPhase: 'planning',
    };
    setTravelDestination(destination);
    setTravelPhase('planning');
    setSelectedOrganizationId(null);
    setSelectedListingId(listingId);
    if (runtimeState === 'ready' && !globeEventSelectInProgressRef.current) {
      suppressNextGlobeSelectTravelRef.current = 'allow-focus';
      const selectedEvent = globeRef.current?.selectEvent(resolveSpatialListingId(listingId) ?? listingId);
      if (!selectedEvent) suppressNextGlobeSelectTravelRef.current = null;
    }
    setCamera({
      surface: 'globe',
      lng: destination.lng,
      lat: destination.lat,
      zoom: destination.framing.zoom,
      pitch: destination.framing.pitch,
      bearing: destination.framing.bearing,
    });
    setSurfaceMode('globe');
    navigationStateRef.current = {
      selectedListingId: listingId,
      travelDestination: destination,
      travelPhase: 'globe-travel',
    };
    setTravelPhase('globe-travel');

    plannedTravelTimerRef.current = window.setTimeout(() => {
      completeGlobeHeroArrival();
      plannedTravelTimerRef.current = null;
    }, prefersReducedMotion
      ? 0
      : Math.max(
        4600,
        estimateGlobeTravelDurationMs({ lng: camera.lng, lat: camera.lat }, { lng: destination.lng, lat: destination.lat }) + GLOBE_TRAVEL_ARRIVAL_PAUSE_MS + 700,
      ));
  };

  const beginAreaTravel = (region: ActivityRegion) => {
    if (isHero) return;
    clearPlannedTravelTimers();
    globeRef.current?.setAdministrativeBoundaryIds(
      getHybridAdministrativeBoundaryIdsForRegion(region),
    );
    const framing = buildListingDistributionFraming({
      profile: 'region',
      listingIds: region.listingIds,
      listings: globeListingsRef.current,
      fallbackCenter: { lng: region.longitude, lat: region.latitude },
    });
    const destination: ExplorerDestination = {
      type: 'region',
      id: region.id,
      lat: framing.center.lat,
      lng: framing.center.lng,
      listingIds: region.listingIds,
      framing,
    };
    setTravelDestination(destination);
    setTravelPhase('planning');
    setSelectedListingId(null);
    setSelectedOrganizationId(null);
    setActiveActivityRegionId(region.id);
    setCamera({
      surface: 'globe',
      lng: framing.center.lng,
      lat: framing.center.lat,
      zoom: framing.kind === 'camera' ? framing.zoom : GLOBE_MAP_MIN_ARRIVAL_ZOOM,
      pitch: framing.pitch,
      bearing: framing.bearing,
    });
    setSurfaceMode('globe');
    setTravelPhase('globe-travel');

    plannedTravelTimerRef.current = window.setTimeout(() => {
      completeGlobeHeroArrival();
      plannedTravelTimerRef.current = null;
    }, prefersReducedMotion
      ? 0
      : Math.max(
        4600,
        estimateGlobeTravelDurationMs({ lng: camera.lng, lat: camera.lat }, framing.center) + GLOBE_TRAVEL_ARRIVAL_PAUSE_MS + 700,
      ));
  };

  const explorerNavigationController = {
    selectVenue: beginListingTravel,
    selectRegion: beginAreaTravel,
    enterLocalViewForVenue: enterLocalViewForListing,
  };

  beginListingTravelRef.current = explorerNavigationController.selectVenue;
  beginAreaTravelRef.current = explorerNavigationController.selectRegion;
  enterLocalViewForListingRef.current = explorerNavigationController.enterLocalViewForVenue;

  useEffect(() => {
    if (!mobilePrototype) return;
    const requestedListingId = new URLSearchParams(location.search).get('mapListing');
    if (!requestedListingId || mobileMapRequestHandledRef.current === requestedListingId) return;
    if (!globeListings.some((listing) => listing.id === requestedListingId)) return;
    mobileMapRequestHandledRef.current = requestedListingId;
    enterLocalViewForListingRef.current(requestedListingId);
  }, [globeListings, location.search, mobilePrototype]);

  const resolveCanonicalGlobeTarget = (snapshot: GlobeNavigationSnapshot) => {
    const navigationState = navigationStateRef.current;
    const selectedId = navigationState.travelDestination?.type === 'listing'
      ? navigationState.travelDestination.listingId
      : navigationState.selectedListingId;
    const selectedListing = selectedId
      ? globeListingsRef.current.find((listing) => listing.id === selectedId) ?? null
      : null;
    if (selectedListing) {
      const coords = getListingDisplayCoords(selectedListing);
      return {
        lng: coords.lng,
        lat: coords.lat,
        targetSource: 'selected-listing' as const,
      };
    }
    return {
      lng: snapshot.lng,
      lat: snapshot.lat,
      targetSource: snapshot.targetSource,
    };
  };

  const syncCameraFromGlobe = (snapshot: GlobeNavigationSnapshot) => {
    if (isHero) return;
    const now = performance.now();
    const canonicalTarget = resolveCanonicalGlobeTarget(snapshot);
    const mapZoom = zoomIntentToMapZoom(snapshot.zoomIntent);
    if (
      hybridPrototype &&
      surfaceModeRef.current === 'globe' &&
      !activeActivityRegionId &&
      !selectedListingId &&
      !selectedOrganizationId &&
      !isPlannedTravelActive()
    ) {
      const nextClusterZoom = resolveHybridDiscoveryClusterZoom(snapshot.zoomIntent);
      setHybridDiscoveryClusterZoom((current) => current === nextClusterZoom ? current : nextClusterZoom);
    }
    const shouldAutoEnterMap =
      hybridPrototype &&
      hybridAutoHandoffEnabled &&
      surfaceModeRef.current === 'globe' &&
      !isPlannedTravelActive() &&
      now >= hybridHandoffCooldownUntilRef.current &&
      now - hybridLastGlobeZoomInWheelAtRef.current <= HYBRID_GLOBE_WHEEL_WINDOW_MS &&
      snapshot.zoomIntent >= hybridGlobeToMapIntent;

    if (shouldAutoEnterMap) {
      hybridHandoffCooldownUntilRef.current = now + HYBRID_HANDOFF_COOLDOWN_MS;
      setTravelPhase('local-explore');
      setCamera({
        surface: 'map',
        lng: canonicalTarget.lng,
        lat: canonicalTarget.lat,
        zoom: hybridMapEntryZoom,
        pitch: 0,
        bearing: 0,
      });
      surfaceModeRef.current = 'map';
      setSurfaceMode('map');
      return;
    }

    const pose: ExplorerCameraPose = {
      surface: surfaceModeRef.current,
      lng: canonicalTarget.lng,
      lat: canonicalTarget.lat,
      zoom: mapZoom,
      pitch: WORLD_PITCH,
      bearing: WORLD_BEARING,
    };
    const shouldSyncCamera =
      surfaceModeRef.current === 'globe' &&
      !isPlannedTravelActive() &&
      !transitionControllerRef.current?.isAnimating() &&
      now - lastNavigationCameraSyncAtRef.current > 120;
    if (spatialDebugEnabled) {
      setSpatialDebug((current) => {
        const canonical = { lng: canonicalTarget.lng, lat: canonicalTarget.lat };
        const mapTarget = current.mapLng !== null && current.mapLat !== null
          ? { lng: current.mapLng, lat: current.mapLat }
          : null;
        return {
          ...current,
          canonicalLng: canonicalTarget.lng,
          canonicalLat: canonicalTarget.lat,
          globeLng: snapshot.lng,
          globeLat: snapshot.lat,
          globeCameraDirectionLng: snapshot.cameraDirectionLng ?? null,
          globeCameraDirectionLat: snapshot.cameraDirectionLat ?? null,
          targetSource: canonicalTarget.targetSource,
          deltaMeters: distanceMetersBetween(canonical, mapTarget),
        };
      });
    }

    if (shouldSyncCamera) {
      lastNavigationCameraSyncAtRef.current = now;
      setCamera(pose);
    }
  };

  const syncCameraFromMap = (
    mapCamera: ExplorerCameraPose,
    meta: {
      zoomDirection: 'in' | 'out' | 'none';
      isUserZoomingOut: boolean;
      isProgrammatic: boolean;
    },
  ) => {
    if (isHero) return;
    const now = performance.now();
    const shouldAutoReturnToGlobe =
      hybridPrototype &&
      hybridAutoHandoffEnabled &&
      surfaceModeRef.current === 'map' &&
      !meta.isProgrammatic &&
      meta.isUserZoomingOut &&
      mapCamera.zoom <= hybridMapToGlobeZoom &&
      now >= hybridHandoffCooldownUntilRef.current;

    if (shouldAutoReturnToGlobe) {
      hybridHandoffCooldownUntilRef.current = now + HYBRID_HANDOFF_COOLDOWN_MS;
      globeRef.current?.setNavigationPose({
        lng: mapCamera.lng,
        lat: mapCamera.lat,
        zoomIntent: HYBRID_RETURN_GLOBE_INTENT,
      });
      setTravelPhase('idle');
      setCamera({
        surface: 'globe',
        lng: mapCamera.lng,
        lat: mapCamera.lat,
        zoom: zoomIntentToMapZoom(HYBRID_RETURN_GLOBE_INTENT),
        pitch: WORLD_PITCH,
        bearing: WORLD_BEARING,
      });
      surfaceModeRef.current = 'globe';
      setSurfaceMode('globe');
      return;
    }

    const pose: ExplorerCameraPose = {
      ...mapCamera,
      surface: surfaceModeRef.current,
      pitch: WORLD_PITCH,
      bearing: Number.isFinite(mapCamera.bearing) ? mapCamera.bearing : WORLD_BEARING,
    };
    if (now - lastNavigationCameraSyncAtRef.current > 100) {
      lastNavigationCameraSyncAtRef.current = now;
      if (!isPlannedTravelActive()) setCamera(pose);
    }

    if (spatialDebugEnabled) {
      setSpatialDebug((current) => {
        const mapTarget = { lng: mapCamera.lng, lat: mapCamera.lat };
        const canonical = current.canonicalLng !== null && current.canonicalLat !== null
          ? { lng: current.canonicalLng, lat: current.canonicalLat }
          : mapTarget;
        return {
          ...current,
          canonicalLng: canonical.lng,
          canonicalLat: canonical.lat,
          mapLng: mapCamera.lng,
          mapLat: mapCamera.lat,
          targetSource: surfaceModeRef.current === 'map' ? 'map-center' : current.targetSource,
          deltaMeters: distanceMetersBetween(canonical, mapTarget),
        };
      });
    }

    void meta;
  };

  useEffect(() => {
    let cancelled = false;

    const mountGlobe = async () => {
      if (!containerRef.current) return;
      if (graphicsCapability === 'unsupported') {
        setRuntimeState('error');
        setRuntimeError('WebGL 2 is unavailable.');
        return;
      }
      try {
        const module = await import('../src/features/globe/runtime/index.js');
        if (cancelled || !containerRef.current) return;
        const SwingSphereGlobe = module.SwingSphereGlobe as GlobeConstructor;
        const globe = new SwingSphereGlobe(containerRef.current, {
          events: [],
          activityRegions: [],
          config: globeRuntimeConfig,
          onReady: () => {
            if (!cancelled) setRuntimeState('ready');
          },
          onError: (error) => {
            if (!cancelled) {
              setRuntimeState('error');
              setRuntimeError(error instanceof Error ? error.message : String(error));
            }
          },
          onCountrySelect: (country) => {
            if (isHero) return;
            clearPlannedTravelTimers();
            globeRef.current?.clearEventSelection();
            if (countryPinRevealTimerRef.current !== null) {
              window.clearTimeout(countryPinRevealTimerRef.current);
              countryPinRevealTimerRef.current = null;
            }
            setRevealedCountryIso3(null);
            setTravelDestination(null);
            setTravelPhase('idle');
            setSelectedCountry(country);
            setSelectedListingId(null);
            setSelectedOrganizationId(null);
            setActiveActivityRegionId(null);
            globeRef.current?.setAdministrativeBoundaryIds([]);

            const countryIso3 = String(country?.iso3 ?? '').trim().toUpperCase();
            if (!countryIso3) {
              setCountryDiscoveryScope(null);
              return;
            }
            setCountryDiscoveryScope({
              iso3: countryIso3,
              name: String(country?.name ?? countryIso3),
            });
            countryPinRevealTimerRef.current = window.setTimeout(() => {
              setRevealedCountryIso3(countryIso3);
              countryPinRevealTimerRef.current = null;
            }, prefersReducedMotion ? 0 : COUNTRY_PIN_REVEAL_DELAY_MS);
          },
          onCountryHover: (country) => {
            if (isHero) return;
            setHoveredCountry(country);
          },
          onEventHover: () => undefined,
          onEventSelect: (event) => {
            if (isHero) return;
            if (event.entityType === 'promoter' && event.organizationId) {
              clearPlannedTravelTimers();
              setSelectedCountry(null);
              setSelectedListingId(null);
              setSelectedOrganizationId(event.organizationId);
              setTravelDestination(null);
              setTravelPhase('globe-travel');
              setCamera({
                surface: 'globe',
                lng: event.lon,
                lat: event.lat,
                zoom: GLOBE_MAP_MIN_ARRIVAL_ZOOM,
                pitch: WORLD_PITCH,
                bearing: WORLD_BEARING,
              });
              setSurfaceMode('globe');
              return;
            }
            setSelectedOrganizationId(null);
            if (import.meta.env.DEV && event.listingId.startsWith('dev-scale:')) {
              setSelectedCountry(null);
              setSelectedListingId(null);
              return;
            }
            if (suppressNextGlobeSelectTravelRef.current) {
              const focusMode = suppressNextGlobeSelectTravelRef.current;
              suppressNextGlobeSelectTravelRef.current = null;
              return focusMode === 'prevent-focus' ? false : undefined;
            }
            if (shouldEnterLocalViewOnListingClick(event.listingId)) {
              if (mobilePrototype) navigateToMobileListingPage(event.listingId);
              else enterLocalViewForListingRef.current(event.listingId);
              return false;
            }
            globeRef.current?.setAdministrativeBoundaryIds(
              getHybridAdministrativeBoundaryIdsForListing(event.listingId),
            );
            globeEventSelectInProgressRef.current = true;
            beginListingTravelRef.current(event.listingId);
            globeEventSelectInProgressRef.current = false;
          },
          onEventLabelActivate: (event) => {
            if (isHero || !event.listingId) return;
            const listing = listingsRef.current.find((candidate) => candidate.id === event.listingId) ?? event.listing;
            if (!listing) return;
            const canonicalPath = getListingCanonicalPath(listing, entityIndexRef.current ?? undefined);
            navigateInCurrentExperience(canonicalPath);
          },
          onActivityRegionSelect: (region) => {
            if (isHero) return;
            globeRef.current?.setAdministrativeBoundaryIds(
              getHybridAdministrativeBoundaryIdsForRegion(region),
            );
            beginAreaTravelRef.current(region);
          },
          onDiscoveryModeChange: (region) => {
            if (isHero) return;
            setActiveActivityRegionId(region?.id ?? null);
            if (hybridPrototype && !navigationStateRef.current.selectedListingId) {
              globeRef.current?.setAdministrativeBoundaryIds(
                region ? getHybridAdministrativeBoundaryIdsForRegion(region) : [],
              );
            }
          },
          onNavigationChange: syncCameraFromGlobe,
          onFocusArrival: () => {
            if (isHero) return;
            completeGlobeHeroArrival();
          },
          onSurfaceDoubleClick: () => {
            if (isHero) return;
            clearPlannedTravelTimers();
            clearCountryPinReveal();
            navigationStateRef.current = {
              selectedListingId: null,
              travelDestination: null,
              travelPhase: 'idle',
            };
            setTravelDestination(null);
            setTravelPhase('idle');
            setSelectedListingId(null);
            setSelectedOrganizationId(null);
            setSelectedCountry(null);
            setHoveredCountry(null);
            setActiveActivityRegionId(null);
            globeRef.current?.setAdministrativeBoundaryIds([]);
          },
          onContextLost: () => {
            if (!cancelled) setRuntimeState('recovering');
          },
          onContextRestored: () => {
            if (!cancelled) {
              setRuntimeError(null);
              setRuntimeState('ready');
            }
          },
          onInteractionEnd: () => {
            if (!mobilePrototype || isHero) return;
            const state = navigationStateRef.current;
            const destination = state.travelDestination;
            if (destination?.type !== 'listing' || !canScheduleMobileListingHandoff(state, destination.listingId)) return;
            scheduleMobileListingHandoff(destination.listingId);
          },
          onPerformanceSnapshot: (snapshot) => {
            const nextTier = qualityControllerRef.current?.observe(snapshot) ?? null;
            if (nextTier) {
              globe.setQualityTier(nextTier);
              setQualityTier(nextTier);
            }
            if (performanceToolsEnabled) {
              const context = performanceContextRef.current;
              const transitions = transitionMetricsRef.current;
              setDevPerformanceSnapshot({
                ...snapshot,
                qualityTier: nextTier ?? snapshot.qualityTier,
                explorerMode: context.explorerMode,
                mapMounted: context.mapMounted,
                graphicsCapability,
                lastGlobeToMapDurationMs: transitions.lastGlobeToMapDurationMs,
                lastMapToGlobeDurationMs: transitions.lastMapToGlobeDurationMs,
                roundTrips: transitions.roundTrips,
              });
            }
          },
        });
        globeRef.current = globe;
        await globe.mount();
        globe.setQualityTier(qualityControllerRef.current?.tier ?? qualityTier);
      } catch (error) {
        if (!cancelled) {
          setRuntimeState('error');
          setRuntimeError(error instanceof Error ? error.message : String(error));
        }
      }
    };

    void mountGlobe();

    return () => {
      cancelled = true;
      globeRef.current?.dispose();
      globeRef.current = null;
    };
  }, [graphicsCapability, globeRuntimeConfig]);

  const resetAutomaticQuality = () => {
    const nextTier = qualityControllerRef.current?.reset() ?? (graphicsCapability === 'webgl2-hardware' ? 'high' : 'low');
    globeRef.current?.setQualityTier(nextTier);
    setQualityTier(nextTier);
  };

  const closePanel = () => {
    clearPlannedTravelTimers();
    setTravelDestination(null);
    setTravelPhase(surfaceModeRef.current === 'map' ? 'local-explore' : 'idle');
    setSelectedListingId(null);
    setSelectedOrganizationId(null);
    if (surfaceModeRef.current === 'globe' && countryDiscoveryScope) {
      // Country selection is navigation context now, not details-panel content.
      // Closing a listing/host card should leave the user inside that country.
      globeRef.current?.clearEventSelection();
      return;
    }
    setSelectedCountry(null);
    globeRef.current?.clearSelection();
  };

  const selectListing = (listingId: string) => {
    explorerNavigationController.selectVenue(listingId);
  };

  const selectMapListing = (listingId: string) => {
    const destination = buildListingDestination(listingId);
    if (!destination || destination.type !== 'listing') return;
    clearPlannedTravelTimers();
    setTravelDestination(destination);
    setTravelPhase('venue-explore');
    setSelectedCountry(null);
    setSelectedOrganizationId(null);
    setSelectedListingId(listingId);
    setCamera({
      surface: 'map',
      lng: destination.lng,
      lat: destination.lat,
      zoom: destination.framing.zoom,
      pitch: destination.framing.pitch,
      bearing: destination.framing.bearing,
    });
    setSurfaceMode('map');
  };

  const selectListingFromRail = (listingId: string) => {
    setSelectedOrganizationId(null);
    if (graphicsCapability === 'unsupported') {
      setSelectedCountry(null);
      setSelectedListingId(listingId);
      return;
    }
    if (surfaceModeRef.current === 'map') {
      selectMapListing(listingId);
      return;
    }
    selectListing(listingId);
  };

  const selectHostFromRail = (organizationId: string) => {
    const hostEvent = hostRuntimeEvents.find((event) => event.organizationId === organizationId);
    if (!hostEvent) return;
    clearPlannedTravelTimers();
    setSelectedCountry(null);
    setSelectedListingId(null);
    setSelectedOrganizationId(organizationId);
    setTravelDestination(null);
    setTravelPhase('globe-travel');
    globeRef.current?.selectEvent(hostEvent.id);
    setCamera({
      surface: 'globe',
      lng: hostEvent.lon,
      lat: hostEvent.lat,
      zoom: GLOBE_MAP_MIN_ARRIVAL_ZOOM,
      pitch: WORLD_PITCH,
      bearing: WORLD_BEARING,
    });
    setSurfaceMode('globe');
  };

  const handleVenueArrivalComplete = (listingId: string) => {
    const destination = navigationStateRef.current.travelDestination;
    if (destination?.type !== 'listing' || destination.listingId !== listingId) return;
    setTravelPhase('venue-explore');
  };

  const setManualSurfaceMode = (mode: 'globe' | 'map') => {
    clearPlannedTravelTimers();
    if (mode === 'map') clearCountryPinReveal();
    setTravelDestination(null);
    setTravelPhase(mode === 'map' ? 'local-explore' : 'idle');

    if (hybridPrototype) {
      hybridHandoffCooldownUntilRef.current = performance.now() + HYBRID_HANDOFF_COOLDOWN_MS;
      if (mode === 'map') {
        const snapshot = globeRef.current?.getNavigationSnapshot();
        const target = snapshot ? resolveCanonicalGlobeTarget(snapshot) : { lng: camera.lng, lat: camera.lat };
        setCamera({
          surface: 'map',
          lng: target.lng,
          lat: target.lat,
          zoom: hybridMapEntryZoom,
          pitch: 0,
          bearing: 0,
        });
      } else {
        globeRef.current?.setNavigationPose({
          lng: camera.lng,
          lat: camera.lat,
          zoomIntent: HYBRID_RETURN_GLOBE_INTENT,
        });
        setCamera({
          surface: 'globe',
          lng: camera.lng,
          lat: camera.lat,
          zoom: zoomIntentToMapZoom(HYBRID_RETURN_GLOBE_INTENT),
          pitch: WORLD_PITCH,
          bearing: WORLD_BEARING,
        });
      }
      surfaceModeRef.current = mode;
      setSurfaceMode(mode);
      return;
    }

    setCamera(mode === 'map' ? DEFAULT_MAP_CAMERA : { surface: 'globe' });
    setSurfaceMode(mode);
    navigate(mode === 'map' ? '/map' : '/globe');
  };

  const returnToWorld = () => {
    clearPlannedTravelTimers();
    clearCountryPinReveal();
    navigationStateRef.current = {
      selectedListingId: null,
      travelDestination: null,
      travelPhase: 'idle',
    };
    setTravelDestination(null);
    setTravelPhase('idle');
    setSelectedListingId(null);
    setSelectedOrganizationId(null);
    setSelectedCountry(null);
    setActiveActivityRegionId(null);
    globeRef.current?.setAdministrativeBoundaryIds([]);
    globeRef.current?.returnToWorld();
    if ((hybridPrototype || mobilePrototype) && surfaceModeRef.current === 'map') {
      if (hybridPrototype) {
        hybridHandoffCooldownUntilRef.current = performance.now() + HYBRID_HANDOFF_COOLDOWN_MS;
      }
      setCamera({ surface: 'globe' });
      surfaceModeRef.current = 'globe';
      setSurfaceMode('globe');
    }
  };

  const resetMapToWorld = () => {
    clearPlannedTravelTimers();
    clearCountryPinReveal();
    setTravelDestination(null);
    setTravelPhase('local-explore');
    setSelectedListingId(null);
    setSelectedOrganizationId(null);
    setSelectedCountry(null);
    setActiveActivityRegionId(null);
    globeRef.current?.setAdministrativeBoundaryIds([]);
    setCamera(DEFAULT_MAP_CAMERA);
  };

  const updateShellValue = (
    shell: 'inner' | 'outer',
    key: keyof AtmosphereShell,
    value: number,
  ) => {
    setAtmosphereTool((current) => ({
      ...current,
      atmosphere: {
        ...current.atmosphere,
        [shell]: {
          ...current.atmosphere[shell],
          [key]: value,
        },
      },
    }));
  };

  const updateRimRadius = (value: number) => {
    setAtmosphereTool((current) => ({
      ...current,
      crimsonRim: {
        ...current.crimsonRim,
        radius: value,
      },
    }));
  };

  const copyAtmosphereConfig = async () => {
    await navigator.clipboard?.writeText(formatAtmosphereSnippet(atmosphereTool));
  };

  const copyHeroArrivalConfig = async () => {
    await navigator.clipboard?.writeText(formatHeroArrivalSnippet(heroArrivalProfile));
    setHeroComposerMessage('Copied hero profile JSON.');
  };

  const exportHeroArrivalConfig = () => {
    const blob = new Blob([formatHeroArrivalSnippet(heroArrivalProfile)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'globe-hero-arrival-profile.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setHeroComposerMessage('Exported hero profile JSON.');
  };

  const resetHeroArrivalConfig = () => {
    setPreviousHeroArrivalProfile(heroArrivalProfile);
    setSelectedHeroPresetId('custom');
    suppressNextHeroPreviewEffectRef.current = true;
    setHeroArrivalProfile(defaultHeroArrivalProfile);
    setHeroComposerSnapshot(globeRef.current?.animateHeroArrivalPreview(defaultHeroArrivalProfile) ?? null);
    setHeroComposerMessage('Reset to runtime defaults.');
  };

  const previewHeroArrivalPreset = (preset: HeroArrivalPreset) => {
    setPreviousHeroArrivalProfile(heroArrivalProfile);
    setSelectedHeroPresetId(preset.id);
    suppressNextHeroPreviewEffectRef.current = true;
    setHeroArrivalProfile(preset.profile);
    setHeroComposerSnapshot(globeRef.current?.animateHeroArrivalPreview(preset.profile) ?? null);
    setHeroComposerMessage(`Previewing ${preset.name}.`);
  };

  const applySelectedHeroArrivalPreset = () => {
    const preset = heroArrivalPresets.find((candidate) => candidate.id === selectedHeroPresetId);
    if (!preset) return;
    previewHeroArrivalPreset(preset);
    setHeroComposerMessage(`Applied ${preset.name}.`);
  };

  const revertHeroArrivalPreset = () => {
    if (!previousHeroArrivalProfile) {
      setHeroComposerMessage('No previous hero profile to revert to.');
      return;
    }
    suppressNextHeroPreviewEffectRef.current = true;
    setHeroArrivalProfile(previousHeroArrivalProfile);
    setHeroComposerSnapshot(globeRef.current?.animateHeroArrivalPreview(previousHeroArrivalProfile) ?? null);
    setSelectedHeroPresetId('custom');
    setHeroComposerMessage('Reverted to previous hero profile.');
  };

  const saveHeroArrivalAsCustom = () => {
    const customPreset: HeroArrivalPreset = {
      id: 'custom',
      name: 'Custom',
      description: 'Saved local custom hero shot.',
      profile: heroArrivalProfile,
    };
    setCustomHeroArrivalPreset(customPreset);
    setSelectedHeroPresetId('custom');
    setHeroComposerMessage('Saved current profile as Custom.');
  };

  const captureCurrentHeroCamera = () => {
    const captured = globeRef.current?.captureHeroArrivalProfile();
    if (!captured) {
      setHeroComposerMessage('Select a destination before capturing.');
      return;
    }
    const nextProfile = mergeHeroArrivalProfile(heroArrivalProfile, captured);
    setPreviousHeroArrivalProfile(heroArrivalProfile);
    setSelectedHeroPresetId('custom');
    suppressNextHeroPreviewEffectRef.current = true;
    setHeroArrivalProfile(nextProfile);
    setHeroComposerSnapshot(globeRef.current?.getHeroArrivalComposerSnapshot() ?? null);
    setHeroComposerMessage('Captured current camera pose.');
  };

  const saveHeroArrivalConfig = async () => {
    try {
      const response = await fetch('/api/admin/globe/hero-arrival/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: heroArrivalProfile }),
      });
      if (!response.ok) throw new Error(await response.text());
      setHeroComposerMessage('Saved to GlobeRuntimeConfig.js.');
    } catch (error) {
      setHeroComposerMessage(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.');
    }
  };

  const copyAlignmentConfig = async () => {
    await navigator.clipboard?.writeText(formatAlignmentSnippet(alignmentDebug));
  };

  const saveAlignmentConfig = (state: AlignmentDebugState) => {
    const blob = new Blob([formatAlignmentSnippet(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'globe-alignment-debug-config.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const resetAlignmentDebug = () => setAlignmentDebug(defaultAlignmentDebugState);

  const updateHybridGeospatialLayer = (
    layer: keyof GeospatialCalibrationState,
    next: GeospatialLayerCalibration,
  ) => {
    setHybridGeospatialCalibration((current) => ({ ...current, [layer]: next }));
    setHybridGeospatialSaveNotice('Unsaved preview');
  };

  const saveHybridGeospatialCalibration = () => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(GEOSPATIAL_CALIBRATION_STORAGE_KEY, JSON.stringify(hybridGeospatialCalibration));
    setHybridGeospatialSaveNotice(
      `Saved pins ${hybridGeospatialCalibration.pins.longitudeOffsetDeg.toFixed(2)}° · GeoJSON ${hybridGeospatialCalibration.countryGeoJson.longitudeOffsetDeg.toFixed(2)}° · atlas ${hybridGeospatialCalibration.countryAtlas.longitudeOffsetDeg.toFixed(2)}°`,
    );
  };

  const resetHybridGeospatialCalibration = () => {
    setHybridGeospatialCalibration(defaultGeospatialCalibrationState);
    setHybridAtlasAuditLayers({
      showCountryIdTexture: false,
      showVisualCountryAtlas: false,
      showCountryHighlightMask: false,
    });
    setHybridGeospatialSaveNotice('Reset: pins +1.50° · GeoJSON 0.00° · atlas +1.50°');
  };

  const alignAllHybridLayers = () => {
    const shared = { longitudeOffsetDeg: GEOSPATIAL_BASELINE_LONGITUDE_OFFSET_DEG, latitudeOffsetDeg: 0 };
    setHybridGeospatialCalibration({
      pins: { ...shared },
      countryGeoJson: { ...shared },
      countryAtlas: { ...shared },
    });
    setHybridGeospatialSaveNotice('Unsaved preview · all layers +1.50° / 0.00°');
  };

  const focusScaleCalibrationFixture = () => {
    const region = activityRegions[0];
    if (region) {
      globeRef.current?.selectActivityRegion(region.id);
      return;
    }
    const fixture = getGlobeScaleFixture(scaleFixtureId);
    globeRef.current?.setNavigationPose({
      lng: fixture.center.longitude,
      lat: fixture.center.latitude,
      zoomIntent: 0.72,
    });
  };

  const labelCountry = hoveredCountry ?? selectedCountry;
  const labelCountryName = labelCountry?.name ?? null;
  const handleGlobePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const nextPointer = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
    countryPointerRef.current = nextPointer;
    if (countryHoverLabelRef.current) {
      countryHoverLabelRef.current.style.left = `${nextPointer.x}px`;
      countryHoverLabelRef.current.style.top = `${nextPointer.y}px`;
    }
  };

  const handleGlobeWheelCapture = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!hybridPrototype || surfaceModeRef.current !== 'globe') return;
    if (event.deltaY < 0) hybridLastGlobeZoomInWheelAtRef.current = performance.now();
  };

  if (variant === 'page') {
    return (
      <div className="ss-bg-geometric-muted relative h-full min-h-0 overflow-hidden bg-[#030407]">
        <main className="absolute inset-0" aria-label="Globe discovery stage">
          <div
            className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_50%_45%,rgba(255,58,85,0.08),transparent_42%),linear-gradient(180deg,rgba(3,4,7,0.08),rgba(3,4,7,0.22)_100%)]"
            style={{ opacity: 0.35 + transitionFrame.veilOpacity }}
          />
          <div
            onPointerMove={mobilePrototype ? undefined : handleGlobePointerMove}
            onWheelCapture={handleGlobeWheelCapture}
            className={[
              'absolute inset-0 z-[2]',
              'origin-center transition-[opacity,transform,filter] duration-700 ease-out will-change-[opacity,transform,filter]',
              surfaceMode === 'globe' ? 'pointer-events-auto' : 'pointer-events-none',
            ].join(' ')}
            style={{
              opacity: transitionFrame.globeOpacity,
              transform: `scale(${transitionFrame.globeScale})`,
              filter: `blur(${transitionFrame.globeBlurPx}px) saturate(${surfaceMode === 'globe' ? 1 : 0.92}) contrast(${surfaceMode === 'globe' ? 1 : 0.96})`,
            }}
          >
            <div ref={containerRef} className="absolute inset-0" aria-label="SwingSphere Globe V1" />
            {!mobilePrototype && labelCountryName ? (
              <div
                ref={countryHoverLabelRef}
                className="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-[calc(100%+18px)] whitespace-nowrap rounded-full border border-white/20 bg-black/72 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white shadow-xl backdrop-blur-xl"
                style={{ left: countryPointerRef.current.x, top: countryPointerRef.current.y }}
              >
                {labelCountryName}
              </div>
            ) : null}
          </div>

          {graphicsCapability === 'unsupported' ? (
            <GraphicsFallback
              listings={filteredDiscoveryRailListings}
              onSelect={(listingId) => {
                setSelectedCountry(null);
                setSelectedListingId(listingId);
              }}
            />
          ) : null}

          <div
            className={[
              'absolute inset-0 z-[3]',
              'origin-center transition-[opacity,transform,filter] duration-700 ease-out will-change-[opacity,transform,filter]',
              surfaceMode === 'map' ? 'pointer-events-auto' : 'pointer-events-none',
            ].join(' ')}
            style={{
              opacity: transitionFrame.mapOpacity,
              transform: `scale(${transitionFrame.mapScale})`,
              filter: `blur(${transitionFrame.mapBlurPx}px) saturate(${surfaceMode === 'map' ? 1.02 : 0.95}) contrast(${surfaceMode === 'map' ? 1 : 0.97})`,
            }}
          >
            {shouldMountMap ? (
              <React.Suspense fallback={<div className="h-full w-full bg-[#05070a]" aria-hidden="true" />}>
                <FlatWorldMap
                  listings={performanceFixtureListings ?? renderedSpatialMapListings}
                  resolutionListings={performanceFixtureListings ?? listings}
                  hostPins={performanceFixtureEnabled ? [] : hostMapPins}
                  buildingAssets={buildingAssets}
                  activityRegions={activityRegions}
                  selectedId={resolveSpatialListingId(displaySelectedListingId)}
                  onSelect={selectMapListing}
                  onReset={resetMapToWorld}
                  camera={camera}
                  destinationFraming={travelDestination?.framing ?? null}
                  onNavigationChange={syncCameraFromMap}
                  onViewportChange={setMapViewportDiscovery}
                  onViewportChangeState={({ isPending }) => setIsMapViewportDiscoveryPending(isPending)}
                  onVenueArrivalComplete={handleVenueArrivalComplete}
                  onReady={mobilePrototype ? handleMobilePreparedMapReady : undefined}
                  className="h-full w-full"
                />
              </React.Suspense>
            ) : null}
          </div>

          {graphicsCapability !== 'unsupported' && runtimeState !== 'ready' && surfaceMode === 'globe' ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/35">
              <div className="rounded-lg border border-gray-800 bg-black/80 px-4 py-3 text-sm text-gray-300 shadow-xl">
                {runtimeState === 'loading'
                  ? 'Loading Globe V1'
                  : runtimeState === 'recovering'
                    ? 'Restoring the globe…'
                    : `Globe failed to load: ${runtimeError ?? 'Unknown error'}`}
              </div>
            </div>
          ) : null}

          <GlobeStageOverlays
            variant="fullBleed"
            stats={globeStats}
            onCenter={returnToWorld}
            onZoomIn={() => {
              const snapshot = globeRef.current?.getNavigationSnapshot();
              if (!snapshot) return;
              globeRef.current?.setNavigationPose({
                lng: snapshot.lng,
                lat: snapshot.lat,
                zoomIntent: Math.min(1, snapshot.zoomIntent + 0.12),
              });
            }}
            onZoomOut={() => {
              const snapshot = globeRef.current?.getNavigationSnapshot();
              if (!snapshot) return;
              globeRef.current?.setNavigationPose({
                lng: snapshot.lng,
                lat: snapshot.lat,
                zoomIntent: Math.max(0, snapshot.zoomIntent - 0.12),
              });
            }}
            onWorld={returnToWorld}
          />

          {showLocalViewHint ? (
            <div className="pointer-events-none absolute bottom-[5.7rem] left-1/2 z-30 -translate-x-1/2 rounded-full border border-red-300/20 bg-black/58 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-red-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_50px_rgba(0,0,0,0.42)] backdrop-blur-[20px] backdrop-saturate-150">
              Click again to explore nearby
            </div>
          ) : null}
        </main>

        <MobileExplorerPrototype
          surfaceMode={surfaceMode}
          onSurfaceModeChange={setManualSurfaceMode}
          listings={discoveryRailListings}
          selectedListingId={detailListingId}
          activeRegionName={discoveryRailRegionName}
          searchText={searchText}
          onSearchTextChange={setSearchText}
          onSelectListing={selectListingFromRail}
          onNavigate={navigateInCurrentExperience}
          onRecenter={returnToWorld}
          onFilterChange={mobilePrototype ? (filter) => setListingTypes(filter === 'all' ? ['club', 'event'] : [filter]) : undefined}
          devMobileMode={mobilePrototype}
          entityIndex={entityIndex ?? undefined}
          isUpdating={mobileMapPreparing || discoveryRailIsUpdating}
        />

        <div className="pointer-events-none absolute inset-0 z-20 max-md:hidden">
          <div className="pointer-events-auto absolute bottom-[clamp(14px,1.8vh,20px)] left-[clamp(14px,1.25vw,22px)] top-[clamp(76px,9vh,84px)] w-[clamp(248px,17vw,292px)]">
            <ExplorerFilterPanel
              searchText={searchText}
              onSearchTextChange={setSearchText}
              listingTypes={listingTypes}
              onListingTypesChange={setListingTypes}
              selectedTags={selectedTags}
              onSelectedTagsChange={setSelectedTags}
              onOpenTutorial={() => window.dispatchEvent(new CustomEvent('swingsphere:open-globe-tour'))}
            />
          </div>

          <aside className={`pointer-events-auto absolute right-[clamp(14px,1.25vw,22px)] top-[clamp(76px,9vh,84px)] w-[clamp(320px,22vw,388px)] origin-top transition-[bottom,opacity,transform] duration-300 ease-out ${hasExplorerDetails ? 'bottom-[clamp(14px,1.8vh,20px)] translate-x-0 opacity-100' : 'pointer-events-none bottom-[clamp(184px,22vh,210px)] translate-x-4 opacity-0'}`} aria-label="Listing details">
            <ExplorerDetailsPanel
              mode="floating"
              onClose={closePanel}
              selectedListingId={detailListingId}
              selectedOrganizationId={selectedOrganizationId}
              listings={listings}
              organizations={organizations}
              entityIndex={entityIndex ?? undefined}
            />
          </aside>

          {selectedPrivateMapListing ? (
            <div
              className={`absolute bottom-[clamp(178px,22vh,202px)] flex justify-end transition-[right,opacity,transform] duration-200 ${hasExplorerDetails ? 'right-[clamp(350px,23.5vw,416px)]' : 'right-[clamp(72px,6vw,112px)]'}`}
              aria-live="polite"
            >
              <div className="ss-glass ss-glass--liquid flex max-w-[440px] items-center gap-2.5 rounded-full border border-red-300/20 bg-[rgba(10,12,16,0.82)] px-4 py-2 text-[12px] font-medium text-gray-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_14px_34px_rgba(0,0,0,0.38)] backdrop-blur-[18px]">
                <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-red-300" aria-hidden="true" />
                <span>
                  <strong className="font-semibold text-red-100">Private location</strong>
                  <span className="text-gray-400"> · Exact address shared with approved members or confirmed guests.</span>
                </span>
              </div>
            </div>
          ) : null}

          <div className={`pointer-events-auto absolute bottom-[clamp(14px,1.8vh,20px)] left-[clamp(278px,19vw,326px)] h-[clamp(154px,19vh,176px)] transition-[right] duration-200 ${hasExplorerDetails ? 'right-[clamp(350px,23.5vw,416px)]' : 'right-[clamp(72px,6vw,112px)]'}`}>
            <ExplorerNearbyCarousel
              listings={discoveryRailListings}
              selectedListingId={discoveryRailSelectedListingId}
              activeRegionName={discoveryRailRegionName}
              title={discoveryRailTitle}
              emptyMessage={discoveryRailEmptyMessage}
              distanceLabels={discoveryRailDistanceLabels}
              isUpdating={discoveryRailIsUpdating}
              onSelectListing={selectListingFromRail}
            />
          </div>
        </div>

        {hybridPrototype ? (
          <section className="pointer-events-auto absolute right-5 top-[84px] z-[90] max-h-[calc(100vh-110px)] w-[min(340px,calc(100vw-2.5rem))] overflow-y-auto rounded-2xl border border-white/12 bg-[rgba(7,9,13,0.9)] p-4 text-gray-100 shadow-2xl shadow-black/55 backdrop-blur-2xl">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-300">Deep globe prototype</p>
            <h2 className="mt-1 text-base font-black">Globe → state → city → Street View</h2>
            <p className="mt-2 text-xs leading-5 text-gray-400">Automatic flat-map handoff is disabled. The globe can now fly closer for regional and venue selection while California and San Francisco administrative boundaries progressively appear.</p>
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5">
                <span>Auto map handoff</span><strong className="text-gray-300">Off</strong>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5">
                <span>Region arrival</span><strong className="text-cyan-200">4.35</strong>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5">
                <span>Venue/city arrival</span><strong className="text-cyan-200">3.28</strong>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5">
                <span>Current surface</span><strong className={surfaceMode === 'globe' ? 'text-red-200' : 'text-cyan-200'}>{surfaceMode === 'globe' ? '3D globe' : 'Flat map'}</strong>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5">
                <span>Entity pin test</span><strong className="text-amber-200">Flat idle → hover stem</strong>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5">
                <span>Discovery beacon</span><strong className="text-gray-100">White hex + hex pulse</strong>
              </div>
              <label className="block">
                <span className="flex justify-between text-gray-300"><span>Discovery screen radius</span><strong>{hybridDiscoveryClusterRadius}px</strong></span>
                <input className="mt-1 w-full accent-red-500" type="range" min="36" max="90" step="2" value={hybridDiscoveryClusterRadius} onChange={(event) => setHybridDiscoveryClusterRadius(Number(event.target.value))} />
              </label>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5">
                <span>Adaptive cluster detail</span><strong className="text-cyan-200">z{hybridDiscoveryClusterZoom}</strong>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.045] px-3 py-2.5">
                <span>Coastline source</span><strong className="text-cyan-200">Physical GLB coast · straight-edge snap</strong>
              </div>

              <div className="rounded-xl border border-cyan-300/15 bg-cyan-400/[0.035] p-3">
                <div>
                  <strong className="block text-[11px] uppercase tracking-[0.12em] text-cyan-100">Geospatial alignment audit</strong>
                  <span className="mt-1 block text-[10px] leading-4 text-gray-500">Move each data layer independently against the fixed physical `land.glb` reference.</span>
                </div>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-2 text-[10px]">
                    <span className="font-semibold text-gray-300">Physical land GLB</span>
                    <strong className="text-white">Fixed · 0.00° / 0.00°</strong>
                  </div>

                  <HybridLayerCalibrationControls
                    title="Pins + WGS84 anchors"
                    description="Listing coordinates and calibration crosshairs"
                    state={hybridGeospatialCalibration.pins}
                    onChange={(next) => updateHybridGeospatialLayer('pins', next)}
                  />
                  <HybridLayerCalibrationControls
                    title="Authoritative GeoJSON"
                    description="Country fill and border masks from /geo/countries.json"
                    state={hybridGeospatialCalibration.countryGeoJson}
                    onChange={(next) => updateHybridGeospatialLayer('countryGeoJson', next)}
                  />
                  <HybridLayerCalibrationControls
                    title="Country ID / visual atlas"
                    description="Legacy country selection mask and visible atlas highlight"
                    state={hybridGeospatialCalibration.countryAtlas}
                    onChange={(next) => updateHybridGeospatialLayer('countryAtlas', next)}
                  />

                  <div className="rounded-lg border border-white/[0.08] bg-black/20 p-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">Comparison overlays</div>
                    <div className="mt-2 grid gap-2">
                      <HybridAuditToggle
                        label="Cyan GeoJSON borders + WGS84 anchors"
                        checked={hybridGeospatialAuditEnabled}
                        onChange={setHybridGeospatialAuditEnabled}
                      />
                      <HybridAuditToggle
                        label="Country ID texture"
                        checked={hybridAtlasAuditLayers.showCountryIdTexture}
                        onChange={(checked) => setHybridAtlasAuditLayers((current) => ({ ...current, showCountryIdTexture: checked }))}
                      />
                      <HybridAuditToggle
                        label="Visual country atlas"
                        checked={hybridAtlasAuditLayers.showVisualCountryAtlas}
                        onChange={(checked) => setHybridAtlasAuditLayers((current) => ({ ...current, showVisualCountryAtlas: checked }))}
                      />
                      <HybridAuditToggle
                        label="Selected-country mask"
                        checked={hybridAtlasAuditLayers.showCountryHighlightMask}
                        onChange={(checked) => setHybridAtlasAuditLayers((current) => ({ ...current, showCountryHighlightMask: checked }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={alignAllHybridLayers} className="rounded-lg border border-red-300/20 bg-red-400/[0.08] px-2 py-2 text-[9px] font-bold uppercase tracking-[0.08em] text-red-100 hover:bg-red-400/[0.13]">Set all +1.5°</button>
                    <button type="button" onClick={saveHybridGeospatialCalibration} className="rounded-lg border border-cyan-300/20 bg-cyan-400/10 px-2 py-2 text-[9px] font-bold uppercase tracking-[0.08em] text-cyan-100 hover:bg-cyan-400/15">Save</button>
                    <button type="button" onClick={resetHybridGeospatialCalibration} className="rounded-lg border border-white/10 bg-white/[0.035] px-2 py-2 text-[9px] font-bold uppercase tracking-[0.08em] text-gray-300 hover:bg-white/[0.07]">Reset</button>
                  </div>
                  {hybridGeospatialSaveNotice ? <div className="text-[10px] text-gray-500">{hybridGeospatialSaveNotice}</div> : null}
                  <div className="text-[10px] leading-4 text-gray-500">Verified baseline: pins +1.50° · GeoJSON 0.00° · atlas +1.50°. Anchors: San Francisco · New York · Miami · Paris · Milan · Tokyo · Sydney · Santiago · Cape Town.</div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-[11px] leading-4 text-gray-400">
                California appears at regional depth. San Francisco appears on a venue fly-in. Click Twist SF again after arrival to enter the Street View prototype.
              </div>
            </div>
          </section>
        ) : null}
        {devToolsEnabled && spatialDebugEnabled ? <SpatialDebugOverlay snapshot={spatialDebug} /> : null}
        {performanceToolsEnabled && GlobePerformancePanel ? (
          <React.Suspense fallback={null}>
            <GlobePerformancePanel
              snapshot={devPerformanceSnapshot}
              onResetQuality={resetAutomaticQuality}
            />
          </React.Suspense>
        ) : null}
        {devToolsEnabled ? (
          <>
            <button
              type="button"
              data-testid="globe-scale-calibration-toggle"
              onClick={() => setIsScaleCalibrationPanelOpen((current) => !current)}
              className="ss-glass ss-glass--liquid ss-glass--crimson ss-glass--interactive pointer-events-auto absolute right-6 top-[68px] z-[61] rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-red-100"
            >
              Scale Calibration
            </button>
            {isScaleCalibrationPanelOpen && GlobeScaleCalibrationPanel ? (
              <React.Suspense fallback={null}>
                <div className="pointer-events-auto absolute right-6 top-[132px] z-[60] w-[min(360px,calc(100vw-48px))]">
                  <GlobeScaleCalibrationPanel
                    value={globePresentation}
                    fixtureId={scaleFixtureId}
                    presets={GLOBE_PRESENTATION_PRESETS as Record<'current' | 'radiusOnly' | 'cameraOnly' | 'recommended', GlobePresentationConfig>}
                    onChange={setGlobePresentation}
                    onFixtureChange={setScaleFixtureId}
                    onFocusFixture={focusScaleCalibrationFixture}
                  />
                </div>
              </React.Suspense>
            ) : null}
            <button
              type="button"
              onClick={() => setHeroComposerEnabled((current) => !current)}
              className={[
                'ss-glass ss-glass--liquid pointer-events-auto absolute bottom-6 right-[5.5rem] z-50 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em]',
                heroComposerEnabled
                  ? 'border-red-400/60 bg-red-500/15 text-red-100'
                  : 'border-white/[0.08] bg-[rgba(8,10,14,0.68)] text-gray-300 hover:border-white/20',
              ].join(' ')}
            >
              Hero Camera Composer
            </button>
            {heroComposerEnabled ? (
              <>
                {showHeroGuides ? <HeroCompositionGuides /> : null}
                <div className="pointer-events-auto absolute bottom-24 right-6 z-50 w-[min(390px,calc(100vw-48px))]">
                  <HeroArrivalComposerPanel
                    profile={heroArrivalProfile}
                    presets={heroArrivalPresets}
                    selectedPresetId={selectedHeroPresetId}
                    snapshot={heroComposerSnapshot}
                    message={heroComposerMessage}
                    showGuides={showHeroGuides}
                    onShowGuidesChange={setShowHeroGuides}
                    onChange={setHeroArrivalProfile}
                    onManualEdit={() => setSelectedHeroPresetId('custom')}
                    onPreviewPreset={previewHeroArrivalPreset}
                    onApplyPreset={applySelectedHeroArrivalPreset}
                    onRevert={revertHeroArrivalPreset}
                    onSaveAsCustom={saveHeroArrivalAsCustom}
                    onReset={resetHeroArrivalConfig}
                    onSave={saveHeroArrivalConfig}
                    onCopy={copyHeroArrivalConfig}
                    onExport={exportHeroArrivalConfig}
                    onCapture={captureCurrentHeroCamera}
                  />
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`relative h-full min-h-0 overflow-hidden bg-[#050506] ${isHero ? 'pointer-events-none' : ''}`}>
      <div
        ref={containerRef}
        className={['absolute inset-0', isSurface ? 'pointer-events-auto' : 'pointer-events-none'].join(' ')}
        aria-label="SwingSphere Globe V1"
      />

      {variant === 'page' && runtimeState !== 'ready' ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/35">
          <div className="rounded-lg border border-gray-800 bg-black/80 px-4 py-3 text-sm text-gray-300 shadow-xl">
            {runtimeState === 'loading' ? 'Loading Globe V1' : `Globe failed to load: ${runtimeError ?? 'Unknown error'}`}
          </div>
        </div>
      ) : null}

      {variant === 'page' ? (
        <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-xs rounded-lg border border-gray-800 bg-black/70 px-4 py-3 shadow-xl backdrop-blur-md">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-300">Globe V1 Integration</p>
        <p className="mt-1 text-[11px] text-gray-500">Temporary mock listings: SF, LA, New York, London, Sydney.</p>
        </div>
      ) : null}

      {variant === 'page' ? (
        <div className="absolute bottom-4 left-4 z-20 w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border border-gray-800 bg-black/85 text-gray-200 shadow-2xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => setIsAtmospherePanelOpen((current) => !current)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-300"
          >
            <span>Atmosphere Tool</span>
            <span className="text-gray-500">{isAtmospherePanelOpen ? 'Hide' : 'Show'}</span>
          </button>
          {isAtmospherePanelOpen ? (
            <div className="max-h-[70vh] overflow-y-auto border-t border-gray-800 p-4">
              <AtmosphereShellControls
                title="Inner Shell"
                shell={atmosphereTool.atmosphere.inner}
                onChange={(key, value) => updateShellValue('inner', key, value)}
              />
              <AtmosphereShellControls
                title="Outer Shell"
                shell={atmosphereTool.atmosphere.outer}
                onChange={(key, value) => updateShellValue('outer', key, value)}
              />
              <NumberControl
                label="Rim radius"
                value={atmosphereTool.crimsonRim.radius}
                min={0.82}
                max={1.12}
                step={0.001}
                onChange={updateRimRadius}
              />
              <pre className="mt-4 max-h-40 overflow-auto rounded-md border border-gray-800 bg-black/70 p-3 text-[11px] leading-4 text-gray-400">
                {formatAtmosphereSnippet(atmosphereTool)}
              </pre>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={copyAtmosphereConfig}
                  className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20"
                >
                  Copy Config
                </button>
                <button
                  type="button"
                  onClick={() => setAtmosphereTool(defaultAtmosphereToolState)}
                  className="rounded-md border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-gray-800"
                >
                  Reset
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {variant === 'page' ? (
        <ExplorerDetailsPanel
          onClose={closePanel}
          selectedListingId={detailListingId}
          selectedOrganizationId={selectedOrganizationId}
          listings={listings}
          organizations={organizations}
          entityIndex={entityIndex ?? undefined}
        />
      ) : null}
    </div>
  );
};

export default ProductionGlobePage;

const GraphicsFallback: React.FC<{
  listings: Listing[];
  onSelect: (listingId: string) => void;
}> = ({ listings, onSelect }) => (
  <section
    className="absolute inset-0 z-[4] flex items-center justify-center px-6 py-20"
    aria-labelledby="graphics-fallback-title"
  >
    <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[rgba(8,10,14,0.9)] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.55)] sm:p-8">
      <div className="flex items-start gap-4">
        <div className="rounded-xl border border-red-300/20 bg-red-500/10 p-3 text-red-200">
          <Globe2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-red-300/80">Directory mode</p>
          <h1 id="graphics-fallback-title" className="mt-2 text-xl font-semibold text-white sm:text-2xl">
            Explore SwingSphere without the 3D globe
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-gray-400">
            WebGL 2 is unavailable or hardware acceleration is disabled. Search and open listings here while the immersive view is unavailable.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {listings.slice(0, 8).map((listing) => (
          <button
            key={listing.id}
            type="button"
            onClick={() => onSelect(listing.id)}
            className="group flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.035] px-4 py-3 text-left transition-colors hover:border-red-300/25 hover:bg-red-500/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
          >
            <MapPin className="h-4 w-4 shrink-0 text-red-300/75" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-gray-100">{listing.name}</span>
              <span className="block truncate text-xs text-gray-500">{listing.location}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  </section>
);

const shellControls: Array<{
  key: keyof AtmosphereShell;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'radius', label: 'radius', min: 0.82, max: 1.12, step: 0.001 },
  { key: 'opacity', label: 'opacity', min: 0, max: 0.25, step: 0.001 },
  { key: 'crimsonIntensity', label: 'crimsonIntensity', min: 0, max: 3, step: 0.001 },
  { key: 'graphiteIntensity', label: 'graphiteIntensity', min: 0, max: 3, step: 0.001 },
  { key: 'fresnelPower', label: 'fresnelPower', min: 0.1, max: 10, step: 0.001 },
  { key: 'horizonFalloff', label: 'horizonFalloff', min: 0.1, max: 3, step: 0.001 },
];

const AtmosphereShellControls: React.FC<{
  title: string;
  shell: AtmosphereShell;
  onChange: (key: keyof AtmosphereShell, value: number) => void;
}> = ({ title, shell, onChange }) => (
  <section className="mb-4">
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
    <div className="space-y-2">
      {shellControls.map((control) => (
        <NumberControl
          key={control.key}
          label={control.label}
          value={shell[control.key]}
          min={control.min}
          max={control.max}
          step={control.step}
          onChange={(value) => onChange(control.key, value)}
        />
      ))}
    </div>
  </section>
);

const HeroArrivalComposerPanel: React.FC<{
  profile: HeroArrivalProfile;
  presets: HeroArrivalPreset[];
  selectedPresetId: string;
  snapshot: HeroComposerSnapshot | null;
  message: string | null;
  showGuides: boolean;
  onShowGuidesChange: (show: boolean) => void;
  onChange: React.Dispatch<React.SetStateAction<HeroArrivalProfile>>;
  onManualEdit: () => void;
  onPreviewPreset: (preset: HeroArrivalPreset) => void;
  onApplyPreset: () => void;
  onRevert: () => void;
  onSaveAsCustom: () => void;
  onReset: () => void;
  onSave: () => void;
  onCopy: () => void;
  onExport: () => void;
  onCapture: () => void;
}> = ({
  profile,
  presets,
  selectedPresetId,
  snapshot,
  message,
  showGuides,
  onShowGuidesChange,
  onChange,
  onManualEdit,
  onPreviewPreset,
  onApplyPreset,
  onRevert,
  onSaveAsCustom,
  onReset,
  onSave,
  onCopy,
  onExport,
  onCapture,
}) => {
  const update = <K extends keyof HeroArrivalProfile>(key: K, value: HeroArrivalProfile[K]) => {
    onManualEdit();
    onChange((current) => ({ ...current, [key]: value }));
  };
  const updateComposition = <K extends keyof HeroArrivalProfile['heroComposition']>(
    key: K,
    value: HeroArrivalProfile['heroComposition'][K],
  ) => {
    onManualEdit();
    onChange((current) => ({
      ...current,
      heroComposition: {
        ...current.heroComposition,
        [key]: value,
      },
    }));
  };
  const updateStage = <K extends keyof HeroArrivalProfile['heroStage']>(
    key: K,
    value: HeroArrivalProfile['heroStage'][K],
  ) => {
    onManualEdit();
    onChange((current) => ({
      ...current,
      heroStage: {
        ...current.heroStage,
        [key]: value,
      },
    }));
  };

  return (
    <section className="max-h-[calc(100vh-150px)] overflow-y-auto rounded-2xl border border-white/[0.1] bg-[rgba(8,10,14,0.74)] p-4 text-gray-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_30px_90px_rgba(0,0,0,0.55)] backdrop-blur-[28px] backdrop-saturate-150">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-red-300">Hero Arrival Composer</h2>
          <p className="mt-1 text-[11px] leading-4 text-gray-400">Select a destination, compose the final globe shot, then save the profile.</p>
        </div>
        <ToggleControl label="Guides" checked={showGuides} onChange={onShowGuidesChange} />
      </div>

      <section className="border-t border-white/[0.08] pt-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Presets</h3>
          <span className="text-[10px] uppercase tracking-wide text-gray-500">Click to preview</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onPreviewPreset(preset)}
              className={[
                'rounded-lg border p-2 text-left transition-colors',
                selectedPresetId === preset.id
                  ? 'border-red-300/60 bg-red-500/15 text-red-50 shadow-[0_0_26px_rgba(239,68,68,0.12)]'
                  : 'border-white/[0.08] bg-black/25 text-gray-300 hover:border-white/18 hover:bg-white/[0.05]',
              ].join(' ')}
            >
              <span className="block text-[11px] font-bold uppercase tracking-wide">{preset.name}</span>
              <span className="mt-1 block text-[10px] leading-4 text-gray-500">{preset.description}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button type="button" onClick={onApplyPreset} className="rounded-md border border-red-400/50 bg-red-500/12 px-2 py-2 text-[11px] font-semibold text-red-100 hover:bg-red-500/20">Apply Preset</button>
          <button type="button" onClick={onRevert} className="rounded-md border border-white/[0.1] bg-black/35 px-2 py-2 text-[11px] font-semibold text-gray-200 hover:bg-white/[0.06]">Revert</button>
          <button type="button" onClick={onSaveAsCustom} className="rounded-md border border-white/[0.1] bg-black/35 px-2 py-2 text-[11px] font-semibold text-gray-200 hover:bg-white/[0.06]">Save Custom</button>
        </div>
      </section>

      <div className="space-y-2 border-t border-white/[0.08] pt-3">
        <label className="grid grid-cols-[7rem_1fr] items-center gap-2 text-[11px] text-gray-400">
          <span>Camera Mode</span>
          <select
            value={profile.mode}
            onChange={(event) => update('mode', event.target.value as HeroArrivalProfile['mode'])}
            className="h-8 rounded border border-gray-700 bg-black/50 px-2 text-gray-200"
          >
            <option value="destinationTilt">Destination Tilt Camera</option>
            <option value="legacy">Legacy Camera</option>
          </select>
        </label>
        {profile.mode === 'destinationTilt' ? (
          <>
            <NumberControl label="Distance" value={profile.heroStage.distance} min={3.4} max={12} step={0.01} onChange={(value) => updateStage('distance', value)} />
            <NumberControl label="Tilt Degrees" value={profile.heroStage.tiltDegrees} min={-45} max={45} step={0.25} onChange={(value) => updateStage('tiltDegrees', value)} />
            <NumberControl label="Heading Deg" value={profile.heroStage.headingDegrees} min={-180} max={180} step={0.5} onChange={(value) => updateStage('headingDegrees', value)} />
            <NumberControl label="Globe X" value={profile.heroStage.globeScreenX} min={0.1} max={0.9} step={0.005} onChange={(value) => updateStage('globeScreenX', value)} />
            <NumberControl label="Globe Y" value={profile.heroStage.globeScreenY} min={0.1} max={0.9} step={0.005} onChange={(value) => updateStage('globeScreenY', value)} />
            <NumberControl label="Label X" value={profile.heroStage.labelAnchorX} min={0.1} max={0.9} step={0.005} onChange={(value) => updateStage('labelAnchorX', value)} />
            <NumberControl label="Label Y" value={profile.heroStage.labelAnchorY} min={0.1} max={0.9} step={0.005} onChange={(value) => updateStage('labelAnchorY', value)} />
          </>
        ) : (
          <>
            <NumberControl label="Camera Distance" value={profile.centerDistance} min={3.4} max={12} step={0.01} onChange={(value) => update('centerDistance', value)} />
            <NumberControl label="Pitch / Vertical" value={profile.tangentOffset} min={-1.2} max={1.2} step={0.005} onChange={(value) => update('tangentOffset', value)} />
            <NumberControl label="Yaw Offset" value={profile.sideOffset} min={-1.2} max={1.2} step={0.005} onChange={(value) => update('sideOffset', value)} />
            <NumberControl label="Horizontal Offset" value={profile.horizontalOffset} min={-0.75} max={0.75} step={0.005} onChange={(value) => update('horizontalOffset', value)} />
            <NumberControl label="Vertical Offset" value={profile.verticalOffset} min={-2} max={2} step={0.005} onChange={(value) => update('verticalOffset', value)} />
            <NumberControl label="Look-at Offset" value={profile.lookAtOffset} min={-0.75} max={0.75} step={0.005} onChange={(value) => update('lookAtOffset', value)} />
            <NumberControl label="Horizon Bias" value={profile.horizonBias} min={-0.75} max={0.75} step={0.005} onChange={(value) => update('horizonBias', value)} />
            <NumberControl label="Screen X" value={profile.destinationScreenX} min={0.1} max={0.9} step={0.005} onChange={(value) => update('destinationScreenX', value)} />
            <NumberControl label="Screen Y" value={profile.destinationScreenY} min={0.1} max={0.9} step={0.005} onChange={(value) => update('destinationScreenY', value)} />
          </>
        )}
        <NumberControl label="Field of View" value={profile.fov} min={25} max={70} step={0.25} onChange={(value) => update('fov', value)} />
        <NumberControl label="Arrival Duration" value={profile.durationMs} min={400} max={4500} step={25} onChange={(value) => update('durationMs', value)} />
        <label className="grid grid-cols-[7rem_1fr] items-center gap-2 text-[11px] text-gray-400">
          <span>Arrival Ease</span>
          <select
            value={profile.ease}
            onChange={(event) => update('ease', event.target.value as HeroArrivalProfile['ease'])}
            className="h-8 rounded border border-gray-700 bg-black/50 px-2 text-gray-200"
          >
            <option value="cinematic">cinematic</option>
            <option value="cubic">cubic</option>
            <option value="smooth">smooth</option>
          </select>
        </label>
      </div>

      <div className="mt-3 space-y-2 border-t border-white/[0.08] pt-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Hero Composition</h3>
          <span className="text-[10px] uppercase tracking-wide text-gray-500">Label-centered</span>
        </div>
        <NumberControl label="Anchor X" value={profile.heroComposition.anchorX} min={0.1} max={0.9} step={0.005} onChange={(value) => updateComposition('anchorX', value)} />
        <NumberControl label="Anchor Y" value={profile.heroComposition.anchorY} min={0.1} max={0.9} step={0.005} onChange={(value) => updateComposition('anchorY', value)} />
        <NumberControl label="Tolerance px" value={profile.heroComposition.tolerancePx} min={1} max={20} step={1} onChange={(value) => updateComposition('tolerancePx', value)} />
        <NumberControl label="Max Correction" value={profile.heroComposition.maxCorrectionDegrees} min={0} max={20} step={0.5} onChange={(value) => updateComposition('maxCorrectionDegrees', value)} />
        <label className="grid grid-cols-[7rem_1fr] items-center gap-2 text-[11px] text-gray-400">
          <span>Subject</span>
          <select
            value={profile.heroComposition.subject}
            onChange={(event) => updateComposition('subject', event.target.value as HeroArrivalProfile['heroComposition']['subject'])}
            className="h-8 rounded border border-gray-700 bg-black/50 px-2 text-gray-200"
          >
            <option value="label">label</option>
            <option value="pin">pin</option>
          </select>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onCapture} className="rounded-md border border-red-400/50 bg-red-500/12 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-red-100 hover:bg-red-500/20">Capture Current Camera</button>
        <button type="button" onClick={onSave} className="rounded-md border border-white/[0.1] bg-white/[0.06] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-100 hover:bg-white/[0.1]">Save Hero Profile</button>
        <button type="button" onClick={onCopy} className="rounded-md border border-white/[0.1] bg-black/35 px-3 py-2 text-[11px] font-semibold text-gray-200 hover:bg-white/[0.06]">Copy JSON</button>
        <button type="button" onClick={onExport} className="rounded-md border border-white/[0.1] bg-black/35 px-3 py-2 text-[11px] font-semibold text-gray-200 hover:bg-white/[0.06]">Export JSON</button>
        <button type="button" onClick={onReset} className="col-span-2 rounded-md border border-white/[0.1] bg-black/35 px-3 py-2 text-[11px] font-semibold text-gray-300 hover:bg-white/[0.06]">Reset</button>
      </div>

      {message ? <p className="mt-3 rounded-md border border-white/[0.08] bg-black/30 px-3 py-2 text-[11px] text-gray-300">{message}</p> : null}

      <HeroArrivalDebug snapshot={snapshot} profile={profile} />
    </section>
  );
};

const HeroArrivalDebug: React.FC<{
  snapshot: HeroComposerSnapshot | null;
  profile: HeroArrivalProfile;
}> = ({ snapshot, profile }) => (
  <section className="mt-4 border-t border-white/[0.08] pt-3">
    <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Debug Info</h3>
    <div className="space-y-2 text-[11px] text-gray-400">
      <InspectorBlock
        title="Live Camera"
        rows={[
          ['Position', snapshot?.cameraPosition.map((value) => value.toFixed(2)).join(', ') ?? 'n/a'],
          ['Distance', snapshot ? snapshot.cameraDistance.toFixed(2) : 'n/a'],
          ['Pitch', snapshot ? `${snapshot.pitch.toFixed(2)} deg` : 'n/a'],
          ['Yaw', snapshot ? `${snapshot.yaw.toFixed(2)} deg` : 'n/a'],
          ['FOV', snapshot ? snapshot.fov.toFixed(2) : profile.fov.toFixed(2)],
          ['Screen', snapshot?.targetScreenPosition ? `${Math.round(snapshot.targetScreenPosition.x * 100)}%, ${Math.round(snapshot.targetScreenPosition.y * 100)}%` : 'select destination'],
          ['Orbit Target', snapshot?.orbitTarget.map((value) => value.toFixed(2)).join(', ') ?? 'n/a'],
        ]}
      />
    </div>
    <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-white/[0.08] bg-black/60 p-2.5 text-[10px] leading-4 text-gray-400">
      {formatHeroArrivalSnippet(profile)}
    </pre>
  </section>
);

const HeroCompositionGuides: React.FC = () => (
  <div className="pointer-events-none absolute inset-0 z-40">
    <div className="absolute left-1/3 top-0 h-full w-px bg-white/10" />
    <div className="absolute left-2/3 top-0 h-full w-px bg-white/10" />
    <div className="absolute left-0 top-1/3 h-px w-full bg-white/10" />
    <div className="absolute left-0 top-2/3 h-px w-full bg-white/10" />
    <div className="absolute left-1/2 top-0 h-full w-px bg-red-300/18" />
    <div className="absolute left-0 top-1/2 h-px w-full bg-red-300/18" />
    <div className="absolute inset-x-[8%] inset-y-[12%] rounded-[2rem] border border-white/10" />
  </div>
);

const HybridLayerCalibrationControls: React.FC<{
  title: string;
  description: string;
  state: GeospatialLayerCalibration;
  onChange: (state: GeospatialLayerCalibration) => void;
}> = ({ title, description, state, onChange }) => (
  <section className="rounded-lg border border-white/[0.08] bg-black/20 p-2.5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-300">{title}</h3>
        <p className="mt-0.5 text-[9px] leading-4 text-gray-500">{description}</p>
      </div>
      <span className="shrink-0 text-[9px] font-semibold text-cyan-200">
        {state.longitudeOffsetDeg.toFixed(2)}° / {state.latitudeOffsetDeg.toFixed(2)}°
      </span>
    </div>
    <label className="mt-2 block">
      <span className="flex justify-between text-[9px] text-gray-400">
        <span>Longitude</span>
        <strong className="text-gray-200">{state.longitudeOffsetDeg.toFixed(2)}°</strong>
      </span>
      <input
        className="mt-1 w-full accent-cyan-400"
        type="range"
        min="-12"
        max="12"
        step="0.05"
        value={state.longitudeOffsetDeg}
        onChange={(event) => onChange({ ...state, longitudeOffsetDeg: Number(event.target.value) })}
      />
    </label>
    <label className="mt-2 block">
      <span className="flex justify-between text-[9px] text-gray-400">
        <span>Latitude</span>
        <strong className="text-gray-200">{state.latitudeOffsetDeg.toFixed(2)}°</strong>
      </span>
      <input
        className="mt-1 w-full accent-cyan-400"
        type="range"
        min="-5"
        max="5"
        step="0.05"
        value={state.latitudeOffsetDeg}
        onChange={(event) => onChange({ ...state, latitudeOffsetDeg: Number(event.target.value) })}
      />
    </label>
  </section>
);

const HybridAuditToggle: React.FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <label className="flex min-h-7 cursor-pointer items-center justify-between gap-3 rounded-md px-1 text-[9px] text-gray-400 transition hover:bg-white/[0.035] hover:text-gray-200">
    <span>{label}</span>
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="h-3.5 w-3.5 shrink-0 accent-cyan-400"
    />
  </label>
);

const GlobeAlignmentDebugPanel: React.FC<{
  state: AlignmentDebugState;
  onChange: React.Dispatch<React.SetStateAction<AlignmentDebugState>>;
  onCopy: () => void;
  onSave: () => void;
  onReset: () => void;
  pinHover: PinHoverDebug | null;
  globeHover: GlobeHoverDebug | null;
}> = ({ state, onChange, onCopy, onSave, onReset, pinHover, globeHover }) => (
  <section className="max-h-[calc(100vh-120px)] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[rgba(8,10,14,0.72)] p-3.5 text-gray-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_70px_rgba(0,0,0,0.48)] backdrop-blur-[24px] backdrop-saturate-150">
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wide text-red-400">Globe Alignment Debug</h2>
        <p className="mt-0.5 text-[11px] text-gray-500">Temporary transform overrides</p>
      </div>
    </div>

    <div className="space-y-4">
      <LayerAlignmentControls
        title="Land"
        state={state.land}
        onChange={(next) => onChange((current) => ({ ...current, land: next }))}
      />
      <LayerAlignmentControls
        title="Country Atlas"
        state={state.countryAtlas}
        onChange={(next) => onChange((current) => ({ ...current, countryAtlas: next }))}
      />
      <PinAlignmentControls
        state={state.pins}
        onChange={(next) => onChange((current) => ({ ...current, pins: next }))}
      />
      <CameraTargetControls
        state={state.cameraTargets}
        onChange={(next) => onChange((current) => ({ ...current, cameraTargets: next }))}
      />

      <section className="border-t border-white/[0.08] pt-3">
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Visualization</h3>
        <div className="space-y-2">
          {(Object.keys(state.toggles) as Array<keyof AlignmentDebugToggles>).map((key) => (
            <ToggleControl
              key={key}
              label={key}
              checked={state.toggles[key]}
              onChange={(checked) => onChange((current) => ({
                ...current,
                toggles: { ...current.toggles, [key]: checked },
              }))}
            />
          ))}
        </div>
      </section>

      <section className="border-t border-white/[0.08] pt-3">
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Opacity</h3>
        <NumberControl
          label="ID opacity"
          value={state.opacity.countryIdTexture}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => onChange((current) => ({ ...current, opacity: { ...current.opacity, countryIdTexture: value } }))}
        />
        <NumberControl
          label="Atlas opacity"
          value={state.opacity.visualAtlas}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => onChange((current) => ({ ...current, opacity: { ...current.opacity, visualAtlas: value } }))}
        />
        <NumberControl
          label="Mask opacity"
          value={state.opacity.highlightMask}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => onChange((current) => ({ ...current, opacity: { ...current.opacity, highlightMask: value } }))}
        />
      </section>

      <AlignmentInspector pinHover={pinHover} globeHover={globeHover} />

      <div className="grid grid-cols-3 gap-2 border-t border-white/[0.08] pt-3">
        <button type="button" onClick={onCopy} className="rounded-md border border-red-500/50 bg-red-500/10 px-2 py-2 text-[11px] font-semibold text-red-200 hover:bg-red-500/20">Copy Config</button>
        <button type="button" onClick={onSave} className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-[11px] font-semibold text-gray-200 hover:bg-white/[0.08]">Save JSON</button>
        <button type="button" onClick={onReset} className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-2 text-[11px] font-semibold text-gray-300 hover:bg-white/[0.06]">Reset</button>
      </div>
    </div>

    <pre className="mt-3 max-h-36 overflow-auto rounded-md border border-white/[0.08] bg-black/60 p-2.5 text-[10px] leading-4 text-gray-400">
      {formatAlignmentSnippet(state)}
    </pre>
  </section>
);

const LayerAlignmentControls: React.FC<{
  title: string;
  state: LayerAlignmentState;
  onChange: (state: LayerAlignmentState) => void;
}> = ({ title, state, onChange }) => (
  <section className="border-t border-white/[0.08] pt-3 first:border-t-0 first:pt-0">
    <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{title}</h3>
    <div className="space-y-2">
      <SignControl label="longitudeSign" value={state.longitudeSign} onChange={(value) => onChange({ ...state, longitudeSign: value })} />
      <NumberControl label="lonOffset" value={state.longitudeOffsetDeg} min={-180} max={180} step={0.1} onChange={(value) => onChange({ ...state, longitudeOffsetDeg: value })} />
      <NumberControl label="latOffset" value={state.latitudeOffsetDeg} min={-90} max={90} step={0.1} onChange={(value) => onChange({ ...state, latitudeOffsetDeg: value })} />
      <ToggleControl label="flipU" checked={state.flipU} onChange={(checked) => onChange({ ...state, flipU: checked })} />
      <ToggleControl label="flipV" checked={state.flipV} onChange={(checked) => onChange({ ...state, flipV: checked })} />
    </div>
  </section>
);

const PinAlignmentControls: React.FC<{
  state: PinAlignmentState;
  onChange: (state: PinAlignmentState) => void;
}> = ({ state, onChange }) => (
  <section className="border-t border-white/[0.08] pt-3">
    <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Pins</h3>
    <div className="space-y-2">
      <SignControl label="longitudeSign" value={state.longitudeSign} onChange={(value) => onChange({ ...state, longitudeSign: value })} />
      <NumberControl label="lonOffset" value={state.longitudeOffsetDeg} min={-180} max={180} step={0.1} onChange={(value) => onChange({ ...state, longitudeOffsetDeg: value })} />
      <NumberControl label="latOffset" value={state.latitudeOffsetDeg} min={-90} max={90} step={0.1} onChange={(value) => onChange({ ...state, latitudeOffsetDeg: value })} />
      <SignControl label="latitudeSign" value={state.latitudeSign} onChange={(value) => onChange({ ...state, latitudeSign: value })} />
    </div>
  </section>
);

const CameraTargetControls: React.FC<{
  state: CameraTargetAlignmentState;
  onChange: (state: CameraTargetAlignmentState) => void;
}> = ({ state, onChange }) => (
  <section className="border-t border-white/[0.08] pt-3">
    <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Camera Targets</h3>
    <div className="space-y-2">
      <NumberControl label="lonOffset" value={state.longitudeOffsetDeg} min={-180} max={180} step={0.1} onChange={(value) => onChange({ ...state, longitudeOffsetDeg: value })} />
      <NumberControl label="latOffset" value={state.latitudeOffsetDeg} min={-90} max={90} step={0.1} onChange={(value) => onChange({ ...state, latitudeOffsetDeg: value })} />
    </div>
  </section>
);

const AlignmentInspector: React.FC<{
  pinHover: PinHoverDebug | null;
  globeHover: GlobeHoverDebug | null;
}> = ({ pinHover, globeHover }) => (
  <section className="border-t border-white/[0.08] pt-3">
    <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Inspector</h3>
    <div className="space-y-2 text-[11px] text-gray-400">
      <InspectorBlock
        title="Pin Hover"
        rows={pinHover ? [
          ['Event', pinHover.name],
          ['Lat/Lon', `${pinHover.lat.toFixed(4)}, ${pinHover.lon.toFixed(4)}`],
          ['ISO3', pinHover.countryIso3],
          ['World', pinHover.worldPosition ? pinHover.worldPosition.map((value) => value.toFixed(3)).join(', ') : 'n/a'],
        ] : [['Event', 'none']]}
      />
      <InspectorBlock
        title="Globe Hover"
        rows={globeHover ? [
          ['UV', globeHover.uv ? `${globeHover.uv.u.toFixed(4)}, ${globeHover.uv.v.toFixed(4)}` : 'n/a'],
          ['ID RGB', globeHover.rgb ? globeHover.rgb.join(', ') : 'n/a'],
          ['Country', globeHover.country?.name ?? globeHover.country?.iso3 ?? 'none'],
        ] : [['Country', 'none']]}
      />
    </div>
  </section>
);

const InspectorBlock: React.FC<{
  title: string;
  rows: Array<[string, string]>;
}> = ({ title, rows }) => (
  <div className="rounded-md border border-white/[0.08] bg-black/25 p-2">
    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">{title}</div>
    {rows.map(([label, value]) => (
      <div key={label} className="grid grid-cols-[4rem_1fr] gap-2">
        <span className="text-gray-500">{label}</span>
        <span className="truncate text-gray-300">{value}</span>
      </div>
    ))}
  </div>
);

const SignControl: React.FC<{
  label: string;
  value: 1 | -1;
  onChange: (value: 1 | -1) => void;
}> = ({ label, value, onChange }) => (
  <label className="grid grid-cols-[8.5rem_1fr] items-center gap-2 text-[11px] text-gray-400">
    <span>{label}</span>
    <select
      value={value}
      onChange={(event) => onChange(Number(event.target.value) as 1 | -1)}
      className="h-8 rounded border border-gray-700 bg-black/50 px-2 text-gray-200"
    >
      <option value={1}>1</option>
      <option value={-1}>-1</option>
    </select>
  </label>
);

const ToggleControl: React.FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <label className="flex h-8 items-center justify-between gap-3 rounded-md border border-white/[0.08] bg-black/25 px-2.5 text-[11px] text-gray-300">
    <span>{label}</span>
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 accent-red-500"
    />
  </label>
);

const NumberControl: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step, onChange }) => (
  <label className="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-2 text-[11px] text-gray-400">
    <span>{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full accent-red-500"
    />
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={Number(value.toFixed(3))}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full rounded border border-gray-700 bg-black/50 px-2 py-1 text-right text-gray-200"
    />
  </label>
);

const formatCoordinate = (value: number | null) => (value === null ? 'n/a' : value.toFixed(5));
const formatMeters = (value: number | null) => {
  if (value === null) return 'n/a';
  if (value >= 1000) return `${(value / 1000).toFixed(2)} km`;
  return `${Math.round(value)} m`;
};

const SpatialDebugOverlay: React.FC<{ snapshot: SpatialDebugSnapshot }> = ({ snapshot }) => (
  <div className="pointer-events-none absolute bottom-6 left-1/2 z-40 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-cyan-300/20 bg-black/75 p-3 text-[11px] leading-5 text-cyan-50 shadow-2xl shadow-black/45 backdrop-blur-md">
    <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
      <span className="font-semibold uppercase tracking-[0.2em] text-cyan-200">Spatial Debug</span>
      <span className="text-cyan-200/70">{snapshot.surfaceMode} / {snapshot.transitionProgress.toFixed(2)}</span>
    </div>
    <div className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1">
      <span className="text-cyan-200/60">canonical</span>
      <span>{formatCoordinate(snapshot.canonicalLat)}, {formatCoordinate(snapshot.canonicalLng)}</span>
      <span className="text-cyan-200/60">globe center</span>
      <span>{formatCoordinate(snapshot.globeLat)}, {formatCoordinate(snapshot.globeLng)}</span>
      <span className="text-cyan-200/60">camera dir</span>
      <span>{formatCoordinate(snapshot.globeCameraDirectionLat)}, {formatCoordinate(snapshot.globeCameraDirectionLng)}</span>
      <span className="text-cyan-200/60">map center</span>
      <span>{formatCoordinate(snapshot.mapLat)}, {formatCoordinate(snapshot.mapLng)}</span>
      <span className="text-cyan-200/60">source</span>
      <span>{snapshot.targetSource ?? 'n/a'}</span>
      <span className="text-cyan-200/60">delta</span>
      <span>{formatMeters(snapshot.deltaMeters)}</span>
    </div>
  </div>
);

const GlobeStageOverlays: React.FC<{
  variant?: 'docked' | 'fullBleed';
  stats?: { countryCount: number; cityCount: number; eventCount: number };
  onCenter?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onWorld?: () => void;
}> = ({
  variant = 'docked',
  stats = { countryCount: 0, cityCount: 0, eventCount: 0 },
  onCenter,
  onZoomIn,
  onZoomOut,
  onWorld,
}) => (
  <>
    <div className={`ss-glass ss-glass--liquid pointer-events-none absolute z-10 hidden w-[clamp(132px,9vw,154px)] overflow-hidden rounded-2xl px-3.5 py-3 text-gray-300 md:block ${variant === 'fullBleed' ? 'bottom-[calc(clamp(154px,19vh,176px)+32px)] left-[calc(clamp(14px,1.25vw,22px)+clamp(248px,17vw,292px)+16px)]' : 'bottom-20 left-5'}`}>
      <div className="flex items-center gap-2.5 border-b border-white/[0.08] pb-2.5">
        <Globe2 className="h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
        <div>
          <div className="text-base font-semibold leading-none text-white">{stats.countryCount}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-gray-500">Countries</div>
        </div>
      </div>
      <div className="flex items-center gap-2.5 border-b border-white/[0.08] py-2.5">
        <MapPin className="h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
        <div>
          <div className="text-base font-semibold leading-none text-white">{stats.cityCount}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-gray-500">Cities</div>
        </div>
      </div>
      <div className="flex items-center gap-2.5 pt-2.5">
        <CalendarDays className="h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
        <div>
          <div className="text-base font-semibold leading-none text-white">{stats.eventCount}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-gray-500">Events</div>
        </div>
      </div>
    </div>

    <div className={`pointer-events-none absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-8 text-sm text-gray-400 ${variant === 'fullBleed' ? 'bottom-8' : 'bottom-20'}`}>
      <span className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-gray-500" aria-hidden="true" />
        Drag to rotate
      </span>
      <span className="flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-gray-500" aria-hidden="true" />
        Scroll to zoom
      </span>
      <span className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-gray-500" aria-hidden="true" />
        Click on pins or countries
      </span>
    </div>

    <div className="pointer-events-auto absolute left-[calc(clamp(14px,1.25vw,22px)+clamp(248px,17vw,292px)+16px)] top-[clamp(76px,9vh,84px)] z-10 flex flex-col gap-2 max-md:hidden">
      {[
        { label: 'Center globe', icon: <Crosshair className="h-5 w-5" />, onClick: onCenter },
        { label: 'Zoom in', icon: <Plus className="h-5 w-5" />, onClick: onZoomIn },
        { label: 'Zoom out', icon: <Minus className="h-5 w-5" />, onClick: onZoomOut },
        { label: 'World view', icon: <Globe2 className="h-5 w-5" />, onClick: onWorld },
      ].map((control) => (
        <button
          key={control.label}
          type="button"
          onClick={control.onClick}
          className="ss-glass ss-glass--liquid ss-glass--interactive flex h-11 w-11 items-center justify-center rounded-xl text-gray-100"
          aria-label={control.label}
        >
          {control.icon}
        </button>
      ))}
    </div>
  </>
);
