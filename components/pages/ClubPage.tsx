import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { invalidateEntityIndexCache, useEntityIndex } from '../../hooks/useEntityIndex';
import { hostSlug, normalizeHostName, parsePrettyKeyParam } from '../../lib/identityUtils';
import { formatEventTimeRange } from '../../lib/formatting';
import {
  getClubCanonicalPath,
  getEventCanonicalPath,
  getHostCanonicalPath,
  resolveClubFromParam,
} from '../../lib/entityUtils';
import { isPastEvent } from '../../lib/eventLifecycle';
import {
  getListingPhysicalAddress,
  getListingPhysicalCoords,
  resolveEventOrganizerOrganizationId,
} from '../../lib/entityCompatibility';
import { isApproximateLocation } from '../../lib/publicLocation';
import {
  getEventCardImageUrl,
  getListingLogoUrl,
  getListingPrimaryHeroUrl,
  isPlaceholderMediaUrl,
} from '../../lib/listingImage';
import { resolveBrandHeader, resolveBrandLogo } from '../../lib/entityBrandMedia';
import ClubDetailTemplate, { type AssociatedClubHost } from '../club/ClubDetailTemplate';
import type { ClubEventPreviewItem } from '../club/ClubEventsPreview';
import type { ClubQuickEditField } from '../admin-edit/ClubQuickEditPanel';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';
import { usePublicEditAccess } from '../admin-edit/usePublicEditAccess';
import type { EventData } from '../../types';
import Seo from '../Seo';

const ClubPageAdminEditor = React.lazy(() => import('../admin-edit/ClubPageAdminEditor'));
const ClubQuickEditPanel = React.lazy(() => import('../admin-edit/ClubQuickEditPanel'));

const ClubPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const key = parsePrettyKeyParam(slug ?? '');
  const { index, listings, venues, eventSeries, organizations, organizationVenueRelationships, isLoading, error } = useEntityIndex();

  useEffect(() => {
    invalidateEntityIndexCache({ maxAgeMs: 10_000 });
  }, [slug]);

  const resolvedLookup = useMemo(
    () => (index && slug ? resolveClubFromParam(slug, index) : null),
    [index, slug],
  );
  const resolvedClub = resolvedLookup?.club ?? null;
  const { registerPublicPage, clearPublicPage } = useAdminEditMode();
  const { canEdit } = usePublicEditAccess({
    postedByUserId: resolvedClub?.postedByUserId,
    organizationIds: [resolvedClub?.ownerOrganizationId],
  });
  const [clubOverride, setClubOverride] = useState<typeof resolvedClub>(null);
  const [quickEditField, setQuickEditField] = useState<ClubQuickEditField | null>(null);
  useEffect(() => {
    setClubOverride(null);
    setQuickEditField(null);
  }, [resolvedClub?.id]);
  useEffect(() => {
    if (!resolvedClub) return;
    registerPublicPage({
      entityId: resolvedClub.id,
      entityType: 'club',
      label: resolvedClub.name,
      canEdit,
      supportsInlineQuickEdit: true,
    });
    return () => clearPublicPage(resolvedClub.id);
  }, [canEdit, clearPublicPage, registerPublicPage, resolvedClub]);
  const club = clubOverride ?? resolvedClub;
  const presentationClub = useMemo(() => {
    if (!club) return null;
    const mediaCatalog = {
      listings,
      venues,
      organizations,
      relationships: organizationVenueRelationships,
      eventSeries,
    };
    const resolvedLogo = resolveBrandLogo('club', club.id, mediaCatalog).url;
    const resolvedHeader = resolveBrandHeader('club', club.id, mediaCatalog).url;
    return {
      ...club,
      ...(resolvedLogo && resolvedLogo !== club.logoImageUrl ? { logoImageUrl: resolvedLogo } : {}),
      ...(!club.headerImageUrl && resolvedHeader ? { headerImageUrl: resolvedHeader } : {}),
    };
  }, [club, eventSeries, listings, organizationVenueRelationships, organizations, venues]);
  const clubKey = club && index?.clubKeyById.get(club.id) ? index.clubKeyById.get(club.id)! : key;
  const ownerOrganization = club?.ownerOrganizationId
    ? index?.organizationsById.get(club.ownerOrganizationId) ?? null
    : null;
  const hasOwnerHostProfile = Boolean(
    ownerOrganization && index?.hostsBySlug.has(ownerOrganization.slug),
  );

  const { upcomingEvents, pastEvents, associatedHosts } = useMemo(() => {
    if (!club || !index) {
      return {
        upcomingEvents: [] as ClubEventPreviewItem[],
        pastEvents: [] as ClubEventPreviewItem[],
        associatedHosts: [] as AssociatedClubHost[],
      };
    }
    const venueEvents = (index.eventsByVenueClubKey.get(clubKey) ?? []).filter(
      (event) =>
        event.status === 'approved' &&
        !(event as EventData & { archivedAt?: string | null }).archivedAt,
    );
    const now = Date.now();
    const collections = {
      listings,
      venues,
      organizations,
      relationships: organizationVenueRelationships,
      eventSeries,
    };
    const normClubName = normalizeHostName(club.name);

    const mapEvent = (event: EventData): ClubEventPreviewItem => {
      const organizerId = resolveEventOrganizerOrganizationId(event, collections);
      const organizer = organizerId ? index.organizationsById.get(organizerId) : undefined;
      const organizerName = organizer?.name ?? event.hostName ?? '';
      const isThirdPartyHost =
        Boolean(organizerName) && normalizeHostName(organizerName) !== normClubName;
      const resolvedLogoUrl = getListingLogoUrl(event, index);
      const flyerUrl = getEventCardImageUrl(event, index);
      return {
        id: event.id,
        name: event.name,
        dateTime: formatEventTimeRange(event.time.start, event.time.end),
        tags: [
          ...(isThirdPartyHost ? [`Hosted by ${organizerName}`] : []),
          ...(event.tags?.includes('Couples Welcome') || event.tags?.includes('Couples Only') ? ['Couples'] : []),
          ...(event.tags?.includes('Single Women Welcome') ? ['Single women'] : []),
          ...(event.tags?.includes('Single men') || event.tags?.includes('Single Men Welcome') ? ['Single men'] : []),
          ...(event.tags?.includes('Approved Single Men Welcome') ? ['Approved single men'] : []),
        ],
        logoUrl: resolvedLogoUrl && !isPlaceholderMediaUrl(resolvedLogoUrl) ? resolvedLogoUrl : undefined,
        logoAlt: organizerName || 'Event organizer',
        flyerUrl: flyerUrl && !isPlaceholderMediaUrl(flyerUrl) ? flyerUrl : undefined,
        to: getEventCanonicalPath(event, index),
      };
    };

    const upcomingRaw = venueEvents
      .filter((event) => !isPastEvent(event, now))
      .sort((a, b) => new Date(a.time.start).getTime() - new Date(b.time.start).getTime());

    const pastRaw = venueEvents
      .filter((event) => isPastEvent(event, now))
      .sort((a, b) => new Date(b.time.start).getTime() - new Date(a.time.start).getTime());

    const hostMap = new Map<string, AssociatedClubHost>();
    for (const event of venueEvents) {
      const organizerId = resolveEventOrganizerOrganizationId(event, collections);
      const organizer = organizerId ? index.organizationsById.get(organizerId) : undefined;
      const fallbackSlug = event.hostName ? hostSlug(normalizeHostName(event.hostName)) : '';
      const targetSlug = organizer?.slug || fallbackSlug;
      if (!targetSlug || !index.hostsBySlug.has(targetSlug)) continue;
      if (hasOwnerHostProfile && ownerOrganization && targetSlug === ownerOrganization.slug) continue;

      const hostEntry = index.hostsBySlug.get(targetSlug);
      const displayName = organizer?.name || hostEntry?.name || event.hostName || targetSlug;
      const existing = hostMap.get(targetSlug);
      const eventUpcoming = !isPastEvent(event, now);
      if (existing) {
        existing.totalCount += 1;
        if (eventUpcoming) existing.upcomingCount += 1;
      } else {
        hostMap.set(targetSlug, {
          id: organizer?.id || targetSlug,
          name: displayName,
          href: getHostCanonicalPath(targetSlug),
          displayLabel: organizer?.displayTypes.includes('promoter') ? 'Promoter' : 'Host',
          upcomingCount: eventUpcoming ? 1 : 0,
          totalCount: 1,
        });
      }
    }

    const sortedHosts = Array.from(hostMap.values()).sort(
      (a, b) => b.upcomingCount - a.upcomingCount || b.totalCount - a.totalCount || a.name.localeCompare(b.name),
    );

    return {
      upcomingEvents: upcomingRaw.map(mapEvent),
      pastEvents: pastRaw.map(mapEvent),
      associatedHosts: sortedHosts,
    };
  }, [club, clubKey, eventSeries, hasOwnerHostProfile, index, listings, organizationVenueRelationships, organizations, ownerOrganization, venues]);

  if (resolvedLookup && !resolvedLookup.isCanonical) {
    return <Navigate to={resolvedLookup.canonicalPath} replace />;
  }

  if (isLoading && !club) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
        Loading club...
      </div>
    );
  }

  if (error || !index || !club) {
    return (
      <>
        <Seo
          title="Club Not Found | SwingSphere"
          description="The requested lifestyle club could not be found on SwingSphere."
          canonicalPath={window.location.pathname}
          noIndex
        />
        <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
          <div className="w-full rounded-2xl border border-white/10 bg-gray-900/70 p-8 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">Club unavailable</p>
            <h1 className="mt-2 text-2xl font-bold text-white">Club not found</h1>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              This club listing may have been removed or its URL may have changed.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/discover?type=clubs"
                className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-red-500"
              >
                Explore clubs
              </Link>
              <Link
                to="/discover"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-gray-200 transition hover:border-white/25 hover:text-white"
              >
                Open directory
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const canonicalPath = resolvedLookup?.canonicalPath ?? getClubCanonicalPath(club, index);
  const canonicalUrl = `https://swingsphere.co${canonicalPath}`;
  const clubAddr = getListingPhysicalAddress(club);
  const clubCity = clubAddr.city ?? '';
  const clubRegion = clubAddr.region ?? '';
  const clubCountry = clubAddr.country ?? '';
  const isApprox = isApproximateLocation(club) || Boolean((club as { isPrivateLocation?: boolean }).isPrivateLocation);
  const coords = !isApprox ? getListingPhysicalCoords(club) : null;
  const heroImageUrl = getListingPrimaryHeroUrl(presentationClub ?? club);

  const structuredData: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NightClub',
    '@id': canonicalUrl,
    name: club.name,
    description: club.description_short || `Explore ${club.name} on SwingSphere.`,
    url: canonicalUrl,
    ...(heroImageUrl ? { image: heroImageUrl } : {}),
    address: {
      '@type': 'PostalAddress',
      ...(!isApprox && clubAddr.street ? { streetAddress: clubAddr.street } : {}),
      ...(clubCity ? { addressLocality: clubCity } : {}),
      ...(clubRegion ? { addressRegion: clubRegion } : {}),
      ...(!isApprox && clubAddr.postalCode ? { postalCode: clubAddr.postalCode } : {}),
      ...(clubCountry ? { addressCountry: clubCountry } : {}),
    },
    ...(coords
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: coords.lat,
            longitude: coords.lng,
          },
        }
      : {}),
    ...(club.website ? { sameAs: [club.website] } : {}),
  };

  return (
    <>
      <Seo
        title={`${club.name}${clubCity ? ` — Lifestyle Club in ${clubCity}` : ' | Lifestyle Club'} | SwingSphere`}
        description={
          club.description_short ||
          `Explore ${club.name} on SwingSphere. View club details, schedule, upcoming events, access information, and location details.`
        }
        canonicalPath={canonicalPath}
        imageUrl={heroImageUrl}
        imageAlt={`${club.name}${clubCity ? ` in ${clubCity}` : ''} on SwingSphere`}
        structuredData={structuredData}
      />
      {canEdit && quickEditField ? (
        <React.Suspense fallback={null}>
          <ClubQuickEditPanel
            key={`${club.id}-${quickEditField}`}
            club={presentationClub ?? club}
            field={quickEditField}
            onClose={() => setQuickEditField(null)}
            onPreview={setClubOverride}
            onSaved={setClubOverride}
          />
        </React.Suspense>
      ) : null}
      <ClubDetailTemplate
        club={presentationClub ?? club}
        clubKey={clubKey}
        upcomingEvents={upcomingEvents}
        pastEvents={pastEvents}
        ownerOrganization={ownerOrganization && hasOwnerHostProfile ? {
          name: ownerOrganization.name,
          href: getHostCanonicalPath(ownerOrganization.slug),
          displayLabel: ownerOrganization.displayTypes.includes('promoter') ? 'Promoter' : 'Host',
        } : undefined}
        associatedHosts={associatedHosts}
        onQuickEdit={setQuickEditField}
        onEditLocation={() => navigate(`/submission/${encodeURIComponent(club.id)}?section=location&returnTo=${encodeURIComponent(canonicalPath)}`)}
      />
      {canEdit ? (
        <React.Suspense fallback={null}>
          <ClubPageAdminEditor club={club} />
        </React.Suspense>
      ) : null}
    </>
  );
};

export default ClubPage;
