import React from 'react';
import { ArrowRight, CalendarDays, Clock3, MapPin, Star, UsersRound, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { EventData } from '../../types';
import type { EntityIndex } from '../../lib/entityIndex';
import { getListingCanonicalPath } from '../../lib/entityUtils';
import { getListingHeroUrl, getListingLogoUrl, handleListingImageError } from '../../lib/listingImage';
import { getListingPhysicalAddress, getListingPhysicalCoords } from '../../lib/entityCompatibility';
import { formatAddressRegion, formatEventTimeRange } from '../../lib/formatting';
import { getCompactAudienceLabel } from '../../lib/accessDisplay';
import CountryFlag from '../ui/CountryFlag';
import MiniMapHybrid from '../maps/MiniMapHybrid';
import { getApproximateLocationCenter, isApproximateLocation } from '../../lib/publicLocation';

interface EventSidebarProps {
  event: EventData;
  onClose: () => void;
  entityIndex?: EntityIndex;
  mode?: 'drawer' | 'embedded' | 'floating';
}

const EventSidebar: React.FC<EventSidebarProps> = ({ event, onClose, entityIndex, mode = 'drawer' }) => {
  const physicalAddress = getListingPhysicalAddress(event);
  const compactLocation = [
    physicalAddress.city,
    formatAddressRegion(physicalAddress.region, physicalAddress.country),
  ].filter(Boolean).join(', ');
  const reviewScore = event.reviewScore;
  const ratingTotal = reviewScore ? reviewScore.thumbsUp + reviewScore.thumbsDown : 0;
  const rating = ratingTotal > 0 ? (reviewScore!.thumbsUp / ratingTotal) * 5 : null;
  const audienceLabel = getCompactAudienceLabel(event.attendancePolicy);
  const isApproximateVenue = isApproximateLocation(event);
  const physicalCoords = getListingPhysicalCoords(event);
  const approximateCenter = isApproximateVenue ? getApproximateLocationCenter(event) : null;
  const mapCenter = approximateCenter
    ? { lat: approximateCenter.latitude, lng: approximateCenter.longitude }
    : physicalCoords
      ? { lat: physicalCoords.lat, lng: physicalCoords.lng }
      : null;
  const hideExactPin = Boolean(event.isAddressPrivate || isApproximateVenue);
  const visibleTags = event.tags.slice(0, 3);
  const remainingTagCount = Math.max(0, event.tags.length - visibleTags.length);
  const shellClass = mode === 'floating'
    ? 'ss-glass ss-glass--liquid flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[24px] text-gray-100'
    : mode === 'embedded'
      ? 'ss-glass ss-glass--liquid flex h-full min-h-0 w-full flex-col overflow-hidden rounded-l-[24px] text-gray-100'
      : 'ss-glass ss-glass--liquid absolute right-0 top-0 z-20 flex h-full min-h-0 w-full flex-col overflow-hidden rounded-l-[24px] text-gray-100 transition-transform duration-300 ease-in-out sm:w-[400px]';

  return (
    <div className={shellClass}>
      <div className={mode === 'floating' ? 'relative h-44 shrink-0 xl:h-48' : 'relative h-48 shrink-0 xl:h-52'}>
        <img src={getListingHeroUrl(event)} onError={handleListingImageError} alt={event.name} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />
        <button onClick={onClose} className="ss-glass ss-glass--liquid ss-glass--interactive absolute right-4 top-4 rounded-full p-2 text-white" aria-label="Close event details">
          <X className="h-5 w-5" />
        </button>
        <div className="ss-glass ss-glass--liquid absolute left-4 top-4 h-16 w-16 overflow-hidden rounded-[18px]">
          <img src={getListingLogoUrl(event)} onError={handleListingImageError} alt={`${event.name} logo`} className="h-full w-full object-contain" />
        </div>
        <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <Link
              to={getListingCanonicalPath(event, entityIndex)}
              className="block truncate text-2xl font-bold text-white transition hover:text-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
            >
              {event.name}
            </Link>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-sm text-gray-300">
              <MapPin className="h-4 w-4 shrink-0 text-amber-300" />
              <span className="truncate">{compactLocation || 'Location announced by host'}</span>
              {physicalAddress.country ? <CountryFlag country={physicalAddress.country} className="h-3 w-[18px]" /> : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {rating !== null ? (
              <div className="flex items-center gap-1.5 rounded-full border border-yellow-300/20 bg-black/35 px-3 py-1.5 text-sm text-yellow-300 backdrop-blur-md">
                <Star className="h-3.5 w-3.5 fill-current" />
                <span className="font-semibold">{rating.toFixed(1)}</span>
              </div>
            ) : null}
            <span className="rounded-full border border-amber-300/45 bg-amber-400/16 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 backdrop-blur-md">Event</span>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        <div className="flex h-7 min-w-0 flex-nowrap items-center gap-2 overflow-hidden">
          {visibleTags.map((tag) => (
            <span key={tag} title={tag} className="min-w-0 shrink rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-100">
              <span className="block truncate whitespace-nowrap">{tag}</span>
            </span>
          ))}
          {remainingTagCount > 0 ? <span className="shrink-0 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-gray-300">+{remainingTagCount}</span> : null}
        </div>

        <section className="ss-glass ss-glass--ambient grid shrink-0 gap-3 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 shrink-0 text-amber-300" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{formatEventTimeRange(event.time)}</div>
              <div className="text-xs text-gray-500">Scheduled event</div>
            </div>
          </div>
          <div className="h-px bg-white/[0.08]" />
          <div className="flex items-center gap-3">
            <UsersRound className="h-5 w-5 shrink-0 text-amber-300" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{audienceLabel}</div>
              <div className="text-xs text-gray-500">Attendance at a glance</div>
            </div>
          </div>
          <div className="h-px bg-white/[0.08]" />
          <div className="flex items-center gap-3">
            <Clock3 className="h-5 w-5 shrink-0 text-amber-300" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">Hosted by {event.hostName}</div>
              <div className="text-xs text-gray-500">Organizer</div>
            </div>
          </div>
        </section>

        <section className="ss-glass ss-glass--ambient min-h-[88px] flex-1 overflow-hidden rounded-2xl p-4">
          <p className="line-clamp-4 text-sm leading-6 text-gray-300">{event.description_full}</p>
        </section>

        {mapCenter ? (
          <div className="ss-glass ss-glass--ambient mt-auto h-32 shrink-0 overflow-hidden rounded-2xl">
            <MiniMapHybrid
              center={mapCenter}
              cityLabel={physicalAddress.city || event.name}
              districtLabel={physicalAddress.region || ''}
              isHidden={hideExactPin}
              showAttributionText={false}
            />
          </div>
        ) : null}

        <Link to={getListingCanonicalPath(event, entityIndex)} className="ss-glass ss-glass--liquid ss-glass--interactive z-10 mt-1 flex min-h-14 shrink-0 items-center justify-center gap-3 rounded-2xl border border-amber-300/35 bg-[rgba(36,26,4,0.92)] px-5 text-base font-bold text-white shadow-[0_-8px_24px_rgba(0,0,0,0.28)]">
          View Event Details
          <ArrowRight className="h-5 w-5" />
        </Link>
      </div>
    </div>
  );
};

export default EventSidebar;
