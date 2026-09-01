import type { BuildingAddressCandidate } from './buildingVerification';

export type ResolvedBuildingAddress = {
  primary: string | null;
  secondary: string | null;
  displayName: string | null;
  candidate: BuildingAddressCandidate;
  source: string;
};

export type BuildingAddressResolution =
  | { status: 'resolved'; address: ResolvedBuildingAddress; cached?: boolean }
  | { status: 'no_address'; address: null; cached?: boolean }
  | { status: 'provider_error'; address: null; errorCode: 'timeout' | 'rate_limited' | 'unavailable' | 'invalid_response'; retryable: boolean; cached?: boolean };

export interface BuildingAddressResolver {
  resolve(lat: number, lng: number, context?: { listingId?: string; footprintFingerprint?: string }): Promise<ResolvedBuildingAddress | null>;
  resolveDetailed(lat: number, lng: number, context?: { listingId?: string; footprintFingerprint?: string }): Promise<BuildingAddressResolution>;
}

type NominatimReverseResponse = {
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
    },
    source: 'nominatim',
  };
};

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
      const request = delegate.resolveDetailed(lat, lng, context).then((result) => {
        if (result.status === 'provider_error' && result.retryable) cache.delete(key);
        return result;
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
    resolveDetailed(lat, lng) {
      const request = queue.then(async () => {
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
          const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
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
            const timedOut = error instanceof Error && error.name === 'AbortError';
            if (attempt < maximumAttempts) {
              await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 400 * (2 ** (attempt - 1))));
              continue;
            }
            return { status: 'provider_error', address: null, errorCode: timedOut ? 'timeout' : 'unavailable', retryable: true } as const;
          } finally {
            globalThis.clearTimeout(timeout);
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
  const fetchImpl = options.fetchImpl ?? fetch;
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
          body: JSON.stringify({ lat, lng, ...context }),
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
