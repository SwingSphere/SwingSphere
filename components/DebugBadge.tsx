import React, { useEffect, useState } from "react";
import { useAppStore } from '../store/appStore';
import {
  MAP_DEBUG_CONTROLS_EVENT,
  MAP_DEBUG_STATE_EVENT,
  defaultMapDebugControls,
  type MapDebugControls,
  type MapDebugState,
} from './maps/mapDebugTypes';

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4 border-b border-white/5 py-1">
    <span className="text-gray-500">{label}</span>
    <span className="max-w-[190px] truncate text-right font-mono text-gray-100">{value ?? '—'}</span>
  </div>
);

const Toggle: React.FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 text-gray-300">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.currentTarget.checked)}
      className="h-3.5 w-3.5 accent-red-500"
    />
    <span>{label}</span>
  </label>
);

const GeometrySourceSelect: React.FC<{
  value: MapDebugControls['geometrySourceMode'];
  onChange: (value: MapDebugControls['geometrySourceMode']) => void;
}> = ({ value, onChange }) => (
  <label className="col-span-2 flex items-center justify-between gap-3 rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-gray-300">
    <span>Geometry Source</span>
    <select
      value={value}
      onChange={(event) => onChange(event.currentTarget.value as MapDebugControls['geometrySourceMode'])}
      className="rounded border border-white/10 bg-black px-2 py-1 text-gray-100 outline-none"
    >
      <option value="auto">Auto</option>
      <option value="asset">Asset</option>
      <option value="runtime">Runtime</option>
    </select>
  </label>
);

const DebugBadge: React.FC = () => {
  const { debugInfo } = useAppStore();
  const { label, extra } = debugInfo;
  const [expanded, setExpanded] = useState(false);
  const [mapDebug, setMapDebug] = useState<MapDebugState | null>(null);
  const [controls, setControls] = useState<MapDebugControls>(defaultMapDebugControls);

  useEffect(() => {
    const handleState = (event: Event) => {
      const detail = (event as CustomEvent<MapDebugState>).detail;
      if (!detail || detail.kind !== 'map-venue-arrival') return;
      setMapDebug(detail);
      setControls(detail.controls);
    };
    window.addEventListener(MAP_DEBUG_STATE_EVENT, handleState);
    return () => window.removeEventListener(MAP_DEBUG_STATE_EVENT, handleState);
  }, []);

  if (typeof window === "undefined") return null;

  const isDebug =
    import.meta.env.DEV ||
    import.meta.env.VITE_DEBUG_MODE === "1" ||
    (() => { try { return window.self !== window.top; } catch { return true; } })();

  if (!isDebug) return null;

  const env = import.meta.env.DEV
    ? "DEV"
    : import.meta.env.VITE_DEBUG_MODE === "1"
    ? "DEBUG"
    : "SANDBOX";

  const updateControl = (key: keyof MapDebugControls, checked: boolean) => {
    const next = { ...controls, [key]: checked };
    setControls(next);
    window.dispatchEvent(new CustomEvent(MAP_DEBUG_CONTROLS_EVENT, { detail: next }));
  };

  const updateGeometrySourceMode = (geometrySourceMode: MapDebugControls['geometrySourceMode']) => {
    const next = { ...controls, geometrySourceMode };
    setControls(next);
    window.dispatchEvent(new CustomEvent(MAP_DEBUG_CONTROLS_EVENT, { detail: next }));
  };

  return (
    <div
      className="fixed bottom-2 right-2 z-[9999] max-h-[calc(100vh-1rem)] w-[min(520px,calc(100vw-1rem))]
                 overflow-hidden rounded-lg border border-red-500/50 bg-black/85 text-[11px]
                 text-gray-200 shadow-[0_0_18px_rgba(255,42,42,0.22)] backdrop-blur-md"
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left font-semibold uppercase tracking-wide text-red-200"
      >
        <span>
          <span>{env}</span>
          <span className="mx-1 text-gray-500">|</span>
          <span>{label}</span>
          {extra && <span className="ml-1 text-[10px] text-gray-500">({extra})</span>}
        </span>
        <span className="text-gray-400">{expanded ? 'Collapse' : 'Venue Debug'}</span>
      </button>

      {expanded && (
        <div className="max-h-[78vh] overflow-y-auto border-t border-white/10 p-3">
          {!mapDebug ? (
            <div className="text-gray-400">No live MapLibre venue debug state published.</div>
          ) : (
            <div className="space-y-4">
              <section className="rounded-md border border-red-500/25 bg-red-950/20 p-2">
                <div className="mb-2 text-xs font-bold uppercase text-red-200">Live Counters</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded bg-black/40 p-2">
                    <div className="text-gray-500">Resolver says should render</div>
                    <div className="font-mono text-lg text-white">Selected: {mapDebug.counters.resolverSelectedCount}</div>
                    <div className="font-mono text-lg text-white">Context: {mapDebug.counters.resolverContextCount}</div>
                  </div>
                  <div className="rounded bg-black/40 p-2">
                    <div className="text-gray-500">Renderer is actually drawing</div>
                    <div className="font-mono text-lg text-white">Selected: {mapDebug.counters.rendererSelectedCount}</div>
                    <div className="font-mono text-lg text-white">Context: {mapDebug.counters.rendererContextCount}</div>
                    <div className="font-mono text-lg text-white">All: {mapDebug.counters.rendererAllExtrusionsCount}</div>
                  </div>
                </div>
              </section>

              <section>
                <div className="mb-1 font-bold uppercase text-red-200">Venue</div>
                <Stat label="Selected listing" value={mapDebug.venue.selectedListingName} />
                <Stat label="Listing id" value={mapDebug.venue.selectedListingId} />
                <Stat label="Selected building id" value={mapDebug.venue.selectedBuildingId} />
                <Stat label="Latitude" value={mapDebug.venue.venueLatitude?.toFixed(7)} />
                <Stat label="Longitude" value={mapDebug.venue.venueLongitude?.toFixed(7)} />
              </section>

              <section>
                <div className="mb-1 font-bold uppercase text-red-200">Interaction</div>
                <Stat label="Selected listing" value={mapDebug.interaction.selectedListingId} />
                <Stat label="Hovered listing" value={mapDebug.interaction.hoveredListingId} />
                <Stat label="Selected building" value={mapDebug.interaction.selectedBuildingId} />
                <Stat label="Selected kind" value={mapDebug.interaction.selectedBuildingKind} />
                <Stat label="Hovered building" value={mapDebug.interaction.hoveredBuildingId} />
                <Stat label="Hovered kind" value={mapDebug.interaction.hoveredBuildingKind} />
              </section>

              <section>
                <div className="mb-1 font-bold uppercase text-red-200">Resolver</div>
                <Stat label="Total building candidates" value={mapDebug.resolver.totalBuildingCandidates} />
                <Stat label="After radius filter" value={mapDebug.resolver.candidatesAfterRadiusFilter} />
                <Stat label="After overlap filter" value={mapDebug.resolver.candidatesAfterOverlapFilter} />
                <Stat label="After duplicate removal" value={mapDebug.resolver.candidatesAfterDuplicateRemoval} />
                <Stat label="Final context count" value={mapDebug.resolver.finalContextBuildingCount} />
                <Stat label="Selected building id" value={mapDebug.resolver.selectedBuildingId} />
                <Stat label="Execution time" value={mapDebug.resolver.executionTimeMs == null ? '—' : `${mapDebug.resolver.executionTimeMs.toFixed(2)}ms`} />
              </section>

              <section>
                <div className="mb-1 font-bold uppercase text-red-200">Rendering</div>
                <Stat label="Fill-extrusion layers" value={mapDebug.rendering.totalFillExtrusionLayers} />
                <Stat label="Selected rendered count" value={mapDebug.rendering.selectedLayerRenderedFeatureCount} />
                <Stat label="Context rendered count" value={mapDebug.rendering.contextLayerRenderedFeatureCount} />
                <Stat label="All rendered buildings" value={mapDebug.rendering.totalRenderedBuildingFeatures} />
                <Stat label="Search radius" value={`${mapDebug.rendering.currentSearchRadius}m`} />
                <Stat label="Zoom" value={mapDebug.rendering.cameraZoom.toFixed(2)} />
                <Stat label="Pitch" value={mapDebug.rendering.cameraPitch.toFixed(1)} />
                <Stat label="Bearing" value={mapDebug.rendering.cameraBearing.toFixed(1)} />
              </section>

              <section>
                <div className="mb-1 font-bold uppercase text-red-200">Layer Audit</div>
                <div className="mb-2 rounded border border-emerald-500/25 bg-emerald-950/15 p-2">
                  <div className="mb-1 font-bold uppercase text-emerald-200">Selected Building Source</div>
                  <Stat label="Source" value={mapDebug.selectedGeometrySource.source} />
                  <Stat label="Reason" value={mapDebug.selectedGeometrySource.reason} />
                  <Stat label="Asset ID" value={mapDebug.selectedGeometrySource.assetId} />
                  <Stat label="Provider Feature" value={mapDebug.selectedGeometrySource.providerFeatureId} />
                  <Stat label="Geometry" value={mapDebug.selectedGeometrySource.geometryType} />
                  <Stat label="Polygons" value={mapDebug.selectedGeometrySource.polygonCount} />
                </div>
                <div className="space-y-1">
                  {mapDebug.layerAudit.length ? mapDebug.layerAudit.map((layer) => (
                    <div key={layer.id} className="rounded border border-white/10 bg-white/[0.03] p-2">
                      <div className="font-mono text-red-100">{layer.id}</div>
                      <div className="grid grid-cols-2 gap-x-3 text-gray-400">
                        <span>source: {layer.source ?? '—'}</span>
                        <span>source-layer: {layer.sourceLayer ?? '—'}</span>
                        <span>visibility: {layer.visibility}</span>
                        <span>opacity: {String(layer.opacity ?? '—')}</span>
                        <span className="col-span-2">rendered: {layer.renderedFeatureCount}</span>
                      </div>
                    </div>
                  )) : <div className="text-gray-500">No fill-extrusion layers.</div>}
                </div>
              </section>

              <section>
                <div className="mb-1 font-bold uppercase text-red-200">Toggle Controls</div>
                <div className="grid grid-cols-2 gap-2">
                  <GeometrySourceSelect value={controls.geometrySourceMode} onChange={updateGeometrySourceMode} />
                  <Toggle label="Show selected building" checked={controls.showSelectedBuilding} onChange={(checked) => updateControl('showSelectedBuilding', checked)} />
                  <Toggle label="Show context buildings" checked={controls.showContextBuildings} onChange={(checked) => updateControl('showContextBuildings', checked)} />
                  <Toggle label="Show all extrusions" checked={controls.showAllExtrusions} onChange={(checked) => updateControl('showAllExtrusions', checked)} />
                  <Toggle label="Show pins" checked={controls.showPins} onChange={(checked) => updateControl('showPins', checked)} />
                  <Toggle label="Show roads" checked={controls.showRoads} onChange={(checked) => updateControl('showRoads', checked)} />
                  <Toggle label="Show labels" checked={controls.showLabels} onChange={(checked) => updateControl('showLabels', checked)} />
                  <Toggle label="Show building IDs" checked={controls.showBuildingIds} onChange={(checked) => updateControl('showBuildingIds', checked)} />
                </div>
              </section>

              <section>
                <div className="mb-1 font-bold uppercase text-red-200">Feature Inspection</div>
                {mapDebug.featureInspection ? (
                  <div className="rounded border border-white/10 bg-white/[0.03] p-2 font-mono">
                    <div>id: {mapDebug.featureInspection.featureId}</div>
                    <div>layer: {mapDebug.featureInspection.renderedByLayer}</div>
                    <div>source-layer: {mapDebug.featureInspection.sourceLayer ?? '—'}</div>
                    <div>geometry: {mapDebug.featureInspection.geometryType}</div>
                    <div>height: {String(mapDebug.featureInspection.renderHeight ?? '—')}</div>
                    <div>min height: {String(mapDebug.featureInspection.renderMinHeight ?? '—')}</div>
                    <div>polygons: {mapDebug.featureInspection.polygonCount}</div>
                    <div>selected: {String(mapDebug.featureInspection.isSelected)}</div>
                    <div>context: {String(mapDebug.featureInspection.isContext)}</div>
                  </div>
                ) : (
                  <div className="text-gray-500">Click an extruded building to inspect its feature.</div>
                )}
              </section>

              <section>
                <div className="mb-1 font-bold uppercase text-red-200">Radius</div>
                <Stat label="Radius" value={`${mapDebug.rendering.currentSearchRadius}m`} />
                <Stat label="Estimated buildings in radius" value={mapDebug.resolver.candidatesAfterRadiusFilter} />
              </section>

              <section>
                <div className="mb-1 font-bold uppercase text-red-200">Event Log</div>
                <div className="max-h-44 space-y-1 overflow-y-auto">
                  {mapDebug.eventLog.map((entry) => (
                    <div key={entry.id} className="rounded bg-white/[0.03] px-2 py-1">
                      <span className="font-mono text-gray-500">{entry.timestamp}</span>
                      <span className="ml-2 text-gray-100">{entry.label}</span>
                      {entry.details && <span className="ml-2 text-gray-500">{entry.details}</span>}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DebugBadge;
