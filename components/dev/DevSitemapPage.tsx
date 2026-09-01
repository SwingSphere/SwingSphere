import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Copy, ExternalLink } from 'lucide-react';
import * as api from '../../lib/api';
import { buildEntityIndex } from '../../lib/entityIndex';
import { getClubCanonicalPath, getEventCanonicalPath, getHostCanonicalPath } from '../../lib/entityUtils';
import { isDevRouteEnabled } from '../../lib/devRoutes';
import type { ClubData, EventData, Listing } from '../../types';
import type { User } from '../../data/mockUsers';

type LinkRow = {
  id: string;
  label: string;
  path: string;
  href: string;
  meta?: string;
  badge?: string;
};

const EMPTY_USERS: User[] = [];

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

const listingCity = (listing: Listing): string => {
  return listing.geopoint?.address?.city || listing.location || 'Unknown city';
};

const hasCoverImage = (value?: string): boolean => {
  return Boolean(value && value.trim().length > 0);
};

const isPrivateEvent = (event: EventData): boolean => {
  const extended = event as EventData & { isPrivate?: boolean; hasPrivateVenue?: boolean };
  return Boolean(event.isAddressPrivate || extended.isPrivate || extended.hasPrivateVenue);
};

const isUpcomingEvent = (event: EventData, nowTs: number): boolean => {
  return toTimestamp(event.time?.start) >= nowTs;
};

const fetchSitemapListings = async (): Promise<Listing[]> => {
  try {
    const response = await fetch('/api/admin/listings', { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) return data as Listing[];
    }
  } catch {
    // Fall back to existing listing API helper.
  }
  return api.getListings();
};

const SitemapRow: React.FC<{
  row: LinkRow;
  copyStatus: string | undefined;
  onCopy: (row: LinkRow) => void;
}> = ({ row, copyStatus, onCopy }) => {
  return (
    <li className="flex flex-col gap-3 border-b border-gray-800 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <a href={row.href} className="text-sm font-semibold text-red-300 hover:text-red-200 hover:underline">
            {row.path}
          </a>
          <p className="mt-1 text-xs text-gray-300">{row.label}</p>
          {row.meta && <p className="mt-1 text-xs text-gray-500">{row.meta}</p>}
          {row.badge && (
            <span className="mt-2 inline-flex rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] text-gray-300">
              {row.badge}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={row.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
            title="Open in new tab"
            aria-label={`Open ${row.path} in new tab`}
          >
            <ExternalLink size={14} />
          </a>
          <button
            type="button"
            onClick={() => onCopy(row)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
            title="Copy URL"
            aria-label={`Copy URL for ${row.path}`}
          >
            <Copy size={14} />
          </button>
        </div>
      </div>
      {copyStatus && <p className="text-[11px] text-gray-400">{copyStatus}</p>}
    </li>
  );
};

const TemplateChecklist: React.FC<{ points: string[] }> = ({ points }) => {
  return (
    <div className="mt-4 rounded-lg border border-gray-800 bg-black/20 p-3">
      <h4 className="text-sm font-semibold text-gray-100">Template QA checklist</h4>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-gray-400">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </div>
  );
};

const DevSitemapPage: React.FC = () => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyStatusByRow, setCopyStatusByRow] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await fetchSitemapListings();
        if (!active) return;
        setListings(data.filter((item): item is Listing => Boolean(item && typeof item === 'object')));
        setError(null);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Failed to load listings.';
        setError(message);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const nowTs = Date.now();
  const publicListings = useMemo(
    () => listings.filter((listing) => listing.status === 'approved'),
    [listings],
  );
  const index = useMemo(() => buildEntityIndex(publicListings, EMPTY_USERS), [publicListings]);

  const events = useMemo(
    () =>
      publicListings
        .filter((listing): listing is EventData => listing.type === 'event')
        .sort((a, b) => toTimestamp(a.time?.start) - toTimestamp(b.time?.start)),
    [publicListings],
  );

  const clubs = useMemo(
    () =>
      publicListings
        .filter((listing): listing is ClubData => listing.type === 'club')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [publicListings],
  );

  const hostProfiles = useMemo(() => {
    return Array.from(index.hostsBySlug.values()).sort((a, b) => {
      if (b.events.length !== a.events.length) return b.events.length - a.events.length;
      return a.name.localeCompare(b.name);
    });
  }, [index]);

  const firstClubPath = clubs[0] ? getClubCanonicalPath(clubs[0], index) : '/clubs';
  const firstHostPath = hostProfiles[0]
    ? getHostCanonicalPath(hostProfiles[0].slug)
    : '/hosts';

  const corePages: LinkRow[] = [
    { id: 'core-home', label: 'Home', path: '/', href: '/' },
    {
      id: 'core-events',
      label: 'Events',
      path: '/events',
      href: '/events',
    },
    {
      id: 'core-events-explore',
      label: 'Events Browse (Legacy)',
      path: '/explore',
      href: '/explore',
      badge: 'Legacy browse alias',
    },
    {
      id: 'core-clubs',
      label: 'Clubs',
      path: '/clubs',
      href: firstClubPath,
      badge: clubs.length ? 'Using first real club template' : 'No club templates yet',
    },
    {
      id: 'core-hosts',
      label: 'Hosts / Promoters',
      path: '/hosts',
      href: firstHostPath,
      badge: hostProfiles.length ? 'Using first real host template' : 'No host templates yet',
    },
    { id: 'core-map', label: 'Map', path: '/map', href: '/map' },
    {
      id: 'dev-hero-camera',
      label: 'Hero Camera Studio',
      path: '/dev/hero-camera',
      href: '/dev/hero-camera',
      badge: 'Dev-only',
    },
    {
      id: 'dev-lighting-audit',
      label: 'Globe Lighting Audit',
      path: '/dev/lighting-audit',
      href: '/dev/lighting-audit',
      badge: 'Dev-only · production globe lighting/effects',
    },
    {
      id: 'dev-pin-marker-studio',
      label: 'Pin & Marker Studio',
      path: '/dev/pin-marker-studio',
      href: '/dev/pin-marker-studio',
      badge: 'Dev-only · marker comparison and zoom scaling',
    },
    {
      id: 'dev-image-library',
      label: 'Image Library',
      path: '/dev/images',
      href: '/dev/images',
      badge: 'Dev-only · browse current entity and profile media',
    },
    {
      id: 'dev-street-view',
      label: 'Street View Tool',
      path: '/dev/street-view',
      href: '/dev/street-view',
      badge: 'Dev-only · fixed-location 3D venue viewer',
    },
    {
      id: 'dev-badges',
      label: 'Badge & Achievement Lab',
      path: '/dev/badges',
      href: '/dev/badges',
      badge: 'Dev-only',
    },
    {
      id: 'dev-border-surgery',
      label: 'Border Surgery',
      path: '/dev/border-surgery',
      href: '/dev/border-surgery',
      badge: 'Dev-only · globe border editor',
    },
    {
      id: 'dev-building-inspector',
      label: 'Building Inspector',
      path: '/dev/building-inspector',
      href: '/dev/building-inspector',
      badge: 'Dev-only',
    },
    {
      id: 'dev-building-capture',
      label: 'Building Capture',
      path: '/dev/building-capture',
      href: '/dev/building-capture',
      badge: 'Dev-only',
    },
    {
      id: 'core-search',
      label: 'Search',
      path: '/search',
      href: '/explore',
      badge: 'Alias: /explore',
    },
    {
      id: 'core-submit',
      label: 'Submit',
      path: '/submit',
      href: '/submission',
      badge: 'Alias: /submission',
    },
    { id: 'core-about', label: 'About', path: '/about', href: '/about' },
    { id: 'core-contact', label: 'Contact', path: '/contact', href: '/contact' },
    { id: 'core-privacy', label: 'Privacy', path: '/privacy', href: '/privacy' },
    {
      id: 'core-terms',
      label: 'Terms',
      path: '/terms',
      href: '/tos',
      badge: 'Alias: /tos',
    },
  ];

  const eventTemplateRows: LinkRow[] = events.length
    ? events.slice(0, 10).map((event) => ({
        id: `event-${event.id}`,
        label: event.name,
        path: getEventCanonicalPath(event, index),
        href: getEventCanonicalPath(event, index),
        meta: `${listingCity(event)} | ${toDisplayDate(event.time?.start)}`,
        badge: isPrivateEvent(event) ? 'Private location' : undefined,
      }))
    : [
        {
          id: 'event-dev-mock',
          label: 'Dev Mock Event',
          path: '/events/dev-mock-event',
          href: '/events/dev-mock-event',
          meta: 'Fallback template route when no event records are available',
          badge: 'Fallback',
        },
      ];

  const privateEventRows: LinkRow[] = events
    .filter((event) => isPrivateEvent(event))
    .slice(0, 10)
    .map((event) => ({
      id: `event-private-${event.id}`,
      label: event.name,
      path: getEventCanonicalPath(event, index),
      href: getEventCanonicalPath(event, index),
      meta: `${listingCity(event)} | ${toDisplayDate(event.time?.start)}`,
      badge: 'Private location',
    }));

  const missingCoverEventRows: LinkRow[] = events
    .filter((event) => !hasCoverImage(event.headerImageUrl))
    .slice(0, 10)
    .map((event) => ({
      id: `event-missing-cover-${event.id}`,
      label: event.name,
      path: getEventCanonicalPath(event, index),
      href: getEventCanonicalPath(event, index),
      meta: `${listingCity(event)} | ${toDisplayDate(event.time?.start)}`,
    }));

  const pastEventRows: LinkRow[] = events
    .filter((event) => toTimestamp(event.time?.start) < nowTs)
    .sort((a, b) => toTimestamp(b.time?.start) - toTimestamp(a.time?.start))
    .slice(0, 10)
    .map((event) => ({
      id: `event-past-${event.id}`,
      label: event.name,
      path: getEventCanonicalPath(event, index),
      href: getEventCanonicalPath(event, index),
      meta: `${listingCity(event)} | ${toDisplayDate(event.time?.start)}`,
    }));

  const clubTemplateRows: LinkRow[] = clubs.slice(0, 10).map((club) => ({
    id: `club-${club.id}`,
    label: club.name,
    path: getClubCanonicalPath(club, index),
    href: getClubCanonicalPath(club, index),
    meta: listingCity(club),
  }));

  const clubsNoImageRows: LinkRow[] = clubs
    .filter((club) => {
      const galleryCount = club.galleryImageUrls?.filter(Boolean).length ?? 0;
      return !hasCoverImage(club.headerImageUrl) || galleryCount <= 1;
    })
    .slice(0, 10)
    .map((club) => ({
      id: `club-no-image-${club.id}`,
      label: club.name,
      path: getClubCanonicalPath(club, index),
      href: getClubCanonicalPath(club, index),
      meta: `${listingCity(club)} | sparse images`,
    }));

  const clubsNoUpcomingRows: LinkRow[] = clubs
    .filter((club) => {
      const venueKey = index.clubKeyById.get(club.id);
      if (!venueKey) return true;
      const venueEvents = index.eventsByVenueClubKey.get(venueKey) ?? [];
      return !venueEvents.some((event) => isUpcomingEvent(event, nowTs));
    })
    .slice(0, 10)
    .map((club) => ({
      id: `club-no-upcoming-${club.id}`,
      label: club.name,
      path: getClubCanonicalPath(club, index),
      href: getClubCanonicalPath(club, index),
      meta: listingCity(club),
    }));

  const hostTemplateRows: LinkRow[] = hostProfiles.slice(0, 10).map((host) => {
    const upcomingCount = host.events.filter((event) => isUpcomingEvent(event, nowTs)).length;
    return {
      id: `host-${host.slug}`,
      label: host.name,
      path: getHostCanonicalPath(host.slug),
      href: getHostCanonicalPath(host.slug),
      meta: `${host.events.length} events | ${upcomingCount} upcoming`,
    };
  });

  const hostsNoUpcomingRows: LinkRow[] = hostProfiles
    .filter((host) => !host.events.some((event) => isUpcomingEvent(event, nowTs)))
    .slice(0, 10)
    .map((host) => ({
      id: `host-no-upcoming-${host.slug}`,
      label: host.name,
      path: getHostCanonicalPath(host.slug),
      href: getHostCanonicalPath(host.slug),
      meta: `${host.events.length} events`,
    }));

  const hostsMixedPrivacyRows: LinkRow[] = hostProfiles
    .filter((host) => {
      const hasPrivate = host.events.some((event) => isPrivateEvent(event));
      const hasPublic = host.events.some((event) => !isPrivateEvent(event));
      return hasPrivate && hasPublic;
    })
    .slice(0, 10)
    .map((host) => ({
      id: `host-mixed-privacy-${host.slug}`,
      label: host.name,
      path: getHostCanonicalPath(host.slug),
      href: getHostCanonicalPath(host.slug),
      meta: `${host.events.length} events`,
      badge: 'Mixed public/private events',
    }));

  const renderRows = (rows: LinkRow[], emptyLabel: string) => {
    if (!rows.length) {
      return <p className="text-xs text-gray-500">{emptyLabel}</p>;
    }
    return (
      <ul>
        {rows.map((row) => (
          <SitemapRow
            key={row.id}
            row={row}
            copyStatus={copyStatusByRow[row.id]}
            onCopy={(entry) => {
              const absoluteUrl = entry.href.startsWith('http')
                ? entry.href
                : `${window.location.origin}${entry.href}`;
              if (!navigator?.clipboard?.writeText) {
                setCopyStatusByRow((prev) => ({ ...prev, [entry.id]: 'Clipboard unavailable.' }));
                return;
              }
              void navigator.clipboard
                .writeText(absoluteUrl)
                .then(() => {
                  setCopyStatusByRow((prev) => ({ ...prev, [entry.id]: 'Copied URL.' }));
                  setTimeout(() => {
                    setCopyStatusByRow((prev) => {
                      const next = { ...prev };
                      delete next[entry.id];
                      return next;
                    });
                  }, 1800);
                })
                .catch(() => {
                  setCopyStatusByRow((prev) => ({ ...prev, [entry.id]: 'Copy failed.' }));
                });
            }}
          />
        ))}
      </ul>
    );
  };

  if (!isDevRouteEnabled()) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <header className="mb-6 rounded-xl border border-gray-800 bg-gray-900/70 p-5">
        <h1 className="text-2xl font-semibold text-gray-100">Dev Sitemap</h1>
        <p className="mt-2 text-sm text-gray-400">
          Public routes and dynamic template examples for fast QA checks.
        </p>
        <p className="mt-3 text-xs text-gray-500">
          Loaded {publicListings.length} approved listings ({events.length} events, {clubs.length} clubs, {hostProfiles.length} hosts).
        </p>
      </header>

      {isLoading && (
        <section className="rounded-xl border border-gray-800 bg-gray-900/70 p-5">
          <p className="text-sm text-gray-300">Loading sitemap data...</p>
        </section>
      )}

      {!isLoading && error && (
        <section className="rounded-xl border border-red-900/60 bg-red-950/20 p-5">
          <p className="text-sm text-red-200">Failed to load listings: {error}</p>
        </section>
      )}

      {!isLoading && !error && (
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-800 bg-gray-900/70 p-5">
            <h2 className="text-lg font-semibold text-gray-100">Core Pages</h2>
            <p className="mt-1 text-xs text-gray-500">Requested core paths with best available route targets.</p>
            <div className="mt-4">{renderRows(corePages, 'No core pages configured.')}</div>
          </section>

          <section className="rounded-xl border border-gray-800 bg-gray-900/70 p-5">
            <h2 className="text-lg font-semibold text-gray-100">Event Detail Template (time-bound listing)</h2>
            <p className="mt-1 text-xs text-gray-500">
              Showing {eventTemplateRows.length} of {events.length} approved events.
            </p>
            <div className="mt-4">{renderRows(eventTemplateRows, 'No event templates found.')}</div>

            <h3 className="mt-6 text-sm font-semibold text-gray-200">Private-location events</h3>
            <div className="mt-2">{renderRows(privateEventRows, 'No private-location events found.')}</div>

            <h3 className="mt-6 text-sm font-semibold text-gray-200">Events missing cover image</h3>
            <div className="mt-2">{renderRows(missingCoverEventRows, 'No events missing cover images.')}</div>

            <h3 className="mt-6 text-sm font-semibold text-gray-200">Past events</h3>
            <div className="mt-2">{renderRows(pastEventRows, 'No past events currently available.')}</div>

            <TemplateChecklist
              points={[
                'Confirm hero handles private location messaging correctly.',
                'Verify date/time formatting and timezone readability.',
                'Check graceful fallback when event images are missing.',
                'Validate host and venue related links resolve correctly.',
              ]}
            />
          </section>

          <section className="rounded-xl border border-gray-800 bg-gray-900/70 p-5">
            <h2 className="text-lg font-semibold text-gray-100">Club Detail Template (venue profile)</h2>
            <p className="mt-1 text-xs text-gray-500">
              Showing {clubTemplateRows.length} of {clubs.length} approved clubs.
            </p>
            <div className="mt-4">{renderRows(clubTemplateRows, 'No club templates found.')}</div>

            <h3 className="mt-6 text-sm font-semibold text-gray-200">Clubs with no images or minimal images</h3>
            <div className="mt-2">{renderRows(clubsNoImageRows, 'No clubs with sparse image coverage.')}</div>

            <h3 className="mt-6 text-sm font-semibold text-gray-200">Clubs with no upcoming events</h3>
            <div className="mt-2">{renderRows(clubsNoUpcomingRows, 'All clubs currently show upcoming events.')}</div>

            <TemplateChecklist
              points={[
                'Check hero fallback visuals for sparse or missing images.',
                'Verify next-up module handles empty upcoming states cleanly.',
                'Ensure facility/environment pills render without overflow.',
                'Review location subtitle formatting across regions.',
              ]}
            />
          </section>

          <section className="rounded-xl border border-gray-800 bg-gray-900/70 p-5">
            <h2 className="text-lg font-semibold text-gray-100">Host / Promoter Template Links</h2>
            <p className="mt-1 text-xs text-gray-500">
              Showing {hostTemplateRows.length} of {hostProfiles.length} host profiles.
            </p>
            <div className="mt-4">{renderRows(hostTemplateRows, 'No host templates found.')}</div>

            <h3 className="mt-6 text-sm font-semibold text-gray-200">Hosts with no upcoming events</h3>
            <div className="mt-2">{renderRows(hostsNoUpcomingRows, 'All hosts currently have upcoming events.')}</div>

            <h3 className="mt-6 text-sm font-semibold text-gray-200">Hosts with mixed public/private events</h3>
            <div className="mt-2">{renderRows(hostsMixedPrivacyRows, 'No hosts with mixed privacy events found.')}</div>

            <TemplateChecklist
              points={[
                'Confirm next-up and recent-past sections sort correctly.',
                'Validate host cadence/theme summaries stay coherent.',
                'Verify mixed privacy events still communicate location safety.',
                'Check venue links from host pages resolve correctly.',
              ]}
            />
          </section>
        </div>
      )}
    </main>
  );
};

export default DevSitemapPage;
