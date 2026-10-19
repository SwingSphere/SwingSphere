import React, { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useEntityIndex } from '../../hooks/useEntityIndex';
import { getClubCanonicalPath, getEventCanonicalPath } from '../../lib/entityUtils';
import { getClubForOrganization } from '../../lib/entityCompatibility';
import { isPastEvent } from '../../lib/eventLifecycle';
import EntityPageShell from '../entity/EntityPageShell';
import HeroContainer from '../entity/HeroContainer';
import { DetailContextNav } from '../navigation/DetailContextNav';
import { hasStreetViewForListing } from '../../lib/streetViewAvailability';
import DescriptionSection from '../entity/DescriptionSection';
import { resolveEntityHeroCrop } from '../../lib/media/heroCrop';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';
import { usePublicEditAccess } from '../admin-edit/usePublicEditAccess';
import Seo from '../Seo';

const VenuePageAdminEditor = React.lazy(() => import('../admin-edit/VenuePageAdminEditor'));

const VenuePage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const {
    index,
    listings,
    venues,
    organizations,
    organizationVenueRelationships,
    isLoading,
    error,
  } = useEntityIndex();
  const venue = slug ? index?.venuesBySlug.get(slug) ?? null : null;
  const relationships = venue ? index?.relationshipsByVenueId.get(venue.id) ?? [] : [];
  const events = useMemo(
    () => (venue ? (index?.eventsByVenueId.get(venue.id) ?? []).filter((e) => e.status === 'approved') : []),
    [index, venue],
  );
  const upcomingEvents = useMemo(
    () =>
      events
        .filter((event) => !isPastEvent(event))
        .sort((a, b) => new Date(a.time.start).getTime() - new Date(b.time.start).getTime()),
    [events],
  );
  const pastEvents = useMemo(
    () =>
      events
        .filter((event) => isPastEvent(event))
        .sort((a, b) => new Date(b.time.start).getTime() - new Date(a.time.start).getTime()),
    [events],
  );
  const { registerPublicPage, clearPublicPage } = useAdminEditMode();
  const { canEdit } = usePublicEditAccess({
    organizationIds: relationships.map((relationship) => relationship.organizationId),
  });

  useEffect(() => {
    if (!venue) return;
    registerPublicPage({
      entityId: venue.id,
      entityType: 'venue',
      label: venue.name,
      canEdit,
      supportsInlineQuickEdit: false,
    });
    return () => clearPublicPage(venue.id);
  }, [canEdit, clearPublicPage, registerPublicPage, venue]);

  if (isLoading && !venue) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
        Loading venue...
      </div>
    );
  }

  if (error || !index || !venue || venue.status !== 'approved') {
    return (
      <>
        <Seo
          title="Venue Not Found | SwingSphere"
          description="The requested venue could not be found on SwingSphere."
          canonicalPath={window.location.pathname}
          noIndex
        />
        <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
          Venue not found.
        </div>
      </>
    );
  }

  const cityLine = [venue.address.city, venue.address.region].filter(Boolean).join(', ');
  const visibleLocation = venue.visibility === 'private'
    ? 'Private location / disclosed after RSVP'
    : cityLine || venue.address.country || 'Location TBD';

  const linkedOrganizations = relationships
    .map((relationship) => ({
      relationship,
      organization: index.organizationsById.get(relationship.organizationId) ?? null,
    }))
    .filter((entry) => entry.organization);

  return (
    <>
      <Seo
        title={`${venue.name} | Lifestyle Venue | SwingSphere`}
        description={venue.description || `Explore ${venue.name} on SwingSphere. Location, amenities, and hosted lifestyle events.`}
        canonicalPath={`/venues/${venue.slug}`}
        imageUrl={venue.headerImageUrl || venue.logoImageUrl}
        imageAlt={`${venue.name} venue`}
        noIndex={true}
        robots="noindex, follow"
      />
      {canEdit ? (
        <React.Suspense fallback={null}>
          <VenuePageAdminEditor
            venue={venue}
            venues={venues}
            organizations={organizations}
            relationships={organizationVenueRelationships}
            listings={listings}
            entityIndex={index}
            canEdit={canEdit}
          />
        </React.Suspense>
      ) : null}
      <EntityPageShell
        contextNav={
          <DetailContextNav
            breadcrumbs={[
              { label: 'Directory', href: '/discover' },
              { label: 'Venues', href: '/discover' },
              { label: venue.name },
            ]}
            listingId={venue.primaryClubId || venue.id}
            streetViewAvailable={hasStreetViewForListing(venue.id) || hasStreetViewForListing(venue.primaryClubId)}
          />
        }
        hero={
        <HeroContainer
          title={venue.name}
          imageUrl={venue.headerImageUrl}
          heroCrop={resolveEntityHeroCrop(venue)}
        >
          {venue.logoImageUrl ? (
            <div className="absolute left-4 top-4 z-20 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-black/45 shadow-lg backdrop-blur-sm sm:left-6 sm:top-6 sm:h-24 sm:w-24">
              <img src={venue.logoImageUrl} alt={`${venue.name} logo`} className="h-full w-full object-contain" />
            </div>
          ) : null}
          <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-5 pt-16 sm:px-6 sm:pb-6 [text-shadow:0_2px_8px_rgba(0,0,0,0.95)]">
            <span className="inline-flex rounded-full border border-red-400/30 bg-red-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-red-200 backdrop-blur-md">
              Venue
            </span>
            <h1 className="mt-2.5 text-2xl font-bold text-white sm:text-4xl lg:text-5xl">{venue.name}</h1>
            <p className="mt-2 text-sm text-gray-200">{visibleLocation}</p>
          </div>
        </HeroContainer>
      }
      main={
        <>
          <DescriptionSection
            title="Venue Notes"
            content={venue.description}
            emptyLabel="No venue notes yet."
          />
          <section className="rounded-xl border border-gray-800 bg-gray-900/70 p-4">
            <h2 className="text-lg font-semibold text-gray-100">Upcoming Events</h2>
            <div className="mt-3 space-y-2">
              {upcomingEvents.length ? upcomingEvents.map((event) => (
                <Link
                  key={event.id}
                  to={getEventCanonicalPath(event, index)}
                  className="block rounded-lg border border-gray-800 bg-black/20 px-3 py-2 text-sm text-gray-200 hover:border-red-500/40"
                >
                  {event.name}
                </Link>
              )) : (
                <p className="text-sm text-gray-500">No upcoming events scheduled.</p>
              )}
            </div>
          </section>
          {pastEvents.length ? (
            <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-400">Past Events</h2>
              <div className="mt-3 space-y-2">
                {pastEvents.map((event) => (
                  <Link
                    key={event.id}
                    to={getEventCanonicalPath(event, index)}
                    className="block rounded-lg border border-gray-800/80 bg-black/15 px-3 py-2 text-sm text-gray-400 hover:border-gray-700 hover:text-gray-200"
                  >
                    {event.name}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </>
      }
      aside={
        <section className="rounded-xl border border-gray-800 bg-gray-900/70 p-4">
          <h2 className="text-lg font-semibold text-gray-100">Linked Clubs & Hosts</h2>
          <div className="mt-3 space-y-2">
            {linkedOrganizations.length ? linkedOrganizations.map(({ relationship, organization }) => {
              const linkedClub = organization ? getClubForOrganization(organization, { listings }) : null;
              const href = linkedClub ? getClubCanonicalPath(linkedClub, index) : undefined;
              const content = (
                <>
                  <span className="block text-sm text-gray-200">{organization?.name}</span>
                  <span className="block text-xs text-gray-500">{relationship.label ?? relationship.relationshipType}</span>
                </>
              );
              return href ? (
                <Link
                  key={relationship.id}
                  to={href}
                  className="block rounded-lg border border-gray-800 bg-black/20 px-3 py-2 hover:border-red-500/40"
                >
                  {content}
                </Link>
              ) : (
                <div key={relationship.id} className="rounded-lg border border-gray-800 bg-black/20 px-3 py-2">
                  {content}
                </div>
              );
            }) : (
              <p className="text-sm text-gray-500">No linked clubs or hosts yet.</p>
            )}
          </div>
        </section>
      }
      />
    </>
  );
};

export default VenuePage;
