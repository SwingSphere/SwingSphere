import * as THREE from "three";
import { disposeObject3D } from "./math/objectPools.js";

const Y_UP = new THREE.Vector3(0, 1, 0);
const RIPPLE_RING_COUNT = 1;
const RIPPLE_SPEED = 0.62;
const RIPPLE_START_SCALE = 0.35;
const RIPPLE_END_SCALE = 4.35;
const RIPPLE_BASE_OPACITY = 0.055;
const RIPPLE_INNER_RADIUS = 0.012;
const RIPPLE_OUTER_RADIUS = 0.018;
const RIPPLE_SEGMENTS = 28;
const RIPPLE_MAX_VISUAL_RADIUS = RIPPLE_OUTER_RADIUS * RIPPLE_END_SCALE;
const PIN_VISIBLE_HEIGHT_BIAS = 0.1;
const LISTING_LOGO_FALLBACK = "/swingsphere-logo.png";

export const DEFAULT_MARKER_STYLE = Object.freeze({
  surfaceOffset: 0.005,
  baseScale: 1,
  clusterScale: 1,
  rippleScale: 1,
  hitScale: 1,
  baseStemHeight: 0.168,
  buriedStemDepth: 0,
  stemRadius: 0.0018,
  stemSegments: 8,
  tipRadius: 0.016,
  tipWidthSegments: 10,
  tipHeightSegments: 8,
  glowInnerRadius: 0.008,
  glowOuterRadius: 0.012,
  glowSegments: 20,
  hitRadius: 0.065,
  hitHeightExtra: 0.048,
  stemEmissive: "#C51D34",
  stemSelectedColor: "#FF4D5E",
  tipColor: "#C7CDD6",
  tipHoverColor: "#C51D34",
  tipSelectedColor: "#C51D34",
  glowColor: "#C51D34",
  rippleColor: "#F5F5F5",
  savedHaloColor: "#F4D7DB",
  labelColor: "#C7CDD6",
  labelSelectedColor: "#F5F5F5",
  labelBackground: "#0F1115",
  labelBorder: "#C51D34",
  idleOpacity: 0.58,
  hoverOpacity: 0.82,
  selectedOpacity: 1,
  stemIdleOpacityFactor: 0.24,
  stemActiveOpacityFactor: 0.36,
  glowIdleOpacityFactor: 0.035,
  glowHoverOpacityFactor: 0.1,
  glowSelectedOpacityFactor: 0.16,
  savedHaloOpacity: 0.34,
  hoverScale: 1.18,
  selectedScale: 1.34,
  hoverLengthScale: 2,
  selectedLengthScale: 1.58,
  hoverLift: 0.006,
  selectedLift: 0.012,
  labelFootprintGap: 0.035,
  labelScreenLift: 0.7,
  selectedVenueLabelScreenLift: 0,
  hoverVenueLabelScreenLift: -0.34,
  labelHeight: null,
  labelTitleFontSize: 66,
  labelSubtitleFontSize: 39,
  labelPaddingX: 24,
  labelPaddingY: 13,
  labelLineGap: 7,
  labelBorderRadius: 15,
  labelMaxTextWidth: 720,
  labelScaleMin: 0.84,
  labelScaleMax: 1.18,
  labelDistanceScaleInfluence: 0.18,
  selectedLabelDistanceScaleInfluence: 0.08,
  hoverLabelOpacity: 0.34,
  selectedLabelOpacity: 0.9,
  showLabel: true,
  showRipple: true,
  stemLengthScaleActive: true,
  liftActive: true,
  selectedLabelOffsetPx: 54,
  hoverLabelOffsetPx: 38,
  rippleInnerRadius: RIPPLE_INNER_RADIUS,
  rippleOuterRadius: RIPPLE_OUTER_RADIUS,
  rippleEndScale: RIPPLE_END_SCALE
});

export function createMarkerStyle(config, colorOverrides = {}, globeRadius = 2.55) {
  const pin = config.pinPlacement;
  const presentation = config.presentation?.pins ?? {};
  return {
    ...DEFAULT_MARKER_STYLE,
    surfaceOffset: globeRadius * (presentation.surfaceOffsetRadius ?? (pin.surfaceOffset / globeRadius)),
    baseScale: presentation.baseScale ?? 1,
    clusterScale: presentation.clusterScale ?? 1,
    rippleScale: presentation.rippleScale ?? 1,
    hitScale: presentation.hitScale ?? 1,
    baseStemHeight: globeRadius * (presentation.stemHeightRadius ?? ((pin.stemHeight + PIN_VISIBLE_HEIGHT_BIAS) / globeRadius)),
    stemRadius: globeRadius * (presentation.stemRadiusRadius ?? (DEFAULT_MARKER_STYLE.stemRadius / globeRadius)),
    tipRadius: globeRadius * (presentation.tipRadiusRadius ?? (DEFAULT_MARKER_STYLE.tipRadius / globeRadius)),
    glowInnerRadius: globeRadius * (presentation.glowInnerRadiusRadius ?? (DEFAULT_MARKER_STYLE.glowInnerRadius / globeRadius)),
    glowOuterRadius: globeRadius * (presentation.glowOuterRadiusRadius ?? (DEFAULT_MARKER_STYLE.glowOuterRadius / globeRadius)),
    hitRadius: globeRadius * (presentation.hitRadiusRadius ?? (DEFAULT_MARKER_STYLE.hitRadius / globeRadius)),
    hitHeightExtra: globeRadius * (presentation.hitHeightExtraRadius ?? (DEFAULT_MARKER_STYLE.hitHeightExtra / globeRadius)),
    hoverScale: presentation.hoverScale ?? DEFAULT_MARKER_STYLE.hoverScale,
    selectedScale: presentation.selectedScale ?? DEFAULT_MARKER_STYLE.selectedScale,
    hoverLift: globeRadius * (presentation.hoverLiftRadius ?? ((pin.stemHeight * (pin.hoverLift - 1)) / globeRadius)),
    selectedLift: globeRadius * (presentation.selectedLiftRadius ?? ((pin.stemHeight * (pin.selectedLift - 1)) / globeRadius)),
    selectedLabelOffsetPx: config.presentation?.labels?.selectedOffsetPx ?? 54,
    hoverLabelOffsetPx: config.presentation?.labels?.hoverOffsetPx ?? 38,
    rippleInnerRadius: globeRadius * (presentation.glowInnerRadiusRadius ?? (RIPPLE_INNER_RADIUS / globeRadius)),
    rippleOuterRadius: globeRadius * (presentation.glowOuterRadiusRadius ?? (RIPPLE_OUTER_RADIUS / globeRadius)),
    labelFootprintGap: pin.labelFootprintGap ?? DEFAULT_MARKER_STYLE.labelFootprintGap,
    labelScreenLift: pin.labelScreenLift ?? DEFAULT_MARKER_STYLE.labelScreenLift,
    ...colorOverrides
  };
}

export class GlobeMarker {
  constructor({
    id,
    labelTitle = "",
    labelSubtitle = "",
    labelCountryIso2 = "",
    labelLogoUrl = "",
    position,
    radialDirection,
    styleOverrides = {},
    markerType = "listing",
    variant = "standard",
    config = null,
    referenceDistance = 1,
    labelOverlayRoot = null
  }) {
    this.id = id;
    this.markerType = markerType;
    this.variant = variant;
    this.config = config;
    this.referenceDistance = referenceDistance;
    this.style = { ...DEFAULT_MARKER_STYLE, ...styleOverrides };
    this.currentOpacity = this.style.idleOpacity;
    this.currentScale = 1;
    this.currentLengthScale = 1;
    this.currentLift = 0;
    this.currentDistanceScale = 1;
    this.arrivalPulse = 0;
    this.heroTargetEmphasis = false;
    this.savedHalo = null;
    this.rippleRings = [];
    this.tmpLabelWorld = new THREE.Vector3();
    this.tmpGlobeCenter = new THREE.Vector3();
    this.tmpSurfaceNormal = new THREE.Vector3();
    this.tmpCameraDirection = new THREE.Vector3();

    const style = this.style;
    this.totalStemHeight = style.baseStemHeight + style.buriedStemDepth;
    this.stemCenterY = (style.baseStemHeight - style.buriedStemDepth) * 0.5;

    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.quaternion.copy(makeSurfaceQuaternion(radialDirection));

    this.wrapper = new THREE.Group();
    this.wrapper.position.y = style.surfaceOffset;
    this.group.add(this.wrapper);

    this.stem = new THREE.Mesh(
      new THREE.CylinderGeometry(
        style.stemRadius,
        style.stemRadius,
        this.totalStemHeight,
        style.stemSegments,
        1,
        false
      ),
      createAdditiveMaterial(style.stemEmissive, style.idleOpacity * style.stemIdleOpacityFactor)
    );
    this.stem.position.y = this.stemCenterY;
    this.stem.renderOrder = 8;

    this.tip = new THREE.Mesh(
      createTipGeometry(style, variant),
      createAdditiveMaterial(style.tipColor, style.idleOpacity)
    );
    this.tip.position.y = style.baseStemHeight;
    this.tip.renderOrder = markerType === "region" ? 12 : 9;

    this.baseGlow = new THREE.Mesh(
      new THREE.RingGeometry(style.glowInnerRadius, style.glowOuterRadius, style.glowSegments),
      createAdditiveMaterial(style.glowColor, style.idleOpacity * style.glowIdleOpacityFactor, {
        side: THREE.DoubleSide
      })
    );
    this.baseGlow.rotation.x = -Math.PI / 2;
    this.baseGlow.position.y = 0.004;
    this.baseGlow.renderOrder = 7;

    this.hitTarget = new THREE.Mesh(
      new THREE.CylinderGeometry(
        style.hitRadius,
        style.hitRadius,
        this.totalStemHeight + style.hitHeightExtra,
        10,
        1,
        false
      ),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
    );
    this.hitTarget.position.y = this.stemCenterY;
    this.hitTarget.userData.markerId = id;
    this.hitTarget.userData.regionId = id;

    this.label = markerType === "listing"
      ? createVenueLabelDomSet(labelTitle, labelSubtitle, labelCountryIso2, labelLogoUrl, labelOverlayRoot, style)
      : createCanvasLabelSprite(labelTitle, labelSubtitle, style, labelLogoUrl);

    this.wrapper.add(this.stem, this.baseGlow, this.tip);
    if (this.label.sprite) {
      this.label.sprite.position.y = style.baseStemHeight + getMarkerVisualFootprintClearance(style);
      this.label.sprite.renderOrder = markerType === "region" ? 22 : 20;
      this.label.sprite.userData.regionId = id;
      this.group.add(this.label.sprite);
    }
    this.group.add(this.hitTarget);
  }

  update({
    hovered = false,
    selected = false,
    attention = false,
    heroTarget = false,
    saved = false,
    delta = 0,
    cameraDistance = this.referenceDistance,
    camera = null,
    domElement = null,
    globe = null,
    presentationOpacity = 1
  }) {
    const style = this.style;
    this.heroTargetEmphasis = Boolean(heroTarget);
    const targetOpacity = selected ? style.selectedOpacity : hovered ? style.hoverOpacity : style.idleOpacity;
    this.arrivalPulse = selected
      ? Math.max(0, this.arrivalPulse - delta * 0.82)
      : 0;
    const arrivalEmphasis = smootherstep(this.arrivalPulse);
    const targetScale = selected
      ? style.selectedScale + (heroTarget ? 0.08 : 0) + arrivalEmphasis * 0.12
      : hovered
        ? style.hoverScale
        : 1;
    const targetLengthScale = style.stemLengthScaleActive
      ? hovered
        ? style.hoverLengthScale
        : selected
          ? style.selectedLengthScale
          : 1
      : 1;
    const targetLift = style.liftActive
      ? selected
        ? style.selectedLift
        : hovered
          ? style.hoverLift
          : 0
      : 0;
    const alpha = 1 - Math.pow(0.001, Math.min(delta, 0.1));
    const presentationPins = this.config?.presentation?.pins;
    const closeDistance = this.config?.presentation?.camera?.minDistanceWorld ?? cameraDistance;
    const worldDistance = this.config?.presentation?.camera?.defaultDistanceWorld ?? this.referenceDistance;
    const distanceRange = Math.max(worldDistance - closeDistance, 0.001);
    const distanceProgress = THREE.MathUtils.clamp((cameraDistance - closeDistance) / distanceRange, 0, 1);
    const curvedDistance = Math.pow(distanceProgress, presentationPins?.distanceScaleCurvePower ?? 1);
    const distanceScale = THREE.MathUtils.lerp(
      presentationPins?.closeDistanceScale ?? 1,
      presentationPins?.worldDistanceScale ?? 1,
      curvedDistance
    );
    const markerTypeScale = this.markerType === "region" ? style.clusterScale : 1;
    const visualScale = style.baseScale * markerTypeScale * distanceScale;
    this.currentDistanceScale = distanceScale;

    this.currentOpacity = THREE.MathUtils.lerp(this.currentOpacity, targetOpacity, alpha);
    this.currentScale = THREE.MathUtils.lerp(this.currentScale, targetScale, alpha);
    this.currentLengthScale = THREE.MathUtils.lerp(this.currentLengthScale, targetLengthScale, alpha);
    this.currentLift = THREE.MathUtils.lerp(this.currentLift, targetLift, alpha);

    this.wrapper.position.y = style.surfaceOffset + this.currentLift;
    this.wrapper.scale.set(this.currentScale * visualScale, 1, this.currentScale * visualScale);
    this.stem.scale.set(1, this.currentLengthScale * visualScale, 1);
    this.stem.position.y = this.stemCenterY * this.currentLengthScale * visualScale;
    this.tip.position.y = style.baseStemHeight * this.currentLengthScale * visualScale;
    this.tip.scale.set(this.currentScale, this.currentScale * visualScale, this.currentScale);
    this.baseGlow.scale.setScalar(this.currentScale * (selected ? (heroTarget ? 1.65 : 1.35) : hovered ? 1.15 : 0.85));
    this.#updateSavedHalo(saved, presentationOpacity);
    this.hitTarget.scale.set(style.hitScale, Math.max(1, this.currentLengthScale * visualScale), style.hitScale);
    this.hitTarget.position.y = style.surfaceOffset + this.stemCenterY * this.currentLengthScale * visualScale;
    this.hitTarget.visible = presentationOpacity > 0.01;

    this.stem.material.color.set(selected ? style.stemSelectedColor : style.stemEmissive);
    this.tip.material.color.set(selected ? style.tipSelectedColor : hovered ? style.tipHoverColor : style.tipColor);
    this.baseGlow.material.color.set(style.glowColor);
    this.stem.material.opacity = presentationOpacity * this.currentOpacity * (
      selected || hovered ? style.stemActiveOpacityFactor : style.stemIdleOpacityFactor
    );
    this.tip.material.opacity = presentationOpacity * this.currentOpacity;
    this.baseGlow.material.opacity = presentationOpacity * (this.currentOpacity * (
      selected
        ? style.glowSelectedOpacityFactor * (heroTarget ? 1.45 : 1)
        : hovered
          ? style.glowHoverOpacityFactor
          : style.glowIdleOpacityFactor
    ) + (selected ? arrivalEmphasis * 0.035 : 0));

    const forceLabel = Boolean(this.config?.pinPlacement?.showEventLabels);
    const targetSelectedLabelOpacity = !style.showLabel
      ? 0
      : forceLabel
        ? style.selectedLabelOpacity
        : selected
          ? style.selectedLabelOpacity
            : 0;
    const targetHoverLabelOpacity = !style.showLabel || selected || forceLabel
      ? 0
      : hovered
        ? style.hoverLabelOpacity
        : 0;

    if (this.label.element) {
      this.#updateDomLabel({
        selectedOpacity: (selected || forceLabel ? 1 : 0) * presentationOpacity,
        hoverOpacity: THREE.MathUtils.clamp(targetHoverLabelOpacity, 0, 1) * presentationOpacity,
        selected,
        hovered,
        camera,
        domElement,
        globe
      });
    } else if (this.label.sprite) {
      const labelY = this.wrapper.position.y
        + this.tip.position.y
        + getMarkerVisualFootprintClearance(style, this.currentScale) * visualScale;
      this.label.sprite.position.y = labelY;
      const scaleInfluence = selected
        ? style.selectedLabelDistanceScaleInfluence
        : style.labelDistanceScaleInfluence;
      const distanceScale = 1 + ((cameraDistance / Math.max(this.referenceDistance, 0.001)) - 1) * scaleInfluence;
      const screenScale = THREE.MathUtils.clamp(
        distanceScale,
        style.labelScaleMin,
        style.labelScaleMax
      );
      this.label.sprite.scale.set(
        this.label.baseScaleX * screenScale,
        this.label.baseScaleY * screenScale,
        1
      );
      this.label.material.opacity = THREE.MathUtils.lerp(
        this.label.material.opacity,
        THREE.MathUtils.clamp(
          targetSelectedLabelOpacity + targetHoverLabelOpacity + arrivalEmphasis * 0.08,
          0,
          1
        ) * presentationOpacity,
        alpha
      );
      this.label.sprite.visible = this.label.material.opacity > 0.01;
    }

    const qualityTier = this.config?.quality?.currentTier ?? "high";
    const showLowQualityArrivalRipple = qualityTier === "low" && this.arrivalPulse > 0.01;
    const showAttentionRipple = Boolean(attention && !selected);
    if (
      style.showRipple &&
      (selected || showAttentionRipple) &&
      (qualityTier !== "low" || showLowQualityArrivalRipple || showAttentionRipple)
    ) {
      this.#updateRipple(delta, presentationOpacity, qualityTier, { attention: showAttentionRipple });
    } else this.#hideRipple();
  }

  getAnimatedRippleCount() {
    return this.rippleRings.filter((ring) => ring.visible).length;
  }

  getMeshCount() {
    let count = 0;
    this.group.traverse((object) => {
      if (object.isMesh || object.isSprite) count += 1;
    });
    return count;
  }

  getWorldPosition(target) {
    return this.group.getWorldPosition(target);
  }

  playArrivalPulse() {
    this.arrivalPulse = 1;
    for (const ring of this.rippleRings) ring.userData.progress = 0;
  }

  dispose() {
    this.#hideRipple();
    this.rippleRings = [];
    this.label?.dispose?.();
    disposeObject3D(this.group);
  }

  #updateDomLabel({ selectedOpacity, hoverOpacity, selected, hovered, camera, domElement, globe }) {
    if (!this.label?.element || !camera || !domElement) {
      this.label?.hide?.();
      return;
    }
    const rect = domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      this.label.hide();
      return;
    }

    this.tip.updateWorldMatrix(true, false);
    this.tip.getWorldPosition(this.tmpLabelWorld);
    if (globe) globe.getWorldPosition(this.tmpGlobeCenter);
    else this.tmpGlobeCenter.set(0, 0, 0);

    this.tmpSurfaceNormal.copy(this.tmpLabelWorld).sub(this.tmpGlobeCenter).normalize();
    this.tmpCameraDirection.copy(camera.position).sub(this.tmpLabelWorld).normalize();
    const visible = this.tmpSurfaceNormal.dot(this.tmpCameraDirection) > -0.08;
    const projected = this.tmpLabelWorld.project(camera);
    const onScreen = projected.z > -1 && projected.z < 1;
    if (!visible || !onScreen || (!selected && !hovered)) {
      this.label.hide();
      return;
    }

    const screenX = (projected.x * 0.5 + 0.5) * rect.width;
    const screenY = (-projected.y * 0.5 + 0.5) * rect.height;
    const rootRect = this.label.root?.getBoundingClientRect?.() ?? rect;
    const rootX = rect.left - rootRect.left;
    const rootY = rect.top - rootRect.top;
    this.label.update({
      selectedOpacity,
      hoverOpacity,
      x: rootX + screenX,
      y: rootY + screenY,
      viewportWidth: rootRect.width,
      viewportHeight: rootRect.height,
      selected,
      hovered
    });
  }

  #updateRipple(delta, presentationOpacity = 1, qualityTier = "high", { attention = false } = {}) {
    if (!this.rippleRings.length) {
      for (let index = 0; index < RIPPLE_RING_COUNT; index += 1) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(this.style.rippleInnerRadius, this.style.rippleOuterRadius, RIPPLE_SEGMENTS),
          createAdditiveMaterial(this.style.rippleColor, 0, { side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = this.style.surfaceOffset + 0.004;
        ring.userData.progress = index / RIPPLE_RING_COUNT;
        ring.renderOrder = 7;
        this.group.add(ring);
        this.rippleRings.push(ring);
      }
    }
    const qualitySpeedMultiplier = qualityTier === "balanced" ? 0.72 : qualityTier === "low" ? 0.5 : 1;
    const qualityOpacityMultiplier = qualityTier === "balanced" ? 0.62 : qualityTier === "low" ? 0.45 : 1;
    const attentionSpeedMultiplier = attention ? 2.45 : 1;
    const attentionOpacityMultiplier = attention ? 5.8 : 1;
    const attentionColor = attention ? "#FFFFFF" : this.style.rippleColor;
    for (const ring of this.rippleRings) {
      ring.material.color.set(attentionColor);
      ring.userData.progress = (
        ring.userData.progress + delta * RIPPLE_SPEED * qualitySpeedMultiplier * attentionSpeedMultiplier
      ) % 1;
      const t = ring.userData.progress;
      const expansion = 1 - Math.pow(1 - t, 2.4);
      ring.scale.setScalar(
        (RIPPLE_START_SCALE + expansion * (this.style.rippleEndScale - RIPPLE_START_SCALE))
        * this.style.baseScale
        * this.style.rippleScale
        * this.currentDistanceScale
      );
      ring.material.opacity = RIPPLE_BASE_OPACITY
        * Math.pow(1 - t, 1.85)
        * (0.72 + 0.28 * Math.sin(t * Math.PI))
        * (this.heroTargetEmphasis ? 1.6 : 1)
        * qualityOpacityMultiplier
        * attentionOpacityMultiplier
        * presentationOpacity;
      ring.visible = true;
    }
  }

  #updateSavedHalo(saved, presentationOpacity = 1) {
    if (saved && !this.savedHalo) {
      this.savedHalo = new THREE.Mesh(
        new THREE.RingGeometry(
          this.style.glowOuterRadius * 1.7,
          this.style.glowOuterRadius * 2.2,
          this.style.glowSegments
        ),
        createAdditiveMaterial(this.style.savedHaloColor, 0, { side: THREE.DoubleSide })
      );
      this.savedHalo.rotation.x = -Math.PI / 2;
      this.savedHalo.position.y = 0.0045;
      this.savedHalo.renderOrder = 8;
      this.wrapper.add(this.savedHalo);
    }
    if (!this.savedHalo) return;
    this.savedHalo.scale.setScalar(this.currentScale);
    this.savedHalo.visible = Boolean(saved);
    this.savedHalo.material.opacity = saved ? this.style.savedHaloOpacity * presentationOpacity : 0;
  }

  #hideRipple() {
    for (const ring of this.rippleRings) {
      ring.visible = false;
      ring.material.opacity = 0;
    }
  }
}

function smootherstep(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function createTipGeometry(style, variant) {
  if (variant === "club") {
    const geometry = new THREE.OctahedronGeometry(style.tipRadius, 0);
    geometry.scale(0.82, 1.35, 0.82);
    return geometry;
  }
  if (variant === "promoter") {
    const size = style.tipRadius * 1.55;
    const geometry = new THREE.BoxGeometry(size, size, size, 1, 1, 1);
    geometry.rotateY(Math.PI / 4);
    return geometry;
  }
  return new THREE.IcosahedronGeometry(style.tipRadius, 1);
}

export function makeSurfaceQuaternion(radialDirection) {
  return new THREE.Quaternion().setFromUnitVectors(Y_UP, radialDirection.clone().normalize());
}

function createAdditiveMaterial(color, opacity, overrides = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    ...overrides
  });
}

function getMarkerVisualFootprintClearance(style, markerScale = 1) {
  const rippleClearance = style.showRipple ? style.rippleOuterRadius * style.rippleEndScale * style.rippleScale : 0;
  return style.tipRadius * markerScale + rippleClearance + style.labelFootprintGap;
}

export function createCanvasLabelSprite(title, subtitle, styleOverrides = {}, logoUrl = "") {
  const style = { ...DEFAULT_MARKER_STYLE, ...styleOverrides };
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const titleFont = `700 ${style.labelTitleFontSize}px system-ui, sans-serif`;
  const subtitleFont = `600 ${style.labelSubtitleFontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif`;
  context.font = titleFont;
  const titleLines = wrapText(context, String(title ?? ""), style.labelMaxTextWidth);
  context.font = subtitleFont;
  const subtitleLines = subtitle ? wrapText(context, String(subtitle), style.labelMaxTextWidth) : [];
  const titleLineHeight = style.labelTitleFontSize * 1.05;
  const subtitleLineHeight = style.labelSubtitleFontSize * 1.08;
  const measuredWidths = [];
  context.font = titleFont;
  measuredWidths.push(...titleLines.map((line) => context.measureText(line).width));
  context.font = subtitleFont;
  measuredWidths.push(...subtitleLines.map((line) => context.measureText(line).width));
  const logoSize = logoUrl ? Math.max(54, style.labelTitleFontSize) : 0;
  const logoGap = logoUrl ? 18 : 0;
  const width = Math.ceil(Math.max(1, ...measuredWidths) + style.labelPaddingX * 2 + logoSize + logoGap);
  const contentHeight = titleLines.length * titleLineHeight
    + (subtitleLines.length ? style.labelLineGap + subtitleLines.length * subtitleLineHeight : 0);
  const height = Math.ceil(contentHeight + style.labelPaddingY * 2);
  canvas.width = width;
  canvas.height = height;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  drawRoundedRect(context, 2, 2, width - 4, height - 4, style.labelBorderRadius);
  context.fillStyle = style.labelBackground;
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = style.labelBorder;
  context.stroke();
  const textCenterX = logoUrl
    ? style.labelPaddingX + logoSize + logoGap + (width - style.labelPaddingX * 2 - logoSize - logoGap) * 0.5
    : width * 0.5;
  if (logoUrl) {
    const logoX = style.labelPaddingX;
    const logoY = (height - logoSize) * 0.5;
    context.fillStyle = "rgba(255,255,255,0.09)";
    context.beginPath();
    context.roundRect(logoX, logoY, logoSize, logoSize, 14);
    context.fill();
    context.fillStyle = style.labelSelectedColor;
    context.font = `700 ${Math.round(logoSize * 0.42)}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.fillText(String(title ?? "?").trim().charAt(0).toUpperCase(), logoX + logoSize * 0.5, logoY + logoSize * 0.68);
  }
  context.shadowColor = "rgba(0, 0, 0, 0.35)";
  context.shadowBlur = 14;
  context.fillStyle = style.labelSelectedColor;
  context.font = titleFont;
  let baseline = style.labelPaddingY + style.labelTitleFontSize * 0.86;
  for (const line of titleLines) {
    context.fillText(line, textCenterX, baseline);
    baseline += titleLineHeight;
  }
  if (subtitleLines.length) {
    baseline += style.labelLineGap - titleLineHeight;
    context.shadowBlur = 8;
    context.fillStyle = style.labelColor;
    context.font = subtitleFont;
    for (const line of subtitleLines) {
      baseline += subtitleLineHeight;
      context.fillText(line, textCenterX, baseline);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if (logoUrl) {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const logoX = style.labelPaddingX;
      const logoY = (height - logoSize) * 0.5;
      context.save();
      context.beginPath();
      context.roundRect(logoX, logoY, logoSize, logoSize, 14);
      context.clip();
      context.drawImage(image, logoX, logoY, logoSize, logoSize);
      context.restore();
      texture.needsUpdate = true;
    };
    image.src = logoUrl;
  }
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false
  });
  const sprite = new THREE.Sprite(material);
  const baseScaleY = style.labelHeight ?? (subtitleLines.length ? 0.104 : 0.063);
  const baseScaleX = baseScaleY * (width / height);
  sprite.scale.set(baseScaleX, baseScaleY, 1);
  sprite.center.set(0.5, -style.labelScreenLift);
  sprite.visible = false;
  return { sprite, texture, material, baseScaleX, baseScaleY };
}

function createVenueLabelSpriteSet(title, subtitle, logoUrl, styleOverrides = {}) {
  const selected = createVenueCardSprite(title, subtitle, logoUrl, styleOverrides, "selected");
  const hover = createVenueCardSprite(title, subtitle, logoUrl, styleOverrides, "hover");
  return {
    sprite: selected.sprite,
    texture: selected.texture,
    material: selected.material,
    baseScaleX: selected.baseScaleX,
    baseScaleY: selected.baseScaleY,
    hoverSprite: hover.sprite,
    hoverTexture: hover.texture,
    hoverMaterial: hover.material,
    hoverBaseScaleX: hover.baseScaleX,
    hoverBaseScaleY: hover.baseScaleY
  };
}

function createVenueLabelDomSet(title, subtitle, countryIso2, logoUrl, root, style = DEFAULT_MARKER_STYLE) {
  const selectedElement = createVenueLabelElement(title, subtitle, countryIso2, logoUrl, true);
  const hoverElement = createVenueLabelElement(title, subtitle, countryIso2, logoUrl, false);
  const mountRoot = root ?? document.body;
  mountRoot.append(selectedElement, hoverElement);

  const setElementState = (element, opacity, x, y, offsetY, viewportWidth, viewportHeight, selected) => {
    const shown = opacity > 0.01;
    const safeWidth = selected ? 340 : 220;
    const safeHeight = selected ? 80 : 48;
    const clampedX = THREE.MathUtils.clamp(x, safeWidth * 0.5 + 12, Math.max(safeWidth * 0.5 + 12, viewportWidth - safeWidth * 0.5 - 12));
    const clampedAnchorY = THREE.MathUtils.clamp(y - offsetY, safeHeight + 12, Math.max(safeHeight + 12, viewportHeight - 12));
    element.style.opacity = String(opacity);
    element.style.visibility = shown ? "visible" : "hidden";
    element.style.transform = `translate(-50%, -100%) translate(${Math.round(clampedX)}px, ${Math.round(clampedAnchorY)}px)`;
  };

  return {
    element: selectedElement,
    hoverElement,
    root: mountRoot,
    update({ selectedOpacity, hoverOpacity, x, y, viewportWidth, viewportHeight, selected, hovered }) {
      setElementState(selectedElement, selected ? selectedOpacity : 0, x, y, style.selectedLabelOffsetPx, viewportWidth, viewportHeight, true);
      setElementState(hoverElement, !selected && hovered ? hoverOpacity : 0, x, y, style.hoverLabelOffsetPx, viewportWidth, viewportHeight, false);
    },
    hide() {
      selectedElement.style.opacity = "0";
      selectedElement.style.visibility = "hidden";
      hoverElement.style.opacity = "0";
      hoverElement.style.visibility = "hidden";
    },
    activeElement() {
      if (selectedElement.style.visibility !== "hidden" && Number(selectedElement.style.opacity) > 0.01) {
        return selectedElement;
      }
      if (hoverElement.style.visibility !== "hidden" && Number(hoverElement.style.opacity) > 0.01) {
        return hoverElement;
      }
      return null;
    },
    dispose() {
      selectedElement.remove();
      hoverElement.remove();
    }
  };
}

function createVenueLabelElement(title, subtitle, countryIso2, logoUrl, selected) {
  const element = document.createElement("div");
  element.className = selected ? "globe-venue-label globe-venue-label--selected" : "globe-venue-label globe-venue-label--hover";
  Object.assign(element.style, {
    position: "absolute",
    left: "0",
    top: "0",
    display: "flex",
    alignItems: "center",
    boxSizing: "border-box",
    gap: selected ? "16px" : "8px",
    minWidth: selected ? "280px" : "174px",
    maxWidth: selected ? "340px" : "220px",
    padding: selected ? "15px 20px" : "8px 10px",
    background: selected
      ? "linear-gradient(145deg, rgba(24, 18, 23, 0.72), rgba(7, 8, 12, 0.66))"
      : "linear-gradient(145deg, rgba(20, 20, 26, 0.66), rgba(7, 8, 12, 0.62))",
    border: selected ? "1px solid rgba(255, 110, 130, 0.5)" : "1px solid rgba(255, 255, 255, 0.14)",
    borderRadius: selected ? "18px" : "11px",
    boxShadow: selected
      ? "inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -2px 0 rgba(60,0,12,0.44), 0 16px 38px rgba(0,0,0,0.42)"
      : "inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.3), 0 10px 26px rgba(0,0,0,0.34)",
    color: "#fff",
    pointerEvents: "auto",
    filter: "none",
    mixBlendMode: "normal",
    textShadow: "none",
    backdropFilter: selected ? "blur(12px) saturate(132%) contrast(106%)" : "blur(9px) saturate(122%)",
    WebkitBackdropFilter: selected ? "blur(12px) saturate(132%) contrast(106%)" : "blur(9px) saturate(122%)",
    opacity: "0",
    visibility: "hidden",
    zIndex: selected ? "6" : "5",
    willChange: "transform, opacity",
    transition: "opacity 140ms ease"
  });

  const logo = document.createElement("div");
  Object.assign(logo.style, {
    flex: "0 0 auto",
    width: selected ? "48px" : "26px",
    height: selected ? "48px" : "26px",
    borderRadius: selected ? "14px" : "8px",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    background: "rgba(255, 255, 255, 0.08)",
    border: "1px solid rgba(255, 255, 255, 0.14)",
    color: "rgba(245, 245, 245, 0.78)",
    font: `700 ${selected ? 22 : 12}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
    filter: "none",
    mixBlendMode: "normal",
    textShadow: "none"
  });

  const image = document.createElement("img");
  const resolvedLogoUrl = logoUrl || LISTING_LOGO_FALLBACK;
  image.src = resolvedLogoUrl;
  image.alt = "";
  image.dataset.fallbackApplied = resolvedLogoUrl === LISTING_LOGO_FALLBACK ? "true" : "false";
  Object.assign(image.style, {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    filter: "none",
    mixBlendMode: "normal"
  });
  image.onerror = () => {
    if (image.dataset.fallbackApplied !== "true") {
      image.dataset.fallbackApplied = "true";
      image.src = LISTING_LOGO_FALLBACK;
      return;
    }
    image.remove();
    logo.textContent = "S";
  };
  logo.appendChild(image);

  const text = document.createElement("div");
  Object.assign(text.style, {
    minWidth: "0",
    flex: "1 1 auto",
    filter: "none",
    mixBlendMode: "normal",
    textShadow: "none"
  });

  const titleElement = document.createElement("div");
  titleElement.textContent = String(title ?? "");
  Object.assign(titleElement.style, {
    color: "#fff",
    font: `700 ${selected ? 19 : 13}px/1.15 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
    letterSpacing: "0",
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: selected ? "2" : "1",
    WebkitBoxOrient: "vertical",
    filter: "none",
    mixBlendMode: "normal",
    textShadow: "none"
  });

  const subtitleElement = document.createElement("div");
  Object.assign(subtitleElement.style, {
    marginTop: selected ? "5px" : "2px",
    display: "flex",
    alignItems: "center",
    gap: selected ? "7px" : "5px",
    minWidth: "0",
    color: selected ? "rgba(220, 224, 232, 0.76)" : "rgba(199, 205, 214, 0.64)",
    font: `600 ${selected ? 14 : 10.5}px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
    letterSpacing: selected ? "0.02em" : "0.01em",
    whiteSpace: "nowrap",
    overflow: "hidden",
    filter: "none",
    mixBlendMode: "normal",
    textShadow: "none"
  });

  const cityElement = document.createElement("span");
  cityElement.textContent = String(subtitle ?? "");
  Object.assign(cityElement.style, {
    minWidth: "0",
    overflow: "hidden",
    textOverflow: "ellipsis"
  });
  subtitleElement.appendChild(cityElement);

  const flagUrl = getCountryFlagImageUrl(countryIso2);
  if (flagUrl) {
    const flagElement = document.createElement("img");
    flagElement.src = flagUrl;
    flagElement.alt = "";
    flagElement.setAttribute("aria-hidden", "true");
    Object.assign(flagElement.style, {
      flex: "0 0 auto",
      width: selected ? "18px" : "14px",
      height: selected ? "12px" : "9px",
      borderRadius: "2px",
      objectFit: "cover",
      boxShadow: "0 0 0 1px rgba(255,255,255,0.16)"
    });
    subtitleElement.appendChild(flagElement);
  }

  text.append(titleElement, subtitleElement);
  element.append(logo, text);
  return element;
}

function getCountryFlagImageUrl(countryIso2) {
  const code = String(countryIso2 ?? "").trim().toLowerCase();
  return /^[a-z]{2}$/.test(code) ? `https://flagcdn.com/${code}.svg` : "";
}

function createVenueCardSprite(title, subtitle, logoUrl, styleOverrides = {}, mode = "selected") {
  const style = { ...DEFAULT_MARKER_STYLE, ...styleOverrides };
  const selected = mode === "selected";
  const pixelRatio = 2;
  const logoSize = selected ? 48 : 26;
  const logoRadius = selected ? 14 : 8;
  const paddingX = selected ? 20 : 10;
  const paddingY = selected ? 15 : 8;
  const gap = selected ? 16 : 8;
  const titleFontSize = selected ? 19 : 13;
  const cityFontSize = selected ? 14 : 10.5;
  const titleLineHeight = selected ? 22 : 15.5;
  const cityLineHeight = selected ? 17 : 12.5;
  const maxTitleLines = selected ? 2 : 1;
  const minCardWidth = selected ? 280 : 174;
  const maxCardWidth = selected ? 340 : 220;
  const maxTextWidth = maxCardWidth - paddingX * 2 - logoSize - gap;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = `700 ${titleFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const titleLines = wrapText(context, String(title ?? ""), maxTextWidth)
    .slice(0, maxTitleLines);
  if (titleLines.length === maxTitleLines) {
    titleLines[titleLines.length - 1] = fitText(context, titleLines[titleLines.length - 1], maxTextWidth);
  }
  const measuredWidths = titleLines.map((line) => context.measureText(line).width);
  if (subtitle) {
    context.font = `600 ${cityFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    measuredWidths.push(context.measureText(String(subtitle)).width);
  }
  const textWidth = Math.min(maxTextWidth, Math.max(1, ...measuredWidths));
  const cardWidth = Math.ceil(THREE.MathUtils.clamp(
    paddingX * 2 + logoSize + gap + textWidth,
    minCardWidth,
    maxCardWidth
  ));
  const contentHeight = Math.max(
    logoSize,
    titleLines.length * titleLineHeight + (subtitle ? cityLineHeight + 5 : 0)
  );
  const cardHeight = Math.ceil(contentHeight + paddingY * 2);
  const glowPadding = selected ? 14 : 8;
  const width = cardWidth + glowPadding * 2;
  const height = cardHeight + glowPadding * 2;
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, width, height);

  const cardX = glowPadding;
  const cardY = glowPadding;
  const radius = selected ? 16 : 10;
  if (selected) {
    context.save();
    context.shadowColor = "rgba(197, 29, 52, 0.18)";
    context.shadowBlur = 16;
    drawRoundedRect(context, cardX, cardY, cardWidth, cardHeight, radius);
    context.fillStyle = "rgba(255, 77, 94, 0.09)";
    context.fill();
    context.restore();
  }

  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.55)";
  context.shadowBlur = selected ? 20 : 10;
  context.shadowOffsetY = selected ? 9 : 5;
  drawRoundedRect(context, cardX, cardY, cardWidth, cardHeight, radius);
  context.fillStyle = selected ? "rgba(7, 8, 11, 0.93)" : "rgba(8, 10, 14, 0.88)";
  context.fill();
  context.restore();

  drawRoundedRect(context, cardX + 0.5, cardY + 0.5, cardWidth - 1, cardHeight - 1, radius);
  context.lineWidth = 1;
  context.strokeStyle = selected ? "rgba(255, 77, 94, 0.46)" : "rgba(170, 83, 94, 0.26)";
  context.stroke();

  const logoX = cardX + paddingX;
  const logoY = cardY + (cardHeight - logoSize) / 2;
  drawLogoContainer(context, logoX, logoY, logoSize, logoRadius, selected);

  const textX = logoX + logoSize + gap;
  let baseline = cardY + paddingY + titleFontSize;
  context.shadowColor = "transparent";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = "#ffffff";
  context.font = `700 ${titleFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  for (const line of titleLines) {
    context.fillText(line, textX, baseline);
    baseline += titleLineHeight;
  }
  if (subtitle) {
    baseline += selected ? 1 : 0;
    context.fillStyle = selected ? "rgba(199, 205, 214, 0.72)" : "rgba(199, 205, 214, 0.62)";
    context.font = `600 ${cityFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    context.letterSpacing = selected ? "0.03em" : "0.02em";
    context.fillText(String(subtitle), textX, baseline);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false
  });
  const sprite = new THREE.Sprite(material);
  const baseScaleY = selected ? 0.145 : 0.085;
  const baseScaleX = baseScaleY * (width / height);
  sprite.scale.set(baseScaleX, baseScaleY, 1);
  sprite.center.set(0.5, selected ? style.selectedVenueLabelScreenLift : style.hoverVenueLabelScreenLift);
  sprite.visible = false;

  if (logoUrl) {
    loadImage(logoUrl, (image) => {
      if (!image) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.scale(1, 1);
      // Redraw with the loaded logo by painting into the existing canvas dimensions.
      drawVenueCardWithImage(context, {
        canvas,
        pixelRatio,
        title,
        subtitle,
        titleLines,
        image,
        selected,
        width,
        height,
        cardX,
        cardY,
        cardWidth,
        cardHeight,
        radius,
        paddingX,
        paddingY,
        gap,
        logoSize,
        logoRadius,
        titleFontSize,
        cityFontSize,
        titleLineHeight,
        glowPadding
      });
      texture.needsUpdate = true;
    });
  }

  return { sprite, texture, material, baseScaleX, baseScaleY };
}

function drawVenueCardWithImage(context, options) {
  const {
    canvas,
    pixelRatio,
    title,
    subtitle,
    titleLines,
    image,
    selected,
    width,
    height,
    cardX,
    cardY,
    cardWidth,
    cardHeight,
    radius,
    paddingX,
    paddingY,
    gap,
    logoSize,
    logoRadius,
    titleFontSize,
    cityFontSize,
    titleLineHeight,
    glowPadding
  } = options;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (selected) {
    context.save();
    context.shadowColor = "rgba(197, 29, 52, 0.18)";
    context.shadowBlur = 16;
    drawRoundedRect(context, cardX, cardY, cardWidth, cardHeight, radius);
    context.fillStyle = "rgba(255, 77, 94, 0.09)";
    context.fill();
    context.restore();
  }
  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.55)";
  context.shadowBlur = selected ? 20 : 10;
  context.shadowOffsetY = selected ? 9 : 5;
  drawRoundedRect(context, cardX, cardY, cardWidth, cardHeight, radius);
  context.fillStyle = selected ? "rgba(7, 8, 11, 0.93)" : "rgba(8, 10, 14, 0.88)";
  context.fill();
  context.restore();
  drawRoundedRect(context, cardX + 0.5, cardY + 0.5, cardWidth - 1, cardHeight - 1, radius);
  context.lineWidth = 1;
  context.strokeStyle = selected ? "rgba(255, 77, 94, 0.46)" : "rgba(170, 83, 94, 0.26)";
  context.stroke();

  const logoX = cardX + paddingX;
  const logoY = cardY + (cardHeight - logoSize) / 2;
  drawLogoContainer(context, logoX, logoY, logoSize, logoRadius, selected);
  context.save();
  drawRoundedRect(context, logoX, logoY, logoSize, logoSize, logoRadius);
  context.clip();
  drawImageCover(context, image, logoX, logoY, logoSize, logoSize);
  context.restore();

  const textX = logoX + logoSize + gap;
  let baseline = cardY + paddingY + titleFontSize;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = "#ffffff";
  context.font = `700 ${titleFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  for (const line of titleLines) {
    context.fillText(line, textX, baseline);
    baseline += titleLineHeight;
  }
  if (subtitle) {
    baseline += selected ? 1 : 0;
    context.fillStyle = selected ? "rgba(199, 205, 214, 0.72)" : "rgba(199, 205, 214, 0.62)";
    context.font = `600 ${cityFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    context.fillText(String(subtitle), textX, baseline);
  }
}

function drawLogoContainer(context, x, y, size, radius, selected) {
  drawRoundedRect(context, x, y, size, size, radius);
  context.fillStyle = selected ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.06)";
  context.fill();
  context.lineWidth = 1;
  context.strokeStyle = selected ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.1)";
  context.stroke();
  context.save();
  context.fillStyle = "rgba(245, 245, 245, 0.78)";
  context.font = `700 ${Math.round(size * 0.46)}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("S", x + size / 2, y + size / 2 + 0.5);
  context.restore();
}

function drawImageCover(context, image, x, y, width, height) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;
  if (imageRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function loadImage(url, callback) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => callback(image);
  image.onerror = () => callback(null);
  image.src = url;
}

function fitText(context, text, maxWidth) {
  if (context.measureText(text).width <= maxWidth) return text;
  let fitted = text;
  while (fitted.length > 1 && context.measureText(`${fitted}...`).width > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted.trim()}...`;
}

function wrapText(context, text, maxWidth) {
  if (!Number.isFinite(maxWidth) || context.measureText(text).width <= maxWidth) return [text];
  const words = text.trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

function drawRoundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}
