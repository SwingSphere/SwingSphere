import React from 'react';
import { ArrowRight, BedDouble, Building2, MapPin, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ResortData } from '../../types';

const ResortSidebar: React.FC<{
  resort: ResortData;
  onClose: () => void;
  mode?: 'drawer' | 'embedded' | 'floating';
}> = ({ resort, onClose, mode = 'drawer' }) => {
  const shellClass = mode === 'floating'
    ? 'ss-glass ss-glass--liquid flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[24px] text-gray-100'
    : mode === 'embedded'
      ? 'ss-glass ss-glass--liquid flex h-full min-h-0 w-full flex-col overflow-hidden rounded-l-[24px] text-gray-100'
      : 'ss-glass ss-glass--liquid absolute right-0 top-0 z-20 flex h-full min-h-0 w-full flex-col overflow-hidden rounded-l-[24px] text-gray-100 transition-transform duration-300 ease-in-out sm:w-[400px]';
  const location = [resort.geopoint.address.city, resort.geopoint.address.region].filter(Boolean).join(', ');

  return (
    <div className={shellClass}>
      <div className="relative h-48 shrink-0 overflow-hidden bg-[#0b0814]">
        {resort.headerImageUrl ? <img src={resort.headerImageUrl} alt="" className="h-full w-full object-cover opacity-70" /> : null}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_20%,rgba(122,82,255,.36),transparent_34%),linear-gradient(to_top,rgba(0,0,0,.96),rgba(0,0,0,.12))]" />
        <button onClick={onClose} className="ss-glass ss-glass--interactive absolute right-4 top-4 rounded-full p-2 text-white" aria-label="Close resort details"><X className="h-5 w-5" /></button>
        <div className="absolute bottom-4 left-5 right-5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-violet-200"><Building2 className="h-4 w-4" /> Resort</div>
          <h2 className="mt-2 text-2xl font-black text-white">{resort.name}</h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-300"><MapPin className="h-4 w-4 text-violet-200" />{location}</div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        <section className="ss-glass ss-glass--ambient grid gap-3 rounded-2xl p-4">
          <div className="flex items-start gap-3"><BedDouble className="mt-0.5 h-5 w-5 text-violet-200" /><div><div className="text-sm font-semibold text-white">{resort.accommodationSummary}</div><div className="text-xs text-gray-500">Stay on property</div></div></div>
          <div className="h-px bg-white/[0.08]" />
          <div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 text-violet-200" /><div><div className="text-sm font-semibold text-white">{resort.audienceLabel}</div><div className="text-xs text-gray-500">Experience at a glance</div></div></div>
        </section>
        <p className="line-clamp-4 rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-sm leading-6 text-gray-300">{resort.descriptionShort}</p>
        <div className="flex flex-wrap gap-2">{resort.amenities.slice(0, 5).map((amenity) => <span key={amenity} className="rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1 text-xs font-semibold text-violet-100">{amenity}</span>)}</div>
        <Link to={`/resorts/${resort.slug}`} className="ss-glass ss-glass--liquid ss-glass--interactive sticky bottom-0 mt-auto flex min-h-14 items-center justify-center gap-3 rounded-2xl border border-violet-300/30 bg-[rgba(30,17,52,.92)] px-5 text-base font-black text-white">Explore Resort <ArrowRight className="h-5 w-5" /></Link>
      </div>
    </div>
  );
};

export default ResortSidebar;
