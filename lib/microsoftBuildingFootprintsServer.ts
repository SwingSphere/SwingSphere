import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import { geometryFingerprint } from './buildingGeometry';

const DATASET_INDEX_URLS = [
  'https://bfppub.blob.core.windows.net/$web/2026-07-24/dataset-links.csv',
  'https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv',
] as const;

const DATASET_ZOOM = 9;
const MAX_RADIUS_METERS = 750;
const DEFAULT_MAX_FEATURES = 1_200;
const PROVIDER_NAME = 'Microsoft Global ML Building Footprints';
const PROVIDER_ATTRIBUTION = 'Microsoft Global ML Building Footprints · CDLA Permissive 2.0';

export type MicrosoftBuildingFootprintFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, {
  render_height: number;
  height?: number;
  confidence?: number;
  swingsphere_provider_source: string;
  swingsphere_provider_attribution: string;
  swingsphere_dataset_release?: string;
  swingsphere_quadkey: string;
}>;

export type MicrosoftBuildingFootprintQueryResult = {
  type: 'FeatureCollection';
  features: MicrosoftBuildingFootprintFeature[];
  provider: string;
  attribution: string;
  datasetRelease?: string;
  quadKeys: string[];
  cacheHits: number;
  downloadedTiles: number;
  truncated: boolean;
};

type DatasetRecord = {
  location: string;
  quadKey: string;
  url: string;
  size: string;
  uploadDate: string;
};

type DatasetIndex = {
  recordsByQuadKey: Map<string, DatasetRecord>;
  sourceUrl: string;
};

let datasetIndexPromise: Promise<DatasetIndex> | null = null;

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
};

const loadDatasetIndex = async (): Promise<DatasetIndex> => {
  if (datasetIndexPromise) return datasetIndexPromise;
  datasetIndexPromise = (async () => {
    let lastError: unknown = null;
    for (const sourceUrl of DATASET_INDEX_URLS) {
      try {
        const response = await fetch(sourceUrl);
        if (!response.ok) throw new Error(`dataset index returned ${response.status}`);
        const text = await response.text();
        const lines = text.split(/\r?\n/).filter(Boolean);
        const recordsByQuadKey = new Map<string, DatasetRecord>();
        for (const line of lines.slice(1)) {
          const [location, quadKey, url, size, uploadDate] = parseCsvLine(line);
          if (!quadKey || !url) continue;
          recordsByQuadKey.set(quadKey, { location, quadKey, url, size, uploadDate });
        }
        return { recordsByQuadKey, sourceUrl };
      } catch (error) {
        lastError = error;
      }
    }
    datasetIndexPromise = null;
    throw lastError instanceof Error ? lastError : new Error('Microsoft building dataset index is unavailable.');
  })();
  return datasetIndexPromise;
};

const clampLatitude = (latitude: number) => Math.max(-85.05112878, Math.min(85.05112878, latitude));

const lngLatToTile = (lng: number, lat: number, zoom = DATASET_ZOOM) => {
  const scale = 2 ** zoom;
  const x = Math.min(scale - 1, Math.max(0, Math.floor(((lng + 180) / 360) * scale)));
  const clampedLat = clampLatitude(lat);
  const latRad = (clampedLat * Math.PI) / 180;
  const y = Math.min(scale - 1, Math.max(0, Math.floor(
    (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * scale,
  )));
  return { x, y };
};

const tileToQuadKey = (x: number, y: number, zoom = DATASET_ZOOM): string => {
  let quadKey = '';
  for (let level = zoom; level > 0; level -= 1) {
    let digit = 0;
    const mask = 1 << (level - 1);
    if ((x & mask) !== 0) digit += 1;
    if ((y & mask) !== 0) digit += 2;
    quadKey += String(digit);
  }
  return quadKey;
};

const queryBounds = (lat: number, lng: number, radiusMeters: number): [number, number, number, number] => {
  const latDelta = radiusMeters / 110_540;
  const lngScale = Math.max(1, 111_320 * Math.cos((lat * Math.PI) / 180));
  const lngDelta = radiusMeters / lngScale;
  return [lng - lngDelta, lat - latDelta, lng + lngDelta, lat + latDelta];
};

const quadKeysForBounds = (bounds: [number, number, number, number]): string[] => {
  const [west, south, east, north] = bounds;
  const northWest = lngLatToTile(west, north);
  const southEast = lngLatToTile(east, south);
  const keys: string[] = [];
  for (let x = northWest.x; x <= southEast.x; x += 1) {
    for (let y = northWest.y; y <= southEast.y; y += 1) keys.push(tileToQuadKey(x, y));
  }
  return keys;
};

const geometryBounds = (geometry: GeoJSON.Geometry | null | undefined): [number, number, number, number] | null => {
  if (!geometry || !('coordinates' in geometry)) return null;
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  const collect = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      west = Math.min(west, value[0]);
      east = Math.max(east, value[0]);
      south = Math.min(south, value[1]);
      north = Math.max(north, value[1]);
      return;
    }
    value.forEach(collect);
  };
  collect(geometry.coordinates);
  return Number.isFinite(west) ? [west, south, east, north] : null;
};

const boundsIntersect = (
  a: [number, number, number, number],
  b: [number, number, number, number],
) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);

const safeCacheName = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, '_');

const ensureCachedTile = async (
  record: DatasetRecord,
  cacheDirectory: string,
): Promise<{ filePath: string; cacheHit: boolean }> => {
  fs.mkdirSync(cacheDirectory, { recursive: true });
  const release = record.uploadDate || 'current';
  const filePath = path.join(cacheDirectory, `${safeCacheName(release)}-${record.quadKey}.geojsonl.gz`);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1_024) {
    return { filePath, cacheHit: true };
  }
  const response = await fetch(record.url);
  if (!response.ok || !response.body) throw new Error(`${PROVIDER_NAME} tile ${record.quadKey} returned ${response.status}`);
  const tempPath = `${filePath}.download`;
  try {
    const readable = Readable.fromWeb(response.body as any);
    await pipeline(readable, fs.createWriteStream(tempPath));
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
    throw error;
  }
  return { filePath, cacheHit: false };
};

const normalizeFootprint = (
  raw: unknown,
  quadKey: string,
  datasetRelease: string | undefined,
): MicrosoftBuildingFootprintFeature | null => {
  const candidate = raw as {
    type?: string;
    geometry?: GeoJSON.Geometry | null;
    properties?: Record<string, unknown> | null;
  };
  const geometry = candidate?.geometry;
  if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) return null;
  const fingerprint = geometryFingerprint(geometry);
  const heightValue = Number(candidate.properties?.height);
  const confidenceValue = Number(candidate.properties?.confidence);
  const height = Number.isFinite(heightValue) && heightValue > 0 ? heightValue : 6;
  return {
    type: 'Feature',
    id: `microsoft-ml:${fingerprint}`,
    geometry,
    properties: {
      render_height: height,
      ...(Number.isFinite(heightValue) && heightValue > 0 ? { height: heightValue } : {}),
      ...(Number.isFinite(confidenceValue) && confidenceValue >= 0 ? { confidence: confidenceValue } : {}),
      swingsphere_provider_source: PROVIDER_NAME,
      swingsphere_provider_attribution: PROVIDER_ATTRIBUTION,
      ...(datasetRelease ? { swingsphere_dataset_release: datasetRelease } : {}),
      swingsphere_quadkey: quadKey,
    },
  };
};

export const queryMicrosoftBuildingFootprints = async (args: {
  lat: number;
  lng: number;
  radiusMeters: number;
  cacheDirectory: string;
  maxFeatures?: number;
}): Promise<MicrosoftBuildingFootprintQueryResult> => {
  const lat = Number(args.lat);
  const lng = Number(args.lng);
  const radiusMeters = Math.max(20, Math.min(MAX_RADIUS_METERS, Number(args.radiusMeters) || 250));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Invalid supplemental building coordinate.');
  }
  const maxFeatures = Math.max(1, Math.min(2_000, args.maxFeatures ?? DEFAULT_MAX_FEATURES));
  const bounds = queryBounds(lat, lng, radiusMeters);
  const quadKeys = quadKeysForBounds(bounds);
  const index = await loadDatasetIndex();
  const records = quadKeys.map((quadKey) => index.recordsByQuadKey.get(quadKey)).filter((record): record is DatasetRecord => Boolean(record));
  const features: MicrosoftBuildingFootprintFeature[] = [];
  const seen = new Set<string>();
  let cacheHits = 0;
  let downloadedTiles = 0;
  let truncated = false;

  for (const record of records) {
    const cached = await ensureCachedTile(record, args.cacheDirectory);
    cacheHits += cached.cacheHit ? 1 : 0;
    downloadedTiles += cached.cacheHit ? 0 : 1;
    const input = fs.createReadStream(cached.filePath).pipe(createGunzip());
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const rawGeometry = (parsed as any)?.geometry as GeoJSON.Geometry | undefined;
      const footprintBounds = geometryBounds(rawGeometry);
      if (!footprintBounds || !boundsIntersect(bounds, footprintBounds)) continue;
      const feature = normalizeFootprint(parsed, record.quadKey, record.uploadDate);
      if (!feature || seen.has(String(feature.id))) continue;
      seen.add(String(feature.id));
      features.push(feature);
      if (features.length >= maxFeatures) {
        truncated = true;
        lines.close();
        input.destroy();
        break;
      }
    }
    if (truncated) break;
  }

  return {
    type: 'FeatureCollection',
    features,
    provider: PROVIDER_NAME,
    attribution: PROVIDER_ATTRIBUTION,
    datasetRelease: records.map((record) => record.uploadDate).filter(Boolean).sort().at(-1),
    quadKeys,
    cacheHits,
    downloadedTiles,
    truncated,
  };
};
