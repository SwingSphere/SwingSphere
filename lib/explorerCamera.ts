export type ExplorerSurfaceMode = 'globe' | 'map';

export type ExplorerCameraPose = {
  surface: ExplorerSurfaceMode;
  lng: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
};

export const WORLD_CENTER: [number, number] = [-98.5795, 39.8283];
export const WORLD_PITCH = 52;
export const WORLD_BEARING = -18;
export const EXPLORER_MIN_ZOOM = 3.5;
export const EXPLORER_MAX_ZOOM = 16.8;
export const GLOBE_TO_MAP_ZOOM_INTENT = 0.92;
export const MAP_TO_GLOBE_ZOOM_INTENT = 0.73;
export const GLOBE_MAP_RECENT_WHEEL_MS = 900;
export const GLOBE_MAP_MIN_ARRIVAL_ZOOM = 14.8;

export const DEFAULT_EXPLORER_CAMERA: ExplorerCameraPose = {
  surface: 'globe',
  lng: WORLD_CENTER[0],
  lat: WORLD_CENTER[1],
  zoom: 3.5,
  pitch: WORLD_PITCH,
  bearing: WORLD_BEARING,
};

export const DEFAULT_MAP_CAMERA: ExplorerCameraPose = {
  ...DEFAULT_EXPLORER_CAMERA,
  surface: 'map',
  // A neutral map entry should provide immediate world orientation rather than
  // inheriting the globe's last camera target (which can land near 0° / 0°).
  zoom: 2,
  pitch: 0,
  bearing: 0,
};

export const LISTING_FOCUS_CAMERA: ExplorerCameraPose = {
  surface: 'globe',
  lng: WORLD_CENTER[0],
  lat: WORLD_CENTER[1],
  zoom: 16.8,
  pitch: 58,
  bearing: WORLD_BEARING,
};

export const clampExplorerPitch = (pitch: number): number => Math.min(60, Math.max(45, pitch));

export const zoomIntentToMapZoom = (zoomIntent: number): number => {
  const clampedIntent = Math.min(1, Math.max(0, zoomIntent));
  return EXPLORER_MIN_ZOOM + clampedIntent * (EXPLORER_MAX_ZOOM - EXPLORER_MIN_ZOOM);
};

export const mapZoomToZoomIntent = (zoom: number): number => {
  const range = EXPLORER_MAX_ZOOM - EXPLORER_MIN_ZOOM;
  return Math.min(1, Math.max(0, (zoom - EXPLORER_MIN_ZOOM) / range));
};

export const poseKey = (pose: Pick<ExplorerCameraPose, 'lng' | 'lat' | 'zoom' | 'pitch' | 'bearing'>): string =>
  [
    pose.lng.toFixed(5),
    pose.lat.toFixed(5),
    pose.zoom.toFixed(2),
    pose.pitch.toFixed(2),
    pose.bearing.toFixed(2),
  ].join(':');
