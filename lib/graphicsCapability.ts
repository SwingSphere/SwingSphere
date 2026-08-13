import type { GlobeQualityTier } from './globePerformance';

export type GraphicsCapability = 'webgl2-hardware' | 'webgl2-degraded' | 'unsupported';

let cachedCapability: GraphicsCapability | null = null;

const releaseTestContext = (context: WebGL2RenderingContext | null): void => {
  context?.getExtension('WEBGL_lose_context')?.loseContext();
};

export const getGraphicsCapability = (): GraphicsCapability => {
  if (cachedCapability) return cachedCapability;
  if (typeof document === 'undefined') return 'unsupported';

  const hardwareCanvas = document.createElement('canvas');
  try {
    const hardwareContext = hardwareCanvas.getContext('webgl2', {
      failIfMajorPerformanceCaveat: true,
      powerPreference: 'high-performance',
    });
    if (hardwareContext) {
      releaseTestContext(hardwareContext);
      cachedCapability = 'webgl2-hardware';
      return cachedCapability;
    }
  } catch {
    // A second, less strict probe below distinguishes degraded WebGL from no WebGL.
  }

  const fallbackCanvas = document.createElement('canvas');
  try {
    const fallbackContext = fallbackCanvas.getContext('webgl2');
    if (fallbackContext) {
      releaseTestContext(fallbackContext);
      cachedCapability = 'webgl2-degraded';
      return cachedCapability;
    }
  } catch {
    // Fall through to the list-first experience.
  }

  cachedCapability = 'unsupported';
  return cachedCapability;
};

export const createGlobePerformanceConfig = (
  capability: GraphicsCapability,
  prefersReducedMotion: boolean,
  qualityTier: GlobeQualityTier = capability === 'webgl2-hardware' ? 'high' : 'low',
): Record<string, unknown> => {
  const effectiveTier = capability === 'webgl2-degraded' ? 'low' : qualityTier;
  const maxPixelRatio = effectiveTier === 'high' ? 1.5 : effectiveTier === 'balanced' ? 1.25 : 1;
  const config: Record<string, unknown> = {
    renderer: {
      antialias: capability === 'webgl2-hardware' && effectiveTier !== 'low',
      maxPixelRatio,
    },
    motion: {
      reduced: prefersReducedMotion,
    },
    quality: {
      currentTier: effectiveTier,
      highBloom: {
        strength: 1.512,
        radius: 0.397,
        threshold: 0.3,
      },
    },
  };

  if (effectiveTier === 'low') {
    config.bloom = { strength: 0, radius: 0, threshold: 1 };
  } else if (effectiveTier === 'balanced') {
    config.bloom = { strength: 0.82, radius: 0.28, threshold: 0.36 };
  }

  if (prefersReducedMotion) {
    config.idleMotion = { idleRotationSpeed: 0 };
    config.selection = { fadeInSeconds: 0, fadeOutSeconds: 0, pulseSeconds: 0 };
  }

  return config;
};
