import { useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api';
import { buildEntityIndex, EntityIndex } from '../lib/entityIndex';
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setIsLoading(true);
      try {
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
        setOrganizationRelationships(organizationRelationshipsResult.status === 'fulfilled' ? organizationRelationshipsResult.value : []);
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

  const index = useMemo(() => {
    if (!listings.length) return null;
    return buildEntityIndex(listings, users, venues, organizations, organizationVenueRelationships, eventSeries, organizationRelationships);
  }, [eventSeries, listings, organizationRelationships, organizationVenueRelationships, organizations, users, venues]);

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
