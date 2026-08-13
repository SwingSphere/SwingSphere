import type { HeroArrivalProfile } from './heroArrivalProfile';

export type HeroStudioDestination = {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

export type HeroStudioViewOffset = {
  enabled: boolean;
  fullWidth: number;
  fullHeight: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

export type HeroStudioPose = {
  version: 1;
  camera: {
    position: [number, number, number];
    quaternion: [number, number, number, number];
    target: [number, number, number];
    fov: number;
    near: number;
    far: number;
    zoom: number;
    viewOffset: HeroStudioViewOffset | null;
  };
  globe: {
    position: [number, number, number];
    quaternion: [number, number, number, number];
    scale: [number, number, number];
  };
  destination: HeroStudioDestination | null;
  destinationLocalPosition: [number, number, number] | null;
  destinationWorldPosition: [number, number, number] | null;
  labelAnchor: { x: number; y: number };
  heroProfile?: HeroArrivalProfile;
  capturedAt?: string;
};

export type HeroStudioPoseOrigin = 'production' | 'left-editor' | 'profile' | 'playback' | 'reset' | 'test-start';

export const cloneHeroStudioPose = (pose: HeroStudioPose): HeroStudioPose =>
  JSON.parse(JSON.stringify(pose)) as HeroStudioPose;

export const poseViewOffsetFromScreenFraming = (
  pose: HeroStudioPose,
  screenX: number,
  screenY: number,
): HeroStudioViewOffset => {
  const current = pose.camera.viewOffset;
  const fullHeight = current?.fullHeight || 1000;
  const fullWidth = current?.fullWidth || Math.max(1, fullHeight * (16 / 9));
  return {
    enabled: true,
    fullWidth,
    fullHeight,
    offsetX: (0.5 - screenX) * fullWidth,
    // Three.js view offsets select a lower sub-frustum when offsetY is positive,
    // which moves scene content upward. Negate the screen-space delta so larger
    // screenY values actually frame the globe lower in the viewport.
    offsetY: (0.5 - screenY) * fullHeight,
    width: fullWidth,
    height: fullHeight,
  };
};

export const screenFramingFromPose = (pose: HeroStudioPose) => {
  const view = pose.camera.viewOffset;
  if (!view?.enabled) return { x: 0.5, y: 0.5 };
  return {
    x: 0.5 - view.offsetX / Math.max(view.fullWidth, 1),
    y: 0.5 - view.offsetY / Math.max(view.fullHeight, 1),
  };
};
