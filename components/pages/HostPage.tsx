import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Images,
  LockKeyhole,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { useEntityIndex } from '../../hooks/useEntityIndex';
import { formatEventTimeRange } from '../../lib/formatting';
import { getEventCanonicalPath } from '../../lib/entityUtils';
import { resolveBrandLogo } from '../../lib/entityBrandMedia';
import type { EventData } from '../../types';
import HostPageLayout from '../host/HostPageLayout';
import HostHero from '../host/HostHero';
import EventCardCompact from '../host/EventCardCompact';
import ShowMoreList from '../host/ShowMoreList';
import HostExternalLinks from '../host/HostExternalLinks';
import PromoterFeedbackPlaceholder from '../feedback/PromoterFeedbackPlaceholder';
import HostPageAdminEditor from '../admin-edit/HostPageAdminEditor';
import HostQuickEditPanel, { type HostQuickEditField } from '../admin-edit/HostQuickEditPanel';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';
import { usePublicEditAccess } from '../admin-edit/usePublicEditAccess';
import ListingClaimCard from '../claims/ListingClaimCard';
import { getPublicOrganizationBadges } from '../../lib/badges/badgeService';
import type { BadgeAwardView } from '../../lib/badges/badgeTypes';

const inferThemes = (events: EventData[]): string[] => {
  const counts = new Map<string, number>();
  events.forEach((event) => {
    (event.tags ?? []).forEach((tag) => {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag]) => tag);
};

const inferCadence = (events: EventData[]): string => {
  if (events.length < 2) return 'Cadence still emerging.';
  const sorted = [...events].sort(
    (a, b) => new Date(a.time.start).getTime() - new Date(b.time.start).getTime(),
  );
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = new Date(sorted[i - 1].time.start).getTime();
    const next = new Date(sorted[i].time.start).getTime();
    const days = Math.max(1, Math.round((next - prev) / (24 * 60 * 60 * 1000)));
    intervals.push(days);
  }
  const avg = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
  if (avg <= 14) return 'Frequent cadence (every week or two).';
  if (avg <= 35) return 'Regular cadence (monthly-ish).';
  return 'Occasional cadence (every couple months).';
};

const toTimestamp = (value: string): number => {
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : Number.NaN;
};

const formatCity = (event: EventData): string => {
  const city = event.geopoint?.address?.city ?? '';
  const region = event.geopoint?.address?.region ?? '';
  return [city, region].filter(Boolean).join(', ') || event.location || 'Location TBD';
};

const formatScheduleDate = (value: string): string =>
  new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));

const formatScheduleTime = (start: string, end: string): string => {
  const formatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`;
};

const getUpcomingStatus = (event: EventData): { label: string; className: string } => {
  if (event.entryRequirements?.includes('invite_only')) {
    return {
      label: 'Invites only',
      className: 'border-fuchsia-400/25 bg-fuchsia-500/10 text-fuchsia-200',
    };
  }
  if (event.tags?.some((tag) => tag.toLowerCase() === 'limited capacity')) {
    return {
      label: 'Limited',
      className: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
    };
  }
  if (event.entryRequirements?.includes('screening_approval_required')) {
    return {
      label: 'Approval',
      className: 'border-red-400/25 bg-red-500/10 text-red-200',
    };
  }
  return {
    label: 'On sale',
    className: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
  };
};

const normalizeUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

type HostExternalLinks = {
  website?: string;
  instagram?: string;
  fetlife?: string;
  email?: string;
};

const collectExternalLinks = (events: EventData[]): HostExternalLinks => {
  const links: HostExternalLinks = {};
  for (const event of events) {
    if (!links.email && event.contactEmail) {
      links.email = `mailto:${event.contactEmail}`;
    }

    if (event.website) {
      const normalized = normalizeUrl(event.website);
      try {
        const hostname = new URL(normalized).hostname.toLowerCase();
        if (!links.instagram && hostname.includes('instagram.com')) {
          links.instagram = normalized;
          continue;
        }
        if (!links.fetlife && hostname.includes('fetlife.com')) {
          links.fetlife = normalized;
          continue;
        }
        if (!links.website) {
          links.website = normalized;
        }
      } catch {
        if (!links.website) links.website = normalized;
      }
    }
  }
  return links;
};

const relationshipLabel: Record<string, string> = {
  owner_operator: 'Owner / operator',
  primary_home: 'Primary home',
  resident: 'Resident',
  recurring_guest: 'Recurring guest',
  monthly_guest: 'Monthly guest',
  annual_guest: 'Annual guest',
  one_time_guest: 'One-time guest',
  former_home: 'Former home',
  historical: 'Historical',
  unknown: 'Private / rotating',
};

const HostPage: React.FC = () => {
  const { hostSlug } = useParams<{ hostSlug: string }>();
  const {
    index,
    listings,
    users,
    venues,
    eventSeries,
    organizations,
    organizationVenueRelationships,
    isLoading,
    error,
  } = useEntityIndex();
  const slug = hostSlug ?? '';
  const [hostBadges, setHostBadges] = useState<BadgeAwardView[]>([]);

  const hostProfile = index?.hostsBySlug.get(slug) ?? null;
  const resolvedHostLogo = useMemo(() => {
    const organizationId = hostProfile?.organization?.id;
    if (!organizationId) return undefined;
    return resolveBrandLogo('organization', organizationId, {
      listings,
      venues,
      organizations,
      relationships: organizationVenueRelationships,
      eventSeries,
    }).url;
  }, [eventSeries, hostProfile?.organization?.id, listings, organizationVenueRelationships, organizations, venues]);
  const operatorOrganization = useMemo(() => {
    const organizationId = hostProfile?.organization?.id;
    if (!organizationId || !index) return null;
    const relationships = index.organizationRelationshipsByTargetId.get(organizationId) ?? [];
    const operator = relationships.find((relationship) => relationship.isPrimary && ['operates', 'produces', 'owns', 'parent_brand'].includes(relationship.relationshipType))
      ?? relationships.find((relationship) => ['operates', 'produces', 'owns', 'parent_brand'].includes(relationship.relationshipType));
    return operator ? index.organizationsById.get(operator.sourceOrganizationId) ?? null : null;
  }, [hostProfile?.organization?.id, index]);
  const { registerPublicPage, clearPublicPage } = useAdminEditMode();
  const { canEdit } = usePublicEditAccess({
    postedByUserId: hostProfile?.organization?.postedByUserId,
    organizationIds: [hostProfile?.organization?.id, operatorOrganization?.id],
  });

  useEffect(() => {
    let cancelled = false;
    const organizationId = hostProfile?.organization?.id;
    if (!organizationId) {
      setHostBadges([]);
      return () => {
        cancelled = true;
      };
    }

    getPublicOrganizationBadges(organizationId)
      .then((badges) => {
        if (!cancelled) setHostBadges(badges);
      })
      .catch((badgeError) => {
        console.warn('Failed to load host achievements:', badgeError);
        if (!cancelled) setHostBadges([]);
      });

    return () => {
      cancelled = true;
    };
  }, [hostProfile?.organization?.id]);

  useEffect(() => {
    const organization = hostProfile?.organization;
    if (!organization) return;
    registerPublicPage({
      entityId: organization.id,
      entityType: 'organization',
      label: organization.name,
      canEdit,
      supportsInlineQuickEdit: true,
    });
    return () => clearPublicPage(organization.id);
  }, [canEdit, clearPublicPage, hostProfile?.organization, registerPublicPage]);
  const hostEvents = useMemo(
    () => (hostProfile?.events ?? []).filter((event) => event.status === 'approved'),
    [hostProfile?.events],
  );

  const themePills = useMemo(() => inferThemes(hostEvents), [hostEvents]);
  const cadenceText = useMemo(
    () => hostEvents.length ? inferCadence(hostEvents) : 'Independent lifestyle promoter and community.',
    [hostEvents],
  );
  const hostExternalLinks = useMemo(() => {
    const links = collectExternalLinks(hostEvents);
    const organization = hostProfile?.organization;
    if (organization?.website) links.website = normalizeUrl(organization.website);
    if (organization?.contactEmail) links.email = `mailto:${organization.contactEmail}`;
    if (organization?.instagram) links.instagram = normalizeUrl(organization.instagram);
    if (organization?.fetlife) links.fetlife = normalizeUrl(organization.fetlife);
    return links;
  }, [hostEvents, hostProfile?.organization]);

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return hostEvents
      .filter((event) => toTimestamp(event.time.start) >= now)
      .sort((a, b) => toTimestamp(a.time.start) - toTimestamp(b.time.start))
      .slice(0, 6)
      .map((event) => ({
        id: event.id,
        name: event.name,
        date: formatScheduleDate(event.time.start),
        time: formatScheduleTime(event.time.start, event.time.end),
        region: event.geopoint?.address?.city || event.geopoint?.address?.region || 'Region TBD',
        venue: event.venueId
          ? index?.venuesById.get(event.venueId)?.name || 'Venue TBD'
          : event.isAddressPrivate
            ? 'Location revealed later'
            : event.location.split(',')[0] || 'Venue TBD',
        availability: getUpcomingStatus(event),
        to: index ? getEventCanonicalPath(event, index) : undefined,
      }));
  }, [hostEvents, index]);

  const nextEvent = useMemo(() => {
    const now = Date.now();
    return hostEvents
      .filter((event) => toTimestamp(event.time.start) >= now)
      .sort((a, b) => toTimestamp(a.time.start) - toTimestamp(b.time.start))[0] ?? null;
  }, [hostEvents]);

  const pastEvents = useMemo(() => {
    const now = Date.now();
    return hostEvents
      .filter((event) => toTimestamp(event.time.start) < now)
      .sort((a, b) => toTimestamp(b.time.start) - toTimestamp(a.time.start))
      .slice(0, 6)
      .map((event) => ({
        id: event.id,
        name: event.name,
        city: formatCity(event),
        dateTime: formatEventTimeRange(event.time.start, event.time.end),
        tags: event.tags ?? [],
        to: index ? getEventCanonicalPath(event, index) : undefined,
      }));
  }, [hostEvents, index]);

  const hostRegions = useMemo(() => {
    const configured = hostProfile?.organization?.operatingRegions?.filter(Boolean) ?? [];
    if (configured.length) return configured.slice(0, 6);
    const values = new Set<string>();
    hostEvents.forEach((event) => {
      const city = event.geopoint?.address?.city?.trim();
      const region = event.geopoint?.address?.region?.trim();
      if (city) values.add(city);
      else if (region) values.add(region);
    });
    return Array.from(values).slice(0, 6);
  }, [hostEvents, hostProfile?.organization?.operatingRegions]);

  const venueRelationships = useMemo(() => {
    const organizationId = hostProfile?.organization?.id;
    if (!organizationId) return [];
    return (index?.relationshipsByOrganizationId.get(organizationId) ?? [])
      .map((relationship) => ({
        relationship,
        venue: index?.venuesById.get(relationship.venueId),
      }))
      .filter((item) => Boolean(item.venue));
  }, [hostProfile?.organization?.id, index]);

  const hostSince = useMemo(() => {
    const starts = hostEvents
      .map((event) => toTimestamp(event.time.start))
      .filter((ts) => Number.isFinite(ts)) as number[];
    if (starts.length === 0) return '';
    return new Date(Math.min(...starts)).getFullYear().toString();
  }, [hostEvents]);

  const [pastExpanded, setPastExpanded] = useState(false);
  const [quickEditField, setQuickEditField] = useState<HostQuickEditField | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `host:past-expanded:${slug}`;
    const stored = window.localStorage.getItem(key);
    if (stored === '1') setPastExpanded(true);
    if (stored === '0') setPastExpanded(false);
  }, [slug]);

  const togglePastExpanded = () => {
    setPastExpanded((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        const key = `host:past-expanded:${slug}`;
        window.localStorage.setItem(key, next ? '1' : '0');
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
        Loading host...
      </div>
    );
  }

  if (error || !index || !hostProfile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
        Host not found.
      </div>
    );
  }

  return (
    <>
    {hostProfile.organization ? (
      <HostQuickEditPanel
        key={`${hostProfile.organization.id}-${quickEditField ?? 'closed'}`}
        organization={hostProfile.organization}
        field={quickEditField}
        onClose={() => setQuickEditField(null)}
      />
    ) : null}
    <HostPageAdminEditor
      organization={hostProfile.organization ?? null}
      listings={listings}
      venues={venues}
      relationships={organizationVenueRelationships}
      users={users}
      canEdit={canEdit}
    />
    <HostPageLayout
      hero={
        <HostHero
          hostSlug={hostProfile.slug}
          organizationId={hostProfile.organization?.id}
          hostName={hostProfile.name}
          cadenceText={cadenceText}
          themePills={themePills}
          logoImageUrl={resolvedHostLogo}
          headerImageUrl={hostProfile.organization?.headerImageUrl}
          description={hostProfile.organization?.descriptionShort}
          operatorName={operatorOrganization?.name}
          displayLabel={hostProfile.organization?.displayTypes?.includes('event_brand') ? 'Event Brand' : hostProfile.organization?.displayTypes?.includes('promoter') ? 'Promoter' : hostProfile.organization?.displayTypes?.includes('producer') ? 'Producer' : hostProfile.organization?.displayTypes?.includes('community') ? 'Community' : 'Host'}
          regions={hostRegions}
          website={hostExternalLinks.website}
          eventsListed={hostEvents.length}
          hostingSince={hostSince}
          badges={hostBadges}
          onQuickEdit={setQuickEditField}
        />
      }
      main={
        <>
          {nextEvent ? (
            <section className="ss-glass ss-glass--liquid ss-glass--crimson overflow-hidden rounded-2xl p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-red-300">Next event</p>
                {nextEvent.isAddressPrivate ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400">
                    <LockKeyhole size={13} /> Location protected
                  </span>
                ) : null}
              </div>
              <div className="grid gap-5 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center">
                <div className="aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-black/30 sm:aspect-square">
                  {nextEvent.headerImageUrl ? (
                    <img src={nextEvent.headerImageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-[radial-gradient(circle_at_30%_30%,rgba(239,68,68,.3),transparent_36%),linear-gradient(145deg,#17191f,#08090c)]" />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{nextEvent.name}</h2>
                  <div className="mt-3 space-y-2 text-sm text-gray-300">
                    <p className="flex items-center gap-2"><CalendarDays size={15} className="text-red-300" />{formatEventTimeRange(nextEvent.time.start, nextEvent.time.end)}</p>
                    <p className="flex items-center gap-2"><MapPin size={15} className="text-red-300" />{nextEvent.isAddressPrivate ? `${formatCity(nextEvent)} · exact location after approval` : nextEvent.location}</p>
                  </div>
                  <p className="mt-4 line-clamp-3 text-sm leading-6 text-gray-300">{nextEvent.description_full}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Link
                      to={index ? getEventCanonicalPath(nextEvent, index) : '#'}
                      className="ss-glass ss-glass--liquid ss-glass--crimson ss-glass--interactive inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
                    >
                      View event details <ChevronRight size={15} />
                    </Link>
                    {nextEvent.entryRequirements?.length ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-200/80">
                        <ShieldCheck size={14} /> Approval required
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section className="ss-glass ss-glass--ambient overflow-hidden rounded-2xl">
            <div className="flex items-end justify-between gap-4 px-5 pb-4 pt-5 sm:px-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-100">Upcoming Events</h2>
                <p className="mt-1 text-xs text-gray-400">Soonest dates first</p>
              </div>
              <span className="text-xs tabular-nums text-gray-500">{upcomingEvents.length} listed</span>
            </div>

            {upcomingEvents.length ? (
              <div className="border-t border-white/10">
                <div className="hidden grid-cols-[72px_minmax(150px,1.25fr)_minmax(90px,.7fr)_minmax(130px,1fr)_92px_18px] gap-3 border-b border-white/10 px-5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 md:grid sm:px-6">
                  <span>Date</span>
                  <span>Event</span>
                  <span>Region</span>
                  <span>Venue</span>
                  <span>Status</span>
                  <span className="sr-only">Open</span>
                </div>
                {upcomingEvents.map((item) => (
                  <Link
                    key={item.id}
                    to={item.to || '#'}
                    className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-white/[0.07] px-5 py-3 transition-colors last:border-b-0 hover:bg-white/[0.035] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-red-300 md:grid-cols-[72px_minmax(150px,1.25fr)_minmax(90px,.7fr)_minmax(130px,1fr)_92px_18px] md:gap-3 md:px-6 md:py-2.5"
                  >
                    <span className="order-2 truncate text-[11px] font-semibold tabular-nums text-gray-400 md:order-none md:text-xs">
                      {item.date}
                      <span className="font-normal text-gray-500 md:hidden"> · {item.time} · {item.region}</span>
                    </span>
                    <span className="order-1 min-w-0 font-semibold text-gray-100 md:order-none">
                      <span className="block truncate text-sm">{item.name}</span>
                      <span className="mt-0.5 hidden text-[11px] font-normal tabular-nums text-gray-500 md:block">{item.time}</span>
                    </span>
                    <span className="order-3 hidden truncate text-xs text-gray-400 md:order-none md:block">{item.region}</span>
                    <span className="order-4 hidden truncate text-xs text-gray-400 md:order-none md:block">{item.venue}</span>
                    <span className={`order-1 row-span-2 inline-flex w-fit items-center rounded-md border px-2 py-1 text-[10px] font-bold md:order-none md:row-span-1 ${item.availability.className}`}>
                      {item.availability.label}
                    </span>
                    <ChevronRight size={14} className="order-5 hidden text-gray-600 transition-transform group-hover:translate-x-0.5 group-hover:text-red-300 md:block" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="border-t border-white/10 px-5 py-6 text-sm text-gray-500 sm:px-6">No upcoming events listed right now.</p>
            )}
          </section>

          <section className="ss-glass ss-glass--ambient rounded-2xl p-5 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-red-300">About the promoter</p>
            <p className="mt-4 text-sm leading-7 text-gray-300">
              {hostProfile.organization?.descriptionFull || hostProfile.organization?.descriptionShort || 'No promoter description has been added yet.'}
            </p>
          </section>

          {hostProfile.organization?.standards?.length ? (
            <details className="ss-glass ss-glass--ambient rounded-2xl p-5 sm:p-6">
              <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.16em] text-red-300">Standards & expectations</summary>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {hostProfile.organization.standards.map((standard) => (
                  <div key={standard} className="ss-glass ss-glass--ambient flex gap-3 rounded-xl p-3">
                    <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-red-300" />
                    <p className="text-xs leading-5 text-gray-300">{standard}</p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          <section className="ss-glass ss-glass--ambient rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.16em] text-red-300">Past Events</h2>
                <p className="mt-1 text-xs text-gray-500">{pastEvents.length} completed listing{pastEvents.length === 1 ? '' : 's'}, newest first</p>
              </div>
              <button
                type="button"
                onClick={togglePastExpanded}
                aria-expanded={pastExpanded}
                className="ss-glass ss-glass--ambient ss-glass--interactive inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-gray-300"
              >
                {pastExpanded ? 'Hide history' : 'Show history'}
                <ChevronDown size={14} className={`transition-transform ${pastExpanded ? 'rotate-180' : 'rotate-0'}`} />
              </button>
            </div>
            {pastExpanded ? (
              <div className="mt-5">
                <ShowMoreList
                  items={pastEvents}
                  initialCount={5}
                  moreLabel="Show more past events"
                  lessLabel="Show fewer past events"
                  emptyState={<p className="text-sm text-gray-500">No past events yet.</p>}
                  renderItem={(item) => (
                    <EventCardCompact key={item.id} title={item.name} dateTime={item.dateTime} city={item.city} tags={item.tags} to={item.to} isPast />
                  )}
                />
              </div>
            ) : null}
          </section>

          {hostProfile.organization?.galleryImageUrls?.length ? (
            <details className="ss-glass ss-glass--ambient rounded-2xl p-5 sm:p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.16em] text-red-300">
                <span className="inline-flex items-center gap-2"><Images size={16} /> Gallery</span>
                <span className="text-[11px] font-medium normal-case tracking-normal text-gray-500">{hostProfile.organization.galleryImageUrls.length} photos</span>
              </summary>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {hostProfile.organization.galleryImageUrls.slice(0, 4).map((imageUrl, imageIndex) => (
                  <img key={imageUrl} src={imageUrl} alt={`${hostProfile.name} gallery ${imageIndex + 1}`} className="aspect-[4/3] w-full rounded-xl border border-white/10 object-cover" />
                ))}
              </div>
            </details>
          ) : null}

          <PromoterFeedbackPlaceholder id={`host-feedback-${slug}`} />
        </>
      }
      rail={
        <>
          {hostRegions.length ? (
            <section className="ss-glass ss-glass--ambient rounded-2xl p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-100"><MapPin size={16} className="text-red-300" />Operating regions</h2>
              <ul className="mt-3 divide-y divide-white/10">
                {hostRegions.map((region, regionIndex) => (
                  <li key={region} className="flex gap-3 py-3 first:pt-1">
                    <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5 text-[11px] font-bold text-red-300">{regionIndex + 1}</span>
                    <div><p className="text-sm font-semibold text-gray-200">{region}</p><p className="mt-0.5 text-[11px] text-gray-500">Bay Area programming</p></div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {venueRelationships.length ? (
            <section className="ss-glass ss-glass--ambient rounded-2xl p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-100"><Building2 size={16} className="text-red-300" />Regular venues</h2>
              <ul className="mt-3 divide-y divide-white/10">
                {venueRelationships.map(({ relationship, venue }) => venue ? (
                  <li key={relationship.id} className="py-3 first:pt-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-200">{venue.name}</p><p className="mt-0.5 text-[11px] text-gray-500">{venue.visibility === 'private' ? 'Exact location protected' : [venue.address.city, venue.address.region].filter(Boolean).join(', ')}</p></div>
                      <span className="ss-glass ss-glass--ambient shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold text-red-200">{relationship.label || relationshipLabel[relationship.relationshipType]}</span>
                    </div>
                  </li>
                ) : null)}
              </ul>
            </section>
          ) : null}

          {hostProfile.organization ? (
            <>
              <ListingClaimCard
                entityType="organization"
                entityId={hostProfile.organization.id}
                entityName={hostProfile.organization.name}
                organizationId={hostProfile.organization.id}
                defaultRole="manager"
              />
              <HostExternalLinks
                organizationId={hostProfile.organization.id}
                website={hostExternalLinks.website}
                fetlife={hostExternalLinks.fetlife}
                instagram={hostExternalLinks.instagram}
                email={hostExternalLinks.email}
              />
            </>
          ) : null}

          <section className="ss-glass ss-glass--ambient rounded-2xl p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-100">
              <ShieldCheck size={16} className="text-red-300" /> Profile information
            </h2>
            <dl className="mt-3 divide-y divide-white/10 text-xs">
              <div className="flex items-center justify-between gap-4 py-2.5 first:pt-1">
                <dt className="text-gray-500">Profile type</dt>
                <dd className="font-semibold text-gray-200">
                  {hostProfile.organization?.displayTypes?.includes('promoter') ? 'Promoter' : 'Host'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-gray-500">Approved events</dt>
                <dd className="font-semibold tabular-nums text-gray-200">{hostEvents.length}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-gray-500">First listed event</dt>
                <dd className="font-semibold text-gray-200">{hostSince || 'Not available'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5 last:pb-1">
                <dt className="text-gray-500">Listing status</dt>
                <dd className="font-semibold capitalize text-gray-200">{hostProfile.organization?.status || 'approved'}</dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-white/10 pt-3 text-[10px] leading-4 text-gray-500">
              These are listing facts, not a safety rating or endorsement by SwingSphere.
            </p>
          </section>
        </>
      }
    />
    </>
  );
};

export default HostPage;
