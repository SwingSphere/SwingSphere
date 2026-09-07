import React, { createContext, useContext, useMemo } from 'react';
import type { EntityIndex } from '../../lib/entityIndex';
import { getListingCanonicalPath } from '../../lib/entityUtils';
import type { Listing } from '../../types';

export type DeviceExperienceKind = 'mobile' | 'tablet';

type DeviceExperienceContextValue = {
  kind: DeviceExperienceKind;
  basePath: string;
  toPath: (path?: string) => string;
  getListingPath: (listing: Listing, index?: EntityIndex) => string;
  getMapPath: (listingId: string) => string;
};

const normalizeBasePath = (basePath: string) => {
  const normalized = basePath.trim().replace(/\/+$/, '');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
};

export const toDeviceExperiencePath = (basePath: string, path = ''): string => {
  const base = normalizeBasePath(basePath);
  if (!path || path === '/') return base;
  if (path === base || path.startsWith(`${base}/`) || path.startsWith(`${base}?`)) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
};

export const getDeviceExperienceListingPath = (basePath: string, listing: Listing, index?: EntityIndex): string =>
  toDeviceExperiencePath(basePath, getListingCanonicalPath(listing, index));

export const getDeviceExperienceMapPath = (basePath: string, listingId: string): string =>
  `${normalizeBasePath(basePath)}?mapListing=${encodeURIComponent(listingId)}`;

const DeviceExperienceContext = createContext<DeviceExperienceContextValue | null>(null);

export const DeviceExperienceProvider: React.FC<React.PropsWithChildren<{ kind: DeviceExperienceKind; basePath: string }>> = ({ kind, basePath, children }) => {
  const value = useMemo<DeviceExperienceContextValue>(() => {
    const normalizedBasePath = normalizeBasePath(basePath);
    return {
      kind,
      basePath: normalizedBasePath,
      toPath: (path = '') => toDeviceExperiencePath(normalizedBasePath, path),
      getListingPath: (listing, index) => getDeviceExperienceListingPath(normalizedBasePath, listing, index),
      getMapPath: (listingId) => getDeviceExperienceMapPath(normalizedBasePath, listingId),
    };
  }, [basePath, kind]);

  return <DeviceExperienceContext.Provider value={value}>{children}</DeviceExperienceContext.Provider>;
};

export const useDeviceExperience = (): DeviceExperienceContextValue => {
  const value = useContext(DeviceExperienceContext);
  if (!value) {
    throw new Error('useDeviceExperience must be used inside DeviceExperienceProvider');
  }
  return value;
};
