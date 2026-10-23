import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Images,
  LockKeyhole,
  MapPin,
  Repeat,
  ShieldCheck,
  Ship,
} from 'lucide-react';
import { invalidateEntityIndexCache, useEntityIndex } from '../../hooks/useEntityIndex';
import { formatEventTimeRange } from '../../lib/formatting';
import { getClubCanonicalPath, getEventCanonicalPath, getHostCanonicalPath } from '../../lib/entityUtils';
import { isPastEvent } from '../../lib/eventLifecycle';
import { resolveBrandHeader, resolveBrandLogo } from '../../lib/entityBrandMedia';
import {
  getListingFlyerUrl,
  getListingHeroPageUrl,
  getListingPrimaryLogoUrl,
  handleListingImageError,
  serializeFallbackCandidates,
} from '../../lib/listingImage';
import { extractHeroCropFromUrl, resolveEntityHeroCrop } from '../../lib/media/heroCrop';
import type { ClubData, CruiseSailingData, CruiseSeriesData, EventData } from '../../types';
import HostPageLayout from '../host/HostPageLayout';
import { DetailContextNav } from '../navigation/DetailContextNav';
import HostHero from '../host/HostHero';
import EventCardCompact from '../host/EventCardCompact';
import ShowMoreList from '../host/ShowMoreList';
import HostExternalLinks from '../host/HostExternalLinks';
import PromoterFeedbackPlaceholder from '../feedback/PromoterFeedbackPlaceholder';
import type { HostQuickEditField } from '../admin-edit/HostQuickEditPanel';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';
import { usePublicEditAccess } from '../admin-edit/usePublicEditAccess';
import ListingClaimCard from '../claims/ListingClaimCard';
import { getPublicOrganizationBadges } from '../../lib/badges/badgeService';
import * as api from '../../lib/api';
import type { BadgeAwardView } from '../../lib/badges/badgeTypes';
import Seo from '../Seo';

const HostPageAdminEditor = React.lazy(() => import('../admin-edit/HostPageAdminEditor'));
const HostQuickEditPanel = React.lazy(() => import('../admin-edit/HostQuickEditPanel'));

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

const formatScheduleDate = (value: string): { dateLabel: string; weekdayLabel: string } => {
  const dateObj = new Date(value);
  const nowYear = new Date().getFullYear();
  const isDifferentYear = dateObj.getFullYear() !== nowYear;
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    ...(isDifferentYear ? { year: 'numeric' } : {}),
  }).format(dateObj);
  const weekdayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(dateObj);
  return { dateLabel, weekdayLabel };
};

const formatScheduleTime = (start: string, end: string): string => {
  const formatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`;
};

const getUpcomingStatus = (start: string, end?: string): { label: string; className: string; dotClassName: string } => {
  const eventDate = new Date(start);
  const now = new Date();
  const nowMs = now.getTime();
  const startMs = eventDate.getTime();
  const endMs = end ? new Date(end).getTime() : Number.NaN;

  if (Number.isFinite(startMs) && startMs <= nowMs && (!Number.isFinite(endMs) || endMs >= nowMs)) {
    return {
      label: 'Live now',
      className: 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200',
      dotClassName: 'bg-emerald-400',
    };
  }

  const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const daysAway = Math.round((eventDay - today) / (24 * 60 * 60 * 1000));

  if (daysAway <= 0) {
    return {
      label: 'Today',
      className: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
      dotClassName: 'bg-emerald-400',
    };
  }
  if (daysAway <= 7) {
    return {
      label: 'This week',
      className: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
      dotClassName: 'bg-amber-400',
    };
  }
  return {
    label: 'Scheduled',
    className: 'border-red-400/25 bg-red-500/10 text-red-200',
    dotClassName: 'bg-red-400',
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
  const [cruiseSeries, setCruiseSeries] = useState<CruiseSeriesData[]>([]);
  const [cruiseSailings, setCruiseSailings] = useState<CruiseSailingData[]>([]);

  const hostProfile = index?.hostsBySlug.get(slug) ?? null;
  const ownedClub = useMemo(() => {
    const organizationId = hostProfile?.organization?.id;
    if (!organizationId) return null;
    const matches = listings.filter(
      (listing): listing is ClubData =>
        listing.type === 'club' &&
        listing.status === 'approved' &&
        listing.ownerOrganizationId === organizationId,
    );
    return matches.length === 1 ? matches[0] : null;
  }, [hostProfile?.organization?.id, listings]);
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
  const resolvedHostHeader = useMemo(() => {
    const organizationId = hostProfile?.organization?.id;
    if (!organizationId) return undefined;
    return resolveBrandHeader('organization', organizationId, {
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
  const canEditHostPage = Boolean(hostProfile?.organization) && canEdit;

  useEffect(() => {
    let active = true;
    Promise.all([api.getCruiseSeries(), api.getCruiseSailings()])
      .then(([seriesRows, sailingRows]) => {
        if (!active) return;
        setCruiseSeries(seriesRows);
        setCruiseSailings(sailingRows);
      })
      .catch(() => {
        if (!active) return;
        setCruiseSeries([]);
        setCruiseSailings([]);
      });
    return () => { active = false; };
  }, []);

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
      canEdit: canEditHostPage,
      supportsInlineQuickEdit: true,
    });
    return () => clearPublicPage(organization.id);
  }, [canEditHostPage, clearPublicPage, hostProfile?.organization, registerPublicPage]);
  // A host's upcoming event list is derived from current catalog relationships,
  // never from event titles or a fixed roster. Refresh when the host route opens
  // if the cached snapshot is older than 10s so external edits become visible
  // without firing redundant requests on rapid route clicks.
  useEffect(() => {
    invalidateEntityIndexCache({ maxAgeMs: 10_000 });
  }, [slug]);

  const hostEvents = useMemo(() => {
    const organizationId = hostProfile?.organization?.id;
    const canonicalEvents = organizationId
      ? index?.eventsByOrganizationId.get(organizationId)
      : undefined;
    return (canonicalEvents ?? hostProfile?.events ?? []).filter(
      (event) =>
        event.status === 'approved' &&
        !(event as EventData & { archivedAt?: string | null }).archivedAt,
    );
  }, [hostProfile?.organization?.id, hostProfile?.events, index]);

  const hostEventSeries = useMemo(() => {
    const organizationId = hostProfile?.organization?.id;
    if (!organizationId) return [];
    return eventSeries.filter(
      (series) =>
        series.organizerOrganizationId === organizationId &&
        series.status === 'approved',
    );
  }, [eventSeries, hostProfile?.organization?.id]);

  const hostCruiseSeries = useMemo(() => {
    const organizationId = hostProfile?.organization?.id;
    if (!organizationId) return [];
    return cruiseSeries.filter((series) =>
      series.operatorOrganizationId === organizationId
      && (series.status === 'approved' || series.status === 'active'));
  }, [cruiseSeries, hostProfile?.organization?.id]);

  const upcomingCruiseSailings = useMemo(() => {
    const seriesIds = new Set(hostCruiseSeries.map((series) => series.id));
    const now = Date.now();
    return cruiseSailings
      .filter((sailing) => seriesIds.has(sailing.cruiseSeriesId)
        && (sailing.status === 'approved' || sailing.status === 'active')
        && toTimestamp(sailing.endsAt) >= now)
      .sort((a, b) => toTimestamp(a.startsAt) - toTimestamp(b.startsAt));
  }, [cruiseSailings, hostCruiseSeries]);

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
      .filter((event) => !isPastEvent(event, now))
      .sort((a, b) => toTimestamp(a.time.start) - toTimestamp(b.time.start))
      .map((event) => {
        const { dateLabel, weekdayLabel } = formatScheduleDate(event.time.start);
        const resolvedVenueName = event.venueId ? index?.venuesById.get(event.venueId)?.name : undefined;
        const fallbackVenueName = event.isAddressPrivate
          ? 'Location after approval'
          : event.location?.split(',')[0]?.trim() || 'Venue TBD';
        return {
          id: event.id,
          name: event.name,
          date: dateLabel,
          weekday: weekdayLabel,
          time: formatScheduleTime(event.time.start, event.time.end),
          region: event.geopoint?.address?.city || event.geopoint?.address?.region || 'Region TBD',
          venue: resolvedVenueName || fallbackVenueName,
          isAddressPrivate: Boolean(event.isAddressPrivate),
          availability: getUpcomingStatus(event.time.start, event.time.end),
          artwork: getListingHeroPageUrl(event, index) || getListingFlyerUrl(event, index),
          to: index ? getEventCanonicalPath(event, index) : undefined,
        };
      });
  }, [hostEvents, index]);

  const nextEvent = useMemo(() => {
    const now = Date.now();
    return hostEvents
      .filter((event) => !isPastEvent(event, now))
      .sort((a, b) => toTimestamp(a.time.start) - toTimestamp(b.time.start))[0] ?? null;
  }, [hostEvents]);

  const pastEvents = useMemo(() => {
    const now = Date.now();
    return hostEvents
      .filter((event) => isPastEvent(event, now))
      .sort((a, b) => toTimestamp(b.time.start) - toTimestamp(a.time.start))
      .map((event) => ({
        id: event.id,
        name: event.name,
        city: formatCity(event),
        dateTime: formatEventTimeRange(event.time.start, event.time.end),
        tags: event.tags ?? [],
        flyerUrl: getListingHeroPageUrl(event, index) || getListingFlyerUrl(event, index),
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

  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [pastExpanded, setPastExpanded] = useState(false);
  const [quickEditField, setQuickEditField] = useState<HostQuickEditField | null>(null);

  useEffect(() => {
    setUpcomingExpanded(false);
    if (typeof window === 'undefined') return;
    const key = `host:past-expanded:${slug}`;
    const stored = window.localStorage.getItem(key);
    if (stored === '1') {
      setPastExpanded(true);
      return;
    }
    if (stored === '0') {
      setPastExpanded(false);
      return;
    }
    setPastExpanded(upcomingEvents.length === 0 && pastEvents.length > 0);
  }, [pastEvents.length, slug, upcomingEvents.length]);

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

  if (!error && index && !hostProfile) {
    const aliasTargetSlug = index.hostSlugAliases.get(slug);
    if (aliasTargetSlug) {
      return <Navigate to={getHostCanonicalPath(aliasTargetSlug)} replace />;
    }
  }

  if (isLoading && !hostProfile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
        Loading host...
      </div>
    );
  }

  if (error || !index || !hostProfile) {
    return (
      <>
        <Seo
          title="Host Not Found | SwingSphere"
          description="The requested lifestyle host or promoter could not be found on SwingSphere."
          canonicalPath={window.location.pathname}
          noIndex
        />
        <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
          Host not found.
        </div>
      </>
    );
  }

  const canonicalPath = getHostCanonicalPath(hostProfile.slug);
  const canonicalUrl = `https://swingsphere.co${canonicalPath}`;
  const hostHeroImage = resolvedHostHeader || (ownedClub ? getListingHeroPageUrl(ownedClub) : undefined);
  const hostHeroCrop = resolveEntityHeroCrop(
    hostProfile.organization ?? ownedClub,
    resolvedHostHeader,
    hostProfile.organization?.heroCrop ??
      extractHeroCropFromUrl(resolvedHostHeader).crop ??
      ownedClub?.heroCrop,
  );
  const hostLogoImage = resolvedHostLogo || (ownedClub ? getListingPrimaryLogoUrl(ownedClub) : undefined);
  const seoImageUrl = hostHeroImage || hostLogoImage;
  const isLogoOnlyPreview = !hostHeroImage && Boolean(hostLogoImage);
  const displayLabel = hostProfile.organization?.displayTypes?.includes('event_brand')
    ? 'Event Brand'
    : hostProfile.organization?.displayTypes?.includes('promoter')
      ? 'Promoter'
      : hostProfile.organization?.displayTypes?.includes('producer')
        ? 'Producer'
        : hostProfile.organization?.displayTypes?.includes('community')
          ? 'Community'
          : 'Host';

  const fallbackAboutDescription = (() => {
    const regionPhrase = hostRegions.length
      ? `active in ${hostRegions.slice(0, 3).join(', ')}`
      : 'listed on SwingSphere';
    const venueNames = venueRelationships
      .map((item) => item.venue?.name)
      .filter((name): name is string => Boolean(name));
    const venuePhrase = ownedClub
      ? ` They operate ${ownedClub.name}.`
      : venueNames.length
        ? ` Events are hosted at venues including ${venueNames.slice(0, 2).join(' and ')}.`
        : '';
    const countPhrase = upcomingEvents.length > 0
      ? ` Explore ${upcomingEvents.length} upcoming ${upcomingEvents.length === 1 ? 'event' : 'events'} on their schedule.`
      : pastEvents.length > 0
        ? ` Browse ${pastEvents.length} past ${pastEvents.length === 1 ? 'event' : 'events'} in their archive.`
        : hostExternalLinks.website
          ? ' Visit their official website for announcements and upcoming dates.'
          : '';
    return `${hostProfile.name} is a lifestyle ${displayLabel.toLowerCase()} ${regionPhrase}.${venuePhrase}${countPhrase}`;
  })();

  const aboutDescription =
    hostProfile.organization?.descriptionFull?.trim() ||
    hostProfile.organization?.descriptionShort?.trim() ||
    ownedClub?.description_short?.trim() ||
    fallbackAboutDescription;

  const structuredData: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': canonicalUrl,
    name: hostProfile.name,
    description:
      hostProfile.organization?.descriptionShort ||
      hostProfile.organization?.descriptionFull ||
      aboutDescription,
    url: canonicalUrl,
    ...(hostLogoImage ? { logo: hostLogoImage } : {}),
    ...(seoImageUrl ? { image: seoImageUrl } : {}),
    ...(hostExternalLinks.website ? { sameAs: [hostExternalLinks.website] } : {}),
  };

  return (
    <>
    <Seo
      title={`${hostProfile.name} | Lifestyle Host & Promoter | SwingSphere`}
      description={
        hostProfile.organization?.descriptionShort ||
        aboutDescription
      }
      canonicalPath={canonicalPath}
      ogType="profile"
      twitterCard={isLogoOnlyPreview ? 'summary' : 'summary_large_image'}
      imageUrl={seoImageUrl}
      imageWidth={isLogoOnlyPreview ? 400 : 1200}
      imageHeight={isLogoOnlyPreview ? 400 : 630}
      imageAlt={`${hostProfile.name} on SwingSphere`}
      structuredData={structuredData}
    />
    {canEditHostPage && hostProfile.organization && quickEditField ? (
      <React.Suspense fallback={null}>
        <HostQuickEditPanel
          key={`${hostProfile.organization.id}-${quickEditField}`}
          organization={{
            ...hostProfile.organization,
            headerImageUrl: hostProfile.organization.headerImageUrl || hostHeroImage,
            logoImageUrl: hostProfile.organization.logoImageUrl || hostLogoImage,
            heroCrop: hostProfile.organization.heroCrop ?? hostHeroCrop ?? undefined,
          }}
          field={quickEditField}
          onClose={() => setQuickEditField(null)}
        />
      </React.Suspense>
    ) : null}
    {canEditHostPage ? (
      <React.Suspense fallback={null}>
        <HostPageAdminEditor
          organization={
            hostProfile.organization
              ? {
                  ...hostProfile.organization,
                  headerImageUrl: hostProfile.organization.headerImageUrl || hostHeroImage,
                  logoImageUrl: hostProfile.organization.logoImageUrl || hostLogoImage,
                  heroCrop: hostProfile.organization.heroCrop ?? hostHeroCrop ?? undefined,
                }
              : null
          }
          listings={listings}
          venues={venues}
          relationships={organizationVenueRelationships}
          users={users}
          canEdit={canEditHostPage}
        />
      </React.Suspense>
    ) : null}
    <HostPageLayout
      backgroundImageUrl={hostHeroImage}
      contextNav={
        <DetailContextNav
          breadcrumbs={[
            { label: 'Directory', href: '/discover' },
            { label: 'Hosts', href: '/discover?type=hosts' },
            { label: hostProfile.name },
          ]}
          listingId={ownedClub?.id ?? nextEvent?.id}
        />
      }
      hero={
        <HostHero
          hostSlug={hostProfile.slug}
          organizationId={hostProfile.organization?.id}
          hostName={hostProfile.name}
          cadenceText={cadenceText}
          themePills={themePills}
          logoImageUrl={hostLogoImage}
          headerImageUrl={hostHeroImage}
          heroCrop={hostHeroCrop}
          description={hostProfile.organization?.descriptionShort}
          operatorName={operatorOrganization?.name}
          displayLabel={displayLabel}
          regions={hostRegions}
          website={hostExternalLinks.website}
          eventsListed={hostEvents.length}
          upcomingEventsCount={upcomingEvents.length}
          pastEventsCount={pastEvents.length}
          cruisesListed={hostCruiseSeries.length}
          hostingSince={hostSince}
          badges={hostBadges}
          onQuickEdit={canEditHostPage ? setQuickEditField : undefined}
        />
      }
      main={
        <>
          {upcomingCruiseSailings.length ? (
            <section className="ss-glass ss-glass--liquid overflow-hidden rounded-2xl border border-cyan-300/15">
              <div className="flex items-end justify-between gap-4 px-5 pb-4 pt-5 sm:px-6">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Upcoming Travel</p>
                  <h2 className="mt-1 text-lg font-semibold text-gray-100">Cruise Sailings</h2>
                  <p className="mt-1 text-xs text-gray-400">Dated departures operated by {hostProfile.name}</p>
                </div>
                <span className="text-xs tabular-nums text-gray-500">{upcomingCruiseSailings.length} upcoming</span>
              </div>
              <div className="border-t border-white/10">
                {upcomingCruiseSailings.map((sailing) => {
                  const series = hostCruiseSeries.find((candidate) => candidate.id === sailing.cruiseSeriesId);
                  if (!series) return null;
                  const dateRange = `${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(sailing.startsAt))} – ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(sailing.endsAt))}`;
                  return (
                    <Link
                      key={sailing.id}
                      to={`/cruises/${series.slug}`}
                      className="group grid gap-3 border-b border-white/[0.07] px-5 py-4 last:border-b-0 hover:bg-white/[0.035] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-6"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-200">
                        <Ship size={21} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-white">{sailing.name}</div>
                        <div className="mt-1 text-xs text-gray-400">{dateRange} · {sailing.durationNights} nights</div>
                        <div className="mt-1 text-xs text-gray-500">Departs {sailing.departurePort.portName}, {sailing.departurePort.country}</div>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-cyan-100">
                        {sailing.bookingStatus ? sailing.bookingStatus.replaceAll('_', ' ') : 'View cruise'}
                        <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}

          {nextEvent ? (
            <section className="ss-glass ss-glass--liquid ss-glass--crimson overflow-hidden rounded-2xl p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-red-300">Next event</p>
                {nextEvent.isAddressPrivate ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-300">
                    <LockKeyhole size={13} /> Location protected
                  </span>
                ) : null}
              </div>
              <div className="grid gap-5 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center">
                <div className="aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-black/30 sm:aspect-square">
                  <img
                    src={getListingFlyerUrl(nextEvent, index)}
                    alt={`${nextEvent.name} event artwork`}
                    data-entity-id={nextEvent.id}
                    data-media-role="flyer"
                    data-fallback-candidates={serializeFallbackCandidates([
                      nextEvent.headerImageUrl,
                      resolvedHostHeader,
                      resolvedHostLogo,
                    ])}
                    className="h-full w-full object-contain"
                    onError={handleListingImageError}
                  />
                </div>
                <div className="min-w-0">
                  <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{nextEvent.name}</h2>
                  <div className="mt-3 space-y-2 text-sm text-gray-300">
                    <p className="flex items-center gap-2"><CalendarDays size={15} className="shrink-0 text-red-300" /><span>{formatEventTimeRange(nextEvent.time.start, nextEvent.time.end)}</span></p>
                    <p className="flex items-center gap-2"><MapPin size={15} className="shrink-0 text-red-300" /><span>{nextEvent.isAddressPrivate ? `${formatCity(nextEvent)} · exact location after approval` : nextEvent.location}</span></p>
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

          <section id="host-upcoming-events" className="ss-glass ss-glass--ambient scroll-mt-24 overflow-hidden rounded-2xl">
            <div className="flex items-end justify-between gap-4 px-5 pb-4 pt-5 sm:px-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-100">Upcoming Events</h2>
                <p className="mt-1 text-xs text-gray-400">Soonest dates first</p>
              </div>
              <span className="text-xs tabular-nums text-gray-400">
                {upcomingEvents.length} upcoming{pastEvents.length > 0 ? ` · ${pastEvents.length} past` : ''}
              </span>
            </div>

            {upcomingEvents.length ? (
              <div className="border-t border-white/10">
                <div className="hidden grid-cols-[78px_minmax(180px,1.4fr)_minmax(90px,.7fr)_minmax(130px,1fr)_96px_18px] gap-3 border-b border-white/10 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 md:grid sm:px-6">
                  <span>Date</span>
                  <span>Event</span>
                  <span>Region</span>
                  <span>Venue</span>
                  <span>Status</span>
                  <span className="sr-only">Open</span>
                </div>
                {(upcomingExpanded ? upcomingEvents : upcomingEvents.slice(0, 6)).map((item) => (
                  <Link
                    key={item.id}
                    to={item.to || '#'}
                    className="group relative isolate grid min-h-[58px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 overflow-hidden border-b border-white/[0.08] px-5 py-3.5 transition-colors last:border-b-0 hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-red-300 md:grid-cols-[78px_minmax(180px,1.4fr)_minmax(90px,.7fr)_minmax(130px,1fr)_96px_18px] md:gap-3 md:px-6 md:py-3"
                  >
                    {item.artwork ? (
                      <>
                        <img
                          src={item.artwork}
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                          className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-[0.30] saturate-125 transition-opacity duration-200 group-hover:opacity-[0.42]"
                        />
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-[#080a10]/94 via-[#080a10]/78 to-[#080a10]/45"
                        />
                      </>
                    ) : null}

                    <div className="order-2 truncate text-[11px] tabular-nums text-gray-300 md:order-none md:text-xs">
                      <span className="font-semibold text-gray-200">{item.date}</span>
                      <span className="hidden text-[11px] font-normal text-gray-400 md:block">{item.weekday}</span>
                      <span className="font-normal text-gray-400 md:hidden">
                        {' '}({item.weekday}) · {item.time} · {item.venue !== 'Venue TBD' ? item.venue : item.region}
                      </span>
                    </div>

                    <div className="order-1 flex min-w-0 items-center gap-3 md:order-none">
                      {item.artwork || hostLogoImage ? (
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-black/60">
                          <img
                            src={item.artwork || hostLogoImage}
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                            onError={(e) => {
                              if (hostLogoImage && e.currentTarget.src !== hostLogoImage) {
                                e.currentTarget.src = hostLogoImage;
                              } else {
                                e.currentTarget.style.display = 'none';
                              }
                            }}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : null}
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white group-hover:text-red-100">{item.name}</span>
                        <span className="mt-0.5 hidden text-[11px] font-normal tabular-nums text-gray-400 md:block">{item.time}</span>
                      </div>
                    </div>

                    <span className="order-3 hidden truncate text-xs text-gray-300 md:order-none md:block">{item.region}</span>
                    <span className="order-4 hidden items-center gap-1.5 truncate text-xs text-gray-300 md:order-none md:flex">
                      {item.isAddressPrivate ? <LockKeyhole size={12} className="shrink-0 text-gray-400" /> : null}
                      <span className="truncate">{item.venue}</span>
                    </span>
                    <span className={`order-1 row-span-2 inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold md:order-none md:row-span-1 ${item.availability.className}`}>
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${item.availability.dotClassName}`} />
                      {item.availability.label}
                    </span>
                    <ChevronRight size={14} className="order-5 hidden text-gray-500 transition-transform group-hover:translate-x-0.5 group-hover:text-red-300 md:block" />
                  </Link>
                ))}
                {(upcomingEvents.length > 6 || pastEvents.length > 0) ? (
                  <div className="flex flex-wrap items-center gap-3 border-t border-white/10 px-5 py-3 sm:px-6">
                    {upcomingEvents.length > 6 ? <button
                      type="button"
                      onClick={() => setUpcomingExpanded((prev) => !prev)}
                      className="ss-glass ss-glass--ambient ss-glass--interactive inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-gray-200 hover:text-white"
                    >
                      {upcomingExpanded
                        ? 'Show fewer upcoming events'
                        : `Show all ${upcomingEvents.length} upcoming events (+${upcomingEvents.length - 6} more)`}
                      <ChevronDown size={14} className={`transition-transform ${upcomingExpanded ? 'rotate-180' : 'rotate-0'}`} />
                    </button> : null}
                    {pastEvents.length > 0 ? (
                      <a href="#host-past-events" onClick={() => setPastExpanded(true)} className="ss-glass ss-glass--ambient ss-glass--interactive inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-gray-200 hover:text-white">
                        View past events ({pastEvents.length}) <ChevronRight size={14} />
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="border-t border-white/10 px-5 py-6 sm:px-6">
                <p className="text-sm text-gray-300">
                  No upcoming events are currently scheduled on SwingSphere for {hostProfile.name}.
                </p>
                {(hostExternalLinks.website || pastEvents.length > 0 || ownedClub) ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    {hostExternalLinks.website ? (
                      <a
                        href={hostExternalLinks.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ss-glass ss-glass--ambient ss-glass--interactive inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-gray-200 hover:text-white"
                      >
                        Check official website <ExternalLink size={13} />
                      </a>
                    ) : null}
                    {ownedClub ? (
                      <Link
                        to={getClubCanonicalPath(ownedClub, index)}
                        className="ss-glass ss-glass--ambient ss-glass--interactive inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-gray-200 hover:text-white"
                      >
                        View {ownedClub.name} club page <ChevronRight size={13} />
                      </Link>
                    ) : null}
                    {pastEvents.length > 0 ? (
                      <a
                        href="#host-past-events"
                        onClick={() => setPastExpanded(true)}
                        className="ss-glass ss-glass--ambient ss-glass--interactive inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-gray-200 hover:text-white"
                      >
                        Browse {pastEvents.length} past {pastEvents.length === 1 ? 'event' : 'events'} <ChevronRight size={13} />
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <section className="ss-glass ss-glass--ambient rounded-2xl p-5 sm:p-6">
            <h2 className="text-xs font-black uppercase tracking-[0.16em] text-red-300">About {hostProfile.name}</h2>
            <p className="mt-3 text-sm leading-7 text-gray-300">
              {aboutDescription}
            </p>
            {themePills.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-4">
                {themePills.slice(0, 6).map((pill) => (
                  <span
                    key={pill}
                    className="ss-glass ss-glass--ambient rounded-full px-2.5 py-1 text-xs font-medium text-gray-300"
                  >
                    {pill}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          {hostProfile.organization?.standards?.length ? (
            <details className="group ss-glass ss-glass--ambient rounded-2xl p-5 sm:p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.16em] text-red-300">
                <span className="inline-flex items-center gap-2"><ShieldCheck size={16} /> Standards & expectations</span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium normal-case tracking-normal text-gray-400">
                  {hostProfile.organization.standards.length} guidelines
                  <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
                </span>
              </summary>
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

          {pastEvents.length > 0 ? (
            <section id="host-past-events" className="ss-glass ss-glass--ambient scroll-mt-24 rounded-2xl p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.16em] text-red-300">Past Events</h2>
                  <p className="mt-1 text-xs text-gray-400">{pastEvents.length} completed listing{pastEvents.length === 1 ? '' : 's'}, newest first</p>
                </div>
                <button
                  type="button"
                  onClick={togglePastExpanded}
                  aria-expanded={pastExpanded}
                  className="ss-glass ss-glass--ambient ss-glass--interactive inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-gray-200"
                >
                  {pastExpanded ? 'Hide history' : `Show history (${pastEvents.length})`}
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
                      <EventCardCompact
                        key={item.id}
                        title={item.name}
                        dateTime={item.dateTime}
                        city={item.city}
                        tags={item.tags}
                        flyerUrl={item.flyerUrl}
                        logoUrl={hostLogoImage}
                        logoAlt={hostProfile.name}
                        to={item.to}
                        isPast
                      />
                    )}
                  />
                </div>
              ) : null}
            </section>
          ) : null}

          {hostProfile.organization?.galleryImageUrls?.length ? (
            <details className="group ss-glass ss-glass--ambient rounded-2xl p-5 sm:p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.16em] text-red-300">
                <span className="inline-flex items-center gap-2"><Images size={16} /> Gallery</span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium normal-case tracking-normal text-gray-400">
                  {hostProfile.organization.galleryImageUrls.length} photos
                  <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
                </span>
              </summary>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {hostProfile.organization.galleryImageUrls.slice(0, 4).map((imageUrl, imageIndex) => (
                  <img key={imageUrl} src={imageUrl} onError={handleListingImageError} alt={`${hostProfile.name} gallery ${imageIndex + 1}`} className="aspect-[4/3] w-full rounded-xl border border-white/10 object-cover" />
                ))}
              </div>
            </details>
          ) : null}

          <PromoterFeedbackPlaceholder id={`host-feedback-${slug}`} />
        </>
      }
      rail={
        <>
          <HostExternalLinks
            organizationId={hostProfile.organization?.id ?? hostProfile.slug}
            website={hostExternalLinks.website}
            fetlife={hostExternalLinks.fetlife}
            instagram={hostExternalLinks.instagram}
            email={hostExternalLinks.email}
          />

          {ownedClub && !venueRelationships.some(({ venue }) => venue && (ownedClub.primaryVenueId === venue.id || `venue-${ownedClub.id}` === venue.id)) ? (
            <section className="ss-glass ss-glass--ambient rounded-2xl p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-100">
                <Building2 size={16} className="text-red-300" /> Home club
              </h2>
              <Link
                to={getClubCanonicalPath(ownedClub, index)}
                className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 p-3 transition hover:border-red-400/40 hover:bg-white/[0.04]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{ownedClub.name}</p>
                  <p className="mt-0.5 truncate text-xs text-gray-400">
                    {[ownedClub.geopoint?.address?.city, ownedClub.geopoint?.address?.region].filter(Boolean).join(', ')}
                  </p>
                </div>
                <ChevronRight size={15} className="shrink-0 text-red-300" />
              </Link>
            </section>
          ) : null}

          {venueRelationships.length ? (
            <section className="ss-glass ss-glass--ambient rounded-2xl p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-100"><Building2 size={16} className="text-red-300" />Regular venues</h2>
              <ul className="mt-3 divide-y divide-white/10">
                {venueRelationships.map(({ relationship, venue }) => {
                  if (!venue) return null;
                  const linkedClub = listings.find((listing): listing is ClubData => (
                    listing.type === 'club'
                    && listing.status === 'approved'
                    && (
                      listing.primaryVenueId === venue.id
                      || `venue-${listing.id}` === venue.id
                      || listing.name.trim().toLowerCase() === venue.name.trim().toLowerCase()
                    )
                  ));
                  const content = (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-200">{venue.name}</p><p className="mt-0.5 text-[11px] text-gray-400">{venue.visibility === 'private' ? 'Exact location protected' : [venue.address.city, venue.address.region].filter(Boolean).join(', ')}</p></div>
                      <span className="ss-glass ss-glass--ambient shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold text-red-200">{relationship.label || relationshipLabel[relationship.relationshipType]}</span>
                    </div>
                  );
                  return (
                    <li key={relationship.id} className="py-3 first:pt-1">
                      {linkedClub ? (
                        <Link
                          to={getClubCanonicalPath(linkedClub, index)}
                          className="block rounded-xl transition hover:bg-white/[0.035] focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300"
                        >
                          {content}
                        </Link>
                      ) : content}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {hostEventSeries.length ? (
            <section className="ss-glass ss-glass--ambient rounded-2xl p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-100">
                <Repeat size={16} className="text-red-300" /> Event series
              </h2>
              <ul className="mt-3 divide-y divide-white/10">
                {hostEventSeries.map((series) => {
                  const seriesOccurrences = (index.eventsBySeriesId.get(series.id) ?? []).filter(
                    (ev) => ev.status === 'approved',
                  );
                  const nextSeriesOccurrence = seriesOccurrences.find((ev) => !isPastEvent(ev)) ?? seriesOccurrences.at(-1);
                  const rowContent = (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-200">{series.name}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {series.cadenceSummary || `${seriesOccurrences.length} listed ${seriesOccurrences.length === 1 ? 'date' : 'dates'}`}
                        </p>
                      </div>
                      {seriesOccurrences.length > 0 ? (
                        <span className="ss-glass ss-glass--ambient shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold tabular-nums text-red-200">
                          {seriesOccurrences.length} {seriesOccurrences.length === 1 ? 'date' : 'dates'}
                        </span>
                      ) : null}
                    </div>
                  );
                  return (
                    <li key={series.id} className="py-3 first:pt-1">
                      {nextSeriesOccurrence ? (
                        <Link
                          to={getEventCanonicalPath(nextSeriesOccurrence, index)}
                          className="block rounded-xl transition hover:bg-white/[0.035] focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300"
                        >
                          {rowContent}
                        </Link>
                      ) : (
                        rowContent
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {hostRegions.length ? (
            <section className="ss-glass ss-glass--ambient rounded-2xl p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-100"><MapPin size={16} className="text-red-300" />Operating regions</h2>
              <ul className="mt-3 divide-y divide-white/10">
                {hostRegions.map((region, regionIndex) => (
                  <li key={region} className="flex gap-3 py-2.5 first:pt-1">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5 text-[11px] font-bold text-red-300">{regionIndex + 1}</span>
                    <p className="self-center text-sm font-semibold text-gray-200">{region}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {hostProfile.organization ? (
            <ListingClaimCard
              entityType="organization"
              entityId={hostProfile.organization.id}
              entityName={hostProfile.organization.name}
              organizationId={hostProfile.organization.id}
              defaultRole="manager"
            />
          ) : null}
        </>
      }
    />
    </>
  );
};

export default HostPage;
