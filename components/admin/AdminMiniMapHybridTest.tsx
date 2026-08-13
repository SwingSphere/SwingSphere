import React, { useEffect, useMemo, useState } from 'react';
import MiniMapHybrid from '../maps/MiniMapHybrid';
import type { GeoJsonObject } from 'geojson';

type ClubLocation = {
  id: string;
  name: string;
  address: string;
  cityLabel?: string;
  districtLabel?: string;
  manualCenter?: { lat: number; lng: number };
  isHidden?: boolean;
  mapLink?: boolean;
};

type GeocodeResult = {
  lat: number;
  lng: number;
  label?: string;
};

type CacheEntry<T> = {
  value: T;
  cachedAt: number;
};

type GeoStatus = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data?: GeocodeResult;
  error?: string;
};

type BoundaryStatus = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data?: GeoJsonObject;
  error?: string;
  label?: string;
};

const LOCATIONS: ClubLocation[] = [
  { id: 'twistsf', name: 'TwistSF', address: '387 Bay St, San Francisco, CA 94133', cityLabel: 'San Francisco', mapLink: true },
  {
    id: 'club-joi',
    name: 'Club Joi',
    address: '810 S Santa Fe Avenue, Los Angeles, CA 90021, USA',
    cityLabel: 'Los Angeles',
    isHidden: true,
    manualCenter: { lat: 34.0522, lng: -118.2437 },
  },
  { id: 'sea-mountain', name: 'Sea Mountain', address: '66540 San Marcus Rd, Desert Hot Springs, CA 92240', cityLabel: 'Desert Hot Springs' },
  { id: 'le-boudoir', name: 'LE BOUDOIR CLUB', address: '57-60 Aldgate High Street, EC3N 1AL, England', cityLabel: 'London', districtLabel: 'Aldgate' },
  { id: 'our-secret-spot', name: 'Our Secret Spot', address: '191 Parramatta Road, Annandale, NSW, Australia', cityLabel: 'Sydney', districtLabel: 'Annandale' },
  { id: 'voluptuous-tokyo', name: 'voluptuous. tokyo', address: '1 Chome-16-5 Kabukicho, Shinjuku City, Tokyo 160-0021, Japan', cityLabel: 'Tokyo', districtLabel: 'Shinjuku' },
  { id: 'fetishhavensa', name: 'FETISHHAVENSA', address: '70a 5th St, Wynberg, Johannesburg, 2090, South Africa', cityLabel: 'Johannesburg', districtLabel: 'Wynberg' },
  { id: 'strawberry-lips', name: 'Club Strawberry Lips', address: '101 Shepstone Rd, New Germany Industrial Park, New Germany, 3610, South Africa', cityLabel: 'New Germany' },
  { id: 'adam-and-eve', name: 'Adam And Eve', address: "Ulitsa Udal'tsova, 75А, Moscow, Russia, 119454", cityLabel: 'Moscow' },
  { id: 'club-delux', name: 'Club Delux', address: 'Backa Bergögata 2, Gothenburg, Sweden', cityLabel: 'Gothenburg' },
  { id: 'oasis-aqua', name: 'Oasis Aqua Lounge', address: '231 Mutual St, Toronto, ON M5B 2B4, Canada', cityLabel: 'Toronto' },
];

const GEOCODE_CACHE_KEY = 'swingsphere:minimap-hybrid:geocode-v1';
const BOUNDARY_CACHE_KEY = 'swingsphere:minimap-hybrid:boundary-v1';
const GEOCODE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const BOUNDARY_TTL_MS = 1000 * 60 * 60 * 24 * 90;
const MIN_REQUEST_GAP_MS = 1100;

let geocodeCache: Record<string, CacheEntry<GeocodeResult>> | null = null;
let boundaryCache: Record<string, CacheEntry<GeoJsonObject>> | null = null;
const geocodeInflight = new Map<string, Promise<GeocodeResult | null>>();
const boundaryInflight = new Map<string, Promise<GeoJsonObject | null>>();

const requestQueue: Array<() => Promise<void>> = [];
let requestActive = false;
let lastRequestAt = 0;

const readCache = <T,>(key: string): Record<string, CacheEntry<T>> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CacheEntry<T>>;
    return parsed ?? {};
  } catch {
    return {};
  }
};

const writeCache = <T,>(key: string, data: Record<string, CacheEntry<T>>) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // ignore storage failures
  }
};

const loadGeocodeCache = () => {
  if (!geocodeCache) geocodeCache = readCache<GeocodeResult>(GEOCODE_CACHE_KEY);
  return geocodeCache;
};

const loadBoundaryCache = () => {
  if (!boundaryCache) boundaryCache = readCache<GeoJsonObject>(BOUNDARY_CACHE_KEY);
  return boundaryCache;
};

const getCachedValue = <T,>(cache: Record<string, CacheEntry<T>>, key: string, ttlMs: number) => {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > ttlMs) return null;
  return entry.value;
};

const storeCachedValue = <T,>(cache: Record<string, CacheEntry<T>>, key: string, value: T) => {
  cache[key] = { value, cachedAt: Date.now() };
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

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return (await res.json()) as T;
};

const throttledFetchJson = <T,>(url: string) => scheduleRequest(() => fetchJson<T>(url));

const geocodeAddress = async (address: string): Promise<GeocodeResult | null> => {
  const cache = loadGeocodeCache();
  const cached = getCachedValue(cache, address, GEOCODE_TTL_MS);
  if (cached) return cached;
  if (geocodeInflight.has(address)) return geocodeInflight.get(address) ?? null;

  const promise = (async () => {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`;
    const data = await throttledFetchJson<
      Array<{ lat: string; lon: string; display_name?: string }>
    >(url);
    if (!Array.isArray(data) || !data[0]) return null;
    const lat = Number(data[0].lat);
    const lng = Number(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const result: GeocodeResult = { lat, lng, label: data[0].display_name };
    storeCachedValue(cache, address, result);
    writeCache(GEOCODE_CACHE_KEY, cache);
    return result;
  })()
    .catch(() => null)
    .finally(() => {
      geocodeInflight.delete(address);
    });

  geocodeInflight.set(address, promise);
  return promise;
};

const resolveCityBoundary = async (lat: number, lng: number): Promise<{ geoJson: GeoJsonObject; label?: string } | null> => {
  const reverseUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
  const reverse = await throttledFetchJson<{
    place_id?: number;
    display_name?: string;
  }>(reverseUrl);
  if (!reverse?.place_id) return null;

  const cacheKey = `place:${reverse.place_id}`;
  const cache = loadBoundaryCache();
  const cached = getCachedValue(cache, cacheKey, BOUNDARY_TTL_MS);
  if (cached) return { geoJson: cached, label: reverse.display_name };
  if (boundaryInflight.has(cacheKey)) {
    const inflight = await boundaryInflight.get(cacheKey);
    return inflight ? { geoJson: inflight, label: reverse.display_name } : null;
  }

  const promise = (async () => {
    const detailsUrl = `https://nominatim.openstreetmap.org/details.php?place_id=${reverse.place_id}&format=json&polygon_geojson=1`;
    const details = await throttledFetchJson<{
      geometry?: GeoJsonObject;
      geometry_geojson?: GeoJsonObject;
      geojson?: GeoJsonObject;
    }>(detailsUrl);
    const geometry = details?.geometry ?? details?.geometry_geojson ?? details?.geojson ?? null;
    if (!geometry) return null;
    const feature: GeoJsonObject = {
      type: 'Feature',
      properties: { name: reverse.display_name },
      geometry: geometry as any,
    };
    storeCachedValue(cache, cacheKey, feature);
    writeCache(BOUNDARY_CACHE_KEY, cache);
    return feature;
  })()
    .catch(() => null)
    .finally(() => {
      boundaryInflight.delete(cacheKey);
    });

  boundaryInflight.set(cacheKey, promise);
  const result = await promise;
  if (!result) return null;
  return { geoJson: result, label: reverse.display_name };
};

const AdminMiniMapHybridTest: React.FC = () => {
  const [geoStates, setGeoStates] = useState<Record<string, GeoStatus>>({});
  const [boundaryStates, setBoundaryStates] = useState<Record<string, BoundaryStatus>>({});
  const [showBoundaries, setShowBoundaries] = useState(false);
  const [showRoads, setShowRoads] = useState(false);
  const [roadsStatus, setRoadsStatus] = useState<Record<string, 'idle' | 'loading' | 'ready' | 'error'>>({});

  const locations = useMemo(() => LOCATIONS, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (const location of locations) {
        if (cancelled) return;
        if (location.manualCenter) {
          setGeoStates((prev) => ({
            ...prev,
            [location.id]: {
              status: 'ready',
              data: { lat: location.manualCenter.lat, lng: location.manualCenter.lng },
            },
          }));
          continue;
        }
        setGeoStates((prev) => ({
          ...prev,
          [location.id]: prev[location.id] ?? { status: 'loading' },
        }));
        const result = await geocodeAddress(location.address);
        if (cancelled) return;
        if (result) {
          setGeoStates((prev) => ({
            ...prev,
            [location.id]: { status: 'ready', data: result },
          }));
        } else {
          setGeoStates((prev) => ({
            ...prev,
            [location.id]: { status: 'error', error: 'Geocode failed' },
          }));
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [locations]);

  useEffect(() => {
    if (!showBoundaries) return;
    let cancelled = false;
    const run = async () => {
      for (const location of locations) {
        if (cancelled) return;
        const geo = geoStates[location.id];
        if (!geo?.data) continue;
        if (boundaryStates[location.id]?.status === 'ready' || boundaryStates[location.id]?.status === 'loading') {
          continue;
        }
        setBoundaryStates((prev) => ({
          ...prev,
          [location.id]: prev[location.id] ?? { status: 'loading' },
        }));
        const boundary = await resolveCityBoundary(geo.data.lat, geo.data.lng);
        if (cancelled) return;
        if (boundary?.geoJson) {
          setBoundaryStates((prev) => ({
            ...prev,
            [location.id]: { status: 'ready', data: boundary.geoJson, label: boundary.label },
          }));
        } else {
          setBoundaryStates((prev) => ({
            ...prev,
            [location.id]: { status: 'error', error: 'Boundary unavailable' },
          }));
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [showBoundaries, locations, geoStates, boundaryStates]);

  return (
    <div className="min-h-screen px-6 py-8 md:px-10 text-slate-100">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-100">Hybrid Mini Map Test</h1>
          <p className="text-sm text-slate-400">
            Raster OSM tiles with a static pin. Optional city boundary overlay is throttled and cached.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-200">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showBoundaries}
              onChange={(event) => setShowBoundaries(event.target.checked)}
            />
            Show city boundary (slower)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showRoads}
              onChange={(event) => setShowRoads(event.target.checked)}
            />
            Show major roads (live fetch)
          </label>
          <span className="text-xs text-slate-400">
            Geocoding is cached for 30 days and throttled to ~1 request/sec.
          </span>
        </div>

        <div className="space-y-4">
          {locations.map((location) => {
            const geo = geoStates[location.id];
            const boundary = boundaryStates[location.id];
            const roads = roadsStatus[location.id] ?? 'idle';
            const hasGeo = geo?.status === 'ready' && geo.data;
            const cityLabel = location.cityLabel ?? location.name;
            const districtLabel = location.districtLabel;
            const mapHref =
              location.mapLink && geo?.data && !location.isHidden
                ? `https://www.google.com/maps?q=${geo.data.lat},${geo.data.lng}`
                : undefined;
            return (
              <div
                key={location.id}
                className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-2 md:flex-1">
                  <div className="text-lg font-semibold text-slate-100">{location.name}</div>
                  <div className="text-sm text-slate-300">{location.address}</div>
                  <div className="text-xs text-slate-400">
                    Geocode:{' '}
                    {geo?.status === 'ready'
                      ? 'resolved'
                      : geo?.status === 'loading'
                        ? 'loading'
                        : geo?.status === 'error'
                          ? geo.error
                          : 'idle'}
                    {showBoundaries && (
                      <>
                        {' '}
                        | Boundary:{' '}
                        {boundary?.status === 'ready'
                          ? 'resolved'
                          : boundary?.status === 'loading'
                            ? 'loading'
                            : boundary?.status === 'error'
                              ? boundary.error
                              : 'idle'}
                      </>
                    )}
                  </div>
                  {showRoads && roads === 'loading' && (
                    <div className="text-xs text-rose-200">Fetching roads...</div>
                  )}
                </div>

                <div className="h-[230px] w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 md:h-[240px] md:w-[240px]">
                  {hasGeo ? (
                    <MiniMapHybrid
                      center={{ lat: geo.data.lat, lng: geo.data.lng }}
                      zoom={14}
                      boundaryGeoJson={showBoundaries ? boundary?.data ?? null : null}
                      className="h-full w-full"
                      showMajorRoads={showRoads}
                      cityLabel={cityLabel}
                      districtLabel={districtLabel}
                      mapHref={mapHref}
                      isHidden={location.isHidden}
                      onRoadsStatusChange={(status) =>
                        setRoadsStatus((prev) => ({
                          ...prev,
                          [location.id]: status,
                        }))
                      }
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                      {geo?.status === 'error' ? 'Unable to geocode' : 'Resolving location...'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-xs text-slate-500">
          Map tiles (c) OpenStreetMap contributors.
        </div>
      </div>
    </div>
  );
};

export default AdminMiniMapHybridTest;
