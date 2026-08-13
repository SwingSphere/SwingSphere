import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { isDevRouteEnabled } from '../../lib/devRoutes';

type LinkItem = {
  label: string;
  path: string;
  note?: string;
};

const Section: React.FC<{ title: string; items: LinkItem[] }> = ({ title, items }) => (
  <section className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
    <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item.path} className="rounded-lg border border-gray-800 bg-black/20 px-3 py-2">
          <Link to={item.path} className="text-sm font-semibold text-red-300 hover:text-red-200 hover:underline">
            {item.path}
          </Link>
          <p className="mt-1 text-xs text-gray-400">{item.label}</p>
          {item.note ? <p className="mt-1 text-[11px] text-gray-500">{item.note}</p> : null}
        </li>
      ))}
    </ul>
  </section>
);

const DevTemplatesPage: React.FC = () => {
  if (!isDevRouteEnabled()) {
    return <Navigate to="/" replace />;
  }

  const eventLinks: LinkItem[] = [
    { path: '/events/dummy-event-public', label: 'Event template (public location)' },
    { path: '/events/dummy-event-private', label: 'Event template (private location)' },
    { path: '/events/dummy-event-long-title', label: 'Edge case: long title' },
    { path: '/events/dummy-event-no-images', label: 'Edge case: no images' },
    { path: '/events/dummy-event-many-tags', label: 'Edge case: many tags' },
    { path: '/events/dummy-event-missing-city', label: 'Edge case: missing city/state' },
    { path: '/events/dummy-event-no-venue', label: 'Edge case: no linked venue' },
    { path: '/events/dummy-event-has-venue', label: 'Edge case: venue-linked mock event' },
  ];

  const clubLinks: LinkItem[] = [
    { path: '/dev/club-template', label: 'Blank/stable club template demo' },
  ];

  const hostLinks: LinkItem[] = [
    { path: '/hosts/community-host', label: 'Host template (existing profile)' },
    { path: '/dev/sitemap', label: 'Fallback host links via sitemap', note: 'Use if seed host slug differs in local data.' },
  ];

  const devLinks: LinkItem[] = [
    { path: '/dev/hero-camera', label: 'Destination-relative production hero camera authoring studio' },
    { path: '/dev/badges', label: 'Badge and achievement design lab with micro-scale readability tests' },
    { path: '/dev/building-inspector', label: 'Vector-tile building resolver and forensic dump' },
    { path: '/dev/building-capture', label: 'Click-to-capture building geometry canvas' },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <header className="mb-6 rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
        <h1 className="text-2xl font-semibold text-gray-100">Template QA Hub</h1>
        <p className="mt-2 text-sm text-gray-400">
          Fast route access for event, club, and host template QA including common edge cases.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <Section title="Event Templates" items={eventLinks} />
        <Section title="Club Templates" items={clubLinks} />
        <Section title="Host Templates" items={hostLinks} />
        <Section title="Dev Tools" items={devLinks} />
      </div>
    </main>
  );
};

export default DevTemplatesPage;
