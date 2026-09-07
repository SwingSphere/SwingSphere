import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Building2,
  CalendarDays,
  Copy,
  ExternalLink,
  RefreshCw,
  Search,
  Users,
  Wrench,
} from 'lucide-react';
import * as api from '../../lib/api';
import { DEV_ROUTE_CATALOG, filterCatalogEntries, summarizeListingMedia } from '../../lib/devSitemap';
import { buildEntityIndex } from '../../lib/entityIndex';
import {
  getClubCanonicalPath,
  getEventCanonicalPath,
  getHostCanonicalPath,
  getVenueCanonicalPath,
} from '../../lib/entityUtils';
import { isDevRouteEnabled } from '../../lib/devRoutes';
import type {
  ClubData,
  CruiseSeriesData,
  EventData,
  Listing,
  ResortData,
  VenueData,
} from '../../types';
import type { User } from '../../data/mockUsers';

type LinkRow = {
  id: string;
  label: string;
  path: string;
  href: string;
  meta?: string;
  badge?: string;
  description?: string;
};

const EMPTY_USERS: User[] = [];
const AUTO_REFRESH_MS = 30_000;

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

const listingCity = (listing: Listing): string =>
  listing.geopoint?.address?.city || listing.location || 'Unknown city';

const isPrivateEvent = (event: EventData): boolean => {
  const extended = event as EventData & { isPrivate?: boolean; hasPrivateVenue?: boolean };
  return Boolean(event.isAddressPrivate || extended.isPrivate || extended.hasPrivateVenue);
};

const isUpcomingEvent = (event: EventData, nowTs: number): boolean =>
  toTimestamp(event.time?.start) >= nowTs;

const rowMatches = (rows: LinkRow[], query: string) =>
  filterCatalogEntries(rows, query);

const SitemapRow: React.FC<{
  row: LinkRow;
  copyStatus: string | undefined;
  onCopy: (row: LinkRow) => void;
}> = ({ row, copyStatus, onCopy }) => (
  <li className="border-b border-white/[0.07] py-3 last:border-b-0">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <a
          href={row.href}
          className="break-all text-sm font-semibold text-red-300 transition hover:text-red-200 hover:underline"
        >
          {row.path}
        </a>
        <p className="mt-1 text-xs font-medium text-gray-200">{row.label}</p>
        {row.description ? <p className="mt-1 text-xs leading-5 text-gray-500">{row.description}</p> : null}
        {row.meta ? <p className="mt-1 text-xs leading-5 text-gray-500">{row.meta}</p> : null}
        {row.badge ? (
          <span className="mt-2 inline-flex rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-300">
            {row.badge}
          </span>
        ) : null}
        {copyStatus ? <p className="mt-2 text-[11px] text-emerald-300">{copyStatus}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <a
          href={row.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-gray-400 transition hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70"
          title="Open in new tab"
          aria-label={`Open ${row.path} in new tab`}
        >
          <ExternalLink size={14} />
        </a>
        <button
          type="button"
          onClick={() => onCopy(row)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-gray-400 transition hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70"
          title="Copy URL"
          aria-label={`Copy URL for ${row.path}`}
        >
          <Copy size={14} />
        </button>
      </div>
    </div>
  </li>
);

const AuditGroup: React.FC<{
  title: string;
  description: string;
  rows: LinkRow[];
  emptyLabel: string;
  query: string;
  copyStatusByRow: Record<string, string>;
  onCopy: (row: LinkRow) => void;
  defaultOpen?: boolean;
  previewLimit?: number;
}> = ({
  title,
  description,
  rows,
  emptyLabel,
  query,
  copyStatusByRow,
  onCopy,
  defaultOpen = false,
  previewLimit = 10,
}) => {
  const [showAll, setShowAll] = useState(false);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const matchingRows = rowMatches(rows, query);
  const expandedForSearch = Boolean(query.trim());
  const visibleRows = showAll || expandedForSearch ? matchingRows : matchingRows.slice(0, previewLimit);
  const hiddenCount = matchingRows.length - visibleRows.length;

  return (
    <details
      className="group rounded-xl border border-white/[0.08] bg-black/20 open:bg-black/30"
      open={expandedForSearch || isOpen}
      onToggle={(event) => {
        if (!expandedForSearch) setIsOpen(event.currentTarget.open);
      }}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-400/70">
        <span>
          <span className="block text-sm font-semibold text-gray-100">{title}</span>
          <span className="mt-1 block text-xs leading-5 text-gray-500">{description}</span>
        </span>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs font-semibold text-gray-300">
          {matchingRows.length}
        </span>
      </summary>
      <div className="border-t border-white/[0.07] px-4 pb-4">
        {!visibleRows.length ? (
          <p className="py-4 text-xs text-gray-500">
            {query.trim() ? 'No matching entries in this group.' : emptyLabel}
          </p>
        ) : (
          <ul>
            {visibleRows.map((row) => (
              <SitemapRow
                key={row.id}
                row={row}
                copyStatus={copyStatusByRow[row.id]}
                onCopy={onCopy}
              />
            ))}
          </ul>
        )}
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-gray-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
          >
            Show all {matchingRows.length} ({hiddenCount} more)
          </button>
        ) : showAll && matchingRows.length > previewLimit ? (
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-gray-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
          >
            Show fewer
          </button>
        ) : null}
      </div>
    </details>
  );
};

const Metric: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
}> = ({ label, value, icon }) => (
  <div className="rounded-xl border border-white/[0.08] bg-black/25 p-4">
    <div className="flex items-center justify-between text-gray-500">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">{label}</span>
      {icon}
    </div>
    <div className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</div>
  </div>
);

const DevSitemapPage: React.FC = () => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [venues, setVenues] = useState<VenueData[]>([]);
  const [resorts, setResorts] = useState<ResortData[]>([]);
  const [cruiseSeries, setCruiseSeries] = useState<CruiseSeriesData[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [query, setQuery] = useState('');
  const [copyStatusByRow, setCopyStatusByRow] = useState<Record<string, string>>({});
  const requestSerialRef = useRef(0);

  const refreshCatalog = useCallback(async (initial = false) => {
    const requestSerial = ++requestSerialRef.current;
    if (initial) setIsLoading(true);
    else setIsRefreshing(true);

    const [listingResult, venueResult, resortResult, cruiseResult, userResult] = await Promise.allSettled([
      api.getListings(),
      api.getVenues(),
      api.getResorts(),
      api.getCruiseSeries(),
      api.getUsers(),
    ]);

    if (requestSerial !== requestSerialRef.current) return;

    const warnings: string[] = [];
    if (listingResult.status === 'fulfilled') {
      setListings(listingResult.value.filter((item): item is Listing => Boolean(item && typeof item === 'object')));
    } else warnings.push('Listings could not be refreshed.');
    if (venueResult.status === 'fulfilled') setVenues(venueResult.value);
    else warnings.push('Venues could not be refreshed.');
    if (resortResult.status === 'fulfilled') setResorts(resortResult.value);
    else warnings.push('Resorts could not be refreshed.');
    if (cruiseResult.status === 'fulfilled') setCruiseSeries(cruiseResult.value);
    else warnings.push('Cruises could not be refreshed.');
    if (userResult.status === 'fulfilled') setUsers(userResult.value);
    else warnings.push('Public profiles could not be refreshed.');

    setLastUpdatedAt(new Date());
    setError(warnings.length ? warnings.join(' ') : null);
    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void refreshCatalog(true);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshCatalog(false);
    }, AUTO_REFRESH_MS);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshCatalog(false);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      requestSerialRef.current += 1;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshCatalog]);

  const publicListings = useMemo(
    () => listings.filter((listing) => listing.status === 'approved'),
    [listings],
  );
  const index = useMemo(
    () => buildEntityIndex(publicListings, users.length ? users : EMPTY_USERS),
    [publicListings, users],
  );
  const nowTs = Date.now();

  const events = useMemo(
    () => publicListings
      .filter((listing): listing is EventData => listing.type === 'event')
      .sort((a, b) => toTimestamp(a.time?.start) - toTimestamp(b.time?.start)),
    [publicListings],
  );

  const clubs = useMemo(
    () => publicListings
      .filter((listing): listing is ClubData => listing.type === 'club')
      .sort((a, b) => a.name.localeCompare(b.name)),
    [publicListings],
  );

  const hostProfiles = useMemo(
    () => Array.from(index.hostsBySlug.values()).sort((a, b) => {
      if (b.events.length !== a.events.length) return b.events.length - a.events.length;
      return a.name.localeCompare(b.name);
    }),
    [index],
  );

  const copyRow = useCallback((entry: LinkRow) => {
    const absoluteUrl = entry.href.startsWith('http')
      ? entry.href
      : `${window.location.origin}${entry.href}`;
    if (!navigator.clipboard?.writeText) {
      setCopyStatusByRow((current) => ({ ...current, [entry.id]: 'Clipboard unavailable.' }));
      return;
    }
    void navigator.clipboard.writeText(absoluteUrl)
      .then(() => {
        setCopyStatusByRow((current) => ({ ...current, [entry.id]: 'Copied URL.' }));
        window.setTimeout(() => {
          setCopyStatusByRow((current) => {
            const next = { ...current };
            delete next[entry.id];
            return next;
          });
        }, 1800);
      })
      .catch(() => {
        setCopyStatusByRow((current) => ({ ...current, [entry.id]: 'Copy failed.' }));
      });
  }, []);

  const devRouteRows: LinkRow[] = DEV_ROUTE_CATALOG.map((route) => ({
    ...route,
    href: route.path,
    badge: route.category,
  }));

  const publicRouteRows: LinkRow[] = [
    { id: 'core-home', label: 'Home', path: '/', href: '/' },
    { id: 'core-globe', label: 'Globe discovery', path: '/globe', href: '/globe' },
    { id: 'core-map', label: 'Map discovery', path: '/map', href: '/map' },
    { id: 'core-events', label: 'Events index', path: '/events', href: '/events' },
    { id: 'core-travel', label: 'Travel index', path: '/travel', href: '/travel' },
    { id: 'core-mobile', label: 'Mobile experience', path: '/mobile', href: '/mobile' },
    { id: 'core-submission', label: 'Listing submission', path: '/submission', href: '/submission', badge: 'Sign-in required' },
    { id: 'core-account', label: 'Account', path: '/account', href: '/account', badge: 'Sign-in required' },
    { id: 'core-host-dashboard', label: 'Host dashboard', path: '/host-dashboard', href: '/host-dashboard', badge: 'Host role required' },
    { id: 'core-about', label: 'About', path: '/about', href: '/about' },
    { id: 'core-faq', label: 'FAQ', path: '/faq', href: '/faq' },
    { id: 'core-contact', label: 'Contact', path: '/contact', href: '/contact' },
    { id: 'core-privacy', label: 'Privacy', path: '/privacy', href: '/privacy' },
    { id: 'core-terms', label: 'Terms of service', path: '/tos', href: '/tos' },
    { id: 'core-login', label: 'Log in', path: '/login', href: '/login' },
    { id: 'core-signup', label: 'Sign up', path: '/signup', href: '/signup' },
    { id: 'core-forgot-password', label: 'Forgot password', path: '/forgot-password', href: '/forgot-password' },
    { id: 'core-reset-password', label: 'Reset password', path: '/reset-password', href: '/reset-password' },
    { id: 'core-explore-alias', label: 'Legacy discovery alias', path: '/explore', href: '/explore', badge: 'Redirects to /globe' },
  ];

  const adminRouteRows: LinkRow[] = [
    { id: 'admin-home', label: 'Admin panel', path: '/admin', href: '/admin', badge: 'Admin role required' },
    { id: 'admin-building', label: 'Admin building inspector', path: '/admin/building-inspector', href: '/admin/building-inspector', badge: 'Admin role required' },
    { id: 'admin-minimap', label: 'Mini-map hybrid test', path: '/admin/minimap-hybrid-test', href: '/admin/minimap-hybrid-test', badge: 'Admin role required' },
  ];

  const eventRows = events.map((event) => {
    const path = getEventCanonicalPath(event, index);
    return {
      id: `event-${event.id}`,
      label: event.name,
      path,
      href: path,
      meta: `${listingCity(event)} · ${toDisplayDate(event.time?.start)}`,
      badge: isPrivateEvent(event) ? 'Private location' : undefined,
    };
  });

  const privateEventRows = events
    .filter((event) => isPrivateEvent(event))
    .map((event) => {
      const path = getEventCanonicalPath(event, index);
      return {
        id: `event-private-${event.id}`,
        label: event.name,
        path,
        href: path,
        meta: `${listingCity(event)} · ${toDisplayDate(event.time?.start)}`,
        badge: 'Private location',
      };
    });

  const eventsMissingHeroRows = events
    .filter((event) => !summarizeListingMedia(event).hasHero)
    .map((event) => {
      const media = summarizeListingMedia(event);
      const path = getEventCanonicalPath(event, index);
      return {
        id: `event-missing-hero-${event.id}`,
        label: event.name,
        path,
        href: path,
        meta: `${listingCity(event)} · ${media.total} usable image${media.total === 1 ? '' : 's'} · no hero/cover`,
      };
    });

  const pastEventRows = events
    .filter((event) => toTimestamp(event.time?.start) < nowTs)
    .sort((a, b) => toTimestamp(b.time?.start) - toTimestamp(a.time?.start))
    .map((event) => {
      const path = getEventCanonicalPath(event, index);
      return {
        id: `event-past-${event.id}`,
        label: event.name,
        path,
        href: path,
        meta: `${listingCity(event)} · ${toDisplayDate(event.time?.start)}`,
      };
    });

  const clubRows = clubs.map((club) => {
    const path = getClubCanonicalPath(club, index);
    const media = summarizeListingMedia(club);
    return {
      id: `club-${club.id}`,
      label: club.name,
      path,
      href: path,
      meta: `${listingCity(club)} · ${media.total} usable image${media.total === 1 ? '' : 's'}`,
    };
  });

  const clubsWithoutImagesRows = clubs
    .filter((club) => summarizeListingMedia(club).status === 'none')
    .map((club) => {
      const path = getClubCanonicalPath(club, index);
      return {
        id: `club-no-images-${club.id}`,
        label: club.name,
        path,
        href: path,
        meta: `${listingCity(club)} · no usable logo, hero, or gallery media`,
      };
    });

  const clubsWithOneImageRows = clubs
    .filter((club) => summarizeListingMedia(club).status === 'minimal')
    .map((club) => {
      const media = summarizeListingMedia(club);
      const path = getClubCanonicalPath(club, index);
      const role = media.hasHero ? 'hero/cover' : media.hasLogo ? 'logo' : 'gallery';
      return {
        id: `club-one-image-${club.id}`,
        label: club.name,
        path,
        href: path,
        meta: `${listingCity(club)} · one usable ${role} image`,
      };
    });

  const clubsMissingHeroRows = clubs
    .filter((club) => !summarizeListingMedia(club).hasHero)
    .map((club) => {
      const media = summarizeListingMedia(club);
      const path = getClubCanonicalPath(club, index);
      return {
        id: `club-missing-hero-${club.id}`,
        label: club.name,
        path,
        href: path,
        meta: `${listingCity(club)} · ${media.total} total usable image${media.total === 1 ? '' : 's'}`,
      };
    });

  const clubsNoUpcomingRows = clubs
    .filter((club) => {
      const venueKey = index.clubKeyById.get(club.id);
      if (!venueKey) return true;
      const venueEvents = index.eventsByVenueClubKey.get(venueKey) ?? [];
      return !venueEvents.some((event) => isUpcomingEvent(event, nowTs));
    })
    .map((club) => {
      const path = getClubCanonicalPath(club, index);
      return {
        id: `club-no-upcoming-${club.id}`,
        label: club.name,
        path,
        href: path,
        meta: listingCity(club),
      };
    });

  const hostRows = hostProfiles.map((host) => {
    const upcomingCount = host.events.filter((event) => isUpcomingEvent(event, nowTs)).length;
    const path = getHostCanonicalPath(host.slug);
    return {
      id: `host-${host.slug}`,
      label: host.name,
      path,
      href: path,
      meta: `${host.events.length} event${host.events.length === 1 ? '' : 's'} · ${upcomingCount} upcoming`,
    };
  });

  const hostsNoUpcomingRows = hostProfiles
    .filter((host) => !host.events.some((event) => isUpcomingEvent(event, nowTs)))
    .map((host) => {
      const path = getHostCanonicalPath(host.slug);
      return {
        id: `host-no-upcoming-${host.slug}`,
        label: host.name,
        path,
        href: path,
        meta: `${host.events.length} event${host.events.length === 1 ? '' : 's'}`,
      };
    });

  const hostsMixedPrivacyRows = hostProfiles
    .filter((host) => {
      const hasPrivate = host.events.some((event) => isPrivateEvent(event));
      const hasPublic = host.events.some((event) => !isPrivateEvent(event));
      return hasPrivate && hasPublic;
    })
    .map((host) => {
      const path = getHostCanonicalPath(host.slug);
      return {
        id: `host-mixed-privacy-${host.slug}`,
        label: host.name,
        path,
        href: path,
        meta: `${host.events.length} events`,
        badge: 'Mixed public/private events',
      };
    });

  const listingRedirectRows: LinkRow[] = publicListings.map((listing) => {
    const path = `/listing/${listing.id}`;
    return {
      id: `listing-redirect-${listing.id}`,
      label: `${listing.name} legacy redirect`,
      path,
      href: path,
      meta: `Redirects to the canonical ${listing.type} route`,
      badge: 'Redirect',
    };
  });

  const publicProfileRows: LinkRow[] = users
    .filter((user) => user.status === 'Active' && Boolean(user.handle))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((user) => {
      const path = `/users/${user.handle}`;
      return {
        id: `profile-${user.id}`,
        label: user.displayName,
        path,
        href: path,
        meta: user.role,
      };
    });

  const venueRows: LinkRow[] = venues
    .filter((venue) => ['active', 'approved'].includes(venue.status) && !['private', 'admin_only'].includes(venue.visibility))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((venue) => {
      const path = getVenueCanonicalPath(venue);
      return {
        id: `venue-${venue.id}`,
        label: venue.name,
        path,
        href: path,
        meta: [venue.address.city, venue.address.region, venue.address.country].filter(Boolean).join(', '),
      };
    });

  const resortRows: LinkRow[] = resorts
    .filter((resort) => ['active', 'approved'].includes(resort.status))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((resort) => {
      const path = `/resorts/${resort.slug}`;
      return {
        id: `resort-${resort.id}`,
        label: resort.name,
        path,
        href: path,
        meta: [resort.geopoint.address.city, resort.geopoint.address.country].filter(Boolean).join(', '),
      };
    });

  const cruiseRows: LinkRow[] = cruiseSeries
    .filter((series) => ['active', 'approved'].includes(series.status))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((series) => {
      const path = `/cruises/${series.slug}`;
      return {
        id: `cruise-${series.id}`,
        label: series.name,
        path,
        href: path,
        meta: series.audienceLabel,
      };
    });

  const visibleDevRoutes = rowMatches(devRouteRows, query);
  const visiblePublicRoutes = rowMatches(publicRouteRows, query);
  const visibleAdminRoutes = rowMatches(adminRouteRows, query);

  if (!isDevRouteEnabled()) return <Navigate to="/" replace />;

  return (
    <main className="min-h-full bg-[#050608] text-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">
        <header className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.12),transparent_38%),rgba(12,14,18,0.88)] p-5 shadow-2xl md:p-7">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-300/80">Developer directory</div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">SwingSphere Sitemap</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
                Every registered development surface, plus live content routes and targeted QA states. Catalog data refreshes every 30 seconds while this page is visible.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshCatalog(false)}
              disabled={isRefreshing || isLoading}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-xs font-semibold text-gray-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-50"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing ? 'Refreshing' : 'Refresh now'}
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Dev tools" value={DEV_ROUTE_CATALOG.length} icon={<Wrench size={15} />} />
            <Metric label="Approved listings" value={publicListings.length} icon={<Building2 size={15} />} />
            <Metric label="Clubs" value={clubs.length} icon={<Building2 size={15} />} />
            <Metric label="Events" value={events.length} icon={<CalendarDays size={15} />} />
          </div>

          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
            <label className="relative block flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <span className="sr-only">Search sitemap</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search routes, clubs, events, hosts, venues, travel, profiles…"
                className="min-h-11 w-full rounded-xl border border-white/10 bg-black/30 pl-10 pr-4 text-sm text-white outline-none placeholder:text-gray-600 focus:border-red-400/50 focus:ring-2 focus:ring-red-500/15"
              />
            </label>
            <p className="shrink-0 text-[11px] text-gray-500">
              {lastUpdatedAt ? `Updated ${lastUpdatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : 'Waiting for catalog data'}
            </p>
          </div>
          {error ? (
            <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-200">
              Refresh warning: {error}. Existing results remain visible.
            </p>
          ) : null}
        </header>

        {isLoading && !listings.length ? (
          <section className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
            <p className="text-sm text-gray-300">Loading live sitemap data…</p>
          </section>
        ) : (
          <div className="mt-6 space-y-6">
            <section id="dev-tools" className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 md:p-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Development tools</h2>
                  <p className="mt-1 text-xs leading-5 text-gray-500">Complete registered `/dev` route inventory, including the Hybrid Globe.</p>
                </div>
                <span className="text-xs text-gray-500">{visibleDevRoutes.length} of {DEV_ROUTE_CATALOG.length}</span>
              </div>
              {visibleDevRoutes.length ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {visibleDevRoutes.map((row) => (
                    <div key={row.id} className="rounded-xl border border-white/[0.08] bg-black/25 p-4 transition hover:border-white/[0.16] hover:bg-black/35">
                      <SitemapRow row={row} copyStatus={copyStatusByRow[row.id]} onCopy={copyRow} />
                    </div>
                  ))}
                </div>
              ) : <p className="mt-4 text-sm text-gray-500">No development routes match this search.</p>}
            </section>

            <section id="app-routes" className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 md:p-6">
              <h2 className="text-lg font-semibold text-white">Static registered app routes</h2>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                These exact paths match the router. Dynamic routes are populated from live catalog data below. Nonexistent convenience paths such as `/clubs`, `/hosts`, `/search`, `/submit`, and `/terms` are no longer presented as real destinations.
              </p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-white/[0.08] bg-black/20 px-4">
                  <div className="border-b border-white/[0.07] py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Public and account routes · {visiblePublicRoutes.length}</div>
                  <ul>{visiblePublicRoutes.map((row) => <SitemapRow key={row.id} row={row} copyStatus={copyStatusByRow[row.id]} onCopy={copyRow} />)}</ul>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-black/20 px-4">
                  <div className="border-b border-white/[0.07] py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Admin routes · {visibleAdminRoutes.length}</div>
                  <ul>{visibleAdminRoutes.map((row) => <SitemapRow key={row.id} row={row} copyStatus={copyStatusByRow[row.id]} onCopy={copyRow} />)}</ul>
                </div>
              </div>
            </section>

            <section id="dynamic-routes" className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 md:p-6">
              <div className="flex items-center gap-2">
                <ExternalLink size={17} className="text-red-300" />
                <h2 className="text-lg font-semibold text-white">Dynamic content routes</h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Live routable pages beyond clubs, events, and hosts. Each group shows its full count and expands past the ten-row preview.
              </p>
              <div className="mt-4 grid gap-3">
                <AuditGroup title="Public profile pages" description="Registered `/users/:handle` pages for active users with a public handle." rows={publicProfileRows} emptyLabel="No active public profiles with handles were returned." query={query} copyStatusByRow={copyStatusByRow} onCopy={copyRow} />
                <AuditGroup title="Venue detail pages" description="Registered `/venues/:slug` pages limited to active or approved public venues." rows={venueRows} emptyLabel="No public venue pages were returned." query={query} copyStatusByRow={copyStatusByRow} onCopy={copyRow} />
                <AuditGroup title="Resort detail pages" description="Registered `/resorts/:slug` pages for active or approved resorts." rows={resortRows} emptyLabel="No resort pages were returned." query={query} copyStatusByRow={copyStatusByRow} onCopy={copyRow} />
                <AuditGroup title="Cruise detail pages" description="Registered `/cruises/:slug` pages for active or approved cruise series." rows={cruiseRows} emptyLabel="No cruise pages were returned." query={query} copyStatusByRow={copyStatusByRow} onCopy={copyRow} />
                <AuditGroup title="Legacy listing redirects" description="Registered `/listing/:id` routes that redirect approved listings to their canonical detail page." rows={listingRedirectRows} emptyLabel="No approved listing redirects were returned." query={query} copyStatusByRow={copyStatusByRow} onCopy={copyRow} />
              </div>
            </section>

            <section id="event-audits" className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 md:p-6">
              <div className="flex items-center gap-2">
                <CalendarDays size={17} className="text-red-300" />
                <h2 className="text-lg font-semibold text-white">Event QA states</h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-gray-500">Live approved-event groupings. Counts show the full matching set; long groups can be expanded without silently dropping entries.</p>
              <div className="mt-4 grid gap-3">
                <AuditGroup title="Event detail pages" description="All approved event routes." rows={eventRows} emptyLabel="No event pages found." query={query} copyStatusByRow={copyStatusByRow} onCopy={copyRow} defaultOpen />
                <AuditGroup title="Private-location events" description="Events whose location handling needs privacy-state QA." rows={privateEventRows} emptyLabel="No private-location events found." query={query} copyStatusByRow={copyStatusByRow} onCopy={copyRow} />
                <AuditGroup title="Events missing a primary hero/cover" description="Checks both canonical media assets and legacy header fields." rows={eventsMissingHeroRows} emptyLabel="Every event has a primary hero or cover." query={query} copyStatusByRow={copyStatusByRow} onCopy={copyRow} />
                <AuditGroup title="Past events" description="Most recently elapsed events first." rows={pastEventRows} emptyLabel="No past events currently available." query={query} copyStatusByRow={copyStatusByRow} onCopy={copyRow} />
              </div>
            </section>

            <section id="club-audits" className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 md:p-6">
              <div className="flex items-center gap-2">
                <Building2 size={17} className="text-red-300" />
                <h2 className="text-lg font-semibold text-white">Club QA states</h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Media states now count distinct usable logos, heroes, galleries, and attached canonical assets instead of treating every club with one gallery photo as “no images.”
              </p>
              <div className="mt-4 grid gap-3">
                <AuditGroup title="Club detail pages" description="All approved club routes." rows={clubRows} emptyLabel="No club pages found." query={query} copyStatusByRow={copyStatusByRow} onCopy={copyRow} defaultOpen />
                <AuditGroup title="Clubs with no usable images" description="No logo, hero/cover, gallery, or usable attached media asset." rows={clubsWithoutImagesRows} emptyLabel="Every club has at least one usable image." query={query} copyStatusByRow={copyStatusByRow} onCopy={copyRow} />
                <AuditGroup title="Clubs with exactly one usable image" description="A precise minimal-media state, separated from clubs with no images." rows={clubsWithOneImageRows} emptyLabel="No clubs have exactly one usable image." query={query} copyStatusByRow={copyStatusByRow} onCopy={copyRow} />
                <AuditGroup title="Clubs missing a primary hero/cover" description="May still have a logo or gallery; useful specifically for hero fallback QA." rows={clubsMissingHeroRows} emptyLabel="Every club has a primary hero or cover." query={query} copyStatusByRow={copyStatusByRow} onCopy={copyRow} />
                <AuditGroup title="Clubs with no upcoming events" description="Derived from the current club-to-event relationship index." rows={clubsNoUpcomingRows} emptyLabel="Every club currently has an upcoming event." query={query} copyStatusByRow={copyStatusByRow} onCopy={copyRow} />
              </div>
            </section>

            <section id="host-audits" className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 md:p-6">
              <div className="flex items-center gap-2">
                <Users size={17} className="text-red-300" />
                <h2 className="text-lg font-semibold text-white">Host and promoter QA states</h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-gray-500">Derived from the same live entity index used to create host pages.</p>
              <div className="mt-4 grid gap-3">
                <AuditGroup title="Host / promoter pages" description="All resolved host profile routes." rows={hostRows} emptyLabel="No host profiles found." query={query} copyStatusByRow={copyStatusByRow} onCopy={copyRow} defaultOpen />
                <AuditGroup title="Hosts with no upcoming events" description="Hosts whose approved events are all elapsed or undated." rows={hostsNoUpcomingRows} emptyLabel="Every host currently has an upcoming event." query={query} copyStatusByRow={copyStatusByRow} onCopy={copyRow} />
                <AuditGroup title="Hosts with mixed public/private events" description="Useful for validating privacy messaging across a single host profile." rows={hostsMixedPrivacyRows} emptyLabel="No hosts have mixed privacy events." query={query} copyStatusByRow={copyStatusByRow} onCopy={copyRow} />
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
};

export default DevSitemapPage;
