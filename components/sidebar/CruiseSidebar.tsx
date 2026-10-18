import React from 'react';
import { Anchor, ArrowRight, CalendarDays, Clock3, Ship, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CruiseSailingData, CruiseSeriesData } from '../../types';
import CountryFlag from '../ui/CountryFlag';
import MiniMapHybrid from '../maps/MiniMapHybrid';

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
  const heroClass = mode === 'floating'
    ? 'relative h-40 shrink-0 overflow-hidden bg-[#0b0818] xl:h-48'
    : 'relative h-48 shrink-0 overflow-hidden bg-[#0b0818] xl:h-52';
  const contentClass = mode === 'embedded' || mode === 'floating'
    ? 'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 [scrollbar-width:thin]'
    : 'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 [scrollbar-width:thin]';
  const dateRange = sailing ? `${dateFormatter.format(new Date(sailing.startsAt))} – ${dateFormatter.format(new Date(sailing.endsAt))}` : 'Next sailing pending';
  const departure = sailing ? [sailing.departurePort.portName, sailing.departurePort.city].filter(Boolean).join(', ') : 'Departure port pending';
  const mapCenter = sailing && typeof sailing.departurePort.latitude === 'number' && typeof sailing.departurePort.longitude === 'number'
    ? { lat: sailing.departurePort.latitude, lng: sailing.departurePort.longitude }
    : null;
  const highlights = Array.isArray(series.experienceHighlights) ? series.experienceHighlights : [];
  const visibleTags = highlights.slice(0, 3);
  const remainingTagCount = Math.max(0, highlights.length - visibleTags.length);
  const logoImage = sailing?.logoImageUrl ?? series.logoImageUrl;

  return (
    <div className={shellClass}>
      <div className={heroClass}>
        {(sailing?.headerImageUrl ?? series.headerImageUrl) ? <img src={sailing?.headerImageUrl ?? series.headerImageUrl} alt={series.name} className="h-full w-full object-cover opacity-70" /> : null}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_20%,rgba(139,92,246,.32),transparent_36%),linear-gradient(to_top,rgba(0,0,0,.95),rgba(0,0,0,.18))]" />
        <button onClick={onClose} className="ss-glass ss-glass--liquid ss-glass--interactive absolute right-3.5 top-3.5 rounded-full p-2 text-white" aria-label="Close cruise details">
          <X className="h-5 w-5" />
        </button>
        {logoImage ? (
          <div className="ss-glass ss-glass--liquid absolute left-4 top-3.5 h-12 w-12 xl:h-16 xl:w-16 overflow-hidden rounded-[16px] xl:rounded-[18px]">
            <img src={logoImage} alt={`${series.name} logo`} className="h-full w-full object-contain" />
          </div>
        ) : null}
        <div className="absolute bottom-3.5 left-4 right-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <Link
              to={`/cruises/${series.slug}`}
              className={`${mode === 'floating' ? 'text-xl xl:text-2xl' : 'text-2xl'} block truncate font-bold leading-tight text-white transition hover:text-violet-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300`}
            >
              {series.name}
            </Link>
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs xl:text-sm text-gray-300">
              <Anchor className="h-3.5 w-3.5 xl:h-4 xl:w-4 shrink-0 text-violet-300" />
              <span className="truncate">{departure}</span>
              {sailing?.departurePort.country ? <CountryFlag country={sailing.departurePort.country} className="h-3 w-[18px] shrink-0" /> : null}
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-violet-300/45 bg-violet-400/16 px-2.5 py-0.5 text-[10px] xl:text-[11px] font-bold uppercase tracking-[0.14em] text-violet-100 backdrop-blur-md">
            <Ship className="h-3 w-3" aria-hidden="true" />
            Cruise
          </span>
        </div>
      </div>

      <div className={contentClass}>
        {visibleTags.length > 0 ? (
          <div className="flex h-7 shrink-0 min-w-0 flex-nowrap items-center gap-2 overflow-hidden">
            {visibleTags.map((highlight) => (
              <span key={highlight} title={highlight} className="min-w-0 shrink rounded-full border border-violet-300/25 bg-violet-400/10 px-3 py-1 text-xs font-semibold text-violet-100">
                <span className="block truncate whitespace-nowrap">{highlight}</span>
              </span>
            ))}
            {remainingTagCount > 0 ? (
              <span className="shrink-0 whitespace-nowrap rounded-full border border-white/12 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-gray-300">
                +{remainingTagCount}
              </span>
            ) : null}
          </div>
        ) : null}

        <section className="ss-glass ss-glass--ambient grid shrink-0 gap-3 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{dateRange}</div>
              <div className="text-xs text-gray-500">Next sailing</div>
            </div>
          </div>
          <div className="h-px bg-white/[0.08]" />
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{sailing ? `${sailing.durationNights} nights aboard ${sailing.shipName}` : 'Sailing details coming soon'}</div>
              <div className="text-xs text-gray-500">Voyage at a glance</div>
            </div>
          </div>
        </section>

        <section className="ss-glass ss-glass--ambient min-h-[88px] shrink-0 rounded-2xl p-4">
          <p className="whitespace-pre-line text-sm leading-6 text-gray-300">
            {series.descriptionFull || series.descriptionShort}
          </p>
        </section>

        {mapCenter ? (
          <div className="ss-glass ss-glass--ambient h-24 shrink-0 overflow-hidden rounded-2xl xl:h-32">
            <MiniMapHybrid
              center={mapCenter}
              cityLabel={sailing?.departurePort.city || sailing?.departurePort.portName || series.name}
              districtLabel={sailing?.departurePort.country || ''}
              showAttributionText={false}
            />
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-white/[0.06] px-4 pb-4 pt-3">
        <Link
          to={`/cruises/${series.slug}`}
          className="ss-glass ss-glass--liquid ss-glass--interactive ss-discovery-next-step ss-discovery-next-step--cruise relative z-10 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[rgba(24,12,44,0.94)] px-5 text-base font-bold text-white shadow-[0_-8px_24px_rgba(0,0,0,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-violet-300"
        >
          View Cruise Details
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
};

export default CruiseSidebar;
