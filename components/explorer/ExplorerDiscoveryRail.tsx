import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  Crosshair,
  Globe2,
  Search,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import type { Listing, OrganizationData } from '../../types';
import type { ExplorerListingType } from './ExplorerProvider';
import { useAppStore } from '../../store/appStore';
import TimeLensModal from '../time-lens/TimeLensModal';
import { getTimeLensSummary } from '../time-lens/timeLensSummary';
import { getListingHeroUrl, getListingLogoUrl, handleListingImageError } from '../../lib/listingImage';
import { getListingPhysicalAddress } from '../../lib/entityCompatibility';
import ListingAccessSummary from '../listing/ListingAccessSummary';
import { formatAddressRegion } from '../../lib/formatting';
import CountryFlag from '../ui/CountryFlag';
import { EXPLORER_ACCESS_FILTERS } from '../../lib/explorerFilters';

const categoryMeta = {
  event: { label: 'Events', color: 'bg-amber-400', text: 'text-amber-300', border: 'border-amber-300/55', shape: 'rounded-full' },
  club: { label: 'Clubs', color: 'bg-red-500', text: 'text-red-300', border: 'border-red-400/55', shape: 'rotate-45 rounded-[2px]' },
  promoter: { label: 'Hosts', color: 'bg-cyan-400', text: 'text-cyan-300', border: 'border-cyan-300/55', shape: 'rounded-[2px]' },
} as const;

const CategoryGlyph: React.FC<{ type: ExplorerListingType; selected?: boolean }> = ({ type, selected = false }) => {
  const meta = categoryMeta[type];
  return (
    <span
      className={`inline-block h-3 w-3 shrink-0 border ${meta.shape} ${selected ? `${meta.color} border-white/80 shadow-[0_0_12px_currentColor]` : `bg-black/30 ${meta.border}`}`}
      aria-hidden="true"
    />
  );
};

type ExplorerDiscoveryRailProps = {
  listings: Listing[];
  organizations?: OrganizationData[];
  listingDistanceLabels?: Record<string, string>;
  selectedListingId: string | null;
  selectedOrganizationId?: string | null;
  onSelectListing: (listingId: string) => void;
  onSelectOrganization?: (organizationId: string) => void;
  searchText: string;
  onSearchTextChange: (query: string) => void;
  listingTypes: ExplorerListingType[];
  onListingTypesChange: (types: ExplorerListingType[]) => void;
  selectedTags: string[];
  onSelectedTagsChange: (tags: string[]) => void;
  activeRegionName?: string | null;
  isUpdating?: boolean;
  emptyStateLabel?: string;
  onReturnToWorld?: () => void;
  onNearMe?: () => void;
  variant?: 'docked' | 'floating';
  surfaceMode?: 'globe' | 'map';
};

const ExplorerDiscoveryRail: React.FC<ExplorerDiscoveryRailProps> = ({
  listings,
  organizations = [],
  listingDistanceLabels = {},
  selectedListingId,
  selectedOrganizationId = null,
  onSelectListing,
  onSelectOrganization,
  searchText,
  onSearchTextChange,
  listingTypes,
  onListingTypesChange,
  selectedTags,
  onSelectedTagsChange,
  activeRegionName = null,
  isUpdating = false,
  emptyStateLabel = 'No venues found in this area.',
  onReturnToWorld,
  onNearMe,
  variant = 'docked',
}) => {
  const { timeLens, setTimeLens, clearTimeLens } = useAppStore();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
  const [isListTransitioning, setIsListTransitioning] = useState(false);
  const [availableListHeight, setAvailableListHeight] = useState(0);
  const listViewportRef = useRef<HTMLDivElement | null>(null);
  const isFloating = variant === 'floating';
  const timeSummary = getTimeLensSummary(timeLens) || 'Any time';
  const visibleListingCount = availableListHeight > 0
    ? Math.max(2, Math.min(4, Math.floor((availableListHeight + 8) / 96)))
    : 4;
  const resultLimit = visibleListingCount;
  const visibleHosts = useMemo(() => {
    if (!listingTypes.includes('promoter')) return [];
    const query = searchText.trim().toLowerCase();
    return organizations
      .filter((organization) => organization.status === 'approved' && organization.globePresence?.visibility === 'visible')
      .filter((organization) => !query || [organization.name, organization.descriptionShort, ...(organization.operatingRegions ?? [])]
        .some((value) => value?.toLowerCase().includes(query)))
      .slice(0, resultLimit);
  }, [listingTypes, organizations, resultLimit, searchText]);
  const visibleListings = useMemo(
    () => listings.slice(0, Math.max(0, resultLimit - visibleHosts.length)),
    [listings, resultLimit, visibleHosts.length],
  );
  const visibleItemCount = visibleHosts.length + visibleListings.length;
  const visibleListingSignature = useMemo(
    () => [...visibleHosts.map((organization) => `host:${organization.id}`), ...visibleListings.map((listing) => listing.id)].join('|'),
    [visibleHosts, visibleListings],
  );

  useEffect(() => {
    setIsListTransitioning(true);
    const timeoutId = window.setTimeout(() => setIsListTransitioning(false), 160);
    return () => window.clearTimeout(timeoutId);
  }, [visibleListingSignature]);

  useEffect(() => {
    const viewport = listViewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return;

    const updateHeight = () => setAvailableListHeight(viewport.clientHeight);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const shellClass = isFloating
    ? 'ss-glass ss-glass--liquid h-full min-h-0 overflow-hidden rounded-[24px] p-3.5 text-gray-100'
    : 'ss-glass ss-glass--liquid min-h-0 overflow-hidden rounded-none border-r-0 px-4 py-4 text-gray-100';
  const innerClass = isFloating
    ? 'flex h-full min-h-0 flex-col'
    : 'flex h-full min-h-0 flex-col rounded-lg border border-white/[0.08] bg-white/[0.025] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_50px_rgba(0,0,0,0.28)]';

  const toggleTag = (tag: string) => {
    onSelectedTagsChange(
      selectedTags.includes(tag)
        ? selectedTags.filter((candidate) => candidate !== tag)
        : [...selectedTags, tag],
    );
  };

  const resetFilters = () => {
    onSearchTextChange('');
    onListingTypesChange([]);
    onSelectedTagsChange([]);
    clearTimeLens();
  };

  return (
    <aside className={shellClass} aria-label="Discovery controls" aria-busy={isUpdating}>
      <div className={innerClass}>
        <section className="border-b border-white/[0.08] p-3.5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-red-400">Search</h2>

          <div className="mt-2.5 flex h-10 items-center gap-2 rounded-lg border border-white/[0.08] bg-[rgba(12,16,24,0.55)] px-3 text-sm text-gray-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md focus-within:border-red-500/50">
            <input
              type="search"
              value={searchText}
              onChange={(event) => onSearchTextChange(event.target.value)}
              placeholder="Search by name, city, or keyword..."
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-200 outline-none placeholder:text-gray-500"
            />
            {onNearMe ? (
              <button type="button" onClick={onNearMe} className="text-gray-500 hover:text-red-300" aria-label="Find listings near me">
                <Crosshair className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
            <Search className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
          </div>

          <div className="mt-3 rounded-lg border border-white/[0.08] bg-[rgba(12,16,24,0.48)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md">
            <button
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
              aria-expanded={filtersOpen}
            >
              <span className="flex min-w-0 items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
                <span>
                  <span className="block text-xs font-bold uppercase tracking-wide text-red-400">Filters</span>
                  <span className="mt-0.5 block truncate text-xs text-gray-400">
                    {timeSummary} &bull; {listingTypes.length ? listingTypes.map((type) => categoryMeta[type].label).join(' + ') : 'All listings'} &bull; {selectedTags.length ? `${selectedTags.length} tags` : 'All tags'}
                  </span>
                </span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition ${filtersOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>

            {filtersOpen ? (
              <div className="border-t border-white/[0.08] px-3 pb-3 pt-2.5">
                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <span>Date Range</span>
                  <button type="button" onClick={() => setIsTimeModalOpen(true)} className="flex items-center gap-1 text-gray-400 hover:text-white">
                    <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Pick a day
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    ['Tonight', 'today'],
                    ['This Weekend', 'weekend'],
                    ['Next 7 Days', '7d'],
                  ].map(([label, preset]) => {
                    const active = timeLens.mode === 'soon' && timeLens.preset === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setTimeLens({ mode: 'soon', preset: preset as 'today' | 'weekend' | '7d' | '30d' })}
                        className={`h-7 rounded-md border px-1.5 text-[11px] font-semibold transition ${active ? 'border-red-500/80 bg-red-500/14 text-red-200' : 'border-white/[0.08] bg-white/[0.035] text-gray-300 hover:border-white/20'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Category</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['club', 'event', 'promoter'] as const).map((type) => {
                      const active = listingTypes.includes(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          aria-pressed={active}
                          onClick={() => onListingTypesChange(active
                            ? listingTypes.filter((candidate) => candidate !== type)
                            : [...listingTypes, type])}
                          className={`flex h-8 items-center justify-center gap-1.5 rounded-md border px-1.5 text-[11px] font-semibold transition ${active ? `border-white/25 bg-white/[0.09] ${categoryMeta[type].text}` : 'border-white/[0.08] bg-white/[0.035] text-gray-300 hover:border-white/20'}`}
                        >
                          <CategoryGlyph type={type} selected={active} />
                          {categoryMeta[type].label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-1.5 text-[10px] text-gray-500">No category selected shows everything.</div>
                </div>

                <div className="mt-3">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Access & Welcome</div>
                  <p className="mb-2 text-[10px] leading-4 text-gray-500">Filter by who can attend and which communities are explicitly welcomed.</p>
                  <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                    {EXPLORER_ACCESS_FILTERS.map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() => toggleTag(filter.id)}
                        className={`rounded-full border px-2 py-1 text-[10px] font-semibold transition ${selectedTags.includes(filter.id) ? 'border-red-500/70 bg-red-500/14 text-red-200' : 'border-white/[0.08] bg-white/[0.035] text-gray-400 hover:border-white/20'}`}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button type="button" onClick={resetFilters} className="mt-3 text-[11px] font-semibold text-gray-500 hover:text-red-300">
                  Reset filters
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col p-3.5">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-red-400">{activeRegionName ?? 'Nearby & Featured'}</h3>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                <span>{listings.length + visibleHosts.length} result{listings.length + visibleHosts.length === 1 ? '' : 's'}</span>
                {isUpdating ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-400/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200 motion-safe:animate-pulse">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-300" />
                    Updating area
                  </span>
                ) : null}
              </div>
            </div>
            {activeRegionName && onReturnToWorld ? (
              <button type="button" onClick={onReturnToWorld} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white">
                <Globe2 className="h-3.5 w-3.5" aria-hidden="true" /> World
              </button>
            ) : null}
          </div>

          <div ref={listViewportRef} className="min-h-0 flex-1 overflow-hidden">
            {visibleItemCount === 0 ? (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-5 text-sm text-gray-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="font-semibold text-gray-200">{emptyStateLabel}</div>
                <div className="mt-1 text-xs text-gray-500">
                  Try zooming out, panning nearby, or clearing filters.
                </div>
              </div>
            ) : (
              <div
                className={`grid h-full min-h-0 gap-2 transition-opacity duration-200 motion-reduce:transition-none ${isListTransitioning ? 'opacity-90' : 'opacity-100'}`}
                style={{ gridTemplateRows: `repeat(${visibleItemCount}, minmax(0, 1fr))` }}
              >
                {visibleHosts.map((organization) => (
                  <ExplorerHostCard
                    key={organization.id}
                    organization={organization}
                    selected={organization.id === selectedOrganizationId}
                    onSelect={() => onSelectOrganization?.(organization.id)}
                  />
                ))}
                {visibleListings.map((listing, index) => (
                  <ExplorerListingCard
                    key={listing.id}
                    listing={listing}
                    distanceLabel={listingDistanceLabels[listing.id] ?? (index === 0 ? 'Nearest' : 'Nearby')}
                    selected={listing.id === selectedListingId}
                    isTransitioning={isListTransitioning}
                    onSelect={() => onSelectListing(listing.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
      <TimeLensModal isOpen={isTimeModalOpen} onClose={() => setIsTimeModalOpen(false)} />
    </aside>
  );
};

const ExplorerHostCard: React.FC<{
  organization: OrganizationData;
  selected: boolean;
  onSelect: () => void;
}> = ({ organization, selected, onSelect }) => {
  const primaryRegion = organization.globePresence?.regions.find((region) => region.status !== 'inactive');
  const heroImage = organization.headerImageUrl || organization.logoImageUrl || '/swingsphere-logo.png';
  const logoImage = organization.logoImageUrl || '/swingsphere-logo.png';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative grid h-full min-h-0 w-full grid-cols-[58px_1fr_auto] items-center gap-2.5 overflow-hidden rounded-lg border p-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_32px_rgba(0,0,0,0.22)] backdrop-blur-md outline-none transition ${selected ? 'border-cyan-300/65 bg-cyan-400/10' : 'border-white/[0.08] bg-[rgba(12,16,24,0.46)] hover:border-cyan-300/25 hover:bg-white/[0.07]'}`}
    >
      <img src={heroImage} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20" />
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/62 to-black/72" />
      <span className="relative z-10 h-[58px] w-[58px] overflow-hidden rounded-md border border-white/10 bg-black/55">
        <img src={logoImage} alt={`${organization.name} logo`} className="h-full w-full object-contain" />
      </span>
      <span className="relative z-10 min-w-0">
        <span className="block truncate text-sm font-bold text-white">{organization.name}</span>
        <span className="mt-0.5 block truncate text-xs text-gray-400">{primaryRegion?.label || organization.operatingRegions?.[0] || 'Multiple regions'}</span>
        <span className="mt-1 block truncate text-xs text-gray-500">{organization.descriptionShort || 'Host and event producer'}</span>
      </span>
      <span className="relative z-10 flex h-full flex-col items-end justify-between">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full border bg-black/35 ${categoryMeta.promoter.border}`} title="Host">
          <CategoryGlyph type="promoter" selected={selected} />
        </span>
        <span className="text-[11px] text-cyan-200">Host</span>
      </span>
    </button>
  );
};

const ExplorerListingCard: React.FC<{
  listing: Listing;
  distanceLabel: string;
  selected: boolean;
  isTransitioning: boolean;
  onSelect: () => void;
}> = ({ listing, distanceLabel, selected, isTransitioning, onSelect }) => {
  const physicalAddress = getListingPhysicalAddress(listing);
  const reviewScore = listing.reviewScore;
  const ratingTotal = reviewScore ? reviewScore.thumbsUp + reviewScore.thumbsDown : 0;
  const rating = ratingTotal > 0 ? ((reviewScore!.thumbsUp / ratingTotal) * 5).toFixed(1) : 'New';
  const compactLocation = [
    physicalAddress.city,
    formatAddressRegion(physicalAddress.region, physicalAddress.country),
  ].filter(Boolean).join(', ');

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative grid h-full min-h-0 w-full grid-cols-[58px_1fr_auto] items-center gap-2.5 overflow-hidden rounded-lg border p-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_32px_rgba(0,0,0,0.22)] backdrop-blur-md outline-none cursor-pointer transition-[background-color,border-color,box-shadow,opacity] duration-160 ease-out motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-red-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30 ${selected ? 'border-red-500/70 bg-red-500/12' : 'border-white/[0.08] bg-[rgba(12,16,24,0.46)] hover:border-white/18 hover:bg-white/[0.07]'} ${isTransitioning ? 'opacity-96' : 'opacity-100'}`}
    >
      <img
        src={getListingHeroUrl(listing)}
        onError={handleListingImageError}
        alt=""
        loading="lazy"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20"
      />
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/62 to-black/72" />
      <span className="relative z-10 h-[58px] w-[58px] overflow-hidden rounded-md border border-white/10 bg-black/55 shadow-[0_8px_20px_rgba(0,0,0,0.35)]">
        <img
          src={getListingLogoUrl(listing)}
          onError={handleListingImageError}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-45 blur-md saturate-125"
        />
        <span className="absolute inset-0 bg-black/20" />
        <img
          src={getListingLogoUrl(listing)}
          onError={handleListingImageError}
          alt={`${listing.name} logo`}
          loading="lazy"
          className="relative z-10 h-full w-full object-contain"
        />
      </span>
      <span className="relative z-10 min-w-0">
        <span className="block truncate text-sm font-bold text-white">{listing.name}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-gray-400">
          <span className="truncate">{compactLocation}</span>
          <CountryFlag country={physicalAddress.country} className="h-2.5 w-[15px]" />
        </span>
        <ListingAccessSummary listing={listing} variant="card" />
        <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-yellow-400">
          <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" /> {rating}
        </span>
      </span>
      <span className="relative z-10 flex h-full flex-col items-end justify-between">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full border bg-black/35 ${categoryMeta[listing.type].border}`} title={listing.type === 'club' ? 'Club' : 'Event'}>
          <CategoryGlyph type={listing.type} selected={selected} />
        </span>
        <span className="text-[11px] text-gray-500">{distanceLabel}</span>
      </span>
    </button>
  );
};

export default ExplorerDiscoveryRail;
