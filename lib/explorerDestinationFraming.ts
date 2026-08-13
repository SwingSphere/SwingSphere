import type { BuildingAsset, Listing } from '../types';
import { WORLD_BEARING, WORLD_PITCH } from './explorerCamera';
import { getListingDisplayCoords } from './explorerMarkers';

export type DestinationProfileKey =
  | 'country'
  | 'region'
  | 'cluster'
  | 'listing'
  | 'building'
  | 'interior';

export type ExplorerMapPadding = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type ExplorerMapCameraFraming = {
  kind: 'camera';
  profile: DestinationProfileKey;
  center: { lng: number; lat: number };
  zoom: number;
  pitch: number;
  bearing: number;
  padding: ExplorerMapPadding;
  durationMs: number;
  source: 'listing' | 'building-asset' | 'fallback';
};

export type ExplorerMapBoundsFraming = {
  kind: 'bounds';
  profile: DestinationProfileKey;
  center: { lng: number; lat: number };
  bounds: [[number, number], [number, number]];
  maxZoom: number;
  pitch: number;
  bearing: number;
  padding: ExplorerMapPadding;
  durationMs: number;
  source: 'listing-distribution' | 'region-center' | 'fallback';
};

export type ExplorerMapFraming = ExplorerMapCameraFraming | ExplorerMapBoundsFraming;

export const DESTINATION_CAMERA_PROFILES: Record<
  DestinationProfileKey,
  {
    zoom: number;
    maxZoom: number;
    pitch: number;
    bearing: number;
    padding: ExplorerMapPadding;
    durationMs: number;
  }
> = {
  country: {
    zoom: 4.4,
    maxZoom: 6.2,
    pitch: WORLD_PITCH,
    bearing: WORLD_BEARING,
    padding: { top: 112, bottom: 112, left: 380, right: 420 },
    durationMs: 1050,
  },
  region: {
    zoom: 11.8,
    maxZoom: 13.9,
    pitch: WORLD_PITCH,
    bearing: WORLD_BEARING,
    padding: { top: 120, bottom: 112, left: 390, right: 440 },
    durationMs: 1050,
  },
  cluster: {
    zoom: 12.8,
    maxZoom: 15.2,
    pitch: WORLD_PITCH,
    bearing: WORLD_BEARING,
    padding: { top: 112, bottom: 104, left: 380, right: 420 },
    durationMs: 900,
  },
  listing: {
    zoom: 17.55,
    maxZoom: 18.1,
    pitch: 60,
    bearing: WORLD_BEARING,
    padding: { top: 96, bottom: 86, left: 360, right: 420 },
    durationMs: 1100,
  },
  building: {
    zoom: 18.15,
    maxZoom: 18.45,
    pitch: 60,
    bearing: WORLD_BEARING,
    padding: { top: 92, bottom: 84, left: 360, right: 430 },
    durationMs: 1150,
  },
  interior: {
    zoom: 19,
    maxZoom: 20,
    pitch: 60,
    bearing: WORLD_BEARING,
    padding: { top: 80, bottom: 80, left: 320, right: 380 },
    durationMs: 900,
  },
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const collectGeometryPositions = (
  coords: unknown,
  positions: Array<[number, number]>,
): void => {
  if (!Array.isArray(coords)) return;
  if (
    coords.length >= 2 &&
    typeof coords[0] === 'number' &&
    typeof coords[1] === 'number'
  ) {
    positions.push([coords[0], coords[1]]);
    return;
  }
  coords.forEach((child) => collectGeometryPositions(child, positions));
};

const getBuildingAssetSpanMeters = (
  asset: BuildingAsset | null,
  fallbackLat: number,
): number | null => {
  if (!asset) return null;
  const positions: Array<[number, number]> = [];
  collectGeometryPositions(asset.geometry.coordinates, positions);
  if (positions.length === 0) return null;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  positions.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  const midLat = Number.isFinite(minLat + maxLat) ? (minLat + maxLat) / 2 : fallbackLat;
  const latMeters = Math.abs(maxLat - minLat) * 110_540;
  const lngMeters = Math.abs(maxLng - minLng) * 111_320 * Math.cos((midLat * Math.PI) / 180);
  return Math.max(latMeters, lngMeters);
};

const zoomForBuildingSpan = (spanMeters: number | null): number => {
  if (spanMeters === null) return DESTINATION_CAMERA_PROFILES.building.zoom;
  if (spanMeters <= 24) return 18.35;
  if (spanMeters <= 52) return 18.18;
  if (spanMeters <= 95) return 17.95;
  return 17.75;
};

export const buildListingMapFraming = (
  listing: Listing,
  asset: BuildingAsset | null,
): ExplorerMapCameraFraming | null => {
  const center = getListingDisplayCoords(listing);
  if (!center) return null;

  const hasAuthoredAsset = Boolean(asset);
  const profile = hasAuthoredAsset
    ? DESTINATION_CAMERA_PROFILES.building
    : DESTINATION_CAMERA_PROFILES.listing;
  const spanMeters = getBuildingAssetSpanMeters(asset, center.lat);

  return {
    kind: 'camera',
    profile: hasAuthoredAsset ? 'building' : 'listing',
    center,
    zoom: hasAuthoredAsset
      ? clamp(zoomForBuildingSpan(spanMeters), 17.65, profile.maxZoom)
      : profile.zoom,
    pitch: profile.pitch,
    bearing: profile.bearing,
    padding: profile.padding,
    durationMs: profile.durationMs,
    source: hasAuthoredAsset ? 'building-asset' : 'listing',
  };
};

export const buildListingDistributionFraming = ({
  profile,
  listingIds,
  listings,
  fallbackCenter,
}: {
  profile: Extract<DestinationProfileKey, 'country' | 'region' | 'cluster'>;
  listingIds?: string[];
  listings: Listing[];
  fallbackCenter: { lng: number; lat: number };
}): ExplorerMapFraming => {
  const profileConfig = DESTINATION_CAMERA_PROFILES[profile];
  const allowedIds = listingIds && listingIds.length > 0 ? new Set(listingIds) : null;
  const points = listings
    .filter((listing) => !allowedIds || allowedIds.has(listing.id))
    .map((listing) => getListingDisplayCoords(listing))
    .filter((coords): coords is { lng: number; lat: number } => Boolean(coords));

  if (points.length === 0) {
    return {
      kind: 'camera',
      profile,
      center: fallbackCenter,
      zoom: profileConfig.zoom,
      pitch: profileConfig.pitch,
      bearing: profileConfig.bearing,
      padding: profileConfig.padding,
      durationMs: profileConfig.durationMs,
      source: 'fallback',
    };
  }

  const averageCenter = points.reduce(
    (acc, point) => ({
      lng: acc.lng + point.lng / points.length,
      lat: acc.lat + point.lat / points.length,
    }),
    { lng: 0, lat: 0 },
  );

  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  points.forEach((point) => {
    west = Math.min(west, point.lng);
    east = Math.max(east, point.lng);
    south = Math.min(south, point.lat);
    north = Math.max(north, point.lat);
  });

  if (points.length === 1) {
    const single = points[0];
    return {
      kind: 'camera',
      profile,
      center: single,
      zoom: profile === 'cluster' ? 14.2 : profileConfig.zoom,
      pitch: profileConfig.pitch,
      bearing: profileConfig.bearing,
      padding: profileConfig.padding,
      durationMs: profileConfig.durationMs,
      source: 'listing-distribution',
    };
  }

  const minSpanDeg = profile === 'cluster' ? 0.018 : 0.045;
  const lngSpan = Math.max(east - west, minSpanDeg);
  const latSpan = Math.max(north - south, minSpanDeg);
  const centerLng = (west + east) / 2;
  const centerLat = (south + north) / 2;
  west = centerLng - lngSpan / 2;
  east = centerLng + lngSpan / 2;
  south = centerLat - latSpan / 2;
  north = centerLat + latSpan / 2;

  return {
    kind: 'bounds',
    profile,
    center: averageCenter,
    bounds: [[west, south], [east, north]],
    maxZoom: profileConfig.maxZoom,
    pitch: profileConfig.pitch,
    bearing: profileConfig.bearing,
    padding: profileConfig.padding,
    durationMs: profileConfig.durationMs,
    source: 'listing-distribution',
  };
};

export const explorerMapFramingKey = (framing: ExplorerMapFraming | null | undefined): string => {
  if (!framing) return 'none';
  const base = `${framing.kind}:${framing.profile}:${framing.source}`;
  if (framing.kind === 'bounds') {
    return [
      base,
      framing.bounds.flat().map((value) => value.toFixed(5)).join(','),
      framing.maxZoom.toFixed(2),
      framing.pitch.toFixed(1),
      framing.bearing.toFixed(1),
    ].join(':');
  }
  return [
    base,
    framing.center.lng.toFixed(5),
    framing.center.lat.toFixed(5),
    framing.zoom.toFixed(2),
    framing.pitch.toFixed(1),
    framing.bearing.toFixed(1),
  ].join(':');
};
