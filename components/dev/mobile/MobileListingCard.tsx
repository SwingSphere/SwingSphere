import React from 'react';
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import type { Listing } from '../../../types';
import { formatEventTimeRange } from '../../../lib/formatting';
import { getListingHeroUrl, getListingLogoUrl, handleListingImageError } from '../../../lib/listingImage';

type MobileListingCardProps = {
  listing: Listing;
  onClick: () => void;
  metaLabel?: string;
  visualMode?: 'default' | 'logo-over-hero';
};

export const MobileListingCard: React.FC<MobileListingCardProps> = ({ listing, onClick, metaLabel, visualMode = 'default' }) => {
  const logoOverHero = visualMode === 'logo-over-hero';

  return (
  <button type="button" onClick={onClick} className="relative flex min-h-[116px] w-full gap-3 overflow-hidden rounded-[22px] border border-white/[0.075] bg-white/[0.035] p-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300">
    {logoOverHero ? (
      <>
        <img src={getListingHeroUrl(listing)} onError={handleListingImageError} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35" />
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(4,6,9,0.86)_0%,rgba(4,6,9,0.72)_42%,rgba(4,6,9,0.9)_100%)]" />
      </>
    ) : null}
    <img src={logoOverHero ? getListingLogoUrl(listing) : getListingHeroUrl(listing)} onError={handleListingImageError} alt="" className={`relative z-10 h-24 w-24 shrink-0 rounded-[16px] ${logoOverHero ? 'border border-white/[0.1] bg-black/35 object-contain' : 'object-cover'}`} />
    <span className="relative z-10 min-w-0 flex-1 py-1">
      <span className="flex items-start gap-2">
        <span className="line-clamp-2 flex-1 text-[14px] font-semibold leading-5 text-white">{listing.name}</span>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-600" />
      </span>
      <span className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-red-200">
        {listing.type === 'event' ? <CalendarDays className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
        <span className="truncate">{listing.type === 'event' ? formatEventTimeRange(listing.time.start, listing.time.end) : 'Club'}</span>
      </span>
      <span className="mt-1.5 block line-clamp-2 text-[11px] leading-4 text-gray-400">{listing.location}</span>
      {metaLabel ? <span className="mt-1 block text-[10px] font-medium text-gray-500">{metaLabel}</span> : null}
    </span>
  </button>
  );
};

