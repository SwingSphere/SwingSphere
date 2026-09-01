import React from 'react';
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import type { Listing } from '../../../types';
import { formatEventTimeRange } from '../../../lib/formatting';
import { getListingHeroUrl, handleListingImageError } from '../../../lib/listingImage';

export const MobileListingCard: React.FC<{ listing: Listing; onClick: () => void }> = ({ listing, onClick }) => (
  <button type="button" onClick={onClick} className="flex min-h-[116px] w-full gap-3 rounded-[22px] border border-white/[0.075] bg-white/[0.035] p-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300">
    <img src={getListingHeroUrl(listing)} onError={handleListingImageError} alt="" className="h-24 w-24 shrink-0 rounded-[16px] object-cover" />
    <span className="min-w-0 flex-1 py-1">
      <span className="flex items-start gap-2">
        <span className="line-clamp-2 flex-1 text-[14px] font-semibold leading-5 text-white">{listing.name}</span>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-600" />
      </span>
      <span className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-red-200">
        {listing.type === 'event' ? <CalendarDays className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
        <span className="truncate">{listing.type === 'event' ? formatEventTimeRange(listing.time.start, listing.time.end) : 'Club'}</span>
      </span>
      <span className="mt-1.5 block line-clamp-2 text-[11px] leading-4 text-gray-400">{listing.location}</span>
    </span>
  </button>
);

