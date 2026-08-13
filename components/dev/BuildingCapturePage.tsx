import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { MapGeoJSONFeature } from 'maplibre-gl';
import { ArrowLeft, Copy, Download, Save } from 'lucide-react';
import { useEntityIndex } from '../../hooks/useEntityIndex';
import { isDevRouteEnabled } from '../../lib/devRoutes';
import type { Listing } from '../../types';
import FlatWorldMap from '../maps/FlatWorldMap';

type Bounds = [number, number, number, number];

type VenueCapture = {
  selectedFeature: MapGeoJSONFeature | null;
  selectedBuildingId: string | null;
  contextBuildingIds: string[];
  queriedFeatureCount: number;
  sourceId: string;
  sourceLayer: string;
  source: 'venue-arrival' | 'manual-click' | 'cleared';
};

type CaptureReadinessStatus = {
  arrivalComplete: boolean;
  idleReached: boolean;
  buildingSourceLoaded: boolean;
  sourceFeatureCount: number;
  resolveAttempts: number;
  message: string | null;
};

const STORAGE_KEY = 'swingsphere.dev.buildingCapture.selectedGeometry';

const emptyCaptureReadinessStatus: CaptureReadinessStatus = {
  arrivalComplete: false,
  idleReached: false,
  buildingSourceLoaded: false,
  sourceFeatureCount: 0,
  resolveAttempts: 0,
  message: null,
};

const collectPolygons = (geometry: GeoJSON.Geometry | null | undefined): number[][][][] => {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates as number[][][]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as number[][][][];
  return [];
};

const flattenCoords = (coords: unknown, points: number[][]): void => {
  if (!Array.isArray(coords)) return;
  if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    points.push(coords as number[]);
    return;
  }
  coords.forEach((child) => flattenCoords(child, points));
};

const getGeometryBBox = (geometry: GeoJSON.Geometry | null | undefined): Bounds | null => {
  if (!geometry || !('coordinates' in geometry)) return null;
  const points: number[][] = [];
  flattenCoords(geometry.coordinates, points);
  if (!points.length) return null;
  return points.reduce<Bounds>(
    (bounds, [lng, lat]) => [
      Math.min(bounds[0], lng),
      Math.min(bounds[1], lat),
      Math.max(bounds[2], lng),
      Math.max(bounds[3], lat),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
};

const getFeatureId = (feature: MapGeoJSONFeature | null): string => {
  if (!feature || feature.id === undefined || feature.id === null) return 'n/a';
  return String(feature.id);
};

const getVertexCount = (geometry: GeoJSON.Geometry | null | undefined): number =>
  collectPolygons(geometry).reduce(
    (total, polygon) => total + polygon.reduce((ringTotal, ring) => ringTotal + ring.length, 0),
    0,
  );

const stringifyGeoJSON = (value: unknown): string =>
  JSON.stringify(
    value,
    (_key, current) => (typeof current === 'number' && Number.isFinite(current) ? Number(current.toFixed(8)) : current),
    2,
  );

const formatBounds = (bounds: Bounds | null): string => {
  if (!bounds) return 'n/a';
  return `${bounds[0].toFixed(6)}, ${bounds[1].toFixed(6)} | ${bounds[2].toFixed(6)}, ${bounds[3].toFixed(6)}`;
};

const makeCaptureFeature = (
  capture: VenueCapture,
  listing: Listing | null,
): GeoJSON.Feature | null => {
  const feature = capture.selectedFeature;
  if (!feature?.geometry) return null;
  return {
    type: 'Feature',
    id: feature.id,
    properties: {
      providerFeatureId: getFeatureId(feature),
      providerSource: capture.sourceId,
      providerSourceLayer: capture.sourceLayer,
      captureSource: capture.source,
      listingId: listing?.id ?? null,
      listingName: listing?.name ?? null,
    },
    geometry: feature.geometry as GeoJSON.Geometry,
  };
};

const downloadText = (filename: string, text: string): void => {
  const blob = new Blob([text], { type: 'application/geo+json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const BuildingCapturePage: React.FC = () => {
  const { listings, isLoading, error } = useEntityIndex();
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [capture, setCapture] = useState<VenueCapture | null>(null);
  const [readiness, setReadiness] = useState<CaptureReadinessStatus>(emptyCaptureReadinessStatus);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedListingId && listings.length) {
      setSelectedListingId(listings[0].id);
    }
  }, [listings, selectedListingId]);

  const selectedListing = useMemo(
    () => listings.find((listing) => listing.id === selectedListingId) ?? null,
    [listings, selectedListingId],
  );

  const captureFeature = useMemo(
    () => (capture ? makeCaptureFeature(capture, selectedListing) : null),
    [capture, selectedListing],
  );
  const captureText = useMemo(
    () => (captureFeature ? stringifyGeoJSON(captureFeature) : ''),
    [captureFeature],
  );
  const geometry = capture?.selectedFeature?.geometry ?? null;
  const polygons = collectPolygons(geometry);
  const ringCount = polygons.reduce((total, polygon) => total + polygon.length, 0);
  const vertexCount = getVertexCount(geometry);
  const bbox = getGeometryBBox(geometry);

  const handleCopy = async () => {
    if (!captureText) return;
    await navigator.clipboard.writeText(captureText);
    setStatus('Copied GeoJSON');
  };

  const handleDownload = () => {
    if (!captureText) return;
    const name = selectedListing?.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'venue';
    downloadText(`${name}-building-${capture?.selectedBuildingId ?? 'capture'}.geojson`, captureText);
    setStatus('Downloaded GeoJSON');
  };

  const handleSaveLocal = () => {
    if (!captureText) return;
    window.localStorage.setItem(STORAGE_KEY, captureText);
    setStatus('Saved local capture draft');
  };

  if (!isDevRouteEnabled()) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="relative h-screen overflow-hidden bg-[#050608] text-zinc-100">
      <FlatWorldMap
        listings={listings}
        selectedId={selectedListingId}
        onSelect={setSelectedListingId}
        mode="capture"
        onVenueBuildingCapture={(nextCapture) => {
          setCapture(nextCapture);
          setStatus((currentStatus) => {
            if (nextCapture.selectedFeature) return null;
            if (currentStatus === 'No building source features resident yet') return currentStatus;
            return 'No building resolved for this venue yet';
          });
        }}
        onVenueBuildingCaptureStatus={(nextStatus) => {
          setReadiness(nextStatus);
          if (nextStatus.message) setStatus(nextStatus.message);
        }}
        className="h-full w-full"
      />

      <aside className="absolute left-4 top-4 z-20 flex h-[calc(100vh-2rem)] w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0b0f]/94 shadow-2xl shadow-black/45 backdrop-blur-xl">
        <div className="border-b border-white/10 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-sky-300/80">Dev tool</p>
              <h1 className="mt-1 text-lg font-semibold text-zinc-50">Venue Building Capture</h1>
            </div>
            <Link
              to="/dev/templates"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/10"
            >
              <ArrowLeft size={14} />
              Dev hub
            </Link>
          </div>
        </div>

        <div className="border-b border-white/10 px-4 py-4">
          <label className="text-[11px] uppercase tracking-[0.18em] text-zinc-500" htmlFor="building-capture-listing">
            Venue
          </label>
          <select
            id="building-capture-listing"
            value={selectedListingId ?? ''}
            onChange={(event) => {
              setSelectedListingId(event.target.value || null);
              setCapture(null);
              setReadiness(emptyCaptureReadinessStatus);
              setStatus('Resolving with Venue Arrival');
            }}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-400/60"
          >
            {listings.map((listing) => (
              <option key={listing.id} value={listing.id}>
                {listing.name} | {listing.location}
              </option>
            ))}
          </select>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
            <MiniMetric label="Listings" value={isLoading ? 'loading' : String(listings.length)} />
            <MiniMetric label="Resolver candidates" value={String(capture?.queriedFeatureCount ?? 0)} />
            <MiniMetric label="Provider id" value={capture?.selectedBuildingId ?? 'n/a'} />
            <MiniMetric label="Capture source" value={capture?.source ?? 'n/a'} />
            <MiniMetric label="Arrival complete" value={readiness.arrivalComplete ? 'yes' : 'no'} />
            <MiniMetric label="Idle reached" value={readiness.idleReached ? 'yes' : 'no'} />
            <MiniMetric label="Source loaded" value={readiness.buildingSourceLoaded ? 'yes' : 'no'} />
            <MiniMetric label="Source features" value={String(readiness.sourceFeatureCount)} />
            <MiniMetric label="Resolve attempts" value={String(readiness.resolveAttempts)} />
          </div>
          {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
          {status ? <p className="mt-2 text-xs text-zinc-500">{status}</p> : null}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <section className="rounded-xl border border-white/10 bg-white/5 p-3">
            <h2 className="text-sm font-semibold text-zinc-50">Selected Geometry</h2>
            {captureFeature ? (
              <div className="mt-3 space-y-2 text-xs text-zinc-300">
                <MetricRow label="Geometry type" value={geometry?.type ?? 'n/a'} />
                <MetricRow label="Polygon count" value={String(polygons.length)} />
                <MetricRow label="Ring count" value={String(ringCount)} />
                <MetricRow label="Vertex count" value={String(vertexCount)} />
                <MetricRow label="Bounding box" value={formatBounds(bbox)} />
                <MetricRow label="Source" value={`${capture?.sourceId ?? 'n/a'} / ${capture?.sourceLayer ?? 'n/a'}`} />
                <MetricRow label="Nearby resolved ids" value={String(Math.max(0, (capture?.contextBuildingIds.length ?? 0) - 1))} />
                <pre className="max-h-64 overflow-auto rounded-lg border border-white/10 bg-black/25 p-3 text-[11px] leading-5 text-zinc-200">
                  {captureText}
                </pre>
                <div className="flex flex-wrap gap-2">
                  <ActionButton onClick={handleCopy} icon={<Copy size={14} />} label="Copy GeoJSON" />
                  <ActionButton onClick={handleDownload} icon={<Download size={14} />} label="Export" />
                  <ActionButton onClick={handleSaveLocal} icon={<Save size={14} />} label="Save Draft" />
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-zinc-500">
                Select a venue and wait for Venue Arrival to resolve its building.
              </p>
            )}
          </section>
        </div>
      </aside>

      <div className="pointer-events-none absolute right-4 top-4 z-20 rounded-full border border-white/10 bg-black/40 px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-zinc-300 backdrop-blur-md">
        Venue Arrival capture
      </div>
    </main>
  );
};

const MetricRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
    <span className="text-zinc-500">{label}</span>
    <span className="max-w-[60%] break-words text-right text-zinc-100">{value}</span>
  </div>
);

const MiniMetric: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
    <div className="text-zinc-500">{label}</div>
    <div className="mt-1 break-words text-zinc-100">{value}</div>
  </div>
);

const ActionButton: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({
  icon,
  label,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100 transition-colors hover:bg-emerald-500/18"
  >
    {icon}
    {label}
  </button>
);

export default BuildingCapturePage;
