import React, { useEffect, useRef, useState } from 'react';
import { GeoJSON, Pane } from 'react-leaflet';
import type { GeoJsonObject } from 'geojson';

const GLOW_PATH_OPTIONS = {
  color: 'rgba(239, 68, 68, 0.18)',
  weight: 6,
  opacity: 0.18,
  fill: false,
  fillOpacity: 0,
};

const MAIN_PATH_OPTIONS = {
  color: 'rgba(239, 68, 68, 0.9)',
  weight: 2.8,
  opacity: 0.9,
  fill: false,
  fillOpacity: 0,
};

const CountryOutlinesOverlay: React.FC = () => {
  const [geoJson, setGeoJson] = useState<GeoJsonObject | null>(null);
  const hasWarnedRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const load = async () => {
      try {
        const res = await fetch('/geo/countries.json', {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as GeoJsonObject;
        if (!active) return;
        setGeoJson(data);
      } catch (error) {
        if (controller.signal.aborted || !active) return;
        if (hasWarnedRef.current) return;
        hasWarnedRef.current = true;
        console.warn('[CountryOutlinesOverlay] Failed to load /geo/countries.json', error);
      }
    };

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  if (!geoJson) return null;

  return (
    <>
      <Pane name="country-outlines-glow" style={{ zIndex: 340, pointerEvents: 'none' }}>
        <GeoJSON data={geoJson} pathOptions={GLOW_PATH_OPTIONS} interactive={false} />
      </Pane>
      <Pane name="country-outlines" style={{ zIndex: 350, pointerEvents: 'none' }}>
        <GeoJSON data={geoJson} pathOptions={MAIN_PATH_OPTIONS} interactive={false} />
      </Pane>
    </>
  );
};

export default CountryOutlinesOverlay;
