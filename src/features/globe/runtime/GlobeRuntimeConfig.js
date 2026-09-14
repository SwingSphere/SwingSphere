import { GLOBE_PRESENTATION, mergeGlobePresentation } from "./GlobePresentationConfig.js";

export const GLOBE_RUNTIME_CONFIG_VERSION = 1;

export const DEFAULT_GLOBE_RUNTIME_CONFIG = {
  version: GLOBE_RUNTIME_CONFIG_VERSION,
  presentation: GLOBE_PRESENTATION,
  assets: {
    landModel: "/assets/globe/models/land.glb",
    oceanModel: "/assets/globe/models/ocean.glb",
    countryIdTexture: "/assets/globe/textures/countryIdTexture.png",
    visualCountryAtlas: "/assets/globe/textures/visualCountryAtlas_v3.png",
    countryLookup: "/assets/globe/data/countryLookup.json"
  },
  colors: {
    accent: "#c51d34",
    darkSurface: "#2e2e30",
    graphiteAtmosphere: "#56565c",
    ocean: "#121316",
    land: "#3d3d41",
    landWarm: "#3b393c",
    lightText: "#f5f5f5"
  },
  coordinateBasis: {
    meshLongitudeZeroLocalDeg: 90
  },
  alignment: {
    longitudeOffsetDeg: 0,
    latitudeOffsetDeg: 0,
    flipU: false,
    flipV: false,
    longitudeSign: -1,
    pinLongitudeOffsetDeg: 0,
    pinLatitudeOffsetDeg: 0,
    pinLongitudeSign: -1,
    pinLatitudeSign: 1
  },
  renderer: {
    antialias: true,
    alpha: true,
    maxPixelRatio: 1.5,
    cameraFov: 45,
    cameraNear: 0.01,
    cameraFar: 100,
    cameraPosition: [0, 0.45, 8.04],
    controlsMinDistance: 3.4,
    controlsMaxDistance: 12,
    toneMappingExposure: 1.08
  },
  motion: {
    reduced: false
  },
  quality: {
    currentTier: "high",
    highBloom: {
      strength: 1.512,
      radius: 0.44,
      threshold: 0.14
    }
  },
  orbitControls: {
    rotateSpeed: 1,
    dampingFactor: 0.065,
    zoomSpeed: 0.58,
    zoomAwareRotation: {
      enabled: true,
      cityDistance: 3.4,
      worldDistance: 8.04,
      citySpeedMultiplier: 0.28,
      worldSpeedMultiplier: 1,
      curvePower: 1.35
    }
  },
  progressiveDisclosure: {
    worldEnterDistance: 6.8,
    worldExitDistance: 6.4,
    worldDistance: 8.04,
    clusterFocusDistance: 4.8
  },
  pinPlacement: {
    surfaceOffset: 0.005,
    stemHeight: 0.068,
    hoverLift: 1.088,
    selectedLift: 1.176,
    labelOffset: 0.3,
    labelFootprintGap: 0.05,
    labelScreenLift: 0.7,
    listingColor: "#C51D34",
    listingActiveColor: "#FF4D5E",
    hitTesting: {
      screenSpaceSelection: true,
      hoverHysteresis: 0.18,
      depthTieBreaker: 0.015
    },
    regionalSpread: {
      enabled: true,
      innerRadiusDeg: 0.4,
      ringStepDeg: 0.3,
      ringCapacity: 8,
      proximityThresholdDeg: 0.4
    },
    showPinAnchors: false,
    showOnlySelectedEvent: false,
    // Use each listing's hero image as the shared venue-label background across
    // production globe surfaces, including the homepage display globe.
    labelHeroBackground: true
  },
  cameraFocus: {
    durationMs: 2875,
    focusDistance: 5,
    zoomAmount: 0.15,
    offsetX: 0,
    offsetY: 0,
    cameraYOffset: 0,
    rotationSpeedMultiplier: 1,
    enableAutoFocus: true,
    heroArrival: {
      enabled: true,
      mode: "destinationTilt",
      centerDistance: 5,
      fov: 31.25,
      ease: "cinematic",
      heroStage: {
        distance: 5,
        tiltDegrees: 30,
        headingDegrees: -0.5,
        globeScreenX: 0.5,
        globeScreenY: 1.5,
        labelAnchorX: 0.5,
        labelAnchorY: 0.44
      },
      heroComposition: {
        anchorX: 0.5,
        anchorY: 0.44,
        subject: "label",
        tolerancePx: 3,
        maxCorrectionDegrees: 3
      }
    }
  },
  atmosphere: {
    inner: {
      radius: 0.976,
      opacity: 0.145,
      crimsonIntensity: 0.971,
      graphiteIntensity: 1.441,
      fresnelPower: 6,
      horizonFalloff: 1.465
    },
    outer: {
      radius: 0.97,
      opacity: 0.056,
      crimsonIntensity: 1.235,
      graphiteIntensity: 1.059,
      fresnelPower: 1.55,
      horizonFalloff: 2.943
    }
  },
  crimsonRim: {
    radius: 0.979,
    rimStrength: 2,
    rimOpacity: 0.066,
    rimWidth: 1,
    rimFeather: 6,
    rimSaturation: 2
  },
  bloom: {
    strength: 1.512,
    radius: 0.44,
    threshold: 0.14,
    resolutionScale: 0.6
  },
  renderEffects: {
    backgroundGradient: true,
    backgroundHaze: false,
    backgroundGlow: false,
    innerAtmosphere: false,
    outerAtmosphere: false,
    crimsonRimShell: true,
    bloom: true,
    graphiteFacet: false,
    landEmissive: false,
    oceanEmissive: false
  },
  lights: {
    ambient: { enabled: false, color: "#2a2a2e", intensity: 1.25},
    hemisphere: { enabled: true, skyColor: "#f0f0f0", groundColor: "#333338", intensity: 4.45},
    directionalKey: { enabled: true, color: "#d0d0d0", intensity: 2.35, x: -4.4, y: 5.2, z: 5.8},
    softKey: { enabled: false, color: "#a8a8aa", intensity: 1.25, x: 2.8, y: 3.2, z: 4.4},
    fill: { enabled: true, color: "#9a9a9c", intensity: 2.35, x: 4.2, y: 1.4, z: 2.5},
    undersideFill: { enabled: false, color: "#5f5b62", intensity: 1.72, x: 0.5, y: -3.2, z: 2.8},
    rearFill: { enabled: false, color: "#76767a", intensity: 1.2, x: -2.4, y: -0.5, z: -4.8},
    // One broad crimson source replaces the former separate rim + back lights.
    // The direction is biased toward the stronger back light while retaining a lateral component
    // so low-poly edge facets can still catch the sunrise-like crimson flare.
    crimsonRim: { enabled: true, color: "#c51d34", intensity: 5.6, x: 4.25, y: 0.15, z: -6.8},
    crimsonBack: { enabled: false, color: "#c51d34", intensity: 4.63, x: 7.57, y: -0.69, z: -8},
    crimsonBounce: { enabled: false, color: "#c51d34", intensity: 1.16, x: 8, y: -8, z: -8}
  },
  materials: {
    land: {
      roughness: 0.403,
      metalness: 0,
      emissiveStrength: 0.045,
      graphiteFacetBoost: 0.032
    },
    ocean: {
      roughness: 0.82,
      metalness: 0.035,
      emissiveStrength: 0.18,
      graphiteFacetBoost: 0
    }
  },
  background: {
    enabled: true,
    gradient: {
      centerBrightness: 0.566,
      edgeBrightness: 0,
      vignetteStrength: 0.199
    },
    atmosphere: {
      opacity: 0.2,
      radius: 2,
      feather: 1.117
    }
  },
  selection: {
    fadeInSeconds: 0.52,
    fadeOutSeconds: 0.72,
    pulseSeconds: 1.02,
    breatheSeconds: 5.2,
    clickOcclusionSurfacePadding: 0.018,
    clickFrontHemisphereDot: 0.02,
    raycastRotationThreshold: 0.0025
  },
  idleMotion: {
    idleRotationSpeed: (Math.PI * 2) / 60,
    oceanInteractionSpeedRatio: 0.35,
    landInteractionEaseSeconds: 1.5,
    idleResumeDelaySeconds: 10,
    idleResumeEaseSeconds: 2
  }
};

export function createGlobeRuntimeConfig(overrides = {}) {
  const config = deepMerge(cloneConfig(DEFAULT_GLOBE_RUNTIME_CONFIG), overrides);
  config.presentation = mergeGlobePresentation(GLOBE_PRESENTATION, overrides.presentation);
  applyPresentationCompatibility(config);
  return config;
}

export function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function deepMerge(target, source) {
  Object.entries(source ?? {}).forEach(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] = deepMerge(target[key] ?? {}, value);
    } else {
      target[key] = value;
    }
  });
  return target;
}

export function applyPresentationCompatibility(config) {
  const presentation = config.presentation ?? GLOBE_PRESENTATION;
  const camera = presentation.camera;
  config.renderer.cameraFov = camera.fieldOfView;
  config.renderer.cameraPosition = [0, 0.45, camera.defaultDistanceWorld];
  config.renderer.controlsMinDistance = camera.minDistanceWorld;
  config.renderer.controlsMaxDistance = camera.maxDistanceWorld;
  config.progressiveDisclosure.worldEnterDistance = camera.worldEnterDistanceWorld;
  config.progressiveDisclosure.worldExitDistance = camera.worldExitDistanceWorld;
  config.progressiveDisclosure.worldDistance = camera.defaultDistanceWorld;
  config.progressiveDisclosure.clusterFocusDistance = camera.clusterArrivalDistanceWorld;
  config.orbitControls.zoomAwareRotation.cityDistance = camera.minDistanceWorld;
  config.orbitControls.zoomAwareRotation.worldDistance = camera.defaultDistanceWorld;
  config.cameraFocus.focusDistance = camera.listingArrivalDistanceWorld;
  config.cameraFocus.heroArrival.centerDistance = camera.listingArrivalDistanceWorld;
  config.cameraFocus.heroArrival.fov = camera.listingArrivalFieldOfView;
  config.cameraFocus.heroArrival.heroStage.distance = camera.listingArrivalDistanceWorld;
  return config;
}
