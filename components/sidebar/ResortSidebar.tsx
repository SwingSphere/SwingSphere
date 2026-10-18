import React from 'react';
import { ArrowRight, BedDouble, MapPin, Palmtree, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ResortData } from '../../types';
import CountryFlag from '../ui/CountryFlag';
import MiniMapHybrid from '../maps/MiniMapHybrid';
import { resolveResortPublicCoordinates } from '../../lib/travelMarkerModel';

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
  const heroClass = mode === 'floating'
    ? 'relative h-40 shrink-0 overflow-hidden bg-[#061410] xl:h-48'
    : 'relative h-48 shrink-0 overflow-hidden bg-[#061410] xl:h-52';
  const contentClass = mode === 'embedded' || mode === 'floating'
    ? 'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 [scrollbar-width:thin]'
    : 'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 [scrollbar-width:thin]';
  const location = [
    resort.geopoint.address.city,
    resort.geopoint.address.region || resort.geopoint.address.country,
  ].filter(Boolean).join(', ');
  const coords = resolveResortPublicCoordinates(resort);
  const mapCenter = coords ? { lat: coords.latitude, lng: coords.longitude } : null;
  const amenities = Array.isArray(resort.amenities) ? resort.amenities : [];
  const visibleTags = amenities.slice(0, 3);
  const remainingTagCount = Math.max(0, amenities.length - visibleTags.length);
  const logoImage = resort.logoImageUrl || '/swingsphere-logo_2.png';

  return (
    <div className={shellClass}>
      <div className={heroClass}>
        {resort.headerImageUrl ? <img src={resort.headerImageUrl} alt={resort.name} className="h-full w-full object-cover opacity-75" /> : null}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_20%,rgba(16,185,129,.28),transparent_36%),linear-gradient(to_top,rgba(0,0,0,.95),rgba(0,0,0,.18))]" />
        <button onClick={onClose} className="ss-glass ss-glass--liquid ss-glass--interactive absolute right-3.5 top-3.5 rounded-full p-2 text-white" aria-label="Close resort details">
          <X className="h-5 w-5" />
        </button>
        {resort.logoImageUrl ? (
          <div className="ss-glass ss-glass--liquid absolute left-4 top-3.5 h-12 w-12 xl:h-16 xl:w-16 overflow-hidden rounded-[16px] xl:rounded-[18px]">
            <img src={logoImage} alt={`${resort.name} logo`} className="h-full w-full object-contain" />
          </div>
        ) : null}
        <div className="absolute bottom-3.5 left-4 right-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <Link
              to={`/resorts/${resort.slug}`}
              className={`${mode === 'floating' ? 'text-xl xl:text-2xl' : 'text-2xl'} block truncate font-bold leading-tight text-white transition hover:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300`}
            >
              {resort.name}
            </Link>
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs xl:text-sm text-gray-300">
              <MapPin className="h-3.5 w-3.5 xl:h-4 xl:w-4 shrink-0 text-emerald-300" />
              <span className="truncate">{location}</span>
              {resort.geopoint.address.country ? <CountryFlag country={resort.geopoint.address.country} className="h-3 w-[18px] shrink-0" /> : null}
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300/45 bg-emerald-400/16 px-2.5 py-0.5 text-[10px] xl:text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-100 backdrop-blur-md">
            <Palmtree className="h-3 w-3" aria-hidden="true" />
            Resort
          </span>
        </div>
      </div>

      <div className={contentClass}>
        {visibleTags.length > 0 ? (
          <div className="flex h-7 shrink-0 min-w-0 flex-nowrap items-center gap-2 overflow-hidden">
            {visibleTags.map((amenity) => (
              <span key={amenity} title={amenity} className="min-w-0 shrink rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                <span className="block truncate whitespace-nowrap">{amenity}</span>
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
            <BedDouble className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{resort.accommodationSummary}</div>
              <div className="text-xs text-gray-500">Stay on property</div>
            </div>
          </div>
          <div className="h-px bg-white/[0.08]" />
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{resort.audienceLabel}</div>
              <div className="text-xs text-gray-500">Experience at a glance</div>
            </div>
          </div>
        </section>

        <section className="ss-glass ss-glass--ambient min-h-[88px] shrink-0 rounded-2xl p-4">
          <p className="whitespace-pre-line text-sm leading-6 text-gray-300">
            {resort.descriptionFull || resort.descriptionShort}
          </p>
        </section>

        {mapCenter ? (
          <div className="ss-glass ss-glass--ambient h-24 shrink-0 overflow-hidden rounded-2xl xl:h-32">
            <MiniMapHybrid
              center={mapCenter}
              cityLabel={resort.geopoint.address.city || resort.name}
              districtLabel={resort.geopoint.address.region || resort.geopoint.address.country || ''}
              isHidden={resort.locationVisibility === 'approximate_public'}
              showAttributionText={false}
            />
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-white/[0.06] px-4 pb-4 pt-3">
        <Link
          to={`/resorts/${resort.slug}`}
          className="ss-glass ss-glass--liquid ss-glass--interactive ss-discovery-next-step ss-discovery-next-step--resort relative z-10 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[rgba(6,32,24,0.94)] px-5 text-base font-bold text-white shadow-[0_-8px_24px_rgba(0,0,0,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-emerald-300"
        >
          View Resort Details
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
};

export default ResortSidebar;
