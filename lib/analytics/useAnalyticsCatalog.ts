import { useEffect, useState } from 'react';
import * as api from '../api';
import { buildEntityIndex } from '../entityIndex';
import type { AnalyticsCatalog } from './routeEntityResolver';

let cachedCatalog: AnalyticsCatalog | null = null;
let pendingCatalogPromise: Promise<AnalyticsCatalog> | null = null;

const loadCatalogOnce = async (): Promise<AnalyticsCatalog> => {
  if (cachedCatalog) return cachedCatalog;
  if (pendingCatalogPromise) return pendingCatalogPromise;

  pendingCatalogPromise = (async () => {
    const [
      listings,
      venues,
      organizations,
      eventSeries,
      clubBrands,
      resorts,
      cruiseSeries,
      cruiseSailings,
      venueRelationships,
      organizationRelationships,
    ] = await Promise.all([
      api.getListings().catch(() => []),
      api.getVenues().catch(() => []),
      api.getOrganizations().catch(() => []),
      api.getEventSeries().catch(() => []),
      api.getClubBrands().catch(() => []),
      api.getResorts().catch(() => []),
      api.getCruiseSeries().catch(() => []),
      api.getCruiseSailings().catch(() => []),
      api.getOrganizationVenueRelationships().catch(() => []),
      api.getOrganizationRelationships().catch(() => []),
    ]);

    const entityIndex = listings.length
      ? buildEntityIndex(
          listings,
          [],
          venues,
          organizations,
          venueRelationships,
          eventSeries,
          organizationRelationships,
        )
      : null;

    const built: AnalyticsCatalog = {
      listings,
      venues,
      organizations,
      eventSeries,
      clubBrands,
      resorts,
      cruiseSeries,
      cruiseSailings,
      entityIndex,
    };
    cachedCatalog = built;
    return built;
  })();

  try {
    return await pendingCatalogPromise;
  } finally {
    pendingCatalogPromise = null;
  }
};

export const useAnalyticsCatalog = (passedCatalog?: AnalyticsCatalog | null): AnalyticsCatalog | null => {
  const [catalog, setCatalog] = useState<AnalyticsCatalog | null>(passedCatalog ?? cachedCatalog);

  useEffect(() => {
    if (passedCatalog) {
      cachedCatalog = passedCatalog;
      setCatalog(passedCatalog);
      return;
    }
    if (cachedCatalog) {
      setCatalog(cachedCatalog);
      return;
    }
    let cancelled = false;
    void loadCatalogOnce().then((loaded) => {
      if (!cancelled) setCatalog(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [passedCatalog]);

  return passedCatalog ?? catalog;
};
