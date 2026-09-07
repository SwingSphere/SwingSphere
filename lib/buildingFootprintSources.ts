import { adminFetch } from './adminApi';
import {
  extractIndividualBuildingFootprints,
  getBuildingGeometryCenter,
  pointIntersectsBuildingGeometry,
  type LngLat,
  type ProviderFootprintFeature,
} from './buildingGeometry';

export const MICROSOFT_BUILDING_SOURCE = 'Microsoft Global ML Building Footprints';
export const MICROSOFT_BUILDING_ID_PREFIX = 'microsoft-ml:';
export const OS_OPENMAP_LOCAL_BUILDINGS_QUERY_URL = 'https://services.arcgis.com/qHLhLQrcvEnxjtPr/arcgis/rest/services/OS_OpenMap_Local_Buildings/FeatureServer/1/query';
export const OS_OPENMAP_LOCAL_SOURCE = 'Ordnance Survey OpenMap Local';
export const OS_OPENMAP_LOCAL_FEATURE_ID_PREFIX = 'os-openmap-local:';
export const OS_OPENMAP_LOCAL_ATTRIBUTION = 'Contains OS data © Crown copyright and database right 2026';

export const isUnitedKingdomCountry = (country: string | null | undefined): boolean => {
  const normalized = country?.trim().toLowerCase() ?? '';
  return normalized === 'united kingdom' || normalized === 'uk' || normalized === 'great britain';
};

type OsOpenMapLocalFeature = {
  id?: string | number;
  geometry?: GeoJSON.Geometry | null;
  properties?: Record<string, unknown> | null;
};

export const fetchOsOpenMapLocalBuildingAtPoint = async (
  point: LngLat,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal; renderHeightMeters?: number } = {},
): Promise<ProviderFootprintFeature[]> => {
  const query = new URLSearchParams({
    where: '1=1',
    geometry: `${point.lng},${point.lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'OBJECTID,ID,FEATCODE,ESRIUKCASTID',
    returnGeometry: 'true',
    f: 'geojson',
  });
  const response = await (options.fetchImpl ?? fetch)(`${OS_OPENMAP_LOCAL_BUILDINGS_QUERY_URL}?${query.toString()}`, {
    signal: options.signal,
  });
  if (!response.ok) throw new Error(`${OS_OPENMAP_LOCAL_SOURCE} returned ${response.status}`);
  const payload = await response.json() as { features?: OsOpenMapLocalFeature[] };
  return (payload.features ?? []).flatMap((feature) => {
    const geometry = feature.geometry;
    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) return [];
    const properties = feature.properties ?? {};
    const sourceId = properties.ESRIUKCASTID ?? properties.ID ?? properties.OBJECTID ?? feature.id;
    if (sourceId === undefined || sourceId === null) return [];
    const providerFeatureId = `${OS_OPENMAP_LOCAL_FEATURE_ID_PREFIX}${String(sourceId)}`;
    return [{
      id: providerFeatureId,
      properties: {
        ...properties,
        render_height: options.renderHeightMeters ?? 5,
        swingsphere_provider_source: OS_OPENMAP_LOCAL_SOURCE,
        swingsphere_provider_attribution: OS_OPENMAP_LOCAL_ATTRIBUTION,
      },
      geometry,
      source: 'os-openmap-local-buildings',
      sourceLayer: 'building',
    } satisfies ProviderFootprintFeature];
  });
};

export type SupplementalBuildingFootprintResponse = {
  type: 'FeatureCollection';
  features: Array<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>>>;
  provider: string;
  attribution: string;
  datasetRelease?: string;
  quadKeys: string[];
  cacheHits: number;
  downloadedTiles: number;
  truncated: boolean;
};

export type SupplementalFusionStats = {
  requested: number;
  accepted: number;
  suppressedExact: number;
  suppressedOverlap: number;
  primaryFootprints: number;
};

export const fetchSupplementalBuildingFootprints = async (args: {
  listingId: string;
  center: LngLat;
  radiusMeters: number;
  maxFeatures?: number;
  signal?: AbortSignal;
}): Promise<SupplementalBuildingFootprintResponse> => {
  const controller = new AbortController();
  const relayAbort = () => controller.abort(args.signal?.reason);
  args.signal?.addEventListener('abort', relayAbort, { once: true });
  if (args.signal?.aborted) relayAbort();
  const timer = setTimeout(() => controller.abort(new Error('Supplemental building request timed out.')), 45_000);
  try {
  const response = await adminFetch('/api/admin/building-footprints/supplemental', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({
      listingId: args.listingId,
      lat: args.center.lat,
      lng: args.center.lng,
      radiusMeters: args.radiusMeters,
      maxFeatures: args.maxFeatures,
    }),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Supplemental building provider returned ${response.status}`);
  }
  return await response.json();
  } finally {
    clearTimeout(timer);
    args.signal?.removeEventListener('abort', relayAbort);
  }
};

export const filterSupplementalBuildingFeatures = (
  primaryFeatures: ProviderFootprintFeature[],
  supplementalFeatures: ProviderFootprintFeature[],
  center: LngLat,
  radiusMeters: number,
): { features: ProviderFootprintFeature[]; stats: SupplementalFusionStats } => {
  const primaryWorkspace = extractIndividualBuildingFootprints(primaryFeatures, center, {
    radiusMeters,
    maxFootprints: 1_000,
  });
  const supplementalWorkspace = extractIndividualBuildingFootprints(supplementalFeatures, center, {
    radiusMeters,
    maxFootprints: 1_500,
  });
  const primaryFingerprints = new Set(primaryWorkspace.footprints.map((footprint) => footprint.fingerprint));
  const supplementalFeaturesById = new Map(
    supplementalFeatures
      .filter((feature) => feature.id !== undefined && feature.id !== null)
      .map((feature) => [String(feature.id), feature] as const),
  );
  const primaryCenters = primaryWorkspace.footprints.map((footprint) => ({
    geometry: footprint.geometry,
    center: getBuildingGeometryCenter(footprint.geometry),
  }));

  let suppressedExact = 0;
  let suppressedOverlap = 0;
  const accepted: ProviderFootprintFeature[] = [];
  for (const footprint of supplementalWorkspace.footprints) {
    if (primaryFingerprints.has(footprint.fingerprint)) {
      suppressedExact += 1;
      continue;
    }
    const supplementalCenter = getBuildingGeometryCenter(footprint.geometry);
    const overlapsPrimary = primaryCenters.some((primary) =>
      pointIntersectsBuildingGeometry({ lng: supplementalCenter[0], lat: supplementalCenter[1] }, primary.geometry)
      || pointIntersectsBuildingGeometry({ lng: primary.center[0], lat: primary.center[1] }, footprint.geometry),
    );
    if (overlapsPrimary) {
      suppressedOverlap += 1;
      continue;
    }
    const providerFeatureId = footprint.providerFeatureIds[0] ?? `${MICROSOFT_BUILDING_ID_PREFIX}${footprint.fingerprint}`;
    accepted.push({
      id: providerFeatureId,
      geometry: footprint.geometry,
      properties: supplementalFeaturesById.get(providerFeatureId)?.properties ?? {
        render_height: 6,
        swingsphere_provider_source: MICROSOFT_BUILDING_SOURCE,
      },
      source: 'microsoft-global-ml-buildings',
      sourceLayer: 'building',
    });
  }

  return {
    features: accepted,
    stats: {
      requested: supplementalWorkspace.footprints.length,
      accepted: accepted.length,
      suppressedExact,
      suppressedOverlap,
      primaryFootprints: primaryWorkspace.footprints.length,
    },
  };
};

export const primaryCoverageNeedsSupplement = (
  primaryFeatures: ProviderFootprintFeature[],
  center: LngLat,
  options: {
    radiusMeters: number;
    minimumContextFootprints?: number;
    minimumContextCells?: number;
    contextGridSize?: number;
  },
): {
  needed: boolean;
  reason: 'missing-target' | 'sparse-context' | 'sufficient';
  footprintCount: number;
  occupiedContextCells: number;
} => {
  const workspace = extractIndividualBuildingFootprints(primaryFeatures, center, {
    radiusMeters: options.radiusMeters,
    maxFootprints: 1_000,
  });
  const gridSize = Math.max(1, Math.min(8, Math.round(options.contextGridSize ?? 4)));
  const lngScale = Math.max(1, 111_320 * Math.cos((center.lat * Math.PI) / 180));
  const latScale = 110_540;
  const occupiedCells = new Set<string>();
  workspace.footprints.forEach((footprint) => {
    const [lng, lat] = getBuildingGeometryCenter(footprint.geometry);
    const xMeters = (lng - center.lng) * lngScale;
    const yMeters = (lat - center.lat) * latScale;
    if (Math.abs(xMeters) > options.radiusMeters || Math.abs(yMeters) > options.radiusMeters) return;
    const normalizedX = (xMeters + options.radiusMeters) / (options.radiusMeters * 2);
    const normalizedY = (yMeters + options.radiusMeters) / (options.radiusMeters * 2);
    const cellX = Math.min(gridSize - 1, Math.max(0, Math.floor(normalizedX * gridSize)));
    const cellY = Math.min(gridSize - 1, Math.max(0, Math.floor(normalizedY * gridSize)));
    occupiedCells.add(`${cellX}:${cellY}`);
  });
  const occupiedContextCells = occupiedCells.size;
  const containsTarget = workspace.footprints.some((footprint) => footprint.pinIntersects);
  if (!containsTarget) {
    return {
      needed: true,
      reason: 'missing-target',
      footprintCount: workspace.footprints.length,
      occupiedContextCells,
    };
  }
  const minimumContextFootprints = options.minimumContextFootprints ?? 0;
  const minimumContextCells = options.minimumContextCells ?? 0;
  if (
    (minimumContextFootprints > 0 && workspace.footprints.length < minimumContextFootprints)
    || (minimumContextCells > 0 && occupiedContextCells < minimumContextCells)
  ) {
    return {
      needed: true,
      reason: 'sparse-context',
      footprintCount: workspace.footprints.length,
      occupiedContextCells,
    };
  }
  return {
    needed: false,
    reason: 'sufficient',
    footprintCount: workspace.footprints.length,
    occupiedContextCells,
  };
};
