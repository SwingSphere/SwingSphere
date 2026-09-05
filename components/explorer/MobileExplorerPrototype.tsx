import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronUp,
  Globe2,
  ListFilter,
  MapPin,
  X,
} from 'lucide-react';
import type { Listing } from '../../types';
import type { EntityIndex } from '../../lib/entityIndex';
import { getListingCanonicalPath } from '../../lib/entityUtils';
import { getListingLogoUrl, handleListingImageError } from '../../lib/listingImage';
import { getMobileNavTarget, mobileNavItems } from '../dev/mobile/DevMobileShell';

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
  onRecenter?: () => void;
  onFilterChange?: (filter: MobileFilter) => void;
  devMobileMode?: boolean;
  entityIndex?: EntityIndex;
  isUpdating?: boolean;
};

type MobileFilter = 'all' | 'event' | 'club';

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
  listings,
  selectedListingId,
  activeRegionName,
  searchText,
  onSearchTextChange,
  onSelectListing,
  onNavigate,
  onRecenter,
  onFilterChange,
  devMobileMode = false,
  entityIndex,
  isUpdating = false,
}) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<MobileFilter>('all');

  const visibleListings = useMemo(
    () => activeFilter === 'all' ? listings : listings.filter((listing) => listing.type === activeFilter),
    [activeFilter, listings],
  );
  const selectedListing = useMemo(
    () => listings.find((listing) => listing.id === selectedListingId) ?? null,
    [listings, selectedListingId],
  );
  const destinationName = (devMobileMode ? selectedListing?.name : null) || activeRegionName || (surfaceMode === 'map' ? 'Nearby' : 'Explore the world');
  const summaryListings = devMobileMode ? visibleListings : listings;
  const eventCount = summaryListings.filter((listing) => listing.type === 'event').length;
  const clubCount = summaryListings.filter((listing) => listing.type === 'club').length;
  const resultSummary = [
    eventCount ? `${eventCount} ${eventCount === 1 ? 'event' : 'events'}` : '',
    clubCount ? `${clubCount} ${clubCount === 1 ? 'club' : 'clubs'}` : '',
  ].filter(Boolean).join(' · ');
  const previewListings = selectedListing
    ? [selectedListing, ...visibleListings.filter((listing) => listing.id !== selectedListing.id)].slice(0, 4)
    : visibleListings.slice(0, 4);

  const openListing = (listing: Listing) => {
    onNavigate(getListingCanonicalPath(listing, entityIndex));
  };

  const openResults = () => {
    setSheetOpen(false);
    setResultsOpen(true);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-[75] md:hidden" aria-label="SwingSphere mobile explorer">
      <div className="pointer-events-auto absolute inset-x-3 top-[max(1.45rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => onNavigate('/home')}
          className="flex min-h-11 items-center gap-2.5 px-1 text-left"
          aria-label="SwingSphere home"
        >
          <img src="/swingsphere-logo.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
          <span className="text-[17px] font-black uppercase tracking-[0.04em] leading-none">
            <span className="text-[#ff2d3b]">Swing</span><span className="text-white">Sphere</span>
          </span>
        </button>

        <div className="ss-glass ss-glass--liquid mt-2 flex h-[52px] min-w-0 items-center rounded-[18px] border-white/[0.09] px-3 shadow-[0_18px_50px_rgba(0,0,0,0.36)]">
          <div className="min-w-0 flex-1 px-1">
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-red-300/75">
              {surfaceMode === 'map' ? 'Local view' : 'Explore'}
            </div>
            <div className="mt-0.5 truncate text-[14px] font-semibold text-white">
              {destinationName}
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-auto absolute right-3 top-[calc(max(1.45rem,env(safe-area-inset-top))+7.55rem)] flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="ss-glass ss-glass--liquid relative grid h-11 w-11 place-items-center rounded-2xl text-gray-100 shadow-xl shadow-black/30"
          aria-label="Open filters"
        >
          <ListFilter className="h-[18px] w-[18px]" />
          {activeFilter !== 'all' ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-400 ring-2 ring-[#111318]" /> : null}
        </button>
        <button
          type="button"
          onClick={onRecenter}
          className="ss-glass ss-glass--liquid grid h-11 w-11 place-items-center rounded-2xl text-gray-100 shadow-xl shadow-black/30"
          aria-label="Return to world view"
        >
          <Globe2 className="h-[19px] w-[19px]" />
        </button>
      </div>

      <section
        className={[
          'pointer-events-auto absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden rounded-[28px]',
          'border border-white/[0.09] bg-[rgba(8,10,14,0.94)] shadow-[0_-22px_70px_rgba(0,0,0,0.58)] backdrop-blur-[30px] backdrop-saturate-150',
          'transition-[height] duration-300 ease-out',
          sheetOpen ? 'h-[330px]' : 'h-[158px]',
        ].join(' ')}
        aria-label="Destination and nearby listings"
      >
        <button
          type="button"
          onClick={() => setSheetOpen((current) => !current)}
          className="block w-full px-4 pb-2 pt-2.5 text-left"
          aria-expanded={sheetOpen}
        >
          <span className="mx-auto block h-1 w-10 rounded-full bg-white/20" />
          <span className="mt-2.5 flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[9px] font-bold uppercase tracking-[0.24em] text-red-300/80">Destination</span>
              <span className="mt-0.5 block truncate text-[17px] font-semibold text-white">{destinationName}</span>
              <span className="mt-0.5 block text-[11px] text-gray-400">{devMobileMode ? (selectedListing ? `Selected ${selectedListing.type}` : resultSummary || 'Choose a country to discover nearby places') : `${eventCount} events · ${clubCount} clubs`}</span>
            </span>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.045] text-gray-300 transition-transform ${sheetOpen ? 'rotate-180' : ''}`}>
              <ChevronUp className="h-4 w-4" />
            </span>
          </span>
        </button>

        {isUpdating ? <div className="px-4 pb-1 text-[10px] text-gray-500">Updating this area…</div> : null}

        <div className={`transition-opacity duration-200 ${sheetOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
          {previewListings.length ? (
            <div className="flex gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {previewListings.map((listing) => {
                const selected = listing.id === selectedListingId;
                return (
                  <button
                    key={listing.id}
                    type="button"
                    onClick={() => selected ? openListing(listing) : onSelectListing(listing.id)}
                    className={`relative h-[96px] min-w-[148px] overflow-hidden rounded-2xl border text-left ${selected ? 'border-red-400/65 bg-red-500/[0.09]' : 'border-white/[0.08] bg-white/[0.035]'}`}
                  >
                    <img
                      src={getListingLogoUrl(listing)}
                      onError={handleListingImageError}
                      alt={`${listing.name} logo`}
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                    <span className="absolute inset-x-0 bottom-0 block bg-gradient-to-t from-black/90 via-black/55 to-transparent px-2.5 pb-2 pt-6">
                      <span className="block truncate text-xs font-semibold text-white drop-shadow-sm">{listing.name}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-gray-300">{formatEventDate(listing)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mx-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3 py-4 text-center text-xs text-gray-400">
              {devMobileMode ? (activeRegionName || searchText ? 'No clubs or events match this view. Try another filter or destination.' : 'Choose a highlighted country or search for a destination to begin.') : 'Move the globe or search for a destination to begin.'}
            </div>
          )}

          <button type="button" onClick={openResults} className="mx-3 flex h-9 w-[calc(100%-1.5rem)] items-center justify-center rounded-xl bg-white/[0.055] text-xs font-semibold text-gray-200">
            View all nearby
          </button>
        </div>

        <nav className="absolute inset-x-0 bottom-0 grid min-h-[58px] grid-cols-5 border-t border-white/[0.07] bg-black/25 px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1" aria-label="Mobile navigation">
          {mobileNavItems.map(({ label, path, icon: Icon, emphasized }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (!path) {
                  setSheetOpen(false);
                  return;
                }
                if (!devMobileMode && label === 'Saved') return;
                const target = devMobileMode
                  ? getMobileNavTarget(path)
                  : label === 'Add'
                    ? '/submission'
                    : path;
                onNavigate(target);
              }}
              className={`flex min-h-11 flex-col items-center justify-center gap-1 text-[9px] font-semibold ${!path ? 'text-red-300' : 'text-gray-400'}`}
              aria-current={!path ? 'page' : undefined}
            >
              <span className={emphasized ? '-mt-5 grid h-11 w-11 place-items-center rounded-2xl bg-red-500 text-white shadow-[0_10px_28px_rgba(239,68,68,0.38)]' : ''}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className={emphasized ? '-mt-0.5' : ''}>{label}</span>
            </button>
          ))}
        </nav>
      </section>

      {filtersOpen ? (
        <div className={`pointer-events-auto absolute inset-0 flex items-end bg-black/55 backdrop-blur-sm ${devMobileMode ? 'z-[120]' : ''}`} onClick={() => setFiltersOpen(false)}>
          <section className="w-full rounded-t-[30px] border-t border-white/[0.1] bg-[#0b0d12] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-28px_80px_rgba(0,0,0,0.7)]" onClick={(event) => event.stopPropagation()}>
            <span className="mx-auto block h-1 w-10 rounded-full bg-white/20" />
            <div className="mt-4 flex items-center justify-between">
              <div><div className="text-base font-semibold text-white">Filters</div><div className="text-[11px] text-gray-500">Choose which listings appear on the globe</div></div>
              <button type="button" onClick={() => setFiltersOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.05] text-gray-300"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {([
                ['all', 'Clubs & events'],
                ['event', 'Events'],
                ['club', 'Clubs'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setActiveFilter(value);
                    onFilterChange?.(value);
                  }}
                  className={`rounded-2xl border px-3 py-3 text-xs font-semibold ${activeFilter === value ? 'border-red-400/55 bg-red-500/12 text-red-100' : 'border-white/[0.08] bg-white/[0.03] text-gray-300'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setFiltersOpen(false)} className="mt-4 h-12 w-full rounded-2xl bg-red-500 text-sm font-bold text-white">Show {visibleListings.length} results</button>
          </section>
        </div>
      ) : null}

      {resultsOpen ? (
        <div className={`pointer-events-auto absolute inset-0 flex flex-col bg-[#07090d]/98 pt-[max(2rem,env(safe-area-inset-top))] backdrop-blur-2xl ${devMobileMode ? 'z-[100]' : ''}`}>
          <header className="border-b border-white/[0.08] px-3 pb-3 pt-2">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setResultsOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.05] text-white" aria-label="Return to explorer"><ArrowLeft className="h-5 w-5" /></button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{destinationName}</div>
                <div className="text-[11px] text-gray-500">{visibleListings.length} results</div>
              </div>
              <button type="button" onClick={() => setFiltersOpen(true)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.05] text-gray-300" aria-label="Open filters"><ListFilter className="h-4 w-4" /></button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <div className="space-y-2.5">
              {visibleListings.map((listing) => (
                <button key={listing.id} type="button" onClick={() => openListing(listing)} className="flex w-full gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-2.5 text-left">
                  <img src={getListingLogoUrl(listing)} onError={handleListingImageError} alt={`${listing.name} logo`} className="h-24 w-24 shrink-0 rounded-xl bg-black/30 object-contain" />
                  <span className="min-w-0 flex-1 py-1">
                    <span className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-sm font-semibold leading-5 text-white">{listing.name}</span><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-300" /></span>
                    <span className="mt-1 block text-xs font-medium text-red-200">{formatEventDate(listing)}</span>
                    <span className="mt-1 block line-clamp-2 text-xs leading-5 text-gray-400">{listing.location}</span>
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
