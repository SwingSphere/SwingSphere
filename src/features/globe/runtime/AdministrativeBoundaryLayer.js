import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { loadJsonAsset } from "./jsonAssetCache.js";
import { wgs84ToRenderedGlobeLocal } from "./math/geoProjection.js";
import { resolveRenderedGlobeLandSurfaceAnchor } from "./math/surfaceAnchoring.js";

const DEFAULT_CLEARANCE = 0.0055;
const DEFAULT_RADIUS_SCALE = 1.003;

export class AdministrativeBoundaryLayer {
  constructor({ renderer, config }) {
    this.renderer = renderer;
    this.config = config;
    this.options = config.administrativeBoundaries ?? {};
    this.enabled = this.options.enabled !== false;
    this.activeIds = new Set(this.options.initialActiveIds ?? []);
    this.items = new Map();
    this.group = new THREE.Group();
    this.group.name = "swingsphere-administrative-boundaries";
    this.group.renderOrder = 32;
    this.group.visible = this.enabled;
    this.renderer.globe.add(this.group);

    this.renderResolution = new THREE.Vector2();
    this.appliedResolution = new THREE.Vector2(-1, -1);
    this.raycaster = new THREE.Raycaster();
    this.rayOrigin = new THREE.Vector3();
    this.rayDirection = new THREE.Vector3();
    this.surfaceCandidate = new THREE.Vector3();
    this.disposed = false;
  }

  async mount() {
    if (!this.enabled || this.disposed) return;
    const specs = Array.isArray(this.options.features) ? this.options.features : [];
    for (const spec of specs) {
      if (!spec?.id || !spec?.url || this.disposed) continue;
      const data = await loadJsonAsset(spec.url);
      if (this.disposed) return;
      const item = this.#buildItem(spec, data);
      if (item) this.items.set(String(spec.id), item);
    }
  }

  setActiveIds(ids = []) {
    this.activeIds = new Set((Array.isArray(ids) ? ids : []).map(String));
  }

  setVisible(visible) {
    this.enabled = Boolean(visible);
    this.group.visible = this.enabled;
  }

  update() {
    if (!this.enabled || this.disposed) return;
    this.group.rotation.y = this.renderer.visibleLandMesh?.rotation.y ?? 0;
    this.renderer.renderer.getSize(this.renderResolution);
    if (!this.renderResolution.equals(this.appliedResolution)) {
      this.appliedResolution.copy(this.renderResolution);
      for (const item of this.items.values()) {
        for (const line of item.lines) {
          line.coreMaterial.resolution.copy(this.renderResolution);
          line.glowMaterial.resolution.copy(this.renderResolution);
        }
      }
    }

    const cameraDistance = this.renderer.camera.position.distanceTo(this.renderer.controls.target);
    for (const [id, item] of this.items) {
      const active = this.activeIds.has(id);
      const opacityFactor = active ? distanceOpacity(cameraDistance, item.spec) : 0;
      item.group.visible = opacityFactor > 0.002;
      if (!item.group.visible) continue;
      for (const line of item.lines) {
        line.coreMaterial.opacity = item.coreOpacity * opacityFactor;
        line.glowMaterial.opacity = item.glowOpacity * opacityFactor;
      }
    }
  }

  getDiagnostics() {
    return {
      enabled: this.enabled,
      loadedBoundaryCount: this.items.size,
      activeBoundaryIds: [...this.activeIds],
      drawCallCount: [...this.items.values()].reduce(
        (count, item) => count + (item.group.visible ? item.lines.length * 2 : 0),
        0
      )
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const item of this.items.values()) {
      for (const line of item.lines) {
        line.geometry.dispose();
        line.coreMaterial.dispose();
        line.glowMaterial.dispose();
      }
      item.group.clear();
      this.group.remove(item.group);
    }
    this.items.clear();
    this.renderer.globe.remove(this.group);
    this.group.clear();
  }

  #buildItem(spec, data) {
    const rings = extractBoundaryRings(data, spec);
    if (!rings.length) return null;
    const group = new THREE.Group();
    group.name = `administrative-boundary:${spec.id}`;
    group.visible = false;
    this.group.add(group);

    const lines = [];
    for (const ring of rings) {
      const positions = this.#buildPositions(ring, spec);
      if (positions.length < 6) continue;
      const geometry = new LineGeometry();
      geometry.setPositions(positions);
      const coreMaterial = createLineMaterial({
        color: spec.color ?? "#e7ebf0",
        width: Number(spec.coreWidth ?? 1.8),
        opacity: 0,
        blending: THREE.NormalBlending,
      });
      const glowMaterial = createLineMaterial({
        color: spec.glowColor ?? "#ff465c",
        width: Number(spec.glowWidth ?? 5.5),
        opacity: 0,
        blending: THREE.AdditiveBlending,
      });
      const glow = new Line2(geometry, glowMaterial);
      const core = new Line2(geometry, coreMaterial);
      glow.renderOrder = 31;
      core.renderOrder = 32;
      group.add(glow, core);
      lines.push({ geometry, glow, core, glowMaterial, coreMaterial });
    }

    if (!lines.length) {
      this.group.remove(group);
      return null;
    }

    return {
      spec,
      group,
      lines,
      coreOpacity: THREE.MathUtils.clamp(Number(spec.opacity ?? 0.68), 0, 1),
      glowOpacity: THREE.MathUtils.clamp(Number(spec.glowOpacity ?? 0.12), 0, 1),
    };
  }

  #buildPositions(ring, spec) {
    const maxSegmentDegrees = Math.max(0.0025, Number(spec.maxSegmentDegrees ?? 0.08));
    const points = densifyRing(ring, maxSegmentDegrees);
    const samples = points.map(([lng, lat]) => this.#resolveSurfaceSample(lng, lat, spec));
    const radii = resolveSmoothedTerrainRadii(samples, this.renderer.globeRadius, spec);
    const clearance = Math.max(0.001, Number(spec.clearance ?? DEFAULT_CLEARANCE));
    const positions = [];
    for (let index = 0; index < samples.length; index += 1) {
      const position = samples[index].direction.clone().multiplyScalar(radii[index] + clearance);
      positions.push(position.x, position.y, position.z);
    }
    return positions;
  }

  #resolveSurfaceSample(lng, lat, spec) {
    const globeRadius = this.renderer.globeRadius;
    const direction = wgs84ToRenderedGlobeLocal(lng, lat, globeRadius, this.config).normalize();
    const landHitMesh = this.renderer.landHitMesh;
    if (landHitMesh && spec.conformToTerrain !== false) {
      const anchor = resolveRenderedGlobeLandSurfaceAnchor({
        lng,
        lat,
        config: this.config,
        globeRadius,
        landHitMesh,
        raycaster: this.raycaster,
        origin: this.rayOrigin,
        direction: this.rayDirection,
        candidate: this.surfaceCandidate,
      });
      if (anchor.hit) {
        const projectedRadius = anchor.anchorPosition.dot(direction);
        if (Number.isFinite(projectedRadius) && projectedRadius > 0) {
          return { direction, radius: projectedRadius };
        }
      }
    }
    return { direction, radius: null };
  }
}

function createLineMaterial({ color, width, opacity, blending }) {
  return new LineMaterial({
    color,
    linewidth: width,
    transparent: true,
    opacity,
    worldUnits: false,
    alphaToCoverage: true,
    depthTest: true,
    depthWrite: false,
    blending,
  });
}

function extractBoundaryRings(data, spec = {}) {
  const rings = [];
  for (const feature of data?.features ?? []) {
    const geometry = feature?.geometry;
    if (!geometry) continue;
    const polygons = geometry.type === "Polygon"
      ? [geometry.coordinates ?? []]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates ?? []
        : [];
    if (!polygons.length) continue;
    const selectedPolygons = spec.largestPolygonOnly
      ? [polygons.reduce((largest, polygon) => polygonAreaMagnitude(polygon?.[0]) > polygonAreaMagnitude(largest?.[0]) ? polygon : largest, polygons[0])]
      : polygons;
    for (const polygon of selectedPolygons) {
      const outerRing = polygon?.[0];
      if (outerRing?.length >= 2) rings.push(outerRing);
      if (spec.includeInteriorRings) {
        for (const ring of polygon.slice(1)) if (ring?.length >= 2) rings.push(ring);
      }
    }
  }
  return rings;
}

function polygonAreaMagnitude(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    if (!isCoordinate(current) || !isCoordinate(next)) continue;
    area += Number(current[0]) * Number(next[1]) - Number(next[0]) * Number(current[1]);
  }
  return Math.abs(area) * 0.5;
}

function resolveSmoothedTerrainRadii(samples, globeRadius, spec = {}) {
  if (!samples.length) return [];
  const validRadii = samples
    .map((sample) => sample.radius)
    .filter((radius) => Number.isFinite(radius) && radius > 0)
    .sort((a, b) => a - b);
  const fallbackRadius = validRadii.length
    ? validRadii[Math.floor(validRadii.length / 2)]
    : globeRadius * Number(spec.radiusScale ?? DEFAULT_RADIUS_SCALE);
  const maxDeviation = Math.max(
    globeRadius * 0.002,
    Number(spec.maxTerrainRadiusDeviation ?? globeRadius * 0.012),
  );
  const minRadius = fallbackRadius - maxDeviation;
  const maxRadius = fallbackRadius + maxDeviation;
  const previousValid = new Array(samples.length).fill(null);
  const nextValid = new Array(samples.length).fill(null);
  let previous = null;
  for (let index = 0; index < samples.length; index += 1) {
    if (Number.isFinite(samples[index].radius)) previous = samples[index].radius;
    previousValid[index] = previous;
  }
  let next = null;
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(samples[index].radius)) next = samples[index].radius;
    nextValid[index] = next;
  }
  const resolved = samples.map((sample, index) => {
    let radius = sample.radius;
    if (!Number.isFinite(radius)) {
      const before = previousValid[index];
      const after = nextValid[index];
      radius = Number.isFinite(before) && Number.isFinite(after)
        ? (before + after) * 0.5
        : Number.isFinite(before)
          ? before
          : Number.isFinite(after)
            ? after
            : fallbackRadius;
    }
    return THREE.MathUtils.clamp(radius, minRadius, maxRadius);
  });
  const smoothingWindow = Math.max(0, Math.floor(Number(spec.terrainSmoothingWindow ?? 2)));
  if (!smoothingWindow) return resolved;
  return resolved.map((_, index) => {
    let sum = 0;
    let count = 0;
    for (let offset = -smoothingWindow; offset <= smoothingWindow; offset += 1) {
      let sampleIndex = index + offset;
      if (sampleIndex < 0) sampleIndex += resolved.length;
      if (sampleIndex >= resolved.length) sampleIndex -= resolved.length;
      sum += resolved[sampleIndex];
      count += 1;
    }
    return sum / Math.max(1, count);
  });
}

function densifyRing(ring, maxSegmentDegrees) {
  if (!Array.isArray(ring) || ring.length < 2) return [];
  const result = [];
  for (let index = 0; index < ring.length - 1; index += 1) {
    const start = ring[index];
    const end = ring[index + 1];
    if (!isCoordinate(start) || !isCoordinate(end)) continue;
    if (!result.length) result.push([Number(start[0]), Number(start[1])]);
    let deltaLng = Number(end[0]) - Number(start[0]);
    if (deltaLng > 180) deltaLng -= 360;
    if (deltaLng < -180) deltaLng += 360;
    const deltaLat = Number(end[1]) - Number(start[1]);
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(deltaLng), Math.abs(deltaLat)) / maxSegmentDegrees));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      let lng = Number(start[0]) + deltaLng * t;
      if (lng > 180) lng -= 360;
      if (lng < -180) lng += 360;
      result.push([lng, Number(start[1]) + deltaLat * t]);
    }
  }
  return result;
}

function isCoordinate(value) {
  return Array.isArray(value) && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]));
}

function distanceOpacity(cameraDistance, spec) {
  const revealDistance = Number(spec.revealDistance ?? 5.6);
  const fullOpacityDistance = Math.min(revealDistance - 0.01, Number(spec.fullOpacityDistance ?? revealDistance - 0.7));
  const raw = THREE.MathUtils.clamp(
    (revealDistance - cameraDistance) / Math.max(0.01, revealDistance - fullOpacityDistance),
    0,
    1
  );
  return raw * raw * (3 - 2 * raw);
}
