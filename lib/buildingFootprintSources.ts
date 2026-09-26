import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { adminFetch } from './adminApi';
import {
  extractIndividualBuildingFootprints,
  getBuildingGeometryCenter,
  pointIntersectsBuildingGeometry,
  type LngLat,
  type ProviderFootprintFeature,
} from './buildingGeometry';

export const OPENFREEMAP_BUILDING_SOURCE = 'OpenFreeMap / OpenStreetMap';
const OPENFREEMAP_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
type OpenFreeMapTileJson = { tiles: string[]; maxzoom: number };

let openFreeMapTileJsonCache: OpenFreeMapTileJson | null = null;
const openFreeMapTileCache = new Map<string, ProviderFootprintFeature[]>();

const lngLatToTile = (lng: number, lat: number, zoom: number): { x: number; y: number } => {
  const n = 2 ** zoom;
  return {
    x: Math.floor((lng + 180) / 360 * n),
    y: Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n),
  };
};

export const fetchOpenFreeMapBuildingFootprints = async (args: {
  center: LngLat;
  radiusMeters: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{ features: ProviderFootprintFeature[]; provider: string; tileCount: number }> => {
  const fetchImpl = args.fetchImpl ?? fetch;
  if (!openFreeMapTileJsonCache) {
    const response = await fetchImpl(OPENFREEMAP_TILEJSON_URL, { signal: args.signal });
    if (!response.ok) throw new Error(`${OPENFREEMAP_BUILDING_SOURCE} metadata returned ${response.status}`);
    const metadata = await response.json() as OpenFreeMapTileJson;
    if (!metadata.tiles?.length || !Number.isFinite(metadata.maxzoom)) {
      throw new Error(`${OPENFREEMAP_BUILDING_SOURCE} returned invalid tile metadata`);
    }
    openFreeMapTileJsonCache = metadata;
  }

  const metadata = openFreeMapTileJsonCache;
  const zoom = metadata.maxzoom;
  const lngMeters = Math.max(1, 111_320 * Math.cos(args.center.lat * Math.PI / 180));
  const latMeters = 110_540;
  const lngDelta = args.radiusMeters / lngMeters;
  const latDelta = args.radiusMeters / latMeters;
  const northwest = lngLatToTile(args.center.lng - lngDelta, args.center.lat + latDelta, zoom);
  const southeast = lngLatToTile(args.center.lng + lngDelta, args.center.lat - latDelta, zoom);
  const features: ProviderFootprintFeature[] = [];
  let tileCount = 0;

  for (let x = northwest.x; x <= southeast.x; x += 1) {
    for (let y = northwest.y; y <= southeast.y; y += 1) {
      args.signal?.throwIfAborted();
      const url = metadata.tiles[0]
        .replace('{z}', String(zoom))
        .replace('{x}', String(x))
        .replace('{y}', String(y));
      let tileFeatures = openFreeMapTileCache.get(url);
      if (!tileFeatures) {
        const response = await fetchImpl(url, { signal: args.signal });
        if (!response.ok) throw new Error(`${OPENFREEMAP_BUILDING_SOURCE} tile returned ${response.status}`);
        const decoded = new VectorTile(new Pbf(new Uint8Array(await response.arrayBuffer())));
        const layer = decoded.layers.building;
        tileFeatures = [];
        for (let index = 0; index < (layer?.length ?? 0); index += 1) {
          const vectorFeature = layer.feature(index);
          const feature = vectorFeature.toGeoJSON(x, y, zoom);
          tileFeatures.push({
            id: feature.id ?? vectorFeature.id,
            geometry: feature.geometry,
            properties: feature.properties ?? {},
            source: 'OpenFreeMap',
            sourceLayer: 'building',
          });
        }
        openFreeMapTileCache.set(url, tileFeatures);
      }
      tileCount += 1;
      features.push(...tileFeatures);
    }
  }

  return { features, provider: OPENFREEMAP_BUILDING_SOURCE, tileCount };
};

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

// This public feature layer can serve small neighborhoods directly in browsers
// where the Node-only Microsoft dataset endpoint is not deployed (Cloudflare Pages).
const ESRI_MICROSOFT_BUILDINGS_URL =
  'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/MSBFP2/FeatureServer/0/query';

export const fetchArcGisBuildingFootprints = async (args: {
  center: LngLat;
  radiusMeters: number;
  maxFeatures?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<SupplementalBuildingFootprintResponse> => {
  const radiusMeters = Math.max(20, Math.min(750, args.radiusMeters));
  const latitudeDelta = radiusMeters / 110_540;
  const longitudeDelta = radiusMeters / Math.max(1, 111_320 * Math.cos(args.center.lat * Math.PI / 180));
  const bounds = [
    args.center.lng - longitudeDelta,
    args.center.lat - latitudeDelta,
    args.center.lng + longitudeDelta,
    args.center.lat + latitudeDelta,
  ];
  const maxFeatures = Math.max(1, Math.min(2_000, args.maxFeatures ?? 900));
  const query = new URLSearchParams({
    where: '1=1',
    geometry: bounds.join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'OBJECTID',
    returnGeometry: 'true',
    resultRecordCount: String(maxFeatures),
    f: 'geojson',
  });
  const response = await (args.fetchImpl ?? fetch)(`${ESRI_MICROSOFT_BUILDINGS_URL}?${query}`, {
    signal: args.signal,
  });
  if (!response.ok) throw new Error(`ArcGIS building coverage returned ${response.status}`);
  const payload = await response.json() as {
    features?: Array<GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>>;
    exceededTransferLimit?: boolean;
    error?: { message?: string };
  };
  if (payload.error) throw new Error(payload.error.message || 'ArcGIS building coverage returned an error.');
  if (!Array.isArray(payload.features)) throw new Error('ArcGIS building coverage returned invalid GeoJSON.');
  const features = payload.features.flatMap((feature) => {
    if (feature.geometry?.type !== 'Polygon' && feature.geometry?.type !== 'MultiPolygon') return [];
    const objectId = feature.properties?.OBJECTID ?? feature.id;
    if (objectId === null || objectId === undefined) return [];
    return [{
      type: 'Feature' as const,
      id: `${MICROSOFT_BUILDING_ID_PREFIX}esri:${objectId}`,
      geometry: feature.geometry,
      properties: {
        ...feature.properties,
        render_height: 6,
        swingsphere_provider_source: 'Microsoft Building Footprints / Esri',
        swingsphere_provider_attribution: 'Microsoft Building Footprints / Esri · ODbL',
      },
    }];
  });
  return {
    type: 'FeatureCollection',
    features,
    provider: 'Microsoft Building Footprints / Esri',
    attribution: 'Microsoft Building Footprints / Esri · ODbL',
    datasetRelease: '2022',
    quadKeys: [],
    cacheHits: 0,
    downloadedTiles: 0,
    truncated: Boolean(payload.exceededTransferLimit || payload.features.length >= maxFeatures),
  };
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
  let serverError: unknown = null;
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
    const result = await response.json() as SupplementalBuildingFootprintResponse;
    if (result.features?.length) return result;
  } catch (error) {
    serverError = error;
    if (args.signal?.aborted) throw error;
  } finally {
    clearTimeout(timer);
    args.signal?.removeEventListener('abort', relayAbort);
  }

  // A production Pages deployment has no Vite admin route. Keep the lookup
  // usable without asking an administrator to verify an unseen building.
  try {
    return await fetchArcGisBuildingFootprints(args);
  } catch (fallbackError) {
    throw new Error(`Building providers unavailable: ${serverError instanceof Error ? serverError.message : 'primary source empty'}; ArcGIS: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
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
