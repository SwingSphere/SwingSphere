import React from 'react';
import {
  Box,
  Compass,
  Grid,
  Layers,
  MapPin,
  Maximize2,
  MousePointer,
  Navigation,
  Redo,
  RefreshCw,
  Square,
  Undo,
} from 'lucide-react';
import type {
  BuildingInspectorViewMode,
  BuildingInspectorWorkspaceMode,
  ManualMassingDrawTool,
} from './types';

interface BuildingInspectorSpatialHudProps {
  viewMode: BuildingInspectorViewMode;
  onViewModeChange: (mode: BuildingInspectorViewMode) => void;
  workspaceMode: BuildingInspectorWorkspaceMode;
  onWorkspaceModeChange: (mode: BuildingInspectorWorkspaceMode) => void;
  showStreetFloor: boolean;
  onToggleStreetFloor: (show: boolean) => void;
  showNearbyBuildings: boolean;
  onToggleNearbyBuildings: (show: boolean) => void;
  showGrid: boolean;
  onToggleGrid: (show: boolean) => void;
  isolateSelected: boolean;
  onToggleIsolateSelected: (isolate: boolean) => void;
  showVenueMarker: boolean;
  onToggleVenueMarker: (show: boolean) => void;
  onFrameSelection: () => void;
  onFrameVenue: () => void;
  hasSelection: boolean;
  hasVenue: boolean;
  compassNeedleRef: React.RefObject<HTMLDivElement>;
  loadedSourceLabel?: string;
  onCycleSource?: () => void;
  activeDrawTool?: ManualMassingDrawTool;
  onSelectDrawTool?: (tool: ManualMassingDrawTool) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const BuildingInspectorSpatialHud: React.FC<BuildingInspectorSpatialHudProps> = ({
  viewMode,
  onViewModeChange,
  workspaceMode,
  onWorkspaceModeChange,
  showStreetFloor,
  onToggleStreetFloor,
  showNearbyBuildings,
  onToggleNearbyBuildings,
  showGrid,
  onToggleGrid,
  isolateSelected,
  onToggleIsolateSelected,
  showVenueMarker,
  onToggleVenueMarker,
  onFrameSelection,
  onFrameVenue,
  hasSelection,
  hasVenue,
  compassNeedleRef,
  loadedSourceLabel,
  onCycleSource,
  activeDrawTool,
  onSelectDrawTool,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) => {
  return (
    <>
      {/* Top Center Workspace Mode Switcher */}
      <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20">
        <div className="pointer-events-auto flex items-center rounded-xl border border-white/10 bg-[#08090d]/95 p-1 shadow-2xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => onWorkspaceModeChange('provider')}
            title="Inspect and select building footprints from OpenStreetMap/Microsoft sources"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              workspaceMode === 'provider'
                ? 'bg-white/15 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Box size={13} className={workspaceMode === 'provider' ? 'text-red-400' : 'text-zinc-500'} />
            <span>Provider Inspection</span>
          </button>
          <button
            type="button"
            onClick={() => onWorkspaceModeChange('manual_massing')}
            title="Upload reference imagery, align overlays, and manually trace missing building footprints"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              workspaceMode === 'manual_massing'
                ? 'border border-indigo-400/40 bg-indigo-500/25 text-indigo-200 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers size={13} className={workspaceMode === 'manual_massing' ? 'text-indigo-400' : 'text-zinc-500'} />
            <span>Reference Overlay & Massing</span>
          </button>
        </div>
      </div>

      {/* Top Left Floating Quick Controls Bar */}
      <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-wrap items-center gap-1.5">
        <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-white/10 bg-[#08090d]/90 p-1 shadow-2xl backdrop-blur-md">
          {/* 3D / 2D Toggle */}
          <button
            type="button"
            onClick={() => onViewModeChange(viewMode === '3d' ? '2d' : '3d')}
            title={viewMode === '3d' ? 'Switch to 2D Overhead top-down view' : 'Switch to 3D Orbit view'}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              viewMode === '2d'
                ? 'border border-sky-400/40 bg-sky-500/20 text-sky-200'
                : 'text-zinc-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            {viewMode === '2d' ? <Compass size={13} /> : <Box size={13} />}
            <span>{viewMode === '2d' ? '2D Top-Down' : '3D Orbit'}</span>
          </button>

          {workspaceMode === 'manual_massing' && onSelectDrawTool && (
            <>
              <div className="h-4 w-px bg-white/10 mx-0.5" />
              <button
                type="button"
                onClick={() => onSelectDrawTool('select')}
                title="Select & move manual buildings"
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                  activeDrawTool === 'select'
                    ? 'border border-indigo-400/40 bg-indigo-500/20 text-indigo-100 font-semibold'
                    : 'text-zinc-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                <MousePointer size={12} />
                <span className="hidden sm:inline">Select</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectDrawTool('rectangle')}
                title="Draw rectangle footprint"
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                  activeDrawTool === 'rectangle'
                    ? 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-100 font-semibold'
                    : 'text-zinc-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Square size={12} />
                <span className="hidden sm:inline">Rectangle</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectDrawTool('polygon')}
                title="Draw polygon footprint"
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                  activeDrawTool === 'polygon'
                    ? 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-100 font-semibold'
                    : 'text-zinc-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Box size={12} />
                <span className="hidden sm:inline">Polygon</span>
              </button>
              {onUndo && (
                <button
                  type="button"
                  disabled={!canUndo}
                  onClick={onUndo}
                  title="Undo (Ctrl+Z)"
                  className="p-1 rounded text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
                >
                  <Undo size={12} />
                </button>
              )}
              {onRedo && (
                <button
                  type="button"
                  disabled={!canRedo}
                  onClick={onRedo}
                  title="Redo (Ctrl+Y)"
                  className="p-1 rounded text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
                >
                  <Redo size={12} />
                </button>
              )}
            </>
          )}

          <div className="h-4 w-px bg-white/10 mx-0.5" />

          {/* Street Plane Toggle */}
          <button
            type="button"
            onClick={() => onToggleStreetFloor(!showStreetFloor)}
            title="Toggle photographic street floor plane"
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
              showStreetFloor
                ? 'bg-white/15 text-white'
                : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
            }`}
          >
            <Layers size={13} />
            <span className="hidden sm:inline">Street Plane</span>
          </button>

          {/* Metric Grid Toggle */}
          <button
            type="button"
            onClick={() => onToggleGrid(!showGrid)}
            title="Toggle metric orientation grid"
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
              showGrid
                ? 'bg-white/15 text-white'
                : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
            }`}
          >
            <Grid size={13} />
            <span className="hidden sm:inline">Grid</span>
          </button>

          {/* Red Venue Beacon Toggle */}
          <button
            type="button"
            onClick={() => onToggleVenueMarker(!showVenueMarker)}
            title="Toggle canonical red venue pin beacon"
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
              showVenueMarker
                ? 'bg-red-500/20 text-red-200 border border-red-500/30'
                : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
            }`}
          >
            <MapPin size={13} />
            <span className="hidden sm:inline">Pin</span>
          </button>

          <div className="h-4 w-px bg-white/10 mx-0.5" />

          {/* Frame Selection */}
          <button
            type="button"
            disabled={!hasSelection}
            onClick={onFrameSelection}
            title="Focus camera on selected building footprint"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <Maximize2 size={13} />
            <span className="hidden sm:inline">Frame Footprint</span>
          </button>

          {/* Frame Venue Pin */}
          <button
            type="button"
            disabled={!hasVenue}
            onClick={onFrameVenue}
            title="Focus camera on venue pin coordinates"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <Navigation size={13} />
            <span className="hidden sm:inline">Frame Pin</span>
          </button>
        </div>

        {/* Source Mode badge if loaded */}
        {loadedSourceLabel && onCycleSource && (
          <button
            type="button"
            onClick={onCycleSource}
            title="Cycle building provider (Auto / OSM / Microsoft)"
            className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#08090d]/90 px-2.5 py-1.5 text-[10px] font-semibold text-zinc-300 shadow-xl backdrop-blur-md hover:bg-white/10 hover:text-white"
          >
            <RefreshCw size={11} />
            <span>{loadedSourceLabel}</span>
          </button>
        )}
      </div>

      {/* Top Right Floating Compass Needle Indicator */}
      <div className="pointer-events-none absolute right-3 top-3 z-20 flex items-center gap-2">
        <div
          title="Compass heading (Red = North)"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-[#08090d]/90 shadow-2xl backdrop-blur-md"
        >
          <div
            ref={compassNeedleRef}
            className="flex h-6 w-6 items-center justify-center transition-transform duration-75"
          >
            <div className="flex h-full w-1 flex-col items-center">
              <div className="h-1/2 w-full rounded-t-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]" />
              <div className="h-1/2 w-full rounded-b-full bg-white/40" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default BuildingInspectorSpatialHud;
