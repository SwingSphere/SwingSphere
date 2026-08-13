import type { Listing } from '../types';
import { getListingDisplayCoords } from './explorerMarkers';

export type MapViewportBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type MapViewportDiscoverySnapshot = {
  center: { lng: number; lat: number };
  bounds: MapViewportBounds;
  zoom: number;
  pitch: number;
  bearing: number;
  updatedAt: number;
  reason: 'load' | 'move' | 'zoom' | 'moveend' | 'zoomend' | 'resize' | 'idle';
};

export type ViewportDiscoveryOptions = {
  paddingRatio?: number;
};

export type ViewportDiscoveryResult = {
  visibleListings: Listing[];
  visibleListingCount: number;
  paddedBounds: MapViewportBounds | null;
};

const DEFAULT_PADDING_RATIO = 0.18;
const MIN_BOUND_PADDING_DEGREES = 0.02;
const EARTH_RADIUS_METERS = 6371008.8;

const haversineMeters = (
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): number => {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
};

const normalizeLng = (lng: number) => {
  if (!Number.isFinite(lng)) return lng;
  const wrapped = ((lng + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
};

const padDelta = (span: number, paddingRatio: number) =>
  Math.max(Math.abs(span) * paddingRatio, MIN_BOUND_PADDING_DEGREES);

export const expandViewportBounds = (
  bounds: MapViewportBounds,
  paddingRatio = DEFAULT_PADDING_RATIO,
): MapViewportBounds => {
  const lngPadding = padDelta(bounds.east - bounds.west, paddingRatio);
  const latPadding = padDelta(bounds.north - bounds.south, paddingRatio);
  return {
    west: bounds.west - lngPadding,
    south: bounds.south - latPadding,
    east: bounds.east + lngPadding,
    north: bounds.north + latPadding,
  };
};

export const isPointWithinViewportBounds = (
  point: { lng: number; lat: number },
  bounds: MapViewportBounds,
): boolean => {
  const lng = normalizeLng(point.lng);
  const west = normalizeLng(bounds.west);
  const east = normalizeLng(bounds.east);
  const crossesDateline = west > east;
  const withinLng = crossesDateline
    ? lng >= west || lng <= east
    : lng >= west && lng <= east;
  return withinLng && point.lat >= bounds.south && point.lat <= bounds.north;
};

export const sortListingsByViewportProximity = (
  listings: Listing[],
  center: { lng: number; lat: number },
): Listing[] => {
  return listings
    .map((listing, index) => {
      const coords = getListingDisplayCoords(listing);
      if (!coords) return null;
      return {
        listing,
        index,
        distanceMeters: haversineMeters(center, coords),
      };
    })
    .filter((item): item is { listing: Listing; index: number; distanceMeters: number } => Boolean(item))
    .sort((a, b) => {
      const distanceDelta = a.distanceMeters - b.distanceMeters;
      if (Math.abs(distanceDelta) > 1) return distanceDelta;
      return a.index - b.index;
    })
    .map((item) => item.listing);
};

export const getViewportDiscoveryResult = (
  listings: Listing[],
  viewport: MapViewportDiscoverySnapshot | null,
  options: ViewportDiscoveryOptions = {},
): ViewportDiscoveryResult => {
  if (!viewport) {
    return {
      visibleListings: listings,
      visibleListingCount: listings.length,
      paddedBounds: null,
    };
  }

  const paddingRatio = options.paddingRatio ?? DEFAULT_PADDING_RATIO;
  const paddedBounds = expandViewportBounds(viewport.bounds, paddingRatio);
  const visibleListings = listings.filter((listing) => {
    const coords = getListingDisplayCoords(listing);
    return coords ? isPointWithinViewportBounds(coords, paddedBounds) : false;
  });

  const sortedVisibleListings = sortListingsByViewportProximity(
    visibleListings.length ? visibleListings : listings,
    viewport.center,
  );

  return {
    visibleListings: sortedVisibleListings,
    visibleListingCount: visibleListings.length,
    paddedBounds,
  };
};
