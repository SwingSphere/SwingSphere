import { useMemo } from 'react';
import type { Listing } from '../types';
import {
  getViewportDiscoveryResult,
  type MapViewportDiscoverySnapshot,
  type ViewportDiscoveryOptions,
} from '../lib/mapViewportDiscovery';

export const useViewportDiscovery = (
  listings: Listing[],
  viewport: MapViewportDiscoverySnapshot | null,
  options: ViewportDiscoveryOptions = {},
) => {
  return useMemo(
    () => getViewportDiscoveryResult(listings, viewport, options),
    [listings, options.paddingRatio, viewport],
  );
};
