import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FlaskConical, MapPin, Search, ShieldCheck } from 'lucide-react';
import type { BuildingAsset, Listing, OrganizationData, OrganizationVenueRelationship, VenueData } from '../../../types';
import {
  formatListingPhysicalAddress,
  getBuildingAssetForListing,
  getDependentListingsForVenue,
  getListingPhysicalCityLabel,
  getVenueForListing,
  type EntityCollections,
} from '../../../lib/entityCompatibility';

export type BuildingAssetFilter = 'all' | 'missing' | 'location' | 'private' | 'has';

export type LandmarkTestRecord = {
  id: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  expectedHeightMeters: number;
  expectedFootprint: string;
};

interface BuildingInspectorPlaceBrowserProps {
  venueSearch: string;
  onVenueSearchChange: (value: string) => void;
  assetFilter: BuildingAssetFilter;
  onAssetFilterChange: (filter: BuildingAssetFilter) => void;
  venueStats: {
    total: number;
    missing: number;
    locationReview: number;
    privateLocations: number;
    withAssets: number;
  };
  filteredVenues: Listing[];
  selectedVenueId: string | null;
  onSelectVenue: (listing: Listing) => void;
  buildingAssets: BuildingAsset[];
  venues: VenueData[];
  listings: Listing[];
  organizations: OrganizationData[];
  relationships: OrganizationVenueRelationship[];
  semv2Collections: EntityCollections;
  listingLocationAudits: Map<string, any>;
  landmarkTests: LandmarkTestRecord[];
  selectedLandmarkId: string | null;
  onSelectLandmarkId: (id: string) => void;
  onLoadLandmark: () => void;
  isLoading: boolean;
  auditPanelNode?: React.ReactNode;
}

export const BuildingInspectorPlaceBrowser: React.FC<BuildingInspectorPlaceBrowserProps> = ({
  venueSearch,
  onVenueSearchChange,
  assetFilter,
  onAssetFilterChange,
  venueStats,
  filteredVenues,
  selectedVenueId,
  onSelectVenue,
  buildingAssets,
  venues,
  listings,
  organizations,
  relationships,
  semv2Collections,
  listingLocationAudits,
  landmarkTests,
  selectedLandmarkId,
  onSelectLandmarkId,
  onLoadLandmark,
  isLoading,
  auditPanelNode,
}) => {
  const [showLandmarks, setShowLandmarks] = useState(false);
  const [showAuditPanel, setShowAuditPanel] = useState(false);

  return (
    <div className="flex h-full flex-col overflow-hidden text-zinc-300">
      {/* Top Search & Filter Section */}
      <div className="border-b border-white/10 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Physical Places</h2>
          <span className="rounded-md border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] text-zinc-400">
            {filteredVenues.length} / {venueStats.total}
          </span>
        </div>

        {/* Search Input */}
        <div className="relative mt-2.5">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={venueSearch}
            onChange={(e) => {
              onVenueSearchChange(e.target.value);
              if (e.target.value.trim()) onAssetFilterChange('all');
            }}
            placeholder="Search venue name, city, address…"
            className="w-full rounded-lg border border-white/10 bg-black/40 py-1.5 pl-8 pr-3 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-red-400/50"
          />
        </div>

        {/* Filter Chips */}
        <div className="mt-2.5 grid grid-cols-5 gap-1 text-[10px]">
          {([
            ['all', `All (${venueStats.total})`],
            ['missing', `Ready (${venueStats.missing})`],
            ['location', `Review (${venueStats.locationReview})`],
            ['private', `Private (${venueStats.privateLocations})`],
            ['has', `Saved (${venueStats.withAssets})`],
          ] as Array<[BuildingAssetFilter, string]>).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => onAssetFilterChange(val)}
              className={`truncate rounded px-1.5 py-1 font-semibold transition-colors text-center ${
                assetFilter === val
                  ? 'border border-red-400/40 bg-red-500/20 text-red-200'
                  : 'border border-white/5 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Physical Place List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filteredVenues.length ? (
          filteredVenues.slice(0, 100).map((listing) => {
            const isSelected = selectedVenueId === listing.id;
            const asset = getBuildingAssetForListing(listing, buildingAssets, venues, listings, organizations, relationships);
            const physicalVenue = getVenueForListing(listing, semv2Collections);
            const rowName = physicalVenue?.name ?? listing.name;
            const dependents = physicalVenue ? getDependentListingsForVenue(physicalVenue.id, semv2Collections) : null;
            const locationAudit = listingLocationAudits.get(listing.id) ?? { state: 'ready', label: 'Ready', reason: '' };

            const assetBadge = asset
              ? (asset.listingId === listing.id ? 'Saved Asset' : 'Shared Asset')
              : locationAudit.state === 'ready'
              ? 'Ready'
              : locationAudit.label;

            const assetBadgeClass = asset
              ? 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10'
              : locationAudit.state === 'ready'
              ? 'text-red-300 border-red-400/30 bg-red-500/10'
              : 'text-amber-300 border-amber-400/30 bg-amber-500/10';

            return (
              <button
                key={listing.id}
                type="button"
                onClick={() => onSelectVenue(listing)}
                className={`w-full rounded-xl border p-2.5 text-left transition-all ${
                  isSelected
                    ? 'border-red-400/60 bg-red-500/15 shadow-lg shadow-red-950/20'
                    : 'border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-1.5 truncate">
                    <span className="truncate text-xs font-semibold text-zinc-100">{rowName}</span>
                    {dependents && dependents.total > 1 && (
                      <span
                        className="shrink-0 rounded-full border border-sky-400/30 bg-sky-400/10 px-1.5 py-0.2 text-[9px] font-semibold text-sky-200"
                        title={`Shared physical venue for ${dependents.total} listings (${dependents.clubs.length} clubs, ${dependents.events.length} events)`}
                      >
                        {dependents.total} shared
                      </span>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-1.5 py-0.2 text-[9px] font-semibold ${assetBadgeClass}`}
                    title={!asset ? locationAudit.reason : undefined}
                  >
                    {assetBadge}
                  </span>
                </div>

                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                  <span className="truncate text-zinc-500">
                    {physicalVenue && listing.name !== rowName ? `Via ${listing.name} · ` : ''}
                    {getListingPhysicalCityLabel(listing, semv2Collections)}
                  </span>
                  <span className="shrink-0 uppercase tracking-wider text-[9px] text-zinc-600">
                    {physicalVenue ? 'Venue' : listing.type}
                  </span>
                </div>

                <div className="mt-1 truncate text-[10px] text-zinc-500">
                  {formatListingPhysicalAddress(listing, semv2Collections)}
                </div>
              </button>
            );
          })
        ) : (
          <div className="rounded-xl border border-white/5 bg-black/20 p-4 text-center text-xs text-zinc-500">
            {venueSearch.trim() ? 'No places match that search.' : 'No places match the selected filter.'}
          </div>
        )}
      </div>

      {/* Secondary Collapsible Sections: Verification Audit & Landmarks */}
      <div className="border-t border-white/10 bg-black/20">
        {/* Verification Audit Panel Collapsible */}
        {auditPanelNode && (
          <div className="border-b border-white/5">
            <button
              type="button"
              onClick={() => setShowAuditPanel((prev) => !prev)}
              className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck size={13} className="text-sky-400" />
                <span>Verification Audit Queue</span>
              </div>
              {showAuditPanel ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            {showAuditPanel && (
              <div className="max-h-56 overflow-y-auto p-2">
                {auditPanelNode}
              </div>
            )}
          </div>
        )}

        {/* Developer Landmark Fixtures Collapsible */}
        <div className="border-b border-white/5">
          <button
            type="button"
            onClick={() => setShowLandmarks((prev) => !prev)}
            className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
          >
            <div className="flex items-center gap-2">
              <FlaskConical size={13} className="text-amber-400" />
              <span>Developer Landmark Fixtures</span>
            </div>
            {showLandmarks ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {showLandmarks && (
            <div className="p-3 space-y-2">
              <p className="text-[10px] text-zinc-500">
                Landmarks run through the exact same provider pipeline as real venues.
              </p>
              <div className="space-y-1">
                {landmarkTests.map((landmark) => (
                  <label
                    key={landmark.id}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border p-2 text-xs transition-colors ${
                      selectedLandmarkId === landmark.id
                        ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                        : 'border-white/5 bg-black/30 text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="landmark"
                        checked={selectedLandmarkId === landmark.id}
                        onChange={() => onSelectLandmarkId(landmark.id)}
                        className="accent-amber-400"
                      />
                      <div>
                        <div className="font-medium text-zinc-100">{landmark.name}</div>
                        <div className="text-[10px] text-zinc-500">{landmark.city} · {landmark.expectedHeightMeters}m</div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={isLoading || !selectedLandmarkId}
                onClick={onLoadLandmark}
                className="w-full rounded-lg border border-amber-400/30 bg-amber-500/15 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/25 disabled:opacity-50"
              >
                Inspect Landmark Footprint
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BuildingInspectorPlaceBrowser;
