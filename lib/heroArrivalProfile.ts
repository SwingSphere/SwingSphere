import { DEFAULT_GLOBE_RUNTIME_CONFIG } from '../src/features/globe/runtime/GlobeRuntimeConfig.js';

export type HeroArrivalProfile = {
  enabled: boolean;
  mode: 'legacy' | 'destinationTilt';
  centerDistance: number;
  tangentOffset: number;
  sideOffset: number;
  horizontalOffset: number;
  verticalOffset: number;
  lookAtOffset: number;
  horizonBias: number;
  destinationScreenX: number;
  destinationScreenY: number;
  durationMs: number;
  focusDistance: number;
  offsetX: number;
  offsetY: number;
  cameraYOffset: number;
  fov: number;
  ease: 'cinematic' | 'cubic' | 'smooth';
  heroStage: {
    distance: number;
    tiltDegrees: number;
    headingDegrees: number;
    globeScreenX: number;
    globeScreenY: number;
    labelAnchorX: number;
    labelAnchorY: number;
  };
  heroComposition: {
    anchorX: number;
    anchorY: number;
    subject: 'label' | 'pin';
    tolerancePx: number;
    maxCorrectionDegrees: number;
  };
};

export type HeroArrivalProfileInput = Partial<Omit<HeroArrivalProfile, 'heroComposition' | 'heroStage'>> & {
  heroComposition?: Partial<HeroArrivalProfile['heroComposition']>;
  heroStage?: Partial<HeroArrivalProfile['heroStage']>;
};

export type HeroComposerSnapshot = {
  cameraPosition: number[];
  cameraDistance: number;
  orbitTarget: number[];
  globeCenter: number[];
  targetScreenPosition: { x: number; y: number } | null;
  pitch: number;
  yaw: number;
  fov: number;
  currentHeroProfile: Partial<HeroArrivalProfile>;
};

export const HERO_COMPOSER_ENABLED_STORAGE_KEY = 'swingsphere.globeV1.heroComposer.enabled';
export const HERO_COMPOSER_PROFILE_STORAGE_KEY = 'swingsphere.globeV1.heroComposer.profile';
export const HERO_COMPOSER_CUSTOM_PRESET_STORAGE_KEY = 'swingsphere.globeV1.heroComposer.customPreset';

const runtimeFocus = DEFAULT_GLOBE_RUNTIME_CONFIG.cameraFocus;
const runtimeHero = runtimeFocus.heroArrival;

export const defaultHeroArrivalProfile: HeroArrivalProfile = {
  ...runtimeHero,
  heroStage: { ...runtimeHero.heroStage },
  heroComposition: { ...runtimeHero.heroComposition },
  durationMs: runtimeFocus.durationMs,
  focusDistance: runtimeFocus.focusDistance,
  offsetX: runtimeFocus.offsetX,
  offsetY: runtimeFocus.offsetY,
  cameraYOffset: runtimeFocus.cameraYOffset,
  fov: runtimeHero.fov,
} as HeroArrivalProfile;

export const mergeHeroArrivalProfile = (
  base: HeroArrivalProfile,
  override: HeroArrivalProfileInput,
): HeroArrivalProfile => ({
  ...base,
  ...Object.fromEntries(
    Object.entries(override ?? {}).filter(([, value]) => value !== undefined && value !== null),
  ),
  heroComposition: {
    ...base.heroComposition,
    ...override.heroComposition,
  },
  heroStage: {
    ...base.heroStage,
    ...override.heroStage,
  },
  ease: override.ease === 'cinematic' || override.ease === 'cubic' || override.ease === 'smooth'
    ? override.ease
    : base.ease,
  mode: override.mode === 'legacy' || override.mode === 'destinationTilt' ? override.mode : base.mode,
});

export const readHeroArrivalProfile = (): HeroArrivalProfile => {
  if (typeof window === 'undefined') return defaultHeroArrivalProfile;
  try {
    const raw = window.localStorage.getItem(HERO_COMPOSER_PROFILE_STORAGE_KEY);
    return raw
      ? mergeHeroArrivalProfile(defaultHeroArrivalProfile, JSON.parse(raw))
      : defaultHeroArrivalProfile;
  } catch {
    return defaultHeroArrivalProfile;
  }
};

export const persistHeroArrivalProfile = (profile: HeroArrivalProfile) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HERO_COMPOSER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
};

export const formatHeroArrivalSnippet = (profile: HeroArrivalProfile) => {
  const destinationTilt = profile.mode === 'destinationTilt';
  const focusDistance = destinationTilt ? profile.heroStage.distance : profile.focusDistance;
  const cameraFocus = destinationTilt
    ? {
        durationMs: Math.round(profile.durationMs),
        focusDistance,
        offsetX: 0,
        offsetY: 0,
        cameraYOffset: 0,
        heroArrival: {
          enabled: profile.enabled,
          mode: profile.mode,
          centerDistance: profile.heroStage.distance,
          fov: profile.fov,
          ease: profile.ease,
          heroStage: profile.heroStage,
          heroComposition: profile.heroComposition,
        },
      }
    : {
        durationMs: Math.round(profile.durationMs),
        focusDistance: profile.focusDistance,
        offsetX: profile.offsetX,
        offsetY: profile.offsetY,
        cameraYOffset: profile.cameraYOffset,
        heroArrival: {
          enabled: profile.enabled,
          mode: profile.mode,
          centerDistance: profile.centerDistance,
          tangentOffset: profile.tangentOffset,
          sideOffset: profile.sideOffset,
          horizontalOffset: profile.horizontalOffset,
          verticalOffset: profile.verticalOffset,
          lookAtOffset: profile.lookAtOffset,
          horizonBias: profile.horizonBias,
          destinationScreenX: profile.destinationScreenX,
          destinationScreenY: profile.destinationScreenY,
          fov: profile.fov,
          ease: profile.ease,
          heroStage: profile.heroStage,
          heroComposition: profile.heroComposition,
        },
      };

  return JSON.stringify({ cameraFocus }, null, 2);
};

export const saveHeroArrivalProfileToProduction = async (profile: HeroArrivalProfile) => {
  const response = await fetch('/api/admin/globe/hero-arrival/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile }),
  });
  if (!response.ok) throw new Error(await response.text());
};
