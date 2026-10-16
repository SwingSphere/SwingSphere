import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Building2, CalendarDays, Compass, LayoutGrid, List, Search, SlidersHorizontal, UsersRound, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { resorts as fallbackResorts, cruiseSeries as fallbackCruiseSeries } from '../../data/travelExperiences';
import * as api from '../../lib/api';
import type { CruiseSeriesData, ResortData } from '../../types';
import EntityTypePill from '../entity/EntityTypePill';

export type MobileDirectoryItem = {
  key: string; kind: string; name: string; href: string; image?: string | null;
  logoUrl?: string | null; locationText: string; dateText?: string | null;
  timestamp?: number; searchTarget?: string; policyText?: string | null;
};

export const buildMobileDirectoryTravelItems = (
  resortsList: ResortData[],
  cruiseSeriesList: CruiseSeriesData[],
): MobileDirectoryItem[] => [
  ...resortsList.filter(x => x.status === 'approved' || x.status === 'active').map(x => ({
    key: 'resort:' + x.id, kind: 'resort', name: x.name, href: '/resorts/' + x.slug,
    image: x.headerImageUrl, logoUrl: x.logoImageUrl,
    locationText: [x.geopoint?.address?.city, x.geopoint?.address?.country].filter(Boolean).join(', '),
    searchTarget: [x.name, x.geopoint?.address?.city, x.geopoint?.address?.country].filter(Boolean).join(' ').toLowerCase(),
  })),
  ...cruiseSeriesList.filter(x => x.status === 'approved' || x.status === 'active').map(x => ({
    key: 'cruise:' + x.id, kind: 'cruise', name: x.name, href: '/cruises/' + x.slug,
    image: x.headerImageUrl, logoUrl: x.logoImageUrl, locationText: x.audienceLabel || 'Cruise experience',
    searchTarget: [x.name, x.audienceLabel].filter(Boolean).join(' ').toLowerCase(),
  })),
];

type Props = {
  cards: MobileDirectoryItem[];
  filterKind: string;
  onKindChange: (kind: string) => void;
};

const CATEGORIES = ['all', 'club', 'event', 'host'] as const;
const LABELS: Record<string, string> = { all: 'All', event: 'Events', club: 'Clubs', host: 'Hosts', resort: 'Resorts', cruise: 'Cruises' };
const SINGULAR_LABELS: Record<string, string> = { event: 'Event', club: 'Club', host: 'Host', resort: 'Resort', cruise: 'Cruise' };
const CATEGORY_ICONS = { all: Compass, club: Building2, event: CalendarDays, host: UsersRound };

export default function MobileDirectory({ cards, filterKind, onKindChange }: Props) {
  const [query, setQuery] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [sort, setSort] = useState<'relevant' | 'az' | 'upcoming'>('relevant');
  const [place, setPlace] = useState('');
  const [dateWindow, setDateWindow] = useState<'all' | '7' | '30'>('all');
  const [audience, setAudience] = useState('');
  const [view, setView] = useState<'list' | 'grid'>(() => {
    try { return sessionStorage.getItem('swingsphere:directory:mobile-view') === 'grid' ? 'grid' : 'list'; } catch { return 'list'; }
  });
  const [count, setCount] = useState(10);
  const [catalogResorts, setCatalogResorts] = useState<ResortData[]>(fallbackResorts);
  const [catalogCruiseSeries, setCatalogCruiseSeries] = useState<CruiseSeriesData[]>(fallbackCruiseSeries);

  useEffect(() => {
    let active = true;
    Promise.all([api.getResorts(), api.getCruiseSeries()])
      .then(([resortRows, seriesRows]) => {
        if (!active) return;
        if (resortRows.length > 0) setCatalogResorts(resortRows);
        if (seriesRows.length > 0) setCatalogCruiseSeries(seriesRows);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const items = useMemo<MobileDirectoryItem[]>(() => {
    const travel = buildMobileDirectoryTravelItems(catalogResorts, catalogCruiseSeries);
    return [...cards, ...travel];
  }, [cards, catalogCruiseSeries, catalogResorts]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items.filter(x => (filterKind === 'all' || x.kind === filterKind)
      && (!q || (x.searchTarget || x.name.toLowerCase()).includes(q))
      && (!place || x.locationText.toLowerCase().includes(place.toLowerCase()))
      && (!audience || (x.policyText || '').toLowerCase().includes(audience.toLowerCase()))
      && (dateWindow === 'all' || (x.kind === 'event' && typeof x.timestamp === 'number' && x.timestamp >= Date.now() && x.timestamp <= Date.now() + Number(dateWindow) * 86400000))); 
    if (sort === 'az') list = [...list].sort((a,b) => a.name.localeCompare(b.name));
    else if (sort === 'upcoming') list = [...list].sort((a,b) => (a.timestamp ?? Infinity) - (b.timestamp ?? Infinity));
    else if (filterKind === 'all' && !q && !place) {
      const ordered: MobileDirectoryItem[] = [];
      const pools = ['event','club','event','club','host','resort','event','club','cruise','club'];
      const used = new Set<string>();
      for (const type of pools) {
        const next = list.find(x => x.kind === type && !used.has(x.key));
        if (next) { ordered.push(next); used.add(next.key); }
      }
      list = [...ordered, ...list.filter(x => !used.has(x.key))];
    }
    return list;
  }, [items, filterKind, query, place, audience, dateWindow, sort]);

  useEffect(() => { setCount(10); }, [filterKind, query, place, audience, dateWindow, sort]);
  const changeView = (next: 'list' | 'grid') => {
    setView(next);
    try { sessionStorage.setItem('swingsphere:directory:mobile-view', next); } catch { /* blocked storage */ }
  };
  const showSpotlight = filterKind === 'all' && !query.trim() && !place && !audience && dateWindow === 'all' && sort === 'relevant';
  const spotlight = showSpotlight ? results.slice(0, 3) : [];
  const feed = results.slice(showSpotlight ? 3 : 0, count);
  const Item = ({ item, compact = false }: {item: MobileDirectoryItem; compact?: boolean}) => {
    const isRow = !compact && view === 'list';
    const artwork = item.image || item.logoUrl;
    const identity = item.logoUrl || artwork;
    const kind = item.kind as 'club' | 'event' | 'host' | 'resort' | 'cruise';
    return (
      <Link to={item.href} className={isRow ? 'relative isolate flex min-h-24 items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-[#10131a] p-2' : 'min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#10131a]'}>
        {isRow && artwork && <img src={artwork} alt="" loading="lazy" decoding="async" className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover object-center opacity-55" />}
        {isRow && <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-[#0b0d14]/95 via-[#0b0d14]/85 to-[#0b0d14]/55" />}
        <div className={isRow ? 'relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/50' : 'aspect-[4/3] overflow-hidden bg-white/5'}>
          {(isRow ? identity : artwork) && <img src={(isRow ? identity : artwork) || ''} alt="" loading="lazy" decoding="async" className={`h-full w-full ${isRow && item.logoUrl ? 'object-contain' : 'object-cover'}`} />}
        </div>
        <div className={isRow ? 'relative min-w-0 flex-1' : 'min-w-0 p-2'}>
          <EntityTypePill tone={kind} className="mb-1 !px-2 !py-0.5 !text-[9px]">{SINGULAR_LABELS[item.kind] || item.kind}</EntityTypePill>
          <div className="line-clamp-2 text-sm font-semibold text-white drop-shadow-md">{item.name}</div>
          <div className="mt-1 line-clamp-1 text-[11px] text-gray-300">{item.dateText || item.locationText}</div>
        </div>
      </Link>
    );
  };
  return (
    <main className="min-h-screen bg-[#07090f] px-3 pb-16 pt-4 text-white" aria-label="Mobile directory">
      <h1 className="mb-3 text-xl font-bold">Explore the Directory</h1>
      <div className="flex gap-2">
        <label className="flex min-h-12 flex-1 items-center gap-2 rounded-xl border border-white/15 bg-[#10131a] px-3">
          <Search size={18} className="text-gray-400" />
          <input value={query} onChange={e=>setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search places and events" aria-label="Search mobile directory"/>
          {query && <button type="button" onClick={()=>setQuery('')} aria-label="Clear search"><X size={18}/></button>}
        </label>
        <button type="button" aria-expanded={advanced} aria-label="Advanced filters" onClick={()=>setAdvanced(!advanced)} className="flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-white/15"><SlidersHorizontal size={19}/></button>
      </div>
      <nav aria-label="Directory categories" className="mt-3 rounded-xl border border-white/10 bg-[#090c13] p-1">
        <div className="grid grid-cols-4 gap-1">
          {CATEGORIES.map(type => {
            const Icon = CATEGORY_ICONS[type];
            const selected = filterKind === type;
            return <button key={type} type="button" onClick={()=>onKindChange(type)} aria-pressed={selected} className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg border px-1 text-[11px] font-semibold transition-colors ${selected ? 'border-red-500/40 bg-red-500/15 text-white' : 'border-transparent text-gray-300 hover:bg-white/[0.06]'}`}>
              <Icon className={`h-3.5 w-3.5 shrink-0 ${selected ? 'text-red-400' : 'text-gray-400'}`} aria-hidden="true" />
              <span>{LABELS[type]}</span>
            </button>;
          })}
        </div>
      </nav>
      <Link to="/travel" className="mt-1 flex min-h-9 items-center justify-end gap-1.5 px-1 text-xs font-semibold text-gray-300 hover:text-white">
        <Compass className="h-3.5 w-3.5 text-violet-300" aria-hidden="true" />
        <span>Explore Resorts &amp; Cruises</span>
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
      {advanced && <section className="mt-3 space-y-3 rounded-xl border border-white/15 bg-[#10131a] p-3" aria-label="Advanced directory filters">
        <label className="block text-xs text-gray-300">City or location<input value={place} onChange={e=>setPlace(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white" placeholder="Any location"/></label>
        <label className="block text-xs text-gray-300">Audience or access<input value={audience} onChange={e=>setAudience(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white" placeholder="Any audience"/></label>
        <label className="block text-xs text-gray-300">Event dates<select value={dateWindow} onChange={e=>setDateWindow(e.target.value as typeof dateWindow)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-[#10131a] px-3 text-sm text-white"><option value="all">Any date</option><option value="7">Next 7 days</option><option value="30">Next 30 days</option></select></label>
        <label className="block text-xs text-gray-300">Sort<select value={sort} onChange={e=>setSort(e.target.value as typeof sort)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-[#10131a] px-3 text-sm text-white"><option value="relevant">Relevant / upcoming</option><option value="upcoming">Upcoming first</option><option value="az">Name A–Z</option></select></label>
      </section>}
      {spotlight.length > 0 && <section className="mt-4">
        <h2 className="mb-2 text-sm font-bold">Spotlight · Discover</h2>
        <div className="grid grid-cols-3 gap-2">{spotlight.map(x=><Item key={x.key} item={x} compact />)}</div>
      </section>}
      <section className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div><h2 className="text-sm font-bold">Directory</h2><p className="text-[11px] text-gray-400">{Math.min(count,results.length)} of {results.length} listings</p></div>
          <div className="flex rounded-lg border border-white/15" aria-label="Results layout">
            <button type="button" aria-label="List view" aria-pressed={view==='list'} onClick={()=>changeView('list')} className={`min-h-11 min-w-11 rounded-l-lg grid place-items-center ${view==='list'?'bg-red-500/25':''}`}><List size={18}/></button>
            <button type="button" aria-label="Grid view" aria-pressed={view==='grid'} onClick={()=>changeView('grid')} className={`min-h-11 min-w-11 rounded-r-lg grid place-items-center ${view==='grid'?'bg-red-500/25':''}`}><LayoutGrid size={18}/></button>
          </div>
        </div>
        {results.length === 0 ? <p className="py-10 text-center text-sm text-gray-400">No matching listings. Try another category or search.</p> : <div className={view==='grid'?'grid grid-cols-2 gap-2 max-[339px]:grid-cols-1':'flex flex-col gap-2'}>{feed.map(x=><Item key={x.key} item={x}/>)}</div>}
        {count < results.length && <button type="button" onClick={()=>setCount(n=>n+12)} className="mt-5 min-h-12 w-full rounded-xl border border-white/20 bg-white/5 text-sm font-semibold">Show 12 more results</button>}
      </section>
    </main>
  );
}
