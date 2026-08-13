import type { OrganizationData } from '../types';
import type { GlobeV1RuntimeEvent } from '../data/globeV1MockData';
import type { DiscoveryPoint } from './discoveryPointAdapter';
import { resolveCountryIsoCodes } from './globeEntityAdapter';

const toMarkerId = (organizationId: string, regionId: string) => `host:${organizationId}:${regionId}`;

export const isHostGlobeEligible = (organization: OrganizationData): boolean =>
  organization.status === 'approved'
  && organization.globePresence?.visibility === 'visible'
  && organization.displayTypes.some((type) => ['host', 'promoter', 'producer', 'community'].includes(type))
  && organization.globePresence.regions.some((region) =>
    region.status !== 'inactive'
    && Number.isFinite(region.latitude)
    && Number.isFinite(region.longitude));

export const adaptOrganizationsToGlobeEvents = (
  organizations: OrganizationData[],
): GlobeV1RuntimeEvent[] => organizations.flatMap((organization) => {
  if (!isHostGlobeEligible(organization)) return [];
  return organization.globePresence!.regions.flatMap((region) => {
    if (
      region.status === 'inactive'
      || !Number.isFinite(region.latitude)
      || !Number.isFinite(region.longitude)
    ) return [];
    const id = toMarkerId(organization.id, region.id);
    const countryCodes = resolveCountryIsoCodes(region.country);
    return [{
      id,
      name: organization.name,
      entityType: 'promoter' as const,
      lat: region.latitude,
      lon: region.longitude,
      countryIso2: countryCodes.iso2,
      countryIso3: countryCodes.iso3,
      listingId: id,
      organizationId: organization.id,
      organizationSlug: organization.slug,
      organization,
      hostRegionLabel: region.label,
    }];
  });
});

export const adaptOrganizationsToDiscoveryPoints = (
  organizations: OrganizationData[],
): DiscoveryPoint[] => organizations.flatMap((organization) => {
  if (!isHostGlobeEligible(organization)) return [];
  return organization.globePresence!.regions.flatMap((region) => {
    if (
      region.status === 'inactive'
      || !Number.isFinite(region.latitude)
      || !Number.isFinite(region.longitude)
    ) return [];
    const markerId = toMarkerId(organization.id, region.id);
    return [{
      id: markerId,
      latitude: region.latitude,
      longitude: region.longitude,
      listingIds: [markerId],
      clubIds: [],
      eventIds: [],
      city: region.city,
      region: region.region,
      country: region.country,
    }];
  });
});
