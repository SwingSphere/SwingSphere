import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  Building2,
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Flame,
  Globe2,
  HelpCircle,
  MapPinned,
  Palmtree,
  Ship,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import type { ExplorerListingType } from './ExplorerProvider';
import { useAppStore } from '../../store/appStore';
import TimeLensModal from '../time-lens/TimeLensModal';
import { EXPLORER_ACCESS_FILTERS } from '../../lib/explorerFilters';

const discoveryModes: Array<{
  type: ExplorerListingType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeClass: string;
  idleClass: string;
}> = [
  {
    type: 'event',
    label: 'Events',
    icon: CalendarDays,
    activeClass: 'border-amber-300/85 bg-amber-400/[0.18] text-amber-50',
    idleClass: 'border-amber-300/34 bg-amber-400/[0.07] text-amber-200/90 hover:border-amber-300/58 hover:bg-amber-400/[0.12] hover:text-amber-50',
  },
  {
    type: 'club',
    label: 'Clubs',
    icon: Building2,
    activeClass: 'border-red-400/85 bg-red-500/[0.18] text-red-50',
    idleClass: 'border-red-400/34 bg-red-500/[0.07] text-red-200/90 hover:border-red-400/58 hover:bg-red-500/[0.12] hover:text-red-50',
  },
  {
    type: 'promoter',
    label: 'Hosts',
    icon: Users,
    activeClass: 'border-blue-400/85 bg-blue-500/[0.18] text-blue-50',
    idleClass: 'border-blue-400/38 bg-blue-500/[0.08] text-blue-200/95 hover:border-blue-400/62 hover:bg-blue-500/[0.13] hover:text-blue-50',
  },
];

const regions = ['North America', 'South America', 'Europe', 'Africa', 'Asia', 'Oceania'];

type ExploreView = 'main' | 'regions';

type ExplorerFilterPanelProps = {
  searchText: string;
  onSearchTextChange: (query: string) => void;
  listingTypes: ExplorerListingType[];
  onListingTypesChange: (types: ExplorerListingType[]) => void;
  selectedTags: string[];
  onSelectedTagsChange: (tags: string[]) => void;
  onOpenTutorial?: () => void;
};

const ExplorerFilterPanel: React.FC<ExplorerFilterPanelProps> = ({
  onSearchTextChange,
  listingTypes,
  onListingTypesChange,
  selectedTags,
  onSelectedTagsChange,
  onOpenTutorial,
}) => {
  const { timeLens, setTimeLens, clearTimeLens } = useAppStore();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
  const [exploreView, setExploreView] = useState<ExploreView>('main');

  const activeMode = listingTypes.length === 1 ? listingTypes[0] : null;
  const showEventTime = activeMode === 'event';
  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (selectedTags.length) parts.push(`${selectedTags.length} access filter${selectedTags.length === 1 ? '' : 's'}`);
    if (timeLens.mode !== 'any') parts.push('Date selected');
    return parts.length ? parts.join(' · ') : 'Audience, access and welcome';
  }, [selectedTags.length, timeLens.mode]);

  const toggleTag = (tag: string) => {
    onSelectedTagsChange(
      selectedTags.includes(tag)
        ? selectedTags.filter((candidate) => candidate !== tag)
        : [...selectedTags, tag],
    );
  };

  const selectMode = (type: ExplorerListingType) => {
    onListingTypesChange(activeMode === type ? [] : [type]);
    if (type !== 'event') clearTimeLens();
  };

  const resetFilters = () => {
    onSearchTextChange('');
    onSelectedTagsChange([]);
    clearTimeLens();
  };

  const chooseRegion = (region: string) => {
    window.dispatchEvent(new CustomEvent('swingsphere:explore-region', { detail: { region } }));
    setExploreView('main');
  };

  return (
    <>
      <aside className="ss-glass ss-glass--liquid flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] p-3.5 text-gray-100" aria-label="Discover">
        {exploreView === 'regions' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <button
              type="button"
              onClick={() => setExploreView('main')}
              className="mb-4 flex items-center gap-2 text-xs font-semibold text-gray-400 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Discover
            </button>
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-red-400">Explore by region</div>
              <p className="mt-1 text-[11px] leading-4 text-gray-500">Choose an area to frame the globe and refresh nearby discovery.</p>
            </div>
            <div className="mt-4 space-y-1.5">
              {regions.map((region) => (
                <button
                  key={region}
                  type="button"
                  onClick={() => chooseRegion(region)}
                  className="ss-glass ss-glass--interactive flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-semibold text-gray-200 transition hover:border-red-400/35 hover:bg-red-500/[0.06]"
                >
                  <span className="flex items-center gap-3">
                    <Globe2 className="h-4 w-4 text-gray-500" aria-hidden="true" />
                    {region}
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-600" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <section>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-red-400">Discover</h2>
                  <p className="mt-1 text-[11px] text-gray-500">What would you like to explore?</p>
                </div>
                {activeMode ? (
                  <button
                    type="button"
                    onClick={() => onListingTypesChange([])}
                    className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 transition hover:text-red-300"
                  >
                    Show all
                  </button>
                ) : null}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {discoveryModes.map(({ type, label, icon: Icon, activeClass, idleClass }) => {
                  const active = activeMode === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={active}
                      onClick={() => selectMode(type)}
                      className={`flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-[11px] font-semibold transition ${active ? activeClass : idleClass}`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2 py-2.5 text-[11px] font-semibold text-gray-600"
                  title="Resort discovery is coming soon"
                >
                  <Palmtree className="h-4 w-4" aria-hidden="true" /> Resorts <span className="text-[9px] uppercase">Soon</span>
                </button>
                <button
                  type="button"
                  disabled
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2 py-2.5 text-[11px] font-semibold text-gray-600"
                  title="Cruise discovery is coming soon"
                >
                  <Ship className="h-4 w-4" aria-hidden="true" /> Cruises <span className="text-[9px] uppercase">Soon</span>
                </button>
              </div>
            </section>

            {showEventTime ? (
              <section className="mt-4 border-t border-white/[0.08] pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">When</div>
                  <button type="button" onClick={() => setIsTimeModalOpen(true)} className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 transition hover:text-white">
                    <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Pick a date
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    ['Tonight', 'today'],
                    ['Weekend', 'weekend'],
                    ['Next 7 days', '7d'],
                  ].map(([label, preset]) => {
                    const active = timeLens.mode === 'soon' && timeLens.preset === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setTimeLens({ mode: 'soon', preset: preset as 'today' | 'weekend' | '7d' | '30d' })}
                        className={`h-9 rounded-lg border px-1.5 text-[10px] font-semibold transition ${active ? 'border-amber-300/70 bg-amber-400/12 text-amber-100' : 'border-white/[0.08] bg-white/[0.035] text-gray-300 hover:border-amber-300/30'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="mt-4 rounded-xl border border-white/[0.08] bg-[rgba(12,16,24,0.42)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md">
              <button
                type="button"
                onClick={() => setFiltersOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                aria-expanded={filtersOpen}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <SlidersHorizontal className="h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-gray-100">More Filters</span>
                    <span className="mt-0.5 block truncate text-[10px] text-gray-500">{filterSummary}</span>
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition ${filtersOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>

              {filtersOpen ? (
                <div className="border-t border-white/[0.08] px-3 pb-3 pt-3">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500">Access & Welcome</div>
                  <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1">
                    {EXPLORER_ACCESS_FILTERS.map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() => toggleTag(filter.id)}
                        className={`rounded-full border px-2 py-1 text-[10px] font-semibold transition ${selectedTags.includes(filter.id) ? 'border-red-500/70 bg-red-500/14 text-red-200' : 'border-white/[0.08] bg-white/[0.035] text-gray-400 hover:border-red-400/30 hover:text-gray-200'}`}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={resetFilters} className="mt-3 text-[10px] font-semibold text-gray-500 transition hover:text-red-300">
                    Reset filters
                  </button>
                </div>
              ) : null}
            </section>

            <section className="mt-4 border-t border-white/[0.08] pt-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">Explore</div>
              <div className="mt-2 space-y-1">
                <button
                  type="button"
                  onClick={() => setExploreView('regions')}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.05]"
                >
                  <span className="flex items-center gap-2.5 text-xs font-semibold text-gray-300">
                    <Globe2 className="h-4 w-4 text-gray-500" aria-hidden="true" /> Regions
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-600" aria-hidden="true" />
                </button>
                {[
                  { label: 'Cities', icon: MapPinned },
                  { label: 'Trending', icon: Flame },
                  { label: 'Saved', icon: Bookmark },
                ].map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    type="button"
                    disabled
                    className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-gray-600"
                    title={`${label} discovery is coming soon`}
                  >
                    <span className="flex items-center gap-2.5 text-xs font-semibold">
                      <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                    </span>
                    <span className="text-[9px] font-semibold uppercase tracking-wide">Soon</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        <div className="mt-auto pt-3">
          <button
            type="button"
            onClick={onOpenTutorial}
            className="ss-glass ss-glass--liquid ss-glass--interactive flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-red-300/20 bg-red-500/10 text-red-200">
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-xs font-semibold text-white">How to Explore</span>
              <span className="mt-0.5 block text-[11px] text-gray-500">Learn the globe in 45 seconds</span>
            </span>
          </button>
        </div>
      </aside>
      <TimeLensModal isOpen={isTimeModalOpen} onClose={() => setIsTimeModalOpen(false)} />
    </>
  );
};

export default ExplorerFilterPanel;
