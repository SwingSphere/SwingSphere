import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Geopoint, ListingLocationMeta } from '../../types';
import { swingMapStyle } from '../maps/mapStyle';

type ListingLocationPreviewProps = {
  geopoint: Geopoint | null;
  locationMeta?: ListingLocationMeta;
  resolvedAddress?: string;
  onAdjustPin?: (coords: { latitude: number; longitude: number }) => void;
  className?: string;
  showDetailsOverlay?: boolean;
};

const DEFAULT_CENTER: [number, number] = [-98.5795, 39.8283];

const ListingLocationPreview: React.FC<ListingLocationPreviewProps> = ({
  geopoint,
  locationMeta,
  resolvedAddress,
  onAdjustPin,
  className,
  showDetailsOverlay = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);

  const hasCoords = Boolean(geopoint && Number.isFinite(geopoint.latitude) && Number.isFinite(geopoint.longitude));
  const mapCenter = useMemo<[number, number]>(() => (
    hasCoords && geopoint
      ? [geopoint.longitude, geopoint.latitude]
      : DEFAULT_CENTER
  ), [geopoint, hasCoords]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: swingMapStyle,
      center: mapCenter,
      zoom: hasCoords ? 14.5 : 3.5,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [hasCoords, mapCenter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.easeTo({
      center: mapCenter,
      zoom: hasCoords ? 14.5 : 3.5,
      duration: 300,
    });
  }, [hasCoords, mapCenter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markerRef.current?.remove();
    markerRef.current = null;

    if (!hasCoords || !geopoint) return;

    const markerElement = document.createElement('div');
    markerElement.className = 'listing-location-preview__marker';
    markerElement.style.width = '18px';
    markerElement.style.height = '18px';
    markerElement.style.borderRadius = '9999px';
    markerElement.style.background = '#ff3d3d';
    markerElement.style.boxShadow = '0 0 0 8px rgba(255, 61, 61, 0.18), 0 6px 24px rgba(0, 0, 0, 0.45)';
    markerElement.style.border = '2px solid rgba(255, 255, 255, 0.9)';

    const marker = new maplibregl.Marker({ element: markerElement, anchor: 'center' })
      .setLngLat([geopoint.longitude, geopoint.latitude])
      .addTo(map);

    markerRef.current = marker;
  }, [geopoint, hasCoords]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (event: maplibregl.MapMouseEvent & maplibregl.EventData) => {
      if (!isAdjusting || !onAdjustPin) return;
      onAdjustPin({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
    };

    if (isAdjusting && onAdjustPin) {
      map.getCanvas().style.cursor = 'crosshair';
      map.on('click', handleClick);
    } else {
      map.getCanvas().style.cursor = '';
      map.off('click', handleClick);
    }

    return () => {
      map.off('click', handleClick);
    };
  }, [isAdjusting, onAdjustPin]);

  const validationLabel = locationMeta?.status === 'validated'
    ? 'Validated'
    : locationMeta?.status === 'needs_review'
      ? 'Needs review'
      : locationMeta?.status === 'manual'
        ? 'Manual'
        : 'Unvalidated';

  return (
    <div className={['relative overflow-hidden rounded-2xl border border-white/10 bg-black/40', className].filter(Boolean).join(' ')}>
      <div ref={containerRef} className="h-56 w-full" />
      <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-xs text-white backdrop-blur">
        <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
        {validationLabel}
      </div>
      {!showDetailsOverlay && onAdjustPin && (
        <button
          type="button"
          onClick={() => setIsAdjusting((value) => !value)}
          className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/82"
        >
          {isAdjusting ? 'Done adjusting' : 'Adjust Pin'}
        </button>
      )}
      {showDetailsOverlay && (
      <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-2">
        {resolvedAddress && (
          <div className="rounded-xl border border-white/10 bg-black/72 px-3 py-2 text-xs text-gray-100 backdrop-blur">
            <div className="font-semibold text-white">Verified address</div>
            <div className="mt-1 text-gray-300">{resolvedAddress}</div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="rounded-xl bg-black/72 px-3 py-2 text-xs text-gray-200 backdrop-blur">
            {hasCoords && geopoint
              ? `${geopoint.latitude.toFixed(5)}, ${geopoint.longitude.toFixed(5)}`
              : 'Validation pending'}
          </div>
          {onAdjustPin && (
            <button
              type="button"
              onClick={() => setIsAdjusting((value) => !value)}
              className="rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/12"
            >
              {isAdjusting ? 'Done adjusting' : 'Adjust Pin'}
            </button>
          )}
        </div>
      </div>
      )}
    </div>
  );
};

export default ListingLocationPreview;
