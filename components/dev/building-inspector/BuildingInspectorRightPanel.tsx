import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  History,
  Layers,
  MapPin,
  Maximize2,
  Navigation,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Terminal,
  Trash2,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import type { BuildingAsset, Listing, VenueData } from '../../../types';
import type { BuildingInspectorSelectionMode } from './types';

interface BuildingInspectorRightPanelProps {
  // A. Location & Pin
  selectedVenue: Listing | null;
  selectedVenueDisplayName: string;
  persistedSelectedVenue: VenueData | null;
  venueNameDraft: string;
  onVenueNameDraftChange: (name: string) => void;
  onSaveVenueName: () => void;
  venueAddress: string;
  onCopyText: (label: string, text: string) => void;
  onRegeocodeAddress: () => void;
  coordinateDraft: { lat: string; lng: string };
  onCoordinateDraftChange: (update: { lat: string; lng: string }) => void;
  onApplyCoordinates: () => void;
  selectedVenueLocationAudit: { state: string; label: string; reason: string } | null;
  selectedVenueCoords: { lat: number; lng: number } | null;
  pinToFootprintDistanceMeters: number | null;
  onSnapPinToFootprint: () => void;
  mapContainerRef: React.RefObject<HTMLDivElement>;
  streetReferenceStatus: string;
  showStreetFloor: boolean;

  // B. Footprint Selection
  selectionMode: BuildingInspectorSelectionMode;
  onSelectionModeChange: (mode: BuildingInspectorSelectionMode) => void;
  selectedPolygonRecords: any[];
  onRemovePiece: (polygonIndex: number) => void;
  onClearSelection: () => void;
  selectedSummary: {
    count: number;
    areaMeters: number;
    vertexCount: number;
    ringCount: number;
    maxRenderHeightMeters: number | null;
    avgRenderHeightMeters: number | null;
  };
  selectedVenueAsset: BuildingAsset | null;
  loadedBuildingSourceLabel: string;
  onRevertToSaved: () => void;
  onFrameSelection: () => void;

  // C. Recommendation / Match Intelligence
  addressIntelligence: any;
  selectedBuildingEvidence: any;
  onUseRecommendedFootprint: () => void;
  onKeepExisting: () => void;
  onMarkForResearch: () => void;
  generatedBuildingCandidate: any;
  onSelectGeneratedFootprint: () => void;
  selectedBuildingAddress: {
    status: string;
    primary: string | null;
    secondary: string | null;
  };

  // D. Review & Save
  saveStateInfo: {
    label: string;
    shortLabel: string;
    badgeClass: string;
    description: string;
    state: string;
  };
  selectedVenueDependents: {
    clubs: Listing[];
    events: Listing[];
    total: number;
  };
  onSaveBuildingAsset: () => void;
  isLoading: boolean;
  loadingPhase: string | null;

  // E. History
  buildingAssetHistory: any[];
  onRollback: () => void;

  // F. Diagnostics
  resolution: any;
  featureIdInput: string;
  onFeatureIdInputChange: (id: string) => void;
  onLoadFeatureId: () => void;
  loadedFeatureCount: number;
  loadedUniqueIdCount: number;
  selectedPolygonGeoJSONText: string;
  rawGeoJSONText: string;
  forensicReport: any;
  fragmentRecords: any[];
  status: string;
}

export const BuildingInspectorRightPanel: React.FC<BuildingInspectorRightPanelProps> = ({
  selectedVenue,
  selectedVenueDisplayName,
  persistedSelectedVenue,
  venueNameDraft,
  onVenueNameDraftChange,
  onSaveVenueName,
  venueAddress,
  onCopyText,
  onRegeocodeAddress,
  coordinateDraft,
  onCoordinateDraftChange,
  onApplyCoordinates,
  selectedVenueLocationAudit,
  selectedVenueCoords,
  pinToFootprintDistanceMeters,
  onSnapPinToFootprint,
  mapContainerRef,
  streetReferenceStatus,
  showStreetFloor,
  selectionMode,
  onSelectionModeChange,
  selectedPolygonRecords,
  onRemovePiece,
  onClearSelection,
  selectedSummary,
  selectedVenueAsset,
  loadedBuildingSourceLabel,
  onRevertToSaved,
  onFrameSelection,
  addressIntelligence,
  selectedBuildingEvidence,
  onUseRecommendedFootprint,
  onKeepExisting,
  onMarkForResearch,
  generatedBuildingCandidate,
  onSelectGeneratedFootprint,
  selectedBuildingAddress,
  saveStateInfo,
  selectedVenueDependents,
  onSaveBuildingAsset,
  isLoading,
  loadingPhase,
  buildingAssetHistory,
  onRollback,
  resolution,
  featureIdInput,
  onFeatureIdInputChange,
  onLoadFeatureId,
  loadedFeatureCount,
  loadedUniqueIdCount,
  selectedPolygonGeoJSONText,
  rawGeoJSONText,
  forensicReport,
  fragmentRecords,
  status,
}) => {
  // Collapsible section toggles
  const [showLocationSection, setShowLocationSection] = useState(true);
  const [showFootprintSection, setShowFootprintSection] = useState(true);
  const [showRecommendationSection, setShowRecommendationSection] = useState(true);
  const [showReviewSection, setShowReviewSection] = useState(true);
  const [showHistorySection, setShowHistorySection] = useState(false);
  const [showDiagnosticsSection, setShowDiagnosticsSection] = useState(false);
  const [showMapReference, setShowMapReference] = useState(true);

  if (!selectedVenue) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-zinc-500">
        <Building2 size={36} className="text-zinc-600 mb-3" />
        <h3 className="text-sm font-semibold text-zinc-300">No Physical Place Selected</h3>
        <p className="mt-1 text-xs text-zinc-500 max-w-xs">
          Select a venue or club from the left Place Browser to inspect its location and footprint.
        </p>
      </div>
    );
  }

  const isReplacingAsset = Boolean(selectedVenueAsset);
  const hasHistory = buildingAssetHistory.some((event) => event.action === 'replace' && event.previousAsset);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-zinc-300">
        {/* ─────────────────────────────────────────────────────────────
            SECTION A: LOCATION & PIN INSPECTOR
           ───────────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-white/10 bg-[#0a0b0f] p-3 shadow-xl">
        <button
          type="button"
          onClick={() => setShowLocationSection((prev) => !prev)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-red-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">Location & Canonical Pin</h3>
          </div>
          {showLocationSection ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
        </button>

        <div className={showLocationSection ? 'mt-3 space-y-2.5 text-xs' : 'hidden'}>
            {/* Venue Name (Editable) */}
            <div>
              <label className="text-[10px] uppercase font-semibold text-zinc-500">Physical Venue Name</label>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="text"
                  value={venueNameDraft}
                  onChange={(e) => onVenueNameDraftChange(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 focus:border-sky-400/50 outline-none"
                />
                {persistedSelectedVenue && venueNameDraft.trim() !== persistedSelectedVenue.name && (
                  <button
                    type="button"
                    disabled={isLoading || !venueNameDraft.trim()}
                    onClick={onSaveVenueName}
                    className="shrink-0 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/25"
                  >
                    Save
                  </button>
                )}
              </div>
            </div>

            {/* Address */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase font-semibold text-zinc-500">Physical Address</label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onCopyText('Venue Address', venueAddress)}
                    title="Copy address"
                    className="p-1 text-zinc-400 hover:text-white"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={onRegeocodeAddress}
                    title="Go to this address: re-geocode it, update the canonical pin after review if needed, and reload the building workspace there"
                    className="flex items-center gap-1 rounded border border-sky-400/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-200 hover:bg-sky-500/20"
                  >
                    <RefreshCw size={10} className={isLoading ? 'animate-spin' : ''} />
                    <span>Go to Address</span>
                  </button>
                </div>
              </div>
              <div className="mt-1 rounded-md border border-white/5 bg-black/30 p-2 text-[11px] text-zinc-300">
                {venueAddress || 'No address specified'}
              </div>
            </div>

            {/* Coordinates */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase font-semibold text-zinc-500">Coordinates (Lat / Lng)</label>
                <div className="flex items-center gap-1">
                  {selectedVenueCoords && (
                    <button
                      type="button"
                      onClick={() => onCopyText('Coordinates', `${selectedVenueCoords.lat.toFixed(6)}, ${selectedVenueCoords.lng.toFixed(6)}`)}
                      title="Copy coordinates"
                      className="p-1 text-zinc-400 hover:text-white"
                    >
                      <Copy size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={onApplyCoordinates}
                    title="Apply and save coordinates"
                    className="flex items-center gap-1 rounded border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/20"
                  >
                    <Check size={10} />
                    <span>Apply Pin Coordinates</span>
                  </button>
                </div>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                <input
                  type="number"
                  step="0.000001"
                  value={coordinateDraft.lat}
                  onChange={(e) => onCoordinateDraftChange({ ...coordinateDraft, lat: e.target.value })}
                  placeholder="Latitude"
                  className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-sky-400/50"
                />
                <input
                  type="number"
                  step="0.000001"
                  value={coordinateDraft.lng}
                  onChange={(e) => onCoordinateDraftChange({ ...coordinateDraft, lng: e.target.value })}
                  placeholder="Longitude"
                  className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-sky-400/50"
                />
              </div>
            </div>

            {/* Pin Audit & Pin-to-Footprint Distance Warning */}
            {selectedVenueLocationAudit && (
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2 flex items-start justify-between gap-2">
                <div>
                  <div className="text-[10px] text-zinc-500 font-semibold uppercase">Pin Audit</div>
                  <div className={`mt-0.5 text-[11px] font-semibold ${
                    selectedVenueLocationAudit.state === 'ready' ? 'text-emerald-300' : 'text-amber-300'
                  }`}>
                    {selectedVenueLocationAudit.label}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{selectedVenueLocationAudit.reason}</div>
                </div>
                {pinToFootprintDistanceMeters !== null && pinToFootprintDistanceMeters > 5 && (
                  <button
                    type="button"
                    onClick={onSnapPinToFootprint}
                    title="Snap pin to footprint center"
                    className="shrink-0 flex items-center gap-1 rounded border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[10px] font-semibold text-sky-200 hover:bg-sky-500/20"
                  >
                    <Navigation size={10} />
                    <span>Snap Pin ({Math.round(pinToFootprintDistanceMeters)}m)</span>
                  </button>
                )}
              </div>
            )}

            {/* Docked 2D Reference Map */}
            <div className="rounded-lg border border-white/10 overflow-hidden bg-black/40">
              <div className="flex items-center justify-between border-b border-white/10 px-2.5 py-1.5 bg-[#08090d]">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-300">
                  <Layers size={11} className="text-sky-400" />
                  <span>2D Reference Map</span>
                  <span className="text-[9px] text-zinc-500">· Synchronized</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-1.5 py-0.2 text-[8px] font-semibold text-sky-200">
                    N ↑
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowMapReference((prev) => !prev)}
                    className="text-zinc-500 hover:text-white p-0.5"
                  >
                    {showMapReference ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  </button>
                </div>
              </div>
              <div className={showMapReference ? 'relative' : 'h-0 overflow-hidden'}>
                <div ref={mapContainerRef} className={showMapReference ? 'h-44 w-full bg-[#050608]' : 'h-0 w-full bg-[#050608]'} />
                {showMapReference && (
                  <div className="absolute bottom-1 left-2 pointer-events-none text-[9px] text-zinc-500 bg-black/60 px-1.5 py-0.5 rounded backdrop-blur-sm">
                    Red = Pin · Green = Selection · Amber = Recommended
                  </div>
                )}
              </div>
            </div>
          </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION B: FOOTPRINT SELECTION (With explicit multi-piece controls)
         ───────────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-white/10 bg-[#0a0b0f] p-3 shadow-xl">
        <button
          type="button"
          onClick={() => setShowFootprintSection((prev) => !prev)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Building2 size={14} className="text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">Footprint Selection</h3>
          </div>
          {showFootprintSection ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
        </button>

        {showFootprintSection && (
          <div className="mt-3 space-y-3 text-xs">
            {/* Selection Mode Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 p-1">
              <span className="pl-1.5 text-[10px] uppercase font-semibold text-zinc-400">Selection Mode:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelectionModeChange('single')}
                  className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
                    selectionMode === 'single'
                      ? 'bg-white/15 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Single Footprint
                </button>
                <button
                  type="button"
                  onClick={() => onSelectionModeChange('multi')}
                  title="Click polygons to add/remove compound building pieces"
                  className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
                    selectionMode === 'multi'
                      ? 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-200'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Multi-Piece Building
                </button>
              </div>
            </div>

            {/* Selection Summary Metrics */}
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2 text-center">
              <div>
                <div className="text-[10px] text-zinc-500 font-semibold uppercase">Pieces</div>
                <div className="mt-0.5 text-sm font-bold text-zinc-100">{selectedSummary.count}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 font-semibold uppercase">Footprint Area</div>
                <div className="mt-0.5 text-sm font-bold text-zinc-100">{Math.round(selectedSummary.areaMeters)} m²</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 font-semibold uppercase">Est. Height</div>
                <div className="mt-0.5 text-sm font-bold text-zinc-100">{selectedSummary.maxRenderHeightMeters?.toFixed(1) ?? '5.0'} m</div>
              </div>
            </div>

            {/* Contextual guidance for compound multi-piece selection */}
            {selectionMode === 'multi' && selectedPolygonRecords.length === 0 && (
              <div className="rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/5 p-2 text-center text-[11px] text-emerald-300/80 leading-relaxed">
                Multi-piece mode active. Click any building in 3D to add pieces to this compound footprint. Click a selected piece again to toggle off.
              </div>
            )}

            {/* Multi-Piece Chips Group (Requirement 5) */}
            {selectedPolygonRecords.length > 0 && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-semibold text-zinc-500">
                    Selected Building Pieces ({selectedPolygonRecords.length})
                  </label>
                  <button
                    type="button"
                    onClick={onClearSelection}
                    className="flex items-center gap-1 text-[10px] font-medium text-zinc-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 size={10} />
                    <span>Clear All</span>
                  </button>
                </div>

                <div className="mt-1.5 flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                  {selectedPolygonRecords.map((record) => (
                    <div
                      key={record.polygonIndex}
                      className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-200"
                    >
                      <span>Piece #{record.polygonIndex + 1}</span>
                      <span className="text-zinc-400">({Math.round(record.areaMeters)} m²)</span>
                      <button
                        type="button"
                        onClick={() => onRemovePiece(record.polygonIndex)}
                        title={`Remove piece #${record.polygonIndex + 1}`}
                        className="ml-0.5 text-zinc-400 hover:text-white"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reverse Geocoded Street Address of Selected Building */}
            {selectedBuildingAddress.primary && (
              <div className="rounded-lg border border-white/5 bg-black/30 p-2">
                <div className="text-[9px] uppercase tracking-wide text-zinc-500 font-semibold">
                  Selected Footprint Address (OSM)
                </div>
                <div className="mt-0.5 text-[11px] font-semibold text-zinc-200">
                  {selectedBuildingAddress.primary}
                </div>
                {selectedBuildingAddress.secondary && (
                  <div className="text-[10px] text-zinc-400">{selectedBuildingAddress.secondary}</div>
                )}
              </div>
            )}

            {/* Quick Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={!selectedSummary.count}
                onClick={onFrameSelection}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-1.5 text-[11px] font-semibold text-zinc-200 hover:bg-white/10 disabled:opacity-40"
              >
                <Maximize2 size={12} />
                <span>Frame Selection</span>
              </button>

              <button
                type="button"
                disabled={!selectedVenueAsset || isLoading}
                onClick={onRevertToSaved}
                title="Discard unsaved edits and revert back to saved canonical BuildingAsset"
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-1.5 text-[11px] font-semibold text-zinc-200 hover:bg-white/10 disabled:opacity-40"
              >
                <RotateCcw size={12} />
                <span>Revert to Saved</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION C: RECOMMENDATION / MATCH INTELLIGENCE
         ───────────────────────────────────────────────────────────── */}
      {selectedBuildingEvidence && (
        <section className="rounded-xl border border-amber-400/20 bg-amber-500/[0.04] p-3 shadow-xl">
          <button
            type="button"
            onClick={() => setShowRecommendationSection((prev) => !prev)}
            className="flex w-full items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-amber-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-200">Recommendation Intelligence</h3>
            </div>
            {showRecommendationSection ? <ChevronDown size={14} className="text-amber-400/60" /> : <ChevronRight size={14} className="text-amber-400/60" />}
          </button>

          {showRecommendationSection && (
            <div className="mt-3 space-y-2 text-[11px]">
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-zinc-400">
                <span className="text-zinc-500">Recommended:</span>
                <span className="text-zinc-200 font-medium">
                  {selectedBuildingEvidence.bestCandidate?.candidateAddress ?? 'Unresolved address'}
                </span>

                <span className="text-zinc-500">Relationship:</span>
                <span className="text-zinc-200">
                  {selectedBuildingEvidence.bestCandidate?.pinIntersects
                    ? 'Pin is inside footprint'
                    : `${selectedBuildingEvidence.bestCandidate?.minimumPinToFootprintMeters.toFixed(1) ?? 'n/a'} m away`}
                </span>

                <span className="text-zinc-500">Match score:</span>
                <span className="text-zinc-200">
                  {selectedBuildingEvidence.outcome} · score {selectedBuildingEvidence.bestCandidate?.score ?? 'n/a'}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={onUseRecommendedFootprint}
                  title="Stage the recommended footprint in 3D (does not save changes)"
                  className="rounded-lg border border-amber-400/40 bg-amber-500/20 py-1.5 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/30"
                >
                  Use Recommended Footprint
                </button>
                <button
                  type="button"
                  disabled={!selectedVenueAsset}
                  onClick={onKeepExisting}
                  className="rounded-lg border border-white/10 bg-white/5 py-1.5 text-[10px] font-semibold text-zinc-300 hover:bg-white/10 disabled:opacity-40"
                >
                  Keep Existing
                </button>
              </div>

              <p className="mt-1 text-[9px] text-zinc-500">
                Using recommended footprint stages the geometry for visual review; Save Building Asset remains the explicit write.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Generated Footprint Card (if applicable) */}
      {generatedBuildingCandidate && (
        <section className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04] p-3 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-200">Reconstructed Footprint Candidate</span>
            <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-1.5 py-0.2 text-[9px] font-semibold text-cyan-200">
              {Math.round(generatedBuildingCandidate.confidence * 100)}% est.
            </span>
          </div>
          <p className="mt-1.5 text-[10px] text-zinc-400 leading-4">
            No sourced building intersected the pin. SwingSphere generated a candidate ({generatedBuildingCandidate.widthMeters.toFixed(0)} × {generatedBuildingCandidate.depthMeters.toFixed(0)}m).
          </p>
          <button
            type="button"
            onClick={onSelectGeneratedFootprint}
            className="mt-2 w-full rounded-lg border border-cyan-400/30 bg-cyan-500/15 py-1.5 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-500/25"
          >
            Select Reconstructed Footprint
          </button>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SECTION D: CANONICAL IMPACT & SAVE
         ───────────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-white/10 bg-[#0a0b0f] p-3 shadow-xl">
        <button
          type="button"
          onClick={() => setShowReviewSection((prev) => !prev)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Save size={14} className="text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">Review & Save</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${saveStateInfo.badgeClass}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {saveStateInfo.shortLabel}
            </span>
            {showReviewSection ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
          </div>
        </button>

        {showReviewSection && (
          <div className="mt-3 space-y-3 text-xs">
            <p className="text-[11px] text-zinc-400 leading-4">
              {saveStateInfo.description}
            </p>

            {/* Downstream Impact Notice */}
            {selectedVenueDependents.total > 0 && (
              <div className="rounded-lg border border-sky-400/20 bg-sky-500/10 p-2 text-[11px] text-sky-200 flex items-start gap-2">
                <Users size={14} className="mt-0.5 shrink-0 text-sky-300" />
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-white">
                    {selectedVenueDependents.total === 1
                      ? 'Affects 1 listing'
                      : `Affects ${selectedVenueDisplayName} and ${selectedVenueDependents.total} listings`}
                  </span>
                  <p className="mt-0.5 text-[10px] text-sky-300/80 leading-4">
                    Canonical edits cascade to {selectedVenueDependents.clubs.length} permanent club{selectedVenueDependents.clubs.length === 1 ? '' : 's'} and {selectedVenueDependents.events.length} dependent event{selectedVenueDependents.events.length === 1 ? '' : 's'} using this physical venue.
                  </p>
                  {selectedVenueDependents.events.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {selectedVenueDependents.events.slice(0, 4).map((evt) => (
                        <span key={evt.id} className="rounded bg-sky-950/60 border border-sky-400/20 px-1.5 py-0.5 text-[9px] text-sky-300 truncate max-w-[140px]">
                          {evt.name}
                        </span>
                      ))}
                      {selectedVenueDependents.events.length > 4 && (
                        <span className="text-[9px] text-sky-400 font-mono py-0.5">
                          +{selectedVenueDependents.events.length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Primary Save Action */}
            <div className="pt-1">
              <button
                type="button"
                disabled={!selectedSummary.count || isLoading}
                onClick={onSaveBuildingAsset}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/20 py-2.5 text-xs font-semibold text-emerald-100 shadow-lg shadow-emerald-950/40 hover:bg-emerald-500/30 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <Save size={14} className={isLoading && loadingPhase === 'Saving building asset' ? 'animate-spin' : ''} />
                <span>
                  {isLoading && loadingPhase === 'Saving building asset'
                    ? 'Saving Building Asset…'
                    : isReplacingAsset
                    ? 'Review & Replace Building Asset'
                    : 'Review & Save Building Asset'}
                </span>
              </button>
              <p className="mt-1.5 text-center text-[10px] text-zinc-500">
                Opens canonical impact review dialog before committing database changes.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION E: HISTORY & AUDIT LOG
         ───────────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-white/10 bg-[#0a0b0f] p-3 shadow-xl">
        <button
          type="button"
          onClick={() => setShowHistorySection((prev) => !prev)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <History size={14} className="text-zinc-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">Revision History</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-zinc-400 font-mono">
              {buildingAssetHistory.length} events
            </span>
            {showHistorySection ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
          </div>
        </button>

        {showHistorySection && (
          <div className="mt-3 space-y-2 text-xs">
            {hasHistory ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={onRollback}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/15 py-1.5 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/25 disabled:opacity-40"
                >
                  <RotateCcw size={12} />
                  <span>Rollback to Revision…</span>
                </button>
                <p className="text-[10px] text-zinc-500 text-center">
                  Rollback restores the previous revision as an append-only audit event.
                </p>
              </div>
            ) : (
              <div className="text-[11px] text-zinc-500 text-center py-2">
                No previous revisions available to rollback.
              </div>
            )}
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION F: DIAGNOSTICS & PROVIDER INTERNALS (Collapsed by default)
         ───────────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-white/10 bg-[#0a0b0f] p-3 shadow-xl">
        <button
          type="button"
          onClick={() => setShowDiagnosticsSection((prev) => !prev)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-zinc-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Developer Diagnostics</h3>
          </div>
          {showDiagnosticsSection ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
        </button>

        {showDiagnosticsSection && (
          <div className="mt-3 space-y-3 text-xs">
            {/* Feature ID lookup */}
            <div>
              <label className="text-[10px] uppercase font-semibold text-zinc-500">Feature ID Manual Lookup</label>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="text"
                  value={featureIdInput}
                  onChange={(e) => onFeatureIdInputChange(e.target.value)}
                  placeholder="OSM / Microsoft ID"
                  className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 font-mono outline-none"
                />
                <button
                  type="button"
                  onClick={onLoadFeatureId}
                  className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                >
                  Load
                </button>
              </div>
            </div>

            {/* Provider Features Count */}
            <div className="rounded-lg border border-white/5 bg-black/30 p-2 text-[10px] text-zinc-400 font-mono">
              <div>Loaded Features: {loadedFeatureCount}</div>
              <div>Unique IDs: {loadedUniqueIdCount}</div>
              <div>Primary Tile: {resolution?.primaryTile ?? 'n/a'}</div>
            </div>

            {/* GeoJSON Preview */}
            <details className="rounded-lg border border-white/5 bg-black/20 p-2">
              <summary className="cursor-pointer text-[10px] font-semibold text-zinc-400">
                Selected Footprint GeoJSON
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto text-[9px] font-mono text-zinc-400 whitespace-pre-wrap">
                {selectedPolygonGeoJSONText || 'No footprint selected'}
              </pre>
            </details>

            {/* Fragments */}
            {fragmentRecords.length > 0 && (
              <details className="rounded-lg border border-white/5 bg-black/20 p-2">
                <summary className="cursor-pointer text-[10px] font-semibold text-zinc-400">
                  Tile Fragments ({fragmentRecords.length})
                </summary>
                <div className="mt-2 space-y-1 max-h-36 overflow-auto">
                  {fragmentRecords.map((frag, idx) => (
                    <div key={idx} className="text-[9px] font-mono text-zinc-400 border-b border-white/5 pb-1">
                      Tile: {frag.tile} · ID: {frag.featureId}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Status log */}
            <div className="text-[10px] text-zinc-500 font-mono">
              Status: {status}
            </div>
          </div>
        )}
      </section>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          STICKY BOTTOM ACTION BAR (Pinned regardless of scroll)
         ───────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/10 bg-[#08090d]/98 p-3 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                saveStateInfo.state === 'saved_canonical_loaded'
                  ? 'bg-emerald-400'
                  : saveStateInfo.state.includes('unsaved')
                  ? 'bg-amber-400'
                  : 'bg-zinc-500'
              }`}
            />
            <span className="truncate text-[11px] font-semibold text-zinc-300">
              {saveStateInfo.shortLabel}
            </span>
          </div>
          {selectedVenueDependents.total > 1 && (
            <span className="shrink-0 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[9px] font-semibold text-sky-200">
              {selectedVenueDependents.total} dependents
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {pinToFootprintDistanceMeters !== null && pinToFootprintDistanceMeters > 2 && (
            <button
              type="button"
              onClick={onSnapPinToFootprint}
              title={`Move venue coordinates to center of selected footprint (${pinToFootprintDistanceMeters.toFixed(1)}m away)`}
              className="flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[11px] font-semibold text-zinc-200 hover:bg-white/10 shrink-0"
            >
              <Navigation size={12} className="text-red-400" />
              <span>Snap Pin</span>
            </button>
          )}
          <button
            type="button"
            disabled={!selectedSummary.count || isLoading}
            onClick={onSaveBuildingAsset}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/20 py-2 text-xs font-semibold text-emerald-100 shadow-md shadow-emerald-950/40 hover:bg-emerald-500/30 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Save size={13} className={isLoading && loadingPhase === 'Saving building asset' ? 'animate-spin' : ''} />
            <span className="truncate">
              {isLoading && loadingPhase === 'Saving building asset'
                ? 'Saving…'
                : isReplacingAsset
                ? 'Review & Replace Asset'
                : 'Review & Save Asset'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default BuildingInspectorRightPanel;
