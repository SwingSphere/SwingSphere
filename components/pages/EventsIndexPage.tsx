import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, MapPin, Plus } from 'lucide-react';
import { useEntityIndex } from '../../hooks/useEntityIndex';
import { getEventCanonicalPath, getListingCanonicalPath } from '../../lib/entityUtils';
import { getEventCardImageUrl, getListingPrimaryHeroUrl } from '../../lib/listingImage';
import { isPlaceholderMediaUrl } from '../../lib/entityBrandMedia';
import { usePublicEditAccess } from '../admin-edit/usePublicEditAccess';
import { DetailContextNav } from '../navigation/DetailContextNav';
import type { ClubData, EventData } from '../../types';

const toTimestamp = (value?: string): number => {
  const ts = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(ts) ? ts : Number.POSITIVE_INFINITY;
};

const toDisplayDate = (value?: string): string => {
  if (!value) return 'Date TBD';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date TBD';
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
};

const EventsIndexPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { listings, index, isLoading, error } = useEntityIndex();
  const clubId = searchParams.get('clubId')?.trim() || '';
  const scopedClub = useMemo(
    () => listings.find((listing): listing is ClubData => listing.type === 'club' && listing.id === clubId) ?? null,
    [clubId, listings],
  );
  const { canEdit: canManageScopedClub } = usePublicEditAccess({
    postedByUserId: scopedClub?.postedByUserId,
    organizationIds: [scopedClub?.ownerOrganizationId],
  });

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    const source = scopedClub && index
      ? (index.eventsByVenueClubKey.get(index.clubKeyById.get(scopedClub.id) ?? '') ?? [])
      : listings.filter((listing): listing is EventData => listing.type === 'event' && listing.status === 'approved');
    return source
      .filter((event) => event.status === 'approved')
      .filter((event) => toTimestamp(event.time?.start) >= now)
      .sort((a, b) => toTimestamp(a.time?.start) - toTimestamp(b.time?.start))
      .slice(0, 12);
  }, [index, listings, scopedClub]);

  const visibleEvents = upcomingEvents;
  const scopedHeroUrl = scopedClub ? getListingPrimaryHeroUrl(scopedClub) : null;

  if (isLoading) {
    return (
      <main className="flex-grow overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <p className="text-sm text-gray-400">Loading event templates...</p>
        </div>
      </main>
    );
  }

  if (error || !index) {
    return (
      <main className="flex-grow overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <p className="text-sm text-red-300">Could not load event templates.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-grow overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 pt-4 pb-10">
        <DetailContextNav
          backTo={scopedClub ? getListingCanonicalPath(scopedClub, index) : '/discover?type=events'}
          backLabel={scopedClub ? `Back to ${scopedClub.name}` : 'Back to Events'}
          breadcrumbs={
            scopedClub
              ? [
                  { label: 'Directory', href: '/discover' },
                  { label: 'Clubs', href: '/discover?type=clubs' },
                  { label: scopedClub.name, href: getListingCanonicalPath(scopedClub, index) },
                  { label: 'Events' },
                ]
              : [
                  { label: 'Directory', href: '/discover' },
                  { label: 'Events' },
                ]
          }
          listingId={scopedClub?.id}
        />
        <header className="relative isolate min-h-[220px] overflow-hidden rounded-2xl border border-white/[0.1] bg-gray-950 shadow-2xl">
          {scopedHeroUrl && !isPlaceholderMediaUrl(scopedHeroUrl) ? (
            <img src={scopedHeroUrl} alt="" aria-hidden="true" className="absolute inset-0 -z-20 h-full w-full object-cover object-center" />
          ) : null}
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#07090d]/95 via-[#07090d]/78 to-[#07090d]/35" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#07090d]/90 via-transparent to-black/20" />
          <div className="flex min-h-[220px] flex-col justify-between p-5 sm:p-7">
            {scopedClub ? (
              <Link to={getListingCanonicalPath(scopedClub, index)} className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-gray-200 transition hover:text-white">
                <ArrowLeft size={14} /> Back to {scopedClub.name}
              </Link>
            ) : <span />}
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-red-300">{visibleEvents.length} upcoming {visibleEvents.length === 1 ? 'event' : 'events'}</p>
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{scopedClub ? `Events at ${scopedClub.name}` : 'Events'}</h1>
                <p className="mt-2 max-w-2xl text-sm text-gray-300">
                  {scopedClub ? `Everything currently scheduled at ${scopedClub.name}.` : 'Browse upcoming published events on SwingSphere.'}
                </p>
              </div>
              {scopedClub && canManageScopedClub ? (
                <Link
                  to={`/submission?type=event${scopedClub.ownerOrganizationId ? `&organizationId=${encodeURIComponent(scopedClub.ownerOrganizationId)}` : ''}&clubId=${encodeURIComponent(scopedClub.id)}`}
                  className="inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/70 px-4 py-2.5 text-sm font-bold text-white backdrop-blur-md transition hover:border-red-300/65 hover:bg-red-500/15"
                >
                  <Plus size={16} /> Add event at this club
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        <section className="mt-6">
          <div className="mb-4 flex items-end justify-between gap-4 px-1">
            <div>
              <h2 className="text-xl font-semibold text-gray-100">Upcoming Events</h2>
              <p className="mt-1 text-xs text-gray-500">Select an event for details, tickets, location, and access information.</p>
            </div>
          </div>
          <ul className="space-y-3">
            {visibleEvents.map((event) => {
              const href = getEventCanonicalPath(event, index);
              const city = event.geopoint?.address?.city || event.location || 'Location TBD';
              const cardImageUrl = getEventCardImageUrl(event);
              const showImage = Boolean(cardImageUrl && !isPlaceholderMediaUrl(cardImageUrl));
              return (
                <li key={event.id}>
                  <Link to={href} className="group relative isolate block min-h-[112px] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0e14] shadow-lg transition duration-200 hover:-translate-y-0.5 hover:border-red-300/35 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
                    {showImage ? <img src={cardImageUrl} alt="" aria-hidden="true" className="absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-50 transition duration-300 group-hover:scale-[1.015] group-hover:opacity-60" /> : null}
                    <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#07090d]/95 via-[#07090d]/82 to-[#07090d]/50" />
                    <div className="flex min-h-[112px] items-center justify-between gap-5 px-5 py-4 sm:px-6">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold text-white sm:text-lg">{event.name}</h3>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-gray-300">
                          <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} className="text-red-300" /> {toDisplayDate(event.time?.start)}</span>
                          <span className="inline-flex items-center gap-1.5"><MapPin size={13} className="text-red-300" /> {city}</span>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-red-300 transition group-hover:translate-x-1">View event →</span>
                    </div>
                  </Link>
                </li>
              );
            })}
            {!visibleEvents.length && <li className="rounded-2xl border border-dashed border-gray-800 bg-gray-950/40 p-10 text-center text-sm text-gray-500">{scopedClub ? `No upcoming events are currently published for ${scopedClub.name}.` : 'No upcoming events are currently published.'}</li>}
          </ul>
        </section>
      </div>
    </main>
  );
};

export default EventsIndexPage;
