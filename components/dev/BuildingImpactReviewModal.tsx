import React, { useEffect } from 'react';
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, MapPin, RotateCcw, Users, X } from 'lucide-react';
import type { BuildingAsset, Listing, VenueData } from '../../types';

export type ImpactReviewActionType =
  | 'save_building'
  | 'update_coordinates'
  | 'recode_address'
  | 'snap_pin'
  | 'rollback'
  | 'discard_unsaved';

export type BuildingImpactReviewProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  actionType: ImpactReviewActionType;
  venue: {
    id: string;
    name: string;
    address?: string;
  };
  coordinates?: {
    existing: { lat: number; lng: number } | null;
    proposed: { lat: number; lng: number } | null;
    distanceMovedMeters: number | null;
  };
  building?: {
    existing: BuildingAsset | null;
    proposed: {
      polygonCount: number;
      areaMeters?: number;
      source?: string;
      maxRenderHeightMeters?: number;
    } | null;
  };
  dependents: {
    clubs: Listing[];
    events: Listing[];
    total: number;
  };
  isStrongConfirmation: boolean;
};

const ACTION_TITLES: Record<ImpactReviewActionType, string> = {
  save_building: 'Review Canonical Building Asset Change',
  update_coordinates: 'Review Manual Coordinate Update',
  recode_address: 'Review Address Geocoding Result',
  snap_pin: 'Review Pin Snap to Building Footprint',
  rollback: 'Review Building Asset Revision Rollback',
  discard_unsaved: 'Discard Unsaved Footprint Selection',
};

const ACTION_DESCRIPTIONS: Record<ImpactReviewActionType, string> = {
  save_building: 'You are about to save the current footprint geometry as the canonical BuildingAsset for this physical venue.',
  update_coordinates: 'You are about to update the canonical latitude/longitude coordinates for this physical venue.',
  recode_address: 'The geocoder resolved new coordinates for this venue address. Review the proposed shift before updating the canonical pin.',
  snap_pin: 'You are moving the canonical venue pin to the geographic centroid of the selected building footprint.',
  rollback: 'You are reverting this venue’s building geometry to its previous saved revision in history.',
  discard_unsaved: 'You have selected building footprints that have not been saved. Switching venues will discard these uncommitted changes.',
};

export const BuildingImpactReviewModal: React.FC<BuildingImpactReviewProps> = ({
  isOpen,
  onClose,
  onConfirm,
  actionType,
  venue,
  coordinates,
  building,
  dependents,
  isStrongConfirmation,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const title = ACTION_TITLES[actionType];
  const description = ACTION_DESCRIPTIONS[actionType];
  const distanceMoved = coordinates?.distanceMovedMeters ?? null;
  const isDistanceMaterial = distanceMoved !== null && distanceMoved > 5;
  const isReplacingAsset = actionType === 'save_building' && Boolean(building?.existing);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="impact-review-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0b0d14] shadow-2xl shadow-black/80">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2">
              {isStrongConfirmation ? (
                <span className="flex h-5 items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                  <AlertTriangle className="h-3 w-3" />
                  Canonical Impact Warning
                </span>
              ) : (
                <span className="flex h-5 items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 text-[10px] font-bold uppercase tracking-wider text-sky-200">
                  <CheckCircle2 className="h-3 w-3" />
                  Safety Review
                </span>
              )}
            </div>
            <h2 id="impact-review-title" className="mt-2 text-lg font-semibold text-zinc-50">
              {title}
            </h2>
            <p className="mt-1 text-xs leading-5 text-zinc-400">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close review dialog"
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-zinc-400 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-xs">
          {/* Target Venue */}
          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="flex items-center gap-1.5 font-medium text-zinc-300">
                <Building2 className="h-3.5 w-3.5 text-zinc-400" />
                Physical Venue Target
              </span>
              <span className="font-mono text-[11px] text-zinc-500">{venue.id}</span>
            </div>
            <div className="mt-2 text-sm font-semibold text-zinc-100">{venue.name}</div>
            {venue.address && <div className="mt-0.5 text-zinc-400">{venue.address}</div>}
          </div>

          {/* Coordinates Impact */}
          {coordinates?.proposed && (
            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-medium text-zinc-300">
                  <MapPin className="h-3.5 w-3.5 text-sky-400" />
                  Coordinate Shift
                </span>
                {distanceMoved !== null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      isDistanceMaterial
                        ? 'border border-amber-400/30 bg-amber-400/10 text-amber-200'
                        : 'border border-white/10 bg-white/5 text-zinc-300'
                    }`}
                  >
                    Δ {distanceMoved.toFixed(1)} m
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-[11px]">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">Current Pin</div>
                  <div className="mt-1 font-mono text-zinc-300">
                    {coordinates.existing
                      ? `${coordinates.existing.lat.toFixed(6)}, ${coordinates.existing.lng.toFixed(6)}`
                      : 'None'}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-zinc-500" />
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">Proposed Pin</div>
                  <div className="mt-1 font-mono text-emerald-300">
                    {coordinates.proposed.lat.toFixed(6)}, {coordinates.proposed.lng.toFixed(6)}
                  </div>
                </div>
              </div>

              {isDistanceMaterial && (
                <div className="mt-2.5 flex items-start gap-2 text-[11px] text-amber-300/90">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    The pin is shifting by {distanceMoved?.toFixed(1)} meters. Ensure this aligns with the building’s real-world entrance before confirming.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Building Asset Impact */}
          {building?.proposed && (
            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-medium text-zinc-300">
                  <Building2 className="h-3.5 w-3.5 text-emerald-400" />
                  Building Footprint Asset
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    isReplacingAsset
                      ? 'border border-amber-400/30 bg-amber-400/10 text-amber-200'
                      : 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                  }`}
                >
                  {isReplacingAsset ? 'Replacing Existing Asset' : 'New Canonical Asset'}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">Existing Asset</div>
                  <div className="mt-1 font-medium text-zinc-300">
                    {building.existing
                      ? `${building.existing.capture.polygonCount} polygon(s) · updated ${new Date(
                          building.existing.capture.updatedAt,
                        ).toLocaleDateString()}`
                      : 'None (no saved building)'}
                  </div>
                  {building.existing && (
                    <div className="mt-0.5 text-[10px] text-zinc-500">
                      Source: {building.existing.provider.source}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-emerald-400/80">Proposed Asset</div>
                  <div className="mt-1 font-medium text-emerald-200">
                    {building.proposed.polygonCount} polygon(s)
                    {building.proposed.areaMeters
                      ? ` · ${Math.round(building.proposed.areaMeters)} m²`
                      : ''}
                  </div>
                  <div className="mt-0.5 text-[10px] text-emerald-300/70">
                    Source: {building.proposed.source ?? 'OpenFreeMap'}
                    {building.proposed.maxRenderHeightMeters
                      ? ` · ${building.proposed.maxRenderHeightMeters.toFixed(1)}m height`
                      : ''}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rollback Details */}
          {actionType === 'rollback' && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-[11px] leading-5 text-amber-200">
              <div className="flex items-center gap-1.5 font-semibold text-amber-100">
                <RotateCcw className="h-3.5 w-3.5" />
                Asset Rollback Notice
              </div>
              <p className="mt-1">
                Restoring the previous revision creates a new audit trail event and reinstates the historical footprint geometry. The current active footprint will be preserved in audit history.
              </p>
            </div>
          )}

          {/* Downstream Impact (Clubs & Events) */}
          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="flex items-center justify-between text-zinc-300">
              <span className="flex items-center gap-1.5 font-medium">
                <Users className="h-3.5 w-3.5 text-violet-400" />
                Downstream Platform Impact
              </span>
              <span className="rounded-full border border-violet-400/25 bg-violet-400/10 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                {dependents.total} dependent{dependents.total === 1 ? '' : 's'}
              </span>
            </div>

            {dependents.total > 0 ? (
              <div className="mt-2.5 space-y-2">
                <p className="text-[11px] leading-4 text-zinc-400">
                  This physical venue is linked to{' '}
                  <strong className="text-zinc-200">{dependents.clubs.length} permanent club(s)</strong> and{' '}
                  <strong className="text-zinc-200">{dependents.events.length} event(s)</strong>. Any canonical change will immediately apply to all of them on the map and globe:
                </p>

                <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto pt-1">
                  {dependents.clubs.map((club) => (
                    <span
                      key={club.id}
                      className="inline-flex items-center gap-1 rounded-md border border-sky-400/20 bg-sky-400/10 px-2 py-1 text-[11px] text-sky-200"
                    >
                      <span className="text-[9px] font-bold uppercase text-sky-400">Club</span>
                      <span className="truncate max-w-[14rem]">{club.name}</span>
                    </span>
                  ))}
                  {dependents.events.map((event) => (
                    <span
                      key={event.id}
                      className="inline-flex items-center gap-1 rounded-md border border-violet-400/20 bg-violet-400/10 px-2 py-1 text-[11px] text-violet-200"
                    >
                      <span className="text-[9px] font-bold uppercase text-violet-400">Event</span>
                      <span className="truncate max-w-[14rem]">{event.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-zinc-500">
                No secondary events or listings currently inherit from this physical venue.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 bg-black/40 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-zinc-100"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onConfirm();
              }}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                isStrongConfirmation
                  ? 'border border-amber-400/40 bg-amber-500/25 text-amber-100 hover:bg-amber-500/35 shadow-lg shadow-amber-950/40'
                  : 'border border-emerald-500/40 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35 shadow-lg shadow-emerald-950/40'
              }`}
            >
              {actionType === 'save_building'
                ? isReplacingAsset
                  ? 'Confirm & Replace Building Asset'
                  : 'Confirm & Save Building Asset'
                : actionType === 'snap_pin'
                ? 'Confirm & Snap Pin'
                : actionType === 'update_coordinates'
                ? 'Confirm & Apply Coordinates'
                : actionType === 'recode_address'
                ? 'Confirm & Update From Geocode'
                : actionType === 'rollback'
                ? 'Confirm & Rollback Revision'
                : 'Discard Unsaved Selection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BuildingImpactReviewModal;
