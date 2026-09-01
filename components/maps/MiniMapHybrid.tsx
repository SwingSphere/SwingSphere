import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, GeoJSON, useMap, Pane } from 'react-leaflet';
import type { GeoJsonObject } from 'geojson';
import 'leaflet/dist/leaflet.css';
import { fetchMajorRoads, type RoadsFetchStatus } from './overpassRoads';
import { withCartoBasemapKey } from './cartoBasemap';

type MiniMapHybridProps = {
  center: { lat: number; lng: number };
  zoom?: number;
  boundaryGeoJson?: GeoJsonObject | null;
  className?: string;
  tintOverlay?: boolean;
  showMajorRoads?: boolean;
  tilesetVersion?: string;
  onRoadsStatusChange?: (status: RoadsFetchStatus) => void;
  cityLabel: string;
  districtLabel?: string;
  mapHref?: string;
  onMapLinkClick?: React.MouseEventHandler<HTMLAnchorElement>;
  onMapLinkAuxClick?: React.MouseEventHandler<HTMLAnchorElement>;
  isHidden?: boolean;
  showAttributionText?: boolean;
};

const MapSizer: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    const id = window.setTimeout(() => map.invalidateSize(), 0);
    return () => window.clearTimeout(id);
  }, [map]);
  return null;
};

const RecenterMap: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: false });
  }, [map, center, zoom]);
  return null;
};

const MiniMapHybrid: React.FC<MiniMapHybridProps> = ({
  center,
  zoom = 14,
  boundaryGeoJson,
  className,
  tintOverlay = true,
  showMajorRoads = false,
  tilesetVersion = 'carto-dark-v1',
  onRoadsStatusChange,
  cityLabel,
  districtLabel,
  mapHref,
  onMapLinkClick,
  onMapLinkAuxClick,
  isHidden = false,
  showAttributionText = true,
}) => {
  const [roadsGeoJson, setRoadsGeoJson] = useState<GeoJsonObject | null>(null);
  const [roadsStatus, setRoadsStatus] = useState<RoadsFetchStatus>('idle');

  const roadsEnabled = showMajorRoads && !isHidden;
  const linkEnabled = Boolean(mapHref) && !isHidden;
  const effectiveZoom = isHidden ? 11 : zoom;
  const mapCenter = useMemo(() => [center.lat, center.lng] as [number, number], [center.lat, center.lng]);
  const showDistrict =
    !isHidden &&
    Boolean(districtLabel?.trim()) &&
    districtLabel?.trim().toLowerCase() !== cityLabel.trim().toLowerCase();
  const districtText = isHidden ? 'Private location' : showDistrict ? districtLabel : null;

  useEffect(() => {
    onRoadsStatusChange?.(roadsStatus);
  }, [roadsStatus, onRoadsStatusChange]);

  useEffect(() => {
    let cancelled = false;
    if (!roadsEnabled) {
      setRoadsGeoJson(null);
      setRoadsStatus('idle');
      return () => {
        cancelled = true;
      };
    }

    setRoadsStatus('loading');
    void fetchMajorRoads({ lat: center.lat, lng: center.lng, zoom: effectiveZoom, tilesetVersion })
      .then((geojson) => {
        if (cancelled) return;
        setRoadsGeoJson(geojson);
        setRoadsStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setRoadsGeoJson(null);
        setRoadsStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [center.lat, center.lng, effectiveZoom, tilesetVersion, roadsEnabled]);

  const wrapperClass = ['minimap-hybrid', linkEnabled ? 'minimap-hybrid__link' : null, className]
    .filter(Boolean)
    .join(' ');

  const mapContent = (
    <>
      <MapContainer
        className="minimap-hybrid__map"
        center={mapCenter}
        zoom={effectiveZoom}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        keyboard={false}
        zoomControl={false}
        boxZoom={false}
        attributionControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url={withCartoBasemapKey('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png')}
          subdomains={['a', 'b', 'c', 'd']}
          maxZoom={20}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        {tintOverlay && (
          <Pane name="tint-pane" style={{ zIndex: 260, pointerEvents: 'none' }}>
            <div className="minimap-hybrid__tint" />
          </Pane>
        )}
        {roadsEnabled && roadsGeoJson && (
          <Pane name="roads-pane" style={{ zIndex: 410 }}>
            <GeoJSON
              data={roadsGeoJson}
              style={{
                color: 'rgba(239, 68, 68, 0.9)',
                weight: Math.max(1.6, Math.min(2.6, effectiveZoom * 0.16)),
                opacity: 0.9,
              }}
            />
          </Pane>
        )}
        {boundaryGeoJson && (
          <Pane name="boundary-pane" style={{ zIndex: 420 }}>
            <GeoJSON
              data={boundaryGeoJson}
              pathOptions={{
                color: 'rgba(239, 68, 68, 0.75)',
                weight: 2,
                fillColor: 'rgba(239, 68, 68, 0.12)',
                fillOpacity: 0.2,
              }}
            />
          </Pane>
        )}
        {!isHidden && (
          <Pane name="pin-pane" style={{ zIndex: 430 }}>
            <CircleMarker
              center={mapCenter}
              radius={12}
              pathOptions={{
                color: 'rgba(239, 68, 68, 0.6)',
                weight: 0,
                fillColor: 'rgba(239, 68, 68, 0.35)',
                fillOpacity: 0.35,
              }}
              interactive={false}
            />
            <CircleMarker
              center={mapCenter}
              radius={5.5}
              pathOptions={{
                color: 'rgba(239, 68, 68, 0.95)',
                weight: 1.4,
                fillColor: 'rgba(246, 244, 238, 0.98)',
                fillOpacity: 0.98,
              }}
              interactive={false}
            />
          </Pane>
        )}
        <RecenterMap center={mapCenter} zoom={effectiveZoom} />
        <MapSizer />
      </MapContainer>
      <div className="minimap-hybrid__label" aria-hidden="true">
        <div className="minimap-hybrid__label-city">{cityLabel}</div>
        {districtText && <div className="minimap-hybrid__label-district">{districtText}</div>}
      </div>
      {showAttributionText && (
        <div className="minimap-hybrid__attribution" aria-hidden="true">
          (c) OpenStreetMap contributors (c) CARTO
        </div>
      )}
    </>
  );

  if (linkEnabled) {
    return (
      <a className={wrapperClass} href={mapHref} target="_blank" rel="noreferrer" onClick={onMapLinkClick} onAuxClick={onMapLinkAuxClick}>
        {mapContent}
      </a>
    );
  }

  return <div className={wrapperClass}>{mapContent}</div>;
};

export default MiniMapHybrid;
