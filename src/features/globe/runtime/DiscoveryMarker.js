import * as THREE from "three";
import { createMarkerStyle, GlobeMarker } from "./GlobeMarker.js";

const DISCOVERY_BASE_COLOR = "#F8FAFC";
const DISCOVERY_ACTIVE_COLOR = "#FFFFFF";
const HEX_TEXTURE_SIZE = 128;
const HEX_RADIUS = 44;
const HEX_PULSE_COUNT = 2;
const HEX_PULSE_SPEED = 0.58;
const HEX_PULSE_END_SCALE = 2.3;

export class DiscoveryMarker {
  constructor({ region, position, radialDirection, config, referenceDistance, globeRadius }) {
    this.region = region;
    this.isSingleListing = (region.listingIds || []).length === 1;
    this.elapsed = hashPhase(region.id);

    this.marker = new GlobeMarker({
      id: region.id,
      labelTitle: this.isSingleListing ? (region.singleListingName || region.name) : region.name,
      labelSubtitle: this.isSingleListing ? region.name : formatCount(region),
      labelLogoUrl: this.isSingleListing ? (region.singleListingLogoUrl || "") : "",
      position,
      radialDirection,
      config,
      referenceDistance,
      markerType: "region",
      variant: "clusterRegion",
      styleOverrides: createMarkerStyle(config, {
        stemEmissive: DISCOVERY_BASE_COLOR,
        stemSelectedColor: DISCOVERY_ACTIVE_COLOR,
        tipColor: DISCOVERY_BASE_COLOR,
        tipHoverColor: DISCOVERY_ACTIVE_COLOR,
        tipSelectedColor: DISCOVERY_ACTIVE_COLOR,
        glowColor: DISCOVERY_ACTIVE_COLOR,
        rippleColor: DISCOVERY_ACTIVE_COLOR,
        baseStemHeight: globeRadius * 0.024,
        showLabel: true,
        showRipple: false,
        hoverOpacity: 1,
        hoverScale: 1.08,
        selectedScale: 1.12,
        hoverLengthScale: 1,
        selectedLengthScale: 1,
        hoverLift: 0,
        selectedLift: 0,
        stemIdleOpacityFactor: 0,
        stemActiveOpacityFactor: 0,
        glowIdleOpacityFactor: 0,
        glowHoverOpacityFactor: 0,
        glowSelectedOpacityFactor: 0,
        hoverLabelOpacity: 0.96,
      }, globeRadius)
    });

    // Discovery markers are intentionally 2D beacons. Keep the existing
    // GlobeMarker only for its shared label behavior and geographic anchoring.
    this.marker.stem.visible = false;
    this.marker.tip.visible = false;
    this.marker.baseGlow.visible = false;
    this.marker.hitTarget.visible = false;

    const baseScale = this.marker.style.tipRadius * 4.9;
    const surfaceY = this.marker.style.surfaceOffset + this.marker.style.tipRadius * 0.34;
    this.beacon = createHexSprite({
      color: DISCOVERY_BASE_COLOR,
      centerDot: true,
      opacity: 0.98,
      lineWidth: 8,
      glowBlur: 15,
    });
    this.beacon.position.y = surfaceY;
    this.beacon.scale.set(baseScale, baseScale, 1);
    this.beacon.userData.baseScale = baseScale;
    this.beacon.userData.regionId = region.id;
    this.beacon.renderOrder = 14;

    this.pulses = Array.from({ length: HEX_PULSE_COUNT }, (_, index) => {
      const sprite = createHexSprite({
        color: DISCOVERY_ACTIVE_COLOR,
        centerDot: false,
        opacity: 0,
        lineWidth: 6,
        glowBlur: 10,
      });
      sprite.position.y = surfaceY - 0.0005;
      sprite.scale.set(baseScale, baseScale, 1);
      sprite.userData.phaseOffset = index / HEX_PULSE_COUNT;
      sprite.renderOrder = 13;
      return sprite;
    });

    this.marker.group.add(...this.pulses, this.beacon);

    // Compatibility aliases used by ActivityRegionManager. The visible hexagon
    // itself is the interactive surface instead of a tall invisible stem.
    this.group = this.marker.group;
    this.hitTarget = this.beacon;
    this.label = this.marker.label;
  }

  update(state) {
    this.marker.update({ ...state, attention: false });
    this.marker.stem.visible = false;
    this.marker.tip.visible = false;
    this.marker.baseGlow.visible = false;
    this.marker.hitTarget.visible = false;

    const delta = Number.isFinite(state?.delta) ? state.delta : 0;
    this.elapsed += delta;
    const hovered = Boolean(state?.hovered);
    const selected = Boolean(state?.selected);
    const attention = Boolean(state?.attention);
    const presentationOpacity = Number.isFinite(state?.presentationOpacity) ? state.presentationOpacity : 1;
    const baseScale = this.beacon.userData.baseScale ?? this.marker.style.tipRadius * 4.9;
    const activeScale = selected ? 1.18 : hovered ? 1.12 : attention ? 1.04 : 1;

    this.beacon.scale.set(baseScale * activeScale, baseScale * activeScale, 1);
    this.beacon.material.opacity = presentationOpacity * (selected || hovered ? 1 : 0.92);

    const pulseStrength = selected || hovered ? 0.42 : attention ? 0.34 : 0.12;
    const activePulseCount = selected || hovered || attention ? HEX_PULSE_COUNT : 1;
    this.pulses.forEach((pulse, index) => {
      if (index >= activePulseCount || presentationOpacity <= 0.01) {
        pulse.visible = false;
        pulse.material.opacity = 0;
        return;
      }
      const phase = (this.elapsed * HEX_PULSE_SPEED + pulse.userData.phaseOffset) % 1;
      const eased = smootherstep(phase);
      const scale = baseScale * THREE.MathUtils.lerp(1.05, HEX_PULSE_END_SCALE, eased);
      pulse.scale.set(scale, scale, 1);
      pulse.material.opacity = presentationOpacity * pulseStrength * Math.pow(1 - phase, 1.65);
      pulse.visible = pulse.material.opacity > 0.006;
    });
  }

  getWorldPosition(target) {
    return this.marker.getWorldPosition(target);
  }

  getMeshCount() {
    return this.marker.getMeshCount();
  }

  dispose() {
    this.marker.dispose();
  }
}

function createHexSprite({ color, centerDot, opacity, lineWidth, glowBlur }) {
  const canvas = document.createElement("canvas");
  canvas.width = HEX_TEXTURE_SIZE;
  canvas.height = HEX_TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  const center = HEX_TEXTURE_SIZE / 2;

  context.clearRect(0, 0, HEX_TEXTURE_SIZE, HEX_TEXTURE_SIZE);
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = lineWidth;
  context.lineJoin = "round";
  context.shadowColor = color;
  context.shadowBlur = glowBlur;
  context.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI / 3;
    const x = center + Math.cos(angle) * HEX_RADIUS;
    const y = center + Math.sin(angle) * HEX_RADIUS;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.stroke();
  if (centerDot) {
    context.shadowBlur = Math.max(4, glowBlur * 0.6);
    context.beginPath();
    context.arc(center, center, 4.5, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    opacity,
    depthTest: true,
    depthWrite: false,
  }));
}

function smootherstep(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function hashPhase(value) {
  const text = String(value ?? "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  return (hash % 1000) / 1000;
}

function formatCount(region) {
  const parts = [];
  if (region.clubCount) parts.push(`${region.clubCount} club${region.clubCount === 1 ? "" : "s"}`);
  if (region.eventCount) parts.push(`${region.eventCount} event${region.eventCount === 1 ? "" : "s"}`);
  const listingCount = Array.isArray(region?.listingIds) ? region.listingIds.length : 0;
  return parts.join(" / ") || `${listingCount} listing${listingCount === 1 ? "" : "s"}`;
}
