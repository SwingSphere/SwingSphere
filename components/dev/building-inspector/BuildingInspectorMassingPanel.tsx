import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers,
  Lock,
  Maximize2,
  MousePointer,
  Move,
  Plus,
  Redo,
  RefreshCw,
  RotateCw,
  Save,
  Square,
  Trash2,
  Undo,
  Unlock,
  Upload,
} from 'lucide-react';
import type {
  BuildingInspectorWorkspaceMode,
  ManualMassingDrawTool,
  ManualMassingObject,
  ManualMassingRole,
  ReferenceImageState,
} from './types';

interface BuildingInspectorMassingPanelProps {
  // Mode switching
  workspaceMode: BuildingInspectorWorkspaceMode;
  onWorkspaceModeChange: (mode: BuildingInspectorWorkspaceMode) => void;
  selectedVenueName: string | null;

  // Reference Image
  referenceImage: ReferenceImageState | null;
  onUploadReferenceImage: (file: File) => void;
  onUpdateReferenceImage: (update: Partial<ReferenceImageState>) => void;
  onClearReferenceImage: () => void;
  onCenterReferenceOnPin: () => void;

  // Drawing Tools & History
  activeDrawTool: ManualMassingDrawTool;
  onSelectDrawTool: (tool: ManualMassingDrawTool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;

  // Massing Objects
  massingObjects: ManualMassingObject[];
  selectedMassingId: string | null;
  onSelectMassingId: (id: string | null) => void;
  onUpdateMassingObject: (id: string, update: Partial<ManualMassingObject>) => void;
  onDuplicateMassingObject: (id: string) => void;
  onDeleteMassingObject: (id: string) => void;
  onFrameMassingObject: (id: string) => void;

  // Promotion & Persistence
  onPromoteVenueCandidate: () => void;
  onSaveAmbientMassings: () => void;
  isSavingAmbient: boolean;
  ambientSaveStatusMessage: string | null;
}

const HEIGHT_PRESETS = [5, 10, 15, 20];

export const BuildingInspectorMassingPanel: React.FC<BuildingInspectorMassingPanelProps> = ({
  workspaceMode,
  onWorkspaceModeChange,
  selectedVenueName,
  referenceImage,
  onUploadReferenceImage,
  onUpdateReferenceImage,
  onClearReferenceImage,
  onCenterReferenceOnPin,
  activeDrawTool,
  onSelectDrawTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  massingObjects,
  selectedMassingId,
  onSelectMassingId,
  onUpdateMassingObject,
  onDuplicateMassingObject,
  onDeleteMassingObject,
  onFrameMassingObject,
  onPromoteVenueCandidate,
  onSaveAmbientMassings,
  isSavingAmbient,
  ambientSaveStatusMessage,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showImageSection, setShowImageSection] = useState(true);
  const [showObjectsSection, setShowObjectsSection] = useState(true);

  const venueCandidates = massingObjects.filter((obj) => obj.role === 'venue_candidate');
  const ambientObjects = massingObjects.filter((obj) => obj.role === 'ambient');
  const selectedMassing = massingObjects.find((obj) => obj.id === selectedMassingId) ?? null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadReferenceImage(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#08090d]/98 text-zinc-300">
      {/* ─────────────────────────────────────────────────────────────
          HEADER BANNER & MODE SWITCHER
         ───────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-white/10 p-3 bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-transparent">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-indigo-400/40 bg-indigo-500/20 text-indigo-300">
              <Layers size={13} />
            </span>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-200">
                Reference & Manual Massing
              </h2>
              <p className="text-[10px] text-zinc-400">
                Ground overlay alignment & manual footprint tracing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onWorkspaceModeChange('provider')}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-zinc-300 hover:bg-white/10 hover:text-white"
          >
            <span>Provider Mode</span>
            <ArrowRight size={11} />
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SCROLLABLE CONTENT BODY
         ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
        {/* ───────────────────────────────────────────────────────────
            SECTION 1: REFERENCE IMAGE OVERLAY
           ─────────────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-white/10 bg-[#0a0b0f] p-3 shadow-xl">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowImageSection((prev) => !prev)}
              className="flex items-center gap-2 text-left"
            >
              <ImageIcon size={14} className="text-indigo-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Reference Image
              </h3>
              {showImageSection ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
            </button>

            {referenceImage && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onUpdateReferenceImage({ isVisible: !referenceImage.isVisible })}
                  title={referenceImage.isVisible ? 'Hide reference image' : 'Show reference image'}
                  className={`p-1 rounded transition-colors ${
                    referenceImage.isVisible ? 'text-zinc-300 hover:text-white' : 'text-zinc-600 hover:text-zinc-400'
                  }`}
                >
                  {referenceImage.isVisible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateReferenceImage({ isLocked: !referenceImage.isLocked })}
                  title={referenceImage.isLocked ? 'Unlock alignment controls' : 'Lock alignment controls'}
                  className={`p-1 rounded transition-colors ${
                    referenceImage.isLocked ? 'text-amber-400 bg-amber-400/10' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {referenceImage.isLocked ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
              </div>
            )}
          </div>

          {showImageSection && (
            <div className="mt-3 space-y-3 text-xs">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

              {!referenceImage ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/[0.02] p-4 text-center cursor-pointer transition-colors hover:border-indigo-400/50 hover:bg-indigo-500/5"
                >
                  <Upload size={20} className="text-indigo-400 mb-1.5" />
                  <span className="text-xs font-semibold text-zinc-200">
                    Upload Reference Image
                  </span>
                  <span className="mt-0.5 text-[10px] text-zinc-500">
                    PNG, JPEG, WebP · Ground-aligned spatial overlay
                  </span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between rounded-lg border border-white/5 bg-black/40 px-2.5 py-1.5">
                    <div className="truncate max-w-[200px]">
                      <span className="text-[11px] font-semibold text-zinc-200 truncate block">
                        {referenceImage.name}
                      </span>
                      <span className="text-[9px] text-zinc-500">
                        {referenceImage.width} × {referenceImage.height} px
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-white/10"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={onClearReferenceImage}
                        title="Remove reference image"
                        className="p-1 text-zinc-500 hover:text-rose-400"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Opacity Slider */}
                  <div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-zinc-400 uppercase">Opacity</span>
                      <span className="font-mono text-zinc-200">{Math.round(referenceImage.opacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      value={Math.round(referenceImage.opacity * 100)}
                      onChange={(e) => onUpdateReferenceImage({ opacity: Number(e.target.value) / 100 })}
                      className="mt-1 w-full accent-indigo-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                    />
                  </div>

                  {/* Scale & Rotation (if not locked) */}
                  {!referenceImage.isLocked ? (
                    <div className="space-y-2 pt-1 border-t border-white/5">
                      <div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-zinc-400 uppercase">World Scale (Width)</span>
                          <span className="font-mono text-zinc-200">{Math.round(referenceImage.scaleMeters)} m</span>
                        </div>
                        <input
                          type="range"
                          min="20"
                          max="400"
                          value={Math.round(referenceImage.scaleMeters)}
                          onChange={(e) => onUpdateReferenceImage({ scaleMeters: Number(e.target.value) })}
                          className="mt-1 w-full accent-indigo-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-zinc-400 uppercase">Rotation Angle</span>
                          <span className="font-mono text-zinc-200">{Math.round(referenceImage.rotationDeg)}°</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            value={Math.round(referenceImage.rotationDeg)}
                            onChange={(e) => onUpdateReferenceImage({ rotationDeg: Number(e.target.value) })}
                            className="flex-1 accent-indigo-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => onUpdateReferenceImage({ rotationDeg: (referenceImage.rotationDeg + 90) % 360 })}
                            title="Rotate 90° clockwise"
                            className="flex items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-white/10"
                          >
                            <RotateCw size={10} />
                            <span>90°</span>
                          </button>
                        </div>
                      </div>

                      {/* Position Nudging Controls */}
                      <div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-zinc-400 uppercase">Position Offset</span>
                          <span className="font-mono text-[9px] text-zinc-400">
                            X: {referenceImage.position.x.toFixed(1)}m · Z: {referenceImage.position.z.toFixed(1)}m
                          </span>
                        </div>
                        <div className="mt-1.5 grid grid-cols-4 gap-1">
                          <button
                            type="button"
                            onClick={() => onUpdateReferenceImage({ position: { x: referenceImage.position.x - 2, z: referenceImage.position.z } })}
                            className="rounded border border-white/10 bg-white/5 py-1 text-[10px] text-zinc-300 hover:bg-white/10"
                          >
                            ← 2m
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateReferenceImage({ position: { x: referenceImage.position.x + 2, z: referenceImage.position.z } })}
                            className="rounded border border-white/10 bg-white/5 py-1 text-[10px] text-zinc-300 hover:bg-white/10"
                          >
                            → 2m
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateReferenceImage({ position: { x: referenceImage.position.x, z: referenceImage.position.z - 2 } })}
                            className="rounded border border-white/10 bg-white/5 py-1 text-[10px] text-zinc-300 hover:bg-white/10"
                          >
                            ↑ 2m
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateReferenceImage({ position: { x: referenceImage.position.x, z: referenceImage.position.z + 2 } })}
                            className="rounded border border-white/10 bg-white/5 py-1 text-[10px] text-zinc-300 hover:bg-white/10"
                          >
                            ↓ 2m
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={onCenterReferenceOnPin}
                          className="flex-1 rounded-lg border border-white/10 bg-white/5 py-1 text-[10px] font-semibold text-zinc-200 hover:bg-white/10"
                        >
                          Center on Venue Pin
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateReferenceImage({ isLocked: true })}
                          className="flex items-center justify-center gap-1 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/20"
                        >
                          <Lock size={10} />
                          <span>Lock</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-2 text-[10px] text-amber-200 flex items-center justify-between">
                      <span>Alignment locked. Uncheck lock icon to adjust transform.</span>
                      <button
                        type="button"
                        onClick={() => onUpdateReferenceImage({ isLocked: false })}
                        className="underline font-semibold"
                      >
                        Unlock
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ───────────────────────────────────────────────────────────
            SECTION 2: DRAWING TOOLS
           ─────────────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-white/10 bg-[#0a0b0f] p-3 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              Draw Tools
            </h3>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!canUndo}
                onClick={onUndo}
                title="Undo manual drawing action (Ctrl+Z)"
                className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                <Undo size={13} />
              </button>
              <button
                type="button"
                disabled={!canRedo}
                onClick={onRedo}
                title="Redo manual drawing action (Ctrl+Y)"
                className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                <Redo size={13} />
              </button>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => onSelectDrawTool('select')}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center transition-colors ${
                activeDrawTool === 'select'
                  ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-100 font-semibold'
                  : 'border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <MousePointer size={14} />
              <span className="text-[10px]">Select</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectDrawTool('rectangle')}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center transition-colors ${
                activeDrawTool === 'rectangle'
                  ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100 font-semibold shadow-sm'
                  : 'border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Square size={14} />
              <span className="text-[10px]">Rectangle</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectDrawTool('polygon')}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center transition-colors ${
                activeDrawTool === 'polygon'
                  ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100 font-semibold shadow-sm'
                  : 'border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Box size={14} />
              <span className="text-[10px]">Polygon</span>
            </button>
          </div>

          {/* Contextual instruction */}
          <div className="mt-2 text-[10px] text-zinc-400 leading-4 bg-black/40 p-2 rounded-lg border border-white/5">
            {activeDrawTool === 'select' && (
              <span>Click any manual building in the 3D scene to inspect, move, or edit its height.</span>
            )}
            {activeDrawTool === 'rectangle' && (
              <span>Click and drag on the ground plane to draw a rectangular building footprint.</span>
            )}
            {activeDrawTool === 'polygon' && (
              <span>Click on the ground to place polygon corners. Double-click or click start point to close.</span>
            )}
          </div>
        </section>

        {/* ───────────────────────────────────────────────────────────
            SECTION 3: MANUAL MASSING OBJECTS
           ─────────────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-white/10 bg-[#0a0b0f] p-3 shadow-xl">
          <button
            type="button"
            onClick={() => setShowObjectsSection((prev) => !prev)}
            className="flex w-full items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <Box size={14} className="text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Massing Objects ({massingObjects.length})
              </h3>
            </div>
            {showObjectsSection ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
          </button>

          {showObjectsSection && (
            <div className="mt-3 space-y-2 text-xs">
              {massingObjects.length === 0 ? (
                <div className="text-center py-4 text-zinc-500 text-[11px]">
                  No manual building massings drawn yet. Select Rectangle or Polygon above to trace buildings.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {massingObjects.map((obj) => {
                    const isSelected = obj.id === selectedMassingId;
                    const isCandidate = obj.role === 'venue_candidate';

                    return (
                      <div
                        key={obj.id}
                        onClick={() => onSelectMassingId(obj.id)}
                        className={`rounded-lg border p-2.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-emerald-400/60 bg-emerald-500/10 shadow-md'
                            : isCandidate
                            ? 'border-emerald-500/30 bg-black/40 hover:border-emerald-500/50'
                            : 'border-white/10 bg-black/30 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={obj.name}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => onUpdateMassingObject(obj.id, { name: e.target.value })}
                            className="bg-transparent font-semibold text-zinc-200 text-xs outline-none focus:border-b border-white/40"
                          />
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onFrameMassingObject(obj.id);
                              }}
                              title="Frame in 3D"
                              className="p-1 text-zinc-500 hover:text-white"
                            >
                              <Maximize2 size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDuplicateMassingObject(obj.id);
                              }}
                              title="Duplicate building (+4m offset)"
                              className="p-1 text-zinc-500 hover:text-white"
                            >
                              <Copy size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteMassingObject(obj.id);
                              }}
                              title="Delete building"
                              className="p-1 text-zinc-500 hover:text-rose-400"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>

                        {/* Role toggle */}
                        <div className="mt-2 flex items-center justify-between gap-1.5">
                          <span className="text-[10px] text-zinc-500 font-semibold">ROLE:</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateMassingObject(obj.id, { role: 'ambient' });
                              }}
                              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${
                                obj.role === 'ambient'
                                  ? 'border border-sky-400/40 bg-sky-500/20 text-sky-200'
                                  : 'text-zinc-500 hover:text-zinc-300'
                              }`}
                            >
                              Ambient
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateMassingObject(obj.id, { role: 'venue_candidate' });
                              }}
                              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${
                                obj.role === 'venue_candidate'
                                  ? 'border border-emerald-400/40 bg-emerald-500/25 text-emerald-200'
                                  : 'text-zinc-500 hover:text-zinc-300'
                              }`}
                            >
                              Venue Candidate
                            </button>
                          </div>
                        </div>

                        {/* Height selector */}
                        <div className="mt-2 flex items-center justify-between gap-1">
                          <span className="text-[10px] text-zinc-500 font-semibold">HEIGHT:</span>
                          <div className="flex items-center gap-1">
                            {HEIGHT_PRESETS.map((h) => (
                              <button
                                key={h}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateMassingObject(obj.id, { heightMeters: h });
                                }}
                                className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-medium ${
                                  obj.heightMeters === h
                                  ? 'bg-white/20 text-white font-bold'
                                  : 'text-zinc-400 hover:bg-white/10'
                              }`}
                            >
                              {h}m
                            </button>
                          ))}
                          <input
                            type="number"
                            min="1"
                            max="200"
                            value={obj.heightMeters}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const val = Math.max(1, Number(e.target.value) || 1);
                              onUpdateMassingObject(obj.id, { heightMeters: val });
                            }}
                            className="w-12 rounded bg-black/50 border border-white/10 px-1 py-0.5 text-[9px] font-mono text-zinc-200 outline-none"
                          />
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[9px] text-zinc-500">
                        <span>Area: {Math.round(obj.areaMeters)} m²</span>
                        <span>{obj.localCoordinates.length - 1} vertices</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ───────────────────────────────────────────────────────────
          SECTION 4: VENUE BUILDING CANDIDATE PROMOTION
         ─────────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-3 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check size={14} className="text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-200">
              Venue Building Candidate
            </h3>
          </div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-semibold text-emerald-200">
            {venueCandidates.length} piece{venueCandidates.length === 1 ? '' : 's'}
          </span>
        </div>

        {venueCandidates.length > 0 ? (
          <div className="mt-3 space-y-2.5 text-xs">
            <div className="rounded-lg border border-white/5 bg-black/40 p-2.5 text-[11px] space-y-1">
              <div className="flex justify-between text-zinc-400">
                <span>Designated Pieces:</span>
                <span className="font-semibold text-white">{venueCandidates.length}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Total Footprint Area:</span>
                <span className="font-semibold text-white">
                  {Math.round(venueCandidates.reduce((sum, c) => sum + c.areaMeters, 0))} m²
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Height:</span>
                <span className="font-semibold text-white">{venueCandidates[0]?.heightMeters ?? 10} m</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onPromoteVenueCandidate}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/20 py-2.5 text-xs font-semibold text-emerald-100 shadow-lg shadow-emerald-950/40 hover:bg-emerald-500/30 active:scale-[0.99] transition-all"
            >
              <Save size={14} />
              <span>Promote to Venue Building Asset</span>
            </button>
            <p className="text-[10px] text-zinc-500 text-center leading-4">
              Stages this manual geometry into the canonical review modal; changes are not committed until verified.
            </p>
          </div>
        ) : (
          <div className="mt-2 text-[10px] text-zinc-400 leading-4">
            No building is currently designated as the venue. Select any drawn building above and click <strong className="text-emerald-300">Venue Candidate</strong> to enable canonical promotion.
          </div>
        )}
      </section>

      {/* ───────────────────────────────────────────────────────────
          SECTION 5: AMBIENT CONTEXT PERSISTENCE
         ─────────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-white/10 bg-[#0a0b0f] p-3 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-sky-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              Ambient Context Persistence
            </h3>
          </div>
          <span className="text-[9px] font-mono text-zinc-500">
            {ambientObjects.length} ambient
          </span>
        </div>

        <p className="mt-2 text-[10px] text-zinc-400 leading-4">
          Ambient buildings improve scene realism for {selectedVenueName ?? 'this venue'}. They reload automatically without affecting listings or canonical venue records.
        </p>

        <div className="mt-3">
          <button
            type="button"
            disabled={isSavingAmbient}
            onClick={onSaveAmbientMassings}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-500/15 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/25 disabled:opacity-40 transition-colors"
          >
            <Save size={13} className={isSavingAmbient ? 'animate-spin' : ''} />
            <span>{isSavingAmbient ? 'Saving Ambient Massings…' : 'Save Ambient Massings'}</span>
          </button>
          {ambientSaveStatusMessage && (
            <p className="mt-1 text-center text-[10px] text-emerald-400">
              {ambientSaveStatusMessage}
            </p>
          )}
        </div>
      </section>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          STICKY BOTTOM ACTION BAR
         ───────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/10 bg-[#08090d]/98 p-3 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-semibold text-zinc-300">
            {massingObjects.length} Manual Massings
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-zinc-400 font-mono">
            {venueCandidates.length} Venue · {ambientObjects.length} Ambient
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isSavingAmbient}
            onClick={onSaveAmbientMassings}
            title="Save ambient massings to store"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/10 shrink-0"
          >
            Save Ambient
          </button>

          {venueCandidates.length > 0 ? (
            <button
              type="button"
              onClick={onPromoteVenueCandidate}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/20 py-2 text-xs font-semibold text-emerald-100 shadow-md shadow-emerald-950/40 hover:bg-emerald-500/30 active:scale-[0.99] transition-all"
            >
              <Save size={13} />
              <span className="truncate">Promote Venue Building</span>
            </button>
          ) : (
            <div className="flex-1 text-center text-[10px] text-zinc-500 py-2">
              Mark a building as Venue Candidate to promote
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BuildingInspectorMassingPanel;
