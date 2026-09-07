import { useEffect, useState } from 'react';
import type { EntityIndex } from '../lib/entityIndex';
import type { EventSeriesData, Listing, OrganizationData, OrganizationRelationship, OrganizationVenueRelationship, VenueData } from '../types';
import type { User } from '../data/mockUsers';

type EntityIndexState = {
  index: EntityIndex | null;
  listings: Listing[];
  users: User[];
  venues: VenueData[];
  eventSeries: EventSeriesData[];
  organizations: OrganizationData[];
  organizationVenueRelationships: OrganizationVenueRelationship[];
  organizationRelationships: OrganizationRelationship[];
  isLoading: boolean;
  error: string | null;
};

export const useEntityIndex = (): EntityIndexState => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [venues, setVenues] = useState<VenueData[]>([]);
  const [eventSeries, setEventSeries] = useState<EventSeriesData[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationData[]>([]);
  const [organizationVenueRelationships, setOrganizationVenueRelationships] = useState<OrganizationVenueRelationship[]>([]);
  const [organizationRelationships, setOrganizationRelationships] = useState<OrganizationRelationship[]>([]);
  const [index, setIndex] = useState<EntityIndex | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [{ buildEntityIndex }, api] = await Promise.all([
          import('../lib/entityIndex'),
          import('../lib/api'),
        ]);
        const [listingsResult, usersResult, venuesResult, eventSeriesResult, organizationsResult, relationshipsResult, organizationRelationshipsResult] = await Promise.allSettled([
          api.getListings(),
          api.getUsers(),
          api.getVenues(),
          api.getEventSeries(),
          api.getOrganizations(),
          api.getOrganizationVenueRelationships(),
          api.getOrganizationRelationships(),
        ]);
        if (listingsResult.status === 'rejected') throw listingsResult.reason;
        if (!active) return;
        setListings(listingsResult.value);
        setUsers(usersResult.status === 'fulfilled' ? usersResult.value : []);
        setVenues(venuesResult.status === 'fulfilled' ? venuesResult.value : []);
        setEventSeries(eventSeriesResult.status === 'fulfilled' ? eventSeriesResult.value : []);
        setOrganizations(organizationsResult.status === 'fulfilled' ? organizationsResult.value : []);
        setOrganizationVenueRelationships(relationshipsResult.status === 'fulfilled' ? relationshipsResult.value : []);
        const nextUsers = usersResult.status === 'fulfilled' ? usersResult.value : [];
        const nextVenues = venuesResult.status === 'fulfilled' ? venuesResult.value : [];
        const nextEventSeries = eventSeriesResult.status === 'fulfilled' ? eventSeriesResult.value : [];
        const nextOrganizations = organizationsResult.status === 'fulfilled' ? organizationsResult.value : [];
        const nextRelationships = relationshipsResult.status === 'fulfilled' ? relationshipsResult.value : [];
        const nextOrganizationRelationships = organizationRelationshipsResult.status === 'fulfilled' ? organizationRelationshipsResult.value : [];
        setOrganizationRelationships(nextOrganizationRelationships);
        setIndex(buildEntityIndex(
          listingsResult.value,
          nextUsers,
          nextVenues,
          nextOrganizations,
          nextRelationships,
          nextEventSeries,
          nextOrganizationRelationships,
        ));
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load listings.');
      } finally {
        if (active) setIsLoading(false);
      }
    };
    fetchData();
    return () => {
      active = false;
    };
  }, []);

  return {
    index,
    listings,
    users,
    venues,
    eventSeries,
    organizations,
    organizationVenueRelationships,
    organizationRelationships,
    isLoading,
    error,
  };
};
