import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Compass,
  Eye,
  Filter,
  Globe,
  Layers,
  MapPin,
  Maximize2,
  Navigation,
  Search,
  Sliders,
  SplitSquareVertical,
  Target,
  Zap,
} from 'lucide-react';
import type { ProcessedGlobeGeoData } from '../../src/features/globe-v2/geoDataProcessor';
import {
  getCachedLodGeoData,
  runLandmarkValidationSuite,
} from '../../src/features/globe-v2/geoDataProcessor';
import {
  Globe2Engine,
  LOD_DOWNGRADE_DISTANCE,
  LOD_UPGRADE_DISTANCE,
  type ScreenProjectedMarkerCoord,
} from '../../src/features/globe-v2/Globe2Engine';
import { wrapLongitudeDeg } from '../../src/features/globe-v2/geoMath';
import {
  GEOGRAPHIC_CAMERA_PRESETS,
  GLOBE_V2_DISCOVERY_MARKERS,
  GLOBE_V2_FEATURE_PARITY_INVENTORY,
  GLOBE_V2_IDENTIFIED_ISSUES,
  VALIDATION_LANDMARKS,
} from '../../src/features/globe-v2/landmarksAndPresets';
import { MARKER_CATEGORY_COLORS } from '../../src/features/globe-v2/markerManager';
import {
  DEFAULT_SCULPTURAL_STYLE,
  SCULPTURAL_STYLE_PRESETS,
  type GlobeSculpturalPresetId,
  type GlobeSculpturalStyleConfig,
} from '../../src/features/globe-v2/sculpturalStyle';
import type {
  CameraPose,
  GeoCountryRecord,
  GeographicCameraPreset,
  GeographicInspectionPayload,
  Globe2DebugState,
  Globe2Marker,
  Globe2PerformanceMetrics,
  GlobeLodPolicy,
  GlobeMarkerCategory,
  GridIntervalDegrees,
  LandmarkValidationResult,
} from '../../src/features/globe-v2/types';

type LabWorkspaceTab = 'inspector' | 'validation' | 'benchmarks' | 'defects-parity';
type ViewportLayoutMode = 'v2-single' | 'side-by-side';
type MarkerDatasetPreset = 'curated-with-landmarks' | 'curated-only' | 'stress-500' | 'stress-1500';

function syncV1CameraToPose(v1: any, pose: CameraPose): void {
  if (!v1?.renderer?.camera || !v1?.renderer?.globe || !v1?.config) return;
  try {
    const lonZero = v1.config.coordinateBasis?.meshLongitudeZeroLocalDeg ?? 90;
    const lonRad = ((pose.lon + lonZero) * Math.PI) / 180;
    const latRad = (pose.lat * Math.PI) / 180;
    const cosLat = Math.cos(latRad);
    const localX = pose.distance * cosLat * Math.cos(lonRad);
    const localY = pose.distance * Math.sin(latRad);
    const localZ = pose.distance * cosLat * Math.sin(lonRad);

    const cam = v1.renderer.camera;
    const globe = v1.renderer.globe;
    cam.position.set(localX, localY, localZ).applyQuaternion(globe.quaternion).add(globe.position);
    if (v1.renderer.controls) {
      v1.renderer.controls.target.copy(globe.position);
      v1.renderer.controls.update();
    } else {
      cam.lookAt(globe.position);
    }
    if (v1.pinManager) v1.pinManager.dirty = true;
    v1.countrySelection?.markDirty?.();
    v1.renderer.noteInteraction?.();
  } catch {
    // ignore transient sync error
  }
}

const INITIAL_DEBUG_STATE: Globe2DebugState = {
  lodPolicy: 'auto',
  sculpturalStyle: { ...DEFAULT_SCULPTURAL_STYLE },
  wireframe: false,
  latLonGrid: false,
  gridIntervalDeg: 15,
  countryBorders: true,
  polygonBoundaries: false,
  geometryErrors: false,
  surfaceNormals: false,
  markerCoordinates: false,
  markerAnchors: false,
  markersVisible: true,
  clusterMarkers: false,
  surfaceLayers: {
    oceanSphere: true,
    landmasses: true,
    coastalReliefWalls: true,
    countryFillHighlight: true,
    atmosphereRim: true,
    legacyV1ComparisonOverlay: false,
    legacyLandGlbMesh: false,
  },
  markerAltitude: 0.075,
  autoRotate: false,
};

function generateSyntheticStressMarkers(count: number): Globe2Marker[] {
  const categories: GlobeMarkerCategory[] = ['club', 'event', 'host', 'resort', 'cruise'];
  const hubs = [
    { city: 'Sydney', country: 'Australia', code: 'AUS', lat: -33.8688, lon: 151.2093 },
    { city: 'Melbourne', country: 'Australia', code: 'AUS', lat: -37.8136, lon: 144.9631 },
    { city: 'Perth', country: 'Australia', code: 'AUS', lat: -31.9505, lon: 115.8605 },
    { city: 'Auckland', country: 'New Zealand', code: 'NZL', lat: -36.8485, lon: 174.7633 },
    { city: 'Tokyo', country: 'Japan', code: 'JPN', lat: 35.6762, lon: 139.6503 },
    { city: 'Jakarta', country: 'Indonesia', code: 'IDN', lat: -6.2088, lon: 106.8456 },
    { city: 'London', country: 'United Kingdom', code: 'GBR', lat: 51.5072, lon: -0.1276 },
    { city: 'Paris', country: 'France', code: 'FRA', lat: 48.8566, lon: 2.3522 },
    { city: 'Berlin', country: 'Germany', code: 'DEU', lat: 52.52, lon: 13.405 },
    { city: 'New York', country: 'United States', code: 'USA', lat: 40.7128, lon: -74.006 },
    { city: 'San Francisco', country: 'United States', code: 'USA', lat: 37.7749, lon: -122.4194 },
    { city: 'Miami', country: 'United States', code: 'USA', lat: 25.7617, lon: -80.1918 },
    { city: 'São Paulo', country: 'Brazil', code: 'BRA', lat: -23.5505, lon: -46.6333 },
    { city: 'Johannesburg', country: 'South Africa', code: 'ZAF', lat: -26.2041, lon: 28.0473 },
  ];

  const out: Globe2Marker[] = [];
  for (let i = 0; i < count; i += 1) {
    const hub = hubs[i % hubs.length];
    const ringRadius = ((i % 37) / 37) * 6.5;
    const angle = i * 2.3999632;
    const lat = Math.max(-82, Math.min(82, hub.lat + Math.sin(angle) * ringRadius * 0.65));
    const lon = wrapLongitudeDeg(hub.lon + Math.cos(angle) * ringRadius);
    const cat = categories[i % categories.length];
    out.push({
      id: `stress-${count}-${i}`,
      name: `${hub.city} ${cat.toUpperCase()} #${i + 1}`,
      category: cat,
      city: hub.city,
      country: hub.country,
      countryCode: hub.code,
      lat,
      lon,
      verified: i % 3 !== 0,
      official: i % 2 === 0,
    });
  }
  return out;
}

const Globe2LabPage: React.FC = () => {
  const v2ContainerRef = useRef<HTMLDivElement | null>(null);
  const v1ContainerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Globe2Engine | null>(null);
  const v1GlobeRef = useRef<any | null>(null);

  const [layoutMode, setLayoutMode] = useState<ViewportLayoutMode>('v2-single');
  const [activeTab, setActiveTab] = useState<LabWorkspaceTab>('inspector');
  const [syncCameras, setSyncCameras] = useState<boolean>(true);
  const syncCamerasRef = useRef<boolean>(true);
  syncCamerasRef.current = syncCameras;

  const [debugState, setDebugState] = useState<Globe2DebugState>(INITIAL_DEBUG_STATE);
  const [geoSummary, setGeoSummary] = useState<ProcessedGlobeGeoData['summary'] | null>(null);
  const [validationResults, setValidationResults] = useState<LandmarkValidationResult[]>([]);
  const [metrics, setMetrics] = useState<Globe2PerformanceMetrics | null>(null);
  const [v1MetricsNote, setV1MetricsNote] = useState<{
    status: string;
    buildTimeMs: number | null;
  }>({ status: 'Standby (Enable Side-by-Side to mount V1)', buildTimeMs: null });

  const [hoveredCountry, setHoveredCountry] = useState<GeoCountryRecord | null>(null);
  const [, setSelectedCountry] = useState<GeoCountryRecord | null>(null);
  const [hoveredMarker, setHoveredMarker] = useState<{
    marker: Globe2Marker;
    screenPos: { x: number; y: number };
  } | null>(null);
  const [, setSelectedMarker] = useState<Globe2Marker | null>(null);
  const [inspection, setInspection] = useState<GeographicInspectionPayload | null>(null);
  const [screenMarkerCoords, setScreenMarkerCoords] = useState<ScreenProjectedMarkerCoord[]>([]);

  const [datasetPreset, setDatasetPreset] = useState<MarkerDatasetPreset>('curated-with-landmarks');
  const [categoryFilter, setCategoryFilter] = useState<GlobeMarkerCategory | 'all'>('all');
  const [diagnosticMarkers, setDiagnosticMarkers] = useState<Globe2Marker[]>([]);

  const [searchLatInput, setSearchLatInput] = useState<string>('-33.8688');
  const [searchLonInput, setSearchLonInput] = useState<string>('151.2093');
  const [searchLabelInput, setSearchLabelInput] = useState<string>('Sydney Harbour Test Pin');
  const [activePresetId, setActivePresetId] = useState<string>('preset-australia');

  const activeMarkers = useMemo(() => {
    const landmarkMarkers: Globe2Marker[] = VALIDATION_LANDMARKS.map((lm) => ({
      id: lm.id,
      name: `${lm.name} (Landmark)`,
      category: 'landmark',
      city: lm.name,
      country: lm.country,
      countryCode: lm.countryIso,
      lat: lm.lat,
      lon: lm.lon,
      verified: true,
      official: true,
      description: lm.v1CoastlineNote,
    }));

    let base: Globe2Marker[] = [];
    if (datasetPreset === 'curated-with-landmarks') {
      base = [...GLOBE_V2_DISCOVERY_MARKERS, ...landmarkMarkers];
    } else if (datasetPreset === 'curated-only') {
      base = [...GLOBE_V2_DISCOVERY_MARKERS];
    } else if (datasetPreset === 'stress-500') {
      base = [
        ...GLOBE_V2_DISCOVERY_MARKERS,
        ...landmarkMarkers,
        ...generateSyntheticStressMarkers(463),
      ];
    } else if (datasetPreset === 'stress-1500') {
      base = [
        ...GLOBE_V2_DISCOVERY_MARKERS,
        ...landmarkMarkers,
        ...generateSyntheticStressMarkers(1463),
      ];
    }

    const combined = [...base, ...diagnosticMarkers];
    if (categoryFilter === 'all') return combined;
    return combined.filter((m) => m.category === categoryFilter || m.category === 'diagnostic');
  }, [datasetPreset, categoryFilter, diagnosticMarkers]);

  useEffect(() => {
    const container = v2ContainerRef.current;
    if (!container) return undefined;

    const engine = new Globe2Engine(container, debugState, {
      onHoverCountry: (country) => setHoveredCountry(country),
      onSelectCountry: (country) => setSelectedCountry(country),
      onHoverMarker: (marker, screenPos) => {
        if (marker && screenPos) setHoveredMarker({ marker, screenPos });
        else setHoveredMarker(null);
      },
      onSelectMarker: (marker) => setSelectedMarker(marker),
      onSelectInspection: (payload) => {
        setInspection(payload);
        if (payload) setActiveTab('inspector');
      },
      onMetricsUpdate: (m) => {
        setMetrics(m);
        if (engineRef.current) {
          setScreenMarkerCoords(engineRef.current.getVisibleMarkerScreenCoordinates());
        }
        // Re-run validation if 50m just finished caching
        const c110 = getCachedLodGeoData('110m');
        const c50 = getCachedLodGeoData('50m');
        if (c110 && c50) {
          setValidationResults((prev) => {
            if (prev.length > 0 && prev.every((r) => r.countryHitMatch50m)) return prev;
            return runLandmarkValidationSuite(c110.countries, c50.countries);
          });
        }
      },
      onCameraChange: (pose: CameraPose) => {
        if (syncCamerasRef.current && v1GlobeRef.current) {
          syncV1CameraToPose(v1GlobeRef.current, pose);
        }
      },
    });

    engineRef.current = engine;

    engine
      .initializeGeoData()
      .then((data) => {
        setGeoSummary(data.summary);
        const results = runLandmarkValidationSuite(data.countries, getCachedLodGeoData('50m')?.countries);
        setValidationResults(results);
        engine.setMarkers(activeMarkers);
        engine.selectCountryByIso('AUS');
        engine.inspectCoordinate(-33.8688, 151.2093);
      })
      .catch((err) => {
        console.error('[Globe 2.0 Sandbox] Failed to initialize GeoJSON data:', err);
      });

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.applyDebugState(debugState);
    setScreenMarkerCoords(engine.getVisibleMarkerScreenCoordinates());
  }, [debugState]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setMarkers(activeMarkers);
  }, [activeMarkers]);

  useEffect(() => {
    if (layoutMode !== 'side-by-side') {
      if (v1GlobeRef.current) {
        try {
          v1GlobeRef.current.dispose();
        } catch {
          // ignore
        }
        v1GlobeRef.current = null;
      }
      setV1MetricsNote({
        status: 'Standby (Switch to Side-by-Side to mount Original V1 Globe)',
        buildTimeMs: null,
      });
      return undefined;
    }

    const container = v1ContainerRef.current;
    if (!container) return undefined;

    let cancelled = false;
    const t0 = performance.now();
    setV1MetricsNote({
      status: 'Loading Original V1 Globe (land.glb + 4K textures)…',
      buildTimeMs: null,
    });

    import('../../src/features/globe/runtime/SwingSphereGlobe.js')
      .then(async (mod) => {
        if (cancelled) return;
        const SwingSphereGlobe = mod.SwingSphereGlobe || (mod as any).default;
        const v1Events = activeMarkers
          .filter((m) => m.category === 'club' || m.category === 'event' || m.category === 'landmark')
          .map((m) => ({
            id: m.id,
            listingId: m.id,
            name: m.name,
            city: m.city,
            country: m.country,
            latitude: m.lat,
            longitude: m.lon,
            coordinates: { lat: m.lat, lng: m.lon },
            category: m.category === 'club' ? 'Club' : 'Event',
          }));

        const v1 = new SwingSphereGlobe(container, {
          events: v1Events,
          config: {
            alignment: {
              countryAtlas: { longitudeOffsetDeg: 1.5, latitudeOffsetDeg: 0 },
            },
          },
        });
        await v1.mount();
        if (cancelled) {
          v1.dispose();
          return;
        }
        v1.setIdleMotionSuppressed?.(true);
        v1.setDirectPinsVisible?.(true);
        v1GlobeRef.current = v1;
        const buildMs = Math.round(performance.now() - t0);
        setV1MetricsNote({
          status: 'Original V1 Mounted (Read-Only Reference)',
          buildTimeMs: buildMs,
        });

        const pose = engineRef.current?.getCameraPose();
        if (pose) {
          syncV1CameraToPose(v1, pose);
        }
      })
      .catch((err) => {
        console.warn('[Globe 2.0 Sandbox] V1 comparison mount error:', err);
        setV1MetricsNote({
          status: `V1 Mount Warning: ${String(err?.message ?? err)}`,
          buildTimeMs: null,
        });
      });

    return () => {
      cancelled = true;
      if (v1GlobeRef.current) {
        try {
          v1GlobeRef.current.dispose();
        } catch {
          // ignore
        }
        v1GlobeRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutMode]);

  const handleApplyPreset = useCallback((preset: GeographicCameraPreset) => {
    setActivePresetId(preset.id);
    const engine = engineRef.current;
    if (engine) {
      engine.flyToLatLon(preset.lat, preset.lon, preset.distance, 850);
      if (preset.highlightCountryIso) {
        engine.selectCountryByIso(preset.highlightCountryIso);
      }
      engine.inspectCoordinate(preset.lat, preset.lon);
    }
    if (v1GlobeRef.current) {
      syncV1CameraToPose(v1GlobeRef.current, {
        lat: preset.lat,
        lon: preset.lon,
        distance: preset.distance,
      });
    }
  }, []);

  const handlePlaceDiagnosticPin = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const lat = Number(searchLatInput);
      const lon = Number(searchLonInput);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
      ) {
        return;
      }
      const id = `diag-pin-${Date.now()}`;
      const label =
        searchLabelInput.trim() || `Diagnostic (${lat.toFixed(3)}°, ${lon.toFixed(3)}°)`;
      const newPin: Globe2Marker = {
        id,
        name: label,
        category: 'diagnostic',
        city: 'Diagnostic Coordinate',
        country: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`,
        countryCode: 'DIAG',
        lat,
        lon,
        verified: true,
        official: true,
        description: `User-placed diagnostic verification pin at (${lat.toFixed(5)}°, ${lon.toFixed(5)}°).`,
      };

      setDiagnosticMarkers((prev) => [...prev, newPin]);
      const engine = engineRef.current;
      if (engine) {
        engine.flyToLatLon(lat, lon, 3.65, 800);
        engine.inspectCoordinate(lat, lon);
      }
      if (v1GlobeRef.current) {
        syncV1CameraToPose(v1GlobeRef.current, {
          lat,
          lon,
          distance: 3.65,
        });
      }
    },
    [searchLatInput, searchLonInput, searchLabelInput],
  );

  const toggleDebugFlag = (
    key: keyof Omit<
      Globe2DebugState,
      'surfaceLayers' | 'gridIntervalDeg' | 'markerAltitude' | 'lodPolicy' | 'sculpturalStyle'
    >,
  ) => {
    setDebugState((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const applySculpturalPreset = (presetId: Exclude<GlobeSculpturalPresetId, 'custom'>) => {
    const presetConfig = SCULPTURAL_STYLE_PRESETS[presetId];
    setDebugState((prev) => ({
      ...prev,
      sculpturalStyle: { ...presetConfig },
      latLonGrid: presetId === 'geographic-diagnostic' ? true : prev.latLonGrid,
      surfaceLayers: {
        ...prev.surfaceLayers,
        coastalReliefWalls: presetId !== 'geographic-diagnostic',
      },
    }));
  };

  const updateSculpturalStyle = <K extends keyof GlobeSculpturalStyleConfig>(
    key: K,
    value: GlobeSculpturalStyleConfig[K],
  ) => {
    setDebugState((prev) => ({
      ...prev,
      sculpturalStyle: {
        ...prev.sculpturalStyle,
        preset: 'custom',
        [key]: value,
      },
    }));
  };

  const toggleSurfaceLayer = (layerKey: keyof Globe2DebugState['surfaceLayers']) => {
    setDebugState((prev) => ({
      ...prev,
      surfaceLayers: {
        ...prev.surfaceLayers,
        [layerKey]: !prev.surfaceLayers[layerKey],
      },
    }));
  };

  const setGridInterval = (interval: GridIntervalDegrees) => {
    setDebugState((prev) => ({
      ...prev,
      latLonGrid: true,
      gridIntervalDeg: interval,
    }));
  };

  const setLodPolicy = (lodPolicy: GlobeLodPolicy) => {
    setDebugState((prev) => ({
      ...prev,
      lodPolicy,
    }));
  };

  const passedValidationCount = useMemo(
    () => validationResults.filter((r) => r.passed).length,
    [validationResults],
  );

  const activeLodTier = metrics?.lod.activeTier ?? '110m';

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#06070a] text-zinc-100 select-none">
      {/* Top Engineering Command Bar */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0b0d13]/95 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/15 text-red-400">
            <Globe size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white">
                SwingSphere Globe 2.0 — Clean-Room Sandbox &amp; Adaptive LOD Workbench
              </h1>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                Isolated Sandbox
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  activeLodTier === '50m'
                    ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                    : 'border-sky-400/40 bg-sky-500/15 text-sky-200'
                }`}
              >
                Active LOD: 1:{activeLodTier} {activeLodTier === '50m' ? '(High-Res Coastal)' : '(Orbital)'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Pure WGS84 Spherical Geometry (`0.000°` Offset) · Adaptive 1:110m / 1:50m Coastal LOD · 242 Countries · Instanced Pins
            </p>
          </div>
        </div>

        {/* Viewport Mode & Workspace Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-white/10 bg-black/50 p-0.5">
            <button
              type="button"
              onClick={() => setLayoutMode('v2-single')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                layoutMode === 'v2-single'
                  ? 'bg-red-600 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Maximize2 size={13} />
              Globe 2.0 Single
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('side-by-side')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                layoutMode === 'side-by-side'
                  ? 'bg-red-600 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <SplitSquareVertical size={13} />
              Side-by-Side (V1 vs V2)
            </button>
          </div>

          <div className="h-4 w-px bg-white/10" />

          <div className="flex items-center rounded-lg border border-white/10 bg-black/50 p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('inspector')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                activeTab === 'inspector'
                  ? 'bg-white/15 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Sliders size={13} />
              Debug &amp; Inspector
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('validation')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                activeTab === 'validation'
                  ? 'bg-white/15 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <CheckCircle2 size={13} className="text-emerald-400" />
              Validation ({passedValidationCount}/{validationResults.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('benchmarks')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                activeTab === 'benchmarks'
                  ? 'bg-white/15 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Activity size={13} className="text-sky-400" />
              Benchmarks &amp; LOD
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('defects-parity')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                activeTab === 'defects-parity'
                  ? 'bg-white/15 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <AlertTriangle size={13} className="text-amber-400" />
              Defects &amp; Parity ({GLOBE_V2_IDENTIFIED_ISSUES.length})
            </button>
          </div>
        </div>
      </header>

      {/* Camera Region & Landmark Preset Strip */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/10 bg-[#090b10] px-4 py-1.5">
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 mr-1">
          <Compass size={12} className="text-red-400" />
          Presets:
        </span>
        {GEOGRAPHIC_CAMERA_PRESETS.map((preset) => {
          const isActive = activePresetId === preset.id;
          const triggers50m = preset.distance <= LOD_UPGRADE_DISTANCE;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleApplyPreset(preset)}
              title={`${preset.description} (${triggers50m ? 'Triggers 1:50m Coastal LOD' : 'Orbital 1:110m View'})`}
              className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                isActive
                  ? 'border-red-500/60 bg-red-500/20 text-white'
                  : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/25 hover:bg-white/[0.08]'
              }`}
            >
              {preset.label}
              {triggers50m && (
                <span className="ml-1 text-[9px] text-emerald-400 font-mono">50m</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Content Split */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Column: Sculptural Visual Style, Adaptive LOD, Debug Controls & Coordinate Search */}
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-[#0b0d13]/95 p-3 text-xs">
          {/* Phase 4 Sculptural Low-Poly Visual Style Controls & Presets */}
          <section className="mb-3 rounded-xl border border-red-500/35 bg-red-500/[0.04] p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-red-300">
                <Sliders size={13} />
                Sculptural Low-Poly Style
              </span>
              <span className="rounded border border-red-500/40 bg-red-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-red-200">
                {debugState.sculpturalStyle.preset}
              </span>
            </div>

            {/* 3 Required Visual Style Presets */}
            <div className="mb-2.5 space-y-1">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Visual Presets
              </span>
              <div className="grid grid-cols-1 gap-1">
                {(
                  [
                    {
                      id: 'sculptural-refined',
                      title: 'Sculptural Refined (Default)',
                      desc: 'Chunky low-poly facets + accurate WGS84 coasts',
                    },
                    {
                      id: 'original-inspired',
                      title: 'Original Inspired',
                      desc: 'Reproduces V1 land.glb elevation & bold facets',
                    },
                    {
                      id: 'geographic-diagnostic',
                      title: 'Geographic Diagnostic',
                      desc: 'Flat cartographic relief for pure boundary audit',
                    },
                  ] as const
                ).map((preset) => {
                  const active = debugState.sculpturalStyle.preset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applySculpturalPreset(preset.id)}
                      className={`flex flex-col items-start rounded-lg border px-2.5 py-1.5 text-left transition ${
                        active
                          ? 'border-red-500/70 bg-red-500/20 text-white shadow'
                          : 'border-white/10 bg-black/50 text-zinc-300 hover:border-white/25 hover:text-white'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="text-[11px] font-bold">{preset.title}</span>
                        {active && (
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-400">{preset.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Interactive Sculptural Sliders */}
            <div className="space-y-2 rounded-lg bg-black/50 p-2">
              <div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-300">Landmass Elevation</span>
                  <span className="font-mono text-red-300">
                    +{debugState.sculpturalStyle.landElevation.toFixed(3)} (R=
                    {(2.5 + debugState.sculpturalStyle.landElevation).toFixed(3)})
                  </span>
                </div>
                <input
                  type="range"
                  min="0.005"
                  max="0.220"
                  step="0.005"
                  value={debugState.sculpturalStyle.landElevation}
                  onChange={(e) =>
                    updateSculpturalStyle('landElevation', Number(e.target.value))
                  }
                  className="mt-0.5 w-full accent-red-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-300">Coastline Sidewall Thickness</span>
                  <span className="font-mono text-red-300">
                    {debugState.sculpturalStyle.sidewallThickness.toFixed(3)} units
                  </span>
                </div>
                <input
                  type="range"
                  min="0.005"
                  max="0.160"
                  step="0.005"
                  value={debugState.sculpturalStyle.sidewallThickness}
                  onChange={(e) =>
                    updateSculpturalStyle('sidewallThickness', Number(e.target.value))
                  }
                  className="mt-0.5 w-full accent-red-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-300">Low-Poly Facet Size (Arc)</span>
                  <span className="font-mono text-amber-300">
                    {debugState.sculpturalStyle.facetSizeDeg.toFixed(1)}°
                  </span>
                </div>
                <input
                  type="range"
                  min="3.2"
                  max="8.5"
                  step="0.3"
                  value={debugState.sculpturalStyle.facetSizeDeg}
                  onChange={(e) =>
                    updateSculpturalStyle('facetSizeDeg', Number(e.target.value))
                  }
                  className="mt-0.5 w-full accent-red-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-300">Facet Contrast &amp; Shading</span>
                  <span className="font-mono text-emerald-300">
                    {debugState.sculpturalStyle.facetContrast.toFixed(2)}×
                  </span>
                </div>
                <input
                  type="range"
                  min="0.00"
                  max="2.20"
                  step="0.05"
                  value={debugState.sculpturalStyle.facetContrast}
                  onChange={(e) =>
                    updateSculpturalStyle('facetContrast', Number(e.target.value))
                  }
                  className="mt-0.5 w-full accent-red-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-300">Graphite Facet Sheen</span>
                  <span className="font-mono text-sky-300">
                    {debugState.sculpturalStyle.graphiteSheenStrength.toFixed(3)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.000"
                  max="0.150"
                  step="0.004"
                  value={debugState.sculpturalStyle.graphiteSheenStrength}
                  onChange={(e) =>
                    updateSculpturalStyle('graphiteSheenStrength', Number(e.target.value))
                  }
                  className="mt-0.5 w-full accent-red-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-300">Coastline Glow Intensity</span>
                  <span className="font-mono text-red-300">
                    {Math.round(debugState.sculpturalStyle.coastlineGlowIntensity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.00"
                  max="1.00"
                  step="0.05"
                  value={debugState.sculpturalStyle.coastlineGlowIntensity}
                  onChange={(e) =>
                    updateSculpturalStyle('coastlineGlowIntensity', Number(e.target.value))
                  }
                  className="mt-0.5 w-full accent-red-500"
                />
              </div>

              {/* Land & Ocean Material Appearance */}
              <div className="border-t border-white/10 pt-2 space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Land &amp; Ocean Material
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center justify-between rounded border border-white/10 bg-black/60 px-2 py-1">
                    <span className="text-[10px] text-zinc-300">Land Graphite</span>
                    <input
                      type="color"
                      value={debugState.sculpturalStyle.landColor}
                      onChange={(e) => updateSculpturalStyle('landColor', e.target.value)}
                      className="h-4 w-6 cursor-pointer border-0 bg-transparent p-0"
                    />
                  </label>
                  <label className="flex items-center justify-between rounded border border-white/10 bg-black/60 px-2 py-1">
                    <span className="text-[10px] text-zinc-300">Ocean Abyss</span>
                    <input
                      type="color"
                      value={debugState.sculpturalStyle.oceanColor}
                      onChange={(e) => updateSculpturalStyle('oceanColor', e.target.value)}
                      className="h-4 w-6 cursor-pointer border-0 bg-transparent p-0"
                    />
                  </label>
                </div>

                <div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-zinc-400">Land Surface Roughness</span>
                    <span className="font-mono text-zinc-200">
                      {debugState.sculpturalStyle.landRoughness.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.15"
                    max="0.95"
                    step="0.01"
                    value={debugState.sculpturalStyle.landRoughness}
                    onChange={(e) =>
                      updateSculpturalStyle('landRoughness', Number(e.target.value))
                    }
                    className="mt-0.5 w-full accent-red-500"
                  />
                </div>

                <label className="flex cursor-pointer items-center justify-between pt-0.5">
                  <span className="text-[10px] text-zinc-300">
                    Low-Poly Faceted Ocean Sphere
                  </span>
                  <input
                    type="checkbox"
                    checked={debugState.sculpturalStyle.oceanFaceted}
                    onChange={(e) =>
                      updateSculpturalStyle('oceanFaceted', e.target.checked)
                    }
                    className="accent-red-500"
                  />
                </label>
              </div>
            </div>
          </section>

          {/* Adaptive Geographic LOD Control & Telemetry */}
          <section className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                <Zap size={13} />
                Adaptive Coastal LOD
              </span>
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                  activeLodTier === '50m'
                    ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-500/40'
                    : 'bg-sky-500/20 text-sky-200 border border-sky-500/40'
                }`}
              >
                1:{activeLodTier}
              </span>
            </div>

            <div className="mb-2 grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'auto', label: 'Auto LOD' },
                  { id: 'force-110m', label: '1:110m' },
                  { id: 'force-50m', label: '1:50m' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setLodPolicy(opt.id)}
                  className={`rounded border py-1 text-[10px] font-semibold transition ${
                    debugState.lodPolicy === opt.id
                      ? 'border-emerald-400/60 bg-emerald-500/25 text-white'
                      : 'border-white/10 bg-black/50 text-zinc-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="space-y-1 rounded-lg bg-black/50 p-2 font-mono text-[10px] text-zinc-300">
              <div className="flex justify-between">
                <span className="text-zinc-400">Camera Dist / Scale:</span>
                <span className="text-white font-semibold">
                  {metrics?.lod.cameraDistance?.toFixed(2) ?? '5.20'} (
                  {metrics?.lod.apparentGlobeDiameterPx ?? 620}px)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Hysteresis Band:</span>
                <span>
                  ≤{LOD_UPGRADE_DISTANCE} (50m) / ≥{LOD_DOWNGRADE_DISTANCE} (110m)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">1:110m Cache:</span>
                <span className="text-sky-300">
                  {metrics?.lod.tier110mStatus ?? 'cached'} ({metrics?.lod.tier110mBuildMs ?? 38}ms)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">1:50m Cache:</span>
                <span
                  className={
                    metrics?.lod.tier50mStatus === 'cached'
                      ? 'text-emerald-300 font-semibold'
                      : metrics?.lod.tier50mStatus === 'loading'
                        ? 'text-amber-300 animate-pulse'
                        : 'text-zinc-400'
                  }
                >
                  {metrics?.lod.tier50mStatus ?? 'standby (lazy)'}
                  {metrics?.lod.tier50mBuildMs ? ` (${metrics.lod.tier50mBuildMs}ms)` : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Active Geometry:</span>
                <span className="text-white">
                  {metrics?.lod.activePolygons ?? 312} polys ·{' '}
                  {(metrics?.lod.activeVertices ?? 5685).toLocaleString()} verts
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">LOD Swaps / Last Swap:</span>
                <span className="text-emerald-300">
                  {metrics?.lod.swapCount ?? 0} swaps ({metrics?.lod.lastSwapDurationMs ?? 0}ms)
                </span>
              </div>
            </div>
          </section>

          {/* Coordinate Search & Pin Drop */}
          <section className="mb-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                <Target size={13} className="text-amber-400" />
                Coordinate Search Pin
              </span>
              {diagnosticMarkers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDiagnosticMarkers([])}
                  className="text-[10px] text-red-400 hover:underline"
                >
                  Clear ({diagnosticMarkers.length})
                </button>
              )}
            </div>
            <form onSubmit={handlePlaceDiagnosticPin} className="space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                <label className="block">
                  <span className="text-[10px] text-zinc-400">Latitude (°)</span>
                  <input
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    value={searchLatInput}
                    onChange={(e) => setSearchLatInput(e.target.value)}
                    className="mt-0.5 w-full rounded border border-white/15 bg-black/60 px-2 py-1 text-xs text-white focus:border-red-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] text-zinc-400">Longitude (°)</span>
                  <input
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    value={searchLonInput}
                    onChange={(e) => setSearchLonInput(e.target.value)}
                    className="mt-0.5 w-full rounded border border-white/15 bg-black/60 px-2 py-1 text-xs text-white focus:border-red-500 focus:outline-none"
                  />
                </label>
              </div>
              <input
                type="text"
                placeholder="Diagnostic pin label…"
                value={searchLabelInput}
                onChange={(e) => setSearchLabelInput(e.target.value)}
                className="w-full rounded border border-white/15 bg-black/60 px-2 py-1 text-xs text-white focus:border-red-500 focus:outline-none"
              />
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 px-2.5 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/30"
              >
                <MapPin size={13} />
                Place Diagnostic Pin &amp; Focus
              </button>
            </form>
          </section>

          {/* Phase 9 Toggleable Diagnostic Overlays */}
          <section className="mb-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-300">
              <Layers size={13} className="text-red-400" />
              Diagnostic Overlays (Phase 9)
            </div>

            <div className="space-y-1.5">
              <label className="flex cursor-pointer items-center justify-between rounded-md px-1.5 py-1 hover:bg-white/[0.04]">
                <span className="text-zinc-200">Wireframe Topology</span>
                <input
                  type="checkbox"
                  checked={debugState.wireframe}
                  onChange={() => toggleDebugFlag('wireframe')}
                  className="accent-red-500"
                />
              </label>

              <div className="rounded-md px-1.5 py-1 hover:bg-white/[0.04]">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-200">Lat/Lon Graticule Grid</span>
                  <input
                    type="checkbox"
                    checked={debugState.latLonGrid}
                    onChange={() => toggleDebugFlag('latLonGrid')}
                    className="accent-red-500"
                  />
                </div>
                {debugState.latLonGrid && (
                  <div className="mt-1.5 flex items-center gap-1">
                    {([10, 15, 30] as GridIntervalDegrees[]).map((deg) => (
                      <button
                        key={deg}
                        type="button"
                        onClick={() => setGridInterval(deg)}
                        className={`flex-1 rounded border py-0.5 text-[10px] font-semibold ${
                          debugState.gridIntervalDeg === deg
                            ? 'border-red-500/60 bg-red-500/20 text-white'
                            : 'border-white/10 bg-black/40 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-md px-1.5 py-1 hover:bg-white/[0.04]">
                <span className="text-zinc-200">Country Borders (242)</span>
                <input
                  type="checkbox"
                  checked={debugState.countryBorders}
                  onChange={() => toggleDebugFlag('countryBorders')}
                  className="accent-red-500"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-md px-1.5 py-1 hover:bg-white/[0.04]">
                <div>
                  <span className="block text-zinc-200">Polygon Boundaries</span>
                  <span className="text-[10px] text-zinc-400">Cyan=Main · Violet=Island · Amber=Hole</span>
                </div>
                <input
                  type="checkbox"
                  checked={debugState.polygonBoundaries}
                  onChange={() => toggleDebugFlag('polygonBoundaries')}
                  className="accent-red-500"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-md px-1.5 py-1 hover:bg-white/[0.04]">
                <div>
                  <span className="block text-zinc-200">Geometry Errors &amp; V1 Diff</span>
                  <span className="text-[10px] text-zinc-400">Red=V1 Distorted · Green=WGS84 · Orange=±180°</span>
                </div>
                <input
                  type="checkbox"
                  checked={debugState.geometryErrors}
                  onChange={() => toggleDebugFlag('geometryErrors')}
                  className="accent-red-500"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-md px-1.5 py-1 hover:bg-white/[0.04]">
                <div>
                  <span className="block text-zinc-200">Surface Face Normals</span>
                  <span className="text-[10px] text-zinc-400">Show tilted flat-facet normal vectors</span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(debugState.surfaceNormals)}
                  onChange={() => toggleDebugFlag('surfaceNormals')}
                  className="accent-red-500"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-md px-1.5 py-1 hover:bg-white/[0.04]">
                <div>
                  <span className="block text-zinc-200">Marker Coordinates HUD</span>
                  <span className="text-[10px] text-zinc-400">Show (lat, lon) &amp; [x, y, z] tags</span>
                </div>
                <input
                  type="checkbox"
                  checked={debugState.markerCoordinates}
                  onChange={() => toggleDebugFlag('markerCoordinates')}
                  className="accent-red-500"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-md px-1.5 py-1 hover:bg-white/[0.04]">
                <div>
                  <span className="block text-zinc-200">Marker Surface Anchors</span>
                  <span className="text-[10px] text-zinc-400">Draw radial line to surface point</span>
                </div>
                <input
                  type="checkbox"
                  checked={debugState.markerAnchors}
                  onChange={() => toggleDebugFlag('markerAnchors')}
                  className="accent-red-500"
                />
              </label>
            </div>
          </section>

          {/* Independent Surface Layers */}
          <section className="mb-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-300">
              <Eye size={13} className="text-sky-400" />
              Surface Layers
            </div>
            <div className="space-y-1.5">
              <label className="flex cursor-pointer items-center justify-between rounded-md px-1.5 py-1 hover:bg-white/[0.04]">
                <span className="text-zinc-200">Base Ocean Sphere (R=2.500)</span>
                <input
                  type="checkbox"
                  checked={debugState.surfaceLayers.oceanSphere}
                  onChange={() => toggleSurfaceLayer('oceanSphere')}
                  className="accent-red-500"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-md px-1.5 py-1 hover:bg-white/[0.04]">
                <span className="text-zinc-200">
                  Sculptural Landmasses (R={(2.5 + debugState.sculpturalStyle.landElevation).toFixed(3)})
                </span>
                <input
                  type="checkbox"
                  checked={debugState.surfaceLayers.landmasses}
                  onChange={() => toggleSurfaceLayer('landmasses')}
                  className="accent-red-500"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-md px-1.5 py-1 hover:bg-white/[0.04]">
                <span className="text-zinc-200">Coastal Relief Sidewalls</span>
                <input
                  type="checkbox"
                  checked={debugState.surfaceLayers.coastalReliefWalls}
                  onChange={() => toggleSurfaceLayer('coastalReliefWalls')}
                  className="accent-red-500"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-md px-1.5 py-1 hover:bg-white/[0.04]">
                <span className="text-zinc-200">Country Hover/Select Fill</span>
                <input
                  type="checkbox"
                  checked={debugState.surfaceLayers.countryFillHighlight}
                  onChange={() => toggleSurfaceLayer('countryFillHighlight')}
                  className="accent-red-500"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-md px-1.5 py-1 hover:bg-white/[0.04]">
                <span className="text-zinc-200">Crimson Fresnel Atmosphere</span>
                <input
                  type="checkbox"
                  checked={debugState.surfaceLayers.atmosphereRim}
                  onChange={() => toggleSurfaceLayer('atmosphereRim')}
                  className="accent-red-500"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-md border border-red-500/20 bg-red-500/[0.05] px-1.5 py-1 hover:bg-red-500/10">
                <div>
                  <span className="block text-red-200 font-medium">Superimpose V1 land.glb Mesh</span>
                  <span className="text-[10px] text-red-300/75">Show legacy 3,536-tri low-poly mesh</span>
                </div>
                <input
                  type="checkbox"
                  checked={debugState.surfaceLayers.legacyLandGlbMesh}
                  onChange={() => toggleSurfaceLayer('legacyLandGlbMesh')}
                  className="accent-red-500"
                />
              </label>
            </div>
          </section>

          {/* Marker System Controls */}
          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-300">
              <Filter size={13} className="text-emerald-400" />
              Markers &amp; Dataset ({activeMarkers.length})
            </div>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center justify-between">
                <span className="text-zinc-200">Markers Visible</span>
                <input
                  type="checkbox"
                  checked={debugState.markersVisible}
                  onChange={() => toggleDebugFlag('markersVisible')}
                  className="accent-red-500"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between">
                <span className="text-zinc-200">Zoom-Aware Clustering</span>
                <input
                  type="checkbox"
                  checked={debugState.clusterMarkers}
                  onChange={() => toggleDebugFlag('clusterMarkers')}
                  className="accent-red-500"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between">
                <span className="text-zinc-200">Idle Orbit Auto-Rotate</span>
                <input
                  type="checkbox"
                  checked={debugState.autoRotate}
                  onChange={() => toggleDebugFlag('autoRotate')}
                  className="accent-red-500"
                />
              </label>

              <div>
                <div className="flex justify-between text-[10px] text-zinc-400">
                  <span>Marker Surface Altitude</span>
                  <span>{debugState.markerAltitude.toFixed(3)} units</span>
                </div>
                <input
                  type="range"
                  min="0.015"
                  max="0.22"
                  step="0.005"
                  value={debugState.markerAltitude}
                  onChange={(e) =>
                    setDebugState((prev) => ({
                      ...prev,
                      markerAltitude: Number(e.target.value),
                    }))
                  }
                  className="mt-1 w-full accent-red-500"
                />
              </div>

              <div>
                <span className="block text-[10px] text-zinc-400 mb-1">Dataset Load Preset</span>
                <select
                  value={datasetPreset}
                  onChange={(e) => setDatasetPreset(e.target.value as MarkerDatasetPreset)}
                  className="w-full rounded border border-white/15 bg-black/60 px-2 py-1 text-xs text-white"
                >
                  <option value="curated-with-landmarks">Discovery + 12 Validation Landmarks (37)</option>
                  <option value="curated-only">SwingSphere Discovery Only (25)</option>
                  <option value="stress-500">Benchmark Stress Test: 500 Pins</option>
                  <option value="stress-1500">Benchmark Stress Test: 1,500 Pins</option>
                </select>
              </div>

              <div>
                <span className="block text-[10px] text-zinc-400 mb-1">Category Filter</span>
                <div className="flex flex-wrap gap-1">
                  {(['all', 'club', 'event', 'host', 'resort', 'cruise', 'landmark'] as const).map(
                    (cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategoryFilter(cat)}
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          categoryFilter === cat
                            ? 'bg-red-600 text-white'
                            : 'bg-white/5 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {cat}
                      </button>
                    ),
                  )}
                </div>
              </div>
            </div>
          </section>
        </aside>

        {/* Center 3D Viewport(s) */}
        <div className="relative flex flex-1 min-w-0 overflow-hidden bg-[#050608]">
          {layoutMode === 'side-by-side' && (
            <div className="relative flex-1 border-r border-white/15 overflow-hidden">
              <div ref={v1ContainerRef} className="h-full w-full" />
              <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-xl border border-amber-500/40 bg-black/80 px-3 py-2 backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  <span className="text-xs font-bold text-white">
                    Original Globe V1 (Reference Implementation)
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] text-zinc-300">
                  Sculpted `land.glb` (3,536 tris, 24-pt Australia) + `+1.5°` Atlas Offset + 4K Bitmap Textures
                </p>
                <p className="mt-0.5 text-[10px] text-amber-300">{v1MetricsNote.status}</p>
              </div>
            </div>
          )}

          <div className="relative flex-1 overflow-hidden">
            <div ref={v2ContainerRef} className="h-full w-full" />

            {/* Top-Left HUD Badge */}
            <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col gap-2">
              <div className="rounded-xl border border-white/10 bg-black/75 px-3 py-2 backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-xs font-bold text-white">
                    Globe 2.0 · LOD 1:{activeLodTier}{' '}
                    {activeLodTier === '50m' ? '(High-Res Coastal)' : '(Orbital)'}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-zinc-300">
                  <span>
                    FPS: <strong className="text-emerald-300">{metrics?.fps ?? 60}</strong>
                  </span>
                  <span>
                    Frame: <strong className="text-white">{metrics?.frameTimeMs ?? 1.2} ms</strong>
                  </span>
                  <span>
                    Draw Calls: <strong className="text-sky-300">{metrics?.drawCalls ?? 8}</strong>
                  </span>
                  <span>
                    Triangles:{' '}
                    <strong className="text-white">
                      {(metrics?.triangles ?? 0).toLocaleString()}
                    </strong>
                  </span>
                  <span>
                    Dist:{' '}
                    <strong className="text-amber-300">
                      {metrics?.lod.cameraDistance?.toFixed(2) ?? '5.20'}
                    </strong>
                  </span>
                </div>
              </div>

              {hoveredCountry && (
                <div className="rounded-lg border border-white/15 bg-black/80 px-2.5 py-1.5 text-xs backdrop-blur-md">
                  <span className="font-semibold text-white">{hoveredCountry.name}</span>{' '}
                  <span className="text-zinc-400">({hoveredCountry.isoA3})</span>
                  <span className="ml-2 text-[10px] text-emerald-300 font-mono">
                    1:{hoveredCountry.lodTier} · {hoveredCountry.totalPolygons} poly ·{' '}
                    {hoveredCountry.totalVertices} verts
                  </span>
                </div>
              )}
            </div>

            {layoutMode === 'side-by-side' && (
              <div className="absolute right-3 top-3 z-20">
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 bg-black/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
                  <input
                    type="checkbox"
                    checked={syncCameras}
                    onChange={(e) => setSyncCameras(e.target.checked)}
                    className="accent-red-500"
                  />
                  Synchronize V1 &amp; V2 Camera Pose
                </label>
              </div>
            )}

            {/* Hovered Marker Floating Card */}
            {hoveredMarker && (
              <div
                style={{
                  left: Math.min(hoveredMarker.screenPos.x + 14, 520),
                  top: Math.max(hoveredMarker.screenPos.y - 24, 16),
                }}
                className="pointer-events-none absolute z-30 max-w-xs rounded-xl border border-white/20 bg-[#0d1017]/95 p-2.5 shadow-2xl backdrop-blur-md"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor:
                        MARKER_CATEGORY_COLORS[hoveredMarker.marker.category] ?? '#ff3b4a',
                    }}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    {hoveredMarker.marker.category}
                  </span>
                  {hoveredMarker.marker.official && (
                    <span className="rounded bg-red-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-red-300">
                      Official
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs font-bold text-white">
                  {hoveredMarker.marker.name}
                </div>
                <div className="text-[11px] text-zinc-300">
                  {hoveredMarker.marker.city}, {hoveredMarker.marker.country}
                </div>
                <div className="mt-1 font-mono text-[10px] text-emerald-300">
                  lat {hoveredMarker.marker.lat.toFixed(4)}° · lon{' '}
                  {hoveredMarker.marker.lon.toFixed(4)}°
                </div>
              </div>
            )}

            {/* Phase 9 Marker Coordinates Screen Overlay */}
            {debugState.markerCoordinates && screenMarkerCoords.length > 0 && (
              <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
                {screenMarkerCoords.map((mc) => (
                  <div
                    key={mc.id}
                    style={{
                      transform: `translate(${mc.screenX + 10}px, ${mc.screenY - 12}px)`,
                    }}
                    className="absolute rounded border border-amber-400/40 bg-black/85 px-1.5 py-0.5 font-mono text-[9px] leading-tight text-amber-200 shadow"
                  >
                    <div className="font-sans font-bold text-white">{mc.name}</div>
                    <div>
                      ({mc.lat}°, {mc.lon}°)
                    </div>
                    <div className="text-zinc-400">
                      [{mc.pos3D[0]}, {mc.pos3D[1]}, {mc.pos3D[2]}]
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Active Engineering Tab Content */}
        <aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-white/10 bg-[#0b0d13]/95 p-3.5 text-xs">
          {activeTab === 'inspector' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-zinc-200">
                  <Search size={14} className="text-red-400" />
                  Geographic Inspector (Phase 9)
                </div>
                <span className="font-mono text-[10px] text-emerald-300">
                  Active LOD 1:{activeLodTier}
                </span>
              </div>

              {!inspection ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center text-zinc-400">
                  Click any landmass, country border, polygon ring, or location marker on the globe to inspect its source GeoJSON geometry and 3D spherical coordinates.
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-red-500/20 border border-red-500/40 px-2 py-0.5 text-[10px] font-bold uppercase text-red-300">
                        {inspection.kind} (1:{inspection.lodTier})
                      </span>
                      <span className="font-mono text-[10px] text-zinc-400">
                        R = {inspection.surfaceRadius}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="rounded-lg bg-black/50 p-2">
                        <div className="text-[10px] text-zinc-400">Geographic (Lat, Lon)</div>
                        <div className="mt-0.5 font-mono text-xs font-bold text-emerald-300">
                          {inspection.clickedLatLon[0]}°, {inspection.clickedLatLon[1]}°
                        </div>
                      </div>
                      <div className="rounded-lg bg-black/50 p-2">
                        <div className="text-[10px] text-zinc-400">3D Sphere [X, Y, Z]</div>
                        <div className="mt-0.5 font-mono text-[11px] font-semibold text-sky-300">
                          [{inspection.clickedPosition3D.join(', ')}]
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      Layer: <span className="text-zinc-200">{inspection.renderingLayer}</span>
                    </div>
                  </div>

                  {inspection.marker && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-sm">
                          {inspection.marker.marker.name}
                        </span>
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-300">
                          {inspection.marker.marker.category}
                        </span>
                      </div>
                      <div className="text-zinc-300">
                        {inspection.marker.marker.city}, {inspection.marker.marker.country}
                      </div>
                      {inspection.marker.marker.description && (
                        <p className="text-[11px] text-zinc-300 leading-relaxed">
                          {inspection.marker.marker.description}
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-1.5 pt-1 font-mono text-[10px]">
                        <div className="rounded bg-black/50 p-1.5">
                          <span className="block text-zinc-400">Surface Anchor 3D</span>
                          <span className="text-white">
                            [{inspection.marker.surfacePosition3D.join(', ')}]
                          </span>
                        </div>
                        <div className="rounded bg-black/50 p-1.5">
                          <span className="block text-zinc-400">Angular Error</span>
                          <span className="text-emerald-400 font-bold">
                            {inspection.marker.angularErrorDeg.toFixed(8)}° (Exact)
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {inspection.country && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-white">
                            {inspection.country.name}
                          </h3>
                          <p className="text-[10px] text-zinc-400">
                            ISO-A3: <strong className="text-zinc-200">{inspection.country.isoA3}</strong> ·
                            ISO-A2: <strong className="text-zinc-200">{inspection.country.isoA2}</strong> ·
                            LOD 1:{inspection.country.lodTier}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            inspection.country.isValid
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-red-500/20 text-red-300 border border-red-500/40'
                          }`}
                        >
                          {inspection.country.isValid ? 'VALID TOPOLOGY' : 'GEOMETRY WARNING'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 text-center">
                        <div className="rounded bg-black/50 p-1.5">
                          <div className="text-[10px] text-zinc-400">Polygons / Holes</div>
                          <div className="font-semibold text-white">
                            {inspection.country.totalPolygons} / {inspection.country.totalHoles}
                          </div>
                        </div>
                        <div className="rounded bg-black/50 p-1.5">
                          <div className="text-[10px] text-zinc-400">Active Verts</div>
                          <div className="font-semibold text-emerald-300">
                            {inspection.country.totalVertices.toLocaleString()} (1:{inspection.country.lodTier})
                          </div>
                        </div>
                        <div className="rounded bg-black/50 p-1.5">
                          <div className="text-[10px] text-zinc-400">110m / 50m / V1</div>
                          <div className="font-mono text-[10px] font-semibold text-sky-300">
                            {inspection.country.lod110mVertexCount ?? '—'} /{' '}
                            {inspection.country.lod50mVertexCount ?? 'lazy'} /{' '}
                            {inspection.country.v1HybridVertexCount ?? '—'}
                          </div>
                        </div>
                      </div>

                      <div className="rounded bg-black/50 p-2 font-mono text-[10px] text-zinc-300">
                        <div>
                          BBox: [{inspection.country.bbox[0]}°, {inspection.country.bbox[1]}°] → [
                          {inspection.country.bbox[2]}°, {inspection.country.bbox[3]}°]
                        </div>
                        <div>
                          Clicked Polygon #{inspection.country.polygonIndex}:{' '}
                          {inspection.country.polygonVertexCount} verts ·{' '}
                          {inspection.country.polygonHoleCount} holes
                        </div>
                      </div>

                      <div>
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          Polygon Ring Diagnostics
                        </div>
                        <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                          {inspection.country.ringDiagnostics.map((rd) => (
                            <div
                              key={rd.ringIndex}
                              className="flex items-center justify-between rounded bg-black/60 px-2 py-1 font-mono text-[10px]"
                            >
                              <span>
                                Ring #{rd.ringIndex} ({rd.isHole ? 'Interior Hole' : 'Exterior'})
                              </span>
                              <span className="text-zinc-300">
                                {rd.vertexCount} pts · {rd.windingOrder} ·{' '}
                                {rd.closedInSource ? 'Closed' : 'Open'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {inspection.country.v1Defects.length > 0 && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5">
                          <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-300">
                            <AlertTriangle size={12} />
                            Legacy Globe V1 Defects Fixed Here
                          </div>
                          <ul className="list-disc space-y-1 pl-4 text-[11px] text-red-100/90">
                            {inspection.country.v1Defects.map((defect, idx) => (
                              <li key={idx}>{defect}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {inspection.country.warnings.length > 0 && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
                          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                            Spherical Seam &amp; Polar Handling
                          </div>
                          <ul className="list-disc space-y-1 pl-4 text-[11px] text-amber-100/90">
                            {inspection.country.warnings.map((w, idx) => (
                              <li key={idx}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'validation' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div>
                  <h2 className="font-bold uppercase tracking-wider text-white">
                    Phase 7 — Landmark Validation Suite
                  </h2>
                  <p className="text-[10px] text-zinc-400">
                    Mathematical forward/inverse projection &amp; 1:110m / 1:50m boundary verification
                  </p>
                </div>
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                  {passedValidationCount}/{validationResults.length} PASS
                </span>
              </div>

              <div className="space-y-2">
                {validationResults.map((res) => (
                  <div
                    key={res.id}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-white">{res.name}</span>{' '}
                        <span className="text-zinc-400">
                          ({res.country} · {res.countryIso})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          engineRef.current?.flyToLatLon(res.expectedLat, res.expectedLon, 3.45, 800);
                          engineRef.current?.inspectCoordinate(res.expectedLat, res.expectedLon);
                        }}
                        className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-zinc-200 hover:bg-white/15"
                      >
                        Fly To (1:50m)
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-1 font-mono text-[10px] text-zinc-300">
                      <div>
                        WGS84: ({res.expectedLat}°, {res.expectedLon}°)
                      </div>
                      <div>
                        3D: [{res.calculated3D.join(', ')}]
                      </div>
                      <div className="text-emerald-300">
                        Error: {res.angularErrorDeg}° ({res.greatCircleErrorMeters} m)
                      </div>
                      <div>
                        Hit: <strong className="text-white">{res.detectedCountryIso}</strong> (110m{' '}
                        {res.countryHitMatch110m ? '✓' : '✗'} · 50m{' '}
                        {res.countryHitMatch50m ? '✓' : '✗'})
                      </div>
                    </div>

                    <p className="text-[10px] text-zinc-400 border-t border-white/5 pt-1">
                      {res.v1CoastlineNote}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'benchmarks' && (
            <div className="space-y-3">
              <div className="border-b border-white/10 pb-2">
                <h2 className="font-bold uppercase tracking-wider text-white">
                  Phase 6 — Performance &amp; Adaptive LOD Benchmark
                </h2>
                <p className="text-[10px] text-zinc-400">
                  Live WebGL telemetry &amp; 3-way comparison (Legacy V1 vs V2 1:110m vs V2 1:50m)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-black/50 p-2.5">
                  <div className="text-[10px] text-zinc-400">Frame Rate / Cost</div>
                  <div className="mt-0.5 text-base font-bold text-emerald-400">
                    {metrics?.fps ?? 60} FPS{' '}
                    <span className="text-xs font-normal text-zinc-300">
                      ({metrics?.frameTimeMs ?? 1.2} ms)
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/50 p-2.5">
                  <div className="text-[10px] text-zinc-400">WebGL Draw Calls</div>
                  <div className="mt-0.5 text-base font-bold text-sky-400">
                    {metrics?.drawCalls ?? 8}{' '}
                    <span className="text-xs font-normal text-zinc-400">calls/frame</span>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/50 p-2.5">
                  <div className="text-[10px] text-zinc-400">
                    Active Triangles (1:{activeLodTier})
                  </div>
                  <div className="mt-0.5 text-sm font-bold text-white">
                    {(metrics?.triangles ?? 0).toLocaleString()}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/50 p-2.5">
                  <div className="text-[10px] text-zinc-400">Ray-Sphere + Country Pick</div>
                  <div className="mt-0.5 text-sm font-bold text-amber-300">
                    {metrics?.lastPickTimeMs ?? 0.02} ms
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/50 p-2.5">
                  <div className="text-[10px] text-zinc-400">1:110m / 1:50m Build</div>
                  <div className="mt-0.5 text-sm font-bold text-white">
                    {metrics?.lod.tier110mBuildMs ?? 38}ms /{' '}
                    {metrics?.lod.tier50mBuildMs ? `${metrics.lod.tier50mBuildMs}ms` : 'Lazy'}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/50 p-2.5">
                  <div className="text-[10px] text-zinc-400">Cached LOD Swap Cost</div>
                  <div className="mt-0.5 text-sm font-bold text-emerald-300">
                    {metrics?.lod.lastSwapDurationMs ?? 0.0} ms ({metrics?.lod.swapCount ?? 0} swaps)
                  </div>
                </div>
              </div>

              {/* 3-Way Comparison Table */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-200">
                  3-Way Comparison: V1 vs V2 (1:110m) vs V2 (1:50m)
                </div>
                <table className="w-full text-left text-[10px]">
                  <thead>
                    <tr className="border-b border-white/10 text-zinc-400">
                      <th className="py-1">Metric</th>
                      <th className="py-1 text-amber-300">Original V1</th>
                      <th className="py-1 text-sky-300">V2 1:110m</th>
                      <th className="py-1 text-emerald-300">V2 1:50m</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-zinc-200">
                    <tr>
                      <td className="py-1.5">Australia Verts</td>
                      <td className="py-1.5 text-amber-300">29 (2 polys)</td>
                      <td className="py-1.5 text-sky-300">108 (2 polys)</td>
                      <td className="py-1.5 text-emerald-300 font-semibold">1,773 (42 polys)</td>
                    </tr>
                    <tr>
                      <td className="py-1.5">New Zealand Verts</td>
                      <td className="py-1.5 text-amber-300">10 (2 diamonds)</td>
                      <td className="py-1.5 text-sky-300">38 (2 polys)</td>
                      <td className="py-1.5 text-emerald-300 font-semibold">762 (13 polys)</td>
                    </tr>
                    <tr>
                      <td className="py-1.5">Global Polygons</td>
                      <td className="py-1.5 text-amber-300">185 (85 null)</td>
                      <td className="py-1.5 text-sky-300">312 (0 null)</td>
                      <td className="py-1.5 text-emerald-300 font-semibold">1,620 (0 null)</td>
                    </tr>
                    <tr>
                      <td className="py-1.5">Global Vertices</td>
                      <td className="py-1.5 text-amber-300">2,619</td>
                      <td className="py-1.5 text-sky-300">5,685</td>
                      <td className="py-1.5 text-emerald-300 font-semibold">96,557</td>
                    </tr>
                    <tr>
                      <td className="py-1.5">4K Bitmap Atlas</td>
                      <td className="py-1.5 text-amber-300">~90 MB GPU</td>
                      <td className="py-1.5 text-sky-300">0 MB</td>
                      <td className="py-1.5 text-emerald-300 font-semibold">0 MB</td>
                    </tr>
                    <tr>
                      <td className="py-1.5">Scene Draw Calls</td>
                      <td className="py-1.5 text-amber-300">165–6,000+</td>
                      <td className="py-1.5 text-sky-300">8–10 calls</td>
                      <td className="py-1.5 text-emerald-300 font-semibold">8–10 calls</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'defects-parity' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-bold uppercase tracking-wider text-white">
                  Phase 2 &amp; 8 — Root-Cause Defects Fixed ({GLOBE_V2_IDENTIFIED_ISSUES.length})
                </h2>
                <p className="text-[10px] text-zinc-400 mb-2">
                  Click &ldquo;Inspect Region&rdquo; on any defect to fly the camera and verify the fix.
                </p>
                <div className="space-y-2">
                  {GLOBE_V2_IDENTIFIED_ISSUES.map((issue) => (
                    <div
                      key={issue.id}
                      className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-red-300">
                          {issue.id} · {issue.severity}
                        </span>
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                          {issue.status}
                        </span>
                      </div>
                      <div className="font-bold text-white">{issue.title}</div>
                      <div className="text-[10px] text-zinc-400">Region: {issue.affectedRegion}</div>
                      <p className="text-[11px] text-zinc-300">
                        <strong className="text-red-300">V1 Cause:</strong> {issue.rootCauseInV1}
                      </p>
                      <p className="text-[11px] text-zinc-300">
                        <strong className="text-emerald-300">V2 Fix:</strong> {issue.v2Resolution}
                      </p>
                      {issue.presetId && (
                        <button
                          type="button"
                          onClick={() => {
                            const preset = GEOGRAPHIC_CAMERA_PRESETS.find(
                              (p) => p.id === issue.presetId,
                            );
                            if (preset) handleApplyPreset(preset);
                          }}
                          className="mt-1 inline-flex items-center gap-1 rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-white/15"
                        >
                          <Navigation size={10} />
                          Inspect Region on Globe
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-white/10 pt-3">
                <h2 className="font-bold uppercase tracking-wider text-white mb-2">
                  Phase 5 — Feature Parity Checklist ({GLOBE_V2_FEATURE_PARITY_INVENTORY.length})
                </h2>
                <div className="space-y-2">
                  {GLOBE_V2_FEATURE_PARITY_INVENTORY.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">{item.feature}</span>
                        <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                          {item.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400">
                        <strong>V1:</strong> {item.v1Implementation}
                      </p>
                      <p className="text-[10px] text-emerald-200">
                        <strong>V2:</strong> {item.v2Implementation}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default Globe2LabPage;
