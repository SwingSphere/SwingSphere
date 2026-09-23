import Supercluster from 'supercluster';
import { latLngToCell } from 'h3-js';
import type { DiscoveryPoint } from './discoveryPointAdapter';
import { normalizeCountry } from './geoNormalize';
import { stableHash } from './identityUtils';

type PointProperties = { discoveryPointId: string };

export type ActivityRegion = {
  id: string;
  scopeKey: string;
  name: string;
  latitude: number;
  longitude: number;
  countryIso2?: string;
  discoveryPointIds: string[];
  listingIds: string[];
  clubCount: number;
  eventCount: number;
  hostCount?: number;
  singleEntityType?: 'club' | 'event';
  singleListingName?: string;
  singleListingLogoUrl?: string;
};

export type ActivityRegionOptions = {
  radius?: number;
  extent?: number;
  worldZoom?: number;
  maxDiameterKm?: number;
};

const WORLD_BOUNDS: [number, number, number, number] = [-180, -85, 180, 85];
const DEFAULT_MAX_ACTIVITY_REGION_DIAMETER_KM = 140;
const REGION_NAMES: Record<string, string> = {
  CA: 'California',
  NY: 'New York',
  NSW: 'New South Wales',
};

export const createActivityRegions = (
  discoveryPoints: DiscoveryPoint[],
  options: ActivityRegionOptions = {},
): ActivityRegion[] => {
  if (!discoveryPoints.length) return [];

  const pointById = new Map(discoveryPoints.map((point) => [point.id, point]));
  const index = new Supercluster<PointProperties>({
    radius: options.radius ?? 60,
    extent: options.extent ?? 512,
    minPoints: 2,
    maxZoom: 5,
  });
  index.load(discoveryPoints.map((point) => ({
    type: 'Feature' as const,
    properties: { discoveryPointId: point.id },
    geometry: {
      type: 'Point' as const,
      coordinates: [point.longitude, point.latitude],
    },
  })));

  return index.getClusters(WORLD_BOUNDS, options.worldZoom ?? 3).flatMap((feature) => {
    const properties = feature.properties;
    const pointIds = 'cluster' in properties && properties.cluster
      ? index.getLeaves(properties.cluster_id, Infinity).map((leaf) => leaf.properties.discoveryPointId)
      : [properties.discoveryPointId];
    const members = pointIds
      .map((pointId) => pointById.get(pointId))
      .filter((point): point is DiscoveryPoint => Boolean(point));

    return splitOversizedActivityMembers(
      members,
      options.maxDiameterKm ?? DEFAULT_MAX_ACTIVITY_REGION_DIAMETER_KM,
    ).map(buildActivityRegion);
  });
};

const buildActivityRegion = (members: DiscoveryPoint[]): ActivityRegion => {
  const pointIds = members.map((point) => point.id);
  const { longitude, latitude } = resolveRepresentativeCoordinate(members);
  const listingIds = unique(members.flatMap((point) => point.listingIds));
  const memberSignature = [...pointIds].sort().join('|');
  const countryIso2 = dominantValue(members.map((point) => normalizeCountry(point.country)).filter(Boolean))?.value ?? '';

  const clubCount = unique(members.flatMap((point) => point.clubIds)).length;
  const eventCount = unique(members.flatMap((point) => point.eventIds)).length;
  const hostCount = unique(members.flatMap((point) => point.hostIds ?? [])).length;
  const singleMember = listingIds.length === 1
    ? members.find((point) => point.listingIds.includes(listingIds[0])) ?? members[0]
    : undefined;

  return {
    id: `cluster:v1:world:${stableHash(memberSignature)}`,
    scopeKey: `h3:r2:${latLngToCell(latitude, longitude, 2)}`,
    name: resolveActivityRegionName(members),
    latitude,
    longitude,
    countryIso2: countryIso2 || undefined,
    discoveryPointIds: pointIds,
    listingIds,
    clubCount,
    eventCount,
    hostCount,
    singleEntityType: listingIds.length === 1
      ? clubCount === 1
        ? 'club'
        : eventCount === 1
          ? 'event'
          : undefined
      : undefined,
    singleListingName: listingIds.length === 1 ? singleMember?.listingName : undefined,
    singleListingLogoUrl: listingIds.length === 1 ? singleMember?.logoImageUrl : undefined,
  };
};

const splitOversizedActivityMembers = (
  members: DiscoveryPoint[],
  maxDiameterKm: number,
): DiscoveryPoint[][] => {
  if (members.length < 2 || !Number.isFinite(maxDiameterKm) || maxDiameterKm <= 0) {
    return members.length ? [members] : [];
  }
  if (activityRegionDiameterKm(members) <= maxDiameterKm) return [members];

  // Complete-link style grouping keeps every member of a discovery area within
  // the same practical travel-scale diameter. This intentionally prevents
  // continent-sized or multi-state "destination" pins such as Wichita -> DFW.
  const sorted = [...members].sort((a, b) =>
    a.latitude - b.latitude
    || a.longitude - b.longitude
    || a.id.localeCompare(b.id));

  const groups: DiscoveryPoint[][] = [];
  for (const member of sorted) {
    const compatibleGroups = groups
      .map((group, index) => ({
        index,
        maxDistanceKm: Math.max(...group.map((candidate) => haversineKm(member, candidate))),
      }))
      .filter(({ maxDistanceKm }) => maxDistanceKm <= maxDiameterKm)
      .sort((a, b) => a.maxDistanceKm - b.maxDistanceKm || a.index - b.index);

    if (!compatibleGroups.length) {
      groups.push([member]);
      continue;
    }
    groups[compatibleGroups[0].index].push(member);
  }

  return groups;
};

const activityRegionDiameterKm = (members: DiscoveryPoint[]): number => {
  let diameter = 0;
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      diameter = Math.max(diameter, haversineKm(members[i], members[j]));
    }
  }
  return diameter;
};

const resolveRepresentativeCoordinate = (members: DiscoveryPoint[]) => {
  if (members.length === 1) {
    return { latitude: members[0].latitude, longitude: members[0].longitude };
  }

  const centroid = {
    latitude: members.reduce((sum, point) => sum + point.latitude, 0) / members.length,
    longitude: members.reduce((sum, point) => sum + point.longitude, 0) / members.length,
  };

  // A pure centroid can land in a bay/ocean. Anchor the discovery marker to the
  // real member location nearest that centroid; the runtime then performs a
  // final visual land snap against the stylized GLB if necessary.
  const representative = [...members].sort((a, b) => {
    const distanceA = haversineKm(a, centroid);
    const distanceB = haversineKm(b, centroid);
    return distanceA - distanceB || a.id.localeCompare(b.id);
  })[0];

  return {
    latitude: representative.latitude,
    longitude: representative.longitude,
  };
};

const haversineKm = (
  a: Pick<DiscoveryPoint, 'latitude' | 'longitude'>,
  b: Pick<DiscoveryPoint, 'latitude' | 'longitude'>,
): number => {
  const earthRadiusKm = 6371.0088;
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLat = lat2 - lat1;
  const dLon = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return earthRadiusKm * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
};

const resolveActivityRegionName = (members: DiscoveryPoint[]): string => {
  const cities = unique(members.map((point) => point.city).filter(Boolean));
  const normalizedCities = new Set(cities.map((city) => city.toLowerCase()));

  const hasAny = (...values: string[]) => values.some((value) => normalizedCities.has(value));
  const hasAll = (...values: string[]) => values.every((value) => normalizedCities.has(value));

  if (hasAny('san francisco', 'oakland', 'berkeley', 'san jose') && cities.length > 1) {
    return 'San Francisco Bay Area';
  }
  if (hasAll('los angeles', 'las vegas')) return 'Los Angeles–Las Vegas';
  if (hasAny('detroit', 'chicago', 'milwaukee', 'toronto') && cities.length >= 3) return 'Great Lakes Region';
  if (hasAny('haysville', 'oklahoma city', 'euless', 'dallas') && cities.length >= 3) return 'Southern Plains';
  if (hasAny('san antonio', 'austin', 'houston') && cities.length >= 3) return 'Texas Triangle';
  if (hasAll('atlanta', 'columbia')) return 'Atlanta–Carolinas';
  if (hasAll('paris', 'london')) return 'Paris & London';
  if (hasAll('sandton', 'durban')) return 'Johannesburg & Durban';

  const dominantCity = dominantValue(members.map((point) => point.city));
  if (dominantCity && cities.length === 1) return dominantCity.value;
  if (cities.length === 2) return `${cities[0]} & ${cities[1]}`;

  const dominantRegion = dominantValue(members.map((point) => point.region));
  if (!cities.length && dominantRegion) {
    return REGION_NAMES[dominantRegion.value.toUpperCase()] ?? dominantRegion.value;
  }

  if (dominantCity) return `${dominantCity.value} Area`;

  const dominantCountry = dominantValue(members.map((point) => point.country));
  return dominantCountry?.value ?? 'Activity Region';
};

const dominantValue = (values: string[]) => {
  const filtered = values.map((value) => value.trim()).filter(Boolean);
  if (!filtered.length) return null;
  const counts = new Map<string, { value: string; count: number }>();
  for (const value of filtered) {
    const key = value.toLowerCase();
    const current = counts.get(key);
    counts.set(key, { value: current?.value ?? value, count: (current?.count ?? 0) + 1 });
  }
  const winner = Array.from(counts.values()).sort((a, b) => b.count - a.count)[0];
  return { value: winner.value, share: winner.count / filtered.length };
};

const unique = <T,>(values: T[]): T[] => Array.from(new Set(values));
