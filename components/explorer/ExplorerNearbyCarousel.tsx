import React from 'react';
import { Star } from 'lucide-react';
import type { Listing } from '../../types';
import { getListingHeroUrl, handleListingImageError } from '../../lib/listingImage';
import { getListingPhysicalAddress } from '../../lib/entityCompatibility';
import { formatAddressRegion } from '../../lib/formatting';
import CountryFlag from '../ui/CountryFlag';
import ListingAccessSummary from '../listing/ListingAccessSummary';

const typePillClasses: Record<string, string> = {
  event: 'border-amber-300/55 bg-amber-400/16 text-amber-200',
  club: 'border-red-400/60 bg-red-500/16 text-red-200',
  promoter: 'border-cyan-300/55 bg-cyan-400/16 text-cyan-200',
  resort: 'border-emerald-300/55 bg-emerald-400/16 text-emerald-200',
  cruise: 'border-violet-300/55 bg-violet-400/16 text-violet-200',
};

const ExplorerNearbyCarousel: React.FC<{
  listings: Listing[];
  selectedListingId: string | null;
  activeRegionName?: string | null;
  title?: string;
  emptyMessage?: string;
  distanceLabels?: Record<string, string>;
  isUpdating?: boolean;
  onSelectListing: (listingId: string) => void;
}> = ({
  listings,
  selectedListingId,
  activeRegionName = null,
  title,
  emptyMessage = 'No nearby listings match the current filters.',
  distanceLabels = {},
  isUpdating = false,
  onSelectListing,
}) => {
  const visibleListings = listings.slice(0, 6);

  return (
    <section className="ss-glass ss-glass--liquid h-full overflow-hidden rounded-[20px] px-[clamp(10px,0.9vw,14px)] py-[clamp(9px,1vh,12px)] text-gray-100" aria-label="Nearby listings">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-red-300">
          {title ?? (activeRegionName ? `Nearby in ${activeRegionName}` : 'Nearby & Featured')}
        </h2>
        {isUpdating ? (
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-red-200/70">Updating…</span>
        ) : null}
      </div>

      {visibleListings.length ? (
        <div className="grid h-[calc(100%-1.7rem)] grid-cols-5 gap-2 overflow-hidden 2xl:grid-cols-6">
          {visibleListings.map((listing, index) => {
            const physicalAddress = getListingPhysicalAddress(listing);
            const compactLocation = [
              physicalAddress.city,
              formatAddressRegion(physicalAddress.region, physicalAddress.country),
            ].filter(Boolean).join(', ');
            const reviewScore = listing.reviewScore;
            const ratingTotal = reviewScore ? reviewScore.thumbsUp + reviewScore.thumbsDown : 0;
            const rating = ratingTotal > 0 ? ((reviewScore!.thumbsUp / ratingTotal) * 5).toFixed(1) : 'New';
            const selected = listing.id === selectedListingId;

            return (
              <button
                key={listing.id}
                type="button"
                onClick={() => onSelectListing(listing.id)}
                className={`group relative h-full min-w-0 overflow-hidden rounded-xl border text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_14px_34px_rgba(0,0,0,0.28)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 ${index === 5 ? 'hidden 2xl:block' : ''} ${selected ? 'border-red-500/80 bg-red-500/10' : 'border-white/[0.08] bg-[rgba(12,16,24,0.5)] hover:border-red-500/65 hover:bg-red-500/[0.06] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_38px_rgba(0,0,0,0.34),0_0_0_1px_rgba(239,68,68,0.08)]'}`}
              >
                <img
                  src={getListingHeroUrl(listing)}
                  onError={handleListingImageError}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover opacity-55 transition duration-300 group-hover:scale-[1.03]"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/5" />
                <span className={`absolute right-2 top-2 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-md ${typePillClasses[listing.type] ?? 'border-white/10 bg-black/50 text-gray-200'}`}>
                  {listing.type}
                </span>
                <span className="absolute inset-x-0 bottom-0 z-10 p-[clamp(8px,0.75vw,11px)]">
                  <span className="line-clamp-2 block min-h-[2.2rem] text-[13px] font-bold leading-[1.1rem] text-white">{listing.name}</span>
                  <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-gray-300">
                    <span className="truncate">{compactLocation}</span>
                    <CountryFlag country={physicalAddress.country} className="h-2.5 w-[15px]" />
                  </span>
                  <span className="hidden 2xl:block"><ListingAccessSummary listing={listing} variant="card" /></span>
                  <span className="mt-1.5 flex items-center justify-between gap-3 text-[10px]">
                    <span className="flex items-center gap-1 font-semibold text-yellow-400">
                      <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" /> {rating}
                    </span>
                    <span className="truncate text-gray-400">{distanceLabels[listing.id] ?? (index === 0 ? 'Nearest' : 'Nearby')}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex h-[calc(100%-1.7rem)] items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 text-center text-sm text-gray-500">
          {emptyMessage}
        </div>
      )}
    </section>
  );
};

export default ExplorerNearbyCarousel;
