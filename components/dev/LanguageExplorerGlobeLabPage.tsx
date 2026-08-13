import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, HelpCircle, Minus, Plus, RotateCcw, Search, X } from 'lucide-react';

type CountrySelection = {
  id?: string | number;
  iso2?: string;
  iso3?: string;
  name?: string;
};

type LabListing = {
  id: string;
  name: string;
  entityType: 'club' | 'event';
  lat: number;
  lon: number;
  city: string;
  countryIso2: string;
  countryIso3: string;
};

type NavigationSnapshot = {
  lng: number;
  lat: number;
  zoomIntent: number;
  distance?: number;
};

type CountryGeoJsonDiagnostics = {
  featureCount: number;
  maskNontransparentPixelCount: number;
  selectedCountryKey: string | null;
  hoveredCountryKey: string | null;
  matchedFeature: {
    matchedKey: string;
    name: string | null;
    iso2: string | null;
    iso3: string | null;
  } | null;
  textureWidth: number;
  textureHeight: number;
  dynamicTextureWidth: number;
  dynamicTextureHeight: number;
  flipY: boolean;
  longitudeSign: number;
  longitudeOffsetDeg: number;
  latitudeOffsetDeg: number;
  scale: number;
  renderOwner: string;
};

type GlobeRuntime = {
  mount: () => Promise<GlobeRuntime>;
  dispose: () => void;
  getNavigationSnapshot: () => NavigationSnapshot | null;
  setNavigationPose: (pose: NavigationSnapshot) => NavigationSnapshot | null;
  clearSelection: () => void;
  selectCountry: (countryIdOrIso: string) => CountrySelection | null;
  setCountrySelectionEventOnly: (enabled: boolean) => void;
  updateEvents: (events: LabListing[]) => void;
  updateVisibleEvents: (events: LabListing[]) => void;
  setCountryActivityCountries: (countries: string[]) => void;
  setCountryActivityEvents: (events: LabListing[]) => void;
  setDirectPinsVisible: (visible: boolean) => void;
  setCountryLayerVisibility: (config: {
    atlasHighlight?: boolean;
    geoJsonBorders?: boolean;
  }) => void;
  setCountryGeoJsonDiagnosticMode: (enabled: boolean) => void;
  setTransitionActive: (active: boolean) => void;
  setCountryVectorBorderVisible: (enabled: boolean) => void;
  setCountryVectorActivityVisible: (enabled: boolean) => void;
  updateCountryVectorActivitySettings: (settings: {
    enabled?: boolean;
    idle?: Record<string, unknown>;
    hover?: Record<string, unknown>;
  }) => void;
  updateCountryVectorBorderSettings: (settings: { coreWidth?: number; opacity?: number; glowWidth?: number; glowOpacity?: number; speed?: number; palette?: string[]; coreVisible?: boolean; glowVisible?: boolean; animationEnabled?: boolean }) => void;
  updateCountryGeoJsonStateStyles: (config: {
    baseOpacity?: number;
    activityRasterWidth?: number;
    activityBorderOpacity?: number;
    activityFillOpacity?: number;
    hoverRasterWidth?: number;
    hoverBorderOpacity?: number;
    hoverFillOpacity?: number;
  }) => void;
  updateCountryGeoJsonGlow: (config: {
    enabled?: boolean;
    coreThickness?: number;
    hazeWidth?: number;
    hazeStrength?: number;
    color?: string;
  }) => void;
  getCountryGeoJsonDiagnostics: () => CountryGeoJsonDiagnostics | null;
  getCountryVectorBorderDiagnostics: () => CountryVectorBorderDiagnostics | null;
  setCountryVectorBorderSourceMode: (mode: HybridSourceMode) => void;
  setLandCoastlineAuditLayers: (layers: Record<string, boolean>) => void;
  setHybridBorderAuditLayers: (layers: Record<string, boolean>) => void;
  setHybridBorderAuditSourceColors: (enabled: boolean) => void;
  updateAlignmentDebugConfig: (config: {
    toggles?: {
      showLandMesh?: boolean;
      showOceanMesh?: boolean;
      showCountryIdTexture?: boolean;
      showVisualCountryAtlas?: boolean;
      showCountryHighlightMask?: boolean;
    };
    countryAtlas?: {
      longitudeOffsetDeg?: number;
    };
    pins?: {
      longitudeSign?: number;
      longitudeOffsetDeg?: number;
      latitudeOffsetDeg?: number;
      latitudeSign?: number;
    };
    countryGeoJson?: {
      longitudeOffsetDeg?: number;
      latitudeOffsetDeg?: number;
      scale?: number;
    };
  }) => void;
};

type GlobePerformanceSnapshot = {
  averageFps?: number | null;
  averageFrameTimeMs?: number | null;
  recentWorstFrameTimeMs?: number | null;
  averageRenderCostMs?: number | null;
  drawCalls?: number;
  framePolicy?: string;
  targetFps?: number;
};

type CountryVectorBorderDiagnostics = {
  borderSource: string;
  hybridBorderVersion: number | null;
  coastlineAssetVersion: number | null;
  hybridAssetLoadDurationMs: number;
  renderedPointCount: number;
  linePathCount: number;
  totalBorderDrawCallCount: number;
  buildDurationMs: number;
  anchorRaycastCount: number;
  subdivisionCount: number;
  acceptedClearanceViolationCount: number;
  unsafeSegmentSplitCount: number;
  updateCallCount: number;
  colorUpdateCount: number;
  gpuColorBufferUploadCount: number;
  lastColorArrayAllocationBytes: number;
  averageUpdateDurationMs: number;
  averageColorUpdateDurationMs: number;
  maxColorUpdateDurationMs: number;
  gradientUniformUpdateCount: number;
  staticProgressBufferBytes: number;
  preparedCacheHitCount: number;
  preparedCacheMissCount: number;
  preparedCacheBytes: number;
  cacheHit: boolean;
  countrySwitchRaycastCount: number;
  generationDurationMs: number;
};

type HybridCountryManifestEntry = {
  status: 'generated' | 'structurally-valid' | 'visually-reviewed' | 'production-approved';
  ringCount: number;
  semanticIssueCount: number;
  physicalPathIds: string[];
};

type GlobeConstructor = new (
  container: HTMLElement,
  options: {
    events: unknown[];
    activityRegions: unknown[];
    config: Record<string, unknown>;
    onReady: () => void;
    onError: (error: unknown) => void;
    onCountryHover: (country: CountrySelection | null) => void;
    onCountrySelect: (country: CountrySelection | null) => void;
    onEventSelect: (event: LabListing | null) => void;
    onCountryGeoJsonDiagnostics: (diagnostics: CountryGeoJsonDiagnostics) => void;
    onPerformanceSnapshot: (snapshot: GlobePerformanceSnapshot) => void;
  },
) => GlobeRuntime;

type AtlasVersion = 'v3' | 'v4' | 'v5' | 'v6';
type HybridSourceMode = 'geojson' | 'coastline' | 'hybrid';

const BASE_ASSETS = {
  landModel: '/assets/globe/models/land.glb',
  oceanModel: '/assets/globe/models/ocean.glb',
  countryLookup: '/assets/globe/data/countryLookup.json',
};

const ATLAS_VERSIONS: Record<AtlasVersion, { label: string; countryIdTexture: string; visualCountryAtlas: string }> = {
  v3: {
    label: 'Current v3',
    countryIdTexture: '/assets/globe/textures/countryIdTexture.png',
    visualCountryAtlas: '/assets/globe/textures/visualCountryAtlas_v3.png',
  },
  v4: {
    label: 'Corrected v4',
    countryIdTexture: '/assets/globe/textures/countryIdTexture_v4.png',
    visualCountryAtlas: '/assets/globe/textures/visualCountryAtlas_v4.png',
  },
  v5: {
    label: 'Experimental v5 mosaic (8K)',
    countryIdTexture: '/assets/globe/textures/countryIdTexture.png',
    visualCountryAtlas: '/assets/globe/textures/visualCountryAtlas_v5.png',
  },
  v6: {
    label: 'Cleaned v6 (8K)',
    countryIdTexture: '/assets/globe/textures/countryIdTexture.png',
    visualCountryAtlas: '/assets/globe/textures/visualCountryAtlas_v6.png',
  },
};

const INITIAL_POSE: NavigationSnapshot = { lng: 8, lat: 18, zoomIntent: 0.2 };

const LAB_ACTIVITY_LISTINGS: LabListing[] = [
  { id: 'us-sf-club', name: 'San Francisco Club', entityType: 'club', lat: 37.7749, lon: -122.4194, city: 'San Francisco', countryIso2: 'US', countryIso3: 'USA' },
  { id: 'us-la-event', name: 'Los Angeles Event', entityType: 'event', lat: 34.0522, lon: -118.2437, city: 'Los Angeles', countryIso2: 'US', countryIso3: 'USA' },
  { id: 'us-ny-club', name: 'New York Club', entityType: 'club', lat: 40.7128, lon: -74.006, city: 'New York', countryIso2: 'US', countryIso3: 'USA' },
  { id: 'us-miami-event', name: 'Miami Test Pin', entityType: 'event', lat: 25.7617, lon: -80.1918, city: 'Miami', countryIso2: 'US', countryIso3: 'USA' },
  { id: 'jp-tokyo-club', name: 'Tokyo Club', entityType: 'club', lat: 35.6762, lon: 139.6503, city: 'Tokyo', countryIso2: 'JP', countryIso3: 'JPN' },
  { id: 'jp-osaka-event', name: 'Osaka Event', entityType: 'event', lat: 34.6937, lon: 135.5023, city: 'Osaka', countryIso2: 'JP', countryIso3: 'JPN' },
  { id: 'au-sydney-club', name: 'Sydney Club', entityType: 'club', lat: -33.8688, lon: 151.2093, city: 'Sydney', countryIso2: 'AU', countryIso3: 'AUS' },
  { id: 'au-melbourne-event', name: 'Melbourne Event', entityType: 'event', lat: -37.8136, lon: 144.9631, city: 'Melbourne', countryIso2: 'AU', countryIso3: 'AUS' },
  { id: 'br-sao-club', name: 'São Paulo Club', entityType: 'club', lat: -23.5505, lon: -46.6333, city: 'São Paulo', countryIso2: 'BR', countryIso3: 'BRA' },
  { id: 'br-rio-event', name: 'Rio Event', entityType: 'event', lat: -22.9068, lon: -43.1729, city: 'Rio de Janeiro', countryIso2: 'BR', countryIso3: 'BRA' },
  { id: 'nl-amsterdam-club', name: 'Amsterdam Club', entityType: 'club', lat: 52.3676, lon: 4.9041, city: 'Amsterdam', countryIso2: 'NL', countryIso3: 'NLD' },
  { id: 'mx-cdmx-event', name: 'Mexico City Event', entityType: 'event', lat: 19.4326, lon: -99.1332, city: 'Mexico City', countryIso2: 'MX', countryIso3: 'MEX' },
];

const LAB_ACTIVITY_COUNTRIES = [...new Set(LAB_ACTIVITY_LISTINGS.map((listing) => listing.countryIso3))];
const ALIGNMENT_STORAGE_KEY = 'swingsphere-language-explorer-alignment-v2';
const OUTLINE_STATE_STORAGE_KEY = 'swingsphere-language-explorer-outline-states-v1';
const VECTOR_TOOL_STORAGE_KEY = 'swingsphere-language-explorer-vector-tool-v1';
const ATLAS_AUDIT_REGIONS = [
  ['Alaska / Aleutians', 'USA', -153, 64, 0.42],
  ['Hawaii', 'USA', -157, 20.5, 0.58],
  ['Russia Far East', 'RUS', 165, 63, 0.38],
  ['U.S. / Canada mainland', 'USA', -104, 49, 0.46],
  ['Japan', 'JPN', 138, 37, 0.5],
  ['Australia / Tasmania', 'AUS', 136, -30, 0.38],
  ['Indonesia / Papua', 'IDN', 122, -3, 0.48],
  ['Malaysia / Singapore', 'MYS', 103, 3, 0.58],
  ['Philippines', 'PHL', 122, 12, 0.55],
  ['New Zealand', 'NZL', 173, -41, 0.5],
  ['Greenland / Arctic', 'GRL', -42, 72, 0.42],
  ['Madagascar', 'MDG', 47, -19, 0.5],
] as const;

const GEOJSON_CONTROL_COUNTRIES = [
  ['United States', 'USA', -98, 39],
  ['Brazil', 'BRA', -52, -10],
  ['Libya', 'LBY', 17, 27],
  ['Egypt', 'EGY', 30, 27],
  ['Nigeria', 'NGA', 8, 9],
  ['Saudi Arabia', 'SAU', 45, 24],
  ['India', 'IND', 79, 22],
  ['Australia', 'AUS', 134, -25],
] as const;

const HYBRID_BORDER_COUNTRIES = [
  ['Australia', 'AUS', 136, -28, 0.5],
  ['Madagascar', 'MDG', 47, -19, 0.58],
  ['United States lower 48', 'USA', -98, 38, 0.42],
  ['Brazil', 'BRA', -52, -13, 0.45],
  ['Canada', 'CAN', -105, 57, 0.34],
  ['Mexico', 'MEX', -102, 23, 0.48],
  ['Japan', 'JPN', 138, 37, 0.52],
  ['India', 'IND', 79, 22, 0.46],
  ['Indonesia', 'IDN', 118, -2, 0.42],
  ['South Africa', 'ZAF', 24, -29, 0.5],
  ['Colombia', 'COL', -74, 4, 0.55],
  ['Nicaragua', 'NIC', -85, 13, 0.65],
  ['Costa Rica', 'CRI', -84, 10, 0.7],
  ['Panama', 'PAN', -80, 9, 0.7],
  ['Ireland', 'IRL', -8, 53, 0.68],
  ['Denmark', 'DNK', 10, 56, 0.7],
  ['Sweden', 'SWE', 17, 62, 0.55],
  ['United Kingdom', 'GBR', -3, 55, 0.62],
  ['Netherlands', 'NLD', 5, 52, 0.75],
  ['Belgium', 'BEL', 4.5, 50.8, 0.76],
  ['Luxembourg', 'LUX', 6.1, 49.8, 0.82],
  ['Finland', 'FIN', 26, 64, 0.58],
  ['Norway', 'NOR', 10, 64, 0.52],
  ['Iran', 'IRN', 54, 32, 0.5],
  ['Pakistan', 'PAK', 69, 30, 0.55],
  ['Afghanistan', 'AFG', 66, 34, 0.58],
  ['Armenia', 'ARM', 45, 40, 0.75],
  ['TÃ¼rkiye', 'TUR', 35, 39, 0.55],
  ['Bulgaria', 'BGR', 25, 43, 0.68],
  ['Georgia', 'GEO', 43.5, 42, 0.72],
  ['Azerbaijan', 'AZE', 47.5, 40.5, 0.72],
  ['Spain', 'ESP', -4, 40, 0.62],
  ['Portugal', 'PRT', -8, 39.5, 0.72],
  ['France', 'FRA', 2, 46, 0.6],
  ['Greece', 'GRC', 22, 39, 0.67],
  ['Belize', 'BLZ', -88.5, 17.2, 0.76],
  ['Guatemala', 'GTM', -90.3, 15.5, 0.7],
  ['Honduras', 'HND', -86.5, 15, 0.7],
  ['El Salvador', 'SLV', -88.9, 13.8, 0.8],
  ['Venezuela', 'VEN', -66, 7, 0.55],
] as const;

const VECTOR_PERFORMANCE_COUNTRIES = [
  ['Australia', 'AUS', 134, -25],
  ['United States', 'USA', -98, 39],
  ['Brazil', 'BRA', -52, -10],
  ['India', 'IND', 79, 22],
  ['Japan', 'JPN', 138, 37],
  ['South Africa', 'ZAF', 24, -29],
  ['Russia', 'RUS', 90, 60],
] as const;

type SavedAlignment = {
  atlasLongitude: number;
  borderLongitude: number;
  borderLatitude: number;
  borderScale: number;
  pinLongitude: number;
  pinLatitude: number;
  showAtlas: boolean;
  showGeoJson: boolean;
};

type OutlineRasterState = {
  width: number;
  borderOpacity: number;
  fillOpacity: number;
};

type OutlineSelectedState = {
  coreWidth: number;
  glowWidth: number;
  glowOpacity: number;
  speed: number;
  coreVisible: boolean;
  glowVisible: boolean;
  animationEnabled: boolean;
};

type SavedOutlineStates = {
  idle: OutlineRasterState;
  hover: OutlineRasterState;
  selected: OutlineSelectedState;
};

type SavedVectorToolState = {
  showVectorActivity: boolean;
  showAllPreparedCountries?: boolean;
  showVectorBorder: boolean;
  showVisualAtlas: boolean;
  showAtlasHighlight: boolean;
  showGeoJsonFills: boolean;
  idle: Record<string, string | number | boolean>;
  hover: Record<string, string | number | boolean>;
  selected: Record<string, string | number | boolean>;
};

const readSavedVectorToolState = (): SavedVectorToolState | null => {
  try {
    const raw = window.localStorage.getItem(VECTOR_TOOL_STORAGE_KEY);
    return raw ? JSON.parse(raw) as SavedVectorToolState : null;
  } catch {
    return null;
  }
};

const DEFAULT_OUTLINE_STATES: SavedOutlineStates = {
  idle: { width: 2, borderOpacity: 0.52, fillOpacity: 0.035 },
  hover: { width: 1.25, borderOpacity: 0.82, fillOpacity: 0.12 },
  selected: { coreWidth: 2, glowWidth: 5.5, glowOpacity: 0.04, speed: 0.5, coreVisible: false, glowVisible: true, animationEnabled: true },
};

const readSavedOutlineStates = (): SavedOutlineStates | null => {
  try {
    const raw = window.localStorage.getItem(OUTLINE_STATE_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SavedOutlineStates>;
    const idle = value.idle;
    const hover = value.hover;
    const selected = value.selected;
    if (!idle || !hover || !selected) return null;
    if (![idle.width, idle.borderOpacity, idle.fillOpacity, hover.width, hover.borderOpacity, hover.fillOpacity, selected.coreWidth, selected.glowWidth, selected.glowOpacity, selected.speed].every(Number.isFinite)) return null;
    return {
      idle: { width: Number(idle.width), borderOpacity: Number(idle.borderOpacity), fillOpacity: Number(idle.fillOpacity) },
      hover: { width: Number(hover.width), borderOpacity: Number(hover.borderOpacity), fillOpacity: Number(hover.fillOpacity) },
      selected: {
        coreWidth: Number(selected.coreWidth), glowWidth: Number(selected.glowWidth), glowOpacity: Number(selected.glowOpacity), speed: Number(selected.speed),
        coreVisible: selected.coreVisible !== false, glowVisible: selected.glowVisible !== false, animationEnabled: selected.animationEnabled !== false,
      },
    };
  } catch {
    return null;
  }
};

const readSavedAlignment = (): SavedAlignment | null => {
  try {
    const raw = window.localStorage.getItem(ALIGNMENT_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SavedAlignment>;
    if (![value.atlasLongitude, value.borderLongitude, value.borderLatitude, value.borderScale].every(Number.isFinite)) return null;
    return {
      atlasLongitude: Number(value.atlasLongitude),
      borderLongitude: Number(value.borderLongitude),
      borderLatitude: Number(value.borderLatitude),
      borderScale: Number(value.borderScale),
      pinLongitude: Number.isFinite(value.pinLongitude) ? Number(value.pinLongitude) : 0,
      pinLatitude: Number.isFinite(value.pinLatitude) ? Number(value.pinLatitude) : 0,
      showAtlas: value.showAtlas !== false,
      showGeoJson: value.showGeoJson !== false,
    };
  } catch {
    return null;
  }
};

const LanguageExplorerGlobeLabPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<GlobeRuntime | null>(null);
  const pendingNavigationRef = useRef<NavigationSnapshot | null>(null);
  const pendingCountryIso3Ref = useRef<string | null>(null);
  const pinRevealTimerRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const hoverLabelRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [hoveredCountry, setHoveredCountry] = useState<CountrySelection | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountrySelection | null>(null);
  const [selectedListing, setSelectedListing] = useState<LabListing | null>(null);
  const [hybridManifestCountries, setHybridManifestCountries] = useState<Record<string, HybridCountryManifestEntry>>({});
  const [visibleListingCount, setVisibleListingCount] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const savedAlignmentRef = useRef<SavedAlignment | null>(typeof window === 'undefined' ? null : readSavedAlignment());
  const savedOutlineStatesRef = useRef<SavedOutlineStates | null>(typeof window === 'undefined' ? null : readSavedOutlineStates());
  const savedVectorToolRef = useRef<SavedVectorToolState | null>(typeof window === 'undefined' ? null : readSavedVectorToolState());
  const savedAlignment = savedAlignmentRef.current;
  const savedOutlineStates = savedOutlineStatesRef.current ?? DEFAULT_OUTLINE_STATES;
  const savedVectorTool = savedVectorToolRef.current;
  const [showSwingSphereSurface, setShowSwingSphereSurface] = useState(true);
  const [showAtlasHighlight, setShowAtlasHighlight] = useState(savedVectorTool?.showAtlasHighlight ?? false);
  const [showGeoJsonBorders, setShowGeoJsonBorders] = useState(savedAlignment?.showGeoJson ?? true);
  const [showGeoJsonFills, setShowGeoJsonFills] = useState(savedVectorTool?.showGeoJsonFills ?? true);
  const [showGeoJsonDiagnostics, setShowGeoJsonDiagnostics] = useState(false);
  const [showVectorBorder, setShowVectorBorder] = useState(savedVectorTool?.showVectorBorder ?? true);
  const [showVectorActivity, setShowVectorActivity] = useState(savedVectorTool?.showVectorActivity ?? true);
  const [showAllPreparedCountries, setShowAllPreparedCountries] = useState(savedVectorTool?.showAllPreparedCountries ?? false);
  const [inspectAllCountries, setInspectAllCountries] = useState(false);
  const [idleCoreColor, setIdleCoreColor] = useState(String(savedVectorTool?.idle.coreColor ?? '#d9dde2'));
  const [idleGlowColor, setIdleGlowColor] = useState(String(savedVectorTool?.idle.glowColor ?? '#ff465c'));
  const [idleGlowWidth, setIdleGlowWidth] = useState(Number(savedVectorTool?.idle.glowWidth ?? 5.5));
  const [idleGlowOpacity, setIdleGlowOpacity] = useState(Number(savedVectorTool?.idle.glowOpacity ?? 0.045));
  const [idleCoreVisible, setIdleCoreVisible] = useState(savedVectorTool?.idle.coreVisible !== false);
  const [idleGlowVisible, setIdleGlowVisible] = useState(savedVectorTool?.idle.glowVisible !== false);
  const [idlePulseEnabled, setIdlePulseEnabled] = useState(savedVectorTool?.idle.pulseEnabled !== false);
  const [idlePulseSpeed, setIdlePulseSpeed] = useState(Number(savedVectorTool?.idle.pulseSpeed ?? 0.24));
  const [hoverCoreColor, setHoverCoreColor] = useState(String(savedVectorTool?.hover.coreColor ?? '#f4f5f7'));
  const [hoverGlowColor, setHoverGlowColor] = useState(String(savedVectorTool?.hover.glowColor ?? '#ff465c'));
  const [hoverSweepColor, setHoverSweepColor] = useState(String(savedVectorTool?.hover.sweepColor ?? '#ffffff'));
  const [hoverGlowWidth, setHoverGlowWidth] = useState(Number(savedVectorTool?.hover.glowWidth ?? 8));
  const [hoverGlowOpacity, setHoverGlowOpacity] = useState(Number(savedVectorTool?.hover.glowOpacity ?? 0.12));
  const [hoverCoreVisible, setHoverCoreVisible] = useState(savedVectorTool?.hover.coreVisible !== false);
  const [hoverGlowVisible, setHoverGlowVisible] = useState(savedVectorTool?.hover.glowVisible !== false);
  const [hoverSweepEnabled, setHoverSweepEnabled] = useState(savedVectorTool?.hover.sweepEnabled !== false);
  const [hoverSweepWidth, setHoverSweepWidth] = useState(Number(savedVectorTool?.hover.sweepWidth ?? 0.22));
  const [hoverSweepStrength, setHoverSweepStrength] = useState(Number(savedVectorTool?.hover.sweepStrength ?? 0.9));
  const [hoverSweepSpeed, setHoverSweepSpeed] = useState(Number(savedVectorTool?.hover.sweepSpeed ?? 0.7));
  const [hoverSweepRepeat, setHoverSweepRepeat] = useState(savedVectorTool?.hover.sweepRepeat === true);
  const [selectedBaseColor, setSelectedBaseColor] = useState(String(savedVectorTool?.selected.baseColor ?? '#17181d'));
  const [selectedTravelColor, setSelectedTravelColor] = useState(String(savedVectorTool?.selected.travelColor ?? '#ff465c'));
  const [idleOutlineWidth, setIdleOutlineWidth] = useState(savedOutlineStates.idle.width);
  const [idleOutlineOpacity, setIdleOutlineOpacity] = useState(savedOutlineStates.idle.borderOpacity);
  const [idleFillOpacity, setIdleFillOpacity] = useState(savedOutlineStates.idle.fillOpacity);
  const [hoverOutlineWidth, setHoverOutlineWidth] = useState(savedOutlineStates.hover.width);
  const [hoverOutlineOpacity, setHoverOutlineOpacity] = useState(savedOutlineStates.hover.borderOpacity);
  const [hoverFillOpacity, setHoverFillOpacity] = useState(savedOutlineStates.hover.fillOpacity);
  const [vectorCoreWidth, setVectorCoreWidth] = useState(savedOutlineStates.selected.coreWidth);
  const [vectorCoreOpacity, setVectorCoreOpacity] = useState(Number(savedVectorTool?.selected.coreOpacity ?? 0.96));
  const [vectorGlowWidth, setVectorGlowWidth] = useState(savedOutlineStates.selected.glowWidth);
  const [vectorGlowOpacity, setVectorGlowOpacity] = useState(savedOutlineStates.selected.glowOpacity);
  const [vectorSpeed, setVectorSpeed] = useState(savedOutlineStates.selected.speed);
  const [vectorCoreVisible, setVectorCoreVisible] = useState(savedOutlineStates.selected.coreVisible);
  const [vectorGlowVisible, setVectorGlowVisible] = useState(savedOutlineStates.selected.glowVisible);
  const [vectorAnimationEnabled, setVectorAnimationEnabled] = useState(savedOutlineStates.selected.animationEnabled);
  const [outlineSaveNotice, setOutlineSaveNotice] = useState(savedOutlineStatesRef.current ? 'Saved outline states restored' : '');
  const [geoJsonGlowEnabled, setGeoJsonGlowEnabled] = useState(false);
  const [geoJsonGlowCoreThickness, setGeoJsonGlowCoreThickness] = useState(1.25);
  const [geoJsonGlowHazeWidth, setGeoJsonGlowHazeWidth] = useState(5);
  const [geoJsonGlowHazeStrength, setGeoJsonGlowHazeStrength] = useState(0.55);
  const [geoJsonGlowColor, setGeoJsonGlowColor] = useState('#ff465c');
  const [showCountryIdAtlas, setShowCountryIdAtlas] = useState(false);
  const [showVisualAtlas, setShowVisualAtlas] = useState(savedVectorTool?.showVisualAtlas ?? false);
  const [showHighlightMask, setShowHighlightMask] = useState(false);
  const [atlasVersion, setAtlasVersion] = useState<AtlasVersion>('v4');
  const [geoJsonDiagnostics, setGeoJsonDiagnostics] = useState<CountryGeoJsonDiagnostics | null>(null);
  const [countryAtlasLongitudeOffset, setCountryAtlasLongitudeOffset] = useState(savedAlignment?.atlasLongitude ?? 0);
  const [countryBorderLongitudeOffset, setCountryBorderLongitudeOffset] = useState(savedAlignment?.borderLongitude ?? 0);
  const [countryBorderLatitudeOffset, setCountryBorderLatitudeOffset] = useState(savedAlignment?.borderLatitude ?? 0);
  const [countryBorderScale, setCountryBorderScale] = useState(savedAlignment?.borderScale ?? 1);
  const [pinLongitudeOffset, setPinLongitudeOffset] = useState(savedAlignment?.pinLongitude ?? 0);
  const [pinLatitudeOffset, setPinLatitudeOffset] = useState(savedAlignment?.pinLatitude ?? 0);
  const [saveNotice, setSaveNotice] = useState(savedAlignment ? 'Saved alignment restored' : '');
  const [performanceSnapshot, setPerformanceSnapshot] = useState<GlobePerformanceSnapshot | null>(null);
  const [vectorDiagnostics, setVectorDiagnostics] = useState<CountryVectorBorderDiagnostics | null>(null);
  const [continuousProfiling, setContinuousProfiling] = useState(false);
  const [hybridSourceMode, setHybridSourceMode] = useState<HybridSourceMode>('hybrid');
  const [hybridSourceColors, setHybridSourceColors] = useState(true);
  const [hybridAuditLayers, setHybridAuditLayers] = useState({
    denseCoastline: false,
    simplifiedCoastline: false,
    politicalSegments: false,
    rejectedGeoJsonCoastline: false,
    assembled: false,
    junctions: false,
  });
  const [coastlineAuditLayers, setCoastlineAuditLayers] = useState({
    radialSilhouette: false,
    terrainWallRim: false,
    openEdges: false,
    nonManifoldEdges: false,
    rejectedInternalEdges: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetch('/assets/globe/borders/hybrid/v1/manifest.json')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Hybrid manifest ${response.status}`)))
      .then((manifest: { countries?: Record<string, HybridCountryManifestEntry> }) => {
        if (!cancelled) setHybridManifestCountries(manifest.countries ?? {});
      })
      .catch(() => {
        if (!cancelled) setHybridManifestCountries({});
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let mountedRuntime: GlobeRuntime | null = null;

    const mount = async () => {
      try {
        const module = await import('../../src/features/globe/runtime/index.js');
        if (cancelled || !containerRef.current) return;
        const SwingSphereGlobe = module.SwingSphereGlobe as GlobeConstructor;
        const atlasAssets = ATLAS_VERSIONS[atlasVersion];
        const runtime = new SwingSphereGlobe(containerRef.current, {
          events: [],
          activityRegions: [],
          config: {
            assets: {
              ...BASE_ASSETS,
              countryIdTexture: atlasAssets.countryIdTexture,
              visualCountryAtlas: atlasAssets.visualCountryAtlas,
            },
            renderer: { antialias: true, maxPixelRatio: 1.5 },
            selection: { enabledEventOnly: true, useSphereRaycast: true, highlightMaskSource: 'id', activeHitPaddingPixels: 5 },
            cameraFocus: { durationMs: 1150 },
            idleMotion: { idleRotationSpeed: 0 },
            landCoastlineAudit: {
              enabled: true,
              url: '/assets/globe/models/audit/land-coastline-diagnostics.json',
              layers: coastlineAuditLayers,
            },
            hybridCountryBorders: {
              enabled: true,
              manifestUrl: '/assets/globe/borders/hybrid/v1/manifest.json',
              sourceMode: hybridSourceMode,
            },
            hybridBorderAudit: {
              enabled: true,
              manifestUrl: '/assets/globe/borders/hybrid/v1/manifest.json',
              layers: hybridAuditLayers,
              sourceColors: hybridSourceColors,
            },
            countryVectorActivity: {
              enabled: true,
              manifestUrl: '/assets/globe/borders/hybrid/v1/manifest.json',
              radiusScale: 1.009,
              idle: {
                coreColor: idleCoreColor,
                glowColor: idleGlowColor,
                coreWidth: idleOutlineWidth,
                coreOpacity: idleOutlineOpacity,
                glowWidth: idleGlowWidth,
                glowOpacity: idleGlowOpacity,
                coreVisible: idleCoreVisible,
                glowVisible: idleGlowVisible,
                pulseEnabled: idlePulseEnabled,
                pulseSpeed: idlePulseSpeed,
              },
              hover: {
                coreColor: hoverCoreColor,
                glowColor: hoverGlowColor,
                sweepColor: hoverSweepColor,
                coreWidth: hoverOutlineWidth,
                coreOpacity: hoverOutlineOpacity,
                glowWidth: hoverGlowWidth,
                glowOpacity: hoverGlowOpacity,
                coreVisible: hoverCoreVisible,
                glowVisible: hoverGlowVisible,
                sweepEnabled: hoverSweepEnabled,
                sweepWidth: hoverSweepWidth,
                sweepStrength: hoverSweepStrength,
                sweepSpeed: hoverSweepSpeed,
                sweepRepeat: hoverSweepRepeat,
              },
            },
            countryVectorBorders: {
              enabled: true,
              url: '/geo/publicgeocountries-simplified-35.json',
              coreWidth: vectorCoreWidth,
              opacity: vectorCoreOpacity,
              glowWidth: vectorGlowWidth,
              glowOpacity: vectorGlowOpacity,
              speed: vectorSpeed,
              coreVisible: vectorCoreVisible,
              glowVisible: vectorGlowVisible,
              animationEnabled: vectorAnimationEnabled,
              hoverEnabled: false,
              palette: [selectedBaseColor, selectedBaseColor, selectedBaseColor, selectedBaseColor, selectedBaseColor, selectedBaseColor, selectedTravelColor, selectedTravelColor],
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
              hoverRasterWidth: hoverOutlineWidth,
              selectedRasterWidth: 1.75,
              baseOpacity: 0.035,
              hoverBorderOpacity: 0,
              selectedBorderOpacity: 0.56,
              hoverFillOpacity: hoverFillOpacity,
              selectedFillOpacity: 0.28,
              activityColor: '#e4e8ed',
              activityRasterWidth: idleOutlineWidth,
              activityBorderOpacity: 0,
              activityFillOpacity: idleFillOpacity,
              glowEnabled: false,
              glowCoreThickness: 1.25,
              glowHazeWidth: 5,
              glowHazeStrength: 0.55,
              glowColor: '#ff465c',
            },
            presentation: {
              globeScale: 1.04,
              camera: { fov: 42 },
            },
          },
          onReady: () => {
            if (cancelled) return;
            setStatus('ready');
            runtimeRef.current?.updateAlignmentDebugConfig({
              toggles: {
                showLandMesh: showSwingSphereSurface,
                showOceanMesh: showSwingSphereSurface,
                showCountryIdTexture: showCountryIdAtlas,
                showVisualCountryAtlas: showVisualAtlas,
                showCountryHighlightMask: showHighlightMask,
              },
              countryAtlas: { longitudeOffsetDeg: countryAtlasLongitudeOffset },
              pins: {
                longitudeOffsetDeg: pinLongitudeOffset,
                latitudeOffsetDeg: pinLatitudeOffset,
              },
              countryGeoJson: {
                longitudeOffsetDeg: countryBorderLongitudeOffset,
                latitudeOffsetDeg: countryBorderLatitudeOffset,
                scale: countryBorderScale,
              },
            });
            runtimeRef.current?.setCountryLayerVisibility({
              atlasHighlight: showAtlasHighlight,
              geoJsonBorders: true,
            });
            runtimeRef.current?.setCountryGeoJsonDiagnosticMode(showGeoJsonDiagnostics);
            runtimeRef.current?.setCountryVectorBorderVisible(showVectorBorder);
            runtimeRef.current?.setCountryVectorActivityVisible(showVectorActivity);
            runtimeRef.current?.setCountrySelectionEventOnly(!inspectAllCountries);
            runtimeRef.current?.updateCountryVectorActivitySettings({
              idle: {
                coreColor: idleCoreColor,
                glowColor: idleGlowColor,
                coreWidth: idleOutlineWidth,
                coreOpacity: idleOutlineOpacity,
                glowWidth: idleGlowWidth,
                glowOpacity: idleGlowOpacity,
                coreVisible: idleCoreVisible,
                glowVisible: idleGlowVisible,
                pulseEnabled: idlePulseEnabled,
                pulseSpeed: idlePulseSpeed,
              },
              hover: {
                coreColor: hoverCoreColor,
                glowColor: hoverGlowColor,
                sweepColor: hoverSweepColor,
                coreWidth: hoverOutlineWidth,
                coreOpacity: hoverOutlineOpacity,
                glowWidth: hoverGlowWidth,
                glowOpacity: hoverGlowOpacity,
                coreVisible: hoverCoreVisible,
                glowVisible: hoverGlowVisible,
                sweepEnabled: hoverSweepEnabled,
                sweepWidth: hoverSweepWidth,
                sweepStrength: hoverSweepStrength,
                sweepSpeed: hoverSweepSpeed,
                sweepRepeat: hoverSweepRepeat,
              },
            });
            runtimeRef.current?.setCountryVectorBorderSourceMode(hybridSourceMode);
            runtimeRef.current?.updateCountryGeoJsonStateStyles({
              baseOpacity: showGeoJsonBorders ? 0.18 : 0,
              activityRasterWidth: idleOutlineWidth,
              activityBorderOpacity: 0,
              activityFillOpacity: idleFillOpacity,
              hoverRasterWidth: hoverOutlineWidth,
              hoverBorderOpacity: 0,
              hoverFillOpacity: hoverFillOpacity,
            });
            runtimeRef.current?.updateCountryVectorBorderSettings({
              coreWidth: vectorCoreWidth,
              opacity: vectorCoreOpacity,
              glowWidth: vectorGlowWidth,
              glowOpacity: vectorGlowOpacity,
              speed: vectorSpeed,
              coreVisible: vectorCoreVisible,
              glowVisible: vectorGlowVisible,
              animationEnabled: vectorAnimationEnabled,
              palette: [selectedBaseColor, selectedBaseColor, selectedBaseColor, selectedBaseColor, selectedBaseColor, selectedBaseColor, selectedTravelColor, selectedTravelColor],
            });
            runtimeRef.current?.setLandCoastlineAuditLayers(coastlineAuditLayers);
            runtimeRef.current?.setHybridBorderAuditLayers(hybridAuditLayers);
            runtimeRef.current?.setHybridBorderAuditSourceColors(hybridSourceColors);
            runtimeRef.current?.updateCountryGeoJsonGlow({
              enabled: geoJsonGlowEnabled,
              coreThickness: geoJsonGlowCoreThickness,
              hazeWidth: geoJsonGlowHazeWidth,
              hazeStrength: geoJsonGlowHazeStrength,
              color: geoJsonGlowColor,
            });
            runtimeRef.current?.setCountryActivityCountries(LAB_ACTIVITY_COUNTRIES);
            runtimeRef.current?.setCountryActivityEvents(LAB_ACTIVITY_LISTINGS);
            runtimeRef.current?.updateVisibleEvents([]);
            runtimeRef.current?.setDirectPinsVisible(false);
            runtimeRef.current?.setNavigationPose(pendingNavigationRef.current ?? INITIAL_POSE);
            pendingNavigationRef.current = null;
            if (pendingCountryIso3Ref.current) {
              runtimeRef.current?.selectCountry(pendingCountryIso3Ref.current);
              pendingCountryIso3Ref.current = null;
            }
          },
          onError: (cause) => {
            if (cancelled) return;
            setStatus('error');
            setError(cause instanceof Error ? cause.message : String(cause));
          },
          onCountryHover: (country) => setHoveredCountry(country),
          onCountrySelect: (country) => {
            setSelectedCountry(country);
            setSelectedListing(null);
            setVisibleListingCount(0);
            runtimeRef.current?.updateVisibleEvents([]);
            runtimeRef.current?.setDirectPinsVisible(false);
            if (pinRevealTimerRef.current != null) window.clearTimeout(pinRevealTimerRef.current);
            const countryIso3 = String(country?.iso3 ?? '').toUpperCase();
            const listings = LAB_ACTIVITY_LISTINGS.filter((listing) => listing.countryIso3 === countryIso3);
            if (!listings.length) return;
            pinRevealTimerRef.current = window.setTimeout(() => {
              runtimeRef.current?.updateVisibleEvents(listings);
              runtimeRef.current?.setDirectPinsVisible(true);
              setVisibleListingCount(listings.length);
              pinRevealTimerRef.current = null;
            }, 1050);
          },
          onEventSelect: (event) => setSelectedListing(event),
          onCountryGeoJsonDiagnostics: (diagnostics) => setGeoJsonDiagnostics(diagnostics),
          onPerformanceSnapshot: (snapshot) => {
            setPerformanceSnapshot(snapshot);
            setVectorDiagnostics(runtimeRef.current?.getCountryVectorBorderDiagnostics() ?? null);
          },
        });
        mountedRuntime = runtime;
        runtimeRef.current = runtime;
        await runtime.mount();
      } catch (cause) {
        if (!cancelled) {
          setStatus('error');
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    };

    void mount();
    return () => {
      cancelled = true;
      if (pinRevealTimerRef.current != null) window.clearTimeout(pinRevealTimerRef.current);
      pinRevealTimerRef.current = null;
      mountedRuntime?.dispose();
      if (runtimeRef.current === mountedRuntime) runtimeRef.current = null;
    };
  }, [atlasVersion]);

  useEffect(() => {
    if (status !== 'ready' || !runtimeRef.current) return;
    let cancelled = false;
    runtimeRef.current.updateCountryGeoJsonStateStyles({
      baseOpacity: showGeoJsonBorders ? 0.18 : 0,
    });
    const applyCountryScope = async () => {
      if (!showAllPreparedCountries) {
        runtimeRef.current?.setCountryActivityCountries(LAB_ACTIVITY_COUNTRIES);
        return;
      }
      try {
        const response = await fetch('/assets/globe/borders/hybrid/v1/manifest.json');
        if (!response.ok) throw new Error(`Unable to load hybrid border manifest (${response.status})`);
        const manifest = await response.json() as { countries?: Record<string, unknown> };
        if (cancelled) return;
        runtimeRef.current?.setCountryActivityCountries(Object.keys(manifest.countries ?? {}));
      } catch (cause) {
        console.warn('[SwingSphere all-country border review]', cause);
        runtimeRef.current?.setCountryActivityCountries(LAB_ACTIVITY_COUNTRIES);
      }
    };
    void applyCountryScope();
    return () => { cancelled = true; };
  }, [showAllPreparedCountries, showGeoJsonBorders, status]);

  const changeAtlasVersion = (nextVersion: AtlasVersion) => {
    if (nextVersion === atlasVersion) return;
    pendingNavigationRef.current = runtimeRef.current?.getNavigationSnapshot() ?? INITIAL_POSE;
    pendingCountryIso3Ref.current = selectedCountry?.iso3 ?? null;
    setStatus('loading');
    setError('');
    setHoveredCountry(null);
    setAtlasVersion(nextVersion);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerRef.current.x = event.clientX - bounds.left;
    pointerRef.current.y = event.clientY - bounds.top;
    if (hoverLabelRef.current) {
      hoverLabelRef.current.style.transform = `translate3d(${pointerRef.current.x}px, ${pointerRef.current.y}px, 0) translate(-50%, calc(-100% - 18px))`;
    }
  };

  const adjustZoom = (amount: number) => {
    const runtime = runtimeRef.current;
    const snapshot = runtime?.getNavigationSnapshot();
    if (!runtime || !snapshot) return;
    runtime.setNavigationPose({ ...snapshot, zoomIntent: Math.max(-1, Math.min(1, snapshot.zoomIntent + amount)) });
  };

  const reset = () => {
    if (pinRevealTimerRef.current != null) window.clearTimeout(pinRevealTimerRef.current);
    pinRevealTimerRef.current = null;
    runtimeRef.current?.updateVisibleEvents([]);
    runtimeRef.current?.setDirectPinsVisible(false);
    runtimeRef.current?.clearSelection();
    runtimeRef.current?.setNavigationPose(INITIAL_POSE);
    setSelectedCountry(null);
    setSelectedListing(null);
    setVisibleListingCount(0);
  };

  const toggleSwingSphereSurface = () => {
    const nextVisible = !showSwingSphereSurface;
    runtimeRef.current?.updateAlignmentDebugConfig({
      toggles: {
        showLandMesh: nextVisible,
        showOceanMesh: nextVisible,
      },
    });
    setShowSwingSphereSurface(nextVisible);
  };

  const toggleAtlasHighlight = () => {
    const nextVisible = !showAtlasHighlight;
    runtimeRef.current?.setCountryLayerVisibility({ atlasHighlight: nextVisible });
    setShowAtlasHighlight(nextVisible);
  };

  const toggleGeoJsonBorders = () => {
    const nextVisible = !showGeoJsonBorders;
    runtimeRef.current?.setCountryLayerVisibility({ geoJsonBorders: true });
    runtimeRef.current?.updateCountryGeoJsonStateStyles({ baseOpacity: nextVisible ? 0.18 : 0 });
    setShowGeoJsonBorders(nextVisible);
  };

  const toggleGeoJsonFills = () => {
    const nextVisible = !showGeoJsonFills;
    setShowGeoJsonFills(nextVisible);
    runtimeRef.current?.updateCountryGeoJsonStateStyles({
      activityFillOpacity: nextVisible ? idleFillOpacity : 0,
      hoverFillOpacity: nextVisible ? hoverFillOpacity : 0,
    });
  };

  const toggleVectorActivity = () => {
    const nextVisible = !showVectorActivity;
    setShowVectorActivity(nextVisible);
    runtimeRef.current?.setCountryVectorActivityVisible(nextVisible);
  };

  const toggleAllPreparedCountries = () => {
    setShowAllPreparedCountries((current) => !current);
    setOutlineSaveNotice('Unsaved vector scope change');
  };

  const toggleCountryInspector = () => {
    const nextEnabled = !inspectAllCountries;
    setInspectAllCountries(nextEnabled);
    runtimeRef.current?.setCountrySelectionEventOnly(!nextEnabled);
    if (!nextEnabled) {
      runtimeRef.current?.clearSelection();
      setSelectedCountry(null);
    }
  };

  const updateAtlasAuditLayers = (next: {
    countryId?: boolean;
    visualAtlas?: boolean;
    highlightMask?: boolean;
  }) => {
    const countryId = next.countryId ?? showCountryIdAtlas;
    const visualAtlas = next.visualAtlas ?? showVisualAtlas;
    const highlightMask = next.highlightMask ?? showHighlightMask;
    setShowCountryIdAtlas(countryId);
    setShowVisualAtlas(visualAtlas);
    setShowHighlightMask(highlightMask);
    runtimeRef.current?.updateAlignmentDebugConfig({
      toggles: {
        showCountryIdTexture: countryId,
        showVisualCountryAtlas: visualAtlas,
        showCountryHighlightMask: highlightMask,
      },
    });
  };

  const updateRasterOutlineState = (state: 'idle' | 'hover', next: Partial<OutlineRasterState>) => {
    if (state === 'idle') {
      if (Number.isFinite(next.width)) setIdleOutlineWidth(Number(next.width));
      if (Number.isFinite(next.borderOpacity)) setIdleOutlineOpacity(Number(next.borderOpacity));
      if (Number.isFinite(next.fillOpacity)) setIdleFillOpacity(Number(next.fillOpacity));
      runtimeRef.current?.updateCountryVectorActivitySettings({ idle: { coreWidth: next.width, coreOpacity: next.borderOpacity } });
      runtimeRef.current?.updateCountryGeoJsonStateStyles({ activityBorderOpacity: 0, activityFillOpacity: next.fillOpacity });
    } else {
      if (Number.isFinite(next.width)) setHoverOutlineWidth(Number(next.width));
      if (Number.isFinite(next.borderOpacity)) setHoverOutlineOpacity(Number(next.borderOpacity));
      if (Number.isFinite(next.fillOpacity)) setHoverFillOpacity(Number(next.fillOpacity));
      runtimeRef.current?.updateCountryVectorActivitySettings({ hover: { coreWidth: next.width, coreOpacity: next.borderOpacity } });
      runtimeRef.current?.updateCountryGeoJsonStateStyles({ hoverBorderOpacity: 0, hoverFillOpacity: next.fillOpacity });
    }
    setOutlineSaveNotice('Unsaved outline changes');
  };

  const updateVectorActivity = (state: 'idle' | 'hover', next: Record<string, unknown>) => {
    if (state === 'idle') {
      if (typeof next.coreColor === 'string') setIdleCoreColor(next.coreColor);
      if (typeof next.glowColor === 'string') setIdleGlowColor(next.glowColor);
      if (Number.isFinite(next.glowWidth)) setIdleGlowWidth(Number(next.glowWidth));
      if (Number.isFinite(next.glowOpacity)) setIdleGlowOpacity(Number(next.glowOpacity));
      if (typeof next.coreVisible === 'boolean') setIdleCoreVisible(next.coreVisible);
      if (typeof next.glowVisible === 'boolean') setIdleGlowVisible(next.glowVisible);
      if (typeof next.pulseEnabled === 'boolean') setIdlePulseEnabled(next.pulseEnabled);
      if (Number.isFinite(next.pulseSpeed)) setIdlePulseSpeed(Number(next.pulseSpeed));
    } else {
      if (typeof next.coreColor === 'string') setHoverCoreColor(next.coreColor);
      if (typeof next.glowColor === 'string') setHoverGlowColor(next.glowColor);
      if (typeof next.sweepColor === 'string') setHoverSweepColor(next.sweepColor);
      if (Number.isFinite(next.glowWidth)) setHoverGlowWidth(Number(next.glowWidth));
      if (Number.isFinite(next.glowOpacity)) setHoverGlowOpacity(Number(next.glowOpacity));
      if (typeof next.coreVisible === 'boolean') setHoverCoreVisible(next.coreVisible);
      if (typeof next.glowVisible === 'boolean') setHoverGlowVisible(next.glowVisible);
      if (typeof next.sweepEnabled === 'boolean') setHoverSweepEnabled(next.sweepEnabled);
      if (Number.isFinite(next.sweepWidth)) setHoverSweepWidth(Number(next.sweepWidth));
      if (Number.isFinite(next.sweepStrength)) setHoverSweepStrength(Number(next.sweepStrength));
      if (Number.isFinite(next.sweepSpeed)) setHoverSweepSpeed(Number(next.sweepSpeed));
      if (typeof next.sweepRepeat === 'boolean') setHoverSweepRepeat(next.sweepRepeat);
    }
    runtimeRef.current?.updateCountryVectorActivitySettings({ [state]: next });
    setOutlineSaveNotice('Unsaved outline changes');
  };

  const updateVectorBorder = (next: { visible?: boolean; coreWidth?: number; opacity?: number; glowWidth?: number; glowOpacity?: number; speed?: number; coreVisible?: boolean; glowVisible?: boolean; animationEnabled?: boolean; palette?: string[] }) => {
    if (typeof next.visible === 'boolean') {
      setShowVectorBorder(next.visible);
      runtimeRef.current?.setCountryVectorBorderVisible(next.visible);
    }
    if (Number.isFinite(next.coreWidth)) setVectorCoreWidth(Number(next.coreWidth));
    if (Number.isFinite(next.opacity)) setVectorCoreOpacity(Number(next.opacity));
    if (Number.isFinite(next.glowWidth)) setVectorGlowWidth(Number(next.glowWidth));
    if (Number.isFinite(next.glowOpacity)) setVectorGlowOpacity(Number(next.glowOpacity));
    if (Number.isFinite(next.speed)) setVectorSpeed(Number(next.speed));
    if (typeof next.coreVisible === 'boolean') setVectorCoreVisible(next.coreVisible);
    if (typeof next.glowVisible === 'boolean') setVectorGlowVisible(next.glowVisible);
    if (typeof next.animationEnabled === 'boolean') setVectorAnimationEnabled(next.animationEnabled);
    runtimeRef.current?.updateCountryVectorBorderSettings(next);
    setOutlineSaveNotice('Unsaved outline changes');
  };

  const updateSelectedColors = (baseColor: string, travelColor: string) => {
    setSelectedBaseColor(baseColor);
    setSelectedTravelColor(travelColor);
    updateVectorBorder({ palette: [baseColor, baseColor, baseColor, baseColor, baseColor, baseColor, travelColor, travelColor] });
  };

  const saveOutlineStates = () => {
    const states: SavedOutlineStates = {
      idle: { width: idleOutlineWidth, borderOpacity: idleOutlineOpacity, fillOpacity: idleFillOpacity },
      hover: { width: hoverOutlineWidth, borderOpacity: hoverOutlineOpacity, fillOpacity: hoverFillOpacity },
      selected: {
        coreWidth: vectorCoreWidth,
        glowWidth: vectorGlowWidth,
        glowOpacity: vectorGlowOpacity,
        speed: vectorSpeed,
        coreVisible: vectorCoreVisible,
        glowVisible: vectorGlowVisible,
        animationEnabled: vectorAnimationEnabled,
      },
    };
    const vectorToolState: SavedVectorToolState = {
      showVectorActivity,
      showAllPreparedCountries,
      showVectorBorder,
      showVisualAtlas,
      showAtlasHighlight,
      showGeoJsonFills,
      idle: {
        coreColor: idleCoreColor, glowColor: idleGlowColor, glowWidth: idleGlowWidth, glowOpacity: idleGlowOpacity,
        coreVisible: idleCoreVisible, glowVisible: idleGlowVisible, pulseEnabled: idlePulseEnabled, pulseSpeed: idlePulseSpeed,
      },
      hover: {
        coreColor: hoverCoreColor, glowColor: hoverGlowColor, sweepColor: hoverSweepColor,
        glowWidth: hoverGlowWidth, glowOpacity: hoverGlowOpacity, coreVisible: hoverCoreVisible, glowVisible: hoverGlowVisible,
        sweepEnabled: hoverSweepEnabled, sweepWidth: hoverSweepWidth, sweepStrength: hoverSweepStrength,
        sweepSpeed: hoverSweepSpeed, sweepRepeat: hoverSweepRepeat,
      },
      selected: {
        baseColor: selectedBaseColor, travelColor: selectedTravelColor, coreOpacity: vectorCoreOpacity,
      },
    };
    window.localStorage.setItem(OUTLINE_STATE_STORAGE_KEY, JSON.stringify(states));
    window.localStorage.setItem(VECTOR_TOOL_STORAGE_KEY, JSON.stringify(vectorToolState));
    savedOutlineStatesRef.current = states;
    savedVectorToolRef.current = vectorToolState;
    setOutlineSaveNotice('All vector states saved');
  };

  const toggleCoastlineAuditLayer = (layer: keyof typeof coastlineAuditLayers) => {
    setCoastlineAuditLayers((current) => {
      const next = { ...current, [layer]: !current[layer] };
      runtimeRef.current?.setLandCoastlineAuditLayers({ [layer]: next[layer] });
      return next;
    });
  };

  const changeHybridSourceMode = (mode: HybridSourceMode) => {
    setHybridSourceMode(mode);
    runtimeRef.current?.setCountryVectorBorderSourceMode(mode);
  };

  const toggleHybridAuditLayer = (layer: keyof typeof hybridAuditLayers) => {
    setHybridAuditLayers((current) => {
      const next = { ...current, [layer]: !current[layer] };
      runtimeRef.current?.setHybridBorderAuditLayers({ [layer]: next[layer] });
      return next;
    });
  };

  const toggleHybridSourceColors = () => {
    const enabled = !hybridSourceColors;
    setHybridSourceColors(enabled);
    runtimeRef.current?.setHybridBorderAuditSourceColors(enabled);
  };

  const toggleContinuousProfiling = () => {
    const next = !continuousProfiling;
    setContinuousProfiling(next);
    runtimeRef.current?.setTransitionActive(next);
  };

  const toggleGeoJsonDiagnostics = () => {
    const nextVisible = !showGeoJsonDiagnostics;
    runtimeRef.current?.setCountryGeoJsonDiagnosticMode(nextVisible);
    setShowGeoJsonDiagnostics(nextVisible);
  };

  const updateGeoJsonGlow = (next: {
    enabled?: boolean;
    coreThickness?: number;
    hazeWidth?: number;
    hazeStrength?: number;
    color?: string;
  }) => {
    const enabled = next.enabled ?? geoJsonGlowEnabled;
    const coreThickness = next.coreThickness ?? geoJsonGlowCoreThickness;
    const hazeWidth = next.hazeWidth ?? geoJsonGlowHazeWidth;
    const hazeStrength = next.hazeStrength ?? geoJsonGlowHazeStrength;
    const color = next.color ?? geoJsonGlowColor;
    setGeoJsonGlowEnabled(enabled);
    setGeoJsonGlowCoreThickness(coreThickness);
    setGeoJsonGlowHazeWidth(hazeWidth);
    setGeoJsonGlowHazeStrength(hazeStrength);
    setGeoJsonGlowColor(color);
    runtimeRef.current?.updateCountryGeoJsonGlow({ enabled, coreThickness, hazeWidth, hazeStrength, color });
  };

  const updateCountryAtlasLongitude = (value: number) => {
    setCountryAtlasLongitudeOffset(value);
    runtimeRef.current?.updateAlignmentDebugConfig({
      countryAtlas: { longitudeOffsetDeg: value },
    });
  };

  const updateCountryBorderAlignment = (next: {
    longitudeOffsetDeg?: number;
    latitudeOffsetDeg?: number;
    scale?: number;
  }) => {
    const longitudeOffsetDeg = next.longitudeOffsetDeg ?? countryBorderLongitudeOffset;
    const latitudeOffsetDeg = next.latitudeOffsetDeg ?? countryBorderLatitudeOffset;
    const scale = next.scale ?? countryBorderScale;
    setCountryBorderLongitudeOffset(longitudeOffsetDeg);
    setCountryBorderLatitudeOffset(latitudeOffsetDeg);
    setCountryBorderScale(scale);
    runtimeRef.current?.updateAlignmentDebugConfig({
      countryGeoJson: { longitudeOffsetDeg, latitudeOffsetDeg, scale },
    });
  };

  const updatePinAlignment = (next: { longitudeOffsetDeg?: number; latitudeOffsetDeg?: number }) => {
    const longitudeOffsetDeg = next.longitudeOffsetDeg ?? pinLongitudeOffset;
    const latitudeOffsetDeg = next.latitudeOffsetDeg ?? pinLatitudeOffset;
    setPinLongitudeOffset(longitudeOffsetDeg);
    setPinLatitudeOffset(latitudeOffsetDeg);
    runtimeRef.current?.updateAlignmentDebugConfig({
      pins: { longitudeOffsetDeg, latitudeOffsetDeg },
    });
    setSaveNotice('Unsaved pin alignment');
  };

  const saveAlignment = () => {
    const alignment: SavedAlignment = {
      atlasLongitude: countryAtlasLongitudeOffset,
      borderLongitude: countryBorderLongitudeOffset,
      borderLatitude: countryBorderLatitudeOffset,
      borderScale: countryBorderScale,
      pinLongitude: pinLongitudeOffset,
      pinLatitude: pinLatitudeOffset,
      showAtlas: showAtlasHighlight,
      showGeoJson: showGeoJsonBorders,
    };
    window.localStorage.setItem(ALIGNMENT_STORAGE_KEY, JSON.stringify(alignment));
    savedAlignmentRef.current = alignment;
    setSaveNotice('Alignment saved');
  };

  const restoreSavedAlignment = () => {
    const alignment = readSavedAlignment();
    if (!alignment) {
      setSaveNotice('No saved alignment');
      return;
    }
    savedAlignmentRef.current = alignment;
    setCountryAtlasLongitudeOffset(alignment.atlasLongitude);
    setCountryBorderLongitudeOffset(alignment.borderLongitude);
    setCountryBorderLatitudeOffset(alignment.borderLatitude);
    setCountryBorderScale(alignment.borderScale);
    setPinLongitudeOffset(alignment.pinLongitude);
    setPinLatitudeOffset(alignment.pinLatitude);
    setShowAtlasHighlight(alignment.showAtlas);
    setShowGeoJsonBorders(alignment.showGeoJson);
    runtimeRef.current?.updateAlignmentDebugConfig({
      countryAtlas: { longitudeOffsetDeg: alignment.atlasLongitude },
      pins: {
        longitudeOffsetDeg: alignment.pinLongitude,
        latitudeOffsetDeg: alignment.pinLatitude,
      },
      countryGeoJson: {
        longitudeOffsetDeg: alignment.borderLongitude,
        latitudeOffsetDeg: alignment.borderLatitude,
        scale: alignment.borderScale,
      },
    });
    runtimeRef.current?.setCountryLayerVisibility({
      atlasHighlight: alignment.showAtlas,
      geoJsonBorders: true,
    });
    runtimeRef.current?.updateCountryGeoJsonStateStyles({ baseOpacity: alignment.showGeoJson ? 0.035 : 0 });
    setSaveNotice('Saved alignment restored');
  };

  const labelCountry = hoveredCountry ?? selectedCountry;
  const selectedHybridMetadata = selectedCountry?.iso3 ? hybridManifestCountries[selectedCountry.iso3.toUpperCase()] ?? null : null;

  return (
    <main className="relative h-[calc(100vh-64px)] min-h-[620px] overflow-hidden bg-[#060809] text-white">
      <div
        ref={containerRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoveredCountry(null)}
        aria-label="Language Explorer globe visual study"
      />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,transparent_0%,transparent_38%,rgba(2,4,5,0.2)_66%,rgba(2,4,5,0.82)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/60 to-transparent" />

      <div className="pointer-events-none absolute left-6 top-5 z-30 rounded-lg border border-white/10 bg-black/55 px-3 py-2 font-mono text-[11px] text-white/75 shadow-lg backdrop-blur-xl md:left-9">
        <span className="text-white/40">FPS</span>{' '}
        <span className="text-emerald-300">{Math.round(performanceSnapshot?.averageFps ?? 0)}</span>
        <span className="ml-2 text-white/35">{(performanceSnapshot?.averageFrameTimeMs ?? 0).toFixed(1)} ms</span>
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-[72px] z-20 flex items-start justify-between p-6 md:p-9">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-white/45">Visual reconstruction study</p>
          <h1 className="mt-2 text-xl font-medium tracking-[-0.02em] md:text-2xl">Language Explorer Globe Lab</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-white/50">Active countries breathe subtly. Select one to focus and reveal its pins.</p>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            onClick={toggleSwingSphereSurface}
            className={`grid h-11 w-11 place-items-center rounded-full border backdrop-blur-xl transition ${showSwingSphereSurface ? 'border-white/15 bg-black/35 text-white/75 hover:border-white/30 hover:bg-white/10' : 'border-amber-200/35 bg-amber-100/10 text-amber-100 hover:bg-amber-100/15'}`}
            aria-label={showSwingSphereSurface ? 'Hide SwingSphere land and ocean' : 'Show SwingSphere land and ocean'}
            title={showSwingSphereSurface ? 'Hide SwingSphere surface' : 'Show SwingSphere surface'}
          >
            {showSwingSphereSurface ? <Eye size={17} /> : <EyeOff size={17} />}
          </button>
          <button type="button" onClick={() => setSearchOpen((value) => !value)} className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/35 text-white/75 backdrop-blur-xl transition hover:border-white/30 hover:bg-white/10" aria-label="Open search study"><Search size={17} /></button>
          <button type="button" onClick={() => setShowHelp((value) => !value)} className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/35 text-white/75 backdrop-blur-xl transition hover:border-white/30 hover:bg-white/10" aria-label="Show interaction help"><HelpCircle size={17} /></button>
        </div>
      </header>

      <section className="pointer-events-none absolute left-6 top-[190px] z-20 w-[min(330px,calc(100%-3rem))] rounded-2xl border border-white/10 bg-black/45 p-4 shadow-xl backdrop-blur-xl md:left-9 md:top-[206px]">
        <p className="text-[9px] font-medium uppercase tracking-[0.22em] text-red-200/65">Country-first prototype</p>
        <div className="mt-2 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/85">{selectedCountry?.name ?? 'Choose an active country'}</p>
            <p className="mt-1 text-[11px] text-white/40">
              {selectedCountry
                ? visibleListingCount > 0
                  ? `${visibleListingCount} pin${visibleListingCount === 1 ? '' : 's'} revealed`
                  : LAB_ACTIVITY_COUNTRIES.includes(String(selectedCountry.iso3 ?? '').toUpperCase())
                    ? 'Focusing country…'
                    : 'No prototype activity here'
                : `${LAB_ACTIVITY_COUNTRIES.length} countries currently active`}
            </p>
          </div>
          <span className={`h-2.5 w-2.5 rounded-full ${selectedCountry ? 'bg-red-400 shadow-[0_0_14px_rgba(248,113,113,0.7)]' : 'animate-pulse bg-red-500/70'}`} />
        </div>
        {selectedListing ? (
          <div className="mt-3 border-t border-white/10 pt-3">
            <p className="text-xs font-medium text-red-100">{selectedListing.name}</p>
            <p className="mt-1 text-[10px] text-white/40">{selectedListing.city} · pin selected</p>
          </div>
        ) : null}
      </section>

      <aside className="absolute bottom-7 left-6 top-[322px] z-20 w-[min(350px,calc(100%-3rem))] overflow-y-auto overscroll-contain rounded-2xl border border-fuchsia-300/15 bg-[#0b0e10]/88 p-4 shadow-2xl backdrop-blur-2xl [scrollbar-color:rgba(255,255,255,0.2)_transparent] [scrollbar-width:thin] md:left-9 md:top-[338px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-medium uppercase tracking-[0.22em] text-fuchsia-200/65">Dedicated tool</p>
            <h2 className="mt-1 text-sm font-medium text-white/90">Vector Country States</h2>
            <p className="mt-1 text-[9px] leading-relaxed text-white/35">Corrected hybrid rings drive idle, hover, selected, and fill. GeoJSON remains a fallback and diagnostic source.</p>
          </div>
          <button type="button" onClick={toggleVectorActivity} className={`rounded-lg border px-2 py-1 text-[8px] uppercase tracking-[0.12em] ${showVectorActivity ? 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-white/[0.035] text-white/40'}`}>Vector {showVectorActivity ? 'on' : 'off'}</button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <StateToggle label="Show all countries" active={showAllPreparedCountries} onClick={toggleAllPreparedCountries} />
          <StateToggle label="Inspect any country" active={inspectAllCountries} onClick={toggleCountryInspector} />
          <StateToggle label="Corrected vectors" active={showVectorActivity} onClick={toggleVectorActivity} />
          <StateToggle label="Legacy JSON outlines" active={showGeoJsonBorders} onClick={toggleGeoJsonBorders} />
          <StateToggle label="GeoJSON fills" active={showGeoJsonFills} onClick={toggleGeoJsonFills} />
          <StateToggle label="Visual atlas" active={showVisualAtlas} onClick={() => updateAtlasAuditLayers({ visualAtlas: !showVisualAtlas })} />
          <StateToggle label="Atlas fill" active={showAtlasHighlight} onClick={toggleAtlasHighlight} />
        </div>

        <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-amber-100/75">Pin layer alignment</p>
              <p className="mt-1 text-[8px] leading-relaxed text-white/35">Moves every listing pin before it is anchored to land.glb. Negative longitude moves west/left.</p>
            </div>
            <button type="button" onClick={() => updatePinAlignment({ longitudeOffsetDeg: 0, latitudeOffsetDeg: 0 })} className="text-[8px] uppercase tracking-[0.12em] text-white/40 transition hover:text-white">Reset</button>
          </div>
          <AlignmentSlider id="pin-layer-longitude" label="Longitude" min={-5} max={5} step={0.1} value={pinLongitudeOffset} suffix="°" onChange={(value) => updatePinAlignment({ longitudeOffsetDeg: value })} />
          <AlignmentSlider id="pin-layer-latitude" label="Latitude" min={-5} max={5} step={0.1} value={pinLatitudeOffset} suffix="°" onChange={(value) => updatePinAlignment({ latitudeOffsetDeg: value })} />
          <div className="mt-2 flex justify-between font-mono text-[8px] text-white/35">
            <span>West −</span><span>{pinLongitudeOffset.toFixed(1)}°, {pinLatitudeOffset.toFixed(1)}°</span><span>+ East</span>
          </div>
          <button type="button" onClick={saveAlignment} className="mt-3 w-full rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[8px] font-medium uppercase tracking-[0.13em] text-amber-100 transition hover:bg-amber-300/15">Save pin alignment</button>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/65">Idle activity</p>
            <div className="flex gap-1">
              <StateToggle label="Core" active={idleCoreVisible} onClick={() => updateVectorActivity('idle', { coreVisible: !idleCoreVisible })} compact />
              <StateToggle label="Glow" active={idleGlowVisible} onClick={() => updateVectorActivity('idle', { glowVisible: !idleGlowVisible })} compact />
              <StateToggle label="Pulse" active={idlePulseEnabled} onClick={() => updateVectorActivity('idle', { pulseEnabled: !idlePulseEnabled })} compact />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <ColorControl label="Core color" value={idleCoreColor} onChange={(value) => updateVectorActivity('idle', { coreColor: value })} />
            <ColorControl label="Glow color" value={idleGlowColor} onChange={(value) => updateVectorActivity('idle', { glowColor: value })} />
          </div>
          <AlignmentSlider id="vector-idle-core-width" label="Core width" min={0.5} max={8} step={0.25} value={idleOutlineWidth} suffix=" px" onChange={(value) => updateRasterOutlineState('idle', { width: value })} />
          <AlignmentSlider id="vector-idle-core-opacity" label="Core strength" min={0} max={1} step={0.02} value={idleOutlineOpacity} onChange={(value) => updateRasterOutlineState('idle', { borderOpacity: value })} />
          <AlignmentSlider id="vector-idle-glow-width" label="Glow width" min={2} max={24} step={0.5} value={idleGlowWidth} suffix=" px" onChange={(value) => updateVectorActivity('idle', { glowWidth: value })} />
          <AlignmentSlider id="vector-idle-glow-opacity" label="Glow strength" min={0} max={0.5} step={0.005} value={idleGlowOpacity} onChange={(value) => updateVectorActivity('idle', { glowOpacity: value })} />
          <AlignmentSlider id="vector-idle-pulse-speed" label="Pulse speed" min={0} max={1.5} step={0.02} value={idlePulseSpeed} onChange={(value) => updateVectorActivity('idle', { pulseSpeed: value })} />
          <AlignmentSlider id="vector-idle-fill" label="Fill strength" min={0} max={0.5} step={0.01} value={idleFillOpacity} onChange={(value) => updateRasterOutlineState('idle', { fillOpacity: value })} />
        </div>

        <div className="mt-3 rounded-xl border border-red-300/10 bg-red-300/[0.025] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/65">On hover</p>
            <div className="flex gap-1">
              <StateToggle label="Core" active={hoverCoreVisible} onClick={() => updateVectorActivity('hover', { coreVisible: !hoverCoreVisible })} compact />
              <StateToggle label="Glow" active={hoverGlowVisible} onClick={() => updateVectorActivity('hover', { glowVisible: !hoverGlowVisible })} compact />
              <StateToggle label="Sweep" active={hoverSweepEnabled} onClick={() => updateVectorActivity('hover', { sweepEnabled: !hoverSweepEnabled })} compact />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <ColorControl label="Core" value={hoverCoreColor} onChange={(value) => updateVectorActivity('hover', { coreColor: value })} />
            <ColorControl label="Glow" value={hoverGlowColor} onChange={(value) => updateVectorActivity('hover', { glowColor: value })} />
            <ColorControl label="Sweep" value={hoverSweepColor} onChange={(value) => updateVectorActivity('hover', { sweepColor: value })} />
          </div>
          <AlignmentSlider id="vector-hover-core-width" label="Core width" min={0.5} max={8} step={0.25} value={hoverOutlineWidth} suffix=" px" onChange={(value) => updateRasterOutlineState('hover', { width: value })} />
          <AlignmentSlider id="vector-hover-core-opacity" label="Core strength" min={0} max={1} step={0.02} value={hoverOutlineOpacity} onChange={(value) => updateRasterOutlineState('hover', { borderOpacity: value })} />
          <AlignmentSlider id="vector-hover-glow-width" label="Glow width" min={2} max={24} step={0.5} value={hoverGlowWidth} suffix=" px" onChange={(value) => updateVectorActivity('hover', { glowWidth: value })} />
          <AlignmentSlider id="vector-hover-glow-opacity" label="Glow strength" min={0} max={0.6} step={0.01} value={hoverGlowOpacity} onChange={(value) => updateVectorActivity('hover', { glowOpacity: value })} />
          <AlignmentSlider id="vector-hover-sweep-width" label="Sweep band" min={0.03} max={0.8} step={0.01} value={hoverSweepWidth} onChange={(value) => updateVectorActivity('hover', { sweepWidth: value })} />
          <AlignmentSlider id="vector-hover-sweep-strength" label="Sweep strength" min={0} max={1.5} step={0.05} value={hoverSweepStrength} onChange={(value) => updateVectorActivity('hover', { sweepStrength: value })} />
          <AlignmentSlider id="vector-hover-sweep-speed" label="Sweep speed" min={0} max={2} step={0.05} value={hoverSweepSpeed} onChange={(value) => updateVectorActivity('hover', { sweepSpeed: value })} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <StateToggle label="Repeat sweep" active={hoverSweepRepeat} onClick={() => updateVectorActivity('hover', { sweepRepeat: !hoverSweepRepeat })} />
            <StateToggle label="Fill" active={showGeoJsonFills && hoverFillOpacity > 0} onClick={() => updateRasterOutlineState('hover', { fillOpacity: hoverFillOpacity > 0 ? 0 : 0.12 })} />
          </div>
          <AlignmentSlider id="vector-hover-fill" label="Fill strength" min={0} max={0.5} step={0.01} value={hoverFillOpacity} onChange={(value) => updateRasterOutlineState('hover', { fillOpacity: value })} />
        </div>

        <div className="mt-3 rounded-xl border border-fuchsia-300/15 bg-fuchsia-300/[0.025] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-fuchsia-100/70">Selected</p>
            <div className="flex gap-1">
              <StateToggle label="Core" active={vectorCoreVisible} onClick={() => updateVectorBorder({ coreVisible: !vectorCoreVisible })} compact />
              <StateToggle label="Glow" active={vectorGlowVisible} onClick={() => updateVectorBorder({ glowVisible: !vectorGlowVisible })} compact />
              <StateToggle label="Travel" active={vectorAnimationEnabled} onClick={() => updateVectorBorder({ animationEnabled: !vectorAnimationEnabled })} compact />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <ColorControl label="Base color" value={selectedBaseColor} onChange={(value) => updateSelectedColors(value, selectedTravelColor)} />
            <ColorControl label="Travel color" value={selectedTravelColor} onChange={(value) => updateSelectedColors(selectedBaseColor, value)} />
          </div>
          <AlignmentSlider id="vector-selected-core-width" label="Core width" min={0.5} max={8} step={0.2} value={vectorCoreWidth} suffix=" px" onChange={(value) => updateVectorBorder({ coreWidth: value })} />
          <AlignmentSlider id="vector-selected-core-opacity" label="Core strength" min={0} max={1} step={0.02} value={vectorCoreOpacity} onChange={(value) => updateVectorBorder({ opacity: value })} />
          <AlignmentSlider id="vector-selected-glow-width" label="Glow width" min={2} max={24} step={0.5} value={vectorGlowWidth} suffix=" px" onChange={(value) => updateVectorBorder({ glowWidth: value })} />
          <AlignmentSlider id="vector-selected-glow-opacity" label="Glow strength" min={0} max={0.6} step={0.01} value={vectorGlowOpacity} onChange={(value) => updateVectorBorder({ glowOpacity: value })} />
          <AlignmentSlider id="vector-selected-travel" label="Color travel" min={0} max={0.5} step={0.005} value={vectorSpeed} onChange={(value) => updateVectorBorder({ speed: value })} />
        </div>

        <button type="button" onClick={saveOutlineStates} className="mt-3 w-full rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-[9px] font-medium uppercase tracking-[0.14em] text-emerald-100 transition hover:bg-emerald-300/15">Save all vector states</button>
        {outlineSaveNotice ? <p className="mt-2 text-center text-[8px] uppercase tracking-[0.12em] text-white/35">{outlineSaveNotice}</p> : null}
      </aside>

      {searchOpen ? (
        <section className="absolute left-6 top-[190px] z-30 w-[min(390px,calc(100%-3rem))] rounded-2xl border border-white/15 bg-[#111516]/88 p-4 shadow-2xl backdrop-blur-2xl md:left-9 md:top-[206px]">
          <div className="flex items-center gap-3 border-b border-white/10 pb-3">
            <Search size={17} className="text-white/45" />
            <input autoFocus placeholder="Search countries" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35" />
            <button type="button" onClick={() => setSearchOpen(false)} className="text-white/50 hover:text-white" aria-label="Close search"><X size={16} /></button>
          </div>
          <p className="pt-4 text-xs leading-relaxed text-white/40">Search is presentation-only in this first visual pass. Country hover and selection use the live atlas.</p>
        </section>
      ) : null}

      {showHelp ? (
        <aside className="absolute bottom-6 right-6 top-[190px] z-30 w-72 overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-[#111516]/88 p-5 pr-4 text-sm text-white/65 shadow-2xl backdrop-blur-2xl [scrollbar-color:rgba(255,255,255,0.22)_transparent] [scrollbar-width:thin] md:bottom-8 md:right-9 md:top-[206px]">
          <p className="font-medium text-white">Explore the globe</p>
          <p className="mt-2 leading-relaxed">Drag anywhere to rotate. Use the wheel or controls to zoom. Hovering reveals the country beneath the pointer.</p>
          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="mb-4">
              <label htmlFor="country-atlas-version" className="text-xs font-medium text-white/75">Atlas version</label>
              <select
                id="country-atlas-version"
                data-testid="atlas-version-selector"
                value={atlasVersion}
                onChange={(event) => changeAtlasVersion(event.target.value as AtlasVersion)}
                className="mt-2 w-full rounded-xl border border-white/15 bg-[#171a1c] px-3 py-2 text-[11px] text-white/75 outline-none transition focus:border-red-300/45"
              >
                {Object.entries(ATLAS_VERSIONS).map(([value, option]) => (
                  <option key={value} value={value}>{option.label}</option>
                ))}
              </select>
              <p className="mt-2 text-[10px] leading-relaxed text-white/35">Switching remounts the lab runtime with the paired hit and visual textures.</p>
            </div>
            <p className="text-xs font-medium text-white/75">Layer visibility</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={toggleAtlasHighlight}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[11px] transition ${showAtlasHighlight ? 'border-white/15 bg-white/5 text-white/75 hover:bg-white/10' : 'border-amber-200/25 bg-amber-100/10 text-amber-100/75'}`}
                aria-pressed={showAtlasHighlight}
              >
                {showAtlasHighlight ? <Eye size={14} /> : <EyeOff size={14} />}
                Atlas fill
              </button>
              <button
                type="button"
                onClick={toggleGeoJsonBorders}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[11px] transition ${showGeoJsonBorders ? 'border-white/15 bg-white/5 text-white/75 hover:bg-white/10' : 'border-amber-200/25 bg-amber-100/10 text-amber-100/75'}`}
                aria-pressed={showGeoJsonBorders}
              >
                {showGeoJsonBorders ? <Eye size={14} /> : <EyeOff size={14} />}
                GeoJSON
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-white/75">GeoJSON border haze</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-white/35">Adds a soft atmospheric halo around the baked border mask.</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateGeoJsonGlow({ enabled: !geoJsonGlowEnabled })}
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-medium transition ${geoJsonGlowEnabled ? 'border-red-300/45 bg-red-400/15 text-red-100' : 'border-white/15 bg-white/5 text-white/45 hover:bg-white/10'}`}
                  aria-pressed={geoJsonGlowEnabled}
                >
                  {geoJsonGlowEnabled ? 'On' : 'Off'}
                </button>
              </div>
              <div className={`mt-3 space-y-3 transition-opacity ${geoJsonGlowEnabled ? 'opacity-100' : 'pointer-events-none opacity-35'}`}>
                <label className="block">
                  <span className="flex items-center justify-between text-[10px] text-white/45"><span>Core thickness</span><span className="font-mono text-white/65">{geoJsonGlowCoreThickness.toFixed(2)} px</span></span>
                  <input type="range" min="0.5" max="4" step="0.25" value={geoJsonGlowCoreThickness} onChange={(event) => updateGeoJsonGlow({ coreThickness: Number(event.target.value) })} className="mt-2 w-full accent-red-400" />
                </label>
                <label className="block">
                  <span className="flex items-center justify-between text-[10px] text-white/45"><span>Haze width</span><span className="font-mono text-white/65">{geoJsonGlowHazeWidth.toFixed(1)} px</span></span>
                  <input type="range" min="1" max="12" step="0.5" value={geoJsonGlowHazeWidth} onChange={(event) => updateGeoJsonGlow({ hazeWidth: Number(event.target.value) })} className="mt-2 w-full accent-red-400" />
                </label>
                <label className="block">
                  <span className="flex items-center justify-between text-[10px] text-white/45"><span>Haze strength</span><span className="font-mono text-white/65">{Math.round(geoJsonGlowHazeStrength * 100)}%</span></span>
                  <input type="range" min="0" max="1.5" step="0.05" value={geoJsonGlowHazeStrength} onChange={(event) => updateGeoJsonGlow({ hazeStrength: Number(event.target.value) })} className="mt-2 w-full accent-red-400" />
                </label>
                <label className="flex items-center justify-between gap-3 text-[10px] text-white/45">
                  <span>Glow color</span>
                  <span className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1">
                    <input type="color" value={geoJsonGlowColor} onChange={(event) => updateGeoJsonGlow({ color: event.target.value })} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" aria-label="GeoJSON glow color" />
                    <span className="font-mono text-white/65">{geoJsonGlowColor.toUpperCase()}</span>
                  </span>
                </label>
                <button type="button" onClick={() => updateGeoJsonGlow({ coreThickness: 1.25, hazeWidth: 5, hazeStrength: 0.55, color: '#ff465c' })} className="text-[9px] uppercase tracking-[0.14em] text-white/35 transition hover:text-white/70">Reset haze</button>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-fuchsia-300/15 bg-fuchsia-300/[0.04] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-white/80">Vector hero outline</p>
                  <p className="mt-1 text-[9px] leading-relaxed text-white/35">Production graphite border with a concentrated traveling crimson signal.</p>
                </div>
                <button type="button" onClick={() => updateVectorBorder({ visible: !showVectorBorder })} className={`rounded-lg border px-2.5 py-1.5 text-[9px] font-medium uppercase tracking-[0.12em] transition ${showVectorBorder ? 'border-fuchsia-300/40 bg-fuchsia-300/10 text-fuchsia-100' : 'border-white/10 bg-white/[0.035] text-white/45'}`}>{showVectorBorder ? 'On' : 'Off'}</button>
              </div>
              <div className="mt-3 rounded-lg border border-white/10 bg-black/15 p-2.5">
                <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-white/55">Idle activity</p>
                <p className="mt-1 text-[8px] leading-relaxed text-white/30">Visible on load for every country with activity.</p>
                <AlignmentSlider id="idle-outline-width" label="Outline width" min={0.5} max={8} step={0.25} value={idleOutlineWidth} suffix=" px" onChange={(value) => updateRasterOutlineState('idle', { width: value })} />
                <AlignmentSlider id="idle-outline-opacity" label="Outline strength" min={0} max={1} step={0.02} value={idleOutlineOpacity} onChange={(value) => updateRasterOutlineState('idle', { borderOpacity: value })} />
                <AlignmentSlider id="idle-fill-opacity" label="Fill strength" min={0} max={0.5} step={0.01} value={idleFillOpacity} onChange={(value) => updateRasterOutlineState('idle', { fillOpacity: value })} />
              </div>
              <div className="mt-2 rounded-lg border border-red-300/10 bg-red-300/[0.025] p-2.5">
                <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-white/55">On hover</p>
                <p className="mt-1 text-[8px] leading-relaxed text-white/30">The immediate solid country response before selection.</p>
                <AlignmentSlider id="hover-outline-width" label="Outline width" min={0.5} max={8} step={0.25} value={hoverOutlineWidth} suffix=" px" onChange={(value) => updateRasterOutlineState('hover', { width: value })} />
                <AlignmentSlider id="hover-outline-opacity" label="Outline strength" min={0} max={1} step={0.02} value={hoverOutlineOpacity} onChange={(value) => updateRasterOutlineState('hover', { borderOpacity: value })} />
                <AlignmentSlider id="hover-fill-opacity" label="Fill strength" min={0} max={0.5} step={0.01} value={hoverFillOpacity} onChange={(value) => updateRasterOutlineState('hover', { fillOpacity: value })} />
              </div>
              <div className="mt-2 rounded-lg border border-fuchsia-300/15 bg-fuchsia-300/[0.025] p-2.5">
                <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-fuchsia-100/70">Selected</p>
                <p className="mt-1 text-[8px] leading-relaxed text-white/30">Animated hybrid/vector outline after an intentional click.</p>
              <AlignmentSlider id="vector-core-width" label="Core" min={1} max={8} step={0.2} value={vectorCoreWidth} suffix=" px" onChange={(value) => updateVectorBorder({ coreWidth: value })} />
              <AlignmentSlider id="vector-glow-width" label="Glow" min={3} max={24} step={0.5} value={vectorGlowWidth} suffix=" px" onChange={(value) => updateVectorBorder({ glowWidth: value })} />
              <AlignmentSlider id="vector-glow-opacity" label="Glow strength" min={0} max={0.6} step={0.02} value={vectorGlowOpacity} onChange={(value) => updateVectorBorder({ glowOpacity: value })} />
              <AlignmentSlider id="vector-gradient-speed" label="Color travel" min={0} max={0.5} step={0.005} value={vectorSpeed} onChange={(value) => updateVectorBorder({ speed: value })} />
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                <button data-testid="vector-animation-toggle" type="button" onClick={() => updateVectorBorder({ animationEnabled: !vectorAnimationEnabled })} className={`rounded-lg border px-2 py-1.5 text-[8px] transition ${vectorAnimationEnabled ? 'border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-100' : 'border-white/10 bg-white/[0.035] text-white/45'}`}>Animation</button>
                <button data-testid="vector-core-toggle" type="button" onClick={() => updateVectorBorder({ coreVisible: !vectorCoreVisible })} className={`rounded-lg border px-2 py-1.5 text-[8px] transition ${vectorCoreVisible ? 'border-white/20 bg-white/[0.06] text-white/70' : 'border-white/10 bg-white/[0.035] text-white/35'}`}>Core</button>
                <button data-testid="vector-glow-toggle" type="button" onClick={() => updateVectorBorder({ glowVisible: !vectorGlowVisible })} className={`rounded-lg border px-2 py-1.5 text-[8px] transition ${vectorGlowVisible ? 'border-white/20 bg-white/[0.06] text-white/70' : 'border-white/10 bg-white/[0.035] text-white/35'}`}>Glow</button>
              </div>
              </div>
              <p className="mt-2 text-[9px] leading-relaxed text-white/30">Idle, hover, selected, and fill resolve from the same corrected hybrid rings when an asset is available; GeoJSON is the fallback.</p>
              <button type="button" onClick={toggleContinuousProfiling} className={`mt-3 w-full rounded-lg border px-2 py-1.5 text-[9px] uppercase tracking-[0.12em] transition ${continuousProfiling ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-white/[0.035] text-white/45'}`}>Continuous profiling {continuousProfiling ? 'on' : 'off'}</button>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {VECTOR_PERFORMANCE_COUNTRIES.map(([name, iso3, lng, lat]) => (
                  <button key={iso3} data-testid={`vector-profile-${iso3}`} type="button" onClick={() => { runtimeRef.current?.setNavigationPose({ lng, lat, zoomIntent: 0.38 }); runtimeRef.current?.selectCountry(iso3); }} className="rounded-lg border border-white/10 bg-white/[0.035] px-2 py-1.5 text-[8px] text-white/50 transition hover:border-fuchsia-300/30 hover:text-fuchsia-100">{name}</button>
                ))}
              </div>
              {vectorDiagnostics ? (
                <dl data-testid="vector-border-diagnostics" className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-white/10 bg-black/20 p-2 font-mono text-[8px] text-white/40">
                  <dt>points / paths</dt><dd className="text-right text-white/60">{vectorDiagnostics.renderedPointCount.toLocaleString()} / {vectorDiagnostics.linePathCount}</dd>
                  <dt>border draws</dt><dd className="text-right text-white/60">{vectorDiagnostics.totalBorderDrawCallCount}</dd>
                  <dt>build / rays</dt><dd className="text-right text-white/60">{vectorDiagnostics.buildDurationMs.toFixed(1)} ms / {vectorDiagnostics.anchorRaycastCount.toLocaleString()}</dd>
                  <dt>cache / switch rays</dt><dd className="text-right text-white/60">{vectorDiagnostics.cacheHit ? 'hit' : 'miss'} / {vectorDiagnostics.countrySwitchRaycastCount.toLocaleString()}</dd>
                  <dt>subdivisions</dt><dd className="text-right text-white/60">{vectorDiagnostics.subdivisionCount.toLocaleString()}</dd>
                  <dt>clearance / unsafe</dt><dd className="text-right text-white/60">{vectorDiagnostics.acceptedClearanceViolationCount} / {vectorDiagnostics.unsafeSegmentSplitCount}</dd>
                  <dt>update avg</dt><dd className="text-right text-white/60">{vectorDiagnostics.averageUpdateDurationMs.toFixed(3)} ms</dd>
                  <dt>color avg / max</dt><dd className="text-right text-white/60">{vectorDiagnostics.averageColorUpdateDurationMs.toFixed(3)} / {vectorDiagnostics.maxColorUpdateDurationMs.toFixed(3)} ms</dd>
                  <dt>color allocations</dt><dd className="text-right text-white/60">{Math.round(vectorDiagnostics.lastColorArrayAllocationBytes / 1024)} KiB/tick</dd>
                  <dt>buffer uploads</dt><dd className="text-right text-white/60">{vectorDiagnostics.gpuColorBufferUploadCount.toLocaleString()}</dd>
                  <dt>uniform updates</dt><dd className="text-right text-white/60">{vectorDiagnostics.gradientUniformUpdateCount.toLocaleString()}</dd>
                  <dt>cache</dt><dd className="text-right text-white/60">{vectorDiagnostics.preparedCacheHitCount}h / {vectorDiagnostics.preparedCacheMissCount}m / {Math.round(vectorDiagnostics.preparedCacheBytes / 1024)} KiB</dd>
                  <dt>fps / render</dt><dd className="text-right text-white/60">{Math.round(performanceSnapshot?.averageFps ?? 0)} / {(performanceSnapshot?.averageRenderCostMs ?? 0).toFixed(2)} ms</dd>
                  <dt>frame policy</dt><dd className="text-right text-white/60">{performanceSnapshot?.framePolicy ?? '—'} @ {performanceSnapshot?.targetFps ?? 0}</dd>
                </dl>
              ) : null}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => updateVectorBorder({ coreWidth: 2, glowWidth: 5.5, glowOpacity: 0.04, speed: 0.5, coreVisible: false, glowVisible: true, animationEnabled: true })} className="rounded-lg border border-white/10 bg-white/[0.035] px-2 py-1.5 text-[9px] uppercase tracking-[0.12em] text-white/45 transition hover:text-white">Reset selected</button>
                <button type="button" data-testid="save-outline-states" onClick={saveOutlineStates} className="rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-2 py-1.5 text-[9px] uppercase tracking-[0.12em] text-emerald-100 transition hover:bg-emerald-300/15">Save states</button>
              </div>
              {outlineSaveNotice ? <p className="mt-2 text-center text-[8px] uppercase tracking-[0.12em] text-white/35">{outlineSaveNotice}</p> : null}
            </div>
            <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.035] p-3">
              <p className="text-xs font-medium text-white/80">Hybrid country-border assembly</p>
              <p className="mt-1 text-[9px] leading-relaxed text-white/35">Lazy prepared assets: GLB coastlines in cyan, retained political borders in yellow, assembled control path in green.</p>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {(['geojson', 'coastline', 'hybrid'] as HybridSourceMode[]).map((mode) => (
                  <button key={mode} type="button" data-testid={`hybrid-source-${mode}`} onClick={() => changeHybridSourceMode(mode)} className={`rounded-lg border px-1.5 py-1.5 text-[8px] capitalize transition ${hybridSourceMode === mode ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-white/[0.035] text-white/40'}`}>{mode === 'geojson' ? 'GeoJSON only' : mode === 'coastline' ? 'GLB coast only' : 'Hybrid'}</button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <AuditLayerButton testId="hybrid-dense" label="Raw dense coast" active={hybridAuditLayers.denseCoastline} color="cyan" onClick={() => toggleHybridAuditLayer('denseCoastline')} />
                <AuditLayerButton testId="hybrid-simplified" label="Simplified coast" active={hybridAuditLayers.simplifiedCoastline} color="cyan" onClick={() => toggleHybridAuditLayer('simplifiedCoastline')} />
                <AuditLayerButton testId="hybrid-political" label="Political segments" active={hybridAuditLayers.politicalSegments} color="yellow" onClick={() => toggleHybridAuditLayer('politicalSegments')} />
                <AuditLayerButton testId="hybrid-rejected" label="Rejected Geo coast" active={hybridAuditLayers.rejectedGeoJsonCoastline} color="pink" onClick={() => toggleHybridAuditLayer('rejectedGeoJsonCoastline')} />
                <AuditLayerButton testId="hybrid-assembled" label="Final controls" active={hybridAuditLayers.assembled} color="green" onClick={() => toggleHybridAuditLayer('assembled')} />
                <AuditLayerButton testId="hybrid-junctions" label="Junctions" active={hybridAuditLayers.junctions} color="pink" onClick={() => toggleHybridAuditLayer('junctions')} />
              </div>
              <button type="button" data-testid="hybrid-source-colors" onClick={toggleHybridSourceColors} className={`mt-2 w-full rounded-lg border px-2 py-1.5 text-[8px] transition ${hybridSourceColors ? 'border-white/20 bg-white/[0.06] text-white/70' : 'border-white/10 bg-white/[0.035] text-white/40'}`}>Source colors {hybridSourceColors ? 'on' : 'off'}</button>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {HYBRID_BORDER_COUNTRIES.map(([name, iso3, lng, lat, zoomIntent]) => (
                  <button key={iso3} type="button" data-testid={`hybrid-country-${iso3}`} onClick={() => { runtimeRef.current?.setNavigationPose({ lng, lat, zoomIntent }); runtimeRef.current?.selectCountry(iso3); }} className="rounded-lg border border-white/10 bg-white/[0.035] px-2 py-1.5 text-[8px] text-white/50 transition hover:border-emerald-300/30 hover:text-emerald-100">{name}</button>
                ))}
              </div>
              {vectorDiagnostics ? <p data-testid="hybrid-source-diagnostic" className="mt-2 font-mono text-[8px] text-white/35">source {vectorDiagnostics.borderSource} · load {vectorDiagnostics.hybridAssetLoadDurationMs.toFixed(1)} ms</p> : null}
              {selectedHybridMetadata ? (
                <dl data-testid="hybrid-manifest-diagnostic" className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-white/10 bg-black/20 p-2 font-mono text-[8px] text-white/40">
                  <dt>status</dt><dd className="text-right text-white/65">{selectedHybridMetadata.status}</dd>
                  <dt>rings / issues</dt><dd className="text-right text-white/65">{selectedHybridMetadata.ringCount} / {selectedHybridMetadata.semanticIssueCount}</dd>
                  <dt>physical</dt><dd className="break-all text-right text-white/65">{selectedHybridMetadata.physicalPathIds.join(', ') || 'none'}</dd>
                </dl>
              ) : null}
            </div>
            <div className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-3">
              <p className="text-xs font-medium text-white/80">Land GLB coastline audit</p>
              <p className="mt-1 text-[9px] leading-relaxed text-white/35">Offline radial silhouette versus topology-derived edge candidates. Lab only.</p>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                <AuditLayerButton testId="coast-audit-silhouette" label="Radial silhouette" active={coastlineAuditLayers.radialSilhouette} color="cyan" onClick={() => toggleCoastlineAuditLayer('radialSilhouette')} />
                <AuditLayerButton testId="coast-audit-topology" label="Normal threshold" active={coastlineAuditLayers.terrainWallRim} color="orange" onClick={() => toggleCoastlineAuditLayer('terrainWallRim')} />
                <AuditLayerButton testId="coast-audit-open" label="Open edges" active={coastlineAuditLayers.openEdges} color="green" onClick={() => toggleCoastlineAuditLayer('openEdges')} />
                <AuditLayerButton testId="coast-audit-nonmanifold" label="Non-manifold" active={coastlineAuditLayers.nonManifoldEdges} color="pink" onClick={() => toggleCoastlineAuditLayer('nonManifoldEdges')} />
              </div>
              <button type="button" data-testid="coast-audit-rejected" onClick={() => toggleCoastlineAuditLayer('rejectedInternalEdges')} className={`mt-1.5 w-full rounded-lg border px-2 py-1.5 text-[8px] transition ${coastlineAuditLayers.rejectedInternalEdges ? 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100' : 'border-white/10 bg-white/[0.035] text-white/40'}`}>Rejected internal normal edges</button>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button type="button" data-testid="coast-audit-australia" onClick={() => runtimeRef.current?.setNavigationPose({ lng: 136, lat: -28, zoomIntent: 0.5 })} className="rounded-lg border border-white/10 bg-white/[0.035] px-2 py-1.5 text-[8px] text-white/50">Australia</button>
                <button type="button" data-testid="coast-audit-madagascar" onClick={() => runtimeRef.current?.setNavigationPose({ lng: 47, lat: -19, zoomIntent: 0.58 })} className="rounded-lg border border-white/10 bg-white/[0.035] px-2 py-1.5 text-[8px] text-white/50">Madagascar</button>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Atlas audit layers</p>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <button type="button" onClick={() => updateAtlasAuditLayers({ countryId: !showCountryIdAtlas })} className={`rounded-lg border px-2 py-1.5 text-[9px] transition ${showCountryIdAtlas ? 'border-cyan-300/45 bg-cyan-300/10 text-cyan-100' : 'border-white/10 bg-white/[0.035] text-white/50 hover:bg-white/10'}`}>ID atlas</button>
                <button type="button" onClick={() => updateAtlasAuditLayers({ visualAtlas: !showVisualAtlas })} className={`rounded-lg border px-2 py-1.5 text-[9px] transition ${showVisualAtlas ? 'border-violet-300/45 bg-violet-300/10 text-violet-100' : 'border-white/10 bg-white/[0.035] text-white/50 hover:bg-white/10'}`}>Visual atlas</button>
                <button type="button" onClick={() => updateAtlasAuditLayers({ highlightMask: !showHighlightMask })} className={`rounded-lg border px-2 py-1.5 text-[9px] transition ${showHighlightMask ? 'border-red-300/45 bg-red-300/10 text-red-100' : 'border-white/10 bg-white/[0.035] text-white/50 hover:bg-white/10'}`}>Highlight</button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {ATLAS_AUDIT_REGIONS.map(([name, iso3, lng, lat, zoomIntent]) => (
                  <button key={name} type="button" onClick={() => { runtimeRef.current?.setNavigationPose({ lng, lat, zoomIntent }); runtimeRef.current?.selectCountry(iso3); }} className="rounded-lg border border-white/10 bg-white/[0.035] px-2 py-1.5 text-[9px] text-white/55 transition hover:border-cyan-300/30 hover:bg-cyan-400/10 hover:text-cyan-100">{name}</button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={toggleGeoJsonDiagnostics}
              className={`mt-2 w-full rounded-xl border px-3 py-2 text-[11px] transition ${showGeoJsonDiagnostics ? 'border-emerald-300/45 bg-emerald-300/10 text-emerald-100' : 'border-white/15 bg-white/5 text-white/55 hover:bg-white/10'}`}
              aria-pressed={showGeoJsonDiagnostics}
            >
              Full-bright mask diagnostic
            </button>
            {geoJsonDiagnostics ? (
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border border-white/10 bg-black/25 p-3 font-mono text-[9px] leading-relaxed text-white/45">
                <dt>features</dt><dd className="text-right text-white/65">{geoJsonDiagnostics.featureCount}</dd>
                <dt>mask pixels</dt><dd className="text-right text-white/65">{geoJsonDiagnostics.maskNontransparentPixelCount.toLocaleString()}</dd>
                <dt>selected</dt><dd className="truncate text-right text-white/65">{geoJsonDiagnostics.selectedCountryKey ?? 'none'}</dd>
                <dt>matched</dt><dd className="truncate text-right text-white/65">{geoJsonDiagnostics.matchedFeature ? `${geoJsonDiagnostics.matchedFeature.name} / ${geoJsonDiagnostics.matchedFeature.iso3}` : 'none'}</dd>
                <dt>static mask</dt><dd className="text-right text-white/65">{geoJsonDiagnostics.textureWidth}×{geoJsonDiagnostics.textureHeight}</dd>
                <dt>active masks</dt><dd className="text-right text-white/65">{geoJsonDiagnostics.dynamicTextureWidth}×{geoJsonDiagnostics.dynamicTextureHeight}</dd>
                <dt>flipY / lon sign</dt><dd className="text-right text-white/65">{String(geoJsonDiagnostics.flipY)} / {geoJsonDiagnostics.longitudeSign}</dd>
                <dt>lon / lat / scale</dt><dd className="text-right text-white/65">{geoJsonDiagnostics.longitudeOffsetDeg} / {geoJsonDiagnostics.latitudeOffsetDeg} / {geoJsonDiagnostics.scale}</dd>
                <dt>owner</dt><dd className="truncate text-right text-white/65">{geoJsonDiagnostics.renderOwner}</dd>
              </dl>
            ) : null}
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Mask checks</p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {GEOJSON_CONTROL_COUNTRIES.map(([name, iso3, lng, lat]) => (
                  <button
                    key={iso3}
                    type="button"
                    onClick={() => {
                      runtimeRef.current?.setNavigationPose({ lng, lat, zoomIntent: 0.28 });
                      runtimeRef.current?.selectCountry(iso3);
                    }}
                    className="rounded-lg border border-white/10 bg-white/[0.035] px-2 py-1.5 text-[10px] text-white/55 transition hover:border-red-300/30 hover:bg-red-400/10 hover:text-red-100"
                  >
                    Check {name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="country-atlas-longitude" className="text-xs font-medium text-white/75">Atlas longitude</label>
              <span className="font-mono text-xs text-white/45">{countryAtlasLongitudeOffset > 0 ? '+' : ''}{countryAtlasLongitudeOffset}°</span>
            </div>
            <input
              id="country-atlas-longitude"
              type="range"
              min="-30"
              max="30"
              step="1"
              value={countryAtlasLongitudeOffset}
              onChange={(event) => updateCountryAtlasLongitude(Number(event.target.value))}
              className="mt-3 w-full accent-white"
            />
            <div className="mt-3 flex justify-between text-[10px] uppercase tracking-[0.14em] text-white/30">
              <span>West</span>
              <button type="button" onClick={() => updateCountryAtlasLongitude(0)} className="pointer-events-auto text-white/45 transition hover:text-white">Reset</button>
              <span>East</span>
            </div>
          </div>
          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="text-xs font-medium text-white/75">GeoJSON fill + border alignment</p>
            <AlignmentSlider
              id="country-border-longitude"
              label="Longitude"
              min={-20}
              max={20}
              step={0.5}
              value={countryBorderLongitudeOffset}
              suffix="°"
              onChange={(value) => updateCountryBorderAlignment({ longitudeOffsetDeg: value })}
            />
            <AlignmentSlider
              id="country-border-latitude"
              label="Latitude"
              min={-10}
              max={10}
              step={0.5}
              value={countryBorderLatitudeOffset}
              suffix="°"
              onChange={(value) => updateCountryBorderAlignment({ latitudeOffsetDeg: value })}
            />
            <AlignmentSlider
              id="country-border-scale"
              label="Scale"
              min={0.97}
              max={1.03}
              step={0.002}
              value={countryBorderScale}
              onChange={(value) => updateCountryBorderAlignment({ scale: value })}
            />
            <button
              type="button"
              onClick={() => updateCountryBorderAlignment({ longitudeOffsetDeg: 0, latitudeOffsetDeg: 0, scale: 1 })}
              className="mt-3 text-[10px] uppercase tracking-[0.14em] text-white/45 transition hover:text-white"
            >
              Reset border alignment
            </button>
          </div>
          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={saveAlignment}
                className="rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-[11px] font-medium text-red-100 transition hover:bg-red-500/20"
              >
                Save alignment
              </button>
              <button
                type="button"
                onClick={restoreSavedAlignment}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Restore saved
              </button>
            </div>
            {saveNotice ? <p className="mt-2 text-[10px] text-white/40">{saveNotice}</p> : null}
          </div>
        </aside>
      ) : null}

      {labelCountry?.name ? (
        <div
          ref={hoverLabelRef}
          className="pointer-events-none absolute left-0 top-0 z-40 whitespace-nowrap rounded-full border border-white/20 bg-black/72 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white shadow-xl backdrop-blur-xl will-change-transform"
          style={{ transform: `translate3d(${pointerRef.current.x}px, ${pointerRef.current.y}px, 0) translate(-50%, calc(-100% - 18px))` }}
        >
          {labelCountry.name}
        </div>
      ) : null}

      <div className="absolute bottom-7 right-6 z-30 flex flex-col overflow-hidden rounded-full border border-white/15 bg-black/40 backdrop-blur-xl md:bottom-9 md:right-9">
        <button type="button" onClick={() => adjustZoom(0.18)} className="grid h-11 w-11 place-items-center text-white/75 transition hover:bg-white/10 hover:text-white" aria-label="Zoom in"><Plus size={17} /></button>
        <div className="mx-3 h-px bg-white/10" />
        <button type="button" onClick={() => adjustZoom(-0.18)} className="grid h-11 w-11 place-items-center text-white/75 transition hover:bg-white/10 hover:text-white" aria-label="Zoom out"><Minus size={17} /></button>
        <div className="mx-3 h-px bg-white/10" />
        <button type="button" onClick={reset} className="grid h-11 w-11 place-items-center text-white/75 transition hover:bg-white/10 hover:text-white" aria-label="Reset globe"><RotateCcw size={15} /></button>
      </div>

      <div className="absolute bottom-7 left-6 z-20 max-w-sm md:bottom-9 md:left-9">
        {!showSwingSphereSurface ? (
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-200/25 bg-amber-100/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-amber-100/80 backdrop-blur-xl">
            <EyeOff size={12} />
            Base land + ocean hidden
          </div>
        ) : null}
        {selectedCountry?.name ? (
          <div className="rounded-2xl border border-white/15 bg-black/42 px-5 py-4 backdrop-blur-xl">
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/40">Selected country</p>
            <p className="mt-1 text-lg font-medium">{selectedCountry.name}</p>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-xs text-white/42">
            <span className="h-px w-8 bg-white/25" />
            Select a country to hold its label
          </div>
        )}
      </div>

      {status !== 'ready' ? (
        <div className="absolute inset-0 z-50 grid place-items-center bg-[#060809]">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border border-white/15 border-t-white/70" />
            <p className="mt-5 text-xs uppercase tracking-[0.24em] text-white/50">{status === 'error' ? 'Unable to load globe' : 'Building globe study'}</p>
            {error ? <p className="mx-auto mt-3 max-w-md text-sm text-red-300/80">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </main>
  );
};

type AlignmentSliderProps = {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: string;
  onChange: (value: number) => void;
};

const AlignmentSlider: React.FC<AlignmentSliderProps> = ({ id, label, min, max, step, value, suffix = '', onChange }) => (
  <div className="mt-4">
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-[11px] text-white/55">{label}</label>
      <span className="font-mono text-[11px] text-white/40">{value > 0 ? '+' : ''}{Number(value.toFixed(3))}{suffix}</span>
    </div>
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="mt-2 w-full accent-white"
    />
  </div>
);

const StateToggle: React.FC<{ label: string; active: boolean; onClick: () => void; compact?: boolean }> = ({ label, active, onClick, compact = false }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-lg border transition ${compact ? 'px-1.5 py-1 text-[7px]' : 'px-2 py-1.5 text-[8px]'} ${active ? 'border-fuchsia-300/35 bg-fuchsia-300/10 text-fuchsia-100' : 'border-white/10 bg-white/[0.035] text-white/38'}`}
  >
    {label}
  </button>
);

const ColorControl: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => (
  <label className="block rounded-lg border border-white/10 bg-white/[0.025] p-2">
    <span className="block text-[7px] uppercase tracking-[0.12em] text-white/35">{label}</span>
    <span className="mt-1 flex items-center gap-2">
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-6 w-7 cursor-pointer border-0 bg-transparent p-0" />
      <span className="truncate font-mono text-[8px] text-white/55">{value.toUpperCase()}</span>
    </span>
  </label>
);

const AuditLayerButton: React.FC<{
  testId: string;
  label: string;
  active: boolean;
  color: 'cyan' | 'orange' | 'green' | 'pink' | 'yellow';
  onClick: () => void;
}> = ({ testId, label, active, color, onClick }) => {
  const activeClass = {
    cyan: 'border-cyan-300/45 bg-cyan-300/10 text-cyan-100',
    orange: 'border-orange-300/45 bg-orange-300/10 text-orange-100',
    green: 'border-emerald-300/45 bg-emerald-300/10 text-emerald-100',
    pink: 'border-fuchsia-300/45 bg-fuchsia-300/10 text-fuchsia-100',
    yellow: 'border-yellow-300/45 bg-yellow-300/10 text-yellow-100',
  }[color];
  return (
    <button data-testid={testId} type="button" onClick={onClick} className={`rounded-lg border px-2 py-1.5 text-[8px] transition ${active ? activeClass : 'border-white/10 bg-white/[0.035] text-white/40'}`}>
      {label}
    </button>
  );
};

export default LanguageExplorerGlobeLabPage;
