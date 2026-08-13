import { clampExplorerPitch } from './explorerCamera';

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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const estimateMapMotionDurationMs = (
  from: { lng: number; lat: number; zoom: number; pitch: number; bearing: number },
  to: { lng: number; lat: number; zoom: number; pitch: number; bearing: number },
  baseDurationMs = 700,
): number => {
  const distanceMeters = haversineMeters(from, to);
  const distanceComponent = 300 + Math.pow(distanceMeters / 1000, 0.58) * 190;
  const zoomComponent = Math.abs(to.zoom - from.zoom) * 110;
  const pitchComponent = Math.abs(clampExplorerPitch(to.pitch) - clampExplorerPitch(from.pitch)) * 6;
  const bearingComponent = Math.min(120, Math.abs(to.bearing - from.bearing) * 0.65);
  const duration = Math.max(baseDurationMs * 0.72, distanceComponent + zoomComponent + pitchComponent + bearingComponent);
  return Math.round(clamp(duration, 280, 1450));
};
