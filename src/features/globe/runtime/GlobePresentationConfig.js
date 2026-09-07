// Globe presentation calibration lives here so geometry, camera framing, markers,
// labels, and hit targets can be tuned as one system. Values are dimensionless
// ratios unless the name explicitly includes World or Px.

export const CURRENT_PRODUCTION_GLOBE_PRESENTATION = Object.freeze({
  globeScale: 1,
  camera: {
    fieldOfView: 45,
    defaultDistanceWorld: 8.04,
    minDistanceWorld: 3.4,
    maxDistanceWorld: 12,
    worldEnterDistanceWorld: 6.8,
    worldExitDistanceWorld: 6.4,
    clusterArrivalDistanceWorld: 4.8,
    listingArrivalDistanceWorld: 5,
    listingArrivalFieldOfView: 31.25
  },
  pins: {
    baseScale: 1,
    hoverScale: 1.18,
    selectedScale: 1.34,
    clusterScale: 1,
    rippleScale: 1,
    hitScale: 1,
    surfaceOffsetRadius: 0.00196,
    stemHeightRadius: 0.06588,
    stemRadiusRadius: 0.000706,
    tipRadiusRadius: 0.006275,
    glowInnerRadiusRadius: 0.003137,
    glowOuterRadiusRadius: 0.004706,
    hitRadiusRadius: 0.02549,
    hitHeightExtraRadius: 0.01882,
    hoverLiftRadius: 0.002346,
    selectedLiftRadius: 0.004693,
    closeDistanceScale: 1,
    worldDistanceScale: 1,
    distanceScaleCurvePower: 1
  },
  labels: {
    selectedOffsetPx: 54,
    hoverOffsetPx: 38
  }
});

export const GLOBE_PRESENTATION = Object.freeze({
  globeScale: 1.12,
  camera: {
    fieldOfView: 43,
    defaultDistanceWorld: 11.9,
    minDistanceWorld: 3.65,
    maxDistanceWorld: 12.5,
    worldEnterDistanceWorld: 7.25,
    worldExitDistanceWorld: 6.85,
    clusterArrivalDistanceWorld: 5.15,
    listingArrivalDistanceWorld: 5.4,
    listingArrivalFieldOfView: 31.25
  },
  pins: {
    baseScale: 0.7,
    hoverScale: 1.14,
    selectedScale: 1.25,
    clusterScale: 0.88,
    rippleScale: 0.76,
    hitScale: 0.9,
    surfaceOffsetRadius: 0.00196,
    stemHeightRadius: 0.06588,
    stemRadiusRadius: 0.000706,
    tipRadiusRadius: 0.006275,
    glowInnerRadiusRadius: 0.003137,
    glowOuterRadiusRadius: 0.004706,
    hitRadiusRadius: 0.02549,
    hitHeightExtraRadius: 0.01882,
    hoverLiftRadius: 0.00215,
    selectedLiftRadius: 0.0043,
    closeDistanceScale: 0.82,
    worldDistanceScale: 1,
    distanceScaleCurvePower: 1.25
  },
  labels: {
    selectedOffsetPx: 56,
    hoverOffsetPx: 40
  }
});

export const GLOBE_PRESENTATION_PRESETS = Object.freeze({
  current: CURRENT_PRODUCTION_GLOBE_PRESENTATION,
  radiusOnly: {
    ...CURRENT_PRODUCTION_GLOBE_PRESENTATION,
    globeScale: GLOBE_PRESENTATION.globeScale
  },
  cameraOnly: {
    ...CURRENT_PRODUCTION_GLOBE_PRESENTATION,
    camera: { ...GLOBE_PRESENTATION.camera }
  },
  recommended: GLOBE_PRESENTATION
});

export function cloneGlobePresentation(presentation = GLOBE_PRESENTATION) {
  return JSON.parse(JSON.stringify(presentation));
}

export function mergeGlobePresentation(base = GLOBE_PRESENTATION, override = {}) {
  const result = cloneGlobePresentation(base);
  mergeDefined(result, override);
  return result;
}

function mergeDefined(target, source) {
  Object.entries(source ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] = mergeDefined(target[key] ?? {}, value);
      return;
    }
    target[key] = value;
  });
  return target;
}
