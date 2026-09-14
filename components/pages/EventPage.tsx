import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import EventHero from '../entity/eventHero/EventHero';
import { useEntityIndex } from '../../hooks/useEntityIndex';
import { formatEventTimeRange, resolveCountryFlagEmoji } from '../../lib/formatting';
import { parsePrettyKeyParam, hostSlug, normalizeHostName } from '../../lib/identityUtils';
import { getClubCanonicalPath, getEventCanonicalPath, getHostCanonicalPath } from '../../lib/entityUtils';
import type { EventData } from '../../types';
import EventPageLayout from '../event/EventPageLayout';
import EventMapCard from '../event/EventMapCard';
import EventCalendarCard from '../event/EventCalendarCard';
import EventHostCard from '../event/EventHostCard';
import { getListingImageUrl } from '../../lib/listingImage';
import { getListingDisplayCoords } from '../../lib/explorerMarkers';
import { getListingPhysicalAddress } from '../../lib/entityCompatibility';
import ListingAccessSummary from '../listing/ListingAccessSummary';
import { getCloudflareImageUrl } from '../../lib/media/getCloudflareImageUrl';
import EventFeedbackSection from '../feedback/EventFeedbackSection';
import EventOverviewSection from '../event/EventOverviewSection';
import EventEssentialsSection from '../event/EventEssentialsSection';
import EventAccessCard from '../event/EventAccessCard';
import EventFlyerCard from '../event/EventFlyerCard';
import EventPageAdminEditor from '../admin-edit/EventPageAdminEditor';
import EventQuickEditPanel, { type EventQuickEditField } from '../admin-edit/EventQuickEditPanel';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';
import { usePublicEditAccess } from '../admin-edit/usePublicEditAccess';
import { isPastEvent } from '../../lib/eventLifecycle';

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
  const { index, isLoading, error } = useEntityIndex();
  const isMockRoute = key === MOCK_EVENT_SLUG || key.startsWith('dummy-event-');

  const resolvedEvent = index?.eventsByKey.get(key) ?? (isMockRoute ? createMockEvent(key) : null);
  const { registerPublicPage, clearPublicPage } = useAdminEditMode();
  const { canEdit } = usePublicEditAccess({
    postedByUserId: resolvedEvent?.postedByUserId,
    organizationIds: [resolvedEvent?.organizerOrganizationId],
  });
  const [eventOverride, setEventOverride] = useState<EventData | null>(null);
  const [quickEditField, setQuickEditField] = useState<EventQuickEditField | null>(null);
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
  const venueKey = event?.venueKey ?? '';
  const mockLinkedVenue =
    isMockRoute && key.includes('has-venue') && index
      ? Array.from(index.clubsByKey.values())[0] ?? null
      : null;
  const venue = (venueKey ? index?.clubsByKey.get(venueKey) ?? null : null) ?? mockLinkedVenue;
  const venuePath = venue ? getClubCanonicalPath(venue, index) : undefined;
  const hostName = event?.hostName ?? '';
  const organizerOrganization = event?.organizerOrganizationId
    ? index?.organizationsById.get(event.organizerOrganizationId) ?? null
    : null;
  const hostSlugValue = hostName ? hostSlug(normalizeHostName(hostName)) : '';
  const hostPath = organizerOrganization
    ? getHostCanonicalPath(organizerOrganization.slug)
    : hostSlugValue ? getHostCanonicalPath(hostSlugValue) : undefined;
  const hostEventsCount = organizerOrganization
    ? Array.from(index?.eventsByKey.values() ?? []).filter((listing) => listing.organizerOrganizationId === organizerOrganization.id).length
    : hostSlugValue ? (index?.eventsByHostSlug.get(hostSlugValue)?.length ?? 0) : 0;
  const eventSeries = event?.eventSeriesId ? index?.eventSeriesById.get(event.eventSeriesId) ?? null : null;
  const seriesOccurrences = event?.eventSeriesId
    ? (index?.eventsBySeriesId.get(event.eventSeriesId) ?? [])
        .filter((candidate) => candidate.id !== event.id && !isPastEvent(candidate))
        .sort((a, b) => Date.parse(a.time.start) - Date.parse(b.time.start))
    : [];
  const hostUser = useMemo(() => {
    if (!index || !hostName) return null;
    const normalized = normalizeHostName(hostName);
    return Array.from(index.usersById.values()).find(
      (user) => normalizeHostName(user.displayName) === normalized,
    ) ?? null;
  }, [hostName, index]);
  const presenterName = organizerOrganization?.name || hostName || 'Host TBD';
  const presenterLogoUrl = organizerOrganization?.logoImageUrl || hostUser?.avatarUrl;
  const presenterHeroUrl = organizerOrganization?.headerImageUrl
    || (organizerOrganization && venue?.ownerOrganizationId === organizerOrganization.id ? getListingImageUrl(venue) : undefined);
  const presenterBio = organizerOrganization?.descriptionShort || organizerOrganization?.descriptionFull || hostUser?.bio;

  const locationLine = useMemo(() => {
    if (!event) return '';
    const address = getListingPhysicalAddress(event);
    const city = address.city ?? '';
    const region = address.region ?? '';
    const country = address.country ?? '';
    const emoji = resolveCountryFlagEmoji(country);
    const parts = [city, region].filter(Boolean).join(', ');
    return `${parts}${emoji ? ` ${emoji}` : ''}`;
  }, [event]);
  const isPrivateLocation = Boolean(event?.isAddressPrivate);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
        Loading event...
      </div>
    );
  }

  if (error || !event || (!index && !isMockRoute)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
        Event not found.
      </div>
    );
  }

  const timeRange = formatEventTimeRange(event.time.start, event.time.end);
  const eventIsPast = isPastEvent(event);
  const heroLocationText = isPrivateLocation
    ? 'Private location / disclosed after RSVP'
    : locationLine || 'Location TBD';
  const eventLogoAsset = event.mediaAssets?.find((asset) => asset.role === 'logo') ?? null;
  const eventHeroAsset = event.mediaAssets?.find((asset) => asset.role === 'hero') ?? null;
  const eventFlyerAsset = event.mediaAssets?.find((asset) => asset.role === 'flyer') ?? null;
  const eventGalleryAssets = event.mediaAssets?.filter((asset) => asset.role === 'gallery') ?? [];
  const eventCoverImage = eventHeroAsset
    ? getCloudflareImageUrl({ externalId: eventHeroAsset.external_id, variant: 'heropage' }) ?? getListingImageUrl(event)
    : getListingImageUrl(event);
  const eventLogoImage = eventLogoAsset
    ? getCloudflareImageUrl({ externalId: eventLogoAsset.external_id, variant: 'logosquare' })
    : event.logoImageUrl || eventSeries?.logoImageUrl;
  const venueCoverImage = venue ? getListingImageUrl(venue) : '';
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
  ].filter((url) => Boolean(url) && url !== eventCoverImage);
  const extendedEvent = event as EventData & {
    ticketUrl?: string;
    rsvpUrl?: string;
    logoImageUrl?: string;
  };
  const ticketUrl = extendedEvent.ticketUrl?.trim();
  const rsvpUrl = extendedEvent.rsvpUrl?.trim();
  const websiteUrl = event.website?.trim();

  const accessUrl = ticketUrl || rsvpUrl || websiteUrl;
  const accessDestinationType = ticketUrl ? 'ticket' : rsvpUrl ? 'rsvp' : 'website';

  const attendanceText = event.tags?.find((tag) => /ticket|rsvp|member|invite|admission/i.test(tag));
  const eventAddress = getListingPhysicalAddress(event);
  const eventDisplayCoords = getListingDisplayCoords(event) ?? { lat: event.geopoint.latitude, lng: event.geopoint.longitude };
  const city = eventAddress.city ?? '';
  const region = eventAddress.region ?? '';
  const locationForCalendar = isPrivateLocation
    ? 'Private location / disclosed after RSVP'
    : [city, region].filter(Boolean).join(', ') || event.location || 'Location TBD';

  return (
    <>
      <EventPageAdminEditor event={event} isMockRoute={isMockRoute} />
      {!isMockRoute ? (
        <EventQuickEditPanel
          key={`${event.id}-${quickEditField ?? 'closed'}`}
          event={event}
          field={quickEditField}
          onClose={() => setQuickEditField(null)}
          onPreview={setEventOverride}
          onSaved={setEventOverride}
        />
      ) : null}
      <EventPageLayout
      hero={
        <>
          <EventHero
            eventId={event.id}
            title={event.name}
            backgroundImageUrl={eventCoverImage}
            eventLogoUrl={eventLogoImage}
            clubLogoUrl={venueLogoImage}
            hostLogoUrl={presenterLogoUrl}
            hostName={presenterName}
            hostPath={hostPath}
            venueName={venue?.name}
            venuePath={venuePath}
            tags={event.tags}
            mediaImages={heroMediaImages}
            onQuickEdit={setQuickEditField}
          />
          <EventEssentialsSection
            timeText={timeRange}
            locationText={heroLocationText}
            venueName={venue?.name}
            attendanceText={attendanceText}
            calendarActions={
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
            }
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
              {hostPath && <Link to={hostPath} className="mt-3 inline-flex text-sm font-bold text-amber-200 hover:text-white">See upcoming events from {hostName || 'this organizer'} →</Link>}
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
                  return (
                    <Link
                      key={occurrence.id}
                      to={getEventCanonicalPath(occurrence, index)}
                      className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 transition hover:border-amber-300/40 hover:bg-amber-300/[0.06]"
                    >
                      <div className="font-bold text-white">{occurrence.occurrenceTitle || occurrence.name}</div>
                      <div className="mt-1 text-sm text-amber-200">{occurrenceDate}</div>
                      <div className="mt-1 truncate text-xs text-gray-400">
                        {[occurrenceAddress.city, occurrenceAddress.region].filter(Boolean).join(', ')}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}
          <div className="space-y-6 lg:hidden">
            <EventFlyerCard eventName={event.name} flyerAsset={eventFlyerAsset} onQuickEdit={() => setQuickEditField('flyer')} />
            <EventMapCard
              eventId={event.id}
              eventName={event.name}
              city={city}
              region={region}
              lat={eventDisplayCoords.lat}
              lng={eventDisplayCoords.lng}
              isPrivateLocation={isPrivateLocation}
              organizationId={event.organizerOrganizationId}
              eventSeriesId={event.eventSeriesId}
              placementPrefix="event_page_mobile_directions"
            />
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
            hostLogoUrl={organizerOrganization?.logoImageUrl}
            hostHeroUrl={presenterHeroUrl}
            hostBio={presenterBio}
          />
          <EventFeedbackSection event={event} />
        </>
      }
      rail={
        <>
          <EventFlyerCard eventName={event.name} flyerAsset={eventFlyerAsset} onQuickEdit={() => setQuickEditField('flyer')} />
          <EventMapCard
            eventId={event.id}
            eventName={event.name}
            city={city}
            region={region}
            lat={eventDisplayCoords.lat}
            lng={eventDisplayCoords.lng}
            isPrivateLocation={isPrivateLocation}
            organizationId={event.organizerOrganizationId}
            eventSeriesId={event.eventSeriesId}
            placementPrefix="event_page_rail_directions"
          />
          <EventAccessCard
            eventId={event.id}
            accessUrl={accessUrl}
            accessDestinationType={accessDestinationType}
            contactEmail={event.contactEmail}
            organizationId={event.organizerOrganizationId}
            eventSeriesId={event.eventSeriesId}
            placement="event_page_rail_access"
          />
        </>
      }
      />
    </>
  );
};

export default EventPage;
