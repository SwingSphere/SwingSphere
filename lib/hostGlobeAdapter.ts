import type { OrganizationData, OrganizationGlobeRegion } from '../types';
import type { GlobeV1RuntimeEvent } from '../data/globeV1MockData';
import type { DiscoveryPoint } from './discoveryPointAdapter';
import { resolveCountryIsoCodes } from './globeEntityAdapter';

const toMarkerId = (organizationId: string, regionId: string) => `host:${organizationId}:${regionId}`;

// Illuminaughty has a deliberately broad multi-city operating footprint. Showing
// every city as a host presence overwhelms the discovery layer and makes the
// same organization appear to be dozens of distinct things. For now, compress
// only this host to one representative presence per U.S. state. Actual Event
// listings remain city-specific and are not affected by this policy.
const STATE_AGGREGATED_HOST_SLUGS = new Set(['illuminaughty']);

const normalizeRegionKey = (region: OrganizationGlobeRegion) =>
  `${region.country.trim().toLowerCase()}::${region.region.trim().toLowerCase()}`;

const squaredGeoDistance = (a: OrganizationGlobeRegion, b: OrganizationGlobeRegion) => {
  const meanLatRadians = ((a.latitude + b.latitude) * 0.5 * Math.PI) / 180;
  const latDelta = a.latitude - b.latitude;
  const lonDelta = (a.longitude - b.longitude) * Math.cos(meanLatRadians);
  return latDelta * latDelta + lonDelta * lonDelta;
};

const chooseRepresentativeRegion = (regions: OrganizationGlobeRegion[]) => {
  if (regions.length <= 1) return regions[0];
  return [...regions].sort((a, b) => {
    const aDistance = regions.reduce((sum, candidate) => sum + squaredGeoDistance(a, candidate), 0);
    const bDistance = regions.reduce((sum, candidate) => sum + squaredGeoDistance(b, candidate), 0);
    return aDistance - bDistance || a.id.localeCompare(b.id);
  })[0];
};

export const getRenderableHostRegions = (organization: OrganizationData): OrganizationGlobeRegion[] => {
  const activeRegions = (organization.globePresence?.regions ?? []).filter((region) =>
    region.status !== 'inactive'
    && Number.isFinite(region.latitude)
    && Number.isFinite(region.longitude));

  if (!STATE_AGGREGATED_HOST_SLUGS.has(organization.slug.toLowerCase())) return activeRegions;

  const grouped = new Map<string, OrganizationGlobeRegion[]>();
  activeRegions.forEach((region) => {
    const key = normalizeRegionKey(region);
    const existing = grouped.get(key) ?? [];
    existing.push(region);
    grouped.set(key, existing);
  });

  return Array.from(grouped.values()).flatMap((regions) => {
    const representative = chooseRepresentativeRegion(regions);
    if (!representative) return [];
    if (regions.length === 1) return [representative];

    return [{
      ...representative,
      id: `state-${representative.region.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label: `${representative.region} · ${regions.length} areas`,
    }];
  });
};

const organizationGlobeScore = (organization: OrganizationData) =>
  (organization.globePresence?.visibility === 'visible' ? 20 : 0)
  + Math.min(organization.globePresence?.regions.length ?? 0, 10)
  + Number(Boolean(organization.descriptionShort))
  + Number(Boolean(organization.website))
  + Number(Boolean(organization.logoImageUrl))
  + Number(Boolean(organization.headerImageUrl));

const dedupeHostOrganizations = (organizations: OrganizationData[]) => {
  const bySlug = new Map<string, OrganizationData>();
  organizations.forEach((organization) => {
    const key = organization.slug.trim().toLowerCase();
    const existing = bySlug.get(key);
    if (!existing) {
      bySlug.set(key, organization);
      return;
    }

    if (organizationGlobeScore(organization) >= organizationGlobeScore(existing)) {
      bySlug.set(key, organization);
    }
  });
  return Array.from(bySlug.values());
};

export const isHostGlobeEligible = (organization: OrganizationData): boolean =>
  organization.status === 'approved'
  && organization.globePresence?.visibility === 'visible'
  && organization.displayTypes.some((type) => ['host', 'promoter', 'producer', 'community'].includes(type))
  && getRenderableHostRegions(organization).length > 0;

export const adaptOrganizationsToGlobeEvents = (
  organizations: OrganizationData[],
): GlobeV1RuntimeEvent[] => dedupeHostOrganizations(organizations).flatMap((organization) => {
  if (!isHostGlobeEligible(organization)) return [];

  return getRenderableHostRegions(organization).flatMap((region) => {
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
): DiscoveryPoint[] => dedupeHostOrganizations(organizations).flatMap((organization) => {
  if (!isHostGlobeEligible(organization)) return [];

  return getRenderableHostRegions(organization).flatMap((region) => {
    const markerId = toMarkerId(organization.id, region.id);
    return [{
      id: markerId,
      latitude: region.latitude,
      longitude: region.longitude,
      listingIds: [markerId],
      clubIds: [],
      eventIds: [],
      hostIds: [markerId],
      city: region.city,
      region: region.region,
      country: region.country,
    }];
  });
});
