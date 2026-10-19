import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import EventHero from '../entity/eventHero/EventHero';
import { useEntityIndex } from '../../hooks/useEntityIndex';
import { formatEventTimeRange, resolveCountryFlagEmoji } from '../../lib/formatting';
import { parsePrettyKeyParam, hostSlug, normalizeHostName } from '../../lib/identityUtils';
import {
  getClubCanonicalPath,
  getEventCanonicalPath,
  getHostCanonicalPath,
  resolveEventFromParam,
} from '../../lib/entityUtils';
import type { EventData } from '../../types';
import EventPageLayout from '../event/EventPageLayout';
import { DetailContextNav } from '../navigation/DetailContextNav';
import EventMapCard from '../event/EventMapCard';
import EventCalendarCard from '../event/EventCalendarCard';
import EventHostCard from '../event/EventHostCard';
import {
  getEventCardImageUrl,
  getListingHeroPageUrl,
  getListingPrimaryFlyerUrl,
  getListingPrimaryHeroUrl,
  handleListingImageError,
} from '../../lib/listingImage';
import { getListingDisplayCoords } from '../../lib/explorerMarkers';
import {
  getListingPhysicalAddress,
  getListingPhysicalCoords,
  getVenueForListing,
  resolveEventOrganizerOrganizationId,
} from '../../lib/entityCompatibility';
import ListingAccessSummary from '../listing/ListingAccessSummary';
import {
  getCloudflareImageUrl,
  getHeroCloudflareImageUrl,
  normalizeHeroDeliveryUrl,
} from '../../lib/media/getCloudflareImageUrl';
import { extractHeroCropFromUrl, resolveEntityHeroCrop } from '../../lib/media/heroCrop';
import EventFeedbackSection from '../feedback/EventFeedbackSection';
import EventOverviewSection from '../event/EventOverviewSection';
import EventEssentialsSection from '../event/EventEssentialsSection';
import EventAccessCard from '../event/EventAccessCard';
import EventFlyerCard from '../event/EventFlyerCard';
import type { EventQuickEditField } from '../admin-edit/EventQuickEditPanel';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';
import { usePublicEditAccess } from '../admin-edit/usePublicEditAccess';
import { isPastEvent } from '../../lib/eventLifecycle';
import { resolveStreetViewSourceListingId } from '../../lib/streetViewAvailability';
import { isApproximateLocation } from '../../lib/publicLocation';
import Seo from '../Seo';
import { resolveBrandHeader, resolveBrandLogo } from '../../lib/entityBrandMedia';

const EventPageAdminEditor = React.lazy(() => import('../admin-edit/EventPageAdminEditor'));
const EventQuickEditPanel = React.lazy(() => import('../admin-edit/EventQuickEditPanel'));

const MOCK_EVENT_SLUG = 'dev-mock-event';

const createMockEvent = (id: string = MOCK_EVENT_SLUG): EventData => {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 7);
  start.setUTCHours(20, 0, 0, 0);
  const end = new Date(start);
  end.setUTCHours(start.getUTCHours() + 4, 0, 0, 0);

  const isPrivate = id.includes('private');
  const isPublic = id.includes('public');
  const isNoImages = id.includes('no-images');
  const isLongTitle = id.includes('long-title');
  const isManyTags = id.includes('many-tags');
  const isMissingCity = id.includes('missing-city');
  const isNoVenue = id.includes('no-venue');
  const isHasVenue = id.includes('has-venue');

  return {
    id,
    type: 'event',
    name: isLongTitle
      ? 'Dummy Event Template Preview With an Intentionally Long, Multi-Clause Title to Stress Hero Wrapping and Card Hierarchy'
      : 'Dummy Event Template Preview',
    hostName: 'Community Host',
    description_full:
      'This is a deterministic mock event used to validate the Event Detail template layout, CTA placement, and private-location messaging.',
    location: 'Private location',
    contactEmail: 'dev-events@swingsphere.local',
    isAddressPrivate: isPublic ? false : isPrivate || !isNoVenue,
    venueKey: isHasVenue ? 'club-power-exchange-sf' : undefined,
    time: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
    geopoint: {
      latitude: 37.7749,
      longitude: -122.4194,
      address: {
        city: isMissingCity ? '' : 'San Francisco',
        region: isMissingCity ? '' : 'CA',
        country: 'USA',
      },
    },
    tags: isManyTags
      ? ['RSVP Required', 'Private Venue', 'Template Preview', 'Casual', 'Dance', 'Newbie Friendly', 'Lounge', 'Late Night', 'Dress Code', 'Social']
      : ['RSVP Required', 'Private Venue', 'Template Preview'],
    headerImageUrl: isNoImages ? undefined : 'https://picsum.photos/seed/event-template-hero/1400/900',
    galleryImageUrls: isNoImages
      ? []
      : [
          'https://picsum.photos/seed/event-template-thumb-1/500/380',
          'https://picsum.photos/seed/event-template-thumb-2/500/380',
          'https://picsum.photos/seed/event-template-thumb-3/500/380',
          'https://picsum.photos/seed/event-template-thumb-4/500/380',
        ],
    status: 'approved',
    postedByUserId: 'user-001',
  };
};

const EventPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const key = parsePrettyKeyParam(slug ?? '');
  const { index, listings, venues, eventSeries: eventSeriesCatalog, organizations, organizationVenueRelationships, isLoading, error } = useEntityIndex();
  const isMockRoute = key === MOCK_EVENT_SLUG || key.startsWith('dummy-event-');

  const resolvedLookup = useMemo(
    () => (!isMockRoute && index && slug ? resolveEventFromParam(slug, index) : null),
    [index, isMockRoute, slug],
  );
  const resolvedEvent = resolvedLookup?.event ?? (isMockRoute ? createMockEvent(key) : null);
  const { registerPublicPage, clearPublicPage } = useAdminEditMode();
  const { canEdit } = usePublicEditAccess({
    postedByUserId: resolvedEvent?.postedByUserId,
    organizationIds: [resolvedEvent?.organizerOrganizationId],
  });
  const [eventOverride, setEventOverride] = useState<EventData | null>(null);
  const [quickEditField, setQuickEditField] = useState<EventQuickEditField | null>(null);
  const [isDesktopRail, setIsDesktopRail] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1024px)').matches
      : true,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktopRail(e.matches);
    setIsDesktopRail(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  useEffect(() => {
    setEventOverride(null);
    setQuickEditField(null);
  }, [resolvedEvent?.id]);
  useEffect(() => {
    if (!resolvedEvent || isMockRoute) return;
    registerPublicPage({
      entityId: resolvedEvent.id,
      entityType: 'event',
      label: resolvedEvent.name,
      canEdit,
      supportsInlineQuickEdit: true,
    });
    return () => clearPublicPage(resolvedEvent.id);
  }, [canEdit, clearPublicPage, isMockRoute, registerPublicPage, resolvedEvent]);
  const event = eventOverride ?? resolvedEvent;
  const entityCollections = useMemo(
    () => ({
      listings,
      venues,
      organizations,
      relationships: organizationVenueRelationships,
      eventSeries: eventSeriesCatalog,
    }),
    [listings, venues, organizations, organizationVenueRelationships, eventSeriesCatalog],
  );
  const venueKey = (event && index?.eventVenueClubKeyById.get(event.id)) ?? event?.venueKey ?? '';
  const mockLinkedVenue =
    isMockRoute && key.includes('has-venue') && index
      ? Array.from(index.clubsByKey.values())[0] ?? null
      : null;
  const venue = (venueKey ? index?.clubsByKey.get(venueKey) ?? null : null) ?? mockLinkedVenue;
  const venuePath = venue ? getClubCanonicalPath(venue, index) : undefined;
  const hostName = event?.hostName ?? '';
  const resolvedOrganizerId = event ? resolveEventOrganizerOrganizationId(event, entityCollections) : undefined;
  const organizerOrganization = resolvedOrganizerId
    ? index?.organizationsById.get(resolvedOrganizerId) ?? null
    : null;
  const hostSlugValue = hostName ? hostSlug(normalizeHostName(hostName)) : '';
  const hostPath = organizerOrganization
    ? getHostCanonicalPath(organizerOrganization.slug)
    : hostSlugValue ? getHostCanonicalPath(hostSlugValue) : undefined;
  const hostEventsCount = organizerOrganization
    ? (index?.eventsByOrganizationId.get(organizerOrganization.id)?.filter((listing) => listing.status === 'approved').length ?? 0)
    : hostSlugValue ? (index?.eventsByHostSlug.get(hostSlugValue)?.filter((listing) => listing.status === 'approved').length ?? 0) : 0;
  const eventSeries = useMemo(() => {
    if (!event) return null;
    if (event.eventSeriesId) {
      return index?.eventSeriesById.get(event.eventSeriesId) ?? null;
    }
    const normalizedTitle = normalizeHostName(event.name);
    if (!normalizedTitle) return null;
    return eventSeriesCatalog.find(
      (series) =>
        series.status === 'approved'
        && normalizeHostName(series.name) === normalizedTitle
        && (!organizerOrganization || !series.organizerOrganizationId || series.organizerOrganizationId === organizerOrganization.id),
    ) ?? null;
  }, [event, eventSeriesCatalog, index, organizerOrganization]);
  const seriesOccurrences = useMemo(() => {
    if (!event || !eventSeries || !index) return [];
    const byId = new Map<string, EventData>();
    for (const candidate of index.eventsBySeriesId.get(eventSeries.id) ?? []) {
      byId.set(candidate.id, candidate);
    }
    const targetNormName = normalizeHostName(eventSeries.name);
    const orgId = eventSeries.organizerOrganizationId ?? organizerOrganization?.id;
    if (orgId && targetNormName) {
      for (const candidate of index.eventsByOrganizationId.get(orgId) ?? []) {
        if (candidate.status === 'approved' && normalizeHostName(candidate.name) === targetNormName) {
          byId.set(candidate.id, candidate);
        }
      }
    }
    return Array.from(byId.values())
      .filter((candidate) => candidate.id !== event.id && !isPastEvent(candidate))
      .sort((a, b) => Date.parse(a.time.start) - Date.parse(b.time.start));
  }, [event, eventSeries, index, organizerOrganization?.id]);
  const hostUser = useMemo(() => {
    if (!index || !hostName) return null;
    const normalized = normalizeHostName(hostName);
    return Array.from(index.usersById.values()).find(
      (user) => normalizeHostName(user.displayName) === normalized,
    ) ?? null;
  }, [hostName, index]);
  const presenterName = organizerOrganization?.name || hostName || 'Host TBD';
  const presenterLogoUrl = organizerOrganization
    ? resolveBrandLogo('organization', organizerOrganization.id, {
        listings,
        venues,
        organizations,
        relationships: organizationVenueRelationships,
        eventSeries: eventSeriesCatalog,
      }).url || organizerOrganization.logoImageUrl || hostUser?.avatarUrl
    : hostUser?.avatarUrl;
  const presenterHeroUrl = organizerOrganization
    ? resolveBrandHeader('organization', organizerOrganization.id, {
        listings,
        venues,
        organizations,
        relationships: organizationVenueRelationships,
        eventSeries: eventSeriesCatalog,
      }).url || organizerOrganization.headerImageUrl
    : undefined;
  const presenterBio = organizerOrganization?.descriptionShort || organizerOrganization?.descriptionFull || hostUser?.bio;

  const locationLine = useMemo(() => {
    if (!event) return '';
    const address = getListingPhysicalAddress(event, entityCollections);
    const city = address.city ?? '';
    const region = address.region ?? '';
    const country = address.country ?? '';
    const emoji = resolveCountryFlagEmoji(country);
    const parts = [city, region].filter(Boolean).join(', ');
    return `${parts}${emoji ? ` ${emoji}` : ''}`;
  }, [entityCollections, event]);
  const physicalVenue = event ? getVenueForListing(event, entityCollections) : null;
  const isPrivateLocation = Boolean(event && (
    isApproximateLocation(event) || (physicalVenue && physicalVenue.visibility !== 'public_exact')
  ));
  const streetViewListingId = event && !isPrivateLocation
    ? resolveStreetViewSourceListingId(event, entityCollections)
    : null;

  if (!isMockRoute && resolvedLookup && !resolvedLookup.isCanonical) {
    return <Navigate to={resolvedLookup.canonicalPath} replace />;
  }

  if (isLoading && !event) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
        Loading event...
      </div>
    );
  }

  if (error || !event || (!index && !isMockRoute)) {
    return (
      <>
        <Seo
          title="Event Not Found | SwingSphere"
          description="The requested lifestyle event could not be found on SwingSphere."
          canonicalPath={window.location.pathname}
          noIndex
        />
        <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
          Event not found.
        </div>
      </>
    );
  }

  const timeRange = formatEventTimeRange(event.time.start, event.time.end);
  const eventIsPast = isPastEvent(event);
  const heroLocationText = isPrivateLocation
    ? 'Private location / disclosed after RSVP'
    : locationLine || 'Location TBD';
  const eventHeroAsset = event.mediaAssets?.find((asset) => asset.role === 'hero') ?? null;
  const eventFlyerAsset = event.mediaAssets?.find((asset) => asset.role === 'flyer') ?? null;
  const eventGalleryAssets = event.mediaAssets?.filter((asset) => asset.role === 'gallery') ?? [];
  const eventFlyerHeroImage =
    (eventFlyerAsset
      ? getCloudflareImageUrl({ externalId: eventFlyerAsset.external_id, variant: 'flyerpage' }) ?? undefined
      : undefined) ??
    getListingPrimaryFlyerUrl(event, 'flyerpage');
  const eventBrandHeader = resolveBrandHeader('event', event.id, {
    listings,
    venues,
    organizations,
    relationships: organizationVenueRelationships,
    eventSeries: eventSeriesCatalog,
  });
  const resolvedEventHeroCrop = resolveEntityHeroCrop(
    event,
    event.headerImageUrl || eventBrandHeader.url || presenterHeroUrl,
    event.heroCrop ??
      extractHeroCropFromUrl(eventBrandHeader.url).crop ??
      extractHeroCropFromUrl(presenterHeroUrl).crop ??
      eventSeries?.heroCrop,
  );
  const directHeroImage =
    (eventHeroAsset
      ? getHeroCloudflareImageUrl({ externalId: eventHeroAsset.external_id, crop: resolvedEventHeroCrop }) ?? undefined
      : undefined) ??
    getListingPrimaryHeroUrl(event, 'heropage');
  const inheritedHeroImage =
    (eventBrandHeader.url ? normalizeHeroDeliveryUrl(eventBrandHeader.url, resolvedEventHeroCrop) : null) ??
    (presenterHeroUrl ? normalizeHeroDeliveryUrl(presenterHeroUrl, resolvedEventHeroCrop) : null) ??
    (eventSeries?.headerImageUrl ? normalizeHeroDeliveryUrl(eventSeries.headerImageUrl, resolvedEventHeroCrop) : null) ??
    undefined;
  const venueCoverImage = venue ? getListingHeroPageUrl(venue, index ?? undefined) : '';
  const eventCoverImage =
    directHeroImage ??
    inheritedHeroImage ??
    eventFlyerHeroImage ??
    (venueCoverImage || undefined) ??
    getEventCardImageUrl(event, index ?? undefined);
  const flyerFallbackUrls = [
    eventFlyerAsset ? getCloudflareImageUrl({ externalId: eventFlyerAsset.external_id, variant: 'flyercard' }) : null,
    eventFlyerAsset ? getCloudflareImageUrl({ externalId: eventFlyerAsset.external_id, variant: 'public' }) : null,
    (event as EventData & { flyerImageUrl?: string }).flyerImageUrl,
  ];
  const heroFallbackUrls = [
    directHeroImage,
    eventHeroAsset ? getCloudflareImageUrl({ externalId: eventHeroAsset.external_id, variant: 'herocard' }) : null,
    inheritedHeroImage,
    presenterHeroUrl,
    eventSeries?.headerImageUrl,
    venueCoverImage || null,
    eventFlyerHeroImage,
    ...(event.galleryImageUrls ?? []),
  ];
  const eventBrandLogo = resolveBrandLogo('event', event.id, {
    listings,
    venues,
    organizations,
    relationships: organizationVenueRelationships,
    eventSeries: eventSeriesCatalog,
  });
  const eventLogoImage = eventBrandLogo.url || (event.logoOverride !== false ? event.logoImageUrl : undefined);
  const eventLogoInherited = Boolean(eventBrandLogo.url && eventBrandLogo.inherited && eventBrandLogo.sourceType !== 'event');
  const venueLogoAsset = venue?.mediaAssets?.find((asset) => asset.role === 'logo') ?? null;
  const venueLogoImage = venueLogoAsset
    ? getCloudflareImageUrl({ externalId: venueLogoAsset.external_id, variant: 'logosquare' })
    : venue?.logoImageUrl;
  const heroMediaImages = [
    ...eventGalleryAssets
      .map((asset) => getCloudflareImageUrl({ externalId: asset.external_id, variant: 'gallerythumb' }))
      .filter(Boolean),
    eventFlyerAsset ? getCloudflareImageUrl({ externalId: eventFlyerAsset.external_id, variant: 'flyercard' }) : null,
    ...(event.galleryImageUrls ?? []),
    ...(venue?.galleryImageUrls ?? []),
    venueCoverImage,
  ].filter((url): url is string => Boolean(url) && url !== eventCoverImage);
  const extendedEvent = event as EventData & {
    ticketUrl?: string;
    rsvpUrl?: string;
    logoImageUrl?: string;
  };
  const ticketUrl = extendedEvent.ticketUrl?.trim();
  const rsvpUrl = extendedEvent.rsvpUrl?.trim();
  const websiteUrl = event.website?.trim();

  // Prefer the organizer's public event information page over a ticket checkout/login.
  // Keep ticketUrl and rsvpUrl in the event record for explicit purchase flows.
  const publicEventPageUrl = websiteUrl && !/luminasocialclub\.com\/login\//i.test(websiteUrl)
    ? websiteUrl
    : undefined;
  const accessUrl = publicEventPageUrl || ticketUrl || rsvpUrl || websiteUrl;
  const accessDestinationType = publicEventPageUrl ? 'website' : ticketUrl ? 'ticket' : rsvpUrl ? 'rsvp' : 'website';

  const attendanceText = event.tags?.find((tag) => /ticket|rsvp|member|invite|admission/i.test(tag));
  const eventAddress = getListingPhysicalAddress(event, entityCollections);
  const eventDisplayCoords = getListingDisplayCoords(event) ?? { lat: event.geopoint.latitude, lng: event.geopoint.longitude };
  const city = eventAddress.city ?? '';
  const region = eventAddress.region ?? '';
  const locationForCalendar = isPrivateLocation
    ? 'Private location / disclosed after RSVP'
    : [city, region].filter(Boolean).join(', ') || event.location || 'Location TBD';

  const calendarCardNode = (
    <EventCalendarCard
      compact
      eventId={event.id}
      title={event.name}
      description={event.description_full}
      startIso={event.time.start}
      endIso={event.time.end}
      locationText={locationForCalendar}
      organizationId={event.organizerOrganizationId}
      eventSeriesId={event.eventSeriesId}
    />
  );

  const canonicalPath = isMockRoute
    ? window.location.pathname
    : resolvedLookup?.canonicalPath ?? getEventCanonicalPath(event, index ?? undefined);
  const canonicalUrl = `https://swingsphere.co${canonicalPath}`;
  const citySlug = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const country = eventAddress.country ?? '';
  const exactCoords = !isPrivateLocation ? getListingPhysicalCoords(event, entityCollections) : null;
  const resolvedVenueName =
    venue?.name ||
    physicalVenue?.name ||
    (!isPrivateLocation && event.location ? event.location : '') ||
    ([city, region].filter(Boolean).join(', ') || 'Event Venue');

  const structuredData: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    '@id': canonicalUrl,
    name: event.name,
    description: event.description_full || `Explore ${event.name} on SwingSphere.`,
    startDate: event.time.start,
    endDate: event.time.end,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: canonicalUrl,
    ...(eventFlyerHeroImage || eventCoverImage ? { image: eventFlyerHeroImage || eventCoverImage } : {}),
    location: {
      '@type': 'Place',
      name: resolvedVenueName,
      ...(venuePath ? { url: `https://swingsphere.co${venuePath}` } : {}),
      address: {
        '@type': 'PostalAddress',
        ...(!isPrivateLocation && eventAddress.street ? { streetAddress: eventAddress.street } : {}),
        ...(city ? { addressLocality: city } : {}),
        ...(region ? { addressRegion: region } : {}),
        ...(!isPrivateLocation && eventAddress.postalCode ? { postalCode: eventAddress.postalCode } : {}),
        ...(country ? { addressCountry: country } : {}),
      },
      ...(exactCoords
        ? {
            geo: {
              '@type': 'GeoCoordinates',
              latitude: exactCoords.lat,
              longitude: exactCoords.lng,
            },
          }
        : {}),
    },
    ...(presenterName && presenterName !== 'Host TBD'
      ? {
          organizer: {
            '@type': 'Organization',
            name: presenterName,
            ...(hostPath ? { url: `https://swingsphere.co${hostPath}` } : {}),
          },
        }
      : {}),
  };

  const seoSocialImage =
    eventFlyerHeroImage ||
    directHeroImage ||
    inheritedHeroImage ||
    eventLogoImage ||
    venueLogoImage ||
    undefined;

  return (
    <>
      <Seo
        title={`${event.name}${city ? ` in ${city}` : ''} | Lifestyle Event | SwingSphere`}
        description={
          event.description_full ||
          `Explore ${event.name} on SwingSphere. See date, location, host, access details, tickets, and event information.`
        }
        canonicalPath={canonicalPath}
        imageUrl={seoSocialImage}
        imageAlt={eventFlyerHeroImage ? `${event.name} flyer` : `${event.name} event`}
        ogType="article"
        noIndex={isMockRoute}
        structuredData={structuredData}
      />
      {canEdit ? (
        <React.Suspense fallback={null}>
          <EventPageAdminEditor event={event} isMockRoute={isMockRoute} />
        </React.Suspense>
      ) : null}
      {!isMockRoute && canEdit && quickEditField ? (
        <React.Suspense fallback={null}>
          <EventQuickEditPanel
            key={`${event.id}-${quickEditField}`}
            event={event}
            field={quickEditField}
            onClose={() => setQuickEditField(null)}
            onPreview={setEventOverride}
            onSaved={setEventOverride}
          />
        </React.Suspense>
      ) : null}
      <EventPageLayout
        backgroundImageUrl={eventFlyerHeroImage || eventCoverImage}
        contextNav={
          <DetailContextNav
            breadcrumbs={[
              { label: 'Directory', href: '/discover' },
              { label: 'Events', href: '/discover?type=events' },
              ...(city && citySlug
                ? [{ label: city, href: `/swinger-parties/${citySlug}` }]
                : []),
              { label: event.name },
            ]}
            listingId={event.id}
            streetViewAvailable={Boolean(streetViewListingId)}
            showSpatialActions={false}
            className="hidden sm:flex"
          />
        }
        hero={
        <>
          <EventHero
            eventId={event.id}
            title={event.name}
            backgroundImageUrl={eventCoverImage}
            backgroundFallbackUrls={heroFallbackUrls}
            mobileFlyerImageUrl={eventFlyerHeroImage}
            flyerFallbackUrls={flyerFallbackUrls}
            heroCrop={resolvedEventHeroCrop}
            eventLogoUrl={eventLogoImage}
            clubLogoUrl={venueLogoImage}
            hostLogoUrl={presenterLogoUrl}
            locationText={heroLocationText}
            timeText={timeRange}
            venueName={venue?.name}
            venuePath={venuePath}
            hostName={presenterName}
            hostPath={hostPath}
            attendanceText={attendanceText}
            accessUrl={accessUrl}
            accessDestinationType={accessDestinationType}
            contactEmail={event.contactEmail}
            calendarActions={calendarCardNode}
            tags={event.tags}
            mediaImages={heroMediaImages}
            onQuickEdit={setQuickEditField}
            inheritedLogoSourceName={eventLogoInherited ? eventBrandLogo.sourceName : undefined}
          />
          <EventEssentialsSection
            className="ss-event-essentials-bar"
            timeText={timeRange}
            locationText={heroLocationText}
            venueName={venue?.name}
            venuePath={venuePath}
            hostName={presenterName}
            hostPath={hostPath}
            attendanceText={attendanceText}
            accessUrl={accessUrl}
            accessDestinationType={accessDestinationType}
            contactEmail={event.contactEmail}
            calendarActions={calendarCardNode}
          />
        </>
      }
      mobileTop={null}
      main={
        <>
          {eventIsPast && (
            <section className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] p-5">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">Past event</div>
              <p className="mt-2 text-sm leading-6 text-amber-50/85">
                This event ended {new Date(event.time.end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. This page remains available as part of the organizer's event history.
              </p>
              {hostPath && <Link to={hostPath} className="mt-3 inline-flex text-sm font-bold text-amber-200 hover:text-white">See upcoming events from {presenterName || 'this organizer'} →</Link>}
            </section>
          )}
          <EventOverviewSection description={event.description_full} onQuickEdit={() => setQuickEditField('description')} />
          <ListingAccessSummary listing={event} variant="detail" />
          {eventSeries && seriesOccurrences.length ? (
            <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300/80">More dates</div>
                  <h2 className="mt-1 text-xl font-black text-white">Upcoming {eventSeries.name} events</h2>
                </div>
                <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-gray-300">
                  {seriesOccurrences.length} more
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {seriesOccurrences.map((occurrence) => {
                  const occurrenceAddress = getListingPhysicalAddress(occurrence);
                  const occurrenceDate = new Intl.DateTimeFormat('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  }).format(new Date(occurrence.time.start));
                  const occurrenceCardUrl = getEventCardImageUrl(occurrence, index ?? undefined);
                  return (
                    <Link
                      key={occurrence.id}
                      to={getEventCanonicalPath(occurrence, index)}
                      className="group relative isolate overflow-hidden rounded-xl border border-white/10 bg-black/20 px-4 py-3 transition hover:border-amber-300/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                    >
                      {occurrenceCardUrl && (
                        <>
                          <img
                            src={occurrenceCardUrl}
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                            onError={handleListingImageError}
                            className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover object-top opacity-75 transition duration-300 group-hover:scale-105"
                          />
                          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-[#090b10]/85 via-[#090b10]/65 to-[#090b10]/35" />
                          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-[#090b10]/65 to-transparent" />
                        </>
                      )}
                      <div className="font-bold text-white">{occurrence.occurrenceTitle || occurrence.name}</div>
                      <div className="mt-1 text-sm text-amber-200">{occurrenceDate}</div>
                      <div className="mt-1 truncate text-xs text-gray-200">
                        {[occurrenceAddress.city, occurrenceAddress.region].filter(Boolean).join(', ')}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}
          <div className="ss-event-mobile-only-cards space-y-6">
            {!isDesktopRail ? (
              <EventMapCard
                eventId={event.id}
                eventName={event.name}
                city={city}
                region={region}
                lat={eventDisplayCoords.lat}
                lng={eventDisplayCoords.lng}
                isPrivateLocation={isPrivateLocation}
                streetViewListingId={streetViewListingId}
                organizationId={event.organizerOrganizationId}
                eventSeriesId={event.eventSeriesId}
                placementPrefix="event_page_mobile_directions"
              />
            ) : null}
            <EventAccessCard
              eventId={event.id}
              accessUrl={accessUrl}
              accessDestinationType={accessDestinationType}
              contactEmail={event.contactEmail}
              organizationId={event.organizerOrganizationId}
              eventSeriesId={event.eventSeriesId}
              placement="event_page_mobile_access"
            />
          </div>
          <EventHostCard
            hostName={presenterName}
            hostPath={hostPath}
            hostEventsCount={hostEventsCount}
            hostAvatarUrl={hostUser?.avatarUrl}
            hostLogoUrl={presenterLogoUrl}
            hostHeroUrl={presenterHeroUrl}
            hostBio={presenterBio}
          />
          <EventFeedbackSection event={event} />
        </>
      }
      rail={
        <>
          <EventFlyerCard eventName={event.name} flyerAsset={eventFlyerAsset} flyerUrl={eventFlyerHeroImage} onQuickEdit={() => setQuickEditField('flyer')} />
          {isDesktopRail ? (
            <EventMapCard
              eventId={event.id}
              eventName={event.name}
              city={city}
              region={region}
              lat={eventDisplayCoords.lat}
              lng={eventDisplayCoords.lng}
              isPrivateLocation={isPrivateLocation}
              streetViewListingId={streetViewListingId}
              organizationId={event.organizerOrganizationId}
              eventSeriesId={event.eventSeriesId}
              placementPrefix="event_page_rail_directions"
            />
          ) : null}
          <EventAccessCard
            eventId={event.id}
            accessUrl={accessUrl}
            accessDestinationType={accessDestinationType}
            contactEmail={event.contactEmail}
            organizationId={event.organizerOrganizationId}
            eventSeriesId={event.eventSeriesId}
            placement="event_page_rail_access"
          />
          {city && citySlug ? (
            <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500">City Guide</p>
              <div className="mt-2.5 flex flex-col gap-2">
                <Link
                  to={`/swinger-parties/${citySlug}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5 text-xs font-semibold text-gray-200 transition hover:border-red-300/35 hover:bg-white/[0.045] hover:text-white"
                >
                  <span>Swinger Parties &amp; Lifestyle Events in {city}</span>
                  <span aria-hidden="true" className="text-red-300">→</span>
                </Link>
              </div>
            </section>
          ) : null}
        </>
      }
      />
    </>
  );
};

export default EventPage;
