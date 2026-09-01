import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { GlobeV1RuntimeEvent } from '../../data/globeV1MockData';
import { createVenueLabelElement } from '../../src/features/globe/runtime/GlobeMarker.js';
import {
  HYBRID_MARKER_COLORS as MARKER_COLORS,
  HYBRID_MARKER_IMAGE_IDS as MARKER_IMAGE_IDS,
  makeHybridMarkerImage,
  type HybridMarkerShape as MarkerShape,
} from './hybridMarkerSprites';

const MARKER_SOURCE_ID = 'swingsphere-unified-markers';
const MARKER_HIT_LAYER_ID = 'swingsphere-unified-marker-hit';
const MARKER_LAYER_ID = 'swingsphere-unified-marker-symbols';
const SELECTED_MARKER_PULSE_LAYER_ID = 'swingsphere-unified-selected-pulse';
const SELECTED_MARKER_LAYER_ID = 'swingsphere-unified-selected-symbol';

const DEFAULT_WORLD_CAMERA = { lng: -18, lat: 18, zoom: 0.8 };
const CARTO_GLOBE_STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export type HybridPrototypeCamera = {
  lng: number;
  lat: number;
  zoom: number;
  pixelsPerRadian?: number;
};

export type HybridPrototypeController = {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomByWheel: (deltaY: number) => void;
  panByPixels: (dx: number, dy: number) => void;
  selectAtPoint: (x: number, y: number) => void;
  returnToWorld: () => void;
};

type Props = {
  camera: HybridPrototypeCamera;
  fadeStart: number;
  fadeEnd: number;
  interactive: boolean;
  markers: GlobeV1RuntimeEvent[];
  selectedMarkerId: string | null;
  onMarkerSelect: (marker: GlobeV1RuntimeEvent) => void;
  onCameraChange: (camera: HybridPrototypeCamera) => void;
  onBlendChange: (blend: number) => void;
  onControllerReady?: (controller: HybridPrototypeController | null) => void;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const markerColorForType = (type: GlobeV1RuntimeEvent['entityType'], active = false) => {
  if (type === 'club') return active ? MARKER_COLORS.clubActive : MARKER_COLORS.club;
  if (type === 'promoter') return active ? MARKER_COLORS.promoterActive : MARKER_COLORS.promoter;
  return active ? MARKER_COLORS.eventActive : MARKER_COLORS.event;
};

const buildMarkerCollection = (markers: GlobeV1RuntimeEvent[]): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
  type: 'FeatureCollection',
  features: markers.map((marker) => ({
    type: 'Feature',
    id: marker.id,
    properties: {
      markerId: marker.id,
      listingId: marker.listingId,
      organizationId: marker.organizationId ?? '',
      entityType: marker.entityType,
      name: marker.name,
    },
    geometry: {
      type: 'Point',
      coordinates: [marker.lon, marker.lat],
    },
  })),
});

const addMarkerImages = (map: MapLibreMap) => {
  const definitions: Array<[string, MarkerShape, string]> = [
    [MARKER_IMAGE_IDS.club, 'diamond', MARKER_COLORS.club],
    [MARKER_IMAGE_IDS.event, 'circle', MARKER_COLORS.event],
    [MARKER_IMAGE_IDS.promoter, 'square', MARKER_COLORS.promoter],
  ];
  definitions.forEach(([id, shape, color]) => {
    if (!map.hasImage(id)) {
      map.addImage(id, makeHybridMarkerImage(shape, color), { pixelRatio: 2 });
    }
  });
};

const markerIconExpression = [
  'match',
  ['get', 'entityType'],
  'club',
  MARKER_IMAGE_IDS.club,
  'promoter',
  MARKER_IMAGE_IDS.promoter,
  MARKER_IMAGE_IDS.event,
] as maplibregl.ExpressionSpecification;

const addMarkerLayers = (map: MapLibreMap, markers: GlobeV1RuntimeEvent[]) => {
  if (!map.getSource(MARKER_SOURCE_ID)) {
    map.addSource(MARKER_SOURCE_ID, {
      type: 'geojson',
      data: buildMarkerCollection(markers),
    });
  }

  if (!map.getLayer(SELECTED_MARKER_PULSE_LAYER_ID)) {
    map.addLayer({
      id: SELECTED_MARKER_PULSE_LAYER_ID,
      type: 'circle',
      source: MARKER_SOURCE_ID,
      filter: ['==', ['get', 'markerId'], '__none__'],
      paint: {
        'circle-pitch-alignment': 'viewport',
        'circle-color': 'rgba(255,255,255,0.08)',
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 11, 5, 14, 12, 18, 18, 22],
        'circle-stroke-color': 'rgba(255,255,255,0.96)',
        'circle-stroke-width': 2,
        'circle-opacity': 0.88,
        'circle-blur': 0.16,
      },
    });
  }

  if (!map.getLayer(MARKER_LAYER_ID)) {
    map.addLayer({
      id: MARKER_LAYER_ID,
      type: 'symbol',
      source: MARKER_SOURCE_ID,
      filter: ['!=', ['get', 'markerId'], '__none__'],
      layout: {
        'icon-image': markerIconExpression,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 0, 0.44, 4, 0.48, 8, 0.56, 13, 0.64, 18, 0.72],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-pitch-alignment': 'viewport',
        'icon-rotation-alignment': 'viewport',
      },
      paint: {
        'icon-opacity': 0.92,
      },
    });
  }

  if (!map.getLayer(SELECTED_MARKER_LAYER_ID)) {
    map.addLayer({
      id: SELECTED_MARKER_LAYER_ID,
      type: 'symbol',
      source: MARKER_SOURCE_ID,
      filter: ['==', ['get', 'markerId'], '__none__'],
      layout: {
        'icon-image': markerIconExpression,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 0, 0.56, 4, 0.62, 8, 0.72, 13, 0.8, 18, 0.9],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-pitch-alignment': 'viewport',
        'icon-rotation-alignment': 'viewport',
      },
      paint: {
        'icon-opacity': 1,
      },
    });
  }

  if (!map.getLayer(MARKER_HIT_LAYER_ID)) {
    map.addLayer({
      id: MARKER_HIT_LAYER_ID,
      type: 'circle',
      source: MARKER_SOURCE_ID,
      paint: {
        'circle-pitch-alignment': 'viewport',
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 11, 6, 14, 12, 17, 18, 20],
        'circle-color': '#000000',
        'circle-opacity': 0.001,
      },
    });
  }
};

const updateSelectedFilters = (map: MapLibreMap, selectedMarkerId: string | null) => {
  const selected = selectedMarkerId ?? '__none__';
  if (map.getLayer(MARKER_LAYER_ID)) {
    map.setFilter(MARKER_LAYER_ID, ['!=', ['get', 'markerId'], selected]);
  }
  if (map.getLayer(SELECTED_MARKER_LAYER_ID)) {
    map.setFilter(SELECTED_MARKER_LAYER_ID, ['==', ['get', 'markerId'], selected]);
  }
  if (map.getLayer(SELECTED_MARKER_PULSE_LAYER_ID)) {
    map.setFilter(SELECTED_MARKER_PULSE_LAYER_ID, ['==', ['get', 'markerId'], selected]);
  }
};

const resolveMarkerSubtitle = (marker: GlobeV1RuntimeEvent) =>
  marker.hostRegionLabel
  ?? marker.listing?.geopoint?.address?.city
  ?? (marker as GlobeV1RuntimeEvent & { city?: string }).city
  ?? '';

const resolveMarkerLogoUrl = (marker: GlobeV1RuntimeEvent) =>
  marker.organization?.logoImageUrl
  ?? marker.listing?.logoImageUrl
  ?? (marker as GlobeV1RuntimeEvent & { logoImageUrl?: string }).logoImageUrl
  ?? '';

const createSelectedStemElement = (marker: GlobeV1RuntimeEvent) => {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.width = '2px';
  wrapper.style.height = '76px';
  wrapper.style.pointerEvents = 'none';
  wrapper.style.transform = 'translateY(1px)';

  const stem = document.createElement('div');
  stem.style.position = 'absolute';
  stem.style.left = '50%';
  stem.style.bottom = '6px';
  stem.style.width = '2px';
  stem.style.height = '0px';
  stem.style.transform = 'translateX(-50%)';
  stem.style.transformOrigin = 'bottom';
  stem.style.borderRadius = '999px';
  stem.style.background = `linear-gradient(180deg, ${markerColorForType(marker.entityType, true)}, rgba(255,255,255,0.88))`;
  stem.style.boxShadow = `0 0 12px ${markerColorForType(marker.entityType, true)}`;
  stem.style.transition = 'height 260ms cubic-bezier(.2,.85,.25,1)';

  // Reuse the exact same DOM label factory as the Three.js globe so the
  // selected card does not visually change when the authored globe dissolves.
  const label = createVenueLabelElement(
    marker.name,
    resolveMarkerSubtitle(marker),
    marker.countryIso2,
    resolveMarkerLogoUrl(marker),
    true,
  );
  Object.assign(label.style, {
    left: '50%',
    top: 'auto',
    bottom: '54px',
    opacity: '0',
    visibility: 'visible',
    transform: 'translate(-50%, 8px)',
    pointerEvents: 'none',
    transition: 'opacity 180ms ease 90ms, transform 240ms cubic-bezier(.2,.85,.25,1) 60ms',
  });

  wrapper.append(stem, label);

  window.requestAnimationFrame(() => {
    stem.style.height = '44px';
    label.style.opacity = '1';
    label.style.transform = 'translate(-50%, 0)';
  });

  return wrapper;
};

const HybridGlobePrototypeLayer: React.FC<Props> = ({
  camera,
  fadeStart,
  fadeEnd,
  interactive,
  markers,
  selectedMarkerId,
  onMarkerSelect,
  onCameraChange,
  onBlendChange,
  onControllerReady,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const syncingRef = useRef(false);
  const markersRef = useRef(markers);
  const selectedStemRef = useRef<maplibregl.Marker | null>(null);
  const initialWorldCameraRef = useRef<HybridPrototypeCamera>({
    lng: Number.isFinite(camera.lng) ? camera.lng : DEFAULT_WORLD_CAMERA.lng,
    lat: Number.isFinite(camera.lat) ? camera.lat : DEFAULT_WORLD_CAMERA.lat,
    zoom: Number.isFinite(camera.zoom) ? camera.zoom : DEFAULT_WORLD_CAMERA.zoom,
  });
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderFps, setRenderFps] = useState<number | null>(null);
  const [liveZoom, setLiveZoom] = useState(camera.zoom);
  const renderSamplesRef = useRef<number[]>([]);
  const previousRenderAtRef = useRef(0);

  markersRef.current = markers;

  const blend = useMemo(() => {
    const span = Math.max(0.01, fadeEnd - fadeStart);
    return smoothstep((liveZoom - fadeStart) / span);
  }, [fadeEnd, fadeStart, liveZoom]);

  useEffect(() => onBlendChange(blend), [blend, onBlendChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: CARTO_GLOBE_STYLE_URL,
      center: [camera.lng, camera.lat],
      zoom: camera.zoom,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      maxZoom: 19,
      minZoom: 0.2,
      maxPitch: 75,
      renderWorldCopies: false,
      fadeDuration: 0,
      canvasContextAttributes: { alpha: false, antialias: true },
    });
    mapRef.current = map;

    const emitCamera = () => {
      if (syncingRef.current) return;
      const center = map.getCenter();
      const zoom = map.getZoom();
      const centerPx = map.project(center);
      const sampleDegrees = 0.35;
      const sampleRadians = sampleDegrees * Math.PI / 180;
      const northLat = Math.max(-84.5, Math.min(84.5, center.lat + sampleDegrees));
      const northPx = map.project([center.lng, northLat]);
      const northRadians = Math.abs(northLat - center.lat) * Math.PI / 180;
      const northScale = northRadians > 0.00001
        ? Math.hypot(northPx.x - centerPx.x, northPx.y - centerPx.y) / northRadians
        : 0;
      const cosLat = Math.max(0.24, Math.cos(center.lat * Math.PI / 180));
      const eastLng = center.lng + sampleDegrees / cosLat;
      const eastPx = map.project([eastLng, center.lat]);
      const eastScale = Math.hypot(eastPx.x - centerPx.x, eastPx.y - centerPx.y) / sampleRadians;
      const validScales = [northScale, eastScale].filter((value) => Number.isFinite(value) && value > 0);
      const pixelsPerRadian = validScales.length
        ? validScales.reduce((sum, value) => sum + value, 0) / validScales.length
        : undefined;
      setLiveZoom(zoom);
      onCameraChange({ lng: center.lng, lat: center.lat, zoom, pixelsPerRadian });
    };

    const handleMarkerClick = (event: maplibregl.MapLayerMouseEvent) => {
      const markerId = String(event.features?.[0]?.properties?.markerId ?? '');
      if (!markerId) return;
      const marker = markersRef.current.find((candidate) => candidate.id === markerId);
      if (marker) onMarkerSelect(marker);
    };

    const setPointer = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const clearPointer = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('load', () => {
      try {
        map.setProjection({ type: 'globe' });
        map.getContainer().style.background = '#05070a';
        map.getCanvas().style.opacity = '1';
        map.getCanvas().style.visibility = 'visible';
        addMarkerImages(map);
        addMarkerLayers(map, markersRef.current);
        updateSelectedFilters(map, selectedMarkerId);
        map.resize();
        map.on('click', MARKER_HIT_LAYER_ID, handleMarkerClick);
        map.on('mouseenter', MARKER_HIT_LAYER_ID, setPointer);
        map.on('mouseleave', MARKER_HIT_LAYER_ID, clearPointer);
        setIsReady(true);
        setLoadError(null);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : String(error));
      }
    });

    map.on('error', (event) => {
      const message = event.error?.message ?? 'Unknown MapLibre error';
      setLoadError(message);
      console.error('[Unified globe prototype] MapLibre error:', event.error ?? event);
    });

    map.on('render', () => {
      const now = performance.now();
      if (previousRenderAtRef.current > 0) {
        const delta = now - previousRenderAtRef.current;
        if (delta > 0 && delta < 250) {
          const samples = renderSamplesRef.current;
          samples.push(1000 / delta);
          if (samples.length > 45) samples.shift();
          if (samples.length >= 15) {
            setRenderFps(samples.reduce((sum, value) => sum + value, 0) / samples.length);
          }
        }
      }
      previousRenderAtRef.current = now;
    });

    map.on('move', emitCamera);

    const controller: HybridPrototypeController = {
      zoomIn: () => {
        map.easeTo({ zoom: Math.min(19, map.getZoom() + 1.25), duration: 360 });
      },
      zoomOut: () => {
        map.easeTo({ zoom: Math.max(0.2, map.getZoom() - 1.25), duration: 360 });
      },
      zoomByWheel: (deltaY) => {
        const normalized = Math.max(-240, Math.min(240, deltaY));
        const nextZoom = Math.max(0.2, Math.min(19, map.getZoom() - normalized * 0.0048));
        map.stop();
        map.jumpTo({ zoom: nextZoom });
      },
      panByPixels: (dx, dy) => {
        if (!dx && !dy) return;
        map.stop();
        map.panBy([dx, dy], { duration: 0 });
      },
      selectAtPoint: (x, y) => {
        if (!map.isStyleLoaded() || !map.getLayer(MARKER_HIT_LAYER_ID)) return;
        const feature = map.queryRenderedFeatures([x, y], { layers: [MARKER_HIT_LAYER_ID] })[0];
        const markerId = String(feature?.properties?.markerId ?? '');
        if (!markerId) return;
        const marker = markersRef.current.find((candidate) => candidate.id === markerId);
        if (marker) onMarkerSelect(marker);
      },
      returnToWorld: () => {
        const world = initialWorldCameraRef.current;
        map.easeTo({
          center: [world.lng, world.lat],
          zoom: Math.min(world.zoom, 0.9),
          pitch: 0,
          bearing: 0,
          duration: 820,
        });
      },
    };
    onControllerReady?.(controller);

    return () => {
      onControllerReady?.(null);
      selectedStemRef.current?.remove();
      selectedStemRef.current = null;
      map.off('move', emitCamera);
      if (map.getLayer(MARKER_HIT_LAYER_ID)) {
        map.off('click', MARKER_HIT_LAYER_ID, handleMarkerClick);
        map.off('mouseenter', MARKER_HIT_LAYER_ID, setPointer);
        map.off('mouseleave', MARKER_HIT_LAYER_ID, clearPointer);
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    const source = map.getSource(MARKER_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(buildMarkerCollection(markers));
  }, [isReady, markers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    updateSelectedFilters(map, selectedMarkerId);
    selectedStemRef.current?.remove();
    selectedStemRef.current = null;

    if (!selectedMarkerId) return;
    const marker = markers.find((candidate) => candidate.id === selectedMarkerId);
    if (!marker) return;

    selectedStemRef.current = new maplibregl.Marker({
      element: createSelectedStemElement(marker),
      anchor: 'bottom',
      offset: [0, -5],
    })
      .setLngLat([marker.lon, marker.lat])
      .addTo(map);

    const currentCenter = map.getCenter();
    const distance = Math.hypot(currentCenter.lng - marker.lon, currentCenter.lat - marker.lat);
    if (distance > 0.35 || map.getZoom() < 5.2) {
      map.easeTo({
        center: [marker.lon, marker.lat],
        zoom: Math.max(map.getZoom(), 5.2),
        duration: 620,
      });
    }
  }, [isReady, markers, selectedMarkerId]);

  const mapOwnsCamera = interactive;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady || mapOwnsCamera) return;
    const center = map.getCenter();
    const needsSync =
      Math.abs(center.lng - camera.lng) > 0.02 ||
      Math.abs(center.lat - camera.lat) > 0.02 ||
      Math.abs(map.getZoom() - camera.zoom) > 0.02;
    if (!needsSync) return;
    syncingRef.current = true;
    map.jumpTo({ center: [camera.lng, camera.lat], zoom: camera.zoom, pitch: 0, bearing: 0 });
    setLiveZoom(camera.zoom);
    window.requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  }, [camera, isReady, mapOwnsCamera]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handlers = [map.dragPan, map.scrollZoom, map.boxZoom, map.doubleClickZoom, map.keyboard, map.touchZoomRotate];
    handlers.forEach((handler) => mapOwnsCamera ? handler.enable() : handler.disable());
  }, [mapOwnsCamera]);

  return (
    <div
      className={`absolute inset-0 ${mapOwnsCamera ? 'pointer-events-auto' : 'pointer-events-none'}`}
      style={{ pointerEvents: mapOwnsCamera ? 'auto' : 'none', touchAction: mapOwnsCamera ? 'none' : 'auto' }}
      aria-hidden={!interactive}
    >
      <div
        ref={containerRef}
        className="bg-transparent"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: mapOwnsCamera ? 'auto' : 'none',
          touchAction: mapOwnsCamera ? 'none' : 'auto',
        }}
      />
      <div className="pointer-events-none absolute bottom-3 right-3 max-w-sm rounded-lg border border-white/10 bg-black/78 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-300 backdrop-blur-md">
        <div>Unified MapLibre camera · {renderFps ? `${renderFps.toFixed(0)} fps` : isReady ? 'ready' : 'loading style'}</div>
        <div className="mt-1 normal-case tracking-normal text-cyan-200">globe → Mercator · zoom {liveZoom.toFixed(2)} · land dissolve {Math.round(blend * 100)}%</div>
        <div className="mt-1 normal-case tracking-normal text-gray-400">{markers.length} flat sprite marker{markers.length === 1 ? '' : 's'} · circle / diamond / square</div>
        {loadError ? <div className="mt-1 normal-case tracking-normal text-red-300">{loadError}</div> : null}
      </div>
    </div>
  );
};

export default HybridGlobePrototypeLayer;
