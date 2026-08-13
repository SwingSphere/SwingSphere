import React from 'react';
import type {
  BuildingAsset,
  ClubData,
  EventData,
  Listing,
  OrganizationData,
  OrganizationVenueRelationship,
  VenueData,
} from '../../types';
import type { EntityIndex } from '../../lib/entityIndex';
import {
  getBuildingAssetForListing,
  getClubForOrganization,
  getOrganizationForEvent,
  getPrimaryVenueForClub,
  getVenueForListing,
  getVenueForEvent,
} from '../../lib/entityCompatibility';

type EntityRelationshipPanelProps =
  | {
      entityType: 'club';
      entity: ClubData;
      index: EntityIndex | null;
      listings: Listing[];
      venues: VenueData[];
      organizations: OrganizationData[];
      relationships: OrganizationVenueRelationship[];
      buildingAssets: BuildingAsset[];
    }
  | {
      entityType: 'event';
      entity: EventData;
      index: EntityIndex | null;
      listings: Listing[];
      venues: VenueData[];
      organizations: OrganizationData[];
      relationships: OrganizationVenueRelationship[];
      buildingAssets: BuildingAsset[];
    }
  | {
      entityType: 'venue';
      entity: VenueData;
      index: EntityIndex | null;
      listings: Listing[];
      venues: VenueData[];
      organizations: OrganizationData[];
      relationships: OrganizationVenueRelationship[];
      buildingAssets: BuildingAsset[];
    };

const labelClass = 'text-xs font-semibold uppercase tracking-wide text-gray-500';

const RelationshipGroup = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
    <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
    <div className="mt-3 space-y-2">{children}</div>
  </div>
);

const EmptyLine = ({ children }: { children: React.ReactNode }) => (
  <div className="text-sm text-gray-500">{children}</div>
);

const ItemLine = ({
  title,
  meta,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
}) => (
  <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
    <div className="text-sm font-medium text-gray-900">{title}</div>
    {meta ? <div className="mt-0.5 text-xs text-gray-500">{meta}</div> : null}
  </div>
);

const getAssetForVenue = (
  venue: VenueData,
  listings: Listing[],
  venues: VenueData[],
  organizations: OrganizationData[],
  relationships: OrganizationVenueRelationship[],
  assets: BuildingAsset[],
): BuildingAsset | null => {
  if (venue.buildingAssetId) {
    const exact = assets.find((asset) => asset.id === venue.buildingAssetId);
    if (exact) return exact;
  }
  const venueMatch = assets.find((asset) => asset.venueId === venue.id);
  if (venueMatch) return venueMatch;
  return assets.find((asset) => {
    const listing = listings.find((candidate) => candidate.id === asset.listingId) ?? null;
    return listing ? getVenueForListing(listing, { listings, venues, organizations, relationships })?.id === venue.id : false;
  }) ?? null;
};

const EntityRelationshipPanel: React.FC<EntityRelationshipPanelProps> = (props) => {
  if (!props.index) {
    return <EmptyLine>Relationship index is loading.</EmptyLine>;
  }

  const collections = {
    listings: props.listings,
    venues: props.venues,
    organizations: props.organizations,
    relationships: props.relationships,
  };

  if (props.entityType === 'club') {
    const venue = getPrimaryVenueForClub(props.entity, collections);
    const events = venue ? props.index.eventsByVenueId.get(venue.id) ?? [] : [];
    const asset = getBuildingAssetForListing(props.entity, props.buildingAssets, collections);
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <RelationshipGroup title="Primary Venue">
          {venue ? <ItemLine title={venue.name} meta={venue.visibility.replace('_', ' ')} /> : <EmptyLine>No primary venue linked.</EmptyLine>}
        </RelationshipGroup>
        <RelationshipGroup title="Upcoming Events">
          {events.length ? events.slice(0, 6).map((event) => <ItemLine key={event.id} title={event.name} meta={new Date(event.time.start).toLocaleDateString()} />) : <EmptyLine>No linked events.</EmptyLine>}
        </RelationshipGroup>
        <RelationshipGroup title="Building Linked">
          {asset ? <ItemLine title={asset.id} meta={asset.venueId ? `Venue ${asset.venueId}` : `Legacy listing ${asset.listingId}`} /> : <EmptyLine>No building asset linked.</EmptyLine>}
        </RelationshipGroup>
      </div>
    );
  }

  if (props.entityType === 'event') {
    const venue = getVenueForEvent(props.entity, collections);
    const organizer = props.entity.organizerOrganizationId
      ? props.index.organizationsById.get(props.entity.organizerOrganizationId) ?? null
      : getOrganizationForEvent(props.entity, collections);
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <RelationshipGroup title="Venue">
          {venue ? <ItemLine title={venue.name} meta={venue.visibility.replace('_', ' ')} /> : <EmptyLine>No venue linked.</EmptyLine>}
        </RelationshipGroup>
        <RelationshipGroup title="Organizer">
          {organizer ? <ItemLine title={organizer.name} meta={organizer.displayTypes.join(', ')} /> : <EmptyLine>No organizer linked.</EmptyLine>}
        </RelationshipGroup>
      </div>
    );
  }

  const relationships = props.index.relationshipsByVenueId.get(props.entity.id) ?? [];
  const residentClubs = relationships
    .map((relationship) => {
      const org = props.index?.organizationsById.get(relationship.organizationId) ?? null;
      const club = org ? getClubForOrganization(org, collections) : null;
      return { relationship, org, club };
    })
    .filter((entry) => entry.org?.displayTypes.includes('club'));
  const guestHosts = relationships
    .map((relationship) => ({
      relationship,
      org: props.index?.organizationsById.get(relationship.organizationId) ?? null,
    }))
    .filter((entry) => entry.org && !entry.org.displayTypes.includes('club'));
  const events = props.index.eventsByVenueId.get(props.entity.id) ?? [];
  const asset = getAssetForVenue(
    props.entity,
    props.listings,
    props.venues,
    props.organizations,
    props.relationships,
    props.buildingAssets,
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <RelationshipGroup title="Resident Clubs">
        {residentClubs.length ? residentClubs.map(({ relationship, org, club }) => (
          <ItemLine key={relationship.id} title={club?.name ?? org?.name} meta={relationship.relationshipType.replace('_', ' ')} />
        )) : <EmptyLine>No resident clubs linked.</EmptyLine>}
      </RelationshipGroup>
      <RelationshipGroup title="Guest Hosts / Promoters">
        {guestHosts.length ? guestHosts.map(({ relationship, org }) => (
          <ItemLine key={relationship.id} title={org?.name} meta={relationship.relationshipType.replace('_', ' ')} />
        )) : <EmptyLine>No guest hosts linked.</EmptyLine>}
      </RelationshipGroup>
      <RelationshipGroup title="Upcoming Events">
        {events.length ? events.slice(0, 6).map((event) => <ItemLine key={event.id} title={event.name} meta={new Date(event.time.start).toLocaleDateString()} />) : <EmptyLine>No linked events.</EmptyLine>}
      </RelationshipGroup>
      <RelationshipGroup title="Building Asset">
        {asset ? (
          <div>
            <ItemLine title={asset.id} meta={asset.venueId ? 'Venue-owned' : 'Legacy listing-owned'} />
            <dl className="mt-3 grid gap-2 text-xs text-gray-600">
              <div><dt className={labelClass}>Listing fallback</dt><dd className="font-mono">{asset.listingId}</dd></div>
              <div><dt className={labelClass}>Venue ID</dt><dd className="font-mono">{asset.venueId ?? 'None'}</dd></div>
            </dl>
          </div>
        ) : <EmptyLine>No building asset linked.</EmptyLine>}
      </RelationshipGroup>
    </div>
  );
};

export default EntityRelationshipPanel;
