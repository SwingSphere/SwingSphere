import React, { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useEntityIndex } from '../../hooks/useEntityIndex';
import { getClubCanonicalPath, getEventCanonicalPath } from '../../lib/entityUtils';
import { getClubForOrganization } from '../../lib/entityCompatibility';
import { isPastEvent } from '../../lib/eventLifecycle';
import EntityPageShell from '../entity/EntityPageShell';
import { DetailContextNav } from '../navigation/DetailContextNav';
import { hasStreetViewForListing } from '../../lib/streetViewAvailability';
import DescriptionSection from '../entity/DescriptionSection';
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
        <section className="pt-10">
          <div className="rounded-2xl border border-gray-800 bg-gray-950/80 p-6 sm:p-8">
            <p className="text-xs uppercase tracking-[0.24em] text-red-300/80">Venue</p>
            <h1 className="mt-3 text-3xl font-semibold text-gray-100 sm:text-5xl">{venue.name}</h1>
            <p className="mt-3 text-sm text-gray-400">{visibleLocation}</p>
          </div>
        </section>
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
