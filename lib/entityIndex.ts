import type {
  ClubData,
  EventData,
  EventSeriesData,
  Listing,
  OrganizationData,
  OrganizationRelationship,
  OrganizationVenueRelationship,
  VenueData,
} from '../types';
import type { User } from '../data/mockUsers';
import { mockOrganizations } from '../data/mockOrganizations';
import { mockOrganizationVenueRelationships } from '../data/mockEntityRelationships';
import { mockVenues } from '../data/mockVenues';
import { eventSeries } from '../data/eventSeries';
import { organizationRelationships as defaultOrganizationRelationships } from '../data/organizationRelationships';
import {
  resolveEventOrganizerOrganizationId,
  resolveEventVenueId,
} from './entityCompatibility';
import {
  clubKey,
  eventKey,
  hostSlug,
  normalizeHostName,
} from './identityUtils';

export type HostProfile = {
  slug: string;
  name: string;
  events: EventData[];
  organization?: OrganizationData;
};

export type EntityIndex = {
  clubsByKey: Map<string, ClubData>;
  eventsByKey: Map<string, EventData>;
  clubKeyById: Map<string, string>;
  eventKeyById: Map<string, string>;
  eventVenueClubKeyById: Map<string, string>;
  eventsByVenueClubKey: Map<string, EventData[]>;
  eventsByHostSlug: Map<string, EventData[]>;
  hostsBySlug: Map<string, HostProfile>;
  venuesById: Map<string, VenueData>;
  venuesBySlug: Map<string, VenueData>;
  organizationsById: Map<string, OrganizationData>;
  organizationsBySlug: Map<string, OrganizationData>;
  relationshipsByVenueId: Map<string, OrganizationVenueRelationship[]>;
  relationshipsByOrganizationId: Map<string, OrganizationVenueRelationship[]>;
  organizationRelationshipsBySourceId: Map<string, OrganizationRelationship[]>;
  organizationRelationshipsByTargetId: Map<string, OrganizationRelationship[]>;
  eventsByVenueId: Map<string, EventData[]>;
  eventsByOrganizationId: Map<string, EventData[]>;
  eventSeriesById: Map<string, EventSeriesData>;
  eventSeriesBySlug: Map<string, EventSeriesData>;
  eventsBySeriesId: Map<string, EventData[]>;
  usersById: Map<string, User>;
};

export const buildEntityIndex = (
  listings: Listing[],
  users: User[],
  venues: VenueData[] = mockVenues,
  organizations: OrganizationData[] = mockOrganizations,
  relationships: OrganizationVenueRelationship[] = mockOrganizationVenueRelationships,
  series: EventSeriesData[] = eventSeries,
  organizationRelationships: OrganizationRelationship[] = defaultOrganizationRelationships,
): EntityIndex => {
  const clubs = listings.filter((l): l is ClubData => l.type === 'club');
  const events = listings.filter((l): l is EventData => l.type === 'event');

  const usersById = new Map(users.map((user) => [user.id, user]));
  const venuesById = new Map(venues.map((venue) => [venue.id, venue]));
  const venuesBySlug = new Map(venues.map((venue) => [venue.slug, venue]));
  const organizationsById = new Map(organizations.map((organization) => [organization.id, organization]));
  const organizationsBySlug = new Map(organizations.map((organization) => [organization.slug, organization]));
  const eventSeriesById = new Map(series.map((item) => [item.id, item]));
  const eventSeriesBySlug = new Map(series.map((item) => [item.slug, item]));
  const clubsByKey = new Map<string, ClubData>();
  const eventsByKey = new Map<string, EventData>();
  const clubKeyById = new Map<string, string>();
  const eventKeyById = new Map<string, string>();
  const eventVenueClubKeyById = new Map<string, string>();
  const eventsByVenueClubKey = new Map<string, EventData[]>();
  const eventsByHostSlug = new Map<string, EventData[]>();
  const hostsBySlug = new Map<string, HostProfile>();
  const relationshipsByVenueId = new Map<string, OrganizationVenueRelationship[]>();
  const relationshipsByOrganizationId = new Map<string, OrganizationVenueRelationship[]>();
  const organizationRelationshipsBySourceId = new Map<string, OrganizationRelationship[]>();
  const organizationRelationshipsByTargetId = new Map<string, OrganizationRelationship[]>();
  const eventsByVenueId = new Map<string, EventData[]>();
  const eventsByOrganizationId = new Map<string, EventData[]>();
  const eventsBySeriesId = new Map<string, EventData[]>();

  for (const organization of organizations) {
    if (!organization.displayTypes.some((displayType) => ['host', 'promoter', 'event_brand', 'producer', 'community'].includes(displayType))) continue;
    hostsBySlug.set(organization.slug, {
      slug: organization.slug,
      name: organization.name,
      events: [],
      organization,
    });
  }

  for (const relationship of relationships) {
    const venueRelationships = relationshipsByVenueId.get(relationship.venueId) ?? [];
    venueRelationships.push(relationship);
    relationshipsByVenueId.set(relationship.venueId, venueRelationships);

    const organizationVenueRelationships = relationshipsByOrganizationId.get(relationship.organizationId) ?? [];
    organizationVenueRelationships.push(relationship);
    relationshipsByOrganizationId.set(relationship.organizationId, organizationVenueRelationships);
  }

  for (const relationship of organizationRelationships) {
    const sourceRelationships = organizationRelationshipsBySourceId.get(relationship.sourceOrganizationId) ?? [];
    sourceRelationships.push(relationship);
    organizationRelationshipsBySourceId.set(relationship.sourceOrganizationId, sourceRelationships);

    const targetRelationships = organizationRelationshipsByTargetId.get(relationship.targetOrganizationId) ?? [];
    targetRelationships.push(relationship);
    organizationRelationshipsByTargetId.set(relationship.targetOrganizationId, targetRelationships);
  }

  for (const club of clubs) {
    const key = clubKey(club);
    clubKeyById.set(club.id, key);
    if (!clubsByKey.has(key)) clubsByKey.set(key, club);
  }

  for (const event of events) {
    // TODO(SEMv2 Phase 4): remove venueKey indexes after public routes resolve event venues by venueId.
    const venueKey = event.venueKey ?? '';
    if (venueKey) {
      eventVenueClubKeyById.set(event.id, venueKey);
      const venueEvents = eventsByVenueClubKey.get(venueKey) ?? [];
      venueEvents.push(event);
      eventsByVenueClubKey.set(venueKey, venueEvents);
    }

    const hostName = normalizeHostName(event.hostName ?? '');
    const key = eventKey(event, hostName);
    eventKeyById.set(event.id, key);
    if (!eventsByKey.has(key)) eventsByKey.set(key, event);

    if (hostName) {
      const slug = hostSlug(hostName);
      const hostEvents = eventsByHostSlug.get(slug) ?? [];
      hostEvents.push(event);
      eventsByHostSlug.set(slug, hostEvents);
      if (!hostsBySlug.has(slug)) {
        hostsBySlug.set(slug, { slug, name: event.hostName, events: hostEvents });
      } else {
        const existing = hostsBySlug.get(slug);
        if (existing) {
          existing.events = hostEvents;
          if (!existing.name) existing.name = event.hostName;
        }
      }
    }

    const venueId = resolveEventVenueId(event, { listings, venues, organizations, relationships });
    if (venueId) {
      const venueEvents = eventsByVenueId.get(venueId) ?? [];
      venueEvents.push(event);
      eventsByVenueId.set(venueId, venueEvents);
    }

    if (event.eventSeriesId) {
      const seriesEvents = eventsBySeriesId.get(event.eventSeriesId) ?? [];
      seriesEvents.push(event);
      seriesEvents.sort((a, b) => new Date(a.time.start).getTime() - new Date(b.time.start).getTime());
      eventsBySeriesId.set(event.eventSeriesId, seriesEvents);
    }

    const organizationId = resolveEventOrganizerOrganizationId(event, { listings, venues, organizations, relationships });
    if (organizationId) {
      const organizationEvents = eventsByOrganizationId.get(organizationId) ?? [];
      organizationEvents.push(event);
      eventsByOrganizationId.set(organizationId, organizationEvents);
    }
  }

  return {
    clubsByKey,
    eventsByKey,
    clubKeyById,
    eventKeyById,
    eventVenueClubKeyById,
    eventsByVenueClubKey,
    eventsByHostSlug,
    hostsBySlug,
    venuesById,
    venuesBySlug,
    organizationsById,
    organizationsBySlug,
    relationshipsByVenueId,
    relationshipsByOrganizationId,
    organizationRelationshipsBySourceId,
    organizationRelationshipsByTargetId,
    eventsByVenueId,
    eventsByOrganizationId,
    eventSeriesById,
    eventSeriesBySlug,
    eventsBySeriesId,
    usersById,
  };
};
