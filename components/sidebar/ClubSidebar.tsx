import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, MapPin, Star, UsersRound, X } from 'lucide-react';
import type { Listing } from '../../types';
import { formatAddressRegion, formatClockTime, formatEventTimeRange } from '../../lib/formatting';
import CountryFlag from '../ui/CountryFlag';
import { getListingCanonicalPath } from '../../lib/entityUtils';
import type { EntityIndex } from '../../lib/entityIndex';
import { getListingHeroUrl, getListingLogoUrl, handleListingImageError } from '../../lib/listingImage';
import { getListingPhysicalAddress, getListingPhysicalCoords } from '../../lib/entityCompatibility';
import { getApproximateLocationCenter, getPublicLocationLabel, isApproximateLocation } from '../../lib/publicLocation';
import MiniMapHybrid from '../maps/MiniMapHybrid';
import { getCompactAudienceLabel } from '../../lib/accessDisplay';

interface ClubSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  selectedListingId: string | null;
  listings: Listing[];
  entityIndex?: EntityIndex;
  mode?: 'drawer' | 'embedded' | 'floating';
}

export const ClubSidebar: React.FC<ClubSidebarProps> = ({
  isOpen,
  onClose,
  selectedListingId,
  listings,
  entityIndex,
  mode = 'drawer',
}) => {
  const listing = listings.find((item) => item.id === selectedListingId) ?? null;

  const tags = listing ? (listing.type === 'club' ? listing.generalAmenities : listing.tags) : [];
  const description = listing
    ? listing.type === 'club'
      ? listing.description_short
      : listing.description_full
    : 'Select a listing to see details.';
  const physicalAddress = listing ? getListingPhysicalAddress(listing, { listings }) : null;
  const isApproximateVenue = isApproximateLocation(listing);
  const publicLocationLabel = listing ? getPublicLocationLabel(listing, { listings }) : '';
  const compactLocation = listing
    ? isApproximateVenue
      ? publicLocationLabel
      : [
          physicalAddress?.city,
          physicalAddress ? formatAddressRegion(physicalAddress.region, physicalAddress.country) : '',
        ].filter(Boolean).join(', ')
    : '';
  const audienceLabel = listing ? getCompactAudienceLabel(listing.attendancePolicy) : '';
  const physicalCoords = listing ? getListingPhysicalCoords(listing, { listings }) : null;
  const approximateCenter = listing && isApproximateVenue
    ? getApproximateLocationCenter(listing, { listings })
    : null;
  const mapCenter = approximateCenter
    ? { lat: approximateCenter.latitude, lng: approximateCenter.longitude }
    : physicalCoords
    ? { lat: physicalCoords.lat, lng: physicalCoords.lng }
    : null;
  const isPrivateVenue = listing?.type === 'event' && Boolean(listing.isAddressPrivate);
  const visibleTags = tags.slice(0, 3);
  const remainingTagCount = Math.max(0, tags.length - visibleTags.length);
  const coverImage = getListingHeroUrl(listing);
  const logoImage = getListingLogoUrl(listing);
  const reviewScore = listing?.reviewScore;
  const ratingTotal = reviewScore ? reviewScore.thumbsUp + reviewScore.thumbsDown : 0;
  const rating = ratingTotal > 0 ? (reviewScore!.thumbsUp / ratingTotal) * 5 : null;

  let timeLabel = 'Hours not available';
  if (listing?.type === 'event' && listing.time) {
    const formatted = formatEventTimeRange(listing.time.start, listing.time.end);
    timeLabel = formatted || 'Hours not available';
  } else if (listing?.type === 'club' && listing.schedule?.length) {
    const nextOpen = listing.schedule.find((day) => !day.isClosed && day.open && day.close);
    if (nextOpen) {
      timeLabel = `${nextOpen.day} · ${formatClockTime(nextOpen.open)} – ${formatClockTime(nextOpen.close)}`;
    }
  }

  if (!isOpen) return null;

  const shellClass =
    mode === 'floating'
      ? 'ss-glass ss-glass--liquid flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[24px] text-gray-100'
      : mode === 'embedded'
      ? 'ss-glass ss-glass--liquid flex h-full min-h-0 w-full flex-col overflow-hidden rounded-l-[24px] text-gray-100'
      : 'ss-glass ss-glass--liquid absolute right-0 top-0 z-20 flex h-full min-h-0 w-full flex-col overflow-hidden rounded-l-[24px] text-gray-100 transition-transform duration-300 ease-in-out sm:w-[400px]';
  const heroClass = mode === 'floating'
    ? 'relative h-44 shrink-0 xl:h-48'
    : mode === 'embedded'
      ? 'relative h-48 shrink-0 xl:h-52'
      : 'relative h-56 shrink-0';
  const contentClass = mode === 'embedded' || mode === 'floating'
    ? 'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5'
    : 'flex min-h-0 flex-1 flex-col gap-4 p-6';

  return (
    <div className={shellClass}>
      <div className={heroClass}>
        <img 
          src={coverImage} 
          onError={handleListingImageError}
          alt={listing?.name ?? 'Listing'} 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
        <button 
          onClick={onClose}
          className="ss-glass ss-glass--liquid ss-glass--interactive absolute right-4 top-4 rounded-full p-2 text-white"
        >
          <X className="w-5 h-5" />
        </button>
        {listing ? (
          <div className="ss-glass ss-glass--liquid absolute left-4 top-4 h-16 w-16 overflow-hidden rounded-[18px] [mask-image:linear-gradient(#000,#000)]">
            <img
              src={logoImage}
              onError={handleListingImageError}
              alt={`${listing.name} logo`}
              className="h-full w-full object-contain"
            />
          </div>
        ) : null}
        <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            {listing ? (
              <Link
                to={getListingCanonicalPath(listing, entityIndex)}
                className={`${mode === 'embedded' ? 'text-2xl' : 'text-3xl'} block truncate font-bold text-white transition hover:text-red-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300`}
              >
                {listing.name}
              </Link>
            ) : null}
            {listing ? (
              <div className="mt-1 flex min-w-0 items-center gap-2 text-sm text-gray-300">
                <MapPin className="h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
                <span className="truncate">{compactLocation}</span>
                {physicalAddress ? <CountryFlag country={physicalAddress.country} className="h-3 w-[18px]" /> : null}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {rating !== null ? (
              <div className="flex items-center gap-1.5 rounded-full border border-yellow-300/20 bg-black/35 px-3 py-1.5 text-sm text-yellow-300 backdrop-blur-md">
                <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                <span className="font-semibold">{rating.toFixed(1)}</span>
              </div>
            ) : null}
            {listing ? (
              <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] backdrop-blur-md ${listing.type === 'club' ? 'border-red-400/45 bg-red-500/18 text-red-200' : 'border-amber-300/45 bg-amber-400/16 text-amber-200'}`}>
                {listing.type === 'club' ? 'Club' : 'Event'}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className={contentClass}>
        <div className="flex h-7 min-w-0 flex-nowrap items-center gap-2 overflow-hidden">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              title={tag}
              className="min-w-0 shrink rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200"
            >
              <span className="block truncate whitespace-nowrap">{tag}</span>
            </span>
          ))}
          {remainingTagCount > 0 ? (
            <span className="shrink-0 whitespace-nowrap rounded-full border border-white/12 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-gray-300">
              +{remainingTagCount}
            </span>
          ) : null}
        </div>

        {listing ? (
          <section className="ss-glass ss-glass--ambient grid shrink-0 gap-3 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <UsersRound className="h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">{audienceLabel}</div>
                <div className="text-xs text-gray-500">Access at a glance</div>
              </div>
            </div>
            <div className="h-px bg-white/[0.08]" />
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{timeLabel}</div>
                <div className="text-xs text-gray-500">Next scheduled opening</div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="ss-glass ss-glass--ambient min-h-[88px] flex-1 overflow-hidden rounded-2xl p-4">
          <p className="line-clamp-4 text-sm leading-6 text-gray-300">{description}</p>
        </section>

        {listing && mapCenter ? (
          <div className="ss-glass ss-glass--ambient mt-auto h-32 shrink-0 overflow-hidden rounded-2xl">
            <MiniMapHybrid
              center={mapCenter}
              cityLabel={physicalAddress?.city || listing.name}
              districtLabel={physicalAddress?.region || ''}
              isHidden={isPrivateVenue || isApproximateVenue}
              showAttributionText={false}
            />
          </div>
        ) : null}

        {listing ? (
          <Link
            to={getListingCanonicalPath(listing, entityIndex)}
            className="ss-glass ss-glass--liquid ss-glass--crimson ss-glass--interactive z-10 mt-1 flex min-h-14 shrink-0 items-center justify-center gap-3 rounded-2xl bg-[rgba(45,8,14,0.92)] px-5 text-base font-bold text-white shadow-[0_-8px_24px_rgba(0,0,0,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-red-300"
          >
            View {listing.type === 'club' ? 'Club' : 'Event'} Details
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </div>
  );
};

export default ClubSidebar;
