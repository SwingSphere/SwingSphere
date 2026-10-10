import { startTransition, useEffect, useState } from 'react';
import type { EntityIndex } from '../lib/entityIndex';
import type { EventSeriesData, Listing, OrganizationData, OrganizationRelationship, OrganizationVenueRelationship, VenueData } from '../types';
import type { User } from '../data/mockUsers';

type EntityIndexSnapshot = {
  index: EntityIndex;
  listings: Listing[];
  users: User[];
  venues: VenueData[];
  eventSeries: EventSeriesData[];
  organizations: OrganizationData[];
  organizationVenueRelationships: OrganizationVenueRelationship[];
  organizationRelationships: OrganizationRelationship[];
  signature: string;
  isRemoteHydrated: boolean;
  fetchedAt: number;
};

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

const REMOTE_CACHE_TTL_MS = 60_000;
let cachedSnapshot: EntityIndexSnapshot | null = null;
let inFlightRemotePromise: Promise<EntityIndexSnapshot> | null = null;
let modulesPromise: Promise<[typeof import('../lib/entityIndex'), typeof import('../lib/api')]> | null = null;
let mutationSubscriptionInitialized = false;
const snapshotListeners = new Set<(snapshot: EntityIndexSnapshot) => void>();

const buildCatalogSignature = (
  listings: Listing[],
  users: User[],
  venues: VenueData[],
  organizations: OrganizationData[],
  eventSeries: EventSeriesData[],
  relationships: OrganizationVenueRelationship[],
  orgRelationships: OrganizationRelationship[],
): string => {
  const listingSig = listings
    .map(
      (l) =>
        `${l.id}:${l.status}:${l.name}:${l.primaryImageUrl ?? ''}:${
          (l as { flyerImageUrl?: string }).flyerImageUrl ?? ''
        }:${(l as { logoImageUrl?: string }).logoImageUrl ?? ''}`,
    )
    .join('|');
  const venueSig = venues
    .map((v) => `${v.id}:${v.name}:${v.logoImageUrl ?? ''}:${v.headerImageUrl ?? ''}`)
    .join('|');
  const orgSig = organizations
    .map((o) => `${o.id}:${o.status}:${o.name}:${o.logoImageUrl ?? ''}:${o.headerImageUrl ?? ''}`)
    .join('|');
  const seriesSig = eventSeries
    .map((s) => `${s.id}:${s.name}:${s.logoImageUrl ?? ''}:${s.headerImageUrl ?? ''}`)
    .join('|');
  return `${listingSig}#${users.length}#${venueSig}#${orgSig}#${seriesSig}#${relationships.length}#${orgRelationships.length}`;
};

const loadCoreModules = () => {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import('../lib/entityIndex'),
      import('../lib/api'),
    ]);
  }
  return modulesPromise;
};

const publishSnapshot = (next: EntityIndexSnapshot) => {
  cachedSnapshot = next;
  snapshotListeners.forEach((listener) => listener(next));
};

const ensureBundledSnapshot = async (): Promise<EntityIndexSnapshot> => {
  if (cachedSnapshot) return cachedSnapshot;
  const [{ buildEntityIndex }, api] = await loadCoreModules();
  if (!mutationSubscriptionInitialized) {
    mutationSubscriptionInitialized = true;
    api.subscribeCatalogMutations(() => {
      invalidateEntityIndexCache();
    });
  }
  if (cachedSnapshot) return cachedSnapshot;

  const bundled = api.getBundledCatalogSnapshot();
  const listings = bundled.listings;
  const users: User[] = [];
  const venues = bundled.venues;
  const organizations = bundled.organizations;
  const organizationVenueRelationships = bundled.organizationVenueRelationships;
  const eventSeries: EventSeriesData[] = [];
  const organizationRelationships: OrganizationRelationship[] = [];

  const initial: EntityIndexSnapshot = {
    index: buildEntityIndex(
      listings,
      users,
      venues,
      organizations,
      organizationVenueRelationships,
      eventSeries,
      organizationRelationships,
    ),
    listings,
    users,
    venues,
    eventSeries,
    organizations,
    organizationVenueRelationships,
    organizationRelationships,
    signature: buildCatalogSignature(
      listings,
      users,
      venues,
      organizations,
      eventSeries,
      organizationVenueRelationships,
      organizationRelationships,
    ),
    isRemoteHydrated: false,
    fetchedAt: 0,
  };

  publishSnapshot(initial);
  return initial;
};

const fetchRemoteSnapshot = async (): Promise<EntityIndexSnapshot> => {
  if (inFlightRemotePromise) return inFlightRemotePromise;

  inFlightRemotePromise = (async () => {
    const [{ buildEntityIndex }, api] = await loadCoreModules();
    const prev = await ensureBundledSnapshot();

    const [
      listingsResult,
      usersResult,
      venuesResult,
      eventSeriesResult,
      organizationsResult,
      relationshipsResult,
      organizationRelationshipsResult,
    ] = await Promise.allSettled([
      api.getListings(),
      api.getUsers(),
      api.getVenues(),
      api.getEventSeries(),
      api.getOrganizations(),
      api.getOrganizationVenueRelationships(),
      api.getOrganizationRelationships(),
    ]);

    if (listingsResult.status === 'rejected') throw listingsResult.reason;

    const nextListings = listingsResult.value;
    const nextUsers = usersResult.status === 'fulfilled' ? usersResult.value : prev.users;
    const nextVenues =
      venuesResult.status === 'fulfilled' && venuesResult.value.length > 0 ? venuesResult.value : prev.venues;
    const nextEventSeries = eventSeriesResult.status === 'fulfilled' ? eventSeriesResult.value : prev.eventSeries;
    const nextOrganizations = organizationsResult.status === 'fulfilled' ? organizationsResult.value : prev.organizations;
    const nextRelationships =
      relationshipsResult.status === 'fulfilled' && relationshipsResult.value.length > 0
        ? relationshipsResult.value
        : prev.organizationVenueRelationships;
    const nextOrganizationRelationships = organizationRelationshipsResult.status === 'fulfilled'
      ? organizationRelationshipsResult.value
      : prev.organizationRelationships;

    const nextSignature = buildCatalogSignature(
      nextListings,
      nextUsers,
      nextVenues,
      nextOrganizations,
      nextEventSeries,
      nextRelationships,
      nextOrganizationRelationships,
    );

    if (nextSignature === prev.signature) {
      prev.isRemoteHydrated = true;
      prev.fetchedAt = Date.now();
      return prev;
    }

    const nextSnapshot: EntityIndexSnapshot = {
      index: buildEntityIndex(
        nextListings,
        nextUsers,
        nextVenues,
        nextOrganizations,
        nextRelationships,
        nextEventSeries,
        nextOrganizationRelationships,
      ),
      listings: nextListings,
      users: nextUsers,
      venues: nextVenues,
      eventSeries: nextEventSeries,
      organizations: nextOrganizations,
      organizationVenueRelationships: nextRelationships,
      organizationRelationships: nextOrganizationRelationships,
      signature: nextSignature,
      isRemoteHydrated: true,
      fetchedAt: Date.now(),
    };

    publishSnapshot(nextSnapshot);
    return nextSnapshot;
  })().finally(() => {
    inFlightRemotePromise = null;
  });

  return inFlightRemotePromise;
};

export const invalidateEntityIndexCache = () => {
  cachedSnapshot = null;
  void ensureBundledSnapshot()
    .then(() => fetchRemoteSnapshot())
    .catch(() => {
      // Keep bundled snapshot on background refresh failure.
    });
};

export const useEntityIndex = (): EntityIndexState => {
  const [snapshot, setSnapshot] = useState<EntityIndexSnapshot | null>(() => cachedSnapshot);
  const [isLoading, setIsLoading] = useState<boolean>(() => !cachedSnapshot);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const handleSnapshot = (next: EntityIndexSnapshot) => {
      if (!active) return;
      startTransition(() => {
        setSnapshot((prev) => (prev?.signature === next.signature ? prev : next));
        setIsLoading(false);
      });
    };
    snapshotListeners.add(handleSnapshot);

    const current = cachedSnapshot;
    const isFreshRemote = Boolean(
      current?.isRemoteHydrated && Date.now() - current.fetchedAt < REMOTE_CACHE_TTL_MS,
    );

    if (current) {
      setSnapshot((prev) => (prev?.signature === current.signature ? prev : current));
      setIsLoading(false);
    }

    if (!isFreshRemote) {
      ensureBundledSnapshot()
        .then((bundled) => {
          if (active && !cachedSnapshot?.isRemoteHydrated) {
            setSnapshot((prev) => (prev?.signature === bundled.signature ? prev : bundled));
            setIsLoading(false);
          }
          return fetchRemoteSnapshot();
        })
        .then((remote) => {
          if (!active) return;
          startTransition(() => {
            setSnapshot((prev) => (prev?.signature === remote.signature ? prev : remote));
            setError(null);
          });
        })
        .catch((err) => {
          if (!active) return;
          if (!cachedSnapshot) {
            setError(err instanceof Error ? err.message : 'Failed to load listings.');
          }
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    }

    return () => {
      active = false;
      snapshotListeners.delete(handleSnapshot);
    };
  }, []);

  return {
    index: snapshot?.index ?? null,
    listings: snapshot?.listings ?? [],
    users: snapshot?.users ?? [],
    venues: snapshot?.venues ?? [],
    eventSeries: snapshot?.eventSeries ?? [],
    organizations: snapshot?.organizations ?? [],
    organizationVenueRelationships: snapshot?.organizationVenueRelationships ?? [],
    organizationRelationships: snapshot?.organizationRelationships ?? [],
    isLoading,
    error,
  };
};

