import type { BuildingAddressCandidate } from './buildingVerification';
import { pointIntersectsBuildingGeometry } from './buildingGeometry';
import { adminFetch } from './adminApi';

export type ResolvedBuildingAddress = {
  primary: string | null;
  secondary: string | null;
  displayName: string | null;
  candidate: BuildingAddressCandidate;
  source: string;
  coordinate?: { lat: number; lng: number };
};

export type BuildingAddressResolution =
  | { status: 'resolved'; address: ResolvedBuildingAddress; cached?: boolean }
  | { status: 'no_address'; address: null; cached?: boolean }
  | { status: 'provider_error'; address: null; errorCode: 'timeout' | 'rate_limited' | 'unavailable' | 'invalid_response'; retryable: boolean; cached?: boolean };

export type BuildingAddressResolveContext = {
  listingId?: string;
  footprintFingerprint?: string;
  signal?: AbortSignal;
};

export interface BuildingAddressResolver {
  resolve(lat: number, lng: number, context?: BuildingAddressResolveContext): Promise<ResolvedBuildingAddress | null>;
  resolveDetailed(lat: number, lng: number, context?: BuildingAddressResolveContext): Promise<BuildingAddressResolution>;
}

type NominatimReverseResponse = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: Record<string, string | undefined>;
};

const formatNominatimAddress = (result: NominatimReverseResponse): ResolvedBuildingAddress => {
  const address = result.address ?? {};
  const houseNumber = address.house_number?.trim() ?? '';
  const road = (address.road ?? address.pedestrian ?? address.residential ?? address.footway ?? address.path ?? address.cycleway ?? '').trim();
  const locality = (address.city ?? address.town ?? address.village ?? address.municipality ?? address.hamlet ?? '').trim();
  const region = (address.state ?? address.region ?? '').trim();
  const postalCode = (address.postcode ?? '').trim();
  return {
    primary: [houseNumber, road].filter(Boolean).join(' ').trim() || result.display_name?.split(',')[0]?.trim() || null,
    secondary: [locality, region, postalCode].filter(Boolean).join(', ') || result.display_name?.trim() || null,
    displayName: result.display_name?.trim() || null,
    candidate: {
      houseNumber: houseNumber || undefined,
      road: road || undefined,
      city: locality || undefined,
      region: region || undefined,
      postalCode: postalCode || undefined,
      country: address.country?.trim() || undefined,
      countryCode: address.country_code?.trim().toUpperCase() || undefined,
    },
    source: 'nominatim',
    ...(Number.isFinite(Number(result.lat)) && Number.isFinite(Number(result.lon)) ? { coordinate: { lat: Number(result.lat), lng: Number(result.lon) } } : {}),
  };
};

/** A nearest-object reverse result is contextual until its returned object can
 * be placed in this footprint. Older cached responses lack that evidence. */
export const buildingAddressBelongsToFootprint = (address: ResolvedBuildingAddress | null, geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): boolean =>
  Boolean(address?.coordinate && pointIntersectsBuildingGeometry(address.coordinate, geometry));

export const createCachedBuildingAddressResolver = (
  delegate: BuildingAddressResolver,
  options: { precision?: number; maxEntries?: number } = {},
): BuildingAddressResolver => {
  const precision = options.precision ?? 6;
  const maxEntries = options.maxEntries ?? 2_000;
  const cache = new Map<string, Promise<BuildingAddressResolution>>();
  return {
    async resolve(lat, lng, context) {
      const result = await this.resolveDetailed(lat, lng, context);
      return result.status === 'resolved' ? result.address : null;
    },
    resolveDetailed(lat, lng, context) {
      const key = `${lat.toFixed(precision)},${lng.toFixed(precision)}`;
      const cached = cache.get(key);
      if (cached) return cached.then((result) => ({ ...result, cached: true }));
      if (cache.size >= maxEntries) cache.delete(cache.keys().next().value as string);
      const request = Promise.resolve().then(() => delegate.resolveDetailed(lat, lng, context)).then((result) => {
        if (result.status === 'provider_error' && result.retryable && cache.get(key) === request) cache.delete(key);
        return result;
      }).catch((error) => {
        if (cache.get(key) === request) cache.delete(key);
        throw error;
      });
      cache.set(key, request);
      return request;
    },
  };
};

/**
 * Resolver-neutral adapter. `endpoint` can be switched to a cached same-origin
 * service without changing Inspector or ranking code. Until that service is
 * deployed, the admin-only resolver retains Nominatim's one-request-per-second
 * pacing and the outer cache prevents duplicate browser requests.
 */
export const createNominatimBuildingAddressResolver = (
  options: { endpoint?: string; minimumIntervalMs?: number; fetchImpl?: typeof fetch; maximumAttempts?: number; timeoutMs?: number; userAgent?: string } = {},
): BuildingAddressResolver => {
  const endpoint = options.endpoint ?? 'https://nominatim.openstreetmap.org/reverse';
  const minimumIntervalMs = options.minimumIntervalMs ?? 1_050;
  const fetchImpl = options.fetchImpl ?? fetch;
  const maximumAttempts = Math.max(1, options.maximumAttempts ?? 3);
  const timeoutMs = options.timeoutMs ?? 8_000;
  const userAgent = options.userAgent;
  let queue: Promise<void> = Promise.resolve();
  let lastRequestAt = 0;
  return {
    async resolve(lat, lng, context) {
      const result = await this.resolveDetailed(lat, lng, context);
      return result.status === 'resolved' ? result.address : null;
    },
    resolveDetailed(lat, lng, context) {
      const request = queue.then(async () => {
        if (context?.signal?.aborted) throw context.signal.reason ?? new Error('Address lookup cancelled.');
        for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
          const waitMs = Math.max(0, minimumIntervalMs - (Date.now() - lastRequestAt));
          if (waitMs) await new Promise<void>((resolve) => globalThis.setTimeout(resolve, waitMs));
          lastRequestAt = Date.now();
          const url = new URL(endpoint, typeof globalThis.location === 'object' ? globalThis.location.origin : undefined);
          url.searchParams.set('format', 'jsonv2');
          url.searchParams.set('lat', String(lat));
          url.searchParams.set('lon', String(lng));
          url.searchParams.set('zoom', '18');
          url.searchParams.set('addressdetails', '1');
          const controller = new AbortController();
          const relayAbort = () => controller.abort(context?.signal?.reason);
          context?.signal?.addEventListener('abort', relayAbort, { once: true });
          if (context?.signal?.aborted) relayAbort();
          const timeout = globalThis.setTimeout(() => controller.abort(new Error('Address lookup timed out.')), timeoutMs);
          try {
            const headers: Record<string, string> = { Accept: 'application/json' };
            if (userAgent) headers['User-Agent'] = userAgent;
            const response = await fetchImpl(url, { headers, signal: controller.signal });
            if (response.status === 404) return { status: 'no_address', address: null } as const;
            if (response.status === 429 || response.status >= 500) {
              if (attempt < maximumAttempts) {
                await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 400 * (2 ** (attempt - 1))));
                continue;
              }
              return { status: 'provider_error', address: null, errorCode: response.status === 429 ? 'rate_limited' : 'unavailable', retryable: true } as const;
            }
            if (!response.ok) return { status: 'provider_error', address: null, errorCode: 'invalid_response', retryable: false } as const;
            const body = await response.json() as NominatimReverseResponse & { error?: string };
            if (body.error) return { status: 'no_address', address: null } as const;
            return { status: 'resolved', address: formatNominatimAddress(body) } as const;
          } catch (error) {
            if (context?.signal?.aborted) throw context.signal.reason ?? error;
            const timedOut = error instanceof Error && error.name === 'AbortError';
            if (attempt < maximumAttempts) {
              await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 400 * (2 ** (attempt - 1))));
              continue;
            }
            return { status: 'provider_error', address: null, errorCode: timedOut ? 'timeout' : 'unavailable', retryable: true } as const;
          } finally {
            globalThis.clearTimeout(timeout);
            context?.signal?.removeEventListener('abort', relayAbort);
          }
        }
        return { status: 'provider_error', address: null, errorCode: 'unavailable', retryable: true } as const;
      });
      queue = request.then(() => undefined, () => undefined);
      return request;
    },
  };
};

export const createServerBuildingAddressResolver = (
  options: { endpoint?: string; fetchImpl?: typeof fetch } = {},
): BuildingAddressResolver => {
  const endpoint = options.endpoint ?? '/api/admin/building-address/reverse';
  const fetchImpl = options.fetchImpl ?? adminFetch;
  return {
    async resolve(lat, lng, context) {
      const result = await this.resolveDetailed(lat, lng, context);
      return result.status === 'resolved' ? result.address : null;
    },
    async resolveDetailed(lat, lng, context) {
      try {
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          signal: context?.signal,
          body: JSON.stringify({ lat, lng, listingId: context?.listingId, footprintFingerprint: context?.footprintFingerprint }),
        });
        if (!response.ok) return { status: 'provider_error', address: null, errorCode: response.status === 429 ? 'rate_limited' : 'unavailable', retryable: response.status >= 429 };
        return await response.json() as BuildingAddressResolution;
      } catch {
        return { status: 'provider_error', address: null, errorCode: 'unavailable', retryable: true };
      }
    },
  };
};

export const inspectorBuildingAddressResolver = createCachedBuildingAddressResolver(
  createServerBuildingAddressResolver(),
);
