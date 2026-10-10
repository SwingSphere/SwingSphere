import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Box, Check, Compass, Layers, Save } from 'lucide-react';
import type { BuildingInspectorViewMode, StepperStep } from './types';
import BuildingInspectorStepper from './BuildingInspectorStepper';

interface BuildingInspectorAppBarProps {
  embedded?: boolean;
  selectedVenueName: string | null;
  dependentListingCount?: number;
  steps: StepperStep[];
  saveStateInfo: {
    label: string;
    shortLabel: string;
    badgeClass: string;
    description: string;
    state: string;
  };
  viewMode: BuildingInspectorViewMode;
  onViewModeChange: (mode: BuildingInspectorViewMode) => void;
  onSaveClick: () => void;
  isSaveDisabled: boolean;
  isSaving: boolean;
}

export const BuildingInspectorAppBar: React.FC<BuildingInspectorAppBarProps> = ({
  embedded,
  selectedVenueName,
  dependentListingCount = 0,
  steps,
  saveStateInfo,
  viewMode,
  onViewModeChange,
  onSaveClick,
  isSaveDisabled,
  isSaving,
}) => {
  return (
    <header className="relative z-40 flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0a0b0f]/98 px-3 py-2 shadow-2xl backdrop-blur-xl">
      {/* LEFT: Branding, Navigation, Physical Venue Breadcrumb */}
      <div className="flex min-w-0 items-center gap-3">
        <Link
          to={embedded ? '/dev/building-inspector' : '/map'}
          title={embedded ? 'Open studio' : 'Back to map'}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft size={15} />
        </Link>

        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.7)]" />
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">Building Inspector</span>
        </div>

        {selectedVenueName && (
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-zinc-600">/</span>
            <span className="truncate max-w-[200px] text-xs font-semibold text-zinc-100" title={selectedVenueName}>
              {selectedVenueName}
            </span>
            {dependentListingCount > 1 && (
              <span
                className="shrink-0 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold text-sky-200"
                title={`Shared physical venue for ${dependentListingCount} listings`}
              >
                {dependentListingCount} shared
              </span>
            )}
          </div>
        )}
      </div>

      {/* CENTER: Persistent Workflow Stepper */}
      <div className="hidden lg:flex items-center justify-center">
        <BuildingInspectorStepper steps={steps} />
      </div>

      {/* RIGHT: View controls, Save State Badge, Review & Save button */}
      <div className="flex shrink-0 items-center gap-2.5">
        {/* 3D Orbit / 2D Overhead View Toggle */}
        <div className="flex items-center rounded-lg border border-white/10 bg-black/40 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onViewModeChange('3d')}
            title="3D Orbit inspection camera with tilt and rotation"
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              viewMode === '3d'
                ? 'bg-white/15 text-white shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Box size={12} />
            <span>3D Orbit</span>
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('2d')}
            title="2D Overhead orthographic-style top-down view, locked north-up"
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              viewMode === '2d'
                ? 'bg-sky-500/20 text-sky-200 border border-sky-400/30 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Compass size={12} />
            <span>2D Overhead</span>
          </button>
        </div>

        {/* Save State Badge */}
        <div
          className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${saveStateInfo.badgeClass}`}
          title={saveStateInfo.description}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          <span>{saveStateInfo.shortLabel}</span>
        </div>

        {/* Primary Review & Save action */}
        <button
          type="button"
          disabled={isSaveDisabled || isSaving}
          onClick={onSaveClick}
          title={isSaveDisabled ? 'Select a valid footprint to save' : 'Review canonical impact and save BuildingAsset'}
          className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 shadow-lg shadow-emerald-950/30 transition-all hover:bg-emerald-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save size={13} className={isSaving ? 'animate-spin' : ''} />
          <span>{isSaving ? 'Saving...' : saveStateInfo.state === 'saved_canonical_loaded' ? 'Asset Saved' : 'Review & Save'}</span>
        </button>
      </div>
    </header>
  );
};

export default BuildingInspectorAppBar;
