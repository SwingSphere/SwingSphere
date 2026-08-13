import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, Crosshair, ListFilter, MapPin, Search, X } from 'lucide-react';
import type { Listing } from '../../types';
import type { EntityIndex } from '../../lib/entityIndex';
import { getListingCanonicalPath } from '../../lib/entityUtils';
import { getListingHeroUrl, handleListingImageError } from '../../lib/listingImage';

export type MobileExplorerPrototypeProps = {
  surfaceMode: 'globe' | 'map';
  onSurfaceModeChange: (mode: 'globe' | 'map') => void;
  listings: Listing[];
  selectedListingId: string | null;
  activeRegionName?: string | null;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  onSelectListing: (listingId: string) => void;
  onNavigate: (path: string) => void;
  entityIndex?: EntityIndex;
  isUpdating?: boolean;
};

const formatEventDate = (listing: Listing): string => {
  if (listing.type !== 'event') return 'Club';
  const date = new Date(listing.time.start);
  if (Number.isNaN(date.getTime())) return 'Upcoming event';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
};

const MobileExplorerPrototype: React.FC<MobileExplorerPrototypeProps> = ({
  surfaceMode,
  onSurfaceModeChange,
  listings,
  selectedListingId,
  activeRegionName,
  searchText,
  onSearchTextChange,
  onSelectListing,
  onNavigate,
  entityIndex,
  isUpdating = false,
}) => {
  const [resultsOpen, setResultsOpen] = useState(false);
  const selectedListing = useMemo(
    () => listings.find((listing) => listing.id === selectedListingId) ?? null,
    [listings, selectedListingId],
  );
  const destinationName = activeRegionName || (surfaceMode === 'map' ? 'Nearby' : 'Explore the world');
  const eventCount = listings.filter((listing) => listing.type === 'event').length;
  const clubCount = listings.filter((listing) => listing.type === 'club').length;
  const previewListings = selectedListing
    ? [selectedListing, ...listings.filter((listing) => listing.id !== selectedListing.id)].slice(0, 3)
    : listings.slice(0, 3);

  const openListing = (listing: Listing) => {
    onNavigate(getListingCanonicalPath(listing, entityIndex));
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-[75] md:hidden" aria-label="Mobile explorer prototype">
      <div className="pointer-events-auto absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] flex flex-col gap-2.5">
        <div className="ss-glass ss-glass--liquid flex h-12 items-center gap-2 rounded-2xl px-3 shadow-2xl shadow-black/35">
          <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            placeholder="Search destinations, events, clubs…"
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
          />
          <button type="button" className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.055] text-gray-300" aria-label="Open filters">
            <ListFilter className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="ss-glass ss-glass--liquid flex rounded-full p-1 text-[11px] font-bold uppercase tracking-[0.16em]">
            {(['globe', 'map'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onSurfaceModeChange(mode)}
                className={`rounded-full px-3 py-2 transition ${surfaceMode === mode ? 'ss-glass--crimson bg-red-500/15 text-white' : 'text-gray-400'}`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button type="button" className="ss-glass ss-glass--liquid grid h-10 w-10 place-items-center rounded-full text-gray-200" aria-label="Recenter map">
            <Crosshair className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <section className="pointer-events-auto absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden rounded-[26px] border border-white/[0.09] bg-[rgba(8,10,14,0.93)] shadow-[0_-20px_70px_rgba(0,0,0,0.56)] backdrop-blur-[28px] backdrop-saturate-150">
        <button
          type="button"
          onClick={() => setResultsOpen(true)}
          className="block w-full px-4 pb-2 pt-3 text-left"
          aria-label={`Open results for ${destinationName}`}
        >
          <span className="mx-auto block h-1 w-10 rounded-full bg-white/20" />
          <span className="mt-3 flex items-end justify-between gap-3">
            <span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.24em] text-red-300/80">Destination</span>
              <span className="mt-1 block text-lg font-semibold text-white">{destinationName}</span>
              <span className="mt-0.5 block text-xs text-gray-400">{eventCount} events · {clubCount} clubs</span>
            </span>
            <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-red-300">View all <ChevronDown className="h-4 w-4" /></span>
          </span>
        </button>

        {isUpdating ? <div className="px-4 pb-2 text-[11px] text-gray-500">Updating this area…</div> : null}

        <div className="flex gap-2 overflow-x-auto px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {previewListings.map((listing) => {
            const selected = listing.id === selectedListingId;
            return (
              <article key={listing.id} className={`min-w-[10.25rem] overflow-hidden rounded-2xl border ${selected ? 'border-red-400/65 bg-red-500/[0.09]' : 'border-white/[0.08] bg-white/[0.035]'}`}>
                <button type="button" onClick={() => onSelectListing(listing.id)} className="block w-full text-left">
                  <img src={getListingHeroUrl(listing)} onError={handleListingImageError} alt="" className="h-20 w-full object-cover" />
                  <span className="block px-3 pb-2.5 pt-2">
                    <span className="block truncate text-sm font-semibold text-white">{listing.name}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-gray-400">{formatEventDate(listing)} · {listing.location}</span>
                  </span>
                </button>
                {selected ? (
                  <button type="button" onClick={() => openListing(listing)} className="mx-2.5 mb-2.5 block w-[calc(100%-1.25rem)] rounded-xl bg-red-500 px-3 py-2 text-xs font-bold text-white">
                    View {listing.type}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      {resultsOpen ? (
        <div className="pointer-events-auto absolute inset-0 flex flex-col bg-[#07090d]/98 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-2xl">
          <header className="border-b border-white/[0.08] px-4 pb-3 pt-2">
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => setResultsOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.05] text-white" aria-label="Return to explorer">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 text-center">
                <div className="truncate text-sm font-semibold text-white">{destinationName}</div>
                <div className="text-[11px] text-gray-500">{listings.length} nearby results</div>
              </div>
              <button type="button" onClick={() => setResultsOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.05] text-gray-300" aria-label="Close results">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {['This weekend', 'Events', 'Clubs', 'All tags'].map((label, index) => (
                <button key={label} type="button" className={`whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold ${index === 0 ? 'border-red-400/55 bg-red-500/12 text-red-200' : 'border-white/[0.09] bg-white/[0.035] text-gray-300'}`}>
                  {label}
                </button>
              ))}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <div className="space-y-2.5">
              {listings.map((listing) => (
                <button key={listing.id} type="button" onClick={() => openListing(listing)} className="flex w-full gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-2.5 text-left shadow-lg shadow-black/15">
                  <img src={getListingHeroUrl(listing)} onError={handleListingImageError} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" />
                  <span className="min-w-0 flex-1 py-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-sm font-semibold leading-5 text-white">{listing.name}</span>
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                    </span>
                    <span className="mt-1 block text-xs font-medium text-red-200">{formatEventDate(listing)}</span>
                    <span className="mt-1 block line-clamp-2 text-xs leading-5 text-gray-400">{listing.location}</span>
                    <span className="mt-2 inline-flex rounded-full border border-white/[0.08] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{listing.type}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MobileExplorerPrototype;
