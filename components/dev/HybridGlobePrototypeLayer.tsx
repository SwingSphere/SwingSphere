import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const diagnosticGlobeStyle: StyleSpecification = {
  version: 8,
  name: 'SwingSphere Hybrid Diagnostic Globe',
  sources: {
    land: {
      type: 'geojson',
      data: '/geo/_land/ne_land_simplified.geojson',
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#07101b' },
    },
    {
      id: 'land-fill',
      type: 'fill',
      source: 'land',
      paint: {
        'fill-color': '#24364a',
        'fill-opacity': 0.96,
      },
    },
    {
      id: 'land-outline',
      type: 'line',
      source: 'land',
      paint: {
        'line-color': '#ff4969',
        'line-width': 1.25,
        'line-opacity': 0.9,
      },
    },
  ],
};

export type HybridPrototypeCamera = {
  lng: number;
  lat: number;
  zoom: number;
};

type Props = {
  camera: HybridPrototypeCamera;
  fadeStart: number;
  fadeEnd: number;
  interactive: boolean;
  onCameraChange: (camera: HybridPrototypeCamera) => void;
  onBlendChange: (blend: number) => void;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const HybridGlobePrototypeLayer: React.FC<Props> = ({
  camera,
  fadeStart,
  fadeEnd,
  interactive,
  onCameraChange,
  onBlendChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const syncingRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderFps, setRenderFps] = useState<number | null>(null);
  const renderSamplesRef = useRef<number[]>([]);
  const previousRenderAtRef = useRef(0);

  const blend = useMemo(() => {
    const span = Math.max(0.01, fadeEnd - fadeStart);
    return smoothstep((camera.zoom - fadeStart) / span);
  }, [camera.zoom, fadeEnd, fadeStart]);

  useEffect(() => onBlendChange(blend), [blend, onBlendChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: diagnosticGlobeStyle,
      center: [camera.lng, camera.lat],
      zoom: camera.zoom,
      pitch: 0,
      bearing: 0,
      projection: { type: 'vertical-perspective' },
      attributionControl: false,
      maxZoom: 19,
      minZoom: 0,
      renderWorldCopies: false,
      fadeDuration: 0,
    });
    mapRef.current = map;

    map.on('load', () => {
      try {
        map.resize();
        setIsReady(true);
        setLoadError(null);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : String(error));
      }
      try {
        map.setSky({
          'sky-color': '#020307',
          'sky-horizon-blend': 0.08,
          'horizon-color': '#12070b',
          'horizon-fog-blend': 0.05,
          'fog-color': '#080306',
          'fog-ground-blend': 0.35,
          'atmosphere-blend': 0.08,
        });
      } catch {
        // Sky support differs across MapLibre releases; the prototype still works without it.
      }
    });

    map.on('error', (event) => {
      const message = event.error?.message ?? 'Unknown MapLibre error';
      setLoadError(message);
      console.error('[Hybrid globe prototype] MapLibre error:', event.error ?? event);
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

    const emitCamera = () => {
      if (syncingRef.current) return;
      const center = map.getCenter();
      onCameraChange({ lng: center.lng, lat: center.lat, zoom: map.getZoom() });
    };
    map.on('move', emitCamera);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const mapOwnsCamera = interactive && blend > 0.72;

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
    window.requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  }, [camera, isReady, mapOwnsCamera]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const enabled = mapOwnsCamera;
    const handlers = [map.dragPan, map.scrollZoom, map.boxZoom, map.doubleClickZoom, map.keyboard, map.touchZoomRotate];
    handlers.forEach((handler) => enabled ? handler.enable() : handler.disable());
  }, [mapOwnsCamera]);

  return (
    <div
      className={`absolute inset-0 ${mapOwnsCamera ? 'pointer-events-auto' : 'pointer-events-none'}`}
      style={{ opacity: blend }}
      aria-hidden={!interactive}
    >
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute bottom-3 right-3 max-w-sm rounded-lg border border-white/10 bg-black/78 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-300 backdrop-blur-md">
        <div>MapLibre diagnostic sphere · {renderFps ? `${renderFps.toFixed(0)} fps` : isReady ? 'ready' : 'loading style'}</div>
        <div className="mt-1 normal-case tracking-normal text-cyan-200">Local land source · zoom {camera.zoom.toFixed(2)} · blend {(blend * 100).toFixed(0)}%</div>
        {loadError ? <div className="mt-1 normal-case tracking-normal text-red-300">{loadError}</div> : null}
      </div>
    </div>
  );
};

export default HybridGlobePrototypeLayer;
