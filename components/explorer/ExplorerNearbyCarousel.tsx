import React from 'react';
import { Star } from 'lucide-react';
import type { Listing } from '../../types';
import { getListingCardImageUrl, handleListingImageError } from '../../lib/listingImage';
import { getListingPhysicalAddress } from '../../lib/entityCompatibility';
import { formatAddressRegion } from '../../lib/formatting';
import CountryFlag from '../ui/CountryFlag';
import ListingAccessSummary from '../listing/ListingAccessSummary';

const typePillClasses: Record<string, string> = {
  event: 'border-amber-300/60 bg-amber-400/18 text-amber-100',
  club: 'border-red-400/65 bg-red-500/18 text-red-100',
  promoter: 'border-blue-400/60 bg-blue-500/18 text-blue-100',
  resort: 'border-emerald-300/60 bg-emerald-400/18 text-emerald-100',
  cruise: 'border-violet-300/60 bg-violet-400/18 text-violet-100',
};

const typePillLabels: Record<string, string> = {
  event: 'Event',
  club: 'Club',
  promoter: 'Host',
  resort: 'Resort',
  cruise: 'Cruise',
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
  const visibleListings = listings.slice(0, 12);
  const railRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!selectedListingId || !railRef.current) return;
    const target = railRef.current.querySelector<HTMLElement>(`[data-listing-id="${CSS.escape(selectedListingId)}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [selectedListingId]);

  return (
    <section className="ss-glass ss-glass--liquid h-full overflow-hidden rounded-[20px] px-[clamp(10px,0.9vw,14px)] py-[clamp(9px,1vh,12px)] text-gray-100" aria-label="Nearby listings">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h2 className="truncate text-xs font-bold uppercase tracking-[0.16em] text-red-300">
          {title ?? (activeRegionName ? `Nearby in ${activeRegionName}` : 'Nearby & Featured')}
        </h2>
        {isUpdating ? (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-200/70">Updating…</span>
        ) : listings.length > 0 ? (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
            {listings.length} {listings.length === 1 ? 'result' : 'results'}
          </span>
        ) : null}
      </div>

      {visibleListings.length ? (
        <div
          ref={railRef}
          className="flex h-[calc(100%-1.7rem)] gap-2.5 overflow-x-auto scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:grid xl:grid-cols-5 xl:gap-2 xl:overflow-hidden 2xl:grid-cols-6"
        >
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
            const desktopVisibilityClass = index === 5
              ? 'xl:hidden 2xl:block'
              : index > 5
                ? 'xl:hidden'
                : '';

            return (
              <button
                key={listing.id}
                data-listing-id={listing.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelectListing(listing.id)}
                className={`group relative h-full min-w-0 max-xl:w-[clamp(184px,26vw,216px)] max-xl:shrink-0 max-xl:snap-start overflow-hidden rounded-xl border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 ${desktopVisibilityClass} ${selected ? 'border-red-400/90 bg-red-500/16 ring-1 ring-inset ring-red-400/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_14px_34px_rgba(255,58,85,0.22)]' : 'border-white/[0.08] bg-[rgba(12,16,24,0.5)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_14px_34px_rgba(0,0,0,0.28)] hover:border-red-500/65 hover:bg-red-500/[0.06] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_38px_rgba(0,0,0,0.34),0_0_0_1px_rgba(239,68,68,0.08)]'}`}
              >
                <img
                  src={getListingCardImageUrl(listing)}
                  onError={handleListingImageError}
                  alt=""
                  loading="lazy"
                  className={`absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03] ${selected ? 'opacity-70' : 'opacity-55'}`}
                />
                <span className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/10" />
                {selected ? (
                  <span className="absolute left-2 top-2 rounded-full border border-red-300/60 bg-red-500/85 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white shadow-sm backdrop-blur-md">
                    Selected
                  </span>
                ) : null}
                <span className={`absolute right-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-md ${typePillClasses[listing.type] ?? 'border-white/10 bg-black/50 text-gray-200'}`}>
                  {typePillLabels[listing.type] ?? listing.type}
                </span>
                <span className="absolute inset-x-0 bottom-0 z-10 p-[clamp(8px,0.75vw,11px)]">
                  <span className="line-clamp-2 block min-h-[2.2rem] text-[13px] font-bold leading-[1.1rem] text-white">{listing.name}</span>
                  <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-gray-300">
                    <span className="truncate">{compactLocation || listing.location}</span>
                    {physicalAddress.country ? <CountryFlag country={physicalAddress.country} className="h-2.5 w-[15px] shrink-0" /> : null}
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
        <div className="flex h-[calc(100%-1.7rem)] items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 text-center text-sm text-gray-400">
          {emptyMessage}
        </div>
      )}
    </section>
  );
};

export default ExplorerNearbyCarousel;
