import type { GeoJsonObject } from 'geojson';

type CacheEntry<T> = {
  value: T;
  cachedAt: number;
};

type OverpassElement = {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
};

type OverpassResponse = {
  elements: OverpassElement[];
};

export type RoadsFetchStatus = 'idle' | 'loading' | 'ready' | 'error';

const CACHE_KEY = 'swingsphere:minimap-hybrid:roads-v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const MIN_REQUEST_GAP_MS = 1000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1200;

let cache: Record<string, CacheEntry<GeoJsonObject>> | null = null;
const inflight = new Map<string, Promise<GeoJsonObject | null>>();

const requestQueue: Array<() => Promise<void>> = [];
let requestActive = false;
let lastRequestAt = 0;

const readCache = (): Record<string, CacheEntry<GeoJsonObject>> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CacheEntry<GeoJsonObject>>;
    return parsed ?? {};
  } catch {
    return {};
  }
};

const writeCache = (data: Record<string, CacheEntry<GeoJsonObject>>) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage failures
  }
};

const loadCache = () => {
  if (!cache) cache = readCache();
  return cache;
};

const getCachedValue = (cacheData: Record<string, CacheEntry<GeoJsonObject>>, key: string) => {
  const entry = cacheData[key];
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
  return entry.value;
};

const setCachedValue = (cacheData: Record<string, CacheEntry<GeoJsonObject>>, key: string, value: GeoJsonObject) => {
  cacheData[key] = { value, cachedAt: Date.now() };
};

const runNextRequest = () => {
  if (requestActive) return;
  const next = requestQueue.shift();
  if (!next) return;
  requestActive = true;
  void next();
};

const scheduleRequest = <T,>(work: () => Promise<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    requestQueue.push(async () => {
      const wait = Math.max(0, MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt));
      if (wait) {
        await new Promise((done) => setTimeout(done, wait));
      }
      lastRequestAt = Date.now();
      try {
        const result = await work();
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        requestActive = false;
        runNextRequest();
      }
    });
    runNextRequest();
  });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfterMs = (value: string | null) => {
  if (!value) return null;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
};

const fetchWithRetry = async (url: string): Promise<OverpassResponse> => {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= MAX_RETRIES) {
    attempt += 1;
    try {
      const res = await scheduleRequest(() =>
        fetch(url, {
          headers: { Accept: 'application/json' },
        })
      );
      if (res.ok) {
        return (await res.json()) as OverpassResponse;
      }
      if (res.status === 429 || res.status === 504) {
        const retryAfter = parseRetryAfterMs(res.headers.get('Retry-After'));
        if (attempt <= MAX_RETRIES) {
          await delay(retryAfter ?? RETRY_BASE_MS * Math.pow(2, attempt - 1));
          continue;
        }
      }
      throw new Error(`Overpass failed (${res.status})`);
    } catch (error) {
      lastError = error as Error;
      if (attempt > MAX_RETRIES) break;
      await delay(RETRY_BASE_MS * Math.pow(2, attempt - 1));
    }
  }

  throw lastError ?? new Error('Overpass failed');
};

const roundCoord = (value: number) => Number(value.toFixed(4));

const buildCacheKey = (lat: number, lng: number, zoom: number, tilesetVersion: string) =>
  `${roundCoord(lat)}:${roundCoord(lng)}:${zoom}:${tilesetVersion}`;

const radiusFromZoom = (zoom: number) => {
  const base = 1.2;
  const scale = Math.pow(2, 14 - zoom);
  return Math.min(6, Math.max(0.6, base * scale));
};

const bboxFromCenter = (lat: number, lng: number, radiusKm: number) => {
  const latRad = (lat * Math.PI) / 180;
  const deltaLat = radiusKm / 110.574;
  const deltaLng = radiusKm / (111.32 * Math.cos(latRad));
  return {
    south: lat - deltaLat,
    west: lng - deltaLng,
    north: lat + deltaLat,
    east: lng + deltaLng,
  };
};

const buildOverpassUrl = (lat: number, lng: number, zoom: number) => {
  const radiusKm = radiusFromZoom(zoom);
  const { south, west, north, east } = bboxFromCenter(lat, lng, radiusKm);
  const highwayRegex =
    'motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link';
  const query = `
    [out:json][timeout:25];
    (
      way["highway"~"^(${highwayRegex})$"](${south},${west},${north},${east});
    );
    out geom;
  `;
  const encoded = encodeURIComponent(query);
  return `https://overpass-api.de/api/interpreter?data=${encoded}`;
};

const overpassToGeoJson = (data: OverpassResponse): GeoJsonObject | null => {
  if (!data?.elements?.length) return null;
  const features = data.elements
    .filter((element) => element.type === 'way' && Array.isArray(element.geometry))
    .map((element) => {
      const coords = (element.geometry ?? [])
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon))
        .map((point) => [point.lon, point.lat]);
      if (coords.length < 2) return null;
      return {
        type: 'Feature',
        properties: {
          id: element.id,
          highway: element.tags?.highway,
        },
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      };
    })
    .filter(Boolean);

  if (!features.length) return null;
  return {
    type: 'FeatureCollection',
    features,
  } as GeoJsonObject;
};

export const fetchMajorRoads = async (params: {
  lat: number;
  lng: number;
  zoom: number;
  tilesetVersion: string;
}): Promise<GeoJsonObject | null> => {
  const { lat, lng, zoom, tilesetVersion } = params;
  const cacheData = loadCache();
  const cacheKey = buildCacheKey(lat, lng, zoom, tilesetVersion);
  const cached = getCachedValue(cacheData, cacheKey);
  if (cached) return cached;

  if (inflight.has(cacheKey)) {
    return inflight.get(cacheKey) ?? null;
  }

  const promise = (async () => {
    const url = buildOverpassUrl(lat, lng, zoom);
    const data = await fetchWithRetry(url);
    const geojson = overpassToGeoJson(data);
    if (geojson) {
      setCachedValue(cacheData, cacheKey, geojson);
      writeCache(cacheData);
    }
    return geojson;
  })()
    .catch(() => null)
    .finally(() => {
      inflight.delete(cacheKey);
    });

  inflight.set(cacheKey, promise);
  return promise;
};
