import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useEntityIndex } from '../../hooks/useEntityIndex';
import { getEventCanonicalPath } from '../../lib/entityUtils';
import type { EventData } from '../../types';

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
  const { listings, index, isLoading, error } = useEntityIndex();

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return listings
      .filter((listing): listing is EventData => listing.type === 'event' && listing.status === 'approved')
      .filter((event) => toTimestamp(event.time?.start) >= now)
      .sort((a, b) => toTimestamp(a.time?.start) - toTimestamp(b.time?.start))
      .slice(0, 12);
  }, [listings]);

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
          <h1 className="text-2xl font-semibold text-gray-100">Events</h1>
          <p className="mt-2 text-sm text-gray-400">
            Dummy event index for template preview. Open any event below to see the detail template.
          </p>
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
            {!visibleEvents.length && <li className="rounded-lg border border-dashed border-gray-800 p-6 text-center text-sm text-gray-500">No upcoming events are currently published.</li>}
          </ul>
        </section>
      </div>
    </main>
  );
};

export default EventsIndexPage;
