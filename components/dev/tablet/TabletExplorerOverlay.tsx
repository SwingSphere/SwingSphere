import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  Clock3,
  Globe2,
  ListFilter,
  MapPin,
  Plus,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import type { EntityIndex } from '../../../lib/entityIndex';
import { formatClockTime, formatEventTimeRange } from '../../../lib/formatting';
import { getListingCanonicalPath } from '../../../lib/entityUtils';
import { getListingHeroUrl, getListingLogoUrl, handleListingImageError } from '../../../lib/listingImage';
import type { Listing } from '../../../types';

type TabletFilter = 'all' | 'event' | 'club';

type TabletExplorerOverlayProps = {
  surfaceMode: 'globe' | 'map';
  listings: Listing[];
  selectedListingId: string | null;
  activeRegionName?: string | null;
  searchText: string;
  onSelectListing: (listingId: string) => void;
  onClearSelection: () => void;
  onNavigate: (path: string) => void;
  onRecenter?: () => void;
  onFilterChange?: (filter: TabletFilter) => void;
  experienceBasePath: string;
  entityIndex?: EntityIndex;
  isUpdating?: boolean;
};

const navItems = [
  { label: 'Explore', path: '', icon: Globe2 },
  { label: 'Nearby', path: '/nearby', icon: MapPin },
  { label: 'Add', path: '/add', icon: Plus, emphasized: true },
  { label: 'Saved', path: '/saved', icon: Bookmark },
  { label: 'Account', path: '/account', icon: UserRound },
] as const;

const humanize = (value?: string) => value
  ? value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
  : 'Check current access rules';

const getListingSummary = (listing: Listing) =>
  listing.type === 'club' ? listing.description_short : listing.description_full;

const getListingTiming = (listing: Listing) => {
  if (listing.type === 'event') {
    return formatEventTimeRange(listing.time.start, listing.time.end) || 'Time to be confirmed';
  }

  const openDays = listing.schedule.filter((day) => !day.isClosed && (day.open || day.close));
  if (!openDays.length) return 'Hours not published';
  const day = openDays[0];
  const range = [day.open ? formatClockTime(day.open) : '', day.close ? formatClockTime(day.close) : '']
    .filter(Boolean)
    .join(' – ');
  return `${day.day}${range ? ` · ${range}` : ''}`;
};

const getListingTags = (listing: Listing) => {
  if (listing.type === 'event') return listing.tags.slice(0, 3);
  return listing.generalAmenities.slice(0, 3);
};

const TabletExplorerOverlay: React.FC<TabletExplorerOverlayProps> = ({
  surfaceMode,
  listings,
  selectedListingId,
  activeRegionName,
  searchText,
  onSelectListing,
  onClearSelection,
  onNavigate,
  onRecenter,
  onFilterChange,
  experienceBasePath,
  entityIndex,
  isUpdating = false,
}) => {
  const [activeFilter, setActiveFilter] = useState<TabletFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);

  const visibleListings = useMemo(
    () => activeFilter === 'all' ? listings : listings.filter((listing) => listing.type === activeFilter),
    [activeFilter, listings],
  );
  const selectedListing = useMemo(
    () => listings.find((listing) => listing.id === selectedListingId) ?? null,
    [listings, selectedListingId],
  );
  const eventCount = visibleListings.filter((listing) => listing.type === 'event').length;
  const clubCount = visibleListings.filter((listing) => listing.type === 'club').length;
  const summary = [
    clubCount ? `${clubCount} ${clubCount === 1 ? 'club' : 'clubs'}` : '',
    eventCount ? `${eventCount} ${eventCount === 1 ? 'event' : 'events'}` : '',
  ].filter(Boolean).join(' · ');
  const destinationName = activeRegionName || selectedListing?.location || (surfaceMode === 'map' ? 'Nearby' : 'Worldwide');
  const trayVisible = Boolean(activeRegionName || selectedListing || searchText);
  const trayListings = selectedListing
    ? [selectedListing, ...visibleListings.filter((listing) => listing.id !== selectedListing.id)].slice(0, 5)
    : visibleListings.slice(0, 5);
  const trayLayoutClass = trayListings.length <= 1
    ? 'w-[290px] right-auto'
    : trayListings.length === 2
      ? 'w-[460px] right-auto'
      : 'right-5';

  const openListing = (listing: Listing) => {
    onNavigate(`${experienceBasePath}${getListingCanonicalPath(listing, entityIndex)}`);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-[78]" aria-label="SwingSphere tablet explorer">
      <div className="pointer-events-auto absolute left-5 top-[max(1.25rem,env(safe-area-inset-top))] flex items-center gap-3">
        <button type="button" onClick={() => onNavigate(`${experienceBasePath}/home`)} className="flex min-h-12 items-center gap-2.5 px-1 text-left" aria-label="SwingSphere home">
          <img src="/swingsphere-logo.png" alt="" className="h-10 w-10 object-contain" />
          <span className="text-[18px] font-black uppercase tracking-[0.04em] leading-none"><span className="text-[#ff2d3b]">Swing</span><span className="text-white">Sphere</span></span>
        </button>
      </div>

      <button
        type="button"
        onClick={() => setFiltersOpen((open) => !open)}
        className="ss-glass ss-glass--liquid pointer-events-auto absolute left-5 top-[max(5.75rem,calc(env(safe-area-inset-top)+5.75rem))] flex h-[68px] w-[330px] items-center gap-3 rounded-[24px] border-white/[0.09] px-4 text-left shadow-[0_18px_50px_rgba(0,0,0,0.34)]"
        aria-expanded={filtersOpen}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-red-500/10 text-red-200"><ListFilter className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.22em] text-red-300/80">Explore</span>
          <span className="mt-1 block truncate text-[15px] font-semibold text-white">{activeFilter === 'all' ? 'Clubs & events' : activeFilter === 'club' ? 'Clubs' : 'Events'} · {destinationName}</span>
        </span>
      </button>

      <div className="pointer-events-auto absolute right-5 top-[max(1.25rem,env(safe-area-inset-top))] flex gap-2">
        <button type="button" onClick={() => setFiltersOpen((open) => !open)} className="ss-glass ss-glass--liquid relative grid h-12 w-12 place-items-center rounded-[18px] text-gray-100 shadow-xl shadow-black/30" aria-label="Open filters">
          <ListFilter className="h-[18px] w-[18px]" />
          {activeFilter !== 'all' ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-400 ring-2 ring-[#111318]" /> : null}
        </button>
        <button type="button" onClick={onRecenter} className="ss-glass ss-glass--liquid grid h-12 w-12 place-items-center rounded-[18px] text-gray-100 shadow-xl shadow-black/30" aria-label="Return to world view"><Globe2 className="h-[19px] w-[19px]" /></button>
      </div>

      {filtersOpen ? (
        <section className="ss-glass ss-glass--liquid pointer-events-auto absolute left-5 top-[max(10.4rem,calc(env(safe-area-inset-top)+10.4rem))] w-[330px] rounded-[26px] border-white/[0.09] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.52)]" aria-label="Tablet discovery filters">
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-[14px] font-semibold text-white">Discover</div><div className="mt-0.5 text-[11px] text-gray-500">Choose what appears on the globe</div></div>
            <button type="button" onClick={() => setFiltersOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.05] text-gray-300" aria-label="Close filters"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {([
              ['all', 'Both'],
              ['club', 'Clubs'],
              ['event', 'Events'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setActiveFilter(value);
                  onFilterChange?.(value);
                }}
                className={`min-h-12 rounded-2xl border px-2 text-xs font-semibold ${activeFilter === value ? 'border-red-400/55 bg-red-500/12 text-red-100' : 'border-white/[0.08] bg-white/[0.03] text-gray-300'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 text-[11px] text-gray-500">{summary || 'Choose a highlighted region to discover places.'}</div>
        </section>
      ) : null}

      {selectedListing ? (
        <aside className="pointer-events-auto absolute bottom-[14.75rem] right-5 top-[6.4rem] w-[min(320px,38vw)] min-w-[292px] overflow-hidden rounded-[30px] border border-white/[0.1] bg-[rgba(9,11,16,0.94)] shadow-[0_28px_90px_rgba(0,0,0,0.56)] backdrop-blur-[28px] backdrop-saturate-150" aria-label={`${selectedListing.name} preview`}>
          <div className="relative h-[205px] overflow-hidden bg-[#11151b]">
            <img src={getListingHeroUrl(selectedListing)} onError={handleListingImageError} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#090b10] via-black/10 to-black/30" />
            <div className="absolute left-4 top-4 h-[74px] w-[74px] overflow-hidden rounded-[20px] border border-white/[0.16] bg-black/70 shadow-xl backdrop-blur-md">
              <img src={getListingLogoUrl(selectedListing)} onError={handleListingImageError} alt={`${selectedListing.name} logo`} className="h-full w-full object-contain" />
            </div>
            <button type="button" onClick={onClearSelection} className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full border border-white/[0.12] bg-black/55 text-white backdrop-blur-lg" aria-label="Close listing preview"><X className="h-5 w-5" /></button>
          </div>

          <div className="flex h-[calc(100%-205px)] min-h-0 flex-col p-4">
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-red-300/80">{selectedListing.type}</div>
              <h2 className="mt-1 line-clamp-2 text-[22px] font-semibold leading-tight tracking-[-0.025em] text-white">{selectedListing.name}</h2>
              <div className="mt-2 flex items-start gap-1.5 text-[12px] leading-5 text-gray-400"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-200" />{selectedListing.location}</div>

              {getListingTags(selectedListing).length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {getListingTags(selectedListing).map((tag) => <span key={tag} className="rounded-full border border-red-300/15 bg-red-500/[0.07] px-2.5 py-1 text-[10px] font-medium text-red-100">{tag}</span>)}
                </div>
              ) : null}

              <div className="mt-4 overflow-hidden rounded-[22px] border border-white/[0.07] bg-black/25">
                <div className="flex gap-3 p-3.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-500/[0.08] text-red-200"><UsersRound className="h-4 w-4" /></span>
                  <span className="min-w-0"><span className="block text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">Access</span><span className="mt-1 block text-[13px] font-semibold text-white">{humanize(selectedListing.attendancePolicy)}</span></span>
                </div>
                <div className="mx-3 border-t border-white/[0.06]" />
                <div className="flex gap-3 p-3.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-500/[0.08] text-red-200">{selectedListing.type === 'event' ? <CalendarDays className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}</span>
                  <span className="min-w-0"><span className="block text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">{selectedListing.type === 'event' ? 'When' : 'Next opening'}</span><span className="mt-1 block text-[13px] font-semibold leading-5 text-white">{getListingTiming(selectedListing)}</span></span>
                </div>
              </div>

              <p className="mt-4 line-clamp-5 text-[12px] leading-5 text-gray-300">{getListingSummary(selectedListing)}</p>
            </div>

            <button type="button" onClick={() => openListing(selectedListing)} className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[20px] border border-red-400/25 bg-red-500/12 px-4 text-[13px] font-bold text-white shadow-[0_14px_32px_rgba(0,0,0,0.24)]">
              View {selectedListing.type === 'club' ? 'Club' : 'Event'} Details <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </aside>
      ) : null}

      {trayVisible ? (
        <section className={`pointer-events-auto absolute bottom-[5.4rem] left-5 overflow-hidden rounded-[28px] border border-white/[0.09] bg-[rgba(8,10,14,0.9)] shadow-[0_22px_70px_rgba(0,0,0,0.48)] backdrop-blur-[28px] ${trayLayoutClass}`} aria-label="Nearby listings">
          <div className="flex items-center justify-between gap-4 px-4 pb-1.5 pt-2.5">
            <div className="min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.22em] text-red-300/80">Nearby {activeRegionName ? `in ${activeRegionName}` : ''}{isUpdating ? ' · Updating…' : ''}</div>
            {visibleListings.length > 5 ? <button type="button" onClick={() => setResultsOpen(true)} className="shrink-0 text-[11px] font-semibold text-gray-300">View all</button> : null}
          </div>
          <div className="flex gap-2 overflow-x-auto px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {trayListings.map((listing) => {
              const selected = listing.id === selectedListingId;
              return (
                <button key={listing.id} type="button" onClick={() => selected ? openListing(listing) : onSelectListing(listing.id)} className={`flex min-h-[78px] min-w-[150px] max-w-[178px] items-center gap-2.5 rounded-[20px] border p-2.5 text-left ${selected ? 'border-red-400/55 bg-red-500/[0.09]' : 'border-white/[0.07] bg-white/[0.025]'}`}>
                  <img src={getListingLogoUrl(listing)} onError={handleListingImageError} alt="" className="h-11 w-11 shrink-0 rounded-[13px] bg-black/25 object-contain" />
                  <span className="min-w-0"><span className="block line-clamp-2 text-[12px] font-semibold leading-4 text-white">{listing.name}</span><span className="mt-1 block truncate text-[10px] text-gray-500">{listing.type === 'event' ? formatEventTimeRange(listing.time.start, listing.time.end) : listing.location}</span></span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <nav className="pointer-events-auto absolute bottom-4 left-1/2 grid h-[58px] w-[min(470px,62vw)] -translate-x-1/2 grid-cols-5 rounded-[24px] border border-white/[0.08] bg-[rgba(7,9,13,0.92)] px-2 shadow-[0_16px_50px_rgba(0,0,0,0.46)] backdrop-blur-[28px]" aria-label="Tablet navigation">
        {navItems.map(({ label, path, icon: Icon, emphasized }) => (
          <button key={label} type="button" onClick={() => path ? onNavigate(`${experienceBasePath}${path}`) : onRecenter?.()} className={`flex min-h-11 flex-col items-center justify-center gap-0.5 text-[9px] font-semibold ${label === 'Explore' ? 'text-red-200' : 'text-gray-500'}`} aria-current={label === 'Explore' ? 'page' : undefined}>
            <span className={emphasized ? '-mt-4 grid h-11 w-11 place-items-center rounded-2xl bg-red-500 text-white shadow-[0_10px_28px_rgba(239,68,68,0.36)]' : ''}><Icon className="h-[18px] w-[18px]" /></span>
            <span className={emphasized ? '-mt-0.5' : ''}>{label}</span>
          </button>
        ))}
      </nav>

      {resultsOpen ? (
        <div className="pointer-events-auto absolute inset-0 z-[130] flex items-center justify-center bg-black/55 p-8 backdrop-blur-sm" onClick={() => setResultsOpen(false)}>
          <section className="max-h-[78vh] w-[min(720px,88vw)] overflow-hidden rounded-[30px] border border-white/[0.1] bg-[#0a0d12] shadow-[0_28px_90px_rgba(0,0,0,0.7)]" onClick={(event) => event.stopPropagation()}>
            <header className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4"><div><div className="text-base font-semibold text-white">{activeRegionName || 'Nearby listings'}</div><div className="mt-0.5 text-[11px] text-gray-500">{visibleListings.length} results</div></div><button type="button" onClick={() => setResultsOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.05] text-gray-300"><X className="h-4 w-4" /></button></header>
            <div className="grid max-h-[calc(78vh-78px)] grid-cols-2 gap-3 overflow-y-auto p-4">
              {visibleListings.map((listing) => <button key={listing.id} type="button" onClick={() => { setResultsOpen(false); onSelectListing(listing.id); }} className="flex min-h-[96px] items-center gap-3 rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-3 text-left"><img src={getListingLogoUrl(listing)} onError={handleListingImageError} alt="" className="h-16 w-16 shrink-0 rounded-2xl bg-black/30 object-contain" /><span className="min-w-0"><span className="block line-clamp-2 text-sm font-semibold text-white">{listing.name}</span><span className="mt-1 block text-[11px] text-red-200">{listing.type === 'event' ? 'Event' : 'Club'}</span><span className="mt-1 block truncate text-[11px] text-gray-500">{listing.location}</span></span></button>)}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
};

export default TabletExplorerOverlay;
