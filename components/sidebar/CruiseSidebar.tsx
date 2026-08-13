import React from 'react';
import { Anchor, ArrowRight, CalendarDays, Clock3, Ship, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CruiseSailingData, CruiseSeriesData } from '../../types';

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const CruiseSidebar: React.FC<{
  series: CruiseSeriesData;
  sailing?: CruiseSailingData | null;
  onClose: () => void;
  mode?: 'drawer' | 'embedded' | 'floating';
}> = ({ series, sailing = null, onClose, mode = 'drawer' }) => {
  const shellClass = mode === 'floating'
    ? 'ss-glass ss-glass--liquid flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[24px] text-gray-100'
    : mode === 'embedded'
      ? 'ss-glass ss-glass--liquid flex h-full min-h-0 w-full flex-col overflow-hidden rounded-l-[24px] text-gray-100'
      : 'ss-glass ss-glass--liquid absolute right-0 top-0 z-20 flex h-full min-h-0 w-full flex-col overflow-hidden rounded-l-[24px] text-gray-100 transition-transform duration-300 ease-in-out sm:w-[400px]';
  const dateRange = sailing ? `${dateFormatter.format(new Date(sailing.startsAt))} – ${dateFormatter.format(new Date(sailing.endsAt))}` : 'Next sailing pending';
  const departure = sailing ? [sailing.departurePort.portName, sailing.departurePort.city].filter(Boolean).join(', ') : 'Departure port pending';

  return (
    <div className={shellClass}>
      <div className="relative h-48 shrink-0 overflow-hidden bg-[#061018]">
        {(sailing?.headerImageUrl ?? series.headerImageUrl) ? <img src={sailing?.headerImageUrl ?? series.headerImageUrl} alt="" className="h-full w-full object-cover opacity-65" /> : null}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_20%,rgba(55,190,222,.35),transparent_34%),linear-gradient(to_top,rgba(0,0,0,.96),rgba(0,0,0,.12))]" />
        <button onClick={onClose} className="ss-glass ss-glass--interactive absolute right-4 top-4 rounded-full p-2 text-white" aria-label="Close cruise details"><X className="h-5 w-5" /></button>
        <div className="absolute bottom-4 left-5 right-5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200"><Ship className="h-4 w-4" /> Cruise</div>
          <h2 className="mt-2 text-2xl font-black text-white">{series.name}</h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-300"><Anchor className="h-4 w-4 text-cyan-200" />{departure}</div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        <section className="ss-glass ss-glass--ambient grid gap-3 rounded-2xl p-4">
          <div className="flex items-start gap-3"><CalendarDays className="mt-0.5 h-5 w-5 text-cyan-200" /><div><div className="text-sm font-semibold text-white">{dateRange}</div><div className="text-xs text-gray-500">Next sailing</div></div></div>
          <div className="h-px bg-white/[0.08]" />
          <div className="flex items-start gap-3"><Clock3 className="mt-0.5 h-5 w-5 text-cyan-200" /><div><div className="text-sm font-semibold text-white">{sailing ? `${sailing.durationNights} nights aboard ${sailing.shipName}` : 'Sailing details coming soon'}</div><div className="text-xs text-gray-500">Voyage at a glance</div></div></div>
        </section>
        <p className="line-clamp-4 rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-sm leading-6 text-gray-300">{series.descriptionShort}</p>
        <div className="flex flex-wrap gap-2">{series.experienceHighlights.slice(0, 5).map((highlight) => <span key={highlight} className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">{highlight}</span>)}</div>
        <Link to={`/cruises/${series.slug}`} className="ss-glass ss-glass--liquid ss-glass--interactive sticky bottom-0 mt-auto flex min-h-14 items-center justify-center gap-3 rounded-2xl border border-cyan-300/30 bg-[rgba(5,31,42,.92)] px-5 text-base font-black text-white">View Cruise Details <ArrowRight className="h-5 w-5" /></Link>
      </div>
    </div>
  );
};

export default CruiseSidebar;
