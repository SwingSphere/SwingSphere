import React from 'react';
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  Clock3,
  MapPin,
  UsersRound,
  X,
} from 'lucide-react';
import { formatClockTime, formatEventTimeRange } from '../../../lib/formatting';
import { getListingHeroUrl, getListingLogoUrl, handleListingImageError } from '../../../lib/listingImage';
import type { Listing } from '../../../types';

type TabletNearbyPreviewPanelProps = {
  listing: Listing;
  distanceLabel: string;
  saved: boolean;
  onToggleSaved: () => void;
  onOpenDetails: () => void;
  onClose: () => void;
};

const humanize = (value?: string) => value
  ? value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
  : 'Check current access rules';

const getListingSummary = (listing: Listing) =>
  listing.type === 'club' ? listing.description_short : listing.description_full;

const getListingTiming = (listing: Listing) => {
  if (listing.type === 'event') {
    return formatEventTimeRange(listing.time.start, listing.time.end) || 'Time to be confirmed';
  }

  const openDays = listing.schedule.filter((day) => !day.isClosed && (day.open || day.close));
  if (!openDays.length) return 'Hours not published';
  const day = openDays[0];
  const range = [day.open ? formatClockTime(day.open) : '', day.close ? formatClockTime(day.close) : '']
    .filter(Boolean)
    .join(' – ');
  return `${day.day}${range ? ` · ${range}` : ''}`;
};

const getListingTags = (listing: Listing) => {
  if (listing.type === 'event') return listing.tags.slice(0, 4);
  return listing.generalAmenities.slice(0, 4);
};

const TabletNearbyPreviewPanel: React.FC<TabletNearbyPreviewPanelProps> = ({
  listing,
  distanceLabel,
  saved,
  onToggleSaved,
  onOpenDetails,
  onClose,
}) => {
  const tags = getListingTags(listing);
  const summary = getListingSummary(listing);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-white/[0.09] bg-[rgba(8,10,14,0.88)] shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-[26px] backdrop-saturate-150" aria-label={`${listing.name} nearby preview`}>
      <div className="relative h-[250px] shrink-0 overflow-hidden bg-[#11151b]">
        <img src={getListingHeroUrl(listing)} onError={handleListingImageError} alt="" className="h-full w-full object-cover" />
        <button type="button" onClick={onClose} className="absolute right-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-full border border-white/[0.12] bg-black/60 text-white backdrop-blur-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300" aria-label="Close nearby preview"><X className="h-5 w-5" /></button>
        <div className="absolute inset-0 bg-gradient-to-t from-[#090b10] via-black/10 to-black/30" />
        <div className="absolute bottom-4 left-4 h-[92px] w-[92px] overflow-hidden rounded-[22px] border border-white/[0.15] bg-black/70 p-1 shadow-2xl backdrop-blur-md">
          <img src={getListingLogoUrl(listing)} onError={handleListingImageError} alt={`${listing.name} logo`} className="h-full w-full rounded-[18px] object-contain" />
        </div>
        <div className="absolute bottom-4 right-4 rounded-full border border-white/[0.11] bg-black/55 px-3 py-2 text-[11px] font-semibold text-gray-100 backdrop-blur-xl">
          <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-red-200" />{distanceLabel}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-red-300/80">{listing.type}</div>
        <h2 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.03em] text-white">{listing.name}</h2>
        <div className="mt-2 flex items-start gap-1.5 text-[12px] leading-5 text-gray-400"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-200" /><span>{listing.location}</span></div>

        {tags.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map((tag) => <span key={tag} className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[10px] font-medium text-gray-200">{tag}</span>)}
          </div>
        ) : null}

        <div className="mt-5 overflow-hidden rounded-[22px] border border-white/[0.07] bg-black/25">
          <div className="flex gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-red-500/[0.08] text-red-200"><UsersRound className="h-4 w-4" /></span>
            <span className="min-w-0"><span className="block text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">Who can attend</span><span className="mt-1 block text-[13px] font-semibold leading-5 text-white">{humanize(listing.attendancePolicy)}</span></span>
          </div>
          <div className="mx-4 border-t border-white/[0.06]" />
          <div className="flex gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-red-500/[0.08] text-red-200">{listing.type === 'event' ? <CalendarDays className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}</span>
            <span className="min-w-0"><span className="block text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">{listing.type === 'event' ? 'When' : 'Next opening'}</span><span className="mt-1 block text-[13px] font-semibold leading-5 text-white">{getListingTiming(listing)}</span></span>
          </div>
        </div>

        {summary ? <p className="mt-5 text-[12px] leading-5 text-gray-300">{summary}</p> : null}
      </div>

      <div className="shrink-0 border-t border-white/[0.06] bg-black/15 p-4">
        <div className="grid grid-cols-[112px_1fr] gap-2.5">
          <button type="button" onClick={onToggleSaved} className={`flex min-h-[52px] items-center justify-center gap-2 rounded-[18px] border text-[12px] font-semibold ${saved ? 'border-red-400/30 bg-red-500/10 text-red-100' : 'border-white/[0.09] bg-white/[0.035] text-gray-200'}`} aria-pressed={saved}>
            <Bookmark className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />{saved ? 'Saved' : 'Save'}
          </button>
          <button type="button" onClick={onOpenDetails} className="flex min-h-[52px] items-center justify-center gap-2 rounded-[18px] border border-red-400/30 bg-red-500/14 px-4 text-[12px] font-bold text-white shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
            View {listing.type === 'club' ? 'Club' : 'Event'} Details <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-[9px] leading-4 text-gray-600">Private and member-only location details remain protected until the destination page provides the appropriate access context.</p>
      </div>
    </aside>
  );
};

export default TabletNearbyPreviewPanel;
