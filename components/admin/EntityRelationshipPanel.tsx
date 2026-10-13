import React from 'react';
import type {
  BuildingAsset,
  ClubBrandData,
  ClubData,
  EventData,
  EventSeriesData,
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
import { getCanonicalMediaSignature } from '../../lib/entityBrandMedia';

type EntityRelationshipPanelProps =
  | {
      entityType: 'club';
      entity: ClubData;
      index: EntityIndex | null;
      listings: Listing[];
      venues: VenueData[];
      organizations: OrganizationData[];
      clubBrands?: ClubBrandData[];
      eventSeries?: EventSeriesData[];
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
      clubBrands?: ClubBrandData[];
      eventSeries?: EventSeriesData[];
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
      clubBrands?: ClubBrandData[];
      eventSeries?: EventSeriesData[];
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

const IntegrityWarningsBanner = ({ warnings }: { warnings: string[] }) => {
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
      <div className="text-xs font-bold uppercase tracking-wider text-amber-800">
        Relationship Integrity Warnings ({warnings.length})
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
        {warnings.map((warning, idx) => (
          <li key={idx}>{warning}</li>
        ))}
      </ul>
    </div>
  );
};

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
    eventSeries: props.eventSeries,
  };

  if (props.entityType === 'club') {
    const venue = getPrimaryVenueForClub(props.entity, collections);
    const events = venue ? props.index.eventsByVenueId.get(venue.id) ?? [] : [];
    const asset = getBuildingAssetForListing(props.entity, props.buildingAssets, collections);
    const warnings: string[] = [];

    if (!props.entity.ownerOrganizationId) {
      warnings.push('Club has no linked owner/operator organization (ownerOrganizationId).');
    } else if (props.organizations.length > 0 && !props.organizations.some((org) => org.id === props.entity.ownerOrganizationId)) {
      warnings.push(`Linked ownerOrganizationId "${props.entity.ownerOrganizationId}" does not match any organization in the catalog.`);
    } else {
      const ownerOrg = props.organizations.find((org) => org.id === props.entity.ownerOrganizationId);
      const ownedClubsCount = props.listings.filter(
        (item): item is ClubData => item.type === 'club' && item.ownerOrganizationId === props.entity.ownerOrganizationId,
      ).length;
      if (
        ownerOrg
        && ownedClubsCount === 1
        && !props.entity.clubBrandId
        && props.entity.logoImageUrl
        && ownerOrg.logoImageUrl
        && getCanonicalMediaSignature(props.entity.logoImageUrl) !== getCanonicalMediaSignature(ownerOrg.logoImageUrl)
      ) {
        warnings.push(`Club logo and owner organization (${ownerOrg.name}) logo differ. Saving this club will synchronize its canonical logo.`);
      }
    }

    if (!props.entity.primaryVenueId && !venue) {
      warnings.push('Club has no linked primary venue (primaryVenueId).');
    } else if (props.entity.primaryVenueId && props.venues.length > 0 && !props.venues.some((v) => v.id === props.entity.primaryVenueId)) {
      warnings.push(`Linked primaryVenueId "${props.entity.primaryVenueId}" does not match any venue in the catalog.`);
    }

    if (props.entity.clubBrandId && props.clubBrands && props.clubBrands.length > 0 && !props.clubBrands.some((b) => b.id === props.entity.clubBrandId)) {
      warnings.push(`Linked clubBrandId "${props.entity.clubBrandId}" does not match any club brand in the catalog.`);
    }

    return (
      <div className="space-y-4">
        <IntegrityWarningsBanner warnings={warnings} />
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
      </div>
    );
  }

  if (props.entityType === 'event') {
    const venue = getVenueForEvent(props.entity, collections);
    const organizer = props.entity.organizerOrganizationId
      ? props.index.organizationsById.get(props.entity.organizerOrganizationId) ?? null
      : getOrganizationForEvent(props.entity, collections);
    const linkedSeries = props.entity.eventSeriesId
      ? (props.eventSeries ?? []).find((series) => series.id === props.entity.eventSeriesId)
      : undefined;
    const warnings: string[] = [];

    if (props.entity.organizerOrganizationId && props.organizations.length > 0 && !props.organizations.some((org) => org.id === props.entity.organizerOrganizationId)) {
      warnings.push(`Explicit organizerOrganizationId "${props.entity.organizerOrganizationId}" does not exist in the organization catalog.`);
    } else if (!props.entity.organizerOrganizationId && organizer) {
      warnings.push(`Organizer "${organizer.name}" (${organizer.id}) is currently inferred at runtime rather than explicitly stored on organizerOrganizationId.`);
    } else if (!props.entity.organizerOrganizationId && !organizer) {
      warnings.push('Event has no resolved canonical organizer organization. Select an Organizer / Host organization so this event is discoverable on its host page.');
    }

    if (props.entity.venueId && props.venues.length > 0 && !props.venues.some((v) => v.id === props.entity.venueId)) {
      warnings.push(`Explicit venueId "${props.entity.venueId}" does not exist in the venue catalog.`);
    }

    if (props.entity.eventSeriesId && props.eventSeries && props.eventSeries.length > 0 && !linkedSeries) {
      warnings.push(`Explicit eventSeriesId "${props.entity.eventSeriesId}" does not exist in the event series catalog.`);
    }

    if (props.entity.isAddressPrivate && venue && venue.visibility === 'public_exact') {
      warnings.push(`Privacy notice: Event is marked Private Address, but is linked to a public_exact venue (${venue.name}). Public event pages will protect the street address while keeping the venue relationship internal.`);
    }

    return (
      <div className="space-y-4">
        <IntegrityWarningsBanner warnings={warnings} />
        <div className="grid gap-4 md:grid-cols-3">
          <RelationshipGroup title="Venue">
            {venue ? <ItemLine title={venue.name} meta={venue.visibility.replace('_', ' ')} /> : <EmptyLine>No venue linked.</EmptyLine>}
          </RelationshipGroup>
          <RelationshipGroup title="Organizer">
            {organizer ? <ItemLine title={organizer.name} meta={organizer.displayTypes.join(', ')} /> : <EmptyLine>No organizer linked.</EmptyLine>}
          </RelationshipGroup>
          <RelationshipGroup title="Event Series">
            {linkedSeries ? <ItemLine title={linkedSeries.name} meta={linkedSeries.slug} /> : <EmptyLine>Standalone event (no series).</EmptyLine>}
          </RelationshipGroup>
        </div>
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
  const venueWarnings: string[] = [];
  if (residentClubs.length === 0 && guestHosts.length === 0 && events.length === 0) {
    venueWarnings.push('Orphaned venue: No resident clubs, guest hosts, or events are currently linked to this venue.');
  }
  if (props.entity.visibility === 'private' && residentClubs.length > 0) {
    venueWarnings.push('Visibility warning: Venue visibility is set to private, but it has a linked resident club.');
  }

  return (
    <div className="space-y-4">
      <IntegrityWarningsBanner warnings={venueWarnings} />
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
    </div>
  );
};

export default EntityRelationshipPanel;
