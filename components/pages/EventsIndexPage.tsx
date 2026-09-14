import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useEntityIndex } from '../../hooks/useEntityIndex';
import { getEventCanonicalPath, getListingCanonicalPath } from '../../lib/entityUtils';
import { usePublicEditAccess } from '../admin-edit/usePublicEditAccess';
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
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="rounded-xl border border-gray-800 bg-gray-900/70 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-100">{scopedClub ? `Events at ${scopedClub.name}` : 'Events'}</h1>
              <p className="mt-2 text-sm text-gray-400">
                {scopedClub ? `Upcoming events specifically connected to ${scopedClub.name}.` : 'Browse upcoming published events on SwingSphere.'}
              </p>
            </div>
            {scopedClub && canManageScopedClub ? (
              <Link
                to={`/submission?type=event${scopedClub.ownerOrganizationId ? `&organizationId=${encodeURIComponent(scopedClub.ownerOrganizationId)}` : ''}&clubId=${encodeURIComponent(scopedClub.id)}`}
                className="inline-flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/[0.1] px-4 py-2.5 text-sm font-bold text-red-100 transition hover:border-red-300/60 hover:bg-red-500/[0.16]"
              >
                <Plus size={16} /> Add event at this club
              </Link>
            ) : null}
          </div>
          {scopedClub ? (
            <Link to={getListingCanonicalPath(scopedClub, index)} className="mt-4 inline-flex text-xs font-semibold text-red-300 hover:text-red-200">
              ← Back to {scopedClub.name}
            </Link>
          ) : null}
        </header>

        <section className="mt-6 rounded-xl border border-gray-800 bg-gray-900/70 p-5">
          <h2 className="text-lg font-semibold text-gray-100">
            Upcoming Events
          </h2>
          <ul className="mt-4 space-y-3">
            {visibleEvents.map((event) => {
              const href = getEventCanonicalPath(event, index);
              const city = event.geopoint?.address?.city || event.location || 'Unknown city';
              return (
                <li key={event.id} className="rounded-lg border border-gray-800 bg-black/20 p-3">
                  <Link className="text-sm font-semibold text-red-300 hover:text-red-200 hover:underline" to={href}>
                    {event.name}
                  </Link>
                  <p className="mt-1 text-xs text-gray-400">
                    {city} | {toDisplayDate(event.time?.start)}
                  </p>
                </li>
              );
            })}
            {!visibleEvents.length && <li className="rounded-lg border border-dashed border-gray-800 p-6 text-center text-sm text-gray-500">{scopedClub ? `No upcoming events are currently published for ${scopedClub.name}.` : 'No upcoming events are currently published.'}</li>}
          </ul>
        </section>
      </div>
    </main>
  );
};

export default EventsIndexPage;
